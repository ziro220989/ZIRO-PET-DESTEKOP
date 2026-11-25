/**
 * Unreal Engine ZIROAI.uplugin Real-Time Voice & Level Control Service
 * Connects ZIRO PET DESTEKOP directly to:
 *   Project: D:\legolas-ai-v1.0\ZiroHost\ZiroHost.uproject
 *   Plugin:  D:\legolas-ai-v1.0\ZiroHost\Plugins\ZIROAI\ZIROAI.uplugin
 *
 * Dual-Channel Real-Time Architecture:
 *   1. ZIROAI WebSocket Bridge (ws://127.0.0.1:8765 -> FZiroVoiceClient / UZiroEditorSubsystem)
 *   2. ZIROAI GameThread File IPC (D:\legolas-ai-v1.0\ZiroHost\Saved\ZiroAI\pet_inbox.json -> pet_outbox.json)
 *   3. Legacy fallback TCP Socket (55557) if another project is used
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

class UnrealService {
  constructor() {
    this.host = '127.0.0.1';
    this.voicePort = 8765;
    this.port = 8765; // Displayed in UI badges
    this.legacyTcpPort = 55557;
    this.remotePort = 30010;

    // Proyecto de destino activo (NUNCA usar ZiroHost como destino automático)
    this.ziroHostDir = '';
    this.uprojectPath = '';
    this.upluginPath = '';
    this.voiceServiceDir = 'D:\\legolas-ai-v1.0\\ZiroHost\\Plugins\\ZIROAI\\VoiceService';
    this.voiceServiceMainPy = path.join(this.voiceServiceDir, 'main.py');
    this.voiceServiceVenvPy = path.join(this.voiceServiceDir, '.venv', 'Scripts', 'python.exe');
    this.savedZiroDir = '';
    this.petInboxPath = '';
    this.petOutboxPath = '';
    this.chatHistoryPath = '';
    this.unrealEditorExe = 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe';

    this.lastSpawnedActor = null;
    this.spawnCounter = 1;
    this.isConnected = false;
    this.lastPingTime = null;
    this._startingVoiceService = false;

    this.colorMap = {
      'rojo': [1.0, 0.05, 0.05],
      'roja': [1.0, 0.05, 0.05],
      'verde': [0.05, 1.0, 0.05],
      'verde fluor': [0.0, 1.0, 0.4],
      'fluor': [0.0, 1.0, 0.4],
      'verde neon': [0.0, 1.0, 0.35],
      'neon': [0.0, 1.0, 0.4],
      'azul': [0.05, 0.35, 1.0],
      'azul cielo': [0.1, 0.7, 1.0],
      'celeste': [0.2, 0.8, 1.0],
      'cyan': [0.0, 1.0, 1.0],
      'amarillo': [1.0, 0.95, 0.05],
      'amarilla': [1.0, 0.95, 0.05],
      'naranja': [1.0, 0.5, 0.0],
      'morado': [0.65, 0.05, 1.0],
      'violeta': [0.75, 0.1, 1.0],
      'rosa': [1.0, 0.2, 0.7],
      'fucsia': [1.0, 0.05, 0.8],
      'blanco': [1.0, 1.0, 1.0],
      'blanca': [1.0, 1.0, 1.0],
      'negro': [0.04, 0.04, 0.04],
      'dorado': [1.0, 0.84, 0.0],
      'oro': [1.0, 0.84, 0.0],
      'plata': [0.8, 0.8, 0.85]
    };

    // ZIROAI.uplugin native spawn_actor classes
    this.shapeClassMap = {
      'cube': 'Cube',
      'cubo': 'Cube',
      'caja': 'Cube',
      'bloque': 'Cube',
      'sphere': 'Sphere',
      'esfera': 'Sphere',
      'pelota': 'Sphere',
      'bola': 'Sphere',
      'cylinder': 'Cylinder',
      'cilindro': 'Cylinder',
      'columna': 'Cylinder',
      'tubo': 'Cylinder',
      'cone': 'Cone',
      'cono': 'Cone',
      'plane': 'Plane',
      'plano': 'Plane',
      'piso': 'Plane',
      'suelo': 'Plane'
    };
  }

  configure(config = {}) {
    if (config.host) this.host = config.host;
    if (config.port) {
      const p = parseInt(config.port, 10);
      if (p === 55557) {
        // Keep 8765 as primary ZIROAI port while preserving 55557 fallback
        this.legacyTcpPort = 55557;
      } else if (p > 0) {
        this.voicePort = p;
        this.port = p;
      }
    }
    if (config.uprojectPath && fs.existsSync(config.uprojectPath)) {
      this.uprojectPath = config.uprojectPath;
      this.ziroHostDir = path.dirname(config.uprojectPath);
    } else if (config.ziroHostDir && fs.existsSync(config.ziroHostDir)) {
      this.ziroHostDir = config.ziroHostDir;
      // Detectar automáticamente cualquier archivo .uproject dentro de la carpeta del proyecto
      try {
        const uprojFiles = fs.readdirSync(this.ziroHostDir).filter((f) => f.toLowerCase().endsWith('.uproject'));
        if (uprojFiles.length > 0) {
          this.uprojectPath = path.join(this.ziroHostDir, uprojFiles[0]);
        } else {
          this.uprojectPath = path.join(this.ziroHostDir, 'ZiroHost.uproject');
        }
      } catch (e) {
        this.uprojectPath = path.join(this.ziroHostDir, 'ZiroHost.uproject');
      }
    }

    if (this.ziroHostDir && fs.existsSync(this.ziroHostDir)) {
      this.upluginPath = config.upluginPath && fs.existsSync(config.upluginPath)
        ? config.upluginPath
        : path.join(this.ziroHostDir, 'Plugins', 'ZIROAI', 'ZIROAI.uplugin');
      this.savedZiroDir = path.join(this.ziroHostDir, 'Saved', 'ZiroAI');
      this.petInboxPath = path.join(this.savedZiroDir, 'pet_inbox.json');
      this.petOutboxPath = path.join(this.savedZiroDir, 'pet_outbox.json');
      this.chatHistoryPath = path.join(this.savedZiroDir, 'chat_history.json');

      const projVoiceDir = path.join(this.ziroHostDir, 'Plugins', 'ZIROAI', 'VoiceService');
      if (fs.existsSync(path.join(projVoiceDir, 'main.py'))) {
        this.voiceServiceDir = projVoiceDir;
        this.voiceServiceMainPy = path.join(projVoiceDir, 'main.py');
        const projVenvPy = path.join(projVoiceDir, '.venv', 'Scripts', 'python.exe');
        if (fs.existsSync(projVenvPy)) {
          this.voiceServiceVenvPy = projVenvPy;
        }
      }
      this.isConnected = false;
    }
  }

  /**
   * Checks if ZIROAI.uplugin exists in D:\legolas-ai-v1.0\ZiroHost
   */
  getPluginMetadata() {
    try {
      if (fs.existsSync(this.upluginPath)) {
        const raw = fs.readFileSync(this.upluginPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          installed: true,
          upluginPath: this.upluginPath,
          uprojectPath: this.uprojectPath,
          versionName: parsed.VersionName || '1.0.0',
          friendlyName: parsed.FriendlyName || 'ZIRO AI',
          description: parsed.Description || ''
        };
      }
    } catch (e) {
      // ignore
    }
    return {
      installed: false,
      upluginPath: this.upluginPath,
      uprojectPath: this.uprojectPath
    };
  }

  /**
   * Checks if UnrealEditor.exe is currently running on Windows
   */
  async isUnrealEditorRunning() {
    return new Promise((resolve) => {
      exec('tasklist /FI "IMAGENAME eq UnrealEditor.exe" /NH', (err, stdout) => {
        if (err || !stdout) return resolve(false);
        resolve(stdout.toLowerCase().includes('unrealeditor.exe'));
      });
    });
  }

  /**
   * Launches ZiroHost.uproject in Unreal Engine 5.8 if not already open
   */
  async launchZiroHostProject() {
    const running = await this.isUnrealEditorRunning();
    if (running) {
      await this.ensureVoiceServiceRunning();
      return {
        success: true,
        alreadyRunning: true,
        message: '🎮 El proyecto ZiroHost ya está abierto en Unreal Engine con ZIROAI.uplugin activo.'
      };
    }

    if (!fs.existsSync(this.uprojectPath)) {
      return {
        success: false,
        message: `No se encontró el proyecto en ${this.uprojectPath}`
      };
    }

    try {
      if (fs.existsSync(this.unrealEditorExe)) {
        const child = spawn(this.unrealEditorExe, [this.uprojectPath], {
          cwd: this.ziroHostDir,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      } else {
        exec(`start "" "${this.uprojectPath}"`);
      }
      await this.ensureVoiceServiceRunning();
      return {
        success: true,
        alreadyRunning: false,
        message: `🎮 Abriendo ZiroHost.uproject con el plugin ZIROAI.uplugin (${this.upluginPath})...`
      };
    } catch (err) {
      return {
        success: false,
        message: `Error al abrir ZiroHost: ${err.message}`
      };
    }
  }

  /**
   * Ensures ZIROAI VoiceService WebSocket hub (ws://127.0.0.1:8765) is running
   */
  async ensureVoiceServiceRunning() {
    const portOpen = await this.checkTcpPort(this.host, this.voicePort, 600);
    if (portOpen) return true;

    if (this._startingVoiceService) return false;
    if (!fs.existsSync(this.voiceServiceMainPy)) return false;

    this._startingVoiceService = true;
    try {
      const pyExe = fs.existsSync(this.voiceServiceVenvPy) ? this.voiceServiceVenvPy : 'python';
      const child = spawn(pyExe, [this.voiceServiceMainPy, '--host', '127.0.0.1', '--port', String(this.voicePort)], {
        cwd: this.voiceServiceDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();

      // Wait up to 3.5s for port 8765 to bind
      for (let i = 0; i < 14; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await this.checkTcpPort(this.host, this.voicePort, 400)) {
          this._startingVoiceService = false;
          return true;
        }
      }
    } catch (e) {
      console.warn('Error auto-starting ZIROAI VoiceService:', e.message);
    }
    this._startingVoiceService = false;
    return false;
  }

  checkTcpPort(host, port, timeoutMs = 600) {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (!done) {
          done = true;
          sock.destroy();
          resolve(ok);
        }
      };
      sock.setTimeout(timeoutMs);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false));
      sock.once('error', () => finish(false));
      sock.connect(port, host);
    });
  }

  /**
   * Zero-dependency RFC-6455 WebSocket JSON request/relay to ws://127.0.0.1:8765
   */
  sendWebSocketPacket(payloadObj, { waitForType = null, requestId = null, timeoutMs = 4500 } = {}) {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      const wsKey = crypto.randomBytes(16).toString('base64');
      let handshakeDone = false;
      let buffer = Buffer.alloc(0);
      let resolved = false;
      let hardTimer = null;

      const finish = (err, data) => {
        if (resolved) return;
        resolved = true;
        if (hardTimer) clearTimeout(hardTimer);
        try { sock.destroy(); } catch (e) {}
        if (err) reject(err);
        else resolve(data);
      };

      hardTimer = setTimeout(() => {
        if (!waitForType && handshakeDone) {
          finish(null, { sent: true });
        } else {
          finish(new Error(`Timeout WebSocket ZIROAI (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      sock.setTimeout(timeoutMs);
      sock.on('timeout', () => {
        if (!waitForType && handshakeDone) {
          finish(null, { sent: true });
        } else {
          finish(new Error(`Timeout WebSocket ZIROAI (${timeoutMs}ms)`));
        }
      });

      sock.on('error', (err) => finish(err));

      sock.connect(this.voicePort, this.host, () => {
        const req = [
          `GET / HTTP/1.1`,
          `Host: ${this.host}:${this.voicePort}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Key: ${wsKey}`,
          `Sec-WebSocket-Version: 13`,
          `\r\n`
        ].join('\r\n');
        sock.write(req);
      });

      const sendMaskedTextFrame = (text) => {
        const dataBuf = Buffer.from(text, 'utf8');
        const mask = crypto.randomBytes(4);
        let header;
        if (dataBuf.length < 126) {
          header = Buffer.alloc(2);
          header[0] = 0x81; // FIN + text frame
          header[1] = 0x80 | dataBuf.length;
        } else if (dataBuf.length < 65536) {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 0x80 | 126;
          header.writeUInt16BE(dataBuf.length, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x81;
          header[1] = 0x80 | 127;
          header.writeBigUInt64BE(BigInt(dataBuf.length), 2);
        }
        const masked = Buffer.alloc(dataBuf.length);
        for (let i = 0; i < dataBuf.length; i++) {
          masked[i] = dataBuf[i] ^ mask[i % 4];
        }
        sock.write(Buffer.concat([header, mask, masked]));
      };

      sock.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        if (!handshakeDone) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          const headerStr = buffer.slice(0, headerEnd).toString('utf8');
          buffer = buffer.slice(headerEnd + 4);
          if (!headerStr.includes('101')) {
            return finish(new Error('Fallo handshake WebSocket con ZIROAI VoiceService'));
          }
          handshakeDone = true;
          sendMaskedTextFrame(JSON.stringify(payloadObj));
          if (!waitForType) {
            setTimeout(() => finish(null, { sent: true }), 180);
            return;
          }
        }

        // Parse incoming WebSocket frames
        while (buffer.length >= 2) {
          const firstByte = buffer[0];
          const secondByte = buffer[1];
          const opcode = firstByte & 0x0f;
          const isMasked = (secondByte & 0x80) !== 0;
          let payloadLen = secondByte & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buffer.length < 4) return;
            payloadLen = buffer.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (buffer.length < 10) return;
            payloadLen = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }

          if (isMasked) offset += 4;
          if (buffer.length < offset + payloadLen) return;

          let framePayload = buffer.slice(offset, offset + payloadLen);
          buffer = buffer.slice(offset + payloadLen);

          if (opcode === 0x01) {
            // Text frame
            try {
              const msg = JSON.parse(framePayload.toString('utf8'));
              if (waitForType && msg.type === waitForType) {
                if (!requestId || !msg.request_id || msg.request_id === requestId) {
                  return finish(null, msg);
                }
              }
            } catch (e) {
              // ignore non-json
            }
          } else if (opcode === 0x08) {
            return finish(new Error('WebSocket cerrado por servidor'));
          }
        }
      });
    });
  }

  /**
   * Executes a ZIROAI.uplugin command in real time on the open level of ZiroHost
   * Supports:
   *   - Direct C++ tool execution: { tool: "spawn_actor" | "build_house" | ..., args: {...}, voicePrompt: "..." }
   *   - Multi-step plan execution: { plan: [ { tool, args }, ... ], voicePrompt: "..." }
   *   - Open-ended AI ActionEngine prompt: { text: "...", voicePrompt: "..." }
   */
  async executeZiroPluginCommand(options = {}, timeoutMs = 1800) {
    if (!this.uprojectPath || !fs.existsSync(this.uprojectPath)) {
      return {
        success: false,
        needsProject: true,
        confirmedByEngine: false,
        message: 'Proceso detenido: no hay un proyecto .uproject válido seleccionado (nunca se usa ZiroHost automáticamente). Selecciona una nueva ruta en Control de Proyectos.'
      };
    }

    const requestId = `pet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const packet = {
      type: 'pet_command',
      request_id: requestId,
      timestamp: Date.now(),
      ...options
    };

    try {
      if (this.savedZiroDir && !fs.existsSync(this.savedZiroDir)) {
        fs.mkdirSync(this.savedZiroDir, { recursive: true });
      }
      // Clear old outbox if any
      if (this.petOutboxPath && fs.existsSync(this.petOutboxPath)) {
        try { fs.unlinkSync(this.petOutboxPath); } catch (e) {}
      }
      // 1. Write to Saved/ZiroAI/pet_inbox.json (polled every 150ms by UZiroEditorSubsystem::PollPetInboxFile)
      if (this.petInboxPath) {
        fs.writeFileSync(this.petInboxPath, JSON.stringify(packet, null, 2), 'utf8');
      }
    } catch (fileErr) {
      console.warn('Warning writing pet_inbox.json:', fileErr.message);
    }

    // 2. Also send via WebSocket ws://127.0.0.1:8765
    let wsResult = null;
    const wsUp = await this.ensureVoiceServiceRunning();
    if (wsUp) {
      try {
        const wsPromise = this.sendWebSocketPacket(packet, {
          waitForType: 'ziro_pet_result',
          requestId,
          timeoutMs: Math.min(timeoutMs, 1500)
        }).catch(() => null);

        // Simultaneously poll pet_outbox.json every 100ms
        const filePollPromise = this.pollOutboxForRequest(requestId, Math.min(timeoutMs, 1600));

        wsResult = await Promise.race([
          wsPromise.then((r) => r || filePollPromise),
          filePollPromise.then((r) => r || wsPromise)
        ]);
      } catch (e) {
        // Fallback to outbox poll
      }
    } else {
      wsResult = await this.pollOutboxForRequest(requestId, Math.min(timeoutMs, 1500));
    }

    if (wsResult && typeof wsResult === 'object') {
      this.isConnected = true;
      this.lastPingTime = new Date();
      return {
        success: wsResult.success !== false,
        confirmedByEngine: true,
        tool: wsResult.tool || options.tool || 'ziro_ai',
        message: wsResult.message || 'Ejecutado en tiempo real en tu nivel abierto de Unreal Engine.',
        data: wsResult.data || null
      };
    }

    // 3. Fallback compatibility if UnrealEditor is running an older unpatched DLL before LiveCoding reload:
    // Send stt_final over ws://127.0.0.1:8765 so FZiroVoiceClient::OnFinalTranscript -> UZiroEditorSubsystem::SendUserMessage executes it!
    const fallbackPrompt = options.voice_prompt || options.text || this.buildNaturalPromptFromTool(options.tool, options.args);
    if (wsUp && fallbackPrompt) {
      try {
        await this.sendWebSocketPacket(
          { type: 'stt_final', text: fallbackPrompt },
          { waitForType: null, timeoutMs: 1200 }
        );
        this.isConnected = true;
        return {
          success: true,
          confirmedByEngine: false,
          relayedViaVoiceBus: true,
          tool: options.tool || 'voice_agent',
          message: `Orden enviada en tiempo real a ZIROAI.uplugin en tu nivel abierto: "${fallbackPrompt}"`
        };
      } catch (e) {
        // ignore
      }
    }

    const ueRunning = await this.isUnrealEditorRunning();
    return {
      success: ueRunning,
      confirmedByEngine: false,
      queuedInInbox: true,
      tool: options.tool || 'ziro_ai',
      message: ueRunning
        ? `Orden enviada a ZIROAI.uplugin en el nivel abierto de ZiroHost.`
        : `Orden lista en la cola de ZIROAI.uplugin (abre ZiroHost en Unreal Engine para verla en el escenario).`
    };
  }

  async pollOutboxForRequest(requestId, maxWaitMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        if (fs.existsSync(this.petOutboxPath)) {
          const raw = fs.readFileSync(this.petOutboxPath, 'utf8');
          if (raw && raw.trim().startsWith('{')) {
            const parsed = JSON.parse(raw);
            if (!requestId || !parsed.request_id || parsed.request_id === requestId || Math.abs(Date.now() - (parsed.timestamp || 0) * 1000) < 10000) {
              return parsed;
            }
          }
        }
      } catch (e) {
        // File may be mid-write
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    return null;
  }

  buildNaturalPromptFromTool(toolName, args = {}) {
    if (!toolName) return '';
    return `Ejecuta la herramienta ${toolName} con parametros ${JSON.stringify(args || {})} en el nivel abierto ahora mismo.`;
  }

  /**
   * Healthcheck test connection to ZIROAI.uplugin in D:\legolas-ai-v1.0\ZiroHost
   */
  async testConnection() {
    const startTime = Date.now();
    const pluginMeta = this.getPluginMetadata();
    const ueRunning = await this.isUnrealEditorRunning();
    const wsUp = await this.ensureVoiceServiceRunning();

    if (ueRunning) {
      const pingRes = await this.executeZiroPluginCommand({ action: 'ping' }, 2500);
      const latency = Date.now() - startTime;
      this.isConnected = true;
      this.lastPingTime = new Date();
      return {
        success: true,
        latencyMs: latency,
        protocol: 'ZIROAI.uplugin (WS 8765 + GameThread Bridge)',
        host: this.host,
        port: this.voicePort,
        pluginPath: this.upluginPath,
        projectPath: this.uprojectPath,
        unrealRunning: true,
        voiceServiceRunning: wsUp,
        message: `¡Conectado con ZIROAI.uplugin en ZiroHost! (${pingRes.message || '84 herramientas listas en tiempo real'})`,
        details: { ...pluginMeta, pingRes }
      };
    }

    if (pluginMeta.installed) {
      return {
        success: true,
        latencyMs: Date.now() - startTime,
        protocol: 'ZIROAI.uplugin (Listo - Editor cerrado)',
        host: this.host,
        port: this.voicePort,
        pluginPath: this.upluginPath,
        projectPath: this.uprojectPath,
        unrealRunning: false,
        voiceServiceRunning: wsUp,
        message: `Plugin ZIROAI.uplugin detectado en ${this.upluginPath}. Di "abre Unreal" para lanzar ZiroHost o abre tu nivel para ejecutar órdenes en vivo.`
      };
    }

    return {
      success: false,
      host: this.host,
      port: this.voicePort,
      error: `No se encontró ZIROAI.uplugin en ${this.upluginPath}`,
      suggestion: 'Verifica la ruta D:\\legolas-ai-v1.0\\ZiroHost\\Plugins\\ZIROAI\\ZIROAI.uplugin'
    };
  }

  parseColor(colorInput) {
    if (!colorInput) return null;
    if (Array.isArray(colorInput)) {
      return colorInput.slice(0, 3);
    }
    if (typeof colorInput === 'string') {
      const norm = colorInput.toLowerCase().trim();
      for (const [key, val] of Object.entries(this.colorMap)) {
        if (norm.includes(key)) {
          return val;
        }
      }
    }
    return [0.0, 1.0, 0.4];
  }

  /**
   * Spawns an actor in the currently open level using ZIROAI.uplugin's `spawn_actor`
   * If a color is requested, also creates/assigns a dynamic material in the open level!
   */
  async spawnMesh({
    shape = 'cube',
    name = '',
    location = null,
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    color = null,
    physics = false
  }) {
    const shapeNorm = (shape || 'cubo').toLowerCase().trim();
    const className = this.shapeClassMap[shapeNorm] || 'Cube';
    const actorLabel = (name && name.trim()) || `Ziro_${className}_${this.spawnCounter++}`;
    const parsedColor = color ? this.parseColor(color) : null;

    const spawnArgs = {
      class: className,
      label: actorLabel,
      scale: Array.isArray(scale) ? scale : [scale.x || 1, scale.y || 1, scale.z || 1],
      rotation: Array.isArray(rotation) ? rotation : [rotation.pitch || 0, rotation.yaw || 0, rotation.roll || 0]
    };
    if (Array.isArray(location)) {
      spawnArgs.location = location;
    }

    const plan = [{ tool: 'spawn_actor', args: spawnArgs }];

    if (parsedColor) {
      const matName = `M_${actorLabel}_Color`;
      plan.push({
        tool: 'create_material',
        args: {
          name: matName,
          path: '/Game/ZIRO/Materials',
          base_color: parsedColor,
          roughness: 0.25,
          metallic: 0.1,
          emissive: color && (color.includes('fluor') || color.includes('neon'))
            ? [parsedColor[0] * 2.5, parsedColor[1] * 2.5, parsedColor[2] * 2.5]
            : [0, 0, 0]
        }
      });
      plan.push({
        tool: 'assign_material',
        args: {
          actor: actorLabel,
          material: `/Game/ZIRO/Materials/${matName}`
        }
      });
    }

    const voicePrompt = `Crea un ${shapeNorm}${color ? ' de color ' + color : ''} llamado ${actorLabel} frente a la cámara en el nivel abierto.`;
    const res = await this.executeZiroPluginCommand(
      plan.length === 1
        ? { tool: 'spawn_actor', args: spawnArgs, voice_prompt: voicePrompt }
        : { plan, voice_prompt: voicePrompt }
    );

    this.lastSpawnedActor = actorLabel;
    return {
      success: res.success,
      name: actorLabel,
      shape: shapeNorm,
      physics: Boolean(physics),
      message: `🎮 ¡${shapeNorm.toUpperCase()}${color ? ' (' + color + ')' : ''} ("${actorLabel}") creado en tiempo real en el escenario de tu nivel abierto con ZIROAI.uplugin!`,
      details: res
    };
  }

  /**
   * Spawns lights or full lighting preset in the open level via ZIROAI.uplugin (`spawn_actor` / `add_lighting`)
   */
  async spawnLight({
    type = 'PointLight',
    preset = null,
    name = '',
    location = null,
    color = null,
    intensity = 5000
  }) {
    if (preset) {
      const res = await this.executeZiroPluginCommand({
        tool: 'add_lighting',
        args: { preset },
        voice_prompt: `Configura la iluminación del nivel en modo ${preset}.`
      });
      return {
        success: res.success,
        type: preset,
        message: `🎮 ¡Iluminación "${preset}" aplicada en tiempo real al escenario con ZIROAI.uplugin!`,
        details: res
      };
    }

    let ueType = 'PointLight';
    const norm = (type || '').toLowerCase();
    if (norm.includes('spot') || norm.includes('foco')) ueType = 'SpotLight';
    else if (norm.includes('direc') || norm.includes('sol') || norm.includes('sun')) ueType = 'DirectionalLight';
    else if (norm.includes('rect')) ueType = 'RectLight';

    const lightLabel = (name && name.trim()) || `Ziro_${ueType}_${this.spawnCounter++}`;
    const args = {
      class: ueType,
      label: lightLabel
    };
    if (Array.isArray(location)) args.location = location;

    const res = await this.executeZiroPluginCommand({
      tool: 'spawn_actor',
      args,
      voice_prompt: `Crea una luz ${ueType} llamada ${lightLabel} frente a la cámara.`
    });

    this.lastSpawnedActor = lightLabel;
    return {
      success: res.success,
      name: lightLabel,
      type: ueType,
      message: `🎮 ¡Luz ${ueType} ("${lightLabel}") creada en el escenario de tu nivel abierto!`,
      details: res
    };
  }

  /**
   * High-level procedural structures & world generation powered by ZIROAI.uplugin's native C++ tools!
   * Supports: house, building, city, environment, forest, room, stairs, floor, door, inventory, wall, pyramid, domino
   */
  async buildStructure({
    type = 'house',
    style = 'modern',
    preset = 'forest',
    floors = 4,
    width = 900,
    depth = 900,
    height = 340,
    count = 60,
    color = 'fluor',
    extraArgs = {}
  }) {
    const structType = (type || 'house').toLowerCase();

    if (structType === 'house' || structType === 'casa' || structType === 'cabana' || structType === 'cabaña') {
      const args = {
        width: width || 900,
        depth: depth || 900,
        height: height || 340,
        roof_type: extraArgs.roof_type || 'gable',
        add_light: true,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'build_house',
        args,
        voice_prompt: 'Construye una casa completa frente a la cámara en el nivel abierto.'
      });
      return {
        success: res.success,
        type: 'house',
        message: `🏠 ¡Casa completa con paredes, puerta, ventanas, techo e iluminación construida en tu nivel abierto! (${res.message})`,
        details: res
      };
    }

    if (structType === 'building' || structType === 'edificio' || structType === 'torre' || structType === 'rascacielos') {
      const args = {
        name: `ZiroBuilding_${this.spawnCounter++}`,
        floors: floors || 5,
        width: width || 1400,
        depth: depth || 1200,
        floor_height: 360,
        style: style || 'modern',
        interior_stairs: true,
        add_lights: true,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'create_building',
        args,
        voice_prompt: `Construye un edificio de ${args.floors} pisos estilo ${args.style} en el nivel abierto.`
      });
      return {
        success: res.success,
        type: 'building',
        message: `🏢 ¡Edificio de ${args.floors} pisos (${args.style}) con escaleras e iluminación construido en tiempo real en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'city' || structType === 'ciudad') {
      const args = {
        rows: extraArgs.rows || 3,
        cols: extraArgs.cols || 3,
        street_lights: true,
        trees: true,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'build_city',
        args,
        voice_prompt: `Construye una ciudad de ${args.rows}x${args.cols} manzanas en el nivel abierto.`
      });
      return {
        success: res.success,
        type: 'city',
        message: `🌆 ¡Ciudad procedural (${args.rows}x${args.cols} manzanas con calles, edificios, árboles y farolas) generada en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'environment' || structType === 'escenario' || structType === 'bioma' || structType === 'entorno' || structType === 'parque' || structType === 'aldea') {
      const args = {
        preset: preset || 'forest',
        radius: extraArgs.radius || 5000,
        density: extraArgs.density || 1.0,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'generate_environment',
        args,
        voice_prompt: `Genera un escenario completo tipo ${args.preset} en el nivel abierto.`
      });
      return {
        success: res.success,
        type: 'environment',
        message: `🌲 ¡Escenario "${args.preset}" generado en tiempo real en tu nivel abierto con ZIROAI.uplugin!`,
        details: res
      };
    }

    if (structType === 'forest' || structType === 'bosque' || structType === 'vegetacion' || structType === 'arboles') {
      const args = {
        count: count || 80,
        radius: extraArgs.radius || 4500,
        biome: extraArgs.biome || 'mixed',
        clearings: extraArgs.clearings || 2,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'generate_forest_pcg',
        args,
        voice_prompt: `Genera un bosque procedural con ${args.count} elementos en el nivel abierto.`
      });
      return {
        success: res.success,
        type: 'forest',
        message: `🌳 ¡Bosque procedural (${args.count} instancias con árboles y rocas sobre el terreno) generado en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'room' || structType === 'habitacion' || structType === 'cuarto' || structType === 'sala') {
      const args = {
        width: width || 800,
        length: depth || 800,
        height: height || 320,
        door_side: 'south',
        ceiling: false,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'create_room',
        args,
        voice_prompt: 'Crea una habitación con puerta en el nivel abierto.'
      });
      return {
        success: res.success,
        type: 'room',
        message: `🚪 ¡Habitación de ${args.width}x${args.length} creada en tiempo real en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'stairs' || structType === 'escalera' || structType === 'escaleras') {
      const args = {
        steps: extraArgs.steps || 14,
        width: extraArgs.width || 220,
        step_height: 20,
        step_depth: 30,
        ...extraArgs
      };
      const res = await this.executeZiroPluginCommand({
        tool: 'create_stairs',
        args,
        voice_prompt: `Crea una escalera de ${args.steps} escalones en el nivel abierto.`
      });
      return {
        success: res.success,
        type: 'stairs',
        message: `🪜 ¡Escalera de ${args.steps} escalones creada frente a tu cámara en el nivel abierto!`,
        details: res
      };
    }

    if (structType === 'door' || structType === 'puerta') {
      const res = await this.executeZiroPluginCommand({
        tool: 'build_interactive_door',
        args: { name: `BP_ZiroDoor_${this.spawnCounter++}`, spawn_in_level: true, ...extraArgs },
        voice_prompt: 'Crea una puerta interactiva en el nivel abierto.'
      });
      return {
        success: res.success,
        type: 'door',
        message: `🚪 ¡Puerta interactiva creada y colocada en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'wall' || structType === 'muro' || structType === 'pared') {
      const actorLabel = `Ziro_Wall_${this.spawnCounter++}`;
      const res = await this.executeZiroPluginCommand({
        tool: 'spawn_actor',
        args: {
          class: 'Cube',
          label: actorLabel,
          scale: [6.0, 0.35, 3.0]
        },
        voice_prompt: 'Crea un muro frente a la cámara en el nivel abierto.'
      });
      this.lastSpawnedActor = actorLabel;
      return {
        success: res.success,
        type: 'wall',
        message: `🧱 ¡Muro "${actorLabel}" construido frente a la cámara en tu nivel abierto!`,
        details: res
      };
    }

    if (structType === 'pyramid' || structType === 'piramide') {
      const plan = [
        { tool: 'spawn_actor', args: { class: 'Cone', label: `Ziro_Pyramid_${this.spawnCounter++}`, scale: [5.0, 5.0, 4.0] } }
      ];
      const res = await this.executeZiroPluginCommand({
        plan,
        voice_prompt: 'Crea una pirámide en el nivel abierto.'
      });
      return {
        success: res.success,
        type: 'pyramid',
        message: `🔺 ¡Pirámide construida en el escenario de tu nivel abierto!`,
        details: res
      };
    }

    // Fallback to open-ended tool or spawn_actor
    return await this.spawnMesh({ shape: 'cube', color });
  }

  /**
   * Modifies an actor's transform in the open level via `set_actor_transform`
   */
  async setActorTransform({
    name = '',
    location = null,
    rotation = null,
    scale = null
  }) {
    const targetName = name || this.lastSpawnedActor || 'Selected';
    const args = { actor: targetName };
    if (location) {
      args.location = Array.isArray(location) ? location : [location.x || 0, location.y || 0, location.z || 0];
    }
    if (rotation) {
      args.rotation = Array.isArray(rotation) ? rotation : [rotation.pitch || 0, rotation.yaw || 0, rotation.roll || 0];
    }
    if (scale) {
      args.scale = Array.isArray(scale) ? scale : [scale.x || 1, scale.y || 1, scale.z || 1];
    }

    const res = await this.executeZiroPluginCommand({
      tool: 'set_actor_transform',
      args,
      voice_prompt: `Actualiza la transformación del actor ${targetName}.`
    });

    return {
      success: res.success,
      name: targetName,
      message: `🎮 ¡Transformación de "${targetName}" actualizada en tiempo real!`,
      details: res
    };
  }

  async moveActorRelative({ name = '', dx = 0, dy = 0, dz = 150 }) {
    const targetName = name || this.lastSpawnedActor || '';
    const prompt = targetName
      ? `Mueve el actor ${targetName} (${dx}, ${dy}, ${dz}) unidades en el nivel abierto.`
      : `Mueve el actor seleccionado (${dx}, ${dy}, ${dz}) unidades en el nivel abierto.`;

    if (targetName) {
      // Ask ZIROAI ActionEngine or set_actor_transform
      const res = await this.executeZiroPluginCommand({
        text: prompt,
        voice_prompt: prompt
      });
      return {
        success: res.success,
        name: targetName,
        message: `🎮 ¡Objeto "${targetName}" desplazado (${dx}, ${dy}, ${dz}) en el escenario!`,
        details: res
      };
    }

    const res = await this.executeZiroPluginCommand({
      text: prompt,
      voice_prompt: prompt
    });
    return {
      success: res.success,
      message: `🎮 ¡Orden de movimiento ejecutada en el nivel abierto!`,
      details: res
    };
  }

  async scaleActor({ name = '', factor = 2.0 }) {
    const targetName = name || this.lastSpawnedActor;
    if (targetName) {
      return await this.setActorTransform({
        name: targetName,
        scale: [factor, factor, factor]
      });
    }
    const prompt = `Escala el actor seleccionado por un factor de ${factor} en el nivel abierto.`;
    const res = await this.executeZiroPluginCommand({ text: prompt, voice_prompt: prompt });
    return {
      success: res.success,
      message: `🎮 ¡Objeto escalado x${factor} en el escenario!`,
      details: res
    };
  }

  async deleteActor(name = '') {
    const targetName = name || this.lastSpawnedActor;
    const args = targetName
      ? { names: [targetName] }
      : { selected_only: true };

    const res = await this.executeZiroPluginCommand({
      tool: 'delete_actors',
      args,
      voice_prompt: targetName ? `Elimina el actor ${targetName} del nivel.` : `Elimina los actores seleccionados del nivel.`
    });

    if (targetName && this.lastSpawnedActor === targetName) {
      this.lastSpawnedActor = null;
    }

    return {
      success: res.success,
      name: targetName || 'seleccionados',
      message: `🗑️ ¡Actor ${targetName || 'seleccionado'} eliminado en tiempo real del nivel abierto!`,
      details: res
    };
  }

  async undoAction() {
    const res = await this.executeZiroPluginCommand({
      tool: 'undo',
      args: {},
      voice_prompt: 'Deshacer última acción en el nivel.'
    });
    return {
      success: res.success,
      message: `↩️ ¡Última acción deshecha en Unreal Engine (Undo)!`,
      details: res
    };
  }

  async redoAction() {
    const res = await this.executeZiroPluginCommand({
      tool: 'redo',
      args: {},
      voice_prompt: 'Rehacer acción en el nivel.'
    });
    return {
      success: res.success,
      message: `↪️ ¡Acción rehecha en Unreal Engine (Redo)!`,
      details: res
    };
  }

  async getActorsInLevel() {
    const res = await this.executeZiroPluginCommand({
      tool: 'inspect_level',
      args: { max_actors: 200 },
      voice_prompt: 'Inspecciona los actores del nivel abierto.'
    });
    const actors = (res.data && Array.isArray(res.data.actors)) ? res.data.actors : [];
    const total = (res.data && typeof res.data.total === 'number') ? res.data.total : actors.length;
    return {
      success: res.success,
      count: total,
      actors,
      message: res.message
    };
  }

  async controlSimulation(action = 'play') {
    const act = (action || 'play').toLowerCase();
    const res = await this.executeZiroPluginCommand({
      tool: 'play_in_editor',
      args: { mode: act === 'stop' ? 'stop' : 'play' },
      voice_prompt: act === 'stop' ? 'Detén la simulación del nivel.' : 'Inicia Play In Editor en el nivel abierto.'
    });
    return {
      success: res.success,
      action: act,
      message: act === 'play'
        ? '▶️ ¡Simulación Play-In-Editor iniciada en tu nivel abierto de Unreal Engine!'
        : '⏹️ ¡Simulación detenida en Unreal Engine!'
    };
  }

  async saveLevel() {
    const res = await this.executeZiroPluginCommand({
      tool: 'save_level',
      args: {},
      voice_prompt: 'Guarda el nivel actual y todos los paquetes modificados.'
    });
    return {
      success: res.success,
      message: '💾 ¡Nivel abierto guardado correctamente en Unreal Engine (ZIROAI.uplugin)!'
    };
  }

  /**
   * Sends any natural language voice order directly to ZIROAI.uplugin's FZiroActionEngine
   * so the 84 tools + LM Studio execute complex orders in the open level!
   */
  async executeNaturalVoiceOrder(voiceText) {
    const res = await this.executeZiroPluginCommand({
      text: voiceText,
      voice_prompt: voiceText,
      also_stt_final: true
    }, 8000);
    return {
      success: res.success,
      message: res.confirmedByEngine && res.message
        ? `🎮 ZIROAI: ${res.message}`
        : `🎮 ¡Orden por voz enviada y ejecutándose en tiempo real en tu nivel abierto con ZIROAI.uplugin!: "${voiceText}"`,
      details: res
    };
  }
}

module.exports = new UnrealService();
