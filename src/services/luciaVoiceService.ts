/**
 * LucIA — Reproductor 100% Local de Audios Pre-Grabados (Voz Uruguaya, Cero API Gemini en ejecución)
 *
 * Reproduce los 22 audios uruguayos pre-grabados en `public/audio/lucia/*.m4a`:
 * - Latencia 0 ms · Costo $0 por llamada · Sin cuota 429
 * - Nunca usa Gemini ni `speechSynthesis` del navegador (voz 100% idéntica siempre)
 * - Usa `AudioContext` desbloqueado en el primer toque para sonar incluso tras timers (2s mic)
 *   o respuestas que llegan desde el celular Android por `EventSource`.
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
  | 'elderly-help';

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

export const LUCIA_VOICE_LABEL = 'LucIA · Voz Uruguaya Grabada (Local · Sin API)';

export const LUCIA_RECORDED_CLIPS: LuciaRecordedClip[] = [
  {
    id: 'greeting-1',
    category: 'greeting',
    file: '/audio/lucia/greeting-1.m4a',
    text: '¡Hola! Soy LucIA. ¿A qué apartamento venís o traés algún paquete?',
  },
  {
    id: 'greeting-2',
    category: 'greeting',
    file: '/audio/lucia/greeting-2.m4a',
    text: '¡Buenas! Hablás con LucIA. Decime a qué apartamento venís o si es una entrega.',
  },
  {
    id: 'greeting-3',
    category: 'greeting',
    file: '/audio/lucia/greeting-3.m4a',
    text: '¡Hola, qué tal! Soy LucIA, ¿con quién venís o a qué apartamento?',
  },
  {
    id: 'greeting-4',
    category: 'greeting',
    file: '/audio/lucia/greeting-4.m4a',
    text: '¡Buenas! Soy LucIA del edificio. ¿A qué apartamento venís?',
  },
  {
    id: 'visit-1',
    category: 'visit',
    file: '/audio/lucia/visit-1.m4a',
    text: 'Dale, dame un minuto que ya llamo para que te atiendan.',
  },
  {
    id: 'visit-2',
    category: 'visit',
    file: '/audio/lucia/visit-2.m4a',
    text: 'Bárbaro, aguantá un toque que ya le aviso al residente.',
  },
  {
    id: 'visit-3',
    category: 'visit',
    file: '/audio/lucia/visit-3.m4a',
    text: 'Perfecto, dame un segundito que ahí les mando aviso al celular.',
  },
  {
    id: 'visit-4',
    category: 'visit',
    file: '/audio/lucia/visit-4.m4a',
    text: 'Genial, ya les toqué timbre en la aplicación, esperá un toque.',
  },
  {
    id: 'package-1',
    category: 'package',
    file: '/audio/lucia/package-1.m4a',
    text: 'Bárbaro, dame un minuto que ya le aviso al celular por el paquete.',
  },
  {
    id: 'package-2',
    category: 'package',
    file: '/audio/lucia/package-2.m4a',
    text: 'Dale, aguantá un toque que ahí le notifico al residente para ver si lo reciben.',
  },
  {
    id: 'package-3',
    category: 'package',
    file: '/audio/lucia/package-3.m4a',
    text: 'Perfecto, ya mandé aviso al celular por la entrega, esperá un segundito.',
  },
  {
    id: 'package-4',
    category: 'package',
    file: '/audio/lucia/package-4.m4a',
    text: 'Genial, ahí consulto en el apartamento para que confirmen el paquete.',
  },
  {
    id: 'visit-approved-1',
    category: 'visit-approved',
    file: '/audio/lucia/visit-approved-1.m4a',
    text: '¡Listo! Ya te abrieron desde el celular, pasá tranquilo.',
  },
  {
    id: 'visit-approved-2',
    category: 'visit-approved',
    file: '/audio/lucia/visit-approved-2.m4a',
    text: '¡Impecable! Puerta abierta, pasá nomás.',
  },
  {
    id: 'package-approved-1',
    category: 'package-approved',
    file: '/audio/lucia/package-approved-1.m4a',
    text: '¡Listo! Aceptaron el paquete, ya te abrí el hall para dejarlo.',
  },
  {
    id: 'package-approved-2',
    category: 'package-approved',
    file: '/audio/lucia/package-approved-2.m4a',
    text: '¡Bárbaro! Confirmaron la entrega, podés pasar a dejar el paquete.',
  },
  {
    id: 'visit-rejected-1',
    category: 'visit-rejected',
    file: '/audio/lucia/visit-rejected-1.m4a',
    text: 'Disculpá, avisaron que ahora no pueden atender.',
  },
  {
    id: 'package-rejected-1',
    category: 'package-rejected',
    file: '/audio/lucia/package-rejected-1.m4a',
    text: 'Disculpá, avisaron que no pueden recibir ese paquete ahora.',
  },
  {
    id: 'code-valid-1',
    category: 'code-valid',
    file: '/audio/lucia/code-valid-1.m4a',
    text: '¡Perfecto! Código verificado, ya te abrí la puerta, pasá nomás.',
  },
  {
    id: 'code-invalid-1',
    category: 'code-invalid',
    file: '/audio/lucia/code-invalid-1.m4a',
    text: 'Disculpá, ese código no está activo o ya venció. Decime a qué apartamento venís.',
  },
  {
    id: 'ask-repeat-1',
    category: 'ask-repeat',
    file: '/audio/lucia/ask-repeat-1.m4a',
    text: 'Disculpá, no te escuché bien. ¿Me repetís a qué apartamento venís?',
  },
  {
    id: 'elderly-help-1',
    category: 'elderly-help',
    file: '/audio/lucia/elderly-help-1.m4a',
    text: 'Quedate tranquilo que no necesitás celular. Decime tu nombre y a qué apartamento venís que ya les aviso.',
  },
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

  // 1. Reproducir con AudioContext (inmune a autoplay tras 2s de mic o EventSource del celular)
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      let decoded = decodedBufferCache.get(fileUrl);
      if (!decoded) {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        decoded = await ctx.decodeAudioData(buf);
        decodedBufferCache.set(fileUrl, decoded);
      }
      if (myGen !== playbackGeneration) return;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = 1.08; // Ritmo ágil uruguayo
      source.connect(ctx.destination);
      currentBufferSource = source;
      source.onended = () => {
        if (currentBufferSource === source) currentBufferSource = null;
      };
      source.start(0);
      return;
    } catch {
      // Fallback directo a HTMLAudioElement del mismo archivo .m4a grabado
    }
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
    // No caer jamás a speechSynthesis robótico del navegador
  }
}

/**
 * Reproduce un tono suave local (Web Audio) cuando llega un mensaje escrito desde el celular,
 * sin usar ninguna API de IA ni voz robótica.
 */
export function playIntercomChime(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
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
