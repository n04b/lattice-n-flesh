'use strict';
/* ===== Инструменты ===== */
const TOOLS = {
  select: ['Выбор', 'Клик — выбрать ребро (Shift — добавить). Рамка вправо — целиком внутри, влево — пересечение. Del — удалить.'],
  line: ['Ребро', 'Клик — точка. Привязки: ■ конец, ▲ середина, ✚ сетка. Shift — вдоль оси. Esc / Enter / ПКМ — завершить цепочку.'],
  move: ['Перемещение', 'Укажите базовую точку, затем точку назначения. Shift — вдоль оси.'],
  copy: ['Копирование', 'Укажите базовую точку, затем точки для копий. Esc — завершить.'],
  add: ['Новый объём', 'Клик — центр нового объёма (привязки к рёбрам работают). Esc — отмена.'],
  vselect: ['Выбор', 'Клик по каркасу — выбрать объём (Shift — добавить). Рамка — по центрам. Del — удалить.']
};
const hasSel = () => opt.layer === 'vol' ? vsel.size > 0 : sel.size > 0;
function resetOp() { ed.start = ed.base = ed.chainFirst = null; ed.box = null; ed.hoverEdge = null; }
function setTool(t) {
  if ((t === 'move' || t === 'copy') && !hasSel()) toast(opt.layer === 'vol' ? 'Сначала выделите объёмы' : 'Сначала выделите рёбра инструментом «Выбор»');
  if (t === 'line' && opt.layer === 'vol') t = 'select';
  opt.tool = t; resetOp();
  $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $$('[data-add]').forEach(b => b.classList.toggle('on', t === 'add' && b.dataset.add === opt.addType));
  const info = TOOLS[t === 'select' && opt.layer === 'vol' ? 'vselect' : t];
  $('#st-tool').textContent = info[0];
  $('#st-hint').textContent = info[1];
  cv.style.cursor = t === 'select' ? 'default' : 'crosshair';
  refreshHover();
}
function setPlane(p) {
  opt.plane = p;
  $$('[data-plane]').forEach(b => b.classList.toggle('on', b.dataset.plane === p));
  $('#st-plane').textContent = p.toUpperCase();
  refreshHover();
}
function cancelOp() {
  if (ed.start || ed.base) resetOp();
  else if (opt.tool === 'add') return setTool('select');
  else if (opt.layer === 'vol' && vsel.size) { vsel.clear(); renderVolUI(); }
  else if (opt.layer === 'lat' && sel.size) { sel.clear(); updateSelInfo(); }
  refreshHover();
}
function refreshHover() { if (ed.mouse) hover(ed.mouse[0], ed.mouse[1]); else requestDraw(); }
function hover(x, y) {
  updateCam();
  ed.hoverEdge = ed.hoverVol = null;
  if (opt.tool === 'select') {
    if (opt.layer === 'vol') ed.hoverVol = volAt(x, y); else ed.hoverEdge = edgeAt(x, y);
    ed.pick = null; ed.cands = [];
  }
  else ed.pick = pickPoint(x, y);
  const p = ed.pick && ed.pick.p;
  $('#st-xyz').textContent = p ? `X ${fmt(p[0])}  Y ${fmt(p[1])}  Z ${fmt(p[2])}` : '—';
  requestDraw();
}
function toolClick(x, y) {
  updateCam();
  const pk = pickPoint(x, y);
  if (!pk) return;
  const p = pk.p;
  if (opt.tool === 'line') {
    if (!ed.start) { ed.start = ed.chainFirst = p; return; }
    if (dist(ed.start, p) < 1e-4) return;
    pushHist();
    if (!addEdges([[ed.start, p]]).length) { hist.undo.pop(); toast('Такое ребро уже есть'); }
    const closed = dist(p, ed.chainFirst) < 1e-4;   // замкнули контур — цепочка завершается
    if (opt.chain && !closed) ed.start = p;
    else ed.start = ed.chainFirst = null;
    changed();
    return;
  }
  if (opt.tool === 'add') {
    pushHist();
    const n = newShape(opt.addType, p);
    vols.push(n); vsel.clear(); vsel.add(n.id);
    setTool('select'); volsChanged();
    return;
  }
  if (!hasSel()) return toast('Сначала выделите объекты');
  if (!ed.base) { ed.base = p; return; }
  const d = sub(p, ed.base);
  if (len(d) < 1e-6) return;
  if (opt.layer === 'vol') return moveVols(d, opt.tool === 'copy');
  const moved = [...sel].map(e => [add(e.a, d), add(e.b, d)]);
  pushHist();
  if (opt.tool === 'move') {
    edges = edges.filter(e => !sel.has(e));
    sel.clear();
    addEdges(moved).forEach(e => sel.add(e));
    ed.base = null;
  } else {
    toast(`Скопировано рёбер: ${addEdges(moved).length}`);
  }
  changed();
}
function selectAll() {
  if (opt.layer === 'vol') { vols.forEach(n => vsel.add(n.id)); renderVolUI(); }
  else { edges.forEach(e => sel.add(e)); updateSelInfo(); }
  requestDraw();
}
function fitView() {
  const src = edges.length ? edges.map(e => [e.a, e.b]) : preview;
  if (!src.length) { cam.target = [0, 0, 0]; cam.dist = 16; return refreshHover(); }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const s of src) for (const p of s) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  cam.target = mid(mn, mx);
  cam.dist = Math.max(dist(mn, mx) / 2, 0.5) / Math.sin(cam.fov / 2) * 1.05 * Math.max(1, H / W);
  refreshHover();
}
const VIEWS = { iso: [0.75, 0.55, 'xz'], top: [0, 1.5707, 'xz'], front: [0, 0, 'xy'], side: [Math.PI / 2, 0, 'yz'] };
function setView(v) {
  if (v === 'fit') return fitView();
  [cam.yaw, cam.pitch] = VIEWS[v];
  setPlane(VIEWS[v][2]);
}
