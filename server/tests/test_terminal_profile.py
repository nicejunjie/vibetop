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
