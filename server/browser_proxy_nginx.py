"""Generate the separate Browser Lite nginx authority and streaming locations."""
import re
import os
from urllib.parse import urlsplit

from browser_proxy_auth import trusted_host_conflicts


def main_host_map(main_origins, local_hosts=()):
    hosts = [urlsplit(origin).netloc for origin in main_origins] + list(local_hosts)
    hosts += ["host.docker.internal", urlsplit(os.environ.get("ONLYOFFICE_CALLBACK_HOST", "http://host.docker.internal")).hostname or "host.docker.internal"]
    if any(not re.fullmatch(r"[a-zA-Z0-9_-]+(?:[.][a-zA-Z0-9_-]+)*", name) for name in hosts):
        raise ValueError("Invalid Vibetop hostname")
    allowed = "\n".join("    " + name + " 1;" for name in sorted(set(hosts) - {"localhost"}))
    return f"""map $host $vt_browser_main_host_allowed {{
    default 0;
{allowed}
    localhost 1;
    ~^[a-zA-Z0-9_-]+\\.local$ 1;
    ~^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ 1;
    ~^\\[[0-9a-fA-F:]+\\]$ 1;
}}
"""


def render(domain, ui_origin, main_origins, *, listen="80", manager="127.0.0.1:7680", scheme="$vt_external_scheme", include_main_map=True):
    if not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", domain):
        raise ValueError("Invalid browser domain")
    def host(origin):
        parsed = urlsplit(origin)
        if parsed.scheme != "https" or parsed.port or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", parsed.netloc):
            raise ValueError("Invalid browser origin")
        return parsed.netloc
    ui_host = host(ui_origin)
    mains = [host(value) for value in main_origins]
    if not mains or ui_host in mains or any(trusted_host_conflicts(name, domain) for name in [ui_host, *mains]):
        raise ValueError("Invalid Browser Lite host configuration")
    if not re.fullmatch(r"(?:127\.0\.0\.1:)?[0-9]{1,5}", listen) or not re.fullmatch(r"127\.0\.0\.1:[0-9]{1,5}", manager) or scheme not in ("$vt_external_scheme", "https"):
        raise ValueError("Invalid internal browser listener")
    common = f"""        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto {scheme};
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Original-Method $request_method;
"""
    auth_fields = "\n".join(f"        auth_request_set $bl_{key} $upstream_http_x_vt_browser_{key};" for key in ("socket", "role", "uid", "profile", "epoch", "lease", "relay", "expires"))
    trusted_fields = "\n".join(f"        proxy_set_header X-VT-Browser-{key.title()} $bl_{key};" for key in ("role", "uid", "profile", "epoch", "lease", "relay", "expires"))
    listeners = f"    listen {listen};" + ("\n    listen [::]:80;" if listen == "80" else "")
    return (main_host_map(main_origins) if include_main_map else "") + f"""# BEGIN VIBETOP BROWSER LITE
# Browser Lite has its own auth boundary; never call the desktop allowlist.
limit_conn_zone $bl_host_uid zone=browser_lite_users:1m;
server {{
{listeners}
    server_name {ui_host};
    server_tokens off;
    client_max_body_size 8k;
    location / {{
        rewrite ^ /__browser_proxy/ui? break;
        proxy_pass http://{manager};
        proxy_http_version 1.1;
{common}        proxy_set_header Origin $http_origin;
        proxy_set_header Sec-Fetch-Site $http_sec_fetch_site;
        proxy_set_header Sec-Fetch-Mode $http_sec_fetch_mode;
        proxy_set_header Sec-Fetch-Dest $http_sec_fetch_dest;
        proxy_read_timeout 35s;
        proxy_buffering off;
    }}
}}
server {{
{listeners}
    server_name "~^bl-u(?<bl_host_uid>0|[1-9][0-9]{{0,9}})-[a-f0-9]{{32}}\\.{re.escape(domain)}$";
    server_tokens off;
    client_max_body_size 5G;
    # Sites' cookies come back as engine sync cookies, both in the auth reply's
    # X-VT-Browser-Cookie and in rewritten Set-Cookie headers. The default
    # 4k/8k header buffer turns a cookie-heavy site (NYTimes, CNN) into a 502.
    proxy_buffer_size 64k;
    proxy_buffers 4 64k;
    proxy_busy_buffers_size 128k;
    location = /__browser_auth {{
        internal;
        client_max_body_size 5G;
        proxy_pass http://{manager}/__browser_proxy/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
{common}        proxy_set_header Cookie $http_cookie;
        proxy_set_header Referer $http_referer;
        proxy_set_header Sec-Fetch-Mode $http_sec_fetch_mode;
        proxy_set_header Sec-Fetch-Dest $http_sec_fetch_dest;
    }}
    location / {{
        auth_request /__browser_auth;
{auth_fields}
        auth_request_set $bl_cookie $upstream_http_set_cookie;
        auth_request_set $bl_forward_cookie $upstream_http_x_vt_browser_cookie;
        add_header Set-Cookie $bl_cookie always;
        limit_conn browser_lite_users 128;
        proxy_pass http://unix:$bl_socket:$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header Cookie $bl_forward_cookie;
{trusted_fields}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Forwarded-Proto {scheme};
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_max_temp_file_size 0;
    }}
}}
# END VIBETOP BROWSER LITE
"""


def without_browser_site(source):
    """Remove only managed additions; leave all unrelated nginx bytes intact."""
    source = re.sub(r"(?m)^# BEGIN VIBETOP BROWSER LITE\n[\s\S]*?^# END VIBETOP BROWSER LITE\n?", "", source)
    source = re.sub(r"(?m)^map \$host \$vt_browser_main_host_allowed \{[^}]*\}\n?", "", source)
    return source.replace("    if ($vt_browser_main_host_allowed = 0) { return 421; }\n", "")


def update_browser_site(source, config, local_hosts=()):
    """Patch the actual installed site, preserving root/ports/TLS and other apps."""
    baseline = without_browser_site(source)
    anchor = "    server_name _;\n"
    if baseline.count(anchor) != 1:
        raise ValueError("Unrecognized Vibetop main site; refusing to change it")
    guard = "    if ($vt_browser_main_host_allowed = 0) { return 421; }\n"
    hosts = [*local_hosts, *config.get('localHosts', [])]
    candidate = main_host_map(config['mainOrigins'], hosts) + baseline.replace(anchor, anchor + guard, 1)
    if not candidate.endswith('\n'):
        raise ValueError("Vibetop site must end with a newline")
    if config.get('enabled', True):
        candidate += render(config['domain'], config['uiOrigin'], config['mainOrigins'], include_main_map=False)
    if without_browser_site(candidate) != baseline:
        raise ValueError("Browser Lite update changed unrelated nginx configuration")
    return candidate
