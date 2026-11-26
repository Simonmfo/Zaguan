import { GoogleGenAI } from '@google/genai';

export const maxDuration = 25;

const ALLOWED_CLIP_CATEGORIES = [
  'none',
  'out-of-scope',
  'provider-help',
  'emergency',
  'package-ask-unit',
  'unit-not-found',
  'show-camera',
  'elderly-help',
  'ask-repeat',
] as const;

type FallbackClipCategory = (typeof ALLOWED_CLIP_CATEGORIES)[number];

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      utterance?: string;
      buildingName?: string;
      knownUnits?: string[];
    };
    const utterance = String(body.utterance || '').trim().slice(0, 400);
    const buildingName = String(body.buildingName || 'Edificio Pocitos 2468');
    const knownUnits = Array.isArray(body.knownUnits) ? body.knownUnits.slice(0, 40) : ['1A', '2B', '3A', '4B', '501'];

    if (!utterance) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing utterance' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: true,
          usedGemini: false,
          clipCategory: 'out-of-scope',
          replyText:
            'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        `Edificio: ${buildingName}. Apartamentos registrados: ${knownUnits.join(', ')}.`,
        `Visitante dijo al videoportero: "${utterance}"`,
        `Respondé ÚNICAMENTE con un JSON válido con las claves:`,
        `{ "replyText": string (máximo 1 oración corta y bien uruguaya rioplatense como LucIA, sin abrir la puerta nunca), "clipCategory": "none" | "out-of-scope" | "provider-help" | "emergency" | "package-ask-unit" | "unit-not-found" | "show-camera" | "elderly-help" | "ask-repeat" }.`,
        `Si la respuesta encaja en una de esas categorías pre-grabadas, elegí esa clipCategory. Si requiere una respuesta específica distinta (por ejemplo, una consulta concreta del visitante que sí podés aclarar brevemente como portera), devolvé clipCategory: "none" y redactá replyText corto y amable en español uruguayo.`,
      ].join('\n'),
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      replyText?: string;
      clipCategory?: string;
    };

    const rawCat = String(parsed.clipCategory || 'none') as FallbackClipCategory;
    const clipCategory: FallbackClipCategory = ALLOWED_CLIP_CATEGORIES.includes(rawCat)
      ? rawCat
      : 'none';

    const replyText =
      String(parsed.replyText || '').trim() ||
      'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.';

    return new Response(
      JSON.stringify({
        ok: true,
        usedGemini: true,
        clipCategory,
        replyText,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[LucIA Fallback] Error:', err);
    return new Response(
      JSON.stringify({
        ok: true,
        usedGemini: false,
        clipCategory: 'out-of-scope',
        replyText:
          'Disculpá, solo gestiono ingresos y entregas. Decime a qué apartamento venís o si traés un paquete.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
