const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

/**
 * ZIRO SYSTEM SCANNER
 * Inspecciona todos los discos disponibles en Windows (C:, D:, E:, F:, etc.)
 * para detectar herramientas, IDEs, modelos GGUF, entornos virtuales y plugins
 * SIN modificar, mover ni reinstalar instalaciones existentes.
 */
class SystemScannerService {
  constructor() {
    this.preferredInstallRoot = 'D:\\ZIRO_AI';
    this.lastScanReport = null;
  }

  getAvailableDrives() {
    const drives = [];
    for (let code = 67; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const root = `${letter}:\\`;
      try {
        if (fs.existsSync(root)) drives.push(root);
      } catch (e) {}
    }
    return drives;
  }

  runCmd(cmd, timeoutMs = 4500) {
    return new Promise((resolve) => {
      exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim()
        });
      });
    });
  }

  findExistingPaths(candidates) {
    const found = [];
    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) found.push(p);
      } catch (e) {}
    }
    return found;
  }

  scanFilesByExtension(roots, ext, maxDepth = 4, maxResults = 80) {
    const results = [];
    const seen = new Set();

    const walk = (dir, depth) => {
      if (depth > maxDepth || results.length >= maxResults) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const ent of entries) {
        if (results.length >= maxResults) break;
        const name = ent.name;
        if (name === 'node_modules' || name === '.git' || name === 'Windows' || name === '$Recycle.Bin' || name === 'Intermediate' || name === 'DerivedDataCache') {
          continue;
        }
        const full = path.join(dir, name);
        if (ent.isDirectory()) {
          walk(full, depth + 1);
        } else if (name.toLowerCase().endsWith(ext)) {
          const key = full.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            let sizeMb = 0;
            try {
              sizeMb = Math.round((fs.statSync(full).size / (1024 * 1024)) * 10) / 10;
            } catch (e) {}
            results.push({ name, path: full, sizeMb });
          }
        }
      }
    };

    for (const r of roots) {
      if (r && fs.existsSync(r)) walk(r, 0);
    }
    return results;
  }

  findVenvs(drives) {
    const venvs = [];
    const rootsToCheck = [this.preferredInstallRoot, 'D:\\', 'C:\\Users\\' + os.userInfo().username];
    for (const d of drives) {
      try {
        const top = fs.readdirSync(d, { withFileTypes: true });
        for (const e of top) {
          if (e.isDirectory() && !['Windows', 'Program Files', 'Program Files (x86)', '$Recycle.Bin', 'System Volume Information'].includes(e.name)) {
            rootsToCheck.push(path.join(d, e.name));
          }
        }
      } catch (e) {}
    }

    const checked = new Set();
    for (const dir of rootsToCheck) {
      for (const vn of ['.venv', 'venv', '.env_ziro']) {
        const candidate = path.join(dir, vn);
        const pyExe = path.join(candidate, 'Scripts', 'python.exe');
        if (!checked.has(candidate.toLowerCase()) && fs.existsSync(pyExe)) {
          checked.add(candidate.toLowerCase());
          venvs.push({ path: candidate, python: pyExe });
        }
      }
    }
    return venvs.slice(0, 25);
  }

  async runFullScan() {
    const startMs = Date.now();
    const drives = this.getAvailableDrives();
    const home = os.homedir();
    const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    const [pyRes, nodeRes, npmRes, gitRes, gpuRes, gradleRes, adbRes] = await Promise.all([
      this.runCmd('python --version'),
      this.runCmd('node -v'),
      this.runCmd('npm -v'),
      this.runCmd('git --version'),
      this.runCmd('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader'),
      this.runCmd('gradle -v'),
      this.runCmd('adb version')
    ]);

    const torchRes = pyRes.ok
      ? await this.runCmd('python -c "import torch; print(torch.__version__, torch.cuda.is_available())"')
      : { ok: false, stdout: '' };

    // VS Code & Cline & Code CLI
    const vscodePaths = this.findExistingPaths([
      path.join(localApp, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      'D:\\visualcode extension'
    ]);
    const vscodeExtDir = path.join(home, '.vscode', 'extensions');
    let clineExts = [];
    if (fs.existsSync(vscodeExtDir)) {
      try {
        clineExts = fs.readdirSync(vscodeExtDir).filter((n) => n.toLowerCase().includes('claude-dev') || n.toLowerCase().includes('cline'));
      } catch (e) {}
    }
    const clineDirExists = fs.existsSync(path.join(home, '.cline'));

    // LM Studio + Modelos GGUF
    const lmStudioPaths = this.findExistingPaths([
      path.join(localApp, 'LM-Studio', 'LM Studio.exe'),
      path.join(localApp, 'Programs', 'LM Studio', 'LM Studio.exe'),
      'D:\\lmstudio',
      'D:\\Lmstudio1'
    ]);

    const ggufSearchRoots = [];
    for (const d of drives) {
      ggufSearchRoots.push(
        path.join(d, 'ZIRO_AI'),
        path.join(d, 'modelos lm studio'),
        path.join(d, 'lmstudio'),
        path.join(d, 'Lmstudio1'),
        path.join(d, 'ComfyUI', 'models'),
        path.join(d, 'Models')
      );
    }
    ggufSearchRoots.push(
      path.join(home, '.cache', 'lm-studio', 'models'),
      path.join(home, '.lmstudio', 'models')
    );
    const ggufModels = this.scanFilesByExtension(ggufSearchRoots, '.gguf', 5, 60);

    // ComfyUI, Ciro Studio, Unreal Engine 5.8, Android SDK, Gradle
    const comfyPaths = this.findExistingPaths(
      drives.flatMap((d) => [path.join(d, 'ComfyUI'), path.join(d, 'ZIRO_AI', 'ComfyUI')]).concat([path.join(localApp, 'Programs', 'ComfyUI')])
    );
    const ciroPaths = this.findExistingPaths(
      drives.flatMap((d) => [path.join(d, 'CIRO_MASTER'), path.join(d, 'ZiroStudio'), path.join(d, 'CiroStudio'), path.join(d, 'ZIRO_FIGHTER_STUDIO')])
    );
    const uePaths = this.findExistingPaths([
      'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
      'D:\\UnrealEngine\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
      'E:\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe'
    ]);
    const androidSdkPaths = this.findExistingPaths([
      process.env.ANDROID_HOME || '',
      path.join(localApp, 'Android', 'Sdk')
    ]);
    const gradlePaths = this.findExistingPaths([
      'D:\\gradle-9.9.1-bin\\gradle-9.9.1\\bin\\gradle.bat',
      path.join(home, '.gradle')
    ]);

    // Plugins Unreal encontrados
    const pluginRoots = [];
    for (const d of drives) {
      pluginRoots.push(path.join(d, 'legolas-ai-v1.0'), path.join(d, 'Proyecto Unreal'), path.join(d, 'Unreal Juegos'), path.join(d, 'ZIRO_PROYECTOS'));
    }
    const uplugins = this.scanFilesByExtension(pluginRoots, '.uplugin', 4, 40);
    const venvs = this.findVenvs(drives);

    const tools = [
      {
        id: 'python',
        name: 'Python',
        installed: pyRes.ok,
        version: pyRes.ok ? (pyRes.stdout || pyRes.stderr) : 'No detectado',
        path: pyRes.ok ? 'PATH del sistema' : '',
        reusable: pyRes.ok
      },
      {
        id: 'pytorch_cuda',
        name: 'PyTorch & CUDA',
        installed: torchRes.ok || gpuRes.ok,
        version: torchRes.ok ? `PyTorch ${torchRes.stdout}` : (gpuRes.ok ? `GPU: ${gpuRes.stdout}` : 'No detectado'),
        path: gpuRes.ok ? gpuRes.stdout : '',
        reusable: torchRes.ok || gpuRes.ok
      },
      {
        id: 'vscode',
        name: 'Visual Studio Code / Code',
        installed: vscodePaths.length > 0,
        version: vscodePaths.length > 0 ? 'Instalado' : 'No detectado',
        path: vscodePaths[0] || '',
        reusable: vscodePaths.length > 0
      },
      {
        id: 'cline',
        name: 'Cline (VS Code / CLI)',
        installed: clineExts.length > 0 || clineDirExists,
        version: clineExts[0] || (clineDirExists ? '.cline activo' : 'No detectado'),
        path: clineExts.length > 0 ? path.join(vscodeExtDir, clineExts[0]) : (clineDirExists ? path.join(home, '.cline') : ''),
        reusable: clineExts.length > 0 || clineDirExists
      },
      {
        id: 'lmstudio',
        name: 'LM Studio',
        installed: lmStudioPaths.length > 0 || ggufModels.length > 0,
        version: `${ggufModels.length} modelo(s) GGUF detectados`,
        path: lmStudioPaths[0] || (ggufModels[0] ? path.dirname(ggufModels[0].path) : ''),
        reusable: lmStudioPaths.length > 0 || ggufModels.length > 0
      },
      {
        id: 'comfyui',
        name: 'ComfyUI',
        installed: comfyPaths.length > 0,
        version: comfyPaths.length > 0 ? 'Instalado' : 'No detectado',
        path: comfyPaths[0] || '',
        reusable: comfyPaths.length > 0
      },
      {
        id: 'ciro',
        name: 'Ciro Studio',
        installed: ciroPaths.length > 0,
        version: ciroPaths.length > 0 ? 'Detectado' : 'No detectado',
        path: ciroPaths[0] || '',
        reusable: ciroPaths.length > 0
      },
      {
        id: 'git',
        name: 'Git',
        installed: gitRes.ok,
        version: gitRes.ok ? gitRes.stdout : 'No detectado',
        path: gitRes.ok ? 'PATH' : '',
        reusable: gitRes.ok
      },
      {
        id: 'nodejs',
        name: 'Node.js & npm',
        installed: nodeRes.ok,
        version: nodeRes.ok ? `Node ${nodeRes.stdout} / npm ${npmRes.stdout}` : 'No detectado',
        path: nodeRes.ok ? process.execPath : '',
        reusable: nodeRes.ok
      },
      {
        id: 'android_sdk',
        name: 'Android SDK & Gradle',
        installed: androidSdkPaths.length > 0 || gradlePaths.length > 0,
        version: adbRes.ok ? 'ADB & SDK Listos' : (gradleRes.ok ? 'Gradle listo' : 'Parcial'),
        path: androidSdkPaths[0] || gradlePaths[0] || '',
        reusable: androidSdkPaths.length > 0 || gradlePaths.length > 0
      },
      {
        id: 'unreal_58',
        name: 'Unreal Engine 5.8',
        installed: uePaths.length > 0,
        version: uePaths.length > 0 ? 'UE 5.8 Editor' : 'No detectado',
        path: uePaths[0] || '',
        reusable: uePaths.length > 0
      }
    ];

    const missing = tools.filter((t) => !t.installed).map((t) => t.name);
    const recommendation = missing.length === 0
      ? `Todas las herramientas compatibles ya existen en tu equipo y serán reutilizadas sin duplicar instalaciones. Nuevas descargas irán a ${this.preferredInstallRoot}.`
      : `Se reutilizarán ${tools.length - missing.length} herramientas ya instaladas. Pendientes sugeridas para instalar en ${this.preferredInstallRoot} (previa autorización): ${missing.join(', ')}.`;

    this.lastScanReport = {
      success: true,
      scannedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startMs,
      drives,
      preferredInstallRoot: this.preferredInstallRoot,
      tools,
      ggufModels,
      uplugins,
      venvs,
      recommendation
    };

    return this.lastScanReport;
  }
}

module.exports = new SystemScannerService();
