// game.js — orchestrates renderer, game loop, HUD updates, screen transitions, weapon FX.

(() => {
  'use strict';

  // ---------- DOM refs ----------
  const screens = {
    start: document.getElementById('screen-start'),
    game: document.getElementById('screen-game'),
    over: document.getElementById('screen-over'),
    loading: document.getElementById('screen-loading'),
  };
  const canvas = document.getElementById('game-canvas');
  const bestWaveDisplay = document.getElementById('best-wave-display');
  const bestKillsDisplay = document.getElementById('best-kills-display');
  const waveBanner = document.getElementById('wave-banner');
  const killsDisplay = document.getElementById('kills-display');
  const healthFill = document.getElementById('health-fill');
  const staminaFill = document.getElementById('stamina-fill');
  const ammoCurrent = document.getElementById('ammo-current');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const waveClearBanner = document.getElementById('wave-clear-banner');
  const waveClearSub = document.getElementById('wave-clear-sub');
  const reloadIndicator = document.getElementById('reload-indicator');
  const damageVignette = document.getElementById('damage-vignette');
  const hitmarker = document.getElementById('hitmarker');
  const lockPrompt = document.getElementById('lock-prompt');
  const finalWave = document.getElementById('final-wave');
  const finalKills = document.getElementById('final-kills');
  const overCause = document.getElementById('over-cause');
  const newBestMsg = document.getElementById('new-best-msg');
  const touchControls = document.getElementById('touch-controls');
  const touchJoystick = document.getElementById('touch-joystick');
  const joystickKnob = document.getElementById('joystick-knob');
  const touchFireBtn = document.getElementById('touch-fire');
  const touchReloadBtn = document.getElementById('touch-reload');
  const touchJumpBtn = document.getElementById('touch-jump');

  const isTouch = matchMedia('(pointer:coarse)').matches;

  const BEST_WAVE_KEY = 'deadline_best_wave';
  const BEST_KILLS_KEY = 'deadline_best_kills';
  let bestWave = Number(localStorage.getItem(BEST_WAVE_KEY) || 0);
  let bestKills = Number(localStorage.getItem(BEST_KILLS_KEY) || 0);
  bestWaveDisplay.textContent = bestWave;
  bestKillsDisplay.textContent = bestKills;

  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  // ---------- Three.js core ----------
  let renderer, camera, world, player, zombies;
  let W, H;
  let lastTime = 0;
  let running = false;
  let muzzleLight = null;

  function initRenderer(){
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    resize();
    window.addEventListener('resize', resize);
  }

  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (camera){
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
  }

  function setupScene(){
    const built = World.build();
    world = built;
    camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 200);
    camera.position.copy(world.playerStart);

    muzzleLight = new THREE.PointLight(0xffcc88, 0, 8, 2);
    camera.add(muzzleLight);
    muzzleLight.position.set(0.2, -0.1, -0.3);
    world.scene.add(camera);

    player = new Player(camera, canvas, world);
    zombies = new ZombieManager(world.scene, world);

    wirePlayerEvents();
    wireZombieEvents();
  }

  function wirePlayerEvents(){
    player.onLockChange = (locked) => {
      if (isTouch) return; // pointer lock is desktop-only; never show this overlay on touch
      lockPrompt.classList.toggle('hidden', locked || !running);
    };
    player.onReloadStart = () => reloadIndicator.classList.remove('hidden');
    player.onReloadEnd = () => {
      reloadIndicator.classList.add('hidden');
      updateAmmoHUD();
    };
    player.onShoot = () => {
      fireWeaponFX();
      const ray = player.getShootRay();
      const hit = zombies.raycastZombies(ray.origin, ray.dir, player.weapon.range);
      if (hit){
        zombies.damageZombie(hit.zombie, player.weapon.damage, hit.headshot);
        showHitmarker();
      }
      updateAmmoHUD();
    };
    player.onDryFire = () => {
      // could add a click sound cue here
    };
    player.onDamage = (amount) => {
      flashDamage();
      updateHealthHUD();
    };
    player.onDeath = () => {
      onPlayerDied();
    };
  }

  function wireZombieEvents(){
    zombies.onWaveStart = (wave, count) => {
      waveBanner.textContent = `WAVE ${wave}`;
      waveClearBanner.classList.add('hidden');
    };
    zombies.onZombieKilled = (kills) => {
      killsDisplay.textContent = kills;
    };
    zombies.onWaveClear = (wave, kills) => {
      waveClearSub.textContent = 'Next wave incoming...';
      waveClearBanner.classList.remove('hidden');
      setTimeout(() => {
        if (!running) return;
        zombies.startWave(wave + 1);
      }, 2600);
    };
  }

  // ---------- FX ----------
  function fireWeaponFX(){
    muzzleLight.intensity = 6;
    setTimeout(() => { if (muzzleLight) muzzleLight.intensity = 0; }, 45);
    canvas.style.transform = 'translateX(0)';
    // subtle recoil kick on pitch
    player.pitch = Math.min(1.3, player.pitch + 0.012);
  }

  function showHitmarker(){
    hitmarker.classList.remove('show');
    void hitmarker.offsetWidth;
    hitmarker.classList.add('show');
  }

  let damageFlashT = 0;
  function flashDamage(){
    damageFlashT = 0.35;
    damageVignette.style.opacity = '1';
  }

  // ---------- HUD updates ----------
  function updateHealthHUD(){
    const pct = Math.max(0, player.health / player.maxHealth) * 100;
    healthFill.style.width = pct + '%';
  }
  function updateStaminaHUD(){
    const pct = Math.max(0, player.stamina / player.maxStamina) * 100;
    staminaFill.style.width = pct + '%';
  }
  function updateAmmoHUD(){
    ammoCurrent.textContent = player.ammoInMag;
    ammoReserve.textContent = player.ammoReserve;
    weaponName.textContent = player.weapon.name;
  }

  // ---------- Touch controls wiring ----------
  let joyVec = { x: 0, y: 0 };
  function setupTouchControls(){
    if (!isTouch) return;
    touchControls.classList.remove('hidden');

    let joyActive = false, joyStartX = 0, joyStartY = 0;
    const maxR = 38;

    touchJoystick.addEventListener('touchstart', (e) => {
      joyActive = true;
      const t = e.changedTouches[0];
      joyStartX = t.clientX; joyStartY = t.clientY;
      e.preventDefault();
    }, { passive:false });

    window.addEventListener('touchmove', (e) => {
      if (!joyActive) return;
      for (const t of e.changedTouches){
        let dx = t.clientX - joyStartX;
        let dy = t.clientY - joyStartY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR){ dx = dx/dist*maxR; dy = dy/dist*maxR; }
        joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joyVec.x = dx / maxR;
        joyVec.y = dy / maxR;
      }
    }, { passive:true });

    window.addEventListener('touchend', () => {
      joyActive = false;
      joyVec.x = 0; joyVec.y = 0;
      joystickKnob.style.transform = 'translate(-50%,-50%)';
    });

    // look: drag anywhere on right half of screen (not on buttons)
    let lookActive = false, lastX = 0, lastY = 0;
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches){
        if (t.clientX > W * 0.45){
          lookActive = true; lastX = t.clientX; lastY = t.clientY;
        }
      }
    }, { passive:true });
    canvas.addEventListener('touchmove', (e) => {
      if (!lookActive) return;
      for (const t of e.changedTouches){
        if (t.clientX <= W*0.45) continue;
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        player.yaw -= dx * 0.0042;
        player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch - dy * 0.0042));
      }
    }, { passive:true });
    canvas.addEventListener('touchend', () => { lookActive = false; });

    touchFireBtn.addEventListener('touchstart', (e) => { player.touchFiring = true; e.preventDefault(); }, {passive:false});
    touchFireBtn.addEventListener('touchend', () => { player.touchFiring = false; });
    touchReloadBtn.addEventListener('touchstart', (e) => { player.startReload(); e.preventDefault(); }, {passive:false});
    touchJumpBtn.addEventListener('touchstart', (e) => {
      if (player.onGround){ player.vy = player.jumpVelocity; player.onGround = false; }
      e.preventDefault();
    }, {passive:false});
  }

  // ---------- Game loop ----------
  function loop(now){
    if (!running) return;
    try {
      let dt = (now - lastTime) / 1000;
      dt = Math.min(dt, 0.05);
      lastTime = now;

      player.update(dt, isTouch ? joyVec : null);
      updateHealthHUD();
      updateStaminaHUD();

      zombies.update(dt, player.position, (dmg) => player.takeDamage(dmg));

      // animate streetlamp flicker
      if (world.lampLight){
        world.lampLight.intensity = 2.0 + Math.sin(now*0.012) * 0.3 + (Math.random() < 0.02 ? -1.5 : 0);
      }
      // drift smoke
      world.smokeMeshes.forEach((s, i) => {
        s.position.x += Math.sin(now*0.0002 + i) * 0.003;
        s.rotation.y += 0.0003;
      });

      if (damageFlashT > 0){
        damageFlashT -= dt;
        if (damageFlashT <= 0) damageVignette.style.opacity = '0';
      }

      renderer.render(world.scene, camera);
      requestAnimationFrame(loop);
    } catch (err) {
      running = false;
      console.error('Game loop error:', err);
      showScreen('start');
      alert('Something went wrong loading the 3D scene: ' + err.message);
    }
  }

  // ---------- Game state transitions ----------
  function startGame(){
    showScreen('loading');
    document.getElementById('loading-fill').style.width = '0%';
    try {
      initRenderer();
      setupScene();
      setupTouchControlsOnce();
    } catch (err) {
      console.error('Setup error:', err);
      showScreen('start');
      alert('Could not start the game: ' + err.message);
      return;
    }

    let p = 0;
    const fakeLoad = setInterval(() => {
      p += 18 + Math.random()*22;
      document.getElementById('loading-fill').style.width = Math.min(100,p) + '%';
      if (p >= 100){
        clearInterval(fakeLoad);
        beginRun();
      }
    }, 90);
  }

  let touchSetupDone = false;
  function setupTouchControlsOnce(){
    if (touchSetupDone) return;
    touchSetupDone = true;
    setupTouchControls();
  }

  function beginRun(){
    showScreen('game');
    updateHealthHUD();
    updateStaminaHUD();
    updateAmmoHUD();
    killsDisplay.textContent = '0';
    running = true;
    lastTime = performance.now();
    zombies.startWave(1);
    if (!isTouch) lockPrompt.classList.remove('hidden');
    requestAnimationFrame(loop);
  }

  function onPlayerDied(){
    running = false;
    document.exitPointerLock?.();
    const wave = zombies.wave;
    const kills = zombies.kills;
    const isNewWave = wave > bestWave;
    const isNewKills = kills > bestKills;
    if (isNewWave){ bestWave = wave; localStorage.setItem(BEST_WAVE_KEY, String(bestWave)); }
    if (isNewKills){ bestKills = kills; localStorage.setItem(BEST_KILLS_KEY, String(bestKills)); }

    finalWave.textContent = wave;
    finalKills.textContent = kills;
    overCause.textContent = 'Overwhelmed at the barricade';
    newBestMsg.classList.toggle('hidden', !(isNewWave || isNewKills));
    bestWaveDisplay.textContent = bestWave;
    bestKillsDisplay.textContent = bestKills;

    setTimeout(() => showScreen('over'), 900);
  }

  function teardownScene(){
    if (renderer){
      renderer.dispose();
    }
  }

  // ---------- Buttons ----------
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-retry').addEventListener('click', () => {
    teardownScene();
    startGame();
  });
  document.getElementById('btn-menu').addEventListener('click', () => {
    teardownScene();
    showScreen('start');
  });
})();
