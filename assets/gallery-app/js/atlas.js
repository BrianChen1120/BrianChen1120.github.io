// 世界地圖相簿：每個地區在地圖上的位置攤開它的全部照片，一次看完。
// 點地區名 → onRegion(key)；點照片 → onPhoto(id)；即將開館的國家 → onUpcoming(name)。
// 卡片依地區中心定位（分組用，不是拍攝座標），彼此重疊時自動推開並以細線連回原點。
// 展館（飛過去）與三折頁（篩選／看大圖）共用，用 <dialog> 呈現，Esc 與焦點管理交給瀏覽器。
// inline：手機版直接嵌在頁面最上方（不是浮層），點地區就篩選並捲到下方的照片。
import { VIEW, WORLD } from './map-paths.js';
import { src } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_THUMBS = 6;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const xy = (lat, lon) => [(lon + 180) * 10, (VIEW.latTop - lat) * 10];

export function createAtlas(host, data, { onRegion, onPhoto, onUpcoming, inline = false }) {
  const dlg = el(inline ? 'section' : 'dialog', 'gx-atlas' + (inline ? ' gx-atlas-inline' : ''));
  const tid = inline ? 'gxAtlasInlineTitle' : 'gxAtlasTitle';
  dlg.setAttribute('aria-labelledby', tid);
  dlg.innerHTML =
    '<div class="gx-atlas-head">' +
      '<div><p class="gx-atlas-over">World map</p><h2 id="' + tid + '">' + (inline ? 'Tap a place to see its photos' : 'Every place, every photograph') + '</h2></div>' +
      (inline ? '' : '<button type="button" class="gx-hud-btn gx-atlas-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>') +
    '</div>' +
    '<div class="gx-atlas-stage"><div class="gx-atlas-canvas">' +
      '<svg class="gx-atlas-map" aria-hidden="true"><path class="land"></path><g class="leads"></g></svg>' +
      '<ol class="gx-atlas-cards" aria-label="Places"></ol>' +
    '</div></div>' +
    '<p class="gx-atlas-credit">Places are grouped by city or prefecture · Map: Natural Earth · world-atlas</p>';
  host.appendChild(dlg);
  const stage = dlg.querySelector('.gx-atlas-stage');
  const canvas = dlg.querySelector('.gx-atlas-canvas');   // 窄螢幕時比畫面寬，可左右滑
  const svg = dlg.querySelector('svg');
  const leads = dlg.querySelector('.leads');
  const list = dlg.querySelector('.gx-atlas-cards');
  svg.querySelector('.land').setAttribute('d', WORLD);
  const isOpen = () => inline || dlg.open;
  const close = () => { if (!inline && dlg.open) dlg.close(); };
  if (!inline) {
    dlg.querySelector('.gx-atlas-close').addEventListener('click', close);
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  }

  // ---- 卡片：依國家順序、每個地區一張 ----
  const cards = [];
  data.countries.forEach(c => c.regions.forEach(r => {
    const photos = data.photos.filter(p => p.region === r.key);
    const li = el('li', 'gx-atlas-card');
    const head = el('button', 'gx-atlas-name');
    head.type = 'button';
    head.append(el('span', 'nm', r.name), el('span', 'n', String(photos.length)));
    head.setAttribute('aria-label', r.name + ', ' + c.name + ' — ' + photos.length + (photos.length === 1 ? ' photo' : ' photos') + ', go there');
    head.addEventListener('click', () => { close(); onRegion && onRegion(r.key); });
    const strip = el('div', 'gx-atlas-thumbs');
    photos.slice(0, MAX_THUMBS).forEach(p => {
      const b = el('button', 'gx-atlas-thumb');
      b.type = 'button';
      b.style.setProperty('--ar', Math.min(Math.max(p.ar, .6), 1.6).toFixed(3));
      b.setAttribute('aria-label', p.title);
      b.title = p.title;
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.src = src(p, 480);
      b.appendChild(img);
      b.addEventListener('click', () => { close(); onPhoto && onPhoto(p.id); });
      strip.appendChild(b);
    });
    if (photos.length > MAX_THUMBS) strip.appendChild(el('span', 'gx-atlas-more', '+' + (photos.length - MAX_THUMBS)));
    li.append(strip, head);
    list.appendChild(li);
    cards.push({ li, anchor: xy(r.lat, r.lon) });
  }));
  (data.upcoming || []).forEach(u => {
    const li = el('li', 'gx-atlas-card soon');
    const b = el('button', 'gx-atlas-name');
    b.type = 'button';
    b.append(el('span', 'nm', u.name), el('span', 'n', 'soon'));
    b.setAttribute('aria-label', u.name + ' — coming soon');
    if (onUpcoming) b.addEventListener('click', () => { close(); onUpcoming(u.name); });
    else b.disabled = true;
    li.appendChild(b);
    list.appendChild(li);
    cards.push({ li, anchor: xy(u.lat, u.lon) });
  });

  // ---- 版面：viewBox 涵蓋所有地區，卡片推開不重疊 ----
  function layout() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const xs = cards.map(c => c.anchor[0]), ys = cards.map(c => c.anchor[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // 卡片在點的上方，所以上方多留一點
    let w = Math.max(x1 - x0, 200) * 1.3, h = Math.max(y1 - y0, 150) * 1.45;
    if (w / h < W / H) w = h * W / H; else h = w * H / W;
    const vb = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2 - h * .06, w, h];
    svg.setAttribute('viewBox', vb.join(' '));
    const k = W / vb[2];
    const P = cards.map(c => {
      const ax = (c.anchor[0] - vb[0]) * k, ay = (c.anchor[1] - vb[1]) * k;
      const cw = c.li.offsetWidth, ch = c.li.offsetHeight;
      return { c, ax, ay, w: cw, h: ch, x: ax - cw / 2, y: ay - ch - 14 };
    });
    // 推開：矩形重疊時沿重疊較小的軸分開，並限制在畫面內。
    // 前 200 輪同時把卡片拉回原點（盡量貼近自己的地區），之後只推開，確保最後不重疊。
    const gap = 6;
    for (let it = 0; it < 500; it++) {
      let moved = false;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gap;
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gap;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) { const d = ox / 2 * Math.sign((b.x + b.w / 2) - (a.x + a.w / 2) || 1); a.x -= d; b.x += d; }
        else { const d = oy / 2 * Math.sign((b.y + b.h / 2) - (a.y + a.h / 2) || 1); a.y -= d; b.y += d; }
      }
      const pull = it < 200 ? .05 : 0;
      P.forEach(p => {
        p.x += ((p.ax - p.w / 2) - p.x) * pull;
        p.y += ((p.ay - p.h - 14) - p.y) * pull;
        p.x = Math.min(Math.max(p.x, 6), W - p.w - 6);
        p.y = Math.min(Math.max(p.y, 6), H - p.h - 6);
      });
      if (!moved && it >= 200) break;
    }
    // 地圖比畫面寬時，捲到有照片的地區中間
    if (W > stage.clientWidth) {
      const ph = P.filter(p => !p.c.li.classList.contains('soon'));
      const mid = ph.reduce((t, p) => t + p.x + p.w / 2, 0) / Math.max(ph.length, 1);
      stage.scrollLeft = mid - stage.clientWidth / 2;
    }
    leads.replaceChildren();
    P.forEach(p => {
      p.c.li.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
      // 細線＋原點：從地區中心連到卡片上最近的一點
      const ex = Math.min(Math.max(p.ax, p.x), p.x + p.w), ey = Math.min(Math.max(p.ay, p.y), p.y + p.h);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', vb[0] + p.ax / k); line.setAttribute('y1', vb[1] + p.ay / k);
      line.setAttribute('x2', vb[0] + ex / k); line.setAttribute('y2', vb[1] + ey / k);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', vb[0] + p.ax / k); dot.setAttribute('cy', vb[1] + p.ay / k); dot.setAttribute('r', 3.2 / k);
      leads.append(line, dot);
    });
  }
  const ro = new ResizeObserver(() => isOpen() && layout());
  ro.observe(canvas);
  function open() {
    if (!inline) dlg.showModal();
    requestAnimationFrame(layout);
    // 縮圖載入後卡片寬度會變，再排一次
    list.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', () => isOpen() && layout(), { once: true }); });
  }
  if (inline) open();

  return {
    el: dlg,
    open,
    close,
    get isOpen() { return !inline && dlg.open; },
    onClose(fn) { dlg.addEventListener('close', fn); },
    dispose() { ro.disconnect(); close(); dlg.remove(); }
  };
}
