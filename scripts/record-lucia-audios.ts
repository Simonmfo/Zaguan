import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Grabador por mini-lotes de los 22 audios uruguayos de LucIA con Gemini 2.5 Flash TTS.
 * Agrupa de a 3 frases con pausa larga en silencio y corta el PCM 24kHz por los 2 silencios
 * internos más largos, consumiendo solo ~6 requests en total (bajo el límite gratuito de 10/día).
 */

export interface LuciaClipSpec {
  id: string;
  category:
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
    | 'emergency'
    | 'farewell';
  text: string;
}

export const LUCIA_CLIPS: LuciaClipSpec[] = [
  { id: 'greeting-1', category: 'greeting', text: '¡Hola! Soy Lucía. ¿A qué apartamento venís o traés algún paquete?' },
  { id: 'greeting-2', category: 'greeting', text: '¡Buenas! Hablás con Lucía. Decime a qué apartamento venís o si es una entrega.' },
  { id: 'greeting-3', category: 'greeting', text: '¡Hola, qué tal! Soy Lucía, ¿con quién venís o a qué apartamento?' },
  { id: 'greeting-4', category: 'greeting', text: '¡Buenas! Soy Lucía del edificio. ¿A qué apartamento venís?' },

  { id: 'visit-1', category: 'visit', text: 'Dale, dame un minuto que ya llamo para que te atiendan.' },
  { id: 'visit-2', category: 'visit', text: 'Bárbaro, aguantá un toque que ya le aviso al residente.' },
  { id: 'visit-3', category: 'visit', text: 'Perfecto, dame un segundito que ahí les mando aviso al celular.' },
  { id: 'visit-4', category: 'visit', text: 'Genial, ya les toqué timbre en la aplicación, esperá un toque.' },

  { id: 'package-1', category: 'package', text: 'Bárbaro, dame un minuto que ya le aviso al celular por el paquete.' },
  { id: 'package-2', category: 'package', text: 'Dale, aguantá un toque que ahí le notifico al residente para ver si lo reciben.' },
  { id: 'package-3', category: 'package', text: 'Perfecto, ya mandé aviso al celular por la entrega, esperá un segundito.' },
  { id: 'package-4', category: 'package', text: 'Genial, ahí consulto en el apartamento para que confirmen el paquete.' },

  { id: 'visit-approved-1', category: 'visit-approved', text: '¡Listo! Ya te abrieron desde el celular, pasá tranquilo.' },
  { id: 'visit-approved-2', category: 'visit-approved', text: '¡Impecable! Puerta abierta, pasá nomás.' },

  { id: 'package-approved-1', category: 'package-approved', text: '¡Listo! Aceptaron el paquete, ya te abrí el hall para dejarlo.' },
  { id: 'package-approved-2', category: 'package-approved', text: '¡Bárbaro! Confirmaron la entrega, podés pasar a dejar el paquete.' },

  { id: 'visit-rejected-1', category: 'visit-rejected', text: 'Disculpá, avisaron que ahora no pueden atender.' },
  { id: 'package-rejected-1', category: 'package-rejected', text: 'Disculpá, avisaron que no pueden recibir ese paquete ahora.' },
  { id: 'code-valid-1', category: 'code-valid', text: '¡Perfecto! Código verificado, ya te abrí la puerta, pasá nomás.' },
  { id: 'code-invalid-1', category: 'code-invalid', text: 'Disculpá, ese código no está activo o ya venció. Decime a qué apartamento venís.' },
  { id: 'ask-repeat-1', category: 'ask-repeat', text: 'Disculpá, no te escuché bien. ¿Me repetís a qué apartamento venís?' },
  { id: 'elderly-help-1', category: 'elderly-help', text: 'Quedate tranquilo que no necesitás celular. Decime tu nombre y a qué apartamento venís que ya les aviso.' },

  // 9 clips adicionales para cobertura completa de casos reales del edificio
  { id: 'no-answer-1', category: 'no-answer', text: 'Disculpá, no atendieron en el apartamento. Intentá llamarlos por teléfono o probá en unos minutos.' },
  { id: 'unit-not-found-1', category: 'unit-not-found', text: 'Disculpá, ese apartamento no me figura registrado. ¿Me repetís el número?' },
  { id: 'package-ask-unit-1', category: 'package-ask-unit', text: 'Bárbaro, ¿para qué apartamento es el paquete?' },
  { id: 'provider-help-1', category: 'provider-help', text: 'Dale, si tenés código de llave maestra decímelo ahora; si no, ya le aviso a la administración.' },
  { id: 'outside-schedule-1', category: 'outside-schedule', text: 'Tu permiso no está habilitado en este horario. Pedile al residente que te autorice desde la aplicación.' },
  { id: 'show-camera-1', category: 'show-camera', text: 'Acercá el código QR o la etiqueta a la cámara de arriba así lo leo.' },
  { id: 'connecting-resident-1', category: 'connecting-resident', text: 'Aguardá un toque que ya te comunico con el apartamento.' },
  { id: 'out-of-scope-1', category: 'out-of-scope', text: 'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.' },
  { id: 'emergency-1', category: 'emergency', text: 'Entendido, ya doy aviso urgente al apartamento y a la administración.' },

  // Despedidas con marca Zaguán (si no pueden atender o al cerrar)
  {
    id: 'farewell-zaguan-1',
    category: 'no-answer',
    text: 'Disculpá, en este momento no te pudieron atender. Somos Zaguán, la portería inteligente de tu edificio. ¡Que tengas un excelente día!',
  },
  {
    id: 'farewell-zaguan-2',
    category: 'farewell',
    text: 'Gracias por comunicarte. Somos Zaguán, la portería inteligente. Cuando necesites, volvé a tocar el timbre. ¡Hasta pronto!',
  },
];

const SAMPLE_RATE = 24000;

function buildWavFromPcm16(pcm: Buffer, sampleRate = SAMPLE_RATE, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function stripWavHeaderIfPresent(buf: Buffer): Buffer {
  if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
    const dataIdx = buf.indexOf(Buffer.from('data'));
    if (dataIdx !== -1 && dataIdx + 8 < buf.length) {
      return buf.subarray(dataIdx + 8);
    }
    return buf.subarray(44);
  }
  return buf;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimSilencePcm(pcm: Buffer, padMs = 110): Buffer {
  const totalSamples = Math.floor(pcm.length / 2);
  const win = Math.floor(SAMPLE_RATE * 0.02); // 20ms
  const threshold = 420; // ~1.3% of int16 max

  let startSample = 0;
  for (let s = 0; s < totalSamples; s += win) {
    let peak = 0;
    const end = Math.min(s + win, totalSamples);
    for (let i = s; i < end; i++) {
      const v = Math.abs(pcm.readInt16LE(i * 2));
      if (v > peak) peak = v;
    }
    if (peak > threshold) {
      startSample = Math.max(0, s - Math.floor((SAMPLE_RATE * padMs) / 1000));
      break;
    }
  }

  let endSample = totalSamples;
  for (let s = totalSamples - win; s >= startSample; s -= win) {
    let peak = 0;
    const end = Math.min(s + win, totalSamples);
    for (let i = s; i < end; i++) {
      const v = Math.abs(pcm.readInt16LE(i * 2));
      if (v > peak) peak = v;
    }
    if (peak > threshold) {
      endSample = Math.min(totalSamples, end + Math.floor((SAMPLE_RATE * padMs) / 1000));
      break;
    }
  }

  return pcm.subarray(startSample * 2, Math.max(startSample + win, endSample) * 2);
}

/**
 * Divide un buffer PCM 16-bit 24kHz que contiene `expectedCount` frases separadas
 * por silencios largos eligiendo los `expectedCount - 1` silencios internos más largos.
 */
function splitPcmIntoExpectedSegments(rawPcm: Buffer, expectedCount: number): Buffer[] {
  const pcm = trimSilencePcm(rawPcm, 120);
  if (expectedCount <= 1) return [pcm];

  const totalSamples = Math.floor(pcm.length / 2);
  const winSamples = Math.floor(SAMPLE_RATE * 0.02); // 20ms
  const numWins = Math.floor(totalSamples / winSamples);
  const silenceRmsThreshold = 360;

  const isSilent: boolean[] = new Array(numWins);
  for (let w = 0; w < numWins; w++) {
    let sumSq = 0;
    const base = w * winSamples;
    for (let i = 0; i < winSamples; i++) {
      const v = pcm.readInt16LE((base + i) * 2);
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / winSamples);
    isSilent[w] = rms < silenceRmsThreshold;
  }

  interface Gap {
    startWin: number;
    endWin: number;
    lengthWins: number;
    midSample: number;
  }

  const gaps: Gap[] = [];
  const marginWins = Math.floor(0.6 / 0.02); // ignorar primeros/últimos 0.6s
  let inGap = false;
  let gapStart = 0;

  for (let w = marginWins; w < numWins - marginWins; w++) {
    if (isSilent[w] && !inGap) {
      inGap = true;
      gapStart = w;
    } else if (!isSilent[w] && inGap) {
      inGap = false;
      const len = w - gapStart;
      if (len >= 12) {
        // >= 240ms
        gaps.push({
          startWin: gapStart,
          endWin: w,
          lengthWins: len,
          midSample: Math.floor(((gapStart + w) / 2) * winSamples),
        });
      }
    }
  }

  // Tomar los `expectedCount - 1` silencios más largos, con separación mínima de 0.9s entre cortes
  const minSepSamples = Math.floor(SAMPLE_RATE * 0.9);
  gaps.sort((a, b) => b.lengthWins - a.lengthWins);

  const chosen: Gap[] = [];
  for (const g of gaps) {
    if (chosen.every((c) => Math.abs(c.midSample - g.midSample) >= minSepSamples)) {
      chosen.push(g);
      if (chosen.length === expectedCount - 1) break;
    }
  }

  if (chosen.length < expectedCount - 1) {
    throw new Error(
      `Solo se detectaron ${chosen.length} pausas claras en vez de ${expectedCount - 1}.`
    );
  }

  chosen.sort((a, b) => a.midSample - b.midSample);
  const cuts = [0, ...chosen.map((c) => c.midSample), totalSamples];
  const segments: Buffer[] = [];
  for (let i = 0; i < expectedCount; i++) {
    const seg = trimSilencePcm(pcm.subarray(cuts[i] * 2, cuts[i + 1] * 2), 95);
    segments.push(seg);
  }
  return segments;
}

async function generateBatchPcm(apiKey: string, clips: LuciaClipSpec[]): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });
  const joined = clips.map((c) => c.text).join('\n\n[pausa larga de 3 segundos en silencio]\n\n');
  const prompt =
    clips.length === 1
      ? `Hablá como Lucía, joven mujer uruguaya de Montevideo, con acento uruguayo rioplatense bien natural, cálido y ritmo ágil cotidiano. Decí exactamente esta frase:\n${clips[0].text}`
      : `Hablá como Lucía, joven mujer uruguaya de Montevideo, con acento uruguayo rioplatense bien natural, cálido y ritmo ágil cotidiano. Leé exactamente estas ${clips.length} frases independientes, SIN decir números ni leer la palabra pausa, dejando una pausa larga de 3 segundos completos en total silencio entre cada frase:\n\n${joined}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Aoede' },
        },
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const raw = Buffer.from(part.inlineData.data, 'base64');
      return stripWavHeaderIfPresent(raw);
    }
  }
  throw new Error('Gemini devolvió respuesta sin audio.');
}

function savePcmAsM4a(pcm: Buffer, outDir: string, id: string): string {
  const wavPath = path.join(outDir, `${id}.wav`);
  const m4aPath = path.join(outDir, `${id}.m4a`);
  fs.writeFileSync(wavPath, buildWavFromPcm16(pcm));
  try {
    execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wavPath, m4aPath], {
      stdio: 'ignore',
    });
    if (fs.existsSync(m4aPath) && fs.statSync(m4aPath).size > 1024) {
      fs.unlinkSync(wavPath);
      return `/audio/lucia/${id}.m4a`;
    }
  } catch {
    // Mantener .wav
  }
  return `/audio/lucia/${id}.wav`;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Falta GEMINI_API_KEY en .env');
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), 'public/audio/lucia');
  fs.mkdirSync(outDir, { recursive: true });

  const missing: LuciaClipSpec[] = [];
  const manifest: Record<string, { file: string; category: string; text: string }> = {};

  for (const clip of LUCIA_CLIPS) {
    const m4aPath = path.join(outDir, `${clip.id}.m4a`);
    if (fs.existsSync(m4aPath) && fs.statSync(m4aPath).size > 1024) {
      manifest[clip.id] = {
        file: `/audio/lucia/${clip.id}.m4a`,
        category: clip.category,
        text: clip.text,
      };
      console.log(`✔ Ya existe: ${clip.id}.m4a`);
    } else {
      missing.push(clip);
    }
  }

  // Si faltan 1 o 2 clips, grabar de a 1 directo (más rápido y sin riesgo de bucle de silencio)
  const batchSize = missing.length <= 2 ? 1 : 5;
  const batches: LuciaClipSpec[][] = [];
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize));
  }

  console.log(`\n🎙️ Grabando ${missing.length} audios faltantes en ${batches.length} mini-lotes de Gemini TTS...\n`);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const idsLabel = batch.map((c) => c.id).join(', ');
    let segments: Buffer[] | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Lote ${b + 1}/${batches.length}] Grabando (${idsLabel}) intento ${attempt}...`);
        const batchPcm = await generateBatchPcm(apiKey, batch);
        const totalSec = (batchPcm.length / 2 / SAMPLE_RATE).toFixed(1);
        console.log(`  Audio recibido (${totalSec}s). Cortando en ${batch.length} clips por silencio...`);
        segments = splitPcmIntoExpectedSegments(batchPcm, batch.length);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
        const waitMs = is429 ? 65000 : 5000;
        console.warn(`  ⚠️ Error (${msg.slice(0, 120)}). Esperando ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }

    if (!segments) {
      throw new Error(`No se pudo grabar el lote ${b + 1} (${idsLabel}).`);
    }

    for (let j = 0; j < batch.length; j++) {
      const clip = batch[j];
      const seg = segments[j];
      const sec = (seg.length / 2 / SAMPLE_RATE).toFixed(2);
      const file = savePcmAsM4a(seg, outDir, clip.id);
      manifest[clip.id] = { file, category: clip.category, text: clip.text };
      console.log(`  ✅ ${file} (${sec}s)`);
    }

    // 23s entre lotes para respetar límite de 3 RPM
    if (b < batches.length - 1) {
      await sleep(23000);
    }
  }

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), clips: manifest }, null, 2)
  );
  console.log(`\n🎉 ¡Todos los ${Object.keys(manifest).length} audios de LucIA quedaron grabados con Gemini en public/audio/lucia/!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
