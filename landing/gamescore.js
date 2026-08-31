// gamescore.js — the one best-scores table shared by all four games
// (Minesweeper, Solitaire, 2048, Circuit Runner).
//
// Why it exists: the game-over card used to offer "New Game" and a ghost button,
// and people read that second button as a *leaderboard* ("View board" → 榜) and
// tapped it expecting a ranking. It only dismissed the card, so a real result —
// the card going away — read as "nothing happened, like I never clicked". The
// fix is to stop implying a leaderboard and just SHOW one, in the same shape, in
// every game.
//
// Everything is per-browser (localStorage). There is no server side and no
// cross-user ranking: these are *your* best runs on *this* device.
//
// Usage (a game records at game over, then renders):
//   var sess = vibeScores.session();                 // once per new game
//   var r = vibeScores.record({ game:'mine', board:'easy', value:32,
//                               lower:true, session:sess });
//   vibeScores.render(el, { game:'mine', board:'easy', lower:true,
//                           title:'Best times · Easy', unit:'s',
//                           highlight:r.entry, empty:'No cleared games yet.' });
//
// opts:
//   game     storage bucket, one per game ('mine' | 'sol' | '2048' | 'circuit')
//   board    sub-list inside the game (difficulty / variant). '' for a single list.
//   value    the number to rank (seconds, moves, points)
//   lower    true = smaller is better (times, moves); false = bigger (points)
//   session  id from session(); re-recording with the SAME id REPLACES that
//            entry, so one played game can only ever occupy one row
//   seed     legacy single-best key to import once (e.g. 'vt-2048-best')
//   unit     suffix for the number ('s', ' moves'); or fmt(v) for full control
//
// The stats layer (`vibetop:stats:<game>`) feeds the Leaderboard page, which is
// the full view of all of this — the cards only ever show a top-3 teaser:
//   vibeScores.finish('mine', 'easy', true)            // once per FINISHED game
//   vibeScores.finish('2048', '', reached2048, { tile: 2048 })
//   vibeScores.stats('mine', 'easy')  -> { n, w, cur, best, x }
//   vibeScores.reset('mine', ['vt-2048-best'])         // scores + stats + seeds
(function () {
  var KEEP = 10;     // rows kept per board — the Leaderboard page shows all of them
  var SHOW = 3;      // rows a game-over CARD shows — a top-3 teaser, not a spreadsheet
  var PFX = 'vibetop:scores:';
  var SPFX = 'vibetop:stats:';
  var seq = 0;

  function readKey(prefix, game) {
    try {
      var raw = localStorage.getItem(prefix + game);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (_) { return {}; }
  }
  function writeKey(prefix, game, all) {
    try { localStorage.setItem(prefix + game, JSON.stringify(all)); } catch (_) {}
  }
  function read(game) { return readKey(PFX, game); }
  function write(game, all) { writeKey(PFX, game, all); }

  function num(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
  // Zero-filled so every caller can read .n/.w/.cur/.best/.x without guarding.
  function statsOf(game, board) {
    var s = readKey(SPFX, game)[board || ''] || {};
    return {
      n: num(s.n), w: num(s.w), cur: num(s.cur), best: num(s.best),
      x: (s.x && typeof s.x === 'object' && !Array.isArray(s.x)) ? s.x : {}
    };
  }
  function sorter(lower) {
    return function (a, b) {
      if (a.v !== b.v) return lower ? a.v - b.v : b.v - a.v;
      return (a.t || 0) - (b.t || 0);      // ties: the older run keeps the higher rank
    };
  }
  // A pre-existing single "best" (2048 and Circuit Runner each shipped one long
  // before this table) becomes row 1 instead of being thrown away. t:0 marks it
  // as undated so the row shows no date rather than a wrong one.
  //
  // It runs ONCE per browser and WRITES the imported row, both deliberately.
  // 2048 still rewrites vt-2048-best on every move for its own header chip, so
  // an import that merely returned the value on each read would re-import the
  // score the player had just set — the table listed the same 1376 twice, once
  // dated and once not. The marker key is what makes "legacy" mean "from before
  // this table existed" instead of "whatever that key says right now".
  function migrate(o) {
    if (!o.seed) return;
    var mark = PFX + o.game + ':seeded';
    try { if (localStorage.getItem(mark)) return; } catch (_) { return; }
    var all = read(o.game), key = o.board || '', list = all[key] || [];
    var v = 0;
    try { v = parseInt(localStorage.getItem(o.seed) || '', 10) || 0; } catch (_) {}
    if (!list.length && v > 0) { all[key] = [{ v: v, t: 0 }]; write(o.game, all); }
    try { localStorage.setItem(mark, '1'); } catch (_) {}
  }

  function listOf(o) {
    migrate(o);
    var all = read(o.game);
    var list = all[o.board || ''] || [];
    list = list.filter(function (e) { return e && typeof e.v === 'number' && isFinite(e.v); });
    list.sort(sorter(!!o.lower));
    return list;
  }

  // Is this row the run that was just played? record() hands back the entry it
  // stored, but render() re-reads the list from localStorage, so the two are
  // never the same OBJECT — identity would silently never match and the
  // highlight would never appear. Match on the session id (or, without one, the
  // value+timestamp pair that record() stamped).
  function isMe(e, hl) {
    if (!hl || !e) return false;
    if (hl.s) return e.s === hl.s;
    return e.v === hl.v && e.t === hl.t;
  }

  function fmtVal(o, v) {
    if (typeof o.fmt === 'function') return o.fmt(v);
    return String(v) + (o.unit || '');
  }
  // Dates people can read at a glance. An imported legacy best (t:0) gets none.
  function fmtDate(t) {
    if (!t) return '';
    var d = new Date(t), now = new Date();
    var day = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff < 7) return diff + 'd ago';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  var CSS = '.vtsc{margin:2px 0 14px;text-align:left}' +
    '.vtsc-h{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;' +
      'color:#6b7488;margin-bottom:6px;text-align:center}' +
    '.vtsc-l{list-style:none;margin:0;padding:0}' +
    '.vtsc-l li{display:flex;align-items:baseline;gap:8px;padding:3px 8px;border-radius:6px;' +
      'font-size:13px;color:#cdd5e1;line-height:1.5}' +
    '.vtsc-l li+li{margin-top:2px}' +
    '.vtsc-r{width:1.1em;text-align:right;color:#6b7488;font-size:11px;flex:none}' +
    '.vtsc-v{font-weight:600;font-variant-numeric:tabular-nums}' +
    '.vtsc-d{margin-left:auto;font-size:11px;color:#6b7488;flex:none}' +
    '.vtsc-me{background:#241a3a;color:#e6edf3}' +
    '.vtsc-me .vtsc-r,.vtsc-me .vtsc-d{color:#b78bf0}' +
    '.vtsc-none{font-size:12px;color:#6b7488;text-align:center;margin:0}' +
    /* Same rule the cards use for their own decoration: in a window barely
       taller than the card, the buttons matter and the table does not. */
    '@media (max-height:340px){.vtsc{display:none}}';

  // ---- the in-game leaderboard panel ------------------------------------
  // Each game owns its own leaderboard — it opens inside the game, over the
  // board, exactly like that game's How-to-play card. What lives here is only
  // the part that would otherwise be copy-pasted four times: the stat chips and
  // the ranked list. Everything a leaderboard says that is SPECIFIC to a game
  // is one row of this table.
  var SPEC = {
    mine: {
      lower: true, boards: ['easy', 'medium', 'hard'],
      fmt: function (v) { return v + 's'; },
      head: function (b) { return 'Fastest times · ' + b.charAt(0).toUpperCase() + b.slice(1); },
      empty: function (b) { return 'No cleared game yet on ' + b + '.'; },
      stats: function (s) {
        return [['Played', s.n], ['Won', s.w], ['Win rate', pct(s.w, s.n)],
                ['Streak', s.cur], ['Best streak', s.best]];
      }
    },
    sol: {
      lower: true,
      fmt: function (v) { return v + ' moves'; },
      head: function () { return 'Fewest moves'; },
      empty: function () { return 'No solved deal yet.'; },
      stats: function (s) {
        return [['Deals', s.n], ['Solved', s.w], ['Win rate', pct(s.w, s.n)], ['Best streak', s.best]];
      }
    },
    '2048': {
      seed: 'vt-2048-best',
      head: function () { return 'Highest scores'; },
      empty: function () { return 'No score yet.'; },
      stats: function (s) {
        return [['Games', s.n], ['Best tile', s.x.tile || '—'], ['Reached 2048', s.w]];
      }
    },
    circuit: {
      seed: 'vibetop:circuit:best',
      head: function () { return 'Highest scores'; },
      empty: function () { return 'No score yet.'; },
      stats: function (s) {
        return [['Runs', s.n], ['Furthest sector', s.x.sector ? pad2(s.x.sector) : '—'], ['Cleared', s.w]];
      }
    }
  };
  function pct(w, n) { return n ? Math.round(w * 100 / n) + '%' : '—'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var LBCSS = '.vtlb{text-align:left}' +
    '.vtlb-s{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px;margin-bottom:14px}' +
    '.vtlb-c{background:#0e1117;border:1px solid #2a3040;border-radius:8px;padding:6px 8px;text-align:center}' +
    '.vtlb-c b{display:block;font:600 9px system-ui,sans-serif;letter-spacing:.08em;' +
      'text-transform:uppercase;color:#6b7488;margin-bottom:2px;white-space:nowrap}' +
    '.vtlb-c i{display:block;font:600 15px ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'font-style:normal;color:#e6edf3;font-variant-numeric:tabular-nums}' +
    '.vtlb-h{font:600 10px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;' +
      'color:#6b7488;margin:0 2px 6px}' +
    '.vtlb-l{list-style:none;margin:0;padding:0}' +
    '.vtlb-l li{display:flex;align-items:baseline;gap:9px;padding:7px 10px;border-radius:8px;' +
      'background:#0e1117;border:1px solid #2a3040;font-size:13.5px;color:#cdd5e1}' +
    '.vtlb-l li+li{margin-top:4px}' +
    '.vtlb-l .r{width:1.5em;flex:none;text-align:right;color:#6b7488;' +
      'font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace}' +
    '.vtlb-l .v{font-weight:650;color:#e6edf3;font-variant-numeric:tabular-nums}' +
    '.vtlb-l .d{margin-left:auto;flex:none;font-size:11px;color:#6b7488}' +
    '.vtlb-l li.p1{border-color:#8a4adb;background:#1c1430}' +
    '.vtlb-l li.p1 .r,.vtlb-l li.p2 .r,.vtlb-l li.p3 .r{color:#b78bf0}' +
    '.vtlb-e{font-size:12.5px;color:#8a94a6;text-align:center;padding:14px 8px;' +
      'border:1px dashed #2a3040;border-radius:9px;margin:0}';

  function injectCSS(doc) {
    if (doc.getElementById('vtsc-css')) return;
    var st = doc.createElement('style');
    st.id = 'vtsc-css';
    st.textContent = CSS + LBCSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  window.vibeScores = {
    // Unique per played game. Pass it to record() so a game that reports more
    // than once (2048 at the 2048 tile, then again at game over) updates its own
    // row instead of filling the table with one player's single run.
    session: function () { return 'g' + (++seq) + '-' + Date.now(); },

    list: listOf,

    // Import a pre-table single best, once. Games call this at STARTUP, while
    // the legacy key still holds a score from before this table existed — 2048
    // and Circuit rewrite that key as you play, so importing it later would
    // import the run in progress.
    migrate: function (o) { migrate(o); },

    record: function (o) {
      migrate(o);
      var all = read(o.game);
      var key = o.board || '';
      var list = (all[key] || []).filter(function (e) {
        return e && typeof e.v === 'number' && isFinite(e.v);
      });
      if (o.session) {
        list = list.filter(function (e) { return e.s !== o.session; });
      }
      // An undated row is the legacy import; if this run matches it exactly,
      // they are the same achievement counted twice — keep the dated one.
      list = list.filter(function (e) { return !(!e.t && e.v === o.value); });
      var entry = { v: o.value, t: Date.now() };
      if (o.session) entry.s = o.session;
      list.push(entry);
      list.sort(sorter(!!o.lower));
      list = list.slice(0, KEEP);
      all[key] = list;
      write(o.game, all);
      var rank = list.indexOf(entry) + 1;      // 0 = did not make the table
      return { rank: rank, entry: rank ? entry : null, list: list };
    },

    // Call once per FINISHED game — not per new game. Counting at the start
    // inflates the total with every app open; counting at the end means "games
    // played" is games you actually saw through. `extra` fields are merged with
    // a max rule (best 2048 tile, furthest Circuit sector), so a worse run
    // never walks a high-water mark back.
    finish: function (game, board, won, extra) {
      var all = readKey(SPFX, game);
      var key = board || '';
      var s = statsOf(game, key);
      s.n += 1;
      if (won) { s.w += 1; s.cur += 1; if (s.cur > s.best) s.best = s.cur; }
      else s.cur = 0;
      if (extra) {
        for (var k in extra) {
          if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
          var v = extra[k];
          if (typeof v !== 'number' || !isFinite(v)) continue;
          if (!(num(s.x[k]) > v)) s.x[k] = v;
        }
      }
      all[key] = s;
      writeKey(SPFX, game, all);
      return s;
    },

    stats: statsOf,

    // Wipes one game completely: every board's scores AND its stats. The legacy
    // single-best keys go too, or the next list() would re-import the score the
    // user just asked to forget.
    reset: function (game, seeds) {
      try {
        localStorage.removeItem(PFX + game);
        localStorage.removeItem(PFX + game + ':seeded');
        localStorage.removeItem(SPFX + game);
        (seeds || []).forEach(function (k) { localStorage.removeItem(k); });
      } catch (_) {}
    },

    // The game's own leaderboard: stat chips + the full ranked list, drawn into
    // an element the GAME owns (its leaderboard card). Returns the row count.
    panel: function (el, game, board) {
      if (!el) return 0;
      var g = SPEC[game];
      if (!g) return 0;
      var doc = el.ownerDocument || document;
      injectCSS(doc);
      board = board || '';
      el.className = 'vtlb';
      el.textContent = '';

      var sw = doc.createElement('div');
      sw.className = 'vtlb-s';
      g.stats(statsOf(game, board)).forEach(function (r) {
        var c = doc.createElement('div'); c.className = 'vtlb-c';
        var b = doc.createElement('b'); b.textContent = r[0];
        var i = doc.createElement('i'); i.textContent = String(r[1]);
        c.appendChild(b); c.appendChild(i); sw.appendChild(c);
      });
      el.appendChild(sw);

      var h = doc.createElement('div');
      h.className = 'vtlb-h';
      h.textContent = g.head(board);
      el.appendChild(h);

      var list = listOf({ game: game, board: board, lower: g.lower, seed: g.seed });
      if (!list.length) {
        var p = doc.createElement('p');
        p.className = 'vtlb-e';
        p.textContent = g.empty(board);
        el.appendChild(p);
        return 0;
      }
      var ol = doc.createElement('ol');
      ol.className = 'vtlb-l';
      list.forEach(function (e, i) {
        var li = doc.createElement('li');
        if (i < 3) li.className = 'p' + (i + 1);
        var r = doc.createElement('span'); r.className = 'r'; r.textContent = String(i + 1);
        var v = doc.createElement('span'); v.className = 'v';
        v.textContent = g.fmt ? g.fmt(e.v) : String(e.v);
        var d = doc.createElement('span'); d.className = 'd'; d.textContent = fmtDate(e.t);
        li.appendChild(r); li.appendChild(v); li.appendChild(d);
        ol.appendChild(li);
      });
      el.appendChild(ol);
      return list.length;
    },

    // The legacy key a game seeded from, so its Reset can take that with it.
    seedOf: function (game) { return SPEC[game] && SPEC[game].seed ? [SPEC[game].seed] : []; },

    // Renders into `el` (replacing its content). Returns the number of rows.
    // With no scores at all it prints one muted line rather than an empty box —
    // the table has to say *something*, or we are back to "I clicked and
    // nothing happened".
    render: function (el, o) {
      if (!el) return 0;
      var doc = el.ownerDocument || document;
      injectCSS(doc);
      var list = listOf(o).slice(0, SHOW);
      el.className = 'vtsc';
      el.textContent = '';
      var h = doc.createElement('div');
      h.className = 'vtsc-h';
      h.textContent = o.title || 'Best';
      el.appendChild(h);
      if (!list.length) {
        var p = doc.createElement('p');
        p.className = 'vtsc-none';
        p.textContent = o.empty || 'No scores yet.';
        el.appendChild(p);
        return 0;
      }
      var ol = doc.createElement('ol');
      ol.className = 'vtsc-l';
      list.forEach(function (e, i) {
        var li = doc.createElement('li');
        var me = isMe(e, o.highlight);
        if (me) li.className = 'vtsc-me';
        var r = doc.createElement('span'); r.className = 'vtsc-r'; r.textContent = String(i + 1);
        var v = doc.createElement('span'); v.className = 'vtsc-v'; v.textContent = fmtVal(o, e.v);
        var d = doc.createElement('span'); d.className = 'vtsc-d';
        d.textContent = me ? 'just now' : fmtDate(e.t);
        li.appendChild(r); li.appendChild(v); li.appendChild(d);
        ol.appendChild(li);
      });
      el.appendChild(ol);
      return list.length;
    }
  };
})();
