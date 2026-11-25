const fs = require('fs');
const path = require('path');

class ConfigService {
  constructor() {
    this.configPath = null;
    this.defaultConfig = {
      petName: 'Ziro',
      userName: 'Legolas',
      selectedPet: 'ziro',
      customPets: [],
      customVoices: [],
      aiConfig: {
        mode: 'local-lmstudio', // 'offline', 'local-ollama', 'local-lmstudio', 'cloud-groq', 'cloud-gemini', 'cloud-openai'
        localEndpoint: 'http://127.0.0.1:1234/v1',
        localModel: 'qwen2.5-coder-7b-instruct',
        cloudProvider: 'groq',
        apiKey: '',
        cloudModel: 'llama-3.3-70b-versatile',
        customPrompt: ''
      },
      voiceConfig: {
        sttEnabled: true,
        ttsEnabled: true,
        autoSpeak: true,
        voiceName: 'es-AR-TomasNeural',
        voiceType: 'edge', // 'edge', 'piper', 'system', 'custom'
        audioInputId: '',   // Selected Microphone ID
        audioOutputId: '',  // Selected Speaker ID
        customVoiceId: null,
        pitch: 1.0,
        rate: 1.0,
        volume: 1.0,
        language: 'es-AR',
        listenMode: 'toggle', // 'toggle' or 'hold'
        bargeInEnabled: true,
        streamingTtsEnabled: true
      },
      appearance: {
        petScale: 1.0,
        alwaysOnTop: true,
        fluorGlowIntensity: 'high',
        windowPosition: null
      },
      uiTheme: {
        activePalette: 'verde-matrix',
        primary: '#00ff44',
        secondary: '#00f0ff',
        border: '#00ff44',
        glow: '#00ff44',
        button: '#00ff44',
        indicator: '#39ff14',
        neonIntensity: 85,
        transparency: 92,
        brightness: 100,
        animationsEnabled: true,
        reducedMotion: false,
        animSpeed: 1.0,
        savedPalettes: {}
      },
      projectManager: {
        rootSearchDirs: ['E:\\Proyecto Unreal', 'D:\\legolas-ai-v1.0', 'F:\\Proyecto Unreal'],
        activeProjectPath: '',
        recentProjects: []
      },
      finisherConfig: {
        enabled: true,
        hotkey: 'Ñ',
        randomMode: 'shuffle_bag',
        noConsecutiveRepeat: true,
        compatibleOnly: true,
        customProbabilities: false,
        enemyLimit: 10,
        executor: 'Adrien Cross',
        packPath: 'E:\\Animaciones\\Finishers\\Finisher_Kills_Pack',
        enemies: [
          { id: 'zombie_basic', name: 'Zombie Básico', skeleton: 'SK_Mannequin', scale: 1.0, compatible: true, enabled: true },
          { id: 'zombie_mutant', name: 'Zombie Mutante', skeleton: 'SK_Mannequin_Large', scale: 1.18, compatible: true, enabled: true },
          { id: 'soldier', name: 'Soldado', skeleton: 'SK_Mannequin', scale: 1.0, compatible: true, enabled: true },
          { id: 'monster_big', name: 'Monstruo Grande', skeleton: 'SK_Brute_Custom', scale: 1.65, compatible: false, enabled: false },
          { id: 'human_hostile', name: 'Humano Hostil', skeleton: 'SK_Mannequin', scale: 1.0, compatible: true, enabled: true }
        ],
        options: {
          autoRetargeting: true,
          syncAnimations: true,
          createMontagesBP: true,
          integrateGAS: true
        }
      },
      unrealConfig: {
        enabled: true,
        host: '127.0.0.1',
        port: 8765,
        remotePort: 30010,
        ziroHostDir: 'D:\\legolas-ai-v1.0\\ZiroHost',
        upluginPath: 'D:\\legolas-ai-v1.0\\ZiroHost\\Plugins\\ZIROAI\\ZIROAI.uplugin',
        autoConnect: true,
        enablePhysicsByDefault: false,
        lastSpawnedActor: null
      },
      livekitConfig: {
        enabled: true,
        alwaysListening: true,
        wakeWord: 'activar ziro',
        vadThreshold: 8,
        silenceMs: 420,
        bargeInEnabled: true,
        mode: 'direct-webrtc',
        serverUrl: 'wss://ziro-livekit.livekit.cloud',
        roomName: 'ziro-pet-live-call',
        apiKey: '',
        apiSecret: ''
      },
      customCommands: [
        {
          trigger: 'abre google docs',
          type: 'url',
          target: 'https://docs.google.com',
          name: 'Google Docs'
        },
        {
          trigger: 'abre twitch',
          type: 'url',
          target: 'https://twitch.tv',
          name: 'Twitch'
        }
      ]
    };
  }

  ensurePath() {
    if (!this.configPath) {
      let userData = '';
      try {
        const { app } = require('electron');
        userData = app.getPath('userData');
      } catch (e) {
        userData = path.join(process.cwd(), '.user_data');
      }
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true });
      }
      this.configPath = path.join(userData, 'ziro_config.json');
    }
    return this.configPath;
  }

  loadConfig() {
    this.ensurePath();
    try {
      if (fs.existsSync(this.configPath)) {
        const backupPath = this.configPath.replace(/\.json$/, '.backup.json');
        if (!fs.existsSync(backupPath)) {
          try {
            fs.copyFileSync(this.configPath, backupPath);
          } catch (_) {}
        }
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);
        const mergedVoice = { ...this.defaultConfig.voiceConfig, ...(parsed.voiceConfig || {}) };
        if (mergedVoice.voiceName === 'es-ES-AlvaroNeural') {
          mergedVoice.voiceName = 'es-AR-TomasNeural';
          mergedVoice.language = 'es-AR';
          mergedVoice.rate = 1.0;
        }
        const mergedLivekit = { ...this.defaultConfig.livekitConfig, ...(parsed.livekitConfig || {}) };
        if (mergedLivekit.silenceMs >= 950) {
          mergedLivekit.silenceMs = 420;
        }
        const mergedAi = { ...this.defaultConfig.aiConfig, ...(parsed.aiConfig || {}) };
        if (mergedAi.mode === 'offline' || mergedAi.localEndpoint === 'http://localhost:11434') {
          mergedAi.mode = 'local-lmstudio';
          mergedAi.localEndpoint = 'http://127.0.0.1:1234/v1';
          if (!mergedAi.localModel || mergedAi.localModel === 'llama3') {
            mergedAi.localModel = 'qwen2.5-coder-7b-instruct';
          }
        }
        return {
          ...this.defaultConfig,
          ...parsed,
          aiConfig: mergedAi,
          voiceConfig: mergedVoice,
          appearance: { ...this.defaultConfig.appearance, ...(parsed.appearance || {}) },
          uiTheme: { ...this.defaultConfig.uiTheme, ...(parsed.uiTheme || {}) },
          projectManager: { ...this.defaultConfig.projectManager, ...(parsed.projectManager || {}) },
          finisherConfig: {
            ...this.defaultConfig.finisherConfig,
            ...(parsed.finisherConfig || {}),
            options: { ...this.defaultConfig.finisherConfig.options, ...(parsed.finisherConfig?.options || {}) }
          },
          unrealConfig: { ...this.defaultConfig.unrealConfig, ...(parsed.unrealConfig || {}) },
          livekitConfig: mergedLivekit
        };
      }
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
    return this.defaultConfig;
  }

  saveConfig(newConfig) {
    this.ensurePath();
    try {
      const current = this.loadConfig();
      const merged = { ...current, ...newConfig };
      fs.writeFileSync(this.configPath, JSON.stringify(merged, null, 2), 'utf8');
      return merged;
    } catch (e) {
      console.error('Error guardando configuración:', e);
      return false;
    }
  }
}

module.exports = new ConfigService();
