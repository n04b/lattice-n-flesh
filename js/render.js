'use strict';
/* ===== Отрисовка ===== */
const SNAP_NAME = { end: 'Конец', mid: 'Середина', origin: 'Начало координат', grid: 'Сетка', free: '' };
const AX_COL = ['#f05a5a', '#5ad26e', '#5a8cff'];
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
function seg3(a, b, path) {
  const s = projSeg(a, b);
  if (s) { path.moveTo(s[0], s[1]); path.lineTo(s[2], s[3]); }
}
function strokePath(path, color, width, dash) {
  ctx.setLineDash(dash || []); ctx.lineWidth = width; ctx.strokeStyle = color;
  ctx.stroke(path); ctx.setLineDash([]);
}
function drawGrid() {
  const ni = PLANE_N[opt.plane], o = planeOrigin(), [ui, vi] = [0, 1, 2].filter(i => i !== ni);
  const ext = Math.max(cam.dist * 1.8, opt.grid * 10);
  let step = opt.grid;
  while (ext / step > 60) step *= 5;
  const n = Math.ceil(ext / step);
  const cu = Math.round(cam.target[ui] / step) * step, cw = Math.round(cam.target[vi] / step) * step;
  const P = (u, v) => { const p = [...o]; p[ui] = u; p[vi] = v; return p; };
  const minor = new Path2D(), major = new Path2D();
  for (let k = -n; k <= n; k++) {
    const u = cu + k * step, v = cw + k * step;
    seg3(P(u, cw - n * step), P(u, cw + n * step), Math.round(u / step) % 5 ? minor : major);
    seg3(P(cu - n * step, v), P(cu + n * step, v), Math.round(v / step) % 5 ? minor : major);
  }
  strokePath(minor, 'rgba(130,140,160,.13)', 1);
  strokePath(major, 'rgba(130,140,160,.3)', 1);
  for (let i = 0; i < 3; i++) {          // мировые оси
    const p = new Path2D(), a = [0, 0, 0], b = [0, 0, 0];
    a[i] = i === 1 ? 0 : -ext; b[i] = ext;
    seg3(a, b, p); strokePath(p, AX_COL[i] + 'aa', 1.3);
  }
}
function drawEdges() {
  const B = 5, buckets = Array.from({ length: B }, () => new Path2D()), selP = new Path2D();
  for (const e of edges) {
    const s = projSeg(e.a, e.b);
    if (!s) continue;
    let p = selP;
    if (!sel.has(e)) {   // дальние рёбра бледнее
      const z = dot(sub(mid(e.a, e.b), eye), fwd) / cam.dist;
      p = buckets[clamp(Math.floor((z - 0.45) * 2.2), 0, B - 1)];
    }
    p.moveTo(s[0], s[1]); p.lineTo(s[2], s[3]);
  }
  ctx.lineCap = 'round';
  const dim = bodyShown() ? 0.35 : 1;           // поверх тела рёбра бледнее
  buckets.forEach((p, k) => strokePath(p, `rgba(214,222,234,${((1 - k * 0.16) * dim).toFixed(2)})`, 1.6));
  strokePath(selP, '#ffae42', 2.4);
}
function marker(s, type, big) {
  const r = big ? 6 : 3.5, [x, y] = s;
  ctx.beginPath();
  if (type === 'mid') { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r, y + r * 0.75); ctx.lineTo(x - r, y + r * 0.75); ctx.closePath(); }
  else if (type === 'end' || type === 'origin') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
  ctx.lineWidth = big ? 2 : 1.2;
  ctx.strokeStyle = type === 'mid' ? '#ff5fa2' : type === 'end' ? '#39d98a' : type === 'origin' ? '#ffd24a' : '#c9d1dd';
  ctx.stroke();
}
function tag(lines, x, y) {
  lines = lines.filter(Boolean);
  if (!lines.length) return;
  ctx.font = '12px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 10, h = lines.length * 16 + 6;
  if (x + w > W) x -= w + 30;
  if (y + h > H) y -= h + 34;
  ctx.fillStyle = 'rgba(17,19,24,.88)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d6dbe3'; lines.forEach((l, i) => ctx.fillText(l, x + 5, y + 4 + i * 16));
}
function drawGizmo() {
  const cx = 46, cy = H - 46, L = 28;
  const items = AX.map((v, i) => ({ x: dot(v, right), y: dot(v, up), z: dot(v, fwd), i })).sort((a, b) => b.z - a.z);
  ctx.font = '600 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of items) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + a.x * L, cy - a.y * L);
    ctx.lineWidth = 2; ctx.strokeStyle = AX_COL[a.i]; ctx.stroke();
    ctx.fillStyle = AX_COL[a.i]; ctx.fillText('XYZ'[a.i], cx + a.x * (L + 10), cy - a.y * (L + 10));
  }
}
function draw() {
  updateCam();
  drawBody();                                   // тело — WebGL-холст между сеткой и линиями
  ctx = gctx;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  drawGrid();
  ctx = octx;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!bodyShown()) drawMeat();
  drawEdges();
  drawVols();
  if (preview.length) {
    const p = new Path2D();
    for (const [a, b] of preview) seg3(a, b, p);
    strokePath(p, 'rgba(95,212,255,.75)', 1.4);
  }
  if (opt.tool === 'select' && ed.hoverEdge && !ed.box) {
    const p = new Path2D(); seg3(ed.hoverEdge.a, ed.hoverEdge.b, p);
    strokePath(p, sel.has(ed.hoverEdge) ? '#ffd9a0' : '#ffffff', 3);
  }
  const pk = ed.pick, ref = ed.start || ed.base, lines = [];
  if (ref && pk) {
    const d = sub(pk.p, ref);
    if (opt.tool === 'move' || opt.tool === 'copy') {   // призрак перемещаемых рёбер или объёмов
      const p = new Path2D();
      if (opt.layer === 'vol') for (const id of vsel) wirePath(nodeWires(findNode(id).n).map(pl => pl.map(q => add(q, d))), p);
      else for (const e of sel) seg3(add(e.a, d), add(e.b, d), p);
      strokePath(p, 'rgba(95,212,255,.9)', 1.6);
    }
    if (pk.type === 'axis') {
      const p = new Path2D(); seg3(sub(ref, mul(AX[pk.axis], 1e4)), add(ref, mul(AX[pk.axis], 1e4)), p);
      strokePath(p, AX_COL[pk.axis] + '88', 1, [6, 5]);
    }
    const p = new Path2D(); seg3(ref, pk.p, p);
    strokePath(p, '#4c9dff', 2, opt.tool === 'line' ? null : [6, 4]);
    const rs = project(ref);
    if (rs) { ctx.beginPath(); ctx.arc(rs[0], rs[1], 3.5, 0, 7); ctx.fillStyle = '#4c9dff'; ctx.fill(); }
    lines.push(`${opt.tool === 'line' ? 'Длина' : 'Смещение'}: ${fmt(len(d))}`);
  }
  if (opt.tool === 'add' && pk) {                       // призрак нового объёма
    const p = new Path2D();
    wirePath(PRIM[opt.addType].wire(PRIM[opt.addType].dims, 0).map(pl => pl.map(q => add(q, pk.p))), p);
    strokePath(p, 'rgba(190,150,255,.6)', 1.2, [4, 4]);
  }
  if (opt.tool !== 'select' && ed.mouse) {
    ctx.globalAlpha = 0.45;
    for (const c of ed.cands) marker(c.s, c.type, false);
    ctx.globalAlpha = 1;
    if (pk) {
      const s = project(pk.p);
      if (s) marker(s, pk.via || pk.type, true);
      lines.unshift(pk.type === 'axis' ? `Ось ${'XYZ'[pk.axis]}${pk.via ? ' · ' + SNAP_NAME[pk.via] : ''}` : SNAP_NAME[pk.type]);
      tag(lines, ed.mouse[0] + 16, ed.mouse[1] + 18);
    }
  }
  if (ed.box) {
    const [x1, y1, x2, y2] = ed.box, crossing = x2 < x1;
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    ctx.fillStyle = crossing ? 'rgba(90,210,130,.08)' : 'rgba(76,157,255,.08)'; ctx.fillRect(x, y, w, h);
    ctx.setLineDash(crossing ? [5, 4] : []); ctx.lineWidth = 1;
    ctx.strokeStyle = crossing ? '#5ad282' : '#4c9dff'; ctx.strokeRect(x + .5, y + .5, w, h); ctx.setLineDash([]);
  }
  if (!edges.length && !preview.length && opt.layer === 'lat') {
    ctx.font = '14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(214,219,227,.45)';
    ctx.fillText('Кликайте по сетке инструментом «Ребро»', W / 2, 44);
    ctx.fillText('или создайте структуру в генераторе', W / 2, 64);
  }
  drawGizmo();
}
function wirePath(polys, path) {
  for (const pl of polys) for (let i = 0; i + 1 < pl.length; i++) seg3(pl[i], pl[i + 1], path);
}
// предпросмотр «мяса» без тела: толстые полупрозрачные линии в масштабе толщины
function drawMeat() {
  if (!meat.size) return;
  ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(232,170,120,.28)';
  for (const [e, f] of meat) {
    const n = f.length / 2 - 1;
    for (let i = 0; i < n; i++) {
      const r = (f[i * 2] + f[i * 2 + 2]) / 2;
      if (r <= 0) continue;
      const a = lerp(e.a, e.b, i / n), b = lerp(e.a, e.b, (i + 1) / n), s = projSeg(a, b);
      const z = dot(sub(mid(a, b), eye), fwd);
      if (!s || z <= NEAR) continue;
      ctx.lineWidth = Math.max(1, 2 * r * focal / z);
      ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
    }
  }
}
// каркасы объёмов; в своём слое ярче, плюс пунктир границы затухания у модификаторов
function drawVols() {
  const act = opt.layer === 'vol';
  const rec = (list, selected, root) => {
    for (const n of list) {
      if (n.hidden) continue;
      const s = selected || vsel.has(n.id), isRoot = root && !(n.kind === 'group' && n.op === 'folder');
      if (n.kind === 'group') { rec(n.children, s, root && n.op === 'folder'); continue; }
      const p = new Path2D();
      wirePath(nodeWires(n), p);
      const hov = act && ed.hoverVol === n.id;
      strokePath(p, s ? '#ffae42' : hov ? '#efe2ff' : act ? 'rgba(180,140,255,.9)' : 'rgba(180,140,255,.3)', s || hov ? 2 : 1.3);
      if (act && isRoot && n.mod.on && n.mod.fall > 0) {
        const q = new Path2D();
        wirePath(nodeWires(n, n.mod.fall), q);
        strokePath(q, 'rgba(180,140,255,.3)', 1, [4, 5]);
      }
    }
  };
  rec(vols, false, true);
}
