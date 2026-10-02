'use strict';
/* ===== Мешер: неявная поверхность «рёбра + мясо» → треугольники (surface nets) =====
   Функция выполняется внутри Web Worker (запускается через Blob из своего исходного текста),
   поэтому она самодостаточна и не использует ничего снаружи.
   Поле: f(p) = smin по рёбрам (расстояние до отрезка − r(t)); r(t) и радиус сращивания k(t)
   интерполируются по сэмплам ребра. seg: [ax ay az bx by bz rmax kmax смещение число_сэмплов],
   rad: пары (r, k) для каждого сэмпла.
   Сетка обрабатывается слоями по Z; каждый воркер строит свой диапазон плоскостей [z0, z1). */
function mesherWorker() {
  self.onmessage = ({ data: D }) => {
    const { seg, rad, h, k, bmin, nx, ny, z0, z1 } = D;
    const NS = seg.length / 10, BIG = 1e9, C = 8;      // C — размер грубой ячейки в сэмплах
    const cnx = Math.ceil(nx / C), cny = Math.ceil(ny / C);
    // расширенные габариты сегментов в координатах сетки
    const box = new Float32Array(NS * 6);
    for (let s = 0; s < NS; s++) {
      const o = s * 10, m = seg[o + 6] + seg[o + 7] + 3 * h;
      for (let a = 0; a < 3; a++) {
        box[s * 6 + a] = (Math.min(seg[o + a], seg[o + 3 + a]) - m - bmin[a]) / h;
        box[s * 6 + 3 + a] = (Math.max(seg[o + a], seg[o + 3 + a]) + m - bmin[a]) / h;
      }
    }
    // списки сегментов по грубым ячейкам XY для текущей полосы Z (CSR)
    let bandZ = -1, cStart = null, cList = null;
    function buildBand(cz) {
      const zlo = cz * C, zhi = zlo + C, cnt = new Int32Array(cnx * cny + 1), cand = [];
      const rng = s => [Math.max(0, Math.floor(box[s * 6] / C)), Math.min(cnx - 1, Math.floor(box[s * 6 + 3] / C)),
                        Math.max(0, Math.floor(box[s * 6 + 1] / C)), Math.min(cny - 1, Math.floor(box[s * 6 + 4] / C))];
      for (let s = 0; s < NS; s++) {
        if (box[s * 6 + 5] < zlo || box[s * 6 + 2] > zhi) continue;
        const [x0, x1, y0, y1] = rng(s);
        if (x0 > x1 || y0 > y1) continue;
        cand.push(s);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cnt[y * cnx + x + 1]++;
      }
      for (let i = 1; i < cnt.length; i++) cnt[i] += cnt[i - 1];
      const fill = cnt.slice(), list = new Int32Array(cnt[cnt.length - 1]);
      for (const s of cand) {
        const [x0, x1, y0, y1] = rng(s);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list[fill[y * cnx + x]++] = s;
      }
      cStart = cnt; cList = list; bandZ = cz;
    }
    function slice(z, out) {
      const cz = Math.floor(z / C);
      if (cz !== bandZ) buildBand(cz);
      out.fill(BIG);
      const pz = bmin[2] + z * h;
      for (let cy = 0; cy < cny; cy++) for (let cx = 0; cx < cnx; cx++) {
        const s0 = cStart[cy * cnx + cx], s1 = cStart[cy * cnx + cx + 1];
        if (s0 === s1) continue;
        const jEnd = Math.min(ny, cy * C + C), iEnd = Math.min(nx, cx * C + C);
        for (let j = cy * C; j < jEnd; j++) for (let i = cx * C; i < iEnd; i++) {
          const px = bmin[0] + i * h, py = bmin[1] + j * h;
          let v = BIG, kv = k;     // kv — радиус сращивания уже учтённых рёбер
          for (let q = s0; q < s1; q++) {
            const o = cList[q] * 10;
            const ax = seg[o], ay = seg[o + 1], az = seg[o + 2];
            const dx = seg[o + 3] - ax, dy = seg[o + 4] - ay, dz = seg[o + 5] - az;
            const l2 = dx * dx + dy * dy + dz * dz;
            let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = px - ax - t * dx, ey = py - ay - t * dy, ez = pz - az - t * dz;
            const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (dist - seg[o + 6] >= v + Math.max(kv, seg[o + 7])) continue;   // заведомо не влияет
            const n = seg[o + 9], off = seg[o + 8], f = t * (n - 1), i0 = Math.min(Math.floor(f), n - 2), u = f - i0;
            const a2 = (off + i0) * 2, r = rad[a2] + (rad[a2 + 2] - rad[a2]) * u;
            const kk = Math.max(kv, rad[a2 + 1] + (rad[a2 + 3] - rad[a2 + 1]) * u), d = dist - r;
            const gap = Math.abs(v - d);
            if (gap >= kk) { if (d < v) { v = d; kv = kk; } continue; }
            const w = (kk - gap) / kk;
            v = Math.min(v, d) - w * w * kk * 0.25; kv = kk;
          }
          out[j * nx + i] = v;
        }
      }
    }
    // вершины ячеек слоя z (между плоскостями z и z+1): среднее точек пересечения рёбер ячейки
    const P = [], N = [];
    const CE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const c = new Float64Array(8);
    function cells(z, A, B, idx) {
      idx.fill(-1);
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        let neg = 0;
        for (let b = 0; b < 8; b++) {
          c[b] = (b & 4 ? B : A)[(j + (b >> 1 & 1)) * nx + i + (b & 1)];
          if (c[b] < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0, sy = 0, sz = 0, m = 0;
        for (const [a, b] of CE) {
          if ((c[a] < 0) === (c[b] < 0)) continue;
          const t = c[a] / (c[a] - c[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * t;
          sz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * t;
          m++;
        }
        const gx = c[1] + c[3] + c[5] + c[7] - c[0] - c[2] - c[4] - c[6];
        const gy = c[2] + c[3] + c[6] + c[7] - c[0] - c[1] - c[4] - c[5];
        const gz = c[4] + c[5] + c[6] + c[7] - c[0] - c[1] - c[2] - c[3];
        const gl = Math.hypot(gx, gy, gz) || 1;
        idx[j * nx + i] = P.length / 3;
        P.push(bmin[0] + (i + sx / m) * h, bmin[1] + (j + sy / m) * h, bmin[2] + (z + sz / m) * h);
        N.push(gx / gl, gy / gl, gz / gl);
      }
    }
    const T = [];      // индексы вершин треугольников
    function quad(a, b, c2, d, inside0) {   // inside0: внутри у начала ребра → нормаль вдоль оси
      if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
      if (inside0) T.push(a, b, c2, a, c2, d); else T.push(a, c2, b, a, d, c2);
    }
    const S = nx * ny;
    let A = new Float32Array(S), B = new Float32Array(S), Cn = new Float32Array(S);
    let prev = new Int32Array(S), cur = new Int32Array(S);
    slice(z0 - 1, A); slice(z0, B);
    cells(z0 - 1, A, B, prev);
    [A, B] = [B, A];                         // A — плоскость z, B — свободный буфер
    for (let z = z0; z < z1; z++) {
      slice(z + 1, Cn);
      cells(z, A, Cn, cur);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const id = j * nx + i, v0 = A[id], in0 = v0 < 0;
        if (i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && in0 !== (Cn[id] < 0))         // ребро по Z
          quad(cur[id - nx - 1], cur[id - nx], cur[id], cur[id - 1], in0);
        if (i < nx - 1 && j > 0 && j < ny - 1 && in0 !== (A[id + 1] < 0))                 // ребро по X
          quad(prev[id - nx], prev[id], cur[id], cur[id - nx], in0);
        if (j < ny - 1 && i > 0 && i < nx - 1 && in0 !== (A[id + nx] < 0))                // ребро по Y
          quad(prev[id - 1], cur[id - 1], cur[id], prev[id], in0);
      }
      [A, Cn] = [Cn, A];
      [prev, cur] = [cur, prev];
      if ((z - z0) % 8 === 0) self.postMessage({ progress: (z - z0 + 1) / (z1 - z0) });
    }
    const pos = new Float32Array(T.length * 3), nrm = new Float32Array(T.length * 3);
    for (let i = 0; i < T.length; i++) {
      const v = T[i] * 3;
      pos[i * 3] = P[v]; pos[i * 3 + 1] = P[v + 1]; pos[i * 3 + 2] = P[v + 2];
      nrm[i * 3] = N[v]; nrm[i * 3 + 1] = N[v + 1]; nrm[i * 3 + 2] = N[v + 2];
    }
    self.postMessage({ pos, nrm }, [pos.buffer, nrm.buffer]);
  };
}
