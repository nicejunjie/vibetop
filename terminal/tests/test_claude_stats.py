"""claude_stats.get_stats must memoize PER USER (home), not globally by time.

A time-only cache leaked one user's token/cost stats to another within the TTL
on a multi-user host (whoever computed last was served to whoever asked next) —
a real cross-user isolation breach. These pin the per-home keying.
"""
import claude_stats


def test_get_stats_cache_keyed_per_home(monkeypatch):
    monkeypatch.setattr(claude_stats, "_cache", {})
    calls = {}

    def fake_compute(home):
        calls[home] = calls.get(home, 0) + 1
        return {"home": home}

    monkeypatch.setattr(claude_stats, "_compute", fake_compute)

    # Each home gets its OWN result — user B never receives user A's cached data.
    assert claude_stats.get_stats("/home/alice") == {"home": "/home/alice"}
    assert claude_stats.get_stats("/home/bob") == {"home": "/home/bob"}
    # A repeat for the same home is served from that home's cache entry.
    assert claude_stats.get_stats("/home/alice") == {"home": "/home/alice"}
    # …computed exactly once per distinct home.
    assert calls == {"/home/alice": 1, "/home/bob": 1}


def test_get_stats_ttl_refreshes_per_home(monkeypatch):
    monkeypatch.setattr(claude_stats, "_cache", {})
    monkeypatch.setattr(claude_stats, "_TTL", 45)
    seq = {"/home/alice": iter([{"v": 1}, {"v": 2}])}
    monkeypatch.setattr(claude_stats, "_compute", lambda h: next(seq[h]))

    t = [1000.0]
    monkeypatch.setattr(claude_stats.time, "time", lambda: t[0])
    assert claude_stats.get_stats("/home/alice") == {"v": 1}   # computed + cached
    t[0] += 10
    assert claude_stats.get_stats("/home/alice") == {"v": 1}   # within TTL → cached
    t[0] += 40                                                 # now past the 45s TTL
    assert claude_stats.get_stats("/home/alice") == {"v": 2}   # recomputed
