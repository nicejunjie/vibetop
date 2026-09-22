"""Seven days of system metrics in a fixed-size file that never grows.

The Monitor opens blank and takes two minutes to draw a line, because every
series is built from whatever arrived since the page loaded. Wall power is the
exception — it reconstructs from the plug's own buffer, which is why that one
row is populated the instant you open it. This gives every other series the
same property, and keeps a week of it.

WHAT IS AND IS NOT KEPT
    Only scalars. The top-process list is 84% of the status payload and ~90% of
    its CPU (measured on z20: 11.3ms and 4KB per scan, against 1.3ms and 722B
    for everything else), and a snapshot of process NAMES is also the least
    useful thing to have a week later. Sixteen numbers are.

SIZE, WHICH IS THE WHOLE POINT
    Two ring buffers, allocated once and overwritten forever:
        fine    2s x 2h  =  3600 slots
        coarse 60s x 7d  = 10080 slots
    At 68 bytes a slot (uint32 bucket time + 16 float32) that is ~930KB TOTAL,
    fixed, for the entire week. Nothing to prune, nothing to rotate, no way for
    it to surprise anyone in six months. A naive "append the JSON payload every
    2s" would have been 74GB a year.

WHY A SLOT CARRIES ITS OWN TIMESTAMP
    A ring's index is derived from time (`t // step % slots`), so a slot's
    identity is implied by where it sits — but only if it was actually written
    for the bucket we are asking about. Storing the bucket start IN the slot and
    checking it on read is what makes every other case fall out for free:
    a slot never written since the file was created, a gap while the manager was
    down, the wrap from a week ago, and a torn write (garbage time, rejected).
    There is no separate "valid" flag because there does not need to be one.

DURABILITY
    Samples are written with pwrite and never fsync'd — 43k writes a day is not
    worth the syscalls for a chart, and a crash costs at most the last bucket.
    The format version is in the header: change FIELDS and the old file is
    discarded rather than reinterpreted, because reading yesterday's bytes with
    today's field order is worse than losing them.
"""
import os
import struct

# Ordered, and the order is part of the on-disk format — see _FORMAT. Append
# only at the end, and bump _FORMAT when you do.
FIELDS = (
    "cpu_percent", "cpu_temp", "cpu_power_w",
    "gpu_percent", "gpu_temp", "gpu_power_w", "gpu_vram_used_gb",
    "memory_used_gb", "disk_used_gb",
    "disk_read_bytes", "disk_write_bytes",     # already rates (B/s)
    "net_rx_bps", "net_tx_bps",                # derived here; see History.note
    "load_avg", "wall_power_w", "terminals_running",
)

_FORMAT = 1
_MAGIC = b"VTMETRIC"
_HEADER = struct.Struct("<8sHHI")          # magic, format, n_fields, reserved
_SLOT = struct.Struct("<I" + "f" * len(FIELDS))
_NAN = float("nan")

# (name, step seconds, slots). Fine covers the Monitor's own 2s window exactly,
# so opening the page can pre-fill it point for point instead of approximating.
TIERS = (("fine", 2, 3600), ("coarse", 60, 10080))


def _tier_offsets():
    off, out = _HEADER.size, {}
    for name, step, slots in TIERS:
        out[name] = (off, step, slots)
        off += slots * _SLOT.size
    return out, off


_OFFSETS, FILE_SIZE = _tier_offsets()


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


class History:
    """The ring file plus the in-memory accumulator feeding it.

    Not thread-safe on its own; the manager holds one lock around note()/tick()
    because note() is called from request threads and tick() from a timer."""

    def __init__(self, path):
        self.path = path
        self._fd = None
        self._fine = {}        # bucket start -> {field: [values]}
        self._coarse = {}      # bucket start -> {field: [values]}
        self._prev_net = None  # (t, rx_total, tx_total) for the rate we derive
        self._open()

    # ---- file -------------------------------------------------------------
    def _open(self):
        want = _HEADER.pack(_MAGIC, _FORMAT, len(FIELDS), 0)
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
        except OSError:
            pass
        fresh = True
        if os.path.exists(self.path):
            try:
                with open(self.path, "rb") as f:
                    head = f.read(_HEADER.size)
                fresh = head != want or os.path.getsize(self.path) != FILE_SIZE
            except OSError:
                fresh = True
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        if fresh:
            # Allocate the whole ring up front. Every slot then reads back as a
            # zero bucket time, which no real bucket can equal, so an untouched
            # ring is "nothing known" rather than a field of zero watts.
            os.ftruncate(fd, 0)
            os.pwrite(fd, want, 0)
            blank = _SLOT.pack(0, *([_NAN] * len(FIELDS)))
            for _name, (off, _step, slots) in _OFFSETS.items():
                os.pwrite(fd, blank * slots, off)
        self._fd = fd

    def close(self):
        if self._fd is not None:
            try:
                os.close(self._fd)
            finally:
                self._fd = None

    def _put(self, tier, bucket, values):
        off, step, slots = _OFFSETS[tier]
        idx = (bucket // step) % slots
        row = [values.get(f) for f in FIELDS]
        packed = _SLOT.pack(bucket, *[_NAN if v is None else float(v) for v in row])
        os.pwrite(self._fd, packed, off + idx * _SLOT.size)

    def _get(self, tier, bucket, blob=None):
        """The stored row for `bucket`, or None if this slot is not it."""
        off, step, slots = _OFFSETS[tier]
        idx = (bucket // step) % slots
        if blob is None:
            raw = os.pread(self._fd, _SLOT.size, off + idx * _SLOT.size)
        else:
            raw = blob[idx * _SLOT.size:(idx + 1) * _SLOT.size]
        if len(raw) != _SLOT.size:
            return None
        vals = _SLOT.unpack(raw)
        if vals[0] != bucket:          # never written, wrapped, or torn
            return None
        return [None if v != v else v for v in vals[1:]]     # NaN -> None

    def _read_tier(self, tier):
        """The whole ring in one read. A week-wide window touches every slot;
        doing that a slot at a time is ~10k syscalls for 686KB that the page
        cache already holds."""
        off, _step, slots = _OFFSETS[tier]
        return os.pread(self._fd, slots * _SLOT.size, off)

    # ---- writing ----------------------------------------------------------
    def note(self, status, now):
        """Fold one /api/system/status payload into the current 2s bucket.

        Called from the request path, so this must stay arithmetic only.
        Several viewers polling at once simply contribute several samples to
        the same bucket, which is why a bucket is a MEAN and not the last
        value — otherwise the recorded number would depend on who happened to
        poll last."""
        if not isinstance(status, dict):
            return
        vals = {}
        for f in FIELDS:
            v = status.get(f)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                vals[f] = float(v)
        la = status.get("load_avg")
        if isinstance(la, (list, tuple)) and la and isinstance(la[0], (int, float)):
            vals["load_avg"] = float(la[0])
        # The network figures are cumulative counters, not rates like the disk
        # ones. We difference them HERE, against our own previous total, so the
        # rate never depends on another poller's timing — the same reason the
        # plug's history keeps its own clock.
        net = status.get("network")
        if isinstance(net, dict):
            rx = tx = 0
            for v in net.values():
                if isinstance(v, dict):
                    rx += v.get("rx_bytes") or 0
                    tx += v.get("tx_bytes") or 0
            if self._prev_net:
                pt, prx, ptx = self._prev_net
                dt = now - pt
                # A counter that went backwards means the interface reset or
                # went away; skip the sample rather than record a huge negative.
                if 0 < dt <= 600 and rx >= prx and tx >= ptx:
                    vals["net_rx_bps"] = (rx - prx) / dt
                    vals["net_tx_bps"] = (tx - ptx) / dt
            self._prev_net = (now, rx, tx)
        if not vals:
            return
        bucket = int(now) // TIERS[0][1] * TIERS[0][1]
        acc = self._fine.setdefault(bucket, {})
        for k, v in vals.items():
            acc.setdefault(k, []).append(v)

    def tick(self, now):
        """Flush every bucket that has closed. Returns the buckets written."""
        fine_step = TIERS[0][1]
        coarse_step = TIERS[1][1]
        cur = int(now) // fine_step * fine_step
        done = sorted(b for b in self._fine if b < cur)
        for b in done:
            means = {k: _mean(v) for k, v in self._fine.pop(b).items()}
            means = {k: v for k, v in means.items() if v is not None}
            if not means:
                continue
            self._put("fine", b, means)
            cb = b // coarse_step * coarse_step
            acc = self._coarse.setdefault(cb, {})
            for k, v in means.items():
                acc.setdefault(k, []).append(v)
        cur_coarse = int(now) // coarse_step * coarse_step
        for cb in sorted(b for b in self._coarse if b < cur_coarse):
            means = {k: _mean(v) for k, v in self._coarse.pop(cb).items()}
            means = {k: v for k, v in means.items() if v is not None}
            if means:
                self._put("coarse", cb, means)
        return done

    def pending(self, bucket=None):
        """Whether `bucket` has any sample yet (any open bucket if None).

        The ticker asks about ONE bucket, not "is anything open": with 2s
        buckets and a 2s poll those are different questions, and answering the
        loose one leaves holes. See _hist_loop."""
        if bucket is None:
            return bool(self._fine)
        return bucket in self._fine

    # ---- reading ----------------------------------------------------------
    def window(self, now, span, slots, fields=None):
        """`slots` evenly spaced points covering the last `span` seconds.

        Returns {t0, step, series:{field:[...]}} with None wherever nothing is
        known, so a gap stays a gap — the same contract the wall series uses,
        and for the same reason: an outage must be visible as a hole of the
        right width, not closed up by drawing straight through it."""
        want = [f for f in (fields or FIELDS) if f in FIELDS]
        step = max(TIERS[0][1], int(span) // max(1, int(slots)))
        step = step // TIERS[0][1] * TIERS[0][1]          # keep it a fine multiple
        t_end = int(now) // step * step
        t0 = t_end - (slots - 1) * step
        # The finest tier that both resolves this step AND reaches back far
        # enough. A 7-day span cannot come from a 2-hour ring, and asking a
        # 60s ring for 2s detail would invent detail it does not have.
        tier = TIERS[-1][0]
        for name, tstep, tslots in TIERS:
            if tstep <= step and tslots * tstep >= span:
                tier = name
                break
        _off, tstep, _slots = _OFFSETS[tier]
        blob = self._read_tier(tier)
        out = {f: [] for f in want}
        idx = {f: FIELDS.index(f) for f in want}
        for k in range(slots):
            lo = t0 + k * step
            rows = []
            for t in range(lo, lo + step, tstep):
                r = self._get(tier, t // tstep * tstep, blob)
                if r is not None:
                    rows.append(r)
            for f in want:
                i = idx[f]
                out[f].append(_round(_mean([r[i] for r in rows])))
        return {"t0": t0, "step": step, "tier": tier, "series": out}


def _round(v):
    if v is None:
        return None
    return round(v, 2) if abs(v) < 1000 else round(v)
