"""System-status collection for the terminal manager.

Extracted from terminal-manager.py: the CPU/MEM/GPU/disk/network/process
readers behind `GET /api/system/status`. Pure data collection — no HTTP, no
manager state — so it can be exercised and reviewed on its own. The handler
calls `get_system_status(running_terminals, cached)`, injecting the list of
running terminals and the manager's generic `_cached` memoizer (which lives in
the main module because terminal start/stop invalidates its `running_terminals`
entry). Reads sysfs/procfs/debugfs; designed for AMD (sysfs + debugfs fallback)
with an nvidia-smi fallback. Best-effort throughout: any unreadable source is
omitted from the result rather than failing the whole poll.
"""
import os
import pwd
import re
import shutil
import socket
import subprocess
import threading
import time

# The collector keeps per-call delta snapshots (CPU/RAPL/disk/process) in module
# globals; the manager is a ThreadingHTTPServer, so concurrent polls (taskbar +
# Monitor + several devices) would interleave the read-modify-writes and corrupt
# each other's delta windows — yielding wrong/negative/spiky numbers. Serialize
# the whole collector with one lock. It's polled ~every 5s and runs fast, so
# queueing a concurrent caller is fine.
_collect_lock = threading.Lock()

# RAPL energy snapshot for CPU power calculation
_prev_rapl_uj = 0
_prev_rapl_time = 0.0

# Disk I/O snapshot for rate calculation
_prev_disk_sectors = (0, 0)
_prev_disk_time = 0.0

# Per-process CPU snapshot for delta-based calculation
_prev_proc_snap = {}  # pid -> ticks
_prev_proc_time = 0.0

# Whole-system CPU snapshot for delta-based calculation
# ({name: ticks}, monotonic timestamp) from the previous status call
_prev_cpu_snap = None

# Root block device is fixed at runtime — compute once, then cache.
_root_disk_cached = False
_root_disk_value = None


def _list_ips():
    # All interfaces with an assigned IPv4 (skip lo, docker, veth, bridges).
    ips = {}
    try:
        out = subprocess.run(["ip", "-4", "-o", "addr", "show"],
                             capture_output=True, text=True, timeout=2)
        for line in out.stdout.splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            iface = parts[1]
            if iface == "lo" or iface.startswith(("br-", "veth", "docker")):
                continue
            ip = parts[3].split("/")[0]
            if iface not in ips:
                ips[iface] = ip
    except Exception:
        pass
    return ips


def _read_loadavg():
    """Return [1min, 5min, 15min] load averages from /proc/loadavg, or
    [None, None, None] if it can't be read."""
    try:
        with open("/proc/loadavg") as f:
            parts = f.read().split()
        return [float(parts[0]), float(parts[1]), float(parts[2])]
    except (OSError, IndexError, ValueError):
        return [None, None, None]


def _read_amdgpu_pm_info(card_n):
    """Best-effort parse of /sys/kernel/debug/dri/N/amdgpu_pm_info — used as
    a fallback when sysfs gpu_busy_percent / hwmon temp read EBUSY under
    heavy compute. Returns {"load": int|None, "temp": int|None,
    "power_w": int|None}. Requires root (debugfs is 0700)."""
    out = {"load": None, "temp": None, "power_w": None}
    if card_n is None:
        return out
    paths = [f"/sys/kernel/debug/dri/{card_n}/amdgpu_pm_info"]
    # Some kernels expose the file under a PCI-address-based dri index that
    # doesn't match the cardN number. Probe a couple of indices defensively.
    for i in range(4):
        p = f"/sys/kernel/debug/dri/{i}/amdgpu_pm_info"
        if p not in paths:
            paths.append(p)
    for path in paths:
        try:
            with open(path) as f:
                data = f.read()
        except (FileNotFoundError, PermissionError, OSError):
            continue
        m = re.search(r"GPU Load:\s*(\d+)\s*%", data)
        if m and out["load"] is None:
            out["load"] = int(m.group(1))
        m = re.search(r"GPU Temperature:\s*(\d+)\s*C", data)
        if m and out["temp"] is None:
            out["temp"] = int(m.group(1))
        m = re.search(r"([\d.]+)\s*W\s*\(average\s+(?:SoC|GPU)\)", data)
        if m and out["power_w"] is None:
            try:
                out["power_w"] = round(float(m.group(1)))
            except ValueError:
                pass
        if out["load"] is not None and out["temp"] is not None:
            break
    return out


def _read_nvidia_gpu():
    """Best-effort NVIDIA GPU stats via nvidia-smi, used when no AMD card is
    found (portability for NVIDIA hosts). Returns a dict with the same keys the
    AMD path fills — percent/temp/vram_used_gb/vram_total_gb/power_w — or {}."""
    smi = shutil.which("nvidia-smi")
    if not smi:
        return {}
    try:
        p = subprocess.run(
            [smi, "--query-gpu=utilization.gpu,temperature.gpu,memory.used,"
                  "memory.total,power.draw",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2)
    except Exception:
        return {}
    rows = (p.stdout or "").strip().splitlines()
    if not rows:
        return {}
    parts = [x.strip() for x in rows[0].split(",")]   # first GPU
    if len(parts) < 5:
        return {}

    def num(x):
        try:
            return float(x)
        except (ValueError, TypeError):
            return None
    util, temp, mu, mt, pw = (num(parts[0]), num(parts[1]), num(parts[2]),
                              num(parts[3]), num(parts[4]))
    out = {}
    if util is not None:
        out["percent"] = int(util)
    if temp is not None:
        out["temp"] = int(temp)
    if mu is not None:
        out["vram_used_gb"] = round(mu / 1024, 1)    # nvidia-smi reports MiB
    if mt is not None:
        out["vram_total_gb"] = round(mt / 1024, 1)
    if pw is not None:
        out["power_w"] = round(pw)
    return out


def _root_disk():
    """Block device backing '/', partition suffix stripped (nvme1n1p3 -> nvme1n1,
    sda2 -> sda), for matching /proc/diskstats. None if it can't be determined.
    The root device is fixed at runtime, so the result is computed once and
    cached — /api/system/status (polled every few seconds) hit this every call."""
    global _root_disk_cached, _root_disk_value
    if _root_disk_cached:
        return _root_disk_value
    _root_disk_value = _root_disk_uncached()
    _root_disk_cached = True
    return _root_disk_value


def _root_disk_uncached():
    try:
        with open("/proc/mounts") as f:
            for line in f:
                p = line.split()
                if len(p) >= 2 and p[1] == "/" and p[0].startswith("/dev/"):
                    name = os.path.basename(p[0])
                    m = re.match(r"(nvme\d+n\d+|mmcblk\d+)p\d+$", name)
                    if m:
                        return m.group(1)
                    m = re.match(r"([svh]d[a-z]+)\d+$", name)
                    if m:
                        return m.group(1)
                    return name
    except Exception:
        pass
    return None


def get_system_status(running_terminals, cached):
    """Collect the full system-status payload for /api/system/status.

    `running_terminals` is the list of running terminal numbers (the manager
    owns that lifecycle); `cached(key, ttl, producer)` is the manager's generic
    memoizer (used to throttle the `ip addr` fork). Serialized via `_collect_lock`
    so concurrent pollers don't corrupt the shared delta snapshots."""
    with _collect_lock:
        return _collect(running_terminals, cached)


def _collect(running_terminals, cached):
    # CPU: delta against the snapshot from the previous status call
    # (clients poll every few seconds, so the window is meaningful).
    # Only the very first call — or one arriving <0.5s after another —
    # falls back to a synchronous 0.1s two-read sample.
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
    global _prev_cpu_snap
    snap2 = read_proc_stat()
    prev = _prev_cpu_snap
    if prev and time.monotonic() - prev[1] >= 0.5:
        snap1 = prev[0]
    else:
        snap1 = snap2
        time.sleep(0.1)
        snap2 = read_proc_stat()
    _prev_cpu_snap = (snap2, time.monotonic())
    def calc_pct(a, b):
        total_d = sum(b) - sum(a)
        if total_d <= 0:        # no elapsed time / counter reset → no data
            return 0.0
        pct = 100.0 * (1.0 - (b[3] - a[3]) / total_d)
        return round(min(100.0, max(0.0, pct)), 1)   # clamp; deltas can go out of range
    cpu = calc_pct(snap1["cpu"], snap2["cpu"])
    cpu_cores = []
    i = 0
    # Require the core in BOTH snapshots — a CPU offlined/hotplugged between the
    # two /proc/stat reads (slow path) would otherwise KeyError the whole poll.
    while f"cpu{i}" in snap1:
        if f"cpu{i}" in snap2:
            cpu_cores.append(calc_pct(snap1[f"cpu{i}"], snap2[f"cpu{i}"]))
        i += 1

    # Memory
    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            parts = line.split()
            if parts and parts[0] in ("MemTotal:", "MemAvailable:"):
                mem[parts[0]] = int(parts[1])
    total_gb = mem.get("MemTotal:", 0) / 1048576
    avail_gb = mem.get("MemAvailable:", 0) / 1048576
    used_gb = total_gb - avail_gb

    # Uptime
    uptime = ""
    try:
        with open("/proc/uptime") as f:
            secs = int(float(f.read().split()[0]))
        days, rem = divmod(secs, 86400)
        hours = rem // 3600
        uptime = f"{days}d {hours}h" if days else f"{hours}h {rem % 3600 // 60}m"
    except (OSError, ValueError, IndexError):
        pass

    # GPU (AMD via sysfs — find discrete card by largest VRAM)
    gpu_percent = None
    gpu_vram_used_gb = None
    gpu_vram_total_gb = None
    best_card_n = None    # remember card index for the debugfs fallback
    try:
        best_card = None
        best_vram = 0
        for entry in os.listdir("/sys/class/drm"):
            m = re.match(r"card(\d+)$", entry)
            if not m:
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
                    best_card_n = int(m.group(1))
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

    # Fallback: under heavy compute the amdgpu driver locks sysfs files
    # (EBUSY), so gpu_busy_percent and the hwmon temp both vanish. The
    # debugfs `amdgpu_pm_info` file is published from a different path
    # and stays readable. We use it as a backup for both util and temp.
    # Requires root (manager already runs as root) and debugfs mounted.
    pm_info = _read_amdgpu_pm_info(best_card_n)
    if gpu_percent is None and pm_info.get("load") is not None:
        gpu_percent = pm_info["load"]

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
                        try:
                            with open(f"{p}/temp1_input") as f2:
                                gpu_temp = round(int(f2.read().strip()) / 1000)
                        except Exception:
                            pass
                        for pwr in ("power1_average", "power1_input"):
                            pwr_path = f"{p}/{pwr}"
                            if os.path.exists(pwr_path):
                                try:
                                    with open(pwr_path) as f2:
                                        gpu_power_w = round(int(f2.read().strip()) / 1000000)
                                except Exception:
                                    pass
                                break
                        break
    except Exception:
        pass

    # Apply the debugfs fallback for temp/power too.
    if gpu_temp is None and pm_info.get("temp") is not None:
        gpu_temp = pm_info["temp"]
    if gpu_power_w is None and pm_info.get("power_w") is not None:
        gpu_power_w = pm_info["power_w"]

    # NVIDIA portability: if no AMD card was found, fill the same GPU fields
    # from nvidia-smi (no-op on AMD hosts, where the card was found above).
    if gpu_vram_total_gb is None and gpu_percent is None:
        nv = _read_nvidia_gpu()
        if gpu_percent is None:       gpu_percent = nv.get("percent")
        if gpu_temp is None:          gpu_temp = nv.get("temp")
        if gpu_vram_used_gb is None:  gpu_vram_used_gb = nv.get("vram_used_gb")
        if gpu_vram_total_gb is None: gpu_vram_total_gb = nv.get("vram_total_gb")
        if gpu_power_w is None:        gpu_power_w = nv.get("power_w")

    # CPU package power (RAPL — delta between calls)
    cpu_power_w = None
    try:
        global _prev_rapl_uj, _prev_rapl_time

        with open("/sys/class/powercap/intel-rapl:0/energy_uj") as f:
            uj = int(f.read().strip())
        now = time.monotonic()
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
        root_disk = _root_disk()
        with open("/proc/diskstats") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 14 and root_disk and parts[2] == root_disk:
                    rd_sectors = int(parts[5])
                    wr_sectors = int(parts[9])
                    now = time.monotonic()
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
        page_size = os.sysconf("SC_PAGE_SIZE")
        clk_tck = os.sysconf("SC_CLK_TCK")
        now = time.monotonic()
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

    # IPs change rarely; cache for 10s to avoid forking `ip` every poll.
    ips = cached("ips", 10.0, _list_ips)

    running = running_terminals
    result = {
        "hostname": socket.gethostname(),
        "ips": ips,
        "cpu_percent": round(cpu, 1),
        "cpu_cores": cpu_cores,
        # Load averages from /proc/loadavg (1-, 5-, 15-minute). The full
        # triple is shown in the Monitor app; the taskbar shows just the
        # 1-min value as a representative single number.
        "load_avg": _read_loadavg(),
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
