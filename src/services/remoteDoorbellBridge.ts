/**
 * Zaguán Digital — Puente de Timbre en Tiempo Real (Web LucIA ↔ App Android Flutter)
 *
 * Permite que al tocar el videoportero desde la Web (Vercel o localhost),
 * el celular Android con el APK reciba una notificación nativa instantánea con
 * timbre y vibración, y que la respuesta del residente ([Abrir Puerta], [Hablar], [Rechazar])
 * vuelva a la Web para que LucIA la anuncie en voz alta.
 */

export const DEFAULT_DOORBELL_CHANNEL = 'pocitos-2468';
const STORAGE_KEY = 'zaguan_doorbell_channel_v1';
const NTFY_BASE = 'https://ntfy.sh';

export interface RemoteDoorbellRingPayload {
  id: string;
  kind: 'visit' | 'package';
  unit: string;
  visitorName: string;
  residentName: string;
  carrier?: string;
  transcript: string;
  buildingName: string;
  conciergeName: string;
  timestampIso: string;
}

export interface RemoteDoorbellResponsePayload {
  callId: string;
  action: 'approve' | 'reject' | 'approve_package' | 'reject_package' | 'talk';
  unit: string;
  residentName: string;
  message?: string;
  timestampIso: string;
}

export function sanitizeDoorbellChannel(raw: string): string {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || DEFAULT_DOORBELL_CHANNEL;
}

export function getSavedDoorbellChannel(): string {
  if (typeof window === 'undefined') return DEFAULT_DOORBELL_CHANNEL;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? sanitizeDoorbellChannel(saved) : DEFAULT_DOORBELL_CHANNEL;
  } catch {
    return DEFAULT_DOORBELL_CHANNEL;
  }
}

export function saveDoorbellChannel(channel: string): string {
  const clean = sanitizeDoorbellChannel(channel);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      // Ignore storage errors
    }
  }
  return clean;
}

export function getRingTopic(channel: string): string {
  return `zaguan-e12w-ring-${sanitizeDoorbellChannel(channel)}`;
}

export function getResponseTopic(channel: string): string {
  return `zaguan-e12w-resp-${sanitizeDoorbellChannel(channel)}`;
}

/**
 * Envía un timbre en vivo desde el videoportero Web (LucIA) al celular Android.
 */
export async function sendRemoteDoorbellRing(
  channel: string,
  payload: RemoteDoorbellRingPayload
): Promise<{ ok: boolean; topic: string; error?: string }> {
  const topic = getRingTopic(channel);
  const title =
    payload.kind === 'package'
      ? `Paquete ${payload.carrier || 'Entrega'} (LucIA) · Apto ${payload.unit}`
      : `Timbre E12W (LucIA) · Apto ${payload.unit}`;
  try {
    const res = await fetch(`${NTFY_BASE}/${topic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: title,
        Priority: 'high',
        Tags: payload.kind === 'package' ? 'package,bell' : 'bell,door',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, topic, error: `HTTP ${res.status}` };
    }
    return { ok: true, topic };
  } catch (err) {
    return {
      ok: false,
      topic,
      error: err instanceof Error ? err.message : 'Error de red enviando timbre',
    };
  }
}

/**
 * Se suscribe en tiempo real a las respuestas del celular Android ([Abrir Puerta] / [Hablar] / [Rechazar])
 * mediante Server-Sent Events (SSE) para que LucIA responda al instante en la Web.
 */
export function subscribeToRemoteDoorbellResponses(
  channel: string,
  onResponse: (resp: RemoteDoorbellResponsePayload) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => undefined;
  }

  const topic = getResponseTopic(channel);
  const seen = new Set<string>();
  const es = new EventSource(`${NTFY_BASE}/${topic}/sse`);

  es.onopen = () => onStatusChange?.(true);
  es.onerror = () => onStatusChange?.(false);

  es.onmessage = (ev) => {
    try {
      const envelope = JSON.parse(ev.data) as {
        id?: string;
        event?: string;
        message?: string;
      };
      if (envelope.event && envelope.event !== 'message') return;
      if (envelope.id && seen.has(envelope.id)) return;
      if (envelope.id) seen.add(envelope.id);
      if (!envelope.message) return;

      const parsed = JSON.parse(envelope.message) as RemoteDoorbellResponsePayload;
      if (parsed && parsed.action) {
        onResponse(parsed);
      }
    } catch {
      // Ignorar mensajes keepalive o no JSON
    }
  };

  return () => {
    es.close();
    onStatusChange?.(false);
  };
}
