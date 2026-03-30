
const CLICK_MODE = {
  NORMAL: 'normal',
  BIG: 'big',
  SLASH: 'slash',
  SPAWN: 'spawn',
  BLACKHOLE: 'blackhole',
  DIRECTIONAL: 'directional',
  CHAIN: 'chain'
};

let clickMode = CLICK_MODE.NORMAL;


const MAX_SPAWN_PER_WORLD = 5;
let spawnRemaining = MAX_SPAWN_PER_WORLD;
let spawnHintEl = null;


const swordSlashes = [];


const tempVec3 = new THREE.Vector3();
const chainExplosions = [];   
const blackHoleVisuals = [];  


function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateSpawnHint() {
  if (!spawnHintEl) return;
  spawnHintEl.textContent = `生成：這世界剩 ${spawnRemaining}/${MAX_SPAWN_PER_WORLD}個小物件`;
}


const BASE_FOV = 60;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); 

const camera = new THREE.PerspectiveCamera(
  BASE_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 45, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.filter = 'none';

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 7, 0);
controls.enableDamping = true;


scene.add(camera);


const TimeDistortionShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0.0 },
    uIntensity: { value: 0.0 } 
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 toUV = uv - center;
      float dist = length(toUV);
      float angle = atan(toUV.y, toUV.x);

      // 多層波動，不規則扭曲
      float wave   = sin(dist * 80.0 - uTime * 20.0) * 0.015 * uIntensity;
      float swirl  = sin(angle * 12.0 + uTime * 4.0)  * 0.010 * uIntensity;
      float ripple = sin(dist * 15.0 - uTime * 5.0)  * 0.020 * uIntensity;

      float distort = wave + swirl + ripple;

      vec2 offset = toUV * (1.0 + distort);

      offset += vec2(
        sin(angle * 3.0 + uTime * 2.0),
        cos(angle * 5.0 - uTime * 3.0)
      ) * 0.05 * uIntensity;

      uv = center + offset;

      vec4 color = texture2D(tDiffuse, uv);

      vec3 inverted = vec3(1.0) - color.rgb;
      color.rgb = mix(color.rgb, inverted, uIntensity);

      gl_FragColor = color;
    }
  `
};

renderer.autoClear = false;
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);
const timeDistortionPass = new THREE.ShaderPass(TimeDistortionShader);
composer.addPass(timeDistortionPass);


let timeDistortionTime = 0;


const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 30, 10);
scene.add(dirLight);


const floorGeo = new THREE.PlaneBufferGeometry(120, 120);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x444444, 
  roughness: 1
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

const normalFloorColor = floorMat.color.clone();


const cubes = [];
const cubeSize = 1;
const gap = 1.05;
const boxGeo = new THREE.BoxBufferGeometry(cubeSize, cubeSize, cubeSize);


function initCubeCommon(cube, gridPos, initialPosition) {
  cube.userData.gridPos = gridPos;
  cube.userData.initialPosition = initialPosition.clone();

  
  cube.userData.originalColor = cube.material.color.clone();

  cube.userData.velocity = new THREE.Vector3();
  cube.userData.angularVelocity = new THREE.Vector3();
  cube.userData.isExploding = false;

  cube.userData.landed = false;
  cube.userData.disappearTimer = 0;

  cube.userData.returning = false;
  cube.userData.returnFrom = new THREE.Vector3();
  cube.userData.returnRotFrom = new THREE.Euler();
  cube.userData.returnTime = 0;
  cube.userData.returnDuration = 0;

  
  cube.userData.blackHole = null;
  cube.userData.chainPending = false;
}



function createCubeFromLayout(entry) {
  const mat = new THREE.MeshStandardMaterial({
    color: entry.color
  });
  const cube = new THREE.Mesh(boxGeo, mat);
  cube.position.copy(entry.position);

  initCubeCommon(cube, entry.gridPos, entry.position);

  cubes.push(cube);
  scene.add(cube);
  return cube;
}


function buildWorldFromLayout(layout) {
  for (const c of cubes) scene.remove(c);
  cubes.length = 0;

  for (const entry of layout) {
    createCubeFromLayout(entry);
  }
}


const WORLD_CONFIG = {
  cubeSize,
  gap,
  minBuildings: 6,
  maxBuildings: 15,
  minFoot: 6,
  maxFoot: 10,
  minHeight: 10,
  maxHeight: 22,   
  minTrees: 6,
  maxTrees: 12,    
  worldRadius: 45  
};

let currentLayout = WorldGenerator.generateLayout(WORLD_CONFIG);
buildWorldFromLayout(currentLayout);


buildWorldFromLayout(currentLayout);


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let undoInProgress = false;


let timeStopState = 'idle'; 


let worldTransitionState = 'idle'; 

function timeStopBusy() {
  return timeStopState !== 'idle';
}
function worldTransitionBusy() {
  return worldTransitionState !== 'idle';
}
function worldLocked() {
  
  return undoInProgress || timeStopBusy() || worldTransitionBusy();
}

function worldLockedExceptTimeStop() {
  return undoInProgress || worldTransitionBusy();
}



function createModeSelector() {
  
  
  if (window.innerWidth <= 768) {
    return; 
  }

  const panel = document.createElement('div');
  panel.id = 'modePanel';
  panel.className = 'hud-panel'; 
  panel.style.position = 'fixed';
  panel.style.left = '16px';
  panel.style.top = '250px';
  panel.style.width = '170px';
  panel.style.zIndex = '10';

  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = '點擊模式';
  panel.appendChild(title);

  const modes = [
    { value: CLICK_MODE.NORMAL,      label: '普通的爆炸' },
    { value: CLICK_MODE.BIG,         label: '更大的爆炸' },
    { value: CLICK_MODE.SLASH,       label: '發射劍氣' },
    { value: CLICK_MODE.SPAWN,       label: '生成小物件' },
    { value: CLICK_MODE.BLACKHOLE,   label: '黑洞爆炸' },
    { value: CLICK_MODE.DIRECTIONAL, label: '定向炸彈' },
    { value: CLICK_MODE.CHAIN,       label: '連鎖爆炸' }
  ];

  modes.forEach(m => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '4px';
    label.style.cursor = 'pointer';
    label.style.marginBottom = '2px';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'clickMode';
    input.value = m.value;
    if (m.value === clickMode) input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) {
        clickMode = m.value;

        
        const mobileSelect = document.getElementById('mobileClickModeSelect');
        if (mobileSelect) {
          mobileSelect.value = m.value;
        }
      }
    });

    const span = document.createElement('span');
    span.textContent = m.label;

    label.appendChild(input);
    label.appendChild(span);
    panel.appendChild(label);
  });

  spawnHintEl = document.createElement('div');
  spawnHintEl.style.marginTop = '6px';
  spawnHintEl.style.opacity = '0.8';
  spawnHintEl.style.fontSize = '11px';
  panel.appendChild(spawnHintEl);
  updateSpawnHint();

  document.body.appendChild(panel);
}


createModeSelector();


const mobileClickModeSelect = document.getElementById('mobileClickModeSelect');
if (mobileClickModeSelect) {
  mobileClickModeSelect.addEventListener('change', () => {
    clickMode = mobileClickModeSelect.value;

    
    const desktopRadios = document.querySelectorAll('input[name="clickMode"]');
    desktopRadios.forEach(radio => {
      if (radio.value === clickMode) {
        radio.checked = true;
      }
    });
  });
}


function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const isSlashMode = (clickMode === CLICK_MODE.SLASH);

  const lockedForSlash = worldLockedExceptTimeStop(); 
  const lockedForOthers = worldLocked();              

  if ((isSlashMode && lockedForSlash) || (!isSlashMode && lockedForOthers)) {
    return;
  }

  
  if (clickMode === CLICK_MODE.SPAWN) {
    const floorHits = raycaster.intersectObject(floor);
    if (floorHits.length > 0) {
      const point = floorHits[0].point;
      spawnRandomObjectAt(point);
    }
    return;
  }

  
  const intersects = raycaster.intersectObjects(cubes);
  const hitCube = intersects.length > 0 ? intersects[0].object : null;
  let hitPoint = intersects.length > 0 ? intersects[0].point : null;

  
  if (!hitPoint) {
    const floorHits = raycaster.intersectObject(floor);
    if (floorHits.length > 0) {
      hitPoint = floorHits[0].point;
    }
  }

  
  let shootDir = null;
  if (hitPoint) {
    shootDir = new THREE.Vector3().subVectors(hitPoint, camera.position).normalize();
  }

  if (clickMode === CLICK_MODE.NORMAL) {
    if (hitCube) explodeAtCube(hitCube);
  } else if (clickMode === CLICK_MODE.BIG) {
    if (hitCube) {
      
      explodeAtCube(hitCube, {
        radiusScale: 2.6,
        speedScale: 2.3
      });
    }
  } else if (clickMode === CLICK_MODE.SLASH) {
    
    if (hitPoint) {
      spawnSwordSlash(hitPoint);
    }
  } else if (clickMode === CLICK_MODE.BLACKHOLE) {
    if (hitPoint) {
      triggerBlackHole(hitPoint);
    }
  } else if (clickMode === CLICK_MODE.DIRECTIONAL) {
    if (hitCube && shootDir) {
      
      explodeAtCube(hitCube, {
        radiusScale: 1.8,
        speedScale: 7.5,
        baseDir: shootDir,
        directionality: 0.9
      });
    }
  } else if (clickMode === CLICK_MODE.CHAIN) {
    if (hitCube) {
      
      explodeAtCube(hitCube, {
        radiusScale: 1.6,
        speedScale: 1.0,
        markChain: true
      });
    }
  }
}

renderer.domElement.addEventListener('click', onClick);


function explodeAtCube(centerCube, opts = {}) {
  if (worldLocked()) return;

  const center = centerCube.userData.gridPos;
  if (!center) return;

  const radiusScale = opts.radiusScale !== undefined ? opts.radiusScale : 1.0;
  const speedScale = opts.speedScale !== undefined ? opts.speedScale : 1.0;
  const baseDir = opts.baseDir || null;           
  const directionality = opts.directionality !== undefined ? opts.directionality : 0.0; 
  const markChain = opts.markChain === true;      

  const radiusX = (1 + Math.floor(Math.random() * 4)) * radiusScale;
  const radiusY = (1 + Math.floor(Math.random() * 4)) * radiusScale;
  const radiusZ = (1 + Math.floor(Math.random() * 4)) * radiusScale;

  cubes.forEach(cube => {
    const p = cube.userData.gridPos;
    if (!p) return;
    if (p.building !== center.building) return;

    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dz = p.z - center.z;

    if (
      Math.abs(dx) <= radiusX &&
      Math.abs(dy) <= radiusY &&
      Math.abs(dz) <= radiusZ
    ) {
      cube.visible = true;
      cube.userData.isExploding = true;
      cube.userData.landed = false;
      cube.userData.disappearTimer = 0;
      cube.userData.returning = false;
      cube.userData.blackHole = null;      
      cube.userData.chainPending = false;  

      if (gerActive) {
        cube.userData.gerHitStamp = gerTime;
      }

      let dir = new THREE.Vector3(
        dx + (Math.random() - 0.5) * 2,
        dy + 2 + Math.random() * 2,
        dz + (Math.random() - 0.5) * 2
      );
      if (dir.lengthSq() === 0) {
        dir.set(
          Math.random() - 0.5,
          Math.random() * 1.5 + 1,
          Math.random() - 0.5
        );
      }
      dir.normalize();

      
      if (baseDir && directionality > 0) {
        const base = baseDir.clone().normalize();
        dir.multiplyScalar(1 - directionality).addScaledVector(base, directionality).normalize();
      }

      const speed = (12 + Math.random() * 10) * speedScale;
      cube.userData.velocity.copy(dir.multiplyScalar(speed));

      cube.userData.angularVelocity.set(
        (Math.random() - 0.5) * 6 * speedScale,
        (Math.random() - 0.5) * 6 * speedScale,
        (Math.random() - 0.5) * 6 * speedScale
      );

      
      if (markChain) {
        const chance = 0.35; 
        if (Math.random() < chance) {
          cube.userData.chainPending = true;

          
          if (cube.userData.originalColor) {
            cube.material.color.set(0xff0000);
          }

          chainExplosions.push({
            cube,
            delay: 1.5,
            elapsed: 0,
            radiusScale: 0.9,
            speedScale: 1.15
          });
        }
      }
    }
  });
}


function updateChainExplosions(worldDelta) {
  if (worldDelta <= 0) return;

  for (let i = chainExplosions.length - 1; i >= 0; i--) {
    const c = chainExplosions[i];
    c.elapsed += worldDelta;

    if (c.elapsed >= c.delay) {
      const cube = c.cube;
      if (cube && cube.userData) {
        
        cube.userData.chainPending = false;
        if (cube.userData.originalColor) {
          cube.material.color.copy(cube.userData.originalColor);
        }

        
        if (cube.visible && !cube.userData.returning) {
          explodeAtCube(cube, {
            radiusScale: c.radiusScale,
            speedScale: c.speedScale,
            markChain: false 
          });
        }
      }
      chainExplosions.splice(i, 1);
    }
  }
}




const BLACK_HOLE_PULL_DURATION   = 3.0;   
const BLACK_HOLE_TOTAL_DURATION  = 4.0;   


const BLACK_HOLE_EFFECT_RADIUS   = 22.0;  
const BLACK_HOLE_CORE_RADIUS     = 3.0;   
const BLACK_HOLE_RING_RADIUS     = 9.0;   

function triggerBlackHole(centerPoint) {
  if (worldLocked()) return;

  const effectRadiusSq = BLACK_HOLE_EFFECT_RADIUS * BLACK_HOLE_EFFECT_RADIUS;

  
  cubes.forEach(cube => {
    const toCenter = tempVec3.subVectors(centerPoint, cube.position);
    const distSq   = toCenter.lengthSq();
    if (distSq > effectRadiusSq) return;

    cube.visible = true;
    cube.userData.isExploding     = true;
    cube.userData.landed          = false;
    cube.userData.disappearTimer  = 0;
    cube.userData.returning       = false;
    cube.userData.chainPending    = false;

    
    const dist = Math.sqrt(distSq) + 0.001;
    toCenter.normalize();
    const pullBias = (BLACK_HOLE_EFFECT_RADIUS - dist) / BLACK_HOLE_EFFECT_RADIUS;
    const speed    = 6 + Math.max(0, pullBias) * 14;

    cube.userData.velocity.copy(toCenter.multiplyScalar(speed));
    cube.userData.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    );

    
    cube.userData.blackHole = {
      center: centerPoint.clone(),
      time: 0,
      pullDuration: BLACK_HOLE_PULL_DURATION,
      totalDuration: BLACK_HOLE_TOTAL_DURATION,
      blasted: false
    };
  });

  createBlackHoleVisual(centerPoint);
}


function createBlackHoleVisual(center) {
  
  const coreGeo = new THREE.SphereBufferGeometry(BLACK_HOLE_CORE_RADIUS, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 1.0,
    depthWrite: true
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.copy(center);
  scene.add(core);

  
  const ringGeo = new THREE.RingBufferGeometry(
    BLACK_HOLE_RING_RADIUS * 0.9,
    BLACK_HOLE_RING_RADIUS,
    64
  );
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(center.x, center.y + 0.1, center.z);
  scene.add(ring);

  blackHoleVisuals.push({
    core,
    ring,
    time: 0,
    pullDuration: BLACK_HOLE_PULL_DURATION,
    totalDuration: BLACK_HOLE_TOTAL_DURATION
  });
}





function spawnSwordSlash(targetPoint) {
  
  if (undoInProgress || worldTransitionBusy()) return;

  const startPos = camera.position.clone();

  
  let dir = new THREE.Vector3().subVectors(targetPoint, startPos);
  if (dir.lengthSq() < 1e-4) {
    dir.set(0, 0, -1);
  }
  dir.normalize();

  
  const worldUp = new THREE.Vector3(0, 1, 0);
  let tangent = worldUp.clone().projectOnPlane(dir);
  if (tangent.lengthSq() < 1e-4) {
    tangent.set(1, 0, 0).projectOnPlane(dir);
  }
  tangent.normalize();

  const randomTilt = (Math.random() - 0.5) * Math.PI; 
  const qTilt = new THREE.Quaternion().setFromAxisAngle(dir, randomTilt);
  tangent.applyQuaternion(qTilt).normalize();

  
  const normal = new THREE.Vector3().crossVectors(dir, tangent).normalize();

  
  const baseOuterR = 4.0;
  const baseInnerR = 3.7;
  const thetaLength = Math.PI * 1.4;
  const thetaStart = -thetaLength / 2;
  const thickness = 0.1; 

  
  const shape = new THREE.Shape();
  
  shape.absarc(0, 0, baseOuterR, thetaStart, thetaStart + thetaLength, false);
  
  shape.lineTo(
    Math.cos(thetaStart + thetaLength) * baseInnerR,
    Math.sin(thetaStart + thetaLength) * baseInnerR
  );
  
  shape.absarc(0, 0, baseInnerR, thetaStart + thetaLength, thetaStart, true);
  

  
  const extrudeSettings = {
    steps: 1,
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32 
  };
  const slashGeo = new THREE.ExtrudeBufferGeometry(shape, extrudeSettings);

  
  slashGeo.translate(0, 0, -thickness / 2);

  
  const posAttr = slashGeo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));

    
    const angle = Math.atan2(v.y, v.x);

    
    let rel = (angle - thetaStart) / thetaLength;
    
    
    
    if (rel < -0.5) rel += (2 * Math.PI) / thetaLength;
    if (rel > 1.5) rel -= (2 * Math.PI) / thetaLength;
    rel = THREE.MathUtils.clamp(rel, 0, 1);

    
    let f = Math.sin(rel * Math.PI);
    f = Math.pow(f, 0.7); 

    const r = Math.sqrt(v.x * v.x + v.y * v.y);
    
    const isInner = r < (baseInnerR + baseOuterR) * 0.5;

    
    const outerR = baseOuterR * (0.8 + 0.2 * f);
    const width = THREE.MathUtils.lerp(0.1, 1.6, f); 
    const innerR = outerR - width;

    const newR = isInner ? innerR : outerR;

    const nx = Math.cos(angle) * newR;
    const ny = Math.sin(angle) * newR;

    
    posAttr.setXYZ(i, nx, ny, v.z);
  }
  posAttr.needsUpdate = true;
  slashGeo.computeVertexNormals(); 

  const slashMat = new THREE.MeshBasicMaterial({
    color: 0x99e6ff,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false 
  });

  const slashMesh = new THREE.Mesh(slashGeo, slashMat);
  slashMesh.position.copy(startPos);

  
  const basis = new THREE.Matrix4();
  basis.makeBasis(dir, tangent, normal);
  slashMesh.quaternion.setFromRotationMatrix(basis);

  scene.add(slashMesh);

  const speed = 30; 

  swordSlashes.push({
    mesh: slashMesh,
    velocity: dir.clone().multiplyScalar(speed),
    life: 0,
    maxLife: 5.0,
    radius: 2.4, 
    tilt: randomTilt
  });
}


function updateSwordSlashes(worldDelta) {
  
  if (worldDelta <= 0) return;

  for (let i = swordSlashes.length - 1; i >= 0; i--) {
    const s = swordSlashes[i];
    s.life += worldDelta;

    if (s.life >= s.maxLife) {
      scene.remove(s.mesh);
      swordSlashes.splice(i, 1);
      continue;
    }

    
    s.mesh.position.addScaledVector(s.velocity, worldDelta);

    
    const lifeRatio = s.life / s.maxLife;
    if (lifeRatio > 0.7) {
      const t = (lifeRatio - 0.7) / 0.3;
      s.mesh.material.opacity =
        0.9 * (1 - THREE.MathUtils.clamp(t, 0, 1));
    }

    const slashPos = s.mesh.position;
    const radiusSq = s.radius * s.radius;

    
    for (const cube of cubes) {
      if (!cube.visible) continue;
      if (cube.userData.returning) continue;

      const dx = cube.position.x - slashPos.x;
      const dy = cube.position.y - slashPos.y;
      const dz = cube.position.z - slashPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= radiusSq) {
        if (!cube.userData.isExploding) {
          cube.visible = true;
          cube.userData.isExploding = true;
          cube.userData.landed = false;
          cube.userData.disappearTimer = 0;
          cube.userData.returning = false;
          cube.userData.blackHole = null;
          cube.userData.chainPending = false;

          if (gerActive) {
             cube.userData.gerHitStamp = gerTime;
          }

          
          let dir = s.velocity.clone().normalize();
          dir.x += (Math.random() - 0.5) * 0.3;
          dir.y += (Math.random() - 0.5) * 0.15;
          dir.z += (Math.random() - 0.5) * 0.3;
          dir.normalize();

          const speed = 18 + Math.random() * 8;
          cube.userData.velocity.copy(dir.multiplyScalar(speed));
          cube.userData.angularVelocity.set(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
          );
        }
      }
    }
  }
}


function spawnRandomObjectAt(point) {
  if (spawnRemaining <= 0) {
    
    return;
  }
  if (worldLocked()) return;

  spawnRemaining--;
  updateSpawnHint();

  const typeRand = Math.random();
  let type;
  if (typeRand < 0.3) type = 'miniBuilding';
  else if (typeRand < 0.6) type = 'tree';
  else if (typeRand < 0.85) type = 'bush';
  else type = 'stone';

  const buildingId = 10000 + randInt(0, 1000000); 
  const baseY = cubeSize / 2;

  if (type === 'miniBuilding') {
    const w = randInt(2, 3);
    const d = randInt(2, 3);
    const h = randInt(4, 8);
    const startGX = -Math.floor(w / 2);
    const startGZ = -Math.floor(d / 2);
    const baseHue = (0.08 + Math.random() * 0.18) % 1;

    for (let gx = 0; gx < w; gx++) {
      for (let gy = 0; gy < h; gy++) {
        for (let gz = 0; gz < d; gz++) {
          const wx = point.x + (startGX + gx) * cubeSize * gap;
          const wy = baseY + gy * cubeSize * gap;
          const wz = point.z + (startGZ + gz) * cubeSize * gap;

          const t = gy / Math.max(1, h - 1);
          const color = new THREE.Color().setHSL(
            (baseHue + t * 0.1 + 1) % 1,
            0.6,
            0.5
          );

          const entry = {
            position: new THREE.Vector3(wx, wy, wz),
            color,
            gridPos: { x: gx, y: gy, z: gz, building: buildingId }
          };
          createCubeFromLayout(entry);
        }
      }
    }
  } else if (type === 'tree') {
    const trunkLevels = randInt(2, 4);
    const leafLevels = randInt(2, 3);
    const leafRadius = 1;

    
    for (let i = 0; i < trunkLevels; i++) {
      const wy = baseY + i * cubeSize;
      const pos = new THREE.Vector3(point.x, wy, point.z);
      const color = new THREE.Color(0x8b5a2b);
      createCubeFromLayout({
        position: pos,
        color,
        gridPos: { x: 0, y: i, z: 0, building: buildingId }
      });
    }

    
    const startY = baseY + trunkLevels * cubeSize;
    for (let ly = 0; ly < leafLevels; ly++) {
      for (let lx = -leafRadius; lx <= leafRadius; lx++) {
        for (let lz = -leafRadius; lz <= leafRadius; lz++) {
          if (Math.abs(lx) + Math.abs(lz) > leafRadius + 1) continue;

          const wy = startY + ly * cubeSize;
          const wx = point.x + lx * cubeSize;
          const wz = point.z + lz * cubeSize;
          const color = new THREE.Color(0x2e8b57);

          createCubeFromLayout({
            position: new THREE.Vector3(wx, wy, wz),
            color,
            gridPos: {
              x: lx,
              y: trunkLevels + ly,
              z: lz,
              building: buildingId
            }
          });
        }
      }
    }
  } else if (type === 'bush') {
    const bushLevels = randInt(1, 2);
    const bushRadius = randInt(1, 2);
    const baseColor = new THREE.Color(0x2f9f5b);

    for (let ly = 0; ly < bushLevels; ly++) {
      for (let lx = -bushRadius; lx <= bushRadius; lx++) {
        for (let lz = -bushRadius; lz <= bushRadius; lz++) {
          if (Math.abs(lx) + Math.abs(lz) > bushRadius + 1) continue;

          const wy = baseY + ly * cubeSize;
          const wx = point.x + lx * cubeSize;
          const wz = point.z + lz * cubeSize;

          const hsl = { h: 0, s: 0, l: 0 };
          baseColor.getHSL(hsl);
          const jitter = (Math.random() - 0.5) * 0.15;
          const color = new THREE.Color().setHSL(
            hsl.h,
            hsl.s,
            THREE.MathUtils.clamp(hsl.l + jitter, 0.2, 0.7)
          );

          createCubeFromLayout({
            position: new THREE.Vector3(wx, wy, wz),
            color,
            gridPos: {
              x: lx,
              y: ly,
              z: lz,
              building: buildingId
            }
          });
        }
      }
    }
  } else if (type === 'stone') {
    const pileRadius = randInt(1, 2);
    const pileLevels = randInt(1, 3);
    const baseColor = new THREE.Color(0x777777);

    for (let ly = 0; ly < pileLevels; ly++) {
      const layerRadius = Math.max(0, pileRadius - ly);
      for (let lx = -layerRadius; lx <= layerRadius; lx++) {
        for (let lz = -layerRadius; lz <= layerRadius; lz++) {
          if (Math.abs(lx) + Math.abs(lz) > layerRadius + 1) continue;

          const wy = baseY + ly * cubeSize;
          const wx = point.x + lx * cubeSize;
          const wz = point.z + lz * cubeSize;

          const hsl = { h: 0, s: 0, l: 0 };
          baseColor.getHSL(hsl);
          const jitter = (Math.random() - 0.5) * 0.12;
          const color = new THREE.Color().setHSL(
            hsl.h,
            THREE.MathUtils.clamp(
              hsl.s + (Math.random() - 0.5) * 0.1,
              0.0,
              0.4
            ),
            THREE.MathUtils.clamp(hsl.l + jitter, 0.2, 0.6)
          );

          createCubeFromLayout({
            position: new THREE.Vector3(wx, wy, wz),
            color,
            gridPos: {
              x: lx,
              y: ly,
              z: lz,
              building: buildingId
            }
          });
        }
      }
    }
  }
}


const TARGET_RADIUS = 12;
let targetGroup = null;
let targetRingMat = null;
let targetCrossMat = null;

let beamMesh = null;
let explosionActive = false;
let explosionTime = 0;
let globalExplosionTriggered = false;


const BEAM_HEIGHT = 80;              
const BEAM_GROW_TIME = 0.4;          
const BEAM_START_TIME = 2.5;
const GLOBAL_EXPLOSION_TIME = BEAM_START_TIME + BEAM_GROW_TIME;
const EXPLOSION_ANIM_END = GLOBAL_EXPLOSION_TIME + 1.2;


let midShock75Triggered = false;
let midShock50Triggered = false;

const flashOverlay = document.getElementById('flashOverlay');
let flashTime = 0;
const FLASH_DURATION = 0.55;

let shakeTime = 0;
const SHAKE_DURATION = 1.0;
const SHAKE_INTENSITY = 2.5;
const shakeBasePos = new THREE.Vector3();
const shakeBaseTarget = new THREE.Vector3();

const shockwaves = []; 


function createTargetMarker() {
  if (targetGroup) scene.remove(targetGroup);

  targetGroup = new THREE.Group();

  const ringGeo = new THREE.RingBufferGeometry(TARGET_RADIUS * 0.9, TARGET_RADIUS, 64);
  targetRingMat = new THREE.MeshBasicMaterial({
    color: 0x44ff88, 
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const ringMesh = new THREE.Mesh(ringGeo, targetRingMat);
  ringMesh.rotation.x = -Math.PI / 2;
  targetGroup.add(ringMesh);

  const crossGeo = new THREE.PlaneBufferGeometry(TARGET_RADIUS * 2, 0.3);
  targetCrossMat = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });

  const hLine = new THREE.Mesh(crossGeo, targetCrossMat);
  hLine.rotation.x = -Math.PI / 2;

  const vLine = hLine.clone();
  vLine.rotation.z = Math.PI / 2;

  targetGroup.add(hLine);
  targetGroup.add(vLine);

  targetGroup.position.set(0, 0.02, 0);
  scene.add(targetGroup);
}


function createBeam() {
  if (beamMesh) scene.remove(beamMesh);

  const height = BEAM_HEIGHT;
  const beamGeo = new THREE.CylinderBufferGeometry(
    TARGET_RADIUS,
    TARGET_RADIUS,
    height,
    32,
    1,
    true
  );
  
  beamGeo.translate(0, -height / 2, 0);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x88ffdd,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(0, height + 0.1, 0); 
  beamMesh.scale.set(1, 0.001, 1);
  scene.add(beamMesh);
}


function createShockwave({
  y = 0.03,
  startScale = TARGET_RADIUS * 0.5,
  endScale = TARGET_RADIUS * 3.0,
  duration = 0.8,
  delay = 0.0,
  color = 0xffffff
} = {}) {
  const geo = new THREE.RingBufferGeometry(1.0, 1.15, 64);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, 0);
  scene.add(mesh);

  shockwaves.push({
    mesh,
    time: 0,
    delay,
    duration,
    startScale,
    endScale
  });
}

function globalExplosionFromCenter() {
  const center = new THREE.Vector3(0, 10, 0);
  cubes.forEach(cube => {
    cube.visible = true;

    cube.userData.isExploding = true;
    cube.userData.landed = false;
    cube.userData.disappearTimer = 0;
    cube.userData.returning = false;
    cube.userData.blackHole = null;
    cube.userData.chainPending = false;

    
    if (cube.userData.originalColor) {
      cube.material.color.copy(cube.userData.originalColor);
    }

    const dir = new THREE.Vector3().subVectors(cube.position, center);
    if (dir.lengthSq() < 1e-4) {
      dir.set(
        Math.random() - 0.5,
        Math.random() * 0.5 + 0.5,
        Math.random() - 0.5
      );
    }
    dir.normalize();

    const speed = 16 + Math.random() * 10;
    cube.userData.velocity.copy(dir.multiplyScalar(speed));

    cube.userData.angularVelocity.set(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
  });

  shakeTime = SHAKE_DURATION;
  shakeBasePos.copy(camera.position);
  shakeBaseTarget.copy(controls.target);

  flashTime = FLASH_DURATION;
  flashOverlay.style.opacity = '1';

  
  
  
  
  createShockwave({
    startScale: TARGET_RADIUS * 0.4,
    endScale:   TARGET_RADIUS * 5.0
  });
  createShockwave({
    delay:      0.3,
    startScale: TARGET_RADIUS * 0.4,
    endScale:   TARGET_RADIUS * 4.0
  });
  createShockwave({
    delay:      0.6,
    startScale: TARGET_RADIUS * 0.4,
    endScale:   TARGET_RADIUS * 3.0
  });
  createShockwave({
    delay:      0.9,
    startScale: TARGET_RADIUS * 0.4,
    endScale:   TARGET_RADIUS * 2.0
  });
}

function cleanupExplosionVisuals() {
  if (targetGroup) {
    scene.remove(targetGroup);
    targetGroup = null;
  }
  targetRingMat = null;
  targetCrossMat = null;

  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh = null;
  }

  explosionActive = false;
  midShock75Triggered = false;
  midShock50Triggered = false;
}

function triggerGlobalExplosion() {
  if (undoInProgress || timeStopBusy() || worldTransitionBusy()) return;
  if (explosionActive) return;

  explosionActive = true;
  explosionTime = 0;
  globalExplosionTriggered = false;
  midShock75Triggered = false;
  midShock50Triggered = false;

  floorMat.color.copy(normalFloorColor);

  createTargetMarker();
  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh = null;
  }
  createShockwave({
    delay:      0.7,
    startScale: TARGET_RADIUS * 10,
    endScale:   0
  });
  createShockwave({
    delay:      1.7,
    startScale: TARGET_RADIUS * 35,
    endScale:   0
  });
}

document
  .getElementById('explosionBtn')
  .addEventListener('click', triggerGlobalExplosion);



function createClockHUD() {
  const group = new THREE.Group();
  const radius = 2.4;

  
  const BASE_ALPHA = 0.4;

  
  const faceGeo = new THREE.CircleBufferGeometry(radius, 64);
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0xffd966,
    transparent: true,
    opacity: BASE_ALPHA
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  group.add(face);

  
  const rimGeo = new THREE.RingBufferGeometry(radius * 0.9, radius, 64);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0xffc233,
    transparent: true,
    opacity: BASE_ALPHA
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  group.add(rim);

  
  const tickGeo = new THREE.BoxBufferGeometry(0.12, 0.4, 0.05);
  const tickMat = new THREE.MeshBasicMaterial({
    color: 0x996600,
    transparent: true,
    opacity: BASE_ALPHA
  });
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(tickGeo, tickMat);
    const angle = (i / 12) * Math.PI * 2;
    const r = radius * 0.8;
    tick.position.set(Math.sin(angle) * r, Math.cos(angle) * r, 0.02);
    tick.rotation.z = -angle;
    group.add(tick);
  }

  function createHand(length, width, colorHex, zOffset) {
    const geo = new THREE.PlaneBufferGeometry(width, length);
    geo.translate(0, length / 2, 0); 
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: BASE_ALPHA
    });
    const hand = new THREE.Mesh(geo, mat);
    hand.position.set(0, 0, zOffset);
    return hand;
  }

  const hourHand = createHand(radius * 0.7, 0.25, 0x996600, 0.05);
  const minuteHand = createHand(radius * 0.9, 0.18, 0x553300, 0.06);
  const secondHand = createHand(radius * 1.0, 0.1, 0xcc3333, 0.07);

  group.add(hourHand);
  group.add(minuteHand);
  group.add(secondHand);

  const centerGeo = new THREE.CircleBufferGeometry(0.14, 16);
  const centerMat = new THREE.MeshBasicMaterial({
    color: 0x553300,
    transparent: true,
    opacity: BASE_ALPHA
  });
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.position.z = 0.08;
  group.add(center);

  return { group, hourHand, minuteHand, secondHand };
}



const UNDO_DURATION = 2.5;
const UNDO_CLOCK_DURATION = 2.5;

let undoClock = null;
let undoClockActive = false;
let undoClockTime = 0;

function undoToBuilding() {
  if (undoInProgress || timeStopBusy() || worldTransitionBusy()) return;
  cancelWonderOfU(true);

  undoInProgress = true;
  cleanupExplosionVisuals();

  const duration = UNDO_DURATION;

  cubes.forEach(cube => {
    cube.visible = true;

    cube.userData.isExploding = false;
    cube.userData.landed = false;
    cube.userData.disappearTimer = 0;
    cube.userData.velocity.set(0, 0, 0);
    cube.userData.angularVelocity.set(0, 0, 0);

    cube.userData.returning = true;
    cube.userData.returnFrom.copy(cube.position);
    cube.userData.returnRotFrom.copy(cube.rotation);
    cube.userData.returnTime = 0;
    cube.userData.returnDuration = duration;

    
    cube.userData.blackHole = null;
    cube.userData.chainPending = false;
    if (cube.userData.originalColor) {
      cube.material.color.copy(cube.userData.originalColor);
    }
  });

  
  chainExplosions.length = 0;

  if (undoClock && undoClock.group.parent) {
    camera.remove(undoClock.group);
  }
  undoClock = createClockHUD();
  camera.add(undoClock.group);
  undoClock.group.position.set(0, 0, -8);
  undoClockActive = true;
  undoClockTime = 0;
}


document
  .getElementById('undoBtn')
  .addEventListener('click', undoToBuilding);



const timeStopCountdownEl = document.getElementById('timeStopCountdown');
const timeStopCountdownNumberEl = document.getElementById('timeStopCountdownNumber');
const timeStopDurationSelect = document.getElementById('timeStopDuration');

const TIME_STOP_ENTER = 2.0;
const TIME_STOP_EXIT = 2.0;
const DEFAULT_TIME_STOP_HOLD = 5.0; 

let timeStopHoldSeconds = DEFAULT_TIME_STOP_HOLD;
let timeStopTime = 0;
let timeStopOverlay = null;


if (timeStopDurationSelect) {
  timeStopDurationSelect.addEventListener('change', () => {
    const v = parseFloat(timeStopDurationSelect.value);
    if (!isNaN(v) && v > 0) {
      timeStopHoldSeconds = v;
    }
  });
  
  const initVal = parseFloat(timeStopDurationSelect.value);
  if (!isNaN(initVal) && initVal > 0) {
    timeStopHoldSeconds = initVal;
  }
}

function ensureTimeStopOverlay() {
  if (timeStopOverlay) return;

  
  timeStopOverlay = new THREE.Group();
  camera.add(timeStopOverlay);
  timeStopOverlay.position.set(0, 0, -5);
  timeStopOverlay.visible = false;

  
  const waveCount = 7;
  timeStopOverlay.userData.waves = [];

  for (let i = 0; i < waveCount; i++) {
    const innerR = 1.5;  
    const outerR = 2.0;  
    const geo = new THREE.RingBufferGeometry(innerR, outerR, 96);

    
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let j = 0; j < pos.count; j++) {
      v.set(pos.getX(j), pos.getY(j), pos.getZ(j));
      const angle = Math.atan2(v.y, v.x);
      const r = Math.sqrt(v.x * v.x + v.y * v.y);

      const noise =
        0.18 * Math.sin(angle * 3.0) +
        0.10 * Math.sin(angle * 7.0 + 1.2) +
        0.06 * Math.sin(angle * 11.0 - 0.7);

      const newR = r * (1.0 + noise);
      const nx = Math.cos(angle) * newR;
      const ny = Math.sin(angle) * newR;

      pos.setXYZ(j, nx, ny, v.z);
    }
    pos.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    const waveMesh = new THREE.Mesh(geo, mat);

    
    waveMesh.position.z = i * 0.1;

    timeStopOverlay.add(waveMesh);
    timeStopOverlay.userData.waves.push({
      mesh: waveMesh,
      delay: i * 0.1,  
      phase: 0         
    });
  }
}

function triggerTimeStop() {
  if (undoInProgress || worldTransitionBusy()) return;
  if (timeStopBusy()) return;

  
  if (timeStopDurationSelect) {
    const v = parseFloat(timeStopDurationSelect.value);
    if (!isNaN(v) && v > 0) {
      timeStopHoldSeconds = v;
    }
    timeStopDurationSelect.disabled = true;
  }

  ensureTimeStopOverlay();
  timeStopState = 'enter';
  timeStopTime = 0;
  timeStopOverlay.visible = true;
  timeStopOverlay.material.opacity = 0;
  renderer.domElement.style.filter = 'none';
  
}

document
  .getElementById('timeStopBtn')
  .addEventListener('click', triggerTimeStop);


const NEW_WORLD_CLOCK_DURATION = 4.0; 
const NEW_WORLD_FLOAT_DURATION = 5.0; 
const NEW_WORLD_SETTLE_DURATION = 2.5; 

let worldTransitionTime = 0;
let worldTransitionOldCubes = [];
let worldTransitionNewCubes = [];
let newWorldLayout = null;


let worldClock = null;
let worldClockActive = false;
let worldClockAngle = 0;

function triggerNewWorld() {
  if (worldTransitionBusy()) return;
  if (gerActive) return;
  if (undoInProgress || timeStopBusy() || explosionActive) return;
  cancelWonderOfU(true);

  
  chainExplosions.length = 0;
  cubes.forEach(cube => {
    cube.userData.blackHole = null;
    cube.userData.chainPending = false;
    if (cube.userData.originalColor) {
      cube.material.color.copy(cube.userData.originalColor);
    }
  });

  worldTransitionState = 'clock';
  worldTransitionTime = 0;

  
  if (worldClock && worldClock.group.parent) {
    camera.remove(worldClock.group);
  }
  worldClock = createClockHUD();
  camera.add(worldClock.group);
  worldClock.group.position.set(0, 0, -8);
  worldClockActive = true;
  worldClockAngle = 0;
}


document
  .getElementById('newWorldBtn')
  .addEventListener('click', triggerNewWorld);






const calamityCountdownEl = document.getElementById('calamityCountdown');
const calamityCountdownNumberEl = document.getElementById('calamityCountdownNumber');


const WONDER_CONFIG = {
  
  durationMin: 20,  
  durationMax: 40,  

  
  eventIntervalMin: 0.5,  
  eventIntervalMax: 1.5,  

  
  blockCountMin: 300,
  blockCountMax: 450,

  
  floorMin: 5,  
  floorMax: 9,  

  
  baseSpeed: 40,
  
  upwardBias: 0.7,

  
  nastyColors: [
    0x442255, 
    0x1a0b24, 
    0x223344  
  ],

  
  finalColor: 0x552222, 

  
  colorTransitionTime: 1.5,

  
  colorHoldTime: 0.0,

  
  finalBlendTime: 1.5,

  
  recoveryFadeTime: 1.2,

  
  cubeTintIntensity: 0.7,  

  
  floorTintIntensity: 0.5
};


let wonderActive = false;      
let wonderPhase = 'idle';      
let wonderElapsed = 0;         
let wonderDuration = 0;        
let wonderNextEventTime = 0;   


let wonderColorTime = 0;       


let wonderOriginalBg = null;     
let wonderOriginalClear = null;  
let wonderOriginalFog = null;    
let wonderOriginalFloorColor = null; 


function wonderRandFloat(min, max) {
  return min + Math.random() * (max - min);
}


function wonderRandInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}


function startWonderOfU() {
  
  if (worldLocked()) return;

  
  if (wonderActive || wonderPhase === 'recovery') return;

  wonderActive = true;
  wonderPhase = 'enter';
  wonderElapsed = 0;
  wonderColorTime = 0;

  
  wonderDuration = wonderRandFloat(
    WONDER_CONFIG.durationMin,
    WONDER_CONFIG.durationMax
  );

  
  wonderNextEventTime = wonderRandFloat(
    WONDER_CONFIG.eventIntervalMin,
    WONDER_CONFIG.eventIntervalMax
  );

  
  if (!wonderOriginalClear) {
    const c = new THREE.Color();
    renderer.getClearColor(c);
    wonderOriginalClear = c.clone();
  }
  if (!wonderOriginalBg) {
    if (scene.background instanceof THREE.Color) {
      wonderOriginalBg = scene.background.clone();
    } else {
      wonderOriginalBg = new THREE.Color(0x87ceeb);
    }
  }
  if (!wonderOriginalFog && scene.fog && scene.fog.color) {
    wonderOriginalFog = scene.fog.color.clone();
  }

  
  if (!wonderOriginalFloorColor && typeof floorMat !== 'undefined' && floorMat && floorMat.color) {
    wonderOriginalFloorColor = floorMat.color.clone();
  }

  
}


function cancelWonderOfU(restoreImmediately) {
  if (!wonderActive && wonderPhase === 'idle') return;

  wonderActive = false;
  wonderPhase = restoreImmediately ? 'idle' : 'recovery';
  wonderElapsed = 0;
  wonderColorTime = 0;

  if (restoreImmediately) {
    
    if (wonderOriginalClear) renderer.setClearColor(wonderOriginalClear, 1);
    if (wonderOriginalBg) {
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(wonderOriginalBg);
      } else {
        scene.background = wonderOriginalBg.clone();
      }
    }
    if (wonderOriginalFog && scene.fog && scene.fog.color) {
      scene.fog.color.copy(wonderOriginalFog);
    }

    
    if (wonderOriginalFloorColor && typeof floorMat !== 'undefined' && floorMat && floorMat.color) {
      floorMat.color.copy(wonderOriginalFloorColor);
    }
    if (typeof cubes !== 'undefined' && cubes && cubes.length) {
      for (const cube of cubes) {
        if (!cube.userData || !cube.userData.originalColor) continue;
        cube.material.color.copy(cube.userData.originalColor);
      }
    }
  }
}


function applyWonderTintToWorld(resultColor) {
  
  const gloom = resultColor;

  
  if (typeof floorMat !== 'undefined' && floorMat && floorMat.color) {
    const base = wonderOriginalFloorColor || floorMat.color;
    const t = WONDER_CONFIG.floorTintIntensity;
    const c = floorMat.color;
    c.r = base.r * (1 - t) + gloom.r * t;
    c.g = base.g * (1 - t) + gloom.g * t;
    c.b = base.b * (1 - t) + gloom.b * t;
  }

  
  if (typeof cubes !== 'undefined' && cubes && cubes.length) {
    const t = WONDER_CONFIG.cubeTintIntensity;
    for (const cube of cubes) {
      if (!cube.visible) continue;
      if (!cube.userData || !cube.userData.originalColor) continue;
      const base = cube.userData.originalColor;
      const c = cube.material.color;
      c.r = base.r * (1 - t) + gloom.r * t;
      c.g = base.g * (1 - t) + gloom.g * t;
      c.b = base.b * (1 - t) + gloom.b * t;
    }
  }
}



function applyWonderRecoveryTint(t) {
  if (!wonderOriginalBg) return;

  const gloom = new THREE.Color(WONDER_CONFIG.finalColor);

  
  if (typeof floorMat !== 'undefined' && floorMat && floorMat.color && wonderOriginalFloorColor) {
    const base = wonderOriginalFloorColor;
    const factor = WONDER_CONFIG.floorTintIntensity * (1 - t); 
    const c = floorMat.color;
    c.r = base.r * (1 - factor) + gloom.r * factor;
    c.g = base.g * (1 - factor) + gloom.g * factor;
    c.b = base.b * (1 - factor) + gloom.b * factor;
  }

  
  if (typeof cubes !== 'undefined' && cubes && cubes.length) {
    const baseFactor = WONDER_CONFIG.cubeTintIntensity;
    const factor = baseFactor * (1 - t);
    for (const cube of cubes) {
      if (!cube.userData || !cube.userData.originalColor) continue;
      const base = cube.userData.originalColor;
      const c = cube.material.color;
      c.r = base.r * (1 - factor) + gloom.r * factor;
      c.g = base.g * (1 - factor) + gloom.g * factor;
      c.b = base.b * (1 - factor) + gloom.b * factor;
    }
  }
}


function updateWonderColor(delta) {
  if (!wonderOriginalBg) return;

  
  if (gerBlockBgChange) return;

  wonderColorTime += delta;

  const nasty = WONDER_CONFIG.nastyColors;
  const trans = WONDER_CONFIG.colorTransitionTime;
  const hold = WONDER_CONFIG.colorHoldTime;
  const segLen = trans + hold;
  const segCount = nasty.length;

  const totalPre = segCount * segLen;          
  const finalBlend = WONDER_CONFIG.finalBlendTime;
  const tAll = wonderColorTime;

  let fromColor = new THREE.Color();
  let toColor = new THREE.Color();
  let resultColor = new THREE.Color();

  if (tAll < totalPre) {
    
    const idx = Math.floor(tAll / segLen);
    const local = tAll - idx * segLen;

    const target = new THREE.Color(nasty[idx]);
    const prev =
      idx === 0
        ? wonderOriginalBg
        : new THREE.Color(nasty[idx - 1]);

    if (local < trans) {
      const t = THREE.MathUtils.clamp(local / trans, 0, 1);
      fromColor.copy(prev);
      toColor.copy(target);
      resultColor.copy(fromColor.lerp(toColor, t));
    } else {
      
      resultColor.copy(target);
    }
  } else if (tAll < totalPre + finalBlend) {
    
    const local = tAll - totalPre;
    const t = THREE.MathUtils.clamp(local / finalBlend, 0, 1);
    const startColor =
      segCount > 0
        ? new THREE.Color(nasty[segCount - 1])
        : wonderOriginalBg;
    const finalColor = new THREE.Color(WONDER_CONFIG.finalColor);
    resultColor.copy(startColor.lerp(finalColor, t));
  } else {
    
    resultColor.set(WONDER_CONFIG.finalColor);
  }

  
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(resultColor);
  } else {
    scene.background = resultColor.clone();
  }

  renderer.setClearColor(resultColor, 1);

  if (scene.fog && scene.fog.color) {
    scene.fog.color.copy(resultColor);
  }

  
  applyWonderTintToWorld(resultColor);
}


function updateWonderRecoveryColor(delta) {
  if (!wonderOriginalBg) {
    wonderPhase = 'idle';
    return;
  }

  
  if (gerBlockBgChange) return;

  wonderColorTime += delta;
  const t = THREE.MathUtils.clamp(
    wonderColorTime / WONDER_CONFIG.recoveryFadeTime,
    0,
    1
  );

  const fromColor = new THREE.Color(WONDER_CONFIG.finalColor);
  const toColor = new THREE.Color(0x87ceeb);
  const current = fromColor.lerp(toColor, t);

  if (scene.background instanceof THREE.Color) {
    scene.background.copy(current);
  } else {
    scene.background = current.clone();
  }
  renderer.setClearColor(current, 1);

  if (scene.fog && scene.fog.color && wonderOriginalFog) {
    const fogCurrent = new THREE.Color(WONDER_CONFIG.finalColor).lerp(
      wonderOriginalFog,
      t
    );
    scene.fog.color.copy(fogCurrent);
  }

  
  applyWonderRecoveryTint(t);

  if (t >= 1) {
    wonderPhase = 'idle';
  }
}




function updateWonderOfU(delta, worldDelta) {
  
  if (wonderActive) {
    wonderElapsed += delta;
    updateWonderColor(delta);

    
    calamityCountdownEl.style.display = 'block';
    const remaining = Math.max(0, wonderDuration - wonderElapsed);
    const displaySeconds = Math.ceil(remaining);
    calamityCountdownNumberEl.textContent = displaySeconds > 0 ? displaySeconds.toString() : '';

    
    if (worldDelta > 0 && wonderElapsed >= wonderNextEventTime && wonderElapsed <= wonderDuration) {
      wonderTriggerRandomEvent();
      wonderNextEventTime =
        wonderElapsed +
        wonderRandFloat(
          WONDER_CONFIG.eventIntervalMin,
          WONDER_CONFIG.eventIntervalMax
        );
    }

    
    if (wonderElapsed >= wonderDuration) {
      wonderActive = false;
      wonderPhase = 'recovery';
      wonderColorTime = 0;

      
      calamityCountdownEl.style.display = 'none';

      
      if (typeof flashOverlay !== 'undefined') {
        flashOverlay.style.background = '#400000';
        flashOverlay.style.opacity = '1';
        
        setTimeout(() => {
          flashOverlay.style.background = '#ffffff';
        }, 400);
      }
    }
  } else if (wonderPhase === 'recovery') {
    updateWonderRecoveryColor(delta);
    
    calamityCountdownEl.style.display = 'none';
  } else {
    
    calamityCountdownEl.style.display = 'none';
  }
}



function wonderTriggerRandomEvent() {
  if (!cubes || cubes.length === 0) return;

  const r = Math.random();
  if (r < 0.5) {
    wonderTopCollapseEvent();
  } else {
    wonderSideHitEvent();
  }
}


function wonderTopCollapseEvent() {
  const buildingMap = new Map();

  
  for (const cube of cubes) {
    if (!cube.visible) continue;
    const info = cube.userData && cube.userData.gridPos;
    if (!info || info.building == null) continue;

    const id = info.building;
    let meta = buildingMap.get(id);
    if (!meta) {
      meta = { cubes: [], maxY: info.y };
      buildingMap.set(id, meta);
    }
    meta.cubes.push(cube);
    if (info.y > meta.maxY) meta.maxY = info.y;
  }

  if (buildingMap.size === 0) return;

  const entries = Array.from(buildingMap.values());
  const meta = entries[wonderRandInt(0, entries.length - 1)];

  const floors = wonderRandInt(
    WONDER_CONFIG.floorMin,
    WONDER_CONFIG.floorMax
  );
  const thresholdY = meta.maxY - floors + 1;

  const candidates = meta.cubes.filter(
    c => c.userData.gridPos.y >= thresholdY
  );
  if (candidates.length === 0) return;

  const maxBlocks = wonderRandInt(
    WONDER_CONFIG.blockCountMin,
    WONDER_CONFIG.blockCountMax
  );
  const count = Math.min(maxBlocks, candidates.length);

  
  const chosen = [];
  const pool = candidates.slice();
  for (let i = 0; i < count; i++) {
    const idx = wonderRandInt(0, pool.length - 1);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }

  
  const center = new THREE.Vector3();
  chosen.forEach(c => center.add(c.position));
  center.multiplyScalar(1 / chosen.length);

  for (const cube of chosen) {
    wonderKickCube(cube, center, 1.0);
  }
}


function wonderSideHitEvent() {
  const movable = [];

  for (const cube of cubes) {
    if (!cube.visible) continue;
    if (!cube.userData) continue;
    if (cube.userData.returning) continue; 
    movable.push(cube);
  }

  if (movable.length === 0) return;

  const maxBlocks = wonderRandInt(
    WONDER_CONFIG.blockCountMin,
    WONDER_CONFIG.blockCountMax
  );
  const count = Math.min(maxBlocks, movable.length);

  const chosen = [];
  const pool = movable.slice();
  for (let i = 0; i < count; i++) {
    const idx = wonderRandInt(0, pool.length - 1);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }

  
  const center = new THREE.Vector3();
  chosen.forEach(c => center.add(c.position));
  center.multiplyScalar(1 / chosen.length);

  
  const baseDir = new THREE.Vector3(
    Math.random() - 0.5,
    0.2 + Math.random() * 0.5,
    Math.random() - 0.5
  ).normalize();

  for (const cube of chosen) {
    wonderKickCube(cube, center, 1.1, baseDir);
  }
}




function wonderKickCube(cube, center, speedScale = 1.0, baseDir) {
  if (!cube.userData) return;

  cube.visible = true;
  cube.userData.isExploding = true;
  cube.userData.landed = false;
  cube.userData.disappearTimer = 0;
  cube.userData.returning = false;
  cube.userData.blackHole = null;
  cube.userData.chainPending = false;

  if (gerActive) {
    cube.userData.gerHitStamp = gerTime;
  }

  let dir;
  if (baseDir) {
    dir = baseDir.clone();
    dir.x += (Math.random() - 0.5) * 0.6;
    dir.y += (Math.random() - 0.5) * 0.4 + WONDER_CONFIG.upwardBias;
    dir.z += (Math.random() - 0.5) * 0.6;
  } else {
    dir = new THREE.Vector3().subVectors(cube.position, center);
    if (dir.lengthSq() < 1e-4) {
      dir.set(
        Math.random() - 0.5,
        Math.random() * 0.5 + WONDER_CONFIG.upwardBias,
        Math.random() - 0.5
      );
    } else {
      dir.y += WONDER_CONFIG.upwardBias;
    }
  }

  dir.normalize();

  const speed =
    WONDER_CONFIG.baseSpeed *
    speedScale *
    (0.9 + Math.random() * 0.4); 

  cube.userData.velocity.copy(dir.multiplyScalar(speed));
  cube.userData.angularVelocity.set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );
}


const wonderBtnEl = document.getElementById('wonderBtn');
if (wonderBtnEl) {
  wonderBtnEl.addEventListener('click', () => {
    startWonderOfU();
  });
}






const gerCountdownEl = document.getElementById('gerCountdown');
const gerCountdownNumberEl = document.getElementById('gerCountdownNumber');

const GER_CONFIG = {
  
  totalDuration: 20.0,

  
  expandDuration: 5.0, 
  retractDuration: 3.0, 

  
  allowedFlyTime: 1.0, 
  returnSpeed: 8.0,    
  returnThreshold: 0.001, 

  
  bgColorInner: new THREE.Color(0x2a0a3b), 
  bgColorOuter: new THREE.Color(0x1a0a2b), 

  
  ringWidth: 0.5 
};


let gerActive = false;
let gerTime = 0;
let gerBackgroundMesh = null;
let gerMaterial = null;


let gerOriginalBgColor = null;

let gerBlockBgChange = false;


function triggerGER() {
  
  if (worldTransitionBusy()) return;
  
  if (gerActive) return;

  
  if (undoInProgress) {
    undoInProgress = false;
    if (undoClock && undoClock.group.parent) camera.remove(undoClock.group);
  }

  
  if (scene.background instanceof THREE.Color) {
    gerOriginalBgColor = scene.background.clone();
  }

  
  gerBlockBgChange = true;

  
  cubes.forEach(cube => {
    
    if (!cube.userData.gerAnchor) {
      cube.userData.gerAnchor = {
        pos: new THREE.Vector3(),
        rot: new THREE.Euler(),
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        isExploding: false,
        wasStationary: false
      };
    }

    
    cube.userData.gerAnchor.pos.copy(cube.position);
    cube.userData.gerAnchor.rot.copy(cube.rotation);
    cube.userData.gerAnchor.vel.copy(cube.userData.velocity);
    cube.userData.gerAnchor.angVel.copy(cube.userData.angularVelocity);
    cube.userData.gerAnchor.isExploding = cube.userData.isExploding || false;

    
    const velMag = cube.userData.velocity.length();
    cube.userData.gerAnchor.wasStationary = !cube.userData.isExploding && velMag < 0.1;

    
    cube.userData.gerLastHit = -999;

    
    cube.userData.returning = false;
  });

  
  createGERBackground();

  gerActive = true;
  gerTime = 0;

  
  if (gerBackgroundMesh) {
    gerBackgroundMesh.visible = true;
  }
}


function createGERBackground() {
  if (gerBackgroundMesh) return;

  
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uProgress; // 0.0 ~ 1.0 擴張進度
    uniform vec3 uColorInner;
    uniform vec3 uColorOuter;
    uniform float uRingWidth; // 圓環寬度
    uniform bool uReverse; // ★ 是否反向（收回階段）
    varying vec2 vUv;

    void main() {
      // 中心座標 (-0.5 ~ 0.5)
      vec2 p = vUv - 0.5;
      // 修正比例 (寬螢幕)
      p.x *= 1.7; 

      float len = length(p);
      float maxRadius = 2.5;

      float alpha = 0.0;
      
      if (uReverse) {
        // ★ 收回模式：外環向內收縮
        // 圓環位置從外向內移動
        float ringPos = maxRadius * (1.0 - uProgress);
        float innerEdge = ringPos - uRingWidth;
        float outerEdge = ringPos;
        
        if (len < innerEdge) {
          // 環內：逐漸變回原色（已經被掃過的區域）
          alpha = 0.0;
        } else if (len < outerEdge) {
          // 圓環本體
          float t = (len - innerEdge) / uRingWidth;
          alpha = smoothstep(0.0, 0.3, t) * smoothstep(1.0, 0.7, t);
          alpha *= 0.95;
        } else {
          // 環外：還沒被掃到的區域，保持 GER 背景色
          alpha = 0.9;
        }
        
      } else {
        // 展開模式：內環向外擴張（原本的邏輯）
        float radius = uProgress * maxRadius;
        float innerEdge = radius - uRingWidth;
        float outerEdge = radius;
        
        if (len < innerEdge) {
          // 環內：完全透明
          alpha = 0.0;
        } else if (len < outerEdge) {
          // 圓環本體
          float t = (len - innerEdge) / uRingWidth;
          alpha = smoothstep(0.0, 0.3, t) * smoothstep(1.0, 0.7, t);
          alpha *= 0.95;
        } else {
          // 環外：逐漸變成背景色
          float fadeStart = outerEdge;
          float fadeEnd = outerEdge + 0.5;
          float t = smoothstep(fadeStart, fadeEnd, len);
          alpha = t * 0.9;
        }
      }

      // 顏色：從內圈（亮紫）到外圈（深紫）
      vec3 ringColor = mix(uColorOuter, uColorInner, len / maxRadius);
      
      // 加上圓環的脈動光芒效果
      float pulse = 0.7 + 0.3 * sin(uTime * 4.0);
      ringColor = mix(ringColor, vec3(0.6, 0.4, 0.8), pulse * 0.3 * alpha);

      gl_FragColor = vec4(ringColor, alpha);
    }
  `;

  gerMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uColorInner: { value: GER_CONFIG.bgColorInner },
      uColorOuter: { value: GER_CONFIG.bgColorOuter },
      uRingWidth: { value: GER_CONFIG.ringWidth },
      uReverse: { value: false } 
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const planeGeo = new THREE.PlaneBufferGeometry(200, 100);
  gerBackgroundMesh = new THREE.Mesh(planeGeo, gerMaterial);

  gerBackgroundMesh.position.set(0, 0, -80);
  gerBackgroundMesh.renderOrder = -1;

  camera.add(gerBackgroundMesh);
}


function updateGER(delta, worldDelta) {
    if (!gerActive) {
    gerCountdownEl.style.display = 'none'; 
    return;
  }

  gerTime += delta;

  
  gerCountdownEl.style.display = 'block';
  const remaining = Math.max(0, GER_CONFIG.totalDuration - gerTime);
  const displaySeconds = Math.ceil(remaining);
  gerCountdownNumberEl.textContent = displaySeconds > 0 ? displaySeconds.toString() : '';

  
  if (gerMaterial) {
    gerMaterial.uniforms.uTime.value = gerTime;

    
    let progress = 0;
    const t = gerTime;
    const total = GER_CONFIG.totalDuration;
    const expand = GER_CONFIG.expandDuration;
    const retract = GER_CONFIG.retractDuration;
    const sustain = total - expand - retract;

    if (t < expand) {
      
      const r = t / expand;
      progress = 1 - Math.pow(1 - r, 3);

      gerMaterial.uniforms.uReverse.value = false;
      gerMaterial.uniforms.uProgress.value = progress;

      
      if (gerOriginalBgColor && scene.background instanceof THREE.Color) {
        const targetColor = GER_CONFIG.bgColorInner;
        scene.background.lerpColors(gerOriginalBgColor, targetColor, progress);
      }

    } else if (t < expand + sustain) {
      
      progress = 1.0;
      gerMaterial.uniforms.uProgress.value = progress;

      
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(GER_CONFIG.bgColorInner);
      }

      
      if (gerBackgroundMesh && gerBackgroundMesh.visible) {
        gerBackgroundMesh.visible = false;
      }

    } else if (t < total) {
      
      const r = (t - (expand + sustain)) / retract;
      progress = r; 

      gerMaterial.uniforms.uReverse.value = true;
      gerMaterial.uniforms.uProgress.value = progress;

      
      if (gerBackgroundMesh && !gerBackgroundMesh.visible) {
        gerBackgroundMesh.visible = true;
      }

      
      let targetColor;
      if (wonderActive || wonderPhase === 'recovery') {
        
        targetColor = new THREE.Color(WONDER_CONFIG.finalColor);
      } else if (gerOriginalBgColor) {
        
        targetColor = gerOriginalBgColor;
      } else {
        
        targetColor = new THREE.Color(0x87ceeb);
      }

      
      if (scene.background instanceof THREE.Color) {
        const fromColor = GER_CONFIG.bgColorInner;
        scene.background.lerpColors(fromColor, targetColor, r * r);
      }

    } else {
      
      gerActive = false;
      gerBlockBgChange = false; 
      progress = 0;

      
      if (scene.background instanceof THREE.Color) {
        if (wonderActive || wonderPhase === 'recovery') {
          
          scene.background.set(WONDER_CONFIG.finalColor);
        } else if (gerOriginalBgColor) {
          
          scene.background.copy(gerOriginalBgColor);
        }
      }

      if (gerBackgroundMesh) gerBackgroundMesh.visible = false;

      
      cubes.forEach(c => {
        if (!c.userData.gerAnchor) return;

        
        const timeSinceHit = gerTime - (c.userData.gerHitStamp || -999);
        const wasHitDuringGER = timeSinceHit >= 0 && timeSinceHit < total;

        if (c.userData.gerAnchor.wasStationary && !wasHitDuringGER) {
          
          c.position.copy(c.userData.gerAnchor.pos);
          c.rotation.copy(c.userData.gerAnchor.rot);
          c.userData.velocity.set(0, 0, 0);
          c.userData.angularVelocity.set(0, 0, 0);
          c.userData.isExploding = false;
          c.userData.landed = false;
        } else {
          
          c.userData.velocity.copy(c.userData.gerAnchor.vel);
          c.userData.angularVelocity.copy(c.userData.gerAnchor.angVel);
          c.userData.isExploding = c.userData.gerAnchor.isExploding;
        }

        
        delete c.userData.gerAnchor;
        delete c.userData.gerHitStamp;
      });

      
      gerOriginalBgColor = null;
    }

    if (gerTime >= GER_CONFIG.totalDuration) {
      gerActive = false;
      gerBlockBgChange = false;
      
      gerCountdownEl.style.display = 'none';
    }
  }

  
  if (worldDelta > 0) {
    cubes.forEach(cube => {
      
      if (!cube.userData.gerAnchor) return;
      if (!cube.visible) return;

      const timeSinceHit = gerTime - (cube.userData.gerHitStamp || -999);

      
      if (timeSinceHit < GER_CONFIG.allowedFlyTime && timeSinceHit >= 0) {
         
      } else {
        
        const anchorPos = cube.userData.gerAnchor.pos;
        const anchorRot = cube.userData.gerAnchor.rot;

        
        const returnFactor = GER_CONFIG.returnSpeed * worldDelta;

        
        cube.position.lerp(anchorPos, returnFactor);

        
        const currentQuat = new THREE.Quaternion().setFromEuler(cube.rotation);
        const targetQuat = new THREE.Quaternion().setFromEuler(anchorRot);
        currentQuat.slerp(targetQuat, returnFactor);
        cube.rotation.setFromQuaternion(currentQuat);

        
        cube.userData.velocity.multiplyScalar(0.7);
        cube.userData.angularVelocity.multiplyScalar(0.7);

        
        const distSq = cube.position.distanceToSquared(anchorPos);
        if (distSq < GER_CONFIG.returnThreshold) {
          
          cube.position.copy(anchorPos);
          cube.rotation.copy(anchorRot);
          cube.userData.velocity.set(0, 0, 0);
          cube.userData.angularVelocity.set(0, 0, 0);
        }
      }
    });
  }
}

document.getElementById('gerBtn').addEventListener('click', triggerGER);


const mainClock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = mainClock.getDelta();

  
  const worldDelta = (timeStopBusy() || worldTransitionBusy()) ? 0 : delta;

  
  timeDistortionTime += delta;
  timeDistortionPass.uniforms.uTime.value = timeDistortionTime;

  const gravity = 9.8 * 2;
  const damping = 0.5;
  const floorY = cubeSize / 2;

  
  cubes.forEach(cube => {
    
    if (cube.userData.returning) {
      cube.userData.returnTime += worldDelta;
      const t = Math.min(
        cube.userData.returnTime / cube.userData.returnDuration,
        1
      );
      const ease = 1 - Math.pow(1 - t, 3);

      cube.position.lerpVectors(
        cube.userData.returnFrom,
        cube.userData.initialPosition,
        ease
      );

      cube.rotation.x =
        cube.userData.returnRotFrom.x +
        (0 - cube.userData.returnRotFrom.x) * ease;
      cube.rotation.y =
        cube.userData.returnRotFrom.y +
        (0 - cube.userData.returnRotFrom.y) * ease;
      cube.rotation.z =
        cube.userData.returnRotFrom.z +
        (0 - cube.userData.returnRotFrom.z) * ease;

      if (t >= 1) {
        cube.userData.returning = false;
        cube.rotation.set(0, 0, 0);
        cube.position.copy(cube.userData.initialPosition);
      }
      return; 
    }

    
    if (cube.userData.isExploding && worldDelta > 0) {
      const bh = cube.userData.blackHole;

      
      if (bh) {
        bh.time += worldDelta;

        
        if (bh.time < bh.pullDuration) {
          const toCenter = tempVec3.subVectors(bh.center, cube.position);
          const dist = toCenter.length() + 0.001;
          toCenter.normalize();

          const baseStrength = 160;
          const distanceFactor = Math.pow(
            Math.max(0.1, (BLACK_HOLE_EFFECT_RADIUS - dist) / BLACK_HOLE_EFFECT_RADIUS),
            1.5
          );
          const timeFactor = Math.pow(bh.time / bh.pullDuration, 0.5);

          const pullStrength = baseStrength * distanceFactor * timeFactor;
          cube.userData.velocity.addScaledVector(toCenter, pullStrength * worldDelta);
        }
        
        else if (!bh.blasted) {
          bh.blasted = true;
          const dir = tempVec3.subVectors(cube.position, bh.center);
          if (dir.lengthSq() < 1e-4) {
            dir.set(
              Math.random() - 0.5,
              Math.random() * 0.5 + 0.3,
              Math.random() - 0.5
            );
          }
          dir.normalize();
          const speed = 25 + Math.random() * 8;
          cube.userData.velocity.copy(dir.multiplyScalar(speed));
        }
        
        else if (bh.time > bh.totalDuration) {
          cube.userData.blackHole = null;
        }
      }

      
      cube.userData.velocity.y -= gravity * worldDelta;
      cube.userData.velocity.multiplyScalar(1 - damping * worldDelta);
      cube.position.addScaledVector(cube.userData.velocity, worldDelta);

      cube.rotation.x += cube.userData.angularVelocity.x * worldDelta;
      cube.rotation.y += cube.userData.angularVelocity.y * worldDelta;
      cube.rotation.z += cube.userData.angularVelocity.z * worldDelta;

      
      if (cube.position.y <= floorY) {
        cube.position.y = floorY;

        cube.userData.velocity.y *= -0.45;
        cube.userData.velocity.x *= 0.65;
        cube.userData.velocity.z *= 0.65;
        cube.userData.angularVelocity.multiplyScalar(0.5);

        const vy = Math.abs(cube.userData.velocity.y);
        const speedSq =
          cube.userData.velocity.x * cube.userData.velocity.x +
          cube.userData.velocity.y * cube.userData.velocity.y +
          cube.userData.velocity.z * cube.userData.velocity.z;

        
        if (!cube.userData.blackHole && vy < 1 && speedSq < 4) {
          cube.userData.isExploding = false;
          cube.userData.velocity.set(0, 0, 0);
          cube.userData.angularVelocity.set(0, 0, 0);
          cube.userData.landed = true;
          cube.userData.disappearTimer = 3 + Math.random() * 2;
        }
      }
    }

    
    if (cube.userData.landed && cube.userData.disappearTimer > 0 && worldDelta > 0) {
      cube.userData.disappearTimer -= worldDelta;
      if (cube.userData.disappearTimer <= 0) {
        cube.visible = false;
        cube.userData.landed = false;
      }
    }
  });

  
  updateSwordSlashes(worldDelta);

  
  updateChainExplosions(worldDelta);

  
  updateWonderOfU(delta, worldDelta);

  
  updateGER(delta, worldDelta);

  
  if (explosionActive) {
    explosionTime += worldDelta;
    const t = explosionTime;

    if (targetGroup) {
      const pulse = 1 + Math.sin(t * 4) * 0.1;
      targetGroup.scale.set(pulse, 1, pulse);
      targetGroup.rotation.y = t * 2.0;
    }

    
    if (t >= BEAM_START_TIME && targetRingMat && targetCrossMat) {
      targetRingMat.color.set(0xff4444);
      targetCrossMat.color.set(0xff4444);
    }

    if (!beamMesh && t >= BEAM_START_TIME) {
      createBeam();
    }

    if (beamMesh) {
      const tb = t - BEAM_START_TIME;

      if (tb < BEAM_GROW_TIME) {
        const grow = THREE.MathUtils.clamp(tb / BEAM_GROW_TIME, 0, 1);
        beamMesh.scale.y = grow;

        
        
        
        if (!midShock75Triggered && grow >= 0.25) {
          createShockwave({
            y: BEAM_HEIGHT * 0.75,
            startScale: TARGET_RADIUS * 0.35,
            endScale: TARGET_RADIUS * 1.6,
            duration: 0.7,
            color: 0xffcccc
          });
          midShock75Triggered = true;
        }
        if (!midShock50Triggered && grow >= 0.5) {
          createShockwave({
            y: BEAM_HEIGHT * 0.5,
            startScale: TARGET_RADIUS * 0.4,
            endScale: TARGET_RADIUS * 1.8,
            duration: 0.75,
            color: 0xffbbbb
          });
          midShock50Triggered = true;
        }
      } else {
        const fade = THREE.MathUtils.clamp(EXPLOSION_ANIM_END - t, 0, 1);
        beamMesh.material.opacity = 0.6 * fade;
      }

      if (tb >= 0) {
        const hue = 0.45 + Math.sin(tb * 5) * 0.1;
        beamMesh.material.color.setHSL(hue, 0.9, 0.7);
      }
    }

    if (!globalExplosionTriggered && t >= GLOBAL_EXPLOSION_TIME) {
      globalExplosionTriggered = true;
      globalExplosionFromCenter();
    }

    if (t > EXPLOSION_ANIM_END) {
      cleanupExplosionVisuals();
    }
  }

  
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];

    if (worldDelta <= 0) {
      
      continue;
    }

    sw.time += worldDelta;

    if (sw.time < sw.delay) continue;

    const localT = (sw.time - sw.delay) / sw.duration;
    if (localT >= 1) {
      scene.remove(sw.mesh);
      shockwaves.splice(i, 1);
      continue;
    }

    const ease = 1 - Math.pow(1 - localT, 3);
    const scale = sw.startScale + (sw.endScale - sw.startScale) * ease;
    sw.mesh.scale.set(scale, scale, scale);
    sw.mesh.material.opacity = 0.8 * (1 - localT);
  }


  
  for (let i = blackHoleVisuals.length - 1; i >= 0; i--) {
    const v = blackHoleVisuals[i];
    v.time += delta;
    const pullT = v.pullDuration;
    const totalT = v.totalDuration;
    const t = v.time;

    if (t >= totalT) {
      scene.remove(v.core);
      scene.remove(v.ring);
      blackHoleVisuals.splice(i, 1);
      continue;
    }

    
    if (t <= pullT) {
      const ratio = t / pullT;
      const scale = 1.8 - ratio * 1.4; 
      v.ring.scale.setScalar(scale);
      v.ring.material.opacity = 0.7;
    } else {
      const explodeT = (t - pullT) / (totalT - pullT);
      const scale = 0.4 + explodeT * 3.0; 
      v.ring.scale.setScalar(scale);
      v.ring.material.opacity = 0.8 * (1.0 - explodeT);
    }

    
    if (t <= pullT) {
      v.core.material.opacity = 1.0;
    } else {
      const fade = 1 - (t - pullT) / (totalT - pullT);
      v.core.material.opacity = Math.max(0.0, fade);
    }

    v.ring.rotation.z += delta * 2.5;
  }



  
  if (undoClockActive && undoClock) {
    undoClockTime += delta;
    let t = undoClockTime / UNDO_CLOCK_DURATION;
    if (t > 1) t = 1;

    const ease = 1 - Math.pow(1 - t, 3);
    const deg2rad = Math.PI / 180;

    const startMinute = -30 * deg2rad;
    const endMinute = 0;
    undoClock.minuteHand.rotation.z = startMinute + (endMinute - startMinute) * ease;

    const startHour = -2.5 * deg2rad;
    const endHour = 0;
    undoClock.hourHand.rotation.z = startHour + (endHour - startHour) * ease;

    const startSecond = 0;
    const endSecond = 5 * Math.PI * 2;
    undoClock.secondHand.rotation.z = startSecond + endSecond * ease;

    const baseScale = 1;
    const pulse = 1 + Math.sin(t * Math.PI) * 0.08;
    undoClock.group.scale.set(baseScale * pulse, baseScale * pulse, baseScale * pulse);

    if (t >= 1) {
      if (undoClock.group.parent) {
        camera.remove(undoClock.group);
      }
      undoClock = null;
      undoClockActive = false;
      undoInProgress = false;
    }
  }

  
  if (flashTime > 0) {
    flashTime -= worldDelta;
    const ratio = Math.max(flashTime, 0) / FLASH_DURATION;
    flashOverlay.style.opacity = String(ratio.toFixed(2));
  } else if (flashOverlay.style.opacity !== '0') {
    flashOverlay.style.opacity = '0';
  }

  
  if (shakeTime > 0) {
    shakeTime -= worldDelta;
    const s = THREE.MathUtils.clamp(shakeTime / SHAKE_DURATION, 0, 1);
    const strength = s * SHAKE_INTENSITY;

    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength
    );
    const targetOffset = new THREE.Vector3(
      (Math.random() - 0.5) * strength * 0.5,
      (Math.random() - 0.5) * strength * 0.5,
      (Math.random() - 0.5) * strength * 0.5
    );

    camera.position.copy(shakeBasePos).add(offset);
    controls.target.copy(shakeBaseTarget).add(targetOffset);
  }

  
  if (timeStopBusy()) {
    timeStopTime += delta;

    if (timeStopState === 'enter') {
      const t = timeStopTime / TIME_STOP_ENTER;
      if (t >= 1) {
        timeStopState = 'hold';
        timeStopTime = 0;
        renderer.domElement.style.filter = 'grayscale(1) contrast(1.15)';
        if (timeStopOverlay) {
          timeStopOverlay.visible = false;
        }
        timeDistortionPass.uniforms.uIntensity.value = 0.0;

        if (timeStopCountdownEl) {
          timeStopCountdownEl.style.display = 'block';
        }
      } else {
        const n = THREE.MathUtils.clamp(t, 0, 1);
        const u = n < 0.5 ? n / 0.5 : (1 - n) / 0.5;

        timeDistortionPass.uniforms.uIntensity.value = u;

        if (timeStopOverlay && timeStopOverlay.userData.waves) {
          timeStopOverlay.visible = true;

          
          timeStopOverlay.userData.waves.forEach((wave, index) => {
            const localTime = timeStopTime - wave.delay;

            if (localTime < 0) {
              
              wave.mesh.material.opacity = 0;
              wave.mesh.scale.set(0.1, 0.1, 1);
              return;
            }

            
            const cycleDuration = TIME_STOP_ENTER * 0.8; 
            const expandTime = cycleDuration * 0.35;     
            const holdTime = cycleDuration * 0.15;       
            const retractTime = cycleDuration * 0.35;    

            wave.phase = (localTime % cycleDuration) / cycleDuration;

            let scale = 1.0;
            let opacity = 0.0;

            if (localTime < expandTime) {
              
              const expandT = localTime / expandTime;
              const easeOut = 1 - Math.pow(1 - expandT, 3); 
              scale = 0.1 + easeOut * 4.5;  
              opacity = 0.8 * Math.sin(expandT * Math.PI); 
            } else if (localTime < expandTime + holdTime) {
              
              scale = 4.6;
              const holdT = (localTime - expandTime) / holdTime;
              opacity = 0.4 * (1 - holdT); 
            } else if (localTime < expandTime + holdTime + retractTime) {
              
              const retractT = (localTime - expandTime - holdTime) / retractTime;
              const easeIn = Math.pow(retractT, 2); 
              scale = 4.6 - easeIn * 4.5;  
              opacity = 0.6 * (1 - retractT); 
            } else {
              
              scale = 0.1;
              opacity = 0;
            }

            wave.mesh.scale.set(scale, scale, 1);
            wave.mesh.material.opacity = opacity * 0.9; 

            
            wave.mesh.rotation.z = localTime * (2.0 + index * 0.5);
          });
        }

        if (timeStopCountdownEl) {
          timeStopCountdownEl.style.display = 'none';
        }
      }
    } else if (timeStopState === 'hold') {
      const t = timeStopTime;
      const remaining = Math.max(0, timeStopHoldSeconds - t);
      const display = Math.ceil(remaining);

      if (timeStopCountdownEl) {
        timeStopCountdownEl.style.display = 'block';
      }

      if (timeStopCountdownNumberEl) {
        timeStopCountdownNumberEl.textContent = display > 0 ? display.toString() : '0';
      }

      renderer.domElement.style.filter = 'grayscale(1) contrast(1.15)';
      timeDistortionPass.uniforms.uIntensity.value = 0.0;

      if (t >= timeStopHoldSeconds) {
        timeStopState = 'exit';
        timeStopTime = 0;
        if (timeStopOverlay) {
          timeStopOverlay.visible = true;
        }
        if (timeStopCountdownEl) {
          timeStopCountdownEl.style.display = 'none';
        }
      }
    } else if (timeStopState === 'exit') {
      const t = timeStopTime / TIME_STOP_EXIT;
      if (t >= 1) {
        timeStopState = 'idle';
        timeStopTime = 0;
        renderer.domElement.style.filter = 'none';
        if (timeStopDurationSelect) {
          timeStopDurationSelect.disabled = false;
        }
        if (timeStopCountdownEl) {
          timeStopCountdownEl.style.display = 'none';
        }
        if (timeStopOverlay) {
          timeStopOverlay.visible = false;
        }
        timeDistortionPass.uniforms.uIntensity.value = 0.0;
      } else {
        const n = THREE.MathUtils.clamp(t, 0, 1);
        const u = n < 0.5 ? n / 0.5 : (1 - n) / 0.5;
        timeDistortionPass.uniforms.uIntensity.value = u;

        const grey = 1 - n;
        renderer.domElement.style.filter =
          `grayscale(${grey}) contrast(${1 + grey * 0.15})`;

        if (timeStopOverlay && timeStopOverlay.userData.waves) {
          timeStopOverlay.visible = true;

          
          timeStopOverlay.userData.waves.forEach((wave, index) => {
            const localTime = timeStopTime - wave.delay * 0.5; 

            if (localTime < 0) {
              wave.mesh.material.opacity = 0;
              return;
            }

            const expandT = Math.min(localTime / (TIME_STOP_EXIT * 0.4), 1);
            const easeOut = 1 - Math.pow(1 - expandT, 2);
            const scale = 0.1 + easeOut * 5.0;

            wave.mesh.scale.set(scale, scale, 1);
            wave.mesh.material.opacity = 0.7 * (1 - expandT) * (1 - n);
            wave.mesh.rotation.z = localTime * 3.0;
          });
        }

        if (timeStopCountdownEl) {
          timeStopCountdownEl.style.display = 'none';
        }
      }
    }
  } else {
    renderer.domElement.style.filter = renderer.domElement.style.filter || 'none';
    timeDistortionPass.uniforms.uIntensity.value = 0.0;
    if (timeStopCountdownEl) {
      timeStopCountdownEl.style.display = 'none';
    }
  }

  
  if (worldTransitionBusy()) {
    worldTransitionTime += delta;

    if (worldTransitionState === 'clock') {
      const t = worldTransitionTime / NEW_WORLD_CLOCK_DURATION;
      if (t >= 1) {
        
        worldTransitionState = 'float';
        worldTransitionTime = 0;

        
        worldTransitionOldCubes = cubes.slice();
        worldTransitionOldCubes.forEach(c => {
          c.userData.isOldWorldCube = true;
          c.userData.floatStartPos = c.position.clone();
          c.userData.floatAngle = Math.random() * Math.PI * 2;
          c.userData.floatRadius = Math.random() * 2 + 1;
        });

        
        newWorldLayout = WorldGenerator.generateLayout(WORLD_CONFIG);

        
        worldTransitionNewCubes = [];
        newWorldLayout.forEach(entry => {
          const color = entry.color;
          const mat = new THREE.MeshStandardMaterial({ color });
          const cube = new THREE.Mesh(boxGeo, mat);

          const baseHeight = 15 + Math.random() * 4;
          const baseRadius = 2 + Math.random() * 5;
          const angle = Math.random() * Math.PI * 2;

          cube.position.set(
            Math.cos(angle) * baseRadius,
            baseHeight,
            Math.sin(angle) * baseRadius
          );

          initCubeCommon(cube, entry.gridPos, entry.position);

          cube.userData.isOldWorldCube = false;
          cube.userData.floatAngle = angle;
          cube.userData.floatRadius = baseRadius;
          cube.userData.floatHeightBase = baseHeight;

          cube.scale.setScalar(0.2); 

          cubes.push(cube);
          worldTransitionNewCubes.push(cube);
          scene.add(cube);
        });

      } else {
        
      }
    } else if (worldTransitionState === 'float') {
      const t = worldTransitionTime / NEW_WORLD_FLOAT_DURATION;
      const n = THREE.MathUtils.clamp(t, 0, 1);

      
      const ease = 1 - Math.pow(1 - n, 3);
      
      const swirlAmount = ease * ease;

      
      worldTransitionOldCubes.forEach(c => {
        const start = c.userData.floatStartPos;
        const baseAngle = c.userData.floatAngle;
        const baseRadius = c.userData.floatRadius;

        const height = start.y + 6.0 * ease;

        const angle = baseAngle + worldTransitionTime * 2.0 * swirlAmount;
        const radius = baseRadius + 3.0 * ease;

        const offsetX = Math.cos(angle) * radius * swirlAmount;
        const offsetZ = Math.sin(angle) * radius * swirlAmount;

        c.position.set(
          start.x + offsetX,
          height,
          start.z + offsetZ
        );

        const rotSpeed = 3.0 * swirlAmount;
        c.rotation.x += rotSpeed * delta;
        c.rotation.y += rotSpeed * delta;

        const s = THREE.MathUtils.lerp(1, 0.2, ease);
        c.scale.setScalar(s);

        if (n > 0.95) {
          c.visible = false;
        }
      });

      
      worldTransitionNewCubes.forEach(c => {
        const baseH = c.userData.floatHeightBase;
        const baseAngle = c.userData.floatAngle;
        const baseRadius = c.userData.floatRadius;

        const angle = baseAngle - worldTransitionTime * 2.5 * (0.5 + 0.5 * swirlAmount);
        const radius = baseRadius + 1.5 * (1 - ease);

        const bob = Math.sin(worldTransitionTime * 2 + baseAngle) * 0.5 * (0.3 + 0.7 * ease);
        const height = baseH + bob;

        c.position.set(
          Math.cos(angle) * radius,
          height,
          Math.sin(angle) * radius
        );

        const rotSpeed = 2.0 * (0.3 + 0.7 * swirlAmount);
        c.rotation.x += rotSpeed * delta;
        c.rotation.y += rotSpeed * delta;

        const s = THREE.MathUtils.lerp(0.2, 1.0, ease);
        c.scale.setScalar(s);
        c.visible = true;
      });

      if (t >= 1) {
        
        worldTransitionState = 'settle';
        worldTransitionTime = 0;

        
        const survivors = [];
        cubes.forEach(c => {
          if (c.userData.isOldWorldCube) {
            scene.remove(c);
          } else {
            survivors.push(c);
          }
        });
        cubes.length = 0;
        cubes.push(...survivors);

        
        worldTransitionNewCubes.forEach(c => {
          c.userData.worldSettleStartPos = c.position.clone();
          c.visible = true;
        });

        currentLayout = newWorldLayout;
      }
    } else if (worldTransitionState === 'settle') {
      const t = worldTransitionTime / NEW_WORLD_SETTLE_DURATION;
      const n = THREE.MathUtils.clamp(t, 0, 1);
      const ease = 1 - Math.pow(1 - n, 3);

      worldTransitionNewCubes.forEach(c => {
        if (!c.userData.worldSettleStartPos) {
          c.userData.worldSettleStartPos = c.position.clone();
        }
        const start = c.userData.worldSettleStartPos;
        const end = c.userData.initialPosition;

        c.position.lerpVectors(start, end, ease);

        c.rotation.x *= (1 - ease * 0.7);
        c.rotation.y *= (1 - ease * 0.7);
        c.rotation.z *= (1 - ease * 0.7);

        c.scale.setScalar(1);
      });

      if (t >= 1) {
        
        worldTransitionState = 'idle';
        worldTransitionTime = 0;
        worldTransitionOldCubes = [];
        worldTransitionNewCubes = [];
        newWorldLayout = null;

        
        cubes.forEach(c => {
          delete c.userData.isOldWorldCube;
          delete c.userData.floatStartPos;
          delete c.userData.floatAngle;
          delete c.userData.floatRadius;
          delete c.userData.floatHeightBase;
          delete c.userData.worldSettleStartPos;
        });

        
        if (worldClock && worldClock.group.parent) {
          worldClock.hourHand.rotation.z = 0;
          worldClock.minuteHand.rotation.z = 0;
          worldClock.secondHand.rotation.z = 0;
          camera.remove(worldClock.group);
        }
        worldClock = null;
        worldClockActive = false;

        
        spawnRemaining = MAX_SPAWN_PER_WORLD;
        updateSpawnHint();
      }
    }
  }

  
  if (worldClockActive && worldClock) {
    let speed = 0;
    if (worldTransitionState === 'clock') {
      const t = THREE.MathUtils.clamp(worldTransitionTime / NEW_WORLD_CLOCK_DURATION, 0, 1);
      speed = THREE.MathUtils.lerp(1.0, 8.0, t);
    } else if (worldTransitionState === 'float') {
      speed = 8.0;
    } else if (worldTransitionState === 'settle') {
      speed = 4.0;
    } else {
      speed = 0.0;
    }

    worldClockAngle += delta * speed * 2.0;

    worldClock.hourHand.rotation.z = -worldClockAngle * 0.3;
    worldClock.minuteHand.rotation.z = -worldClockAngle * 2.0;
    worldClock.secondHand.rotation.z = -worldClockAngle * 8.0;

    const pulse = 1 + Math.sin(worldTransitionTime * 3.0) * 0.05;
    worldClock.group.scale.set(pulse, pulse, pulse);
  }

  
  controls.update();

  
  composer.render();
}

animate();


(function () {
  
  if (!window.PointerEvent) {
    
    return;
  }

  function handlePointerUp(e) {
    
    if (typeof e.button === 'number' && e.button !== 0) return;

    
    e.preventDefault();

    
    onClick(e);
  }

  
  renderer.domElement.removeEventListener('click', onClick);
  renderer.domElement.addEventListener('pointerup', handlePointerUp, {
    passive: false
  });
})();


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
