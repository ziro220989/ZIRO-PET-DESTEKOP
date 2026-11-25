const fs = require('fs');
const path = require('path');

/**
 * ZIRO PROJECT MANAGER
 * Administración segura de proyectos .uproject de Unreal Engine en cualquier disco (C:, D:, E:, F:...).
 * Corrige definitivamente el uso involuntario de ZiroHost como destino automático.
 */
class ProjectManagerService {
  constructor() {
    this.scannedProjects = [];
  }

  /**
   * Busca recursivamente archivos .uproject dentro de las carpetas raíz configuradas.
   */
  scanRootFolders(rootFolders = []) {
    const found = [];
    const seen = new Set();
    const skipDirs = new Set(['Intermediate', 'DerivedDataCache', 'Saved', 'Binaries', 'node_modules', '.git', '$Recycle.Bin']);

    const walk = (dir, depth) => {
      if (depth > 4 || found.length >= 80) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const ent of entries) {
        if (found.length >= 80) break;
        if (ent.isDirectory()) {
          if (!skipDirs.has(ent.name)) {
            walk(path.join(dir, ent.name), depth + 1);
          }
        } else if (ent.name.toLowerCase().endsWith('.uproject')) {
          const full = path.join(dir, ent.name);
          const key = full.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            found.push(this.inspectUproject(full));
          }
        }
      }
    };

    for (const root of rootFolders) {
      if (root && fs.existsSync(root)) {
        walk(root, 0);
      }
    }

    this.scannedProjects = found;
    return found;
  }

  inspectUproject(uprojectPath) {
    const exists = Boolean(uprojectPath && fs.existsSync(uprojectPath));
    const projectDir = path.dirname(uprojectPath || '');
    const name = path.basename(uprojectPath || 'Desconocido', '.uproject');
    let unrealVersion = 'Desconocida';
    let modifiedAt = '';
    let hasZiroPlugin = false;
    let maps = [];

    if (exists) {
      try {
        const stat = fs.statSync(uprojectPath);
        modifiedAt = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
        const raw = fs.readFileSync(uprojectPath, 'utf8');
        const json = JSON.parse(raw);
        unrealVersion = json.EngineAssociation || 'UE 5.x';
        const pluginExists = fs.existsSync(path.join(projectDir, 'Plugins', 'ZIROAI', 'ZIROAI.uplugin'));
        const pluginEnabled = Array.isArray(json.Plugins) && json.Plugins.some((p) => p && p.Name === 'ZIROAI' && p.Enabled !== false);
        hasZiroPlugin = pluginExists && pluginEnabled;
      } catch (e) {}

      // Buscar mapas (.umap) dentro de Content/
      const contentDir = path.join(projectDir, 'Content');
      const walkMaps = (d, depth) => {
        if (depth > 4 || maps.length >= 40) return;
        try {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, ent.name);
            if (ent.isDirectory()) walkMaps(full, depth + 1);
            else if (ent.name.toLowerCase().endsWith('.umap')) {
              const rel = path.relative(contentDir, full).replace(/\\/g, '/').replace(/\.umap$/i, '');
              maps.push({ name: path.basename(rel), path: `/Game/${rel}`, fullPath: full });
            }
          }
        } catch (e) {}
      };
      if (fs.existsSync(contentDir)) walkMaps(contentDir, 0);
    }

    return {
      name,
      path: uprojectPath,
      dir: projectDir,
      unrealVersion,
      modifiedAt,
      exists,
      status: !exists ? 'Ruta no encontrada' : (hasZiroPlugin ? 'Listo (ZIROAI activo)' : 'Válido (Listo para vincular)'),
      hasZiroPlugin,
      isZiroHost: name.toLowerCase() === 'zirohost',
      maps
    };
  }

  /**
   * Valida estrictamente que el proyecto activo siga existiendo.
   * Nunca retorna ZiroHost como respaldo silencioso si el usuario eligió otro proyecto.
   */
  validateTargetProject(activeProjectPath) {
    if (!activeProjectPath) {
      return {
        valid: false,
        error: 'No hay ningún proyecto de destino seleccionado. Seleccioná tu proyecto .uproject en ZIRO Project Manager.'
      };
    }
    if (!fs.existsSync(activeProjectPath)) {
      return {
        valid: false,
        missingPath: activeProjectPath,
        error: `La ruta del proyecto seleccionado dejó de existir: ${activeProjectPath}. Seleccioná una nueva ruta válida antes de continuar.`
      };
    }
    return { valid: true, info: this.inspectUproject(activeProjectPath) };
  }

  /**
   * Copia de seguridad antes de modificar recursos en el proyecto de destino.
   */
  createSafeBackup(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const dir = path.dirname(filePath);
    const bakDir = path.join(dir, '_ziro_backups');
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dst = path.join(bakDir, `${path.basename(filePath)}.${stamp}.bak`);
    fs.copyFileSync(filePath, dst);
    return dst;
  }
}

module.exports = new ProjectManagerService();
