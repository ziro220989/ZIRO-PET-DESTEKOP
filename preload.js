const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ziroAPI', {
  // Chat & Commands
  sendMessage: (text) => ipcRenderer.invoke('chat:send-message', text),
  onPetReply: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('pet:reply', handler);
    return () => ipcRenderer.removeListener('pet:reply', handler);
  },
  onPetStateChange: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('pet:state-change', handler);
    return () => ipcRenderer.removeListener('pet:state-change', handler);
  },

  // Audio Recording & Real-Time Transcription + Progressive Streaming & Barge-In
  transcribeAudio: (wavBase64, language, streamTts = true) => ipcRenderer.invoke('speech:transcribe', { wavBase64, language, streamTts }),
  interruptVoice: () => ipcRenderer.invoke('voice:interrupt'),
  onVoiceStreamChunk: (callback) => {
    const handler = (event, chunkData) => callback(chunkData);
    ipcRenderer.on('voice:stream-chunk', handler);
    return () => ipcRenderer.removeListener('voice:stream-chunk', handler);
  },
  reportVoiceDiagnostics: (metrics) => ipcRenderer.invoke('voice:report-diagnostics', metrics),
  onVoiceDiagnosticsUpdated: (callback) => {
    const handler = (event, metrics) => callback(metrics);
    ipcRenderer.on('voice:diagnostics-updated', handler);
    return () => ipcRenderer.removeListener('voice:diagnostics-updated', handler);
  },
  runTtsBenchmark: () => ipcRenderer.invoke('voice:run-benchmark'),

  // TTS Synthesis (Edge Neural Voices)
  synthesizeSpeech: (text, voice, rate, pitch) => ipcRenderer.invoke('speech:synthesize', { text, voice, rate, pitch }),
  getAvailableEdgeVoices: () => ipcRenderer.invoke('voice:list-edge-voices'),

  // Custom Voice Files from PC
  saveCustomVoice: (dataUrl, name) => ipcRenderer.invoke('voice:save-custom', { dataUrl, name }),
  listCustomVoices: () => ipcRenderer.invoke('voice:list-custom'),
  deleteCustomVoice: (id) => ipcRenderer.invoke('voice:delete-custom', id),

  // Window Controls
  resizePetWindow: (width, height) => ipcRenderer.send('window:resize-pet', { width, height }),
  minimizePet: () => ipcRenderer.send('window:minimize-pet'),
  closeApp: () => ipcRenderer.send('window:close-app'),
  openDashboard: () => ipcRenderer.send('window:open-dashboard'),
  openModuleWindow: (moduleId, opts = {}) => ipcRenderer.invoke('window:open-module', { moduleId, opts }),
  goHomeInDashboard: (targetTab = 'tab-home') => ipcRenderer.invoke('window:go-home', targetTab),
  closeDashboard: () => ipcRenderer.send('window:close-dashboard'),
  toggleAlwaysOnTop: (enable) => ipcRenderer.invoke('window:toggle-always-on-top', enable),
  onToggleMinimalMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('pet:toggle-minimal-mode', handler);
    return () => ipcRenderer.removeListener('pet:toggle-minimal-mode', handler);
  },
  onSetMinimalMode: (callback) => {
    const handler = (event, enable) => callback(enable);
    ipcRenderer.on('pet:set-minimal-mode', handler);
    return () => ipcRenderer.removeListener('pet:set-minimal-mode', handler);
  },
  onSetScale: (callback) => {
    const handler = (event, scale) => callback(scale);
    ipcRenderer.on('pet:set-scale', handler);
    return () => ipcRenderer.removeListener('pet:set-scale', handler);
  },

  // Configuration
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  onSettingsUpdated: (callback) => {
    const handler = (event, settings) => callback(settings);
    ipcRenderer.on('settings:updated', handler);
    return () => ipcRenderer.removeListener('settings:updated', handler);
  },

  // Custom Pets & Comfy Desktop
  savePhotoPet: (dataUrl, name) => ipcRenderer.invoke('pet:save-photo', { dataUrl, name }),
  generateAiPet: (prompt, name, style, options = {}) => ipcRenderer.invoke('pet:generate-ai', { prompt, name, style, ...options }),
  listCustomPets: () => ipcRenderer.invoke('pet:list-custom'),
  deleteCustomPet: (id) => ipcRenderer.invoke('pet:delete-custom', id),
  getComfyStatus: () => ipcRenderer.invoke('comfy:get-status'),
  openComfyDesktop: () => ipcRenderer.invoke('comfy:open-desktop'),

  // LiveKit Hands-Free Live Call
  getLiveKitStatus: () => ipcRenderer.invoke('livekit:get-status'),
  configureLiveKit: (cfg) => ipcRenderer.invoke('livekit:configure', cfg),
  getLiveKitToken: (participantName) => ipcRenderer.invoke('livekit:get-token', participantName),

  // Direct Command Execution
  executeDirectCommand: (text) => ipcRenderer.invoke('command:execute-direct', text),

  // Unreal Engine Control & Integration
  testUnrealConnection: (config) => ipcRenderer.invoke('unreal:test-connection', config),
  executeUnrealCommand: (action, params) => ipcRenderer.invoke('unreal:execute-command', { action, params }),
  getUnrealStatus: () => ipcRenderer.invoke('unreal:get-status'),

  // Test AI Connection
  testAiConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),

  // Ziro Visualizer & ComfyUI Prompt Generation
  openVisualizer: (data) => ipcRenderer.send('visualizer:open', data),
  onLoadVisualizerImage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('visualizer:load-image', handler);
    return () => ipcRenderer.removeListener('visualizer:load-image', handler);
  },
  generateComfyImage: (prompt) => ipcRenderer.invoke('comfy:generate-image', prompt),
  removeBackground: (imagePath) => ipcRenderer.invoke('image:remove-bg', imagePath),

  // Unreal Engine Project Selector & Architecture Suite
  listUnrealProjects: () => ipcRenderer.invoke('projects:list'),
  selectUnrealProject: (uprojectPath) => ipcRenderer.invoke('projects:select', uprojectPath),
  launchUnrealProject: () => ipcRenderer.invoke('projects:launch'),
  browseUnrealProject: () => ipcRenderer.invoke('projects:browse'),
  generateArchitecture: (type, options) => ipcRenderer.invoke('architecture:generate', { type, options }),
  expandBuildingFloors: (name, addFloors) => ipcRenderer.invoke('architecture:expand', { name, addFloors }),
  stretchBuilding: (name, factors) => ipcRenderer.invoke('architecture:stretch', { name, factors }),
  analyzeDesignImage: (base64, filename) => ipcRenderer.invoke('architecture:analyze', { base64, filename }),
  replicateAnalyzedDesign: (analysis) => ipcRenderer.invoke('architecture:replicate', analysis),
  randomizeInterior: (name, type) => ipcRenderer.invoke('architecture:randomize-interior', { name, type }),

  // Módulo Ziro Procedural Architect (UE 5.8)
  architectGenerateBuilding: (params) => ipcRenderer.invoke('architect:generate-building', params),
  architectRegeneratePart: (params) => ipcRenderer.invoke('architect:regenerate-part', params),
  architectApplyHorror: (params) => ipcRenderer.invoke('architect:apply-horror', params),
  architectOpenStudio: (params) => ipcRenderer.invoke('architect:open-studio', params),
  architectSaveAsset: (params) => ipcRenderer.invoke('architect:save-asset', params),
  architectInspectMaterials: (forceScan) => ipcRenderer.invoke('architect:inspect-materials', forceScan),
  architectScanAssets: (forceRescan) => ipcRenderer.invoke('architect:scan-assets', forceRescan),
  architectGenerateWorld: (params) => ipcRenderer.invoke('architect:generate-world', params),
  architectSaveFavorite: (name, recipe) => ipcRenderer.invoke('architect:save-favorite', { name, recipe }),
  architectLoadFavorites: () => ipcRenderer.invoke('architect:load-favorites'),

  // ZIRO System Scanner
  runSystemScanner: () => ipcRenderer.invoke('scanner:run-full'),

  // ZIRO Project Manager
  pmScanRoots: (roots) => ipcRenderer.invoke('pm:scan-roots', roots),
  pmBrowseFolder: (title) => ipcRenderer.invoke('pm:browse-folder', title),
  pmValidateActive: () => ipcRenderer.invoke('pm:validate-active'),
  pmOpenFolder: (folderPath) => ipcRenderer.invoke('pm:open-folder', folderPath),

  // ZIRO Character Fusion
  fusionGetCatalog: () => ipcRenderer.invoke('fusion:get-catalog'),
  fusionScanProject: (uprojectPath) => ipcRenderer.invoke('fusion:scan-project', uprojectPath),
  fusionBrowseSourceProject: () => ipcRenderer.invoke('fusion:browse-source-project'),
  fusionAnalyze: (payload) => ipcRenderer.invoke('fusion:analyze', payload),
  fusionExecute: (payload) => ipcRenderer.invoke('fusion:execute', payload),

  // ZIRO Finisher Studio & AI Animation Editor
  finisherBrowsePack: () => ipcRenderer.invoke('finisher:browse-pack'),
  finisherScanPack: (packFolder) => ipcRenderer.invoke('finisher:scan-pack', packFolder),
  finisherEvaluateTargets: (payload) => ipcRenderer.invoke('finisher:evaluate-targets', payload),
  finisherPickRandom: (payload) => ipcRenderer.invoke('finisher:pick-random', payload),
  finisherAiPropose: (payload) => ipcRenderer.invoke('finisher:ai-propose', payload),
  finisherIntegrate: (payload) => ipcRenderer.invoke('finisher:integrate', payload),
  finisherExportPack: (payload) => ipcRenderer.invoke('finisher:export-pack', payload),

  // Unreal Engine Optimizer
  optimizerAnalyze: (uprojectPath) => ipcRenderer.invoke('optimizer:analyze', uprojectPath),
  optimizerApply: (payload) => ipcRenderer.invoke('optimizer:apply', payload),
  optimizerRevert: (uprojectPath) => ipcRenderer.invoke('optimizer:revert', uprojectPath),

  // ZIRO Gaming Voice Control (Steam & CS2)
  gamingGetState: () => ipcRenderer.invoke('gaming:get-state'),
  gamingRefreshStatus: () => ipcRenderer.invoke('gaming:refresh-status'),
  gamingExecuteAction: (payload) => ipcRenderer.invoke('gaming:execute-action', payload),
  gamingCancelAction: () => ipcRenderer.invoke('gaming:cancel-action'),
  gamingSetConfig: (partial) => ipcRenderer.invoke('gaming:set-config', partial),
  gamingSetSilentMode: (silent) => ipcRenderer.invoke('gaming:set-silent-mode', silent),
  onGamingStateUpdated: (cb) => ipcRenderer.on('gaming:state-updated', (_e, state) => cb(state)),
  onPetSilentModeSync: (cb) => ipcRenderer.on('pet:silent-mode-sync', (_e, data) => cb(data)),

  // Cyberpunk Explorer API
  openExplorer: (targetPath) => ipcRenderer.invoke('explorer:open', targetPath),
  readDirectory: (targetPath) => ipcRenderer.invoke('explorer:read-dir', targetPath),
  openFile: (filePath) => ipcRenderer.invoke('explorer:open-file', filePath),
  getSpecialPath: (name) => ipcRenderer.invoke('explorer:get-special-path', name),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
});
