import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import {
  getSnapshot,
  isAkuvoxMockMode,
  openDoor,
  syncRfidCards,
  type RfidCardSyncItem,
} from './server/services/akuvoxController';
import {
  handleConciergeUtterance,
  ZAGUAN_CONCIERGE_SYSTEM_PROMPT,
} from './server/services/aiConciergeOrchestrator';

/**
 * Zaguán Digital — Puente Hardware Local para Akuvox E12W
 *
 * Funciones:
 * 1. Proxy seguro hacia la HTTP API del Akuvox E12W (evita CORS y credenciales en cliente)
 * 2. Captura de snapshot JPEG en vivo (:8080/picture.jpg o /jpeg.cgi)
 * 3. Receptor de Action URLs (botón físico, RFID 13.56MHz, tamper, estado relé)
 * 4. Receptor de Third-Party QR Integration (?codeKey={QRCode}&deviceId={DeviceID})
 * 5. Soporte opcional para Relé 2 externo (Shelly / SR01) para Doble Exclusa física
 */

const app = express();
const PORT = Number(process.env.AKUVOX_BRIDGE_PORT || 3001);

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

interface HardwareEvent {
  id: string;
  event: 'qr_scan' | 'call_start' | 'rfid_scan' | 'relay_change' | 'tamper';
  payload: Record<string, string>;
  receivedAt: string;
}

const recentEvents: HardwareEvent[] = [];

function recordEvent(event: HardwareEvent['event'], payload: Record<string, string>) {
  const entry: HardwareEvent = {
    id: `ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    event,
    payload,
    receivedAt: new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
  };
  recentEvents.unshift(entry);
  if (recentEvents.length > 50) recentEvents.pop();
  console.log(`[Akuvox E12W] ${entry.receivedAt} · ${event}`, payload);
  return entry;
}

// 1. Abrir relé del Akuvox E12W (DoorNum=1) o relé secundario (DoorNum=2) vía AkuvoxController
app.post('/api/akuvox/open-door', async (req, res) => {
  const {
    buildingId = 'bldg-pocitos-2468',
    deviceIp,
    httpPort = 80,
    apiUser = 'admin',
    apiPassword = '',
    highSecurityMode = true,
    doorNum = 1,
    secondaryRelayUrl = '',
    forceReal,
  } = req.body ?? {};

  const relayId: 1 | 2 = Number(doorNum) === 2 ? 2 : 1;
  const result = await openDoor(String(buildingId), relayId, {
    deviceIp: deviceIp ? String(deviceIp) : undefined,
    httpPort: Number(httpPort),
    apiUser: String(apiUser),
    apiPassword: String(apiPassword),
    highSecurityMode: Boolean(highSecurityMode),
    secondaryRelayUrl: secondaryRelayUrl ? String(secondaryRelayUrl) : undefined,
    forceReal: typeof forceReal === 'boolean' ? forceReal : Boolean(deviceIp && !isAkuvoxMockMode()),
  });

  recordEvent('relay_change', {
    buildingId: result.buildingId,
    relayId: String(result.relayId),
    authScheme: result.authScheme,
    ok: String(result.ok),
  });

  res.status(result.ok ? 200 : 502).json(result);
});

// 2. Probar conexión y capturar snapshot 1080p en vivo vía AkuvoxController (Basic/Digest Auth)
app.get('/api/akuvox/test', async (req, res) => {
  const buildingId = String(req.query.buildingId || 'bldg-pocitos-2468');
  const deviceIp = req.query.deviceIp ? String(req.query.deviceIp) : undefined;
  const apiUser = req.query.apiUser ? String(req.query.apiUser) : undefined;
  const apiPassword = req.query.apiPassword ? String(req.query.apiPassword) : undefined;

  const snap = await getSnapshot(buildingId, {
    deviceIp,
    apiUser,
    apiPassword,
    forceReal: Boolean(deviceIp && !isAkuvoxMockMode()),
  });

  res.status(snap.ok ? 200 : 502).json({
    ok: snap.ok,
    simulated: snap.simulated,
    message: snap.message,
    snapshotDataUrl: snap.dataUrl,
    sourceUrl: snap.sourceUrl,
  });
});

app.get('/api/akuvox/snapshot', async (req, res) => {
  const buildingId = String(req.query.buildingId || 'bldg-pocitos-2468');
  const deviceIp = req.query.deviceIp ? String(req.query.deviceIp) : undefined;
  const snap = await getSnapshot(buildingId, { deviceIp });
  res.status(snap.ok ? 200 : 502).json(snap);
});

// 2.5 Sincronizar UIDs de llaveros/tarjetas RFID 13.56 MHz hacia el Akuvox E12W
app.post('/api/akuvox/sync-rfid', async (req, res) => {
  const {
    buildingId = 'bldg-pocitos-2468',
    cards = [],
    deviceIp,
    httpPort = 80,
    apiUser = 'admin',
    apiPassword = '',
    highSecurityMode = true,
    forceReal,
  } = req.body ?? {};

  const result = await syncRfidCards(
    String(buildingId),
    Array.isArray(cards) ? (cards as RfidCardSyncItem[]) : [],
    {
      deviceIp: deviceIp ? String(deviceIp) : undefined,
      httpPort: Number(httpPort),
      apiUser: String(apiUser),
      apiPassword: String(apiPassword),
      highSecurityMode: Boolean(highSecurityMode),
      forceReal: typeof forceReal === 'boolean' ? forceReal : undefined,
    }
  );

  recordEvent('rfid_scan', {
    action: 'sync_rfid_cards',
    syncedCount: String(result.syncedCount),
    simulated: String(result.simulated),
  });

  res.status(result.ok ? 200 : 502).json(result);
});

// 3. Webhook Third-Party QR Integration del Akuvox E12W
// Configurar en E12W: Access Control > Relay > Third Party Integration
// URL: http://<IP_SERVIDOR>:3001/api/akuvox/webhook/qr?codeKey={QRCode}&deviceId={DeviceID}
app.get('/api/akuvox/webhook/qr', (req, res) => {
  const codeKey = String(req.query.codeKey || '');
  const deviceId = String(req.query.deviceId || 'akuvox-e12w');
  recordEvent('qr_scan', { codeKey, deviceId });
  res.json({ ok: true, received: codeKey });
});

// 4. Webhook Action URLs del Akuvox E12W
// Configurar en E12W: Device Management > Setting > Action URL
app.get('/api/akuvox/webhook/action', (req, res) => {
  const eventType = String(req.query.event || 'call_start');
  const mapped: HardwareEvent['event'] =
    eventType === 'rfid_scan' ||
    eventType === 'relay_change' ||
    eventType === 'tamper' ||
    eventType === 'call_start'
      ? eventType
      : 'call_start';

  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    payload[k] = String(v);
  }
  recordEvent(mapped, payload);
  res.json({ ok: true });
});

// 5. Feed de eventos en tiempo real para el frontend Zaguán
app.get('/api/akuvox/events', (req, res) => {
  const since = String(req.query.since || '');
  if (!since) {
    res.json({ events: recentEvents.slice(0, 10) });
    return;
  }
  const idx = recentEvents.findIndex((e) => e.id === since);
  const newer = idx === -1 ? recentEvents.slice(0, 10) : recentEvents.slice(0, idx);
  res.json({ events: newer });
});

// 6. Sesión de audio bidireccional SIP/WebRTC para el botón [Hablar] de la App Residente
app.post('/api/akuvox/sip-talk', (req, res) => {
  const { action = 'start', unit = '4B', message = '' } = req.body ?? {};
  recordEvent('call_start', {
    action: String(action),
    unit: String(unit),
    message: String(message).slice(0, 160),
  });
  res.json({
    ok: true,
    channel: action === 'start' ? 'SIP_FULL_DUPLEX_ACTIVE' : 'SIP_CLOSED',
    codec: 'G.722/16000 (AEC)',
  });
});

// 7. Validación estricta de horarios/permisos para pases QR/PIN/RFID desde el E12W
app.post('/api/akuvox/validate-pass', (req, res) => {
  const { credential, passType = 'one_time', validUntilIso, days = [], startTime, endTime } =
    req.body ?? {};

  if (!credential) {
    res.status(400).json({ granted: false, reason: 'Falta credencial.' });
    return;
  }

  if (validUntilIso && new Date(validUntilIso).getTime() <= Date.now()) {
    res.json({ granted: false, reason: 'Pase expirado por ventana horaria.' });
    return;
  }

  if (passType === 'recurring_schedule') {
    const now = new Date();
    const dayMap = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const today = dayMap[now.getDay()];
    const curMin = now.getHours() * 60 + now.getMinutes();
    const parseMin = (t: string) => {
      const [h, m] = String(t || '').split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1;
    };
    const sMin = parseMin(startTime);
    const eMin = parseMin(endTime);
    if (!Array.isArray(days) || !days.includes(today) || curMin < sMin || curMin > eMin) {
      res.json({
        granted: false,
        reason: `Bloqueado fuera de franja horaria (${today} ${now.getHours()}:${String(
          now.getMinutes()
        ).padStart(2, '0')}).`,
      });
      return;
    }
  }

  recordEvent('rfid_scan', { credential: String(credential), granted: 'true' });
  res.json({ granted: true, reason: 'Permiso validado.' });
});

// ============================================================================
// 8. Flujo Público de Magic Link (/api/pase/:token y /api/pase/:token/open)
// ============================================================================
interface StoredMagicPass {
  token: string;
  pin: string;
  guestName: string;
  unit: string;
  passType: 'one_time' | 'recurring_schedule' | 'permanent';
  status: 'active' | 'used' | 'revoked' | 'expired';
  validFromIso: string;
  validUntilIso: string;
  accessScope: string;
  buildingName: string;
  buildingAddress: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

const magicPassStore = new Map<string, StoredMagicPass>([
  [
    'ZAG-7310',
    {
      token: 'ZAG-7310',
      pin: '7310',
      guestName: 'Sofía Méndez (Visita)',
      unit: '4B',
      passType: 'one_time',
      status: 'active',
      validFromIso: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      validUntilIso: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      accessScope: 'Acceso peatonal y garaje',
      buildingName: 'Edificio Pocitos 2468',
      buildingAddress: 'Bvar. España 2468, Pocitos, Montevideo',
      latitude: -34.91462,
      longitude: -56.15189,
      geofenceRadiusMeters: 30,
    },
  ],
  [
    'ZAG-6104',
    {
      token: 'ZAG-6104',
      pin: '6104',
      guestName: 'PedidosYa Market',
      unit: '4B',
      passType: 'one_time',
      status: 'used',
      validFromIso: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      validUntilIso: new Date(Date.now() + 3600 * 1000).toISOString(),
      accessScope: 'Acceso peatonal',
      buildingName: 'Edificio Pocitos 2468',
      buildingAddress: 'Bvar. España 2468, Pocitos, Montevideo',
      latitude: -34.91462,
      longitude: -56.15189,
      geofenceRadiusMeters: 30,
    },
  ],
]);

// Registrar/sincronizar pases nuevos creados en la App Residente hacia el backend LAN
app.post('/api/pase/register', (req, res) => {
  const b = req.body ?? {};
  const token = String(b.token || '').trim().toUpperCase();
  if (!token) {
    res.status(400).json({ ok: false, message: 'Token requerido.' });
    return;
  }
  magicPassStore.set(token, {
    token,
    pin: String(b.pin || '0000'),
    guestName: String(b.guestName || 'Visita'),
    unit: String(b.unit || '4B'),
    passType: b.passType || 'one_time',
    status: b.status || 'active',
    validFromIso: b.validFromIso || new Date().toISOString(),
    validUntilIso: b.validUntilIso || new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    accessScope: String(b.accessScope || 'Acceso peatonal'),
    buildingName: String(b.buildingName || 'Edificio Pocitos 2468'),
    buildingAddress: String(b.buildingAddress || 'Bvar. España 2468, Pocitos, Montevideo'),
    latitude: Number(b.latitude ?? -34.91462),
    longitude: Number(b.longitude ?? -56.15189),
    geofenceRadiusMeters: Number(b.geofenceRadiusMeters ?? 30),
  });
  res.json({ ok: true, token });
});

// Validar estado de un Magic Link público (/pase/[token])
app.get('/api/pase/:token', (req, res) => {
  const token = String(req.params.token || '').trim().toUpperCase();
  const pass = magicPassStore.get(token);

  if (!pass) {
    res.status(404).json({
      valid: false,
      status: 'not_found',
      reason: 'Este enlace de acceso no existe o fue eliminado.',
    });
    return;
  }

  const now = Date.now();
  if (pass.status === 'active' && new Date(pass.validUntilIso).getTime() <= now) {
    pass.status = 'expired';
  }

  if (pass.status !== 'active') {
    const reasons: Record<string, string> = {
      used: 'Este pase de un solo uso ya fue utilizado y se destruyó automáticamente.',
      expired: 'Este pase expiró fuera de su ventana horaria.',
      revoked: 'Este pase fue revocado por el residente.',
    };
    res.status(410).json({
      valid: false,
      status: pass.status,
      reason: reasons[pass.status] || 'El pase ya no es válido.',
      buildingName: pass.buildingName,
    });
    return;
  }

  res.json({
    valid: true,
    pass,
  });
});

// Abrir puerta por Magic Link validando proximidad GPS (<= geofenceRadiusMeters) y quemando pase one_time
app.post('/api/pase/:token/open', (req, res) => {
  const token = String(req.params.token || '').trim().toUpperCase();
  const pass = magicPassStore.get(token);

  if (!pass) {
    res.status(404).json({ granted: false, reason: 'El pase no existe.' });
    return;
  }

  if (pass.status === 'active' && new Date(pass.validUntilIso).getTime() <= Date.now()) {
    pass.status = 'expired';
  }

  if (pass.status !== 'active') {
    res.status(410).json({
      granted: false,
      reason: 'Este pase ya fue usado, expiró o fue revocado.',
    });
    return;
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({
      granted: false,
      reason: 'Se requieren coordenadas GPS válidas para abrir la puerta.',
    });
    return;
  }

  const distance = haversineMeters(lat, lng, pass.latitude, pass.longitude);
  if (distance > pass.geofenceRadiusMeters) {
    res.status(403).json({
      granted: false,
      distanceMeters: distance,
      maxRadiusMeters: pass.geofenceRadiusMeters,
      reason: `Estás a ${Math.round(distance)} m de la puerta. Acercate a menos de ${pass.geofenceRadiusMeters} m para habilitar la apertura.`,
    });
    return;
  }

  // Quemar el pase one_time al instante
  if (pass.passType === 'one_time') {
    pass.status = 'used';
  }

  recordEvent('qr_scan', {
    token: pass.token,
    guest: pass.guestName,
    unit: pass.unit,
    distanceMeters: String(distance),
    method: 'magic_link_gps',
  });

  res.json({
    granted: true,
    distanceMeters: distance,
    burned: pass.passType === 'one_time',
    message: 'Puerta abierta. Bienvenido al edificio.',
  });
});

// ============================================================================
// 9. Validación Inteligente de Paquetería (Snapshot Akuvox E12W + Visión IA)
// ============================================================================
interface BackendExpectedPackage {
  id: string;
  unit: string;
  residentName: string;
  carrier: string;
  description: string;
  timeWindowLabel: string;
  autoRule: 'auto_open_after_ocr' | 'ask_confirmation_photo';
  storageMode: 'zaguan' | 'locker';
  status: 'expected' | 'delivered';
}

const expectedPackageStore: BackendExpectedPackage[] = [];

app.post('/api/packages/preauthorize', (req, res) => {
  const b = req.body ?? {};
  const item: BackendExpectedPackage = {
    id: String(b.id || `pkg-${Date.now()}`),
    unit: String(b.unit || '4B').toUpperCase(),
    residentName: String(b.residentName || 'Martín Silva'),
    carrier: String(b.carrier || 'Mercado Libre'),
    description: String(b.description || ''),
    timeWindowLabel: String(b.timeWindowLabel || 'Hoy 08:00–22:00'),
    autoRule:
      b.autoRule === 'ask_confirmation_photo' ? 'ask_confirmation_photo' : 'auto_open_after_ocr',
    storageMode: b.storageMode === 'locker' ? 'locker' : 'zaguan',
    status: 'expected',
  };
  expectedPackageStore.unshift(item);
  res.json({ ok: true, package: item });
});

app.post('/api/packages/validate-frame', async (req, res) => {
  const {
    imageBase64,
    mimeType = 'image/jpeg',
    simulatedLabelText,
    akuvoxDeviceIp,
    akuvoxUser = 'admin',
    akuvoxPassword = '',
  } = req.body ?? {};

  let frameBase64: string | null =
    typeof imageBase64 === 'string' && imageBase64.length > 32
      ? imageBase64.replace(/^data:[^;]+;base64,/, '')
      : null;

  // Si no se envió frame pero sí IP del Akuvox E12W, capturar snapshot 1080p en vivo
  if (!frameBase64 && akuvoxDeviceIp) {
    try {
      const auth = `Basic ${Buffer.from(`${akuvoxUser}:${akuvoxPassword}`).toString('base64')}`;
      const snap = await fetch(`http://${akuvoxDeviceIp}:8080/picture.jpg`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(4000),
      });
      if (snap.ok) {
        frameBase64 = Buffer.from(await snap.arrayBuffer()).toString('base64');
      }
    } catch {
      // Continuar con fallback si el E12W no es alcanzable
    }
  }

  // Visión multimodal real con Gemini 2.5 Flash cuando hay GEMINI_API_KEY + frame de cámara
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && frameBase64) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: String(mimeType),
              data: frameBase64,
            },
          },
          {
            text: [
              'Sos el módulo de visión OCR de Zaguán (portero inteligente en Montevideo, Uruguay).',
              'Analizá esta captura de cámara de la entrada y extraé los datos de la etiqueta del paquete o bolsa de envío.',
              'Devolvé ÚNICAMENTE un JSON válido con las claves exactas:',
              '{ "isPackageVisible": boolean, "unitNumber": string | null, "recipientName": string | null, "carrier": string | null, "trackingCode": string | null, "confidence": number (0 a 1), "rawLabelText": string }.',
              'Ejemplo de unitNumber: "4B", "3A", "101". Si no se distingue un paquete o etiqueta legible, devolvé isPackageVisible: false.',
            ].join(' '),
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}') as Record<string, unknown>;
      const extraction = {
        isPackageVisible: Boolean(parsed.isPackageVisible),
        unitNumber: parsed.unitNumber ? String(parsed.unitNumber).toUpperCase() : undefined,
        recipientName: parsed.recipientName ? String(parsed.recipientName) : undefined,
        carrier: parsed.carrier ? String(parsed.carrier) : undefined,
        trackingCode: parsed.trackingCode ? String(parsed.trackingCode) : undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        rawLabelText: String(parsed.rawLabelText || ''),
        engine: 'gemini-2.5-flash' as const,
      };
      recordEvent('qr_scan', {
        method: 'gemini_vision_ocr',
        unit: extraction.unitNumber || 'unknown',
        carrier: extraction.carrier || 'unknown',
      });
      res.json({ ok: true, extraction });
      return;
    } catch (err) {
      console.error('[Vision OCR] Error llamando a Gemini:', err);
    }
  }

  // Fallback estructurado cuando no hay GEMINI_API_KEY configurada
  const raw = String(
    simulatedLabelText || 'MERCADO LIBRE FULL · Martín Silva · Apto 4B · #ML-402'
  );
  const unitMatch = raw.match(/\b([1-9][a-dA-D]|[1-9]\d{2})\b/);
  const trackingMatch = raw.match(/#?([A-Z]{2,4}-?\d{3,8})/i);
  const lower = raw.toLowerCase();
  const carrier = lower.includes('mercado')
    ? 'Mercado Libre'
    : lower.includes('pedidos')
      ? 'PedidosYa'
      : lower.includes('dac')
        ? 'DAC Agencia Central'
        : lower.includes('correo')
          ? 'Correo Uruguayo'
          : 'Mensajería';

  res.json({
    ok: true,
    extraction: {
      isPackageVisible: true,
      unitNumber: unitMatch ? unitMatch[1].toUpperCase() : '4B',
      recipientName: lower.includes('carolina')
        ? 'Carolina Vega'
        : lower.includes('roberto')
          ? 'Roberto Pereyra'
          : 'Martín Silva',
      carrier,
      trackingCode: trackingMatch ? `#${trackingMatch[1].toUpperCase()}` : '#PKG-402',
      confidence: 0.96,
      rawLabelText: raw,
      engine: 'ocr-local-fallback',
    },
  });
});

// ============================================================================
// 10. Orquestador del Portero Virtual con IA (Webhook Botón E12W + Voz / SIP)
// ============================================================================
app.post('/api/concierge/webhook/call-start', async (req, res) => {
  const buildingId = String(req.body?.buildingId || 'bldg-pocitos-2468');
  const snap = await getSnapshot(buildingId);
  recordEvent('call_start', {
    buildingId,
    source: 'akuvox_e12w_button',
    snapshotOk: String(snap.ok),
  });
  res.json({
    ok: true,
    sessionId: `sip-${Date.now()}`,
    greeting: 'Hola, bienvenido al edificio. ¿A qué departamento visitás o traés entrega?',
    systemPromptLoaded: ZAGUAN_CONCIERGE_SYSTEM_PROMPT.length > 0,
    availableTools: ['buscarResidente', 'validarCodigoVoz', 'procesarPaquete'],
    snapshotDataUrl: snap.dataUrl,
  });
});

app.post('/api/concierge/turn', async (req, res) => {
  const {
    utterance = '',
    buildingId = 'bldg-pocitos-2468',
    residents = [
      { unit: '4B', name: 'Martín Silva', active: true },
      { unit: '3A', name: 'Carolina Vega', active: true },
      { unit: '2B', name: 'Roberto Pereyra', active: true },
    ],
    activeVoicePasses,
    expectedPackages,
  } = req.body ?? {};

  if (!String(utterance).trim()) {
    res.status(400).json({ ok: false, message: 'Falta utterance (frase del visitante).' });
    return;
  }

  const passesFromStore = Array.from(magicPassStore.values())
    .filter((p) => p.status === 'active')
    .map((p) => ({
      code: p.token,
      pin: p.pin,
      guestName: p.guestName,
      unit: p.unit,
      singleUse: p.passType === 'one_time',
      validUntilIso: p.validUntilIso,
    }));

  const turn = await handleConciergeUtterance(String(utterance), {
    buildingId: String(buildingId),
    residents,
    activeVoicePasses: Array.isArray(activeVoicePasses) ? activeVoicePasses : passesFromStore,
    expectedPackages: Array.isArray(expectedPackages)
      ? expectedPackages
      : expectedPackageStore.filter((p) => p.status === 'expected'),
  });

  recordEvent('call_start', {
    engine: turn.engine,
    tools: turn.toolCalls.map((t) => t.tool).join(',') || 'none',
    doorOpened: String(turn.doorOpened),
  });

  res.json({ ok: true, ...turn });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Zaguán Digital — Puente Akuvox E12W + Orquestador IA activo en http://0.0.0.0:${PORT} (MOCK=${isAkuvoxMockMode()})`
  );
  console.log(`  • Third-Party QR Webhook: http://<TU_IP>:${PORT}/api/akuvox/webhook/qr?codeKey={QRCode}&deviceId={DeviceID}`);
  console.log(`  • Action URL Webhook:     http://<TU_IP>:${PORT}/api/akuvox/webhook/action?event=call_start&mac=$mac&ip=$ip`);
  console.log(`  • AI Concierge Webhook:   POST http://<TU_IP>:${PORT}/api/concierge/webhook/call-start`);
});
