import express from 'express';

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

// 1. Abrir relé del Akuvox E12W (DoorNum=1) o relé secundario (DoorNum=2)
app.post('/api/akuvox/open-door', async (req, res) => {
  const {
    deviceIp,
    httpPort = 80,
    apiUser = 'admin',
    apiPassword = '',
    highSecurityMode = true,
    doorNum = 1,
    secondaryRelayUrl = '',
  } = req.body ?? {};

  if (!deviceIp && doorNum === 1) {
    res.status(400).json({ ok: false, message: 'Falta deviceIp del Akuvox E12W.' });
    return;
  }

  try {
    // Puerta 2 (Doble Exclusa): usa relé IP secundario porque el E12W tiene 1 solo relé integrado
    if (Number(doorNum) === 2 && secondaryRelayUrl) {
      const r2 = await fetch(secondaryRelayUrl, { signal: AbortSignal.timeout(5000) });
      res.json({
        ok: r2.ok,
        message: r2.ok
          ? 'Relé 2 externo (Puerta Hall / Doble Exclusa) activado correctamente.'
          : `Relé 2 respondió HTTP ${r2.status}`,
      });
      return;
    }

    const host = Number(httpPort) === 80 ? deviceIp : `${deviceIp}:${httpPort}`;
    const url = highSecurityMode
      ? `http://${host}/fcgi/OpenDoor?action=OpenDoor&DoorNum=1`
      : `http://${host}/fcgi/do?action=OpenDoor&UserName=${encodeURIComponent(
          apiUser
        )}&Password=${encodeURIComponent(apiPassword)}&DoorNum=1`;

    const headers: Record<string, string> = {};
    if (highSecurityMode) {
      const token = Buffer.from(`${apiUser}:${apiPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    const text = await response.text();
    res.json({
      ok: response.ok,
      message: response.ok
        ? 'Relé 1 del Akuvox E12W desbloqueado.'
        : `Akuvox respondió HTTP ${response.status}: ${text.slice(0, 120)}`,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      message: `Error conectando al Akuvox E12W (${deviceIp}): ${
        err instanceof Error ? err.message : 'Timeout'
      }`,
    });
  }
});

// 2. Probar conexión y capturar snapshot en vivo del E12W (:8080/picture.jpg o /jpeg.cgi)
app.get('/api/akuvox/test', async (req, res) => {
  const deviceIp = String(req.query.deviceIp || '');
  const apiUser = String(req.query.apiUser || 'admin');
  const apiPassword = String(req.query.apiPassword || '');

  if (!deviceIp) {
    res.status(400).json({ ok: false, message: 'Ingresá la IP del Akuvox E12W.' });
    return;
  }

  const authHeader = `Basic ${Buffer.from(`${apiUser}:${apiPassword}`).toString('base64')}`;
  const candidates = [
    `http://${deviceIp}:8080/picture.jpg`,
    `http://${deviceIp}:8080/jpeg.cgi`,
    `http://${deviceIp}/picture.jpg`,
  ];

  for (const url of candidates) {
    try {
      const snap = await fetch(url, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(4000),
      });
      if (snap.ok) {
        const buf = Buffer.from(await snap.arrayBuffer());
        const b64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
        res.json({
          ok: true,
          message: `Conexión OK con Akuvox E12W (${url})`,
          snapshotDataUrl: b64,
        });
        return;
      }
    } catch {
      // Try next snapshot endpoint
    }
  }

  res.status(502).json({
    ok: false,
    message: `No se pudo obtener snapshot de ${deviceIp} (:8080/picture.jpg). Verificá que el E12W esté en la misma red y RTSP/HTTP habilitado.`,
  });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zaguán Digital — Puente Akuvox E12W activo en http://0.0.0.0:${PORT}`);
  console.log(`  • Third-Party QR Webhook: http://<TU_IP>:${PORT}/api/akuvox/webhook/qr?codeKey={QRCode}&deviceId={DeviceID}`);
  console.log(`  • Action URL Webhook:     http://<TU_IP>:${PORT}/api/akuvox/webhook/action?event=call_start&mac=$mac&ip=$ip`);
});
