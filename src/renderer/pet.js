/**
 * ZIRO PET DESTEKOP - Desktop Companion Renderer
 * 3D Model Character with Procedural Animations, ComfyUI Anime & LiveKit Hands-Free Voice Call ("Activar Ziro")
 */

import { pet3D } from './pet3d.js';

// Sound Synthesizer (Web Audio API)
class SoundFX {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playChirp() {
    try {
      this.ensureContext();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.22);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  playListen() {
    try {
      this.ensureContext();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';

      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  playSuccess() {
    try {
      this.ensureContext();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';

        const now = this.ctx.currentTime + idx * 0.06;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
      });
    } catch (e) {}
  }
}

const sfx = new SoundFX();

// DOM Elements
const petContainer = document.getElementById('petContainer');
const petNameTag = document.getElementById('petNameTag');
const statusDot = document.getElementById('statusDot');
const btnLiveCallToggle = document.getElementById('btnLiveCallToggle');
const speechBubble = document.getElementById('speechBubble');
const bubbleSender = document.getElementById('bubbleSender');
const bubbleBadge = document.getElementById('bubbleBadge');
const bubbleText = document.getElementById('bubbleText');
const liveVoiceHud = document.getElementById('liveVoiceHud');
const liveMeterFill = document.getElementById('liveMeterFill');
const liveMeterVal = document.getElementById('liveMeterVal');
const liveVoiceText = document.getElementById('liveVoiceText');
const waveform = document.getElementById('waveform');
const petCharacter = document.getElementById('petCharacter');
const pet3dCanvas = document.getElementById('pet3dCanvas');
const petImage = document.getElementById('petImage');
const particlesContainer = document.getElementById('particlesContainer');
const micBtn = document.getElementById('micBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatInputWrapper = document.getElementById('chatInputWrapper');
const btnDiagnostics = document.getElementById('btnDiagnostics');
const voiceDiagPanel = document.getElementById('voiceDiagPanel');
const diagEngineBadge = document.getElementById('diagEngineBadge');
const diagVadMs = document.getElementById('diagVadMs');
const diagSttMs = document.getElementById('diagSttMs');
const diagLlmMs = document.getElementById('diagLlmMs');
const diagFirstTextMs = document.getElementById('diagFirstTextMs');
const diagTtsMs = document.getElementById('diagTtsMs');
const diagFirstAudioMs = document.getElementById('diagFirstAudioMs');
const diagTotalMs = document.getElementById('diagTotalMs');
const btnInteract = document.getElementById('btnInteract');
const btnToggleChat = document.getElementById('btnToggleChat');
const btnSettings = document.getElementById('btnSettings');
const btnMinimize = document.getElementById('btnMinimize');

// State
let currentSettings = null;
let isMinimalMode = false;
let currentScale = 1.0;
let isRecording = false;
let isSpeaking = false;
let speakingCooldownUntil = 0;
let mediaStream = null;
let mediaRecorder = null;
let recorderChunks = [];
let audioContext = null;
let analyserNode = null;
let animFrameId = null;
let maxObservedPeak = 0;
let hasSpoken = false;
let lastSoundTime = 0;
let bubbleTimer = null;
let currentAudioPlayer = null;

// Streaming TTS Queue & Latency Diagnostics State (Fase 1, 3, 5)
let streamingAudioQueue = [];
let isPlayingStreamQueue = false;
let streamedTextAccumulator = '';
let currentTurnEndOfSpeechTs = 0;
let currentTurnVadSilenceMs = 420;
let firstAudioPlayedForTurn = false;
let bargeInActiveFrames = 0;
let latestDiagnostics = {
  vadMs: 0,
  sttMs: 0,
  llmMs: 0,
  firstTextMs: 0,
  ttsMs: 0,
  firstAudioMs: 0,
  totalMs: 0,
  engine: 'STREAMING AR'
};

// LiveKit Continuous Hands-Free Call State ("Activar Ziro")
let liveCallActive = true;
let liveWakeStandbyOnly = false; // When false, responds to both "activar ziro" and continuous conversation
let ziroVoiceMuted = false; // When true ("ziro desactivar" / "ziro desactivate"), Ziro stops speaking completely
let gamingModeActive = false;
let gamingConfig = { reduceChatterInGame: true, preventPopupsInGame: true };
let liveCallStream = null;
let liveCallAudioCtx = null;
let liveCallAnalyser = null;
let liveCallProcessor = null;
let liveCallRafId = null;
let livePreRollRing = [];
let liveUtteranceChunks = [];
let isCapturingLiveUtterance = false;
let isProcessingLiveUtterance = false;
let liveSpeechStartTime = 0;
let liveLastVoiceTime = 0;
let currentLiveDeviceId = null;

const DEFAULT_PET_MAP = {
  ziro_piggy: '../assets/default_pets/ziro_piggy.png',
  ziro: '../assets/default_pets/ziro.svg',
  kitsune: '../assets/default_pets/kitsune_anime.png',
  sparky: '../assets/default_pets/sparky.svg',
  nexus: '../assets/default_pets/nexus.svg',
  glitch: '../assets/default_pets/glitch.svg',
  volt: '../assets/default_pets/volt.svg'
};

// Initialize
async function init() {
  currentSettings = await window.ziroAPI.getSettings();

  // Initialize 3D Engine
  if (pet3dCanvas) {
    pet3D.init(pet3dCanvas);
  }

  applySettings(currentSettings);
  setupEventListeners();

  const name = currentSettings.petName || 'Ziro';
  showBubble(
    name,
    '📞 LIVEKIT EN VIVO',
    `¡Hola! Soy ${name}. Llamada en vivo activa sin tocar botones: solo di "Activar Ziro" o háblame directamente.`,
    10000
  );

  // Auto-start Hands-Free LiveKit Voice Call so the user never has to press the mic button
  if (currentSettings?.livekitConfig?.enabled !== false) {
    setTimeout(() => {
      startLiveKitHandsFreeCall();
    }, 600);
  }
}

function applySettings(settings) {
  if (!settings) return;
  const prevInputId = currentSettings?.voiceConfig?.audioInputId;
  currentSettings = settings;

  const name = settings.petName || 'Ziro';
  petNameTag.textContent = name.toUpperCase();
  bubbleSender.textContent = name.toUpperCase();
  chatInput.placeholder = `Di "Activar Ziro" o escribe aquí...`;

  // Avatar / 3D Texture
  const petId = settings.selectedPet || 'ziro';
  let textureUrl = DEFAULT_PET_MAP['ziro'];

  if (DEFAULT_PET_MAP[petId]) {
    textureUrl = DEFAULT_PET_MAP[petId];
    petImage.src = textureUrl;
    petImage.classList.remove('custom-photo-avatar');
  } else {
    const customList = settings.customPets || [];
    let custom = customList.find(p => p.id === petId);
    if (!custom && customList.length > 0) {
      custom = customList[0];
    }

    if (custom && (custom.dataUrl || custom.src)) {
      textureUrl = custom.dataUrl || custom.src;
      petImage.src = textureUrl;
      petImage.classList.add('custom-photo-avatar');
    } else {
      textureUrl = DEFAULT_PET_MAP['ziro'];
      petImage.src = textureUrl;
      petImage.classList.remove('custom-photo-avatar');
    }
  }

  // Load into 3D Character Stage
  pet3D.loadPetTexture(textureUrl);

  // Scale
  const scale = settings.appearance?.petScale || 1.0;
  applyPetScale(scale, false);

  // Rings & Particle Trail Effects
  const ringCol1 = settings.appearance?.ringColor1 || '#00ff44';
  const ringCol2 = settings.appearance?.ringColor2 || '#00ffff';
  const particleEff = settings.appearance?.particleEffect || 'estrellas';
  const particleCol = settings.appearance?.particleColor || ringCol1;
  pet3D.setRingsColor(ringCol1, ringCol2);
  pet3D.setParticleEffect(particleEff, particleCol);

  const petGlowAura = document.getElementById('petGlowAura');
  if (petGlowAura) {
    petGlowAura.style.background = `radial-gradient(circle, ${ringCol1}44 0%, ${ringCol1}00 70%)`;
  }

  // Restart LiveKit stream if microphone device changed
  const newInputId = settings.voiceConfig?.audioInputId;
  if (liveCallActive && prevInputId !== undefined && prevInputId !== newInputId) {
    restartLiveKitHandsFreeCall();
  }
}

function setMinimalMode(enable) {
  isMinimalMode = Boolean(enable);
  if (isMinimalMode) {
    petContainer.classList.add('minimal-mode');
    speechBubble.classList.add('hidden');
    spawnParticle(window.innerWidth / 2, window.innerHeight / 2);
  } else {
    petContainer.classList.remove('minimal-mode');
    speechBubble.classList.remove('hidden');
    spawnParticle(window.innerWidth / 2, window.innerHeight / 2);
  }
  applyPetScale(currentScale, false);
}

function applyPetScale(scale, save = true) {
  // Allow scaling freely from 0.4 up to 3.8 (covering up to full 1080p screen height)
  const s = Math.max(0.4, Math.min(3.8, parseFloat(scale) || 1.0));
  currentScale = s;
  pet3D.setScale(s);
  if (petCharacter) {
    petCharacter.style.transform = `scale(${s})`;
  }

  // Calculate dynamic window bounds so the pet and its orbital rings are NEVER clipped
  let targetW, targetH;
  if (isMinimalMode) {
    const side = Math.round(320 * s);
    targetW = Math.min(1920, Math.max(160, side));
    targetH = Math.min(1080, Math.max(160, side));
  } else {
    targetW = Math.min(1920, Math.max(340, Math.round(360 * Math.max(0.85, s))));
    targetH = Math.min(1080, Math.max(480, Math.round(500 * Math.max(0.85, s))));
  }

  if (window.ziroAPI && window.ziroAPI.resizePetWindow) {
    window.ziroAPI.resizePetWindow(targetW, targetH);
  }

  setTimeout(() => {
    if (pet3dCanvas) {
      pet3D.resize(pet3dCanvas.clientWidth, pet3dCanvas.clientHeight);
    }
  }, 40);

  if (save && currentSettings) {
    currentSettings.appearance = currentSettings.appearance || {};
    currentSettings.appearance.petScale = s;
    window.ziroAPI.saveSettings(currentSettings).catch(() => {});
  }
}

function updateLiveCallBadgeUI() {
  if (!btnLiveCallToggle) return;
  if (!liveCallActive) {
    btnLiveCallToggle.className = 'livekit-pill';
    btnLiveCallToggle.textContent = '🔇 MUTE';
    btnLiveCallToggle.title = 'Haz clic para activar Llamada en Vivo Manos Libres (LiveKit)';
    micBtn.classList.remove('active');
  } else if (liveWakeStandbyOnly) {
    btnLiveCallToggle.className = 'livekit-pill standby';
    btnLiveCallToggle.textContent = '📞 ESPERA';
    btnLiveCallToggle.title = 'En espera: Di "Activar Ziro" para activar respuesta por voz';
    micBtn.classList.add('active');
  } else {
    btnLiveCallToggle.className = 'livekit-pill active';
    btnLiveCallToggle.textContent = '📞 LIVE';
    btnLiveCallToggle.title = 'Llamada en Vivo LiveKit Activa (Manos Libres - No necesitas apretar botones)';
    micBtn.classList.add('active');
  }
}

// Show Speech Bubble
function showBubble(sender, badge, text, durationMs = 12000) {
  bubbleSender.textContent = (sender || currentSettings?.petName || 'ZIRO').toUpperCase();
  bubbleBadge.textContent = badge || 'RESPUESTA';
  bubbleText.textContent = text;
  speechBubble.classList.remove('hidden');

  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (durationMs > 0) {
    bubbleTimer = setTimeout(() => {
      // Keep bubble visible
    }, durationMs);
  }
}

function setPetState(state) {
  statusDot.className = 'status-dot';
  if (state === 'listening') {
    statusDot.classList.add('listening');
  } else if (state === 'thinking') {
    statusDot.classList.add('thinking');
  }
  pet3D.setState(state);
}

/* ============================================================
   LiveKit Continuous Hands-Free Voice Call ("Activar Ziro")
   Zero button presses: persistent PCM ring-buffer + VAD
   ============================================================ */
async function startLiveKitHandsFreeCall() {
  if (liveCallStream) {
    liveCallActive = true;
    updateLiveCallBadgeUI();
    return;
  }

  try {
    const audioInputId = currentSettings?.voiceConfig?.audioInputId;
    let stream = null;

    if (audioInputId && audioInputId !== 'default' && audioInputId !== '') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: audioInputId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (e) {
        console.warn('LiveKit fallback to default mic:', e.message);
      }
    }

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    liveCallStream = stream;
    currentLiveDeviceId = audioInputId || 'default';
    liveCallActive = true;
    updateLiveCallBadgeUI();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    liveCallAudioCtx = new AudioCtx();
    if (liveCallAudioCtx.state === 'suspended') {
      await liveCallAudioCtx.resume();
    }

    const source = liveCallAudioCtx.createMediaStreamSource(liveCallStream);
    liveCallAnalyser = liveCallAudioCtx.createAnalyser();
    liveCallAnalyser.fftSize = 256;
    liveCallAnalyser.smoothingTimeConstant = 0.5;
    source.connect(liveCallAnalyser);

    // ScriptProcessorNode for 0.55s pre-roll PCM Ring Buffer (captures "ac-" of "activar ziro" cleanly)
    const bufferSize = 4096;
    liveCallProcessor = liveCallAudioCtx.createScriptProcessor(bufferSize, 1, 1);
    const silentGain = liveCallAudioCtx.createGain();
    silentGain.gain.value = 0;
    source.connect(liveCallProcessor);
    liveCallProcessor.connect(silentGain);
    silentGain.connect(liveCallAudioCtx.destination);

    const maxPreRollChunks = 7; // ~0.6s at 48kHz
    livePreRollRing = [];
    liveUtteranceChunks = [];
    isCapturingLiveUtterance = false;

    liveCallProcessor.onaudioprocess = (e) => {
      if (!liveCallActive) return;

      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);

      // Keep pre-roll ring populated even while Ziro speaks so Barge-In never clips the first syllable
      if (isSpeaking || Date.now() < speakingCooldownUntil || isProcessingLiveUtterance) {
        livePreRollRing.push(copy);
        if (livePreRollRing.length > maxPreRollChunks) {
          livePreRollRing.shift();
        }
        return;
      }

      if (isCapturingLiveUtterance) {
        liveUtteranceChunks.push(copy);
        // Safety cap: max 14 seconds per continuous sentence
        if (liveUtteranceChunks.length > 165) {
          finalizeLiveUtterance();
        }
      } else {
        livePreRollRing.push(copy);
        if (livePreRollRing.length > maxPreRollChunks) {
          livePreRollRing.shift();
        }
      }
    };

    const freqData = new Uint8Array(liveCallAnalyser.frequencyBinCount);

    function monitorLiveKitVAD() {
      if (!liveCallActive || !liveCallAnalyser) return;

      liveCallAnalyser.getByteFrequencyData(freqData);

      // Focus on human speech frequency bins
      let sum = 0;
      const binCount = Math.min(freqData.length, 64);
      for (let i = 2; i < binCount; i++) {
        sum += freqData[i];
      }
      const avg = sum / (binCount - 2);
      const pct = Math.min(100, Math.round((avg / 55) * 100));

      const vadThreshold = currentSettings?.livekitConfig?.vadThreshold || 8;
      const rawSilenceCfg = currentSettings?.livekitConfig?.silenceMs || 420;
      const silenceMs = Math.min(550, Math.max(280, rawSilenceCfg));

      // FASE 5: Barge-In Interruption detection while Ziro is speaking
      if (isSpeaking) {
        const bargeInEnabled = currentSettings?.voiceConfig?.bargeInEnabled !== false;
        const bargeInThreshold = Math.max(22, vadThreshold * 2.4);
        if (bargeInEnabled && pct >= bargeInThreshold) {
          bargeInActiveFrames++;
          if (bargeInActiveFrames >= 10) {
            // User interrupted Ziro! Stop speech & LLM stream immediately and start listening
            bargeInActiveFrames = 0;
            triggerBargeInInterruption(pct);
          }
        } else {
          bargeInActiveFrames = Math.max(0, bargeInActiveFrames - 1);
        }
        liveCallRafId = requestAnimationFrame(monitorLiveKitVAD);
        return;
      }

      if (Date.now() < speakingCooldownUntil || isProcessingLiveUtterance) {
        liveCallRafId = requestAnimationFrame(monitorLiveKitVAD);
        return;
      }

      if (pct >= vadThreshold) {
        liveLastVoiceTime = Date.now();

        if (!isCapturingLiveUtterance) {
          // Speech detected! Seed utterance with 0.55s pre-roll buffer so first syllable is never clipped
          isCapturingLiveUtterance = true;
          liveSpeechStartTime = Date.now();
          liveUtteranceChunks = [...livePreRollRing];
          livePreRollRing = [];

          setPetState('listening');
          waveform.classList.add('active');
          liveVoiceHud.style.display = 'flex';
          liveVoiceText.textContent = liveWakeStandbyOnly
            ? '📞 Di "Activar Ziro" para despertar...'
            : `📞 Conversación en Vivo: Escuchando (${pct}%)...`;
        } else {
          liveMeterFill.style.width = `${pct}%`;
          liveMeterVal.textContent = `${pct}%`;
          liveVoiceText.textContent = `📞 Conversación en Vivo: Escuchando (${pct}%)...`;
        }
      } else if (isCapturingLiveUtterance) {
        liveMeterFill.style.width = `${pct}%`;
        liveMeterVal.textContent = `${pct}%`;

        const silenceElapsed = Date.now() - liveLastVoiceTime;
        const totalSpeechDuration = Date.now() - liveSpeechStartTime;

        if (silenceElapsed >= silenceMs) {
          if (totalSpeechDuration >= 320 && liveUtteranceChunks.length >= 3) {
            currentTurnVadSilenceMs = silenceElapsed;
            finalizeLiveUtterance();
          } else {
            // Too brief (click/cough), reset silently
            isCapturingLiveUtterance = false;
            liveUtteranceChunks = [];
            liveVoiceHud.style.display = 'none';
            bubbleText.style.display = 'block';
            waveform.classList.remove('active');
            setPetState('idle');
          }
        }
      }

      liveCallRafId = requestAnimationFrame(monitorLiveKitVAD);
    }

    liveCallRafId = requestAnimationFrame(monitorLiveKitVAD);
  } catch (err) {
    console.warn('Error iniciando LiveKit Hands-Free Call:', err);
  }
}

function triggerBargeInInterruption(pct = 30) {
  stopAllSpeech(true);
  if (window.ziroAPI && window.ziroAPI.interruptVoice) {
    window.ziroAPI.interruptVoice().catch(() => {});
  }
  isProcessingLiveUtterance = false;
  speakingCooldownUntil = 0;
  isCapturingLiveUtterance = true;
  liveSpeechStartTime = Date.now();
  liveLastVoiceTime = Date.now();
  liveUtteranceChunks = [...livePreRollRing];
  livePreRollRing = [];
  setPetState('listening');
  waveform.classList.add('active');
  liveVoiceHud.style.display = 'flex';
  liveVoiceText.textContent = `⚡ Interrupción detectada: Escuchándote (${pct}%)...`;
}

function updateDiagnosticsUI(partial = {}) {
  latestDiagnostics = { ...latestDiagnostics, ...partial };
  if (diagVadMs) diagVadMs.textContent = `${latestDiagnostics.vadMs || '--'} ms`;
  if (diagSttMs) diagSttMs.textContent = `${latestDiagnostics.sttMs || '--'} ms`;
  if (diagLlmMs) diagLlmMs.textContent = `${latestDiagnostics.llmMs || '--'} ms`;
  if (diagFirstTextMs) diagFirstTextMs.textContent = `${latestDiagnostics.firstTextMs || '--'} ms`;
  if (diagTtsMs) diagTtsMs.textContent = `${latestDiagnostics.ttsMs || '--'} ms`;
  if (diagFirstAudioMs) diagFirstAudioMs.textContent = `${latestDiagnostics.firstAudioMs || '--'} ms`;
  if (diagTotalMs) diagTotalMs.textContent = `${latestDiagnostics.totalMs || '--'} ms`;
  if (diagEngineBadge && latestDiagnostics.engine) {
    diagEngineBadge.textContent = latestDiagnostics.engine.toUpperCase();
  }
  if (window.ziroAPI && window.ziroAPI.reportVoiceDiagnostics) {
    window.ziroAPI.reportVoiceDiagnostics(latestDiagnostics).catch(() => {});
  }
}

async function finalizeLiveUtterance() {
  if (!isCapturingLiveUtterance || isProcessingLiveUtterance) return;
  isCapturingLiveUtterance = false;
  isProcessingLiveUtterance = true;
  currentTurnEndOfSpeechTs = Date.now();
  firstAudioPlayedForTurn = false;
  streamedTextAccumulator = '';

  const chunksToProcess = liveUtteranceChunks;
  liveUtteranceChunks = [];
  livePreRollRing = [];

  try {
    const totalLength = chunksToProcess.reduce((acc, c) => acc + c.length, 0);
    if (totalLength < 4096) {
      isProcessingLiveUtterance = false;
      liveVoiceHud.style.display = 'none';
      bubbleText.style.display = 'block';
      waveform.classList.remove('active');
      setPetState('idle');
      return;
    }

    const rawPcm = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunksToProcess) {
      rawPcm.set(c, offset);
      offset += c.length;
    }

    // Check peak energy and normalize to 85%
    let peak = 0;
    for (let i = 0; i < rawPcm.length; i++) {
      const a = Math.abs(rawPcm[i]);
      if (a > peak) peak = a;
    }

    if (peak < 0.008) {
      isProcessingLiveUtterance = false;
      liveVoiceHud.style.display = 'none';
      bubbleText.style.display = 'block';
      waveform.classList.remove('active');
      setPetState('idle');
      return;
    }

    const boost = Math.min(0.85 / peak, 14);
    for (let i = 0; i < rawPcm.length; i++) {
      rawPcm[i] *= boost;
    }

    liveVoiceText.textContent = '⚡ Procesando conversación en streaming...';
    setPetState('thinking');

    const sampleRate = liveCallAudioCtx ? liveCallAudioCtx.sampleRate : 48000;
    const wavBuffer = encodeWAV(rawPcm, sampleRate);
    const wavBase64 = arrayBufferToBase64(wavBuffer);
    const lang = currentSettings?.voiceConfig?.language || 'es-AR';
    const skipGamingChatter = gamingModeActive && gamingConfig.reduceChatterInGame;
    const canStreamTts = !ziroVoiceMuted && !liveWakeStandbyOnly && !skipGamingChatter;

    updateDiagnosticsUI({ vadMs: currentTurnVadSilenceMs });

    const res = await window.ziroAPI.transcribeAudio(wavBase64, lang, canStreamTts);

    liveVoiceHud.style.display = 'none';
    bubbleText.style.display = 'block';
    if (!isSpeaking) {
      waveform.classList.remove('active');
      setPetState('idle');
    }

    if (res && res.diagnostics) {
      updateDiagnosticsUI({
        vadMs: currentTurnVadSilenceMs,
        sttMs: res.diagnostics.transcribeMs || latestDiagnostics.sttMs,
        llmMs: res.diagnostics.llmTotalMs || latestDiagnostics.llmMs,
        firstTextMs: res.diagnostics.firstClauseMs || res.diagnostics.ttftMs || latestDiagnostics.firstTextMs,
        ttsMs: res.diagnostics.firstTtsSynthMs || latestDiagnostics.ttsMs,
        totalMs: Date.now() - currentTurnEndOfSpeechTs
      });
    }

    if (res && res.text && res.text.trim()) {
      const cleanTranscript = res.text.trim();

      // Handle wake/sleep transitions
      if (res.action === 'livekit_wake') {
        ziroVoiceMuted = false;
        liveWakeStandbyOnly = false;
        updateLiveCallBadgeUI();
      } else if (res.action === 'livekit_sleep') {
        ziroVoiceMuted = true;
        liveWakeStandbyOnly = true;
        stopAllSpeech();
        updateLiveCallBadgeUI();
      } else if (liveWakeStandbyOnly) {
        if (ziroVoiceMuted) {
          isProcessingLiveUtterance = false;
          return;
        }
        const norm = cleanTranscript.toLowerCase();
        if (!norm.includes('ziro') && !norm.includes('ciro') && !norm.includes('siro') && !norm.includes('activar')) {
          isProcessingLiveUtterance = false;
          return;
        }
        liveWakeStandbyOnly = false;
        updateLiveCallBadgeUI();
      }

      const name = currentSettings?.petName || 'Ziro';
      let badge = res.isCommand ? 'COMANDO' : '📞 STREAMING';
      if (res.action === 'pet_minimal_mode') {
        badge = res.minimal ? '🗕 MINIMAL' : '🗖 COMPLETO';
        setMinimalMode(res.minimal);
      } else if (res.action === 'pet_change_scale') {
        badge = '📐 TAMAÑO';
        applyPetScale(res.scale);
      } else if (res.action === 'pet_customize_fx') {
        badge = '✨ EFECTOS 3D';
        if (res.ringColor1) pet3D.setRingsColor(res.ringColor1, res.ringColor2 || '#00ffff');
        if (res.particleEffect) pet3D.setParticleEffect(res.particleEffect, res.ringColor1 || '#00ff44');
      } else if (res.action === 'open_cyber_explorer') {
        badge = '⚡ EXPLORADOR';
        if (window.electronAPI && window.electronAPI.openExplorer) window.electronAPI.openExplorer();
      } else if (res.action && res.action.startsWith('unreal')) {
        badge = '🎮 UNREAL 5';
      } else if (res.action && res.action.startsWith('comfy')) {
        badge = '🎨 COMFY ANIME';
      } else if (res.action === 'livekit_wake') {
        badge = '📞 LIVEKIT ACTIVO';
      } else if (res.action === 'livekit_sleep') {
        badge = '🔇 SILENCIADO';
      }

      showBubble(name, badge, res.reply, gamingModeActive && gamingConfig.preventPopupsInGame ? 3500 : 14000);

      if (res.isCommand) {
        sfx.playSuccess();
        pet3D.triggerJump();
      }

      // If it was a direct system command (not already streamed by LLM clauses), speak it now
      if (!res.streamed && res.action !== 'livekit_sleep' && !ziroVoiceMuted && !(skipGamingChatter && !res.isCommand)) {
        speakResponse(res.reply, true);
      }
    }
  } catch (err) {
    console.warn('Error en utterance LiveKit:', err);
    liveVoiceHud.style.display = 'none';
    bubbleText.style.display = 'block';
    waveform.classList.remove('active');
    setPetState('idle');
  } finally {
    isProcessingLiveUtterance = false;
  }
}

function stopLiveKitHandsFreeCall() {
  liveCallActive = false;
  isCapturingLiveUtterance = false;
  if (liveCallRafId) {
    cancelAnimationFrame(liveCallRafId);
    liveCallRafId = null;
  }
  if (liveCallProcessor) {
    try { liveCallProcessor.disconnect(); } catch (e) {}
    liveCallProcessor = null;
  }
  if (liveCallStream) {
    liveCallStream.getTracks().forEach(t => t.stop());
    liveCallStream = null;
  }
  if (liveCallAudioCtx && liveCallAudioCtx.state !== 'closed') {
    liveCallAudioCtx.close().catch(() => {});
    liveCallAudioCtx = null;
  }
  liveCallAnalyser = null;
  liveVoiceHud.style.display = 'none';
  bubbleText.style.display = 'block';
  waveform.classList.remove('active');
  setPetState('idle');
  updateLiveCallBadgeUI();
}

async function restartLiveKitHandsFreeCall() {
  stopLiveKitHandsFreeCall();
  await new Promise(r => setTimeout(r, 250));
  startLiveKitHandsFreeCall();
}

function toggleRecording() {
  // Clicking the mic button or LIVE pill toggles Hands-Free LiveKit Call on/off
  if (liveCallActive) {
    if (isCapturingLiveUtterance) {
      // If currently speaking a sentence, finalize it immediately
      finalizeLiveUtterance();
      return;
    }
    stopLiveKitHandsFreeCall();
    const name = currentSettings?.petName || 'Ziro';
    showBubble(name, 'MIC PAUSADO', 'Llamada en vivo pausada. Haz clic en 📞 LIVE o en el micrófono para reanudar.', 5000);
  } else {
    liveWakeStandbyOnly = false;
    startLiveKitHandsFreeCall();
    sfx.playListen();
    const name = currentSettings?.petName || 'Ziro';
    showBubble(name, '📞 LIVEKIT ACTIVO', '¡Llamada en vivo manos libres activa! Solo di "Activar Ziro" o háblame sin tocar botones.', 7000);
  }
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 channel (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16 bits
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

/* ============================================================
   FASE 3 & 5: Progressive Streaming Audio Queue + Barge-In Support
   ============================================================ */
function stopAllSpeech(clearStreamQueue = true) {
  if (clearStreamQueue) {
    streamingAudioQueue = [];
    isPlayingStreamQueue = false;
  }
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.onended = null;
      currentAudioPlayer.onerror = null;
      currentAudioPlayer.pause();
    } catch (e) {}
    currentAudioPlayer = null;
  }
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  if (clearStreamQueue) {
    isSpeaking = false;
    waveform.classList.remove('active');
    pet3D.setState('idle');
  }
}

function enqueueStreamAudioChunk(chunkData) {
  if (ziroVoiceMuted || !chunkData || !chunkData.success || !chunkData.audioUrl) return;

  if (chunkData.text) {
    streamedTextAccumulator = streamedTextAccumulator
      ? `${streamedTextAccumulator} ${chunkData.text}`
      : chunkData.text;
    const name = currentSettings?.petName || 'Ziro';
    showBubble(name, '⚡ STREAMING', streamedTextAccumulator, 14000);
  }

  if (chunkData.clauseIndex === 0) {
    updateDiagnosticsUI({
      sttMs: chunkData.transcribeMs ?? latestDiagnostics.sttMs,
      firstTextMs: chunkData.firstClauseMs || chunkData.ttftMs || latestDiagnostics.firstTextMs,
      ttsMs: chunkData.synthMs || latestDiagnostics.ttsMs,
      engine: chunkData.engine || 'edge-neural-stream'
    });
  }

  streamingAudioQueue.push(chunkData);
  if (!isPlayingStreamQueue) {
    playNextStreamChunk();
  }
}

async function playNextStreamChunk() {
  if (ziroVoiceMuted || streamingAudioQueue.length === 0) {
    isPlayingStreamQueue = false;
    isSpeaking = false;
    speakingCooldownUntil = Date.now() + 240;
    waveform.classList.remove('active');
    pet3D.setState('idle');
    currentAudioPlayer = null;
    return;
  }

  isPlayingStreamQueue = true;
  isSpeaking = true;
  const nextChunk = streamingAudioQueue.shift();
  const audioOutputId = currentSettings?.voiceConfig?.audioOutputId;

  try {
    const audio = new Audio(nextChunk.audioUrl);
    currentAudioPlayer = audio;

    if (audioOutputId && audioOutputId !== 'default' && typeof audio.setSinkId === 'function') {
      try {
        await audio.setSinkId(audioOutputId);
      } catch (e) {}
    }

    audio.onplay = () => {
      isSpeaking = true;
      waveform.classList.add('active');
      pet3D.setState('speaking');
      if (!firstAudioPlayedForTurn && currentTurnEndOfSpeechTs > 0) {
        firstAudioPlayedForTurn = true;
        const firstSoundLatency = Date.now() - currentTurnEndOfSpeechTs;
        updateDiagnosticsUI({ firstAudioMs: firstSoundLatency });
      }
    };

    audio.onended = () => {
      currentAudioPlayer = null;
      playNextStreamChunk();
    };

    audio.onerror = () => {
      currentAudioPlayer = null;
      playNextStreamChunk();
    };

    await audio.play();
  } catch (e) {
    currentAudioPlayer = null;
    playNextStreamChunk();
  }
}

async function speakResponse(text, forceSpeak = false) {
  if (ziroVoiceMuted) return;
  if (!forceSpeak && !currentSettings?.voiceConfig?.ttsEnabled) return;
  if (!text) return;

  stopAllSpeech(true);

  isSpeaking = true;
  isCapturingLiveUtterance = false;

  const voiceName = currentSettings.voiceConfig?.voiceName || 'es-AR-TomasNeural';
  const rate = currentSettings.voiceConfig?.rate || 1.0;
  const pitch = currentSettings.voiceConfig?.pitch || 1.0;
  const audioOutputId = currentSettings.voiceConfig?.audioOutputId;

  // 1. Try High Quality Persistent Daemon Voices (Edge Neural / Piper Local)
  try {
    const t0 = Date.now();
    const synthRes = await window.ziroAPI.synthesizeSpeech(text, voiceName, rate, pitch);
    const synthElapsed = synthRes?.synthMs || (Date.now() - t0);
    if (synthRes && synthRes.success && synthRes.audioUrl) {
      const audio = new Audio(synthRes.audioUrl);
      currentAudioPlayer = audio;

      if (audioOutputId && audioOutputId !== 'default' && typeof audio.setSinkId === 'function') {
        try {
          await audio.setSinkId(audioOutputId);
        } catch (e) {}
      }

      audio.onplay = () => {
        isSpeaking = true;
        waveform.classList.add('active');
        pet3D.setState('speaking');
        if (!firstAudioPlayedForTurn && currentTurnEndOfSpeechTs > 0) {
          firstAudioPlayedForTurn = true;
          updateDiagnosticsUI({
            ttsMs: synthElapsed,
            firstAudioMs: Date.now() - currentTurnEndOfSpeechTs,
            engine: synthRes.engine || voiceName
          });
        }
      };

      audio.onended = () => {
        isSpeaking = false;
        speakingCooldownUntil = Date.now() + 260;
        waveform.classList.remove('active');
        pet3D.setState('idle');
        currentAudioPlayer = null;
      };

      audio.onerror = () => {
        isSpeaking = false;
        speakingCooldownUntil = Date.now() + 200;
        waveform.classList.remove('active');
        pet3D.setState('idle');
        currentAudioPlayer = null;
      };

      await audio.play();
      return;
    }
  } catch (err) {
    console.warn('TTS synthesis fallback to Web Speech:', err);
  }

  // 2. Fallback to Web Speech Synthesis
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentSettings.voiceConfig?.language || 'es-AR';
    utterance.pitch = pitch;
    utterance.rate = rate;

    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es'));
    if (esVoice) utterance.voice = esVoice;

    utterance.onstart = () => {
      isSpeaking = true;
      waveform.classList.add('active');
      pet3D.setState('speaking');
    };

    utterance.onend = () => {
      isSpeaking = false;
      speakingCooldownUntil = Date.now() + 260;
      waveform.classList.remove('active');
      pet3D.setState('idle');
    };

    utterance.onerror = () => {
      isSpeaking = false;
      speakingCooldownUntil = Date.now() + 200;
      waveform.classList.remove('active');
      pet3D.setState('idle');
    };

    window.speechSynthesis.speak(utterance);
  } else {
    isSpeaking = false;
  }
}

// Text Message Handler
async function handleTextInput(text) {
  if (!text || !text.trim()) return;

  stopAllSpeech(true);
  if (window.ziroAPI && window.ziroAPI.interruptVoice) {
    window.ziroAPI.interruptVoice().catch(() => {});
  }

  const cleanText = text.trim();
  const name = currentSettings?.petName || 'Ziro';
  currentTurnEndOfSpeechTs = Date.now();
  firstAudioPlayedForTurn = false;
  streamedTextAccumulator = '';

  showBubble('TÚ', 'TEXTO', cleanText, 4000);
  setPetState('thinking');

  try {
    const response = await window.ziroAPI.sendMessage(cleanText);
    if (!isSpeaking) {
      setPetState('idle');
    }

    if (response) {
      if (response.diagnostics) {
        updateDiagnosticsUI({
          vadMs: 0,
          sttMs: 0,
          llmMs: response.diagnostics.llmTotalMs || 0,
          firstTextMs: response.diagnostics.firstClauseMs || response.diagnostics.ttftMs || 0,
          ttsMs: response.diagnostics.firstTtsSynthMs || latestDiagnostics.ttsMs,
          totalMs: Date.now() - currentTurnEndOfSpeechTs
        });
      }

      let badge = response.isCommand ? 'COMANDO' : '⚡ STREAMING';
      if (response.action === 'pet_minimal_mode') {
        badge = response.minimal ? '🗕 MINIMAL' : '🗖 COMPLETO';
        setMinimalMode(response.minimal);
      } else if (response.action === 'pet_change_scale') {
        badge = '📐 TAMAÑO';
        applyPetScale(response.scale);
      } else if (response.action === 'pet_customize_fx') {
        badge = '✨ EFECTOS 3D';
        if (response.ringColor1) pet3D.setRingsColor(response.ringColor1, response.ringColor2 || '#00ffff');
        if (response.particleEffect) pet3D.setParticleEffect(response.particleEffect, response.ringColor1 || '#00ff44');
      } else if (response.action === 'open_cyber_explorer') {
        badge = '⚡ EXPLORADOR';
        if (window.electronAPI && window.electronAPI.openExplorer) window.electronAPI.openExplorer();
      } else if (response.action && response.action.startsWith('unreal')) {
        badge = '🎮 UNREAL 5';
      } else if (response.action && response.action.startsWith('comfy')) {
        badge = '🎨 COMFY ANIME';
      } else if (response.action === 'livekit_wake') {
        ziroVoiceMuted = false;
        liveWakeStandbyOnly = false;
        updateLiveCallBadgeUI();
        badge = '📞 LIVEKIT ACTIVO';
      } else if (response.action === 'livekit_sleep') {
        ziroVoiceMuted = true;
        liveWakeStandbyOnly = true;
        stopAllSpeech();
        updateLiveCallBadgeUI();
        badge = '🔇 SILENCIADO';
      }
      showBubble(name, badge, response.reply, 14000);

      if (response.isCommand) {
        sfx.playSuccess();
        pet3D.triggerJump();
      }

      if (!response.streamed && !ziroVoiceMuted && response.action !== 'livekit_sleep' && (currentSettings?.voiceConfig?.autoSpeak || response.action === 'livekit_wake')) {
        speakResponse(response.reply, true);
      }
    }
  } catch (error) {
    setPetState('idle');
    showBubble(name, 'ERROR', `Hubo un problema: ${error.message}`, 8000);
  }
}

function spawnParticle(x, y) {
  const particle = document.createElement('div');
  particle.className = 'sparkle-particle';
  particle.textContent = ['✨', '💚', '⚡', '🐾', '⭐'][Math.floor(Math.random() * 5)];
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particlesContainer.appendChild(particle);

  setTimeout(() => {
    particle.remove();
  }, 1000);
}

// Setup Event Listeners
function setupEventListeners() {
  micBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRecording();
  });

  if (btnLiveCallToggle) {
    btnLiveCallToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRecording();
    });
  }

  sendBtn.addEventListener('click', () => {
    const text = chatInput.value;
    if (text) {
      chatInput.value = '';
      handleTextInput(text);
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = chatInput.value;
      if (text) {
        chatInput.value = '';
        handleTextInput(text);
      }
    }
  });

  // 3D Canvas Click & Interaction
  if (pet3dCanvas) {
    pet3dCanvas.addEventListener('click', (e) => {
      sfx.playChirp();
      pet3D.triggerJump();

      const rect = pet3dCanvas.getBoundingClientRect();
      spawnParticle(e.clientX - rect.left + 20, e.clientY - rect.top);

      const name = currentSettings?.petName || 'Ziro';
      const petPhrases = [
        `¡Qué hacés! Siempre listo acá en el escritorio.`,
        `Energía al cien por ciento, decime en qué te doy una mano.`,
        `Conversación en vivo activa, hablame directo o interrumpime cuando quieras.`,
        `Acá andamos, firme junto a vos.`
      ];
      showBubble(name, 'FELIZ 3D', petPhrases[Math.floor(Math.random() * petPhrases.length)], 5000);
    });
  }

  if (btnDiagnostics && voiceDiagPanel) {
    btnDiagnostics.addEventListener('click', () => {
      voiceDiagPanel.style.display = voiceDiagPanel.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (window.ziroAPI && window.ziroAPI.onVoiceStreamChunk) {
    window.ziroAPI.onVoiceStreamChunk((chunkData) => {
      enqueueStreamAudioChunk(chunkData);
    });
  }

  btnInteract.addEventListener('click', () => {
    if (pet3dCanvas) pet3dCanvas.click();
  });

  btnToggleChat.addEventListener('click', () => {
    if (chatInputWrapper.style.display === 'none') {
      chatInputWrapper.style.display = 'flex';
      chatInput.focus();
    } else {
      chatInputWrapper.style.display = 'none';
    }
  });

  btnSettings.addEventListener('click', () => window.ziroAPI.openDashboard());

  // Minimize button toggles minimal mode so only the floating character remains on screen
  btnMinimize.addEventListener('click', () => {
    setMinimalMode(true);
    sfx.playInteract();
  });

  // Minimal mode floating restore button
  const btnMinimalRestore = document.getElementById('btnMinimalRestore');
  if (btnMinimalRestore) {
    btnMinimalRestore.addEventListener('click', (e) => {
      e.stopPropagation();
      setMinimalMode(false);
      sfx.playInteract();
      showBubble(currentSettings?.petName || 'Ziro', 'MENÚ RESTAURADO', '¡Menú y controles restaurados!', 3000);
    });
  }

  // Double click stage to restore HUD if in minimal mode
  if (petStage) {
    petStage.addEventListener('dblclick', () => {
      if (isMinimalMode) {
        setMinimalMode(false);
        sfx.playInteract();
        showBubble(currentSettings?.petName || 'Ziro', 'MENÚ RESTAURADO', '¡Menú restaurado!', 3000);
      }
    });
  }

  // IPC Event Listeners for Minimal Mode and Scale
  if (window.ziroAPI.onToggleMinimalMode) {
    window.ziroAPI.onToggleMinimalMode(() => {
      setMinimalMode(!isMinimalMode);
    });
  }
  if (window.ziroAPI.onSetMinimalMode) {
    window.ziroAPI.onSetMinimalMode((enable) => {
      setMinimalMode(enable);
    });
  }
  if (window.ziroAPI.onSetScale) {
    window.ziroAPI.onSetScale((scale) => {
      applyPetScale(scale);
    });
  }

  window.ziroAPI.onSettingsUpdated((newSettings) => {
    applySettings(newSettings);
  });

  if (window.ziroAPI.onGamingStateUpdated) {
    window.ziroAPI.onGamingStateUpdated((gState) => {
      gamingModeActive = Boolean(gState?.gamingModeActive);
      if (gState?.config) gamingConfig = { ...gamingConfig, ...gState.config };
      if (typeof gState?.petSilentMode === 'boolean' && gState.petSilentMode !== ziroVoiceMuted) {
        ziroVoiceMuted = gState.petSilentMode;
        liveWakeStandbyOnly = gState.petSilentMode;
        if (ziroVoiceMuted) stopAllSpeech();
        updateLiveCallBadgeUI();
      }
    });
  }

  if (window.ziroAPI.onPetSilentModeSync) {
    window.ziroAPI.onPetSilentModeSync(({ silent }) => {
      ziroVoiceMuted = Boolean(silent);
      liveWakeStandbyOnly = Boolean(silent);
      if (ziroVoiceMuted) stopAllSpeech();
      updateLiveCallBadgeUI();
    });
  }
}

window.addEventListener('DOMContentLoaded', init);
