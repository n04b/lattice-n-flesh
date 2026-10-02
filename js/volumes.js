'use strict';
/* ===== Объёмы-модификаторы: примитивы ===== */
const R2D = Math.PI / 180;
function circle(r, plane, c = [0, 0, 0], n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = i * 2 * Math.PI / n, u = r * Math.cos(a), v = r * Math.sin(a);
    out.push(add(c, plane === 'xz' ? [u, 0, v] : plane === 'xy' ? [u, v, 0] : [0, v, u]));
  }
  return out;
}
const sides = (r0, y0, r1, y1) => [0, 1, 2, 3].map(i => {
  const c = Math.cos(i * Math.PI / 2), s = Math.sin(i * Math.PI / 2);
  return [[r0 * c, y0, r0 * s], [r1 * c, y1, r1 * s]];
});
function stadium(r, h, plane) {   // контур капсулы в плоскости
  const pts = [], P = (u, v) => plane === 'xy' ? [u, v, 0] : [0, v, u];
  for (let i = 0; i <= 24; i++) { const a = i * Math.PI / 24; pts.push(P(r * Math.cos(a), h + r * Math.sin(a))); }
  for (let i = 0; i <= 24; i++) { const a = Math.PI + i * Math.PI / 24; pts.push(P(r * Math.cos(a), -h + r * Math.sin(a))); }
  pts.push(pts[0]);
  return pts;
}
function coneSdf(p, d) {   // усечённый конус: r1 снизу, r2 сверху
  const h = d.h / 2, r1 = d.r1, r2 = d.r2, qx = Math.hypot(p[0], p[2]), qy = p[1];
  const k2x = r2 - r1, k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
  const t = clamp(((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = qx - r2 + k2x * t, cby = qy - h + k2y * t;
  return (cbx < 0 && cay < 0 ? -1 : 1) * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}
// dims — размеры в мм; sdf — расстояние со знаком в локальных координатах;
// wire(dims, o) — каркас, раздутый на o (для границы затухания)
const PRIM = {
  box: { name: 'Параллелепипед', dims: { sx: 10, sy: 10, sz: 10 },
    sdf: (p, d) => {
      const q = [Math.abs(p[0]) - d.sx / 2, Math.abs(p[1]) - d.sy / 2, Math.abs(p[2]) - d.sz / 2];
      return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
    },
    wire: (d, o) => {
      const x = d.sx / 2 + o, y = d.sy / 2 + o, z = d.sz / 2 + o, L = [];
      const P = i => [i & 1 ? x : -x, i & 2 ? y : -y, i & 4 ? z : -z];
      for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) if (!(i & b)) L.push([P(i), P(i | b)]);
      return L;
    } },
  sphere: { name: 'Сфера', dims: { r: 5 },
    sdf: (p, d) => len(p) - d.r,
    wire: (d, o) => ['xz', 'xy', 'yz'].map(pl => circle(d.r + o, pl)) },
  cyl: { name: 'Цилиндр', dims: { r: 4, h: 10 },
    sdf: (p, d) => {
      const a = Math.hypot(p[0], p[2]) - d.r, b = Math.abs(p[1]) - d.h / 2;
      return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0));
    },
    wire: (d, o) => [circle(d.r + o, 'xz', [0, -d.h / 2 - o, 0]), circle(d.r + o, 'xz', [0, d.h / 2 + o, 0]),
      ...sides(d.r + o, -d.h / 2 - o, d.r + o, d.h / 2 + o)] },
  cone: { name: 'Конус', dims: { r1: 5, r2: 0, h: 10 },
    sdf: coneSdf,
    wire: (d, o) => [circle(d.r1 + o, 'xz', [0, -d.h / 2 - o, 0]),
      ...(d.r2 + o > 1e-6 ? [circle(d.r2 + o, 'xz', [0, d.h / 2 + o, 0])] : []),
      ...sides(d.r1 + o, -d.h / 2 - o, d.r2 + o, d.h / 2 + o)] },
  torus: { name: 'Тор', dims: { R: 6, r: 2 },
    sdf: (p, d) => Math.hypot(Math.hypot(p[0], p[2]) - d.R, p[1]) - d.r,
    wire: (d, o) => {
      const r = d.r + o;
      const L = [circle(d.R + r, 'xz'), circle(Math.max(d.R - r, 0), 'xz'), circle(d.R, 'xz', [0, r, 0]), circle(d.R, 'xz', [0, -r, 0])];
      for (let i = 0; i < 4; i++) {
        const c = Math.cos(i * Math.PI / 2), s = Math.sin(i * Math.PI / 2);
        L.push(circle(r, 'xy', [0, 0, 0], 32).map(q => [(d.R + q[0]) * c, q[1], (d.R + q[0]) * s]));
      }
      return L;
    } },
  capsule: { name: 'Капсула', dims: { r: 3, h: 10 },
    sdf: (p, d) => Math.hypot(p[0], p[1] - clamp(p[1], -d.h / 2, d.h / 2), p[2]) - d.r,
    wire: (d, o) => {
      const r = d.r + o, h = d.h / 2;
      return [circle(r, 'xz', [0, h, 0]), circle(r, 'xz', [0, -h, 0]), stadium(r, h, 'xy'), stadium(r, h, 'yz')];
    } },
  half: { name: 'Полупространство', dims: { s: 30 },   // s — только размер рамки на экране
    sdf: p => p[1],
    wire: (d, o) => {
      const s = d.s / 2, sq = [[-s, o, -s], [s, o, -s], [s, o, s], [-s, o, s], [-s, o, -s]];
      return o ? [sq] : [sq, [[0, 0, 0], [0, -s / 3, 0]]];
    } },
};
const DIM_NAME = { sx: 'Размер X', sy: 'Размер Y', sz: 'Размер Z', r: 'Радиус', h: 'Высота', r1: 'Радиус низа',
                   r2: 'Радиус верха', R: 'Радиус тора', s: 'Рамка (вид)' };
const CURVES = {
  smooth: ['Плавная', t => 1 - t * t * (3 - 2 * t)],
  linear: ['Линейная', t => 1 - t],
  convex: ['Выпуклая', t => 1 - t * t],
  concave: ['Вогнутая', t => (1 - t) * (1 - t)],
};
const MODES = { max: 'Максимум', add: 'Сложение', sub: 'Вычитание' };
const OPS = { folder: 'Папка', union: 'Объединение', subtract: 'Вычитание', intersect: 'Пересечение' };

/* ===== Объёмы: дерево и поле толщины ===== */
function walk(list, fn, parent = null) {
  for (const n of list) { fn(n, parent); if (n.children) walk(n.children, fn, n); }
}
function findNode(id, list = vols, parent = null) {
  for (const n of list) {
    if (n.id === id) return { n, list, parent };
    if (n.children) { const r = findNode(id, n.children, n); if (r) return r; }
  }
  return null;
}
const defMod = () => ({ on: true, thick: 0.6, blend: 1.5, fall: false, curve: 'smooth', mode: 'max' });
// старые файлы: затухание было числом (мм наружу) — теперь это переключатель «к краю»
function migrateVols(list) {
  walk(list, n => {
    if (typeof n.mod.fall !== 'boolean') n.mod.fall = false;
    if (!CURVES[n.mod.curve]) n.mod.curve = 'smooth';
  });
  return list;
}
function newShape(type, pos) {
  const id = volId++;
  return { id, kind: 'shape', type, name: `${PRIM[type].name} ${id}`, pos: [...pos], rot: [0, 0, 0],
           dims: { ...PRIM[type].dims }, hidden: false, mod: defMod() };
}
function newGroup(children) {
  const id = volId++;
  return { id, kind: 'group', name: `Группа ${id}`, op: 'folder', k: 0, children, hidden: false, mod: defMod() };
}
// узел — самостоятельный модификатор, если все его предки — папки и сам он не папка
function isModRoot(id) {
  const chain = [];
  let f = findNode(id);
  if (!f) return false;
  const n = f.n;
  while (f.parent) { chain.push(f.parent); f = findNode(f.parent.id); }
  return chain.every(g => g.op === 'folder') && !(n.kind === 'group' && n.op === 'folder');
}
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function invRotFn(rx, ry, rz) {
  const fz = rotFn(0, 0, -rz), fy = rotFn(0, -ry, 0), fx = rotFn(-rx, 0, 0);
  return p => fx(fy(fz(p)));
}
function nodeSdf(n) {
  if (n.kind === 'shape') {
    const inv = invRotFn(...n.rot.map(a => a * R2D)), c = n.pos, d = n.dims, f = PRIM[n.type].sdf;
    return p => f(inv(sub(p, c)), d);
  }
  const ch = n.children.filter(c => !c.hidden).map(nodeSdf);
  if (!ch.length) return () => 1e9;
  const op = n.op === 'folder' ? 'union' : n.op, k = Math.max(n.k || 0, 0);
  return p => {
    let v = ch[0](p);
    for (let i = 1; i < ch.length; i++) {
      const b = ch[i](p);
      v = op === 'union' ? smin(v, b, k) : op === 'intersect' ? -smin(-v, -b, k) : -smin(-v, b, k);
    }
    return v;
  };
}
function collectMods(list = vols, out = []) {
  for (const n of list) {
    if (n.hidden) continue;
    if (n.kind === 'group' && n.op === 'folder') collectMods(n.children, out);
    else if (n.mod.on && (n.mod.thick > 0 || n.mod.mode !== 'max')) {
      const f = nodeSdf(n);
      out.push({ ...n.mod, f, depth: n.mod.fall ? maxDepth(n, f) : 0 });
    }
  }
  return out;
}
// наибольшая глубина внутри формы (−min SDF): сетка 20³ по габаритам каркаса + 3 уточнения.
// У полупространства глубина не ограничена — берётся половина размера рамки.
function maxDepth(n, f) {
  if (n.kind === 'shape' && n.type === 'half') return n.dims.s / 2;
  const pts = nodeWires(n).flat();
  if (!pts.length) return 0;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  let best = Infinity, bp = mid(lo, hi);
  for (let round = 0, G = 20; round < 4; round++, G = 6) {
    const st = sub(hi, lo).map(v => v / G);
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) for (let k = 0; k <= G; k++) {
      const p = [lo[0] + i * st[0], lo[1] + j * st[1], lo[2] + k * st[2]], d = f(p);
      if (d < best) { best = d; bp = p; }
    }
    lo = sub(bp, st); hi = add(bp, st);      // уточнение вокруг лучшей точки
  }
  return Math.max(-best, 0);
}
// «мясо» в точке: r — толщина (радиус) стержня, k — радиус сращивания соседних стержней.
// Действует только внутри объёма. Без затухания — полные значения во всём объёме;
// с затуханием — максимум в самой глубокой точке и спад по кривой до нуля на поверхности.
function fieldAt(p, mods) {
  let r = 0, k = 0;
  for (const m of mods) {
    const d = m.f(p);
    if (d >= 0) continue;
    const w = m.fall && m.depth > 0 ? CURVES[m.curve][1](clamp(1 + d / m.depth, 0, 1)) : 1, v = m.thick * w;
    r = m.mode === 'add' ? r + v : m.mode === 'sub' ? r - v : Math.max(r, v);
    k = Math.max(k, (m.blend || 0) * w);
  }
  return [Math.max(r, 0), k];
}
// сэмплы вдоль ребра: пары (r, k), всего n + 1 точек
function edgeField(e, n, mods) {
  const out = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) out.set(fieldAt(lerp(e.a, e.b, i / n), mods), i * 2);
  return out;
}
let meat = new Map(), fieldTimer = 0, geomVer = 0;
// пересчёт толщины для экрана (8 отрезков на ребро) и запуск чернового тела
function fieldDirty() {
  geomVer++;
  clearTimeout(fieldTimer);
  fieldTimer = setTimeout(() => {
    const mods = collectMods();
    meat = new Map();
    if (mods.length) for (const e of edges) {
      const f = edgeField(e, 8, mods);
      if (f.some((v, i) => !(i & 1) && v > 0)) meat.set(e, f);
    }
    requestDraw();
    bodyDirty();
  }, 30);
}
function nodeWires(n, off = 0) {   // каркас узла в мировых координатах
  if (n.kind === 'group') return n.children.filter(c => !c.hidden).flatMap(c => nodeWires(c, 0));
  const rot = rotFn(...n.rot.map(a => a * R2D));
  return PRIM[n.type].wire(n.dims, off).map(pl => pl.map(p => add(rot(p), n.pos)));
}
