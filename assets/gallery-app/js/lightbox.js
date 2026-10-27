// 2D lightbox：FLIP 開啟、鍵盤（← → Esc）、swipe、focus trap、漸進載入大圖。
// Browse / Map / Museum 共用；originFor(photo) 回傳縮圖元素時做 FLIP，否則淡入。
import { src } from './data.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let ui = null;      // DOM 只建一次
let S = null;       // 當前 session：{ list, i, origin, originFor, onChange, onClose, img, rect, closing, returnFocus, inerted }

function buildUI() {
  const root = document.createElement('div');
  root.className = 'gx-lb';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'gxLbTitle');
  root.innerHTML =
    '<div class="gx-lb-backdrop"></div>' +
    '<div class="gx-lb-cap" aria-live="polite">' +
      '<h2 id="gxLbTitle"></h2>' +
      '<div class="meta"></div>' +
      '<div class="row2"><span class="count"></span><a class="orig" target="_blank" rel="noopener">Original <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a></div>' +
    '</div>' +
    '<button type="button" class="gx-lb-btn gx-lb-prev" aria-label="Previous photo"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>' +
    '<button type="button" class="gx-lb-btn gx-lb-next" aria-label="Next photo"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>' +
    '<button type="button" class="gx-lb-btn gx-lb-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>';
  document.body.appendChild(root);
  const q = s => root.querySelector(s);
  ui = {
    root, backdrop: q('.gx-lb-backdrop'), title: q('h2'), meta: q('.meta'),
    count: q('.count'), orig: q('.orig'),
    prev: q('.gx-lb-prev'), next: q('.gx-lb-next'), close: q('.gx-lb-close')
  };
  ui.backdrop.addEventListener('click', close);
  ui.close.addEventListener('click', close);
  ui.prev.addEventListener('click', () => step(-1));
  ui.next.addEventListener('click', () => step(1));
}

function capReserve() { return innerWidth < 576 ? 210 : 140; }

function fitRect(p) {
  const vw = innerWidth, vh = innerHeight, reserve = capReserve();
  const maxW = Math.min(vw * (vw < 576 ? .96 : .86), 1600);
  const maxH = Math.max(vh - reserve - 32, 160);
  const r = Math.min(maxW / p.w, maxH / p.h);
  const w = Math.round(p.w * r), h = Math.round(p.h * r);
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - reserve - h) / 2 + 16), w, h };
}

function flip(from, to) {
  return 'translate(' + (from.left - to.x) + 'px,' + (from.top - to.y) + 'px) scale(' + (from.width / to.w) + ',' + (from.height / to.h) + ')';
}

function makeImg(p, rect, thumbSrc) {
  const img = document.createElement('img');
  img.className = 'gx-lb-img';
  img.alt = p.title;
  img.src = thumbSrc || src(p, 480);
  img.draggable = false;
  Object.assign(img.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  // 依顯示尺寸挑合適的衍生圖，載好再換，避免空白閃爍
  const want = src(p, rect.w * Math.min(devicePixelRatio || 1, 2));
  if (!img.src.endsWith(want)) {
    const pre = new Image();
    pre.onload = () => { if (img.isConnected) img.src = want; };
    pre.src = want;
  }
  attachDrag(img);
  ui.root.insertBefore(img, ui.root.querySelector('.gx-lb-cap'));
  return img;
}

function fillCaption() {
  const p = S.list[S.i];
  ui.title.textContent = p.title;
  ui.meta.innerHTML = '';
  [p.place + ' · ' + p.date, p.camera + ' · ' + p.lens, p.exposure].forEach((t, k) => {
    if (k) ui.meta.appendChild(document.createElement('br'));
    ui.meta.appendChild(document.createTextNode(t));
  });
  ui.count.textContent = (S.i + 1) + ' / ' + S.list.length;
  ui.orig.href = p.file;
  const multi = S.list.length > 1;
  ui.prev.hidden = ui.next.hidden = !multi;
}

export function isOpen() { return !!S; }

export function openLightbox({ list, index, originFor = () => null, onChange, onClose }) {
  if (S) return;
  if (!ui) buildUI();
  const p = list[index];
  const rect = fitRect(p);
  const origin = originFor(p);
  const thumb = origin && origin.querySelector('img');
  S = { list, i: index, origin, originFor, onChange, onClose, rect, closing: false, returnFocus: document.activeElement };

  // 背景 inert：讀屏與 Tab 都只停在 lightbox
  S.inerted = [...document.body.children].filter(el => el !== ui.root && !el.inert);
  S.inerted.forEach(el => { el.inert = true; });

  ui.root.hidden = false;
  document.body.classList.add('lb-open');
  fillCaption();
  S.img = makeImg(p, rect, thumb && thumb.currentSrc);

  const from = thumb && thumb.getBoundingClientRect();
  if (from && from.width && !reduceMotion.matches) {
    S.img.style.transform = flip(from, rect);
    thumb.style.visibility = 'hidden';
    S.hiddenThumb = thumb;
  } else {
    S.img.style.opacity = '0';
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!S) return;
    S.img.classList.add('animating');
    S.img.style.transform = 'none';
    S.img.style.opacity = '1';
    ui.root.classList.add('show');
  }));
  document.addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  ui.close.focus({ preventScroll: true });
}

export function close() {
  if (!S || S.closing) return;
  S.closing = true;
  const L = S;
  ui.root.classList.remove('show');
  const thumb = L.origin && L.origin.isConnected && L.origin.querySelector('img');
  const from = thumb && thumb.getBoundingClientRect();
  const visible = from && from.width && from.bottom > 0 && from.top < innerHeight;
  L.img.classList.add('animating');
  if (visible && !reduceMotion.matches) {
    L.img.style.transform = flip(from, L.rect);
  } else {
    L.img.style.opacity = '0';
  }
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    if (L.hiddenThumb) L.hiddenThumb.style.visibility = '';
    if (thumb) thumb.style.visibility = '';
    ui.root.querySelectorAll('.gx-lb-img').forEach(n => n.remove());
    ui.root.hidden = true;
    document.body.classList.remove('lb-open');
    L.inerted.forEach(el => { el.inert = false; });
    document.removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    S = null;
    const back = (L.origin && L.origin.isConnected) ? (L.origin.querySelector('button') || L.origin) : L.returnFocus;
    back && back.focus && back.focus({ preventScroll: true });
    L.onClose && L.onClose();
  };
  L.img.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 480);
}

function step(dir) {
  if (!S || S.closing || S.list.length < 2) return;
  if (S.hiddenThumb) { S.hiddenThumb.style.visibility = ''; S.hiddenThumb = null; }
  S.i = (S.i + dir + S.list.length) % S.list.length;
  const p = S.list[S.i];
  S.origin = S.originFor(p);
  const rect = fitRect(p);
  const old = S.img;
  const img = makeImg(p, rect);
  img.style.opacity = '0';
  if (!reduceMotion.matches) img.style.transform = 'translateX(' + (dir * 48) + 'px)';
  S.img = img; S.rect = rect;
  fillCaption();
  S.onChange && S.onChange(p);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    img.classList.add('animating');
    img.style.opacity = '1';
    img.style.transform = 'none';
    old.classList.add('animating');
    old.style.opacity = '0';
    if (!reduceMotion.matches) old.style.transform = 'translateX(' + (-dir * 48) + 'px)';
    setTimeout(() => old.remove(), 360);
  }));
}

function onKey(e) {
  if (!S) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'Tab') {
    const f = [ui.orig, ui.prev, ui.next, ui.close].filter(el => !el.hidden);
    const at = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}

function onResize() {
  if (!S || S.closing) return;
  const r = fitRect(S.list[S.i]);
  S.rect = r;
  S.img.classList.remove('animating');
  Object.assign(S.img.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', transform: 'none' });
}

function attachDrag(img) {
  let pid = null, sx = 0, sy = 0, dx = 0, dy = 0, moved = false, hist = [];
  img.addEventListener('pointerdown', e => {
    if (!S || S.closing || img !== S.img) return;
    pid = e.pointerId; img.setPointerCapture(pid);
    sx = e.clientX; sy = e.clientY; dx = dy = 0; moved = false; hist = [];
    img.classList.remove('animating');
    e.preventDefault();
  });
  img.addEventListener('pointermove', e => {
    if (pid === null || e.pointerId !== pid || !S) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 8) moved = true;
    if (!moved) return;
    hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (hist.length > 6) hist.shift();
    const shrink = 1 - Math.min(Math.abs(dy) / (innerHeight * 1.4), .25);
    img.style.transform = 'translate(' + (dx * .9) + 'px,' + dy + 'px) scale(' + shrink + ')';
    ui.backdrop.style.opacity = String(Math.max(1 - Math.abs(dy) / (innerHeight * .55), .25));
  });
  const end = e => {
    if (pid === null || e.pointerId !== pid) return;
    pid = null;
    if (!S || S.closing) return;
    ui.backdrop.style.opacity = '';
    if (!moved) return;                        // 點圖片本身不關閉，避免誤觸
    let vx = 0, vy = 0;
    if (hist.length >= 2) {
      const a = hist[0], b = hist[hist.length - 1], dt = Math.max(b.t - a.t, 1);
      vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt;
    }
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && S.list.length > 1 && (Math.abs(dx) > 90 || Math.abs(vx) > .5)) return step(dx < 0 ? 1 : -1);
    if (!horizontal && (Math.abs(dy) > 130 || Math.abs(vy) > .55)) return close();
    img.classList.add('animating');
    img.style.transform = 'none';
  };
  img.addEventListener('pointerup', end);
  img.addEventListener('pointercancel', end);
}
