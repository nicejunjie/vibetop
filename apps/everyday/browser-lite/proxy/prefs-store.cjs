'use strict';
// Per-user Browser Lite preferences, stored beside the cookie jar. Small and
// extensible; today it holds only the ad-blocker toggle (on by default). The UI
// also keeps a device copy, and this copy follows the user to any device, just
// like the saved tabs and shortcuts do.
const fs = require('node:fs');
const MAX_BYTES = 4 * 1024;
const DEFAULTS = { adblock: true };

function clean(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input.prefs && typeof input.prefs === 'object' ? input.prefs : input) : null;
  if (!source) throw new Error('Invalid browser prefs');
  const prefs = { adblock: source.adblock === undefined ? DEFAULTS.adblock : !!source.adblock };
  const saved = { prefs, saved: Date.now() };
  if (Buffer.byteLength(JSON.stringify(saved)) > MAX_BYTES) throw new Error('Browser prefs too large');
  return saved;
}

class PrefsStore {
  constructor(file) { this.file = file; }
  // Always returns a concrete settings object (defaults when nothing is saved),
  // so callers never special-case a missing file.
  load() {
    if (!this.file) return { ...DEFAULTS };
    try { return clean(JSON.parse(fs.readFileSync(this.file, 'utf8'))).prefs; } catch { return { ...DEFAULTS }; }
  }
  save(input) {
    if (!this.file) return null;
    const saved = clean(input), temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 }); fs.renameSync(temporary, this.file);
    return saved.prefs;
  }
}

module.exports = { PrefsStore, clean, DEFAULTS };
