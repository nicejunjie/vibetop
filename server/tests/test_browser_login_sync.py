"""Browser -> Browser Lite login sharing: what leaves the full Browser's profile."""
import hashlib
import os
import sqlite3
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import browser_login_sync as sync  # noqa: E402

OFFSET = 11644473600 * 1000000
NOW = 1791936000 * 1000000 + OFFSET


def encrypt(host, value):
    key = PBKDF2HMAC(hashes.SHA1(), 16, b"saltysalt", 1).derive(b"peanuts")
    data = hashlib.sha256(host.encode()).digest() + value.encode()
    pad = 16 - len(data) % 16
    encryptor = Cipher(algorithms.AES(key), modes.CBC(b" " * 16)).encryptor()
    return b"v10" + encryptor.update(data + bytes([pad]) * pad) + encryptor.finalize()


def profile(tmp_path, rows):
    (tmp_path / "Default").mkdir()
    db = sqlite3.connect(tmp_path / "Default" / "Cookies")
    db.execute("CREATE TABLE meta(key, value)")
    db.execute("INSERT INTO meta VALUES ('version', '24')")
    db.execute("CREATE TABLE cookies(host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly,"
               " samesite, has_expires, last_update_utc, top_frame_site_key)")
    for host, name, value, *rest in rows:
        expires, partition = (rest + [NOW + 10 ** 12, ""])[:2]
        db.execute("INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                   (host, name, "", encrypt(host, value), "/", expires, 1, 1, 1, 1, NOW, partition))
    db.commit()
    db.close()
    return str(tmp_path)


def test_only_cookies_chromium_would_send_to_that_host(tmp_path):
    path = profile(tmp_path, [(".chatgpt.com", "session", "s3cret"), ("chatgpt.com", "host", "h"),
                              ("auth.chatgpt.com", "other", "x"), (".claude.ai", "sessionKey", "c"),
                              (".chatgpt.com", "old", "e", NOW - 1), (".chatgpt.com", "chips", "p", NOW + 10 ** 12, "https://x.com")])
    got = {c["name"]: c for c in sync.cookies_for(path, "chatgpt.com", now_us=NOW)}
    assert set(got) == {"session", "host"}
    assert got["session"]["value"] == "s3cret" and got["session"]["hostOnly"] is False
    assert got["host"]["hostOnly"] is True and got["session"]["httpOnly"] is True


def test_google_and_youtube_never_leave_the_browser(tmp_path):
    path = profile(tmp_path, [(".google.com", "SID", "g"), (".youtube.com", "LOGIN_INFO", "y"), (".google.co.uk", "NID", "n")])
    for host in ("accounts.google.com", "www.google.com", "www.youtube.com", "www.google.co.uk", "mail.google.com"):
        assert sync.excluded(host)
        assert sync.cookies_for(path, host, now_us=NOW) == []
    assert not sync.excluded("chatgpt.com") and not sync.excluded("googlesyndication.example")


def test_missing_profile_shares_nothing(tmp_path):
    assert sync.cookies_for(str(tmp_path / "absent"), "chatgpt.com") == []


def test_anti_bot_clearance_tokens_stay_in_the_browser(tmp_path):
    path = profile(tmp_path, [(".chatgpt.com", "session", "s"), (".chatgpt.com", "cf_clearance", "c"),
                              (".chatgpt.com", "__cf_bm", "b"), (".chatgpt.com", "datadome", "d")])
    assert [c["name"] for c in sync.cookies_for(path, "chatgpt.com", now_us=NOW)] == ["session"]
