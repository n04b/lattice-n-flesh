'use strict';
/* ===== Генератор структур ===== */
const MAX_EDGES = 200000;
const gv = id => {
  const el = $('#g-' + id);
  return el.type === 'checkbox' ? el.checked : el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
};
const gi = (id, lo, hi) => clamp(Math.round(gv(id)), lo, hi);
function rotFn(rx, ry, rz) {   // поворот: сначала X, затем Y, затем Z
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return ([x, y, z]) => {
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy, z2 = z1 * cy - x * sy;
    return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
  };
}
function rng(seed) {   // xorshift32
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) | 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function bbox(V) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of V) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return { min, max };
}
// выбранный многогранник: центрирован по габариту, масштабирован и повёрнут
function basePoly() {
  const q = { n: gi('n', 3, 64), freq: gi('freq', 1, 16), dome: gv('dome') };
  const P = POLY[gv('poly')][1](q), bb = bbox(P.V), c = mid(bb.min, bb.max), s = Math.max(gv('size'), 1e-3);
  const rot = rotFn(...['rx', 'ry', 'rz'].map(a => gv(a) * Math.PI / 180));
  return { V: P.V.map(p => rot(mul(sub(p, c), s))), E: P.E };
}
// октет-ферма: узлы ГЦК-решётки, соединённые с 12 ближайшими соседями
function octet(nx, ny, nz, a) {
  const c = a * Math.SQRT2, P = [], out = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
    P.push([i, j, k]);
    if (i < nx && j < ny) P.push([i + 0.5, j + 0.5, k]);
    if (i < nx && k < nz) P.push([i + 0.5, j, k + 0.5]);
    if (j < ny && k < nz) P.push([i, j + 0.5, k + 0.5]);
  }
  const has = new Set(P.map(p => p.join(','))), D = pts([[0.5, 0.5, 0]], cyc), o = [nx / 2, ny / 2, nz / 2];
  for (const p of P) for (const d of D) {
    const q = add(p, d);
    if (has.has(q.join(','))) out.push([mul(sub(p, o), c), mul(sub(q, o), c)]);
  }
  return out;
}
function generate() {
  const struct = gv('struct'), out = [];
  if (struct === 'octet') {
    const nx = gi('nx', 1, 40), ny = gi('ny', 1, 40), nz = gi('nz', 1, 40);
    if ((nx + 1) * (ny + 1) * (nz + 1) * 24 > MAX_EDGES) return { error: 'Слишком большая ферма — уменьшите количество' };
    out.push(...octet(nx, ny, nz, Math.max(gv('size'), 1e-3)));
  } else {
    const P = basePoly(), bb = bbox(P.V), ext = sub(bb.max, bb.min);
    const place = (off, s = 1, rot = null) => {
      const f = p => add(rot ? rot(mul(p, s)) : mul(p, s), off);
      for (const [i, j] of P.E) out.push([f(P.V[i]), f(P.V[j])]);
    };
    const n = gi('count', 1, 2000), R = gv('radius'), L = gi('levels', 0, 8);
    const nx = gi('nx', 1, 40), ny = gi('ny', 1, 40), nz = gi('nz', 1, 40);
    const copies = { single: 1, grid: nx * ny * nz, fractal: Math.pow(P.V.length, L) }[struct] || n;
    if (copies * P.E.length > MAX_EDGES)
      return { error: `Слишком много рёбер (~${Math.round(copies * P.E.length).toLocaleString('ru')}) — уменьшите параметры` };
    if (struct === 'single') place([0, 0, 0]);
    else if (struct === 'grid') {
      const st = mul(ext, Math.max(gv('step'), 0.01));
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
        place([(i - (nx - 1) / 2) * st[0], (j - (ny - 1) / 2) * st[1], (k - (nz - 1) / 2) * st[2]]);
    } else if (struct === 'ring') {
      for (let i = 0; i < n; i++) {
        const a = i * 2 * Math.PI / n;
        place([R * Math.cos(a), 0, R * Math.sin(a)], 1, gv('face') ? rotFn(0, -a, 0) : null);
      }
    } else if (struct === 'helix') {
      const turns = gv('turns'), h = gv('height'), se = Math.max(gv('scale'), 0.01);
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0, a = t * turns * 2 * Math.PI;
        place([R * Math.cos(a), t * h, R * Math.sin(a)], 1 + (se - 1) * t, rotFn(0, -a, 0));
      }
    } else if (struct === 'tower') {   // ярусы стоят друг на друге
      const se = Math.max(gv('scale'), 0.01), tw = gv('twist') * Math.PI / 180;
      let y = 0, prev = 0;
      for (let i = 0; i < n; i++) {
        const s = Math.pow(se, n > 1 ? i / (n - 1) : 0);
        if (i) y += ext[1] * (prev + s) / 2;
        place([0, y, 0], s, rotFn(0, i * tw, 0));
        prev = s;
      }
    } else if (struct === 'fractal') {   // уменьшенные копии в вершинах (для тетраэдра — Серпинский)
      const f = clamp(gv('factor'), 0.05, 0.95);
      const rec = (c, s, l) => {
        if (!l) return place(c, s);
        for (const v of P.V) rec(add(c, mul(v, s * (1 - f))), s * f, l - 1);
      };
      rec([0, 0, 0], 1, L);
    } else if (struct === 'random') {
      const r = rng(gi('seed', -1e9, 1e9));
      for (let i = 0; i < n; i++) {
        let p;
        do { p = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; } while (len(p) > 1);
        const s = 0.5 + r() * 0.8, rot = gv('rot') ? rotFn(r() * 6.283, r() * 6.283, r() * 6.283) : null;
        place(mul(p, R), s, rot);
      }
    }
  }
  // перенос в центр, основание на уровень Y, удаление совпадающих рёбер
  let minY = Infinity;
  for (const [a, b] of out) minY = Math.min(minY, a[1], b[1]);
  const off = [gv('cx'), gv('cy') + (gv('ground') && out.length ? -minY : 0), gv('cz')];
  const seen = new Set(), res = [];
  for (const [a, b] of out) {
    const A = add(a, off), B = add(b, off);
    if (dist(A, B) < 1e-6) continue;
    const k = keyE(A, B);
    if (!seen.has(k)) { seen.add(k); res.push([A, B]); }
  }
  return { edges: res };
}
function updGen() {
  const s = gv('struct'), p = gv('poly');
  $$('#gen [data-s]').forEach(el => {
    const l = el.dataset.s, has = l.replace('!', '').split(' ').includes(s);
    el.hidden = l[0] === '!' ? has : !has;
  });
  $$('#gen [data-p]').forEach(el => { el.hidden = s === 'octet' || !el.dataset.p.split(' ').includes(p); });
  $('#g-size-l').textContent = s === 'octet' ? 'Длина стержня' : p === 'geo' ? 'Радиус' : 'Длина ребра';
}
let genTimer = 0;
function schedulePreview() {
  clearTimeout(genTimer);
  genTimer = setTimeout(() => {
    const r = generate();
    $('#g-info').textContent = r.error || `Рёбер в структуре: ${r.edges.length}`;
    preview = !r.error && gv('preview') ? r.edges : [];
    requestDraw();
  }, 50);
}
$('#gen').addEventListener('input', () => { updGen(); schedulePreview(); });
$('#g-make').onclick = () => {
  const r = generate();
  if (r.error) return toast(r.error);
  const wasEmpty = !edges.length;
  pushHist();
  if (gv('replace')) edges = [];
  sel.clear(); resetOp();
  const added = addEdges(r.edges);
  if (gv('select')) added.forEach(e => sel.add(e));
  preview = [];
  changed();
  if (wasEmpty || gv('replace')) fitView();
  toast(`Создано рёбер: ${added.length}`);
};
