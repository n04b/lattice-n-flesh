'use strict';
/* ===== Файлы ===== */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function saveFile() {
  download('edges.json', JSON.stringify({ format: 'edge-editor', version: 2, edges: edges.map(e => [e.a, e.b]), vols }), 'application/json');
}
function exportOBJ() {
  if (!edges.length) return toast('Сцена пуста');
  const idx = new Map(), vs = [], ls = [];
  const vi = p => {
    const k = keyP(p);
    if (!idx.has(k)) { idx.set(k, vs.length + 1); vs.push('v ' + p.map(v => +v.toFixed(5)).join(' ')); }
    return idx.get(k);
  };
  for (const e of edges) ls.push(`l ${vi(e.a)} ${vi(e.b)}`);
  download('edges.obj', `# edge editor: ${vs.length} vertices, ${ls.length} lines\n${vs.join('\n')}\n${ls.join('\n')}\n`, 'text/plain');
}
// OBJ: берутся линии (l) и контуры граней (f) — грани превращаются в рёбра
function parseOBJ(text) {
  const V = [], out = [];
  for (const ln of text.split('\n')) {
    const p = ln.trim().split(/\s+/);
    if (p[0] === 'v') V.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'l' || p[0] === 'f') {
      const ids = p.slice(1).map(s => { const i = parseInt(s, 10); return i < 0 ? V.length + i : i - 1; });
      for (let i = 0; i + 1 < ids.length; i++) out.push([V[ids[i]], V[ids[i + 1]]]);
      if (p[0] === 'f' && ids.length > 2) out.push([V[ids[ids.length - 1]], V[ids[0]]]);
    }
  }
  return out.filter(([a, b]) => a && b);
}
$('#file').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    let list, vl = null;
    if (/\.obj$/i.test(f.name)) list = parseOBJ(text);
    else { const d = JSON.parse(text); list = (Array.isArray(d) ? d : d.edges).map(([a, b]) => [a.map(Number), b.map(Number)]); vl = d.vols; }
    pushHist(); edges = []; sel.clear(); resetOp();
    if (vl) { vols = migrateVols(vl); vsel.clear(); volId = 1; walk(vols, n => { volId = Math.max(volId, n.id + 1); }); renderVolUI(); }
    addEdges(list); changed(); fitView();
    toast(`Загружено рёбер: ${edges.length}`);
  } catch (err) { toast('Не удалось прочитать файл'); }
};
