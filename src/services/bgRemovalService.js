const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getPythonExecutable } = require('./pythonBridge');

class BgRemovalService {
  constructor() {
    this.cacheDir = null;
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
      this.cacheDir = path.join(userData, 'bg_cache');
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    return this.cacheDir;
  }

  ensureScript() {
    this.ensureDir();
    const scriptPath = path.join(this.cacheDir, 'remove_bg_runner.py');
    const pyCode = `# -*- coding: utf-8 -*-
import sys
import os
# Force CPUExecutionProvider so rembg never competes with ComfyUI Desktop for RTX GPU VRAM
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
from PIL import Image, ImageFilter

def clean_alpha_and_crop(im, output_path):
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 22:
                pixels[x, y] = (0, 0, 0, 0)
            elif a > 240:
                pixels[x, y] = (r, g, b, 255)
    bbox = im.getbbox()
    if bbox:
        pad = int(min(w, h) * 0.03)
        crop_box = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad)
        )
        im = im.crop(crop_box)
    im.save(output_path, 'PNG')

def fallback_corner_floodfill(input_path, output_path):
    im = Image.open(input_path).convert("RGBA")
    w, h = im.size
    pixels = im.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    bg_samples = [pixels[cx, cy][:3] for cx, cy in corners]
    br = sum(c[0] for c in bg_samples) // 4
    bg = sum(c[1] for c in bg_samples) // 4
    bb = sum(c[2] for c in bg_samples) // 4
    visited = set()
    stack = list(corners)
    tol = 42
    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        if abs(r - br) <= tol and abs(g - bg) <= tol and abs(b - bb) <= tol:
            pixels[x, y] = (0, 0, 0, 0)
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
    clean_alpha_and_crop(im, output_path)

def process_image(input_path, output_path):
    try:
        from rembg import remove, new_session
        orig = Image.open(input_path).convert("RGBA")
        ow, oh = orig.size
        work_im = orig
        if max(ow, oh) > 768:
            scale = 768.0 / max(ow, oh)
            work_im = orig.resize((int(ow * scale), int(oh * scale)), Image.Resampling.LANCZOS)
        session = new_session("u2net", providers=["CPUExecutionProvider"])
        cutout = remove(work_im, session=session)
        if work_im.size != orig.size:
            alpha = cutout.split()[3].resize((ow, oh), Image.Resampling.LANCZOS)
            orig.putalpha(alpha)
            clean_alpha_and_crop(orig, output_path)
        else:
            clean_alpha_and_crop(cutout, output_path)
        print("OK")
    except Exception as e:
        sys.stderr.write(f"BG_REMOVAL_ERR: {e}\\n")
        try:
            fallback_corner_floodfill(input_path, output_path)
            print("FALLBACK_OK")
        except Exception as e2:
            sys.stderr.write(f"FALLBACK_ERR: {e2}\\n")
            print("ERR")

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        process_image(sys.argv[1], sys.argv[2])
    else:
        print("MISSING_ARGS")
`;
    fs.writeFileSync(scriptPath, pyCode, 'utf8');
    return scriptPath;
  }

  async removeBackground(inputPath, outputPath) {
    this.ensureDir();
    const scriptPath = this.ensureScript();
    const pythonExe = getPythonExecutable();

    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      const child = spawn(pythonExe, [scriptPath, inputPath, outputPath], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

      child.on('close', () => {
        if (stderr) console.log('[BG Removal]', stderr.trim());
        const ok = (stdout.includes('OK') || stdout.includes('FALLBACK_OK')) && fs.existsSync(outputPath);
        done(ok);
      });

      child.on('error', (err) => {
        console.error('Failed to spawn bg removal:', err);
        done(false);
      });

      // 120s timeout so rembg cold-start model loading completes cleanly
      setTimeout(() => {
        try { child.kill(); } catch (e) {}
        done(fs.existsSync(outputPath));
      }, 120000);
    });
  }
}

module.exports = new BgRemovalService();
