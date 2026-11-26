/**
 * LucIA — Motor Híbrido Inteligente (31 Audios Locales Pre-Grabados + Fallback a Gemini)
 *
 * 1. El 99% de las interacciones del edificio (saludos, visitas, paquetes, códigos, horarios,
 *    técnicos UTE/OSE/Antel, emergencias, timeouts, QR) usan EXCLUSIVAMENTE los 31 audios `.m4a`
 *    pre-grabados en `public/audio/lucia/` (0 ms, $0, cero Gemini).
 * 2. SOLO si una consulta del visitante no se puede resolver localmente, llama a `/api/lucia-fallback`
 *    (Gemini 2.5 Flash) y reproduce el clip pre-grabado que corresponda o sintetiza con `/api/lucia-tts`
 *    (nunca usa la voz robótica del navegador).
 */

export type LuciaClipCategory =
  | 'greeting'
  | 'visit'
  | 'package'
  | 'visit-approved'
  | 'package-approved'
  | 'visit-rejected'
  | 'package-rejected'
  | 'code-valid'
  | 'code-invalid'
  | 'ask-repeat'
  | 'elderly-help'
  | 'no-answer'
  | 'unit-not-found'
  | 'package-ask-unit'
  | 'provider-help'
  | 'outside-schedule'
  | 'show-camera'
  | 'connecting-resident'
  | 'out-of-scope'
  | 'emergency';

export interface LuciaRecordedClip {
  id: string;
  category: LuciaClipCategory;
  file: string;
  text: string;
}

export interface LuciaVoiceInfo {
  label: string;
  lang: string;
  isNeuralApi: boolean;
}

export interface LuciaFallbackResult {
  usedGemini: boolean;
  clipCategory: LuciaClipCategory | 'none';
  replyText: string;
}

export const LUCIA_VOICE_LABEL = 'LucIA · 31 Audios Locales (+ Fallback Gemini)';

export const LUCIA_RECORDED_CLIPS: LuciaRecordedClip[] = [
  { id: 'greeting-1', category: 'greeting', file: '/audio/lucia/greeting-1.m4a', text: '¡Hola! Soy LucIA. ¿A qué apartamento venís o traés algún paquete?' },
  { id: 'greeting-2', category: 'greeting', file: '/audio/lucia/greeting-2.m4a', text: '¡Buenas! Hablás con LucIA. Decime a qué apartamento venís o si es una entrega.' },
  { id: 'greeting-3', category: 'greeting', file: '/audio/lucia/greeting-3.m4a', text: '¡Hola, qué tal! Soy LucIA, ¿con quién venís o a qué apartamento?' },
  { id: 'greeting-4', category: 'greeting', file: '/audio/lucia/greeting-4.m4a', text: '¡Buenas! Soy LucIA del edificio. ¿A qué apartamento venís?' },

  { id: 'visit-1', category: 'visit', file: '/audio/lucia/visit-1.m4a', text: 'Dale, dame un minuto que ya llamo para que te atiendan.' },
  { id: 'visit-2', category: 'visit', file: '/audio/lucia/visit-2.m4a', text: 'Bárbaro, aguantá un toque que ya le aviso al residente.' },
  { id: 'visit-3', category: 'visit', file: '/audio/lucia/visit-3.m4a', text: 'Perfecto, dame un segundito que ahí les mando aviso al celular.' },
  { id: 'visit-4', category: 'visit', file: '/audio/lucia/visit-4.m4a', text: 'Genial, ya les toqué timbre en la aplicación, esperá un toque.' },

  { id: 'package-1', category: 'package', file: '/audio/lucia/package-1.m4a', text: 'Bárbaro, dame un minuto que ya le aviso al celular por el paquete.' },
  { id: 'package-2', category: 'package', file: '/audio/lucia/package-2.m4a', text: 'Dale, aguantá un toque que ahí le notifico al residente para ver si lo reciben.' },
  { id: 'package-3', category: 'package', file: '/audio/lucia/package-3.m4a', text: 'Perfecto, ya mandé aviso al celular por la entrega, esperá un segundito.' },
  { id: 'package-4', category: 'package', file: '/audio/lucia/package-4.m4a', text: 'Genial, ahí consulto en el apartamento para que confirmen el paquete.' },

  { id: 'visit-approved-1', category: 'visit-approved', file: '/audio/lucia/visit-approved-1.m4a', text: '¡Listo! Ya te abrieron desde el celular, pasá tranquilo.' },
  { id: 'visit-approved-2', category: 'visit-approved', file: '/audio/lucia/visit-approved-2.m4a', text: '¡Impecable! Puerta abierta, pasá nomás.' },

  { id: 'package-approved-1', category: 'package-approved', file: '/audio/lucia/package-approved-1.m4a', text: '¡Listo! Aceptaron el paquete, ya te abrí el hall para dejarlo.' },
  { id: 'package-approved-2', category: 'package-approved', file: '/audio/lucia/package-approved-2.m4a', text: '¡Bárbaro! Confirmaron la entrega, podés pasar a dejar el paquete.' },

  { id: 'visit-rejected-1', category: 'visit-rejected', file: '/audio/lucia/visit-rejected-1.m4a', text: 'Disculpá, avisaron que ahora no pueden atender.' },
  { id: 'package-rejected-1', category: 'package-rejected', file: '/audio/lucia/package-rejected-1.m4a', text: 'Disculpá, avisaron que no pueden recibir ese paquete ahora.' },
  { id: 'code-valid-1', category: 'code-valid', file: '/audio/lucia/code-valid-1.m4a', text: '¡Perfecto! Código verificado, ya te abrí la puerta, pasá nomás.' },
  { id: 'code-invalid-1', category: 'code-invalid', file: '/audio/lucia/code-invalid-1.m4a', text: 'Disculpá, ese código no está activo o ya venció. Decime a qué apartamento venís.' },
  { id: 'ask-repeat-1', category: 'ask-repeat', file: '/audio/lucia/ask-repeat-1.m4a', text: 'Disculpá, no te escuché bien. ¿Me repetís a qué apartamento venís?' },
  { id: 'elderly-help-1', category: 'elderly-help', file: '/audio/lucia/elderly-help-1.m4a', text: 'Quedate tranquilo que no necesitás celular. Decime tu nombre y a qué apartamento venís que ya les aviso.' },

  // 9 clips adicionales (cobertura completa del edificio)
  { id: 'no-answer-1', category: 'no-answer', file: '/audio/lucia/no-answer-1.m4a', text: 'Disculpá, no atendieron en el apartamento. Intentá llamarlos por teléfono o probá en unos minutos.' },
  { id: 'unit-not-found-1', category: 'unit-not-found', file: '/audio/lucia/unit-not-found-1.m4a', text: 'Disculpá, ese apartamento no me figura registrado. ¿Me repetís el número?' },
  { id: 'package-ask-unit-1', category: 'package-ask-unit', file: '/audio/lucia/package-ask-unit-1.m4a', text: 'Bárbaro, ¿para qué apartamento es el paquete?' },
  { id: 'provider-help-1', category: 'provider-help', file: '/audio/lucia/provider-help-1.m4a', text: 'Dale, si tenés código de llave maestra decímelo ahora; si no, ya le aviso a la administración.' },
  { id: 'outside-schedule-1', category: 'outside-schedule', file: '/audio/lucia/outside-schedule-1.m4a', text: 'Tu permiso no está habilitado en este horario. Pedile al residente que te autorice desde la aplicación.' },
  { id: 'show-camera-1', category: 'show-camera', file: '/audio/lucia/show-camera-1.m4a', text: 'Acercá el código QR o la etiqueta a la cámara de arriba así lo leo.' },
  { id: 'connecting-resident-1', category: 'connecting-resident', file: '/audio/lucia/connecting-resident-1.m4a', text: 'Aguardá un toque que ya te comunico con el apartamento.' },
  { id: 'out-of-scope-1', category: 'out-of-scope', file: '/audio/lucia/out-of-scope-1.m4a', text: 'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.' },
  { id: 'emergency-1', category: 'emergency', file: '/audio/lucia/emergency-1.m4a', text: 'Entendido, ya doy aviso urgente al apartamento y a la administración.' },
];

let audioCtx: AudioContext | null = null;
let currentBufferSource: AudioBufferSourceNode | null = null;
let currentHtmlAudio: HTMLAudioElement | null = null;
let playbackGeneration = 0;
const decodedBufferCache = new Map<string, AudioBuffer>();
const lastIdxByCategory: Record<string, number> = {};

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

export function unlockLuciaAudio(): void {
  const ctx = getOrCreateAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

if (typeof window !== 'undefined') {
  const unlockOnce = () => unlockLuciaAudio();
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });
}

export function getLuciaActiveVoiceLabel(): string {
  return LUCIA_VOICE_LABEL;
}

export function pickLuciaClip(category: LuciaClipCategory): LuciaRecordedClip {
  const pool = LUCIA_RECORDED_CLIPS.filter((c) => c.category === category);
  if (pool.length === 0) return LUCIA_RECORDED_CLIPS[0];
  if (pool.length === 1) return pool[0];
  const prev = lastIdxByCategory[category] ?? -1;
  let next = Math.floor(Math.random() * pool.length);
  if (next === prev) {
    next = (prev + 1) % pool.length;
  }
  lastIdxByCategory[category] = next;
  return pool[next];
}

export function stopLuciaSpeech(): void {
  playbackGeneration++;
  if (currentBufferSource) {
    try {
      currentBufferSource.stop();
      currentBufferSource.disconnect();
    } catch {
      // Ignore
    }
    currentBufferSource = null;
  }
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    currentHtmlAudio = null;
  }
}

async function playBufferWithAudioContext(
  cacheKey: string,
  arrayBuffer: ArrayBuffer,
  gen: number
): Promise<boolean> {
  if (gen !== playbackGeneration) return false;
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      let decoded = decodedBufferCache.get(cacheKey);
      if (!decoded) {
        decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        decodedBufferCache.set(cacheKey, decoded);
      }
      if (gen !== playbackGeneration) return false;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = 1.08;
      source.connect(ctx.destination);
      currentBufferSource = source;
      source.onended = () => {
        if (currentBufferSource === source) currentBufferSource = null;
      };
      source.start(0);
      return true;
    } catch {
      // Caer a HTMLAudioElement con el mismo audio
    }
  }
  return false;
}

export async function playLuciaClipFile(
  fileUrl: string,
  onEngineResolved?: (info: LuciaVoiceInfo) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  stopLuciaSpeech();
  const myGen = playbackGeneration;

  onEngineResolved?.({
    label: LUCIA_VOICE_LABEL,
    lang: 'es-UY',
    isNeuralApi: false,
  });

  const ctx = getOrCreateAudioContext();
  if (ctx && decodedBufferCache.has(fileUrl)) {
    const decoded = decodedBufferCache.get(fileUrl)!;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (myGen !== playbackGeneration) return;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = 1.08;
      source.connect(ctx.destination);
      currentBufferSource = source;
      source.onended = () => {
        if (currentBufferSource === source) currentBufferSource = null;
      };
      source.start(0);
      return;
    } catch {
      // Seguir abajo
    }
  }

  try {
    const res = await fetch(fileUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const played = await playBufferWithAudioContext(fileUrl, buf, myGen);
      if (played) return;
    }
  } catch {
    // Seguir a HTMLAudioElement
  }

  try {
    if (myGen !== playbackGeneration) return;
    const audio = new Audio(fileUrl);
    audio.playbackRate = 1.08;
    currentHtmlAudio = audio;
    audio.onended = () => {
      if (currentHtmlAudio === audio) currentHtmlAudio = null;
    };
    await audio.play();
  } catch {
    // Jamás caer a speechSynthesis robótico del navegador
  }
}

/**
 * Escalado a Gemini 2.5 Flash SOLO cuando las reglas locales y los 31 audios no pueden resolver.
 */
export async function askLuciaGeminiFallback(params: {
  utterance: string;
  buildingName: string;
  knownUnits: string[];
}): Promise<LuciaFallbackResult> {
  try {
    const res = await fetch('/api/lucia-fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<LuciaFallbackResult>;
      return {
        usedGemini: Boolean(data.usedGemini),
        clipCategory: (data.clipCategory as LuciaClipCategory | 'none') || 'out-of-scope',
        replyText:
          data.replyText ||
          'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.',
      };
    }
  } catch {
    // Fallback local seguro
  }
  return {
    usedGemini: false,
    clipCategory: 'out-of-scope',
    replyText:
      'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.',
  };
}

/**
 * Reproduce una respuesta dinámica generada por el fallback de Gemini usando `/api/lucia-tts`.
 * Si Gemini TTS estuviera sin cuota, reproduce `out-of-scope-1.m4a` (nunca voz robótica del navegador).
 */
export async function speakGeminiFallbackReply(
  text: string,
  onEngineResolved?: (info: LuciaVoiceInfo) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  const spoken = text.replace(/\bLucIA\b/g, 'Lucía').trim();
  if (!spoken) return;

  stopLuciaSpeech();
  const myGen = playbackGeneration;

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14000);
    const res = await fetch('/api/lucia-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (myGen !== playbackGeneration) return;

    if (res.status === 200) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 512) {
        onEngineResolved?.({
          label: 'LucIA · Respuesta IA (Gemini Fallback)',
          lang: 'es-UY',
          isNeuralApi: true,
        });
        const played = await playBufferWithAudioContext(`gemini:${spoken}`, buf, myGen);
        if (played) return;
      }
    }
  } catch {
    // Si Gemini TTS falla o está sin cuota, reproducir clip grabado comodín
  }

  if (myGen === playbackGeneration) {
    const fallbackClip = pickLuciaClip('out-of-scope');
    await playLuciaClipFile(fallbackClip.file, onEngineResolved);
  }
}

export function playIntercomChime(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Ignore
  }
}
