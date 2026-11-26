import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30;

function buildWavFromPcm16(pcm: Uint8Array, sampleRate = 24000, channels = 1): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      header[offset + i] = str.charCodeAt(i);
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, 44);
  return wav;
}

async function synthesizeWithGemini(
  apiKey: string,
  text: string
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [
      {
        parts: [
          {
            text:
              'Hablá como LucIA, joven mujer uruguaya de Montevideo, con acento uruguayo rioplatense natural, cálido y ritmo ágil cotidiano. Decí exactamente esta frase:\n' +
              text,
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede',
          },
        },
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data) {
      const raw = Buffer.from(inline.data, 'base64');
      const mime = inline.mimeType || 'audio/L16;rate=24000';
      const isWavOrMp3 = mime.includes('wav') || mime.includes('mpeg') || mime.includes('mp3');
      const audioBytes = isWavOrMp3 ? new Uint8Array(raw) : buildWavFromPcm16(new Uint8Array(raw));
      return { bytes: audioBytes, mime: isWavOrMp3 ? mime : 'audio/wav' };
    }
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = String(body.text || '').trim().slice(0, 500);
    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_api_key' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const audio = await synthesizeWithGemini(apiKey, text);
      if (audio) {
        return new Response(Buffer.from(audio.bytes), {
          status: 200,
          headers: {
            'Content-Type': audio.mime,
            'Cache-Control': 'private, max-age=3600',
            'X-Lucia-Engine': 'gemini-2.5-flash-preview-tts',
          },
        });
      }
      return new Response(JSON.stringify({ ok: false, reason: 'empty_audio' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');
      console.error('[LucIA TTS] Gemini error:', errMsg);
      return new Response(
        JSON.stringify({
          ok: false,
          reason: isRateLimit ? 'rate_limit_429' : 'gemini_error',
          detail: errMsg.slice(0, 160),
        }),
        {
          status: isRateLimit ? 429 : 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (err) {
    console.error('[LucIA TTS] Unexpected error:', err);
    return new Response(JSON.stringify({ ok: false, reason: 'server_error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
