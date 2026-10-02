'use strict';
/* ===== Запуск ===== */
function init() {
  $('#g-poly').innerHTML = Object.entries(POLY).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('');
  $('#g-poly').value = 'cube';
  updGen();
  try { const s = localStorage.getItem('edge-editor'); if (s) restore(s); } catch (e) { edges = []; }
  $$('[data-snap]').forEach(b => b.classList.toggle('on', opt.snap[b.dataset.snap]));
  glInit();
  setLayer('lat');
  setTool('line');
  setPlane('xz');
  new ResizeObserver(resize).observe($('#view'));
  resize();
  changed();
  if (edges.length || vols.length) fitView();
}
init();
