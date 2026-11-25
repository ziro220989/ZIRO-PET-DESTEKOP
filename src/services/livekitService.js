const crypto = require('crypto');

class LiveKitService {
  constructor() {
    this.config = {
      enabled: true,
      alwaysListening: true,
      wakeWord: 'activar ziro',
      vadThreshold: 8,
      silenceMs: 1050,
      mode: 'direct-webrtc', // 'direct-webrtc' (Zero-config local LiveKit VAD) | 'cloud-room' (LiveKit wss:// server)
      serverUrl: 'wss://ziro-livekit.livekit.cloud',
      roomName: 'ziro-pet-live-call',
      apiKey: '',
      apiSecret: ''
    };
    this.callActive = true;
    this.wakeActivated = true;
    this.lastWakeTime = Date.now();
  }

  configure(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    if (typeof newConfig.enabled === 'boolean') {
      this.callActive = newConfig.enabled;
    }
    return this.config;
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      callActive: this.callActive,
      wakeActivated: this.wakeActivated,
      wakeWord: this.config.wakeWord || 'activar ziro',
      mode: this.config.mode,
      roomName: this.config.roomName,
      serverUrl: this.config.serverUrl,
      hasCloudCredentials: Boolean(this.config.apiKey && this.config.apiSecret),
      lastWakeTime: this.lastWakeTime
    };
  }

  /**
   * Generates a standard LiveKit JWT Access Token (HMAC-SHA256) for connecting to a LiveKit Room
   */
  generateRoomToken(participantName = 'usuario-ziro') {
    const apiKey = this.config.apiKey || 'devkey';
    const apiSecret = this.config.apiSecret || 'secret';
    const roomName = this.config.roomName || 'ziro-pet-live-call';

    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: apiKey,
      sub: participantName,
      nbf: now,
      exp: now + 86400,
      name: participantName,
      video: {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      }
    };

    const base64Url = (obj) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const unsigned = `${base64Url(header)}.${base64Url(payload)}`;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(unsigned)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${unsigned}.${signature}`;
  }

  /**
   * Evaluates whether a transcribed phrase contains the "activar ziro" wake word or call control command.
   * Returns { matched: boolean, type: 'wake'|'wake_with_command'|'sleep', remainingText?: string, reply?: string }
   */
  evaluateWakeWord(normalizedText) {
    const t = (normalizedText || '').trim();
    if (!t) return { matched: false };

    // 1. Deactivate / Standby / Silence command ("desactívate, ziro", "ziro, modo silencio", "ziro desactivar", etc.)
    if (
      /\b(desactivar|desactiva|desactivate|pausar|pausa|cortar|terminar|silenciar|silenciate|callate|callar|apagar|apagate|mute)\s+(?:a\s+)?(ziro|ciro|siro|giro|zero|xiro|llamada|voz|audio)\b/.test(t) ||
      /\b(ziro|ciro|siro|giro|zero|xiro)\s+(desactivar|desactiva|desactivate|pausar|pausa|silenciar|silenciate|callate|callar|apagar|apagate|mute|modo silencio|silencio|no hables|no hables mas|deja de hablar)\b/.test(t) ||
      t === 'modo espera' || t === 'modo silencio' || t === 'cortar llamada' || t === 'no hables mas' || t === 'callate'
    ) {
      this.wakeActivated = false;
      return {
        matched: true,
        type: 'sleep',
        reply: '🔇 Ziro en modo silencio. Di "Actívate, Ziro" o "Ziro, vuelve a hablar" para reactivar mi voz.'
      };
    }

    // 2. Wake Word detection ("actívate ziro", "ziro vuelve a hablar", "activar ziro", etc.)
    const wakeRegex = /^(?:(?:por favor\s+)?(?:activar|activa|activate|activado|hola|oye|hey|ok|escucha|escuchame|despierta)\s+(?:a\s+)?(?:ziro|ciro|siro|giro|zero|xiro|chiro|tiro|mascota)|vuelve a hablar(?:\s+(?:ziro|ciro|siro))?)\b(.*)$/i;
    const wakeReverseRegex = /^(?:ziro|ciro|siro|giro|zero|xiro)\s+(?:activar|activa|activate|hablar|habla|vuelve a hablar|despierta|despertar|escucha|escuchame)\b(.*)$/i;
    const match = t.match(wakeRegex) || t.match(wakeReverseRegex);

    if (match || t === 'ziro' || t === 'ciro' || t === 'siro' || t === 'activar' || t === 'activar mascota') {
      this.callActive = true;
      this.wakeActivated = true;
      this.lastWakeTime = Date.now();

      const remainder = match && match[1] ? match[1].trim() : '';
      if (remainder.length >= 3) {
        return {
          matched: true,
          type: 'wake_with_command',
          remainingText: remainder
        };
      }

      return {
        matched: true,
        type: 'wake',
        reply: '¡Ziro activado en llamada en vivo! Te escucho en tiempo real sin tocar ningún botón. ¿Qué necesitas?'
      };
    }

    // Also check if "activar ziro" appears anywhere inside a short phrase
    const inlineWake = t.match(/\b(?:activar|activa)\s+(?:ziro|ciro|siro|giro|zero|xiro|mascota)\b(.*)$/i);
    if (inlineWake) {
      this.callActive = true;
      this.wakeActivated = true;
      this.lastWakeTime = Date.now();
      const rem = (inlineWake[1] || '').trim();
      if (rem.length >= 3) {
        return {
          matched: true,
          type: 'wake_with_command',
          remainingText: rem
        };
      }
      return {
        matched: true,
        type: 'wake',
        reply: '¡Ziro activado en llamada en vivo! Te escucho fuerte y claro. Dime qué hacemos.'
      };
    }

    return { matched: false };
  }
}

module.exports = new LiveKitService();
