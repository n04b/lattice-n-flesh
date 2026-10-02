'use strict';
/* ===== Тело: построение в воркерах, просмотр в WebGL, экспорт STL ===== */
const body = { mesh: null, workers: [], timer: 0, job: 0, resolve: null };
const workerURL = URL.createObjectURL(new Blob([`(${mesherWorker})()`], { type: 'text/javascript' }));
const MAX_SLICE = 16e6;     // сэмплов в одном слое Z

function bodyParams() {
  return { res: Math.max(parseFloat($('#b-res').value) || 0.2, 0.01), k: Math.max(parseFloat($('#b-smooth').value) || 0, 0) };
}
const bodyShown = () => $('#b-show').checked && body.mesh && body.mesh.count > 0;
const bodyFresh = () => body.mesh && body.mesh.ver === geomVer;
function bodyDirty() {
  if (body.busyVer === geomVer || bodyFresh()) return;   // тело для этой версии уже есть или строится
  clearTimeout(body.timer);
  if ($('#b-auto').checked) body.timer = setTimeout(() => buildBody(false), 300);
  else if (body.mesh) $('#b-info').textContent = 'Тело устарело — нажмите «Построить»';
}
function stopBuild() {
  body.workers.forEach(w => w.terminate()); body.workers = [];
  if (body.resolve) { body.resolve(null); body.resolve = null; }
  body.busyVer = -1;   // прерванная сборка завершается с null
}
const setBar = f => { $('#b-bar').style.width = (f * 100).toFixed(1) + '%'; };

// final = false — черновик (не мельче 1/110 габарита), true — с заданным разрешением
function buildBody(final) {
  stopBuild();
  clearTimeout(body.timer);
  const job = ++body.job, ver = geomVer, t0 = performance.now();
  const mods = collectMods(), { res, k } = bodyParams();
  const finish = (mesh, info) => {
    body.mesh = mesh; setBar(0);
    $('#b-info').textContent = info;
    glUpload(mesh); requestDraw();
    return mesh;
  };
  // активные рёбра и общие габариты
  const act = [], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let rMax = 0, kMax = k;
  if (mods.length) for (const e of edges) {
    const f = edgeField(e, clamp(Math.ceil(dist(e.a, e.b) / res / 2), 8, 128), mods);
    let m = 0, km = k;
    for (let i = 0; i < f.length; i += 2) { m = Math.max(m, f[i]); km = Math.max(km, f[i + 1]); }
    if (m <= 0) continue;
    act.push({ e, f, m, km }); rMax = Math.max(rMax, m); kMax = Math.max(kMax, km);
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], e.a[i], e.b[i]); mx[i] = Math.max(mx[i], e.a[i], e.b[i]); }
  }
  if (!act.length) return Promise.resolve(finish(null, mods.length ? 'Ни одно ребро не попало в объёмы' : 'Добавьте объёмы в слое «Объёмы»'));
  const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + 2 * rMax;
  const h = final ? res : Math.max(res, ext / 110), pad = rMax + kMax + 3 * h;
  const bmin = mn.map(v => v - pad), n = mx.map((v, i) => Math.ceil((v + pad - bmin[i]) / h) + 1);
  if (n[0] * n[1] > MAX_SLICE) return Promise.resolve(finish(body.mesh, `Слишком мелкое разрешение для такого размера (${n.join('×')})`));
  // упаковка: [ax ay az bx by bz rmax kmax смещение число_сэмплов] + пары (r, k)
  const seg = new Float32Array(act.length * 10), rad = new Float32Array(act.reduce((s, a) => s + a.f.length, 0));
  let off = 0;
  act.forEach(({ e, f, m, km }, i) => {
    for (let j = 1; j < f.length; j += 2) f[j] = Math.max(f[j], k);   // глобальное скругление — минимум
    seg.set([...e.a, ...e.b, m, km, off / 2, f.length / 2], i * 10);
    rad.set(f, off); off += f.length;
  });
  const planes = n[2] - 2, W = clamp(Math.min((navigator.hardwareConcurrency || 4) - 1, Math.floor(planes / 12)), 1, 8);
  const prog = new Array(W).fill(0), parts = new Array(W);
  $('#b-info').textContent = `Построение${final ? '' : ' (черновик)'}: сетка ${n.join('×')}, шаг ${fmt(h)} мм…`;
  return new Promise(resolve => {
    body.resolve = resolve; body.busyVer = ver;
    let left = W;
    for (let w = 0; w < W; w++) {
      const z0 = 1 + Math.floor(planes * w / W), z1 = 1 + Math.floor(planes * (w + 1) / W);
      const wk = new Worker(workerURL);
      body.workers.push(wk);
      wk.onmessage = ({ data }) => {
        if (job !== body.job) return resolve(null);
        if (data.progress !== undefined) { prog[w] = data.progress; setBar(prog.reduce((a, b) => a + b) / W); return; }
        parts[w] = data; wk.terminate();
        if (--left) return;
        body.workers = []; body.resolve = null; body.busyVer = -1;
        const len3 = parts.reduce((s, p) => s + p.pos.length, 0), pos = new Float32Array(len3), nrm = new Float32Array(len3);
        let o = 0;
        for (const p of parts) { pos.set(p.pos, o); nrm.set(p.nrm, o); o += p.pos.length; }
        const mesh = { pos, nrm, count: len3 / 3, ver, final, h, k };
        const tris = (len3 / 9).toLocaleString('ru');
        resolve(finish(mesh, `${final ? 'Тело' : 'Черновик'}: ${tris} треуг., шаг ${fmt(h)} мм, ${((performance.now() - t0) / 1000).toFixed(1)} с`));
      };
      wk.onerror = err => { if (job === body.job) { stopBuild(); toast('Ошибка построения: ' + err.message); resolve(finish(null, 'Ошибка построения')); } };
      wk.postMessage({ seg, rad, h, k, bmin, nx: n[0], ny: n[1], z0, z1 });
    }
  });
}

/* ----- WebGL ----- */
const gl = $('#gl').getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
let glProg = null, glPos = null, glNrm = null;
function glInit() {
  if (!gl) return;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  glProg = gl.createProgram();
  gl.attachShader(glProg, sh(gl.VERTEX_SHADER, `
    attribute vec3 aP, aN; uniform mat4 uM; uniform vec3 uE; varying vec3 vN, vV;
    void main() { vN = aN; vV = uE - aP; gl_Position = uM * vec4(aP, 1.0); }`));
  gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, `
    precision mediump float; varying vec3 vN, vV;
    void main() {
      vec3 n = normalize(vN), v = normalize(vV), key = normalize(vec3(0.4, 1.0, 0.3));
      if (dot(n, v) < 0.0) n = -n;
      float sp = pow(max(dot(n, normalize(v + key)), 0.0), 40.0);
      vec3 c = vec3(0.82, 0.70, 0.58) * (0.22 + 0.5 * max(dot(n, v), 0.0) + 0.35 * max(dot(n, key), 0.0)) + 0.16 * sp;
      gl_FragColor = vec4(c, 1.0);
    }`));
  gl.linkProgram(glProg);
  glPos = gl.createBuffer(); glNrm = gl.createBuffer();
}
function glUpload(m) {
  if (!gl || !m) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, glPos); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, glNrm); gl.bufferData(gl.ARRAY_BUFFER, m.nrm, gl.STATIC_DRAW);
}
// матрица proj·view в том же виде, что и проекция 2D-слоя (столбцы подряд)
function viewProj() {
  const f = 1 / Math.tan(cam.fov / 2), a = W / H, nr = cam.dist * 0.005, fr = cam.dist * 200;
  const V = [[...right, -dot(right, eye)], [...up, -dot(up, eye)], [...mul(fwd, -1), dot(fwd, eye)], [0, 0, 0, 1]];
  const P = [[f / a, 0, 0, 0], [0, f, 0, 0], [0, 0, (fr + nr) / (nr - fr), 2 * fr * nr / (nr - fr)], [0, 0, -1, 0]];
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += P[r][i] * V[i][c];
    out[c * 4 + r] = s;
  }
  return out;
}
function drawBody() {
  if (!gl) return;
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!bodyShown()) return;
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(glProg);
  gl.uniformMatrix4fv(gl.getUniformLocation(glProg, 'uM'), false, viewProj());
  gl.uniform3fv(gl.getUniformLocation(glProg, 'uE'), eye);
  for (const [name, buf] of [['aP', glPos], ['aN', glNrm]]) {
    const loc = gl.getAttribLocation(glProg, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  }
  gl.drawArrays(gl.TRIANGLES, 0, body.mesh.count);
}

/* ----- STL ----- */
async function exportSTL() {
  const { res, k } = bodyParams();
  let m = body.mesh;
  if (!m || !m.final || m.ver !== geomVer || m.h !== res || m.k !== k) {
    toast('Строю тело с заданным разрешением…');
    m = await buildBody(true);
  }
  if (!m || !m.count) return toast('Нет тела для экспорта');
  const n = m.count / 3, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  const head = 'edge-editor body, units: mm';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  const p = m.pos;
  for (let t = 0, o = 84; t < n; t++, o += 50) {
    const a = t * 9, u = sub([p[a + 3], p[a + 4], p[a + 5]], [p[a], p[a + 1], p[a + 2]]);
    const v = sub([p[a + 6], p[a + 7], p[a + 8]], [p[a], p[a + 1], p[a + 2]]), nn = norm(cross(u, v));
    for (let i = 0; i < 3; i++) dv.setFloat32(o + i * 4, nn[i], true);
    for (let i = 0; i < 9; i++) dv.setFloat32(o + 12 + i * 4, p[a + i], true);
  }
  download('body.stl', buf, 'model/stl');
  toast(`STL сохранён: ${n.toLocaleString('ru')} треугольников`);
}
