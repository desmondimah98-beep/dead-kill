// zombies.js — zombie model, AI (walk toward player/barricade, attack), wave spawning, hit/death FX.
// Exposes window.ZombieManager constructor.

(() => {
  'use strict';

  const skinTones = [0x5e6b4f, 0x6b5e4f, 0x4f5e6b, 0x6b4f55, 0x5a5a4a];

  function buildZombieMesh(){
    const group = new THREE.Group();
    const tone = skinTones[Math.floor(Math.random()*skinTones.length)];
    const skinMat = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95, metalness: 0.0 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x2c2a24, roughness: 1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1 });

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), clothMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), skinMat);
    head.position.y = 1.68;
    head.castShadow = true;
    head.name = 'head';
    group.add(head);

    // jaw detail (slightly offset box for gnarled look)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.08,0.12), darkMat);
    jaw.position.set(0, 1.58, 0.14);
    group.add(jaw);

    // arms (slightly raised, reaching)
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.55, 4, 6);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.36, 1.2, 0.05);
    armL.rotation.z = 0.5;
    armL.rotation.x = -0.3;
    armL.castShadow = true;
    armL.name = 'armL';
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.36, 1.2, 0.05);
    armR.rotation.z = -0.5;
    armR.rotation.x = -0.3;
    armR.castShadow = true;
    armR.name = 'armR';
    group.add(armR);

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 6);
    const legL = new THREE.Mesh(legGeo, clothMat);
    legL.position.set(-0.15, 0.5, 0);
    legL.castShadow = true;
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, clothMat);
    legR.position.set(0.15, 0.5, 0);
    legR.castShadow = true;
    legR.name = 'legR';
    group.add(legR);

    group.userData.head = head;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.armL = armL;
    group.userData.armR = armR;

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
        const headPos = new THREE.Vector3(z.x, 1.68, z.z);
        const headDist = raySphereDist(origin, dir, headPos, 0.26);
        if (headDist !== null && headDist < closestDist){
          closestDist = headDist; closest = z; headshot = true;
        }
        const bodyPos = new THREE.Vector3(z.x, 1.1, z.z);
        const bodyDist = raySphereDist(origin, dir, bodyPos, 0.42);
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
