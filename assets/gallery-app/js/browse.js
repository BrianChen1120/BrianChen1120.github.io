// Browse：展覽 DM 三折頁。左折是封面＋地點索引，其餘各折依國家排作品小圖（原比例、不裁切）。
// 桌機一次攤開三折；作品超過容量時自動多一張「內頁」，用上一頁／下一頁翻。
// 手機（窄螢幕或橫拿的手機）不分折：封面之後每個國家一段，一路往下滑。
// 所有作品只建立一次；篩選只把不符合的變淡，不重排版面。
import { src, srcset, matches } from './data.js';
import { getState, setState, subscribe } from './state.js';

const PER_PANEL = 9;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad2 = n => String(n).padStart(2, '0');
// 小圖寬 ≈ 長寬比 × 列高（對應 gallery.css 的 --row-h）
const sizesFor = ar => '(max-width: 991.98px) ' + Math.round(ar * 110) + 'px, ' + Math.round(ar * 130) + 'px';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// 手機版判斷：窄螢幕，或高度很矮的觸控螢幕（橫拿的手機）
export const PHONE = '(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)';

// 轉向等原因跨過手機／桌機界線時整個重建（作品元件都在 build 裡）
export function mountBrowse(root, data, opts) {
  const mq = matchMedia(PHONE);
  let v = build(root, data, opts, mq.matches);
  const onChange = () => { v.dispose(); v = build(root, data, opts, mq.matches); };
  mq.addEventListener('change', onChange);
  return {
    itemFor: id => v.itemFor(id),
    reveal: c => v.reveal(c),
    dispose() { mq.removeEventListener('change', onChange); v.dispose(); }
  };
}

function build(root, data, { onOpen, eager = true }, stack) {
  // 依國家 → 地區排序並編號（展覽作品編號）
  const plates = [];
  data.countries.forEach(c => c.regions.forEach(r =>
    data.photos.filter(p => p.region === r.key).forEach(p => plates.push(p))));
  plates.forEach((p, i) => { p.no = i + 1; });

  // 平均分到各折；手機版改成一國一段
  const nPanels = Math.max(1, Math.ceil(plates.length / PER_PANEL));
  const per = Math.ceil(plates.length / nPanels);
  const chunks = stack
    ? data.countries.map(c => plates.filter(p => p.country === c.name)).filter(c => c.length)
    : Array.from({ length: nPanels }, (_, i) => plates.slice(i * per, (i + 1) * per)).filter(c => c.length);

  const items = new Map();
  const dm = el('div', 'gx-dm' + (stack ? ' gx-dm-stack' : ''));

  // ---- 封面折 ----
  const cover = el('section', 'gx-fold gx-cover');
  cover.setAttribute('aria-label', 'Exhibition cover and index');
  const dates = data.photos.map(p => p.date).sort();
  const ym = d => d.slice(0, 7).replace('-', '.');
  cover.append(
    el('p', 'gx-over', 'Photography · Kuan-Lin (Brian) Chen'),
    el('h2', 'gx-cover-title', 'Curated Photography'),
    el('p', 'gx-cover-dates', ym(dates[0]) + ' — ' + ym(dates[dates.length - 1])),
    el('p', 'gx-cover-stats', plates.length + ' works · ' + data.countries.length + ' countries · ' + Object.keys(data.regions).length + ' places')
  );
  const index = el('ol', 'gx-index');
  index.setAttribute('aria-label', 'Index by location');
  data.countries.forEach(c => {
    const nos = plates.filter(p => p.country === c.name).map(p => p.no);
    const li = el('li');
    const b = el('button', 'gx-index-country');
    b.type = 'button';
    b.dataset.country = c.name;
    b.append(el('span', 'nm', c.name), el('span', 'no', pad2(Math.min(...nos)) + (nos.length > 1 ? '–' + pad2(Math.max(...nos)) : '')));
    b.addEventListener('click', () => {
      const s = getState();
      setState(s.country === c.name && !s.region ? { country: null, region: null } : { country: c.name, region: null });
    });
    li.append(b, el('p', 'gx-index-regions', c.regions.map(r => r.name).join(' · ')));
    index.appendChild(li);
  });
  cover.append(index, el('p', 'gx-cover-hint', 'Select a work to view it large, with camera details.'));

  // ---- 作品折 ----
  function plateFig(p) {
    const fig = el('figure', 'g-item');
    fig.style.setProperty('--ar', p.ar.toFixed(4));
    fig.dataset.id = p.id;
    const hit = el('button', 'g-hit');
    hit.type = 'button';
    hit.setAttribute('aria-label', pad2(p.no) + '. ' + p.title + ', ' + p.place + ' — open viewer');
    const img = document.createElement('img');
    img.width = p.w; img.height = p.h;
    img.alt = p.title;
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';      // 小圖全部約 0.4 MB；Browse 隱藏時全部 lazy（display:none 不會載）
    img.sizes = sizesFor(p.ar);
    img.srcset = srcset(p);
    img.src = src(p, 480);
    const no = el('span', 'g-no', pad2(p.no));
    no.setAttribute('aria-hidden', 'true');
    const ov = el('span', 'g-ov');
    ov.setAttribute('aria-hidden', 'true');
    ov.append(el('strong', null, p.title), document.createElement('br'), p.place);
    hit.append(img, no, ov);
    hit.addEventListener('click', () => onOpen(p.id));
    fig.appendChild(hit);
    items.set(p.id, fig);
    return fig;
  }

  const folds = [cover];
  chunks.forEach((chunk, i) => {
    const f = el('section', 'gx-fold');
    f.setAttribute('aria-label', 'Works ' + pad2(chunk[0].no) + '–' + pad2(chunk[chunk.length - 1].no));
    let country = null, grid = null;
    chunk.forEach(p => {
      if (p.country !== country) {
        const all = plates.filter(x => x.country === p.country);
        const h = el('h3', 'gx-fold-head');
        h.append(el('span', null, p.country),
                 el('span', 'n', all.length + (all.length === 1 ? ' work' : ' works')));
        grid = el('div', 'gx-plates');
        f.append(h, grid);
        country = p.country;
      }
      grid.appendChild(plateFig(p));
    });
    f.appendChild(el('p', 'gx-folio', pad2(i + 2)));
    folds.push(f);
  });

  // 三折一組成為一「頁」；第一頁含封面。一次只攤開一頁，翻頁時先收合再展開（照片變多也不會拉成長頁）
  const sheets = [];
  for (let i = 0; i < folds.length; i += stack ? folds.length : 3) {
    const sheet = el('div', 'gx-sheet');
    folds.slice(i, i + (stack ? folds.length : 3)).forEach((f, k) => { f.classList.add('f' + (k + 1)); sheet.appendChild(f); });
    sheets.push(sheet);
    dm.appendChild(sheet);
  }
  const pageOf = new Map();
  sheets.forEach((sh, i) => sh.querySelectorAll('.g-item').forEach(f => pageOf.set(f.dataset.id, i)));

  const pager = el('nav', 'gx-pager');
  pager.setAttribute('aria-label', 'Leaflet pages');
  pager.innerHTML =
    '<button type="button" class="gx-pg" aria-label="Previous page"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>' +
    '<span class="gx-pg-n" aria-live="polite"></span>' +
    '<button type="button" class="gx-pg" aria-label="Next page"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>';
  const [prevBtn, nextBtn] = pager.querySelectorAll('button');
  const pageN = pager.querySelector('.gx-pg-n');
  pager.hidden = sheets.length < 2;

  // 窄螢幕的折頁點：只算目前這一頁的幾折，依捲動位置點亮
  const dots = el('div', 'gx-dm-dots');
  dots.setAttribute('aria-hidden', 'true');
  root.replaceChildren(dm, dots, pager);
  let page = 0, paging = false;
  const curFolds = () => [...sheets[page].children];
  function syncDots() {
    const mid = dm.scrollLeft + dm.clientWidth / 2;
    let best = 0, bd = Infinity;
    curFolds().forEach((f, i) => {
      const d = Math.abs(f.offsetLeft + f.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    });
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === best));
  }
  dm.addEventListener('scroll', () => requestAnimationFrame(syncDots), { passive: true });

  function show(i) {
    page = i;
    sheets.forEach((sh, k) => { sh.hidden = k !== i; });
    pageN.textContent = 'Page ' + (i + 1) + ' / ' + sheets.length;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === sheets.length - 1;
    dots.replaceChildren(...curFolds().map(() => el('span')));
    dm.scrollLeft = 0;
    requestAnimationFrame(syncDots);
  }
  function goPage(i, then) {
    i = Math.max(0, Math.min(sheets.length - 1, i));
    if (paging) return;
    if (i === page) { then && then(); return; }
    const wide = matchMedia('(min-width: 992px)').matches;
    if (reduceMotion || !wide) {
      show(i);
      sheets[i].classList.remove('gx-flip'); void sheets[i].offsetWidth; sheets[i].classList.add('gx-flip');
      then && then();
      return;
    }
    paging = true;
    dm.classList.add('paging');
    const cur = sheets[page], nxt = sheets[i];
    cur.classList.add('folded');                       // 收合目前這頁
    setTimeout(() => {
      cur.classList.remove('folded');
      nxt.classList.add('folded');
      show(i);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        nxt.classList.remove('folded');                // 展開下一頁
        setTimeout(() => { dm.classList.remove('paging'); paging = false; then && then(); }, 440);
      }));
    }, 400);
  }
  prevBtn.addEventListener('click', () => goPage(page - 1));
  nextBtn.addEventListener('click', () => goPage(page + 1));
  show(0);

  // 第一次在桌機看到時「攤開」三折（每個 session 一次）
  let unfolded = false;
  try { unfolded = sessionStorage.getItem('gx-dm-unfolded') === '1'; } catch (e) {}
  if (!stack && !unfolded && !reduceMotion && 'IntersectionObserver' in window) {
    const first = sheets[0];
    first.classList.add('folded');
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => first.classList.remove('folded')));
      try { sessionStorage.setItem('gx-dm-unfolded', '1'); } catch (e) {}
    }, { threshold: .25 });
    io.observe(first);
  }

  // 篩選：不符合的變淡；並翻到第一張符合作品所在的那一頁（窄螢幕再捲到那一折）
  function applyFilter(jump) {
    const s = getState();
    const any = !!(s.country || s.region);
    items.forEach((fig, id) => fig.classList.toggle('dim', any && !matches(data.byId.get(id), s)));
    index.querySelectorAll('.gx-index-country').forEach(b =>
      b.setAttribute('aria-pressed', String(s.country === b.dataset.country)));
    const first = any && plates.find(p => matches(p, s));
    if (!first) return;
    const reveal = () => {
      const fold = items.get(first.id).closest('.gx-fold');
      if (stack) {                                     // 一路往下的版面：捲到該國（選地區時捲到那張作品）
        if (jump) (s.region ? items.get(first.id) : fold).scrollIntoView({ block: s.region ? 'center' : 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }
      if (dm.scrollWidth > dm.clientWidth) {
        dm.scrollTo({ left: fold.offsetLeft - (dm.clientWidth - fold.offsetWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };
    if (jump) goPage(pageOf.get(first.id), reveal);
    else { show(pageOf.get(first.id)); requestAnimationFrame(reveal); }
  }
  applyFilter(false);
  const unsub = subscribe((s, patch) => { if ('country' in patch || 'region' in patch) applyFilter(true); });

  // 從展館的 DM 看板打開：直接翻到該國所在的那一頁（窄螢幕再捲到那一折），國名閃一下
  function reveal(country) {
    const first = plates.find(p => p.country === country);
    if (!first) return;
    show(pageOf.get(first.id));
    sheets[page].classList.remove('folded');
    const fold = items.get(first.id).closest('.gx-fold');
    requestAnimationFrame(() => {
      if (stack) { fold.scrollIntoView({ block: 'start' }); return; }
      if (dm.scrollWidth > dm.clientWidth) dm.scrollLeft = fold.offsetLeft - (dm.clientWidth - fold.offsetWidth) / 2;
      const head = [...fold.querySelectorAll('.gx-fold-head')].find(h => h.firstChild.textContent === country);
      if (!head) return;
      head.scrollIntoView({ block: 'center', inline: 'nearest' });       // 浮層內可能要往下捲才看得到
      if (!reduceMotion) { head.classList.remove('gx-hl'); void head.offsetWidth; head.classList.add('gx-hl'); }
    });
  }

  return { itemFor: id => items.get(id) || null, reveal, dispose: () => { unsub(); root.replaceChildren(); } };
}
