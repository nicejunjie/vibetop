import json
import codex_stats


def test_compute_codex_usage_and_cached_cost(tmp_path):
    folder = tmp_path / ".codex/sessions/2026/09/03"
    folder.mkdir(parents=True)
    events = [
        {"timestamp":"2026-09-03T12:00:00Z","type":"turn_context",
         "payload":{"model":"gpt-5.6-sol"}},
        {"timestamp":"2026-09-03T12:01:00Z","type":"event_msg","payload":{
          "type":"token_count","info":{"last_token_usage":{
            "input_tokens":1000000,"cached_input_tokens":800000,
            "output_tokens":100000,"reasoning_output_tokens":50000}}}},
    ]
    (folder / "rollout.jsonl").write_text("\n".join(json.dumps(x) for x in events)+"\n")
    got = codex_stats._compute(str(tmp_path))
    assert got["windows"]["all"]["tokens"] == 1100000
    assert got["windows"]["all"]["cr"] == 800000
    # 200k uncached * $4 + 800k cached * $0.40 + 100k output * $20
    assert got["windows"]["all"]["cost"] == 3.12
    assert got["byModel"][0]["model"] == "gpt-5.6-sol"
    assert got["sessions"] == 1


def test_empty_codex_stats_shape(tmp_path):
    got = codex_stats._compute(str(tmp_path))
    assert len(got["byDay"]) == 30 and len(got["byHour"]) == 48
    assert got["windows"]["all"]["tokens"] == 0
