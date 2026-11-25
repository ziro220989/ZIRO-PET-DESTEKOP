/**
 * ZIRO Internal Web & Weather Lookup Service
 * Busca información en internet (clima, datos, noticias, definiciones) internamente
 * mediante peticiones HTTP sin abrir el navegador del usuario.
 */

const WMO_CODES_ES = {
  0: 'cielo despejado',
  1: 'mayormente despejado',
  2: 'parcialmente nublado',
  3: 'cielo nublado',
  45: 'neblina',
  48: 'niebla con escarcha',
  51: 'llovizna leve',
  53: 'llovizna moderada',
  55: 'llovizna intensa',
  61: 'lluvia leve',
  63: 'lluvia moderada',
  65: 'lluvia fuerte',
  71: 'nevada leve',
  73: 'nevada moderada',
  75: 'nevada fuerte',
  80: 'chaparrones aislados',
  81: 'chaparrones moderados',
  82: 'chaparrones intensos',
  95: 'tormenta eléctrica',
  96: 'tormenta con granizo leve',
  99: 'tormenta fuerte con granizo'
};

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function stripHtml(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStr(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

class WebLookupService {
  async fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          ...(options.headers || {})
        }
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  isWeatherQuery(rawText) {
    const norm = normalizeStr(rawText);
    return /\b(clima|tiempo|temperatura|llover|lluvia|pronostico|calor|frio|grados|tormenta|nublado|sol)\b/.test(norm);
  }

  isInfoLookupQuery(rawText) {
    const norm = normalizeStr(rawText);
    if (this.isWeatherQuery(norm)) return true;
    return (
      /\b(busca|buscar|buscame|investiga|investigame|averigua|averiguame|googlea|googlear)\b/.test(norm) ||
      /\b(cuanto esta|precio del|cotizacion|dolar|quien es|que es|cuando juega|quien gano|noticias de)\b/.test(norm)
    );
  }

  async resolveLocation(cityHint) {
    if (cityHint) {
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityHint)}&count=1&language=es&format=json`;
        const res = await this.fetchWithTimeout(geoUrl, {}, 4500);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const r = data.results[0];
            return { name: r.name, lat: r.latitude, lon: r.longitude };
          }
        }
      } catch (_) {}
    }

    try {
      const ipRes = await this.fetchWithTimeout('http://ip-api.com/json/?fields=status,city,lat,lon', {}, 3500);
      if (ipRes.ok) {
        const ip = await ipRes.json();
        if (ip.status === 'success' && ip.lat && ip.lon) {
          return { name: ip.city || 'tu zona', lat: ip.lat, lon: ip.lon };
        }
      }
    } catch (_) {}

    return { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 };
  }

  extractTargetDayOffset(normText) {
    if (normText.includes('pasado manana')) return 2;
    if (normText.includes('manana')) return 1;
    if (normText.includes('hoy') || normText.includes('ahora')) return 0;

    const todayIdx = new Date().getDay();
    for (let i = 0; i < WEEKDAYS_ES.length; i++) {
      if (normText.includes(WEEKDAYS_ES[i])) {
        let diff = (i - todayIdx + 7) % 7;
        if (diff === 0 && !normText.includes('hoy')) diff = 7;
        return Math.min(7, diff);
      }
    }
    return 0;
  }

  async getWeatherAnswer(rawText) {
    const norm = normalizeStr(rawText);
    const cityMatch = norm.match(/\ben\s+([a-z\s]{3,28}?)(?:\s+(?:hoy|manana|el\s+\w+|en\s+google|$))/);
    let cityHint = cityMatch ? cityMatch[1].trim() : '';
    if (cityHint === 'google' || cityHint === 'internet') cityHint = '';

    const loc = await this.resolveLocation(cityHint);
    const offset = this.extractTargetDayOffset(norm);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&current_weather=true&timezone=auto&forecast_days=8`;
    const res = await this.fetchWithTimeout(url, {}, 5500);
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const data = await res.json();
    const daily = data.daily;
    if (!daily || !daily.time || !daily.time[offset]) {
      throw new Error('Pronóstico no disponible para ese día');
    }

    const code = daily.weathercode[offset];
    const desc = WMO_CODES_ES[code] || 'condiciones variables';
    const tMax = Math.round(daily.temperature_2m_max[offset]);
    const tMin = Math.round(daily.temperature_2m_min[offset]);
    const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[offset] : 0;

    const dateObj = new Date(`${daily.time[offset]}T12:00:00`);
    const dayLabel = offset === 0
      ? 'hoy'
      : offset === 1
        ? 'mañana'
        : `el ${WEEKDAYS_ES[dateObj.getDay()]}`;

    if (offset === 0 && data.current_weather) {
      const curTemp = Math.round(data.current_weather.temperature);
      return `Ahora en ${loc.name} hace ${curTemp} grados con ${desc}. Para hoy se espera una mínima de ${tMin}, máxima de ${tMax} grados y ${rainProb}% de probabilidad de lluvia.`;
    }

    return `Para ${dayLabel} en ${loc.name} se pronostica ${desc}, con una mínima de ${tMin} grados, máxima de ${tMax} y ${rainProb}% de probabilidad de lluvia.`;
  }

  cleanSearchQuery(rawText) {
    return (rawText || '')
      .replace(/\b(ziro|ciro|siro|por favor|entra en google y|entra a google y|en google|en internet|sin abrir el navegador|internamente)\b/gi, ' ')
      .replace(/^(?:busca|buscar|buscame|investiga|investigame|averigua|averiguame|googlea|decime|dime)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async searchWebInternal(rawText) {
    const query = this.cleanSearchQuery(rawText);
    if (!query) {
      return 'Decime qué querés que busque en internet y te lo averiguo al toque.';
    }

    // 1. Try DuckDuckGo HTML snippets (no browser, fast, reliable)
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await this.fetchWithTimeout(ddgUrl, {}, 6000);
      if (res.ok) {
        const html = await res.text();
        const matches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
        const snippets = matches
          .map(m => stripHtml(m[1]))
          .filter(s => s.length > 25)
          .slice(0, 2);

        if (snippets.length > 0) {
          const combined = snippets.join(' ').slice(0, 320).trim();
          return `Esto encontré buscando sobre ${query}: ${combined}`;
        }
      }
    } catch (_) {}

    // 2. Fallback to Wikipedia ES search + summary
    try {
      const wikiSearchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
      const sRes = await this.fetchWithTimeout(wikiSearchUrl, {}, 5000);
      if (sRes.ok) {
        const sData = await sRes.json();
        const firstTitle = sData?.query?.search?.[0]?.title;
        if (firstTitle) {
          const sumUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
          const sumRes = await this.fetchWithTimeout(sumUrl, {}, 4500);
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            if (sumData.extract) {
              const shortExtract = sumData.extract.split('. ').slice(0, 2).join('. ').trim();
              return `${shortExtract}.`;
            }
          }
        }
      }
    } catch (_) {}

    return `Intenté buscar "${query}" en internet, pero no pude obtener un resumen claro en este momento.`;
  }

  async answerQuery(rawText) {
    if (this.isWeatherQuery(rawText)) {
      try {
        return await this.getWeatherAnswer(rawText);
      } catch (e) {
        // Fallback to web search if weather API fails
        return await this.searchWebInternal(rawText);
      }
    }
    return await this.searchWebInternal(rawText);
  }
}

module.exports = new WebLookupService();
