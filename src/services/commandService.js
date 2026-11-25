const { exec } = require('child_process');
const unrealService = require('./unrealService');
const comfyService = require('./comfyService');
const livekitService = require('./livekitService');
const architectureService = require('./architectureService');
const gamingVoiceService = require('./gamingVoiceService');
const webLookupService = require('./webLookupService');

let electronShell = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    electronShell = electron.shell;
  }
} catch (e) {
  // Not inside Electron runtime
}

async function openExternalSafe(url) {
  if (electronShell && typeof electronShell.openExternal === 'function') {
    return await electronShell.openExternal(url);
  } else {
    return new Promise((resolve) => {
      exec(`start "" "${url}"`, (err) => {
        resolve(!err);
      });
    });
  }
}

class CommandService {
  constructor() {
    this.customCommands = [];
  }

  setCustomCommands(commands) {
    if (Array.isArray(commands)) {
      this.customCommands = commands;
    }
  }

  normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[¿?¡!.,;:()]/g, '');
  }

  /**
   * Evaluates if text is a system command.
   * Returns { isCommand: boolean, message: string, actionType: string, detail?: string }
   */
  async processCommand(rawText) {
    let text = this.normalizeText(rawText);

    // 0. LiveKit Hands-Free Call Wake Word ("activar ziro" / "desactivar ziro")
    const wakeCheck = livekitService.evaluateWakeWord(text);
    if (wakeCheck.matched) {
      if (wakeCheck.type === 'wake') {
        gamingVoiceService.setPetSilentMode(false);
        return {
          isCommand: true,
          message: wakeCheck.reply,
          actionType: 'livekit_wake',
          wakeActivated: true
        };
      } else if (wakeCheck.type === 'sleep') {
        gamingVoiceService.setPetSilentMode(true);
        return {
          isCommand: true,
          message: wakeCheck.reply,
          actionType: 'livekit_sleep',
          wakeActivated: false
        };
      } else if (wakeCheck.type === 'wake_with_command' && wakeCheck.remainingText) {
        gamingVoiceService.setPetSilentMode(false);
        text = this.normalizeText(wakeCheck.remainingText);
      }
    }

    // 0B. ZIRO GAMING VOICE CONTROL (Steam & Counter-Strike 2)
    const cleanGamingText = text.replace(/\b(ziro|ciro|siro|giro|zero|xiro|por favor)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const gamingCommandMap = [
      {
        rx: /^(?:cancela|cancelar|deten|detener|aborta|abortar)\s+(?:la\s+)?(?:accion|comando|busqueda|gaming)/i,
        run: async () => gamingVoiceService.cancelCurrentAction(),
        actionType: 'gaming_cancel'
      },
      {
        rx: /\b(?:acepta(?:r)?(?:\s+(?:la\s+)?partida)?)\b/i,
        guard: () => /\bacepta\b|\baceptar\b/.test(cleanGamingText) && (cleanGamingText.includes('partida') || cleanGamingText === 'acepta' || cleanGamingText === 'aceptar' || cleanGamingText.includes('cs2') || cleanGamingText.includes('counter')),
        run: async () => gamingVoiceService.enqueueCommand('accept_match', { label: 'Aceptar partida CS2', source: 'voz' }),
        actionType: 'gaming_accept_match'
      },
      {
        rx: /\b(?:pon|inicia|busca|juega|jugar|abrir|abre)\b.*\b(?:premier)\b|\b(?:partida\s+de\s+premier)\b/i,
        run: async () => gamingVoiceService.enqueueCommand('start_premier', { label: 'Iniciar partida Premier CS2', source: 'voz' }),
        actionType: 'gaming_start_premier'
      },
      {
        rx: /\b(?:cierra|cerrar|termina|terminar|salir\s+de)\s+(?:el\s+)?(?:counter[\s-]*strike(?:\s*2)?|cs\s*2|csgo)\b/i,
        run: async () => gamingVoiceService.enqueueCommand('close_cs2', { label: 'Cerrar Counter-Strike 2', source: 'voz' }),
        actionType: 'gaming_close_cs2'
      },
      {
        rx: /\b(?:abre|abrir|inicia|iniciar|ejecuta|ejecutar|lanza|lanzar)\s+(?:el\s+)?(?:counter[\s-]*strike(?:\s*2)?|cs\s*2)\b/i,
        run: async () => gamingVoiceService.enqueueCommand('open_cs2', { label: 'Abrir Counter-Strike 2', source: 'voz' }),
        actionType: 'gaming_open_cs2'
      },
      {
        rx: /\b(?:cierra|cerrar|termina|terminar|apaga|apagar)\s+(?:el\s+)?steam\b/i,
        run: async () => gamingVoiceService.enqueueCommand('close_steam', { label: 'Cerrar Steam', source: 'voz' }),
        actionType: 'gaming_close_steam'
      },
      {
        rx: /\b(?:abre|abrir|inicia|iniciar|ejecuta|ejecutar)\s+(?:el\s+)?steam\b/i,
        run: async () => gamingVoiceService.enqueueCommand('open_steam', { label: 'Abrir Steam', source: 'voz' }),
        actionType: 'gaming_open_steam'
      }
    ];

    for (const gCmd of gamingCommandMap) {
      if (gCmd.rx.test(cleanGamingText) && (!gCmd.guard || gCmd.guard())) {
        const res = await gCmd.run();
        return {
          isCommand: true,
          message: res?.message || 'Acción gaming ejecutada.',
          actionType: gCmd.actionType,
          success: res?.success !== false
        };
      }
    }

    // 1. Check custom commands first
    for (const cmd of this.customCommands) {
      const trigger = this.normalizeText(cmd.trigger);
      if (trigger && text.includes(trigger)) {
        try {
          if (cmd.type === 'url') {
            await openExternalSafe(cmd.target);
            return {
              isCommand: true,
              message: `¡Listo! He abierto ${cmd.name || 'el enlace solicitado'}.`,
              actionType: 'open_url',
              target: cmd.target
            };
          } else {
            exec(`start "" "${cmd.target}"`, (err) => {
              if (err) console.error('Error ejecutando comando personalizado:', err);
            });
            return {
              isCommand: true,
              message: `Ejecutando ${cmd.name || 'el programa solicitado'}.`,
              actionType: 'exec_program',
              target: cmd.target
            };
          }
        } catch (e) {
          return {
            isCommand: true,
            message: `Hubo un inconveniente al abrir ${cmd.name || cmd.target}.`,
            actionType: 'error'
          };
        }
      }
    }

    // 1B. Pet UI Controls: Minimal Mode (Only Floating Character), Maximize HUD & Resize Commands
    // 1B.1. Minimize HUD: "ziro minimizate", "minimizate", "modo minimalista", "solo personaje", etc.
    if (
      text.includes('minimizate') ||
      text.includes('minimizar') ||
      text.includes('modo minimalista') ||
      text.includes('solo personaje') ||
      text.includes('solo la mascota') ||
      text.includes('solo el personaje') ||
      text.includes('oculta el menu') ||
      text.includes('ocultar el menu') ||
      text.includes('oculta menu') ||
      text.includes('ocultar menu') ||
      text.includes('cierra el menu') ||
      text.includes('cerrar el menu') ||
      text.includes('cierra menu') ||
      text.includes('cerrar menu') ||
      text.includes('oculta controles') ||
      text.includes('ocultar controles') ||
      text.includes('oculta los controles') ||
      text.includes('oculta la barra') ||
      text.includes('ocultar la barra') ||
      text.includes('oculta barra') ||
      text.includes('ocultar barra') ||
      text === 'ziro minimal' ||
      text === 'modo mini'
    ) {
      return {
        isCommand: true,
        message: '¡Listo! Minimizando menú y controles. Ahora solo quedo yo flotando en tu escritorio.',
        actionType: 'pet_minimal_mode',
        minimal: true
      };
    }

    // 1B.2. Maximize HUD: "ziro maximizate", "maximizate", "muestra el menu", "mostrar controles", etc.
    if (
      text.includes('maximizate') ||
      text.includes('maximizar') ||
      text.includes('muestra el menu') ||
      text.includes('mostrar el menu') ||
      text.includes('muestra menu') ||
      text.includes('mostrar menu') ||
      text.includes('abrir el menu') ||
      text.includes('abre el menu') ||
      text.includes('abrir menu') ||
      text.includes('abre menu') ||
      text.includes('ver el menu') ||
      text.includes('ver menu') ||
      text.includes('aparece el menu') ||
      text.includes('aparezca el menu') ||
      text.includes('aparecer menu') ||
      text.includes('muestra controles') ||
      text.includes('mostrar controles') ||
      text.includes('muestra los controles') ||
      text.includes('mostrar los controles') ||
      text.includes('muestra la barra') ||
      text.includes('mostrar la barra') ||
      text.includes('restaurar menu') ||
      text.includes('restaura el menu') ||
      text.includes('restaurar') ||
      text.includes('menu completo')
    ) {
      return {
        isCommand: true,
        message: '¡Listo! Maximizando menú, barra de chat y controles en pantalla.',
        actionType: 'pet_minimal_mode',
        minimal: false
      };
    }

    // 1B.3. Resize Voice Commands: "ziro cambia a tamaño grande/mediano/chico", "cambia a tamano grande", etc.
    const hasTamano = text.includes('tamano') || text.includes('tamani') || text.includes('escala') || text.includes('dimension');
    const isChangeAction = text.includes('cambia') || text.includes('pon') || text.includes('pone') || text.includes('haz') || text.includes('hacer') || text.includes('ajusta') || text.includes('ponte');

    if (
      (hasTamano && (text.includes('grande') || text.includes('chico') || text.includes('pequeno') || text.includes('mediano') || text.includes('normal') || text.includes('maximo') || text.includes('gigante') || text.includes('pantalla') || text.includes('diminuto'))) ||
      ((isChangeAction || text.includes('ziro')) && (text.includes('a grande') || text.includes('a chico') || text.includes('a pequeno') || text.includes('a mediano') || text.includes('ponte grande') || text.includes('ponte gigante') || text.includes('hazte grande') || text.includes('hazte gigante') || text.includes('pantalla completa') || text.includes('al maximo')))
    ) {
      let scale = 1.0;
      let sizeLabel = 'mediano';

      if (text.includes('pantalla completa') || text.includes('maximo') || text.includes('al maximo') || text.includes('enorme')) {
        scale = 3.2;
        sizeLabel = 'pantalla completa (320%)';
      } else if (text.includes('gigante')) {
        scale = 2.2;
        sizeLabel = 'gigante (220%)';
      } else if (text.includes('grande')) {
        scale = 1.5;
        sizeLabel = 'grande (150%)';
      } else if (text.includes('chico') || text.includes('pequeno') || text.includes('diminuto') || text.includes('peque')) {
        scale = 0.7;
        sizeLabel = 'chico (70%)';
      } else {
        scale = 1.0;
        sizeLabel = 'mediano (100%)';
      }

      return {
        isCommand: true,
        message: `¡Cambiando a tamaño ${sizeLabel}!`,
        actionType: 'pet_change_scale',
        scale,
        sizeLabel
      };
    }

    // 1B.4. Rings Color & Particle Trail Customization Voice Commands
    // e.g. "aros dorados", "cambia los aros a rojo", "estela de estrellas", "efecto corazones"
    if (
      (text.includes('aro') || text.includes('aros') || text.includes('anillo') || text.includes('anillos')) &&
      (text.includes('color') || text.includes('cambia') || text.includes('pon') || text.includes('dorad') || text.includes('oro') || text.includes('roj') || text.includes('azul') || text.includes('verde') || text.includes('morad') || text.includes('violet') || text.includes('ros') || text.includes('cyan') || text.includes('blanc') || text.includes('fluor'))
    ) {
      let c1 = '#00ff66', c2 = '#00ffff', colorName = 'verde fluor';
      if (text.includes('dorad') || text.includes('oro') || text.includes('amarill')) { c1 = '#ffd700'; c2 = '#ffaa00'; colorName = 'dorado'; }
      else if (text.includes('roj')) { c1 = '#ff2244'; c2 = '#ff5500'; colorName = 'rojo rubí'; }
      else if (text.includes('azul')) { c1 = '#0077ff'; c2 = '#00ddff'; colorName = 'azul eléctrico'; }
      else if (text.includes('morad') || text.includes('violet') || text.includes('purpur')) { c1 = '#9d00ff'; c2 = '#e040fb'; colorName = 'púrpura neón'; }
      else if (text.includes('ros') || text.includes('fucsia')) { c1 = '#ff007f'; c2 = '#ff66cc'; colorName = 'rosa neón'; }
      else if (text.includes('cyan') || text.includes('celeste')) { c1 = '#00ffff'; c2 = '#00bfff'; colorName = 'cyan neón'; }
      else if (text.includes('blanc')) { c1 = '#ffffff'; c2 = '#b0bec5'; colorName = 'blanco puro'; }

      return {
        isCommand: true,
        message: `¡Listo! Cambié los aros que me envuelven a color ${colorName}. ¿Quieres que hagamos algún otro cambio o te gusta cómo quedó?`,
        actionType: 'pet_customize_fx',
        ringColor1: c1,
        ringColor2: c2,
        colorName
      };
    }

    if (
      (text.includes('estela') || text.includes('efecto') || text.includes('particula') || text.includes('particulas')) &&
      (text.includes('estrella') || text.includes('estrellas') || text.includes('corazon') || text.includes('corazones') || text.includes('chispa') || text.includes('chispas') || text.includes('burbuja') || text.includes('burbujas') || text.includes('destello') || text.includes('ningun') || text.includes('apagar'))
    ) {
      let effect = 'estrellas', effectName = 'estrellas centelleantes';
      if (text.includes('corazon') || text.includes('corazones')) { effect = 'corazones'; effectName = 'corazones tiernos'; }
      else if (text.includes('chispa') || text.includes('chispas') || text.includes('rayo')) { effect = 'chispas'; effectName = 'chispas eléctricas'; }
      else if (text.includes('burbuja') || text.includes('burbujas')) { effect = 'burbujas'; effectName = 'burbujas mágicas'; }
      else if (text.includes('ningun') || text.includes('apagar') || text.includes('quitar')) { effect = 'ninguno'; effectName = 'apagado'; }

      return {
        isCommand: true,
        message: `¡Listo! He configurado mi estela mágica con efecto de ${effectName}. ¿Te parece que quedó bien o quieres probar otro?`,
        actionType: 'pet_customize_fx',
        particleEffect: effect,
        effectName
      };
    }

    // 1B.5. Voice Command to open Cyberpunk File Explorer
    // e.g. "abrir explorador", "abrime el explorador", "explorador de archivos", "explorador ziro"
    if (
      text.includes('explorador') ||
      text.includes('abrir carpetas') ||
      text.includes('abrir archivos') ||
      text.includes('mis archivos') ||
      text.includes('abrir disco')
    ) {
      return {
        isCommand: true,
        message: '¡Abriendo el Explorador Ziro con diseño futurista verde flúor!',
        actionType: 'open_cyber_explorer'
      };
    }

    // 1B.5. ComfyUI Image Generation & Ziro Visualizer Voice Commands
    // e.g. "créame una imagen de tal cosa con sus características"
    const isImageGen =
      text.includes('creame una imagen') ||
      text.includes('crea una imagen') ||
      text.includes('genera una imagen') ||
      text.includes('dibujame una imagen') ||
      text.includes('dibuja una imagen') ||
      text.includes('haz una imagen') ||
      text.includes('generar imagen de') ||
      text.includes('abrir ziro visualizer') ||
      text.includes('abre ziro visualizer') ||
      text.includes('abrir visualizador');

    if (isImageGen) {
      let prompt = text
        .replace(/\b(?:creame|crea|genera|generar|dibujame|dibuja|haz|hacer|abrir|abre|ziro|visualizer|visualizador|una|un|imagen|imagenes|dibujo|de|con|por|favor|caracteristicas|sus)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!prompt) prompt = 'anime warrior kitsune girl, green neon aura, high quality 8k, photorealistic detailed';

      return {
        isCommand: true,
        message: `¡Por supuesto! Abriendo Comfy Desktop y generando tu imagen en ZIRO VISUALIZER ("${prompt}"). Podrás ajustar los detalles con tu voz o descargarla con y sin fondo.`,
        actionType: 'comfy_open_visualizer',
        prompt
      };
    }

    // 1B.6. Real-Time Architecture Voice Commands: Procedural Architect, "aleatorio", "agrega un piso", "estira el edificio"
    const archResult = await this.processArchitectVoiceCommand(rawText);
    if (archResult) {
      return archResult;
    }

    if (
      text === 'aleatorio' ||
      text === 'diseno aleatorio' ||
      text === 'diseño aleatorio' ||
      text.includes('cambia el diseno') ||
      text.includes('hazlo diferente') ||
      text.includes('otro diseno') ||
      text.includes('casa aleatoria') ||
      text.includes('edificio aleatorio')
    ) {
      const type = text.includes('edificio') ? 'escuela' : 'casa';
      const def = architectureService.generateProceduralArchitecture(type, { randomize: true });
      const buildRes = await architectureService.buildInUnreal(def);
      return {
        isCommand: true,
        message: `🎲 ¡Diseño aleatorio generado! He construido una nueva estructura (${def.description}) en tu nivel abierto. ¿Quieres que hagamos algún cambio o te parece que quedó bien?`,
        actionType: 'unreal_architecture',
        def,
        buildRes
      };
    }

    if (
      text.includes('agrega un piso') ||
      text.includes('agrega otro piso') ||
      text.includes('suma un piso') ||
      text.includes('suma otro piso') ||
      text.includes('mas pisos') ||
      text.includes('más pisos') ||
      text.includes('un piso mas') ||
      text.includes('un piso más')
    ) {
      const numMatch = text.match(/(\d+)/);
      const floorsToAdd = numMatch ? parseInt(numMatch[1], 10) : 1;
      const expandRes = await architectureService.expandBuildingFloors('EdificioZiro', floorsToAdd);
      return {
        isCommand: true,
        message: `🏢 ¡Piso(s) agregado(s) en tiempo real! (${expandRes.message || 'Edificio expandido'}). ¿Quieres agregar más o te parece que quedó bien?`,
        actionType: 'unreal_expand_floors',
        expandRes
      };
    }

    if (
      text.includes('estira el edificio') ||
      text.includes('estirar el edificio') ||
      text.includes('hazlo mas ancho') ||
      text.includes('hazlo más ancho') ||
      text.includes('hazlo mas largo') ||
      text.includes('hazlo más largo') ||
      text.includes('estiralo')
    ) {
      const stretchRes = await architectureService.stretchBuilding('EdificioZiro', { factorX: 1.35, factorY: 1.25, factorZ: 1.0 });
      return {
        isCommand: true,
        message: `🏢 ¡Edificio estirado en tiempo real en tu nivel! ¿Quieres estirarlo más o te parece que quedó perfecto?`,
        actionType: 'unreal_stretch',
        stretchRes
      };
    }

    // 2. Comfy Desktop (ComfyUI) Anime Generation & Launch Commands
    try {
      const comfyResult = await this.processComfyCommand(text);
      if (comfyResult) {
        return comfyResult;
      }
    } catch (comfyErr) {
      console.warn('Comfy command evaluation warning:', comfyErr.message);
    }

    // 3. Real-Time Unreal Engine Voice Control Integration
    try {
      const unrealResult = await this.processUnrealCommand(text);
      if (unrealResult) {
        return unrealResult;
      }
    } catch (unrealErr) {
      console.warn('Unreal command evaluation warning:', unrealErr.message);
    }

    // 4. YouTube Direct Track Playback ("pon/reproduce [tema] en youtube", "reproduce el tema ...", "abrime youtube")
    const ytPlayMatch =
      text.match(/(?:abre|abri|abrime|abrir)\s+youtube\s+(?:y\s+)?(?:pon|pone|reproduce|reproducir|con)\s+(.+)/) ||
      text.match(/(?:busca|buscar|pon|pone|reproduce|reproducir|escuchar|toca)\s+(.+?)\s+en\s+youtube/) ||
      text.match(/(?:reproduce|reproducir|pon|pone)\s+(?:el\s+tema|la\s+cancion|musica\s+de|un\s+tema\s+de)\s+(.+)/) ||
      text.match(/^(?:reproduce|reproducir)\s+(.+)/);

    if (ytPlayMatch && ytPlayMatch[1]) {
      let query = ytPlayMatch[1]
        .replace(/\ben\s+youtube\b/g, '')
        .replace(/^(?:un\s+tema|una\s+cancion|musica|algo)\s*$/i, '')
        .trim();

      const trackRes = await this.playYouTubeTrack(query);
      return {
        isCommand: true,
        message: query
          ? `🎵 ¡Abriendo YouTube y reproduciendo "${query}" ahora mismo!`
          : `🎵 ¡Abriendo YouTube y reproduciendo un tema musical para ti!`,
        actionType: 'open_youtube_play',
        query: query || trackRes.title,
        target: trackRes.url
      };
    }

    // 5. YouTube Open -> Automatically plays a music track when opening YouTube!
    if (
      text.includes('youtube') ||
      text.includes('reproduce un tema') ||
      text.includes('reproducir un tema') ||
      text.includes('pon un tema') ||
      text.includes('pone un tema') ||
      text.includes('pon musica') ||
      text.includes('pone musica')
    ) {
      // Check if user mentioned a song name alongside "youtube" (e.g., "youtube linkin park")
      let extraSong = text
        .replace(/\b(?:abrime|abre|abri|abrir|pon|poner|pone|reproduce|reproducir|lanzar|inicia|iniciar|ver|en|el|la|un|una|tema|cancion|musica|youtube|por|favor|al|con|y)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const trackRes = await this.playYouTubeTrack(extraSong);
      return {
        isCommand: true,
        message: extraSong
          ? `🎵 ¡Abriendo YouTube y reproduciendo "${extraSong}"!`
          : `🎵 ¡Abriendo YouTube y reproduciendo "${trackRes.title}" automáticamente!`,
        actionType: 'open_youtube_play',
        target: trackRes.url
      };
    }

    // 4. Internal Web & Weather Lookup (sin abrir el navegador!)
    const wantsBrowserExplicit = text.includes('en mi navegador') || text.includes('en el navegador') || text.includes('abrir navegador');
    if (!wantsBrowserExplicit && webLookupService.isInfoLookupQuery(rawText)) {
      const answer = await webLookupService.answerQuery(rawText);
      return {
        isCommand: true,
        message: answer,
        actionType: 'internal_web_lookup'
      };
    }

    // 4B. Explicit browser search only if requested in browser
    const googleSearchMatch = text.match(/(?:busca|buscar|investiga|averigua)\s+(.+?)(?:\s+en\s+google|$)/);
    if (wantsBrowserExplicit && googleSearchMatch && googleSearchMatch[1]) {
      const query = googleSearchMatch[1].replace(/en google|en mi navegador|en el navegador/g, '').trim();
      if (query.length > 0) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        await openExternalSafe(url);
        return {
          isCommand: true,
          message: `Buscando "${query}" en tu navegador.`,
          actionType: 'open_google_search',
          query
        };
      }
    }

    // 5. Google Open
    if (
      text.includes('google') &&
      (text.includes('abre') || text.includes('abri') || text.includes('abrir') || text.trim() === 'google')
    ) {
      await openExternalSafe('https://www.google.com');
      return {
        isCommand: true,
        message: 'Abriendo Google en tu navegador.',
        actionType: 'open_google'
      };
    }

    // 6. Calculadora
    if (
      text.includes('calculadora') ||
      (text.includes('calc') && (text.includes('abre') || text.includes('abri') || text.includes('abrir')))
    ) {
      exec('calc.exe', (err) => {
        if (err) exec('start calc');
      });
      return {
        isCommand: true,
        message: 'Abriendo la Calculadora de Windows.',
        actionType: 'open_calc'
      };
    }

    // 7. Bloc de Notas
    if (
      text.includes('bloc de notas') ||
      text.includes('notepad') ||
      text.includes('notas') && (text.includes('abre') || text.includes('abri'))
    ) {
      exec('notepad.exe');
      return {
        isCommand: true,
        message: 'Abriendo el Bloc de Notas.',
        actionType: 'open_notepad'
      };
    }

    // 8. Explorador de Archivos
    if (
      text.includes('explorador de archivos') ||
      text.includes('mis archivos') ||
      text.includes('mis documentos') ||
      text.includes('carpetas') && (text.includes('abre') || text.includes('abri'))
    ) {
      exec('explorer.exe');
      return {
        isCommand: true,
        message: 'Abriendo el Explorador de Archivos.',
        actionType: 'open_explorer'
      };
    }

    // 9. Spotify
    if (text.includes('spotify')) {
      openExternalSafe('spotify:').catch(() => {
        openExternalSafe('https://open.spotify.com');
      });
      return {
        isCommand: true,
        message: 'Iniciando Spotify para tu música.',
        actionType: 'open_spotify'
      };
    }

    // 10. Discord
    if (text.includes('discord')) {
      openExternalSafe('discord://').catch(() => {
        openExternalSafe('https://discord.com/app');
      });
      return {
        isCommand: true,
        message: 'Abriendo Discord.',
        actionType: 'open_discord'
      };
    }

    // 11. Steam
    if (text.includes('steam')) {
      openExternalSafe('steam://open/main').catch(() => {
        exec('start steam');
      });
      return {
        isCommand: true,
        message: 'Iniciando Steam.',
        actionType: 'open_steam'
      };
    }

    // 12. WhatsApp
    if (text.includes('whatsapp')) {
      await openExternalSafe('https://web.whatsapp.com');
      return {
        isCommand: true,
        message: 'Abriendo WhatsApp Web.',
        actionType: 'open_whatsapp'
      };
    }

    // 13. Administrador de Tareas
    if (
      text.includes('administrador de tareas') ||
      text.includes('task manager') ||
      text.includes('taskmgr')
    ) {
      exec('taskmgr.exe');
      return {
        isCommand: true,
        message: 'Abriendo el Administrador de Tareas.',
        actionType: 'open_taskmgr'
      };
    }

    // 14. Terminal / PowerShell / CMD
    if (
      text.includes('terminal') ||
      text.includes('powershell') ||
      text.includes('linea de comandos') ||
      text.includes('simbolo del sistema')
    ) {
      exec('start powershell.exe');
      return {
        isCommand: true,
        message: 'Iniciando PowerShell.',
        actionType: 'open_terminal'
      };
    }

    // 15. Pregunta de Hora o Fecha
    if (text.includes('hora') && (text.includes('que') || text.includes('dime') || text.includes('la'))) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        isCommand: true,
        message: `Son exactamente las ${timeStr}.`,
        actionType: 'get_time'
      };
    }

    if (text.includes('dia') || text.includes('fecha')) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return {
        isCommand: true,
        message: `Hoy es ${dateStr}.`,
        actionType: 'get_date'
      };
    }

    // 16. Generic "abre [programa/sitio]" fallback detection
    const openGeneralMatch = text.match(/(?:abrime|abre|abri|abrir|lanzar|ejecuta|ejecutar)\s+(.+)/);
    if (openGeneralMatch && openGeneralMatch[1]) {
      const targetApp = openGeneralMatch[1].trim();

      if (targetApp.includes('.com') || targetApp.includes('.tv') || targetApp.includes('.io') || targetApp.includes('.org') || targetApp.includes('.net')) {
        let url = targetApp;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }
        await openExternalSafe(url);
        return {
          isCommand: true,
          message: `Abriendo el sitio web ${targetApp}.`,
          actionType: 'open_web',
          target: url
        };
      }

      const knownApps = {
        'paint': 'mspaint.exe',
        'mspaint': 'mspaint.exe',
        'dibujo': 'mspaint.exe',
        'word': 'start winword',
        'excel': 'start excel',
        'powerpoint': 'start powerpnt',
        'chrome': 'start chrome',
        'navegador': 'start msedge',
        'edge': 'start msedge',
        'firefox': 'start firefox',
        'vlc': 'start vlc',
        'twitch': 'https://www.twitch.tv',
        'twitter': 'https://twitter.com',
        'x': 'https://x.com',
        'instagram': 'https://www.instagram.com',
        'reddit': 'https://www.reddit.com',
        'github': 'https://www.github.com'
      };

      if (knownApps[targetApp]) {
        const val = knownApps[targetApp];
        if (val.startsWith('http')) {
          await openExternalSafe(val);
        } else {
          exec(val);
        }
        return {
          isCommand: true,
          message: `Abriendo ${targetApp}.`,
          actionType: 'open_app',
          target: targetApp
        };
      }
    }

    return {
      isCommand: false
    };
  }

  /**
   * Resolves the first playable YouTube videoId for a song/query (or selects a featured music track)
   * and opens https://www.youtube.com/watch?v=<videoId> so the song plays immediately!
   */
  async playYouTubeTrack(rawQuery = '') {
    const defaultTracks = [
      { id: 'fHI8X4OXluQ', title: 'The Weeknd - Blinding Lights' },
      { id: 'FGBhQbmPwH8', title: 'Daft Punk - One More Time' },
      { id: 'kXYiU_JCYtU', title: 'Linkin Park - Numb' },
      { id: '4xDzrJKXOOY', title: 'Synthwave Cyberpunk Gaming Mix' },
      { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Beats Mix' }
    ];

    const query = (rawQuery || '').trim();
    if (query.length >= 2) {
      try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
          }
        });
        clearTimeout(timer);

        if (res.ok) {
          const html = await res.text();
          const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/) || html.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
          if (idMatch && idMatch[1]) {
            const watchUrl = `https://www.youtube.com/watch?v=${idMatch[1]}&autoplay=1`;
            await openExternalSafe(watchUrl);
            return { url: watchUrl, videoId: idMatch[1], title: query };
          }
        }
      } catch (e) {
        console.warn('YouTube direct video lookup fallback:', e.message);
      }
      // Fallback to search query if offline/blocked
      const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      await openExternalSafe(fallbackUrl);
      return { url: fallbackUrl, title: query };
    }

    // No specific song named ("abrime youtube" / "pon un tema") -> pick a featured track and play it directly!
    const chosen = defaultTracks[Math.floor(Math.random() * defaultTracks.length)];
    const watchUrl = `https://www.youtube.com/watch?v=${chosen.id}&autoplay=1`;
    await openExternalSafe(watchUrl);
    return { url: watchUrl, videoId: chosen.id, title: chosen.title };
  }

  /**
   * Ziro Procedural Architect voice commands handler
   * Handles 15 construction categories, single-part regenerations (roof, facade, structure, interior),
   * horror profile toggles, and multi-building counts.
   */
  async processArchitectVoiceCommand(rawText) {
    if (!rawText) return null;
    const text = rawText.toLowerCase().trim();

    // 1. REGENERATE SINGLE PART: "regenerá solamente el techo", "cambia la arquitectura", "regenera la fachada"
    const isRegen = text.includes('regenera') || text.includes('regenerá') || text.includes('cambia solo') || text.includes('cambiá solo') || text.includes('solamente');
    if (isRegen || text.includes('cambia la arquitectura') || text.includes('cambiá la arquitectura') || text.includes('modifica la arquitectura')) {
      if (text.includes('techo') || text.includes('cubierta')) {
        const res = await architectureService.regenerateBuildingPart({ part: 'roof' });
        return {
          isCommand: true,
          message: `🏠 ¡Techo regenerado exitosamente! He conservado intacta la fachada y el interior del edificio. ${res.message || ''}`,
          actionType: 'architect_regen_part',
          res
        };
      }
      if (text.includes('fachada') || text.includes('frente') || text.includes('ventanas')) {
        const res = await architectureService.regenerateBuildingPart({ part: 'facade' });
        return {
          isCommand: true,
          message: `🏛️ ¡Fachada regenerada! Modifiqué la distribución de aberturas y molduras manteniendo la estructura. ${res.message || ''}`,
          actionType: 'architect_regen_part',
          res
        };
      }
      if (text.includes('arquitectura') || text.includes('estructura') || text.includes('planta') || text.includes('alas')) {
        const res = await architectureService.regenerateBuildingPart({ part: 'structure' });
        return {
          isCommand: true,
          message: `📐 ¡Arquitectura de la estructura regenerada con nueva forma y distribución! ${res.message || ''}`,
          actionType: 'architect_regen_part',
          res
        };
      }
      if (text.includes('material') || text.includes('textura')) {
        const res = await architectureService.regenerateBuildingPart({ part: 'materials' });
        return {
          isCommand: true,
          message: `🎨 ¡Materiales y texturas PBR cambiados aleatoriamente! ${res.message || ''}`,
          actionType: 'architect_regen_part',
          res
        };
      }
      if (text.includes('interior') || text.includes('muebles') || text.includes('habitaciones')) {
        const res = await architectureService.regenerateBuildingPart({ part: 'interior' });
        return {
          isCommand: true,
          message: `🛋️ ¡Interior reorganizado con nueva zonificación y mobiliario temático! ${res.message || ''}`,
          actionType: 'architect_regen_part',
          res
        };
      }
    }

    // 2. HORROR PROFILE: "hacé que este hospital parezca abandonado", "haz que parezca abandonado"
    if (text.includes('abandonad') || text.includes('destruid') || text.includes('infectad') || text.includes('incendiad') || text.includes('derrumbad') || text.includes('terror') || text.includes('oscura')) {
      if (text.includes('hace que') || text.includes('hacé que') || text.includes('haz que') || text.includes('parezca') || text.includes('aplica terror') || text.includes('modo terror')) {
        let profile = 'abandonado';
        if (text.includes('hospital')) profile = 'hospital_destruido';
        else if (text.includes('escuela') || text.includes('colegio')) profile = 'escuela_abandonada';
        else if (text.includes('iglesia')) profile = 'iglesia_oscura';
        else if (text.includes('comisaria') || text.includes('comisaría') || text.includes('policia') || text.includes('policía')) profile = 'comisaria_deteriorada';
        else if (text.includes('casa')) profile = 'casa_infectada';
        else if (text.includes('incendiad')) profile = 'edificio_incendiado';
        else if (text.includes('derrumbad')) profile = 'derrumbado';

        const res = await architectureService.applyHorrorProfile({ profile, enable: true });
        return {
          isCommand: true,
          message: `🧟 ¡Perfil de terror aplicado! He añadido maderas tapiando las ventanas, grietas, escombros, humedad y luces tétricas. ¿Quieres que lo dejemos así o cambiamos algo?`,
          actionType: 'architect_horror',
          res
        };
      }
    }

    // 3. GENERATE BUILDINGS (15 types, count, floors, materials, horror)
    const isCreateVerb = text.includes('genera') || text.includes('generá') || text.includes('crea') || text.includes('creá') || text.includes('construye') || text.includes('construí') || text.includes('hacé') || text.includes('haz');

    const categoriesMap = [
      { key: 'escuela', terms: ['escuela', 'colegio', 'instituto'] },
      { key: 'iglesia', terms: ['iglesia', 'catedral', 'capilla', 'basilica', 'basílica', 'templo'] },
      { key: 'hospital', terms: ['hospital', 'clinica', 'clínica', 'sanatorio'] },
      { key: 'comisaria', terms: ['comisaria', 'comisaría', 'policia', 'policía', 'cuartel'] },
      { key: 'casa', terms: ['casa', 'cabaña', 'cabana', 'chalet', 'villa'] },
      { key: 'edificio_residencial', terms: ['edificio residencial', 'residencial', 'departamentos', 'bloque de viviendas'] },
      { key: 'edificio_comercial', terms: ['edificio comercial', 'galeria comercial', 'locales comerciales'] },
      { key: 'fabrica', terms: ['fabrica', 'fábrica', 'planta manufacturera'] },
      { key: 'almacen', terms: ['almacen', 'almacén', 'deposito', 'depósito', 'bodega'] },
      { key: 'estacion_servicio', terms: ['estacion de servicio', 'estación de servicio', 'gasolinera', 'servicentro'] },
      { key: 'hotel', terms: ['hotel', 'motel', 'hostal', 'resort'] },
      { key: 'oficinas', terms: ['oficinas', 'torre de oficinas', 'corporativo'] },
      { key: 'centro_comercial', terms: ['centro comercial', 'mall', 'shopping'] },
      { key: 'industrial', terms: ['edificio industrial', 'complejo industrial', 'nave industrial'] },
      { key: 'construccion_abandonada', terms: ['construccion abandonada', 'edificio abandonado', 'ruina', 'abandonada'] }
    ];

    let matchedCategory = null;
    for (const item of categoriesMap) {
      if (item.terms.some(t => text.includes(t))) {
        matchedCategory = item.key;
        break;
      }
    }

    // 2.5. GENERAR ISLA O CIUDAD POR PROMPT (con N edificios, abandonada o no, con plantas/enredaderas y assets del nivel)
    if (isCreateVerb && (text.includes('isla') || text.includes('ciudad') || text.includes('pueblo') || text.includes('aldea'))) {
      let buildingCount = 6;
      const numMatch = text.match(/(\d+)\s*(?:edificios?|casas?|construcciones?|torres?|bloques?)/);
      if (numMatch) {
        buildingCount = Math.min(30, Math.max(1, parseInt(numMatch[1], 10)));
      }
      const isIsland = text.includes('isla');
      const isAbandoned = text.includes('abandonad') || text.includes('ruina') || text.includes('terror') || text.includes('destruid') || text.includes('apocalip');
      const hasExtraVines = text.includes('enredadera') || text.includes('planta') || text.includes('vegetacion') || text.includes('vegetación') || text.includes('selva') || text.includes('musgo') || isAbandoned;

      const worldPromptArgs = {
        mode: isIsland ? 'island' : 'city',
        building_count: buildingCount,
        abandoned: isAbandoned,
        extra_vines: hasExtraVines,
        use_level_assets: true,
        prompt: rawText
      };

      const res = await unrealService.executeZiroPluginCommand({
        tool: 'architect_generate_world_scene',
        args: worldPromptArgs,
        voice_prompt: rawText
      }, 6000);

      return {
        isCommand: true,
        message: res.message || `🏝️ ¡Generando ${isIsland ? 'isla' : 'ciudad'} ${isAbandoned ? 'abandonada' : ''} con ${buildingCount} edificio(s), puertas abiertas, objetos movibles y vegetación en paredes usando los assets del nivel!`,
        actionType: 'architect_world_scene',
        res
      };
    }

    if (matchedCategory && isCreateVerb) {
      // Parse count ESTRICTO: solo contar más de 1 si el número acompaña a un tipo de edificio (NO confundir "2 pisos" con "2 edificios")
      let count = 1;
      const wordToNum = { 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10 };
      const cMatch = text.match(/\b(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:escuelas?|iglesias?|hospitales?|comisarias?|comisarías?|casas?|edificios?|fabricas?|fábricas?|almacenes?|hoteles?|tiendas?|oficinas?|construcciones?|torres?)\b/i);
      if (cMatch) {
        const rawN = cMatch[1].toLowerCase();
        count = wordToNum[rawN] || parseInt(rawN, 10) || 1;
      }
      count = Math.min(30, Math.max(1, count));

      // Parse floors: "tres pisos", "3 pisos", "dos plantas"
      let floors = undefined;
      const fMatch = text.match(/(\d+)\s*(?:pisos|plantas|niveles)/);
      if (fMatch) floors = parseInt(fMatch[1], 10);
      else if (text.includes('un piso') || text.includes('una planta')) floors = 1;
      else if (text.includes('dos pisos') || text.includes('dos plantas')) floors = 2;
      else if (text.includes('tres pisos') || text.includes('tres plantas')) floors = 3;
      else if (text.includes('cuatro pisos') || text.includes('cuatro plantas')) floors = 4;

      // Parse horror profile
      let horror = '';
      if (text.includes('abandonad') || text.includes('oscura') || text.includes('terror') || text.includes('destruid')) {
        if (matchedCategory === 'iglesia') horror = 'iglesia_oscura';
        else if (matchedCategory === 'hospital') horror = 'hospital_destruido';
        else if (matchedCategory === 'escuela') horror = 'escuela_abandonada';
        else if (matchedCategory === 'comisaria') horror = 'comisaria_deteriorada';
        else horror = 'abandonado';
      }

      // Parse materials & styles
      let wallSurf = undefined;
      if (text.includes('ladrillo')) wallSurf = 'ladrillo';
      else if (text.includes('hormigon') || text.includes('hormigón') || text.includes('concreto')) wallSurf = 'hormigon';
      else if (text.includes('piedra')) wallSurf = 'piedra';
      else if (text.includes('madera')) wallSurf = 'madera';

      let facadeStyle = undefined;
      if (text.includes('antigua') || text.includes('clasica') || text.includes('clásica')) facadeStyle = 'arched_classic';
      else if (text.includes('gotica') || text.includes('gótica')) facadeStyle = 'gothic_lancet';
      else if (text.includes('moderna')) facadeStyle = 'grid_modern';

      const extraVines = text.includes('enredadera') || text.includes('planta') || text.includes('vegetacion') || text.includes('vegetación') || text.includes('musgo') || Boolean(horror);

      const res = await architectureService.generateProceduralBuilding({
        type: matchedCategory,
        count,
        floors,
        horror_profile: horror,
        wall_surface: wallSurf,
        facade_style: facadeStyle,
        extra_vines: extraVines,
        use_level_assets: true
      });

      return {
        isCommand: true,
        message: `🏗️ ¡He generado ${count > 1 ? count + ' construcciones completamente diferentes' : 'una construcción'} de tipo ${matchedCategory.toUpperCase()} con geometría procedural 3D real y materiales PBR aplicados! ¿Quieres que hagamos algún cambio o te parece que quedó bien?`,
        actionType: 'architect_generate',
        res
      };
    }

    return null;
  }

  async processComfyCommand(text) {
    const mentionsComfy = text.includes('comfy') || text.includes('comiflyu') || text.includes('comfyui');
    const mentionsAnimePet = (text.includes('anime') || mentionsComfy) &&
      (text.includes('crea') || text.includes('genera') || text.includes('haz') || text.includes('mascota') || text.includes('personaje'));

    // 1. Open / Show Comfy Desktop on screen
    if (
      mentionsComfy &&
      (text.includes('abre') || text.includes('abri') || text.includes('abrir') || text.includes('inicia') || text.includes('muestra') || text.includes('pantalla') || text.includes('conecta') || text.trim() === 'comfy' || text.trim() === 'comfy desktop') &&
      !text.includes('genera') && !text.includes('crea')
    ) {
      const res = await comfyService.openComfyDesktopOnScreen(true);
      return {
        isCommand: true,
        message: res.connected
          ? `🎨 ¡Comfy Desktop está abierto en tu pantalla y conectado en el puerto ${res.port} (${res.gpuName})! Listo para generar personajes anime con Z-Image-Turbo.`
          : `🎨 He abierto Comfy Desktop en tu pantalla para trabajar.`,
        actionType: 'comfy_open_desktop',
        detail: res
      };
    }

    // 2. Generate high-level Anime Character in Comfy Desktop
    if (mentionsAnimePet) {
      let promptDesc = text
        .replace(/(?:por favor|quiero que|puedes|podrias)/g, '')
        .replace(/(?:genera|generar|crea|crear|haz|hacer|una|un|mascota|personaje|de|en|con|comfy|comiflyu|comfyui|desktop)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!promptDesc || promptDesc.length < 3) {
        promptDesc = 'cute cyber anime spirit kitsune companion with glowing neon emerald details';
      }

      return {
        isCommand: true,
        message: `🎨 Abriendo Comfy Desktop en tu pantalla y generando tu personaje anime de alto nivel ("${promptDesc}") con Z-Image-Turbo...`,
        actionType: 'comfy_generate_anime',
        prompt: promptDesc
      };
    }

    return null;
  }

  async processUnrealCommand(text) {
    const isExplicitUnreal =
      text.includes('unreal') ||
      text.includes('ziroai') ||
      text.includes('zirohost') ||
      text.includes('ziro host') ||
      text.includes('en el nivel') ||
      text.includes('en el escenario') ||
      text.includes('en mi nivel') ||
      text.includes('en mi escenario') ||
      text.includes('level abierto') ||
      text.includes('nivel abierto') ||
      text.includes('frente a la camara');

    // 0. Open / Launch ZiroHost Project in Unreal Engine
    if (
      (text.includes('unreal') || text.includes('zirohost') || text.includes('ziro host')) &&
      (text.includes('abre') || text.includes('abri') || text.includes('abrir') || text.includes('inicia') || text.includes('lanza')) &&
      !text.includes('play') && !text.includes('simulacion')
    ) {
      const launchRes = await unrealService.launchZiroHostProject();
      return {
        isCommand: true,
        message: launchRes.message,
        actionType: 'unreal_launch',
        detail: launchRes
      };
    }

    // 1. Connection / Ping ZIROAI.uplugin
    if (
      (isExplicitUnreal && (text.includes('conecta') || text.includes('conectar') || text.includes('prueba') || text.includes('ping') || text.includes('estado') || text.includes('test') || text.includes('plugin'))) ||
      text === 'ping unreal' || text === 'conectar unreal' || text === 'conectar ziroai'
    ) {
      try {
        const pingRes = await unrealService.testConnection();
        if (pingRes.success) {
          return {
            isCommand: true,
            message: `🎮 ${pingRes.message}`,
            actionType: 'unreal_connected',
            detail: pingRes
          };
        } else {
          return {
            isCommand: true,
            message: `🎮 No pude enlazar con ZIROAI.uplugin: ${pingRes.error}.`,
            actionType: 'unreal_error',
            detail: pingRes
          };
        }
      } catch (e) {
        return {
          isCommand: true,
          message: `🎮 Error comprobando ZIROAI.uplugin: ${e.message}`,
          actionType: 'unreal_error'
        };
      }
    }

    // 2. Play / Simulation Control (Play In Editor)
    if (
      text.includes('dale play') || text.includes('inicia la simulacion') || text.includes('iniciar el juego') || text.includes('probar juego') || text.includes('simular nivel') || (isExplicitUnreal && text.includes('play'))
    ) {
      try {
        const simRes = await unrealService.controlSimulation('play');
        return {
          isCommand: true,
          message: simRes.message,
          actionType: 'unreal_play'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Error en simulación: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    if (
      text.includes('deten el juego') || text.includes('para el juego') || text.includes('deten la simulacion') || text.includes('parar simulacion') || (isExplicitUnreal && text.includes('stop'))
    ) {
      try {
        const simRes = await unrealService.controlSimulation('stop');
        return {
          isCommand: true,
          message: simRes.message,
          actionType: 'unreal_stop'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Error al detener simulación: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 3. Save Level & Undo / Redo
    if (
      text.includes('guarda el nivel') || text.includes('guardar nivel') || text.includes('guardar proyecto') || text.includes('guarda el escenario') || (isExplicitUnreal && text.includes('guarda'))
    ) {
      try {
        const saveRes = await unrealService.saveLevel();
        return {
          isCommand: true,
          message: saveRes.message,
          actionType: 'unreal_save'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Error al guardar: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    if (text === 'deshacer' || text === 'undo' || text.includes('deshaz la ultima') || (isExplicitUnreal && text.includes('deshacer'))) {
      const undoRes = await unrealService.undoAction();
      return { isCommand: true, message: undoRes.message, actionType: 'unreal_undo' };
    }

    if (text === 'rehacer' || text === 'redo' || (isExplicitUnreal && text.includes('rehacer'))) {
      const redoRes = await unrealService.redoAction();
      return { isCommand: true, message: redoRes.message, actionType: 'unreal_redo' };
    }

    // 4. Query / Inspect Actors in Open Level
    if (
      text.includes('cuantos objetos') || text.includes('cuantos actores') || text.includes('inspecciona el nivel') || text.includes('analiza el nivel') || (isExplicitUnreal && (text.includes('actores') || text.includes('inspecciona')))
    ) {
      try {
        const actorsRes = await unrealService.getActorsInLevel();
        return {
          isCommand: true,
          message: `🎮 En tu nivel abierto de ZiroHost hay ${actorsRes.count} actores activos (${actorsRes.message || 'ZIROAI.uplugin'}).`,
          actionType: 'unreal_actors_list',
          count: actorsRes.count
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 No pude consultar los actores del nivel: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 5. Structures, Buildings, Cities, Forests & World Building (ZIROAI.uplugin 84 Tools)
    const isBuildingVerb =
      text.includes('construye') || text.includes('construi') || text.includes('construir') ||
      text.includes('crea') || text.includes('crear') || text.includes('haz') || text.includes('hace') ||
      text.includes('arma') || text.includes('genera') || text.includes('generar') ||
      text.includes('coloca') || text.includes('pon') || text.includes('pone') || text.includes('spawnea') || text.includes('agrega');

    if (isBuildingVerb && (text.includes('ciudad') || text.includes('manzanas') || text.includes('metropolis'))) {
      const numMatch = text.match(/(\d+)/);
      const grid = numMatch ? Math.min(8, Math.max(2, parseInt(numMatch[1], 10))) : 3;
      const res = await unrealService.buildStructure({ type: 'city', extraArgs: { rows: grid, cols: grid } });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('edificio') || text.includes('rascacielos') || text.includes('torre'))) {
      const floorsMatch = text.match(/(\d+)\s*(?:pisos|plantas|niveles)/) || text.match(/(\d+)/);
      const floors = floorsMatch ? Math.min(20, Math.max(1, parseInt(floorsMatch[1], 10))) : 5;
      let style = 'modern';
      if (text.includes('cyberpunk') || text.includes('futurista') || text.includes('neon')) style = 'cyberpunk';
      else if (text.includes('industrial')) style = 'industrial';
      else if (text.includes('oficina')) style = 'office';
      else if (text.includes('residencial')) style = 'residential';
      const res = await unrealService.buildStructure({ type: 'building', floors, style });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('bosque') || text.includes('arboles') || text.includes('vegetacion') || text.includes('selva'))) {
      const countMatch = text.match(/(\d+)/);
      const count = countMatch ? Math.min(400, Math.max(15, parseInt(countMatch[1], 10))) : 80;
      const res = await unrealService.buildStructure({ type: 'forest', count });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('parque') || text.includes('aldea') || text.includes('pueblo') || text.includes('desierto') || text.includes('bioma'))) {
      let preset = 'forest';
      if (text.includes('parque')) preset = 'park';
      else if (text.includes('aldea') || text.includes('pueblo')) preset = 'village';
      else if (text.includes('desierto')) preset = 'desert';
      else if (text.includes('industrial')) preset = 'industrial';
      else if (text.includes('ciudad')) preset = 'city';
      const res = await unrealService.buildStructure({ type: 'environment', preset });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('casa') || text.includes('cabana') || text.includes('cabaña') || text.includes('vivienda') || text.includes('chalet'))) {
      const res = await unrealService.buildStructure({ type: 'house' });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('habitacion') || text.includes('cuarto') || text.includes('sala'))) {
      const res = await unrealService.buildStructure({ type: 'room' });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('escalera') || text.includes('escaleras') || text.includes('peldaños') || text.includes('escalones'))) {
      const stepsMatch = text.match(/(\d+)/);
      const steps = stepsMatch ? Math.min(50, Math.max(4, parseInt(stepsMatch[1], 10))) : 14;
      const res = await unrealService.buildStructure({ type: 'stairs', extraArgs: { steps } });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && text.includes('puerta')) {
      const res = await unrealService.buildStructure({ type: 'door' });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('muro') || text.includes('pared'))) {
      const color = this.extractColor(text) || 'fluor';
      const res = await unrealService.buildStructure({ type: 'wall', color });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    if (isBuildingVerb && (text.includes('piramide') || text.includes('pirámide'))) {
      const color = this.extractColor(text) || 'dorado';
      const res = await unrealService.buildStructure({ type: 'pyramid', color });
      return { isCommand: true, message: res.message, actionType: 'unreal_structure' };
    }

    // 6. Lighting & Atmosphere Presets (Sunset, Night, Noon, Studio, Overcast, PointLight, SpotLight)
    const isLightMatch =
      (isBuildingVerb || text.includes('cambia') || text.includes('pon') || text.includes('configura') || isExplicitUnreal) &&
      (text.includes('luz') || text.includes('luces') || text.includes('foco') || text.includes('spot') || text.includes('iluminacion') || text.includes('atardecer') || text.includes('noche') || text.includes('mediodia') || text.includes('amanecer'));

    if (isLightMatch) {
      try {
        let preset = null;
        if (text.includes('noche') || text.includes('nocturno') || text.includes('nocturna')) preset = 'night';
        else if (text.includes('atardecer') || text.includes('amanecer') || text.includes('sunset')) preset = 'sunset';
        else if (text.includes('mediodia') || text.includes('soleado') || text.includes('dia')) preset = 'noon';
        else if (text.includes('estudio') || text.includes('studio')) preset = 'studio';
        else if (text.includes('nublado') || text.includes('overcast')) preset = 'overcast';

        let type = 'PointLight';
        if (text.includes('direccional') || text.includes('sol') || text.includes('sun')) type = 'DirectionalLight';
        if (text.includes('foco') || text.includes('spot')) type = 'SpotLight';
        const color = this.extractColor(text) || 'fluor';
        const lightRes = await unrealService.spawnLight({ type, preset, color });
        return {
          isCommand: true,
          message: lightRes.message,
          actionType: 'unreal_spawn_light',
          detail: lightRes
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Inconveniente al crear luz en Unreal: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 7. Primitive Meshes (Cubo, Esfera, Cilindro, Cono, Plano)
    const shape = this.extractShape(text);
    if ((isBuildingVerb || isExplicitUnreal) && shape) {
      try {
        const color = this.extractColor(text);
        const hasPhysics = text.includes('fisica') || text.includes('fisicas') || text.includes('gravedad') || text.includes('rebotar');
        const meshRes = await unrealService.spawnMesh({ shape, color, physics: hasPhysics });
        return {
          isCommand: true,
          message: meshRes.message,
          actionType: 'unreal_spawn_mesh',
          detail: meshRes
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Inconveniente al crear ${shape} en Unreal: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 8. Transformations: Move
    const isMoveMatch = text.includes('mueve') || text.includes('mover') || text.includes('sube') || text.includes('subir') || text.includes('baja') || text.includes('bajar') || text.includes('desplaza');
    if (isMoveMatch && (text.includes('cubo') || text.includes('objeto') || text.includes('actor') || text.includes('esfera') || text.includes('arriba') || text.includes('abajo') || isExplicitUnreal)) {
      try {
        let dx = 0, dy = 0, dz = 0;
        if (text.includes('arriba') || text.includes('sube') || text.includes('subir')) dz = 180;
        else if (text.includes('abajo') || text.includes('baja') || text.includes('bajar')) dz = -180;
        else if (text.includes('derecha')) dy = 180;
        else if (text.includes('izquierda')) dy = -180;
        else if (text.includes('adelante')) dx = 180;
        else if (text.includes('atras')) dx = -180;
        else dz = 150;

        const moveRes = await unrealService.moveActorRelative({ dx, dy, dz });
        return {
          isCommand: true,
          message: moveRes.message,
          actionType: 'unreal_transform'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Inconveniente al mover el objeto: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 9. Transformations: Scale
    const isScaleMatch = text.includes('escala') || text.includes('agranda') || text.includes('duplica') || text.includes('achica') || text.includes('mas grande') || text.includes('mas pequeno');
    if (isScaleMatch && (text.includes('cubo') || text.includes('objeto') || text.includes('actor') || text.includes('esfera') || isExplicitUnreal)) {
      try {
        const factor = (text.includes('achica') || text.includes('pequeno')) ? 0.5 : 2.0;
        const scaleRes = await unrealService.scaleActor({ factor });
        return {
          isCommand: true,
          message: scaleRes.message,
          actionType: 'unreal_transform'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Inconveniente al escalar el objeto: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 10. Delete / Remove Actor
    const isDeleteMatch = text.includes('elimina') || text.includes('borra') || text.includes('eliminar') || text.includes('borrar') || text.includes('quita') || text.includes('quitar');
    if (isDeleteMatch && (text.includes('cubo') || text.includes('objeto') || text.includes('actor') || text.includes('esfera') || text.includes('ultimo') || text.includes('seleccionado') || isExplicitUnreal)) {
      try {
        const delRes = await unrealService.deleteActor();
        return {
          isCommand: true,
          message: delRes.message,
          actionType: 'unreal_delete'
        };
      } catch (e) {
        return { isCommand: true, message: `🎮 Inconveniente al eliminar de Unreal: ${e.message}`, actionType: 'unreal_error' };
      }
    }

    // 11. Open-Ended Natural Voice Order for ZIROAI.uplugin (any command mentioning Unreal / level / scene / ZiroHost)
    if (isExplicitUnreal) {
      const natRes = await unrealService.executeNaturalVoiceOrder(text);
      return {
        isCommand: true,
        message: natRes.message,
        actionType: 'unreal_ziroai_agent',
        detail: natRes
      };
    }

    return null;
  }

  extractColor(text) {
    const colors = ['fluor', 'neon', 'verde fluor', 'rojo', 'roja', 'verde', 'azul', 'amarillo', 'amarilla', 'naranja', 'morado', 'violeta', 'rosa', 'blanco', 'blanca', 'negro', 'dorado', 'oro', 'cyan', 'celeste'];
    for (const c of colors) {
      if (text.includes(c)) return c;
    }
    return null;
  }

  extractShape(text) {
    if (text.includes('cubo') || text.includes('caja') || text.includes('bloque')) return 'cubo';
    if (text.includes('esfera') || text.includes('pelota') || text.includes('bola')) return 'esfera';
    if (text.includes('cilindro') || text.includes('columna') || text.includes('tubo')) return 'cilindro';
    if (text.includes('cono')) return 'cono';
    if (text.includes('plano') || text.includes('piso') || text.includes('suelo')) return 'plano';
    return null;
  }
}

module.exports = new CommandService();
