/**
 * LucIA — Motor de Voz Humana Uruguaya / Rioplatense (Consistente, Ágil y Cacheada)
 *
 * 1. Usa SIEMPRE Gemini 2.5 Flash TTS (`/api/lucia-tts`, voz Aoede con acento uruguayo) cuando
 *    hay GEMINI_API_KEY en el servidor, con timeout amplio (12s), cancelación limpia de requests
 *    viejos y caché local de audios (las frases ya generadas suenan en 0 ms y no consumen cuota).
 * 2. Solo cae a la voz femenina rioplatense del navegador si el servidor responde 501 (sin API key)
 *    o si falla completamente la red tras reintento.
 */

export interface LuciaVoiceInfo {
  label: string;
  lang: string;
  isNeuralApi: boolean;
}

let currentAudio: HTMLAudioElement | null = null;
let activeFetchController: AbortController | null = null;
let speechGeneration = 0;
let cachedVoices: SpeechSynthesisVoice[] = [];
let activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
let serverMissingApiKey = false;
const audioBlobUrlCache = new Map<string, string>();
const lastPhraseIdx: Record<string, number> = {};

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
  if (maleHints.some((h) => name.includes(h))) {
    score -= 120;
  }

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

  const femaleHints = [
    'paulina',
    'sofia',
    'sofía',
    'lucia',
    'lucía',
    'monica',
    'mónica',
    'isabela',
    'jimena',
    'camila',
    'dalia',
    'paloma',
    'sabina',
    'salome',
    'salomé',
    'maria',
    'maría',
    'female',
    'mujer',
  ];
  if (femaleHints.some((h) => name.includes(h))) score += 35;

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
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    currentAudio = null;
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

async function playAudioUrl(url: string, gen: number): Promise<boolean> {
  if (gen !== speechGeneration) return false;
  const audio = new Audio(url);
  audio.playbackRate = 1.12;
  currentAudio = audio;
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
  };
  await audio.play();
  return true;
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

  // 0. Si esta frase exacta ya fue generada por Gemini, reproducirla al instante (0 ms, misma voz)
  const cachedUrl = audioBlobUrlCache.get(spokenText);
  if (cachedUrl) {
    try {
      activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
      onEngineResolved?.({ label: activeVoiceLabel, lang: 'es-UY', isNeuralApi: true });
      await playAudioUrl(cachedUrl, myGen);
      return;
    } catch {
      audioBlobUrlCache.delete(spokenText);
    }
  }

  // 1. Llamar a Gemini 2.5 Flash TTS con timeout amplio (12s) para NO caer en voz rara por demora
  if (!serverMissingApiKey) {
    const controller = new AbortController();
    activeFetchController = controller;
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('/api/lucia-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (myGen !== speechGeneration) return;

      if (res.status === 501) {
        // Solo desactivar Gemini si explícitamente falta GEMINI_API_KEY en el servidor
        serverMissingApiKey = true;
      } else if (res.status === 200) {
        const blob = await res.blob();
        if (myGen !== speechGeneration) return;
        if (blob.size > 512) {
          const url = URL.createObjectURL(blob);
          audioBlobUrlCache.set(spokenText, url);
          activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
          onEngineResolved?.({
            label: activeVoiceLabel,
            lang: 'es-UY',
            isNeuralApi: true,
          });
          await playAudioUrl(url, myGen);
          return;
        }
      }
    } catch (err) {
      window.clearTimeout(timer);
      // Si fue cancelado porque empezó una nueva frase, salir sin reproducir voz fallback
      if (myGen !== speechGeneration || (err instanceof DOMException && err.name === 'AbortError' && activeFetchController !== controller)) {
        return;
      }
    } finally {
      if (activeFetchController === controller) {
        activeFetchController = null;
      }
    }
  }

  if (myGen !== speechGeneration) return;

  // 2. Fallback a la mejor voz femenina rioplatense del navegador solo si Gemini no está disponible
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
