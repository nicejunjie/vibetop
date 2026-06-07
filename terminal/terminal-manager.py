#!/usr/bin/env python3
"""Terminal manager & system status API.

Listens on 127.0.0.1:7680, proxied by nginx at /api/.
Runs as root so it can manage systemd units.

Endpoints:
  POST /api/terminals/{n}/start   — start session + ttyd for instance N
  POST /api/terminals/{n}/stop    — stop ttyd + session for instance N
  GET  /api/terminals/status      — {"running": [1, 3, 5, ...]}
  GET  /api/system/status         — CPU, memory, uptime, terminal count
"""

import http.server
import json
import os
import re
import socket
import subprocess
import sys

MAX_INSTANCE = 50


def _app_user():
    """The non-root user that owns this install.

    The manager runs as root, so it can't rely on ~ or $HOME. Resolve the
    target user from $APP_USER, else from the owner of this script file.
    """
    env = os.environ.get("APP_USER") or os.environ.get("BROWSER_USER")
    if env:
        return env
    import pwd
    return pwd.getpwuid(os.stat(__file__).st_uid).pw_name


APP_USER = _app_user()
NOTES_FILE = os.path.expanduser(f"~{APP_USER}/.local/share/desktop-notes.md")
# Host-local service definitions (gitignored). Each entry may carry a "key" and a
# "health" URL; those are added to /api/health so the Home Service page can show
# live dots without baking personal hostnames into the repo.
SERVICES_FILE = os.path.expanduser(f"~{APP_USER}/claude-web-www/services.json")

# Per-process CPU snapshot for delta-based calculation
_prev_proc_snap = {}  # pid -> (utime+stime, timestamp)
_prev_proc_time = 0.0

# RAPL energy snapshot for CPU power calculation
_prev_rapl_uj = 0
_prev_rapl_time = 0.0

# Disk I/O snapshot for rate calculation
_prev_disk_sectors = (0, 0)
_prev_disk_time = 0.0


class Handler(http.server.BaseHTTPRequestHandler):
    def _get_running_terminals(self):
        out = subprocess.run(
            ["systemctl", "list-units", "claude-web-ttyd@*",
             "--no-pager", "--plain", "--no-legend"],
            capture_output=True, text=True,
        )
        running = []
        for line in out.stdout.strip().split("\n"):
            m = re.search(r"claude-web-ttyd@(\d+)", line)
            if m and "running" in line:
                running.append(int(m.group(1)))
        return sorted(running)

    def _get_system_status(self):
        # CPU: read /proc/stat twice with a tiny interval (aggregate + per-core)
        def read_proc_stat():
            cores = {}
            with open("/proc/stat") as f:
                for line in f:
                    if line.startswith("cpu"):
                        parts = line.split()
                        name = parts[0]
                        vals = list(map(int, parts[1:]))
                        cores[name] = vals
            return cores
        import time
        snap1 = read_proc_stat()
        time.sleep(0.1)
        snap2 = read_proc_stat()
        def calc_pct(a, b):
            idle_d = b[3] - a[3]
            total_d = sum(b) - sum(a)
            return round(100.0 * (1.0 - idle_d / max(1, total_d)), 1)
        cpu = calc_pct(snap1["cpu"], snap2["cpu"])
        cpu_cores = []
        i = 0
        while f"cpu{i}" in snap1:
            cpu_cores.append(calc_pct(snap1[f"cpu{i}"], snap2[f"cpu{i}"]))
            i += 1

        # Memory
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if parts[0] in ("MemTotal:", "MemAvailable:"):
                    mem[parts[0]] = int(parts[1])
        total_gb = mem.get("MemTotal:", 0) / 1048576
        avail_gb = mem.get("MemAvailable:", 0) / 1048576
        used_gb = total_gb - avail_gb

        # Uptime
        with open("/proc/uptime") as f:
            secs = int(float(f.read().split()[0]))
        days, rem = divmod(secs, 86400)
        hours = rem // 3600
        uptime = f"{days}d {hours}h" if days else f"{hours}h {rem % 3600 // 60}m"

        # GPU (AMD via sysfs — find discrete card by largest VRAM)
        gpu_percent = None
        gpu_vram_used_gb = None
        gpu_vram_total_gb = None
        try:
            best_card = None
            best_vram = 0
            for entry in os.listdir("/sys/class/drm"):
                if not re.match(r"card\d+$", entry):
                    continue
                dev = f"/sys/class/drm/{entry}/device"
                vram_path = f"{dev}/mem_info_vram_total"
                if not os.path.exists(vram_path):
                    continue
                try:
                    with open(vram_path) as f:
                        vram = int(f.read().strip())
                    if vram > best_vram:
                        best_vram = vram
                        best_card = dev
                except Exception:
                    continue
            if best_card:
                gpu_vram_total_gb = round(best_vram / (1024**3), 1)
                try:
                    with open(f"{best_card}/mem_info_vram_used") as f:
                        gpu_vram_used_gb = round(int(f.read().strip()) / (1024**3), 1)
                except Exception:
                    pass
                try:
                    with open(f"{best_card}/gpu_busy_percent") as f:
                        gpu_percent = int(f.read().strip())
                except Exception:
                    pass
        except Exception:
            pass

        # CPU temperature (k10temp Tctl)
        cpu_temp = None
        try:
            for hwmon in os.listdir("/sys/class/hwmon"):
                p = f"/sys/class/hwmon/{hwmon}"
                with open(f"{p}/name") as f:
                    if f.read().strip() == "k10temp":
                        with open(f"{p}/temp1_input") as f2:
                            cpu_temp = round(int(f2.read().strip()) / 1000)
                        break
        except Exception:
            pass

        # GPU temperature and power (amdgpu — discrete card only, skip integrated)
        gpu_temp = None
        gpu_power_w = None
        try:
            for hwmon in sorted(os.listdir("/sys/class/hwmon")):
                p = f"/sys/class/hwmon/{hwmon}"
                with open(f"{p}/name") as f:
                    if f.read().strip() != "amdgpu":
                        continue
                label_path = f"{p}/temp1_label"
                if os.path.exists(label_path):
                    with open(label_path) as f:
                        if f.read().strip() == "edge":
                            with open(f"{p}/temp1_input") as f2:
                                gpu_temp = round(int(f2.read().strip()) / 1000)
                            for pwr in ("power1_average", "power1_input"):
                                pwr_path = f"{p}/{pwr}"
                                if os.path.exists(pwr_path):
                                    with open(pwr_path) as f2:
                                        gpu_power_w = round(int(f2.read().strip()) / 1000000)
                                    break
                            break
        except Exception:
            pass

        # CPU package power (RAPL — delta between calls)
        cpu_power_w = None
        try:
            global _prev_rapl_uj, _prev_rapl_time
            import time as _time2
            with open("/sys/class/powercap/intel-rapl:0/energy_uj") as f:
                uj = int(f.read().strip())
            now = _time2.monotonic()
            if _prev_rapl_time > 0:
                dt = now - _prev_rapl_time
                if dt > 0:
                    duj = uj - _prev_rapl_uj
                    if duj < 0:
                        with open("/sys/class/powercap/intel-rapl:0/max_energy_range_uj") as f:
                            duj += int(f.read().strip())
                    cpu_power_w = round(duj / (dt * 1000000))
            _prev_rapl_uj = uj
            _prev_rapl_time = now
        except Exception:
            pass

        # Network: read bytes from /proc/net/dev for physical interfaces
        net = {}
        try:
            with open("/proc/net/dev") as f:
                for line in f:
                    parts = line.split()
                    if not parts or not parts[0].endswith(":"):
                        continue
                    iface = parts[0].rstrip(":")
                    if iface.startswith(("enp", "eth", "wl")):
                        net[iface] = {"rx_bytes": int(parts[1]), "tx_bytes": int(parts[9])}
        except Exception:
            pass

        # Disk usage and I/O
        disk_used_gb = None
        disk_total_gb = None
        disk_read_bytes = None
        disk_write_bytes = None
        try:
            st = os.statvfs("/")
            disk_total_gb = round(st.f_frsize * st.f_blocks / (1024**3), 1)
            disk_used_gb = round(st.f_frsize * (st.f_blocks - st.f_bfree) / (1024**3), 1)
        except Exception:
            pass
        try:
            global _prev_disk_sectors, _prev_disk_time
            import time as _time3
            with open("/proc/diskstats") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 14 and parts[2] == "nvme1n1":
                        rd_sectors = int(parts[5])
                        wr_sectors = int(parts[9])
                        now = _time3.monotonic()
                        if _prev_disk_time > 0:
                            dt = now - _prev_disk_time
                            if dt > 0:
                                disk_read_bytes = int((rd_sectors - _prev_disk_sectors[0]) * 512 / dt)
                                disk_write_bytes = int((wr_sectors - _prev_disk_sectors[1]) * 512 / dt)
                        _prev_disk_sectors = (rd_sectors, wr_sectors)
                        _prev_disk_time = now
                        break
        except Exception:
            pass

        # Top processes by CPU (delta-based like htop)
        global _prev_proc_snap, _prev_proc_time
        processes = []
        try:
            import pwd
            import time as _time
            page_size = os.sysconf("SC_PAGE_SIZE")
            clk_tck = os.sysconf("SC_CLK_TCK")
            now = _time.monotonic()
            dt = now - _prev_proc_time if _prev_proc_time else 0
            cur_snap = {}
            for pid_s in os.listdir("/proc"):
                if not pid_s.isdigit():
                    continue
                try:
                    with open(f"/proc/{pid_s}/stat") as f:
                        stat = f.read()
                    comm_start = stat.index("(")
                    comm_end = stat.rindex(")")
                    short_name = stat[comm_start+1:comm_end]
                    fields = stat[comm_end+2:].split()
                    utime = int(fields[11])
                    stime = int(fields[12])
                    rss = int(fields[21]) * page_size / (1024 * 1024)
                    ticks = utime + stime
                    pid = int(pid_s)
                    # Get descriptive name from cmdline
                    try:
                        with open(f"/proc/{pid_s}/cmdline") as f:
                            cmdline = f.read().split("\x00")
                        cmdline = [c for c in cmdline if c]
                        if len(cmdline) > 1 and cmdline[0].endswith(("python3", "python", "node")):
                            name = os.path.basename(cmdline[1])
                        elif cmdline:
                            name = os.path.basename(cmdline[0])
                        else:
                            name = short_name
                    except Exception:
                        name = short_name
                    cur_snap[pid] = ticks
                    cpu_pct = 0.0
                    if dt > 0 and pid in _prev_proc_snap:
                        delta_ticks = ticks - _prev_proc_snap[pid]
                        cpu_pct = (delta_ticks / clk_tck) / dt * 100
                    with open(f"/proc/{pid_s}/status") as f:
                        uid_line = [l for l in f if l.startswith("Uid:")]
                    uid = int(uid_line[0].split()[1]) if uid_line else 0
                    try:
                        user = pwd.getpwuid(uid).pw_name
                    except KeyError:
                        user = str(uid)
                    processes.append({
                        "pid": pid,
                        "name": name,
                        "cpu": round(cpu_pct, 1),
                        "mem_mb": round(rss, 1),
                        "user": user,
                    })
                except Exception:
                    continue
            _prev_proc_snap = cur_snap
            _prev_proc_time = now
            processes.sort(key=lambda p: p["cpu"], reverse=True)
            processes = processes[:30]
        except Exception:
            pass

        # IPs — show all interfaces with an assigned IP (skip lo, docker, veth)
        ips = {}
        try:
            import subprocess as _sp
            out = _sp.run(["ip", "-4", "-o", "addr", "show"], capture_output=True, text=True)
            for line in out.stdout.splitlines():
                parts = line.split()
                iface = parts[1]
                if iface == "lo" or iface.startswith(("br-", "veth", "docker")):
                    continue
                ip = parts[3].split("/")[0]
                if iface not in ips:
                    ips[iface] = ip
        except Exception:
            pass

        running = self._get_running_terminals()
        result = {
            "hostname": socket.gethostname(),
            "ips": ips,
            "cpu_percent": round(cpu, 1),
            "cpu_cores": cpu_cores,
            "memory_used_gb": round(used_gb, 1),
            "memory_total_gb": round(total_gb, 1),
            "uptime": uptime,
            "terminals_running": len(running),
            "network": net,
            "processes": processes,
        }
        if gpu_percent is not None:
            result["gpu_percent"] = gpu_percent
        if gpu_vram_used_gb is not None:
            result["gpu_vram_used_gb"] = gpu_vram_used_gb
        if gpu_vram_total_gb is not None:
            result["gpu_vram_total_gb"] = gpu_vram_total_gb
        if cpu_temp is not None:
            result["cpu_temp"] = cpu_temp
        if gpu_temp is not None:
            result["gpu_temp"] = gpu_temp
        if cpu_power_w is not None:
            result["cpu_power_w"] = cpu_power_w
        if gpu_power_w is not None:
            result["gpu_power_w"] = gpu_power_w
        if disk_total_gb is not None:
            result["disk_total_gb"] = disk_total_gb
            result["disk_used_gb"] = disk_used_gb
        if disk_read_bytes is not None:
            result["disk_read_bytes"] = disk_read_bytes
            result["disk_write_bytes"] = disk_write_bytes
        return result

    def do_POST(self):
        m = re.match(r"/api/terminals/(\d+)/(start|stop)$", self.path)
        if m:
            return self._handle_terminal(m)
        if self.path == "/api/browser/open":
            return self._handle_browser_open()
        if self.path == "/api/notes":
            return self._handle_notes_save()
        self.send_error(404)

    def _handle_notes_save(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 1048576:
            self._json(400, {"error": "too large (1MB max)"})
            return
        body = self.rfile.read(length) if length else b""
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        content = data.get("content", "")
        os.makedirs(os.path.dirname(NOTES_FILE), exist_ok=True)
        with open(NOTES_FILE, "w") as f:
            f.write(content)
        self._json(200, {"ok": True})

    def _handle_browser_open(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 4096:
            self._json(400, {"error": "payload too large"})
            return
        body = self.rfile.read(length) if length else b""
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        url = data.get("url", "")
        if not url or not url.startswith(("http://", "https://")):
            self._json(400, {"error": "invalid url"})
            return
        if any(c in url for c in ('"', "'", ";", "`", "$", "(", ")", "\n")):
            self._json(400, {"error": "invalid characters in url"})
            return
        user = os.environ.get("BROWSER_USER", APP_USER)
        uid = int(subprocess.check_output(["id", "-u", user]).strip())
        profile = f"/home/{user}/snap/chromium/common/xpra-profile"
        subprocess.Popen(
            ["su", "-", user, "-c",
             f'DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus'
             f' /snap/bin/chromium --user-data-dir={profile} "{url}"'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._json(200, {"ok": True, "url": url})

    def _handle_terminal(self, m):
        n, action = int(m.group(1)), m.group(2)
        if n < 1 or n > MAX_INSTANCE:
            self._json(400, {"error": f"instance must be 1-{MAX_INSTANCE}"})
            return
        units = [f"claude-web-session@{n}.service", f"claude-web-ttyd@{n}.service"]
        if action == "stop":
            units.reverse()
        try:
            subprocess.run(
                ["systemctl", action, "--no-block"] + units,
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError as e:
            self._json(500, {"error": e.stderr.strip()})
            return
        self._json(200, {"ok": True, "action": action, "instance": n})

    def do_GET(self):
        if self.path == "/api/terminals/status":
            self._json(200, {"running": self._get_running_terminals()})
            return
        if self.path == "/api/system/status":
            self._json(200, self._get_system_status())
            return
        if self.path == "/api/notes":
            try:
                with open(NOTES_FILE) as f:
                    content = f.read()
            except FileNotFoundError:
                content = ""
            self._json(200, {"content": content})
            return
        if self.path == "/api/health":
            self._json(200, self._check_health())
            return
        self.send_error(404)

    def _check_health(self):
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        checks = {
            "terminals": "http://127.0.0.1:7681/t1/",
            "browser": "http://127.0.0.1:14500/",
            "files": "http://127.0.0.1:8085/files/",
        }
        # Merge host-local services (each with a "key" and a "health" URL).
        try:
            with open(SERVICES_FILE) as f:
                for s in json.load(f):
                    key, url = s.get("key"), s.get("health") or s.get("url")
                    if key and url:
                        checks[key] = url
        except Exception:
            pass
        result = {}
        for name, url in checks.items():
            try:
                kw = {"timeout": 2}
                if url.startswith("https"):
                    kw["context"] = ctx
                urllib.request.urlopen(url, **kw)
                result[name] = True
            except urllib.error.HTTPError:
                result[name] = True
            except Exception:
                result[name] = False
        return result

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7680
    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    print(f"terminal-manager listening on 127.0.0.1:{port}")
    server.serve_forever()
