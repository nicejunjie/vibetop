"""Share a site's logins from the full Browser with Browser Lite.

The manager runs this file AS THE USER (never as root) for one top-level site.
It reads that user's Browser (Chromium) cookie database and prints only the
cookies Chromium itself would send to that host. Google and YouTube are never
shared: Google refuses sign-in through Browser Lite, and its account session
stays in the real Browser. A site that used "Sign in with Google" keeps its OWN
session cookie, which is what Browser Lite receives.
"""
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time

# Registrable domains whose cookies never leave the real Browser.
EXCLUDED_SITES = ("google.com", "youtube.com", "gmail.com", "googleusercontent.com",
                  "googleapis.com", "gstatic.com", "withgoogle.com")
# Anti-bot clearance tokens are earned by the browser that passed a site's bot
# check and are bound to it. Sharing them would let Browser Lite skip checks
# it cannot pass itself, so they stay in the real Browser.
_ANTI_BOT = re.compile(r"^(cf_clearance|__cf_bm|cf_chl_.*|datadome|_abck|bm_s[vz]|ak_bmsc|bm_mi|_px.*|pxcts|aws-waf-token|"
                       r"incap_ses_.*|visid_incap_.*|nlbi_.*|reese84|__ddg.*)$", re.IGNORECASE)
MAX_COOKIES = 150
MAX_BYTES = 96 * 1024
# Chromium's "basic" password store (--password-store=basic) uses this fixed
# key, so the database is no more protected than the file permissions.
_BASIC_PASSWORD = b"peanuts"
_CHROME_EPOCH_OFFSET_US = 11644473600 * 1000000
_SAMESITE = {0: "none", 1: "lax", 2: "strict"}


# Google's country sites: google.de, google.co.uk, google.com.hk, ...
_GOOGLE_COUNTRY = re.compile(r"(^|\.)google\.(com?\.)?[a-z]{2,3}$")


def excluded(host):
    host = host.lower().rstrip(".")
    return any(host == site or host.endswith("." + site) for site in EXCLUDED_SITES) or bool(_GOOGLE_COUNTRY.search(host))


def profile_dir(home):
    """Mirror terminal-manager's _chromium_for_user: snap profile when the snap
    is installed, else the distro-Chromium profile."""
    if os.access("/snap/bin/chromium", os.X_OK):
        return os.path.join(home, "snap", "chromium", "common", "xpra-profile")
    return os.path.join(home, ".config", "vibetop", "chromium-profile")


def domain_matches(host, host_key):
    if host_key.startswith("."):
        return host == host_key[1:] or host.endswith(host_key)
    return host == host_key


def _decryptor():
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    key = PBKDF2HMAC(hashes.SHA1(), 16, b"saltysalt", 1).derive(_BASIC_PASSWORD)

    def decrypt(host_key, value, plain, hash_prefixed):
        value = bytes(value)
        if not value:
            return plain
        if value[:3] != b"v10":
            return None  # v11 = keyring-protected; not ours to unlock
        decryptor = Cipher(algorithms.AES(key), modes.CBC(b" " * 16)).decryptor()
        data = decryptor.update(value[3:]) + decryptor.finalize()
        if not data or not 1 <= data[-1] <= 16:
            return None
        data = data[:-data[-1]]
        if hash_prefixed:
            if data[:32] != hashlib.sha256(host_key.encode()).digest():
                return None
            data = data[32:]
        try:
            return data.decode()
        except UnicodeDecodeError:
            return None
    return decrypt


def cookies_for(profile, host, now_us=None):
    host = host.lower().rstrip(".")
    if not host or excluded(host):
        return []
    source = os.path.join(profile, "Default", "Cookies")
    if not os.path.isfile(source):
        return []
    with tempfile.TemporaryDirectory() as scratch:
        # Chromium holds the database open; read a private copy (plus journal).
        copy = os.path.join(scratch, "Cookies")
        shutil.copyfile(source, copy)
        for suffix in ("-journal", "-wal"):
            if os.path.isfile(source + suffix):
                shutil.copyfile(source + suffix, copy + suffix)
        db = sqlite3.connect(f"file:{copy}?mode=ro", uri=True)
        try:
            version = int((db.execute("SELECT value FROM meta WHERE key='version'").fetchone() or ["0"])[0])
            rows = db.execute("SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure,"
                              " is_httponly, samesite, has_expires, last_update_utc, top_frame_site_key FROM cookies").fetchall()
        finally:
            db.close()
    decrypt = _decryptor()
    now_us = now_us if now_us is not None else int(time.time() * 1000000) + _CHROME_EPOCH_OFFSET_US
    result, size = [], 0
    for host_key, name, plain, encrypted, path, expires, secure, httponly, samesite, has_expires, updated, partition in rows:
        if partition or not domain_matches(host, host_key) or excluded(host_key.lstrip(".")) or _ANTI_BOT.match(name):
            continue
        if has_expires and expires and expires <= now_us:
            continue
        value = decrypt(host_key, encrypted, plain, version >= 24)
        if value is None or not name or len(name) + len(value) > 4096:
            continue
        cookie = {"name": name, "value": value, "domain": host_key.lstrip("."), "hostOnly": not host_key.startswith("."),
                  "path": path or "/", "secure": bool(secure), "httpOnly": bool(httponly),
                  "sameSite": _SAMESITE.get(samesite, "lax"),
                  "updated": max(0, (updated - _CHROME_EPOCH_OFFSET_US) // 1000)}
        if has_expires and expires:
            cookie["expires"] = (expires - _CHROME_EPOCH_OFFSET_US) // 1000
        size += len(name) + len(value) + len(host_key) + len(path or "/")
        if len(result) >= MAX_COOKIES or size > MAX_BYTES:
            break
        result.append(cookie)
    return result


if __name__ == "__main__":
    # argv: <profile-dir> <host>. Output: JSON list on stdout.
    json.dump(cookies_for(sys.argv[1], sys.argv[2]), sys.stdout, separators=(",", ":"))
