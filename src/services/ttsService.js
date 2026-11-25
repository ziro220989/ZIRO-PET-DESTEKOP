const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { getPythonExecutable } = require('./pythonBridge');

class TTSService {
  constructor() {
    this.speechCacheDir = null;
    this.customVoicesDir = null;
    this.daemonProcess = null;
    this.daemonRl = null;
    this.pendingRequests = new Map();
    this.reqCounter = 0;

    // Catálogo de voces con prioridad en Español Argentino Natural (Edge Neural + Piper ONNX Local)
    this.availableVoices = [
      { id: 'es-AR-TomasNeural', name: '🇦🇷 Tomás (Argentina - Conversacional Natural)', gender: 'Male', lang: 'es-AR', engine: 'edge-neural' },
      { id: 'es-AR-ElenaNeural', name: '🇦🇷 Elena (Argentina - Cálida Natural)', gender: 'Female', lang: 'es-AR', engine: 'edge-neural' },
      { id: 'piper-es-AR-daniela', name: '⚡ Daniela (Argentina - Piper ONNX Local 150ms)', gender: 'Female', lang: 'es-AR', engine: 'piper-onnx' },
      { id: 'piper-es-MX-claude', name: '⚡ Claude (Latino - Piper ONNX Ultra Rápido 45ms)', gender: 'Female', lang: 'es-MX', engine: 'piper-onnx' },
      { id: 'es-MX-JorgeNeural', name: '🇲🇽 Jorge (México - Amigable)', gender: 'Male', lang: 'es-MX', engine: 'edge-neural' },
      { id: 'es-MX-DaliaNeural', name: '🇲🇽 Dalia (México - Expresiva)', gender: 'Female', lang: 'es-MX', engine: 'edge-neural' },
      { id: 'es-ES-AlvaroNeural', name: '🇪🇸 Álvaro (España - Dinámico)', gender: 'Male', lang: 'es-ES', engine: 'edge-neural' },
      { id: 'es-ES-ElviraNeural', name: '🇪🇸 Elvira (España - Cálida)', gender: 'Female', lang: 'es-ES', engine: 'edge-neural' },
      { id: 'es-CO-GonzaloNeural', name: '🇨🇴 Gonzalo (Colombia - Claro)', gender: 'Male', lang: 'es-CO', engine: 'edge-neural' },
      { id: 'es-CL-LorenzoNeural', name: '🇨🇱 Lorenzo (Chile - Positivo)', gender: 'Male', lang: 'es-CL', engine: 'edge-neural' }
    ];
  }

  ensureDirs() {
    if (!this.speechCacheDir) {
      let userData = '';
      try {
        const { app } = require('electron');
        userData = app.getPath('userData');
      } catch (e) {
        userData = path.join(process.cwd(), '.user_data');
      }
      this.speechCacheDir = path.join(userData, 'speech_cache');
      this.customVoicesDir = path.join(userData, 'custom_voices');
    }

    if (!fs.existsSync(this.speechCacheDir)) {
      fs.mkdirSync(this.speechCacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.customVoicesDir)) {
      fs.mkdirSync(this.customVoicesDir, { recursive: true });
    }
  }

  getAvailableVoices() {
    return this.availableVoices;
  }

  /**
   * Transcribe un archivo WAV usando el daemon persistente en memoria (0ms cold-spawn)
   */
  async transcribeViaDaemon(audioPath, language = 'es-AR') {
    if (!this.ensureDaemon()) {
      return null;
    }
    const uniqueId = `stt_${Date.now()}_${++this.reqCounter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(uniqueId)) {
          this.pendingRequests.delete(uniqueId);
          resolve(null);
        }
      }, 10000);

      this.pendingRequests.set(uniqueId, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      const payload = JSON.stringify({
        id: uniqueId,
        action: 'transcribe',
        audioPath,
        language
      });
      this.daemonProcess.stdin.write(payload + '\n', 'utf8');
    });
  }

  /**
   * Sanitiza texto para voz natural sin pronunciar signos ni acotaciones entre asteriscos
   */
  sanitizeForNaturalSpeech(text) {
    if (!text) return '';
    return text
      .replace(/\*[^*]{1,80}\*/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
      .replace(/[*_`#~>|\\/\[\]{}()<>"]/g, ' ')
      .replace(/\s*[-–—]+\s*/g, ', ')
      .replace(/\.{2,}/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Inicia o recupera el daemon persistente en memoria (naturalVoiceDaemon.py)
   * para evitar el costo de 450ms+ de crear un proceso Python nuevo en cada frase.
   */
  ensureDaemon() {
    if (this.daemonProcess && !this.daemonProcess.killed) {
      return true;
    }

    try {
      const pythonExe = getPythonExecutable();
      let daemonScript = path.join(__dirname, 'naturalVoiceDaemon.py');
      if (daemonScript.includes('app.asar') && !daemonScript.includes('app.asar.unpacked')) {
        daemonScript = daemonScript.replace('app.asar', 'app.asar.unpacked');
      }
      if (!fs.existsSync(daemonScript)) {
        return false;
      }

      this.daemonProcess = spawn(pythonExe, [daemonScript], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      this.daemonRl = readline.createInterface({
        input: this.daemonProcess.stdout,
        terminal: false
      });

      this.daemonRl.on('line', (line) => {
        if (!line || !line.trim()) return;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const resolver = this.pendingRequests.get(msg.id);
            this.pendingRequests.delete(msg.id);
            resolver(msg);
          }
        } catch (_) {}
      });

      this.daemonProcess.on('close', () => {
        this.daemonProcess = null;
        this.daemonRl = null;
        for (const [, resolver] of this.pendingRequests.entries()) {
          resolver({ success: false, error: 'Daemon closed' });
        }
        this.pendingRequests.clear();
      });

      return true;
    } catch (e) {
      console.warn('No se pudo iniciar naturalVoiceDaemon:', e.message);
      return false;
    }
  }

  /**
   * Sintetiza un fragmento o frase usando el daemon persistente en memoria
   * y devuelve { success, audioUrl, filePath, synthMs, firstByteMs, engine }
   */
  async synthesizeSpeech(text, voice = 'es-AR-TomasNeural', rate = 1.0, pitch = 1.0) {
    this.ensureDirs();
    const t0 = performance.now();
    const cleanText = this.sanitizeForNaturalSpeech(text);
    if (!cleanText) {
      return { success: false, error: 'Texto sin caracteres pronunciables', synthMs: 0 };
    }

    const selectedVoice = voice || 'es-AR-TomasNeural';
    const isPiper = selectedVoice.startsWith('piper-');
    const ext = isPiper ? 'wav' : 'mp3';
    const uniqueId = `${Date.now()}_${++this.reqCounter}`;
    const outputFile = path.join(this.speechCacheDir, `tts_${uniqueId}.${ext}`);

    // No alterar artificialmente el tono ni distorsionar el audio
    const safeRate = Math.max(0.85, Math.min(1.2, Number(rate) || 1.0));
    const ratePercent = Math.round((safeRate - 1.0) * 100);
    const rateArg = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    const pitchArg = '+0Hz';

    if (this.ensureDaemon()) {
      try {
        const daemonRes = await new Promise((resolve) => {
          const reqId = `req_${uniqueId}`;
          const timer = setTimeout(() => {
            if (this.pendingRequests.has(reqId)) {
              this.pendingRequests.delete(reqId);
              resolve({ success: false, error: 'Daemon TTS timeout' });
            }
          }, 12000);

          this.pendingRequests.set(reqId, (res) => {
            clearTimeout(timer);
            resolve(res);
          });

          const payload = JSON.stringify({
            id: reqId,
            action: 'synthesize',
            text: cleanText,
            voice: selectedVoice,
            rate: rateArg,
            pitch: pitchArg,
            outputFile
          });
          this.daemonProcess.stdin.write(payload + '\n', 'utf8');
        });

        const totalMs = Math.round(performance.now() - t0);
        if (daemonRes && daemonRes.success && daemonRes.filePath && fs.existsSync(daemonRes.filePath)) {
          return {
            success: true,
            filePath: daemonRes.filePath,
            audioUrl: `file://${daemonRes.filePath.replace(/\\/g, '/')}`,
            engine: daemonRes.engine || (isPiper ? 'piper-onnx-local' : 'edge-neural-stream'),
            firstByteMs: daemonRes.firstByteMs || totalMs,
            synthMs: daemonRes.synthMs || totalMs
          };
        }
      } catch (e) {
        console.warn('Fallback de daemon TTS:', e.message);
      }
    }

    // Fallback directo si el daemon aún no estuviera disponible
    return new Promise((resolve) => {
      const effVoice = selectedVoice.startsWith('piper-') ? 'es-AR-TomasNeural' : selectedVoice;
      const args = [
        '-m',
        'edge_tts',
        '--voice',
        effVoice,
        '--rate',
        rateArg,
        '--pitch',
        pitchArg,
        '--text',
        cleanText,
        '--write-media',
        outputFile
      ];

      const pythonExe = getPythonExecutable();
      const child = spawn(pythonExe, args, { windowsHide: true });

      let errOutput = '';
      child.stderr.on('data', (d) => {
        errOutput += d.toString();
      });

      child.on('close', (code) => {
        const totalMs = Math.round(performance.now() - t0);
        if (code === 0 && fs.existsSync(outputFile)) {
          resolve({
            success: true,
            filePath: outputFile,
            audioUrl: `file://${outputFile.replace(/\\/g, '/')}`,
            engine: 'edge-cli-fallback',
            firstByteMs: totalMs,
            synthMs: totalMs
          });
        } else {
          resolve({
            success: false,
            error: errOutput || `Fallo al generar voz (código ${code})`,
            synthMs: totalMs
          });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message, synthMs: Math.round(performance.now() - t0) });
      });
    });
  }

  async saveCustomVoice(dataUrl, name) {
    this.ensureDirs();
    const id = 'voice_' + Date.now();
    const matches = dataUrl.match(/^data:audio\/([A-Za-z0-9-+]+);base64,(.+)$/);

    let ext = 'mp3';
    let base64Data = dataUrl;
    if (matches && matches.length === 3) {
      ext = matches[1].replace('mpeg', 'mp3').replace('wave', 'wav');
      base64Data = matches[2];
    } else if (dataUrl.includes(',')) {
      base64Data = dataUrl.split(',')[1];
    }

    const filename = `${id}.${ext}`;
    const filePath = path.join(this.customVoicesDir, filename);
    await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));

    return {
      id: id,
      name: name || 'Voz Personalizada',
      filename: filename,
      filePath: filePath,
      audioUrl: `file://${filePath.replace(/\\/g, '/')}`
    };
  }

  async listCustomVoices() {
    this.ensureDirs();
    try {
      const files = await fs.promises.readdir(this.customVoicesDir);
      const list = [];
      for (const file of files) {
        if (/\.(mp3|wav|ogg|m4a)$/i.test(file)) {
          const filePath = path.join(this.customVoicesDir, file);
          const id = path.parse(file).name;
          list.push({
            id: id,
            name: id.replace('voice_', 'Voz '),
            filename: file,
            filePath: filePath,
            audioUrl: `file://${filePath.replace(/\\/g, '/')}`
          });
        }
      }
      return list;
    } catch (e) {
      return [];
    }
  }

  async deleteCustomVoice(id) {
    this.ensureDirs();
    try {
      const files = await fs.promises.readdir(this.customVoicesDir);
      for (const f of files) {
        if (f.startsWith(id)) {
          await fs.promises.unlink(path.join(this.customVoicesDir, f));
          return true;
        }
      }
    } catch (e) {}
    return false;
  }
}

module.exports = new TTSService();
