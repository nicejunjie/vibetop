"""The 7-day metrics ring: what it records, what it refuses to invent, and the
ways a fixed-size file overwritten forever can lie if you let it.

Everything here runs against a real file in tmp_path — the format IS the
contract, so a test that mocked the bytes would be testing nothing.
"""
import importlib.util
import os
import struct

import pytest

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture()
def mh():
    spec = importlib.util.spec_from_file_location(
        "metrics_history", os.path.join(_HERE, "metrics_history.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture()
def hist(mh, tmp_path):
    h = mh.History(str(tmp_path / "m" / "metrics.ring"))
    yield h
    h.close()


T0 = 1790000000 - (1790000000 % 60)        # aligned to both tiers


def _st(**kw):
    base = {"cpu_percent": 10.0, "memory_used_gb": 8.0}
    base.update(kw)
    return base


# --- size: the entire reason for the design ---------------------------------

def test_the_file_is_small_and_never_grows(mh, hist):
    """A week of history in under a megabyte, fixed at creation. If this ever
    fails, the thing that made the approach worth choosing is gone."""
    assert mh.FILE_SIZE < 1_000_000, mh.FILE_SIZE
    size = os.path.getsize(hist.path)
    now = T0
    for i in range(3000):                   # 100 minutes of 2s buckets
        hist.note(_st(cpu_percent=float(i % 100)), now)
        now += 2
        hist.tick(now)
    assert os.path.getsize(hist.path) == size == mh.FILE_SIZE


def test_it_keeps_a_full_week(mh):
    """7 days is the requirement, so state it as a number and not as a vibe."""
    coarse = [t for t in mh.TIERS if t[0] == "coarse"][0]
    assert coarse[1] * coarse[2] >= 7 * 24 * 3600


# --- recording ---------------------------------------------------------------

def test_a_bucket_is_the_mean_of_its_samples_not_the_last_one(hist):
    """Several viewers poll at once, so a bucket receives several samples. Last
    -wins would make the recorded number depend on who polled last."""
    hist.note(_st(cpu_percent=10.0), T0)
    hist.note(_st(cpu_percent=20.0), T0 + 0.5)
    hist.note(_st(cpu_percent=90.0), T0 + 1.5)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["cpu_percent"])
    got = [v for v in w["series"]["cpu_percent"] if v is not None]
    assert got == [40.0]


def test_an_open_bucket_is_not_written_yet(hist):
    hist.note(_st(cpu_percent=50.0), T0)
    assert hist.pending() is True
    hist.tick(T0 + 1)                       # same bucket still open
    w = hist.window(T0 + 1, span=10, slots=5, fields=["cpu_percent"])
    assert all(v is None for v in w["series"]["cpu_percent"])
    hist.tick(T0 + 2)
    assert hist.pending() is False


def test_a_missing_sensor_stays_missing(hist):
    """A host with no GPU must read back None, never 0.0 — the chart draws a
    gap for one and a line on the floor for the other, and only one is true."""
    hist.note(_st(gpu_power_w=None), T0)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["gpu_power_w", "cpu_percent"])
    assert all(v is None for v in w["series"]["gpu_power_w"])
    assert any(v is not None for v in w["series"]["cpu_percent"])


def test_a_real_zero_is_recorded_as_zero(hist):
    """0W from the wall plug is a measurement. Only absence is absence."""
    hist.note(_st(wall_power_w=0.0), T0)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["wall_power_w"])
    assert 0.0 in w["series"]["wall_power_w"]


def test_booleans_are_not_numbers(hist):
    """isinstance(True, int) is True in Python, and a bool in a float32 field
    would silently record 1.0% CPU."""
    hist.note({"cpu_percent": True}, T0)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["cpu_percent"])
    assert all(v is None for v in w["series"]["cpu_percent"])


def test_load_average_records_the_one_minute_figure(hist):
    hist.note({"load_avg": [1.5, 2.0, 3.0]}, T0)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["load_avg"])
    assert 1.5 in w["series"]["load_avg"]


# --- network: a counter, unlike everything else ------------------------------

def test_network_counters_become_a_rate_we_derive_ourselves(hist):
    """rx_bytes is cumulative, not a rate like the disk fields. We difference
    it against OUR previous total so the figure never depends on another
    poller's timing."""
    net = lambda rx, tx: {"network": {"eth0": {"rx_bytes": rx, "tx_bytes": tx}}}
    hist.note(net(1000, 500), T0)
    hist.tick(T0 + 2)
    hist.note(net(3000, 1500), T0 + 2)      # +2000 rx, +1000 tx over 2s
    hist.tick(T0 + 4)
    w = hist.window(T0 + 4, span=20, slots=10, fields=["net_rx_bps", "net_tx_bps"])
    assert 1000.0 in w["series"]["net_rx_bps"]
    assert 500.0 in w["series"]["net_tx_bps"]


def test_the_first_network_sample_yields_no_rate(hist):
    """With nothing to difference against there is no rate — recording the raw
    counter would draw a 3GB/s spike on the first frame after every restart."""
    hist.note({"network": {"eth0": {"rx_bytes": 10 ** 9, "tx_bytes": 10 ** 9}}}, T0)
    hist.tick(T0 + 2)
    w = hist.window(T0 + 2, span=10, slots=5, fields=["net_rx_bps"])
    assert all(v is None for v in w["series"]["net_rx_bps"])


def test_a_counter_is_not_differenced_across_a_long_gap(hist):
    """Unreachable while the recorder samples every 2s, and pinned anyway: the
    day someone makes it sample slowly when nobody is watching, differencing a
    counter over an hour would smear that hour's traffic into one 2s bucket."""
    net = lambda rx: {"network": {"eth0": {"rx_bytes": rx, "tx_bytes": rx}}}
    hist.note(net(0), T0)
    hist.note(net(10 ** 10), T0 + 3600)     # an hour later, same History object
    hist.tick(T0 + 3602)
    w = hist.window(T0 + 3602, span=20, slots=10, fields=["net_rx_bps"])
    assert all(v is None for v in w["series"]["net_rx_bps"])


def test_a_counter_that_went_backwards_is_skipped(hist):
    """An interface reset or a NIC going away, not -4GB/s of traffic."""
    net = lambda rx: {"network": {"eth0": {"rx_bytes": rx, "tx_bytes": rx}}}
    hist.note(net(10 ** 9), T0)
    hist.tick(T0 + 2)
    hist.note(net(5), T0 + 2)
    hist.tick(T0 + 4)
    w = hist.window(T0 + 4, span=20, slots=10, fields=["net_rx_bps"])
    assert all(v is None or v >= 0 for v in w["series"]["net_rx_bps"])
    assert not any(v and v < 0 for v in w["series"]["net_rx_bps"])


# --- the ring: gaps, wrap, and not inventing data ----------------------------

def test_a_gap_reads_back_as_a_gap(hist):
    """The manager was down. That must stay a hole of the right width, not get
    closed up by whatever the neighbouring slots hold."""
    hist.note(_st(cpu_percent=10.0), T0)
    hist.tick(T0 + 2)
    later = T0 + 600                        # ten minutes later
    hist.note(_st(cpu_percent=90.0), later)
    hist.tick(later + 2)
    w = hist.window(later + 2, span=620, slots=310, fields=["cpu_percent"])
    s = w["series"]["cpu_percent"]
    known = [i for i, v in enumerate(s) if v is not None]
    assert len(known) == 2, "only the two recorded buckets are known"
    assert known[1] - known[0] > 250, "and the hole between them is its real width"


def test_wrapping_does_not_resurrect_last_weeks_numbers(mh, hist):
    """The oldest slot is overwritten by the newest, and the ring index alone
    cannot tell them apart — the bucket time stored IN the slot is what does."""
    _name, step, slots = mh.TIERS[0]
    hist.note(_st(cpu_percent=99.0), T0)
    hist.tick(T0 + step)
    # Jump forward exactly one full lap, landing on the same index.
    lap = T0 + step * slots
    w = hist.window(lap + step, span=step * 4, slots=4, fields=["cpu_percent"])
    assert all(v is None for v in w["series"]["cpu_percent"]), \
        "a slot from one lap ago must not be served as if it were now"


def test_an_untouched_ring_is_empty_not_a_field_of_zeroes(hist):
    w = hist.window(T0, span=600, slots=60)
    for f, vals in w["series"].items():
        assert all(v is None for v in vals), f


def test_a_torn_slot_is_rejected_rather_than_charted(mh, hist, tmp_path):
    hist.note(_st(cpu_percent=42.0), T0)
    hist.tick(T0 + 2)
    assert 42.0 in hist.window(T0 + 2, span=10, slots=5,
                               fields=["cpu_percent"])["series"]["cpu_percent"]
    off, step, slots = mh._OFFSETS["fine"]
    idx = (T0 // step) % slots
    os.pwrite(hist._fd, b"\xde\xad\xbe\xef", off + idx * mh._SLOT.size)
    assert all(v is None for v in hist.window(T0 + 2, span=10, slots=5,
                                              fields=["cpu_percent"])["series"]["cpu_percent"])


# --- tiers -------------------------------------------------------------------

def test_a_week_wide_window_comes_from_the_coarse_ring(hist):
    """The 2s ring holds two hours. Serving a week from it would silently show
    two hours of data and five days of nothing."""
    assert hist.window(T0, span=7 * 24 * 3600, slots=60)["tier"] == "coarse"
    assert hist.window(T0, span=120, slots=60)["tier"] == "fine"
    assert hist.window(T0, span=3600, slots=60)["tier"] == "fine"


def test_the_coarse_ring_is_fed_from_completed_fine_buckets(hist):
    now = T0
    for _ in range(30):                     # one whole minute of 2s buckets
        hist.note(_st(cpu_percent=50.0), now)
        now += 2
        hist.tick(now)
    hist.tick(now + 60)                     # close the coarse bucket
    w = hist.window(now + 60, span=7 * 24 * 3600, slots=200, fields=["cpu_percent"])
    assert 50.0 in w["series"]["cpu_percent"]


def test_the_two_minute_window_lines_up_with_the_monitors_own(mh, hist):
    """The page charts 60 slots of 2s. If the fine tier could not answer that
    exactly, pre-filling the live chart would be an approximation."""
    w = hist.window(T0, span=120, slots=60)
    assert w["step"] == 2 and w["tier"] == "fine" and len(w["series"]["cpu_percent"]) == 60


# --- format changes ----------------------------------------------------------

def test_a_format_change_discards_the_old_file(mh, hist, tmp_path):
    """Reading yesterday's bytes with today's field order is worse than losing
    them: every series would be silently attributed to the wrong metric."""
    hist.note(_st(cpu_percent=42.0), T0)
    hist.tick(T0 + 2)
    hist.close()
    path = hist.path
    with open(path, "r+b") as f:            # pretend it was written by an older build
        f.write(mh._HEADER.pack(mh._MAGIC, mh._FORMAT + 1, len(mh.FIELDS), 0))
    h2 = mh.History(path)
    try:
        assert os.path.getsize(path) == mh.FILE_SIZE
        w = h2.window(T0 + 2, span=10, slots=5, fields=["cpu_percent"])
        assert all(v is None for v in w["series"]["cpu_percent"])
    finally:
        h2.close()


def test_a_truncated_file_is_rebuilt_not_read(mh, hist):
    hist.close()
    with open(hist.path, "r+b") as f:
        f.truncate(mh._HEADER.size + 10)
    h2 = mh.History(hist.path)
    try:
        assert os.path.getsize(hist.path) == mh.FILE_SIZE
    finally:
        h2.close()


def test_the_slot_layout_matches_the_declared_fields(mh):
    """The struct and FIELDS are one format; a mismatch corrupts every read."""
    assert mh._SLOT.size == 4 + 4 * len(mh.FIELDS)
    assert len(set(mh.FIELDS)) == len(mh.FIELDS)
