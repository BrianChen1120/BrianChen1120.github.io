// photos.json → 正規化後的照片清單與地點分組（唯一資料來源）
const BASE = 'assets/gallery/web/';

export async function loadGallery(url = 'assets/gallery-app/photos.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('photos.json ' + res.status);
  const raw = await res.json();
  const regions = raw.regions;
  const photos = raw.photos.map((p, i) => {
    const r = regions[p.region];
    return { ...p, order: i, ar: p.w / p.h, country: r.country, place: r.name + ', ' + r.country };
  });

  // country → { name, count, regions: [{ key, name, count }] }，依照片出現順序
  const countries = new Map();
  for (const p of photos) {
    if (!countries.has(p.country)) countries.set(p.country, { name: p.country, count: 0, regions: new Map() });
    const c = countries.get(p.country);
    c.count++;
    if (!c.regions.has(p.region)) c.regions.set(p.region, { key: p.region, ...regions[p.region], count: 0 });
    c.regions.get(p.region).count++;
  }
  const countryList = [...countries.values()].map(c => ({ ...c, regions: [...c.regions.values()] }));

  const home = regions[raw.home] ? raw.home : photos[0].region;    // 3D 展區起點
  // 選填：展覽／各國展館的介紹文字（{ "_exhibition": "...", "Japan": "..." }），沒寫就由資料自動產生
  const intros = raw.intros || {};
  // 選填：還沒有照片的國家（{ "Denmark": { lat, lon } }），3D 展區先蓋「即將開館」的空館；已有照片的國家會被忽略
  const upcoming = Object.entries(raw.upcoming || {})
    .filter(([name]) => !countries.has(name))
    .map(([name, at]) => ({ name, lat: at.lat, lon: at.lon }));
  return { photos, regions, home, intros, upcoming, countries: countryList, byId: new Map(photos.map(p => [p.id, p])) };
}

export function src(p, w) {
  const v = p.variants;
  const pick = v.find(x => x >= w) ?? v[v.length - 1];
  return BASE + p.id + '-' + pick + '.webp';
}

export function srcset(p) {
  return p.variants.map(w => BASE + p.id + '-' + w + '.webp ' + w + 'w').join(', ');
}

export function matches(p, s) {
  if (s.region) return p.region === s.region;
  if (s.country) return p.country === s.country;
  return true;
}
