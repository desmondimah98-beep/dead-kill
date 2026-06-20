// player.js — first-person controller: movement, mouse-look, weapon, ammo, reload, health, stamina.
// Exposes window.Player constructor.

(() => {
  'use strict';

  const WEAPON = {
    name: 'PISTOL',
    magSize: 12,
    reserveMax: 84,
    fireRate: 0.22,      // seconds between shots
    reloadTime: 1.4,
    damage: 34,
    range: 80,
    spread: 0.012,
  };

  function Player(camera, domElement, world){
    const self = this;

    self.camera = camera;
    self.dom = domElement;
    self.world = world;

    self.position = world.playerStart.clone();
    self.velocity = new THREE.Vector3();
    self.yaw = Math.PI; // facing -Z (toward the spawn line / zombies)
    self.pitch = 0;

    self.height = 1.7;
    self.radius = 0.4;
    self.moveSpeed = 4.6;
    self.sprintMult = 1.6;
    self.jumpVelocity = 6.2;
    self.gravity = -16;
    self.onGround = true;
    self.vy = 0;

    self.health = 100;
    self.maxHealth = 100;
    self.stamina = 100;
    self.maxStamina = 100;
    self.alive = true;

    self.weapon = Object.assign({}, WEAPON);
    self.ammoInMag = self.weapon.magSize;
    self.ammoReserve = self.weapon.reserveMax;
    self.reloading = false;
    self.reloadT = 0;
    self.fireCooldown = 0;

    self.keys = {};
    self.pointerLocked = false;
    self.mouseDown = false;

    // ---------- Input: keyboard ----------
    window.addEventListener('keydown', (e) => {
      self.keys[e.code] = true;
      if (e.code === 'KeyR') self.startReload();
    });
    window.addEventListener('keyup', (e) => { self.keys[e.code] = false; });

    // ---------- Input: mouse look via pointer lock ----------
    domElement.addEventListener('click', () => {
      if (!self.pointerLocked && self.alive) domElement.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      self.pointerLocked = document.pointerLockElement === domElement;
      if (self.onLockChange) self.onLockChange(self.pointerLocked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!self.pointerLocked) return;
      const sens = 0.0022;
      self.yaw -= e.movementX * sens;
      self.pitch -= e.movementY * sens;
      self.pitch = Math.max(-1.3, Math.min(1.3, self.pitch));
    });
    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) self.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) self.mouseDown = false;
    });

    // ---------- Touch controls (mobile) ----------
    self.touchMove = { active:false, dx:0, dy:0 };
    self.touchFiring = false;
    self.touchLookDelta = { x:0, y:0 };

    // ---------- Reload ----------
    self.startReload = function(){
      if (self.reloading || self.ammoInMag >= self.weapon.magSize || self.ammoReserve <= 0 || !self.alive) return;
      self.reloading = true;
      self.reloadT = self.weapon.reloadTime;
      if (self.onReloadStart) self.onReloadStart();
    };

    self.finishReload = function(){
      const needed = self.weapon.magSize - self.ammoInMag;
      const take = Math.min(needed, self.ammoReserve);
      self.ammoInMag += take;
      self.ammoReserve -= take;
      self.reloading = false;
      if (self.onReloadEnd) self.onReloadEnd();
    };

    // ---------- Firing ----------
    self.tryFire = function(){
      if (!self.alive || self.reloading || self.fireCooldown > 0) return false;
      if (self.ammoInMag <= 0){
        if (self.onDryFire) self.onDryFire();
        return false;
      }
      self.ammoInMag--;
      self.fireCooldown = self.weapon.fireRate;
      return true;
    };

    // ---------- Damage ----------
    self.takeDamage = function(amount){
      if (!self.alive) return;
      self.health = Math.max(0, self.health - amount);
      if (self.onDamage) self.onDamage(amount);
      if (self.health <= 0){
        self.alive = false;
        if (self.onDeath) self.onDeath();
      }
    };

    self.heal = function(amount){
      self.health = Math.min(self.maxHealth, self.health + amount);
    };

    // ---------- Collision helper ----------
    function resolveColliders(pos){
      for (const c of world.colliders){
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz);
        const minDist = c.radius + self.radius;
        if (dist < minDist && dist > 0.0001){
          const push = (minDist - dist);
          pos.x += (dx/dist) * push;
          pos.z += (dz/dist) * push;
        }
      }
    }

    // ---------- Update ----------
    self.update = function(dt, joystickVec){
      if (self.fireCooldown > 0) self.fireCooldown -= dt;

      if (self.reloading){
        self.reloadT -= dt;
        if (self.reloadT <= 0) self.finishReload();
      }

      if (self.alive){
        // movement input
        let mx = 0, mz = 0;
        if (self.keys['KeyW']) mz -= 1;
        if (self.keys['KeyS']) mz += 1;
        if (self.keys['KeyA']) mx -= 1;
        if (self.keys['KeyD']) mx += 1;
        if (joystickVec){ mx += joystickVec.x; mz += joystickVec.y; }

        const movingInput = Math.hypot(mx, mz) > 0.001;
        const sprinting = (self.keys['ShiftLeft'] || self.keys['ShiftRight']) && self.stamina > 2 && movingInput;

        if (sprinting){
          self.stamina = Math.max(0, self.stamina - dt * 26);
        } else {
          self.stamina = Math.min(self.maxStamina, self.stamina + dt * 14);
        }

        if (movingInput){
          const len = Math.hypot(mx, mz);
          mx /= len; mz /= len;
          const speed = self.moveSpeed * (sprinting ? self.sprintMult : 1);
          // movement relative to yaw
          const sinY = Math.sin(self.yaw), cosY = Math.cos(self.yaw);
          const worldX = (mx * cosY - mz * sinY) * speed;
          const worldZ = (mx * sinY + mz * cosY) * speed;
          self.position.x += worldX * dt;
          self.position.z += worldZ * dt;
        }

        // jump
        if (self.keys['Space'] && self.onGround){
          self.vy = self.jumpVelocity;
          self.onGround = false;
        }
        self.vy += self.gravity * dt;
        self.position.y += self.vy * dt;
        if (self.position.y <= self.height){
          self.position.y = self.height;
          self.vy = 0;
          self.onGround = true;
        }

        // arena bounds clamp
        const b = world.arenaBounds;
        self.position.x = Math.max(b.minX, Math.min(b.maxX, self.position.x));
        self.position.z = Math.max(b.minZ, Math.min(b.maxZ, self.position.z));

        // barricade collision (soft block from in front, can't walk through)
        resolveColliders(self.position);

        // firing (mouse held or touch)
        if ((self.mouseDown && self.pointerLocked) || self.touchFiring){
          if (self.tryFire() && self.onShoot) self.onShoot();
        }
      }

      // camera sync
      self.camera.position.copy(self.position);
      self.camera.rotation.set(0,0,0);
      self.camera.rotateY(self.yaw);
      self.camera.rotateX(self.pitch);
    };

    self.getShootRay = function(){
      const dir = new THREE.Vector3();
      self.camera.getWorldDirection(dir);
      // apply small spread
      dir.x += (Math.random()-0.5) * self.weapon.spread;
      dir.y += (Math.random()-0.5) * self.weapon.spread;
      dir.z += (Math.random()-0.5) * self.weapon.spread;
      dir.normalize();
      return { origin: self.camera.position.clone(), dir };
    };
  }

  window.Player = Player;
})();
