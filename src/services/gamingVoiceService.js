const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { getPythonExecutable } = require('./pythonBridge');

const LOG_DIR = 'D:\\ZIRO_AI\\Logs';
const LOG_FILE = path.join(LOG_DIR, 'gaming_voice_control.log');
const PY_SCRIPT = path.join(__dirname, 'gaming_vision_control.py');

class GamingVoiceService {
  constructor() {
    this.queue = [];
    this.isExecuting = false;
    this.activeChild = null;
    this.cancelRequested = false;
    this.lastActionSignature = '';
    this.lastActionAt = 0;
    this.monitorTimer = null;
    this.listeners = new Set();

    this.state = {
      steamInstalled: false,
      steamRunning: false,
      steamPath: '',
      cs2Installed: false,
      cs2Running: false,
      cs2WindowFound: false,
      gamingModeActive: false,
      petSilentMode: false,
      voiceRecognitionActive: true,
      currentTask: null,
      queueLength: 0,
      lastError: '',
      commandHistory: [],
      config: {
        autoGamingMode: true,
        reduceChatterInGame: true,
        preventPopupsInGame: true,
        confirmBeforeClose: false,
        wakePhrase: 'Actívate, Ziro / Ziro, vuelve a hablar',
        sleepPhrase: 'Desactívate, Ziro / Ziro, modo silencio'
      }
    };
  }

  onStateChange(cb) {
    if (typeof cb === 'function') this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emitState() {
    const snapshot = this.getState();
    for (const cb of this.listeners) {
      try { cb(snapshot); } catch (_) {}
    }
  }

  log(level, msg) {
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
      fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch (_) {}
  }

  getState() {
    return {
      ...this.state,
      queueLength: this.queue.length,
      config: { ...this.state.config },
      commandHistory: [...this.state.commandHistory]
    };
  }

  setConfig(partial = {}) {
    this.state.config = { ...this.state.config, ...partial };
    this.emitState();
    return this.getState();
  }

  setPetSilentMode(silent) {
    this.state.petSilentMode = Boolean(silent);
    this.log('INFO', `Mascota modo silencio: ${this.state.petSilentMode ? 'SILENCIOSA' : 'ACTIVA'}`);
    this.emitState();
    return this.getState();
  }

  setVoiceRecognitionActive(active) {
    this.state.voiceRecognitionActive = Boolean(active);
    this.emitState();
  }

  recordHistory(command, status, detail = '', source = 'voz') {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      time: new Date().toLocaleTimeString(),
      command,
      status,
      detail,
      source
    };
    this.state.commandHistory.unshift(entry);
    if (this.state.commandHistory.length > 40) {
      this.state.commandHistory = this.state.commandHistory.slice(0, 40);
    }
    this.emitState();
  }

  runPythonAction(action, timeoutMs = 90000) {
    return new Promise((resolve) => {
      const pyExe = getPythonExecutable();
      const child = execFile(
        pyExe,
        [PY_SCRIPT, action],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
        (err, stdout, stderr) => {
          this.activeChild = null;
          if (this.cancelRequested) {
            return resolve({ success: false, cancelled: true, message: 'Acción cancelada por el usuario.' });
          }
          if (err && !stdout) {
            const msg = stderr?.trim() || err.message;
            this.log('ERROR', `Python action "${action}" failed: ${msg}`);
            return resolve({ success: false, message: `Error ejecutando ${action}: ${msg}` });
          }
          try {
            const parsed = JSON.parse((stdout || '').trim());
            resolve(parsed);
          } catch (parseErr) {
            this.log('ERROR', `JSON parse error for "${action}": ${stdout}`);
            resolve({ success: false, message: `Respuesta inesperada de visión/control: ${stdout || parseErr.message}` });
          }
        }
      );
      this.activeChild = child;
    });
  }

  async refreshStatus() {
    const res = await this.runPythonAction('status', 10000);
    if (res && res.success) {
      this.state.steamInstalled = Boolean(res.steamInstalled);
      this.state.steamRunning = Boolean(res.steamRunning);
      this.state.steamPath = res.steamPath || '';
      this.state.cs2Installed = Boolean(res.cs2Installed);
      this.state.cs2Running = Boolean(res.cs2Running);
      this.state.cs2WindowFound = Boolean(res.cs2WindowFound);
      if (this.state.config.autoGamingMode) {
        this.state.gamingModeActive = this.state.cs2Running;
      }
      this.emitState();
    }
    return this.getState();
  }

  startMonitor(intervalMs = 6000) {
    if (this.monitorTimer) return;
    this.refreshStatus();
    this.monitorTimer = setInterval(() => {
      if (!this.isExecuting) {
        this.refreshStatus();
      }
    }, intervalMs);
  }

  stopMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  async enqueueCommand(action, { label, source = 'voz' } = {}) {
    // Evitar ejecutar exactamente el mismo comando repetido en < 2.5s
    const now = Date.now();
    if (this.lastActionSignature === action && now - this.lastActionAt < 2500) {
      return { success: false, deduplicated: true, message: 'Comando ya en ejecución o recién ejecutado.' };
    }
    this.lastActionSignature = action;
    this.lastActionAt = now;

    return new Promise((resolve) => {
      this.queue.push({ action, label: label || action, source, resolve });
      this.emitState();
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isExecuting || this.queue.length === 0) return;
    this.isExecuting = true;
    this.cancelRequested = false;

    while (this.queue.length > 0) {
      if (this.cancelRequested) {
        while (this.queue.length > 0) {
          const dropped = this.queue.shift();
          dropped.resolve({ success: false, cancelled: true, message: 'Acción cancelada.' });
        }
        break;
      }

      const item = this.queue.shift();
      this.state.currentTask = item.label;
      this.emitState();

      this.log('INFO', `Ejecutando [${item.source}]: ${item.action}`);
      const res = await this.runPythonAction(item.action);
      if (!res.success) {
        this.state.lastError = res.message || 'Error desconocido';
      } else {
        this.state.lastError = '';
      }

      this.recordHistory(
        item.label,
        res.cancelled ? 'CANCELADO' : (res.success ? 'OK' : 'ERROR'),
        res.message || '',
        item.source
      );

      await this.refreshStatus();
      item.resolve(res);
    }

    this.state.currentTask = null;
    this.isExecuting = false;
    this.emitState();
  }

  cancelCurrentAction() {
    this.cancelRequested = true;
    if (this.activeChild) {
      try { this.activeChild.kill(); } catch (_) {}
      this.activeChild = null;
    }
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.resolve({ success: false, cancelled: true, message: 'Acción cancelada.' });
    }
    this.state.currentTask = null;
    this.isExecuting = false;
    this.recordHistory('Cancelar acciones', 'CANCELADO', 'Cola de comandos gaming detenida', 'sistema');
    this.emitState();
    return { success: true, message: 'Acciones gaming en curso canceladas.' };
  }
}

module.exports = new GamingVoiceService();
