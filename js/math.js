'use strict';
/* ===== Утилиты и векторная математика ===== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mid = (a, b) => lerp(a, b, 0.5);
const dist = (a, b) => len(sub(a, b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const keyP = p => p.map(v => Math.round(v * 1e4)).join(',');
const keyE = (a, b) => { const x = keyP(a), y = keyP(b); return x < y ? x + '|' + y : y + '|' + x; };
const fmt = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2).replace(/\.?0+$/, '');
