// world.js — builds the ruined city street arena: ground, barricade, debris, lighting, fog.
// Exposes window.World with .scene, .colliders (for zombie pathing bounds), .spawnPoints

(() => {
  'use strict';

  function buildWorld(){
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fc7ec); // bright daytime sky blue
    scene.fog = new THREE.FogExp2(0xb8d8ec, 0.006); // light atmospheric haze, long visibility

    // ---------- Lighting (daylight) ----------
    const hemi = new THREE.HemisphereLight(0xbfe0f5, 0x6b6450, 0.9); // sky blue / ground bounce
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-35, 55, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // soft fill light from opposite side to reduce harsh shadow blackness
    const fill = new THREE.DirectionalLight(0xcfe8ff, 0.4);
    fill.position.set(25, 20, 25);
    scene.add(fill);

    // ambient lamp left in place but off during daytime (unused visually, kept for compat)
    const lampLight = new THREE.PointLight(0xffaa55, 0, 18, 2);
    lampLight.position.set(0, 6.2, -2);
    scene.add(lampLight);

    // ---------- Materials (brighter, daylight-appropriate) ----------
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.92, metalness: 0.05 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.85, metalness: 0.0 });
    const concreteDarkMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.9 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x8a5f3a, roughness: 0.75, metalness: 0.25 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4530, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.45, metalness: 0.65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc9d9, roughness: 0.1, metalness: 0.2, transparent:true, opacity:0.45 });
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x9c8f63, roughness: 1 });

    const colliders = []; // {x,z,radius} simple cylinder colliders for zombie/player blocking

    // ---------- Ground (street) ----------
    const groundGeo = new THREE.PlaneGeometry(60, 140, 1, 1);
    const ground = new THREE.Mesh(groundGeo, asphaltMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // sidewalk strips
    [-1, 1].forEach(side => {
      const walkGeo = new THREE.BoxGeometry(6, 0.3, 140);
      const walk = new THREE.Mesh(walkGeo, concreteMat);
      walk.position.set(side * 16, 0.15, 0);
      walk.receiveShadow = true;
      walk.castShadow = false;
      scene.add(walk);
    });

    // street cracks / damage decals (simple dark patches via flat boxes)
    for (let i = 0; i < 14; i++){
      const w = 1 + Math.random() * 3;
      const patchGeo = new THREE.PlaneGeometry(w, w * 0.6);
      const patch = new THREE.Mesh(patchGeo, concreteDarkMat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = Math.random() * Math.PI;
      patch.position.set((Math.random()-0.5)*22, 0.01, -10 - Math.random()*100);
      scene.add(patch);
    }

    // ---------- Buildings lining the street ----------
    function makeBuilding(x, z, w, h, d, mat){
      const geo = new THREE.BoxGeometry(w, h, d);
      const b = new THREE.Mesh(geo, mat);
      b.position.set(x, h/2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      // window strips: daylight glass reflecting sky, some broken/dark
      const winMat = Math.random() > 0.25
        ? new THREE.MeshStandardMaterial({ color: 0x7fb8d4, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.55 })
        : new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.7 }); // broken/boarded window
      for (let row = 0; row < Math.floor(h/4); row++){
        const winGeo = new THREE.PlaneGeometry(w*0.7, 1.1);
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(x, 3 + row*4, z + (z < 0 ? d/2 + 0.05 : -d/2 - 0.05));
        if (z >= 0) win.rotation.y = Math.PI;
        scene.add(win);
      }
      colliders.push({ x, z, radius: Math.max(w,d)/2 + 0.5 });
    }

    const buildingMats = [concreteMat, concreteDarkMat, rustMat];
    for (let i = 0; i < 9; i++){
      const z = -8 - i * 14;
      const hL = 10 + Math.random()*14;
      const hR = 10 + Math.random()*14;
      makeBuilding(-22, z, 10, hL, 12, buildingMats[i % 3]);
      makeBuilding(22, z, 10, hR, 12, buildingMats[(i+1) % 3]);
    }

    // ---------- Abandoned cars scattered down the street ----------
    function makeCar(x, z, rotY, color){
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 4.2), bodyMat);
      body.position.y = 0.75;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.2), glassMat);
      cabin.position.set(0, 1.5, -0.2);
      group.add(cabin);
      [[-0.9,0.35,1.4],[0.9,0.35,1.4],[-0.9,0.35,-1.4],[0.9,0.35,-1.4]].forEach(p => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.3,12), new THREE.MeshStandardMaterial({color:0x111111, roughness:0.9}));
        wheel.rotation.z = Math.PI/2;
        wheel.position.set(p[0], p[1], p[2]);
        wheel.castShadow = true;
        group.add(wheel);
      });
      group.position.set(x, 0, z);
      group.rotation.y = rotY;
      scene.add(group);
      colliders.push({ x, z, radius: 2.4 });
    }
    const carColors = [0x2a3a2a, 0x3a2a2a, 0x26262e, 0x3a3326];
    const carSpots = [
      [-9, -16, 0.15], [10, -28, -0.3], [-7, -42, 0.4], [8, -58, 0.1],
      [-11, -74, -0.2], [6, -90, 0.25], [-8, -106, 0.0]
    ];
    carSpots.forEach((c, i) => makeCar(c[0], c[1], c[2], carColors[i % carColors.length]));

    // ---------- Street debris / rubble piles ----------
    function makeRubble(x, z){
      const group = new THREE.Group();
      const n = 4 + Math.floor(Math.random()*4);
      for (let i = 0; i < n; i++){
        const s = 0.4 + Math.random()*0.8;
        const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), concreteDarkMat);
        chunk.position.set((Math.random()-0.5)*2, s*0.4, (Math.random()-0.5)*2);
        chunk.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        chunk.castShadow = true;
        chunk.receiveShadow = true;
        group.add(chunk);
      }
      group.position.set(x, 0, z);
      scene.add(group);
      colliders.push({ x, z, radius: 1.6 });
    }
    for (let i = 0; i < 8; i++){
      makeRubble((Math.random()-0.5)*24, -14 - Math.random()*100);
    }

    // ---------- Streetlamps (dormant in daylight - off, just structural detail) ----------
    function makeLamp(x, z){
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,6,8), metalMat);
      pole.position.y = 3;
      pole.castShadow = true;
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.08,0.08), metalMat);
      arm.position.set(0.4, 5.9, 0);
      group.add(arm);
      const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5, metalness: 0.4 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), headMat);
      head.position.set(0.8, 5.85, 0);
      head.castShadow = true;
      group.add(head);
      group.position.set(x, 0, z);
      scene.add(group);
      colliders.push({ x, z, radius: 0.4 });
    }
    for (let i = 0; i < 6; i++){
      const z = -4 - i * 20;
      makeLamp(-14, z);
      makeLamp(14, z + 10);
    }

    // ---------- THE BARRICADE (player's defensive position, faces -Z where zombies come from) ----------
    const barricadeGroup = new THREE.Group();
    // sandbag wall sections
    for (let row = 0; row < 2; row++){
      for (let i = -3; i <= 3; i++){
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), sandbagMat);
        bag.scale.set(1.3, 0.8, 0.9);
        bag.position.set(i * 0.85, 0.35 + row*0.55, -1 + (i%2===0?0.15:-0.1));
        bag.rotation.y = Math.random();
        bag.castShadow = true;
        bag.receiveShadow = true;
        barricadeGroup.add(bag);
      }
    }
    // wood/metal cross supports
    for (let i = -2; i <= 2; i += 2){
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), woodMat);
      plank.position.set(i, 1.1, -1);
      plank.rotation.z = 0.15;
      plank.castShadow = true;
      barricadeGroup.add(plank);
    }
    const wireGeo = new THREE.TorusGeometry(0.5, 0.04, 6, 12);
    for (let i = -2.5; i <= 2.5; i += 1.6){
      const wire = new THREE.Mesh(wireGeo, metalMat);
      wire.position.set(i, 1.5, -1.3);
      wire.rotation.x = Math.PI/2.4;
      wire.scale.set(1, 0.6, 1);
      barricadeGroup.add(wire);
    }
    barricadeGroup.position.set(0, 0, -3);
    scene.add(barricadeGroup);
    colliders.push({ x: -2.5, z: -3, radius: 0.9 });
    colliders.push({ x: 0, z: -3, radius: 0.9 });
    colliders.push({ x: 2.5, z: -3, radius: 0.9 });

    // chain-link / wreckage gate visual far down the street (zombie spawn dressing)
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.85 });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 0.3), gateMat);
    gate.position.set(0, 2.5, -118);
    gate.castShadow = true;
    scene.add(gate);

    // ---------- Ambient atmosphere: drifting smoke planes ----------
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.1, depthWrite: false });
    const smokeMeshes = [];
    for (let i = 0; i < 6; i++){
      const smoke = new THREE.Mesh(new THREE.PlaneGeometry(8 + Math.random()*6, 5 + Math.random()*4), smokeMat);
      smoke.position.set((Math.random()-0.5)*20, 2 + Math.random()*3, -10 - Math.random()*100);
      smoke.rotation.y = Math.random()*Math.PI;
      scene.add(smoke);
      smokeMeshes.push(smoke);
    }

    return {
      scene,
      colliders,
      lampLight,
      smokeMeshes,
      playerStart: new THREE.Vector3(0, 1.7, 4),
      barricadeZ: -3,
      arenaBounds: { minX: -15, maxX: 15, minZ: -14, maxZ: 12 },
      spawnLine: { z: -34, xMin: -13, xMax: 13 }, // zombies spawn beyond this and walk toward barricade
    };
  }

  window.World = { build: buildWorld };
})();
