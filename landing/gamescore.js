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
(function () {
  var KEEP = 5;      // rows kept per board
  var SHOW = 3;      // rows displayed — a top-3 is a leaderboard; a top-10 is a spreadsheet
  var PFX = 'vibetop:scores:';
  var seq = 0;

  function read(game) {
    try {
      var raw = localStorage.getItem(PFX + game);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (_) { return {}; }
  }
  function write(game, all) {
    try { localStorage.setItem(PFX + game, JSON.stringify(all)); } catch (_) {}
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
  function seedFrom(list, key) {
    if (!key || list.length) return list;
    var v;
    try { v = parseInt(localStorage.getItem(key) || '', 10); } catch (_) { return list; }
    if (v > 0) list.push({ v: v, t: 0 });
    return list;
  }

  function listOf(o) {
    var all = read(o.game);
    var list = all[o.board || ''] || [];
    list = list.filter(function (e) { return e && typeof e.v === 'number' && isFinite(e.v); });
    list = seedFrom(list, o.seed);
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

  function injectCSS(doc) {
    if (doc.getElementById('vtsc-css')) return;
    var st = doc.createElement('style');
    st.id = 'vtsc-css';
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  window.vibeScores = {
    // Unique per played game. Pass it to record() so a game that reports more
    // than once (2048 at the 2048 tile, then again at game over) updates its own
    // row instead of filling the table with one player's single run.
    session: function () { return 'g' + (++seq) + '-' + Date.now(); },

    list: listOf,

    record: function (o) {
      var all = read(o.game);
      var key = o.board || '';
      var list = seedFrom((all[key] || []).filter(function (e) {
        return e && typeof e.v === 'number' && isFinite(e.v);
      }), o.seed);
      if (o.session) {
        list = list.filter(function (e) { return e.s !== o.session; });
      }
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
