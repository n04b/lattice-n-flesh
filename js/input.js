'use strict';
/* ===== Мышь и клавиатура ===== */
let drag = null;
addEventListener('contextmenu', e => e.preventDefault());   // меню браузера отключено на всей странице
cv.addEventListener('pointerdown', e => {
  const x = e.offsetX, y = e.offsetY;
  let mode = null;
  if (e.button === 1 || (e.button === 2 && e.shiftKey) || (e.button === 0 && e.altKey && e.shiftKey)) mode = 'pan';
  else if (e.button === 2 || (e.button === 0 && e.altKey)) mode = 'orbit';
  else if (e.button === 0) mode = 'left';
  if (!mode) return;
  e.preventDefault();
  cv.setPointerCapture(e.pointerId);
  drag = { mode, x, y, sx: x, sy: y, moved: false, btn: e.button };
});
cv.addEventListener('pointermove', e => {
  const x = e.offsetX, y = e.offsetY;
  ed.mouse = [x, y]; ed.shift = e.shiftKey;
  if (drag) {
    const dx = x - drag.x, dy = y - drag.y;
    drag.x = x; drag.y = y;
    if (Math.hypot(x - drag.sx, y - drag.sy) > 4) drag.moved = true;
    if (drag.mode === 'orbit') {
      cam.yaw -= dx * 0.008;
      cam.pitch = clamp(cam.pitch + dy * 0.008, -1.5707, 1.5707);
      return requestDraw();
    }
    if (drag.mode === 'pan') {
      updateCam();
      const k = cam.dist / focal;
      cam.target = add(cam.target, add(mul(right, -dx * k), mul(up, dy * k)));
      return requestDraw();
    }
    if (opt.tool === 'select' && drag.moved) { ed.box = [drag.sx, drag.sy, x, y]; return requestDraw(); }
  }
  hover(x, y);
});
cv.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag, x = e.offsetX, y = e.offsetY;
  drag = null;
  if (d.mode === 'left') {
    if (opt.tool === 'select') {
      if (opt.layer === 'vol') {
        if (ed.box) { boxSelectVols(d.sx, d.sy, x, y, e.shiftKey); ed.box = null; }
        else clickVol(volAt(x, y), e.shiftKey);
      } else if (ed.box) { boxSelect(d.sx, d.sy, x, y, e.shiftKey); ed.box = null; }
      else {
        const h = edgeAt(x, y);
        if (!e.shiftKey) sel.clear();
        if (h && e.shiftKey && sel.has(h)) sel.delete(h);
        else if (h) sel.add(h);
      }
      updateSelInfo();
    } else toolClick(x, y);
  } else if (d.btn === 2 && !d.moved) cancelOp();   // ПКМ без движения — отмена
  hover(x, y);
});
cv.addEventListener('pointercancel', () => { drag = null; ed.box = null; requestDraw(); });
cv.addEventListener('pointerleave', () => {
  if (drag) return;
  ed.mouse = ed.pick = ed.hoverEdge = null; ed.cands = [];
  $('#st-xyz').textContent = '—';
  requestDraw();
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  updateCam();
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  const nd = clamp(cam.dist * Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)), 0.3, 5000), k = nd / cam.dist;
  // точка под курсором остаётся на месте
  const r = rayAt(e.offsetX, e.offsetY), P = add(eye, mul(r.d, cam.dist / dot(r.d, fwd)));
  cam.target = add(P, mul(sub(cam.target, P), k));
  cam.dist = nd;
  refreshHover();
}, { passive: false });
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'Shift') { ed.shift = true; return refreshHover(); }
  if (e.code === 'Tab') { e.preventDefault(); return setLayer(opt.layer === 'lat' ? 'vol' : 'lat'); }
  const mod = e.ctrlKey || e.metaKey;   // e.code — чтобы клавиши работали в русской раскладке
  const act = mod
    ? { KeyZ: () => e.shiftKey ? redo() : undo(), KeyY: redo, KeyA: selectAll, KeyS: saveFile,
        KeyG: () => opt.layer === 'vol' && (e.shiftKey ? ungroupVols() : groupVols()) }[e.code]
    : { KeyV: () => setTool('select'), KeyL: () => setTool('line'), KeyM: () => setTool('move'), KeyC: () => setTool('copy'),
        Digit1: () => setPlane('xz'), Digit2: () => setPlane('xy'), Digit3: () => setPlane('yz'), KeyF: fitView,
        Escape: cancelOp, Enter: () => { resetOp(); refreshHover(); }, Delete: deleteSel, Backspace: deleteSel }[e.code];
  if (act) { e.preventDefault(); act(); }
});
addEventListener('keyup', e => { if (e.key === 'Shift') { ed.shift = false; refreshHover(); } });
addEventListener('blur', () => { ed.shift = false; });
