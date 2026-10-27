// Gallery 2.0 進入點
// 兩種呈現：3D 展館（桌機預設）與三折 DM（無 WebGL、reduced-motion 的預設）。
// 世界地圖相簿在兩邊都能開：展館裡點小地圖，DM 上方按「World map」。
// 手機：最上方直接嵌世界地圖，下面是一路往下滑的照片列表；3D 展館要橫拿，進去時自動全螢幕。
import { loadGallery, matches } from './data.js';
import { initState, getState, setState, subscribe } from './state.js';
import { mountFilter } from './filter.js';
import { mountBrowse, PHONE } from './browse.js';
import { openLightbox } from './lightbox.js';
import { createAtlas } from './atlas.js';

const grid = document.getElementById('gallery');
const filterEl = document.getElementById('gxFilter');
const panels = {
  museum: document.getElementById('gxMuseum'),
  browse: document.getElementById('gxBrowse')
};
// 舊連結 ?view=map：改成在預設畫面打開世界地圖
const legacyMap = new URLSearchParams(location.search).get('view') === 'map';

// 能開 WebGL 才提供 Museum；預設只在桌機、非 reduced-motion、記憶體/省流量條件允許時用 Museum
function webglOK() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (e) { return false; }
}
const canMuseum = webglOK();
const phone = matchMedia(PHONE).matches;
const preferMuseum = canMuseum
  && matchMedia('(min-width: 768px) and (pointer: fine)').matches
  && !matchMedia('(prefers-reduced-motion: reduce)').matches
  && !(navigator.deviceMemory && navigator.deviceMemory < 4)
  && !(navigator.connection && navigator.connection.saveData);

try {
  const data = await loadGallery();
  initState(data, preferMuseum ? 'museum' : 'browse');
  if (getState().mode === 'museum' && !canMuseum) setState({ mode: 'browse' });

  const views = {};          // mode → { itemFor, dispose? }，lazy 掛載
  const loading = {};

  // 開 lightbox：清單依目前篩選；照片不在篩選內時退回全部
  const view = id => {
    const s = getState();
    let list = data.photos.filter(p => matches(p, s));
    if (!list.some(p => p.id === id)) list = data.photos;
    setState({ selected: id, viewing: true });
    openLightbox({
      list,
      index: list.findIndex(p => p.id === id),
      originFor: p => views[getState().mode]?.itemFor(p.id) || null,
      onChange: p => setState({ selected: p.id }),
      onClose: () => setState({ viewing: false })
    });
  };

  const mounters = {
    browse: async () => mountBrowse(grid, data, { onOpen: view, eager: getState().mode === 'browse' }),
    museum: async () => (await import('./museum.js')).mountMuseum(panels.museum, data, {
      onOpen: view,
      openAtlas: legacyMap
    })
  };

  async function ensure(mode) {
    if (views[mode]) return views[mode];
    loading[mode] = loading[mode] || mounters[mode]().then(v => {
      // Museum 載入途中使用者已切走：立刻釋放，不留背景 WebGL context
      if (mode === 'museum' && getState().mode !== 'museum') { v.dispose(); delete loading[mode]; return null; }
      return (views[mode] = v);
    });
    return loading[mode];
  }

  // 手機進展館：要求真正的全螢幕並鎖橫向（Android 可以；iOS 不支援，展館裡會蓋「請轉橫向」提示）
  function enterFullscreen() {
    if (!phone) return;
    const de = document.documentElement;
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req || document.fullscreenElement) return;
    Promise.resolve(req.call(de, { navigationUI: 'hide' }))
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }
  function exitFullscreen() {
    if (!document.fullscreenElement) return;
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
    document.exitFullscreen().catch(() => {});
  }

  async function showMode(mode) {
    if (mode !== 'museum') exitFullscreen();
    // 離開 Museum 就釋放 WebGL context 與所有 GPU 資源；回來時重建（照片走 HTTP 快取）
    if (mode !== 'museum' && views.museum) {
      views.museum.dispose();
      delete views.museum; delete loading.museum;
    }
    Object.entries(panels).forEach(([k, p]) => {
      p.hidden = k !== mode;
      if (k === mode) { p.classList.remove('gx-enter'); void p.offsetWidth; p.classList.add('gx-enter'); }
    });
    filterEl.hidden = mode === 'museum';          // 展館有自己的館別按鈕與世界地圖
    try {
      await ensure(mode);
    } catch (err) {
      console.error(err);
      if (mode !== 'browse') setState({ mode: 'browse' });    // 展館失敗就退回 DM
      delete loading[mode];
    }
  }

  // DM 上方：進入展館（有 WebGL 時）＋世界地圖相簿（點地區＝篩選並翻到那一頁，點照片＝看大圖）
  // 手機版世界地圖直接嵌在列表上方，不另開浮層
  const atlas = createAtlas(phone ? panels.browse : document.body, data, {
    inline: phone,
    onRegion: key => setState({ country: data.regions[key].country, region: key }),
    onPhoto: id => view(id)
  });
  const cta = document.createElement('div');
  cta.className = 'gx-cta';
  cta.innerHTML =
    (canMuseum ? '<button type="button" class="gx-cta-btn" data-act="museum"><i class="bi bi-bank" aria-hidden="true"></i>' +
      '<span><strong>Enter the museum</strong><small>' + (phone ? 'Walk the 3D exhibition · best in landscape' : 'Walk a world-map exhibition in 3D') + '</small></span></button>' : '') +
    (phone ? '' : '<button type="button" class="gx-cta-btn" data-act="atlas"><i class="bi bi-globe-asia-australia" aria-hidden="true"></i>' +
      '<span><strong>World map</strong><small>Every place, every photograph</small></span></button>');
  cta.querySelector('[data-act="museum"]')?.addEventListener('click', () => { enterFullscreen(); setState({ mode: 'museum' }); });
  cta.querySelector('[data-act="atlas"]')?.addEventListener('click', () => atlas.open());
  panels.browse.prepend(cta);
  if (phone) panels.browse.prepend(atlas.el);

  mountFilter(filterEl, data);
  await ensure('browse');    // DM 一律掛載：展館失敗時的保底
  await showMode(getState().mode);
  subscribe((s, patch) => { if ('mode' in patch) showMode(s.mode); });
  if (legacyMap && getState().mode === 'browse' && !phone) atlas.open();

  const s = getState();
  if (s.viewing && s.selected) {
    if (s.mode === 'browse') views.browse.itemFor(s.selected)?.scrollIntoView({ block: 'center' });
    view(s.selected);
  }
} catch (err) {
  console.error(err);
  grid.innerHTML = '<p class="gx-empty">Photos failed to load. Please refresh the page.</p>';
}
