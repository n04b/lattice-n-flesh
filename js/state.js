'use strict';
/* ===== Состояние ===== */
const cv = $('#cv'), octx = cv.getContext('2d'), gctx = $('#bg').getContext('2d');
let ctx = octx;                  // текущий 2D-контекст: сетка рисуется на нижнем холсте
let W = 0, H = 0, DPR = 1;
let edges = [];                 // рёбра: {a:[x,y,z], b:[x,y,z]}
const sel = new Set();          // выделенные рёбра
let preview = [];               // предпросмотр генератора: [[a,b], ...]
const opt = { tool: 'line', layer: 'lat', addType: 'box', plane: 'xz', grid: 1, planeOff: 0, chain: true,
              snap: { end: true, mid: true, grid: true } };
const cam = { target: [0, 0, 0], yaw: 0.75, pitch: 0.55, dist: 16, fov: 50 * Math.PI / 180 };
const ed = { mouse: null, pick: null, cands: [], hoverEdge: null, box: null, shift: false,
             start: null, chainFirst: null, base: null, hoverVol: null };
let vols = [];                  // дерево объёмов-модификаторов
const vsel = new Set();         // id выделенных узлов
let volId = 1;

/* ===== Камера и проекция ===== */
const NEAR = 0.05;
let eye, fwd, right, up, focal;
function updateCam() {
  const cp = Math.cos(cam.pitch);
  eye = add(cam.target, mul([cp * Math.sin(cam.yaw), Math.sin(cam.pitch), cp * Math.cos(cam.yaw)], cam.dist));
  fwd = norm(sub(cam.target, eye));
  right = norm(cross(fwd, [0, 1, 0]));
  up = cross(right, fwd);
  focal = (H / 2) / Math.tan(cam.fov / 2);
}
const camSpace = p => { const d = sub(p, eye); return [dot(d, right), dot(d, up), dot(d, fwd)]; };
const toScreen = c => [W / 2 + c[0] * focal / c[2], H / 2 - c[1] * focal / c[2]];
function project(p) { const c = camSpace(p); return c[2] > NEAR ? toScreen(c) : null; }
// отрезок с отсечением ближней плоскостью → [x1, y1, x2, y2] | null
function projSeg(a, b) {
  let ca = camSpace(a), cb = camSpace(b);
  if (ca[2] < NEAR && cb[2] < NEAR) return null;
  if (ca[2] < NEAR) ca = lerp(ca, cb, (NEAR - ca[2]) / (cb[2] - ca[2]));
  else if (cb[2] < NEAR) cb = lerp(cb, ca, (NEAR - cb[2]) / (ca[2] - cb[2]));
  const s = toScreen(ca), t = toScreen(cb);
  return [s[0], s[1], t[0], t[1]];
}
function rayAt(x, y) {
  return { o: eye, d: norm(add(fwd, add(mul(right, (x - W / 2) / focal), mul(up, -(y - H / 2) / focal)))) };
}
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  for (const c of $$('#view canvas')) { c.width = Math.max(1, Math.round(W * DPR)); c.height = Math.max(1, Math.round(H * DPR)); }
  draw();
}
let drawQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}
let msgTimer;
function toast(text) {
  const m = $('#msg'); m.textContent = text; m.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), 2400);
}

/* ===== Модель и история ===== */
const hist = { undo: [], redo: [] };
const serialize = () => JSON.stringify({ e: edges.map(e => [e.a, e.b]), v: vols });
function restore(s) {
  const d = JSON.parse(s), list = Array.isArray(d) ? d : d.e;   // старый формат — просто массив рёбер
  edges = list.map(([a, b]) => ({ a, b }));
  vols = Array.isArray(d) ? [] : migrateVols(d.v || []);
  sel.clear(); vsel.clear();
  volId = 1;
  walk(vols, n => { volId = Math.max(volId, n.id + 1); });
  volsChanged(true);
}
function pushHist() { hist.undo.push(serialize()); if (hist.undo.length > 100) hist.undo.shift(); hist.redo.length = 0; }
function undo() {
  if (!hist.undo.length) return toast('Нечего отменять');
  hist.redo.push(serialize()); restore(hist.undo.pop()); resetOp(); changed();
}
function redo() {
  if (!hist.redo.length) return toast('Нечего повторять');
  hist.undo.push(serialize()); restore(hist.redo.pop()); resetOp(); changed();
}
// добавляет рёбра без дублей и нулевой длины, возвращает добавленные
function addEdges(list) {
  const keys = new Set(edges.map(e => keyE(e.a, e.b)));
  const added = [];
  for (const [a, b] of list) {
    if (dist(a, b) < 1e-4) continue;
    const k = keyE(a, b);
    if (keys.has(k)) continue;
    keys.add(k);
    const e = { a: [...a], b: [...b] };
    edges.push(e); added.push(e);
  }
  return added;
}
function deleteSel() {
  if (opt.layer === 'vol') return deleteVols();
  if (!sel.size) return toast('Ничего не выделено');
  pushHist(); edges = edges.filter(e => !sel.has(e)); sel.clear(); resetOp(); changed();
}
let saveTimer;
function changed() {
  $('#st-count').textContent = edges.length;
  updateSelInfo();
  fieldDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem('edge-editor', serialize()); } catch (e) { } }, 400);
  requestDraw();
}
function updateSelInfo() {
  const el = $('#sel-info');
  if (!sel.size) { el.textContent = 'Ничего не выделено'; return; }
  let L = 0;
  for (const e of sel) L += dist(e.a, e.b);
  let html = `Рёбер: <b>${sel.size}</b>, суммарная длина: <b>${fmt(L)}</b>`;
  if (sel.size === 1) {
    const [e] = sel, P = p => `(${p.map(fmt).join('; ')})`;
    html += `<br>Начало ${P(e.a)}<br>Конец ${P(e.b)}`;
  }
  el.innerHTML = html;
}
