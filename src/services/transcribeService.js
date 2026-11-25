const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getPythonExecutable } = require('./pythonBridge');
const ttsService = require('./ttsService');

class TranscribeService {
  constructor() {
    this.cacheDir = null;
    this.logFile = null;
  }

  ensureDir() {
    if (!this.cacheDir) {
      let userData = '';
      try {
        const { app } = require('electron');
        userData = app.getPath('userData');
      } catch (e) {
        userData = path.join(process.cwd(), '.user_data');
      }
      this.cacheDir = path.join(userData, 'speech_cache');
      this.logFile = path.join(userData, 'speech_debug.log');
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    return this.cacheDir;
  }

  log(msg) {
    try {
      this.ensureDir();
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      fs.appendFileSync(this.logFile, line, 'utf8');
      console.log(msg);
    } catch (e) {}
  }

  ensureRunnerScript() {
    this.ensureDir();
    const runnerPath = path.join(this.cacheDir, 'transcribe_runner.py');
    const pyCode = `# -*- coding: utf-8 -*-
import sys
import os
import speech_recognition as sr

def main():
    if len(sys.argv) < 2:
        print("")
        return

    audio_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "es-ES"

    if not os.path.exists(audio_path):
        sys.stderr.write(f"AUDIO_FILE_NOT_FOUND: {audio_path}\\n")
        print("")
        return

    r = sr.Recognizer()
    r.dynamic_energy_threshold = False
    r.energy_threshold = 30

    try:
        with sr.AudioFile(audio_path) as source:
            audio = r.record(source)

        candidates = [lang]
        for extra in ["es-AR", "es-ES", "es-MX", "es-CO", "es"]:
            if extra not in candidates:
                candidates.append(extra)

        recognized_text = ""
        last_error = ""

        for l in candidates:
            try:
                text = r.recognize_google(audio, language=l)
                if text and text.strip():
                    recognized_text = text.strip()
                    break
            except sr.UnknownValueError:
                last_error = "UnknownValueError"
                continue
            except Exception as e:
                last_error = str(e)
                sys.stderr.write(f"STT_LANG_ERR ({l}): {e}\\n")
                continue

        if not recognized_text and last_error:
            sys.stderr.write(f"STT_LAST_STATUS: {last_error}\\n")

        print(recognized_text)
    except Exception as e:
        sys.stderr.write(f"STT_FATAL_ERR: {e}\\n")
        print("")

if __name__ == "__main__":
    main()
`;
    fs.writeFileSync(runnerPath, pyCode, 'utf8');
    return runnerPath;
  }

  /**
   * Transcribe a WAV buffer received from the renderer
   */
  async transcribeAudio(buffer, language = 'es-ES', config = {}) {
    this.ensureDir();
    const runnerScript = this.ensureRunnerScript();

    const timestamp = Date.now();
    const tempWav = path.join(this.cacheDir, `input_${timestamp}.wav`);
    await fs.promises.writeFile(tempWav, buffer);

    this.log(`Iniciando transcripción: ${buffer.length} bytes, idioma=${language}`);

    try {
      // 1. If Groq API Key is available, use ultra-fast Whisper (~200ms)
      if (config.apiKey && (config.mode === 'cloud-groq' || config.cloudProvider === 'groq')) {
        try {
          const text = await this.transcribeWithGroq(tempWav, config.apiKey, language);
          if (text) {
            this.log(`Groq Whisper transcrito con éxito: "${text}"`);
            this.safeUnlink(tempWav);
            return text;
          }
        } catch (e) {
          this.log(`Groq Whisper falló, recurriendo a STT Python: ${e.message}`);
        }
      }

      // 2. Persistent In-Memory Python Daemon STT (0ms cold-spawn)
      const daemonStt = await ttsService.transcribeViaDaemon(tempWav, language || 'es-AR');
      if (daemonStt && typeof daemonStt.text === 'string' && daemonStt.text.trim()) {
        this.log(`Daemon STT transcrito en ${daemonStt.transcribeMs}ms: "${daemonStt.text}"`);
        this.safeUnlink(tempWav);
        return daemonStt.text.trim();
      }

      // 3. Fallback Python STT Runner with direct python executable resolution
      const text = await this.runPythonTranscriber(runnerScript, tempWav, language);
      this.log(`Resultado STT Python: "${text}"`);
      this.safeUnlink(tempWav);
      return text;
    } catch (err) {
      this.safeUnlink(tempWav);
      this.log(`Error general en transcripción: ${err.message}`);
      return '';
    }
  }

  runPythonTranscriber(scriptPath, filePath, language) {
    return new Promise((resolve) => {
      const pythonExe = getPythonExecutable();
      const args = [scriptPath, filePath, language || 'es-ES'];
      this.log(`Ejecutando STT con binario: "${pythonExe}"`);

      const child = spawn(pythonExe, args, {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        stdout += d.toString('utf8');
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString('utf8');
      });

      child.on('close', (code) => {
        if (stderr) {
          this.log(`[STT Python Stderr]: ${stderr.trim()}`);
        }
        resolve(stdout.trim());
      });

      child.on('error', (err) => {
        this.log(`Error al iniciar proceso Python STT: ${err.message}`);
        resolve('');
      });

      // 12 second safety timeout
      setTimeout(() => {
        try {
          child.kill();
        } catch (e) {}
        resolve(stdout.trim());
      }, 12000);
    });
  }

  async transcribeWithGroq(filePath, apiKey, language = 'es') {
    const fileBuffer = await fs.promises.readFile(filePath);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', language.split('-')[0]);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      throw new Error(`Groq Whisper error HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.text ? data.text.trim() : '';
  }

  safeUnlink(p) {
    fs.unlink(p, () => {});
  }
}

module.exports = new TranscribeService();
