'use strict';
/* ===== Многогранники (ребро = 1) ===== */
const PHI = (1 + Math.sqrt(5)) / 2;
function signs(v) {   // все варианты знаков, нули не дублируются
  let out = [[]];
  for (const c of v) {
    const n = [];
    for (const o of out) { n.push([...o, c]); if (c) n.push([...o, -c]); }
    out = n;
  }
  return out;
}
const cyc = ([a, b, c]) => [[a, b, c], [c, a, b], [b, c, a]];
const perms = ([a, b, c]) => [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
const even = s => s[0] * s[1] * s[2] > 0;   // чётное число минусов
function pts(bases, pf = v => [v], filter = null) {
  const m = new Map();
  for (const b of bases) for (const q of pf(b)) for (const s of signs(q)) if (!filter || filter(s)) m.set(keyP(s), s);
  return [...m.values()];
}
function byDist(V, d, scale = 1) {
  const E = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++)
    if (Math.abs(dist(V[i], V[j]) - d) < d * 1e-3) E.push([i, j]);
  return { V: V.map(p => mul(p, scale)), E };
}
// рёбра — пары вершин на минимальном расстоянии (верно для правильных и архимедовых тел)
function byMin(V) {
  let m = Infinity;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) m = Math.min(m, dist(V[i], V[j]));
  return byDist(V, m, 1 / m);
}
const ngon = (n, R, y, a0 = 0) => Array.from({ length: n }, (_, i) => {
  const a = a0 + i * 2 * Math.PI / n;
  return [R * Math.cos(a), y, R * Math.sin(a)];
});
const ring = (n, o) => Array.from({ length: n }, (_, i) => [o + i, o + (i + 1) % n]);
const spokes = (n, o, f) => Array.from({ length: n }, (_, i) => [o + i, f(i)]);
const circR = n => 0.5 / Math.sin(Math.PI / n);   // радиус n-угольника с ребром 1
function prism(n) {
  const R = circR(n);
  return { V: [...ngon(n, R, -0.5), ...ngon(n, R, 0.5)],
           E: [...ring(n, 0), ...ring(n, n), ...spokes(n, 0, i => n + i)] };
}
function antiprism(n) {
  const R = circR(n), c = 2 * R * Math.sin(Math.PI / (2 * n)), h = Math.sqrt(Math.max(1 - c * c, 0.01));
  return { V: [...ngon(n, R, -h / 2), ...ngon(n, R, h / 2, Math.PI / n)],
           E: [...ring(n, 0), ...ring(n, n), ...spokes(n, 0, i => n + i), ...spokes(n, 0, i => n + (i + n - 1) % n)] };
}
function pyramid(n, both) {
  const R = circR(n), h = R < 1 ? Math.sqrt(1 - R * R) : R * 0.8;
  const V = [...ngon(n, R, 0), [0, h, 0]], E = [...ring(n, 0), ...spokes(n, 0, () => n)];
  if (both) { V.push([0, -h, 0]); E.push(...spokes(n, 0, () => n + 1)); }
  return { V, E };
}
function compact(V, E) {   // убрать вершины без рёбер
  const m = new Map(), NV = [];
  const id = i => { if (!m.has(i)) { m.set(i, NV.length); NV.push(V[i]); } return m.get(i); };
  return { V: NV, E: E.map(([i, j]) => [id(i), id(j)]) };
}
// геодезическая сфера радиуса 1: грани икосаэдра делятся на f² треугольников
function geodesic(f, dome) {
  const ico = byMin(pts([[0, 1, PHI]], cyc));
  const a = -Math.atan2(PHI, 1), ca = Math.cos(a), sa = Math.sin(a);
  const V0 = ico.V.map(([x, y, z]) => norm([x, y * ca - z * sa, y * sa + z * ca]));   // вершиной вверх
  const adj = V0.map(() => new Set());
  ico.E.forEach(([i, j]) => { adj[i].add(j); adj[j].add(i); });
  const V = [], idx = new Map(), E = [], ek = new Set();
  const vid = p => { p = norm(p); const k = keyP(p); if (!idx.has(k)) { idx.set(k, V.length); V.push(p); } return idx.get(k); };
  const edge = (i, j) => { const k = Math.min(i, j) + '_' + Math.max(i, j); if (!ek.has(k)) { ek.add(k); E.push([i, j]); } };
  for (const [i, j] of ico.E) for (const k of adj[i]) {
    if (k <= j || !adj[j].has(k)) continue;   // каждая грань i<j<k один раз
    const A = V0[i], B = V0[j], C = V0[k], g = [];
    for (let u = 0; u <= f; u++) {
      g[u] = [];
      for (let v = 0; u + v <= f; v++) g[u][v] = vid(add(A, add(mul(sub(B, A), u / f), mul(sub(C, A), v / f))));
    }
    for (let u = 0; u < f; u++) for (let v = 0; u + v < f; v++) {
      edge(g[u][v], g[u + 1][v]); edge(g[u][v], g[u][v + 1]); edge(g[u + 1][v], g[u][v + 1]);
    }
  }
  return dome ? compact(V, E.filter(([i, j]) => V[i][1] > -1e-6 && V[j][1] > -1e-6)) : { V, E };
}
// тессеракт: перспективная проекция 4D-куба
function tesseract() {
  const V = [], E = [];
  for (let i = 0; i < 16; i++) {
    const [x, y, z, w] = [0, 1, 2, 3].map(b => (i >> b & 1) ? 1 : -1);
    V.push(mul([x, y, z], 1 / (3 - w)));
    for (let b = 0; b < 4; b++) if ((i ^ (1 << b)) > i) E.push([i, i ^ (1 << b)]);
  }
  return { V, E };
}
const POLY = {
  tetra:     ['Тетраэдр', () => byMin(pts([[1, 1, 1]], undefined, even))],
  cube:      ['Куб', () => byMin(pts([[1, 1, 1]]))],
  octa:      ['Октаэдр', () => byMin(pts([[1, 0, 0]], cyc))],
  dodeca:    ['Додекаэдр', () => byMin(pts([[1, 1, 1], [0, 1 / PHI, PHI]], cyc))],
  ico:       ['Икосаэдр', () => byMin(pts([[0, 1, PHI]], cyc))],
  cubocta:   ['Кубооктаэдр', () => byMin(pts([[1, 1, 0]], cyc))],
  trtetra:   ['Усечённый тетраэдр', () => byMin(pts([[3, 1, 1]], perms, even))],
  trocta:    ['Усечённый октаэдр', () => byMin(pts([[0, 1, 2]], perms))],
  trcube:    ['Усечённый куб', () => byMin(pts([[Math.SQRT2 - 1, 1, 1]], perms))],
  rhombi:    ['Ромбокубооктаэдр', () => byMin(pts([[1, 1, 1 + Math.SQRT2]], perms))],
  icosid:    ['Икосододекаэдр', () => byMin(pts([[0, 0, PHI], [0.5, PHI / 2, PHI * PHI / 2]], cyc))],
  trico:     ['Усечённый икосаэдр', () => byMin(pts([[0, 1, 3 * PHI], [1, 2 + PHI, 2 * PHI], [PHI, 2, 2 * PHI + 1]], cyc))],
  stella:    ['Звёздчатый октаэдр', () => byDist(pts([[1, 1, 1]]), 2 * Math.SQRT2, 1 / (2 * Math.SQRT2))],
  prism:     ['Призма', q => prism(q.n)],
  antiprism: ['Антипризма', q => antiprism(q.n)],
  pyramid:   ['Пирамида', q => pyramid(q.n, false)],
  bipyr:     ['Бипирамида', q => pyramid(q.n, true)],
  geo:       ['Геодезическая сфера', q => geodesic(q.freq, q.dome)],
  tess:      ['Тессеракт (проекция 4D)', tesseract],
};
