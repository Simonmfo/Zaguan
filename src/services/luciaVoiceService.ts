/**
 * LucIA — Motor de Voz Humana Uruguaya / Rioplatense (100% Consistente con Gemini TTS)
 *
 * Soluciona las dos causas por las que antes saltaba a "Google español de Estados Unidos":
 * 1. Autoplay del navegador: usa un único `AudioContext` desbloqueado en el primer clic/toque,
 *    de modo que el audio WAV de Gemini suena siempre incluso tras `setTimeout(2000)` del mic
 *    o eventos `EventSource` que llegan desde el celular Android.
 * 2. Nunca cae silenciosamente a la voz del navegador cuando `GEMINI_API_KEY` está configurada:
 *    si Gemini devuelve 429/503 reintenta con pausa breve y cachea los audios ya sintetizados.
 */

export interface LuciaVoiceInfo {
  label: string;
  lang: string;
  isNeuralApi: boolean;
}

let audioCtx: AudioContext | null = null;
let currentBufferSource: AudioBufferSourceNode | null = null;
let currentFallbackAudio: HTMLAudioElement | null = null;
let activeFetchController: AbortController | null = null;
let speechGeneration = 0;
let cachedVoices: SpeechSynthesisVoice[] = [];
let activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
let serverMissingApiKey = false;
const decodedAudioCache = new Map<string, AudioBuffer>();
const rawArrayBufferCache = new Map<string, ArrayBuffer>();
const lastPhraseIdx: Record<string, number> = {};

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

/**
 * Desbloquea el AudioContext en el primer gesto del usuario (click/touch) para que
 * Gemini TTS pueda sonar después de timers (2s del micrófono) o eventos remotos del celular.
 */
export function unlockLuciaAudio(): void {
  const ctx = getOrCreateAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

if (typeof window !== 'undefined') {
  const unlockOnce = () => {
    unlockLuciaAudio();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });
}

function pickNoRepeat(key: string, options: string[]): string {
  if (options.length === 0) return '';
  if (options.length === 1) return options[0];
  const prev = lastPhraseIdx[key] ?? -1;
  let next = Math.floor(Math.random() * options.length);
  if (next === prev) {
    next = (prev + 1) % options.length;
  }
  lastPhraseIdx[key] = next;
  return options[next];
}

export function getLuciaGreeting(): string {
  return pickNoRepeat('greeting', [
    '¡Hola! Soy LucIA. ¿A qué apartamento venís o traés algún paquete?',
    '¡Buenas! Hablás con LucIA. Decime a qué apto venís o si es una entrega.',
    '¡Hola, qué tal! Soy LucIA, ¿con quién venís o a qué apartamento?',
    '¡Buenas! Soy LucIA del edificio. ¿A qué apto venís?',
  ]);
}

export function getLuciaVisitCallReply(
  visitorName: string,
  residentName: string,
  unit: string
): string {
  return pickNoRepeat('visit', [
    `Dale ${visitorName}, dame un minuto que llamo al ${unit} para que te atiendan.`,
    `Bárbaro ${visitorName}, aguantá un toque que ya le aviso a ${residentName} del ${unit}.`,
    `Perfecto ${visitorName}, dame un segundito que ya le toco al celular del ${unit}.`,
    `Genial ${visitorName}, ahí le mando aviso a ${residentName} del ${unit}, esperá un toque.`,
  ]);
}

export function getLuciaPackageCallReply(carrier: string, unit: string): string {
  return pickNoRepeat('package', [
    `Bárbaro, dame un minuto que ya le aviso al celular del ${unit} por el paquete de ${carrier}.`,
    `Dale, aguantá un toque que ahí le notifico al ${unit} para ver si reciben ${carrier}.`,
    `Perfecto, ya le mandé aviso al ${unit} por la entrega de ${carrier}, esperá un segundito.`,
    `Genial, ahí llamo al celular del ${unit} para que confirmen el paquete de ${carrier}.`,
  ]);
}

export function getLuciaApprovedReply(unit: string, isPackage: boolean): string {
  if (isPackage) {
    return pickNoRepeat('pkg-approved', [
      `¡Listo! Del ${unit} aceptaron el paquete, ya te abrí el hall, pasá nomás.`,
      `¡Bárbaro! Te habilitaron el zaguán para dejar la entrega, pasá tranquilo.`,
      `¡Impecable! Confirmaron el paquete en el ${unit}, ya podés dejarlo adentro.`,
    ]);
  }
  return pickNoRepeat('visit-approved', [
    `¡Listo! Ya te abrieron del ${unit}, pasá tranquilo.`,
    `¡Impecable! Te acaban de abrir desde el celular, pasá nomás.`,
    `¡Bárbaro! Puerta abierta, podés pasar.`,
  ]);
}

export function getLuciaRejectedReply(unit: string, isPackage: boolean): string {
  if (isPackage) {
    return pickNoRepeat('pkg-rejected', [
      `Disculpá, del ${unit} avisaron que no pueden recibir el paquete ahora.`,
      `Che, disculpá, en el ${unit} indicaron que no reciben esa entrega.`,
    ]);
  }
  return pickNoRepeat('visit-rejected', [
    `Disculpá, del ${unit} avisaron que ahora no pueden atender.`,
    `Che, disculpá, desde el ${unit} indicaron que ahora no reciben visitas.`,
  ]);
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) {
    cachedVoices = list;
  }
  return cachedVoices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    refreshVoices();
  });
}

function scoreRioplatenseFemaleVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase();
  let score = 0;

  const maleHints = [
    'mateo',
    'tomas',
    'tomás',
    'diego',
    'jorge',
    'carlos',
    'pablo',
    'alvaro',
    'álvaro',
    'juan',
    'emilio',
    'raul',
    'raúl',
    'gonzalo',
    'male',
    'hombre',
    'enrique',
  ];
  if (maleHints.some((h) => name.includes(h))) score -= 120;

  if (lang === 'es-uy' || lang.startsWith('es-uy')) score += 140;
  else if (lang === 'es-ar' || lang.startsWith('es-ar')) score += 120;
  else if (lang === 'es-419' || lang === 'es-us') score += 75;
  else if (lang.startsWith('es-')) score += 50;
  else return -999;

  if (name.includes('valentina')) score += 95;
  if (name.includes('elena')) score += 90;
  if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 55;
  if (name.includes('premium') || name.includes('enhanced')) score += 45;
  if (name.includes('google español') || name.includes('google spanish')) score += 40;

  return score;
}

export function pickBestLuciaBrowserVoice(): SpeechSynthesisVoice | null {
  const voices = refreshVoices();
  if (voices.length === 0) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -500;
  for (const v of voices) {
    const s = scoreRioplatenseFemaleVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore > -100 ? best : null;
}

export function stopLuciaSpeech(): void {
  speechGeneration++;
  if (activeFetchController) {
    try {
      activeFetchController.abort();
    } catch {
      // Ignore
    }
    activeFetchController = null;
  }
  if (currentBufferSource) {
    try {
      currentBufferSource.stop();
      currentBufferSource.disconnect();
    } catch {
      // Ignore
    }
    currentBufferSource = null;
  }
  if (currentFallbackAudio) {
    try {
      currentFallbackAudio.pause();
      currentFallbackAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    currentFallbackAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

export function getLuciaActiveVoiceLabel(): string {
  return activeVoiceLabel;
}

function prepareSpokenUruguayanText(raw: string): string {
  return raw
    .replace(/\bLucIA\b/g, 'Lucía')
    .replace(/\bApto\.?\s*/gi, 'apartamento ')
    .replace(/\bE12W\b/gi, 'portero')
    .replace(/\bOCR\b/gi, 'escaneo')
    .replace(/\b1080p\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function playGeminiArrayBuffer(
  cacheKey: string,
  arrayBuffer: ArrayBuffer,
  gen: number
): Promise<boolean> {
  if (gen !== speechGeneration) return false;

  // Preferir AudioContext (inmune a bloqueos de autoplay tras setTimeout o EventSource)
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      let decoded = decodedAudioCache.get(cacheKey);
      if (!decoded) {
        decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        decodedAudioCache.set(cacheKey, decoded);
      }
      if (gen !== speechGeneration) return false;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = 1.12;
      source.connect(ctx.destination);
      currentBufferSource = source;
      source.onended = () => {
        if (currentBufferSource === source) currentBufferSource = null;
      };
      source.start(0);
      return true;
    } catch {
      // Caer a HTMLAudioElement con el mismo WAV de Gemini (NO a speechSynthesis)
    }
  }

  try {
    if (gen !== speechGeneration) return false;
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = 1.12;
    currentFallbackAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentFallbackAudio === audio) currentFallbackAudio = null;
    };
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

async function fetchGeminiAudioOnce(
  spokenText: string,
  gen: number
): Promise<{ status: number; buffer?: ArrayBuffer }> {
  const controller = new AbortController();
  activeFetchController = controller;
  const timer = window.setTimeout(() => controller.abort(), 16000);
  try {
    const res = await fetch('/api/lucia-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spokenText }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (gen !== speechGeneration) return { status: 0 };
    if (res.status === 200) {
      const buf = await res.arrayBuffer();
      return { status: 200, buffer: buf };
    }
    return { status: res.status };
  } catch {
    window.clearTimeout(timer);
    return { status: 0 };
  } finally {
    if (activeFetchController === controller) {
      activeFetchController = null;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function speakAsLucia(
  rawText: string,
  onEngineResolved?: (info: LuciaVoiceInfo) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  const spokenText = prepareSpokenUruguayanText(rawText);
  if (!spokenText) return;

  stopLuciaSpeech();
  const myGen = speechGeneration;

  // 0. Reproducir desde caché local de Gemini en 0 ms (siempre exactamente la misma voz)
  const cachedBuf = rawArrayBufferCache.get(spokenText);
  if (cachedBuf) {
    activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
    onEngineResolved?.({ label: activeVoiceLabel, lang: 'es-UY', isNeuralApi: true });
    await playGeminiArrayBuffer(spokenText, cachedBuf, myGen);
    return;
  }

  // 1. Si el servidor tiene GEMINI_API_KEY, usar SIEMPRE Gemini (con reintento en 429/503, SIN cambiar a voz rara)
  if (!serverMissingApiKey) {
    let attempt = await fetchGeminiAudioOnce(spokenText, myGen);
    if (myGen !== speechGeneration) return;

    if (attempt.status === 501) {
      serverMissingApiKey = true;
    } else {
      // Si dio 429 (límite por minuto) o 503 temporal, esperar breve pausa y reintentar 1 vez con Gemini
      if ((attempt.status === 429 || attempt.status === 503) && myGen === speechGeneration) {
        activeVoiceLabel =
          attempt.status === 429
            ? 'LucIA · Reintentando Gemini (límite por minuto)...'
            : 'LucIA · Conectando voz Gemini...';
        onEngineResolved?.({ label: activeVoiceLabel, lang: 'es-UY', isNeuralApi: true });
        await delay(attempt.status === 429 ? 2200 : 800);
        if (myGen !== speechGeneration) return;
        attempt = await fetchGeminiAudioOnce(spokenText, myGen);
        if (myGen !== speechGeneration) return;
      }

      if (attempt.status === 200 && attempt.buffer && attempt.buffer.byteLength > 512) {
        rawArrayBufferCache.set(spokenText, attempt.buffer);
        activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
        onEngineResolved?.({ label: activeVoiceLabel, lang: 'es-UY', isNeuralApi: true });
        await playGeminiArrayBuffer(spokenText, attempt.buffer, myGen);
        return;
      }

      // Si Gemini está configurado pero dio 429/error puntual, NO saltar a "Google español de Estados Unidos"
      activeVoiceLabel =
        attempt.status === 429
          ? 'LucIA · Límite de cuota Gemini (esperá unos segundos)'
          : 'LucIA · Gemini TTS no respondió (sin voz robótica)';
      onEngineResolved?.({ label: activeVoiceLabel, lang: 'es-UY', isNeuralApi: true });
      return;
    }
  }

  if (myGen !== speechGeneration) return;

  // 2. Solo si NO existe GEMINI_API_KEY en el servidor (HTTP 501), usar voz del navegador
  if (!('speechSynthesis' in window)) return;
  try {
    const bestVoice = pickBestLuciaBrowserVoice();
    const utter = new SpeechSynthesisUtterance(spokenText);
    if (bestVoice) {
      utter.voice = bestVoice;
      utter.lang = bestVoice.lang;
      activeVoiceLabel = `LucIA · ${bestVoice.name.replace(/Microsoft |Online \(Natural\) - /gi, '')} (${bestVoice.lang})`;
      onEngineResolved?.({
        label: activeVoiceLabel,
        lang: bestVoice.lang,
        isNeuralApi: false,
      });
    } else {
      utter.lang = 'es-UY';
      onEngineResolved?.({
        label: 'LucIA · Voz Uruguaya (es-UY)',
        lang: 'es-UY',
        isNeuralApi: false,
      });
    }
    utter.rate = 1.18;
    utter.pitch = 1.04;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignorar si el navegador bloquea speechSynthesis
  }
}
