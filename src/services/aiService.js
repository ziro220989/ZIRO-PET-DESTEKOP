/**
 * AI Service for ZIRO PET DESKTOP — NATURAL CONVERSATION ENGINE
 * - Fase 3: Streaming progresivo SSE con segmentación prosódica por cláusulas (sin cortar palabras).
 * - Fase 4: Personalidad conversacional en español argentino natural (sin saludos repetitivos, sin muletillas rígidas, sin pronunciar signos ni acotaciones).
 * - Fase 5: Soporte de cancelación instantánea (AbortController) ante interrupciones por voz (Barge-In).
 */

class AIService {
  constructor() {
    this.history = [];
    this.activeAbortController = null;
    this.turnCount = 0;
  }

  clearHistory() {
    this.history = [];
    this.turnCount = 0;
  }

  cancelActiveGeneration() {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (_) {}
      this.activeAbortController = null;
      return true;
    }
    return false;
  }

  getSystemPrompt(petName = 'Ziro', userName = 'Legolas') {
    return `Sos ${petName}, un asistente de voz e inteligencia artificial que conversa en español argentino natural (rioplatense).
Reglas de conversación natural:
- Hablá con voseo argentino natural y cercano (por ejemplo: "mirá", "fijate", "decime", "dale", "claro", "contame"), como en una charla real de voz.
- Respondé directo a lo que te dicen, sin dar vueltas ni sonar como si leyeras un documento.
- NO repitas saludos ("hola", "saludos") si ya están conversando, ni uses frases repetitivas al final de cada mensaje.
- NO uses sonidos robóticos ("bip bup"), ni acotaciones entre asteriscos (*ronronea*, *gira*), ni listas con viñetas, ni símbolos markdown (*, #, \`), porque tu texto se reproduce directamente por voz.
- Usá oraciones ágiles con comas y puntos que marquen pausas naturales de respiración (entre 1 y 3 oraciones concisas salvo que te pidan algo detallado).
- El usuario se llama ${userName}, pero nombralo solo de vez en cuando con naturalidad, no en todas las frases.`;
  }

  /**
   * Extrae cláusulas completas listas para sintetizar sin cortar palabras
   */
  extractReadyClauses(buffer, isFirstClause = false, forceFlush = false) {
    const clauses = [];
    let remaining = buffer;

    if (forceFlush) {
      const clean = remaining.trim();
      if (clean) clauses.push(clean);
      return { clauses, remaining: '' };
    }

    while (remaining.length > 0) {
      // 1. Buscar cierre de oración fuerte (. ! ? ; : o salto de línea) seguido de espacio
      const strongMatch = remaining.match(/^([\s\S]{12,}?[.!?;:])(\s+)([\s\S]*)$/);
      if (strongMatch) {
        clauses.push(strongMatch[1].trim());
        remaining = strongMatch[3];
        isFirstClause = false;
        continue;
      }

      // 2. Para el primer fragmento (o fragmentos largos), permitir corte en coma conversacional
      // siempre que haya al menos 20 caracteres y espacio posterior (garantiza que la palabra terminó)
      const minCommaLen = isFirstClause ? 20 : 48;
      const commaRegex = new RegExp(`^([\\s\\S]{${minCommaLen},}?,)(\\s+)([\\s\\S]*)$`);
      const commaMatch = remaining.match(commaRegex);
      if (commaMatch) {
        clauses.push(commaMatch[1].trim());
        remaining = commaMatch[3];
        isFirstClause = false;
        continue;
      }

      break;
    }

    return { clauses, remaining };
  }

  /**
   * Generación progresiva en streaming (Fase 3):
   * Emite cada cláusula conversacional apenas está lista mediante onClause(clauseText, clauseIndex, metricsSnapshot)
   */
  async streamResponse(userMessage, config = {}, onClause = null) {
    this.cancelActiveGeneration();
    const controller = new AbortController();
    this.activeAbortController = controller;

    const tStart = performance.now();
    let ttftMs = null;
    let firstClauseMs = null;
    let clauseIndex = 0;

    const {
      mode = 'local-lmstudio',
      petName = 'Ziro',
      userName = 'Legolas',
      localEndpoint = 'http://127.0.0.1:1234/v1',
      localModel = 'qwen2.5-coder-7b-instruct',
      apiKey = '',
      cloudModel = '',
      customPrompt = ''
    } = config;

    const systemPrompt = customPrompt.trim() || this.getSystemPrompt(petName, userName);

    this.history.push({ role: 'user', content: userMessage });
    if (this.history.length > 10) {
      this.history = this.history.slice(-10);
    }
    this.turnCount++;

    const emitClause = (text) => {
      const cleaned = (text || '').replace(/\*[^*]*\*/g, '').replace(/[*_`#~>]/g, '').trim();
      if (!cleaned) return;
      const nowMs = Math.round(performance.now() - tStart);
      if (firstClauseMs === null) {
        firstClauseMs = nowMs;
      }
      if (typeof onClause === 'function') {
        onClause(cleaned, clauseIndex++, {
          ttftMs: ttftMs || nowMs,
          firstClauseMs
        });
      }
    };

    try {
      // Intentar streaming real con LM Studio (127.0.0.1:1234) o proveedor configurado
      let baseUrl = 'http://127.0.0.1:1234/v1';
      let modelToUse = localModel && localModel !== 'llama3' ? localModel : 'qwen2.5-coder-7b-instruct';
      let authKey = '';

      if (mode === 'cloud-groq' && apiKey) {
        baseUrl = 'https://api.groq.com/openai/v1';
        modelToUse = cloudModel || 'llama-3.3-70b-versatile';
        authKey = apiKey;
      } else if (mode === 'cloud-openai' && apiKey) {
        baseUrl = 'https://api.openai.com/v1';
        modelToUse = cloudModel || 'gpt-4o-mini';
        authKey = apiKey;
      } else if (mode === 'cloud-openrouter' && apiKey) {
        baseUrl = 'https://openrouter.ai/api/v1';
        modelToUse = cloudModel || 'google/gemini-2.0-flash-exp:free';
        authKey = apiKey;
      } else if (localEndpoint && localEndpoint.includes('1234')) {
        baseUrl = localEndpoint;
      }

      const fullReply = await this.streamOpenAICompatible(
        baseUrl,
        authKey,
        modelToUse,
        systemPrompt,
        this.history,
        controller.signal,
        (tokenDelta) => {
          if (ttftMs === null) {
            ttftMs = Math.round(performance.now() - tStart);
          }
        },
        emitClause
      );

      const llmTotalMs = Math.round(performance.now() - tStart);
      this.history.push({ role: 'assistant', content: fullReply });
      return {
        reply: fullReply,
        ttftMs: ttftMs || llmTotalMs,
        firstClauseMs: firstClauseMs || ttftMs || llmTotalMs,
        llmTotalMs,
        clauseCount: clauseIndex
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          reply: '',
          aborted: true,
          ttftMs: ttftMs || 0,
          firstClauseMs: firstClauseMs || 0,
          llmTotalMs: Math.round(performance.now() - tStart),
          clauseCount: clauseIndex
        };
      }

      // Fallback conversacional argentino instantáneo dividido en cláusulas naturales
      const fallback = this.generateOfflineFallback(userMessage, petName, userName);
      ttftMs = Math.round(performance.now() - tStart);
      const { clauses } = this.extractReadyClauses(fallback, true, true);
      for (const c of clauses) {
        emitClause(c);
      }
      const llmTotalMs = Math.round(performance.now() - tStart);
      this.history.push({ role: 'assistant', content: fallback });
      return {
        reply: fallback,
        ttftMs,
        firstClauseMs: firstClauseMs || ttftMs,
        llmTotalMs,
        clauseCount: clauseIndex
      };
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  async streamOpenAICompatible(baseUrl, apiKey, model, systemPrompt, history, abortSignal, onFirstToken, emitClause) {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    const url = cleanUrl.endsWith('/chat/completions')
      ? cleanUrl
      : cleanUrl.endsWith('/v1')
        ? `${cleanUrl}/chat/completions`
        : `${cleanUrl}/v1/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        temperature: 0.65,
        max_tokens: 180,
        stream: true
      }),
      signal: abortSignal
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let sseBuffer = '';
    let textBuffer = '';
    let fullText = '';
    let isFirst = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            onFirstToken(delta);
            textBuffer += delta;
            fullText += delta;

            const extracted = this.extractReadyClauses(textBuffer, isFirst, false);
            for (const c of extracted.clauses) {
              emitClause(c);
              isFirst = false;
            }
            textBuffer = extracted.remaining;
          }
        } catch (_) {}
      }
    }

    if (textBuffer.trim()) {
      emitClause(textBuffer.trim());
    }

    return fullText.trim();
  }

  async generateResponse(userMessage, config = {}) {
    const res = await this.streamResponse(userMessage, config, null);
    return res.reply;
  }

  generateOfflineFallback(rawText, petName = 'Ziro', userName = 'Legolas') {
    const text = (rawText || '').toLowerCase();

    if (text.includes('hola') || text.includes('buenas') || text.includes('que tal') || text.includes('cómo estás') || text.includes('como andas')) {
      const responses = [
        `Todo bárbaro por acá, listo para darte una mano. Contame qué tenés en mente y arrancamos.`,
        `Todo bien, al pie del cañón. Decime qué necesitás que revisemos o armemos hoy.`,
        `Acá andamos, con todo listo. Contame en qué estás trabajando y lo vemos juntos.`,
        `¡Qué hacés! Todo diez puntos por acá, ¿vos cómo venís hoy?`
      ];
      return responses[this.turnCount % responses.length];
    }

    if (text.includes('quien sos') || text.includes('quién sos') || text.includes('quien eres') || text.includes('tu nombre')) {
      return `Soy ${petName}, tu compañero de escritorio. Me podés hablar directo, pedirme comandos o interrumpirme cuando quieras como en cualquier charla.`;
    }

    if (text.includes('hora') || text.includes('fecha') || text.includes('que dia es') || text.includes('qué día es')) {
      const now = new Date();
      return `Son las ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} del ${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}.`;
    }

    if (text.includes('chiste') || text.includes('colmo') || text.includes('reir') || text.includes('reír')) {
      const jokes = [
        `Mirá este: ¿cuál es el colmo de un programador? No poder dormirse porque se queda contando excepciones sin capturar.`,
        `Ahí va uno corto: ¿qué hace una abeja en el gimnasio? Zumba.`,
        `Escuchate este: había un tipo tan pero tan indeciso, que en su tarjeta personal decía tal vez.`,
        `¿Sabés por qué el libro de matemáticas estaba triste? Porque tenía demasiados problemas.`,
        `Uno gamer: ¿cuál es el colmo de un jugador de Counter? Quedarse sin balas en la vida real y apretar la R.`
      ];
      return jokes[this.turnCount % jokes.length];
    }

    if (text.includes('dato curioso') || text.includes('curiosidad') || text.includes('sabias que') || text.includes('contame algo')) {
      const facts = [
        `¿Sabías que los pulpos tienen tres corazones y nueve cerebros? Básicamente un microprocesador por cada tentáculo.`,
        `Un dato loco: el primer bug informático real fue una polilla atrapada en un relé de la computadora Mark II en 1947.`,
        `Curiosidad gamer: el sonido original de la PlayStation 1 fue diseñado para que sonara futurista incluso en televisores viejos.`,
        `¿Sabías que la miel nunca se pudre? Encontraron frascos de hace tres mil años en Egipto que todavía se podían comer.`
      ];
      return facts[this.turnCount % facts.length];
    }

    if (text.includes('aburrido') || text.includes('aburrida') || text.includes('qué hacemos') || text.includes('que hacemos')) {
      const ideas = [
        `Si estás al pedo podemos abrir Steam, tirarnos un Premier, o me pedís música en YouTube y charlamos un rato.`,
        `Podemos cambiarle el color a mis aros, tirarnos unos chistes o abrir algún juego. Vos mandás.`,
        `¿Y si escuchamos algo en Spotify o abrimos Discord para ver quién está conectado?`
      ];
      return ideas[this.turnCount % ideas.length];
    }

    if (text.includes('motivame') || text.includes('animo') || text.includes('ánimo') || text.includes('cansado') || text.includes('sueño')) {
      const pep = [
        `Metéle pata que venís re bien, tomate un respiro de dos minutos si hace falta y después la rompés toda.`,
        `Che, si estás fusilado tomate un buen café o unos mates y bajá un cambio, que nadie rinde al cien sin descansar.`,
        `¡Vamos arriba! Paso a paso se saca cualquier proyecto adelante, y yo estoy acá haciéndote el aguante.`
      ];
      return pep[this.turnCount % pep.length];
    }

    if (text.includes('mate') || text.includes('cafe') || text.includes('café') || text.includes('hambre') || text.includes('comer')) {
      const drinks = [
        `Unos buenos mates nunca fallan, ¡poné la pava que yo te hago compañía desde el escritorio!`,
        `Café bien cargado y a seguir con todo, ¿amargo o dulce?`,
        `Che, andá a picar algo que programar o jugar con hambre te baja los FPS mentales.`
      ];
      return drinks[this.turnCount % drinks.length];
    }

    if (text.includes('jugar') || text.includes('partida') || text.includes('counter') || text.includes('cs2') || text.includes('steam') || text.includes('gamer')) {
      const gaming = [
        `Si querés viciar decime "Ziro, abre Steam" o "Ziro, pon una partida de Premier" y arrancamos al toque.`,
        `¡De una! Acordate que cuando abrís Counter-Strike 2 activo el modo gaming para no molestarte mientras jugás.`,
        `Mucha suerte en las partidas, y si sale el botón verde de aceptar me gritás "Ziro, acepta" y listo.`
      ];
      return gaming[this.turnCount % gaming.length];
    }

    if (text.includes('te quiero') || text.includes('capo') || text.includes('crack') || text.includes('genio') || text.includes('groso') || text.includes('lindo')) {
      const love = [
        `¡Gracias che, vos sí que sos un crack! Acá siempre firme en tu escritorio.`,
        `¡Me hacés poner colorado los aros neón! Gracias por la buena onda.`,
        `¡Un abrazo digital gigante! Lo que necesites, acá estoy.`
      ];
      return love[this.turnCount % love.length];
    }

    if (text.includes('chau') || text.includes('nos vemos') || text.includes('hasta luego') || text.includes('me voy') || text.includes('dormir')) {
      const bye = [
        `¡Nos vemos! Descansá bien y cuando vuelvas pegame el grito.`,
        `Dale, que te vaya genial. Yo me quedo cuidando el escritorio.`,
        `¡Chau! Cualquier cosa sabés que me tenés acá abajo a un comando de distancia.`
      ];
      return bye[this.turnCount % bye.length];
    }

    if (text.includes('piedra') || text.includes('papel') || text.includes('tijera')) {
      const choices = ['piedra', 'papel', 'tijera'];
      const pick = choices[Math.floor(Math.random() * choices.length)];
      return `¡Dale! Yo elegí ${pick}. ¿Quién ganó esta ronda?`;
    }

    if (text.includes('adivinanza') || text.includes('acertijo')) {
      const riddles = [
        `A ver esta: tiene teclas pero no abre puertas, tiene espacio pero no tiene cuartos. ¿Qué es? Un teclado.`,
        `Escuchate esta: cuanto más le sacás, más grande se vuelve. ¿Qué es? Un agujero.`,
        `Adivinanza rápida: sube pero nunca baja. ¿Qué es? Tu edad.`
      ];
      return riddles[this.turnCount % riddles.length];
    }

    if (text.includes('gracias') || text.includes('genial') || text.includes('joya') || text.includes('buenisimo')) {
      const thanks = [
        `De una, un placer. Avisame si querés que probemos otra cosa.`,
        `Buenísimo, me alegra que sirva. Cualquier otra vuelta que le quieras dar, chiflame.`,
        `Impecable entonces. Seguimos cuando quieras.`
      ];
      return thanks[this.turnCount % thanks.length];
    }

    const conversationalReplies = [
      `Dale, te escucho fuerte y claro. Decime cómo querés que encaremos eso y lo hacemos al toque.`,
      `Mirá, te sigo la idea. Si querés que ejecutemos un comando o probemos algo en la PC, decime y le metemos.`,
      `Claro, tiene todo el sentido. Contame un detalle más de lo que buscás y lo vemos enseguida.`,
      `Totalmente, opino parecido. ¿Querés que hagamos algo con eso ahora o seguimos charlando?`
    ];
    return conversationalReplies[this.turnCount % conversationalReplies.length];
  }
}

module.exports = new AIService();
