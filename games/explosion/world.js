



(function () {
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  
  function circlesOverlap(x1, z1, r1, x2, z2, r2) {
    const dx = x1 - x2;
    const dz = z1 - z2;
    const distSq = dx * dx + dz * dz;
    const minDist = r1 + r2;
    return distSq < minDist * minDist;
  }

  
  function generateLayout(options) {
    options = options || {};
    const cubeSize = options.cubeSize || 1;
    const gap = options.gap || 1.05;

    const optMinBuildings =
      typeof options.minBuildings === "number" ? options.minBuildings : 3;
    const optMaxBuildings =
      typeof options.maxBuildings === "number" ? options.maxBuildings : 6;
    const minBuildings = Math.max(3, optMinBuildings);
    const maxBuildings = Math.max(minBuildings, optMaxBuildings);

    const minFoot = options.minFoot || 3;
    const maxFoot = options.maxFoot || 6;
    const minHeight = options.minHeight || 10;
    const maxHeight = options.maxHeight || 20;

    const minTrees = options.minTrees || 3;
    const maxTrees = options.maxTrees || 5;

    const worldRadius = options.worldRadius || 20;

    const layout = [];

    const buildingConfigs = []; 
    const trees = [];
    const bushes = [];
    const stonePiles = [];

    
    const sphereBuildings = []; 
    const tBuildings = [];      

    let nextGroupId = 0;
    let mainBuildingBounds = null; 

    
    (function createMainBuilding() {
      const mainId = nextGroupId++;
      const useTwinTowers = Math.random() < 0.5;

      const mainCx = 0;
      const mainCz = 0;

      const occupied = new Set(); 
      let maxDistSq = 0;

      const baseHue = (0.55 + Math.random() * 0.15) % 1;
      let heightForColor = 0;

      function addMainCube(gx, gy, gz, colorOverride) {
        const key = gx + "," + gy + "," + gz;
        if (occupied.has(key)) return;
        occupied.add(key);

        const wx = mainCx + gx * cubeSize * gap;
        const wy = cubeSize / 2 + gy * cubeSize * gap;
        const wz = mainCz + gz * cubeSize * gap;

        const dx = wx - mainCx;
        const dz = wz - mainCz;
        const distSq = dx * dx + dz * dz;
        if (distSq > maxDistSq) maxDistSq = distSq;

        let color;
        if (colorOverride) {
          color = colorOverride.clone ? colorOverride.clone() : colorOverride;
        } else {
          const t = gy / Math.max(1, heightForColor || 1);
          const hue = (baseHue + t * 0.08 + 1) % 1;
          color = new THREE.Color().setHSL(hue, 0.6, 0.55);
        }

        layout.push({
          position: new THREE.Vector3(wx, wy, wz),
          color,
          buildingId: mainId,
          kind: "building",
          gridPos: { x: gx, y: gy, z: gz, building: mainId }
        });
      }

      if (!useTwinTowers) {
        
        let baseSide = randInt(6, 12);

        const yBottom = randInt(10, 16);
        const yMid = Math.max(1, yBottom - 2);
        const yTop = Math.max(1, yBottom - 2);
        const spikeHeight = 7;

        const midSide = baseSide - 2;
        const topSide = baseSide - 4;

        const totalHeight = yBottom + yMid + yTop + spikeHeight;
        heightForColor = totalHeight;

        function addLayer(side, startY, height) {
          const startX = -Math.floor(side / 2);
          const endX = startX + side - 1;
          const startZ = startX;
          const endZ = startZ + side - 1;

          for (let gy = 0; gy < height; gy++) {
            const y = startY + gy;
            for (let gx = startX; gx <= endX; gx++) {
              for (let gz = startZ; gz <= endZ; gz++) {
                addMainCube(gx, y, gz, null);
              }
            }
          }
        }

        
        addLayer(baseSide, 0, yBottom);
        
        addLayer(midSide, yBottom, yMid);
        
        addLayer(topSide, yBottom + yMid, yTop);

        
        const spikeStartY = yBottom + yMid + yTop;
        const isBaseEven = baseSide % 2 === 0;

        const spikeXs = isBaseEven ? [-1, 0] : [0];
        const spikeZs = isBaseEven ? [-1, 0] : [0];

        for (let i = 0; i < spikeHeight; i++) {
          const gy = spikeStartY + i;
          for (const gx of spikeXs) {
            for (const gz of spikeZs) {
              addMainCube(gx, gy, gz, null);
            }
          }
        }
      } else {
        
        const extraHeightMin = 6;
        const extraHeightMax = 12;
        const towerHeight = randInt(
          maxHeight + extraHeightMin,
          maxHeight + extraHeightMax
        );
        heightForColor = towerHeight;

        const towerHalfW = randInt(3, 4);
        const towerHalfD = randInt(2, 3);
        const towerOffset = towerHalfW + randInt(3, 5);

        
        for (let localX = -towerHalfW; localX <= towerHalfW; localX++) {
          for (let gz = -towerHalfD; gz <= towerHalfD; gz++) {
            for (let gy = 0; gy < towerHeight; gy++) {
              const gxL = localX - towerOffset;
              addMainCube(gxL, gy, gz, null);

              const gxR = localX + towerOffset;
              addMainCube(gxR, gy, gz, null);
            }
          }
        }

        
        const bridgeLevel = Math.floor(towerHeight * 0.6);
        const bridgeHalfD = Math.max(1, towerHalfD - 1);
        const bridgeStartX = -towerOffset + (-towerHalfW + 1);
        const bridgeEndX = towerOffset + (towerHalfW - 1);

        const bridgeColor = new THREE.Color().setHSL(
          (baseHue + 0.05) % 1,
          0.5,
          0.72
        );

        for (let gx = bridgeStartX; gx <= bridgeEndX; gx++) {
          for (let gz = -bridgeHalfD; gz <= bridgeHalfD; gz++) {
            addMainCube(gx, bridgeLevel, gz, bridgeColor);
          }
        }
      }

      const radius = Math.sqrt(maxDistSq) + 3.0;
      mainBuildingBounds = {
        cx: mainCx,
        cz: mainCz,
        radius
      };
    })();

    
    const buildingCount = randInt(minBuildings, maxBuildings);
    for (let b = 0; b < buildingCount; b++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < 100) {
        tries++;

        const w = randInt(minFoot, maxFoot);
        const d = randInt(minFoot, maxFoot);
        const h = randInt(minHeight, maxHeight);

        const extent = Math.max(w, d) * cubeSize * gap * 0.5;
        const radius = extent + 2.0;

        const cx = randFloat(-worldRadius, worldRadius);
        const cz = randFloat(-worldRadius, worldRadius);

        let overlap = false;

        
        for (const other of buildingConfigs) {
          if (circlesOverlap(cx, cz, radius, other.cx, other.cz, other.radius)) {
            overlap = true;
            break;
          }
        }
        
        if (!overlap && mainBuildingBounds) {
          if (
            circlesOverlap(
              cx,
              cz,
              radius,
              mainBuildingBounds.cx,
              mainBuildingBounds.cz,
              mainBuildingBounds.radius
            )
          ) {
            overlap = true;
          }
        }
        if (overlap) continue;

        const id = nextGroupId++;
        buildingConfigs.push({ id, w, d, h, cx, cz, radius });
        placed = true;
      }
    }

    
    for (const cfg of buildingConfigs) {
      const { id, w, d, h, cx, cz } = cfg;

      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          for (let z = 0; z < d; z++) {
            const xx = (x - (w - 1) / 2) * cubeSize * gap;
            const yy = cubeSize / 2 + y * cubeSize * gap;
            const zz = (z - (d - 1) / 2) * cubeSize * gap;

            const worldPos = new THREE.Vector3(cx + xx, yy, cz + zz);

            const baseHue = 0.52 + id * 0.07;
            const hue = baseHue + (y / h) * 0.18;
            const color = new THREE.Color().setHSL(
              ((hue % 1) + 1) % 1,
              0.6,
              0.55
            );

            layout.push({
              position: worldPos,
              color,
              buildingId: id,
              kind: "building",
              gridPos: { x, y, z, building: id }
            });
          }
        }
      }
    }

    
    (function createSphereBuildings() {
      const count = randInt(1, 3);

      for (let i = 0; i < count; i++) {
        let placed = false;
        let tries = 0;

        while (!placed && tries < 80) {
          tries++;

          const gridRadius = randInt(3, 5);
          const effectRadius = gridRadius * cubeSize * gap + 3.0;

          const cx = randFloat(-worldRadius, worldRadius);
          const cz = randFloat(-worldRadius, worldRadius);

          let overlap = false;

          
          for (const b of buildingConfigs) {
            if (
              circlesOverlap(cx, cz, effectRadius, b.cx, b.cz, b.radius)
            ) {
              overlap = true;
              break;
            }
          }
          
          if (!overlap && mainBuildingBounds) {
            if (
              circlesOverlap(
                cx,
                cz,
                effectRadius,
                mainBuildingBounds.cx,
                mainBuildingBounds.cz,
                mainBuildingBounds.radius
              )
            ) {
              overlap = true;
            }
          }
          
          if (!overlap) {
            for (const s of sphereBuildings) {
              if (
                circlesOverlap(cx, cz, effectRadius, s.cx, s.cz, s.radius)
              ) {
                overlap = true;
                break;
              }
            }
          }
          if (overlap) continue;

          const id = nextGroupId++;
          sphereBuildings.push({
            cx,
            cz,
            id,
            radius: effectRadius,
            gridRadius
          });
          placed = true;

          const baseHue = (0.1 + Math.random() * 0.15) % 1;
          const maxGy = gridRadius * 2;

          for (let gx = -gridRadius; gx <= gridRadius; gx++) {
            for (let gy = 0; gy <= maxGy; gy++) {
              for (let gz = -gridRadius; gz <= gridRadius; gz++) {
                const dx = gx;
                const dy = gy - gridRadius;
                const dz = gz;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq > gridRadius * gridRadius + 0.4) continue;

                const wx = cx + gx * cubeSize * gap;
                const wy = cubeSize / 2 + gy * cubeSize * gap;
                const wz = cz + gz * cubeSize * gap;

                const t = gy / Math.max(1, maxGy);
                const hue = (baseHue + t * 0.05 + 1) % 1;
                const light = 0.45 + t * 0.2;

                const color = new THREE.Color().setHSL(hue, 0.65, light);

                layout.push({
                  position: new THREE.Vector3(wx, wy, wz),
                  color,
                  buildingId: id,
                  kind: "building",
                  gridPos: { x: gx, y: gy, z: gz, building: id }
                });
              }
            }
          }
        }
      }
    })();

    
    (function createTBuildings() {
      const count = randInt(1, 3);

      for (let i = 0; i < count; i++) {
        let placed = false;
        let tries = 0;

        while (!placed && tries < 80) {
          tries++;

          
          const baseSizeXZ = randInt(5, 7); 
          const halfXZ = Math.floor(baseSizeXZ / 2);
          const pillarHeight = randInt(15, 20);

          
          
          
          
          const crossLength = randInt(15, 20);
          const crossHalfLen = Math.floor(crossLength / 2);
          const crossHeight = randInt(5, 7);
          const crossDepthSize = randInt(5, 7);
          const crossDepthHalf = Math.floor(crossDepthSize / 2);

          const maxHalf = Math.max(halfXZ, crossHalfLen, crossDepthHalf);
          const tRadius = maxHalf * cubeSize * gap + 5.0;

          const cx = randFloat(-worldRadius, worldRadius);
          const cz = randFloat(-worldRadius, worldRadius);

          let overlap = false;

          
          for (const b of buildingConfigs) {
            if (circlesOverlap(cx, cz, tRadius, b.cx, b.cz, b.radius)) {
              overlap = true;
              break;
            }
          }
          
          if (!overlap && mainBuildingBounds) {
            if (
              circlesOverlap(
                cx,
                cz,
                tRadius,
                mainBuildingBounds.cx,
                mainBuildingBounds.cz,
                mainBuildingBounds.radius
              )
            ) {
              overlap = true;
            }
          }
          
          if (!overlap) {
            for (const s of sphereBuildings) {
              if (circlesOverlap(cx, cz, tRadius, s.cx, s.cz, s.radius)) {
                overlap = true;
                break;
              }
            }
          }
          
          if (!overlap) {
            for (const tB of tBuildings) {
              if (circlesOverlap(cx, cz, tRadius, tB.cx, tB.cz, tB.radius)) {
                overlap = true;
                break;
              }
            }
          }

          if (overlap) continue;

          const id = nextGroupId++;
          tBuildings.push({ cx, cz, id, radius: tRadius });
          placed = true;

          const occupied = new Set();
          const baseHue = (0.08 + Math.random() * 0.14) % 1;
          const totalHeight = pillarHeight + crossHeight;

          function addTCube(gx, gy, gz) {
            const key = gx + "," + gy + "," + gz;
            if (occupied.has(key)) return;
            occupied.add(key);

            const wx = cx + gx * cubeSize * gap;
            const wy = cubeSize / 2 + gy * cubeSize * gap;
            const wz = cz + gz * cubeSize * gap;

            const t = gy / Math.max(1, totalHeight);
            const hue = (baseHue + t * 0.06 + 1) % 1;
            const light = 0.5 + t * 0.18;

            const color = new THREE.Color().setHSL(hue, 0.6, light);

            layout.push({
              position: new THREE.Vector3(wx, wy, wz),
              color,
              buildingId: id,
              kind: "building",
              gridPos: { x: gx, y: gy, z: gz, building: id }
            });
          }

          
          for (let gy = 0; gy < pillarHeight; gy++) {
            for (let gx = -halfXZ; gx <= halfXZ; gx++) {
              for (let gz = -halfXZ; gz <= halfXZ; gz++) {
                addTCube(gx, gy, gz);
              }
            }
          }

          
          const crossStartY = pillarHeight;
          const crossEndY = pillarHeight + crossHeight - 1;

          for (let gy = crossStartY; gy <= crossEndY; gy++) {
            for (let gx = -crossHalfLen; gx <= crossHalfLen; gx++) {
              for (let gz = -crossDepthHalf; gz <= crossDepthHalf; gz++) {
                addTCube(gx, gy, gz);
              }
            }
          }
        }
      }
    })();

    
    const treeCount = randInt(minTrees, maxTrees);
    const baseTreeRadius = 2.5;

    for (let t = 0; t < treeCount; t++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < 100) {
        tries++;

        const cx = randFloat(-worldRadius, worldRadius);
        const cz = randFloat(-worldRadius - 5, worldRadius - 5);

        let overlap = false;

        
        for (const b of buildingConfigs) {
          if (circlesOverlap(cx, cz, baseTreeRadius, b.cx, b.cz, b.radius)) {
            overlap = true;
            break;
          }
        }
        
        if (!overlap && mainBuildingBounds) {
          if (
            circlesOverlap(
              cx,
              cz,
              baseTreeRadius,
              mainBuildingBounds.cx,
              mainBuildingBounds.cz,
              mainBuildingBounds.radius
            )
          ) {
            overlap = true;
          }
        }
        
        if (!overlap) {
          for (const s of sphereBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                baseTreeRadius,
                s.cx,
                s.cz,
                s.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        
        if (!overlap) {
          for (const tB of tBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                baseTreeRadius,
                tB.cx,
                tB.cz,
                tB.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        if (overlap) continue;

        
        for (const other of trees) {
          if (
            circlesOverlap(
              cx,
              cz,
              baseTreeRadius,
              other.cx,
              other.cz,
              baseTreeRadius
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        const id = nextGroupId++;
        trees.push({ cx, cz, id });
        placed = true;
      }
    }

    
    for (const tree of trees) {
      const { cx, cz, id } = tree;

      const trunkLevels = randInt(3, 6);
      const leafLevels = randInt(2, 4);
      const leafRadius = randInt(1, 2);

      
      for (let i = 0; i < trunkLevels; i++) {
        const yy = cubeSize / 2 + i * cubeSize;
        const pos = new THREE.Vector3(cx, yy, cz);
        const color = new THREE.Color(0x8b5a2b);

        layout.push({
          position: pos,
          color,
          buildingId: id,
          kind: "tree-trunk",
          gridPos: { x: 0, y: i, z: 0, building: id }
        });
      }

      
      const startY = cubeSize / 2 + trunkLevels * cubeSize;
      for (let ly = 0; ly < leafLevels; ly++) {
        for (let lx = -leafRadius; lx <= leafRadius; lx++) {
          for (let lz = -leafRadius; lz <= leafRadius; lz++) {
            if (Math.abs(lx) + Math.abs(lz) > leafRadius + 1) continue;

            const yy = startY + ly * cubeSize;
            const xx = lx * cubeSize;
            const zz = lz * cubeSize;

            const pos = new THREE.Vector3(cx + xx, yy, cz + zz);
            const color = new THREE.Color(0x2e8b57);

            layout.push({
              position: pos,
              color,
              buildingId: id,
              kind: "tree-leaf",
              gridPos: {
                x: lx,
                y: trunkLevels + ly,
                z: lz,
                building: id
              }
            });
          }
        }
      }
    }

    
    const bushCount = randInt(3, 7);
    const bushRadiusWorld = 1.8;

    for (let i = 0; i < bushCount; i++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < 80) {
        tries++;

        const cx = randFloat(-worldRadius, worldRadius);
        const cz = randFloat(-worldRadius, worldRadius);

        let overlap = false;

        
        for (const b of buildingConfigs) {
          if (circlesOverlap(cx, cz, bushRadiusWorld, b.cx, b.cz, b.radius)) {
            overlap = true;
            break;
          }
        }
        
        if (!overlap && mainBuildingBounds) {
          if (
            circlesOverlap(
              cx,
              cz,
              bushRadiusWorld,
              mainBuildingBounds.cx,
              mainBuildingBounds.cz,
              mainBuildingBounds.radius
            )
          ) {
            overlap = true;
          }
        }
        
        if (!overlap) {
          for (const s of sphereBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                bushRadiusWorld,
                s.cx,
                s.cz,
                s.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        
        if (!overlap) {
          for (const tB of tBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                bushRadiusWorld,
                tB.cx,
                tB.cz,
                tB.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        if (overlap) continue;

        
        for (const t of trees) {
          if (
            circlesOverlap(
              cx,
              cz,
              bushRadiusWorld,
              t.cx,
              t.cz,
              baseTreeRadius
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        
        for (const other of bushes) {
          if (
            circlesOverlap(
              cx,
              cz,
              bushRadiusWorld,
              other.cx,
              other.cz,
              bushRadiusWorld
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        const id = nextGroupId++;
        bushes.push({ cx, cz, id });
        placed = true;
      }
    }

    
    for (const bush of bushes) {
      const { cx, cz, id } = bush;
      const bushLevels = randInt(1, 2);
      const bushRadius = randInt(1, 2);

      const baseY = cubeSize / 2;

      for (let ly = 0; ly < bushLevels; ly++) {
        for (let lx = -bushRadius; lx <= bushRadius; lx++) {
          for (let lz = -bushRadius; lz <= bushRadius; lz++) {
            if (Math.abs(lx) + Math.abs(lz) > bushRadius + 1) continue;

            const yy = baseY + ly * cubeSize;
            const xx = lx * cubeSize;
            const zz = lz * cubeSize;

            const pos = new THREE.Vector3(cx + xx, yy, cz + zz);

            const baseColor = new THREE.Color(0x2f9f5b);
            const hsl = { h: 0, s: 0, l: 0 };
            baseColor.getHSL(hsl);
            const jitter = (Math.random() - 0.5) * 0.15;
            const color = new THREE.Color().setHSL(
              hsl.h,
              hsl.s,
              THREE.MathUtils.clamp(hsl.l + jitter, 0.2, 0.7)
            );

            layout.push({
              position: pos,
              color,
              buildingId: id,
              kind: "bush",
              gridPos: {
                x: lx,
                y: ly,
                z: lz,
                building: id
              }
            });
          }
        }
      }
    }

    
    const stoneCount = randInt(4, 8);
    const stoneRadiusWorld = 1.8;

    for (let i = 0; i < stoneCount; i++) {
      let placed = false;
      let tries = 0;

      while (!placed && tries < 80) {
        tries++;

        const cx = randFloat(-worldRadius, worldRadius);
        const cz = randFloat(-worldRadius, worldRadius);

        let overlap = false;

        
        for (const b of buildingConfigs) {
          if (circlesOverlap(cx, cz, stoneRadiusWorld, b.cx, b.cz, b.radius)) {
            overlap = true;
            break;
          }
        }
        
        if (!overlap && mainBuildingBounds) {
          if (
            circlesOverlap(
              cx,
              cz,
              stoneRadiusWorld,
              mainBuildingBounds.cx,
              mainBuildingBounds.cz,
              mainBuildingBounds.radius
            )
          ) {
            overlap = true;
          }
        }
        
        for (const t of trees) {
          if (
            circlesOverlap(
              cx,
              cz,
              stoneRadiusWorld,
              t.cx,
              t.cz,
              baseTreeRadius
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        for (const b of bushes) {
          if (
            circlesOverlap(
              cx,
              cz,
              stoneRadiusWorld,
              b.cx,
              b.cz,
              bushRadiusWorld
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        
        if (!overlap) {
          for (const s of sphereBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                stoneRadiusWorld,
                s.cx,
                s.cz,
                s.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        
        if (!overlap) {
          for (const tB of tBuildings) {
            if (
              circlesOverlap(
                cx,
                cz,
                stoneRadiusWorld,
                tB.cx,
                tB.cz,
                tB.radius
              )
            ) {
              overlap = true;
              break;
            }
          }
        }
        if (overlap) continue;

        
        for (const other of stonePiles) {
          if (
            circlesOverlap(
              cx,
              cz,
              stoneRadiusWorld,
              other.cx,
              other.cz,
              stoneRadiusWorld
            )
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        const id = nextGroupId++;
        stonePiles.push({ cx, cz, id });
        placed = true;
      }
    }

    
    for (const pile of stonePiles) {
      const { cx, cz, id } = pile;
      const pileRadius = randInt(1, 2);
      const pileLevels = randInt(1, 3);

      const baseY = cubeSize / 2;
      const baseColor = new THREE.Color(0x777777);

      for (let ly = 0; ly < pileLevels; ly++) {
        const layerRadius = Math.max(0, pileRadius - ly);
        for (let lx = -layerRadius; lx <= layerRadius; lx++) {
          for (let lz = -layerRadius; lz <= layerRadius; lz++) {
            if (Math.abs(lx) + Math.abs(lz) > layerRadius + 1) continue;

            const yy = baseY + ly * cubeSize;
            const xx = lx * cubeSize;
            const zz = lz * cubeSize;

            const pos = new THREE.Vector3(cx + xx, yy, cz + zz);

            const hsl = { h: 0, s: 0, l: 0 };
            baseColor.getHSL(hsl);
            const jitter = (Math.random() - 0.5) * 0.12;
            const color = new THREE.Color().setHSL(
              hsl.h,
              THREE.MathUtils.clamp(hsl.s + (Math.random() - 0.5) * 0.1, 0.0, 0.4),
              THREE.MathUtils.clamp(hsl.l + jitter, 0.2, 0.6)
            );

            layout.push({
              position: pos,
              color,
              buildingId: id,
              kind: "stone",
              gridPos: {
                x: lx,
                y: ly,
                z: lz,
                building: id
              }
            });
          }
        }
      }
    }

    
    for (const cfg of buildingConfigs) {
      const lampCount = randInt(0, 2);
      for (let li = 0; li < lampCount; li++) {
        const id = nextGroupId++;

        const angle = randFloat(0, Math.PI * 2);
        const radius = cfg.radius + randFloat(1.5, 4.0);

        const cx = cfg.cx + Math.cos(angle) * radius;
        const cz = cfg.cz + Math.sin(angle) * radius;

        const poleLevels = randInt(2, 4);

        for (let py = 0; py < poleLevels; py++) {
          const yy = cubeSize / 2 + py * cubeSize;
          const pos = new THREE.Vector3(cx, yy, cz);
          const color = new THREE.Color(0x555555);

          layout.push({
            position: pos,
            color,
            buildingId: id,
            kind: "lamp-post",
            gridPos: {
              x: 0,
              y: py,
              z: 0,
              building: id
            }
          });
        }

        const lampY = cubeSize / 2 + poleLevels * cubeSize;
        const lampPos = new THREE.Vector3(cx, lampY, cz);
        const lampColor = new THREE.Color(0xffee88);

        layout.push({
          position: lampPos,
          color: lampColor,
          buildingId: id,
          kind: "lamp-post",
          gridPos: {
            x: 0,
            y: poleLevels,
            z: 0,
            building: id
          }
        });
      }
    }

    
    if (mainBuildingBounds) {
      const mainLampCount = randInt(2, 4);
      for (let i = 0; i < mainLampCount; i++) {
        const id = nextGroupId++;

        const angle = randFloat(0, Math.PI * 2);
        const radius = mainBuildingBounds.radius + randFloat(1.5, 4.5);

        const cx = mainBuildingBounds.cx + Math.cos(angle) * radius;
        const cz = mainBuildingBounds.cz + Math.sin(angle) * radius;

        const poleLevels = randInt(3, 5);

        for (let py = 0; py < poleLevels; py++) {
          const yy = cubeSize / 2 + py * cubeSize;
          const pos = new THREE.Vector3(cx, yy, cz);
          const color = new THREE.Color(0x555555);

          layout.push({
            position: pos,
            color,
            buildingId: id,
            kind: "lamp-post",
            gridPos: {
              x: 0,
              y: py,
              z: 0,
              building: id
            }
          });
        }

        const lampY = cubeSize / 2 + poleLevels * cubeSize;
        const lampPos = new THREE.Vector3(cx, lampY, cz);
        const lampColor = new THREE.Color(0xfff5aa);

        layout.push({
          position: lampPos,
          color: lampColor,
          buildingId: id,
          kind: "lamp-post",
          gridPos: {
            x: 0,
            y: poleLevels,
            z: 0,
            building: id
          }
        });
      }
    }

    
        
    (function createClouds() {
      const cloudCount = randInt(3, 6);

      
      
      const cloudBaseHeight = maxHeight + 12;

      for (let i = 0; i < cloudCount; i++) {
        const id = nextGroupId++;

        
        const cx = randFloat(-worldRadius * 0.9, worldRadius * 0.9);
        const cz = randFloat(-worldRadius * 0.9, worldRadius * 0.9);

        
        const w = randInt(7, 11); 
        const d = randInt(4, 7);  
        const h = randInt(2, 3);  

        
        const localBaseY = cloudBaseHeight + randFloat(-2, 2);

        for (let gx = 0; gx < w; gx++) {
          for (let gy = 0; gy < h; gy++) {
            for (let gz = 0; gz < d; gz++) {
              
              const isEdge =
                gx === 0 || gx === w - 1 ||
                gz === 0 || gz === d - 1 ||
                gy === h - 1;

              if (isEdge && Math.random() < 0.5) continue;

              const wx = cx + (gx - (w - 1) / 2) * cubeSize * gap;
              const wy = localBaseY + gy * cubeSize;
              const wz = cz + (gz - (d - 1) / 2) * cubeSize * gap;

              
              const useGray = Math.random() < 0.4;
              const baseColor = useGray
                ? new THREE.Color(0xdddddd)
                : new THREE.Color(0xffffff);

              const hsl = { h: 0, s: 0, l: 0 };
              baseColor.getHSL(hsl);
              const jitter = (Math.random() - 0.5) * 0.08;
              const color = new THREE.Color().setHSL(
                hsl.h,
                hsl.s,
                THREE.MathUtils.clamp(hsl.l + jitter, 0.75, 1.0)
              );

              layout.push({
                position: new THREE.Vector3(wx, wy, wz),
                color,
                buildingId: id,
                kind: "cloud",
                gridPos: {
                  x: gx,
                  y: gy,
                  z: gz,
                  building: id
                }
              });
            }
          }
        }
      }
    })();



    return layout;
  }

  window.WorldGenerator = {
    generateLayout
  };
})();
