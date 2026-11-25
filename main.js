const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const configService = require('./src/services/configService');
const commandService = require('./src/services/commandService');
const aiService = require('./src/services/aiService');
const petImageService = require('./src/services/petImageService');
const transcribeService = require('./src/services/transcribeService');
const ttsService = require('./src/services/ttsService');
const unrealService = require('./src/services/unrealService');
const comfyService = require('./src/services/comfyService');
const livekitService = require('./src/services/livekitService');
const architectureService = require('./src/services/architectureService');
const bgRemovalService = require('./src/services/bgRemovalService');
const systemScannerService = require('./src/services/systemScannerService');
const projectManagerService = require('./src/services/projectManagerService');
const characterFusionService = require('./src/services/characterFusionService');
const finisherStudioService = require('./src/services/finisherStudioService');
const unrealOptimizerService = require('./src/services/unrealOptimizerService');
const gamingVoiceService = require('./src/services/gamingVoiceService');

// Auto-grant media and device permissions to the desktop pet
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let petWindow = null;
let dashboardWindow = null;
let visualizerWindow = null;
let explorerWindow = null;
const moduleWindows = {};
let localBridgeServer = null;
let tray = null;
let currentSettings = null;

function broadcastSettingsUpdate(settingsObj) {
  if (!settingsObj) return;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('settings:updated', settingsObj);
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('settings:updated', settingsObj);
  }
  for (const win of Object.values(moduleWindows)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', settingsObj);
    }
  }
}

function getAppIcon() {
  const fs = require('fs');
  const icoPath = path.join(__dirname, 'src', 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'src', 'assets', 'icon.png');
  const target = (process.platform === 'win32' && fs.existsSync(icoPath)) ? icoPath : pngPath;
  return nativeImage.createFromPath(target);
}

function setupPermissions() {
  // Authorize full PC permissions: media, audio-capture, notifications, openExternal
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);
}

function createPetWindow() {
  currentSettings = configService.loadConfig();
  commandService.setCustomCommands(currentSettings.customCommands || []);
  if (currentSettings.projectManager?.activeProjectPath && require('fs').existsSync(currentSettings.projectManager.activeProjectPath)) {
    unrealService.configure({
      ...(currentSettings.unrealConfig || {}),
      uprojectPath: currentSettings.projectManager.activeProjectPath,
      ziroHostDir: path.dirname(currentSettings.projectManager.activeProjectPath)
    });
    architectureService.activeProject = currentSettings.projectManager.activeProjectPath;
  } else {
    // Nunca usar ZiroHost como destino automático si no hay proyecto activo válido
    unrealService.configure({
      host: currentSettings.unrealConfig?.host || '127.0.0.1',
      port: currentSettings.unrealConfig?.port || 8765
    });
    architectureService.activeProject = '';
  }
  if (currentSettings.livekitConfig) {
    livekitService.configure(currentSettings.livekitConfig);
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = 360;
  const winHeight = 500;

  let initialX = width - winWidth - 30;
  let initialY = height - winHeight - 30;

  if (currentSettings.appearance && currentSettings.appearance.windowPosition) {
    const { x, y } = currentSettings.appearance.windowPosition;
    if (typeof x === 'number' && typeof y === 'number') {
      initialX = x;
      initialY = y;
    }
  }

  petWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: initialX,
    y: initialY,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: currentSettings.appearance?.alwaysOnTop ?? true,
    skipTaskbar: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      enableBlinkFeatures: 'AudioOutputDevices'
    }
  });

  petWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'pet.html'));

  petWindow.on('moved', () => {
    if (!petWindow) return;
    const [x, y] = petWindow.getPosition();
    currentSettings.appearance.windowPosition = { x, y };
    configService.saveConfig(currentSettings);
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createDashboardWindow(initialTab = '') {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.focus();
    if (initialTab) {
      dashboardWindow.webContents.executeJavaScript(`window.ziroSwitchTab && window.ziroSwitchTab(${JSON.stringify(initialTab)})`).catch(() => {});
    }
    return dashboardWindow;
  }

  dashboardWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    title: 'ZIRO AI PET — Plataforma Futurista de Desarrollo & UE 5.8',
    backgroundColor: '#040608',
    icon: getAppIcon(),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: 'AudioOutputDevices'
    }
  });

  const query = initialTab ? { tab: initialTab } : {};
  dashboardWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'dashboard.html'), { query });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
  return dashboardWindow;
}

function createModuleWindow(moduleId = 'procedural', opts = {}) {
  const norm = String(moduleId || 'procedural').replace(/^tab-/, '').toLowerCase();
  const validMap = {
    procedural: { tab: 'tab-procedural', title: 'ZIRO PROCEDURAL FRAMEWORK — Generador UE 5.8 (Ventana Independiente)' },
    finisher:   { tab: 'tab-finisher',   title: 'ZIRO FINISHER STUDIO — Multi-Target & Shuffle Bag (Ventana Independiente)' },
    fusion:     { tab: 'tab-fusion',     title: 'ZIRO CHARACTER FUSION — Fusión de Personajes (Ventana Independiente)' },
    scanner:    { tab: 'tab-scanner',    title: 'ZIRO SYSTEM SCANNER — Auditoría Multi-Disco (Ventana Independiente)' },
    appearance: { tab: 'tab-appearance', title: 'APARIENCIA ZIRO — Paletas y Animaciones (Ventana Independiente)' }
  };
  const cfg = validMap[norm] || validMap.procedural;

  const existing = moduleWindows[norm];
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: opts.width || 1520,
    height: opts.height || 890,
    minWidth: 1140,
    minHeight: 700,
    title: cfg.title,
    backgroundColor: '#040608',
    icon: getAppIcon(),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: 'AudioOutputDevices'
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'renderer', 'dashboard.html'), {
    query: {
      module: norm,
      tab: cfg.tab,
      standalone: '1'
    }
  });

  win.on('closed', () => {
    delete moduleWindows[norm];
  });

  moduleWindows[norm] = win;
  return win;
}

function startLocalPluginBridgeServer() {
  if (localBridgeServer) return;
  const http = require('http');
  localBridgeServer = http.createServer((req, res) => {
    try {
      const urlObj = new URL(req.url || '/', 'http://127.0.0.1:8769');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (urlObj.pathname === '/health') {
        res.end(JSON.stringify({ ok: true, app: 'ZIRO AI PET', port: 8769 }));
        return;
      }

      if (urlObj.pathname === '/open') {
        const mod = (urlObj.searchParams.get('module') || 'procedural').toLowerCase();
        if (mod === 'dashboard' || mod === 'home') {
          createDashboardWindow('tab-home');
        } else {
          createModuleWindow(mod);
        }
        res.end(JSON.stringify({ ok: true, opened: mod }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Endpoint desconocido' }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });

  localBridgeServer.on('error', (err) => {
    console.warn('[ZIRO Bridge 8769]', err.message);
  });
  localBridgeServer.listen(8769, '127.0.0.1');
}

function createVisualizerWindow(initialData = {}) {
  if (visualizerWindow && !visualizerWindow.isDestroyed()) {
    visualizerWindow.focus();
    if (initialData && (initialData.imageUrl || initialData.prompt)) {
      visualizerWindow.webContents.send('visualizer:load-image', initialData);
    }
    return visualizerWindow;
  }

  visualizerWindow = new BrowserWindow({
    width: 1060,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    title: 'ZIRO VISUALIZER - ComfyUI Studio',
    backgroundColor: '#070c0a',
    icon: getAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: 'AudioOutputDevices'
    }
  });

  visualizerWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'visualizer.html'));

  visualizerWindow.webContents.once('did-finish-load', () => {
    if (initialData && (initialData.imageUrl || initialData.prompt)) {
      visualizerWindow.webContents.send('visualizer:load-image', initialData);
    }
  });

  visualizerWindow.on('closed', () => {
    visualizerWindow = null;
  });

  return visualizerWindow;
}

function createExplorerWindow(initialPath = 'D:\\') {
  if (explorerWindow) {
    if (explorerWindow.isMinimized()) explorerWindow.restore();
    explorerWindow.focus();
    return explorerWindow;
  }

  explorerWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 880,
    minHeight: 580,
    frame: false,
    transparent: false,
    title: 'Explorador - Ziro',
    backgroundColor: '#020504',
    icon: getAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  explorerWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'explorer.html'));

  explorerWindow.on('closed', () => {
    explorerWindow = null;
  });

  return explorerWindow;
}

function setupTray() {
  try {
    const icon = getAppIcon();
    tray = new Tray(icon);
    tray.setToolTip('ZIRO PET DESTEKOP');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mostrar / Abrir Panel ZIRO',
        click: () => createDashboardWindow()
      },
      {
        label: 'Abrir ZIRO PROCEDURAL FRAMEWORK (Ventana Aparte)',
        click: () => createModuleWindow('procedural')
      },
      {
        label: 'Abrir ZIRO FINISHER STUDIO (Ventana Aparte)',
        click: () => createModuleWindow('finisher')
      },
      {
        label: 'Abrir ZIRO CHARACTER FUSION (Ventana Aparte)',
        click: () => createModuleWindow('fusion')
      },
      {
        label: 'Abrir ZIRO SYSTEM SCANNER (Ventana Aparte)',
        click: () => createModuleWindow('scanner')
      },
      { type: 'separator' },
      {
        label: 'Abrir ZIRO VISUALIZER (ComfyUI)',
        click: () => createVisualizerWindow()
      },
      {
        label: 'Abrir Explorador Cyberpunk Ziro',
        click: () => createExplorerWindow()
      },
      {
        label: 'Alternar Menú / Solo Mascota Flotante',
        click: () => {
          if (petWindow) petWindow.webContents.send('pet:toggle-minimal-mode');
        }
      },
      {
        label: 'Centrar Mascota en Pantalla',
        click: () => {
          if (petWindow) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;
            petWindow.setPosition(Math.floor((width - 360) / 2), Math.floor((height - 500) / 2));
          }
        }
      },
      {
        label: 'Siempre al Frente',
        type: 'checkbox',
        checked: currentSettings?.appearance?.alwaysOnTop ?? true,
        click: (item) => {
          if (petWindow) {
            petWindow.setAlwaysOnTop(item.checked);
            currentSettings.appearance.alwaysOnTop = item.checked;
            configService.saveConfig(currentSettings);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Salir de ZIRO PET',
        click: () => app.quit()
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      createDashboardWindow();
    });
  } catch (trayErr) {
    console.warn('Tray init warning:', trayErr.message);
  }
}

function registerIpcHandlers() {
  // Settings
  ipcMain.handle('settings:get', async () => {
    currentSettings = configService.loadConfig();
    return currentSettings;
  });

  ipcMain.handle('settings:save', async (event, newConfig) => {
    currentSettings = configService.saveConfig(newConfig);
    commandService.setCustomCommands(currentSettings.customCommands || []);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(currentSettings.appearance?.alwaysOnTop ?? true);
    }
    broadcastSettingsUpdate(currentSettings);
    return currentSettings;
  });

  // Windows
  ipcMain.on('window:open-dashboard', () => {
    createDashboardWindow();
  });

  ipcMain.handle('window:open-module', async (event, { moduleId, opts } = {}) => {
    createModuleWindow(moduleId, opts || {});
    return { success: true, moduleId };
  });

  ipcMain.handle('window:go-home', async (event, targetTab = 'tab-home') => {
    createDashboardWindow(targetTab || 'tab-home');
    return { success: true, targetTab };
  });

  ipcMain.on('window:close-dashboard', () => {
    if (dashboardWindow) dashboardWindow.close();
  });

  ipcMain.on('window:resize-pet', (event, { width, height }) => {
    if (petWindow && width && height) {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: maxW, height: maxH } = primaryDisplay.workAreaSize;
        const targetW = Math.max(140, Math.min(maxW, Math.round(width)));
        const targetH = Math.max(140, Math.min(maxH, Math.round(height)));

        const [curX, curY] = petWindow.getPosition();
        const [curW, curH] = petWindow.getSize();
        const diffW = targetW - curW;
        const diffH = targetH - curH;
        let newX = curX - Math.round(diffW / 2);
        let newY = curY - Math.round(diffH / 2);

        newX = Math.max(0, Math.min(maxW - targetW, newX));
        newY = Math.max(0, Math.min(maxH - targetH, newY));

        petWindow.setBounds({ x: newX, y: newY, width: targetW, height: targetH });
      } catch (err) {
        console.error('Error resizing pet window:', err);
      }
    }
  });

  ipcMain.on('window:minimize-pet', () => {
    if (petWindow) {
      petWindow.webContents.send('pet:set-minimal-mode', true);
    }
  });

  ipcMain.on('window:close-app', () => {
    app.quit();
  });

  ipcMain.handle('window:toggle-always-on-top', (event, enable) => {
    if (petWindow) {
      petWindow.setAlwaysOnTop(enable);
      currentSettings.appearance.alwaysOnTop = enable;
      configService.saveConfig(currentSettings);
    }
    return enable;
  });

  // Real-Time Audio Transcription & Progressive Streaming Execution (Fase 1, 3, 5)
  ipcMain.handle('speech:transcribe', async (event, { wavBase64, language, streamTts = true }) => {
    if (!wavBase64) return { text: '', reply: 'No se detectó audio.' };

    const tSttStart = performance.now();
    const buffer = Buffer.from(wavBase64, 'base64');
    const transcribedText = await transcribeService.transcribeAudio(
      buffer,
      language || currentSettings.voiceConfig?.language || 'es-AR',
      currentSettings.aiConfig || {}
    );
    const transcribeMs = Math.round(performance.now() - tSttStart);

    if (!transcribedText || !transcribedText.trim()) {
      return {
        text: '',
        reply: 'No llegué a escucharte bien. Decime de nuevo.',
        isCommand: false,
        diagnostics: { transcribeMs }
      };
    }

    console.log(`Audio Transcrito (${transcribeMs}ms):`, transcribedText);

    // 1. Process as System Command
    const commandResult = await commandService.processCommand(transcribedText);
    if (commandResult.isCommand) {
      if (commandResult.actionType === 'comfy_open_visualizer') {
        createVisualizerWindow({ prompt: commandResult.prompt });
        comfyService.openComfyDesktopOnScreen(true).then(() => {
          comfyService.generateAnimePet(commandResult.prompt, { useComfy: true, openOnScreen: true })
            .then((res) => {
              if (visualizerWindow && !visualizerWindow.isDestroyed()) {
                visualizerWindow.webContents.send('visualizer:load-image', {
                  imageUrl: res.imageUrl,
                  filePath: res.filePath,
                  prompt: commandResult.prompt
                });
              }
            })
            .catch(err => console.error('Comfy visualizer gen err:', err));
        });
      }

      if (commandResult.actionType === 'pet_customize_fx') {
        currentSettings = configService.loadConfig();
        currentSettings.appearance = currentSettings.appearance || {};
        if (commandResult.ringColor1) currentSettings.appearance.ringColor1 = commandResult.ringColor1;
        if (commandResult.ringColor2) currentSettings.appearance.ringColor2 = commandResult.ringColor2;
        if (commandResult.particleEffect) currentSettings.appearance.particleEffect = commandResult.particleEffect;
        configService.saveConfig(currentSettings);
        if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
        if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
      }

      if (commandResult.actionType === 'comfy_generate_anime') {
        petImageService.generatePetFromPrompt(commandResult.prompt, 'Anime Comfy 3D', 'anime', {
          useComfy: true,
          openOnScreen: true
        }).then((newPet) => {
          currentSettings = configService.loadConfig();
          currentSettings.customPets = currentSettings.customPets || [];
          currentSettings.customPets = currentSettings.customPets.filter(p => p.id !== newPet.id);
          currentSettings.customPets.push(newPet);
          currentSettings.selectedPet = newPet.id;
          currentSettings.petName = newPet.name;
          configService.saveConfig(currentSettings);
          if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
          if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
        }).catch(err => console.error('Comfy voice generation error:', err));
      }

      return {
        text: transcribedText,
        reply: commandResult.message,
        isCommand: true,
        action: commandResult.actionType,
        wakeActivated: commandResult.wakeActivated,
        target: commandResult.target || commandResult.query,
        minimal: commandResult.minimal,
        scale: commandResult.scale,
        sizeLabel: commandResult.sizeLabel,
        diagnostics: { transcribeMs, ttftMs: 5, firstClauseMs: 5, llmTotalMs: 5 }
      };
    }

    // 2. Process via AI Assistant with Progressive Streaming Clauses -> Immediate TTS Queue
    const aiConfig = currentSettings.aiConfig || {};
    const petName = currentSettings.petName || 'Ziro';
    const userName = currentSettings.userName || 'Legolas';
    const selectedVoice = currentSettings.voiceConfig?.voiceName || 'es-AR-TomasNeural';
    const selectedRate = currentSettings.voiceConfig?.rate || 1.0;
    const selectedPitch = currentSettings.voiceConfig?.pitch || 1.0;

    // Chain clause synthesis in order while LLM streams
    let synthChain = Promise.resolve();
    let firstTtsSynthMs = null;

    const streamRes = await aiService.streamResponse(
      transcribedText,
      { ...aiConfig, petName, userName },
      (clauseText, clauseIndex, llmMetrics) => {
        if (!streamTts) return;
        synthChain = synthChain.then(async () => {
          try {
            const synthRes = await ttsService.synthesizeSpeech(
              clauseText,
              selectedVoice,
              selectedRate,
              selectedPitch
            );
            if (firstTtsSynthMs === null && synthRes.synthMs) {
              firstTtsSynthMs = synthRes.synthMs;
            }
            if (!event.sender.isDestroyed()) {
              event.sender.send('voice:stream-chunk', {
                clauseIndex,
                text: clauseText,
                success: synthRes.success,
                audioUrl: synthRes.audioUrl,
                engine: synthRes.engine,
                synthMs: synthRes.synthMs || 0,
                firstByteMs: synthRes.firstByteMs || 0,
                transcribeMs,
                ttftMs: llmMetrics.ttftMs,
                firstClauseMs: llmMetrics.firstClauseMs
              });
            }
          } catch (e) {
            console.warn('Error sintetizando fragmento en streaming:', e.message);
          }
        });
      }
    );

    // Wait only if needed or let background clauses finish streaming
    synthChain.catch(() => {});

    return {
      text: transcribedText,
      reply: streamRes.reply,
      isCommand: false,
      streamed: Boolean(streamTts),
      diagnostics: {
        transcribeMs,
        ttftMs: streamRes.ttftMs,
        firstClauseMs: streamRes.firstClauseMs,
        llmTotalMs: streamRes.llmTotalMs,
        firstTtsSynthMs: firstTtsSynthMs || 0,
        clauseCount: streamRes.clauseCount
      }
    };
  });

  // Interrupt active AI generation & TTS (Fase 5 - Barge-In)
  ipcMain.handle('voice:interrupt', async () => {
    const cancelled = aiService.cancelActiveGeneration();
    return { success: true, cancelled };
  });

  // Voice Pipeline Real-Time Diagnostics (Fase 1)
  ipcMain.handle('voice:report-diagnostics', async (event, metrics) => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('voice:diagnostics-updated', metrics);
    }
    return { success: true };
  });

  // Comparative TTS Engine Benchmark (Fase 6 - Real Measurements)
  ipcMain.handle('voice:run-benchmark', async () => {
    const { spawn } = require('child_process');
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const { getPythonExecutable } = require('./src/services/pythonBridge');
    const testPhrases = [
      'Che, ahí abrí Steam, ¿querés que arranque el Counter?',
      'Dale, ya seleccioné Premier y estoy buscando partida.',
      'Perfecto, ya acepté la partida, suerte en el match.'
    ];

    const results = [];
    // 1. Edge Neural Warm Daemon Streaming
    const warmFirsts = [];
    const warmTotals = [];
    let warmEngine = 'edge-neural-stream';
    for (const phrase of testPhrases) {
      const r = await ttsService.synthesizeSpeech(phrase, 'es-AR-TomasNeural', 1.0, 1.0);
      if (r.success) {
        warmFirsts.push(r.firstByteMs || r.synthMs || 0);
        warmTotals.push(r.synthMs || 0);
        warmEngine = r.engine || warmEngine;
      }
    }
    results.push({
      engine: 'Edge Neural (Daemon Persistente + Streaming)',
      rawEngine: warmEngine,
      firstAudioMs: warmFirsts.length ? Math.round(warmFirsts.reduce((a, b) => a + b, 0) / warmFirsts.length) : 0,
      totalMs: warmTotals.length ? Math.round(warmTotals.reduce((a, b) => a + b, 0) / warmTotals.length) : 0,
      naturalness: 'Alta (es-AR-TomasNeural)',
      ramMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      gpu: '0% (CPU/Red)'
    });

    // 2. Edge Neural Cold CLI Spawn (Legacy baseline)
    const coldTotals = [];
    const pyExe = getPythonExecutable();
    for (let i = 0; i < testPhrases.length; i++) {
      const outPath = path.join(os.tmpdir(), `ziro_bench_cold_${Date.now()}_${i}.mp3`);
      const t0 = performance.now();
      await new Promise((resolve) => {
        const ch = spawn(pyExe, ['-m', 'edge_tts', '--voice', 'es-AR-TomasNeural', '--text', testPhrases[i], '--write-media', outPath], { windowsHide: true });
        ch.on('close', () => resolve());
        ch.on('error', () => resolve());
      });
      coldTotals.push(Math.round(performance.now() - t0));
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }
    results.push({
      engine: 'Edge TTS (Cold Spawn Legacy)',
      rawEngine: 'edge-cli-cold',
      firstAudioMs: coldTotals.length ? Math.round(coldTotals.reduce((a, b) => a + b, 0) / coldTotals.length) : 0,
      totalMs: coldTotals.length ? Math.round(coldTotals.reduce((a, b) => a + b, 0) / coldTotals.length) : 0,
      naturalness: 'Alta (misma voz, bloquea hasta finalizar)',
      ramMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      gpu: '0% (CPU/Red)'
    });

    // 3. Piper ONNX Local (si hay modelo instalado en D:\ZIRO_AI\voices)
    const piperResult = await ttsService.synthesizeSpeech(testPhrases[0], 'piper-es-AR-daniela', 1.0, 1.0);
    results.push({
      engine: 'Piper ONNX Local (es_AR-daniela)',
      rawEngine: piperResult.engine || 'piper-onnx',
      firstAudioMs: piperResult.success ? (piperResult.firstByteMs || piperResult.synthMs || 0) : null,
      totalMs: piperResult.success ? (piperResult.synthMs || 0) : null,
      naturalness: piperResult.success ? 'Media-Buena (100% Offline)' : 'Modelo .onnx no descargado en D:\\ZIRO_AI\\voices',
      ramMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      gpu: '0% (ONNX CPU)'
    });

    return { success: true, results, testedAt: new Date().toLocaleTimeString() };
  });

  // TTS Speech Synthesis via Edge Neural / Piper Local Voices
  ipcMain.handle('speech:synthesize', async (event, { text, voice, rate, pitch }) => {
    const selectedVoice = voice || currentSettings.voiceConfig?.voiceName || 'es-AR-TomasNeural';
    const selectedRate = rate || currentSettings.voiceConfig?.rate || 1.0;
    const selectedPitch = pitch || currentSettings.voiceConfig?.pitch || 1.0;

    return await ttsService.synthesizeSpeech(text, selectedVoice, selectedRate, selectedPitch);
  });

  // Edge Voices List
  ipcMain.handle('voice:list-edge-voices', async () => {
    return ttsService.getAvailableVoices();
  });

  // Custom Voice Files
  ipcMain.handle('voice:save-custom', async (event, { dataUrl, name }) => {
    return await ttsService.saveCustomVoice(dataUrl, name);
  });

  ipcMain.handle('voice:list-custom', async () => {
    return await ttsService.listCustomVoices();
  });

  ipcMain.handle('voice:delete-custom', async (event, id) => {
    return await ttsService.deleteCustomVoice(id);
  });

  // Main Chat & Voice Command Pipeline (Text)
  ipcMain.handle('chat:send-message', async (event, rawText) => {
    if (!rawText || !rawText.trim()) {
      return { reply: '¡Dime algo o pídeme una acción!', isCommand: false };
    }

    const text = rawText.trim();

    // 1. Check if it's a system command ("abrime youtube", "abre calculadora", etc.)
    const commandResult = await commandService.processCommand(text);
    if (commandResult.isCommand) {
      if (commandResult.actionType === 'comfy_open_visualizer') {
        createVisualizerWindow({ prompt: commandResult.prompt });
        comfyService.openComfyDesktopOnScreen(true).then(() => {
          comfyService.generateAnimePet(commandResult.prompt, { useComfy: true, openOnScreen: true })
            .then((res) => {
              if (visualizerWindow && !visualizerWindow.isDestroyed()) {
                visualizerWindow.webContents.send('visualizer:load-image', {
                  imageUrl: res.imageUrl,
                  filePath: res.filePath,
                  prompt: commandResult.prompt
                });
              }
            })
            .catch(err => console.error('Comfy visualizer gen err:', err));
        });
      }

      if (commandResult.actionType === 'pet_customize_fx') {
        currentSettings = configService.loadConfig();
        currentSettings.appearance = currentSettings.appearance || {};
        if (commandResult.ringColor1) currentSettings.appearance.ringColor1 = commandResult.ringColor1;
        if (commandResult.ringColor2) currentSettings.appearance.ringColor2 = commandResult.ringColor2;
        if (commandResult.particleEffect) currentSettings.appearance.particleEffect = commandResult.particleEffect;
        configService.saveConfig(currentSettings);
        if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
        if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
      }

      if (commandResult.actionType === 'comfy_generate_anime') {
        petImageService.generatePetFromPrompt(commandResult.prompt, 'Anime Comfy 3D', 'anime', {
          useComfy: true,
          openOnScreen: true
        }).then((newPet) => {
          currentSettings = configService.loadConfig();
          currentSettings.customPets = currentSettings.customPets || [];
          currentSettings.customPets = currentSettings.customPets.filter(p => p.id !== newPet.id);
          currentSettings.customPets.push(newPet);
          currentSettings.selectedPet = newPet.id;
          currentSettings.petName = newPet.name;
          configService.saveConfig(currentSettings);
          if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
          if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
        }).catch(err => console.error('Comfy chat generation error:', err));
      }

      return {
        reply: commandResult.message,
        isCommand: true,
        action: commandResult.actionType,
        target: commandResult.target || commandResult.query,
        minimal: commandResult.minimal,
        scale: commandResult.scale,
        sizeLabel: commandResult.sizeLabel
      };
    }

    // 2. Process via AI Assistant with Progressive Streaming
    const aiConfig = currentSettings.aiConfig || {};
    const petName = currentSettings.petName || 'Ziro';
    const userName = currentSettings.userName || 'Legolas';
    const selectedVoice = currentSettings.voiceConfig?.voiceName || 'es-AR-TomasNeural';
    const selectedRate = currentSettings.voiceConfig?.rate || 1.0;
    const selectedPitch = currentSettings.voiceConfig?.pitch || 1.0;
    const autoSpeak = currentSettings.voiceConfig?.autoSpeak !== false;

    let synthChain = Promise.resolve();
    let firstTtsSynthMs = null;

    const streamRes = await aiService.streamResponse(
      text,
      { ...aiConfig, petName, userName },
      (clauseText, clauseIndex, llmMetrics) => {
        if (!autoSpeak) return;
        synthChain = synthChain.then(async () => {
          try {
            const synthRes = await ttsService.synthesizeSpeech(
              clauseText,
              selectedVoice,
              selectedRate,
              selectedPitch
            );
            if (firstTtsSynthMs === null && synthRes.synthMs) {
              firstTtsSynthMs = synthRes.synthMs;
            }
            if (!event.sender.isDestroyed()) {
              event.sender.send('voice:stream-chunk', {
                clauseIndex,
                text: clauseText,
                success: synthRes.success,
                audioUrl: synthRes.audioUrl,
                engine: synthRes.engine,
                synthMs: synthRes.synthMs || 0,
                firstByteMs: synthRes.firstByteMs || 0,
                transcribeMs: 0,
                ttftMs: llmMetrics.ttftMs,
                firstClauseMs: llmMetrics.firstClauseMs
              });
            }
          } catch (_) {}
        });
      }
    );

    synthChain.catch(() => {});

    return {
      reply: streamRes.reply,
      isCommand: false,
      streamed: autoSpeak,
      diagnostics: {
        transcribeMs: 0,
        ttftMs: streamRes.ttftMs,
        firstClauseMs: streamRes.firstClauseMs,
        llmTotalMs: streamRes.llmTotalMs,
        firstTtsSynthMs: firstTtsSynthMs || 0,
        clauseCount: streamRes.clauseCount
      }
    };
  });

  // Direct command execution
  ipcMain.handle('command:execute-direct', async (event, text) => {
    return await commandService.processCommand(text);
  });

  // AI Connection Test
  ipcMain.handle('ai:test-connection', async (event, testConfig) => {
    try {
      const res = await aiService.generateResponse('¡Hola! Prueba de conexión.', {
        ...testConfig,
        petName: currentSettings.petName || 'Ziro'
      });
      return { success: true, reply: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Unreal Engine Control Handlers
  ipcMain.handle('unreal:test-connection', async (event, customConfig) => {
    if (customConfig) {
      unrealService.configure(customConfig);
    }
    return await unrealService.testConnection();
  });

  ipcMain.handle('unreal:execute-command', async (event, { action, params }) => {
    try {
      if (action === 'spawn_mesh') {
        return await unrealService.spawnMesh(params || {});
      } else if (action === 'spawn_light') {
        return await unrealService.spawnLight(params || {});
      } else if (action === 'build_structure') {
        return await unrealService.buildStructure(params || {});
      } else if (action === 'transform') {
        return await unrealService.setActorTransform(params || {});
      } else if (action === 'delete') {
        return await unrealService.deleteActor(params?.name);
      } else if (action === 'simulation') {
        return await unrealService.controlSimulation(params?.action || 'play');
      } else if (action === 'save') {
        return await unrealService.saveLevel();
      } else if (action === 'get_actors') {
        return await unrealService.getActorsInLevel();
      } else if (action === 'voice_order') {
        return await unrealService.executeNaturalVoiceOrder(params?.text || '');
      } else {
        return await unrealService.executeZiroPluginCommand({ tool: action, args: params || {} });
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('unreal:get-status', async () => {
    return {
      isConnected: unrealService.isConnected,
      host: unrealService.host,
      port: unrealService.port,
      lastSpawned: unrealService.lastSpawnedActor,
      lastPingTime: unrealService.lastPingTime
    };
  });

  // ComfyUI / Comfy Desktop Integration
  ipcMain.handle('comfy:get-status', async () => {
    return await comfyService.getStatus();
  });

  ipcMain.handle('comfy:open-desktop', async () => {
    return await comfyService.openComfyDesktopOnScreen(true);
  });

  // LiveKit Hands-Free Call Integration
  ipcMain.handle('livekit:get-status', async () => {
    return livekitService.getStatus();
  });

  ipcMain.handle('livekit:configure', async (event, cfg) => {
    const updated = livekitService.configure(cfg || {});
    currentSettings = configService.loadConfig();
    currentSettings.livekitConfig = { ...(currentSettings.livekitConfig || {}), ...updated };
    configService.saveConfig(currentSettings);
    if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
    if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
    return livekitService.getStatus();
  });

  ipcMain.handle('livekit:get-token', async (event, participantName) => {
    const token = livekitService.generateRoomToken(participantName || 'usuario-ziro');
    return { token, ...livekitService.getStatus() };
  });

  // Custom Pets
  ipcMain.handle('pet:save-photo', async (event, { dataUrl, name }) => {
    const newPet = await petImageService.savePhotoAsPet(dataUrl, name);
    currentSettings = configService.loadConfig();
    currentSettings.customPets = currentSettings.customPets || [];
    currentSettings.customPets = currentSettings.customPets.filter(p => p.id !== newPet.id);
    currentSettings.customPets.push(newPet);
    currentSettings.selectedPet = newPet.id;
    currentSettings.petName = name;
    configService.saveConfig(currentSettings);

    if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
    if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
    return newPet;
  });

  ipcMain.handle('pet:generate-ai', async (event, { prompt, name, style, useComfy, openOnScreen }) => {
    const newPet = await petImageService.generatePetFromPrompt(prompt, name, style, {
      useComfy: useComfy !== false,
      openOnScreen: openOnScreen !== false
    });
    currentSettings = configService.loadConfig();
    currentSettings.customPets = currentSettings.customPets || [];
    currentSettings.customPets = currentSettings.customPets.filter(p => p.id !== newPet.id);
    currentSettings.customPets.push(newPet);
    currentSettings.selectedPet = newPet.id;
    currentSettings.petName = name;
    configService.saveConfig(currentSettings);

    if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
    if (dashboardWindow) dashboardWindow.webContents.send('settings:updated', currentSettings);
    return newPet;
  });

  ipcMain.handle('pet:list-custom', async () => {
    return await petImageService.listCustomPets();
  });

  ipcMain.handle('pet:delete-custom', async (event, id) => {
    const ok = await petImageService.deleteCustomPet(id);
    if (ok) {
      currentSettings = configService.loadConfig();
      currentSettings.customPets = (currentSettings.customPets || []).filter(p => p.id !== id);
      if (currentSettings.selectedPet === id) {
        currentSettings.selectedPet = 'ziro';
      }
      configService.saveConfig(currentSettings);
      if (petWindow) petWindow.webContents.send('settings:updated', currentSettings);
    }
    return ok;
  });

  // Ziro Visualizer & ComfyUI Prompt Studio
  ipcMain.on('visualizer:open', (event, data) => {
    createVisualizerWindow(data || {});
  });

  ipcMain.handle('comfy:generate-image', async (event, prompt) => {
    try {
      await comfyService.openComfyDesktopOnScreen(true);
      const res = await comfyService.generateAnimePet(prompt, {
        useComfy: true,
        openOnScreen: true
      });
      if (res && res.imageUrl) {
        return { success: true, imageUrl: res.imageUrl, filePath: res.filePath, prompt };
      }
      return { success: false, error: 'No se obtuvo imagen de ComfyUI' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Background removal via rembg / PIL
  ipcMain.handle('image:remove-bg', async (event, inputPath) => {
    try {
      let targetFile = inputPath;
      if (inputPath && inputPath.startsWith('file://')) {
        targetFile = decodeURIComponent(inputPath.replace('file:///', '').replace('file://', ''));
      }
      const outDir = path.join(app.getPath('userData'), 'cutouts');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `cutout_${Date.now()}.png`);
      const ok = await bgRemovalService.removeBackground(targetFile, outPath);
      return { success: ok, outputPath: outPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Unreal Engine Project Selector & Architecture Suite
  ipcMain.handle('projects:list', async () => {
    return await architectureService.discoverProjects();
  });

  ipcMain.handle('projects:select', async (event, uprojectPath) => {
    const res = await architectureService.setActiveProject(uprojectPath);
    currentSettings = configService.loadConfig();
    currentSettings.unrealConfig = currentSettings.unrealConfig || {};
    currentSettings.unrealConfig.uprojectPath = uprojectPath;
    currentSettings.unrealConfig.ziroHostDir = path.dirname(uprojectPath);
    currentSettings.projectManager = currentSettings.projectManager || { rootSearchDirs: [], activeProjectPath: '', recentProjects: [] };
    currentSettings.projectManager.activeProjectPath = uprojectPath;
    const rec = [uprojectPath, ...(currentSettings.projectManager.recentProjects || []).filter((p) => p.toLowerCase() !== uprojectPath.toLowerCase())].slice(0, 10);
    currentSettings.projectManager.recentProjects = rec;
    currentSettings = configService.saveConfig(currentSettings);
    broadcastSettingsUpdate(currentSettings);
    return res;
  });

  ipcMain.handle('projects:launch', async () => {
    return await architectureService.launchActiveProject();
  });

  ipcMain.handle('projects:browse', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar Proyecto de Unreal Engine (.uproject)',
      filters: [{ name: 'Unreal Engine Project (*.uproject)', extensions: ['uproject'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const chosen = result.filePaths[0];
      const res = await architectureService.setActiveProject(chosen);
      currentSettings = configService.loadConfig();
      currentSettings.unrealConfig = currentSettings.unrealConfig || {};
      currentSettings.unrealConfig.uprojectPath = chosen;
      currentSettings.unrealConfig.ziroHostDir = path.dirname(chosen);
      currentSettings.projectManager = currentSettings.projectManager || { rootSearchDirs: [], activeProjectPath: '', recentProjects: [] };
      currentSettings.projectManager.activeProjectPath = chosen;
      currentSettings.projectManager.recentProjects = [chosen, ...(currentSettings.projectManager.recentProjects || []).filter((p) => p.toLowerCase() !== chosen.toLowerCase())].slice(0, 10);
      currentSettings = configService.saveConfig(currentSettings);
      broadcastSettingsUpdate(currentSettings);
      return res;
    }
    return { canceled: true };
  });

  ipcMain.handle('architecture:generate', async (event, { type, options }) => {
    const def = architectureService.generateProceduralArchitecture(type, options || {});
    const buildRes = await architectureService.buildInUnreal(def);
    return { def, buildRes };
  });

  ipcMain.handle('architecture:expand', async (event, { name, addFloors }) => {
    return await architectureService.expandBuildingFloors(name, addFloors);
  });

  ipcMain.handle('architecture:stretch', async (event, { name, factors }) => {
    return await architectureService.stretchBuilding(name, factors);
  });

  ipcMain.handle('architecture:analyze', async (event, { base64, filename }) => {
    return await architectureService.analyzeBlueprintOr3D(base64, filename);
  });

  ipcMain.handle('architecture:replicate', async (event, analysisResult) => {
    return await architectureService.replicateAnalyzedDesign(analysisResult);
  });

  ipcMain.handle('architecture:randomize-interior', async (event, { name, type }) => {
    return await architectureService.randomizeInterior(name, type);
  });

  // Módulo Ziro Procedural Architect (UE 5.8)
  ipcMain.handle('architect:generate-building', async (event, params) => {
    return await architectureService.generateProceduralBuilding(params);
  });
  ipcMain.handle('architect:regenerate-part', async (event, params) => {
    return await architectureService.regenerateBuildingPart(params);
  });
  ipcMain.handle('architect:apply-horror', async (event, params) => {
    return await architectureService.applyHorrorProfile(params);
  });
  ipcMain.handle('architect:open-studio', async (event, params) => {
    return await architectureService.openStudio(params);
  });
  ipcMain.handle('architect:save-asset', async (event, params) => {
    return await architectureService.saveBuildingAsset(params);
  });
  ipcMain.handle('architect:inspect-materials', async (event, forceScan) => {
    return await architectureService.inspectProjectMaterials(forceScan);
  });
  ipcMain.handle('architect:scan-assets', async (event, forceRescan) => {
    return await architectureService.scanProjectAssets(forceRescan);
  });
  ipcMain.handle('architect:generate-world', async (event, params) => {
    return await architectureService.generateWorldFromPrompt(params);
  });
  ipcMain.handle('architect:save-favorite', async (event, { name, recipe }) => {
    return architectureService.saveFavoriteRecipe(name, recipe);
  });
  ipcMain.handle('architect:load-favorites', async () => {
    return architectureService.loadFavoriteRecipes();
  });

  // ── ZIRO SYSTEM SCANNER ──────────────────────────────────────────────
  ipcMain.handle('scanner:run-full', async () => {
    return await systemScannerService.runFullScan();
  });

  // ── ZIRO PROJECT MANAGER ─────────────────────────────────────────────
  ipcMain.handle('pm:scan-roots', async (event, roots) => {
    const list = Array.isArray(roots) && roots.length > 0
      ? roots
      : (currentSettings?.projectManager?.rootSearchDirs || ['E:\\Proyecto Unreal', 'D:\\legolas-ai-v1.0', 'F:\\Proyecto Unreal']);
    return projectManagerService.scanRootFolders(list);
  });
  ipcMain.handle('pm:browse-folder', async (event, title) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: title || 'Seleccionar Carpeta Raíz de Proyectos Unreal',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, folderPath: result.filePaths[0] };
    }
    return { success: false, canceled: true };
  });
  ipcMain.handle('pm:validate-active', async () => {
    const active = currentSettings?.projectManager?.activeProjectPath || currentSettings?.unrealConfig?.uprojectPath || '';
    return projectManagerService.validateTargetProject(active);
  });
  ipcMain.handle('pm:open-folder', async (event, folderPath) => {
    const { shell } = require('electron');
    if (folderPath) await shell.openPath(folderPath);
    return { success: true };
  });

  // ── ZIRO CHARACTER FUSION ────────────────────────────────────────────
  ipcMain.handle('fusion:get-catalog', async () => {
    return characterFusionService.getAbilityCatalog();
  });
  ipcMain.handle('fusion:scan-project', async (event, uprojectPath) => {
    return characterFusionService.scanProjectCharacters(uprojectPath);
  });
  ipcMain.handle('fusion:browse-source-project', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar Proyecto/Pack Fuente .uproject (Solo lectura, no se modificará)',
      filters: [{ name: 'Unreal Project (*.uproject)', extensions: ['uproject'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return characterFusionService.scanProjectCharacters(result.filePaths[0]);
    }
    return { success: false, canceled: true };
  });
  ipcMain.handle('fusion:analyze', async (event, payload) => {
    return characterFusionService.analyzeFusionCompatibility(payload);
  });
  ipcMain.handle('fusion:execute', async (event, payload) => {
    return await characterFusionService.executeFusionPlan(payload);
  });

  // ── ZIRO FINISHER STUDIO + RANDOM FINISHER + AI ANIMATION EDITOR ─────
  ipcMain.handle('finisher:browse-pack', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar Pack de Animaciones Finisher',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return finisherStudioService.scanFinisherPack(result.filePaths[0]);
    }
    return { success: false, canceled: true };
  });
  ipcMain.handle('finisher:scan-pack', async (event, packFolder) => {
    return finisherStudioService.scanFinisherPack(packFolder);
  });
  ipcMain.handle('finisher:evaluate-targets', async (event, { executor, enemies, animations }) => {
    return finisherStudioService.evaluateMultiTargetCompatibility(executor, enemies, animations);
  });
  ipcMain.handle('finisher:pick-random', async (event, payload) => {
    return finisherStudioService.pickNextFinisher(payload);
  });
  ipcMain.handle('finisher:ai-propose', async (event, payload) => {
    const aiCfg = currentSettings?.aiConfig || {};
    return await finisherStudioService.proposeAIAnimationVariant({ ...payload, aiConfig: aiCfg });
  });
  ipcMain.handle('finisher:integrate', async (event, payload) => {
    return await finisherStudioService.generateAndIntegrateFinishers(payload);
  });
  ipcMain.handle('finisher:export-pack', async (event, payload) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar Carpeta de Destino para Exportar Pack Finisher',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return finisherStudioService.exportFinisherPack({ ...payload, destinationFolder: result.filePaths[0] });
    }
    return { success: false, canceled: true, message: 'Exportación cancelada.' };
  });

  // ── UNREAL ENGINE OPTIMIZER ──────────────────────────────────────────
  ipcMain.handle('optimizer:analyze', async (event, uprojectPath) => {
    return unrealOptimizerService.analyzeProjectOptimization(uprojectPath);
  });
  ipcMain.handle('optimizer:apply', async (event, payload) => {
    return await unrealOptimizerService.applyOptimizationProfile(payload);
  });
  ipcMain.handle('optimizer:revert', async (event, uprojectPath) => {
    return unrealOptimizerService.revertLastBackup(uprojectPath);
  });

  // Cyberpunk Explorer IPC Handlers
  ipcMain.handle('explorer:open', async (event, targetPath) => {
    return createExplorerWindow(targetPath);
  });

  ipcMain.handle('explorer:read-dir', async (event, targetPath) => {
    const fs = require('fs');
    try {
      let resolved = targetPath;
      if (!resolved || resolved === 'ROOT') {
        // Return system drives
        const drives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\', 'H:\\', 'I:\\'];
        const existingDrives = [];
        for (const d of drives) {
          try {
            if (fs.existsSync(d)) {
              existingDrives.push({
                name: d === 'D:\\' ? 'SSD (D:)' : (d === 'C:\\' ? 'Disco local (C:)' : `Unidad (${d.replace('\\', '')})`),
                isDirectory: true,
                size: 0,
                ext: ''
              });
            }
          } catch (e) {}
        }
        return { success: true, path: 'ROOT', items: existingDrives };
      }

      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Ruta no encontrada' };
      }

      const dirents = fs.readdirSync(resolved, { withFileTypes: true });
      const items = [];

      for (const ent of dirents) {
        try {
          const isDir = ent.isDirectory();
          const ext = isDir ? '' : path.extname(ent.name).replace('.', '').toLowerCase();
          let size = 0;
          if (!isDir) {
            try {
              const st = fs.statSync(path.join(resolved, ent.name));
              size = st.size;
            } catch (e) {}
          }
          items.push({
            name: ent.name,
            isDirectory: isDir,
            size,
            ext
          });
        } catch (e) {}
      }

      // Sort: folders first, then alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      return { success: true, path: resolved, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('explorer:open-file', async (event, filePath) => {
    const { shell } = require('electron');
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('explorer:get-special-path', async (event, name) => {
    try {
      const os = require('os');
      const home = os.homedir();
      switch (name.toLowerCase()) {
        case 'home': return home;
        case 'desktop': return path.join(home, 'Desktop');
        case 'downloads': return path.join(home, 'Downloads');
        case 'documents': return path.join(home, 'Documents');
        case 'pictures': return path.join(home, 'Pictures');
        case 'music': return path.join(home, 'Music');
        case 'videos': return path.join(home, 'Videos');
        default: return home;
      }
    } catch (e) {
      return 'D:\\';
    }
  });

  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // ── ZIRO GAMING VOICE CONTROL (Steam & CS2) ──────────────────────────
  gamingVoiceService.onStateChange((state) => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('gaming:state-updated', state);
    }
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('gaming:state-updated', state);
    }
  });
  gamingVoiceService.startMonitor(7000);

  ipcMain.handle('gaming:get-state', async () => gamingVoiceService.getState());
  ipcMain.handle('gaming:refresh-status', async () => await gamingVoiceService.refreshStatus());
  ipcMain.handle('gaming:execute-action', async (event, { action, label, source }) => {
    return await gamingVoiceService.enqueueCommand(action, { label: label || action, source: source || 'panel' });
  });
  ipcMain.handle('gaming:cancel-action', async () => gamingVoiceService.cancelCurrentAction());
  ipcMain.handle('gaming:set-config', async (event, partial) => gamingVoiceService.setConfig(partial));
  ipcMain.handle('gaming:set-silent-mode', async (event, silent) => {
    const st = gamingVoiceService.setPetSilentMode(silent);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:silent-mode-sync', { silent: Boolean(silent) });
    }
    return st;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.focus();
    }
    createDashboardWindow();
  });

  app.whenReady().then(() => {
    setupPermissions();
    registerIpcHandlers();
    createPetWindow();
    setupTray();
    startLocalPluginBridgeServer();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
