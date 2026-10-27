// 單一狀態來源：mode / country / region / selected（照片 id）/ viewing（lightbox 開著）
// URL 只用 replaceState，不增加 history，返回鍵行為不變。
const MODES = ['museum', 'browse'];
const listeners = new Set();
const state = { mode: 'browse', country: null, region: null, selected: null, viewing: false };

export function getState() { return state; }

export function setState(patch) {
  let changed = false;
  for (const k in patch) if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; }
  if (!changed) return;
  writeURL();
  if ('mode' in patch) { try { sessionStorage.setItem('gx-mode', state.mode); } catch (e) {} }
  listeners.forEach(fn => fn(state, patch));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// 從 URL 讀初始狀態；data 用來驗證 id / region 存在，避免壞連結
export function initState(data, defaultMode) {
  const q = new URLSearchParams(location.search);
  let mode = q.get('view');
  if (!MODES.includes(mode)) {
    try { mode = sessionStorage.getItem('gx-mode'); } catch (e) { mode = null; }
    if (!MODES.includes(mode)) mode = defaultMode;
  }
  const region = data.regions[q.get('region')] ? q.get('region') : null;
  let country = region ? data.regions[region].country : null;
  if (!country && data.countries.some(c => c.name === q.get('country'))) country = q.get('country');
  const photo = data.byId.has(q.get('photo')) ? q.get('photo') : null;
  Object.assign(state, { mode, country, region, selected: photo, viewing: !!photo });
  return state;
}

function writeURL() {
  const q = new URLSearchParams(location.search);
  const set = (k, v) => (v ? q.set(k, v) : q.delete(k));
  set('view', state.mode);
  set('country', state.region ? null : state.country);
  set('region', state.region);
  set('photo', state.viewing ? state.selected : null);
  const qs = q.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}
