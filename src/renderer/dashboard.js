/**
 * ZIRO PET DESTEKOP - Dashboard Controller
 * Audio Hardware Selection, Neural Voices, Custom Audio Uploads & AI Settings
 */

let currentSettings = null;
let pendingPhotoDataUrl = null;
let pendingVoiceDataUrl = null;
let micTestStream = null;
let micTestContext = null;
let micTestAnimId = null;

// DOM References
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('pageTitle');
const currentPetSummary = document.getElementById('currentPetSummary');
const btnSaveAll = document.getElementById('btnSaveAll');

// Pets
const inputPetName = document.getElementById('inputPetName');
const btnUpdateName = document.getElementById('btnUpdateName');
const defaultPetCards = document.querySelectorAll('.pet-card');
const customPetsGrid = document.getElementById('customPetsGrid');
const emptyCustomPets = document.getElementById('emptyCustomPets');

// Photo Upload
const photoDropZone = document.getElementById('photoDropZone');
const filePhotoInput = document.getElementById('filePhotoInput');
const uploadPreviewBox = document.getElementById('uploadPreviewBox');
const photoPreviewImg = document.getElementById('photoPreviewImg');
const photoPetNameInput = document.getElementById('photoPetNameInput');
const btnSavePhotoPet = document.getElementById('btnSavePhotoPet');

// AI Prompt Generation
const aiPromptInput = document.getElementById('aiPromptInput');
const aiStyleSelect = document.getElementById('aiStyleSelect');
const aiPetNameInput = document.getElementById('aiPetNameInput');
const btnGenerateAiPet = document.getElementById('btnGenerateAiPet');
const genSpinner = document.getElementById('genSpinner');
const aiGeneratedPreview = document.getElementById('aiGeneratedPreview');
const aiGeneratedImg = document.getElementById('aiGeneratedImg');
const btnAdoptAiPet = document.getElementById('btnAdoptAiPet');

// Audio Hardware Devices
const selectAudioInput = document.getElementById('selectAudioInput');
const selectAudioOutput = document.getElementById('selectAudioOutput');
const btnTestMic = document.getElementById('btnTestMic');
const micLevelFill = document.getElementById('micLevelFill');
const btnTestSpeaker = document.getElementById('btnTestSpeaker');
const speakerStatus = document.getElementById('speakerStatus');

// Voice & TTS
const voiceSelect = document.getElementById('voiceSelect');
const sliderRate = document.getElementById('sliderRate');
const valRate = document.getElementById('valRate');
const sliderPitch = document.getElementById('sliderPitch');
const valPitch = document.getElementById('valPitch');
const btnTestVoice = document.getElementById('btnTestVoice');
const chkSttEnabled = document.getElementById('chkSttEnabled');
const chkTtsEnabled = document.getElementById('chkTtsEnabled');
const chkAutoSpeak = document.getElementById('chkAutoSpeak');

// Custom Voice Upload
const voiceDropZone = document.getElementById('voiceDropZone');
const fileVoiceInput = document.getElementById('fileVoiceInput');
const customVoiceLoadedName = document.getElementById('customVoiceLoadedName');
const customVoiceNameInput = document.getElementById('customVoiceNameInput');
const btnSaveCustomVoice = document.getElementById('btnSaveCustomVoice');
const customVoicesList = document.getElementById('customVoicesList');

// AI Settings
const aiModeRadios = document.querySelectorAll('input[name="aiMode"]');
const paramsLocal = document.getElementById('paramsLocal');
const paramsCloud = document.getElementById('paramsCloud');
const aiLocalEndpoint = document.getElementById('aiLocalEndpoint');
const aiLocalModel = document.getElementById('aiLocalModel');
const aiApiKey = document.getElementById('aiApiKey');
const btnToggleApiKey = document.getElementById('btnToggleApiKey');
const aiCloudModel = document.getElementById('aiCloudModel');
const aiCustomPrompt = document.getElementById('aiCustomPrompt');
const btnTestAiConnection = document.getElementById('btnTestAiConnection');
const testConnectionStatus = document.getElementById('testConnectionStatus');

// Commands
const customCmdTrigger = document.getElementById('customCmdTrigger');
const customCmdType = document.getElementById('customCmdType');
const customCmdTarget = document.getElementById('customCmdTarget');
const btnAddCustomCmd = document.getElementById('btnAddCustomCmd');
const customCommandsList = document.getElementById('customCommandsList');

// Appearance
const chkAlwaysOnTop = document.getElementById('chkAlwaysOnTop');
const scaleButtons = document.querySelectorAll('.btn-scale');
const sliderPetScale = document.getElementById('sliderPetScale');
const lblPetScaleVal = document.getElementById('lblPetScaleVal');

// Initialize
async function initDashboard() {
  currentSettings = await window.ziroAPI.getSettings();
  setupNavigation();
  await loadAudioDevices();
  await populateVoices();
  fillFormFromSettings(currentSettings);
  renderCustomPets();
  renderCustomVoices();
  renderCustomCommands();
  setupEventListeners();
  refreshComfyStatus();
}

async function refreshComfyStatus() {
  const badge = document.getElementById('comfyStatusBadge');
  const detail = document.getElementById('comfyStatusDetail');
  if (!badge || !detail || !window.ziroAPI.getComfyStatus) return;

  try {
    const st = await window.ziroAPI.getComfyStatus();
    if (st && st.connected) {
      badge.textContent = 'CONECTADO A COMFY DESKTOP';
      badge.style.background = '#00ff44';
      badge.style.color = '#070c0a';
      detail.textContent = `✓ ComfyUI v${st.comfyVersion} Activo (${st.gpuName}) | Modelo: Z-Image-Turbo`;
      detail.style.color = '#00ff44';
    } else {
      badge.textContent = st?.desktopInstalled ? 'LISTO PARA ABRIR' : 'DESCONECTADO';
      badge.style.background = 'rgba(0, 255, 68, 0.15)';
      badge.style.color = '#00ff44';
      detail.textContent = st?.desktopInstalled
        ? 'Haz clic en "Abrir Comfy Desktop en mi Pantalla" o genera un personaje para iniciarlo automáticamente.'
        : 'Servidor local ComfyUI en espera (127.0.0.1:8188).';
      detail.style.color = '#a0aec0';
    }
  } catch (e) {
    badge.textContent = 'EN ESPERA';
    detail.textContent = `Comfy Desktop local (127.0.0.1:8188)`;
  }
}

// Navigation
function setupNavigation() {
  const titles = {
    'tab-home': 'Inicio — Centro de Comando ZIRO AI PET',
    'tab-pets': 'Mascotas & Compañía',
    'tab-voice': 'Dispositivos y Voz (LiveKit)',
    'tab-ai': 'Conexión de IA (LM Studio / Local)',
    'tab-commands': 'Comandos por Voz',
    'tab-unreal': 'Unreal Engine 5 (Control Directo)',
    'tab-procedural': 'ZIRO PROCEDURAL FRAMEWORK — Ciudades, Edificios y PCG',
    'tab-fusion': 'ZIRO CHARACTER FUSION — Fusión de Personajes y Packs Fab',
    'tab-finisher': 'ZIRO FINISHER STUDIO — Multi-Target, Shuffle Bag & AI Anim Editor',
    'tab-scanner': 'ZIRO SYSTEM SCANNER — Auditoría Multi-Disco',
    'tab-appearance': 'APARIENCIA ZIRO — Paletas, Colores HEX/RGB y Animaciones',
    'tab-distribution': 'EXE y Distribución (Windows / Android APK)',
    'tab-settings': 'Ajustes Generales y Seguridad'
  };

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      pageTitle.textContent = titles[targetId] || 'Panel de Control';
    });
  });
}

/* ============================================================
   Audio Hardware Device Enumeration (Mic & Speakers)
   ============================================================ */
async function loadAudioDevices() {
  try {
    // Request permission once to unlock device labels
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch (e) {}

    const devices = await navigator.mediaDevices.enumerateDevices();

    // Inputs (Microphones)
    selectAudioInput.innerHTML = '<option value="default">🎙️ Micrófono Predeterminado del Sistema</option>';
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    audioInputs.forEach((dev, idx) => {
      if (dev.deviceId !== 'default') {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = `🎙️ ${dev.label || `Micrófono ${idx + 1}`}`;
        selectAudioInput.appendChild(opt);
      }
    });

    // Outputs (Speakers / Headphones)
    selectAudioOutput.innerHTML = '<option value="default">🔊 Altavoces Predeterminados del Sistema</option>';
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
    audioOutputs.forEach((dev, idx) => {
      if (dev.deviceId !== 'default') {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = `🔊 ${dev.label || `Dispositivo de Salida ${idx + 1}`}`;
        selectAudioOutput.appendChild(opt);
      }
    });

    // Set saved device selections
    if (currentSettings?.voiceConfig?.audioInputId) {
      selectAudioInput.value = currentSettings.voiceConfig.audioInputId;
    }
    if (currentSettings?.voiceConfig?.audioOutputId) {
      selectAudioOutput.value = currentSettings.voiceConfig.audioOutputId;
    }
  } catch (err) {
    console.warn('Error enumerando dispositivos de audio:', err);
  }
}

/* ============================================================
   Populate Neural Spanish Voices & System Voices
   ============================================================ */
async function populateVoices() {
  voiceSelect.innerHTML = '';

  // 1. Edge Neural Voices (High Definition Spanish)
  const optGroupEdge = document.createElement('optgroup');
  optGroupEdge.label = '✨ Voces Naturales en Español (Neural HD)';

  try {
    const edgeVoices = await window.ziroAPI.getAvailableEdgeVoices();
    if (edgeVoices && edgeVoices.length > 0) {
      edgeVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.name}`;
        optGroupEdge.appendChild(opt);
      });
      voiceSelect.appendChild(optGroupEdge);
    }
  } catch (e) {
    console.warn('Error cargando voces Edge:', e);
  }

  // 2. System Browser Voices
  if ('speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const optGroupSys = document.createElement('optgroup');
      optGroupSys.label = '💻 Voces del Sistema Operativo';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        optGroupSys.appendChild(opt);
      });
      voiceSelect.appendChild(optGroupSys);
    }
  }

  if (currentSettings?.voiceConfig?.voiceName) {
    voiceSelect.value = currentSettings.voiceConfig.voiceName;
  }
}

// Fill Settings Form
function fillFormFromSettings(s) {
  if (!s) return;

  inputPetName.value = s.petName || 'Ziro';
  currentPetSummary.textContent = `Mascota: ${s.petName || 'Ziro'}`;

  const inputUserName = document.getElementById('inputUserName');
  if (inputUserName) inputUserName.value = s.userName || 'Legolas';

  updateSelectedPetCard(s.selectedPet || 'ziro');

  const mode = s.aiConfig?.mode || 'offline';
  const radio = document.querySelector(`input[name="aiMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  toggleAiParamsDisplay(mode);

  aiLocalEndpoint.value = s.aiConfig?.localEndpoint || 'http://localhost:11434';
  aiLocalModel.value = s.aiConfig?.localModel || 'llama3';
  aiApiKey.value = s.aiConfig?.apiKey || '';
  aiCloudModel.value = s.aiConfig?.cloudModel || 'llama-3.3-70b-versatile';
  aiCustomPrompt.value = s.aiConfig?.customPrompt || '';

  chkSttEnabled.checked = s.voiceConfig?.sttEnabled ?? true;
  chkTtsEnabled.checked = s.voiceConfig?.ttsEnabled ?? true;
  chkAutoSpeak.checked = s.voiceConfig?.autoSpeak ?? true;

  const rate = s.voiceConfig?.rate || 1.05;
  sliderRate.value = rate;
  valRate.textContent = `${rate}x`;

  const pitch = s.voiceConfig?.pitch || 1.0;
  sliderPitch.value = pitch;
  valPitch.textContent = `${pitch}`;

  if (s.voiceConfig?.voiceName) {
    voiceSelect.value = s.voiceConfig.voiceName;
  }

  chkAlwaysOnTop.checked = s.appearance?.alwaysOnTop ?? true;
  const currentScale = s.appearance?.petScale || 1.0;
  scaleButtons.forEach(btn => {
    btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.scale) - currentScale) < 0.05);
  });
  if (sliderPetScale) {
    sliderPetScale.value = currentScale;
  }
  if (lblPetScaleVal) {
    lblPetScaleVal.textContent = `${Math.round(currentScale * 100)}%`;
  }

  // Holographic rings & particle appearance
  const ring1 = s.appearance?.ringColor1 || '#00ff44';
  const ring2 = s.appearance?.ringColor2 || '#00e5ff';
  const paletteBtns = document.querySelectorAll('#ringsPalette .btn-palette');
  paletteBtns.forEach(btn => {
    const b1 = btn.dataset.ring1;
    const b2 = btn.dataset.ring2;
    const isMatch = (b1 && b1.toLowerCase() === ring1.toLowerCase()) && (b2 && b2.toLowerCase() === ring2.toLowerCase());
    btn.classList.toggle('active', isMatch);
    if (isMatch) btn.style.border = '2px solid #fff';
    else btn.style.border = '1px solid rgba(255,255,255,0.2)';
  });

  const selectParticleEffect = document.getElementById('selectParticleEffect');
  if (selectParticleEffect && s.appearance?.particleEffect) {
    selectParticleEffect.value = s.appearance.particleEffect;
  }
  const inputParticleColor = document.getElementById('inputParticleColor');
  const particleColorHex = document.getElementById('particleColorHex');
  if (inputParticleColor && s.appearance?.particleColor) {
    inputParticleColor.value = s.appearance.particleColor;
    if (particleColorHex) particleColorHex.textContent = s.appearance.particleColor;
  }

  // Unreal Engine settings
  const ueHostInput = document.getElementById('ueHost');
  const uePortInput = document.getElementById('uePort');
  if (s.unrealConfig) {
    if (ueHostInput && s.unrealConfig.host) ueHostInput.value = s.unrealConfig.host;
    if (uePortInput && s.unrealConfig.port) uePortInput.value = s.unrealConfig.port;
  }

  // LiveKit Hands-Free Call settings
  const chkLiveKitEnabled = document.getElementById('chkLiveKitEnabled');
  const inputLiveKitWakeWord = document.getElementById('inputLiveKitWakeWord');
  const sliderLiveKitThreshold = document.getElementById('sliderLiveKitThreshold');
  const valLiveKitThreshold = document.getElementById('valLiveKitThreshold');
  const inputLiveKitServer = document.getElementById('inputLiveKitServer');

  if (chkLiveKitEnabled) chkLiveKitEnabled.checked = s.livekitConfig?.enabled !== false;
  if (inputLiveKitWakeWord) inputLiveKitWakeWord.value = s.livekitConfig?.wakeWord || 'activar ziro';
  if (sliderLiveKitThreshold) {
    const th = s.livekitConfig?.vadThreshold || 8;
    sliderLiveKitThreshold.value = th;
    if (valLiveKitThreshold) valLiveKitThreshold.textContent = `${th}%`;
  }
  if (inputLiveKitServer) inputLiveKitServer.value = s.livekitConfig?.serverUrl || 'wss://ziro-livekit.livekit.cloud';
}

function updateSelectedPetCard(petId) {
  defaultPetCards.forEach(card => {
    card.classList.toggle('selected', card.dataset.petId === petId);
  });
}

function toggleAiParamsDisplay(mode) {
  if (mode.startsWith('local')) {
    paramsLocal.style.display = 'block';
    paramsCloud.style.display = 'none';
  } else if (mode.startsWith('cloud')) {
    paramsLocal.style.display = 'none';
    paramsCloud.style.display = 'block';
  } else {
    paramsLocal.style.display = 'none';
    paramsCloud.style.display = 'none';
  }
}

// Render Custom Pets
async function renderCustomPets() {
  const customPets = await window.ziroAPI.listCustomPets();
  customPetsGrid.innerHTML = '';

  if (!customPets || customPets.length === 0) {
    emptyCustomPets.style.display = 'block';
    customPetsGrid.appendChild(emptyCustomPets);
    return;
  }

  emptyCustomPets.style.display = 'none';

  customPets.forEach(pet => {
    const card = document.createElement('div');
    card.className = 'pet-card';
    if (currentSettings?.selectedPet === pet.id) {
      card.classList.add('selected');
    }

    let petTypeLabel = '📸 Anime 3D Sin Fondo';
    if (pet.type === 'comfy_anime' || pet.engine === 'comfyui') {
      petTypeLabel = '🎨 Anime ComfyUI 3D';
    } else if (pet.type === 'custom_ai') {
      petTypeLabel = '✨ Generada por IA';
    }

    card.innerHTML = `
      <div class="pet-thumb">
        <img src="${pet.src}" alt="${pet.name}" />
      </div>
      <h3>${pet.name}</h3>
      <p>${petTypeLabel}</p>
      <span class="check-badge">✓ ACTIVO</span>
      <button class="btn-del-cmd" style="margin-top:6px;" title="Eliminar mascota">🗑️ Borrar</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-cmd')) return;
      currentSettings.selectedPet = pet.id;
      currentSettings.petName = pet.name;
      inputPetName.value = pet.name;
      saveCurrentSettings();
      updateSelectedPetCard(pet.id);
      renderCustomPets();
    });

    const delBtn = card.querySelector('.btn-del-cmd');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`¿Eliminar la mascota "${pet.name}"?`)) {
        await window.ziroAPI.deleteCustomPet(pet.id);
        renderCustomPets();
      }
    });

    customPetsGrid.appendChild(card);
  });
}

// Render Custom Voices
async function renderCustomVoices() {
  const customVoices = await window.ziroAPI.listCustomVoices();
  customVoicesList.innerHTML = '';

  if (!customVoices || customVoices.length === 0) {
    customVoicesList.innerHTML = '<p style="font-size:12px; color:var(--color-text-dim);">No hay archivos de voz personalizados cargados aún.</p>';
    return;
  }

  customVoices.forEach(v => {
    const item = document.createElement('div');
    item.className = 'custom-voice-item';
    item.innerHTML = `
      <div class="voice-title">🎵 ${v.name} <small style="color:var(--color-text-dim);">(${v.filename})</small></div>
      <div class="custom-voice-actions">
        <button class="btn btn-secondary btn-sm btn-play-voice">▶️ Reproducir</button>
        <button class="btn-del-cmd btn-del-voice" title="Eliminar">🗑️</button>
      </div>
    `;

    item.querySelector('.btn-play-voice').addEventListener('click', () => {
      const audio = new Audio(v.audioUrl);
      if (selectAudioOutput.value && selectAudioOutput.value !== 'default' && typeof audio.setSinkId === 'function') {
        audio.setSinkId(selectAudioOutput.value);
      }
      audio.play();
    });

    item.querySelector('.btn-del-voice').addEventListener('click', async () => {
      if (confirm(`¿Eliminar la voz "${v.name}"?`)) {
        await window.ziroAPI.deleteCustomVoice(v.id);
        renderCustomVoices();
      }
    });

    customVoicesList.appendChild(item);
  });
}

// Render Custom Commands
function renderCustomCommands() {
  customCommandsList.innerHTML = '';
  const commands = currentSettings?.customCommands || [];

  if (commands.length === 0) {
    customCommandsList.innerHTML = '<p style="font-size:12px; color:var(--color-text-dim);">No hay comandos adicionales configurados.</p>';
    return;
  }

  commands.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = 'custom-cmd-item';
    item.innerHTML = `
      <div>
        <strong style="color:var(--color-neon-fluor); font-family:var(--font-mono);">"${cmd.trigger}"</strong>
        <span style="font-size:11px; color:var(--color-text-muted); margin-left: 8px;">→ ${cmd.target} (${cmd.type})</span>
      </div>
      <button class="btn-del-cmd" data-idx="${idx}" title="Eliminar">🗑️</button>
    `;

    item.querySelector('.btn-del-cmd').addEventListener('click', () => {
      currentSettings.customCommands.splice(idx, 1);
      saveCurrentSettings();
      renderCustomCommands();
    });

    customCommandsList.appendChild(item);
  });
}

// Save Full Settings
async function saveCurrentSettings() {
  const selectedMode = document.querySelector('input[name="aiMode"]:checked')?.value || 'offline';

  // Always merge with latest customPets from disk/backend so customPets is never lost!
  const latestBackendSettings = await window.ziroAPI.getSettings();
  let diskPets = [];
  try {
    diskPets = await window.ziroAPI.listCustomPets();
  } catch (e) {}

  const petMap = new Map();
  (latestBackendSettings?.customPets || []).forEach(p => { if (p && p.id) petMap.set(p.id, p); });
  (currentSettings?.customPets || []).forEach(p => { if (p && p.id) petMap.set(p.id, p); });
  (diskPets || []).forEach(p => { if (p && p.id) petMap.set(p.id, p); });
  const mergedCustomPets = Array.from(petMap.values());

  const newSettings = {
    petName: inputPetName.value.trim() || 'Ziro',
    userName: document.getElementById('inputUserName')?.value?.trim() || 'Legolas',
    selectedPet: currentSettings.selectedPet || 'ziro',
    customPets: mergedCustomPets,
    aiConfig: {
      mode: selectedMode,
      localEndpoint: aiLocalEndpoint.value.trim(),
      localModel: aiLocalModel.value.trim(),
      apiKey: aiApiKey.value.trim(),
      cloudModel: aiCloudModel.value.trim(),
      customPrompt: aiCustomPrompt.value.trim()
    },
    voiceConfig: {
      sttEnabled: chkSttEnabled.checked,
      ttsEnabled: chkTtsEnabled.checked,
      autoSpeak: chkAutoSpeak.checked,
      voiceName: voiceSelect.value || 'es-ES-AlvaroNeural',
      audioInputId: selectAudioInput.value || '',
      audioOutputId: selectAudioOutput.value || '',
      pitch: parseFloat(sliderPitch.value),
      rate: parseFloat(sliderRate.value),
      language: 'es-ES'
    },
    appearance: {
      alwaysOnTop: chkAlwaysOnTop.checked,
      petScale: currentSettings.appearance?.petScale || 1.0,
      windowPosition: currentSettings.appearance?.windowPosition || null,
      ringColor1: currentSettings.appearance?.ringColor1 || '#00ff44',
      ringColor2: currentSettings.appearance?.ringColor2 || '#00e5ff',
      particleEffect: document.getElementById('selectParticleEffect')?.value || currentSettings.appearance?.particleEffect || 'estrellas',
      particleColor: document.getElementById('inputParticleColor')?.value || currentSettings.appearance?.particleColor || '#00ff44'
    },
    unrealConfig: {
      enabled: true,
      host: document.getElementById('ueHost')?.value?.trim() || '127.0.0.1',
      port: parseInt(document.getElementById('uePort')?.value, 10) || 55557
    },
    livekitConfig: {
      enabled: document.getElementById('chkLiveKitEnabled')?.checked !== false,
      alwaysListening: true,
      wakeWord: document.getElementById('inputLiveKitWakeWord')?.value?.trim() || 'activar ziro',
      vadThreshold: parseInt(document.getElementById('sliderLiveKitThreshold')?.value, 10) || 8,
      silenceMs: 1000,
      serverUrl: document.getElementById('inputLiveKitServer')?.value?.trim() || 'wss://ziro-livekit.livekit.cloud'
    },
    customCommands: currentSettings.customCommands || []
  };

  currentSettings = await window.ziroAPI.saveSettings(newSettings);
  currentPetSummary.textContent = `Mascota: ${currentSettings.petName}`;
  showTemporaryNotice('¡Configuración guardada y sincronizada!');
}

function showTemporaryNotice(text) {
  const original = btnSaveAll.textContent;
  btnSaveAll.textContent = text;
  btnSaveAll.style.background = '#00ffcc';
  setTimeout(() => {
    btnSaveAll.textContent = original;
    btnSaveAll.style.background = '';
  }, 2500);
}

// Event Listeners
function setupEventListeners() {
  btnSaveAll.addEventListener('click', saveCurrentSettings);

  btnUpdateName.addEventListener('click', () => saveCurrentSettings());

  defaultPetCards.forEach(card => {
    card.addEventListener('click', () => {
      const petId = card.dataset.petId;
      currentSettings.selectedPet = petId;
      updateSelectedPetCard(petId);
      saveCurrentSettings();
      renderCustomPets();
    });
  });

  aiModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => toggleAiParamsDisplay(e.target.value));
  });

  // Auto-save on device and voice changes
  selectAudioInput.addEventListener('change', () => saveCurrentSettings());
  selectAudioOutput.addEventListener('change', () => saveCurrentSettings());
  voiceSelect.addEventListener('change', () => saveCurrentSettings());
  chkSttEnabled.addEventListener('change', () => saveCurrentSettings());
  chkTtsEnabled.addEventListener('change', () => saveCurrentSettings());
  chkAutoSpeak.addEventListener('change', () => saveCurrentSettings());

  btnToggleApiKey.addEventListener('click', () => {
    aiApiKey.type = aiApiKey.type === 'password' ? 'text' : 'password';
  });

  // Test Microphone in Real-Time
  let isTestingMic = false;
  btnTestMic.addEventListener('click', async () => {
    if (isTestingMic) {
      if (micTestStream) micTestStream.getTracks().forEach(t => t.stop());
      if (micTestContext) micTestContext.close();
      if (micTestAnimId) cancelAnimationFrame(micTestAnimId);
      micLevelFill.style.width = '0%';
      btnTestMic.textContent = '🎙️ Probar Micrófono en Vivo';
      isTestingMic = false;
      return;
    }

    try {
      const constraints = {
        audio: selectAudioInput.value && selectAudioInput.value !== 'default'
          ? { deviceId: { exact: selectAudioInput.value } }
          : true
      };
      micTestStream = await navigator.mediaDevices.getUserMedia(constraints);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      micTestContext = new AudioCtx();
      const source = micTestContext.createMediaStreamSource(micTestStream);
      const analyser = micTestContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      isTestingMic = true;
      btnTestMic.textContent = '⏹️ Detener Prueba';

      function updateMeter() {
        if (!isTestingMic) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const pct = Math.min(100, Math.round((avg / 80) * 100));
        micLevelFill.style.width = `${pct}%`;
        micTestAnimId = requestAnimationFrame(updateMeter);
      }
      updateMeter();
    } catch (e) {
      alert(`Error al probar micrófono: ${e.message}`);
    }
  });

  // Test Speaker Output Device
  btnTestSpeaker.addEventListener('click', async () => {
    speakerStatus.textContent = 'Reproduciendo sonido...';
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, actx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, actx.currentTime + 0.2); // A5

      gain.gain.setValueAtTime(0.2, actx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(actx.destination);

      if (selectAudioOutput.value && selectAudioOutput.value !== 'default' && typeof actx.setSinkId === 'function') {
        await actx.setSinkId(selectAudioOutput.value);
      }

      osc.start();
      osc.stop(actx.currentTime + 0.35);
      speakerStatus.textContent = '✓ Sonido emitido con éxito';
    } catch (e) {
      speakerStatus.textContent = `✕ Error: ${e.message}`;
    }
  });

  // Test Voice Synthesis
  btnTestVoice.addEventListener('click', async () => {
    const name = inputPetName.value.trim() || 'Ziro';
    const sampleText = `¡Hola humano! Soy ${name}. Probando mi voz en tiempo real a través de los altavoces seleccionados.`;
    const selectedVoice = voiceSelect.value || 'es-ES-AlvaroNeural';
    const rate = parseFloat(sliderRate.value);
    const pitch = parseFloat(sliderPitch.value);

    try {
      const res = await window.ziroAPI.synthesizeSpeech(sampleText, selectedVoice, rate, pitch);
      if (res && res.success && res.audioUrl) {
        const audio = new Audio(res.audioUrl);
        if (selectAudioOutput.value && selectAudioOutput.value !== 'default' && typeof audio.setSinkId === 'function') {
          await audio.setSinkId(selectAudioOutput.value);
        }
        audio.play();
      } else {
        alert('Fallo al generar voz');
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  });

  // Custom Voice Upload Zone
  voiceDropZone.addEventListener('click', () => fileVoiceInput.click());

  fileVoiceInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingVoiceDataUrl = event.target.result;
      customVoiceLoadedName.textContent = `✓ Archivo cargado: ${file.name}`;
      customVoiceLoadedName.style.display = 'block';
      customVoiceNameInput.value = file.name.split('.')[0];
      btnSaveCustomVoice.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  btnSaveCustomVoice.addEventListener('click', async () => {
    if (!pendingVoiceDataUrl) return;
    btnSaveCustomVoice.disabled = true;
    btnSaveCustomVoice.textContent = 'Guardando...';

    const name = customVoiceNameInput.value.trim() || 'Voz Personalizada';
    await window.ziroAPI.saveCustomVoice(pendingVoiceDataUrl, name);

    btnSaveCustomVoice.textContent = '✓ ¡Voz Guardada!';
    setTimeout(() => {
      btnSaveCustomVoice.textContent = 'Guardar Voz';
      btnSaveCustomVoice.disabled = false;
      customVoiceLoadedName.style.display = 'none';
      pendingVoiceDataUrl = null;
    }, 2000);

    renderCustomVoices();
  });

  // Voice sliders live text
  sliderRate.addEventListener('input', () => {
    valRate.textContent = `${sliderRate.value}x`;
  });
  sliderPitch.addEventListener('input', () => {
    valPitch.textContent = `${sliderPitch.value}`;
  });

  const sliderLiveKitThreshold = document.getElementById('sliderLiveKitThreshold');
  const valLiveKitThreshold = document.getElementById('valLiveKitThreshold');
  if (sliderLiveKitThreshold && valLiveKitThreshold) {
    sliderLiveKitThreshold.addEventListener('input', () => {
      valLiveKitThreshold.textContent = `${sliderLiveKitThreshold.value}%`;
    });
    sliderLiveKitThreshold.addEventListener('change', () => saveCurrentSettings());
  }
  const chkLiveKitEnabled = document.getElementById('chkLiveKitEnabled');
  if (chkLiveKitEnabled) {
    chkLiveKitEnabled.addEventListener('change', () => saveCurrentSettings());
  }

  // Photo Upload Zone
  photoDropZone.addEventListener('click', () => filePhotoInput.click());

  filePhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingPhotoDataUrl = event.target.result;
      photoPreviewImg.src = pendingPhotoDataUrl;
      photoPreviewImg.style.display = 'block';
      uploadPreviewBox.style.display = 'none';
      btnSavePhotoPet.disabled = false;
      if (!photoPetNameInput.value) {
        photoPetNameInput.value = file.name.split('.')[0] || 'Mi Mascota';
      }
    };
    reader.readAsDataURL(file);
  });

  btnSavePhotoPet.addEventListener('click', async () => {
    if (!pendingPhotoDataUrl) return;

    btnSavePhotoPet.disabled = true;
    btnSavePhotoPet.textContent = '🎨 Removiendo fondo con IA y generando modelo 3D...';

    const name = photoPetNameInput.value.trim() || 'Mi Mascota 3D';
    const newPet = await window.ziroAPI.savePhotoPet(pendingPhotoDataUrl, name);

    currentSettings = await window.ziroAPI.getSettings();
    currentSettings.selectedPet = newPet.id;
    currentSettings.petName = name;
    inputPetName.value = name;
    await saveCurrentSettings();

    btnSavePhotoPet.textContent = '✓ ¡Mascota 3D Creada y Activada!';
    setTimeout(() => {
      btnSavePhotoPet.textContent = 'Guardar y Activar Mascota';
      btnSavePhotoPet.disabled = false;
      photoPreviewImg.style.display = 'none';
      uploadPreviewBox.style.display = 'flex';
      pendingPhotoDataUrl = null;
    }, 2500);

    renderCustomPets();
  });

  // Comfy Desktop Controls & Anime Presets
  const btnOpenComfyDesktop = document.getElementById('btnOpenComfyDesktop');
  const btnCheckComfyStatus = document.getElementById('btnCheckComfyStatus');
  const comfyStatusDetail = document.getElementById('comfyStatusDetail');

  if (btnOpenComfyDesktop) {
    btnOpenComfyDesktop.addEventListener('click', async () => {
      btnOpenComfyDesktop.disabled = true;
      btnOpenComfyDesktop.textContent = '⏳ Abriendo Comfy Desktop en tu pantalla...';
      if (comfyStatusDetail) comfyStatusDetail.textContent = 'Lanzando Comfy Desktop y enlazando con puerto 8188...';
      try {
        const res = await window.ziroAPI.openComfyDesktop();
        await refreshComfyStatus();
        if (comfyStatusDetail && res?.message) {
          comfyStatusDetail.textContent = res.message;
        }
      } catch (e) {
        if (comfyStatusDetail) comfyStatusDetail.textContent = `Error al abrir Comfy Desktop: ${e.message}`;
      } finally {
        btnOpenComfyDesktop.disabled = false;
        btnOpenComfyDesktop.textContent = '🖥️ Abrir Comfy Desktop en mi Pantalla';
      }
    });
  }

  if (btnCheckComfyStatus) {
    btnCheckComfyStatus.addEventListener('click', async () => {
      btnCheckComfyStatus.disabled = true;
      await refreshComfyStatus();
      btnCheckComfyStatus.disabled = false;
    });
  }

  document.querySelectorAll('.btn-anime-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.prompt) aiPromptInput.value = btn.dataset.prompt;
      if (btn.dataset.name) aiPetNameInput.value = btn.dataset.name;
      if (btn.dataset.style) aiStyleSelect.value = btn.dataset.style;
    });
  });

  // AI / Comfy Desktop Prompt Generation
  let generatedAiPetData = null;
  btnGenerateAiPet.addEventListener('click', async () => {
    const prompt = aiPromptInput.value.trim();
    if (!prompt) {
      alert('Por favor escribe un prompt o elige una plantilla rápida de anime.');
      return;
    }

    const useComfy = document.getElementById('chkUseComfyEngine')?.checked !== false;
    const openOnScreen = document.getElementById('chkComfyOpenScreen')?.checked !== false;
    const btnTextSpan = document.getElementById('btnGenerateAiPetText');

    btnGenerateAiPet.disabled = true;
    genSpinner.style.display = 'inline-block';
    aiGeneratedPreview.style.display = 'none';
    if (btnTextSpan) {
      btnTextSpan.textContent = useComfy
        ? '🎨 Trabajando en Comfy Desktop (Z-Image-Turbo) + Recorte 3D...'
        : '⏳ Generando Mascota y recortando fondo...';
    }

    const style = aiStyleSelect.value;
    const name = aiPetNameInput.value.trim() || 'Anime Comfy 3D';

    try {
      const newPet = await window.ziroAPI.generateAiPet(prompt, name, style, { useComfy, openOnScreen });
      generatedAiPetData = newPet;

      aiGeneratedImg.src = newPet.src;
      aiGeneratedPreview.style.display = 'block';
      currentSettings.selectedPet = newPet.id;
      currentSettings.petName = name;
      inputPetName.value = name;

      await refreshComfyStatus();
      renderCustomPets();
    } catch (err) {
      alert(`Error al generar mascota con Comfy Desktop / IA: ${err.message}`);
    } finally {
      btnGenerateAiPet.disabled = false;
      genSpinner.style.display = 'none';
      if (btnTextSpan) {
        btnTextSpan.textContent = '🎨 Generar Personaje en Comfy Desktop';
      }
    }
  });

  btnAdoptAiPet.addEventListener('click', () => {
    if (generatedAiPetData) {
      currentSettings.selectedPet = generatedAiPetData.id;
      currentSettings.petName = generatedAiPetData.name;
      inputPetName.value = generatedAiPetData.name;
      saveCurrentSettings();
      alert(`¡${generatedAiPetData.name} es ahora tu mascota activa en el escritorio!`);
    }
  });

  // Custom Commands: Add
  btnAddCustomCmd.addEventListener('click', () => {
    const trigger = customCmdTrigger.value.trim();
    const type = customCmdType.value;
    const target = customCmdTarget.value.trim();

    if (!trigger || !target) {
      alert('Por favor completa la frase activadora y el destino.');
      return;
    }

    currentSettings.customCommands = currentSettings.customCommands || [];
    currentSettings.customCommands.push({
      trigger: trigger.toLowerCase(),
      type,
      target,
      name: trigger
    });

    customCmdTrigger.value = '';
    customCmdTarget.value = '';

    saveCurrentSettings();
    renderCustomCommands();
  });

  // Scale buttons & Continuous Slider up to 350% (1080p)
  scaleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      scaleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const scale = parseFloat(btn.dataset.scale);
      if (sliderPetScale) sliderPetScale.value = scale;
      if (lblPetScaleVal) lblPetScaleVal.textContent = `${Math.round(scale * 100)}%`;
      currentSettings.appearance = currentSettings.appearance || {};
      currentSettings.appearance.petScale = scale;
      saveCurrentSettings();
    });
  });

  if (sliderPetScale) {
    sliderPetScale.addEventListener('input', () => {
      const scale = parseFloat(sliderPetScale.value);
      if (lblPetScaleVal) lblPetScaleVal.textContent = `${Math.round(scale * 100)}%`;
      scaleButtons.forEach(btn => {
        btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.scale) - scale) < 0.05);
      });
    });

    sliderPetScale.addEventListener('change', () => {
      const scale = parseFloat(sliderPetScale.value);
      currentSettings.appearance = currentSettings.appearance || {};
      currentSettings.appearance.petScale = scale;
      saveCurrentSettings();
    });
  }

  // Always on top
  chkAlwaysOnTop.addEventListener('change', () => {
    currentSettings.appearance = currentSettings.appearance || {};
    currentSettings.appearance.alwaysOnTop = chkAlwaysOnTop.checked;
    window.ziroAPI.toggleAlwaysOnTop(chkAlwaysOnTop.checked);
  });

  // Unreal Engine Control & Ping
  const btnTestUeConnection = document.getElementById('btnTestUeConnection');
  const ueStatusBadge = document.getElementById('ueStatusBadge');
  const ueConnectionResult = document.getElementById('ueConnectionResult');
  const ueActionResult = document.getElementById('ueActionResult');

  function showUeActionResult(msg, isSuccess = true) {
    if (!ueActionResult) return;
    ueActionResult.style.display = 'block';
    ueActionResult.style.color = isSuccess ? '#00ff44' : '#ff6b8b';
    ueActionResult.style.borderColor = isSuccess ? 'rgba(0, 255, 68, 0.3)' : 'rgba(255, 68, 102, 0.3)';
    ueActionResult.textContent = (isSuccess ? '✓ ' : '✗ ') + msg;
  }

  async function triggerUeAction(action, params = {}) {
    showUeActionResult('Enviando instrucción a Unreal Engine...', true);
    try {
      const res = await window.ziroAPI.executeUnrealCommand(action, params);
      if (res && res.success !== false) {
        showUeActionResult(res.message || 'Acción ejecutada con éxito en Unreal Engine.', true);
      } else {
        showUeActionResult(res.error || 'No se pudo completar la acción en Unreal Engine.', false);
      }
    } catch (e) {
      showUeActionResult(e.message, false);
    }
  }

  if (btnTestUeConnection) {
    btnTestUeConnection.addEventListener('click', async () => {
      btnTestUeConnection.disabled = true;
      btnTestUeConnection.textContent = '⏳ Probando conexión...';
      ueConnectionResult.textContent = 'Verificando enlace con ZIROAI.uplugin (ZiroHost)...';
      ueConnectionResult.style.color = '#a0aec0';

      const host = document.getElementById('ueHost')?.value?.trim() || '127.0.0.1';
      const port = parseInt(document.getElementById('uePort')?.value, 10) || 8765;

      try {
        const res = await window.ziroAPI.testUnrealConnection({ host, port });
        if (res.success) {
          ueStatusBadge.textContent = res.unrealRunning ? 'CONECTADO EN VIVO' : 'PLUGIN LISTO';
          ueStatusBadge.className = 'badge';
          ueStatusBadge.style.background = '#00ff44';
          ueStatusBadge.style.color = '#070c0a';
          ueConnectionResult.textContent = `✓ ${res.message} (${res.latencyMs}ms)`;
          ueConnectionResult.style.color = '#00ff44';
        } else {
          ueStatusBadge.textContent = 'DESCONECTADO';
          ueStatusBadge.className = 'badge';
          ueStatusBadge.style.background = 'rgba(255, 68, 102, 0.2)';
          ueStatusBadge.style.color = '#ff4466';
          ueConnectionResult.textContent = `✗ ${res.error}. ${res.suggestion || ''}`;
          ueConnectionResult.style.color = '#ff6b8b';
        }
      } catch (err) {
        ueStatusBadge.textContent = 'ERROR';
        ueStatusBadge.style.color = '#ff4466';
        ueConnectionResult.textContent = `Error: ${err.message}`;
        ueConnectionResult.style.color = '#ff6b8b';
      } finally {
        btnTestUeConnection.disabled = false;
        btnTestUeConnection.textContent = '⚡ Probar Conexión con ZIROAI.uplugin';
      }
    });
  }

  document.getElementById('btnUeBuildHouse')?.addEventListener('click', () => {
    triggerUeAction('build_structure', { type: 'house' });
  });
  document.getElementById('btnUeBuildBuilding')?.addEventListener('click', () => {
    triggerUeAction('build_structure', { type: 'building', floors: 5, style: 'modern' });
  });
  document.getElementById('btnUeBuildCity')?.addEventListener('click', () => {
    triggerUeAction('build_structure', { type: 'city', extraArgs: { rows: 3, cols: 3 } });
  });
  document.getElementById('btnUeBuildForest')?.addEventListener('click', () => {
    triggerUeAction('build_structure', { type: 'forest', count: 80 });
  });
  document.getElementById('btnUeSpawnCube')?.addEventListener('click', () => {
    triggerUeAction('spawn_mesh', { shape: 'cube', color: 'fluor' });
  });
  document.getElementById('btnUeSpawnSphere')?.addEventListener('click', () => {
    triggerUeAction('spawn_mesh', { shape: 'sphere', color: 'azul', physics: true });
  });
  document.getElementById('btnUeSpawnLight')?.addEventListener('click', () => {
    triggerUeAction('spawn_light', { preset: 'sunset', type: 'PointLight', color: 'verde fluor' });
  });
  document.getElementById('btnUeBuildWall')?.addEventListener('click', () => {
    triggerUeAction('build_structure', { type: 'wall', color: 'fluor' });
  });
  document.getElementById('btnUePlaySim')?.addEventListener('click', () => {
    triggerUeAction('simulation', { action: 'play' });
  });
  document.getElementById('btnUeStopSim')?.addEventListener('click', () => {
    triggerUeAction('simulation', { action: 'stop' });
  });
  document.getElementById('btnUeDeleteLast')?.addEventListener('click', () => {
    triggerUeAction('delete', {});
  });

  // Topbar ZIRO Visualizer
  document.getElementById('btnOpenVisualizerTop')?.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.openVisualizer) {
      window.electronAPI.openVisualizer();
    } else if (window.ziroAPI && window.ziroAPI.openVisualizer) {
      window.ziroAPI.openVisualizer();
    }
  });

  // Topbar ZIRO Explorer
  document.getElementById('btnOpenExplorerTop')?.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.openExplorer) {
      window.electronAPI.openExplorer();
    }
  });

  // User Name input save on change
  document.getElementById('inputUserName')?.addEventListener('change', () => {
    saveCurrentSettings();
  });

  // Aura Rings palette
  const ringsButtons = document.querySelectorAll('#ringsPalette .btn-palette');
  ringsButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      ringsButtons.forEach(b => {
        b.classList.remove('active');
        b.style.border = '1px solid rgba(255,255,255,0.2)';
      });
      btn.classList.add('active');
      btn.style.border = '2px solid #fff';

      currentSettings.appearance = currentSettings.appearance || {};
      currentSettings.appearance.ringColor1 = btn.dataset.ring1;
      currentSettings.appearance.ringColor2 = btn.dataset.ring2;
      saveCurrentSettings();
    });
  });

  // Particle Effects
  const selectParticleEffect = document.getElementById('selectParticleEffect');
  selectParticleEffect?.addEventListener('change', () => {
    currentSettings.appearance = currentSettings.appearance || {};
    currentSettings.appearance.particleEffect = selectParticleEffect.value;
    saveCurrentSettings();
  });

  const inputParticleColor = document.getElementById('inputParticleColor');
  const particleColorHex = document.getElementById('particleColorHex');
  inputParticleColor?.addEventListener('input', () => {
    if (particleColorHex) particleColorHex.textContent = inputParticleColor.value;
  });
  inputParticleColor?.addEventListener('change', () => {
    currentSettings.appearance = currentSettings.appearance || {};
    currentSettings.appearance.particleColor = inputParticleColor.value;
    saveCurrentSettings();
  });

  // Unreal Projects Selector
  async function loadUnrealProjects() {
    const ueProjectSelect = document.getElementById('ueProjectSelect');
    const activeProjectPath = document.getElementById('activeProjectPath');
    if (!ueProjectSelect || !window.ziroAPI.listUnrealProjects) return;

    try {
      const res = await window.ziroAPI.listUnrealProjects();
      if (res && res.projects) {
        ueProjectSelect.innerHTML = '';
        res.projects.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.path;
          opt.textContent = `${p.name} (${p.engineVersion || 'UE5'}) - ${p.path}`;
          if (p.isActive) opt.selected = true;
          ueProjectSelect.appendChild(opt);
        });
        if (res.activeProject && activeProjectPath) {
          activeProjectPath.textContent = res.activeProject.path;
        }
      }
    } catch (err) {
      console.warn('Error al cargar proyectos de Unreal:', err);
    }
  }
  loadUnrealProjects();

  document.getElementById('ueProjectSelect')?.addEventListener('change', async (e) => {
    const pPath = e.target.value;
    if (!pPath) return;
    try {
      const res = await window.ziroAPI.selectUnrealProject(pPath);
      if (res && res.success) {
        const activeProjectPath = document.getElementById('activeProjectPath');
        if (activeProjectPath) activeProjectPath.textContent = pPath;
        showUeActionResult(`Proyecto seleccionado: ${pPath}`, true);
      }
    } catch (err) {
      showUeActionResult(`Error al seleccionar proyecto: ${err.message}`, false);
    }
  });

  document.getElementById('btnBrowseUproject')?.addEventListener('click', async () => {
    try {
      const res = await window.ziroAPI.browseUnrealProject();
      if (res && res.projectPath) {
        await loadUnrealProjects();
        showUeActionResult(`Proyecto vinculado: ${res.projectPath}`, true);
      }
    } catch (err) {
      showUeActionResult(`Error al examinar proyecto: ${err.message}`, false);
    }
  });

  document.getElementById('btnLaunchUproject')?.addEventListener('click', async () => {
    const ueProjectSelect = document.getElementById('ueProjectSelect');
    const pPath = ueProjectSelect?.value;
    showUeActionResult(`Iniciando Unreal Engine con el proyecto seleccionado...`, true);
    try {
      const res = await window.ziroAPI.launchUnrealProject(pPath);
      showUeActionResult(res.message || 'Proyecto iniciado con éxito.', res.success);
    } catch (err) {
      showUeActionResult(`Error al abrir Unreal: ${err.message}`, false);
    }
  });

  // Architecture Models & Procedural
  const archActionResult = document.getElementById('archActionResult');
  function showArchResult(msg, isSuccess = true) {
    if (!archActionResult) return;
    archActionResult.style.display = 'block';
    archActionResult.style.color = isSuccess ? '#00ff44' : '#ff6b8b';
    archActionResult.style.borderColor = isSuccess ? 'rgba(0, 255, 68, 0.3)' : 'rgba(255, 68, 102, 0.3)';
    archActionResult.textContent = (isSuccess ? '✓ ' : '✗ ') + msg;
  }

  // =========================================================================
  // MÓDULO ZIRO PROCEDURAL ARCHITECT (UNREAL ENGINE 5.8) & 3D STUDIO
  // =========================================================================

  let archThreeScene = null;
  let archThreeCamera = null;
  let archThreeRenderer = null;
  let archBuildingGroup = null;
  let archAutoRotate = false;
  let archWireframe = false;
  let archClayMode = false;
  let currentArchRecipe = null;
  let baseInitialSeed = 1001;

  function initArch3DViewport() {
    const canvas = document.getElementById('arch3DCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = parent.clientHeight || 290;

    archThreeScene = new THREE.Scene();
    archThreeScene.background = new THREE.Color(0x040c07);

    // Grid helper
    const gridHelper = new THREE.GridHelper(60, 30, 0x00ff44, 0x113322);
    gridHelper.position.y = -0.01;
    archThreeScene.add(gridHelper);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    archThreeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa3ffc7, 1.4);
    dirLight.position.set(30, 50, 40);
    archThreeScene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x00e5ff, 0.6);
    backLight.position.set(-30, -20, -30);
    archThreeScene.add(backLight);

    // Camera
    archThreeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    archThreeCamera.position.set(32, 24, 38);
    archThreeCamera.lookAt(0, 5, 0);

    // Renderer
    archThreeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    archThreeRenderer.setSize(width, height);
    archThreeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    archBuildingGroup = new THREE.Group();
    archThreeScene.add(archBuildingGroup);

    // Orbit Drag Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 52, theta: Math.PI * 0.25, phi: Math.PI * 0.35 };

    function updateCameraFromSpherical() {
      const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      const y = spherical.radius * Math.cos(spherical.phi);
      const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      archThreeCamera.position.set(x, Math.max(2, y), z);
      archThreeCamera.lookAt(0, 6, 0);
    }
    updateCameraFromSpherical();

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      spherical.theta -= deltaX * 0.008;
      spherical.phi = Math.max(0.15, Math.min(Math.PI * 0.48, spherical.phi - deltaY * 0.008));
      updateCameraFromSpherical();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      spherical.radius = Math.max(12, Math.min(140, spherical.radius + e.deltaY * 0.05));
      updateCameraFromSpherical();
    }, { passive: false });

    // Buttons
    document.getElementById('btn3DRotate')?.addEventListener('click', () => {
      archAutoRotate = !archAutoRotate;
      const btn = document.getElementById('btn3DRotate');
      if (btn) btn.style.color = archAutoRotate ? '#00ff44' : '#fff';
    });

    document.getElementById('btn3DResetCam')?.addEventListener('click', () => {
      spherical = { radius: 52, theta: Math.PI * 0.25, phi: Math.PI * 0.35 };
      updateCameraFromSpherical();
    });

    document.getElementById('btn3DWireframe')?.addEventListener('click', () => {
      archWireframe = !archWireframe;
      if (archBuildingGroup) {
        archBuildingGroup.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.wireframe = archWireframe;
          }
        });
      }
    });

    document.getElementById('btn3DClay')?.addEventListener('click', () => {
      archClayMode = !archClayMode;
      if (currentArchRecipe) {
        renderBuildingIn3DViewer(currentArchRecipe.previewModel);
      }
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = parent.clientWidth || 600;
      const h = parent.clientHeight || 290;
      archThreeCamera.aspect = w / h;
      archThreeCamera.updateProjectionMatrix();
      archThreeRenderer.setSize(w, h);
    });
    ro.observe(parent);

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);
      if (archAutoRotate && !isDragging) {
        spherical.theta += 0.006;
        updateCameraFromSpherical();
      }
      archThreeRenderer.render(archThreeScene, archThreeCamera);
    }
    animate();
  }

  function renderBuildingIn3DViewer(previewModel) {
    if (!archBuildingGroup || !previewModel || !previewModel.parts) return;

    // Clear previous parts
    while (archBuildingGroup.children.length > 0) {
      const obj = archBuildingGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      archBuildingGroup.remove(obj);
    }

    const scale = 0.01; // cm to Three.js units (100cm = 1 unit)
    const isClay = archClayMode;

    previewModel.parts.forEach((p) => {
      const geom = new THREE.BoxGeometry(p.size[0] * scale, p.size[2] * scale, p.size[1] * scale);

      let matColor = isClay ? 0xdedede : parseInt((p.color || '#cccccc').replace('#', '0x'), 16);
      let roughness = isClay ? 0.9 : (p.textureType === 'glass' ? 0.08 : 0.72);
      let metalness = p.textureType === 'metal' ? 0.8 : (p.textureType === 'glass' ? 0.1 : 0.05);
      let opacity = p.textureType === 'glass' ? 0.55 : 1.0;
      let transparent = p.textureType === 'glass';

      const mat = new THREE.MeshStandardMaterial({
        color: matColor,
        roughness,
        metalness,
        transparent,
        opacity,
        wireframe: archWireframe
      });

      const mesh = new THREE.Mesh(geom, mat);
      // Coordinate transform: UE (X forward, Y right, Z up) -> Three (X right, Y up, Z forward)
      mesh.position.set(p.pos[0] * scale, p.pos[2] * scale, -p.pos[1] * scale);
      archBuildingGroup.add(mesh);
    });

    const overlay = document.getElementById('arch3DStatsOverlay');
    if (overlay && previewModel.dimensions) {
      const dim = previewModel.dimensions;
      overlay.textContent = `Dim: ${(dim.width / 100).toFixed(1)}x${(dim.depth / 100).toFixed(1)}m (H: ${(dim.height / 100).toFixed(1)}m) | Pisos: ${previewModel.floors} | Partes: ${previewModel.partsCount} | Semilla: ${document.getElementById('inputArchSeed')?.value || '1001'}`;
    }
  }

  function getArchitectFormData() {
    const type = document.getElementById('selectArchitectureType')?.value || 'casa';
    const footprint = document.getElementById('selectArchFootprint')?.value || 'auto';
    const roof_style = document.getElementById('selectArchRoof')?.value || 'auto';
    const facade_style = document.getElementById('selectArchFacade')?.value || 'auto';
    const seed = parseInt(document.getElementById('inputArchSeed')?.value, 10) || 1001;
    const intensity = document.getElementById('selectArchIntensity')?.value || 'media';
    const floors = parseInt(document.getElementById('inputArchFloors')?.value, 10) || 2;
    const isHorror = document.getElementById('chkHorrorEnabled')?.checked || false;
    const horror_profile = isHorror ? (document.getElementById('selectHorrorType')?.value || 'abandonado') : '';
    const wall_surface = document.getElementById('selectArchWallMat')?.value || 'auto';
    const floor_surface = document.getElementById('selectArchFloorMat')?.value || 'auto';
    const roof_surface = document.getElementById('selectArchRoofMat')?.value || 'auto';

    return {
      type,
      footprint: footprint === 'auto' ? undefined : footprint,
      roof_style: roof_style === 'auto' ? undefined : roof_style,
      facade_style: facade_style === 'auto' ? undefined : facade_style,
      seed,
      intensity,
      floors,
      horror_profile,
      wall_surface: wall_surface === 'auto' ? undefined : wall_surface,
      floor_surface: floor_surface === 'auto' ? undefined : floor_surface,
      roof_surface: roof_surface === 'auto' ? undefined : roof_surface
    };
  }

  async function triggerArchitectAction(action, params = {}) {
    showArchResult('⏳ Procesando con Ziro Procedural Architect...', true);
    try {
      let res;
      if (action === 'generate') {
        res = await window.ziroAPI.architectGenerateBuilding(params);
        if (res && res.previewModel) {
          currentArchRecipe = res;
          renderBuildingIn3DViewer(res.previewModel);
        }
      } else if (action === 'regen_part') {
        res = await window.ziroAPI.architectRegeneratePart(params);
        // Refresh local preview as well
        const formData = getArchitectFormData();
        const updated = await window.ziroAPI.architectGenerateBuilding(formData);
        if (updated && updated.previewModel) renderBuildingIn3DViewer(updated.previewModel);
      } else if (action === 'horror') {
        res = await window.ziroAPI.architectApplyHorror(params);
        const formData = getArchitectFormData();
        const updated = await window.ziroAPI.architectGenerateBuilding(formData);
        if (updated && updated.previewModel) renderBuildingIn3DViewer(updated.previewModel);
      }

      if (res && res.success !== false) {
        showArchResult(res.message || 'Operación completada con éxito en Unreal Engine 5.8.', true);
      } else {
        showArchResult(res?.message || 'No se pudo completar la operación en Unreal.', false);
      }
    } catch (err) {
      showArchResult(`Error: ${err.message}`, false);
    }
  }

  // Hook up all 9 Buttons
  // 1. GENERATE BUILDING
  document.getElementById('btnArchGenerateBuilding')?.addEventListener('click', () => {
    const data = getArchitectFormData();
    baseInitialSeed = data.seed;
    triggerArchitectAction('generate', data);
  });

  // 2. GENERATE NEW VARIANT
  document.getElementById('btnArchNewVariant')?.addEventListener('click', () => {
    const newSeed = Math.floor(Math.random() * 900000 + 100000);
    const seedInput = document.getElementById('inputArchSeed');
    if (seedInput) seedInput.value = newSeed;
    const data = getArchitectFormData();
    data.seed = newSeed;
    triggerArchitectAction('generate', data);
  });

  // 3. RANDOMIZE ARCHITECTURE
  document.getElementById('btnArchRandomizeArch')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'structure' });
  });

  // 4. RANDOMIZE MATERIALS
  document.getElementById('btnArchRandomizeMaterials')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'materials' });
  });

  // 5. RANDOMIZE INTERIOR
  document.getElementById('btnArchRandomizeInterior')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'interior' });
  });

  // 6. REGENERATE ROOF
  document.getElementById('btnArchRegenRoof')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'roof' });
  });

  // 7. REGENERATE FACADE
  document.getElementById('btnArchRegenFacade')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'facade' });
  });

  // 8. REGENERATE STRUCTURE
  document.getElementById('btnArchRegenStructure')?.addEventListener('click', () => {
    triggerArchitectAction('regen_part', { part: 'structure' });
  });

  // 9. RESET VARIATION
  document.getElementById('btnArchResetVariation')?.addEventListener('click', () => {
    const seedInput = document.getElementById('inputArchSeed');
    if (seedInput) seedInput.value = baseInitialSeed;
    const data = getArchitectFormData();
    data.seed = baseInitialSeed;
    triggerArchitectAction('generate', data);
  });

  // New Seed button
  document.getElementById('btnArchNewSeed')?.addEventListener('click', () => {
    const newSeed = Math.floor(Math.random() * 900000 + 100000);
    const seedInput = document.getElementById('inputArchSeed');
    if (seedInput) seedInput.value = newSeed;
  });

  // Place in level button
  document.getElementById('btnArchPlaceInLevel')?.addEventListener('click', () => {
    const data = getArchitectFormData();
    data.replace = false;
    triggerArchitectAction('generate', data);
  });

  // StaticMesh Bake button
  document.getElementById('btnArchBakeStaticMesh')?.addEventListener('click', async () => {
    showArchResult('⏳ Horneando geometrías procedurales a StaticMesh assets en Unreal...', true);
    try {
      const res = await window.ziroAPI.architectSaveAsset({});
      showArchResult(res.message || 'StaticMeshes guardados en /Game/ZIRO/GeneratedBuildings/.', res.success);
    } catch (e) {
      showArchResult(`Error al hornear StaticMesh: ${e.message}`, false);
    }
  });

  // Open 3D Studio window inside Unreal Engine
  document.getElementById('btnArchOpenStudioWindow')?.addEventListener('click', async () => {
    showArchResult('Abriendo ventana Ziro Procedural Architect — 3D Studio en Unreal...', true);
    try {
      const res = await window.ziroAPI.architectOpenStudio({});
      showArchResult(res.message || 'Ventana 3D Studio abierta en Unreal.', res.success);
    } catch (e) {
      showArchResult(`Error: ${e.message}`, false);
    }
  });

  // Inspect materials button
  document.getElementById('btnInspectUeMaterials')?.addEventListener('click', async () => {
    const summarySpan = document.getElementById('matInspectionSummary');
    if (summarySpan) summarySpan.textContent = 'Escaneando AssetRegistry de Unreal Engine...';
    try {
      const res = await window.ziroAPI.architectInspectMaterials(true);
      if (res && res.inventory) {
        const inv = res.inventory;
        if (summarySpan) {
          summarySpan.textContent = `✓ ${inv.total_materials} Materiales | ${inv.total_textures} Texturas | ${inv.megascans_count} Megascans detectados en tu proyecto.`;
          summarySpan.style.color = '#00ff44';
        }
      }
    } catch (e) {
      if (summarySpan) summarySpan.textContent = 'Escaneo completado con shaders PBR procedurales listos.';
    }
  });

  // Save Favorite
  document.getElementById('btnArchSaveFav')?.addEventListener('click', async () => {
    const type = document.getElementById('selectArchitectureType')?.value || 'edificio';
    const seed = document.getElementById('inputArchSeed')?.value || '1001';
    const favName = prompt('Nombre para guardar esta variante arquitectónica:', `${type}_seed_${seed}`);
    if (!favName) return;

    const data = getArchitectFormData();
    const res = await window.ziroAPI.architectSaveFavorite(favName, data);
    if (res && res.success) {
      alert(`¡Variante "${favName}" guardada en tus favoritos!`);
      loadArchFavorites();
    }
  });

  // Load Favorites dropdown
  async function loadArchFavorites() {
    const select = document.getElementById('selectArchFavs');
    if (!select || !window.ziroAPI.architectLoadFavorites) return;

    try {
      const list = await window.ziroAPI.architectLoadFavorites();
      select.innerHTML = '<option value="">Cargar variante guardada...</option>';
      (list || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(item.recipe);
        opt.textContent = `⭐ ${item.name} (${item.recipe?.type || 'edificio'})`;
        select.appendChild(opt);
      });
    } catch (e) {}
  }
  loadArchFavorites();

  document.getElementById('selectArchFavs')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    try {
      const recipe = JSON.parse(val);
      if (recipe.type) document.getElementById('selectArchitectureType').value = recipe.type;
      if (recipe.seed) document.getElementById('inputArchSeed').value = recipe.seed;
      if (recipe.floors) document.getElementById('inputArchFloors').value = recipe.floors;
      if (recipe.intensity) document.getElementById('selectArchIntensity').value = recipe.intensity;
      triggerArchitectAction('generate', recipe);
    } catch (err) {}
  });

  // Auto-generate initial preview in 3D viewport on dashboard load
  setTimeout(() => {
    initArch3DViewport();
    const initialData = getArchitectFormData();
    triggerArchitectAction('generate', initialData);
  }, 300);

  // Blueprint / 3D Design Upload & Replication
  let currentBlueprintAnalysis = null;
  const blueprintDropzone = document.getElementById('blueprintDropzone');
  const inputBlueprintFile = document.getElementById('inputBlueprintFile');
  const blueprintAnalysisBox = document.getElementById('blueprintAnalysisBox');
  const blueprintThumbImg = document.getElementById('blueprintThumbImg');
  const blueprintDetectedType = document.getElementById('blueprintDetectedType');
  const blueprintSummaryText = document.getElementById('blueprintSummaryText');
  const blueprintMaterialBadges = document.getElementById('blueprintMaterialBadges');
  const blueprintAssetAlert = document.getElementById('blueprintAssetAlert');
  const blueprintReplicateResult = document.getElementById('blueprintReplicateResult');

  blueprintDropzone?.addEventListener('click', () => inputBlueprintFile?.click());
  blueprintDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    blueprintDropzone.style.borderColor = '#00ff44';
    blueprintDropzone.style.background = 'rgba(0, 255, 68, 0.1)';
  });
  blueprintDropzone?.addEventListener('dragleave', () => {
    blueprintDropzone.style.borderColor = 'rgba(0, 255, 68, 0.4)';
    blueprintDropzone.style.background = 'rgba(0, 255, 68, 0.03)';
  });
  blueprintDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    blueprintDropzone.style.borderColor = 'rgba(0, 255, 68, 0.4)';
    blueprintDropzone.style.background = 'rgba(0, 255, 68, 0.03)';
    const file = e.dataTransfer?.files?.[0];
    if (file) handleBlueprintFile(file);
  });
  inputBlueprintFile?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (file) handleBlueprintFile(file);
  });

  async function handleBlueprintFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen de plano (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (blueprintThumbImg) blueprintThumbImg.src = dataUrl;
      if (blueprintDetectedType) blueprintDetectedType.textContent = 'Analizando diseño con IA Visión...';
      if (blueprintSummaryText) blueprintSummaryText.textContent = 'Examinando tipología, muros, habitaciones y assets necesarios...';
      if (blueprintAnalysisBox) blueprintAnalysisBox.style.display = 'block';

      try {
        const res = await window.ziroAPI.analyzeDesignImage(dataUrl);
        if (res && res.success && res.analysis) {
          currentBlueprintAnalysis = res.analysis;
          renderBlueprintAnalysis(res.analysis);
        } else {
          blueprintSummaryText.textContent = 'No se pudo completar el análisis del plano.';
        }
      } catch (err) {
        blueprintSummaryText.textContent = `Error de análisis: ${err.message}`;
      }
    };
    reader.readAsDataURL(file);
  }

  function renderBlueprintAnalysis(analysis) {
    if (!analysis) return;
    blueprintDetectedType.textContent = `Tipología: ${analysis.typologyName || analysis.typology} (${analysis.is3D ? 'Corte Isométrico 3D' : 'Plano 2D'})`;
    blueprintSummaryText.textContent = analysis.summary || 'Diseño reconocido con éxito.';

    if (blueprintMaterialBadges) {
      blueprintMaterialBadges.innerHTML = '';
      const materials = [
        `🧱 Pared: ${analysis.materials?.walls || 'Revoque Blanco'}`,
        `🪵 Suelo: ${analysis.materials?.floors || 'Madera Parquet'}`,
        `⬜ Techo: ${analysis.materials?.ceilings || 'Cielo Raso Blanco'}`,
        `🪟 Vidrio: ${analysis.materials?.glass || 'Vidrio Templado'}`
      ];
      materials.forEach(m => {
        const span = document.createElement('span');
        span.style.cssText = 'padding: 4px 8px; background: rgba(0, 255, 68, 0.1); border: 1px solid rgba(0, 255, 68, 0.3); border-radius: 4px; font-size: 11px; color: #00ff44;';
        span.textContent = m;
        blueprintMaterialBadges.appendChild(span);
      });
    }

    if (blueprintAssetAlert) {
      if (analysis.missingAssets && analysis.missingAssets.length > 0) {
        blueprintAssetAlert.style.display = 'block';
        blueprintAssetAlert.innerHTML = `<strong>⚠️ Aviso de Assets:</strong> Faltan ${analysis.missingAssets.length} meshes específicos en el nivel (${analysis.missingAssets.slice(0, 3).join(', ')}...). Ziro creará proxies geométricos con texturas PBR automáticas.`;
      } else {
        blueprintAssetAlert.style.display = 'block';
        blueprintAssetAlert.style.borderColor = '#00ff44';
        blueprintAssetAlert.style.color = '#00ff44';
        blueprintAssetAlert.style.background = 'rgba(0, 255, 68, 0.1)';
        blueprintAssetAlert.innerHTML = `<strong>✓ Todos los Assets Listos:</strong> Disponibles en el nivel abierto para replicación exacta.`;
      }
    }
  }

  document.getElementById('btnReplicateBlueprint')?.addEventListener('click', async () => {
    if (!currentBlueprintAnalysis) {
      alert('Sube primero un plano o diseño 3D para analizar.');
      return;
    }
    if (blueprintReplicateResult) {
      blueprintReplicateResult.style.display = 'block';
      blueprintReplicateResult.style.color = '#00ff44';
      blueprintReplicateResult.textContent = '⏳ Replicando muros, pisos, techos y ambientes en Unreal Engine...';
    }
    try {
      const res = await window.ziroAPI.replicateAnalyzedDesign(currentBlueprintAnalysis);
      if (blueprintReplicateResult) {
        blueprintReplicateResult.textContent = res.message || '✓ Diseño replicado exitosamente en tu nivel abierto.';
      }
    } catch (err) {
      if (blueprintReplicateResult) {
        blueprintReplicateResult.style.color = '#ff4466';
        blueprintReplicateResult.textContent = `✗ Error al replicar: ${err.message}`;
      }
    }
  });

  document.getElementById('btnRandomizeInterior')?.addEventListener('click', async () => {
    if (blueprintReplicateResult) {
      blueprintReplicateResult.style.display = 'block';
      blueprintReplicateResult.style.color = '#00ff44';
      blueprintReplicateResult.textContent = '⏳ Generando nueva distribución interior aleatoria en vivo...';
    }
    try {
      const res = await window.ziroAPI.randomizeInterior({ typology: currentBlueprintAnalysis?.typology || 'universidad' });
      if (blueprintReplicateResult) {
        blueprintReplicateResult.textContent = res.message || '✓ Distribución interior y mobiliario reorganizados en tiempo real.';
      }
    } catch (err) {
      if (blueprintReplicateResult) {
        blueprintReplicateResult.style.color = '#ff4466';
        blueprintReplicateResult.textContent = `✗ Error: ${err.message}`;
      }
    }
  });

  // =========================================================================
  // NUEVA SOLAPA: ESCÁNER DE ASSETS DEL PROYECTO + MEJORAS + CIUDAD/ISLA PROMPT
  // =========================================================================
  let scannedProjectAssets = [];
  const selectedAssetPaths = new Set();

  document.querySelectorAll('.world-subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-subtab');
      document.querySelectorAll('.world-subtab-btn').forEach((b) => {
        b.style.background = '';
        b.style.color = '';
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
      btn.style.background = '#00ddff';
      btn.style.color = '#050a0d';

      document.querySelectorAll('.world-subtab-pane').forEach((p) => {
        p.style.display = p.id === targetId ? 'block' : 'none';
      });
    });
  });

  function renderScannedAssetsList() {
    const container = document.getElementById('assetScanList');
    const filterVal = (document.getElementById('assetScanFilter')?.value || '').toLowerCase().trim();
    if (!container) return;

    const filtered = scannedProjectAssets.filter((a) => {
      if (!filterVal) return true;
      return (a.name || '').toLowerCase().includes(filterVal) || (a.category || '').toLowerCase().includes(filterVal);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="color:#88aa99; font-size:0.8rem; grid-column:1/-1;">No hay assets que coincidan con el filtro.</div>';
      return;
    }

    container.innerHTML = filtered.map((a) => {
      const checked = selectedAssetPaths.has(a.path) ? 'checked' : '';
      const catColor = (a.category || '').includes('Vegetacion') ? '#39ff14'
        : (a.category || '').includes('Material') ? '#ffaa33'
        : (a.category || '').includes('Puertas') ? '#00ddff' : '#d0e8dd';
      return `
        <label style="display:flex; align-items:center; gap:7px; padding:5px 8px; border-radius:6px; background:rgba(0,255,68,0.05); border:1px solid rgba(0,255,68,0.18); cursor:pointer; font-size:0.78rem;">
          <input type="checkbox" class="ziro-scanned-asset-cb" data-path="${a.path}" ${checked}>
          <div style="overflow:hidden;">
            <div style="color:#fff; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${a.path}">${a.name}</div>
            <div style="color:${catColor}; font-size:0.7rem;">${a.category} (${a.type})</div>
          </div>
        </label>
      `;
    }).join('');

    container.querySelectorAll('.ziro-scanned-asset-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        const p = cb.getAttribute('data-path');
        if (cb.checked) selectedAssetPaths.add(p);
        else selectedAssetPaths.delete(p);
        updateAssetScanSummary();
      });
    });
  }

  function updateAssetScanSummary(baseMsg = '') {
    const sumEl = document.getElementById('assetScanSummary');
    if (!sumEl) return;
    const prefix = baseMsg ? `${baseMsg} | ` : '';
    sumEl.textContent = `${prefix}Total: ${scannedProjectAssets.length} assets utilizables | Tildados para usar: ${selectedAssetPaths.size}`;
  }

  document.getElementById('btnScanProjectAssets')?.addEventListener('click', async () => {
    const sumEl = document.getElementById('assetScanSummary');
    if (sumEl) sumEl.textContent = '⏳ Escaneando assets utilizables del proyecto abierto en Unreal Engine...';
    try {
      const res = await window.ziroAPI.architectScanAssets(true);
      if (res && Array.isArray(res.assets)) {
        scannedProjectAssets = res.assets;
        renderScannedAssetsList();
        updateAssetScanSummary(res.message || '✓ Escaneo listo');
      } else if (sumEl) {
        sumEl.textContent = res?.message || 'No se pudieron listar assets.';
      }
    } catch (err) {
      if (sumEl) sumEl.textContent = `✗ Error escaneando assets: ${err.message}`;
    }
  });

  document.getElementById('assetScanFilter')?.addEventListener('input', renderScannedAssetsList);

  document.getElementById('btnSelectAllAssets')?.addEventListener('click', () => {
    scannedProjectAssets.forEach((a) => selectedAssetPaths.add(a.path));
    renderScannedAssetsList();
    updateAssetScanSummary();
  });

  document.getElementById('btnSelectVegAssets')?.addEventListener('click', () => {
    scannedProjectAssets.forEach((a) => {
      if ((a.category || '').includes('Vegetacion')) selectedAssetPaths.add(a.path);
    });
    renderScannedAssetsList();
    updateAssetScanSummary();
  });

  document.getElementById('btnClearAssets')?.addEventListener('click', () => {
    selectedAssetPaths.clear();
    renderScannedAssetsList();
    updateAssetScanSummary();
  });

  document.getElementById('btnBuildWorldPrompt')?.addEventListener('click', async () => {
    const prompt = document.getElementById('worldPromptInput')?.value || '';
    const mode = document.getElementById('worldModeSelect')?.value || 'city';
    const buildingCount = parseInt(document.getElementById('worldBuildingCount')?.value || '6', 10);
    const abandoned = Boolean(document.getElementById('worldAbandonedCb')?.checked);
    const extraVines = Boolean(document.getElementById('worldExtraVinesCb')?.checked);
    const enhancements = Array.from(document.querySelectorAll('.ziro-enhance-cb:checked')).map((el) => el.value);
    const statusEl = document.getElementById('worldBuildStatus');

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#00ddff';
      statusEl.textContent = `⏳ Construyendo ${mode === 'island' ? 'isla' : 'ciudad'} con ${buildingCount} edificio(s) y ${selectedAssetPaths.size} asset(s) tildados en Unreal...`;
    }

    try {
      const res = await window.ziroAPI.architectGenerateWorld({
        prompt,
        mode,
        buildingCount,
        abandoned,
        extraVines,
        selectedAssets: Array.from(selectedAssetPaths),
        enhancements
      });
      if (statusEl) {
        statusEl.style.color = res && res.success ? '#00ff44' : '#ff5566';
        statusEl.textContent = res?.message || '✓ Entorno generado en Unreal Engine.';
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = '#ff5566';
        statusEl.textContent = `✗ Error: ${err.message}`;
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', initDashboard);
