// 東東的天空之島
// 純靜態網站：沒有後端、沒有資料庫、沒有追蹤碼。
// 所有 3D 模型都用程式畫，沒有外部模型檔；Three.js 自己放在 vendor 裡，不吃別人的 CDN。

import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';

const $ = (sel) => document.querySelector(sel);
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 狀態 ----------
let data = null;          // data.json 的內容
let scenario = null;      // 目前的情境
let selectedId = null;    // 目前點選的島
const islands = new Map(); // id -> 島的 3D 物件與名牌
let flows = [];           // 目前情境的資料流（白線 + 光點）

let renderer, scene, camera, controls, hemi, sun, cloudGroup;
let flowGroup;
const clock = new THREE.Clock();

// 島排成一圈：瀏覽器在最前面，順時針接前端、後端、資料庫、雲端；AI 模型是外島
const RING_RADIUS = 5.6;
const LAYOUT = {
  browser:  { angle: 90,  radius: RING_RADIUS, y: 0 },
  frontend: { angle: 162, radius: RING_RADIUS, y: 0 },
  backend:  { angle: 234, radius: RING_RADIUS, y: 0 },
  database: { angle: 306, radius: RING_RADIUS, y: 0 },
  cloud:    { angle: 18,  radius: RING_RADIUS, y: 0 },
  ai:       { angle: 270, radius: 10.5,        y: 1.6 },
};
const GRAY = new THREE.Color('#b6bcc4');
const SOIL = new THREE.Color('#8a6a4b');

// ---------- 進入點 ----------
main().catch((err) => {
  console.error(err);
  $('#summary-text').textContent = '載入失敗：' + err.message;
});

async function main() {
  const res = await fetch('./data.json');
  if (!res.ok) throw new Error('data.json ' + res.status);
  data = await res.json();

  $('#subtitle').textContent = data.subtitle;
  buildScenarioButtons();
  bindUI();

  if (!hasWebGL()) {
    $('#stage').hidden = true;
    $('#nowebgl').hidden = false;
    applyScenario(data.scenarios[0]);
    return;
  }

  initScene();
  buildClouds();
  for (const def of data.islands) buildIsland(def);
  applyScenario(data.scenarios[0]);
  window.addEventListener('resize', onResize);
  animate();
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

// ---------- 場景 ----------
function initScene() {
  const canvas = $('#stage');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  // 直式螢幕退遠一點，五座島才裝得下
  const narrow = window.innerWidth / window.innerHeight < 0.8;
  camera.position.set(0, narrow ? 13 : 10, narrow ? 27 : 18.5);

  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 9;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.target.set(0, 0.4, 0);
  controls.autoRotate = !prefersReduced;
  controls.autoRotateSpeed = 0.45;

  hemi = new THREE.HemisphereLight(0xffffff, 0x9fc2e3, 1.1);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(7, 12, 9);
  scene.add(sun);

  flowGroup = new THREE.Group();
  scene.add(flowGroup);

  // 點選：按下與放開距離很短才算點，拖曳不算
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [];
    for (const isl of islands.values()) if (isl.group.visible) targets.push(isl.top, isl.soil);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit) selectIsland(hit.object.userData.id); else selectIsland(null);
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [];
    for (const isl of islands.values()) if (isl.group.visible) targets.push(isl.top);
    canvas.style.cursor = raycaster.intersectObjects(targets, false).length ? 'pointer' : '';
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// 雲：幾顆壓扁的球湊成一朵，慢慢飄
function buildClouds() {
  cloudGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const rand = mulberry32(7);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((p - puffs / 2) * 0.9 + rand() * 0.4, rand() * 0.3, rand() * 0.6 - 0.3);
      const s = 0.6 + rand() * 0.7;
      m.scale.set(s * 1.3, s * 0.55, s);
      cloud.add(m);
    }
    const a = rand() * Math.PI * 2;
    const r = 6.5 + rand() * 11;
    cloud.position.set(Math.cos(a) * r, -6.5 + rand() * 3.2, Math.sin(a) * r);
    cloud.userData.speed = 0.15 + rand() * 0.25;
    const sc = 0.7 + rand() * 0.8;
    cloud.scale.setScalar(sc);
    cloudGroup.add(cloud);
  }
  scene.add(cloudGroup);
}

// 六邊形小島：草皮 + 土層 + 地標
function buildIsland(def) {
  const lay = LAYOUT[def.id];
  const rad = THREE.MathUtils.degToRad(lay.angle);
  const base = new THREE.Vector3(Math.cos(rad) * lay.radius, lay.y, Math.sin(rad) * lay.radius);

  const group = new THREE.Group();
  group.position.copy(base);
  group.rotation.y = Math.PI / 6;

  const topMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85, transparent: true });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.42, 6), topMat);
  top.userData.id = def.id;

  const soilMat = new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1, transparent: true });
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 0.45, 1.6, 6), soilMat);
  soil.position.y = -1.0;
  soil.userData.id = def.id;

  const landmark = buildLandmark(def.id, def.color);
  landmark.position.y = 0.21;

  group.add(top, soil, landmark);
  scene.add(group);

  // 名牌（HTML），位置每一幀跟著 3D 座標更新
  const label = document.createElement('button');
  label.className = 'label';
  label.type = 'button';
  label.innerHTML = '<b></b><span></span>';
  label.querySelector('b').textContent = def.name;
  label.addEventListener('click', () => selectIsland(def.id));
  $('#labels').appendChild(label);

  islands.set(def.id, {
    def, group, top, soil, landmark, label, base,
    phase: Math.random() * Math.PI * 2,
    materials: [topMat, soilMat, ...landmark.userData.mats],
    target: { color: new THREE.Color(def.color), on: true, scale: 1 },
  });
}

// 地標：每座島一個小東西，全部用基本幾何拼
function buildLandmark(id, colorHex) {
  const g = new THREE.Group();
  const mats = [];
  const mk = (geo, color, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, ...opts });
    mats.push(m);
    return new THREE.Mesh(geo, m);
  };
  if (id === 'browser') {
    // 一台螢幕
    const frame = mk(new THREE.BoxGeometry(1.25, 0.8, 0.08), 0x2b3a4a);
    frame.position.y = 0.75;
    const screen = mk(new THREE.BoxGeometry(1.1, 0.66, 0.02), 0xdff1ff, { emissive: 0x9fd0ff, emissiveIntensity: 0.4 });
    screen.position.set(0, 0.75, 0.05);
    const neck = mk(new THREE.BoxGeometry(0.12, 0.35, 0.12), 0x2b3a4a);
    neck.position.y = 0.18;
    const foot = mk(new THREE.BoxGeometry(0.6, 0.06, 0.35), 0x2b3a4a);
    foot.position.y = 0.03;
    g.add(frame, screen, neck, foot);
  } else if (id === 'frontend') {
    // 三片檔案：HTML、CSS、JS
    const colors = [0xf16529, 0x2965f1, 0xf0db4f];
    colors.forEach((c, i) => {
      const slab = mk(new THREE.BoxGeometry(0.55, 0.78, 0.08), c);
      slab.position.set((i - 1) * 0.55, 0.39, (i - 1) * -0.18);
      slab.rotation.y = (i - 1) * 0.25;
      g.add(slab);
    });
  } else if (id === 'backend') {
    // 一座機櫃
    for (let i = 0; i < 3; i++) {
      const unit = mk(new THREE.BoxGeometry(0.95, 0.3, 0.7), 0x3b4a5a);
      unit.position.y = 0.16 + i * 0.34;
      g.add(unit);
      const led = mk(new THREE.BoxGeometry(0.08, 0.08, 0.04), 0x7dff9a, { emissive: 0x4dff7a, emissiveIntensity: 0.8 });
      led.position.set(0.32, 0.16 + i * 0.34, 0.37);
      g.add(led);
    }
  } else if (id === 'database') {
    // 三層圓盤
    for (let i = 0; i < 3; i++) {
      const disk = mk(new THREE.CylinderGeometry(0.55, 0.55, 0.26, 24), 0x6a57c9);
      disk.position.y = 0.14 + i * 0.3;
      g.add(disk);
    }
  } else if (id === 'cloud') {
    // 一朵雲
    const puffs = [[0, 0.5, 0, 0.42], [-0.42, 0.42, 0.05, 0.32], [0.42, 0.42, -0.05, 0.34], [0.05, 0.72, -0.1, 0.3]];
    for (const [x, y, z, r] of puffs) {
      const p = mk(new THREE.SphereGeometry(r, 16, 12), 0xffffff, { roughness: 1 });
      p.position.set(x, y, z);
      g.add(p);
    }
  } else if (id === 'ai') {
    // 一顆會轉的晶體
    const gem = mk(new THREE.OctahedronGeometry(0.6), colorHex, { emissive: 0xffe066, emissiveIntensity: 0.5, roughness: 0.3 });
    gem.position.y = 0.95;
    gem.name = 'gem';
    g.add(gem);
  }
  g.userData.mats = mats;
  return g;
}

// ---------- 情境 ----------
function buildScenarioButtons() {
  const nav = $('#scenarios');
  for (const sc of data.scenarios) {
    const btn = document.createElement('button');
    btn.className = 'scn';
    btn.type = 'button';
    btn.dataset.id = sc.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<span></span><small></small>';
    btn.querySelector('span').textContent = sc.name;
    btn.querySelector('small').textContent = sc.subtitle;
    btn.addEventListener('click', () => applyScenario(sc));
    nav.appendChild(btn);
  }
}

function applyScenario(sc) {
  scenario = sc;
  document.querySelectorAll('.scn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === sc.id)));
  $('#summary-text').textContent = sc.summary;
  $('#summary-total').textContent = sc.total;

  // 文字版清單（沒有 WebGL 時用）
  const list = $('#nowebgl-list');
  list.innerHTML = '';
  for (const def of data.islands) {
    const st = sc.states[def.id];
    if (st.hidden) continue;
    const li = document.createElement('li');
    li.className = st.on ? 'on' : 'off';
    li.textContent = def.name + '：' + st.role + '（費用：' + st.cost + '）';
    list.appendChild(li);
  }

  if (!renderer) return;

  for (const isl of islands.values()) {
    const st = sc.states[isl.def.id];
    isl.target.on = st.on;
    isl.target.color.set(st.on ? isl.def.color : GRAY);
    isl.target.scale = st.hidden ? 0 : 1;
    if (!st.hidden) isl.group.visible = true;
    isl.label.classList.toggle('off', !st.on);
    isl.label.classList.toggle('hidden', !!st.hidden);
    isl.label.querySelector('span').textContent = st.role;
  }
  buildFlows(sc.flows);
  if (selectedId) fillCard(selectedId);
}

// 資料流：兩座島之間拉一條弧線，一顆光點沿線跑
function buildFlows(list) {
  for (const f of flows) { flowGroup.remove(f.line, f.dot); f.line.geometry.dispose(); }
  flows = [];
  for (const [from, to] of list) {
    const a = islands.get(from), b = islands.get(to);
    if (!a || !b) continue;
    const p0 = a.base.clone().add(new THREE.Vector3(0, 0.9, 0));
    const p2 = b.base.clone().add(new THREE.Vector3(0, 0.9, 0));
    const mid = p0.clone().add(p2).multiplyScalar(0.5);
    mid.y += 2.4 + p0.distanceTo(p2) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    flowGroup.add(line, dot);
    flows.push({ line, dot, curve, t: Math.random() });
  }
}

// ---------- 說明卡 ----------
function selectIsland(id) {
  selectedId = id;
  for (const isl of islands.values()) isl.label.classList.toggle('selected', isl.def.id === id);
  if (!id) { $('#card').hidden = true; return; }
  fillCard(id);
  $('#card').hidden = false;
  if (controls) controls.autoRotate = false;
}

function fillCard(id) {
  const isl = islands.get(id);
  const def = isl ? isl.def : data.islands.find((d) => d.id === id);
  const st = scenario.states[id];
  $('#card-en').textContent = def.en;
  $('#card-name').textContent = def.name;
  $('#card-tagline').textContent = def.tagline;
  $('#card-role').textContent = st.role;
  $('#card-cost').textContent = st.cost;
  $('#card-what').textContent = def.what;
  $('#card-security').textContent = def.security;
}

function bindUI() {
  $('#card-close').addEventListener('click', () => selectIsland(null));
  $('#help-btn').addEventListener('click', () => {
    const open = $('#help').hidden;
    $('#help').hidden = !open;
    $('#help-btn').setAttribute('aria-expanded', String(open));
  });
  $('#help-close').addEventListener('click', () => {
    $('#help').hidden = true;
    $('#help-btn').setAttribute('aria-expanded', 'false');
  });
  $('#daynight').addEventListener('click', () => {
    const night = !document.body.classList.contains('night');
    document.body.classList.toggle('night', night);
    document.body.classList.toggle('day', !night);
    $('#daynight').textContent = night ? '白天' : '夜晚';
    $('#daynight').setAttribute('aria-pressed', String(night));
    if (hemi) {
      hemi.intensity = night ? 0.35 : 1.1;
      sun.intensity = night ? 0.6 : 1.7;
      sun.color.set(night ? 0xbcd0ff : 0xffffff);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { selectIsland(null); $('#help').hidden = true; } });
}

// ---------- 每一幀 ----------
const _v = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // 島上下漂、顏色漸變、顯示或收起
  for (const isl of islands.values()) {
    const bob = prefersReduced ? 0 : Math.sin(t * 0.8 + isl.phase) * 0.12;
    isl.group.position.y = isl.base.y + bob;
    const k = 1 - Math.pow(0.001, dt); // 平滑係數
    isl.top.material.color.lerp(isl.target.color, k);
    const targetOpacity = isl.target.on ? 1 : 0.38;
    for (const m of isl.materials) {
      m.opacity += (targetOpacity - m.opacity) * k;
      if (m !== isl.top.material) {
        const tc = isl.target.on ? (m.userData.base || (m.userData.base = m.color.clone())) : GRAY;
        m.color.lerp(tc, k);
      }
    }
    const s = isl.group.scale.x + (isl.target.scale - isl.group.scale.x) * k;
    isl.group.scale.setScalar(Math.max(s, 0.0001));
    if (isl.target.scale === 0 && s < 0.02) isl.group.visible = false;
    const gem = isl.landmark.getObjectByName('gem');
    if (gem && !prefersReduced) gem.rotation.y += dt * 0.8;

    // 名牌跟著島
    if (isl.group.visible) {
      _v.set(isl.group.position.x, isl.group.position.y + 1.7, isl.group.position.z).project(camera);
      const x = (_v.x + 1) / 2 * window.innerWidth;
      const y = (1 - _v.y) / 2 * window.innerHeight;
      const behind = _v.z > 1;
      isl.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      isl.label.style.visibility = behind ? 'hidden' : 'visible';
      isl.label.style.zIndex = String(Math.round((1 - _v.z) * 10000));
    } else {
      isl.label.style.visibility = 'hidden';
    }
  }

  // 資料流的光點
  for (const f of flows) {
    f.t = (f.t + dt * (prefersReduced ? 0 : 0.22)) % 1;
    f.dot.position.copy(f.curve.getPoint(f.t));
  }

  // 雲慢慢飄，飄出去就從另一邊回來
  if (cloudGroup && !prefersReduced) {
    for (const c of cloudGroup.children) {
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 22) c.position.x = -22;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// 固定種子的亂數，每次打開雲都長一樣
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
