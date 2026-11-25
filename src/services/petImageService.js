const fs = require('fs');
const path = require('path');
const bgRemovalService = require('./bgRemovalService');
const comfyService = require('./comfyService');

class PetImageService {
  constructor() {
    this.customPetsDir = null;
  }

  ensureDir() {
    if (!this.customPetsDir) {
      let userData = '';
      try {
        const { app } = require('electron');
        userData = app.getPath('userData');
      } catch (e) {
        userData = path.join(process.cwd(), '.user_data');
      }
      this.customPetsDir = path.join(userData, 'custom_pets');
    }
    if (!fs.existsSync(this.customPetsDir)) {
      fs.mkdirSync(this.customPetsDir, { recursive: true });
    }
    return this.customPetsDir;
  }

  getMetaFilePath() {
    this.ensureDir();
    return path.join(this.customPetsDir, 'pets_meta.json');
  }

  loadMetaMap() {
    try {
      const p = this.getMetaFilePath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {}
    return {};
  }

  saveMetaEntry(id, info) {
    try {
      const map = this.loadMetaMap();
      map[id] = { ...(map[id] || {}), ...info };
      fs.writeFileSync(this.getMetaFilePath(), JSON.stringify(map, null, 2), 'utf8');
    } catch (e) {}
  }

  /**
   * Save an uploaded photo (base64 data URL) as a custom pet with AUTOMATIC BACKGROUND REMOVAL
   */
  async savePhotoAsPet(dataUrl, petName = 'Mi Mascota Anime 3D') {
    this.ensureDir();
    const id = 'pet_photo_' + Date.now();
    const matches = dataUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);

    let ext = 'png';
    let base64Data = dataUrl;
    if (matches && matches.length === 3) {
      ext = matches[1].replace('jpeg', 'jpg');
      base64Data = matches[2];
    } else if (dataUrl.includes(',')) {
      base64Data = dataUrl.split(',')[1];
    }

    const rawFilename = `${id}_raw.${ext}`;
    const rawFilePath = path.join(this.customPetsDir, rawFilename);
    const finalFilename = `${id}.png`;
    const finalFilePath = path.join(this.customPetsDir, finalFilename);

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(rawFilePath, buffer);

    // Automatic AI Background Removal: keeps ONLY the character transparent
    try {
      const removed = await bgRemovalService.removeBackground(rawFilePath, finalFilePath);
      if (!removed && !fs.existsSync(finalFilePath)) {
        await fs.promises.copyFile(rawFilePath, finalFilePath);
      }
      fs.unlink(rawFilePath, () => {});
    } catch (e) {
      console.warn('Background removal error, using raw image:', e.message);
      if (!fs.existsSync(finalFilePath)) {
        await fs.promises.copyFile(rawFilePath, finalFilePath);
      }
    }

    let finalDataUrl = dataUrl;
    try {
      const finalBuffer = await fs.promises.readFile(finalFilePath);
      finalDataUrl = `data:image/png;base64,${finalBuffer.toString('base64')}`;
    } catch (e) {
      console.warn('Could not read final image for dataUrl:', e.message);
    }

    this.saveMetaEntry(id, {
      name: petName,
      type: 'custom_photo',
      createdAt: Date.now()
    });

    return {
      id: id,
      name: petName,
      type: 'custom_photo',
      is3D: true,
      filePath: finalFilePath,
      src: finalDataUrl,
      dataUrl: finalDataUrl
    };
  }

  /**
   * Generate high-level anime pet image from prompt using Comfy Desktop (Z-Image-Turbo)
   * with automatic background removal, falling back to cloud only if needed.
   */
  async generatePetFromPrompt(userPrompt, petName = 'Mascota Anime Comfy', style = 'anime', options = {}) {
    this.ensureDir();
    const id = 'pet_comfy_' + Date.now();
    const useComfy = options.useComfy !== false;

    let buffer = null;
    let engineUsed = 'comfyui';
    let comfyFile = null;

    if (useComfy) {
      try {
        const comfyRes = await comfyService.generateCharacterBuffer(userPrompt, style, {
          openOnScreen: options.openOnScreen !== false,
          seed: options.seed
        });
        buffer = comfyRes.buffer;
        comfyFile = comfyRes.filename;
        engineUsed = 'comfyui';
      } catch (comfyErr) {
        console.warn('[PetImageService] Comfy Desktop generation warning:', comfyErr.message);
        if (options.requireComfy) {
          throw comfyErr;
        }
      }
    }

    // Fallback to cloud generator if Comfy Desktop was disabled or unreachable
    if (!buffer) {
      engineUsed = 'cloud';
      let enhancedPrompt = userPrompt.trim();
      if (style === 'cyberpunk') {
        enhancedPrompt = `masterpiece anime character, isolated full body character, cyberpunk anime style, glowing neon green accents, solid white background, clean sticker cutout, ${enhancedPrompt}`;
      } else if (style === 'pixel') {
        enhancedPrompt = `masterpiece anime pixel sprite, isolated full body character, HD-2D pixel art anime style, solid white background, ${enhancedPrompt}`;
      } else if (style === 'chibi') {
        enhancedPrompt = `adorable chibi anime mascot character, isolated full body single character, Nendoroid anime render, solid white background, ${enhancedPrompt}`;
      } else {
        enhancedPrompt = `masterpiece anime character, ufotable style cel shading, expressive eyes, isolated full body single character on plain white background, ${enhancedPrompt}`;
      }

      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Error en el generador de imágenes: HTTP ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const rawFilename = `${id}_raw.png`;
    const rawFilePath = path.join(this.customPetsDir, rawFilename);
    const finalFilename = `${id}.png`;
    const finalFilePath = path.join(this.customPetsDir, finalFilename);

    await fs.promises.writeFile(rawFilePath, buffer);

    // Strip background with rembg so only the anime character is visible in 3D
    try {
      const removed = await bgRemovalService.removeBackground(rawFilePath, finalFilePath);
      if (!removed && !fs.existsSync(finalFilePath)) {
        await fs.promises.copyFile(rawFilePath, finalFilePath);
      }
      fs.unlink(rawFilePath, () => {});
    } catch (e) {
      if (!fs.existsSync(finalFilePath)) {
        await fs.promises.copyFile(rawFilePath, finalFilePath);
      }
    }

    let finalDataUrl = '';
    try {
      const finalBuffer = await fs.promises.readFile(finalFilePath);
      finalDataUrl = `data:image/png;base64,${finalBuffer.toString('base64')}`;
    } catch (e) {}

    this.saveMetaEntry(id, {
      name: petName,
      type: engineUsed === 'comfyui' ? 'comfy_anime' : 'custom_ai',
      engine: engineUsed,
      style,
      prompt: userPrompt,
      comfyFile,
      createdAt: Date.now()
    });

    return {
      id: id,
      name: petName,
      type: engineUsed === 'comfyui' ? 'comfy_anime' : 'custom_ai',
      engine: engineUsed,
      style: style,
      is3D: true,
      prompt: userPrompt,
      comfyFile: comfyFile,
      filePath: finalFilePath,
      src: finalDataUrl,
      dataUrl: finalDataUrl
    };
  }

  /**
   * List custom pets from disk
   */
  async listCustomPets() {
    this.ensureDir();
    const metaMap = this.loadMetaMap();
    try {
      const files = await fs.promises.readdir(this.customPetsDir);
      const pets = [];
      for (const file of files) {
        if (/\.(png|jpg|jpeg|webp|svg)$/i.test(file) && !file.includes('_raw') && !file.startsWith('test_')) {
          const filePath = path.join(this.customPetsDir, file);
          const id = path.parse(file).name;
          let dataUrl = `file://${filePath.replace(/\\/g, '/')}`;
          try {
            const buf = await fs.promises.readFile(filePath);
            dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
          } catch (e) {}

          const meta = metaMap[id] || {};
          let displayName = meta.name || 'Mascota Anime 3D';
          if (!meta.name) {
            if (id.startsWith('pet_comfy')) displayName = 'Anime ComfyUI 3D';
            else if (id.startsWith('pet_ai')) displayName = 'Mascota IA 3D';
            else if (id.includes('gohan') || id === 'pet_photo_1793989720531') displayName = 'Gohan Anime 3D';
            else if (id === 'pet_photo_1794308379820' || id === 'pet_photo_1794308189933') displayName = 'Pikachu Anime 3D';
          }

          pets.push({
            id: id,
            name: displayName,
            type: meta.type || (id.startsWith('pet_comfy') ? 'comfy_anime' : id.startsWith('pet_ai') ? 'custom_ai' : 'custom_photo'),
            engine: meta.engine || (id.startsWith('pet_comfy') ? 'comfyui' : 'photo'),
            is3D: true,
            filePath: filePath,
            src: dataUrl,
            dataUrl: dataUrl
          });
        }
      }
      return pets;
    } catch (e) {
      console.error('Error listando mascotas custom:', e);
      return [];
    }
  }

  async deleteCustomPet(id) {
    this.ensureDir();
    try {
      const files = await fs.promises.readdir(this.customPetsDir);
      for (const file of files) {
        if (file.startsWith(id)) {
          await fs.promises.unlink(path.join(this.customPetsDir, file));
          return true;
        }
      }
    } catch (e) {
      console.error('Error eliminando mascota:', e);
    }
    return false;
  }
}

module.exports = new PetImageService();
