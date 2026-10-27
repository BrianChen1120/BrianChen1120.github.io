// Museum：走在世界地圖上的小型博覽會。
// 地面是世界地圖（等距圓柱，1° ≈ S 公尺）；每個國家一座無屋頂展館，蓋在該國照片地區的中心；
// 從 home 國家的展館出發，各館的門彼此相對。電腦 WASD／方向鍵＋拖曳環視，手機虛擬搖桿；點地板走過去；
// 館內有展覽說明牌、每幅作品旁有作品標籤，點了可讀／看大圖；地板鋪著該國輪廓地毯，標出照片拍攝的縣市。
// 右上 HUD：小世界地圖（點了飛上天、打開世界地圖相簿，點地區／照片飛過去）＋三折 DM 總覽；手機一律全螢幕沉浸。
// 展館位置是地區中心（分組用），不是拍攝座標。
// 只在需要時重繪；靠近展館才載入它的照片、走遠就釋放；離開模式時 dispose 全部 GPU 資源。
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, VIEW } from './map-paths.js';
import { SHAPES } from './country-shapes.js';
import { src, matches } from './data.js';
import { getState, setState, subscribe } from './state.js';
import { mountBrowse } from './browse.js';
import { createAtlas } from './atlas.js';

const S = 1.5;                         // 公尺 / 經緯度
const WALL_H = 4, WALL_T = .2;
const POLE_H = 4.8;                   // 門口垂旗的旗桿，比牆略高
const EYE = 1.6, ART_Y = 1.55, ART_H = 1.0;
const DOOR = 2.6, CORNER = .9, GAP = .75, GROUP_GAP = 1.6, MIN_SLOTS = 4, SOON_EXTRA = 2;
const HALL_GAP = 6;                    // 兩館之間至少留的走道（公尺）
const R_PLAYER = .35;
const WALK = 5.1, RUN = 13.5, JOY_MAX = 9, TURN = 1.9;
const FOV = 62;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)').matches;

const PALETTE = {
  light: { bg: '#E9E6DE', wall: '#F3F1EB', ocean: '#E4E0D5', land: '#CBC4B4', coast: '#B7B09F', grid: 'rgba(90,96,92,.10)',
           frame: '#B39B7A', mat: '#FBFAF6', text: '#3A403E', sub: '#6B7570', accent: '#4E6C65', pool: .22, hemi: 2.5, dir: 1.1, rug: '#F7F5F0', trim: '#DCD5C7', ceil: '#E6E2D9' },
  dark:  { bg: '#171B1A', wall: '#2E3532', ocean: '#1E2422', land: '#36423E', coast: '#46534E', grid: 'rgba(220,230,225,.06)',
           frame: '#7D6D57', mat: '#E9E6DE', text: '#E7E5DD', sub: '#A6B0AA', accent: '#A5C4B4', pool: .07, hemi: 2.1, dir: .9, rug: '#242B29', trim: '#3B4440', ceil: '#252B29' }
};

// 側邊：n = 朝館內的法線，t = 順時針（北上俯視）沿牆方向
const SIDES = {
  N: { n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0) },
  E: { n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, 1) },
  S: { n: new THREE.Vector3(0, 0, -1), t: new THREE.Vector3(-1, 0, 0) },
  W: { n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, -1) }
};
const ORDER = ['N', 'E', 'S', 'W'];
// 印在紙面（卡紙、說明牌、作品標籤）上的字：不論主題都是深色墨水
const INK = '#353B39', INK_SUB = '#6E7873', INK_ACCENT = '#4E6C65';
const cardinal = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
const yawFacing = v => Math.atan2(-v.x, -v.z);

function textCanvas(lines, w, h, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
  const left = opts.align === 'left', x = left ? (opts.pad || 0) : w / 2;
  g.textAlign = left ? 'left' : 'center';
  g.textBaseline = 'middle';
  lines.forEach(l => {
    g.font = l.font; g.fillStyle = l.color;
    let text = l.text;
    const max = w - 2 * (opts.pad || 0);
    if (g.measureText(text).width > max) {        // 太長就截斷加刪節號
      while (text.length > 1 && g.measureText(text + '…').width > max) text = text.slice(0, -1);
      text += '…';
    }
    g.fillText(text, x, l.y);
  });
  return cv;
}

// ---------- 版面：展館大小、作品沿牆位置 ----------
function placeItems(items, L, doors) {
  // 從第一個門的右側開始順時針繞一圈；有門的牆拆成左右兩段
  const segs = [];
  const i0 = ORDER.indexOf(doors[0]);
  const full = [-L / 2 + CORNER, L / 2 - CORNER];
  const left = side => ({ side, u0: full[0], u1: -DOOR / 2 - .5 });
  const right = side => ({ side, u0: DOOR / 2 + .5, u1: full[1] });
  for (let k = 0; k < 4; k++) {
    const side = ORDER[(i0 + k) % 4];
    if (!doors.includes(side)) segs.push({ side, u0: full[0], u1: full[1] });
    else if (k === 0) segs.push(right(side));
    else segs.push(left(side), right(side));
  }
  segs.push(left(doors[0]));
  segs.forEach(s => { s.items = []; });

  let si = 0, cur = segs[0].u0, prevGroup = null;
  for (const it of items) {
    let gap = !segs[si].items.length ? 0 : (it.group !== prevGroup ? GROUP_GAP : GAP);
    while (si < segs.length && cur + gap + it.w > segs[si].u1) {
      si++;
      if (si < segs.length) { cur = segs[si].u0; gap = 0; }
    }
    if (si >= segs.length) return null;
    segs[si].items.push({ ...it, u: cur + gap + it.w / 2 });
    cur += gap + it.w;
    prevGroup = it.group;
  }
  // 每段置中
  segs.forEach(s => {
    if (!s.items.length) return;
    const a = s.items[0].u - s.items[0].w / 2, b = s.items[s.items.length - 1].u + s.items[s.items.length - 1].w / 2;
    const shift = (s.u0 + s.u1) / 2 - (a + b) / 2;
    s.items.forEach(it => { it.u += shift; it.side = s.side; });
  });
  return segs.flatMap(s => s.items);
}

// 兩館（含走道）重疊時沿「需要移動較少」的軸推開；起點館不動，其餘各退一半。
// 照片地點很近的國家（例如哥本哈根與斯德哥爾摩）就不會蓋在一起。
function separate(halls, anchor) {
  for (let it = 0; it < 300; it++) {
    let moved = false;
    for (let i = 0; i < halls.length; i++) for (let j = i + 1; j < halls.length; j++) {
      const a = halls[i], b = halls[j];
      const need = (a.L + b.L) / 2 + HALL_GAP;
      const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z;
      const ox = need - Math.abs(dx), oz = need - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      moved = true;
      const axis = ox < oz ? 'x' : 'z', amt = (axis === 'x' ? ox : oz) + .01;
      const sign = Math.sign(axis === 'x' ? dx : dz) || 1;
      const wa = a === anchor ? 0 : b === anchor ? 1 : .5;
      a.center[axis] -= sign * amt * wa;
      b.center[axis] += sign * amt * (1 - wa);
    }
    if (!moved) break;
  }
}

function planWorld(data) {
  const home = data.regions[data.home];
  const toW = (lat, lon) => new THREE.Vector3((lon - home.lon) * S, 0, (home.lat - lat) * S);

  const soon = () => ({ p: null, group: '_soon', w: 1.2, h: .9 });
  const halls = data.countries.map(c => {
    const center = c.regions.reduce((v, r) => v.add(toW(r.lat, r.lon)), new THREE.Vector3()).divideScalar(c.regions.length);
    const items = [];
    c.regions.forEach(r => data.photos.filter(p => p.region === r.key).forEach(p =>
      items.push({ p, group: r.key, w: p.ar * ART_H, h: ART_H })));
    // 每館最後留幾個「Coming soon」框；照片太少的館補到 MIN_SLOTS
    for (let i = 0; i < SOON_EXTRA || items.length < MIN_SLOTS; i++) items.push(soon());
    return { kind: 'hall', name: c.name, country: c.name, center, items, count: c.count, anchor: center.clone() };
  });
  // 即將開館：還沒有照片的國家先蓋一座只有 Coming soon 框的空館（位置是國家層級的佔位）
  data.upcoming.forEach(u => {
    const center = toW(u.lat, u.lon);
    halls.push({ kind: 'hall', name: u.name, country: u.name, upcoming: true, center, count: 0, anchor: center.clone(),
      items: Array.from({ length: MIN_SLOTS }, soon) });
  });
  const homeHall = halls.find(h => h.country === home.country) || halls[0];
  homeHall.home = true;

  // 起點館的門朝向其他每一館；其他館的門朝向起點館
  const toward = (a, b) => cardinal(b.center.x - a.center.x, b.center.z - a.center.z);
  const size = () => halls.forEach(h => {
    h.doors = h === homeHall
      ? [...new Set(halls.filter(o => o !== h).map(o => toward(h, o)))]
      : [toward(h, homeHall)];
    if (!h.doors.length) h.doors = ['S'];
    let L = h.home ? 9 : 8, placed;
    while (!(placed = placeItems(h.items, L, h.doors))) L += .5;
    h.L = L;
    h.placed = placed;
  });
  // 先排一次大小，推開重疊的館，再依新位置重算門與大小、再推一次
  size(); separate(halls, homeHall);
  size(); separate(halls, homeHall);
  return { halls, homeHall, toW, home };
}

export function mountMuseum(root, data, { onOpen, openAtlas = false }) {
  root.innerHTML =
    '<div class="gx-museum">' +
      '<div class="gx-mu-stage">' +
        '<div class="gx-hud gx-hud-l">' +
          '<button type="button" class="gx-minimap" aria-label="Open the world map of all photographs (M)" title="World map"><canvas aria-hidden="true"></canvas></button>' +
        '</div>' +
        '<div class="gx-hud">' +
          '<div class="gx-hud-btns">' +
            '<button type="button" class="gx-hud-btn gx-hud-dm" aria-label="Open the exhibition leaflet" title="Exhibition leaflet"><i class="bi bi-layout-three-columns" aria-hidden="true"></i></button>' +
            '<button type="button" class="gx-hud-btn gx-hud-full" aria-pressed="false"></button>' +
          '</div>' +
        '</div>' +
        '<div class="gx-mu-hover" aria-hidden="true" hidden></div>' +
        '<p class="gx-mu-hint" aria-hidden="true"></p>' +
        '<div class="gx-joy" aria-hidden="true"><div class="gx-joy-knob"></div></div>' +
        // 手機直拿時蓋住展館，請使用者轉成橫向（CSS 只在觸控＋直向時顯示）
        '<div class="gx-mu-rotate" role="alert"><i class="bi bi-phone-landscape" aria-hidden="true"></i>' +
          '<strong>Rotate your phone</strong><span>The museum is best explored in landscape.</span>' +
          '<button type="button" class="gx-cta-btn gx-mu-rotate-back">Back to the list</button></div>' +
        '<div class="gx-mu-bar">' +
          '<button type="button" class="gx-mu-nav gx-mu-prev" aria-label="Previous artwork"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>' +
          '<div class="gx-mu-cap" aria-live="polite"><div class="t"></div><div class="s"></div></div>' +
          '<button type="button" class="gx-mu-view">View</button>' +
          '<button type="button" class="gx-mu-nav gx-mu-next" aria-label="Next artwork"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>' +
        '</div>' +
      '</div>' +
      '<dialog class="gx-dm-dialog" aria-label="Exhibition leaflet">' +
        '<div class="gx-dm-dialog-head"><span>Exhibition leaflet</span>' +
          '<button type="button" class="gx-hud-btn gx-dm-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>' +
        '<div class="gx-dm-dialog-body"></div>' +
      '</dialog>' +
      '<dialog class="gx-note-dialog" aria-labelledby="gxNoteTitle">' +
        '<button type="button" class="gx-hud-btn gx-note-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>' +
        '<p class="gx-note-over"></p><h2 id="gxNoteTitle"></h2><div class="gx-note-body"></div>' +
      '</dialog>' +
    '</div>';
  const $ = s => root.querySelector(s);
  const stage = $('.gx-mu-stage');
  const museumEl = $('.gx-museum');
  const miniBtn = $('.gx-minimap'), miniCv = $('.gx-minimap canvas');
  const dmBtn = $('.gx-hud-dm'), fullBtn = $('.gx-hud-full');
  const dialog = $('.gx-dm-dialog'), dialogBody = $('.gx-dm-dialog-body');
  const noteDialog = $('.gx-note-dialog');
  const hoverEl = $('.gx-mu-hover');
  const hintEl = $('.gx-mu-hint');
  const joyEl = $('.gx-joy'), knobEl = $('.gx-joy-knob');
  const capT = $('.gx-mu-cap .t'), capS = $('.gx-mu-cap .s');
  const viewBtn = $('.gx-mu-view');
  $('.gx-mu-rotate-back').addEventListener('click', () => setState({ mode: 'browse' }));
  hintEl.textContent = coarse ? 'Joystick to walk · drag to look · tap a photo' : 'W A S D to walk · drag to look · click the floor to walk there';

  const theme = () => PALETTE[document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'];
  let P = theme();
  const W = planWorld(data);
  const containers = W.halls;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'gx-mu-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', '3D museum. Use W A S D or arrow keys to walk; the buttons below list every artwork.');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.bg, 40, 140);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 900);
  const hemi = new THREE.HemisphereLight('#ffffff', '#b8b0a2', P.hemi);
  const dir = new THREE.DirectionalLight('#fff8ee', P.dir);
  dir.position.set(30, 60, 20);
  scene.add(hemi, dir);

  const disposables = [];
  const keep = x => (disposables.push(x), x);
  const unitPlane = keep(new THREE.PlaneGeometry(1, 1));
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  const wallMat = keep(new THREE.MeshLambertMaterial({ color: P.wall }));
  const frameMat = keep(new THREE.MeshLambertMaterial({ color: P.frame }));
  const matMat = keep(new THREE.MeshBasicMaterial({ color: P.mat }));
  const trimMat = keep(new THREE.MeshLambertMaterial({ color: P.trim }));
  const ceilMat = keep(new THREE.MeshBasicMaterial({ color: P.ceil }));     // 不受光：朝下的面只吃到半球光的地面色，會偏暗偏褐

  // ---------- 地面：世界地圖 ----------
  const pts = containers.map(c => c.center);
  // 東西方向是一整圈經度（以起點館為中心 ±180°）；南北也首尾相接：走出北緣從南緣回來（兩端都淡成背景色，接得起來）
  const WRAP = 360 * S, minX = -WRAP / 2, maxX = WRAP / 2;
  // 南北範圍：地圖資料只到北緯 75°／南緯 50°（map-paths.js），地面再往外延伸成海面，
  // 北歐的館離北緣才有足夠的空地；淡出只發生在資料範圍之外
  const LAT_N = Math.max(88, VIEW.latTop), LAT_S = Math.min(-68, VIEW.latTop - VIEW.h / 10);
  const minZ = (W.home.lat - LAT_N) * S, maxZ = (W.home.lat - LAT_S) * S;
  const GW = WRAP, GD = maxZ - minZ;
  const hallX0 = Math.min(...pts.map(p => p.x)) - 50, hallX1 = Math.max(...pts.map(p => p.x)) + 50;   // 小地圖平常顯示的範圍
  const wrapDX = d => d - WRAP * Math.round(d / WRAP);   // 繞一圈後最短的東西向差距
  const wrapDZ = d => d - GD * Math.round(d / GD);
  const groundCanvas = document.createElement('canvas');
  const groundW = Math.min(coarse ? 2048 : 4096, renderer.capabilities.maxTextureSize);
  groundCanvas.width = groundW; groundCanvas.height = Math.round(groundW * GD / GW);
  const groundTex = keep(new THREE.CanvasTexture(groundCanvas));
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.wrapS = THREE.RepeatWrapping;                  // 貼圖剛好一整圈經度：左右邊緣取樣時互相銜接，接縫不會有線
  groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const worldPath = new Path2D(WORLD);
  // 世界座標 → 地圖單位（0.1°）：lon = home.lon + x/S, lat = home.lat - z/S
  const mx = x => (W.home.lon + x / S + 180) * 10, my = z => (75 - (W.home.lat - z / S)) * 10;
  // 把地面範圍的地圖畫進任一 canvas（地面貼圖與小地圖共用）
  // 世界輪廓的地圖單位只有 0–3600（-180°–180°）；範圍跨過換日線，所以再畫一份平移 3600 的
  function eachCopy(g, k, fn) {
    [0, 3600].forEach(off => { g.setTransform(k, 0, 0, k, (off - mx(minX)) * k, -my(minZ) * k); fn(); });
  }
  function drawMap(cv, detail) {
    const g = cv.getContext('2d'), k = cv.width / (mx(maxX) - mx(minX));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = P.ocean; g.fillRect(0, 0, cv.width, cv.height);
    if (detail) {
      eachCopy(g, k, () => {
        g.strokeStyle = P.grid; g.lineWidth = 1.5 / k;
        for (let lon = -180; lon <= 180; lon += 10) { g.beginPath(); g.moveTo((lon + 180) * 10, -200); g.lineTo((lon + 180) * 10, 1500); g.stroke(); }
        for (let lat = -60; lat <= 80; lat += 10) { g.beginPath(); g.moveTo(0, (75 - lat) * 10); g.lineTo(3600, (75 - lat) * 10); g.stroke(); }
      });
      // 等深線：沿海岸往外三圈細線，越外越淡（先畫線色、再用海色蓋掉內側，只留一圈）
      [[24, .2], [11, .32]].forEach(([w, a]) => eachCopy(g, k, () => {
        g.globalAlpha = a; g.strokeStyle = P.coast; g.lineWidth = w * 2; g.stroke(worldPath);
        g.globalAlpha = 1; g.strokeStyle = P.ocean; g.lineWidth = w * 2 - 1.6 / k; g.stroke(worldPath);
      }));
    }
    eachCopy(g, k, () => {
      g.fillStyle = P.land; g.fill(worldPath);
      g.lineWidth = 1.2 / k; g.strokeStyle = P.coast; g.stroke(worldPath);
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (detail) { drawRoutes(g, cv.width / GW); fadeEdges(g, cv); }
  }
  // 起點館到其他每一館的虛線航路（從館外緣出發，微微彎曲）
  function drawRoutes(g, k) {
    const at = v => [(v.x - minX) * k, (v.z - minZ) * k];
    const home = W.homeHall;
    g.save();
    g.strokeStyle = P.accent; g.fillStyle = P.accent; g.lineCap = 'round';
    g.lineWidth = .22 * k; g.setLineDash([1.1 * k, .9 * k]); g.globalAlpha = .5;
    W.halls.forEach(h => {
      if (h === home) return;
      const dx = h.center.x - home.center.x, dz = h.center.z - home.center.z, d = Math.hypot(dx, dz);
      const u = new THREE.Vector3(dx / d, 0, dz / d), side = new THREE.Vector3(u.z, 0, -u.x);
      const a = home.center.clone().addScaledVector(u, home.L * .72 + 1.5);
      const b = h.center.clone().addScaledVector(u, -(h.L * .72 + 1.5));
      const c = a.clone().lerp(b, .5).addScaledVector(side, Math.min(d * .12, 14));   // 往一側彎，像航線
      const [ax, ay] = at(a), [bx, by] = at(b), [cx, cy] = at(c);
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy, bx, by); g.stroke();
      g.beginPath(); g.arc(bx, by, .35 * k, 0, Math.PI * 2); g.fill();
    });
    g.restore();
  }
  // 南北邊緣淡入背景色，地圖不再有一條硬邊
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join(',');
  function fadeEdges(g, cv) {
    const f = Math.round(cv.height * .06);                 // 約 9° 緯度，只落在地圖資料範圍外的海面
    [[0, f, 1, 0], [cv.height - f, cv.height, 0, 1]].forEach(([y0, y1, a0, a1]) => {
      const grd = g.createLinearGradient(0, y0, 0, y1);
      grd.addColorStop(0, 'rgba(' + rgb(P.bg) + ',' + a0 + ')'); grd.addColorStop(1, 'rgba(' + rgb(P.bg) + ',' + a1 + ')');
      g.fillStyle = grd; g.fillRect(0, y0, cv.width, y1 - y0);
    });
  }
  function drawGround() { drawMap(groundCanvas, true); groundTex.needsUpdate = true; }
  drawGround();
  const groundMat = keep(new THREE.MeshLambertMaterial({ map: groundTex }));
  const ground = new THREE.Mesh(unitPlane, groundMat);
  ground.scale.set(GW, GD, 1);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  scene.add(ground);
  // 周圍八方各接一片同樣的地面：走到邊界附近看得到另一側，也點得到那邊的地面
  const groundCopies = [];
  [-1, 0, 1].forEach(i => [-1, 0, 1].forEach(j => {
    if (!i && !j) return;
    const m = ground.clone();
    m.position.x += i * WRAP; m.position.z += j * GD;
    scene.add(m);
    groundCopies.push(m);
  }));
  const grounds = [ground, ...groundCopies];

  // ---------- 牆與碰撞 ----------
  const boxes = [], wallMeshes = [];
  function wall(c, side, a, b, y0 = 0, y1 = WALL_H) {
    const sd = SIDES[side];
    const len = b - a;
    const m = new THREE.Mesh(unitBox, wallMat);
    const mid = (a + b) / 2;
    const pos = c.center.clone().addScaledVector(sd.n, -(c.L / 2 + WALL_T / 2)).addScaledVector(sd.t, mid);
    pos.y = (y0 + y1) / 2;
    m.position.copy(pos);
    const along = Math.abs(sd.t.x) > 0;
    m.scale.set(along ? len + WALL_T * 2 : WALL_T, y1 - y0, along ? WALL_T : len + WALL_T * 2);
    scene.add(m);
    wallMeshes.push(m);
    if (y0 === 0) {
      const hx = m.scale.x / 2, hz = m.scale.z / 2;
      boxes.push({ x0: pos.x - hx, x1: pos.x + hx, z0: pos.z - hz, z1: pos.z + hz });
      // 外側勒腳、內側踢腳板
      trimBox(pos.clone().addScaledVector(sd.n, -(WALL_T / 2 + .03)).setY(.11), sd, len + WALL_T * 2 + .12, .22, .06);
      trimBox(pos.clone().addScaledVector(sd.n, WALL_T / 2 + .01).setY(.05), sd, len + WALL_T * 2, .1, .02);
    }
  }
  // 收邊（牆頂壓頂、勒腳、門框、旗桿）：全部合併成一個 mesh，整座展覽只多一次 draw call
  const trims = [];
  function trimBox(pos, sd, along, h, across) {
    const x = Math.abs(sd.t.x) > 0;
    trims.push({ p: pos, s: new THREE.Vector3(x ? along : across, h, x ? across : along) });
  }
  function solid(p, s) { boxes.push({ x0: p.x - s.x / 2, x1: p.x + s.x / 2, z0: p.z - s.z / 2, z1: p.z + s.z / 2 }); }
  function buildShell(c, doors) {
    ORDER.forEach(side => {
      const sd = SIDES[side];
      const mid = c.center.clone().addScaledVector(sd.n, -(c.L / 2 + WALL_T / 2));
      trimBox(mid.clone().setY(WALL_H + .07), sd, c.L + WALL_T * 2 + .14, .14, WALL_T + .14);   // 壓頂
      if (doors.includes(side)) {
        wall(c, side, -c.L / 2, -DOOR / 2);
        wall(c, side, DOOR / 2, c.L / 2);
        wall(c, side, -DOOR / 2, DOOR / 2, 2.55, WALL_H);      // 門楣
        // 門框：兩側門柱＋上框，比牆面略凸
        const open = DOOR / 2 - WALL_T;
        [-1, 1].forEach(k => {
          const p = mid.clone().addScaledVector(sd.t, k * (open - .04)).setY(1.275);
          trimBox(p, sd, .08, 2.55, WALL_T + .1);
          solid(p, trims[trims.length - 1].s);
        });
        trimBox(mid.clone().setY(2.51), sd, open * 2, .08, WALL_T + .1);
      } else wall(c, side, -c.L / 2, c.L / 2);
    });
  }
  W.halls.forEach(h => buildShell(h, h.doors));

  // ---------- 門口垂旗：美術館式直幅布條，印國家輪廓＋館名（不用國旗，避免政治意涵） ----------
  const bannerGeo = keep((() => {
    const g = new THREE.PlaneGeometry(.62, 1.55, 6, 1);
    g.translate(.31 + .04, 0, 0);                         // 左緣靠旗桿
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, .03 * Math.sin((p.getX(i) - .04) / .62 * Math.PI));   // 布面微微鼓起
    g.computeVertexNormals();
    return g;
  })());
  const banners = [];      // 每館一個材質，同館多個門共用；放進 labels 跟著主題重畫
  W.halls.forEach(h => {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    h.doors.forEach((side, i) => {
      const sd = SIDES[side];
      const base = h.center.clone().addScaledVector(sd.n, -(h.L / 2 + WALL_T + .8)).addScaledVector(sd.t, -(DOOR / 2 + .7));
      trims.push({ p: base.clone().setY(POLE_H / 2), s: new THREE.Vector3(.07, POLE_H, .07) });              // 旗桿
      trims.push({ p: base.clone().addScaledVector(sd.t, -.38).setY(POLE_H - .14), s: Math.abs(sd.t.x) > 0
        ? new THREE.Vector3(.76, .04, .04) : new THREE.Vector3(.04, .04, .76) });                    // 橫桿
      solid(base, new THREE.Vector3(.3, 0, .3));
      const m = new THREE.Mesh(bannerGeo, mat);
      m.position.copy(base).setY(POLE_H - .95);
      m.lookAt(m.position.clone().addScaledVector(sd.n, -1));   // 面向門外；布條往遠離門的方向展開
      scene.add(m);
      if (i === 0) banners.push({ mesh: m, draw: () => drawBanner(h) });
    });
  });
  function drawBanner(h) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 640;
    const g = cv.getContext('2d'), fg = P.bg;
    g.fillStyle = P.accent; g.fillRect(0, 0, 256, 640);
    g.strokeStyle = fg; g.globalAlpha = .35; g.lineWidth = 2; g.strokeRect(14, 14, 228, 612); g.globalAlpha = 1;
    const shape = SHAPES[h.country];
    if (shape) {                                          // 輪廓置中放在上半部
      const k = Math.min(180 / shape.w, 300 / shape.h);
      g.setTransform(k, 0, 0, k, 128 - shape.w * k / 2, 50 + (300 - shape.h * k) / 2);
      g.fillStyle = fg; g.fill(new Path2D(shape.path));
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    const name = h.name.toUpperCase();
    let fs = 44;
    do g.font = '600 ' + fs + 'px system-ui, sans-serif'; while (g.measureText(name).width > 210 && --fs > 20);
    g.fillText(name, 128, 440);
    g.fillRect(108, 482, 40, 2);
    g.font = '400 22px system-ui, sans-serif'; g.globalAlpha = .8;
    g.fillText(h.upcoming ? 'Coming soon' : span(h.arts.map(a => a.p)), 128, 520);
    g.fillText(h.upcoming ? '' : h.count + (h.count === 1 ? ' photograph' : ' photographs'), 128, 554);
    return cv;
  }

  const trimGeo = keep((() => {
    const bp = unitBox.attributes.position.array, bn = unitBox.attributes.normal.array, bi = unitBox.index.array;
    const pos = new Float32Array(trims.length * bp.length), nor = new Float32Array(trims.length * bn.length);
    const idx = new Uint32Array(trims.length * bi.length);
    trims.forEach((b, k) => {
      const o = k * bp.length;
      for (let i = 0; i < bp.length; i += 3) {
        pos[o + i] = bp[i] * b.s.x + b.p.x; pos[o + i + 1] = bp[i + 1] * b.s.y + b.p.y; pos[o + i + 2] = bp[i + 2] * b.s.z + b.p.z;
      }
      nor.set(bn, o);
      for (let i = 0; i < bi.length; i++) idx[k * bi.length + i] = bi[i] + o / 3;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  })());
  scene.add(new THREE.Mesh(trimGeo, trimMat));

  // 天花板：每館一片朝下的面，只有從館內往上看得到；從空中俯視是背面、不畫，地毯與展館內部照樣看得見
  // 比牆頂低一點：壓頂往內凸出的底面剛好也在牆頂高度，同高會 z-fighting 閃爍
  const CEIL_Y = WALL_H - .04;
  const ceilGeo = keep((() => {
    const pos = [], idx = [];
    W.halls.forEach((h, k) => {
      const x0 = h.center.x - h.L / 2, x1 = h.center.x + h.L / 2, z0 = h.center.z - h.L / 2, z1 = h.center.z + h.L / 2;
      pos.push(x0, CEIL_Y, z0, x1, CEIL_Y, z0, x1, CEIL_Y, z1, x0, CEIL_Y, z1);
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);      // 由下往上看是逆時針＝正面
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })());
  scene.add(new THREE.Mesh(ceilGeo, ceilMat));

  // ---------- 文字面板（主題換色時重畫） ----------
  const labels = [...banners];       // { mesh, draw: () => canvas }
  function label(draw, w, h, pos, normal) {
    const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    m.scale.set(w, h, 1);
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    scene.add(m);
    labels.push({ mesh: m, draw });
    return m;
  }
  const sprites = [];      // 浮在館上方的館名，遠處也看得到
  function hallSprite(c, text) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    s.position.copy(c.center).setY(WALL_H + 2.2);
    s.userData = { text, base: [7, 1.75], c };
    scene.add(s);
    sprites.push(s);
  }

  // ---------- 作品 ----------
  const poolTex = keep(new THREE.CanvasTexture((() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), grd = g.createRadialGradient(64, 40, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return cv;
  })()));
  const poolMat = keep(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: P.pool, depthWrite: false }));
  const soonMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const soonCanvas = document.createElement('canvas');
  const soonTex = keep(new THREE.CanvasTexture(soonCanvas));
  soonTex.colorSpace = THREE.SRGBColorSpace;
  soonMat.map = soonTex;
  function drawSoon() {
    const cv = textCanvas([
      { text: 'Coming soon', font: '500 54px system-ui, sans-serif', color: INK_SUB, y: 180 },
      { text: 'more photographs from here', font: '400 30px system-ui, sans-serif', color: INK_SUB, y: 240 }
    ], 640, 420);
    soonCanvas.width = cv.width; soonCanvas.height = cv.height;
    const g = soonCanvas.getContext('2d');
    g.fillStyle = P.mat; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(cv, 0, 0);
    soonTex.needsUpdate = true;
  }
  drawSoon();

  const arts = [];
  const byId = new Map();
  const tagMeshes = [];
  W.halls.forEach(h => {
    h.arts = [];
    let lastGroup = null;
    h.placed.forEach(it => {
      const sd = SIDES[it.side];
      const center = h.center.clone().addScaledVector(sd.n, -h.L / 2 + .03).addScaledVector(sd.t, it.u).setY(ART_Y);
      const g = new THREE.Group();
      const frame = new THREE.Mesh(unitBox, frameMat);
      frame.scale.set(it.w + .24, it.h + .24, .045);
      const mat = new THREE.Mesh(unitPlane, matMat);
      mat.scale.set(it.w + .16, it.h + .16, 1); mat.position.z = .024;
      const photo = new THREE.Mesh(unitPlane, it.p ? new THREE.MeshBasicMaterial({ color: P.mat }) : soonMat);
      photo.scale.set(it.w, it.h, 1); photo.position.z = .026;
      const pool = new THREE.Mesh(unitPlane, poolMat);
      pool.scale.set(it.w + .8, it.h + 1.1, 1); pool.position.set(0, .3, -.02);
      g.add(pool, frame, mat, photo);
      g.position.copy(center);
      g.lookAt(center.clone().add(sd.n));
      scene.add(g);
      if (it.p) {
        const a = { p: it.p, hall: h, center, n: sd.n, w: it.w, h: it.h, group: g, photo, pool };
        photo.userData.art = a;
        arts.push(a); h.arts.push(a); byId.set(it.p.id, a);
        // 作品標籤：畫框右下的小牌，點了一樣開大圖
        const tag = label(() => textCanvas([
          { text: it.p.title, font: '600 30px system-ui, sans-serif', color: INK, y: 46 },
          { text: it.p.place, font: '400 24px system-ui, sans-serif', color: INK_SUB, y: 92 },
          { text: it.p.date, font: '400 22px system-ui, sans-serif', color: INK_SUB, y: 128 }
        ], 512, 168, { align: 'left', pad: 26, bg: P.mat }), .42, .14,
          center.clone().addScaledVector(sd.t, it.w / 2 + .38).setY(ART_Y - it.h / 2 + .07).addScaledVector(sd.n, .012), sd.n);
        tag.material.transparent = false;
        tag.userData.art = a;
        tagMeshes.push(tag);
      }
      // 地區名：每組第一幅上方
      if (it.group !== lastGroup && it.group !== '_soon') {
        const r = data.regions[it.group];
        label(() => textCanvas([{ text: r.name.toUpperCase(), font: '500 48px system-ui, sans-serif', color: P.sub, y: 64 }], 768, 128),
          2.4, .4, center.clone().setY(ART_Y + .95).addScaledVector(sd.n, .01), sd.n);
      }
      lastGroup = it.group;
    });
    // 門外上方館名（每個門）、浮空館名
    h.doors.forEach(side => {
      const dsd = SIDES[side];
      label(() => textCanvas([{ text: h.name.toUpperCase(), font: '600 64px system-ui, sans-serif', color: P.text, y: 64 }], 1024, 128),
        3.6, .45, h.center.clone().addScaledVector(dsd.n, -h.L / 2 - WALL_T - .03).setY(3.2), dsd.n.clone().negate());
    });
    hallSprite(h, h.upcoming ? h.name + ' · soon' : h.name + ' · ' + h.count);
  });
  // ---------- 展覽說明牌：立在入口內側，點了開說明 ----------
  const ym = d => d.slice(0, 7).replace('-', '.');
  const span = ps => { const d = ps.map(p => p.date).sort(); return ym(d[0]) + (d.length > 1 && ym(d[0]) !== ym(d[d.length - 1]) ? ' — ' + ym(d[d.length - 1]) : ''); };
  const notes = [];
  const standMat = keep(new THREE.MeshLambertMaterial({ color: P.frame }));
  function placard(h, offset, note) {
    const sd = SIDES[h.doors[0]];
    const side = sd.t.clone();
    // 門內 3m、往旁邊偏移，面向走進來的人
    const base = h.center.clone().addScaledVector(sd.n, -h.L / 2 + 3).addScaledVector(side, offset);
    const g = new THREE.Group();
    const stand = new THREE.Mesh(unitBox, standMat);
    stand.scale.set(.06, 1.02, .06); stand.position.y = .51;
    const board = new THREE.Mesh(unitBox, standMat);
    board.scale.set(.66, .48, .03); board.position.set(0, 1.12, 0); board.rotation.x = -.45;
    g.add(stand, board);
    g.position.copy(base);
    g.lookAt(base.clone().addScaledVector(sd.n, -1));
    scene.add(g);
    const face = label(() => textCanvas([
      { text: note.over, font: '500 26px system-ui, sans-serif', color: INK_SUB, y: 58 },
      { text: note.title, font: '600 50px system-ui, sans-serif', color: INK, y: 128 },
      { text: note.teaser, font: '400 26px system-ui, sans-serif', color: INK_SUB, y: 200 },
      { text: coarse ? 'Tap to read' : 'Click to read', font: '500 24px system-ui, sans-serif', color: INK_ACCENT, y: 296 }
    ], 640, 352, { bg: P.mat }), .62, .44, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    face.material.transparent = false;
    scene.remove(face);
    face.position.set(0, 1.12, 0); face.rotation.set(-.45, 0, 0); face.translateZ(.017);
    g.add(face);
    const n = { ...note, hall: h, center: base.clone().setY(1.1), n: sd.n.clone(), mesh: face };
    face.userData.note = n;
    notes.push(n);
  }
  W.halls.forEach(h => {
    if (h.upcoming) {
      placard(h, 1.3, {
        over: 'Coming soon', title: h.name,
        teaser: 'This pavilion is being prepared',
        body: [data.intros[h.country] || 'Photographs from ' + h.name + ' are on their way. This pavilion opens when they are added.']
      });
      return;
    }
    leafletStand(h, -1.3);
    // 一般展館不放說明牌（門外已有館名與垂旗）；只有起點館立整個展覽的說明
    if (h.home) {
      placard(h, 1.3, {
        over: 'Exhibition', title: 'Curated Photography',
        teaser: 'Kuan-Lin (Brian) Chen · ' + data.photos.length + ' photographs',
        body: [
          data.intros._exhibition || 'Welcome to my photography exhibition — a few favorite photos from my travels.',
          data.photos.length + ' photographs from ' + data.countries.map(c => c.name).join(', ') + ', ' + span(data.photos) + '.',
          'Each pavilion stands where its photos were taken — the floor is a world map, so walking north from Taiwan brings you to Japan and south to Australia. Open the world map (top left) to jump between places, or pick up a leaflet from the stand in any pavilion to see every work at once.'
        ]
      });
    }
  });
  // DM 看板：每館入口內側一座直立看板（像放展覽傳單的架子），點了打開三折 DM 並翻到這一館
  function leafletStand(h, offset) {
    const sd = SIDES[h.doors[0]];
    const base = h.center.clone().addScaledVector(sd.n, -h.L / 2 + 3).addScaledVector(sd.t, offset);
    const g = new THREE.Group();
    const post = new THREE.Mesh(unitBox, standMat);
    post.scale.set(.07, .75, .07); post.position.y = .375;
    const board = new THREE.Mesh(unitBox, standMat);
    board.scale.set(.82, 1.14, .04); board.position.y = 1.3; board.rotation.x = -.08;
    g.add(post, board);
    g.position.copy(base);
    g.lookAt(base.clone().addScaledVector(sd.n, -1));
    scene.add(g);
    const face = label(() => drawLeafletBoard(h), .76, 1.08, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    face.material.transparent = false;
    scene.remove(face);
    face.position.set(0, 1.3, 0); face.rotation.set(-.08, 0, 0); face.translateZ(.022);
    g.add(face);
    const n = { over: 'Leaflet', title: 'Exhibition leaflet', leaflet: h, hall: h, center: base.clone().setY(1.3), n: sd.n.clone(), mesh: face };
    face.userData.note = n;
    notes.push(n);
  }
  function drawLeafletBoard(h) {
    const cv = document.createElement('canvas');
    cv.width = 384; cv.height = 546;
    const g = cv.getContext('2d');
    g.fillStyle = P.mat; g.fillRect(0, 0, 384, 546);
    g.fillStyle = INK_ACCENT; g.fillRect(0, 0, 384, 70);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#FBFAF6'; g.font = '600 24px system-ui, sans-serif';
    g.fillText('EXHIBITION LEAFLET', 192, 36);
    // 三折 DM 示意：中間一折正面、兩側微微摺起
    const fold = (x0, x1, y0, y1, shade) => {
      g.beginPath(); g.moveTo(x0, y0[0]); g.lineTo(x1, y0[1]); g.lineTo(x1, y1[1]); g.lineTo(x0, y1[0]); g.closePath();
      g.fillStyle = shade; g.fill(); g.strokeStyle = INK_ACCENT; g.lineWidth = 2; g.stroke();
    };
    fold(62, 140, [118, 128], [282, 272], '#E9E4D8');
    fold(244, 322, [128, 118], [272, 282], '#E9E4D8');
    fold(140, 244, [128, 128], [272, 272], '#FFFFFF');
    const shape = SHAPES[h.country];
    if (shape) {
      const k = Math.min(70 / shape.w, 100 / shape.h);
      g.setTransform(k, 0, 0, k, 192 - shape.w * k / 2, 200 - shape.h * k / 2);
      g.fillStyle = INK_ACCENT; g.fill(new Path2D(shape.path));
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.fillStyle = '#C9C1B1';
    [[74, 150], [74, 170], [74, 190], [256, 150], [256, 170], [256, 190]].forEach(([x, y]) => g.fillRect(x, y, 52, 6));
    g.fillStyle = INK; g.font = '600 38px system-ui, sans-serif';
    g.fillText(h.name, 192, 340);
    g.fillStyle = INK_SUB; g.font = '400 22px system-ui, sans-serif';
    g.fillText(data.photos.length + ' works · every pavilion', 192, 384);
    g.fillStyle = INK_ACCENT; g.fillRect(132, 444, 120, 2);
    g.font = '600 24px system-ui, sans-serif';
    g.fillText(coarse ? 'Tap to open' : 'Click to open', 192, 486);
    return cv;
  }
  function openNote(n) {
    if (n.leaflet) { openLeaflet(n.leaflet.country); return; }
    noteDialog.querySelector('.gx-note-over').textContent = n.over;
    noteDialog.querySelector('h2').textContent = n.title;
    noteDialog.querySelector('.gx-note-body').replaceChildren(...n.body.map(t => { const p = document.createElement('p'); p.textContent = t; return p; }));
    noteDialog.showModal();
  }
  $('.gx-note-close').addEventListener('click', () => noteDialog.close());
  noteDialog.addEventListener('click', e => { if (e.target === noteDialog) noteDialog.close(); });
  noteDialog.addEventListener('close', () => canvas.focus({ preventScroll: true }));

  // ---------- 國家輪廓地毯：館內地板，北方朝上，標出各地區位置 ----------
  W.halls.forEach(h => {
    const shape = SHAPES[h.country];
    if (!shape) return;                                   // 沒產生輪廓的國家就不鋪（重跑 tools/build_shapes.py）
    const room = h.L - 2.6;
    const a = shape.w / shape.h;
    const rw = a >= 1 ? room : room * a, rd = a >= 1 ? room / a : room;
    const rug = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    rug.scale.set(rw, rd, 1);
    rug.rotation.x = -Math.PI / 2;                        // 貼圖上方＝北
    rug.position.copy(h.center).setY(.012);
    scene.add(rug);
    const path = new Path2D(shape.path);
    const regions = h.upcoming ? [] : data.countries.find(c => c.name === h.country).regions;
    labels.push({ mesh: rug, draw: () => {
      const W2 = 1024;
      const cv = document.createElement('canvas');
      const pad = 48, sx = (W2 - pad * 2) / shape.w;
      cv.width = W2; cv.height = Math.round(shape.h * sx + pad * 2);
      const g = cv.getContext('2d');
      g.fillStyle = P.rug; g.globalAlpha = .94;
      g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 36); g.fill();
      g.globalAlpha = 1;
      g.setTransform(sx, 0, 0, sx, pad, pad);
      g.fillStyle = P.land; g.fill(path);
      g.lineWidth = 3 / sx; g.strokeStyle = P.accent; g.stroke(path);
      g.setTransform(1, 0, 0, 1, 0, 0);
      // 地區中心點（分組用的位置，不是拍攝座標）
      const perDeg = shape.h / (shape.bbox[3] - shape.bbox[1]);       // 輪廓單位 / 緯度
      g.font = '600 30px system-ui, sans-serif'; g.textBaseline = 'middle';
      const pts = regions.map(r => ({ r,
        x: pad + (r.lon - shape.bbox[0]) * shape.k * perDeg * sx, y: pad + (shape.bbox[3] - r.lat) * perDeg * sx }));
      const taken = pts.map(q => [q.x - 13, q.y - 13, q.x + 13, q.y + 13]);
      const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      pts.forEach(q => {
        g.fillStyle = P.accent; g.beginPath(); g.arc(q.x, q.y, 11, 0, Math.PI * 2); g.fill();
      });
      // 地名依序試 右／左／上／下，選第一個不撞到其他點或地名、也不出界的位置
      pts.forEach(q => {
        const w = g.measureText(q.r.name).width, h = 34;
        const opts = [
          { x: q.x + 18, y: q.y, al: 'left', b: [q.x + 16, q.y - h / 2, q.x + 20 + w, q.y + h / 2] },
          { x: q.x - 18, y: q.y, al: 'right', b: [q.x - 20 - w, q.y - h / 2, q.x - 16, q.y + h / 2] },
          { x: q.x, y: q.y - 30, al: 'center', b: [q.x - w / 2, q.y - 30 - h / 2, q.x + w / 2, q.y - 30 + h / 2] },
          { x: q.x, y: q.y + 30, al: 'center', b: [q.x - w / 2, q.y + 30 - h / 2, q.x + w / 2, q.y + 30 + h / 2] }
        ];
        const inside = o => o.b[0] > 4 && o.b[2] < cv.width - 4 && o.b[1] > 4 && o.b[3] < cv.height - 4;
        const o = opts.find(o => inside(o) && !taken.some(t => hit(o.b, t))) || opts.find(inside) || opts[0];
        taken.push(o.b);
        g.textAlign = o.al;
        g.lineWidth = 6; g.strokeStyle = P.rug; g.strokeText(q.r.name, o.x, o.y);
        g.fillStyle = P.text; g.fillText(q.r.name, o.x, o.y);
      });
      return cv;
    } });
  });

  // 作品順序與 DM 一致：國家 → 地區
  const ordered = [];
  data.countries.forEach(c => c.regions.forEach(r => arts.filter(a => a.p.region === r.key).forEach(a => ordered.push(a))));

  function drawLabels() {
    labels.forEach(l => {
      const old = l.mesh.material.map;
      const t = new THREE.CanvasTexture(l.draw());
      t.colorSpace = THREE.SRGBColorSpace;
      l.mesh.material.map = t; l.mesh.material.needsUpdate = true;
      old && old.dispose();
    });
    sprites.forEach(s => {
      const old = s.material.map;
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = P.mat; g.globalAlpha = .82;
      g.beginPath(); g.roundRect(4, 14, 504, 100, 50); g.fill();
      g.globalAlpha = 1; g.fillStyle = P.text; g.font = '600 52px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.userData.text, 256, 66);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      s.material.map = t; s.material.needsUpdate = true;
      old && old.dispose();
    });
  }
  drawLabels();

  // ---------- 貼圖：靠近才載入，走遠釋放 ----------
  const loader = new THREE.TextureLoader();
  function loadHall(h) {
    if (h.loaded) return;
    h.loaded = true;
    h.arts.forEach(a => {
      loader.load(src(a.p, 960), tex => {
        if (disposed || !h.loaded) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        a.photo.material.map = tex;
        a.photo.material.needsUpdate = true;
        applyDim();
      });
    });
  }
  function unloadHall(h) {
    if (!h.loaded) return;
    h.loaded = false;
    h.arts.forEach(a => {
      if (a.photo.material.map) { a.photo.material.map.dispose(); a.photo.material.map = null; a.photo.material.needsUpdate = true; }
    });
    applyDim();
  }
  function streamHalls(at) {
    W.halls.forEach(h => {
      const d = Math.hypot(wrapDX(at.x - h.center.x), wrapDZ(at.z - h.center.z));
      if (d < h.L / 2 + 14) loadHall(h);          // 走到離館約 14m 才開始載（走路約 3 秒，進門前載好）
      else if (d > h.L / 2 + 50) unloadHall(h);
    });
  }

  // ---------- 玩家 / 鏡頭 ----------
  const me = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector2() };
  let tween = null, top = false, beforeTop = null, autoWalk = null;
  const pose = (pos, yaw, pitch = 0) => ({ pos: pos.clone().setY(EYE), yaw, pitch });
  // 出生點：起點館的入口內側，面向展覽說明牌
  const spawnPose = () => entrancePose(W.homeHall);
  function entrancePose(h) {
    const sd = SIDES[h.doors[0]];
    return pose(h.center.clone().addScaledVector(sd.n, -h.L / 2 + 1.2), yawFacing(sd.n), -.02);
  }
  function artPose(a) {
    const d = Math.max(1.9, a.w * 1.1 + .6);
    return pose(a.center.clone().addScaledVector(a.n, Math.min(d, a.hall.L - 1.2)), yawFacing(a.n.clone().negate()), -.03);
  }
  function topPose() {
    const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + 40, spanZ = Math.max(...zs) - Math.min(...zs) + 40;
    const vt = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const ht = vt * camera.aspect;
    const hgt = Math.max(spanZ / 2 / vt, spanX / 2 / ht) * 1.05;
    return { pos: new THREE.Vector3(cx, hgt, cz + hgt * .06), yaw: 0, pitch: -1.5 };
  }
  function containerAt(p) {
    return containers.find(c => Math.abs(p.x - c.center.x) < c.L / 2 + .1 && Math.abs(p.z - c.center.z) < c.L / 2 + .1) || null;
  }

  // 移動到某個姿勢：同一個空間內滑過去；跨空間或很遠就飛（升空→移動→降落）
  function travel(to, { instant = false } = {}) {
    autoWalk = null;
    me.vel.set(0, 0);
    if (instant || reduceMotion.matches) {
      tween = null;
      me.pos.copy(to.pos); me.yaw = to.yaw; me.pitch = to.pitch;
      streamHalls(me.pos);
      invalidate();
      return;
    }
    const from = { pos: me.pos.clone(), yaw: me.yaw, pitch: me.pitch };
    const dist = Math.hypot(to.pos.x - from.pos.x, to.pos.z - from.pos.z);
    const sameRoom = containerAt(from.pos) && containerAt(from.pos) === containerAt(to.pos) && from.pos.y < 3 && to.pos.y < 3;
    const fly = !sameRoom && dist > 3;
    let dy = to.yaw - from.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // 起點或終點是俯視（pitch 近 -90°）時不再額外升空、低頭：疊上去會越過正下方，畫面翻轉 180°
    const steep = Math.min(from.pitch, to.pitch) < -1;
    tween = { from, to, dyaw: dy, fly, t0: performance.now(),
      dur: fly ? Math.min(2400, 900 + dist * 9) : Math.min(900, 380 + dist * 90),
      arc: fly && !steep ? Math.min(90, 8 + dist * .55) : 0,
      dip: fly ? THREE.MathUtils.clamp(Math.min(from.pitch, to.pitch) + 1.5, 0, .9) : 0 };
    streamHalls(to.pos);
    invalidate();
  }

  // ---------- UI ----------
  let near = null, lastCap = '';
  function setCaption() {
    let t, s;
    if (top) { t = 'World map'; s = 'Opening the map…'; }
    else if (near && near.p) { t = near.p.title; s = near.p.place + ' · ' + near.p.date; }
    else if (near) { t = near.title; s = near.leaflet ? 'Every work in the exhibition' : near.over + ' note'; }
    else {
      const c = containerAt(me.pos);
      t = c ? c.name + ' pavilion' : 'On the map';
      s = c ? (c.upcoming ? 'Coming soon' : c.count + (c.count === 1 ? ' photograph' : ' photographs')) : 'Walk to a pavilion, or open the world map';
    }
    const key = t + '|' + s + '|' + !!near;
    if (key === lastCap) return;
    lastCap = key;
    capT.textContent = t; capS.textContent = s;
    viewBtn.disabled = !near;
    viewBtn.textContent = near && !near.p ? (near.leaflet ? 'Open' : 'Read') : 'View';
  }
  function syncUI() { setCaption(); }

  function setTop(on, silent) {
    if (on === top) return;
    top = on;
    sprites.forEach(s => { s.material.depthTest = !on; });
    if (on) { beforeTop = { pos: me.pos.clone(), yaw: me.yaw, pitch: me.pitch }; if (!silent) travel(topPose()); }
    else if (!silent && beforeTop) travel(pose(beforeTop.pos, beforeTop.yaw, beforeTop.pitch));
    hintEl.hidden = on;
    setCaption();
  }
  // 小地圖 → 飛上天俯視（轉場）→ 世界地圖相簿；選了地點就從空中飛過去，關掉則降回原地
  let toMapTimer = 0, picked = false;
  const atlas = createAtlas(root, data, {
    onRegion: key => { picked = true; const a = ordered.find(x => x.p.region === key); a && goArt(a); },
    onPhoto: id => { picked = true; const a = byId.get(id); a && goArt(a); },
    onUpcoming: name => { picked = true; const h = W.halls.find(x => x.country === name); setTop(false, true); h && travel(entrancePose(h)); }
  });
  atlas.onClose(() => {
    if (!picked && top) setTop(false);                   // 沒選地點：飛回剛才的位置
    picked = false;
    canvas.focus({ preventScroll: true });
  });
  function openMap() {
    if (top || atlas.isOpen) return;
    if (reduceMotion.matches) return atlas.open();
    setTop(true);
    toMapTimer = setTimeout(() => { if (!disposed) atlas.open(); }, (tween ? tween.dur : 0) + 120);
  }
  miniBtn.addEventListener('click', openMap);

  // ---------- 小地圖：整個地面範圍＋展館＋目前位置與面向 ----------
  const miniBase = { full: null };
  let miniDpr = 1, miniKey = '';
  function buildMini() {
    miniDpr = Math.min(devicePixelRatio || 1, 2);
    const miniW = coarse ? 112 : 148;
    const HW = hallX1 - hallX0;
    const miniH = Math.round(Math.min(miniW * GD / HW, miniW * 1.35));
    miniCv.width = Math.round(miniW * miniDpr);
    miniCv.height = Math.round(miniH * miniDpr);
    miniCv.style.width = miniW + 'px'; miniCv.style.height = miniH + 'px';
    // 地圖依寬度縮放；高度放不下時以目前位置為中心捲動（見 drawMini）
    const full = document.createElement('canvas');
    full.width = Math.round(miniCv.width * GW / HW); full.height = Math.round(miniCv.width * GD / HW);
    drawMap(full, false);
    const g = full.getContext('2d'), k = full.width / GW;
    containers.forEach(c => {
      const sz = Math.max(c.L * k, 4 * miniDpr);
      const x = (c.center.x - minX) * k - sz / 2, y = (c.center.z - minZ) * k - sz / 2;
      g.fillStyle = c.upcoming ? P.sub : P.accent;
      g.fillRect(x, y, sz, sz);
    });
    miniBase.full = full;
    miniKey = '';
  }
  function drawMini() {
    const full = miniBase.full, k = full.width / GW;
    const px = (me.pos.x - minX) * k, pz = (me.pos.z - minZ) * k;
    const key = Math.round(px) + ',' + Math.round(pz) + ',' + me.yaw.toFixed(2) + top;
    if (key === miniKey) return;
    miniKey = key;
    const g = miniCv.getContext('2d');
    // 平常固定顯示所有展館；走出展館範圍時跟著玩家左右捲動（地圖首尾相接）
    const w = miniCv.width, m = 14 * miniDpr;
    const ox = Math.round(Math.min(Math.max(px - w / 2, Math.min((hallX0 - minX) * k, px - w + m)), Math.max((hallX1 - minX) * k - w, px - m)));   // 取整數，三份拼接處才不會有細縫
    const oy = Math.min(Math.max(pz - miniCv.height / 2, 0), Math.max(full.height - miniCv.height, 0));
    g.clearRect(0, 0, w, miniCv.height);
    [-full.width, 0, full.width].forEach(d => g.drawImage(full, d - ox, -oy));
    if (top) return;
    const x = px - ox, y = pz - oy, r = 4.5 * miniDpr;
    g.fillStyle = P.accent; g.globalAlpha = .3;
    g.beginPath(); g.moveTo(x, y);
    g.arc(x, y, r * 4, -Math.PI / 2 - me.yaw - .5, -Math.PI / 2 - me.yaw + .5); g.closePath(); g.fill();
    g.globalAlpha = 1; g.fillStyle = P.text; g.strokeStyle = P.mat; g.lineWidth = 1.5 * miniDpr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  buildMini();

  // ---------- 三折 DM 總覽（浮層）：點作品就走到那幅畫前 ----------
  let dm = null;
  function openLeaflet(country) {
    if (!dm) dm = mountBrowse(dialogBody, data, { onOpen: id => { dialog.close(); const a = byId.get(id); a && goArt(a); }, eager: true });
    dialog.showModal();
    if (country) dm.reveal(country);
  }
  dmBtn.addEventListener('click', () => openLeaflet());
  $('.gx-dm-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // 點背景關閉
  dialog.addEventListener('close', () => canvas.focus({ preventScroll: true }));

  // ---------- 全螢幕沉浸：手機一律開啟（關閉＝回到 Browse），桌機可切換 ----------
  let immersive = false;
  function setImmersive(on) {
    immersive = on;
    museumEl.classList.toggle('immersive', on);
    document.body.classList.toggle('gx-immersive', on);
    fullBtn.setAttribute('aria-pressed', String(on));
    const label = coarse ? 'Leave the museum' : on ? 'Exit full window (Esc)' : 'Full window';
    fullBtn.setAttribute('aria-label', label);
    fullBtn.title = label;
    fullBtn.innerHTML = '<i class="bi ' + (coarse ? 'bi-x-lg' : on ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen') + '" aria-hidden="true"></i>';
    if (on) canvas.focus({ preventScroll: true });
  }
  fullBtn.addEventListener('click', () => {
    if (coarse) setState({ mode: 'browse' });
    else setImmersive(!immersive);
  });
  function onDocKey(e) {
    if (e.key !== 'Escape' || !immersive || coarse) return;
    if (dialog.open || noteDialog.open || atlas.isOpen || document.body.classList.contains('lb-open')) return;
    setImmersive(false);
  }
  document.addEventListener('keydown', onDocKey);
  setImmersive(coarse);

  function visibleList() {
    const s = getState();
    const l = ordered.filter(a => matches(a.p, s));
    return l.length ? l : ordered;
  }
  function goArt(a, opts) { setTop(false, true); travel(artPose(a), opts); setState({ selected: a.p.id }); }
  function step(d) {
    const list = visibleList();
    const curId = near && near.p ? near.p.id : getState().selected;
    const i = list.findIndex(a => a.p.id === curId);
    goArt(i < 0 ? (d > 0 ? list[0] : list[list.length - 1]) : list[(i + d + list.length) % list.length]);
  }
  $('.gx-mu-prev').addEventListener('click', () => step(-1));
  $('.gx-mu-next').addEventListener('click', () => step(1));
  const activate = n => n && (n.p ? onOpen(n.p.id) : openNote(n));
  viewBtn.addEventListener('click', () => activate(near));

  function applyDim() {
    const s = getState();
    const any = !!(s.country || s.region);
    const dimmed = new THREE.Color(.3, .3, .3), full = new THREE.Color(1, 1, 1), blank = new THREE.Color(P.mat);
    arts.forEach(a => {
      const on = !any || matches(a.p, s);
      a.photo.material.color.copy(a.photo.material.map ? (on ? full : dimmed) : blank);
      a.pool.visible = on;
    });
    invalidate();
  }

  // ---------- 輸入：鍵盤 ----------
  const keys = new Set();
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', ShiftLeft: 'run', ShiftRight: 'run' };
  function onKeyDown(e) {
    if (e.key === 'Enter' && near) { activate(near); return; }
    if (e.code === 'KeyM') { openMap(); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (top) return;
    keys.add(k);
    tween = null; autoWalk = null;
    hintEl.classList.add('gone');
    invalidate();
  }
  const onKeyUp = e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); };
  const clearKeys = () => keys.clear();
  canvas.addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  canvas.addEventListener('blur', clearKeys);
  addEventListener('blur', clearKeys);

  // ---------- 輸入：虛擬搖桿 ----------
  const joy = { id: null, x: 0, y: 0 };
  function joyMove(e) {
    const r = joyEl.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    joy.x = x; joy.y = y;
    knobEl.style.transform = 'translate(' + (x * R * .55) + 'px,' + (y * R * .55) + 'px)';
    invalidate();
  }
  joyEl.addEventListener('pointerdown', e => {
    if (top) return;
    joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId);
    tween = null; autoWalk = null; hintEl.classList.add('gone');
    joyMove(e); e.preventDefault();
  });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knobEl.style.transform = ''; };
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  // ---------- 輸入：拖曳環視、hover、點擊 ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const photoMeshes = [...arts.map(a => a.photo), ...tagMeshes, ...notes.map(n => n.mesh)];
  let drag = null, hovered = null, lastMove = null, moveQueued = false;
  function rayFrom(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pickArt(e) {
    if (top) return null;
    rayFrom(e);
    const hit = ray.intersectObjects([...photoMeshes, ...wallMeshes, ground], false)[0];
    return hit && (hit.object.userData.art || hit.object.userData.note) || null;
  }
  function pickGround(e) {
    rayFrom(e);
    const hit = ray.intersectObjects([...grounds, ...wallMeshes], false)[0];     // 牆擋住就不算
    return hit && grounds.includes(hit.object) ? hit.point : null;
  }
  function setHover(a, e) {
    if (hovered !== a) {
      if (hovered && hovered.group) hovered.group.position.copy(hovered.center);
      hovered = a;
      if (a && a.group) a.group.position.copy(a.center).addScaledVector(a.n, .04);
      canvas.style.cursor = a ? 'pointer' : '';
      invalidate();
    }
    hoverEl.hidden = !a;
    if (a) {
      hoverEl.textContent = a.p ? a.p.title : a.title + ' — read';
      const r = stage.getBoundingClientRect();
      hoverEl.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top + 14) + 'px)';
    }
  }
  function onDown(e) {
    canvas.focus({ preventScroll: true });
    drag = { x: e.clientX, y: e.clientY, yaw: me.yaw, pitch: me.pitch, moved: false, id: e.pointerId };
  }
  function onMove(e) {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) {
        drag.moved = true; canvas.setPointerCapture(e.pointerId); hintEl.classList.add('gone'); setHover(null);
        tween = null;
      }
      if (drag.moved && !top) {
        // 拖曳方向＝視線方向（往右拖就往右看）
        me.yaw = drag.yaw - dx * .0042;
        me.pitch = THREE.MathUtils.clamp(drag.pitch - dy * .0032, -.6, .5);
        invalidate();
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    lastMove = e;
    if (!moveQueued) {
      moveQueued = true;
      requestAnimationFrame(() => { moveQueued = false; if (lastMove && !disposed && !tween) setHover(pickArt(lastMove), lastMove); });
    }
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) {
      if (e.pointerType === 'mouse') requestAnimationFrame(() => { if (!disposed) setHover(pickArt(e), e); });
      return;
    }
    if (top) return;
    const a = pickArt(e);
    if (a && a.p) { setState({ selected: a.p.id }); onOpen(a.p.id); return; }
    if (a) { openNote(a); return; }
    const p = pickGround(e);
    if (!p) return;
    {
      autoWalk = { x: p.x, z: p.z, t: performance.now(), last: me.pos.clone() };
      invalidate();
    }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => setHover(null));

  // ---------- 物理：移動與碰撞 ----------
  function collide(p) {
    for (let it = 0; it < 2; it++) {
      for (const b of boxes) {
        const cx = Math.min(Math.max(p.x, b.x0), b.x1), cz = Math.min(Math.max(p.z, b.z0), b.z1);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R_PLAYER * R_PLAYER) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = (R_PLAYER - d) / d;
          p.x += dx * push; p.z += dz * push;
        } else {
          const opts = [[b.x0 - R_PLAYER - p.x, 0], [b.x1 + R_PLAYER - p.x, 0], [0, b.z0 - R_PLAYER - p.z], [0, b.z1 + R_PLAYER - p.z]];
          const o = opts.reduce((m, v) => Math.abs(v[0] + v[1]) < Math.abs(m[0] + m[1]) ? v : m);
          p.x += o[0]; p.z += o[1];
        }
      }
    }
  }

  let streamT = 0;
  function physics(dt, now) {
    let f = 0, s = 0;
    if (keys.has('f')) f += 1;
    if (keys.has('b')) f -= 1;
    if (keys.has('r')) s += 1;
    if (keys.has('l')) s -= 1;
    if (keys.has('tl')) me.yaw += TURN * dt;
    if (keys.has('tr')) me.yaw -= TURN * dt;
    let speed = keys.has('run') ? RUN : WALK;
    if (joy.id !== null) {
      f = -joy.y; s = joy.x;
      const m = Math.hypot(f, s);
      speed = JOY_MAX * Math.min(1, m);
      if (m) { f /= m; s /= m; }
    }
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    let tx = fx * f - fz * s, tz = fz * f + fx * s;
    if (autoWalk && !f && !s) {
      const dx = autoWalk.x - me.pos.x, dz = autoWalk.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d < .3) { autoWalk = null; tx = tz = 0; }
      else {
        tx = dx / d; tz = dz / d; speed = Math.min(WALK * 1.3, d * 2.5 + .5);
        if (now - autoWalk.t > 600) {
          if (autoWalk.last.distanceTo(me.pos) < .15) autoWalk = null;     // 撞牆卡住就停
          else { autoWalk.t = now; autoWalk.last.copy(me.pos); }
        }
      }
    } else if (f || s) autoWalk = null;
    const m = Math.hypot(tx, tz);
    if (m > 1) { tx /= m; tz /= m; }
    const k = 1 - Math.exp(-dt * 10);
    me.vel.x += (tx * speed - me.vel.x) * k;
    me.vel.y += (tz * speed - me.vel.y) * k;
    if (Math.abs(me.vel.x) + Math.abs(me.vel.y) < .01 && !m) { me.vel.set(0, 0); return !!autoWalk; }
    me.pos.x += me.vel.x * dt;
    me.pos.z += me.vel.y * dt;
    collide(me.pos);
    // 繞地球一圈：從另一側出來
    const sx = me.pos.x < minX ? WRAP : me.pos.x >= maxX ? -WRAP : 0;
    const sz = me.pos.z < minZ ? GD : me.pos.z >= maxZ ? -GD : 0;
    if (sx || sz) {
      me.pos.x += sx; me.pos.z += sz;
      if (autoWalk) { autoWalk.x += sx; autoWalk.z += sz; autoWalk.last.x += sx; autoWalk.last.z += sz; }
    }
    if (now - streamT > 400) { streamT = now; streamHalls(me.pos); }
    return true;
  }

  function nearestArt() {
    if (top || me.pos.y > 3) return null;
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    let best = null, bd = 4.6;
    for (const a of [...arts, ...notes]) {
      const dx = a.center.x - me.pos.x, dz = a.center.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / d > .55) { bd = d; best = a; }
    }
    return best;
  }

  // ---------- 主題 ----------
  function applyTheme() {
    P = theme();
    scene.background = new THREE.Color(P.bg);
    scene.fog.color.set(P.bg);
    wallMat.color.set(P.wall); frameMat.color.set(P.frame); matMat.color.set(P.mat); standMat.color.set(P.frame); trimMat.color.set(P.trim); ceilMat.color.set(P.ceil);
    poolMat.opacity = P.pool;
    hemi.intensity = P.hemi; dir.intensity = P.dir;
    drawGround(); drawSoon(); drawLabels(); buildMini(); applyDim();
  }
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

  // ---------- 繪製迴圈：有動作才跑 ----------
  let raf = 0, disposed = false, onScreen = true, last = 0;
  function invalidate() { if (!raf && !disposed) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed || document.hidden || !onScreen) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now;
    let busy = false;
    if (tween) {
      const T = tween, t = Math.min((now - T.t0) / T.dur, 1), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      me.pos.lerpVectors(T.from.pos, T.to.pos, e);
      me.pos.y += T.arc * Math.sin(Math.PI * e);
      me.yaw = T.from.yaw + T.dyaw * e;
      me.pitch = T.from.pitch + (T.to.pitch - T.from.pitch) * e - T.dip * Math.sin(Math.PI * e);
      if (t >= 1) { tween = null; me.pos.copy(T.to.pos); streamHalls(me.pos); } else busy = true;
    } else if (!top) {
      busy = physics(dt, now) || keys.size > 0 || joy.id !== null;
    }
    // 館名：越高越大，從空中也讀得到；高空時移到館的北側，不蓋住展館
    const k = THREE.MathUtils.clamp(me.pos.y / 30, 1, 4.5);
    const inside = me.pos.y < 3 ? containerAt(me.pos) : null;
    sprites.forEach(s => {
      s.visible = s.userData.c !== inside;            // 人在館內就不顯示頭頂的館名牌
      const c = s.userData.c, hb = s.userData.base[1] * k;
      s.scale.set(s.userData.base[0] * k, hb, 1);
      s.position.y = k > 1.2 ? WALL_H : WALL_H + 2.2;
      s.position.z = c.center.z - (k > 1.2 ? c.L / 2 + hb * .75 : 0);
    });
    // 霧隨高度拉遠：地面走路時有景深，飛上天時看得清整張地圖
    scene.fog.near = Math.max(40, me.pos.y * 2);
    scene.fog.far = Math.max(140, me.pos.y * 4);
    camera.position.copy(me.pos);
    const cp = Math.cos(me.pitch);
    camera.lookAt(me.pos.x - Math.sin(me.yaw) * cp, me.pos.y + Math.sin(me.pitch), me.pos.z - Math.cos(me.yaw) * cp);
    renderer.render(scene, camera);
    // 靠近接縫時把另一側的展館再畫一次（地面已有周圍複本，這幾趟不畫地面）；東西、南北接縫都近時連斜對角也畫
    if (me.pos.y < 30) {
      const far = scene.fog.far;
      const dx = me.pos.x - minX < far ? WRAP : maxX - me.pos.x < far ? -WRAP : 0;
      const dz = me.pos.z - minZ < far ? GD : maxZ - me.pos.z < far ? -GD : 0;
      // 只在另一側真的有展館落在霧的範圍內時才多畫（南北範圍短，不篩的話每一幀都會多畫一趟）
      const sees = (ox, oz) => W.halls.some(h => Math.hypot(me.pos.x + ox - h.center.x, me.pos.z + oz - h.center.z) < far - 10 + h.L);
      const offs = [];
      if (dx && sees(dx, 0)) offs.push([dx, 0]);
      if (dz && sees(0, dz)) offs.push([0, dz]);
      if (dx && dz && sees(dx, dz)) offs.push([dx, dz]);
      if (offs.length) {
        // 背景是純色時 three.js 每次 render 都會強制清畫面，這幾趟要先拿掉背景，才不會把第一趟蓋掉
        const bg = scene.background;
        grounds.forEach(m => { m.visible = false; }); scene.background = null;
        renderer.autoClear = false;
        offs.forEach(([ox, oz]) => {
          camera.position.set(me.pos.x + ox, me.pos.y, me.pos.z + oz);
          camera.updateMatrixWorld();
          renderer.render(scene, camera);
        });
        renderer.autoClear = true;
        grounds.forEach(m => { m.visible = true; }); scene.background = bg;
        camera.position.copy(me.pos);
        camera.updateMatrixWorld();          // 點擊的射線用 matrixWorld，沒更新會從另一側射出、點不到照片
      }
    }
    near = nearestArt();
    syncUI();
    drawMini();
    if (busy) invalidate(); else last = 0;
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (top && !tween) me.pos.copy(topPose().pos);
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; if (onScreen) invalidate(); });
  io.observe(stage);
  const onVis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- 與其他模式同步 ----------
  const unsub = subscribe((s, patch) => {
    if ('country' in patch || 'region' in patch) {
      applyDim();
      if (dialog.open) dialog.close();
      if (s.mode !== 'museum' || s.viewing || top) return;
      const first = ordered.find(a => matches(a.p, s));
      if (!first) return;
      setTop(false, true);
      travel(s.region ? artPose(first) : entrancePose(first.hall));
    }
    // lightbox 換張：背後直接瞬移到那幅前面
    if ('selected' in patch && s.mode === 'museum' && s.viewing && s.selected && byId.has(s.selected)) {
      travel(artPose(byId.get(s.selected)), { instant: true });
    }
  });

  // 初始位置
  {
    const s = getState();
    const sel = s.selected && byId.get(s.selected);
    const first = (s.country || s.region) && ordered.find(a => matches(a.p, s));
    travel(sel ? artPose(sel) : first ? entrancePose(first.hall) : spawnPose(), { instant: true });
  }
  applyTheme();
  resize();
  if (openAtlas) atlas.open();

  return {
    itemFor: () => null,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      unsub(); themeObs.disconnect(); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onDocKey);
      clearTimeout(toMapTimer);
      atlas.dispose();
      if (dialog.open) dialog.close();
      if (noteDialog.open) noteDialog.close();
      dm && dm.dispose();
      document.body.classList.remove('gx-immersive');
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', clearKeys);
      scene.traverse(o => {
        if (o.material && !disposables.includes(o.material)) { o.material.map?.dispose(); o.material.dispose(); }
      });
      disposables.forEach(d => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      root.innerHTML = '';
    }
  };
}
