"""System-status collection for the terminal manager.

Extracted from terminal-manager.py: the CPU/MEM/GPU/disk/network/process
readers behind `GET /api/system/status`. Pure data collection — no HTTP, no
manager state — so it can be exercised and reviewed on its own. The handler
calls `get_system_status(running_terminals, cached)`, injecting the list of
running terminals and the manager's generic `_cached` memoizer (which lives in
the main module because terminal start/stop invalidates its `running_terminals`
entry). Reads sysfs/procfs/debugfs; designed for AMD (sysfs + debugfs fallback)
with optional AMD-SMI and NVIDIA-SMI inventory/metrics. Best-effort throughout: any unreadable source is
omitted from the result rather than failing the whole poll.
"""
import os
import csv
import ctypes
import fcntl
import struct
import math
import pwd
import re
import shutil
import json
import heapq
import hashlib
import socket
import subprocess
import threading
import time
import urllib.request

_gpu_device_flags = {}
_gpu_sample = None
_gpu_sample_at = 0.0

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
_disk_sample = None
_disk_sample_at = 0.0
_disk_prev = {}

# Per-process CPU snapshot for delta-based calculation
_prev_proc_snap = {}  # pid -> ticks
_prev_proc_time = 0.0
# Memoized top-process list. The per-process CPU% is a delta since the previous
# collection, so the delta WINDOW must be a consistent interval. Without this memo
# it was `now - _prev_proc_time` = the gap to whoever polled last, and with the
# taskbar poll (2s) + every client's heartbeat (5s) interleaving that gap collapses
# to a sub-second window — where a process with a steady CPU drizzle (a Node/JS
# event loop like Claude Code) ticks in almost every window and out-ranks a busier
# compute burst (python) whose scheduling didn't line up with that tiny window.
# Recomputing at most once per _PROC_TTL pins the window to ~_PROC_TTL.
_proc_cache = []          # last computed top-process list
_PROC_TTL = 1.8           # seconds; slightly under the 2s taskbar/Monitor poll

# Whole-system CPU snapshot for delta-based calculation
# ({name: ticks}, monotonic timestamp) from the previous status call
_prev_cpu_snap = None
# The last CPU percentages we actually computed. A caller arriving too soon after
# another gets THESE instead of sleeping 0.1s for a fresh sample — see _collect.
_prev_cpu_result = None

# Root block device is fixed at runtime — compute once, then cache.
_root_disk_cached = False
_root_disk_value = None

# RAPL package domain dir is fixed at runtime — discover once, then cache.
_rapl_dir_cached = False
_rapl_dir_value = None


def _rapl_dir():
    """The powercap RAPL *package* domain backing CPU power, e.g.
    /sys/class/powercap/intel-rapl:0. Prefer :0, else the first top-level
    intel-rapl:N domain (multi-socket / non-domain-0 hosts where :0 is absent).
    Returns None if RAPL isn't exposed. Computed once and cached."""
    global _rapl_dir_cached, _rapl_dir_value
    if _rapl_dir_cached:
        return _rapl_dir_value
    base = "/sys/class/powercap"
    chosen = None
    try:
        if os.path.exists(f"{base}/intel-rapl:0/energy_uj"):
            chosen = f"{base}/intel-rapl:0"
        else:
            # Top-level package domains are "intel-rapl:N" (subzones have a
            # second colon, "intel-rapl:N:M" — skip those).
            for name in sorted(os.listdir(base)):
                if re.match(r"intel-rapl:\d+$", name) and \
                        os.path.exists(f"{base}/{name}/energy_uj"):
                    chosen = f"{base}/{name}"
                    break
    except OSError:
        chosen = None
    _rapl_dir_value = chosen
    _rapl_dir_cached = True
    return _rapl_dir_value


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


def _read_amdgpu_pm_info(card_n, pci_id=None):
    """Best-effort parse of /sys/kernel/debug/dri/N/amdgpu_pm_info — used as
    a fallback when sysfs gpu_busy_percent / hwmon temp read EBUSY under
    heavy compute. Returns {"load": int|None, "temp": int|None,
    "power_w": int|None}. Requires root (debugfs is 0700)."""
    out = {"load": None, "temp": None, "power_w": None}
    if card_n is None:
        return out
    # The PCI alias follows the device even when cardN/DRI indices differ.
    # Never scan other devices: that can splice GPU2's temperature into GPU1.
    paths = ([f"/sys/kernel/debug/dri/{pci_id}/amdgpu_pm_info"] if pci_id else
             [f"/sys/kernel/debug/dri/{card_n}/amdgpu_pm_info"])
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


def _gpu_number(value):
    """AMD-SMI has both scalar (older) and {value, unit} (newer) JSON metrics."""
    if isinstance(value, dict):
        value = value.get("value")
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _smi_rows(binary, args):
    try:
        result = subprocess.run([binary, *args, "--json"], capture_output=True,
                                text=True, timeout=2)
        if result.returncode:
            return []
        data = json.loads(result.stdout)
        if isinstance(data, dict):
            data = data.get("gpu_data", [data] if "gpu" in data else [])
        return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []
    except (OSError, subprocess.SubprocessError, ValueError):
        return []


def _amd_smi_binary():
    return shutil.which("amd-smi") or next((path for path in (
        "/opt/soft/rocm/bin/amd-smi", "/opt/rocm/bin/amd-smi"
    ) if os.path.isfile(path) and os.access(path, os.X_OK)), None)


def _amdgpu_integrated(card, pci):
    """Query stable amdgpu_drm.h DEV_INFO flags, independently of ROCm."""
    if pci in _gpu_device_flags:
        return _gpu_device_flags[pci]
    try:
        # Linux DRM_IOCTL_AMDGPU_INFO: _IOW('d', 0x45, 32-byte request).
        # DEV_INFO's fixed UAPI prefix has ids_flags at byte 136 (u64).
        # Request only that prefix; the kernel may append fields in later ABIs.
        result = ctypes.create_string_buffer(144)
        request = struct.pack('=QII16x', ctypes.addressof(result), len(result), 0x16)
        fd = os.open('/dev/dri/' + card, os.O_RDONLY | os.O_CLOEXEC)
        try:
            fcntl.ioctl(fd, 0x40206445, request)
        finally:
            os.close(fd)
        integrated = bool(struct.unpack_from('=Q', result.raw, 136)[0] & 1)
        _gpu_device_flags[pci] = integrated
        return integrated
    except OSError:
        return None


def _read_amd_smi_gpus(cached):
    binary = _amd_smi_binary()
    if not binary:
        return []
    # Sample activity before inventory/sensor queries, which wake idle Radeon
    # devices and otherwise contaminate the utilization we are measuring.
    usage = {row.get("gpu"): row for row in
             _smi_rows(binary, ["metric", "--usage"])}
    static = cached("gpu_amd_inventory", 30.0,
                    lambda: _smi_rows(binary, ["static", "--asic", "--bus", "--vram"]))
    metrics = {row.get("gpu"): row for row in
               _smi_rows(binary, ["metric", "--temperature", "--mem-usage", "--power"])}
    out = []
    for info in static:
        bus = info.get("bus") or {}
        asic = info.get("asic") or {}
        if not isinstance(bus, dict) or not isinstance(asic, dict):
            continue
        pci = bus.get("bdf")
        if not isinstance(pci, str) or not re.fullmatch(r"[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]", pci):
            continue
        flags = _gpu_number(asic.get("flags"))
        gpu = {"id": pci.lower(), "name": asic.get("market_name") or "AMD GPU"}
        # AMDGPU_IDS_FLAGS_FUSION in Linux's amdgpu_drm.h (UAPI) is bit 0.
        # https://github.com/torvalds/linux/blob/master/include/uapi/drm/amdgpu_drm.h
        # Use the flag AMD-SMI exposes, not a model-name or VRAM-size heuristic.
        if flags is not None:
            gpu["integrated"] = bool(int(flags) & 1)
        metric = dict(metrics.get(info.get("gpu"), {}))
        metric["usage"] = usage.get(info.get("gpu"), {}).get("usage")
        for section, field, key, scale in (
            ("usage", "gfx_activity", "percent", 1),
            ("temperature", "edge", "temp", 1),
            ("power", "socket_power", "power_w", 1),
            ("mem_usage", "used_vram", "vram_used_gb", 1024),
            ("mem_usage", "total_vram", "vram_total_gb", 1024),
        ):
            values = metric.get(section)
            n = _gpu_number(values.get(field)) if isinstance(values, dict) else None
            if n is not None:
                gpu[key] = round(n / scale, 1) if scale != 1 else round(n)
        out.append(gpu)
    return out


def _read_sysfs_gpus():
    out = []
    try:
        cards = os.listdir("/sys/class/drm")
    except OSError:
        return out
    for card in cards:
        match = re.fullmatch(r"card(\d+)", card)
        if not match:
            continue
        dev = f"/sys/class/drm/{card}/device"
        if os.path.basename(os.path.realpath(dev + "/driver")) != "amdgpu":
            continue
        pci = os.path.basename(os.path.realpath(dev))
        gpu = {"id": pci, "name": "AMD GPU"}
        integrated = _amdgpu_integrated(card, pci)
        if integrated is not None:
            gpu["integrated"] = integrated
        for filename, key, scale in (
            ("gpu_busy_percent", "percent", 1),
            ("mem_info_vram_used", "vram_used_gb", 1024**3),
            ("mem_info_vram_total", "vram_total_gb", 1024**3),
        ):
            try:
                with open(f"{dev}/{filename}") as stream:
                    n = int(stream.read().strip())
                gpu[key] = round(n / scale, 1) if scale != 1 else n
            except (OSError, ValueError):
                pass
        try:
            hwmons = os.listdir(dev + "/hwmon")
        except OSError:
            hwmons = []
        for hwmon in hwmons:
            path = f"{dev}/hwmon/{hwmon}"
            for filenames, key, scale in (
                (("temp1_input",), "temp", 1000),
                (("power1_average", "power1_input"), "power_w", 1000000),
            ):
                for filename in filenames:
                    try:
                        with open(path + "/" + filename) as stream:
                            gpu[key] = round(int(stream.read().strip()) / scale)
                        break
                    except (OSError, ValueError):
                        continue
        if any(key not in gpu for key in ("percent", "temp", "power_w")):
            pm = _read_amdgpu_pm_info(int(match.group(1)), pci)
            for key, pm_key in (("percent", "load"), ("temp", "temp"), ("power_w", "power_w")):
                if key not in gpu and pm.get(pm_key) is not None:
                    gpu[key] = pm[pm_key]
        out.append(gpu)
    return out


def _read_nvidia_gpus():
    binary = shutil.which("nvidia-smi")
    if not binary:
        return []
    try:
        result = subprocess.run(
            [binary, "--query-gpu=pci.bus_id,name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw",
             "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=2)
        if result.returncode:
            return []
    except (OSError, subprocess.SubprocessError):
        return []
    out = []
    for row in csv.reader(result.stdout.splitlines()):
        if len(row) != 7:
            continue
        pci, name, *values = [v.strip() for v in row]
        # NVIDIA prints an eight-digit PCI domain; normalize to Linux's BDF.
        if not re.fullmatch(r"[0-9a-fA-F]{4,8}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]", pci):
            continue
        gpu = {"id": pci[-12:].lower(), "name": name, "integrated": False}
        for key, value in zip(("percent", "temp", "vram_used_gb", "vram_total_gb", "power_w"), values):
            n = _gpu_number(value)
            if n is not None:
                gpu[key] = round(n / 1024, 1) if key.startswith("vram_") else round(n)
        out.append(gpu)
    return out


def _read_gpus(cached):
    # Monitor, history, and desktop heartbeats share one sample; do not spawn
    # another management CLI for every client poll. Like the process snapshot,
    # own this sampling interval independently of the injected general memoizer.
    # The enclosing collector lock serializes production calls.
    global _gpu_sample, _gpu_sample_at
    if _gpu_sample is None or time.monotonic() - _gpu_sample_at >= 2.0:
        _gpu_sample = _collect_gpus(cached)
        _gpu_sample_at = time.monotonic()
    return _gpu_sample


def _collect_gpus(cached):
    # Preserve device identity when a sensor is temporarily unreadable. SMI
    # values take precedence; sysfs fills gaps on installations without ROCm.
    # Read SMI activity before sysfs hwmon/debugfs wakes the cards.
    smi = _read_amd_smi_gpus(cached) + _read_nvidia_gpus()
    gpus = {gpu["id"]: gpu for gpu in _read_sysfs_gpus()}
    for gpu in smi:
        gpus[gpu["id"]] = {**gpus.get(gpu["id"], {}), **gpu}
    return sorted(gpus.values(), key=lambda gpu: gpu["id"])


def _read_cpu_temperatures():
    """One temperature per physical CPU package, never per logical core."""
    out = {}
    try:
        hwmons = sorted(os.listdir('/sys/class/hwmon'))
    except OSError:
        return []
    for hwmon in hwmons:
        path = '/sys/class/hwmon/' + hwmon
        try:
            with open(path + '/name') as stream:
                driver = stream.read().strip()
            if driver not in ('k10temp', 'coretemp', 'zenpower'):
                continue
            sensors = []
            if driver == 'coretemp':
                for filename in sorted(os.listdir(path)):
                    if re.fullmatch(r'temp[0-9]+_label', filename):
                        try:
                            with open(path + '/' + filename) as stream:
                                label = stream.read().strip()
                            if label.lower().startswith('package'):
                                sensors.append((filename.replace('_label', '_input'), label))
                        except OSError:
                            continue
            else:
                sensors = [('temp1_input', 'package')]
            for sensor, label in sensors:
                identity = os.path.realpath(path + '/device') + ':' + label
                ident = 'cpu-' + hashlib.sha256(identity.encode()).hexdigest()
                cpu = {'id': ident}
                try:
                    with open(path + '/' + sensor) as stream:
                        cpu['temp'] = round(int(stream.read().strip()) / 1000)
                except (OSError, ValueError):
                    pass
                out[ident] = cpu
        except OSError:
            continue
    return [dict(cpu, name='CPU' + str(i + 1)) for i, cpu in enumerate(sorted(out.values(), key=lambda cpu: cpu['id']))]


def _mount_path(value):
    return re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), value)


def _disk_inventory():
    """Physical drives, resolving partitions and dm/RAID slaves to their parents."""
    def read(path):
        try:
            with open(path) as stream:
                return stream.read().strip()
        except OSError:
            return ''

    try:
        names = sorted(os.listdir('/sys/class/block'))
    except OSError:
        return []
    drives = {}
    for name in names:
        block = '/sys/class/block/' + name
        real = os.path.realpath(block)
        if (name.startswith(('loop', 'ram', 'zram', 'sr', 'dm-', 'md')) or
                '/virtual/' in real or os.path.exists(block + '/partition')):
            continue
        devno = read(block + '/dev')
        if not devno:
            continue
        hardware = read(block + '/wwid') or read(block + '/device/wwid') or read(block + '/device/serial')
        identity = 'physical:' + (hardware or real)
        entry = {'id': 'disk-' + hashlib.sha256(identity.encode()).hexdigest(),
                 'kind': 'physical', 'name': name, 'device': '/dev/' + name,
                 'mount': None, 'mounts': [], '_devno': devno, '_filesystems': []}
        model = read(block + '/device/model')
        if model:
            entry['model'] = model
        try:
            entry['capacity_gb'] = round(int(read(block + '/size')) * 512 / 1024**3, 1)
        except ValueError:
            pass
        drives[name] = entry

    def parents(name, visited=None):
        visited = set() if visited is None else visited
        if name in visited:
            return set()
        visited.add(name)
        if name in drives:
            return {name}
        block = '/sys/class/block/' + name
        if os.path.exists(block + '/partition'):
            return parents(os.path.basename(os.path.dirname(os.path.realpath(block))), visited)
        try:
            slaves = os.listdir(block + '/slaves')
        except OSError:
            return set()
        result = set()
        for slave in slaves:
            result.update(parents(slave, visited))
        return result

    filesystems = {}
    try:
        with open('/proc/self/mountinfo') as stream:
            for line in stream:
                parts = line.split()
                try:
                    sep = parts.index('-')
                    devno, root, mount = parts[2], _mount_path(parts[3]), _mount_path(parts[4])
                    if not os.path.exists('/sys/dev/block/' + devno):
                        continue
                    name = os.path.basename(os.path.realpath('/sys/dev/block/' + devno))
                    backing = parents(name)
                    if not backing:
                        continue
                    fs = filesystems.setdefault(devno, {'_devno': devno, 'backing': backing, 'mounts': [], 'roots': []})
                    fs['mounts'].append(mount)
                    fs['roots'].append((root != '/', mount != '/', len(mount), mount))
                except (ValueError, IndexError):
                    continue
    except OSError:
        pass
    for fs in filesystems.values():
        mount = min(fs['roots'])[-1]
        for name in fs['backing']:
            drive = drives[name]
            drive['mounts'].extend(fs['mounts'])
            # A spanning filesystem's space cannot be assigned to each drive.
            if len(fs['backing']) == 1:
                drive['_filesystems'].append({'mount': mount, '_devno': fs['_devno']})
            else:
                drive['_shared_space'] = True
    for drive in drives.values():
        drive['mounts'] = sorted(set(drive['mounts']))
        if drive['mounts']:
            drive['mount'] = min(drive['mounts'], key=lambda m: (m != '/', len(m), m))
    return sorted(drives.values(), key=lambda d: (d['mount'] != '/', d['name']))


def _read_disks(cached):
    """Share a delta window across taskbar, Monitor and concurrent viewers."""
    global _disk_sample, _disk_sample_at, _disk_prev
    now = time.monotonic()
    if _disk_sample is not None and now - _disk_sample_at < 1.8:
        return _disk_sample
    inventory = cached('disk_inventory', 10.0, _disk_inventory)
    counters = {}
    try:
        with open('/proc/diskstats') as stream:
            for line in stream:
                parts = line.split()
                if len(parts) >= 14:
                    try:
                        counters[parts[0] + ':' + parts[1]] = (int(parts[5]), int(parts[9]))
                    except ValueError:
                        continue
    except OSError:
        pass
    out, next_prev = [], {}
    for entry in inventory:
        disk = {k: v for k, v in entry.items() if not k.startswith('_')}
        filesystems = entry['_filesystems']
        if filesystems and not entry.get('_shared_space'):
            totals = [0, 0, 0]
            try:
                for fs in filesystems:
                    mount = fs['mount']
                    mounted_dev = os.stat(mount).st_dev
                    if f'{os.major(mounted_dev)}:{os.minor(mounted_dev)}' != fs['_devno']:
                        raise OSError('mount device changed')
                    st = os.statvfs(mount)
                    totals[0] += st.f_frsize * st.f_blocks
                    totals[1] += st.f_frsize * (st.f_blocks - st.f_bfree)
                    totals[2] += st.f_frsize * st.f_bavail
                disk.update(total_gb=round(totals[0] / 1024**3, 1),
                            used_gb=round(totals[1] / 1024**3, 1),
                            free_gb=round(totals[2] / 1024**3, 1))
                if totals[1] + totals[2] > 0:
                    disk['pct'] = round(100 * totals[1] / (totals[1] + totals[2]))
            except OSError:
                pass
        counts = counters.get(entry['_devno'])
        if counts is not None:
            prev = _disk_prev.get(disk['id'])
            if prev:
                stamp, old_rd, old_wr = prev
                dt = now - stamp
                # Device replacement/counter reset is an unknown interval, not
                # a negative rate or a fabricated idle sample.
                if 0 < dt <= 600 and counts[0] >= old_rd and counts[1] >= old_wr:
                    disk['read_bytes'] = int((counts[0] - old_rd) * 512 / dt)
                    disk['write_bytes'] = int((counts[1] - old_wr) * 512 / dt)
            next_prev[disk['id']] = (now, *counts)
        out.append(disk)
    _disk_prev = next_prev
    _disk_sample, _disk_sample_at = out, now
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


# Interpreters whose *real* identity is the script they run, not the binary — so
# `python3 worker.py` should read "worker.py", not "python3". Matched on the
# argv[0] basename (covers /usr/bin/python3.11, a venv "python", "node", …).
_INTERP_PREFIXES = ("python", "node", "bash", "sh", "dash", "perl", "ruby")
# Flags that consume an INLINE program (code/module) rather than a script file:
# after these there is no filename to name the process from, so fall back to the
# interpreter's own name (e.g. `python3 -c "…"` → "python3", not "-c" or the code).
_INTERP_INLINE_FLAGS = {"-c", "-e", "--eval", "-m", "--module"}


def _display_name(cmdline, short_name):
    """Pick a human-legible name for a process from its argv (`cmdline`, already
    NUL-split with empties dropped) and its /proc `comm` (`short_name`) as a
    fallback. For a plain program use its basename; for an interpreter, name it
    after the first real script/file argument — but NEVER from a flag (a token
    starting with "-") nor from `-c/-e/-m` inline code (those fall back to the
    interpreter itself, e.g. `python3 -c "…"` → "python3"). Pure/stringly-typed
    so it's unit-testable without /proc."""
    if not cmdline:
        return short_name
    base0 = os.path.basename(cmdline[0])
    is_interp = any(base0.startswith(p) for p in _INTERP_PREFIXES)
    if is_interp and len(cmdline) > 1:
        for tok in cmdline[1:]:
            if tok.startswith("-"):
                # An inline-code / module flag means no script follows that we'd
                # want to name from — stop and fall back to the interpreter.
                if tok in _INTERP_INLINE_FLAGS:
                    break
                continue          # a plain flag (-u, -O, …) — keep scanning
            # First non-flag token = the script/file the interpreter is running.
            cand = os.path.basename(tok)
            if cand:
                return cand
            break
        return base0              # -c/-e/-m, or no real script arg found
    # Non-interpreter (or a bare interpreter with no args). Use argv[0]'s
    # basename, unless it's empty or a login-shell "-bash" style flag name.
    if base0 and not base0.startswith("-"):
        return base0
    return short_name


def _collect_top_procs():
    """Top ~30 processes by CPU%, delta-based (like htop) over the gap since the
    PREVIOUS run of this function. The caller memoizes it (~_PROC_TTL) so that gap
    is a consistent window — which is what makes the ranking reflect sustained load
    instead of which process happened to tick in a sub-second sampling window. Runs
    under _collect_lock (via get_system_status), so the module snapshots are safe."""
    global _prev_proc_snap, _prev_proc_time
    processes = []
    try:
        page_size = os.sysconf("SC_PAGE_SIZE")
        clk_tck = os.sysconf("SC_CLK_TCK")
        now = time.monotonic()
        dt = now - _prev_proc_time if _prev_proc_time else 0
        cur_snap = {}
        candidates = []
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
                cur_snap[pid] = ticks
                cpu_pct = 0.0
                if dt > 0 and pid in _prev_proc_snap:
                    # max(0,...): on PID reuse the new process's ticks can be
                    # below the dead one's snapshot — a negative % is bogus.
                    delta_ticks = max(0, ticks - _prev_proc_snap[pid])
                    cpu_pct = (delta_ticks / clk_tck) / dt * 100
                candidates.append((round(cpu_pct, 1), pid, short_name, round(rss, 1)))
            except Exception:
                continue
        _prev_proc_snap = cur_snap
        _prev_proc_time = now
        # The UI shows only 30 rows. Ranking needs /proc/PID/stat for every
        # process, but resolving cmdline + uid + passwd for hundreds of rows
        # that will be discarded doubles the work on a busy host.
        top = heapq.nlargest(30, candidates, key=lambda p: p[0])
        users = {}
        for cpu_pct, pid, short_name, rss in top:
            try:
                with open(f"/proc/{pid}/cmdline") as f:
                    cmdline = [c for c in f.read().split("\x00") if c]
                name = _display_name(cmdline, short_name)
            except Exception:
                name = short_name
            try:
                uid = os.stat(f"/proc/{pid}").st_uid
            except OSError:
                uid = 0
            if uid not in users:
                try:
                    users[uid] = pwd.getpwuid(uid).pw_name
                except KeyError:
                    users[uid] = str(uid)
            processes.append({"pid": pid, "name": name,
                              "cpu": cpu_pct, "mem_mb": rss,
                              "user": users[uid]})
    except Exception:
        pass
    return processes


def get_system_status(running_terminals, cached, want_procs=True):
    """Collect the full system-status payload for /api/system/status.

    `running_terminals` is the list of running terminal numbers (the manager
    owns that lifecycle); `cached(key, ttl, producer)` is the manager's generic
    memoizer (used to throttle the `ip addr` fork). Serialized via `_collect_lock`
    so concurrent pollers don't corrupt the shared delta snapshots.

    `want_procs=False` omits the top-process list. That scan is ~330 /proc file
    opens costing 11.3ms against 1.3ms for everything else (measured on z20), so
    the metrics recorder — which samples every 2s forever but stores only
    scalars — asks for the cheap nine tenths and leaves the rest alone. The key
    is OMITTED rather than sent empty, because an empty list is a claim that
    nothing is running."""
    with _collect_lock:
        return _collect(running_terminals, cached, want_procs)


class _CpuTooSoon(Exception):
    """Two polls landed inside the 0.5s sampling window — serve the last reading."""


def _cpu_usage_percent(a, b):
    # /proc/stat: guest/guest_nice are already included in user/nice. Counting
    # them again inflates utilization. I/O wait is idle time, not CPU execution.
    total_d = sum(b[:8]) - sum(a[:8])
    if total_d <= 0:
        return 0.0
    idle_d = sum(b[3:5]) - sum(a[3:5])
    pct = 100.0 * (1.0 - idle_d / total_d)
    return round(min(100.0, max(0.0, pct)), 1)


def _collect(running_terminals, cached, want_procs=True):
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
    global _prev_cpu_snap, _prev_cpu_result
    cpu = None
    cpu_cores = []
    # Guard the whole CPU section: a transient /proc/stat read failure should
    # omit the CPU fields, not abort the entire status poll (taking GPU/disk/mem
    # down with it).
    try:
        snap2 = read_proc_stat()
        prev = _prev_cpu_snap
        if prev and time.monotonic() - prev[1] >= 0.5:
            snap1 = prev[0]
        elif prev is not None and _prev_cpu_result is not None:
            # TOO SOON for a meaningful delta, but we already measured one moments
            # ago — reuse it rather than sleeping 0.1s for a near-identical answer.
            #
            # This whole branch runs under the process-global _collect_lock, and it
            # SELF-AMPLIFIED: the first caller stamped _prev_cpu_snap to now, so
            # every caller queued behind it then failed the 0.5s test and slept its
            # own 0.1s in turn — K near-simultaneous pollers cost K x 0.1s
            # SERIALIZED, host-wide. Two devices' 5s heartbeats plus Monitor's 2s
            # poll collide by construction, and /api/desktop folds `system` in, so
            # this sat between the shell parsing and the first app frame loading.
            raise _CpuTooSoon
        else:
            # First call of the process only: there is genuinely nothing to delta
            # against, so pay the two-read sample once.
            snap1 = snap2
            time.sleep(0.1)
            snap2 = read_proc_stat()
        _prev_cpu_snap = (snap2, time.monotonic())

        cpu = _cpu_usage_percent(snap1["cpu"], snap2["cpu"])
        i = 0
        # Require the core in BOTH snapshots — a CPU offlined/hotplugged between
        # the two /proc/stat reads (slow path) would otherwise KeyError the poll.
        while f"cpu{i}" in snap1:
            if f"cpu{i}" in snap2:
                cpu_cores.append(_cpu_usage_percent(snap1[f"cpu{i}"], snap2[f"cpu{i}"]))
            i += 1
        _prev_cpu_result = (cpu, cpu_cores)
    except _CpuTooSoon:
        cpu, cpu_cores = _prev_cpu_result
    except (OSError, ValueError, KeyError):
        pass

    # Memory
    mem = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if parts and parts[0] in ("MemTotal:", "MemAvailable:"):
                    mem[parts[0]] = int(parts[1])
    except (OSError, ValueError):
        pass
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

    gpus = _read_gpus(cached)
    discrete = [gpu for gpu in gpus if not gpu.get("integrated", False)]
    primary = max(discrete or gpus, key=lambda gpu: gpu.get("vram_total_gb", 0), default={})
    # Scalar fields stay compatible with Monitor/history consumers. The tray
    # uses the inventory, so it never conflates readings from different cards.
    gpu_percent = primary.get("percent")
    gpu_temp = primary.get("temp")
    # Power is a component total, unlike the primary-device compatibility
    # fields. Integrated GPU power can overlap CPU package power, so use
    # discrete cards when present. A missing card sensor makes the sum unknown.
    power_gpus = discrete or gpus
    gpu_power_w = (sum(gpu["power_w"] for gpu in power_gpus)
                   if power_gpus and all(gpu.get("power_w") is not None for gpu in power_gpus)
                   else None)
    gpu_vram_used_gb = primary.get("vram_used_gb")
    gpu_vram_total_gb = primary.get("vram_total_gb")

    cpus = _read_cpu_temperatures()
    cpu_temp = max((cpu['temp'] for cpu in cpus if cpu.get('temp') is not None), default=None)

    # CPU package power (RAPL — delta between calls)
    cpu_power_w = None
    try:
        global _prev_rapl_uj, _prev_rapl_time
        rapl = _rapl_dir()
        if rapl:
            with open(f"{rapl}/energy_uj") as f:
                uj = int(f.read().strip())
            now = time.monotonic()
            if _prev_rapl_time > 0:
                dt = now - _prev_rapl_time
                if dt > 0:
                    duj = uj - _prev_rapl_uj
                    if duj < 0:
                        with open(f"{rapl}/max_energy_range_uj") as f:
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

    disks = _read_disks(cached)

    # Legacy root disk usage and I/O
    disk_used_gb = None
    disk_total_gb = None
    disk_free_gb = None
    disk_pct = None
    disk_read_bytes = None
    disk_write_bytes = None
    try:
        st = os.statvfs("/")
        disk_total_gb = round(st.f_frsize * st.f_blocks / (1024**3), 1)
        disk_used_gb = round(st.f_frsize * (st.f_blocks - st.f_bfree) / (1024**3), 1)
        # Space AVAILABLE to non-root and the Use% exactly as `df` reports them
        # (both exclude the root-reserved blocks) — so the taskbar matches what the
        # operator sees on the shell, and turns red before the disk is truly 100%.
        disk_free_gb = round(st.f_frsize * st.f_bavail / (1024**3), 1)
        used_blocks = st.f_blocks - st.f_bfree
        denom = used_blocks + st.f_bavail
        if denom > 0:
            disk_pct = round(100.0 * used_blocks / denom)
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
                            # Clamp: deltas go negative on a counter reset (reboot
                            # between polls) or if the root device changed — a
                            # negative byte-rate is nonsense, so floor at 0.
                            d_rd = max(0, rd_sectors - _prev_disk_sectors[0])
                            d_wr = max(0, wr_sectors - _prev_disk_sectors[1])
                            disk_read_bytes = int(d_rd * 512 / dt)
                            disk_write_bytes = int(d_wr * 512 / dt)
                    _prev_disk_sectors = (rd_sectors, wr_sectors)
                    _prev_disk_time = now
                    break
    except Exception:
        pass

    # Top processes by CPU — memoized so the delta window is a consistent ~_PROC_TTL
    # no matter how many pollers call us (see _collect_top_procs / _proc_cache).
    global _proc_cache
    processes = None
    if want_procs:
        if not _proc_cache or (time.monotonic() - _prev_proc_time) >= _PROC_TTL:
            _proc_cache = _collect_top_procs()
        processes = _proc_cache

    # IPs change rarely; cache for 10s to avoid forking `ip` every poll.
    ips = cached("ips", 10.0, _list_ips)

    running = running_terminals
    result = {
        "hostname": socket.gethostname(),
        "ips": ips,
        "cpu_percent": round(cpu, 1) if cpu is not None else None,
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
    }
    # Omitted, not empty, when the caller didn't ask: an empty list is a claim
    # that nothing is running, and the desktop renders it as exactly that.
    if processes is not None:
        result["processes"] = processes
    result["cpus"] = cpus
    result["gpus"] = gpus
    result["disks"] = disks
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
        result["disk_free_gb"] = disk_free_gb
        result["disk_pct"] = disk_pct
    if disk_read_bytes is not None:
        result["disk_read_bytes"] = disk_read_bytes
        result["disk_write_bytes"] = disk_write_bytes
    return result


# ---- wall power --------------------------------------------------------------
# The machine's WHOLE draw, measured by a smart plug it is plugged into, rather
# than by a sensor inside it. Every other reading in this module costs a sysfs
# read in microseconds; this one is an HTTP round-trip to a small board on the
# LAN, which makes it different in three ways the rest of the file need not care
# about:
#
#   * It must never run on a request thread. The manager drives it through
#     _bg_cached (refresh-ahead), not through the `cached` memoizer passed into
#     get_system_status() — that one makes the first caller after expiry pay the
#     full cost, which here is a network timeout.
#   * The device is the constraint, not us. A Shelly plug has a few hundred KB
#     of RAM and serves this from the same tiny stack that runs the relay; the
#     Monitor polls every 2s from every open tab, so the cache upstream of this
#     is what keeps N viewers from becoming N times the load on it.
#   * It can simply vanish (unplugged, rebooted, off the Wi-Fi) while every
#     other sensor here cannot. So a sample is STAMPED and the consumer drops a
#     stale one, instead of redrawing a ten-minute-old wattage as if it were now.
#
# Protocol: Shelly Gen2+ RPC (gen 2/3/4 — the /rpc/ JSON-RPC surface). Gen1's
# /meter/0 is deliberately not probed: a second untested transport for a device
# nobody here has is a liability, not a feature.

WALL_POWER_TIMEOUT = 4.0
# A Shelly energy counter ticks in ~119.094 mWh steps, so a per-minute bucket is
# quantised to ~7.15W. Fine for a PC drawing hundreds of watts, coarse for a
# phone charger — which is why buckets only ever FILL GAPS and never replace a
# spot reading.
WALL_MWH_PER_MIN_TO_W = 0.06        # mWh in one minute -> mean watts


def wall_power_endpoint(plug=None):
    """The RPC URL to sample, or None when no plug is configured.

    `VIBETOP_POWER_PLUG` accepts a bare host ("192.168.1.42"), a host:port, or a
    full base URL. The path is always appended here and never taken from the
    setting: pointed at a Shelly's root this would pull its ~280KB web UI on
    every poll, which is both useless and unkind to the device.

    Shelly.GetStatus rather than Switch.GetStatus (1.5KB vs 0.4KB) because it is
    the only single call that carries the DEVICE'S OWN CLOCK alongside the
    meter. Two calls to save a kilobyte would double the device's load and still
    leave the clock and the reading sampled a round-trip apart.
    """
    if plug is None:
        plug = os.environ.get("VIBETOP_POWER_PLUG", "")
    plug = (plug or "").strip()
    if not plug:
        return None
    if "://" not in plug:
        plug = "http://" + plug
    return plug.rstrip("/") + "/rpc/Shelly.GetStatus"


def read_wall_power(plug=None, timeout=WALL_POWER_TIMEOUT, opener=None):
    """One sample from the configured smart plug, on the DEVICE's clock.

    Returns None when no plug is configured; RAISES when one is configured but
    unreachable or answering nonsense, so the caller's memo can apply its retry
    floor rather than stamping a failure as a fresh reading.

    The returned dict separates two clocks that are easy to conflate:

      "at"      the device's own unixtime — WHERE this reading belongs on the
                timeline. The reading crosses a network, so the moment it
                arrives is not the moment it was measured; stamping on arrival
                bakes the round-trip into the x-axis and puts anything recovered
                after an outage at entirely the wrong time.
      "fetched" our clock — used ONLY to answer "are we still hearing from it".
                Liveness must not depend on the device's clock being right.

    It also carries what the plug has BUFFERED, not just the instant:

      "by_minute"  mean watts for each of the last completed minutes, oldest
                   last. The device holds three; index 0 is the minute IN
                   PROGRESS and is energy-so-far rather than a mean, so it is
                   dropped here — a partial bucket read as a mean is a reading
                   that is simply wrong, and wrong low.
      "minute_ts"  device timestamp of the minute bucket that was dropped, so a
                   caller can place the rest: bucket i starts at minute_ts - i*60.

    That buffer is the whole point of fetching often: between two polls the
    device kept measuring, and a gap of up to three minutes — a slow network, a
    Wi-Fi blip, a restarted manager — can be repaired from it afterwards instead
    of being lost.
    """
    url = wall_power_endpoint(plug)
    if not url:
        return None
    get = opener or urllib.request.urlopen
    with get(url, timeout=timeout) as r:
        # Bounded: a setting pointing at something large must not be pulled into
        # memory every second forever.
        body = r.read(262144)
    fetched = time.time()
    d = json.loads(body.decode("utf-8", "replace"))
    sw = d.get("switch:0") or {}
    w = sw.get("apower")
    # A plug reporting 0.0 is a real measurement (nothing drawing) and must stay
    # a number. Only a MISSING or non-numeric field is "unknown" — conflating
    # the two is how a monitor ends up claiming an idle machine draws nothing.
    if not isinstance(w, (int, float)) or isinstance(w, bool):
        raise ValueError("smart plug response has no numeric 'apower'")
    at = (d.get("sys") or {}).get("unixtime")
    if not isinstance(at, (int, float)) or isinstance(at, bool):
        # Without the device clock we cannot place the sample, and placing it on
        # ours is the mistake this function exists to avoid. Fail rather than
        # silently fall back.
        raise ValueError("smart plug response has no numeric 'sys.unixtime'")

    energy = sw.get("aenergy") or {}
    minute_ts, by_minute = energy.get("minute_ts"), []
    raw = energy.get("by_minute")
    if isinstance(raw, list) and isinstance(minute_ts, (int, float)) \
            and not isinstance(minute_ts, bool):
        minute_ts = int(minute_ts)
        # Drop index 0 (the minute still in progress); keep the completed ones.
        for v in raw[1:]:
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                by_minute.append(round(v * WALL_MWH_PER_MIN_TO_W, 1))
            else:
                by_minute.append(None)
    else:
        minute_ts = None

    return {"w": round(float(w), 1), "at": int(at), "fetched": fetched,
            "minute_ts": minute_ts, "by_minute": by_minute}
