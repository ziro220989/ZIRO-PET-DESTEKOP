const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

class ComfyService {
  constructor() {
    this.host = '127.0.0.1';
    this.port = 8188;
    this.clientId = 'ziro_pet_' + Math.random().toString(36).substring(2, 10);
    this.isGenerating = false;
    this.lastStatus = null;

    const home = os.homedir();
    this.comfyDesktopExe = path.join(home, 'AppData', 'Local', 'Programs', 'Comfy Desktop', 'Comfy Desktop.exe');
    this.comfyShortcutLnk = path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Comfy Desktop.lnk');
    this.comfyRoamingDir = path.join(home, 'AppData', 'Roaming', 'Comfy Desktop');
    this.comfyLocalDir = path.join(home, 'AppData', 'Local', 'Comfy-Desktop');
    this.comfySharedOutputDir = path.join(this.comfyLocalDir, 'ComfyUI-Shared', 'output');
    this.comfySharedInputDir = path.join(this.comfyLocalDir, 'ComfyUI-Shared', 'input');
    this.comfyInstallBaseDir = path.join(this.comfyLocalDir, 'ComfyUI-Installs', 'ComfyUI');
    this.comfyPythonExe = path.join(this.comfyInstallBaseDir, 'ComfyUI', '.venv', 'Scripts', 'python.exe');
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  configure(config = {}) {
    if (config.host) this.host = config.host;
    if (config.port) this.port = Number(config.port) || 8188;
  }

  getPrimaryInstallationId() {
    try {
      const instFile = path.join(this.comfyRoamingDir, 'installations.json');
      if (fs.existsSync(instFile)) {
        const list = JSON.parse(fs.readFileSync(instFile, 'utf8'));
        if (Array.isArray(list) && list.length > 0 && list[0].id) {
          return list[0].id;
        }
      }
    } catch (e) {}
    return 'inst-1790035949646';
  }

  /**
   * Ensures Comfy Desktop is configured to auto-open the active ComfyUI instance
   * on the primary screen so the user always sees Comfy Desktop working live.
   */
  ensureDesktopStartupConfig() {
    try {
      if (!fs.existsSync(this.comfyRoamingDir)) return;
      const installId = this.getPrimaryInstallationId();

      // 1. Ensure settings.json has autoLaunchOnStartup set without UTF-8 BOM
      const settingsPath = path.join(this.comfyRoamingDir, 'settings.json');
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        try {
          const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
          settings = JSON.parse(raw);
        } catch (e) {}
      }
      settings.firstUseCompleted = true;
      settings.autoLaunchOnStartup = installId;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

      // 2. Ensure window-state.json places Comfy Desktop visibly on primary display
      const winStatePath = path.join(this.comfyRoamingDir, 'window-state.json');
      const winState = {
        x: 60,
        y: 40,
        width: 1440,
        height: 900,
        maximized: true
      };
      fs.writeFileSync(winStatePath, JSON.stringify(winState, null, 2), 'utf8');

      // 3. Ensure last-session.json points to the instance
      const lastSessionPath = path.join(this.comfyRoamingDir, 'last-session.json');
      fs.writeFileSync(lastSessionPath, JSON.stringify({
        kind: 'instance',
        installationId: installId
      }, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ComfyService] Warning updating Comfy Desktop config:', err.message);
    }
  }

  /**
   * Checks if ComfyUI HTTP server is reachable on 127.0.0.1:8188
   */
  async getStatus() {
    const desktopInstalled = fs.existsSync(this.comfyDesktopExe);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${this.baseUrl}/system_stats`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const device = (data.devices && data.devices[0]) || {};
      const vramTotalMB = device.vram_total ? Math.round(device.vram_total / (1024 * 1024)) : 0;
      const vramFreeMB = device.vram_free ? Math.round(device.vram_free / (1024 * 1024)) : 0;

      let queueRunning = 0;
      let queuePending = 0;
      try {
        const qRes = await fetch(`${this.baseUrl}/queue`);
        if (qRes.ok) {
          const qData = await qRes.json();
          queueRunning = Array.isArray(qData.queue_running) ? qData.queue_running.length : 0;
          queuePending = Array.isArray(qData.queue_pending) ? qData.queue_pending.length : 0;
        }
      } catch (e) {}

      this.lastStatus = {
        connected: true,
        host: this.host,
        port: this.port,
        desktopInstalled,
        comfyVersion: data.system?.comfyui_version || '0.44.0',
        gpuName: device.name || 'NVIDIA RTX GPU',
        vramTotalMB,
        vramFreeMB,
        queueRunning,
        queuePending,
        modelStack: 'Z-Image-Turbo (z_image_turbo_bf16 + qwen_3_4b + ae)'
      };
      return this.lastStatus;
    } catch (err) {
      this.lastStatus = {
        connected: false,
        host: this.host,
        port: this.port,
        desktopInstalled,
        error: err.message
      };
      return this.lastStatus;
    }
  }

  /**
   * Visibly opens and brings Comfy Desktop to the foreground on the user's screen,
   * and waits for the local ComfyUI server (127.0.0.1:8188) to be ready.
   */
  async openComfyDesktopOnScreen(waitForServer = true) {
    this.ensureDesktopStartupConfig();

    const launchDesktopGui = () => {
      return new Promise((resolve) => {
        const target = fs.existsSync(this.comfyShortcutLnk)
          ? this.comfyShortcutLnk
          : this.comfyDesktopExe;

        if (!fs.existsSync(target)) {
          resolve(false);
          return;
        }

        // Launching via explorer.exe opens/focuses Comfy Desktop on the interactive user desktop
        exec(`explorer.exe "${target}"`, () => {
          // Also bring window to foreground via PowerShell Win32 API if already open
          const psFocus = `Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'; Get-Process -Name 'Comfy Desktop' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [Native.Win]::ShowWindowAsync($_.MainWindowHandle, 9) | Out-Null; [Native.Win]::SetForegroundWindow($_.MainWindowHandle) | Out-Null }`;
          exec(`powershell -NoProfile -WindowStyle Hidden -Command "${psFocus}"`, () => {
            resolve(true);
          });
        });
      });
    };

    const launched = await launchDesktopGui();

    if (!waitForServer) {
      const st = await this.getStatus();
      return {
        success: launched || st.connected,
        ...st,
        message: 'Comfy Desktop abierto en tu pantalla.'
      };
    }

    // Wait up to 45s for port 8188 to come online
    const startWait = Date.now();
    let fallbackBackendStarted = false;

    while (Date.now() - startWait < 45000) {
      const status = await this.getStatus();
      if (status.connected) {
        return {
          success: true,
          ...status,
          message: `🎨 Comfy Desktop activo en pantalla (${status.gpuName}).`
        };
      }

      // If after 14s Comfy Desktop hasn't spawned the backend yet, start the backend directly
      if (!fallbackBackendStarted && Date.now() - startWait > 14000) {
        fallbackBackendStarted = true;
        this.startFallbackBackendProcess();
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    const finalStatus = await this.getStatus();
    return {
      success: finalStatus.connected,
      ...finalStatus,
      message: finalStatus.connected
        ? `🎨 Comfy Desktop conectado y listo.`
        : `⚠️ Comfy Desktop se abrió en pantalla, pero el servidor en puerto ${this.port} aún está iniciando.`
    };
  }

  startFallbackBackendProcess() {
    try {
      if (!fs.existsSync(this.comfyPythonExe)) return;
      const installId = this.getPrimaryInstallationId();
      const extraPathsYaml = path.join(this.comfyRoamingDir, 'instance-model-paths', `${installId}.yaml`);
      const args = [
        '-s',
        'ComfyUI\\main.py',
        '--enable-assets',
        '--enable-manager',
        '--input-directory', this.comfySharedInputDir,
        '--output-directory', this.comfySharedOutputDir
      ];
      if (fs.existsSync(extraPathsYaml)) {
        args.push('--extra-model-paths-config', extraPathsYaml);
      }

      const child = spawn(this.comfyPythonExe, args, {
        cwd: this.comfyInstallBaseDir,
        detached: true,
        windowsHide: true,
        stdio: 'ignore'
      });
      child.unref();
    } catch (e) {
      console.warn('[ComfyService] Could not start fallback backend:', e.message);
    }
  }

  /**
   * Builds a high-level anime character prompt tailored for Z-Image-Turbo (Qwen-3-4B text encoder)
   * ensuring a clean full-body character on a solid pure white background for razor-sharp 3D extraction.
   */
  buildHighLevelAnimePrompt(userPrompt, style = 'anime') {
    const clean = (userPrompt || 'cute anime companion mascot').trim();

    const styleEnhancers = {
      anime: `Masterpiece, best quality, ultra-detailed modern anime character illustration, official anime key visual style, ufotable and Kyoto Animation inspired high-contrast cel shading, luminous expressive anime eyes with detailed iris highlights, sharp clean lineart, vibrant saturated colors, dynamic full-body standing character pose, entire character visible from head to toe, centered composition, isolated on a completely plain solid pure white background (#FFFFFF), studio rim lighting, no background scenery, no text, no watermark. Character description: ${clean}`,
      cyberpunk: `Masterpiece, best quality, ultra-detailed cyberpunk anime character design, Trigger Studio Edgerunners style, glowing neon emerald green (#00ff66) and cyan cybernetic accents, sleek futuristic techwear and holographic visor details, crisp cel-shaded anime rendering, expressive glowing eyes, full-body standing character pose from head to toe, centered, isolated on a plain solid pure white background (#FFFFFF), no background clutter, no text. Character description: ${clean}`,
      chibi: `Masterpiece, best quality, adorable high-detail chibi anime mascot character, Nendoroid and Genshin Impact companion style, 2.5 head-to-body proportions, glossy expressive anime eyes, vibrant cel-shading with soft studio gradients, cute energetic full-body floating or standing pose, isolated on a plain solid pure white background (#FFFFFF), clean silhouette, no text. Character description: ${clean}`,
      pixel: `Masterpiece, best quality, high-bit HD-2D anime sprite character, Octopath Traveler and Guilty Gear Strive inspired crisp anime character art, vibrant colors, expressive anime face, full-body standing pose, isolated on a plain solid pure white background (#FFFFFF), clean cutout, no text. Character description: ${clean}`
    };

    return styleEnhancers[style] || styleEnhancers.anime;
  }

  /**
   * Builds the exact ComfyUI API Workflow JSON for the installed Z-Image-Turbo model stack:
   * - UNET: z_image_turbo_bf16.safetensors
   * - CLIP: qwen_3_4b.safetensors (lumina2)
   * - VAE: ae.safetensors
   * - ModelSamplingAuraFlow (shift 3.0) + EmptySD3LatentImage (1024x1024) + KSampler (8 steps, cfg 1.0, res_multistep)
   */
  buildZImageTurboWorkflow(positivePrompt, seed = null) {
    const actualSeed = seed || Math.floor(Math.random() * 900000000000000) + 1000000;
    return {
      "9": {
        "inputs": {
          "filename_prefix": "ZiroPet_Anime",
          "images": ["65", 0]
        },
        "class_type": "SaveImage",
        "_meta": { "title": "Guardar Imagen ZIRO PET" }
      },
      "62": {
        "inputs": {
          "clip_name": "qwen_3_4b.safetensors",
          "type": "lumina2",
          "device": "default"
        },
        "class_type": "CLIPLoader",
        "_meta": { "title": "Cargar CLIP (Qwen 3 4B)" }
      },
      "63": {
        "inputs": {
          "vae_name": "ae.safetensors"
        },
        "class_type": "VAELoader",
        "_meta": { "title": "Cargar VAE" }
      },
      "65": {
        "inputs": {
          "samples": ["70", 0],
          "vae": ["63", 0]
        },
        "class_type": "VAEDecode",
        "_meta": { "title": "Decodificar VAE" }
      },
      "66": {
        "inputs": {
          "unet_name": "z_image_turbo_bf16.safetensors",
          "weight_dtype": "default"
        },
        "class_type": "UNETLoader",
        "_meta": { "title": "Cargar Modelo Difusión (Z-Image-Turbo)" }
      },
      "67": {
        "inputs": {
          "text": positivePrompt,
          "clip": ["62", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Prompt Anime Positivo" }
      },
      "68": {
        "inputs": {
          "width": 1024,
          "height": 1024,
          "batch_size": 1
        },
        "class_type": "EmptySD3LatentImage",
        "_meta": { "title": "Imagen Latente 1024x1024" }
      },
      "69": {
        "inputs": {
          "shift": 3.0,
          "sampling": "flow",
          "model": ["66", 0]
        },
        "class_type": "ModelSamplingAuraFlow",
        "_meta": { "title": "ModelSamplingAuraFlow" }
      },
      "70": {
        "inputs": {
          "seed": actualSeed,
          "steps": 8,
          "cfg": 1.0,
          "sampler_name": "res_multistep",
          "scheduler": "simple",
          "denoise": 1.0,
          "model": ["69", 0],
          "positive": ["67", 0],
          "negative": ["71", 0],
          "latent_image": ["68", 0]
        },
        "class_type": "KSampler",
        "_meta": { "title": "KSampler Anime" }
      },
      "71": {
        "inputs": {
          "text": "low quality, worst quality, blurry, deformed, bad anatomy, extra limbs, missing limbs, cropped, cut off head, cut off feet, complex background, busy background, scenery, text, watermark, signature, frame, border",
          "clip": ["62", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Prompt Negativo" }
      }
    };
  }

  /**
   * Generates a high-level anime character using Comfy Desktop (local GPU),
   * opening Comfy Desktop on the user's screen so they can watch it work.
   */
  async generateCharacterBuffer(userPrompt, style = 'anime', options = {}) {
    const openOnScreen = options.openOnScreen !== false;

    if (openOnScreen) {
      await this.openComfyDesktopOnScreen(true);
    } else {
      const st = await this.getStatus();
      if (!st.connected) {
        await this.openComfyDesktopOnScreen(true);
      }
    }

    const status = await this.getStatus();
    if (!status.connected) {
      throw new Error(`No se pudo conectar con Comfy Desktop en ${this.baseUrl}.`);
    }

    const enhancedPrompt = this.buildHighLevelAnimePrompt(userPrompt, style);
    const workflow = this.buildZImageTurboWorkflow(enhancedPrompt, options.seed);

    this.isGenerating = true;
    try {
      const promptRes = await fetch(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: workflow,
          client_id: this.clientId
        })
      });

      if (!promptRes.ok) {
        const errText = await promptRes.text();
        throw new Error(`Error enviando workflow a ComfyUI (${promptRes.status}): ${errText}`);
      }

      const promptData = await promptRes.json();
      const promptId = promptData.prompt_id;
      if (!promptId) {
        throw new Error('ComfyUI no devolvió un prompt_id válido.');
      }

      console.log(`[ComfyService] Generando personaje anime en Comfy Desktop (prompt_id: ${promptId})...`);

      // Poll /history/<promptId> until execution completes
      const startTime = Date.now();
      let outputImageInfo = null;

      while (Date.now() - startTime < 180000) {
        await new Promise(r => setTimeout(r, 1200));

        const histRes = await fetch(`${this.baseUrl}/history/${promptId}`);
        if (!histRes.ok) continue;

        const histData = await histRes.json();
        const entry = histData[promptId];
        if (!entry) continue;

        if (entry.status && entry.status.status_str === 'error') {
          throw new Error('ComfyUI reportó un error durante la ejecución del nodo.');
        }

        const outputs = entry.outputs || {};
        for (const nodeId of Object.keys(outputs)) {
          const nodeOut = outputs[nodeId];
          if (nodeOut && Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
            outputImageInfo = nodeOut.images[0];
            break;
          }
        }

        if (outputImageInfo) break;
      }

      if (!outputImageInfo) {
        throw new Error('Tiempo de espera agotado esperando el renderizado de Comfy Desktop.');
      }

      // Fetch the rendered PNG from ComfyUI /view endpoint
      const params = new URLSearchParams({
        filename: outputImageInfo.filename,
        subfolder: outputImageInfo.subfolder || '',
        type: outputImageInfo.type || 'output'
      });

      const viewRes = await fetch(`${this.baseUrl}/view?${params.toString()}`);
      if (!viewRes.ok) {
        throw new Error(`Error descargando imagen de ComfyUI: HTTP ${viewRes.status}`);
      }

      const arrayBuf = await viewRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      return {
        buffer,
        promptId,
        filename: outputImageInfo.filename,
        enhancedPrompt
      };
    } finally {
      this.isGenerating = false;
    }
  }
}

module.exports = new ComfyService();
