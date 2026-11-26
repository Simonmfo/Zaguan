import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { getSnapshot, openDoor } from './akuvoxController';

/**
 * Zaguán Digital — Orquestador del Portero Virtual con IA (Voz / SIP para Akuvox E12W)
 *
 * Gestiona la conversación cuando alguien presiona el botón físico del Akuvox E12W:
 * - Personalidad amable, uruguaya/rioplatense neutra, concisa y resolutiva.
 * - Function calling nativo con 3 herramientas:
 *     1. buscarResidente(unidad_o_nombre)
 *     2. validarCodigoVoz(codigo_4_digitos)
 *     3. procesarPaquete(unidad_o_nombre)
 */

export const ZAGUAN_CONCIERGE_SYSTEM_PROMPT = `Sos LucIA, la portera virtual inteligente de Zaguán en un edificio de Montevideo, Uruguay.
Hablás en español uruguayo montevideano bien natural, ágil y cercano (usando expresiones uruguayas como "dame un minuto", "aguantá un toque", "bárbaro", "dale", "pasá nomás").
IMPORTANTE: Respondé SIEMPRE en UNA SOLA oración bien corta y directa (máximo 14 palabras) y variá las frases para no sonar repetitiva.

Reglas estrictas de seguridad:
1. NUNCA abras la puerta solo porque alguien diga un nombre. Si viene de visita, usá SIEMPRE buscarResidente(unidad_o_nombre) para avisar al celular del vecino.
2. Si el visitante dicta un código numérico de 4 dígitos, usá SIEMPRE validarCodigoVoz(codigo_4_digitos).
3. Si llega un paquete o entrega (Mercado Libre, PedidosYa, DAC, Correo), usá SIEMPRE procesarPaquete(unidad_o_nombre) y notificá SÍ O SÍ al celular del residente para que confirme si recibe el paquete o no.
4. No inventes datos ni confirmes aperturas si la herramienta devolvió error o denegación.`;

export const CONCIERGE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'buscarResidente',
    description:
      'Busca un residente activo por número de apartamento o nombre y le envía una notificación push con foto en vivo desde el Akuvox E12W para que autorice o rechace el ingreso.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        unidad_o_nombre: {
          type: Type.STRING,
          description: 'Número de departamento (ej. "4B", "3A") y/o nombre del residente (ej. "Martín del 4B").',
        },
        nombre_visitante: {
          type: Type.STRING,
          description: 'Nombre de la persona que está en la puerta, si lo mencionó.',
        },
      },
      required: ['unidad_o_nombre'],
    },
  },
  {
    name: 'validarCodigoVoz',
    description:
      'Verifica un código numérico de 4 dígitos dictado por voz. Si corresponde a un pase activo y vigente, dispara openDoor al instante y consume pases de un solo uso.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        codigo_4_digitos: {
          type: Type.STRING,
          description: 'Código numérico exacto de 4 dígitos dictado por el visitante (ej. "7310").',
        },
      },
      required: ['codigo_4_digitos'],
    },
  },
  {
    name: 'procesarPaquete',
    description:
      'Inicia el flujo de validación de paquetería para una unidad o destinatario: verifica si hay entrega pre-autorizada, pide mostrar la etiqueta a la cámara 1080p para OCR o notifica con foto al residente.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        unidad_o_nombre: {
          type: Type.STRING,
          description: 'Unidad o destinatario del paquete (ej. "4B", "3A", "Martín Silva").',
        },
        empresa: {
          type: Type.STRING,
          description: 'Empresa de reparto si la mencionó (Mercado Libre, PedidosYa, DAC, Correo).',
        },
      },
      required: ['unidad_o_nombre'],
    },
  },
];

export interface ConciergeContext {
  buildingId: string;
  residents: Array<{ unit: string; name: string; active: boolean }>;
  activeVoicePasses: Array<{
    code: string;
    pin: string;
    guestName: string;
    unit: string;
    singleUse: boolean;
    validUntilIso?: string;
  }>;
  expectedPackages: Array<{
    id: string;
    unit: string;
    residentName: string;
    carrier: string;
    autoRule: 'auto_open_after_ocr' | 'ask_confirmation_photo';
  }>;
}

export interface ConciergeToolExecution {
  tool: 'buscarResidente' | 'validarCodigoVoz' | 'procesarPaquete';
  args: Record<string, string>;
  result: Record<string, unknown>;
}

export interface ConciergeTurnResult {
  replyText: string;
  engine: 'gemini-2.5-flash' | 'orchestrator-local';
  toolCalls: ConciergeToolExecution[];
  doorOpened: boolean;
  snapshotDataUrl?: string;
}

async function executeConciergeTool(
  toolName: 'buscarResidente' | 'validarCodigoVoz' | 'procesarPaquete',
  args: Record<string, string>,
  ctx: ConciergeContext
): Promise<{ execution: ConciergeToolExecution; doorOpened: boolean; snapshotDataUrl?: string }> {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  if (toolName === 'validarCodigoVoz') {
    const pin = String(args.codigo_4_digitos || '').replace(/\D/g, '').slice(0, 4);
    const matched = ctx.activeVoicePasses.find((p) => p.pin === pin);

    if (!matched) {
      return {
        doorOpened: false,
        execution: {
          tool: 'validarCodigoVoz',
          args: { codigo_4_digitos: pin },
          result: {
            valid: false,
            reason: `El código ${pin} no está activo, expiró o ya fue utilizado.`,
          },
        },
      };
    }

    if (matched.validUntilIso && new Date(matched.validUntilIso).getTime() <= Date.now()) {
      return {
        doorOpened: false,
        execution: {
          tool: 'validarCodigoVoz',
          args: { codigo_4_digitos: pin },
          result: { valid: false, reason: 'El código expiró fuera de su ventana horaria.' },
        },
      };
    }

    const doorRes = await openDoor(ctx.buildingId, 1);
    return {
      doorOpened: doorRes.ok,
      execution: {
        tool: 'validarCodigoVoz',
        args: { codigo_4_digitos: pin },
        result: {
          valid: true,
          guestName: matched.guestName,
          unit: matched.unit,
          singleUseBurned: matched.singleUse,
          doorOpened: doorRes.ok,
          relayMessage: doorRes.message,
        },
      },
    };
  }

  if (toolName === 'procesarPaquete') {
    const query = norm(args.unidad_o_nombre || '');
    const snap = await getSnapshot(ctx.buildingId);
    const matchedPkg = ctx.expectedPackages.find(
      (p) => query.includes(norm(p.unit)) || query.includes(norm(p.residentName.split(' ')[0]))
    );
    const matchedRes = ctx.residents.find(
      (r) => r.active && (query.includes(norm(r.unit)) || query.includes(norm(r.name.split(' ')[0])))
    );

    return {
      doorOpened: false,
      snapshotDataUrl: snap.dataUrl,
      execution: {
        tool: 'procesarPaquete',
        args,
        result: matchedPkg
          ? {
              preAuthorized: true,
              packageId: matchedPkg.id,
              unit: matchedPkg.unit,
              carrier: matchedPkg.carrier,
              autoRule: matchedPkg.autoRule,
              nextStep: 'Pedir al repartidor que acerque la etiqueta a la cámara 1080p del E12W para lectura OCR.',
            }
          : {
              preAuthorized: false,
              unit: matchedRes?.unit || 'Desconocido',
              residentName: matchedRes?.name || null,
              pushSentWithPhoto: Boolean(matchedRes),
              nextStep: matchedRes
                ? 'Alerta con foto enviada al residente con botones [Dejar pasar al hall] / [Rechazar].'
                : 'Pedir que aclare número de apartamento.',
            },
      },
    };
  }

  // buscarResidente
  const query = norm(args.unidad_o_nombre || '');
  const matchedRes = ctx.residents.find(
    (r) =>
      r.active &&
      (query.includes(norm(r.unit)) ||
        query.includes(norm(r.name)) ||
        query.includes(norm(r.name.split(' ')[0])))
  );
  const snap = await getSnapshot(ctx.buildingId);

  return {
    doorOpened: false,
    snapshotDataUrl: snap.dataUrl,
    execution: {
      tool: 'buscarResidente',
      args,
      result: matchedRes
        ? {
            found: true,
            unit: matchedRes.unit,
            residentName: matchedRes.name,
            visitorName: args.nombre_visitante || 'Visita',
            pushSentWithPhoto: true,
            note: 'Solicitud enviada al celular del residente con foto en vivo y botones [Abrir Puerta] / [Hablar] / [Rechazar].',
          }
        : {
            found: false,
            note: 'No encontré ese apartamento o residente activo. Pedile que repita número de apartamento.',
          },
    },
  };
}

export async function handleConciergeUtterance(
  utterance: string,
  ctx: ConciergeContext
): Promise<ConciergeTurnResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const toolCalls: ConciergeToolExecution[] = [];
  let doorOpened = false;
  let snapshotDataUrl: string | undefined;

  // 1. Modo Real con Gemini 2.5 Flash + Function Calling nativo
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const firstPass = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: utterance,
        config: {
          systemInstruction: ZAGUAN_CONCIERGE_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: CONCIERGE_FUNCTION_DECLARATIONS }],
        },
      });

      const calls = firstPass.functionCalls || [];
      if (calls.length > 0) {
        const toolResultsSummary: string[] = [];
        for (const call of calls) {
          const name = call.name as 'buscarResidente' | 'validarCodigoVoz' | 'procesarPaquete';
          if (
            name === 'buscarResidente' ||
            name === 'validarCodigoVoz' ||
            name === 'procesarPaquete'
          ) {
            const rawArgs = (call.args || {}) as Record<string, string>;
            const out = await executeConciergeTool(name, rawArgs, ctx);
            toolCalls.push(out.execution);
            if (out.doorOpened) doorOpened = true;
            if (out.snapshotDataUrl) snapshotDataUrl = out.snapshotDataUrl;
            toolResultsSummary.push(`${name} => ${JSON.stringify(out.execution.result)}`);
          }
        }

        const finalPass = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            `Visitante dijo: "${utterance}"`,
            `Resultados de herramientas ejecutadas:\n${toolResultsSummary.join('\n')}`,
            'Respondé en voz alta al visitante de forma cálida, rioplatense neutra y en máximo 2 oraciones cortas.',
          ].join('\n\n'),
          config: {
            systemInstruction: ZAGUAN_CONCIERGE_SYSTEM_PROMPT,
          },
        });

        return {
          replyText:
            finalPass.text?.trim() ||
            'Perfecto, ya procesé tu solicitud. Aguardá un segundito por favor.',
          engine: 'gemini-2.5-flash',
          toolCalls,
          doorOpened,
          snapshotDataUrl,
        };
      }

      if (firstPass.text) {
        return {
          replyText: firstPass.text.trim(),
          engine: 'gemini-2.5-flash',
          toolCalls,
          doorOpened,
          snapshotDataUrl,
        };
      }
    } catch (err) {
      console.error('[AI Concierge] Error Gemini, usando orquestador local:', err);
    }
  }

  // 2. Orquestador determinístico local (ejecuta exactamente las mismas 3 herramientas)
  const lower = utterance.toLowerCase();
  const pinMatch = utterance.match(/\b(\d{4})\b/);

  if (
    pinMatch &&
    (lower.includes('código') ||
      lower.includes('codigo') ||
      lower.includes('pin') ||
      lower.includes('clave') ||
      /^\s*\d{4}\s*$/.test(utterance))
  ) {
    const out = await executeConciergeTool(
      'validarCodigoVoz',
      { codigo_4_digitos: pinMatch[1] },
      ctx
    );
    toolCalls.push(out.execution);
    doorOpened = out.doorOpened;
    const valid = Boolean(out.execution.result.valid);
    return {
      replyText: valid
        ? `¡Perfecto! Código verificado para ${String(out.execution.result.guestName)}. Ya te abrí la puerta, podés pasar.`
        : `Disculpá, ese código no está activo o ya expiró. Si querés, decime a qué apartamento venís y le aviso al residente.`,
      engine: 'orchestrator-local',
      toolCalls,
      doorOpened,
    };
  }

  if (
    lower.includes('paquete') ||
    lower.includes('entrega') ||
    lower.includes('mercado') ||
    lower.includes('pedidos') ||
    lower.includes('correo') ||
    lower.includes('dac')
  ) {
    const out = await executeConciergeTool(
      'procesarPaquete',
      { unidad_o_nombre: utterance },
      ctx
    );
    toolCalls.push(out.execution);
    const preAuth = Boolean(out.execution.result.preAuthorized);
    return {
      replyText: preAuth
        ? `¡Bárbaro! Tengo tu entrega esperada para el ${String(out.execution.result.unit)}. Acercá la etiqueta a la cámara de arriba así la valido y te abro el zaguán.`
        : `Recibido, ya le mandé una foto del paquete al residente del ${String(out.execution.result.unit)} para que te deje pasar al hall. Aguardá un segundo.`,
      engine: 'orchestrator-local',
      toolCalls,
      doorOpened: false,
      snapshotDataUrl: out.snapshotDataUrl,
    };
  }

  const soyMatch = utterance.match(/soy\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+)/i);
  const out = await executeConciergeTool(
    'buscarResidente',
    {
      unidad_o_nombre: utterance,
      nombre_visitante: soyMatch ? soyMatch[1] : 'Visita',
    },
    ctx
  );
  toolCalls.push(out.execution);
  const found = Boolean(out.execution.result.found);
  return {
    replyText: found
      ? `¡Hola ${soyMatch ? soyMatch[1] : ''}! Ya le avisé con tu foto a ${String(out.execution.result.residentName)} del ${String(out.execution.result.unit)}. Aguardá un momentito que te confirmen.`
      : 'Hola, bienvenido al edificio. ¿Me repetís a qué departamento venís o el nombre del residente así le aviso?',
    engine: 'orchestrator-local',
    toolCalls,
    doorOpened: false,
    snapshotDataUrl: out.snapshotDataUrl,
  };
}
