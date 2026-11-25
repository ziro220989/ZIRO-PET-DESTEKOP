/**
 * ZIRO AI PET v4.0 — Modular Controller for:
 * - Futuristic Navigation, Project Destination Guard & Integrated Mascot Stage
 * - APARIENCIA ZIRO (Live Palettes, HEX/RGB, Animations)
 * - ZIRO PROCEDURAL FRAMEWORK + PROJECT MANAGER + OPTIMIZER (Image 3)
 * - ZIRO CHARACTER FUSION
 * - ZIRO FINISHER STUDIO + RANDOM FINISHER + AI ANIMATION EDITOR (Image 1)
 * - ZIRO SYSTEM SCANNER (All Drives C:, D:, E:, F:...)
 */
(function () {
  const PALETTES = {
    'verde-matrix':   { primary: '#00ff44', secondary: '#00f0ff', border: '#00ff44', glow: '#00ff44', button: '#00ff44', indicator: '#39ff14' },
    'violeta-cyber':  { primary: '#b94dff', secondary: '#ff2ef5', border: '#b94dff', glow: '#b94dff', button: '#c96bff', indicator: '#ff55ff' },
    'azul-quantum':   { primary: '#2d8cff', secondary: '#00e5ff', border: '#2d8cff', glow: '#2d8cff', button: '#3ba1ff', indicator: '#66d9ff' },
    'cian-electrico': { primary: '#00f0ff', secondary: '#00ffaa', border: '#00f0ff', glow: '#00f0ff', button: '#00f0ff', indicator: '#55ffff' },
    'rojo-inferno':   { primary: '#ff3b30', secondary: '#ff8800', border: '#ff3b30', glow: '#ff3b30', button: '#ff4d42', indicator: '#ff7733' },
    'rosa-neon':      { primary: '#ff2a9d', secondary: '#9d4edd', border: '#ff2a9d', glow: '#ff2a9d', button: '#ff42a8', indicator: '#ff70c0' },
    'blanco-hielo':   { primary: '#e2f1ff', secondary: '#7dd3fc', border: '#cce6ff', glow: '#a8d8ff', button: '#e2f1ff', indicator: '#ffffff' }
  };

  let modSettings = null;
  let activeProjectPath = '';
  let scannedProjects = [];
  let finisherEnemies = [];
  let finisherAnimations = [];
  let selectedFinisherAnimIdx = 2;
  let fsCompareMode = false;
  let fsCapturingKey = false;
  let fsLogs = ['[ZIRO FINISHER STUDIO] Listo para inspeccionar packs, Multi-Target (hasta 10 enemigos) y Shuffle Bag.'];
  let proposedAiVariant = null;
  let appliedAiVariant = null;

  const urlParams = new URLSearchParams(window.location.search);
  const IS_STANDALONE = urlParams.get('standalone') === '1';
  const STANDALONE_MODULE = (urlParams.get('module') || '').toLowerCase();

  function addFsLog(msg) {
    const stamp = new Date().toLocaleTimeString();
    fsLogs.unshift(`[${stamp}] ${msg}`);
    if (fsLogs.length > 40) fsLogs.pop();
  }

  const PET_TEX_MAP = {
    ziro_piggy: '../assets/default_pets/ziro_piggy.png',
    ziro: '../assets/default_pets/ziro.svg',
    kitsune: '../assets/default_pets/kitsune_anime.png',
    sparky: '../assets/default_pets/sparky.svg',
    nexus: '../assets/default_pets/nexus.svg',
    glitch: '../assets/default_pets/glitch.svg',
    volt: '../assets/default_pets/volt.svg'
  };

  function switchToTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === tabId);
    });
    const activeBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    const pt = document.getElementById('pageTitle');
    if (pt && activeBtn) {
      pt.textContent = activeBtn.innerText.replace('🗗', '').trim();
    }
    if (tabId === 'tab-procedural') setTimeout(resizePfCanvas, 60);
    if (tabId === 'tab-finisher') setTimeout(resizeFsCanvas, 60);
    if (tabId === 'tab-scanner' && document.getElementById('scannerResultsGrid')?.children.length === 0) {
      runSystemScannerUI();
    }
  }
  window.ziroSwitchTab = switchToTab;

  function hexToRgba(hex, alpha) {
    const clean = (hex || '#00ff44').replace('#', '');
    if (clean.length !== 6) return `rgba(0,255,68,${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyThemeToDOM(theme = {}) {
    const root = document.documentElement;
    const neonAlpha = Math.max(0.1, Math.min(1, Number(theme.neonIntensity ?? 85) / 100));
    const panelAlpha = Math.max(0.5, Math.min(1, Number(theme.transparency ?? 92) / 100));
    const bright = Math.max(0.65, Math.min(1.35, Number(theme.brightness ?? 100) / 100));
    const animSpeed = Math.max(0.3, Math.min(2.5, Number(theme.animSpeed ?? 1.0)));

    root.style.setProperty('--ziro-primary', theme.primary || '#00ff44');
    root.style.setProperty('--ziro-secondary', theme.secondary || '#00f0ff');
    root.style.setProperty('--ziro-border', hexToRgba(theme.border || '#00ff44', 0.42 * neonAlpha + 0.1));
    root.style.setProperty('--ziro-glow', hexToRgba(theme.glow || '#00ff44', 0.65 * neonAlpha));
    root.style.setProperty('--ziro-button', theme.button || '#00ff44');
    root.style.setProperty('--ziro-indicator', theme.indicator || '#39ff14');
    root.style.setProperty('--ziro-bg-alpha', String(panelAlpha));
    root.style.setProperty('--ziro-brightness', String(bright));
    root.style.setProperty('--ziro-anim-duration', `${(0.3 / animSpeed).toFixed(2)}s`);

    document.body.classList.toggle('no-animations', theme.animationsEnabled === false);
    document.body.classList.toggle('reduced-motion', Boolean(theme.reducedMotion));

    const scanEl = document.getElementById('holoScanlines');
    if (scanEl) scanEl.style.display = theme.animationsEnabled === false ? 'none' : 'block';
  }

  function syncThemeInputs(theme) {
    const pairs = [
      ['themePrimaryColor', 'themePrimaryHex', theme.primary],
      ['themeSecondaryColor', 'themeSecondaryHex', theme.secondary],
      ['themeBorderColor', 'themeBorderHex', theme.border],
      ['themeGlowColor', 'themeGlowHex', theme.glow],
      ['themeButtonColor', 'themeButtonHex', theme.button],
      ['themeIndicatorColor', 'themeIndicatorHex', theme.indicator]
    ];
    for (const [cId, hId, val] of pairs) {
      const c = document.getElementById(cId);
      const h = document.getElementById(hId);
      if (c && val) c.value = val;
      if (h && val) h.value = val;
    }
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    setVal('themeNeonInt', theme.neonIntensity ?? 85);
    setVal('themePanelAlpha', theme.transparency ?? 92);
    setVal('themeBrightness', theme.brightness ?? 100);
    setVal('sliderAnimSpeed', theme.animSpeed ?? 1.0);
    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('lblNeonInt', `${theme.neonIntensity ?? 85}%`);
    setTxt('lblPanelAlpha', `${theme.transparency ?? 92}%`);
    setTxt('lblBrightness', `${theme.brightness ?? 100}%`);
    setTxt('lblAnimSpeed', `${theme.animSpeed ?? 1.0}x`);

    const chkE = document.getElementById('chkAnimEnabled');
    const chkR = document.getElementById('chkAnimReduced');
    if (chkE) chkE.checked = theme.animationsEnabled !== false;
    if (chkR) chkR.checked = Boolean(theme.reducedMotion);
  }

  function syncMascotVisuals(settings) {
    if (!settings) return;
    const pid = settings.selectedPet || 'ziro_piggy';
    let url = PET_TEX_MAP[pid];
    if (!url && Array.isArray(settings.customPets)) {
      const found = settings.customPets.find((p) => p.id === pid);
      if (found) url = found.dataUrl || found.src;
    }
    if (!url) url = PET_TEX_MAP.ziro_piggy;

    ['sidebarMascotImg', 'homeMascotImg', 'pfMascotMini'].forEach((id) => {
      const img = document.getElementById(id);
      if (img) img.src = url;
    });
  }

  function updateProjectDestinationUI(uprojectPath) {
    activeProjectPath = uprojectPath || '';
    const name = activeProjectPath ? activeProjectPath.split(/[\\/]/).pop().replace('.uproject', '') : 'Sin seleccionar';
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setText('hudProjectName', name);
    setText('hudProjectPath', activeProjectPath ? `(${activeProjectPath})` : '');
    setText('homeProjectPathText', activeProjectPath || 'Ninguno seleccionado (selecciona tu carpeta .uproject; nunca se usa ZIRO HOST automáticamente)');
    setText('pfVoiceProj', name);
    setText('pfHeaderTargetPath', activeProjectPath || 'Sin seleccionar');
    setText('pfStatProject', activeProjectPath ? name : 'Sin seleccionar');
  }

  // =========================================================================
  // 1. APARIENCIA ZIRO
  // =========================================================================
  function setupAppearanceModule() {
    if (!modSettings.uiTheme) modSettings.uiTheme = { ...PALETTES['verde-matrix'], neonIntensity: 85, transparency: 92, brightness: 100, animationsEnabled: true, reducedMotion: false, animSpeed: 1.0, savedPalettes: {} };
    applyThemeToDOM(modSettings.uiTheme);
    syncThemeInputs(modSettings.uiTheme);
    renderSavedPalettesDropdown();

    const saveTheme = async () => {
      applyThemeToDOM(modSettings.uiTheme);
      await window.ziroAPI.saveSettings(modSettings);
    };

    document.querySelectorAll('.ziro-palette-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pal;
        if (PALETTES[key]) {
          modSettings.uiTheme = { ...modSettings.uiTheme, ...PALETTES[key], activePalette: key };
          syncThemeInputs(modSettings.uiTheme);
          saveTheme();
        }
      });
    });

    const colorMap = [
      ['themePrimaryColor', 'themePrimaryHex', 'primary'],
      ['themeSecondaryColor', 'themeSecondaryHex', 'secondary'],
      ['themeBorderColor', 'themeBorderHex', 'border'],
      ['themeGlowColor', 'themeGlowHex', 'glow'],
      ['themeButtonColor', 'themeButtonHex', 'button'],
      ['themeIndicatorColor', 'themeIndicatorHex', 'indicator']
    ];
    colorMap.forEach(([cId, hId, key]) => {
      const c = document.getElementById(cId);
      const h = document.getElementById(hId);
      c?.addEventListener('input', () => {
        modSettings.uiTheme[key] = c.value;
        if (h) h.value = c.value;
        saveTheme();
      });
      h?.addEventListener('change', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(h.value.trim())) {
          modSettings.uiTheme[key] = h.value.trim();
          if (c) c.value = h.value.trim();
          saveTheme();
        }
      });
    });

    document.getElementById('themeRgbInput')?.addEventListener('change', (e) => {
      const m = e.target.value.match(/(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
      if (m) {
        const toHex = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
        const hex = `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
        modSettings.uiTheme.primary = hex;
        modSettings.uiTheme.border = hex;
        modSettings.uiTheme.glow = hex;
        modSettings.uiTheme.button = hex;
        syncThemeInputs(modSettings.uiTheme);
        saveTheme();
      }
    });

    const bindSlider = (id, lblId, key, suffix = '%') => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        modSettings.uiTheme[key] = val;
        const lbl = document.getElementById(lblId);
        if (lbl) lbl.textContent = `${val}${suffix}`;
        applyThemeToDOM(modSettings.uiTheme);
      });
      document.getElementById(id)?.addEventListener('change', saveTheme);
    };
    bindSlider('themeNeonInt', 'lblNeonInt', 'neonIntensity', '%');
    bindSlider('themePanelAlpha', 'lblPanelAlpha', 'transparency', '%');
    bindSlider('themeBrightness', 'lblBrightness', 'brightness', '%');
    bindSlider('sliderAnimSpeed', 'lblAnimSpeed', 'animSpeed', 'x');

    document.getElementById('chkAnimEnabled')?.addEventListener('change', (e) => {
      modSettings.uiTheme.animationsEnabled = e.target.checked;
      saveTheme();
    });
    document.getElementById('chkAnimReduced')?.addEventListener('change', (e) => {
      modSettings.uiTheme.reducedMotion = e.target.checked;
      saveTheme();
    });

    document.getElementById('btnSaveCustomPalette')?.addEventListener('click', () => {
      const pname = (document.getElementById('inputSavePaletteName')?.value || '').trim();
      if (!pname) return;
      modSettings.uiTheme.savedPalettes = modSettings.uiTheme.savedPalettes || {};
      modSettings.uiTheme.savedPalettes[pname] = {
        primary: modSettings.uiTheme.primary,
        secondary: modSettings.uiTheme.secondary,
        border: modSettings.uiTheme.border,
        glow: modSettings.uiTheme.glow,
        button: modSettings.uiTheme.button,
        indicator: modSettings.uiTheme.indicator
      };
      renderSavedPalettesDropdown();
      saveTheme();
    });

    document.getElementById('selectSavedPalettes')?.addEventListener('change', (e) => {
      const pname = e.target.value;
      const saved = modSettings.uiTheme?.savedPalettes?.[pname];
      if (saved) {
        modSettings.uiTheme = { ...modSettings.uiTheme, ...saved };
        syncThemeInputs(modSettings.uiTheme);
        saveTheme();
      }
    });

    document.getElementById('btnRestoreDefaultTheme')?.addEventListener('click', () => {
      modSettings.uiTheme = { ...modSettings.uiTheme, ...PALETTES['verde-matrix'], activePalette: 'verde-matrix', neonIntensity: 85, transparency: 92, brightness: 100, animationsEnabled: true, reducedMotion: false, animSpeed: 1.0 };
      syncThemeInputs(modSettings.uiTheme);
      saveTheme();
    });
  }

  function renderSavedPalettesDropdown() {
    const sel = document.getElementById('selectSavedPalettes');
    if (!sel) return;
    const saved = modSettings?.uiTheme?.savedPalettes || {};
    sel.innerHTML = '<option value="">Cargar paleta guardada...</option>' +
      Object.keys(saved).map((k) => `<option value="${k}">${k}</option>`).join('');
  }

  // =========================================================================
  // 2. ZIRO PROJECT MANAGER & PROCEDURAL FRAMEWORK + 3D CITY PREVIEW (IMAGEN 2)
  // =========================================================================
  let pfScene, pfCamera, pfRenderer, pfGroup, pfDoorsList = [], pfWindowsList = [], pfSelectedMesh = null;
  let pfOrbitYaw = 0.65, pfOrbitPitch = 0.45, pfOrbitDist = 42, pfFirstPerson = false, pfDoorsOpen = true, pfWindowsBroken = false;
  let pfFpPos = { x: 0, z: 16, yaw: 0 };
  const pfKeysDown = new Set();

  function initPf3D() {
    const canvas = document.getElementById('pf3dCanvas');
    if (!canvas || typeof THREE === 'undefined' || pfRenderer) return;

    pfRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    pfScene = new THREE.Scene();
    pfCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 400);

    const amb = new THREE.AmbientLight(0x88aa99, 0.85);
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(18, 28, 16);
    pfScene.add(amb, dir);

    const grid = new THREE.GridHelper(64, 32, 0x00ff44, 0x162622);
    pfScene.add(grid);

    pfGroup = new THREE.Group();
    pfScene.add(pfGroup);
    rebuildPfCityPreview(6, false);

    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    let dragging = false, moved = false, lx = 0, ly = 0;

    canvas.addEventListener('mousedown', (e) => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      if (Math.abs(e.clientX - lx) > 2 || Math.abs(e.clientY - ly) > 2) moved = true;
      if (pfFirstPerson) {
        pfFpPos.yaw -= (e.clientX - lx) * 0.006;
      } else {
        pfOrbitYaw -= (e.clientX - lx) * 0.008;
        pfOrbitPitch = Math.max(0.12, Math.min(1.35, pfOrbitPitch + (e.clientY - ly) * 0.008));
      }
      lx = e.clientX; ly = e.clientY;
    });

    canvas.addEventListener('click', (e) => {
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, pfCamera);
      const hits = raycaster.intersectObjects(pfGroup.children, false);
      if (pfSelectedMesh && pfSelectedMesh.material?.emissive) {
        pfSelectedMesh.material.emissive.setHex(pfSelectedMesh.userData.origEmissive || 0x000000);
      }
      if (hits.length > 0) {
        pfSelectedMesh = hits[0].object;
        pfSelectedMesh.userData.origEmissive = pfSelectedMesh.material?.emissive ? pfSelectedMesh.material.emissive.getHex() : 0;
        if (pfSelectedMesh.material?.emissive) pfSelectedMesh.material.emissive.setHex(0x004422);
        const lbl = document.getElementById('pfSelectedCompName');
        if (lbl) lbl.textContent = pfSelectedMesh.name || 'Módulo Estructural';
      } else {
        pfSelectedMesh = null;
        const lbl = document.getElementById('pfSelectedCompName');
        if (lbl) lbl.textContent = 'Ninguno (clic en la escena 3D)';
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      pfOrbitDist = Math.max(6, Math.min(95, pfOrbitDist + e.deltaY * 0.03));
    }, { passive: false });

    window.addEventListener('keydown', (e) => { pfKeysDown.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => { pfKeysDown.delete(e.key.toLowerCase()); });

    const tick = () => {
      requestAnimationFrame(tick);
      if (pfFirstPerson) {
        const speed = 0.16;
        if (pfKeysDown.has('w')) { pfFpPos.x -= Math.sin(pfFpPos.yaw) * speed; pfFpPos.z -= Math.cos(pfFpPos.yaw) * speed; }
        if (pfKeysDown.has('s')) { pfFpPos.x += Math.sin(pfFpPos.yaw) * speed; pfFpPos.z += Math.cos(pfFpPos.yaw) * speed; }
        if (pfKeysDown.has('a')) { pfFpPos.x -= Math.cos(pfFpPos.yaw) * speed; pfFpPos.z += Math.sin(pfFpPos.yaw) * speed; }
        if (pfKeysDown.has('d')) { pfFpPos.x += Math.cos(pfFpPos.yaw) * speed; pfFpPos.z -= Math.sin(pfFpPos.yaw) * speed; }
        pfCamera.position.set(pfFpPos.x, 1.75, pfFpPos.z);
        pfCamera.lookAt(pfFpPos.x - Math.sin(pfFpPos.yaw) * 6, 1.65, pfFpPos.z - Math.cos(pfFpPos.yaw) * 6);
      } else {
        pfCamera.position.set(
          Math.sin(pfOrbitYaw) * Math.cos(pfOrbitPitch) * pfOrbitDist,
          Math.sin(pfOrbitPitch) * pfOrbitDist,
          Math.cos(pfOrbitYaw) * Math.cos(pfOrbitPitch) * pfOrbitDist
        );
        pfCamera.lookAt(0, 2.5, 0);
      }
      pfRenderer.render(pfScene, pfCamera);
    };
    resizePfCanvas();
    tick();
  }

  function resizePfCanvas() {
    const c = document.getElementById('pf3dCanvas');
    if (!c || !pfRenderer || !pfCamera) return;
    const w = c.clientWidth || 640, h = c.clientHeight || 360;
    pfRenderer.setSize(w, h, false);
    pfCamera.aspect = w / Math.max(1, h);
    pfCamera.updateProjectionMatrix();
  }

  function rebuildPfCityPreview(buildingCount = 6, isBeforeOnly = false) {
    if (!pfGroup || typeof THREE === 'undefined') return;
    while (pfGroup.children.length > 0) pfGroup.remove(pfGroup.children[0]);
    pfDoorsList = [];
    pfWindowsList = [];
    pfSelectedMesh = null;

    const wear = Number(document.getElementById('pfWearSlider')?.value || 50) / 100;
    const treesDens = Number(document.getElementById('pfTreesDensity')?.value || 65) / 100;
    const grassDens = Number(document.getElementById('pfGrassDensity')?.value || 60) / 100;

    if (isBeforeOnly) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 14), new THREE.MeshStandardMaterial({ color: 0x1b262c }));
      base.name = 'Terreno_Base_Original';
      pfGroup.add(base);
      return;
    }

    const archetypes = [
      { name: 'Escuela', wings: 2, col: 0x4d5b6a, roofCol: 0x334455, roofShape: 'gable' },
      { name: 'Hospital', wings: 3, col: 0x6e747d, roofCol: 0x223344, roofShape: 'flat' },
      { name: 'Comisaría', wings: 1, col: 0x3d4f5c, roofCol: 0x1f2a33, roofShape: 'flat' },
      { name: 'Fábrica', wings: 2, col: 0x5a483c, roofCol: 0x2b221d, roofShape: 'sawtooth' },
      { name: 'Vivienda', wings: 1, col: 0x685447, roofCol: 0x542d1f, roofShape: 'hip' },
      { name: 'Universidad', wings: 3, col: 0x525c68, roofCol: 0x26374a, roofShape: 'dome' },
      { name: 'Iglesia', wings: 2, col: 0x635749, roofCol: 0x42382f, roofShape: 'steeple' },
      { name: 'Almacén', wings: 1, col: 0x4f4d4a, roofCol: 0x2e2d2b, roofShape: 'gable' }
    ];
    const cols = Math.ceil(Math.sqrt(buildingCount));
    for (let i = 0; i < buildingCount; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const jitterX = ((i * 7) % 5) - 2;
      const jitterZ = ((i * 11) % 5) - 2;
      const bx = (c - (cols - 1) / 2) * 14.0 + jitterX;
      const bz = (r - (cols - 1) / 2) * 14.0 + jitterZ;
      const w = 5.2 + ((i * 4) % 4);
      const d = 4.8 + ((i * 6) % 3);
      const h = 3.6 + ((i * 5) % 5);
      const arch = archetypes[i % archetypes.length];
      const wallCol = wear > 0.5 ? 0x394037 : arch.col;

      // Estructura principal
      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.75 })
      );
      bMesh.position.set(bx, h / 2, bz);
      bMesh.name = `${arch.name}_${i + 1}_Estructura`;
      pfGroup.add(bMesh);

      // Ala secundaria o torre en L según arquetipo
      if (arch.wings > 1) {
        const wingW = w * 0.55;
        const wingD = d * 0.75;
        const wingH = h * 0.85;
        const wingMesh = new THREE.Mesh(
          new THREE.BoxGeometry(wingW, wingH, wingD),
          new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.75 })
        );
        wingMesh.position.set(bx + w * 0.45, wingH / 2, bz + d * 0.3);
        wingMesh.name = `${arch.name}_${i + 1}_AlaSecundaria`;
        pfGroup.add(wingMesh);
      }

      // Techo procedural variado (Dos aguas, 4 aguas, aguja o plano)
      let roof;
      if (arch.roofShape === 'steeple') {
        roof = new THREE.Mesh(
          new THREE.ConeGeometry(w * 0.4, 4.0, 4),
          new THREE.MeshStandardMaterial({ color: wear > 0.5 ? 0x262924 : arch.roofCol })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.set(bx, h + 2.0, bz);
      } else if (arch.roofShape === 'gable') {
        roof = new THREE.Mesh(
          new THREE.ConeGeometry(w * 0.65, 2.2, 4),
          new THREE.MeshStandardMaterial({ color: wear > 0.5 ? 0x262924 : arch.roofCol })
        );
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1.0, 1.0, d / w);
        roof.position.set(bx, h + 1.1, bz);
      } else {
        roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
          new THREE.MeshStandardMaterial({ color: wear > 0.5 ? 0x262924 : arch.roofCol })
        );
        roof.position.set(bx, h + 0.2, bz);
      }
      roof.name = `${arch.name}_${i + 1}_Techo`;
      pfGroup.add(roof);

      // Puerta modular independiente (abierta o cerrada según selector)
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 2.2, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x003318 })
      );
      door.position.set(bx - 0.5, 1.1, bz + d / 2 + 0.08);
      door.rotation.y = pfDoorsOpen ? 1.45 : 0;
      door.name = `${arch.name}_${i + 1}_Puerta_Interactiva`;
      pfGroup.add(door);
      pfDoorsList.push(door);

      // Ventana modular rompible
      const winMat = new THREE.MeshStandardMaterial({
        color: pfWindowsBroken ? 0x222222 : 0x66ddff,
        transparent: true,
        opacity: pfWindowsBroken ? 0.18 : 0.65
      });
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), winMat);
      win.position.set(bx + 1.2, Math.min(h - 1.0, 2.0), bz + d / 2 + 0.06);
      win.name = `${arch.name}_${i + 1}_Ventana_Rompible`;
      pfGroup.add(win);
      pfWindowsList.push(win);

      // Vegetación segura (apartada de puertas/ventanas)
      if (treesDens > 0.2) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x1f6e38 }));
        tree.position.set(bx + w / 2 + 1.8, 1.6, bz - d / 2);
        tree.name = `Arbol_${i + 1}`;
        pfGroup.add(tree);
      }
      if (grassDens > 0.3) {
        const patch = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.15, 6), new THREE.MeshStandardMaterial({ color: 0x2a5a26 }));
        patch.position.set(bx - w / 2 - 1.4, 0.08, bz + 0.5);
        patch.name = `Pradera_${i + 1}`;
        pfGroup.add(patch);
      }
    }
  }

  async function refreshProjectManagerList() {
    const rootInput = document.getElementById('pmRootFolderInput')?.value?.trim();
    const roots = rootInput ? [rootInput, ...(modSettings?.projectManager?.rootSearchDirs || [])] : (modSettings?.projectManager?.rootSearchDirs || []);
    scannedProjects = await window.ziroAPI.pmScanRoots(roots);

    const listEl = document.getElementById('pmProjectsList');
    if (!listEl) return;

    if (!scannedProjects || scannedProjects.length === 0) {
      listEl.innerHTML = '<div style="font-size:11px; color:var(--color-text-dim);">No se encontraron archivos .uproject en esa ruta. Probá con otro disco/carpeta.</div>';
      return;
    }

    listEl.innerHTML = scannedProjects.map((p) => {
      const isActive = activeProjectPath && p.path.toLowerCase() === activeProjectPath.toLowerCase();
      return `
        <div class="fs-anim-row ${isActive ? 'active' : ''}" style="cursor:pointer;" data-uproj="${p.path}">
          <div style="overflow:hidden;">
            <div style="font-weight:700; color:#fff;">${isActive ? '✅ ' : '🎮 '}${p.name} <span style="font-size:10px; color:var(--ziro-secondary);">(${p.unrealVersion})</span></div>
            <div style="font-size:10px; color:var(--color-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${p.path}">${p.path}</div>
            <div style="font-size:9.5px; color:${p.isZiroHost ? '#ffaa44' : 'var(--ziro-indicator)'};">${p.status} • ${p.modifiedAt}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-uproj]').forEach((row) => {
      row.addEventListener('click', async () => {
        const chosen = row.getAttribute('data-uproj');
        await window.ziroAPI.selectUnrealProject(chosen);
        updateProjectDestinationUI(chosen);
        const projObj = scannedProjects.find((x) => x.path === chosen);
        renderMapsList(projObj?.maps || []);
        refreshProjectManagerList();
      });
    });

    const curObj = scannedProjects.find((p) => activeProjectPath && p.path.toLowerCase() === activeProjectPath.toLowerCase());
    if (curObj) renderMapsList(curObj.maps || []);
  }

  function renderMapsList(maps = []) {
    const el = document.getElementById('pfMapsList');
    const cnt = document.getElementById('pfMapsCount');
    if (cnt) cnt.textContent = String(maps.length);
    if (!el) return;
    if (maps.length === 0) {
      el.innerHTML = '<div style="color:var(--color-text-dim);">Sin mapas .umap detectados.</div>';
      return;
    }
    el.innerHTML = maps.map((m, idx) => `
      <div class="fs-anim-row pf-map-item ${idx === 0 ? 'active' : ''}" data-map="${m.name}" style="cursor:pointer;">
        <span>📁 ${m.name}</span>
        <span style="font-size:10px; color:var(--ziro-primary);">✓</span>
      </div>
    `).join('');
    document.getElementById('pfVoiceMap').textContent = maps[0].name;
    document.getElementById('pfStatMap').textContent = maps[0].name;
    el.querySelectorAll('.pf-map-item').forEach((item) => {
      item.addEventListener('click', () => {
        el.querySelectorAll('.pf-map-item').forEach((x) => x.classList.remove('active'));
        item.classList.add('active');
        const mName = item.getAttribute('data-map');
        document.getElementById('pfVoiceMap').textContent = mName;
        document.getElementById('pfStatMap').textContent = mName;
      });
    });
  }

  function setupProceduralModule() {
    initPf3D();
    refreshProjectManagerList();

    document.getElementById('btnPmScanRoots')?.addEventListener('click', refreshProjectManagerList);
    document.getElementById('btnPmBrowseRoot')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.pmBrowseFolder('Seleccionar carpeta raíz de proyectos Unreal');
      if (res && res.success && res.folderPath) {
        document.getElementById('pmRootFolderInput').value = res.folderPath;
        modSettings.projectManager = modSettings.projectManager || { rootSearchDirs: [] };
        if (!modSettings.projectManager.rootSearchDirs.includes(res.folderPath)) {
          modSettings.projectManager.rootSearchDirs.unshift(res.folderPath);
          await window.ziroAPI.saveSettings(modSettings);
        }
        refreshProjectManagerList();
      }
    });

    document.getElementById('btnPmOpenActive')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) {
        alert(val.error);
        return;
      }
      await window.ziroAPI.launchUnrealProject();
    });

    document.getElementById('btnPmOpenFolder')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) return alert(val.error);
      await window.ziroAPI.pmOpenFolder(val.info.dir);
    });

    document.querySelectorAll('.pf-size-pill[data-size]').forEach((p) => {
      p.addEventListener('click', () => {
        document.querySelectorAll('.pf-size-pill[data-size]').forEach((x) => x.classList.remove('active'));
        p.classList.add('active');
        const count = p.dataset.size === '2x2' ? 4 : p.dataset.size === '4x4' ? 9 : p.dataset.size === '10x10' ? 16 : 25;
        rebuildPfCityPreview(count, false);
      });
    });

    document.querySelectorAll('.pf-age-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.pf-age-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const age = Number(b.dataset.age);
        const wear = Math.min(100, age * 2);
        const sl = document.getElementById('pfWearSlider');
        if (sl) sl.value = wear;
        document.getElementById('lblPfWear').textContent = `${wear}%`;
        rebuildPfCityPreview(9, false);
      });
    });

    document.getElementById('btnPfPopout')?.addEventListener('click', () => {
      window.ziroAPI.openModuleWindow('procedural');
    });
    document.getElementById('btnPfNavHome')?.addEventListener('click', () => {
      window.ziroAPI.goHomeInDashboard('tab-home');
    });
    document.getElementById('btnPfNavFinisher')?.addEventListener('click', () => {
      window.ziroAPI.openModuleWindow('finisher');
    });
    document.getElementById('btnPfNavFusion')?.addEventListener('click', () => {
      window.ziroAPI.openModuleWindow('fusion');
    });

    document.querySelectorAll('.pf-voice-cmd').forEach((lbl) => {
      lbl.addEventListener('click', () => {
        const cmd = lbl.getAttribute('data-cmd') || '';
        const inp = document.getElementById('pfPromptText');
        if (inp && cmd) inp.value = cmd;
        const st = document.getElementById('pfVoiceStatus');
        if (st && cmd) st.textContent = `Previsualizando: "${cmd}"`;
        rebuildPfCityPreview(9, false);
      });
    });

    const linkSliderLbl = (id, lbl) => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const el = document.getElementById(lbl);
        if (el) el.textContent = `${e.target.value}%`;
      });
    };
    linkSliderLbl('pfGrassDensity', 'lblPfGrass');
    linkSliderLbl('pfTreesDensity', 'lblPfTrees');
    linkSliderLbl('pfMossDensity', 'lblPfMoss');
    linkSliderLbl('pfGrassHeight', 'lblPfGrassHeight');
    linkSliderLbl('pfWearSlider', 'lblPfWear');
    linkSliderLbl('pfCityDensity', 'lblPfDensity');

    document.getElementById('btnPfFirstPerson')?.addEventListener('click', () => {
      pfFirstPerson = !pfFirstPerson;
      document.getElementById('pfVoiceStatus').textContent = pfFirstPerson
        ? '1ª Persona activa (usa W A S D y arrastra con mouse)'
        : 'Cámara orbital libre activa';
    });
    document.getElementById('btnPfTestDoors')?.addEventListener('click', () => {
      pfDoorsOpen = !pfDoorsOpen;
      pfDoorsList.forEach((d) => { d.rotation.y = pfDoorsOpen ? 1.45 : 0; });
      const mode = document.getElementById('pfDoorModeSelect')?.value || 'open';
      document.getElementById('pfGeneratedCompareText').textContent = `Puertas probadas en modo '${mode}': ${pfDoorsOpen ? 'Abiertas' : 'Cerradas'}.`;
    });
    document.getElementById('btnPfBreakWindow')?.addEventListener('click', () => {
      pfWindowsBroken = !pfWindowsBroken;
      pfWindowsList.forEach((w) => {
        if (w.material) {
          w.material.opacity = pfWindowsBroken ? 0.16 : 0.65;
          w.material.color.setHex(pfWindowsBroken ? 0x222222 : 0x66ddff);
        }
      });
      document.getElementById('pfGeneratedCompareText').textContent = pfWindowsBroken
        ? 'Ventanas fracturadas (estado rompible con físicas verificado).'
        : 'Ventanas intactas restauradas.';
    });
    document.getElementById('btnPfDeleteComp')?.addEventListener('click', () => {
      if (!pfSelectedMesh || !pfGroup) return alert('Haz clic primero en un módulo/edificio del visor 3D.');
      const n = pfSelectedMesh.name;
      pfGroup.remove(pfSelectedMesh);
      pfSelectedMesh = null;
      document.getElementById('pfSelectedCompName').textContent = `Eliminado: ${n}`;
    });
    document.getElementById('btnPfReplaceComp')?.addEventListener('click', () => {
      if (!pfSelectedMesh) return alert('Haz clic primero en un módulo/edificio del visor 3D.');
      pfSelectedMesh.scale.y = pfSelectedMesh.scale.y > 1.2 ? 0.85 : 1.35;
      pfSelectedMesh.material?.color?.setHex(Math.random() > 0.5 ? 0x4f6d7a : 0x6b5b4e);
      document.getElementById('pfSelectedCompName').textContent = `Variación aplicada a: ${pfSelectedMesh.name}`;
    });
    let showBefore = false;
    document.getElementById('btnPfCompareBeforeAfter')?.addEventListener('click', () => {
      showBefore = !showBefore;
      rebuildPfCityPreview(9, showBefore);
    });

    document.getElementById('btnPfPreviewOnly')?.addEventListener('click', () => {
      const txt = document.getElementById('pfPromptText')?.value || '';
      const nums = txt.match(/\d+/g);
      const sumNums = nums ? nums.reduce((a, b) => a + parseInt(b, 10), 0) : 9;
      const cnt = Math.min(25, Math.max(1, sumNums));
      rebuildPfCityPreview(cnt, false);
      document.getElementById('pfGeneratedCompareText').textContent = `Vista previa 3D generada (${cnt} edificios modulares). Pulsa GENERAR ENTORNO para insertar en tu proyecto activo.`;
    });

    const executeGenerationToLevel = async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) {
        alert(val.error);
        return;
      }
      if (!confirm(`¿Incorporar generación procedural arquitectónica al nivel activo en "${val.info.name}" (${val.info.path})?`)) return;

      document.getElementById('pfStatStatus').textContent = 'Incorporando al nivel...';
      const prompt = document.getElementById('pfPromptText')?.value || `Ciudad ${document.querySelector('.pf-size-pill[data-size].active')?.dataset.size || '10x10'}`;
      const res = await window.ziroAPI.architectGenerateWorld({
        prompt,
        mode: prompt.toLowerCase().includes('isla') ? 'island' : 'city',
        citySize: document.querySelector('.pf-size-pill[data-size].active')?.dataset.size || '10x10',
        density: Number(document.getElementById('pfCityDensity')?.value || 70),
        doorMode: document.getElementById('pfDoorModeSelect')?.value || 'open',
        breakableWindows: document.getElementById('pfModBreakableWindows')?.checked,
        modularSeparate: document.getElementById('pfModSeparateMeshes')?.checked,
        grassDensity: Number(document.getElementById('pfGrassDensity')?.value || 60),
        treesDensity: Number(document.getElementById('pfTreesDensity')?.value || 65),
        noVegDoorClip: document.getElementById('pfNoVegDoorClip')?.checked,
        wearPercent: Number(document.getElementById('pfWearSlider')?.value || 50),
        ageYears: Number(document.querySelector('.pf-age-btn.active')?.dataset.age || 15),
        abandoned: Number(document.getElementById('pfWearSlider')?.value || 0) > 40,
        extraVines: Number(document.getElementById('pfTreesDensity')?.value || 0) > 40
      });
      document.getElementById('pfStatStatus').textContent = res.success ? 'Incorporado al nivel ✓' : 'Error';
      document.getElementById('pfGeneratedCompareText').textContent = res.message || 'Edificación y entorno incorporados exitosamente al nivel activo.';
    };

    document.getElementById('btnPfGenerateConfirm')?.addEventListener('click', executeGenerationToLevel);
    document.getElementById('btnPfPlaceInLevel')?.addEventListener('click', executeGenerationToLevel);

    document.getElementById('btnOptApplySafe')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) return alert(val.error);
      const profileKey = document.getElementById('optProfileSelect')?.value || 'balanced';
      const res = await window.ziroAPI.optimizerApply({
        targetProject: val.info.path,
        profileKey,
        customFlags: {
          worldPartition: document.getElementById('optWorldPart')?.checked,
          nanite: document.getElementById('optNanite')?.checked,
          hlod: document.getElementById('optHlod')?.checked,
          hismBatching: document.getElementById('optHism')?.checked
        }
      });
      document.getElementById('pfStatStatus').textContent = res.message;
    });

    document.getElementById('btnOptRevert')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) return alert(val.error);
      const res = await window.ziroAPI.optimizerRevert(val.info.path);
      document.getElementById('pfStatStatus').textContent = res.message;
    });
  }

  // =========================================================================
  // 3. ZIRO CHARACTER FUSION
  // =========================================================================
  async function setupCharacterFusionModule() {
    const abilities = await window.ziroAPI.fusionGetCatalog();
    const grid = document.getElementById('fusionAbilitiesGrid');
    if (grid && Array.isArray(abilities)) {
      grid.innerHTML = abilities.map((a) => `
        <label class="fs-anim-row" style="justify-content:flex-start;">
          <input type="checkbox" class="fusion-ab-cb" value="${a.id}" checked>
          <span>${a.name}</span>
        </label>
      `).join('');
    }

    document.getElementById('btnFusionScanActive')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) return alert(val.error);
      const scan = await window.ziroAPI.fusionScanProject(val.info.path);
      const list = document.getElementById('fusionPrimaryList');
      if (list && scan.characters) {
        list.innerHTML = scan.characters.length === 0
          ? '<div style="color:var(--color-text-dim);">No se hallaron SkeletalMesh SKM_/SK_ en Content/. Podés escribir el nombre manualmente arriba.</div>'
          : scan.characters.map((c) => `<div class="fs-anim-row" style="cursor:pointer;" data-chname="${c.name}" data-skel="${c.skeletonHint}"><span>🧍 ${c.name}</span><span style="font-size:10px;color:var(--ziro-secondary);">${c.skeletonHint}</span></div>`).join('');
        list.querySelectorAll('[data-chname]').forEach((row) => {
          row.addEventListener('click', () => {
            document.getElementById('fusionPrimaryName').value = row.dataset.chname;
            document.getElementById('fusionPrimarySkeleton').value = row.dataset.skel;
          });
        });
      }
    });

    const buildPayload = () => ({
      targetProject: activeProjectPath,
      primaryCharacter: {
        name: document.getElementById('fusionPrimaryName')?.value || 'Adrien Cross',
        skeletonHint: document.getElementById('fusionPrimarySkeleton')?.value || 'UE5_Manny'
      },
      secondarySources: Array.from(document.querySelectorAll('.fusion-src-cb:checked')).map((el) => ({
        name: el.value,
        skeletonHint: el.dataset.skel || 'UE5_Manny'
      })),
      selectedAbilities: Array.from(document.querySelectorAll('.fusion-ab-cb:checked')).map((el) => el.value),
      useIKRetargeter: Boolean(document.getElementById('chkFusionUseIK')?.checked)
    });

    const showReport = (html, ok = true) => {
      const box = document.getElementById('fusionReportBox');
      if (!box) return;
      box.style.display = 'block';
      box.style.color = ok ? 'var(--ziro-primary)' : '#ff6677';
      box.innerHTML = html;
    };

    document.getElementById('btnFusionAnalyze')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.fusionAnalyze(buildPayload());
      if (!res.success) return showReport(`✗ ${res.error || (res.issues || []).join(' | ')}`, false);
      const warns = (res.warnings || []).map((w) => `<div>⚠️ ${w}</div>`).join('');
      const steps = (res.steps || []).map((s) => `<div>✓ ${s.ability}: ${s.action}</div>`).join('');
      showReport(`<div><strong>Compatibilidad OK (Proyectos fuente intactos)</strong></div>${warns}${steps}`, true);
    });

    document.getElementById('btnFusionExecute')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.fusionExecute(buildPayload());
      showReport(res.message, res.success);
    });

    document.getElementById('btnFusionAddSourceProj')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.fusionBrowseSourceProject();
      if (!res || res.canceled) return;
      if (!res.success) return showReport(`✗ ${res.error || 'No se pudo leer el proyecto fuente.'}`, false);
      const list = document.getElementById('fusionSourcesList');
      if (list) {
        const skel = res.characters?.[0]?.skeletonHint || 'UE5_Manny';
        const row = document.createElement('label');
        row.className = 'fs-enemy-row';
        row.innerHTML = `<input type="checkbox" class="fusion-src-cb" value="${res.projectName}" data-skel="${skel}" checked> <span>${res.projectName} (${res.animations?.length || 0} anims, ${res.blueprints?.length || 0} BPs • Solo Lectura)</span>`;
        list.appendChild(row);
      }
      showReport(`✓ Fuente externa añadida (sin modificar): <strong>${res.projectName}</strong> (${res.characters?.length || 0} personajes, ${res.animations?.length || 0} animaciones, ${res.blueprints?.length || 0} Blueprints).`, true);
    });
  }

  // =========================================================================
  // 4. ZIRO FINISHER STUDIO + RANDOM FINISHER + AI ANIM EDITOR (IMAGEN 1)
  // =========================================================================
  let fsScene, fsCamera, fsRenderer, fsAttacker, fsVictim, fsPlaying = true, fsTime = 0.35;

  function initFs3D() {
    const canvas = document.getElementById('fs3dCanvas');
    if (!canvas || typeof THREE === 'undefined' || fsRenderer) return;
    fsRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    fsScene = new THREE.Scene();
    fsCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 100);
    fsCamera.position.set(3.2, 2.2, 4.2);
    fsCamera.lookAt(0, 1.0, 0);

    fsScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const spot = new THREE.DirectionalLight(0xff44aa, 1.3);
    spot.position.set(4, 6, 3);
    fsScene.add(spot, new THREE.GridHelper(10, 10, 0x00ff44, 0x222233));

    fsAttacker = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x00f0ff }));
    fsAttacker.position.set(-0.6, 0.9, 0);
    fsVictim = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff3b30 }));
    fsVictim.position.set(0.6, 0.9, 0);
    fsScene.add(fsAttacker, fsVictim);

    let drag = false, lx = 0, ly = 0, yaw = 0.65, dist = 5.0;
    canvas.addEventListener('mousedown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { drag = false; });
    canvas.addEventListener('mousemove', (e) => {
      if (!drag) return;
      yaw -= (e.clientX - lx) * 0.01;
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      dist = Math.max(2.2, Math.min(12, dist + e.deltaY * 0.01));
    }, { passive: false });

    const tick = () => {
      requestAnimationFrame(tick);
      if (fsPlaying) {
        fsTime = (fsTime + 0.008) % 1;
        const sc = document.getElementById('fsTimelineScrubber');
        if (sc) sc.value = Math.round(fsTime * 100);
        const tl = document.getElementById('fsTimeLabel');
        if (tl) tl.textContent = `${(fsTime * 3.0).toFixed(2)}s / 3.00s`;
      }
      // Pose sincronizada ejecutor-víctima
      const strike = Math.sin(fsTime * Math.PI);
      fsAttacker.position.x = -0.6 + strike * 0.45;
      fsAttacker.rotation.z = -strike * 0.25;
      fsVictim.position.x = 0.6 - strike * 0.1 + (fsTime > 0.7 ? (fsTime - 0.7) * 1.2 : 0);
      fsVictim.rotation.z = fsTime > 0.7 ? -(fsTime - 0.7) * 2.5 : strike * 0.15;

      fsCamera.position.set(Math.sin(yaw) * dist, 2.2, Math.cos(yaw) * dist);
      fsCamera.lookAt(0, 0.95, 0);
      fsRenderer.render(fsScene, fsCamera);
    };
    resizeFsCanvas();
    tick();
  }

  function resizeFsCanvas() {
    const c = document.getElementById('fs3dCanvas');
    if (!c || !fsRenderer || !fsCamera) return;
    const w = c.clientWidth || 440, h = c.clientHeight || 290;
    fsRenderer.setSize(w, h, false);
    fsCamera.aspect = w / Math.max(1, h);
    fsCamera.updateProjectionMatrix();
  }

  function selectFinisherAnim(idx) {
    if (!finisherAnimations.length) return;
    selectedFinisherAnimIdx = ((idx % finisherAnimations.length) + finisherAnimations.length) % finisherAnimations.length;
    const chosen = finisherAnimations[selectedFinisherAnimIdx];
    renderFinisherAnimations();
    const cap = document.getElementById('fsStageCaption');
    if (cap && chosen) {
      cap.textContent = `${chosen.name}${fsCompareMode ? ' [Comparando Original vs Variante]' : ''} — Cámara Libre (Arrastrar / Rueda)`;
    }
    addFsLog(`Previsualizando animación ${chosen?.name || idx}`);
  }

  function renderFinisherEnemies() {
    const el = document.getElementById('fsEnemiesList');
    if (!el) return;
    const limit = Math.min(10, Math.max(1, Number(document.getElementById('fsEnemyLimitSelect')?.value || 10)));
    el.innerHTML = finisherEnemies.slice(0, limit).map((en, i) => `
      <div class="fs-enemy-row">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1; overflow:hidden;">
          <input type="checkbox" class="fs-en-cb" data-idx="${i}" ${en.enabled ? 'checked' : ''}>
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${en.name}</span>
        </label>
        <div style="display:flex; align-items:center; gap:4px;">
          <span style="font-size:10px; color:${en.compatible === false ? '#ff5566' : 'var(--ziro-indicator)'};" title="${en.compatibilityReport || ''}">
            ${en.compatible === false ? '⚠️' : '✓'}
          </span>
          <button type="button" class="fs-en-edit" data-idx="${i}" style="background:none;border:none;color:var(--ziro-secondary);cursor:pointer;font-size:11px;" title="Alternar esqueleto/escala">✏️</button>
          <button type="button" class="fs-en-del" data-idx="${i}" style="background:none;border:none;color:#ff6677;cursor:pointer;font-size:11px;" title="Quitar objetivo">🗑️</button>
        </div>
      </div>
    `).join('');
    el.querySelectorAll('.fs-en-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        finisherEnemies[Number(cb.dataset.idx)].enabled = cb.checked;
      });
    });
    el.querySelectorAll('.fs-en-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const en = finisherEnemies[idx];
        if (!en) return;
        en.scale = en.scale === 1.0 ? 1.18 : (en.scale > 1.3 ? 1.0 : 1.65);
        en.skeleton = en.scale > 1.3 ? 'SK_Brute_Custom' : (en.scale > 1.1 ? 'SK_Mannequin_Large' : 'SK_Mannequin');
        addFsLog(`Objetivo '${en.name}' ajustado a escala ${en.scale}x (${en.skeleton}). Pulsa Verificar Compatibilidad.`);
        renderFinisherEnemies();
      });
    });
    el.querySelectorAll('.fs-en-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        finisherEnemies.splice(idx, 1);
        renderFinisherEnemies();
      });
    });
  }

  function renderFinisherAnimations() {
    const el = document.getElementById('fsAnimationsList');
    const strip = document.getElementById('fsThumbsStrip');
    const cnt = document.getElementById('fsAnimCount');
    if (cnt) cnt.textContent = String(finisherAnimations.length);

    if (el) {
      el.innerHTML = finisherAnimations.map((a, idx) => `
        <div class="fs-anim-row ${idx === selectedFinisherAnimIdx ? 'active' : ''}" data-idx="${idx}" data-anim="${a.name}">
          <span>▶ ${a.name}</span>
          <input type="checkbox" class="fs-anim-cb" data-idx="${idx}" ${a.enabled !== false ? 'checked' : ''}>
        </div>
      `).join('');
      el.querySelectorAll('.fs-anim-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.type === 'checkbox') return;
          selectFinisherAnim(Number(row.dataset.idx));
        });
      });
      el.querySelectorAll('.fs-anim-cb').forEach((cb) => {
        cb.addEventListener('change', () => {
          finisherAnimations[Number(cb.dataset.idx)].enabled = cb.checked;
        });
      });
    }
    if (strip) {
      strip.innerHTML = finisherAnimations.slice(0, 5).map((a, idx) => `
        <div class="fs-thumb ${idx === selectedFinisherAnimIdx ? 'active' : ''}" data-idx="${idx}" data-anim="${a.name}">F0${idx + 1}</div>
      `).join('');
      strip.querySelectorAll('.fs-thumb').forEach((th) => {
        th.addEventListener('click', () => selectFinisherAnim(Number(th.dataset.idx)));
      });
    }
  }

  function setupFinisherStudioModule() {
    initFs3D();
    finisherEnemies = (modSettings?.finisherConfig?.enemies || []).slice(0, 10);
    finisherAnimations = Array.from({ length: 10 }, (_, i) => ({
      id: `anim_${i + 1}`,
      name: `Finisher_${String(i + 1).padStart(2, '0')}`,
      compatible: true,
      enabled: true
    }));

    renderFinisherEnemies();
    renderFinisherAnimations();

    document.getElementById('btnFsPopout')?.addEventListener('click', () => {
      window.ziroAPI.openModuleWindow('finisher');
    });

    document.querySelectorAll('.fs-subview-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fs-subview-btn').forEach((b) => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        const view = btn.dataset.fsview;
        const banner = document.getElementById('fsSubviewBanner');
        if (!banner) return;
        if (view === 'config' || view === 'preview') {
          banner.style.display = 'none';
          return;
        }
        banner.style.display = 'block';
        if (view === 'library') {
          banner.innerHTML = `<strong>📁 Biblioteca Activa:</strong> ${document.getElementById('fsPackPathInput')?.value || '-'} (${finisherAnimations.length} animaciones cargadas, Root Motion listo para UE 5.8).`;
        } else if (view === 'retarget') {
          const exec = document.getElementById('fsExecutorSelect')?.value || 'Adrien Cross';
          banner.innerHTML = `<strong>🦴 IK Rig / IK Retargeter:</strong> Ejecutor <code>${exec}</code> ↔ ${finisherEnemies.length} objetivo(s). Mantiene animación del ejecutor y adapta víctima según proporciones.`;
        } else if (view === 'logs') {
          banner.innerHTML = `<strong>📄 Logs Finisher Studio:</strong><br><div style="max-height:80px;overflow-y:auto;font-family:var(--font-mono);font-size:10.5px;">${fsLogs.join('<br>')}</div>`;
        }
      });
    });

    document.getElementById('btnFsPrevAnim')?.addEventListener('click', () => selectFinisherAnim(selectedFinisherAnimIdx - 1));
    document.getElementById('btnFsNextAnim')?.addEventListener('click', () => selectFinisherAnim(selectedFinisherAnimIdx + 1));

    document.getElementById('btnFsCompareToggle')?.addEventListener('click', () => {
      fsCompareMode = !fsCompareMode;
      if (fsVictim?.material?.color) {
        fsVictim.material.color.setHex(fsCompareMode ? 0xffbb33 : 0xff3b30);
      }
      selectFinisherAnim(selectedFinisherAnimIdx);
    });

    document.getElementById('fsEnemyLimitSelect')?.addEventListener('change', renderFinisherEnemies);

    document.getElementById('btnFsAddEnemy')?.addEventListener('click', () => {
      const limit = Math.min(10, Math.max(1, Number(document.getElementById('fsEnemyLimitSelect')?.value || 10)));
      if (finisherEnemies.length >= limit) return alert(`Límite configurado: máximo ${limit} enemigos en Multi-Target Finisher.`);
      const n = (document.getElementById('fsNewEnemyName')?.value || '').trim();
      if (!n) return;
      finisherEnemies.push({ id: `enemy_${Date.now()}`, name: n, skeleton: 'SK_Mannequin', scale: 1.0, compatible: true, enabled: true });
      document.getElementById('fsNewEnemyName').value = '';
      addFsLog(`Enemigo añadido: ${n}`);
      renderFinisherEnemies();
    });

    document.getElementById('btnFsEvalCompat')?.addEventListener('click', async () => {
      const execName = document.getElementById('fsExecutorSelect')?.value || 'Adrien Cross';
      finisherEnemies = await window.ziroAPI.finisherEvaluateTargets({
        executor: { name: execName, scale: 1.0, skeleton: 'SK_Mannequin' },
        enemies: finisherEnemies,
        animations: finisherAnimations
      });
      renderFinisherEnemies();
      addFsLog(`Compatibilidad Multi-Target verificada para ${execName}`);
      document.getElementById('fsStatusText').textContent = 'Compatibilidad Multi-Target verificada (revisa ⚠️ si hay proporciones incompatibles).';
    });

    document.getElementById('btnFsBrowsePack')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.finisherBrowsePack();
      if (res && !res.canceled) {
        if (res.packFolder) document.getElementById('fsPackPathInput').value = res.packFolder;
        if (res.animations && res.animations.length > 0) finisherAnimations = res.animations;
        renderFinisherAnimations();
        addFsLog(res.message);
        document.getElementById('fsStatusText').textContent = res.message;
      }
    });

    document.getElementById('btnFsPlayPause')?.addEventListener('click', () => { fsPlaying = !fsPlaying; });
    document.getElementById('btnFsPreviewAction')?.addEventListener('click', () => { fsPlaying = true; selectFinisherAnim(selectedFinisherAnimIdx); });
    document.getElementById('btnFsStop')?.addEventListener('click', () => { fsPlaying = false; fsTime = 0; });
    document.getElementById('btnFsStepBack')?.addEventListener('click', () => { fsPlaying = false; fsTime = Math.max(0, fsTime - 0.03); });
    document.getElementById('btnFsStepFwd')?.addEventListener('click', () => { fsPlaying = false; fsTime = Math.min(1, fsTime + 0.03); });
    document.getElementById('fsTimelineScrubber')?.addEventListener('input', (e) => {
      fsPlaying = false;
      fsTime = Number(e.target.value) / 100;
    });

    document.getElementById('fsHotkeyInput')?.addEventListener('input', (e) => {
      const k = e.target.value.toUpperCase() || 'Ñ';
      document.getElementById('lblFsKeyDemo').textContent = k;
    });
    document.getElementById('btnFsCaptureKey')?.addEventListener('click', () => {
      fsCapturingKey = true;
      document.getElementById('fsStatusText').textContent = 'Presiona cualquier tecla para asignarla como Tecla de Finisher Aleatorio...';
      const onceKey = (ev) => {
        if (!fsCapturingKey) return;
        fsCapturingKey = false;
        const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
        document.getElementById('fsHotkeyInput').value = k;
        document.getElementById('lblFsKeyDemo').textContent = k;
        document.getElementById('fsStatusText').textContent = `✓ Tecla de ejecución configurada: '${k}'`;
        window.removeEventListener('keydown', onceKey);
      };
      window.addEventListener('keydown', onceKey);
    });

    document.getElementById('btnFsTestRandomKey')?.addEventListener('click', async () => {
      const enabledEnemies = finisherEnemies.filter((e) => e.enabled);
      const targetEnemy = enabledEnemies[0] || finisherEnemies[0];
      const res = await window.ziroAPI.finisherPickRandom({
        animations: finisherAnimations,
        enemy: targetEnemy,
        mode: document.getElementById('fsRandomMode')?.value || 'shuffle_bag',
        noConsecutive: document.getElementById('chkFsNoRepeat')?.checked,
        compatibleOnly: document.getElementById('chkFsCompatOnly')?.checked
      });
      if (res.success && res.selected) {
        const idxFound = finisherAnimations.findIndex((a) => a.id === res.selected.id);
        if (idxFound >= 0) selectedFinisherAnimIdx = idxFound;
        renderFinisherAnimations();
        document.getElementById('fsStageCaption').textContent = `🔀 Tecla '${document.getElementById('fsHotkeyInput')?.value || 'Ñ'}' → ${res.selected.name} vs ${targetEnemy?.name || 'Enemigo'} (Restantes en Shuffle Bag: ${res.remainingInBag})`;
        addFsLog(`Random '${document.getElementById('fsRandomMode')?.value}' → ${res.selected.name}`);
      } else {
        alert(res.reason);
      }
    });

    document.getElementById('btnFsAiPropose')?.addEventListener('click', async () => {
      const instruction = document.getElementById('fsAiInstructionInput')?.value || '';
      const activeAnimName = finisherAnimations[selectedFinisherAnimIdx]?.name || 'Finisher_03';
      const box = document.getElementById('fsAiVariantBox');
      if (box) { box.style.display = 'block'; box.textContent = '⏳ Interpretando instrucción 3D (LM Studio / Skeletal Delta)...'; }
      const res = await window.ziroAPI.finisherAiPropose({
        instruction,
        animationName: activeAnimName,
        executor: document.getElementById('fsExecutorSelect')?.value || 'Adrien Cross'
      });
      if (res && res.success && res.variant) {
        proposedAiVariant = res.variant;
        box.innerHTML = `
          <div><strong>Variante propuesta (Original preservada):</strong> ${res.variant.variant_name} | <em>${res.variant.motion_model}</em></div>
          <div>${res.variant.summary}</div>
          <div>⚠️ Riesgo Clipping: ${res.variant.clipping_risk} | Ajustes manuales: ${(res.variant.manual_adjustments_required || []).join('; ')}</div>
        `;
        addFsLog(`AI Variante propuesta: ${res.variant.variant_name}`);
      } else if (box) {
        box.textContent = res?.error || 'Error proponiendo variante.';
      }
    });

    document.getElementById('btnFsApplyVariant')?.addEventListener('click', () => {
      if (!proposedAiVariant) return alert('Primero proponé una variante 3D con el ZIRO AI Animation Editor.');
      appliedAiVariant = proposedAiVariant;
      addFsLog(`Variante aplicada para preview/integración: ${appliedAiVariant.variant_name}`);
      document.getElementById('fsStatusText').textContent = `✓ Variante '${appliedAiVariant.variant_name}' confirmada para integración (original intacta).`;
    });

    document.getElementById('btnFsGenerateIntegrate')?.addEventListener('click', async () => {
      const val = await window.ziroAPI.pmValidateActive();
      if (!val.valid) return alert(val.error);
      if (!confirm(`¿Generar e integrar Random Finisher Studio en "${val.info.name}"?`)) return;
      const res = await window.ziroAPI.finisherIntegrate({
        targetProject: val.info.path,
        variant: appliedAiVariant,
        config: {
          hotkey: document.getElementById('fsHotkeyInput')?.value || 'Ñ',
          enabled: document.getElementById('chkFsRandomEnabled')?.checked,
          randomMode: document.getElementById('fsRandomMode')?.value || 'shuffle_bag',
          noConsecutiveRepeat: document.getElementById('chkFsNoRepeat')?.checked,
          compatibleOnly: document.getElementById('chkFsCompatOnly')?.checked,
          customProbabilities: document.getElementById('chkFsCustomProb')?.checked,
          enemyLimit: Number(document.getElementById('fsEnemyLimitSelect')?.value || 10),
          executor: document.getElementById('fsExecutorSelect')?.value || 'Adrien Cross',
          enemies: finisherEnemies,
          animations: finisherAnimations,
          options: {
            autoRetargeting: document.getElementById('chkFsOptRetarget')?.checked,
            syncAnimations: document.getElementById('chkFsOptSync')?.checked,
            createMontagesBP: document.getElementById('chkFsOptBP')?.checked,
            integrateGAS: document.getElementById('chkFsOptGAS')?.checked
          }
        }
      });
      addFsLog(res.message);
      document.getElementById('fsStatusText').textContent = res.message;
    });

    document.getElementById('btnFsExportPack')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.finisherExportPack({
        variant: appliedAiVariant,
        config: {
          hotkey: document.getElementById('fsHotkeyInput')?.value || 'Ñ',
          randomMode: document.getElementById('fsRandomMode')?.value || 'shuffle_bag',
          executor: document.getElementById('fsExecutorSelect')?.value || 'Adrien Cross',
          enemies: finisherEnemies,
          animations: finisherAnimations
        }
      });
      addFsLog(res.message);
      document.getElementById('fsStatusText').textContent = res.message;
    });

    document.getElementById('btnFsSaveConfig')?.addEventListener('click', async () => {
      modSettings.finisherConfig = {
        ...(modSettings.finisherConfig || {}),
        hotkey: document.getElementById('fsHotkeyInput')?.value || 'Ñ',
        randomMode: document.getElementById('fsRandomMode')?.value || 'shuffle_bag',
        enemies: finisherEnemies
      };
      await window.ziroAPI.saveSettings(modSettings);
      addFsLog('Configuración de Finisher Studio guardada en ziro_config.json');
      document.getElementById('fsStatusText').textContent = '✓ Configuración de Finisher Studio guardada.';
    });
  }

  // =========================================================================
  // 5. ZIRO SYSTEM SCANNER
  // =========================================================================
  async function runSystemScannerUI() {
    const sumEl = document.getElementById('scannerSummaryText');
    const recBox = document.getElementById('scannerRecommendationBox');
    const grid = document.getElementById('scannerResultsGrid');
    const ggufEl = document.getElementById('scannerGgufList');
    const plugEl = document.getElementById('scannerPluginsList');
    if (sumEl) sumEl.textContent = '⏳ Escaneando discos disponibles (C:, D:, E:, F:...)...';

    const rep = await window.ziroAPI.runSystemScanner();
    if (!rep) return;

    if (sumEl) sumEl.textContent = `✓ Discos escaneados: ${(rep.drives || []).join(' ')} (${rep.elapsedMs} ms)`;
    if (recBox) {
      recBox.style.display = 'block';
      recBox.textContent = rep.recommendation;
    }
    if (grid) {
      grid.innerHTML = (rep.tools || []).map((t) => `
        <div class="pf-panel" style="border-color:${t.installed ? 'var(--ziro-primary)' : 'rgba(255,100,100,0.4)'};">
          <div style="display:flex; justify-content:space-between; font-weight:700;">
            <span>${t.installed ? '✅' : '⚠️'} ${t.name}</span>
            <span style="font-size:10px; color:${t.reusable ? 'var(--ziro-indicator)' : '#ff7777'};">${t.reusable ? 'REUTILIZABLE' : 'NO DETECTADO'}</span>
          </div>
          <div style="font-size:11px; color:var(--ziro-secondary); margin-top:4px;">${t.version}</div>
          <div style="font-size:10px; color:var(--color-text-dim); font-family:var(--font-mono); margin-top:2px; word-break:break-all;">${t.path || '-'}</div>
        </div>
      `).join('');
    }
    if (ggufEl) {
      ggufEl.innerHTML = (rep.ggufModels || []).length === 0
        ? 'No se hallaron modelos .gguf.'
        : rep.ggufModels.map((m) => `<div>🧠 ${m.name} (${m.sizeMb} MB) — <span style="color:var(--color-text-dim);">${m.path}</span></div>`).join('');
    }
    if (plugEl) {
      const pluginsHtml = (rep.uplugins || []).map((p) => `<div>🔌 ${p.name} — ${p.path}</div>`).join('');
      const venvsHtml = (rep.venvs || []).map((v) => `<div>🐍 .venv — ${v.path}</div>`).join('');
      plugEl.innerHTML = pluginsHtml + venvsHtml || 'Sin plugins/venvs detectados.';
    }
  }

  // =========================================================================
  // 6. ZIRO GAMING VOICE CONTROL (Steam & CS2)
  // =========================================================================
  async function setupGamingVoiceControlModule() {
    if (!window.ziroAPI?.gamingGetState) return;
    let latestState = await window.ziroAPI.gamingGetState();

    const renderGamingState = (st) => {
      if (!st) return;
      latestState = st;

      const steamEl = document.getElementById('gSteamStatus');
      const steamPathEl = document.getElementById('gSteamPath');
      if (steamEl) {
        steamEl.textContent = st.steamRunning ? '🟢 ABIERTO' : (st.steamInstalled ? '⚪ CERRADO' : '🔴 NO INSTALADO');
        steamEl.style.color = st.steamRunning ? '#00ff88' : (st.steamInstalled ? '#cccccc' : '#ff5555');
      }
      if (steamPathEl) steamPathEl.textContent = st.steamPath || 'No detectado';

      const cs2El = document.getElementById('gCs2Status');
      const cs2DetEl = document.getElementById('gCs2Detail');
      if (cs2El) {
        cs2El.textContent = st.cs2Running ? '🟢 EN EJECUCIÓN' : (st.cs2Installed ? '⚪ DETENIDO' : '🔴 NO INSTALADO');
        cs2El.style.color = st.cs2Running ? '#00ff88' : (st.cs2Installed ? '#cccccc' : '#ff5555');
      }
      if (cs2DetEl) {
        cs2DetEl.textContent = st.cs2Running
          ? (st.cs2WindowFound ? 'Ventana CS2 detectada • AppID 730' : 'Proceso cs2.exe activo • AppID 730')
          : (st.cs2Installed ? 'Instalado • AppID 730' : 'CS2 no encontrado');
      }

      const voiceEl = document.getElementById('gVoiceStatus');
      if (voiceEl) {
        voiceEl.textContent = st.voiceRecognitionActive ? '🎙️ ACTIVO (LiveKit)' : '⏸️ PAUSADO';
      }

      const gmEl = document.getElementById('gGamingModeStatus');
      if (gmEl) {
        gmEl.textContent = st.gamingModeActive ? '🔥 ACTIVO (En partida)' : 'Standby';
        gmEl.style.color = st.gamingModeActive ? '#00ff88' : '#ffaa44';
      }

      const silentEl = document.getElementById('gPetSilentStatus');
      if (silentEl) {
        silentEl.textContent = st.petSilentMode ? '🔇 SILENCIOSA' : '🔊 ACTIVA';
        silentEl.style.color = st.petSilentMode ? '#ffaa44' : '#00ff88';
      }

      const queueEl = document.getElementById('gQueueStatus');
      if (queueEl) {
        queueEl.textContent = st.currentTask ? `⏳ ${st.currentTask}` : 'Libre';
      }

      const cfgAuto = document.getElementById('gCfgAutoGaming');
      const cfgChatter = document.getElementById('gCfgReduceChatter');
      const cfgPopups = document.getElementById('gCfgNoPopups');
      const cfgConfirm = document.getElementById('gCfgConfirmClose');
      if (st.config) {
        if (cfgAuto) cfgAuto.checked = Boolean(st.config.autoGamingMode);
        if (cfgChatter) cfgChatter.checked = Boolean(st.config.reduceChatterInGame);
        if (cfgPopups) cfgPopups.checked = Boolean(st.config.preventPopupsInGame);
        if (cfgConfirm) cfgConfirm.checked = Boolean(st.config.confirmBeforeClose);
      }

      const histEl = document.getElementById('gHistoryList');
      if (histEl && Array.isArray(st.commandHistory)) {
        if (st.commandHistory.length === 0) {
          histEl.innerHTML = '<div style="color:var(--color-text-dim);">Aún no se han ejecutado comandos gaming en esta sesión.</div>';
        } else {
          histEl.innerHTML = st.commandHistory.map((h) => `
            <div class="pf-panel" style="padding:7px 9px; border-color:${h.status === 'OK' ? 'rgba(0,255,136,0.35)' : 'rgba(255,100,100,0.4)'};">
              <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span>${h.status === 'OK' ? '✅' : (h.status === 'CANCELADO' ? '⛔' : '⚠️')} ${h.command}</span>
                <span style="font-size:10px; color:var(--color-text-dim);">${h.time} • ${h.source}</span>
              </div>
              <div style="font-size:10.5px; color:var(--ziro-secondary); margin-top:2px;">${h.detail || h.status}</div>
            </div>
          `).join('');
        }
      }
    };

    renderGamingState(latestState);
    window.ziroAPI.onGamingStateUpdated(renderGamingState);

    document.getElementById('btnGamingRefresh')?.addEventListener('click', async () => {
      const st = await window.ziroAPI.gamingRefreshStatus();
      renderGamingState(st);
    });

    document.getElementById('btnGamingCancel')?.addEventListener('click', async () => {
      const res = await window.ziroAPI.gamingCancelAction();
      const msgEl = document.getElementById('gLastActionMsg');
      if (msgEl) msgEl.textContent = res.message;
    });

    document.getElementById('btnGamingToggleSilent')?.addEventListener('click', async () => {
      const nextSilent = !latestState?.petSilentMode;
      const st = await window.ziroAPI.gamingSetSilentMode(nextSilent);
      renderGamingState(st);
    });

    document.querySelectorAll('.g-action-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-gaction');
        const label = btn.getAttribute('data-glabel') || action;
        const needsConfirm = btn.getAttribute('data-gconfirm') === '1' && latestState?.config?.confirmBeforeClose;
        if (needsConfirm && !confirm(`¿Confirmar acción: ${label}?`)) return;
        const msgEl = document.getElementById('gLastActionMsg');
        if (msgEl) msgEl.textContent = `⏳ Ejecutando: ${label}...`;
        const res = await window.ziroAPI.gamingExecuteAction({ action, label, source: 'panel' });
        if (msgEl) msgEl.textContent = res?.message || 'Listo.';
      });
    });

    const syncCfg = () => {
      window.ziroAPI.gamingSetConfig({
        autoGamingMode: document.getElementById('gCfgAutoGaming')?.checked,
        reduceChatterInGame: document.getElementById('gCfgReduceChatter')?.checked,
        preventPopupsInGame: document.getElementById('gCfgNoPopups')?.checked,
        confirmBeforeClose: document.getElementById('gCfgConfirmClose')?.checked
      });
    };
    ['gCfgAutoGaming', 'gCfgReduceChatter', 'gCfgNoPopups', 'gCfgConfirmClose'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', syncCfg);
    });
  }

  // =========================================================================
  // 7. NATURAL CONVERSATION DIAGNOSTICS & TTS BENCHMARK
  // =========================================================================
  function setupVoiceDiagnosticsModule() {
    const setMs = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val !== undefined && val !== null && val > 0) ? `${val} ms` : '-- ms';
    };

    if (window.ziroAPI?.onVoiceDiagnosticsUpdated) {
      window.ziroAPI.onVoiceDiagnosticsUpdated((m) => {
        if (!m) return;
        setMs('dDiagVadMs', m.vadMs);
        setMs('dDiagSttMs', m.sttMs);
        setMs('dDiagLlmMs', m.llmMs);
        setMs('dDiagFirstTextMs', m.firstTextMs);
        setMs('dDiagTtsMs', m.ttsMs);
        setMs('dDiagFirstAudioMs', m.firstAudioMs);
        setMs('dDiagTotalMs', m.totalMs);
        const b = document.getElementById('voiceDiagLiveBadge');
        if (b && m.engine) b.textContent = String(m.engine).toUpperCase();
      });
    }

    document.getElementById('btnRunTtsBenchmark')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('ttsBenchStatus');
      const resEl = document.getElementById('ttsBenchResults');
      if (!window.ziroAPI?.runTtsBenchmark) return;
      if (statusEl) statusEl.textContent = '⏳ Ejecutando benchmark real con 3 frases en español argentino...';
      if (resEl) resEl.innerHTML = '';

      const rep = await window.ziroAPI.runTtsBenchmark();
      if (rep && rep.success && Array.isArray(rep.results)) {
        if (statusEl) statusEl.textContent = `✓ Benchmark completado (${rep.testedAt})`;
        if (resEl) {
          resEl.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <thead>
                <tr style="border-bottom:1px solid rgba(0,255,136,0.3); text-align:left; color:var(--ziro-secondary);">
                  <th style="padding:6px;">Motor TTS</th>
                  <th style="padding:6px;">Latencia 1er Audio</th>
                  <th style="padding:6px;">Tiempo Total Promedio</th>
                  <th style="padding:6px;">Naturalidad / Estado</th>
                  <th style="padding:6px;">RAM / GPU</th>
                </tr>
              </thead>
              <tbody>
                ${rep.results.map((r) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                    <td style="padding:6px; font-weight:700; color:#fff;">${r.engine}</td>
                    <td style="padding:6px; color:#00ff88; font-weight:700;">${r.firstAudioMs !== null ? r.firstAudioMs + ' ms' : 'N/D'}</td>
                    <td style="padding:6px; color:#00e5ff;">${r.totalMs !== null ? r.totalMs + ' ms' : 'N/D'}</td>
                    <td style="padding:6px;">${r.naturalness}</td>
                    <td style="padding:6px; color:var(--color-text-dim);">${r.ramMb} MB • ${r.gpu}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
      } else {
        if (statusEl) statusEl.textContent = '⚠️ Error al ejecutar benchmark.';
      }
    });
  }

  // =========================================================================
  // BOOTSTRAP GLOBAL
  // =========================================================================
  window.addEventListener('DOMContentLoaded', async () => {
    modSettings = await window.ziroAPI.getSettings();
    syncMascotVisuals(modSettings);
    const activeProj = modSettings?.projectManager?.activeProjectPath || '';
    updateProjectDestinationUI(activeProj);

    if (IS_STANDALONE && STANDALONE_MODULE === 'procedural') {
      document.body.classList.add('standalone-procedural');
    }

    document.getElementById('btnBackHome')?.addEventListener('click', () => {
      if (IS_STANDALONE) window.ziroAPI.goHomeInDashboard('tab-home');
      else switchToTab('tab-home');
    });
    document.getElementById('hudProjectPill')?.addEventListener('click', () => {
      if (!IS_STANDALONE && document.getElementById('chkDetachModulesDefault')?.checked) {
        window.ziroAPI.openModuleWindow('procedural');
      } else {
        switchToTab('tab-procedural');
      }
    });
    document.getElementById('btnHomePickProject')?.addEventListener('click', () => {
      if (document.getElementById('chkDetachModulesDefault')?.checked) window.ziroAPI.openModuleWindow('procedural');
      else switchToTab('tab-procedural');
    });
    document.getElementById('btnHomeScanSystem')?.addEventListener('click', () => {
      if (document.getElementById('chkDetachModulesDefault')?.checked) {
        window.ziroAPI.openModuleWindow('scanner');
      } else {
        switchToTab('tab-scanner');
        runSystemScannerUI();
      }
    });
    document.getElementById('btnHomeOpenAppearance')?.addEventListener('click', () => switchToTab('tab-appearance'));

    // Botones de navegación en Inicio y barra lateral con apertura en nueva ventana aparte
    document.querySelectorAll('[data-popout]').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        window.ziroAPI.openModuleWindow(badge.getAttribute('data-popout'));
      });
    });

    document.querySelectorAll('.nav-tab[data-standalone-module]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('[data-popout]')) return;
        const mod = btn.getAttribute('data-standalone-module');
        const detachOn = !IS_STANDALONE && document.getElementById('chkDetachModulesDefault')?.checked;
        if (detachOn && mod) {
          window.ziroAPI.openModuleWindow(mod);
          setTimeout(() => switchToTab('tab-home'), 20);
        }
      });
    });

    document.querySelectorAll('[data-jump-tab]').forEach((t) => {
      t.addEventListener('click', () => {
        const targetTab = t.getAttribute('data-jump-tab') || '';
        const modName = targetTab.replace(/^tab-/, '');
        if (!IS_STANDALONE && document.getElementById('chkDetachModulesDefault')?.checked && ['procedural', 'fusion', 'finisher', 'scanner'].includes(modName)) {
          window.ziroAPI.openModuleWindow(modName);
        } else {
          switchToTab(targetTab);
        }
      });
    });

    document.getElementById('btnPopoutActiveModule')?.addEventListener('click', () => {
      const curActive = document.querySelector('.tab-pane.active')?.id || 'tab-procedural';
      const modName = curActive.replace(/^tab-/, '');
      const valid = ['procedural', 'finisher', 'fusion', 'scanner', 'appearance'].includes(modName) ? modName : 'procedural';
      window.ziroAPI.openModuleWindow(valid);
    });

    // Quick voice/text prompt from Inicio
    document.getElementById('btnHomeSendPrompt')?.addEventListener('click', async () => {
      const inp = document.getElementById('homeQuickPromptInput');
      const txt = (inp?.value || '').trim();
      if (!txt) return;
      document.getElementById('homeMascotSpeech').textContent = `Procesando: "${txt}"...`;
      const res = await window.ziroAPI.sendMessage(txt);
      if (res && (res.reply || res.message)) {
        document.getElementById('homeMascotSpeech').textContent = res.reply || res.message;
      }
      inp.value = '';
    });

    // Listen to global settings updates to sync active mascot / theme / active project live across all windows
    window.ziroAPI.onSettingsUpdated((s) => {
      modSettings = s;
      syncMascotVisuals(s);
      if (s.uiTheme) applyThemeToDOM(s.uiTheme);
      const p = s?.projectManager?.activeProjectPath || '';
      updateProjectDestinationUI(p);
    });

    document.getElementById('btnRunSystemScan')?.addEventListener('click', runSystemScannerUI);

    setupAppearanceModule();
    setupProceduralModule();
    setupCharacterFusionModule();
    setupFinisherStudioModule();
    setupGamingVoiceControlModule();
    setupVoiceDiagnosticsModule();

    // Integrated Frameless Window Controls
    ['btnWinMin', 'btnPfWinMin'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => window.ziroAPI?.minimizeWindow?.());
    });
    ['btnWinMax', 'btnPfWinMax'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => window.ziroAPI?.maximizeWindow?.());
    });
    ['btnWinClose', 'btnPfWinClose'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => window.ziroAPI?.closeWindow?.());
    });

    const initialTab = urlParams.get('tab') || (STANDALONE_MODULE ? `tab-${STANDALONE_MODULE}` : '');
    if (initialTab) {
      switchToTab(initialTab);
    }
  });
})();
