/**
 * LucIA — Motor de Voz Humana Uruguaya / Rioplatense
 *
 * 1. Intenta primero audio neuronal real vía `/api/lucia-tts` (Gemini 2.5 Flash TTS con acento uruguayo).
 * 2. Si no hay API key en el servidor o no responde a tiempo, selecciona automáticamente la voz
 *    femenina rioplatense más humana disponible en el dispositivo:
 *      es-UY Valentina (Uruguay) → es-AR Elena/Sofía (Rioplatense) → es-419 / Paulina / Google Español.
 */

export interface LuciaVoiceInfo {
  label: string;
  lang: string;
  isNeuralApi: boolean;
}

let currentAudio: HTMLAudioElement | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let activeVoiceLabel = 'LucIA · Uruguaya (es-UY / Rioplatense)';

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

  // Descartar voces claramente masculinas
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
    score -= 100;
  }

  // Prioridad máxima: Uruguay (es-UY) y Rioplatense (es-AR)
  if (lang === 'es-uy' || lang.startsWith('es-uy')) score += 120;
  else if (lang === 'es-ar' || lang.startsWith('es-ar')) score += 105;
  else if (lang === 'es-419' || lang === 'es-us') score += 75;
  else if (lang.startsWith('es-')) score += 50;
  else return -999;

  // Voces femeninas naturales conocidas (Edge Neural, Chrome Google, macOS Enhanced/Premium)
  if (name.includes('valentina')) score += 90; // Microsoft Valentina Online (Natural) - Uruguay
  if (name.includes('elena')) score += 85; // Microsoft Elena Online (Natural) - Argentina
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
  const best = pickBestLuciaBrowserVoice();
  if (activeVoiceLabel.includes('Gemini')) return activeVoiceLabel;
  if (best) {
    return `LucIA · ${best.name.replace(/Microsoft |Online \(Natural\) - /gi, '')} (${best.lang})`;
  }
  return activeVoiceLabel;
}

/**
 * Normaliza abreviaturas para que LucIA pronuncie de forma 100% natural en español uruguayo
 * (ej. "LucIA" -> "Lucía", "4B" -> "4 B", "Apto" -> "apartamento").
 */
function prepareSpokenUruguayanText(raw: string): string {
  return raw
    .replace(/\bLucIA\b/g, 'Lucía')
    .replace(/\bApto\.?\s*/gi, 'apartamento ')
    .replace(/\bE12W\b/gi, 'portero')
    .replace(/\bOCR\b/g, 'escaneo')
    .replace(/\b1080p\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function speakAsLucia(
  rawText: string,
  onEngineResolved?: (info: LuciaVoiceInfo) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  const spokenText = prepareSpokenUruguayanText(rawText);
  if (!spokenText) return;

  stopLuciaSpeech();

  // 1. Intentar TTS Neuronal humano (Gemini 2.5 Flash TTS con acento uruguayo)
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);
    const res = await fetch('/api/lucia-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spokenText }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);

    if (res.status === 200) {
      const blob = await res.blob();
      if (blob.size > 512) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        activeVoiceLabel = 'LucIA · Voz Neuronal Uruguaya (Gemini)';
        onEngineResolved?.({
          label: activeVoiceLabel,
          lang: 'es-UY',
          isNeuralApi: true,
        });
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentAudio === audio) currentAudio = null;
        };
        await audio.play();
        return;
      }
    }
  } catch {
    // Fallback silencioso a voz natural rioplatense del navegador
  }

  // 2. Fallback a la mejor voz femenina rioplatense/uruguaya disponible en el navegador
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
    // Cadencia cálida y conversacional (menos acelerada y menos metálica)
    utter.rate = 0.96;
    utter.pitch = 1.05;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignorar si el navegador bloquea speechSynthesis
  }
}
