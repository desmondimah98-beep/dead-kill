// zombies.js — zombie model, AI (walk toward player/barricade, attack), wave spawning, hit/death FX.
// Exposes window.ZombieManager constructor.

(() => {
  'use strict';

  const skinTones = [0x6b7a5a, 0x7a6b5a, 0x5a6b7a, 0x7a5a62, 0x6a6a58, 0x7a7064];
  const clothTones = [0x2c2a24, 0x33302a, 0x2a2e30, 0x352a28, 0x2e2c24];
  const woundMat = new THREE.MeshStandardMaterial({ color: 0x6b1418, roughness: 0.9, metalness: 0.0 });

  function buildZombieMesh(){
    const group = new THREE.Group();
    const tone = skinTones[Math.floor(Math.random()*skinTones.length)];
    const clothTone = clothTones[Math.floor(Math.random()*clothTones.length)];
    const skinMat = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.92, metalness: 0.0 });
    const skinDarkMat = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95, metalness: 0.0 });
    skinDarkMat.color.multiplyScalar(0.72);
    const clothMat = new THREE.MeshStandardMaterial({ color: clothTone, roughness: 0.95 });
    const clothTornMat = new THREE.MeshStandardMaterial({ color: clothTone, roughness: 1 });
    clothTornMat.color.multiplyScalar(0.6);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd8c870, roughness: 0.4, emissive: 0x332200, emissiveIntensity: 0.15 });

    const heightScale = 0.92 + Math.random() * 0.2; // body variety
    group.scale.set(heightScale, heightScale, heightScale);

    // ---------- Pelvis / hip anchor ----------
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.26), clothMat);
    hips.position.y = 0.88;
    hips.castShadow = true;
    group.add(hips);

    // ---------- Torso (two segments: lower/upper for a slight hunch) ----------
    const torsoLower = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.28), clothMat);
    torsoLower.position.set(0, 1.08, 0.01);
    torsoLower.castShadow = true;
    group.add(torsoLower);

    const torsoUpper = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.4, 0.3), clothMat);
    torsoUpper.position.set(0, 1.4, -0.02);
    torsoUpper.rotation.x = 0.12; // hunch forward
    torsoUpper.castShadow = true;
    group.add(torsoUpper);

    // torn clothing strip detail on torso
    for (let i = 0; i < 2; i++){
      const tear = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random()*0.08, 0.18, 0.04), clothTornMat);
      tear.position.set((Math.random()-0.5)*0.35, 1.25 + Math.random()*0.25, 0.16);
      tear.rotation.z = (Math.random()-0.5)*0.6;
      group.add(tear);
    }
    // exposed wound patch on torso (gore detail)
    if (Math.random() > 0.4){
      const wound = new THREE.Mesh(new THREE.CircleGeometry(0.07 + Math.random()*0.05, 8), woundMat);
      wound.position.set((Math.random()-0.5)*0.25, 1.3 + Math.random()*0.2, 0.165);
      group.add(wound);
    }

    // ---------- Neck + Head ----------
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skinDarkMat);
    neck.position.set(0, 1.62, 0.02);
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
    head.position.set(0, 1.76, 0.03);
    head.scale.set(0.92, 1.05, 0.95);
    head.castShadow = true;
    head.name = 'head';
    group.add(head);

    // cranium damage detail (some zombies have visible skull/wound on head)
    if (Math.random() > 0.55){
      const skullPatch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({color:0xc8c0a8, roughness:0.8}));
        skullPatch.position.set((Math.random()-0.5)*0.1, 1.85, -0.05);
        skullPatch.scale.set(1, 0.6, 0.8);
        group.add(skullPatch);
    }

    // jaw (offset down/forward, gnarled open-mouth look)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.09), skinDarkMat);
    jaw.position.set(0, 1.695, 0.1);
    jaw.rotation.x = 0.35;
    group.add(jaw);

    // eyes (small emissive dots for a sickly glint)
    [-1, 1].forEach(side => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
      eye.position.set(side * 0.065, 1.78, 0.16);
      group.add(eye);
    });

    // ---------- Arms: upper arm + forearm with elbow joint ----------
    function buildArm(side){
      const armGroup = new THREE.Group();
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 7), skinMat);
      upperArm.position.set(0, -0.16, 0);
      upperArm.castShadow = true;
      armGroup.add(upperArm);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.052, 7, 6), skinMat);
      elbow.position.set(0, -0.32, 0);
      armGroup.add(elbow);

      const forearmGroup = new THREE.Group();
      forearmGroup.position.set(0, -0.32, 0);
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 7), skinDarkMat);
      forearm.position.set(0, -0.15, 0.04);
      forearm.rotation.x = -0.4; // bent forward, reaching
      forearm.castShadow = true;
      forearmGroup.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), skinDarkMat);
      hand.position.set(0, -0.28, 0.16);
      hand.scale.set(0.9, 0.7, 1.1);
      forearmGroup.add(hand);

      armGroup.add(forearmGroup);
      armGroup.position.set(side * 0.29, 1.46, 0);
      armGroup.rotation.z = side * 0.45;
      armGroup.name = side < 0 ? 'armL' : 'armR';
      return armGroup;
    }
    const armL = buildArm(-1);
    const armR = buildArm(1);
    group.add(armL, armR);

    // ---------- Legs: thigh + shin with knee ----------
    function buildLeg(side){
      const legGroup = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.36, 7), clothMat);
      thigh.position.set(0, -0.18, 0);
      thigh.castShadow = true;
      legGroup.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 6), clothMat);
      knee.position.set(0, -0.36, 0);
      legGroup.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.34, 7), skinDarkMat);
      shin.position.set(0, -0.53, 0.01);
      shin.castShadow = true;
      legGroup.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), darkMat);
      foot.position.set(0, -0.71, 0.05);
      legGroup.add(foot);

      legGroup.position.set(side * 0.13, 0.88, 0);
      legGroup.name = side < 0 ? 'legL' : 'legR';
      return legGroup;
    }
    const legL = buildLeg(-1);
    const legR = buildLeg(1);
    group.add(legL, legR);

    group.userData.head = head;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.heightScale = heightScale;

    return group;
  }

  function ZombieManager(scene, world){
    const self = this;
    self.scene = scene;
    self.world = world;
    self.zombies = [];
    self.wave = 0;
    self.kills = 0;
    self.waveInProgress = false;
    self.spawnQueue = 0;
    self.spawnTimer = 0;
    self.waveBreakTimer = 0;
    self.onZombieKilled = null;
    self.onWaveStart = null;
    self.onWaveClear = null;
    self.onPlayerHit = null;

    function zombieStatsForWave(wave){
      return {
        speed: 1.1 + Math.min(1.6, wave * 0.07) + Math.random()*0.3,
        health: 60 + wave * 9,
        damage: 8 + Math.min(14, wave * 0.6),
        attackRange: 1.1,
        attackCooldown: 1.0,
      };
    }

    self.startWave = function(waveNum){
      self.wave = waveNum;
      self.spawnQueue = 4 + Math.floor(waveNum * 1.8);
      self.spawnTimer = 0;
      self.waveInProgress = true;
      if (self.onWaveStart) self.onWaveStart(waveNum, self.spawnQueue);
    };

    function spawnZombie(){
      const line = world.spawnLine;
      const x = line.xMin + Math.random() * (line.xMax - line.xMin);
      const z = line.z - Math.random() * 6;
      const mesh = buildZombieMesh();
      mesh.position.set(x, 0, z);
      scene.add(mesh);

      const stats = zombieStatsForWave(self.wave);
      self.zombies.push({
        mesh,
        x, z,
        health: stats.health,
        maxHealth: stats.health,
        speed: stats.speed,
        damage: stats.damage,
        attackRange: stats.attackRange,
        attackCooldown: stats.attackCooldown,
        attackT: Math.random()*0.5,
        alive: true,
        walkPhase: Math.random()*10,
        dying: false,
        deathT: 0,
      });
    }

    self.damageZombie = function(zombie, amount, headshot){
      if (!zombie.alive) return;
      zombie.health -= amount * (headshot ? 2.2 : 1);
      if (zombie.health <= 0 && !zombie.dying){
        zombie.dying = true;
        zombie.deathT = 0;
        self.kills++;
        if (self.onZombieKilled) self.onZombieKilled(self.kills, headshot);
      }
    };

    // raycast-based hit detection used by game.js on fire
    self.raycastZombies = function(origin, dir, maxRange){
      let closest = null;
      let closestDist = maxRange;
      let headshot = false;
      for (const z of self.zombies){
        if (!z.alive || z.dying) continue;
        // approximate zombie as a vertical capsule: test head sphere + body cylinder
        const headPos = new THREE.Vector3(z.x, 1.76, z.z);
        const headDist = raySphereDist(origin, dir, headPos, 0.22);
        if (headDist !== null && headDist < closestDist){
          closestDist = headDist; closest = z; headshot = true;
        }
        const bodyPos = new THREE.Vector3(z.x, 1.25, z.z);
        const bodyDist = raySphereDist(origin, dir, bodyPos, 0.36);
        if (bodyDist !== null && bodyDist < closestDist){
          closestDist = bodyDist; closest = z; headshot = false;
        }
      }
      return closest ? { zombie: closest, dist: closestDist, headshot } : null;
    };

    function raySphereDist(origin, dir, center, radius){
      const oc = origin.clone().sub(center);
      const b = oc.dot(dir);
      const c = oc.dot(oc) - radius*radius;
      const disc = b*b - c;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      return t > 0 ? t : null;
    }

    self.update = function(dt, playerPos, onPlayerDamage){
      // spawning
      if (self.waveInProgress && self.spawnQueue > 0){
        self.spawnTimer -= dt;
        if (self.spawnTimer <= 0){
          spawnZombie();
          self.spawnQueue--;
          self.spawnTimer = 0.55 + Math.random()*0.5;
        }
      }

      let aliveCount = 0;
      for (const z of self.zombies){
        if (z.dying){
          z.deathT += dt;
          // collapse animation
          z.mesh.rotation.x = Math.min(Math.PI/2, z.deathT * 4);
          z.mesh.position.y = Math.max(-0.3, z.mesh.position.y - dt*1.2);
          z.mesh.scale.y = Math.max(0.3, 1 - z.deathT*0.6);
          if (z.deathT > 1.4 && z.alive){
            z.alive = false;
            scene.remove(z.mesh);
          }
          continue;
        }
        if (!z.alive) continue;
        aliveCount++;

        // move toward player (but stop at attack range)
        const dx = playerPos.x - z.x;
        const dz = playerPos.z - z.z;
        const dist = Math.hypot(dx, dz);

        if (dist > z.attackRange){
          const nx = dx/dist, nz = dz/dist;
          z.x += nx * z.speed * dt;
          z.z += nz * z.speed * dt;
          z.mesh.rotation.y = Math.atan2(nx, nz);
          // simple walk bob/limb swing
          z.walkPhase += dt * z.speed * 3.2;
          const swing = Math.sin(z.walkPhase) * 0.5;
          if (z.mesh.userData.legL) z.mesh.userData.legL.rotation.x = swing;
          if (z.mesh.userData.legR) z.mesh.userData.legR.rotation.x = -swing;
          z.mesh.position.y = Math.abs(Math.sin(z.walkPhase*2)) * 0.04;
        } else {
          z.attackT -= dt;
          if (z.attackT <= 0){
            z.attackT = z.attackCooldown;
            if (onPlayerDamage) onPlayerDamage(z.damage);
            // lunge animation
            if (z.mesh.userData.armL) z.mesh.userData.armL.rotation.x = -1.1;
            if (z.mesh.userData.armR) z.mesh.userData.armR.rotation.x = -1.1;
            setTimeout(() => {
              if (z.mesh.userData.armL) z.mesh.userData.armL.rotation.x = -0.3;
              if (z.mesh.userData.armR) z.mesh.userData.armR.rotation.x = -0.3;
            }, 200);
          }
        }
        z.mesh.position.x = z.x;
        z.mesh.position.z = z.z;
      }

      // cleanup fully-removed zombies from array occasionally
      if (self.zombies.length > 0 && self.zombies.every(z => !z.alive)){
        // wave clear check happens in game.js via aliveCount==0 && spawnQueue==0
      }

      const waveComplete = self.waveInProgress && self.spawnQueue === 0 && aliveCount === 0;
      if (waveComplete){
        self.waveInProgress = false;
        self.zombies = self.zombies.filter(z => z.alive);
        if (self.onWaveClear) self.onWaveClear(self.wave, self.kills);
      }

      return { aliveCount, waveComplete };
    };
  }

  window.ZombieManager = ZombieManager;
})();
