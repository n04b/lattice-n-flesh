'use strict';
/* ===== Панели ===== */
$$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$$('[data-plane]').forEach(b => b.onclick = () => setPlane(b.dataset.plane));
$$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$$('[data-snap]').forEach(b => b.onclick = () => {
  const k = b.dataset.snap; opt.snap[k] = !opt.snap[k];
  b.classList.toggle('on', opt.snap[k]); refreshHover();
});
$('#b-undo').onclick = () => undo();
$('#b-redo').onclick = () => redo();
$('#b-del').onclick = () => deleteSel();
$('#b-save').onclick = () => saveFile();
$('#b-obj').onclick = () => exportOBJ();
$('#b-open').onclick = () => $('#file').click();
$('#b-clear').onclick = () => {
  if (!edges.length || !confirm('Удалить все рёбра?')) return;
  pushHist(); edges = []; sel.clear(); resetOp(); changed();
};
$('#grid-step').oninput = e => { const v = parseFloat(e.target.value); if (v > 0) { opt.grid = v; refreshHover(); } };
$('#plane-off').oninput = e => { opt.planeOff = parseFloat(e.target.value) || 0; refreshHover(); };
$('#chain').onchange = e => { opt.chain = e.target.checked; };
