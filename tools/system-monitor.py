#!/usr/bin/env python3
"""Live system and temperature monitor, based on the vibetop login banner."""
import argparse
import contextlib
import io
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
import time
import select
import termios
import tty

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
        candidate = Path('/opt/soft/rocm/bin/amd-smi')
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



def cpu_ticks():
    return list(map(int, read('/proc/stat').splitlines()[0].split()[1:9]))


def cpu_usage(before, after):
    total = sum(after) - sum(before)
    idle = sum(after[3:5]) - sum(before[3:5])
    return max(0, min(100, 100 * (1 - idle / total))) if total > 0 else 0


def gpu_usage():
    # Sample every card before waking GPUs for temperature queries.
    values = {}
    for card in (SYS / 'class/drm').glob('card*'):
        if not re.fullmatch(r'card\d+', card.name):
            continue
        device = card / 'device'
        value = read(device / 'gpu_busy_percent')
        values[device.resolve().name] = value + '%' if value.isdigit() else '—'
    return values


def number(path):
    try:
        return int(read(path))
    except ValueError:
        return None


def gpu_details():
    result = {}
    for card in (SYS / 'class/drm').glob('card*'):
        if not re.fullmatch(r'card\d+', card.name):
            continue
        dev = card / 'device'
        used, total = number(dev / 'mem_info_vram_used'), number(dev / 'mem_info_vram_total')
        power, fans = None, []
        for hw in sorted((dev / 'hwmon').glob('hwmon*')):
            for field in ('power1_average', 'power1_input'):
                power = number(hw / field)
                if power is not None:
                    break
            for fan in sorted(hw.glob('fan*_input')):
                rpm = number(fan)
                if rpm is not None:
                    fans.append(str(rpm))
        result[dev.resolve().name] = (
            f'{power / 1e6:.1f} W' if power is not None else '— W',
            f'{used / 2**30:5.1f} / {total / 2**30:5.1f} GiB' if used is not None and total is not None else '—',
            '/'.join(fans) + ' RPM' if fans else '— RPM')
    return result


def counters():
    net, disks, processes = {}, {}, {}
    for line in read('/proc/net/dev').splitlines()[2:]:
        name, values = line.split(':', 1)
        name, fields = name.strip(), values.split()
        if name == 'lo' or name.startswith(('veth', 'docker', 'br-', 'virbr')):
            continue
        net[name] = (int(fields[0]), int(fields[8]))
    for line in read('/proc/diskstats').splitlines():
        fields = line.split()
        name = fields[2]
        dev = SYS / 'class/block' / name
        if not (dev / 'device').exists() or (dev / 'partition').exists():
            continue
        disks[name] = (int(fields[5]) * 512, int(fields[9]) * 512)
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        stat = read(entry / 'stat')
        try:
            end = stat.rindex(')')
            fields = stat[end + 2:].split()
            # PID + start time avoids attributing a recycled PID's old CPU time.
            key = (int(entry.name), int(fields[19]))
            processes[key] = (int(fields[11]) + int(fields[12]), stat[stat.index('(') + 1:end])
        except (ValueError, IndexError):
            continue
    return {'at': time.monotonic(), 'cpu': cpu_ticks(), 'net': net, 'disk': disks, 'processes': processes}


def rates(before, after, elapsed):
    return {name: tuple((new - old) / elapsed if new >= old else None
                        for old, new in zip(before[name], values))
            for name, values in after.items() if name in before} if elapsed > 0 else {}


def top_processes(before, after):
    total = sum(after['cpu']) - sum(before['cpu'])
    ranked = []
    for key, (ticks, name) in after['processes'].items():
        old = before['processes'].get(key)
        if old is not None and total > 0 and ticks >= old[0]:
            ranked.append((100 * (ticks - old[0]) / total, key[0], name))
    return sorted(ranked, reverse=True)[:3]


def throughput(value):
    if value is None:
        return '       —'
    for unit in ('B/s', 'KiB/s', 'MiB/s', 'GiB/s'):
        if value < 1024 or unit == 'GiB/s':
            return f'{value:7.1f} {unit:<5}'
        value /= 1024


def pressure():
    for line in read('/proc/pressure/memory').splitlines():
        if line.startswith('some '):
            values = dict(part.split('=') for part in line.split()[1:])
            return values.get('avg10', '—') + '%'
    return '—'


def block(title):
    print()
    print(paint(('─ ' + title + ' ').ljust(WIDTH, '─'), 'cyan'))


def table(headers, rows, widths, left=(0,)):
    # Keep column boundaries stable as numbers change; shrink text on narrow TTYs.
    widths = list(widths)
    overflow = sum(widths) + 2 * (len(widths) - 1) - WIDTH
    for column in left:
        shrink = min(max(0, overflow), max(0, widths[column] - 8))
        widths[column] -= shrink
        overflow -= shrink
    def row(values):
        cells = []
        for i, (value, width) in enumerate(zip(values, widths)):
            text = str(value)
            text = ''.join(c if c.isprintable() else '?' for c in text)
            if len(text) > width:
                text = text[:width - 1] + '…'
            cells.append(text.ljust(width) if i in left else text.rjust(width))
        return '  '.join(cells)
    print(paint(row(headers), 'muted'))
    for values in rows:
        print(row(values))


def show(percent, usage, note, before, after):
    global WIDTH
    WIDTH = min(112, max(60, shutil.get_terminal_size((112, 40)).columns - 1))
    print(paint(f'{socket.gethostname()}  ·  SYSTEM MONITOR', 'white'))
    print(paint(f'{datetime.now().astimezone():%Y-%m-%d %H:%M:%S %Z}  ·  Ctrl-C to exit  ·  — unavailable', 'muted'))
    memory = {line.split(':')[0]: int(line.split()[1]) for line in read('/proc/meminfo').splitlines()}
    total, available = memory.get('MemTotal', 0), memory.get('MemAvailable', 0)
    swap_total, swap_free = memory.get('SwapTotal', 0), memory.get('SwapFree', 0)
    delta = sum(after['cpu']) - sum(before['cpu'])
    iowait = max(0, after['cpu'][4] - before['cpu'][4]) / delta * 100 if delta > 0 else 0
    groups, gpus = collect_temperatures()
    details = gpu_details()

    block('CPU')
    loads = read('/proc/loadavg').split()[:3]
    table(['Usage', 'I/O wait', 'Load 1m', 'Load 5m', 'Load 15m'],
          [[f'{percent:.1f}%', f'{iowait:.1f}%', *loads]], [10, 10, 10, 10, 10], left=())
    cpu_temps = [(sensor.replace('Package / control', 'Package'), value.replace(' °C', '°C'))
                 for _, sensor, value, _ in groups['CPU']]
    if cpu_temps:
        print('  '.join(f'{label} {value:>7}' for label, value in cpu_temps))

    block('MEMORY · GiB')
    table(['Memory', 'Used', 'Usable total', 'Available'], [
        ['RAM', f'{(total-available)/1048576:.1f}', f'{total/1048576:.1f}', f'{available/1048576:.1f}'],
        ['Swap', f'{(swap_total-swap_free)/1048576:.1f}', f'{swap_total/1048576:.1f}', f'{swap_free/1048576:.1f}']],
        [20, 10, 14, 12])
    print(f'Memory stalls over 10s: {pressure():>7}')

    block('GPU')
    gpu_rows, temp_rows = [], []
    for index, (pci, name, values, notes) in enumerate(sorted(gpus), 1):
        name = name.replace('Radeon RX ', 'RX ').replace('Radeon integrated', 'Integrated')
        watts, vram, fans = details.get(pci, ('— W', '—', '— RPM'))
        gpu_rows.append([f'GPU {index} {name}', usage.get(pci, '—'), watts, vram.replace(' GiB', '')])
        temp_rows.append([f'GPU {index}', *[values.get(k, '—').replace(' °C', '') for k in ('edge', 'junction', 'mem')], fans.replace(' RPM', '')])
    table(['Device', 'Usage', 'Power', 'VRAM used/total GiB'], gpu_rows, [28, 7, 9, 19])
    print()
    table(['Temperature / fan', 'Edge °C', 'Hotspot °C', 'VRAM °C', 'Fan RPM'],
          temp_rows, [22, 8, 10, 8, 8])

    elapsed = after['at'] - before['at']
    disk_rates = rates(before['disk'], after['disk'], elapsed)
    net_rates = rates(before['net'], after['net'], elapsed)
    block('STORAGE · transfer rates')
    table(['Disk', 'Read', 'Write'],
          [[name, *[throughput(v) for v in disk_rates.get(name, (None, None))]]
           for name in sorted(after['disk'])], [24, 16, 16])
    block('NETWORK · transfer rates')
    table(['Interface', 'Receive ↓', 'Send ↑', 'Link'],
          [[name, *[throughput(v) for v in net_rates.get(name, (None, None))],
            read(SYS / 'class/net' / name / 'operstate', 'unknown')]
           for name in sorted(after['net'])], [20, 16, 16, 8], left=(0, 3))

    block('OTHER TEMPERATURES · °C')
    sensors = defaultdict(list)
    for group, rows in groups.items():
        if group == 'CPU':
            continue
        for device, sensor, value, _ in rows:
            label = {'Module sensor': 'Module', 'PHY Temperature': 'PHY', 'MAC Temperature': 'MAC'}.get(sensor, sensor.replace('Sensor ', 'S'))
            sensors[device].append(f'{label} {value.replace(" °C", ""):>5}')
    table(['Device', 'Sensors'], [[device, '  '.join(values)] for device, values in sensors.items()],
          [20, max(36, WIDTH - 22)], left=(0, 1))
    fans = []
    for hw in sorted((SYS / 'class/hwmon').glob('hwmon*')):
        if read(hw / 'name') == 'amdgpu':
            continue
        for fan in sorted(hw.glob('fan*_input')):
            value = number(fan)
            if value is not None:
                label = read(fan.with_name(fan.name.replace('_input', '_label')), fan.stem)
                fans.append([read(hw / 'name') + ' ' + label, str(value)])
    if fans:
        block('OTHER FANS')
        table(['Fan', 'RPM'], fans, [30, 10])
    block('TOP PROCESSES · CPU % of whole machine')
    table(['Process', 'PID', 'CPU'], [[name, pid, f'{pct:.1f}%'] for pct, pid, name in top_processes(before, after)],
          [32, 10, 10])
    if note:
        print('\n' + paint(note, 'amber'))


ANSI = re.compile(r'(\x1b\[[0-9;?]*[A-Za-z])')


def highlight_changes(current, previous):
    """Compare visible character positions, ignoring existing color escapes."""
    if previous is None:
        return current
    old_lines = ANSI.sub('', previous).splitlines()
    output = []
    for row, line in enumerate(current.splitlines(keepends=True)):
        old = old_lines[row] if row < len(old_lines) else ''
        column = 0
        for part in ANSI.split(line):
            if ANSI.fullmatch(part):
                output.append(part)
                continue
            for char in part:
                changed = char != '\n' and (column >= len(old) or char != old[column])
                output.append('\033[7m' + char + '\033[27m' if changed else char)
                column += 1
    return ''.join(output)


def positive_interval(value):
    number = float(value)
    if not 0.5 <= number <= 3600:
        raise argparse.ArgumentTypeError('interval must be between 0.5 and 3600 seconds')
    return number


def main():
    global COLOR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='print a single snapshot and exit')
    parser.add_argument('-n', '--interval', type=positive_interval, default=1, help='refresh seconds; changed characters highlighted (default: 1)')
    parser.add_argument('--color', choices=('auto', 'always', 'never'), default='auto')
    args = parser.parse_args()
    interactive = sys.stdout.isatty() and os.environ.get('TERM') != 'dumb'
    COLOR = args.color == 'always' or (args.color == 'auto' and interactive and 'NO_COLOR' not in os.environ)
    once = args.once or not interactive
    previous = None
    scroll = 0
    terminal_settings = None
    before = counters()
    time.sleep(0.5)
    try:
        if not once:
            if sys.stdin.isatty():
                terminal_settings = termios.tcgetattr(sys.stdin)
                tty.setcbreak(sys.stdin.fileno())
            print('\033[?1049h\033[?25l', end='', flush=True)
        while True:
            start = time.monotonic()
            after = counters()
            percent = cpu_usage(before['cpu'], after['cpu'])
            usage = gpu_usage()
            note = wake_amd_gpus()
            if not once:
                print('\033[H\033[2J', end='')
            frame = io.StringIO()
            with contextlib.redirect_stdout(frame):
                show(percent, usage, note, before, after)
            current = frame.getvalue()
            if once:
                print(current, end='')
            else:
                lines = highlight_changes(current, previous).splitlines()
                height = shutil.get_terminal_size((112, 40)).lines
                available = max(1, height - 4)
                body = lines[2:]
                scroll = min(scroll, max(0, len(body) - available))
                visible = lines[:2] + body[scroll:scroll + available]
                footer = f'↑/↓ or j/k scroll · PgUp/PgDn · q quit   {scroll+1}–{min(len(body), scroll+available)}/{len(body)}'
                print('\n'.join(visible) + '\n' + paint(footer[:WIDTH], 'muted'), end='')
            previous = current
            before = after
            sys.stdout.flush()
            if once:
                break
            remaining = max(0, args.interval - (time.monotonic() - start))
            if terminal_settings is None:
                time.sleep(remaining)
            elif select.select([sys.stdin], [], [], remaining)[0]:
                key = os.read(sys.stdin.fileno(), 64).decode(errors='ignore')
                if 'q' in key:
                    break
                if '\x1b[B' in key or 'j' in key:
                    scroll += 1
                if '\x1b[A' in key or 'k' in key:
                    scroll = max(0, scroll - 1)
                if '\x1b[6~' in key:
                    scroll += available
                if '\x1b[5~' in key:
                    scroll = max(0, scroll - available)
    except KeyboardInterrupt:
        pass
    finally:
        if terminal_settings is not None:
            termios.tcsetattr(sys.stdin, termios.TCSADRAIN, terminal_settings)
        if not once:
            print('\033[?25h\033[?1049l', end='', flush=True)


if __name__ == '__main__':
    main()
