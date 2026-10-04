/* Render one CPU row and one row per GPU inside the existing taskbar height. */
(function (root) {
  'use strict';
  function displayGpus(d) {
    if (!Array.isArray(d.gpus)) {
      // Older managers supply only scalar fields. An explicit empty inventory
      // means no GPU; it must clear previous devices instead of reviving one.
      return [{ id: 'legacy', name: 'GPU', percent: d.gpu_percent, temp: d.gpu_temp,
        vram_used_gb: d.gpu_vram_used_gb, vram_total_gb: d.gpu_vram_total_gb }];
    }
    var all = d.gpus.filter(function (g) { return g && typeof g.id === 'string'; });
    var discrete = all.filter(function (g) { return g.integrated === false; });
    return discrete.slice().sort(function (a, b) {
      return a.id.localeCompare(b.id);
    });
  }
  function render(d, document) {
    var stats = document.querySelector('.tb-stats');
    if (!stats) return;
    var set = function (id, value, unit) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = value == null ? '--' : String(value);
      if (unit) document.getElementById(unit).style.visibility = value == null ? 'hidden' : '';
    };
    var rounded = function (v) { return v == null ? null : Math.round(v); };
    var memory = function (used, total) {
      return used != null && total != null ? Math.round(used) + '/' + Math.round(total) : null;
    };
    set('cpu-n', rounded(d.cpu_percent), 'cpu-u');
    set('cpu-tn', d.cpu_temp, 'cpu-tu');
    set('mem-ut', memory(d.memory_used_gb, d.memory_total_gb));
    var gpus = displayGpus(d);
    // A 128GB host needs room for "125/125", not just "32/64". Reserve
    // digits from capacity so memory readings never collide with their labels
    // or shift the grid when usage crosses a decimal boundary.
    var memoryWidth = 5;
    [d.memory_total_gb].concat(gpus.map(function (g) { return g.vram_total_gb; }))
      .forEach(function (total) {
        if (total != null) memoryWidth = Math.max(memoryWidth, String(Math.round(total)).length * 2 + 1);
      });
    stats.style.setProperty('--tray-memory-width', memoryWidth + 'ch');
    var ids = JSON.stringify(gpus.map(function (g) { return g.id; }));
    if (stats._gpuIds !== ids) {
      stats.querySelectorAll('.tb-gpu-cell').forEach(function (el) { el.remove(); });
      gpus.forEach(function (gpu, i) {
        [['label', 'label', ''], ['n', 'n', ''], ['u', 'u', '%'],
          ['tn', 'n', ''], ['tu', 'u', '°'], ['vlabel', 'label', 'VRAM'],
          ['vram', 'n', ''], ['vu', 'u', 'G']].forEach(function (cell) {
          var el = document.createElement('span');
          el.id = 'tray-gpu-' + i + '-' + cell[0];
          el.className = cell[1] + ' tb-gpu-cell';
          el.textContent = cell[2];
          stats.appendChild(el);
        });
      });
      stats._gpuIds = ids;
    }
    // Use 38px of the existing 54px taskbar. Three 11px rows plus two 1px
    // gaps fit without shrinking the text or changing the bar's height.
    var rows = gpus.length + 1;
    var font = Math.min(11, (38 - (rows - 1)) / rows);
    stats.style.fontSize = font + 'px';
    stats.style.lineHeight = rows > 2 ? '1' : '1.3';
    gpus.forEach(function (gpu, i) {
      var prefix = 'tray-gpu-' + i + '-';
      var label = document.getElementById(prefix + 'label');
      label.textContent = gpus.length === 1 ? 'GPU' : 'GPU' + (i + 1);
      label.title = gpu.name + ' · ' + gpu.id;
      set(prefix + 'n', rounded(gpu.percent), prefix + 'u');
      set(prefix + 'tn', gpu.temp, prefix + 'tu');
      set(prefix + 'vram', memory(gpu.vram_used_gb, gpu.vram_total_gb));
    });
  }
  var api = { render: render, displayGpus: displayGpus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VibeSystemTray = api;
})(typeof self !== 'undefined' ? self : this);
