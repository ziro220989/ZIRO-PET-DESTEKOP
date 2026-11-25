/**
 * ZIRO VISUALIZER - Interactive Image Viewer, Prompt Studio & Hands-Free Live Voice
 */

let currentImageSrc = '';
let currentImagePath = '';
let currentZoom = 1.0;
let isCheckerActive = false;
let isGenerating = false;

// Live Hands-Free Mic State (no button pressing required)
let micStream = null;
let audioCtx = null;
let analyser = null;
let processor = null;
let pcmChunks = [];
let isCapturingVoice = false;
let isProcessingUtterance = false;
let voiceStartTime = 0;
let lastSoundTime = 0;

const mainDisplayImg = document.getElementById('mainDisplayImg');
const checkerBg = document.getElementById('checkerBg');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const promptInput = document.getElementById('visualizerPromptInput');
const btnGenerate = document.getElementById('btnGenerate');
const zoomVal = document.getElementById('zoomVal');
const micBannerText = document.getElementById('micBannerText');

// 1. Zoom Controls
function applyZoom(z) {
  currentZoom = Math.max(0.2, Math.min(3.0, z));
  mainDisplayImg.style.transform = `scale(${currentZoom})`;
  zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
}

document.getElementById('btnZoomIn')?.addEventListener('click', () => applyZoom(currentZoom + 0.15));
document.getElementById('btnZoomOut')?.addEventListener('click', () => applyZoom(currentZoom - 0.15));
document.getElementById('btnZoomFit')?.addEventListener('click', () => applyZoom(1.0));

// 2. Checkerboard Background Toggle
document.getElementById('btnToggleChecker')?.addEventListener('click', () => {
  isCheckerActive = !isCheckerActive;
  if (isCheckerActive) {
    checkerBg.classList.add('active');
  } else {
    checkerBg.classList.remove('active');
  }
});

// 3. Clear Prompt
document.getElementById('btnClearPrompt')?.addEventListener('click', () => {
  promptInput.value = '';
  promptInput.focus();
});

// 4. Set Image
function setImage(src, filePath = '') {
  currentImageSrc = src;
  currentImagePath = filePath;
  mainDisplayImg.src = src;
}

// 5. Download Handlers
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

document.getElementById('btnDlPng')?.addEventListener('click', async () => {
  if (window.ziroAPI?.saveImageDialog) {
    await window.ziroAPI.saveImageDialog(currentImageSrc, 'png');
  } else {
    downloadDataUrl(currentImageSrc, `ziro_image_${Date.now()}.png`);
  }
});

document.getElementById('btnDlJpg')?.addEventListener('click', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = mainDisplayImg.naturalWidth || 800;
  canvas.height = mainDisplayImg.naturalHeight || 800;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mainDisplayImg, 0, 0);
  const jpgData = canvas.toDataURL('image/jpeg', 0.95);
  downloadDataUrl(jpgData, `ziro_image_${Date.now()}.jpg`);
});

document.getElementById('btnDlWebp')?.addEventListener('click', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = mainDisplayImg.naturalWidth || 800;
  canvas.height = mainDisplayImg.naturalHeight || 800;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(mainDisplayImg, 0, 0);
  const webpData = canvas.toDataURL('image/webp', 0.92);
  downloadDataUrl(webpData, `ziro_image_${Date.now()}.webp`);
});

document.getElementById('btnDlCutout')?.addEventListener('click', async () => {
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = 'Recortando fondo con IA (rembg)...';
  try {
    const res = await window.ziroAPI.removeBackground(currentImagePath || currentImageSrc);
    loadingOverlay.style.display = 'none';
    if (res && res.success && res.outputPath) {
      const transparentSrc = `file://${res.outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;
      setImage(transparentSrc, res.outputPath);
      isCheckerActive = true;
      checkerBg.classList.add('active');
      downloadDataUrl(transparentSrc, `ziro_cutout_transparent_${Date.now()}.png`);
    } else {
      alert('Se completó el recorte. Revisa la imagen transparente en pantalla.');
    }
  } catch (err) {
    loadingOverlay.style.display = 'none';
    console.error('Error recortando fondo:', err);
  }
});

// 6. Generate Changes with ComfyUI
async function triggerComfyGeneration(promptText) {
  if (isGenerating) return;
  const prompt = (promptText || promptInput.value || '').trim();
  if (!prompt) return;

  isGenerating = true;
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = `Enviando a ComfyUI Desktop: "${prompt.slice(0, 35)}..."`;

  try {
    const result = await window.ziroAPI.generateComfyImage(prompt);
    loadingOverlay.style.display = 'none';
    if (result && result.success && result.imageUrl) {
      setImage(result.imageUrl, result.filePath);
    }
  } catch (err) {
    loadingOverlay.style.display = 'none';
    console.error('Error generando con ComfyUI:', err);
  } finally {
    isGenerating = false;
  }
}

btnGenerate?.addEventListener('click', () => triggerComfyGeneration());
promptInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') triggerComfyGeneration();
});

// 7. Continuous Hands-Free Live Mic (Web Audio API VAD)
async function startHandsFreeMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferSize = 4096;
    processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    pcmChunks = [];
    isCapturingVoice = false;

    processor.onaudioprocess = (e) => {
      if (isProcessingUtterance || isGenerating) return;

      const inputData = e.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSq += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSq / inputData.length);
      const now = Date.now();

      // VAD Threshold
      if (rms > 0.022) {
        lastSoundTime = now;
        if (!isCapturingVoice) {
          isCapturingVoice = true;
          voiceStartTime = now;
          pcmChunks = [];
          if (micBannerText) {
            micBannerText.innerHTML = `🎙️ <strong>Escuchando tu voz...</strong> Habla con libertad.`;
          }
        }
        pcmChunks.push(new Float32Array(inputData));
      } else if (isCapturingVoice) {
        pcmChunks.push(new Float32Array(inputData));
        // Silence detected for > 950ms -> process utterance
        if (now - lastSoundTime > 950) {
          const duration = now - voiceStartTime;
          isCapturingVoice = false;
          if (duration > 600 && pcmChunks.length > 5) {
            processSpokenUtterance([...pcmChunks]);
          }
          pcmChunks = [];
        }
      }
    };
  } catch (err) {
    console.warn('[Visualizer] Microphone access warning:', err.message);
    if (micBannerText) {
      micBannerText.textContent = '🎙️ Haz clic en permitir micrófono para hablarle directamente a Ziro Visualizer.';
    }
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
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function processSpokenUtterance(chunks) {
  isProcessingUtterance = true;
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const sampleRate = audioCtx ? audioCtx.sampleRate : 48000;
  const wavBuf = encodeWAV(merged, sampleRate);
  const wavBase64 = arrayBufferToBase64(wavBuf);

  try {
    const res = await window.ziroAPI.transcribeAudio(wavBase64, 'es-ES');
    if (res && res.text && res.text.trim()) {
      const clean = res.text.trim();
      promptInput.value = clean;
      if (micBannerText) {
        micBannerText.innerHTML = `🎙️ <strong>Orden por voz captada:</strong> "${clean}". ¡Generando cambios...!`;
      }
      await triggerComfyGeneration(clean);
    }
  } catch (e) {
    console.error('Error transcribiendo voz en Visualizer:', e);
  } finally {
    isProcessingUtterance = false;
    setTimeout(() => {
      if (micBannerText) {
        micBannerText.innerHTML = `🎙️ <strong>Micrófono en vivo activo (Manos Libres):</strong> Habla cuando quieras sin apretar ningún botón.`;
      }
    }, 4000);
  }
}

// 8. IPC Listeners
window.addEventListener('DOMContentLoaded', () => {
  if (window.ziroAPI?.onLoadVisualizerImage) {
    window.ziroAPI.onLoadVisualizerImage((data) => {
      if (data.imageUrl) {
        setImage(data.imageUrl, data.filePath);
      }
      if (data.prompt) {
        promptInput.value = data.prompt;
      }
    });
  }
  startHandsFreeMic();
});
