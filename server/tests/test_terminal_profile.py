"""Timing monitor filtering and aggregation do not retain private log payloads."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('terminal_profile_monitor', Path(__file__).resolve().parents[2] / 'tools/terminal-profile-monitor.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def line(event, user='junjie'):
    return "2026-10-07 01:00:00 INFO clientlog user=" + user + " ua='iPhone Safari/27' guard=" + json.dumps([event]) + ' sw=[]'

def test_metrics_are_filtered_and_queries_outputs_ua_and_other_users_are_dropped():
    event = {'k':'terminal-profile','event':'first-render','path':'/t2/','boot_to_paint_ms':100,
             'terminal_text':'PRIVATE','input':'SECRET','resources':[{'path':'/t2/token','duration_ms':20}, {'path':'/secret?token=PRIVATE','duration_ms':4}]}
    rows = m.decode(line(event), 'junjie')
    assert rows[0]['device'] == 'iphone'
    assert len(rows[0]['resources']) == 1
    assert 'PRIVATE' not in json.dumps(rows)
    assert 'SECRET' not in json.dumps(rows)
    assert not m.decode(line(event, 'other'), 'junjie')
    assert not m.decode('not a log event', 'junjie')

def test_report_has_stage_percentiles_and_distinguishes_background_delay():
    rows = [{'device':'iphone','event':'socket-open','handshake_ms':n} for n in [100,200,300]]
    summary, markdown = m.report(rows, 'start', 'end', True)
    assert summary['devices']['iphone']['metrics']['handshake_ms']['median'] == 200
    assert summary['devices']['iphone']['metrics']['handshake_ms']['p95'] == 300
    assert summary['complete']
    assert 'background' in markdown

def test_viewport_trace_preserves_only_geometry_and_control_counts():
    event = {'k':'terminal-profile','event':'viewport-shift','path':'/t4/','viewport':0,'base':100,
             'following':True,'navigation_age_ms':None,'controls':{'erase_screen':2,'text':'PRIVATE'},
             'observations':[{'reason':'parsed-write','viewport':100,'base':100,'typed':'SECRET'}]}
    row = m.decode(line(event), 'junjie')[0]
    assert row['viewport'] == 0 and row['following']
    assert row['controls'] == {'erase_screen':2}
    assert 'PRIVATE' not in json.dumps(row) and 'SECRET' not in json.dumps(row)
    _, report = m.report([row], 'start', 'end', False)
    assert 'Viewport shift events: 1' in report

def test_restarting_collector_preserves_collected_events_and_original_start(tmp_path):
    import subprocess
    import sys
    import time
    event = {'device':'iphone','event':'socket-open','handshake_ms':123}
    (tmp_path/'events.jsonl').write_text(json.dumps(event)+'\n')
    (tmp_path/'summary.json').write_text(json.dumps({'started_utc':'original-start'}))
    subprocess.run([sys.executable,str(Path(m.__file__)), '--user','junjie','--output',str(tmp_path), '--until',str(time.time()-1)],check=True)
    summary=json.loads((tmp_path/'summary.json').read_text())
    assert summary['complete'] and summary['started_utc']=='original-start'
    assert summary['devices']['iphone']['metrics']['handshake_ms']['median']==123
    assert len((tmp_path/'events.jsonl').read_text().splitlines())==1


def test_report_counts_redraw_outcomes_for_the_deployed_anchor_revision():
    rows = [m.decode(line({'k': 'terminal-profile', 'event': 'reader-redraw',
                           'path': '/t4/', 'reason': 'reader-redraw-' + phase,
                           'reader_revision': 2, 'terminal_text': 'PRIVATE'}), 'junjie')[0]
            for phase in ('hold', 'resume', 'hold', 'timeout')]
    summary, markdown = m.report(rows, 'start', 'end', False)
    assert summary['reading_redraws'] == {'hold': 2, 'resume': 1, 'timeout': 1, 'fallback': 0}
    assert 'timed out: 1' in markdown
    assert 'PRIVATE' not in markdown
    assert all(r['reader_revision'] == 2 for r in rows)
