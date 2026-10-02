'use strict';
/* ===== Рабочая плоскость, привязки, выбор ===== */
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const PLANE_N = { xz: 1, xy: 2, yz: 0 };   // индекс оси-нормали плоскости
const SNAP_R = 12;
// плоскость проходит через начальную точку операции, иначе — по смещению
function planeOrigin() {
  const o = [0, 0, 0], ni = PLANE_N[opt.plane], ref = ed.start || ed.base;
  o[ni] = ref ? ref[ni] : opt.planeOff;
  return o;
}
function rayPlane(r, o, ni) {
  if (Math.abs(r.d[ni]) < 1e-9) return null;
  const t = (o[ni] - r.o[ni]) / r.d[ni];
  return t > 0 ? add(r.o, mul(r.d, t)) : null;
}
// ближайшая точка привязки: концы и середины рёбер, начало координат
function findSnap(mx, my) {
  let best = null, bd = SNAP_R;
  const cands = [];
  const test = (p, type, pen) => {
    const s = project(p);
    if (!s) return;
    const d = Math.hypot(s[0] - mx, s[1] - my);
    if (d < 70 && cands.length < 300) cands.push({ s, type });
    if (d + pen < bd) { bd = d + pen; best = { p: [...p], type }; }
  };
  for (const e of edges) {
    if (opt.snap.end) { test(e.a, 'end', 0); test(e.b, 'end', 0); }
    if (opt.snap.mid) test(mid(e.a, e.b), 'mid', 2);
  }
  if (opt.snap.end || opt.snap.grid) test([0, 0, 0], 'origin', 1);
  ed.cands = cands;
  return best;
}
// параметр t точки на прямой P + tD, ближайшей к лучу r
function lineRayT(P, D, r) {
  const w = sub(P, r.o), a = dot(D, D), b = dot(D, r.d), c = dot(r.d, r.d), d = dot(D, w), e = dot(r.d, w);
  const den = a * c - b * b;
  return Math.abs(den) < 1e-12 ? null : (b * e - c * d) / den;
}
// фиксация по оси (Shift): берётся ось, ближайшая к курсору на экране
function axisPick(P, r, mx, my) {
  let best = null, bd = Infinity;
  for (let i = 0; i < 3; i++) {
    const s1 = project(P), s2 = project(add(P, mul(AX[i], cam.dist * 0.05)));
    if (!s1 || !s2) continue;
    const dx = s2[0] - s1[0], dy = s2[1] - s1[1], L = Math.hypot(dx, dy);
    if (L < 0.5) continue;
    const dd = Math.abs((mx - s1[0]) * dy - (my - s1[1]) * dx) / L;
    const t = lineRayT(P, AX[i], r);
    if (t !== null && dd < bd) { bd = dd; best = { i, t }; }
  }
  if (!best) return null;
  const t = opt.snap.grid ? Math.round(best.t / opt.grid) * opt.grid : best.t;
  return { p: add(P, mul(AX[best.i], t)), type: 'axis', axis: best.i };
}
function pickPoint(mx, my) {
  const r = rayAt(mx, my), ref = ed.start || ed.base;
  const s = findSnap(mx, my);
  if (ref && ed.shift) {
    const a = axisPick(ref, r, mx, my);
    if (a) {
      // привязка проецируется на ось — можно дотянуть ребро до уровня другой точки
      if (s) { a.p = add(ref, mul(AX[a.axis], dot(sub(s.p, ref), AX[a.axis]))); a.via = s.type; }
      return a;
    }
  }
  if (s) return s;
  const ni = PLANE_N[opt.plane], p = rayPlane(r, planeOrigin(), ni);
  if (!p) return null;
  if (!opt.snap.grid) return { p, type: 'free' };
  for (let i = 0; i < 3; i++) if (i !== ni) p[i] = Math.round(p[i] / opt.grid) * opt.grid;
  return { p, type: 'grid' };
}
function segDist(px, py, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - s[0]) * dx + (py - s[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - s[0] - t * dx, py - s[1] - t * dy);
}
function edgeAt(mx, my) {
  let best = null, bd = 6;
  for (const e of edges) {
    const s = projSeg(e.a, e.b);
    if (!s) continue;
    const d = segDist(mx, my, s);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
// рамка вправо — ребро целиком внутри, влево — любое пересечение
function boxSelect(x1, y1, x2, y2, additive) {
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
  const crossing = x2 < x1, corners = [[l, t], [r, t], [r, b], [l, b]];
  const inside = (x, y) => x >= l && x <= r && y >= t && y <= b;
  if (!additive) sel.clear();
  for (const e of edges) {
    const s = projSeg(e.a, e.b);
    if (!s) continue;
    const i1 = inside(s[0], s[1]), i2 = inside(s[2], s[3]);
    let hit = i1 && i2;
    if (!hit && crossing) hit = i1 || i2 || corners.some((c, k) => segsCross([s[0], s[1]], [s[2], s[3]], c, corners[(k + 1) % 4]));
    if (hit) sel.add(e);
  }
}
