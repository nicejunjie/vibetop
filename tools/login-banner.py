#!/usr/bin/env python3
"""Live login-banner preview; standard library only, no host configuration writes."""
import argparse
from collections import defaultdict
from datetime import datetime
import errno
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys

SYS = Path('/sys')
WIDTH = 88
COLOR = False
PALETTE = {
    'cyan': '96', 'purple': '95', 'green': '92', 'amber': '93',
    'red': '91', 'muted': '90', 'white': '97',
}


def paint(value, color):
    return f'\033[{PALETTE[color]}m{value}\033[0m' if COLOR else str(value)


def colored_temperature(value):
    match = re.match(r'(-?\d+(?:\.\d+)?)', value)
    if not match:
        return paint(value, 'muted')
    number = float(match[1])
    return paint(value.replace(' °C', '°'), 'red' if number >= 85 else 'amber' if number >= 60 else 'green')


def sensor_row(group, device, sensors):
    pieces = []
    for label, value in sensors:
        pieces.append(paint(label, 'muted') + ' ' + colored_temperature(value))
    prefix = '  ' + paint(f'{group:<5}', 'purple') + ' ' + paint(f'{device:<19}', 'white') + ' '
    print(prefix + '  '.join(pieces))


def read(path, default=''):
    try:
        return Path(path).read_text().strip()
    except (OSError, UnicodeError):
        return default


def command(args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=2,
                              check=False).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ''


def temperature(path):
    try:
        return f'{int(path.read_text().strip()) / 1000:.1f} °C', ''
    except OSError as exc:
        return '—', 'driver busy' if exc.errno == errno.EBUSY else 'unavailable'
    except ValueError:
        return '—', 'invalid reading'


def gpu_name(device):
    product = read(device / 'product_name')
    if product:
        return product
    ident = read(device / 'device').removeprefix('0x').upper()
    rev = read(device / 'revision').removeprefix('0x').upper()
    for line in read('/usr/share/libdrm/amdgpu.ids').splitlines():
        parts = [p.strip() for p in line.split(',', 2)]
        if len(parts) == 3 and parts[0].upper() == ident and parts[1].upper() == rev:
            return parts[2].removeprefix('AMD ')
    return 'Radeon integrated' if ident == '13C0' else 'AMD GPU'


def wake_amd_gpus():
    """Take one AMD SMI snapshot to wake idle cards without changing PM policy."""
    if not any(read(hw / 'name') == 'amdgpu' for hw in (SYS / 'class/hwmon').glob('hwmon*')):
        return ''
    executable = shutil.which('amd-smi')
    if not executable:
        candidate = Path('/opt/rocm/bin/amd-smi')
        if candidate.is_file() and os.access(candidate, os.X_OK):
            executable = str(candidate)
    if not executable:
        return 'AMD SMI unavailable; sleeping GPUs may have no readings.'
    try:
        result = subprocess.run(
            [executable, 'metric', '--gpu', 'all', '--temperature', '--json'],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
            timeout=8, check=False,
        )
        if result.returncode:
            return 'AMD SMI snapshot failed; showing readable sensors only.'
    except subprocess.TimeoutExpired:
        return 'AMD SMI snapshot timed out; showing readable sensors only.'
    except OSError:
        return 'AMD SMI could not start; showing readable sensors only.'
    return ''


def collect_temperatures():
    groups = defaultdict(list)
    gpus = []
    for hw in sorted((SYS / 'class/hwmon').glob('hwmon*'), key=lambda p: int(p.name[5:])):
        name = read(hw / 'name', hw.name)
        device = (hw / 'device').resolve()
        inputs = sorted(hw.glob('temp*_input'), key=lambda p: int(re.search(r'temp(\d+)', p.name)[1]))
        if not inputs:
            continue
        if name == 'amdgpu':
            values, notes = {}, []
            for sensor in inputs:
                label = read(sensor.with_name(sensor.name.replace('_input', '_label')), sensor.stem)
                value, note = temperature(sensor)
                values[label] = value
                if note:
                    notes.append(note)
            gpus.append((device.name, gpu_name(device), values, sorted(set(notes))))
            continue
        for sensor in inputs:
            label = read(sensor.with_name(sensor.name.replace('_input', '_label')), 'Temperature')
            value, note = temperature(sensor)
            if name in ('k10temp', 'coretemp'):
                group, dev = 'CPU', 'Processor'
                label = {'Tctl': 'Package / control', 'Tccd1': 'CCD 1', 'Tccd2': 'CCD 2'}.get(label, label)
            elif name.startswith('spd'):
                group, dev = 'Memory', f'DIMM {device.name}'
                label = 'Module sensor'
            elif name == 'nvme':
                group = 'Storage'
                dev = device.name
            elif name.startswith('r8169') or any((SYS / 'class/net' / nic / 'device').resolve() == device
                                               for nic in os.listdir(SYS / 'class/net')):
                group, dev = 'Network', name
                if name.startswith('r8169'):
                    # The PHY lives below the PCI device; resolve its owning NIC.
                    dev = next((p.name for p in (SYS / 'class/net').iterdir()
                                if str(device).startswith(str((p / 'device').resolve()) + '/')), name)
                    label = 'PHY'
            else:
                group, dev = 'Other sensors', name
            groups[group].append((dev, label, value, note))
    for zone in sorted((SYS / 'class/thermal').glob('thermal_zone*')):
        if (zone / 'temp').exists():
            value, note = temperature(zone / 'temp')
            groups['Thermal zones'].append((zone.name, read(zone / 'type', 'Temperature'), value, note))
    return groups, gpus


def main():
    global COLOR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--color', choices=('auto', 'always', 'never'), default='auto')
    args = parser.parse_args()
    COLOR = args.color == 'always' or (args.color == 'auto' and sys.stdout.isatty() and 'NO_COLOR' not in os.environ)
    host = socket.gethostname().split('.')[0]
    print()
    if host in ('moon-1', 'moon-01'):
        print(paint(r'''  __  __  ___   ___  _   _       _
 |  \/  |/ _ \ / _ \| \ | |     / |
 | |\/| | | | | | | |  \| |_____| |
 | |  | | |_| | |_| | |\  |_____| |
 |_|  |_|\___/ \___/|_| \_|     |_|''', 'cyan'))
        print(paint(f"  Junjie's {host} server", 'muted'))
    else:
        print(paint(f'  {host.upper()}', 'cyan') + paint("  ·  Junjie's server", 'muted'))
    cpu = next((line.split(':', 1)[1].strip() for line in read('/proc/cpuinfo').splitlines()
                if line.startswith('model name')), 'Unknown processor')
    cpu = cpu.removeprefix('AMD ').replace(' 16-Core Processor', ' · 16 cores / 32 threads')
    print('  ' + paint(cpu, 'white'))
    osinfo = dict(line.split('=', 1) for line in read('/etc/os-release').splitlines() if '=' in line)
    osname = osinfo.get('PRETTY_NAME', 'Linux').strip(chr(34))
    print('  ' + paint(f'{osname} · {os.uname().release} · {datetime.now().astimezone():%d %b %H:%M %Z}', 'muted'))
    print()

    uptime = int(float(read('/proc/uptime', '0').split()[0]))
    days, hours, minutes = uptime // 86400, uptime % 86400 // 3600, uptime % 3600 // 60
    mem = {line.split(':')[0]: int(line.split()[1]) for line in read('/proc/meminfo').splitlines()}
    total, available = mem.get('MemTotal', 0), mem.get('MemAvailable', 0)
    gib = 1024 ** 2
    disk = shutil.disk_usage('/')
    load = ' / '.join(read('/proc/loadavg').split()[:3])
    print('  ' + paint('UP', 'cyan') + f' {days}d {hours}h {minutes}m    ' +
          paint('LOAD', 'cyan') + f' {load}    ' +
          paint('RAM', 'cyan') + f' {(total-available)/gib:.1f}/{total/gib:.1f} GiB')
    processes = sum(p.name.isdigit() for p in Path('/proc').iterdir())
    print('  ' + paint('DISK', 'cyan') + f' {disk.used/1024**3:.1f} GiB / {disk.total/1024**4:.2f} TiB ({disk.used/disk.total:.1%})    ' +
          paint('PROCESSES', 'cyan') + f' {processes}')

    gpu_snapshot_note = wake_amd_gpus()
    groups, gpus = collect_temperatures()
    print(paint('  ── Temperatures · °C ' + '─' * 60, 'muted'))
    labels = {'Package / control': 'Package', 'PHY Temperature': 'PHY', 'MAC Temperature': 'MAC',
              'Composite': 'Composite', 'Module sensor': 'Module'}
    grouped = defaultdict(list)
    for group, rows in groups.items():
        for device, sensor, value, note in rows:
            label = labels.get(sensor, sensor.replace('Sensor ', 'S'))
            grouped[(group, device)].append((label, value))
    for (group, device), sensors in grouped.items():
        if group == 'CPU':
            sensor_row('CPU', 'Ryzen 9 9950X3D2' if '9950X3D2' in cpu else device, sensors)
    for index, (pci, name, values, notes) in enumerate(gpus):
        device = name.replace('Radeon RX ', 'RX ').replace('Radeon integrated', 'Integrated')
        sensor_row(f'GPU {index}', device, [(label, values.get(key, '—'))
                   for label, key in [('Edge', 'edge'), ('Hotspot', 'junction'), ('VRAM', 'mem')]])
    memory = [(device.removeprefix('DIMM '), value) for device, _, value, _ in groups['Memory']]
    if memory:
        sensor_row('RAM', 'DIMMs', memory)
    for (group, device), sensors in grouped.items():
        if group not in ('CPU', 'Memory'):
            sensor_row({'Storage': 'SSD', 'Network': 'NIC'}.get(group, 'OTHER'), device, sensors)
    if gpu_snapshot_note:
        print('  ' + paint(gpu_snapshot_note, 'amber'))
    elif any(notes for _, _, _, notes in gpus):
        print('  ' + paint('Some GPU readings unavailable; — means unreadable or not exposed.', 'amber'))
    print(paint('  ' + '─' * 80, 'muted'))

    addresses = []
    for line in command(['ip', '-4', '-o', 'addr', 'show', 'scope', 'global']).splitlines():
        words = line.split()
        if len(words) >= 4 and not words[1].startswith(('docker', 'veth', 'br-', 'virbr')):
            addresses.append(f'{words[1]} {words[3].split("/")[0]}')
    print('  ' + paint('LAN', 'cyan') + ' ' + ' · '.join(addresses))
    print('  ' + paint('VIBETOP', 'cyan') + ' ' + paint('https://' + host + '.local/', 'white'))
    print()


if __name__ == '__main__':
    main()
