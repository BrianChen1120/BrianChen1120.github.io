// 地點篩選（國家 → 縣/城市），三種模式共用同一份 state
import { getState, setState, subscribe } from './state.js';
import { matches } from './data.js';

export function mountFilter(el, data) {
  el.innerHTML =
    '<div class="gx-chips" role="group" aria-label="Filter by country"></div>' +
    '<div class="gx-chips sub" role="group" aria-label="Filter by city or prefecture"></div>' +
    '<p class="gx-count small mb-0" aria-live="polite"></p>';
  const [top, sub] = el.querySelectorAll('.gx-chips');
  const count = el.querySelector('.gx-count');
  count.style.color = 'var(--nc-text-2)';

  const chip = (label, n, pressed, patch) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gx-chip';
    b.setAttribute('aria-pressed', String(pressed));
    b.dataset.key = JSON.stringify(patch);
    b.innerHTML = '<span></span>' + (n != null ? '<span class="n"></span>' : '');
    b.firstChild.textContent = label;
    if (n != null) b.lastChild.textContent = n;
    b.addEventListener('click', () => setState(patch));
    return b;
  };

  function render() {
    const s = getState();
    const focused = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    top.replaceChildren(
      chip('All locations', data.photos.length, !s.country, { country: null, region: null }),
      ...data.countries.map(c => chip(c.name, c.count, s.country === c.name, { country: c.name, region: null }))
    );
    const c = data.countries.find(x => x.name === s.country);
    sub.hidden = !c || c.regions.length < 2;
    if (c && c.regions.length > 1) {
      sub.replaceChildren(
        chip('All ' + c.name, null, !s.region, { region: null }),
        ...c.regions.map(r => chip(r.name, r.count, s.region === r.key, { region: r.key }))
      );
    }
    const n = data.photos.filter(p => matches(p, s)).length;
    const where = s.region ? data.regions[s.region].name : s.country;
    count.textContent = n + (n === 1 ? ' photo' : ' photos') + (where ? ' in ' + where : '');
    // 重建後把鍵盤焦點放回同一顆 chip
    if (focused) [...el.querySelectorAll('.gx-chip')].find(b => b.dataset.key === focused)?.focus();
  }

  render();
  subscribe((s, patch) => { if ('country' in patch || 'region' in patch) render(); });
}
