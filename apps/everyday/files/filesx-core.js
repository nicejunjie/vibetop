/* Files (native) — the pure half.
 *
 * Path arithmetic, name formatting and type classification, with every piece of
 * app state passed in rather than closed over. No DOM, no fetch, no storage:
 * that rule is what makes this file testable, and it is the only rule here.
 *
 * Why only this much. The interaction layer in filesx.html (verbs, selection,
 * the context menu, the editor, the layout engine) is BOTH the part still
 * moving — Files-native Phase 4b, retiring FileBrowser, has not started and is
 * gated on adoption — and the part a unit test cannot reach. Extracting it now
 * would churn code that is about to change. These helpers are the settled part;
 * they were last touched at the end of August and 4b will not reshape them.
 *
 * filesx.html keeps thin wrappers over these so its ~200 call sites read exactly
 * as they did. Load order: this tag comes before the page's own <script>.
 */
(function (root) {
  'use strict';

  // Office formats OnlyOffice will open. MUST stay in step with OFFICE_RE in
  // server/terminal-manager.py — the client decides whether to offer "Edit in
  // Office" and the server decides whether to serve it; disagree and a file
  // either offers an action that 404s or hides one that would have worked.
  // filesx-core.test.js asserts the two lists are identical.
  var OFF_RE = /\.(docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|ppsx?|ppsm|potx?|potm|odt|ods|odp|ott|ots|otp|rtf|csv|tsv)$/i;
  var IMG_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|heic|heif|tiff?)$/i;
  var VID_RE = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|ogv|mpg|mpeg|ts|m2ts|3gp)$/i;
  var AUD_RE = /\.(mp3|wav|flac|ogg|m4a|aac|opus|wma)$/i;
  var ARC_RE = /\.(zip|tar|gz|tgz|xz|bz2|7z|rar|zst)$/i;

  var KIND_MAP = {
    png: 'PNG image', jpg: 'JPEG image', jpeg: 'JPEG image', gif: 'GIF image',
    webp: 'WebP image', svg: 'SVG image', heic: 'HEIC image', bmp: 'Bitmap image',
    tif: 'TIFF image', tiff: 'TIFF image', ico: 'Icon image', avif: 'AVIF image',
    mp4: 'MPEG-4 video', mkv: 'Matroska video', mov: 'QuickTime video',
    avi: 'AVI video', webm: 'WebM video',
    mp3: 'MP3 audio', flac: 'FLAC audio', wav: 'WAV audio', m4a: 'M4A audio', ogg: 'Ogg audio',
    pdf: 'PDF document', doc: 'Word document', docx: 'Word document',
    xls: 'Excel spreadsheet', xlsx: 'Excel spreadsheet',
    ppt: 'PowerPoint presentation', pptx: 'PowerPoint presentation',
    odt: 'OpenDocument text', ods: 'OpenDocument spreadsheet', odp: 'OpenDocument presentation',
    txt: 'Plain text', md: 'Markdown text', csv: 'CSV text', json: 'JSON file',
    yaml: 'YAML file', yml: 'YAML file', log: 'Log file', ipynb: 'Jupyter notebook',
    zip: 'ZIP archive', tar: 'tar archive', gz: 'gzip archive', tgz: 'gzip archive',
    xz: 'xz archive', bz2: 'bzip2 archive', '7z': '7-Zip archive', rar: 'RAR archive',
    py: 'Python script', sh: 'Shell script', js: 'JavaScript file', ts: 'TypeScript file',
    c: 'C source', h: 'C header', cpp: 'C++ source', go: 'Go source', rs: 'Rust source',
    java: 'Java source', html: 'HTML file', css: 'CSS file',
    iso: 'Disk image', deb: 'Debian package', rpm: 'RPM package',
    exe: 'Windows program', dmg: 'macOS disk image'
  };

  // Resolve user input (absolute, relative, ~, . and ..) against the folder the
  // user is standing in. `cwd` and `home` are passed because a path helper that
  // reads app state cannot be tested and cannot be reused.
  function normPath(input, cwd, home) {
    var p = (input || '').trim();
    if (!p) return null;
    if (p === '~') p = home || '/';
    else if (p.slice(0, 2) === '~/') p = (home || '') + p.slice(1);
    if (p.charAt(0) !== '/') p = (cwd === '/' || !cwd ? '' : cwd) + '/' + p;
    var out = [];
    p.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') { out.pop(); return; }
      out.push(seg);
    });
    return '/' + out.join('/');
  }

  // A path shown relative to the folder in view, for search results that live
  // deeper. Returns '' when the file is in the current folder itself.
  function relParent(abs, cwd) {
    var dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
    if (dir === cwd) return '';
    var root = cwd === '/' ? '/' : cwd + '/';
    return dir.indexOf(root) === 0 ? dir.slice(root.length) : dir;
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }

  // Relative timestamps. `nowMs` is injected so the tests are not a clock race;
  // `exact` is the user's "show exact dates" preference.
  function fmtRel(ts, short, exact, nowMs) {
    if (exact) return new Date(ts * 1000).toLocaleString();
    var s = (nowMs === undefined ? Date.now() : nowMs) / 1000 - ts;
    if (s < 45) return short ? 'now' : 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm' + (short ? '' : ' ago');
    if (s < 86400) return Math.round(s / 3600) + 'h' + (short ? '' : ' ago');
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd' + (short ? '' : ' ago');
    var d = new Date(ts * 1000), now = new Date(nowMs === undefined ? Date.now() : nowMs);
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return short ? d.toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' })
                 : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function iconFor(name, isDir) {
    if (isDir) return '\uD83D\uDCC1';
    if (IMG_RE.test(name)) return '\uD83D\uDDBC\uFE0F';
    if (VID_RE.test(name)) return '\uD83C\uDFAC';
    if (AUD_RE.test(name)) return '\uD83C\uDFB5';
    if (ARC_RE.test(name)) return '\uD83D\uDCE6';
    if (/\.pdf$/i.test(name)) return '\uD83D\uDCD5';
    if (/\.(docx?|odt)$/i.test(name)) return '\uD83D\uDCD8';
    if (/\.(xlsx?|ods|csv)$/i.test(name)) return '\uD83D\uDCD7';
    if (/\.(pptx?|odp)$/i.test(name)) return '\uD83D\uDCD9';
    return '\uD83D\uDCC4';
  }

  function kindOf(name, isDir) {
    if (isDir) return 'Folder';
    var dot = (name || '').lastIndexOf('.');
    var ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (KIND_MAP[ext]) return KIND_MAP[ext];
    return ext ? ext.toUpperCase() + ' file' : 'File';
  }

  function fmtMode(mode) {                          // low 9 bits -> "rwxr-xr-x"
    var s = '', ch = 'rwx';
    for (var i = 8; i >= 0; i--) s += ((mode >> i) & 1) ? ch[(8 - i) % 3] : '-';
    return s;
  }

  // The naming half of freeName(): "report.txt" -> "report (2).txt". The probing
  // half stays in the page, because it talks to the server.
  function nextName(name, n) {
    var dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + ' (' + n + ')' + name.slice(dot)
                   : name + ' (' + n + ')';
  }

  var api = { OFF_RE: OFF_RE, IMG_RE: IMG_RE, VID_RE: VID_RE, AUD_RE: AUD_RE, ARC_RE: ARC_RE,
              KIND_MAP: KIND_MAP, normPath: normPath, relParent: relParent, fmtSize: fmtSize,
              fmtRel: fmtRel, iconFor: iconFor, kindOf: kindOf, fmtMode: fmtMode,
              nextName: nextName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FilesxCore = api;
})(typeof self !== 'undefined' ? self : this);
