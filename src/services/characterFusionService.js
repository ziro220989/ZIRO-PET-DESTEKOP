const fs = require('fs');
const path = require('path');
const unrealService = require('./unrealService');
const projectManagerService = require('./projectManagerService');

/**
 * ZIRO CHARACTER FUSION
 * Combina y adapta habilidades de personajes de distintos proyectos o paquetes Fab
 * hacia un Personaje Principal (A) sin modificar los proyectos fuente originales.
 */
class CharacterFusionService {
  constructor() {
    this.abilityCatalog = [
      { id: 'run', name: 'Correr / Sprint', category: 'Locomotion', requiresRetarget: true },
      { id: 'climb', name: 'Trepar / Vaulting', category: 'Traversal', requiresRetarget: true },
      { id: 'ladder', name: 'Subir Escaleras', category: 'Traversal', requiresRetarget: true },
      { id: 'shoot', name: 'Disparar (Rifle/Pistola)', category: 'Combat', requiresRetarget: true },
      { id: 'reload', name: 'Recargar Arma', category: 'Combat', requiresRetarget: true },
      { id: 'dodge', name: 'Esquivar / Roll', category: 'Combat', requiresRetarget: true },
      { id: 'grenade', name: 'Lanzar Granadas', category: 'Combat', requiresRetarget: true },
      { id: 'melee', name: 'Combate Cuerpo a Cuerpo', category: 'Combat', requiresRetarget: true },
      { id: 'open_door', name: 'Abrir Puertas / Interactuar', category: 'Interaction', requiresRetarget: true }
    ];
  }

  getAbilityCatalog() {
    return this.abilityCatalog;
  }

  /**
   * Escanea Skeletal Meshes, AnimBlueprints, AnimMontages y Character Blueprints
   * dentro de un proyecto (sin modificar nada en el proyecto fuente).
   */
  scanProjectCharacters(uprojectPath) {
    if (!uprojectPath || !fs.existsSync(uprojectPath)) {
      return { success: false, characters: [], animations: [], blueprints: [], error: 'Ruta de proyecto no válida.' };
    }

    const projectDir = path.dirname(uprojectPath);
    const contentDir = path.join(projectDir, 'Content');
    const characters = [];
    const animations = [];
    const blueprints = [];
    const ikRigs = [];

    const walk = (dir, depth) => {
      if (depth > 5 || (characters.length + animations.length + blueprints.length) > 350) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }

      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full, depth + 1);
        } else if (ent.name.toLowerCase().endsWith('.uasset')) {
          const rel = path.relative(contentDir, full).replace(/\\/g, '/').replace(/\.uasset$/i, '');
          const name = path.basename(rel);
          const low = rel.toLowerCase();
          const gamePath = `/Game/${rel}.${name}`;

          if (name.startsWith('SKM_') || name.startsWith('SK_') || low.includes('character') || low.includes('skeletal')) {
            characters.push({ name, path: gamePath, diskPath: full, skeletonHint: low.includes('ue5') ? 'UE5_Manny' : (low.includes('ue4') ? 'UE4_Mannequin' : 'Custom_Biped') });
          } else if (name.startsWith('IK_') || name.startsWith('RTG_') || low.includes('retarget')) {
            ikRigs.push({ name, path: gamePath });
          } else if (name.startsWith('AM_') || name.startsWith('AS_') || name.startsWith('ABP_') || low.includes('anim') || low.includes('montage')) {
            animations.push({ name, path: gamePath });
          } else if (name.startsWith('BP_') || low.includes('ability') || low.includes('ga_') || low.includes('component')) {
            blueprints.push({ name, path: gamePath });
          }
        }
      }
    };

    if (fs.existsSync(contentDir)) walk(contentDir, 0);

    return {
      success: true,
      projectName: path.basename(uprojectPath, '.uproject'),
      projectDir,
      characters: characters.slice(0, 80),
      animations: animations.slice(0, 120),
      blueprints: blueprints.slice(0, 100),
      ikRigs: ikRigs.slice(0, 40)
    };
  }

  /**
   * Analiza compatibilidad e incompatibilidades entre Personaje Principal (A) y Fuentes (B).
   */
  analyzeFusionCompatibility({ targetProject, primaryCharacter, secondarySources = [], selectedAbilities = [] }) {
    const check = projectManagerService.validateTargetProject(targetProject);
    if (!check.valid) return { success: false, compatible: false, issues: [check.error], warnings: [], steps: [], error: check.error };

    const issues = [];
    const warnings = [];
    const steps = [];

    if (!primaryCharacter || !primaryCharacter.name) {
      issues.push('Debes seleccionar un Personaje Principal (A) como base (ej. Adrien Cross).');
    }
    if (!secondarySources || secondarySources.length === 0) {
      issues.push('Debes seleccionar al menos un Personaje o Pack Secundario (B) como fuente de habilidades.');
    }
    if (!selectedAbilities || selectedAbilities.length === 0) {
      issues.push('Debes seleccionar al menos una habilidad a transferir.');
    }

    const primarySkel = primaryCharacter?.skeletonHint || 'UE5_Manny';
    for (const src of secondarySources) {
      const srcSkel = src.skeletonHint || 'UE5_Manny';
      if (srcSkel !== primarySkel) {
        warnings.push(`Diferencia de esqueleto entre '${primaryCharacter?.name}' (${primarySkel}) y '${src.name}' (${srcSkel}): se requiere IK Rig + IK Retargeter.`);
      }
      if (srcSkel === 'Custom_Quadruped' || (src.name || '').toLowerCase().includes('monster')) {
        issues.push(`Incompatibilidad anatómica con '${src.name}': las proporciones no bipedales pueden requerir ajuste manual.`);
      }
    }

    for (const abId of selectedAbilities) {
      const ab = this.abilityCatalog.find((a) => a.id === abId);
      if (ab) {
        steps.push({
          ability: ab.name,
          action: `Crear variante retargeteada en /Game/ZIRO/CharacterFusion/${(primaryCharacter?.name || 'Hero').replace(/\W+/g, '_')}/${ab.id} (sin modificar proyecto fuente).`,
          usesIKRetargeter: true
        });
      }
    }

    return {
      success: issues.length === 0,
      compatible: issues.length === 0,
      issues,
      warnings,
      requiresIKRetargeter: warnings.length > 0 || steps.length > 0,
      steps,
      preservePrimaryIdentity: true,
      sourceProjectsUntouched: true
    };
  }

  /**
   * Ejecuta la fusión segura en el proyecto destino activo (solo cuando el usuario confirma).
   */
  async executeFusionPlan(payload = {}) {
    const analysis = this.analyzeFusionCompatibility(payload);
    if (!analysis.compatible) {
      return {
        success: false,
        message: `Conflictos detectados: ${analysis.issues.join(' | ')}`,
        analysis
      };
    }

    const projectDir = path.dirname(payload.targetProject);
    const outDir = path.join(projectDir, 'Saved', 'ZiroAI', 'CharacterFusion');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const manifestPath = path.join(outDir, `fusion_${Date.now()}.json`);
    const manifest = {
      createdAt: new Date().toISOString(),
      targetProject: payload.targetProject,
      primaryCharacter: payload.primaryCharacter,
      secondarySources: payload.secondarySources,
      selectedAbilities: payload.selectedAbilities,
      useIKRetargeter: Boolean(payload.useIKRetargeter),
      steps: analysis.steps,
      warnings: analysis.warnings
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Despachar orden al plugin ZIROAI en el proyecto activo si Unreal está corriendo
    let ueRes = null;
    try {
      ueRes = await unrealService.executeZiroPluginCommand({
        tool: 'fusion_execute_plan',
        args: {
          primary_character: payload.primaryCharacter?.name || 'Adrien Cross',
          primary_skeleton: payload.primaryCharacter?.skeletonHint || 'UE5_Manny',
          abilities: payload.selectedAbilities || [],
          use_ik_retargeter: Boolean(payload.useIKRetargeter),
          manifest_path: manifestPath
        },
        voice_prompt: `Prepara fusión de personaje ${payload.primaryCharacter?.name} con habilidades [${(payload.selectedAbilities || []).join(', ')}] usando IK Retargeter.`
      }, 2500);
    } catch (e) {}

    return {
      success: true,
      manifestPath,
      warnings: analysis.warnings,
      stepsCount: analysis.steps.length,
      unrealSynced: Boolean(ueRes && ueRes.confirmedByEngine),
      message: `✓ Plan de fusión generado en ${manifestPath} (${analysis.steps.length} habilidades listas para IK Retargeter sin tocar proyectos fuente).`
    };
  }
}

module.exports = new CharacterFusionService();
