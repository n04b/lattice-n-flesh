'use strict';
/* ===== Слой объёмов: выбор, правка дерева, аутлайнер, инспектор ===== */
function setLayer(l) {
  opt.layer = l;
  document.body.dataset.layer = l;
  $$('[data-layer]').forEach(b => b.classList.toggle('on', b.dataset.layer === l));
  if ((opt.tool === 'line' && l === 'vol') || (opt.tool === 'add' && l === 'lat')) opt.tool = 'select';
  setTool(opt.tool);
  renderVolUI();
}
function visibleShapes(list = vols, out = []) {
  for (const n of list) {
    if (n.hidden) continue;
    if (n.kind === 'group') visibleShapes(n.children, out); else out.push(n);
  }
  return out;
}
function volAt(mx, my) {
  let best = null, bd = 7;
  for (const n of visibleShapes()) for (const pl of nodeWires(n)) for (let i = 0; i + 1 < pl.length; i++) {
    const s = projSeg(pl[i], pl[i + 1]);
    if (!s) continue;
    const d = segDist(mx, my, s);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}
function clickVol(id, toggle) {
  if (!toggle) vsel.clear();
  if (id !== null) { if (toggle && vsel.has(id)) vsel.delete(id); else vsel.add(id); }
  renderVolUI();
}
function boxSelectVols(x1, y1, x2, y2, additive) {   // объём попадает в рамку своим центром
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
  if (!additive) vsel.clear();
  for (const n of visibleShapes()) {
    const s = project(n.pos);
    if (s && s[0] >= l && s[0] <= r && s[1] >= t && s[1] <= b) vsel.add(n.id);
  }
  renderVolUI();
}
const isInside = (id, anc) => !!(anc.children && findNode(id, anc.children));
// выделенные узлы без тех, чей предок тоже выделен
function topSelected() {
  const ids = [...vsel].filter(id => findNode(id));
  return ids.filter(id => !ids.some(o => o !== id && isInside(id, findNode(o).n)));
}
function translateNode(n, d) {
  if (n.kind === 'shape') n.pos = add(n.pos, d); else n.children.forEach(c => translateNode(c, d));
}
function cloneNode(n) {
  const c = JSON.parse(JSON.stringify(n));
  walk([c], x => { x.id = volId++; });
  c.name += ' копия';
  return c;
}
function moveVols(d, copy) {
  pushHist();
  for (const id of topSelected()) {
    const f = findNode(id);
    if (copy) { const c = cloneNode(f.n); translateNode(c, d); f.list.splice(f.list.indexOf(f.n) + 1, 0, c); }
    else translateNode(f.n, d);
  }
  if (!copy) ed.base = null;
  volsChanged();
}
function deleteVols() {
  const ids = topSelected();
  if (!ids.length) return toast('Ничего не выделено');
  pushHist();
  for (const id of ids) { const f = findNode(id); f.list.splice(f.list.indexOf(f.n), 1); }
  vsel.clear(); resetOp(); volsChanged();
}
function groupVols() {
  const ids = topSelected();
  if (!ids.length) return toast('Выделите объёмы для группировки');
  pushHist();
  const first = findNode(ids[0]), g = newGroup([]);
  first.list.splice(first.list.indexOf(first.n), 0, g);
  for (const id of ids) { const f = findNode(id); f.list.splice(f.list.indexOf(f.n), 1); g.children.push(f.n); }
  vsel.clear(); vsel.add(g.id); volsChanged();
}
function ungroupVols() {
  const groups = topSelected().map(id => findNode(id)).filter(f => f.n.kind === 'group');
  if (!groups.length) return toast('Выделите группу');
  pushHist(); vsel.clear();
  for (const f of groups) {
    f.list.splice(f.list.indexOf(f.n), 1, ...f.n.children);
    f.n.children.forEach(c => vsel.add(c.id));
  }
  volsChanged();
}
function shiftVol(dir) {
  const ids = topSelected();
  if (ids.length !== 1) return toast('Выделите один объём');
  const f = findNode(ids[0]), i = f.list.indexOf(f.n), j = i + dir;
  if (j < 0 || j >= f.list.length) return;
  pushHist();
  [f.list[i], f.list[j]] = [f.list[j], f.list[i]];
  volsChanged();
}
// перенос узла перетаскиванием: внутрь группы, перед узлом или в конец корня
function dropNode(id, targetId, mode) {
  const f = findNode(id);
  if (!f || id === targetId || (targetId !== null && isInside(targetId, f.n))) return;
  pushHist();
  f.list.splice(f.list.indexOf(f.n), 1);
  const t = targetId === null ? null : findNode(targetId);
  if (!t) vols.push(f.n);
  else if (mode === 'in') t.n.children.push(f.n);
  else t.list.splice(t.list.indexOf(t.n), 0, f.n);
  volsChanged();
}
function volsChanged() { renderVolUI(); changed(); }
function renderVolUI() { renderOutliner(); renderInspector(); requestDraw(); }

/* ----- аутлайнер ----- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderOutliner() {
  const rows = [];
  const rec = (list, depth, root) => {
    for (const n of list) {
      const isRoot = root && !(n.kind === 'group' && n.op === 'folder');
      const off = isRoot && !n.mod.on;
      rows.push(`<div class="vrow${vsel.has(n.id) ? ' sel' : ''}${off ? ' off' : ''}" draggable="true" data-id="${n.id}"
        style="padding-left:${6 + depth * 14}px"><span class="eye${n.hidden ? ' off' : ''}" data-eye title="Видимость">◉</span>
        <span>${n.kind === 'group' ? '▾ ' : ''}${esc(n.name)}</span>
        <span class="ty">${n.kind === 'group' ? OPS[n.op] : ''}</span></div>`);
      if (n.kind === 'group') rec(n.children, depth + 1, root && n.op === 'folder');
    }
  };
  rec(vols, 0, true);
  $('#outliner').innerHTML = rows.join('') || '<div class="hint" style="padding:8px">Пусто: добавьте объём кнопками на панели</div>';
}
const outl = $('#outliner');
outl.addEventListener('click', e => {
  const row = e.target.closest('.vrow');
  if (!row) { vsel.clear(); return renderVolUI(); }
  const id = +row.dataset.id;
  if (e.target.closest('[data-eye]')) {
    pushHist(); const n = findNode(id).n; n.hidden = !n.hidden; return volsChanged();
  }
  clickVol(id, e.shiftKey || e.metaKey || e.ctrlKey);
});
let dragId = null;
const dropMode = (row, e) => {
  const r = row.getBoundingClientRect(), n = findNode(+row.dataset.id).n;
  return n.kind === 'group' && e.clientY > r.top + r.height * 0.3 ? 'in' : 'before';
};
outl.addEventListener('dragstart', e => { const row = e.target.closest('.vrow'); if (row) { dragId = +row.dataset.id; e.dataTransfer.effectAllowed = 'move'; } });
outl.addEventListener('dragover', e => {
  if (dragId === null) return;
  e.preventDefault();
  $$('.vrow').forEach(r => r.classList.remove('drop-in', 'drop-before'));
  const row = e.target.closest('.vrow');
  if (row) row.classList.add(dropMode(row, e) === 'in' ? 'drop-in' : 'drop-before');
});
outl.addEventListener('drop', e => {
  e.preventDefault();
  const row = e.target.closest('.vrow');
  if (dragId !== null) dropNode(dragId, row ? +row.dataset.id : null, row ? dropMode(row, e) : 'end');
  dragId = null;
});
outl.addEventListener('dragend', () => { dragId = null; $$('.vrow').forEach(r => r.classList.remove('drop-in', 'drop-before')); });

/* ----- инспектор ----- */
const num = (k, label, v, step) => `<div class="row"><span>${label}</span><input type="number" data-k="${k}" value="${+v.toFixed(4)}" step="${step}"></div>`;
const tri = (k, label, v, step) => `<div class="row"><span>${label}</span><span class="tri">${v.map((x, i) =>
  `<input type="number" data-k="${k}.${i}" value="${+x.toFixed(4)}" step="${step}">`).join('')}</span></div>`;
const pick = (k, label, v, opts) => `<div class="row"><span>${label}</span><select data-k="${k}">${Object.entries(opts).map(([key, t]) =>
  `<option value="${key}"${key === v ? ' selected' : ''}>${Array.isArray(t) ? t[0] : t}</option>`).join('')}</select></div>`;
function renderInspector() {
  const el = $('#inspector'), ids = [...vsel].filter(id => findNode(id));
  if (ids.length !== 1) { el.innerHTML = `<div class="hint">${ids.length ? 'Выделено объёмов: ' + ids.length : 'Ничего не выделено'}</div>`; return; }
  const n = findNode(ids[0]).n, h = [];
  h.push(`<div class="row"><span>Имя</span><input type="text" data-k="name" value="${esc(n.name)}"></div>`);
  if (n.kind === 'shape') {
    h.push(`<div class="sub">${PRIM[n.type].name}</div>`);
    for (const [k, v] of Object.entries(n.dims)) h.push(num('dims.' + k, DIM_NAME[k] + ', мм', v, 0.5));
    h.push(tri('pos', 'Центр X/Y/Z', n.pos, 1), tri('rot', 'Поворот X/Y/Z°', n.rot, 15));
  } else {
    h.push(pick('op', 'Операция', n.op, OPS));
    if (n.op !== 'folder') h.push(num('k', 'Скругление, мм', n.k || 0, 0.5));
  }
  if (isModRoot(n.id)) {
    const m = n.mod;
    h.push(`<div class="sub">Модификатор «мясо»</div>`,
      `<label class="chk"><input type="checkbox" data-k="mod.on"${m.on ? ' checked' : ''}> Включён</label>`,
      num('mod.thick', 'Толщина (радиус), мм', m.thick, 0.1),
      num('mod.blend', 'Сращивание, мм', m.blend || 0, 0.25),
      num('mod.fall', 'Затухание, мм', m.fall, 0.5),
      pick('mod.curve', 'Кривая спада', m.curve, CURVES),
      pick('mod.mode', 'Смешивание', m.mode, MODES));
  } else if (n.kind === 'group' && n.op === 'folder') {
    h.push('<div class="hint">Папка: вложенные объёмы действуют каждый сам по себе.</div>');
  } else {
    h.push('<div class="hint">Форма внутри группы-операции: толщину и затухание задаёт группа.</div>');
  }
  el.innerHTML = h.join('');
}
let inspArmed = false;          // одна запись в историю на серию правок одного поля
const insp = $('#inspector');
insp.addEventListener('focusin', () => { inspArmed = true; });
insp.addEventListener('input', e => {
  const k = e.target.dataset.k, id = [...vsel][0], f = k && findNode(id);
  if (!f) return;
  if (inspArmed) { pushHist(); inspArmed = false; }
  const path = k.split('.'), last = path.pop();
  let o = f.n;
  for (const p of path) o = o[p];
  const t = e.target;
  o[last] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (parseFloat(t.value) || 0) : t.value;
  if (t.tagName === 'SELECT' || t.type === 'checkbox') inspArmed = true;
  renderOutliner(); changed();
  if (k === 'op') renderInspector();
});

/* ----- кнопки ----- */
$$('[data-layer]').forEach(b => b.onclick = () => setLayer(b.dataset.layer));
$$('[data-add]').forEach(b => b.onclick = () => { opt.addType = b.dataset.add; if (opt.layer !== 'vol') setLayer('vol'); setTool('add'); });
$('#v-group').onclick = () => groupVols();
$('#v-ungroup').onclick = () => ungroupVols();
$('#v-up').onclick = () => shiftVol(-1);
$('#v-down').onclick = () => shiftVol(1);
$('#v-del').onclick = () => deleteVols();
$('#b-build').onclick = () => buildBody(true);
$('#b-stl').onclick = () => exportSTL();
$('#b-show').onchange = () => requestDraw();
for (const id of ['#b-res', '#b-smooth', '#b-auto']) $(id).addEventListener('input', () => fieldDirty());
