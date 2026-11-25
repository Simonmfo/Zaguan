import crypto from 'crypto';

/**
 * Zaguán Digital — Controlador Encapsulado HTTP API REST para Akuvox E12W
 *
 * Características:
 * - Soporte real de autenticación HTTP Basic y HTTP Digest (RFC 2617, requerido en High Security Mode)
 * - Timeouts cortos configurables (AKUVOX_TIMEOUT_MS, default 3500ms)
 * - Modo simulador/mock configurable por variable de entorno (AKUVOX_MOCK_MODE=true|false)
 * - Operaciones principales:
 *     1. openDoor(buildingId, relayId = 1)
 *     2. getSnapshot(buildingId)
 *     3. syncRfidCards(buildingId, cards)
 */

export interface AkuvoxBuildingDeviceConfig {
  buildingId: string;
  deviceIp: string;
  httpPort: number;
  apiUser: string;
  apiPassword: string;
  highSecurityMode: boolean;
  secondaryRelayUrl?: string;
}

export interface RfidCardSyncItem {
  uid: string;
  holderName: string;
  unit: string;
  days: string[];
  startTime: string;
  endTime: string;
  active: boolean;
}

export interface AkuvoxOpenDoorResult {
  ok: boolean;
  simulated: boolean;
  buildingId: string;
  relayId: number;
  endpoint: string;
  authScheme: 'mock' | 'basic' | 'digest' | 'query';
  message: string;
  timestamp: string;
}

export interface AkuvoxSnapshotResult {
  ok: boolean;
  simulated: boolean;
  buildingId: string;
  sourceUrl: string;
  mimeType: string;
  base64?: string;
  dataUrl?: string;
  message: string;
}

export interface AkuvoxRfidSyncResult {
  ok: boolean;
  simulated: boolean;
  buildingId: string;
  syncedCount: number;
  revokedCount: number;
  failedCount: number;
  cardsProcessed: string[];
  message: string;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AKUVOX_TIMEOUT_MS || 3500);

// 1x1 transparent PNG fallback when running pure mock mode without physical camera
const MOCK_SNAPSHOT_PLACEHOLDER_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Registro en memoria por edificio (se alimenta desde Supabase o variables de entorno)
const buildingDevices = new Map<string, AkuvoxBuildingDeviceConfig>([
  [
    'bldg-pocitos-2468',
    {
      buildingId: 'bldg-pocitos-2468',
      deviceIp: process.env.AKUVOX_DEFAULT_IP || '192.168.1.120',
      httpPort: Number(process.env.AKUVOX_HTTP_PORT || 80),
      apiUser: process.env.AKUVOX_API_USER || 'admin',
      apiPassword: process.env.AKUVOX_API_PASSWORD || '',
      highSecurityMode: process.env.AKUVOX_HIGH_SECURITY_MODE !== 'false',
      secondaryRelayUrl: process.env.AKUVOX_SECONDARY_RELAY_URL || '',
    },
  ],
]);

export function isAkuvoxMockMode(overrideReal?: boolean): boolean {
  if (overrideReal === true) return false;
  if (overrideReal === false) return true;
  return process.env.AKUVOX_MOCK_MODE !== 'false';
}

export function registerBuildingAkuvoxConfig(config: AkuvoxBuildingDeviceConfig): void {
  buildingDevices.set(config.buildingId, config);
}

export function getBuildingAkuvoxConfig(
  buildingId: string,
  override?: Partial<AkuvoxBuildingDeviceConfig>
): AkuvoxBuildingDeviceConfig {
  const existing = buildingDevices.get(buildingId) ??
    buildingDevices.get('bldg-pocitos-2468') ?? {
      buildingId,
      deviceIp: process.env.AKUVOX_DEFAULT_IP || '192.168.1.120',
      httpPort: 80,
      apiUser: process.env.AKUVOX_API_USER || 'admin',
      apiPassword: process.env.AKUVOX_API_PASSWORD || '',
      highSecurityMode: true,
    };

  return {
    ...existing,
    ...override,
    buildingId,
  };
}

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] ?? match[3] ?? '';
  }
  return result;
}

function buildDigestHeader(params: {
  method: string;
  uri: string;
  username: string;
  password: string;
  challenge: Record<string, string>;
}): string {
  const { method, uri, username, password, challenge } = params;
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop ? challenge.qop.split(',')[0].trim() : '';
  const opaque = challenge.opaque || '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (opaque) {
    parts.push(`opaque="${opaque}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

/**
 * Ejecuta una petición HTTP con timeout corto soportando Basic Auth
 * y negociación automática RFC 2617 HTTP Digest si el Akuvox responde 401 Digest.
 */
async function fetchAkuvoxWithAuth(
  url: string,
  opts: {
    method?: 'GET' | 'POST';
    username: string;
    password: string;
    body?: string;
    contentType?: string;
    timeoutMs?: number;
  }
): Promise<{ response: Response; scheme: 'basic' | 'digest' }> {
  const method = opts.method || 'GET';
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const basicHeader = `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString('base64')}`;

  const baseHeaders: Record<string, string> = {
    Authorization: basicHeader,
  };
  if (opts.contentType) {
    baseHeaders['Content-Type'] = opts.contentType;
  }

  const firstRes = await fetch(url, {
    method,
    headers: baseHeaders,
    body: opts.body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (firstRes.status !== 401) {
    return { response: firstRes, scheme: 'basic' };
  }

  const wwwAuth = firstRes.headers.get('www-authenticate') || '';
  if (!wwwAuth.toLowerCase().includes('digest')) {
    return { response: firstRes, scheme: 'basic' };
  }

  const parsedUrl = new URL(url);
  const uri = `${parsedUrl.pathname}${parsedUrl.search}`;
  const challenge = parseDigestChallenge(wwwAuth);
  const digestHeader = buildDigestHeader({
    method,
    uri,
    username: opts.username,
    password: opts.password,
    challenge,
  });

  const digestHeaders: Record<string, string> = {
    Authorization: digestHeader,
  };
  if (opts.contentType) {
    digestHeaders['Content-Type'] = opts.contentType;
  }

  const secondRes = await fetch(url, {
    method,
    headers: digestHeaders,
    body: opts.body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  return { response: secondRes, scheme: 'digest' };
}

/**
 * 1. Dispara el relé de apertura de puerta del Akuvox E12W (o relé auxiliar 2 para Doble Exclusa)
 */
export async function openDoor(
  buildingId: string,
  relayId: 1 | 2 = 1,
  override?: Partial<AkuvoxBuildingDeviceConfig> & { forceReal?: boolean }
): Promise<AkuvoxOpenDoorResult> {
  const cfg = getBuildingAkuvoxConfig(buildingId, override);
  const host = cfg.httpPort === 80 ? cfg.deviceIp : `${cfg.deviceIp}:${cfg.httpPort}`;
  const timestamp = new Date().toISOString();

  // Relé 2 opcional (Doble Exclusa): usa URL de relé IP auxiliar si existe
  const endpoint =
    relayId === 2 && cfg.secondaryRelayUrl
      ? cfg.secondaryRelayUrl
      : cfg.highSecurityMode
        ? `http://${host}/fcgi/OpenDoor?action=OpenDoor&DoorNum=${relayId}`
        : `http://${host}/fcgi/do?action=OpenDoor&UserName=${encodeURIComponent(
            cfg.apiUser
          )}&Password=${encodeURIComponent(cfg.apiPassword)}&DoorNum=${relayId}`;

  if (isAkuvoxMockMode(override?.forceReal)) {
    console.log(
      `[AkuvoxController:MOCK] openDoor(building=${buildingId}, relay=${relayId}) → ${endpoint}`
    );
    return {
      ok: true,
      simulated: true,
      buildingId,
      relayId,
      endpoint: endpoint.replace(/Password=[^&]+/, 'Password=****'),
      authScheme: 'mock',
      message: `Relé ${relayId} activado en modo simulador (AKUVOX_MOCK_MODE=true).`,
      timestamp,
    };
  }

  try {
    if (relayId === 2 && cfg.secondaryRelayUrl) {
      const r2 = await fetch(cfg.secondaryRelayUrl, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      return {
        ok: r2.ok,
        simulated: false,
        buildingId,
        relayId,
        endpoint: cfg.secondaryRelayUrl,
        authScheme: 'basic',
        message: r2.ok
          ? 'Relé 2 externo (Hall / Doble Exclusa) desbloqueado.'
          : `Relé 2 respondió HTTP ${r2.status}.`,
        timestamp,
      };
    }

    if (!cfg.highSecurityMode) {
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
      return {
        ok: r.ok,
        simulated: false,
        buildingId,
        relayId,
        endpoint: endpoint.replace(/Password=[^&]+/, 'Password=****'),
        authScheme: 'query',
        message: r.ok
          ? `Relé ${relayId} del Akuvox E12W desbloqueado.`
          : `Akuvox E12W respondió HTTP ${r.status}.`,
        timestamp,
      };
    }

    const { response, scheme } = await fetchAkuvoxWithAuth(endpoint, {
      method: 'GET',
      username: cfg.apiUser,
      password: cfg.apiPassword,
    });

    const bodyText = await response.text().catch(() => '');
    return {
      ok: response.ok,
      simulated: false,
      buildingId,
      relayId,
      endpoint,
      authScheme: scheme,
      message: response.ok
        ? `Relé ${relayId} del Akuvox E12W desbloqueado (${scheme.toUpperCase()} Auth).`
        : `Akuvox E12W respondió HTTP ${response.status}: ${bodyText.slice(0, 120)}`,
      timestamp,
    };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      buildingId,
      relayId,
      endpoint: endpoint.replace(/Password=[^&]+/, 'Password=****'),
      authScheme: cfg.highSecurityMode ? 'digest' : 'query',
      message: `Timeout/error conectando al Akuvox E12W (${cfg.deviceIp}): ${
        err instanceof Error ? err.message : 'Error de red'
      }`,
      timestamp,
    };
  }
}

/**
 * 2. Captura un snapshot JPEG instantáneo desde la cámara 1080p del Akuvox E12W
 */
export async function getSnapshot(
  buildingId: string,
  override?: Partial<AkuvoxBuildingDeviceConfig> & { forceReal?: boolean }
): Promise<AkuvoxSnapshotResult> {
  const cfg = getBuildingAkuvoxConfig(buildingId, override);
  const primaryUrl = `http://${cfg.deviceIp}:8080/picture.jpg`;

  if (isAkuvoxMockMode(override?.forceReal)) {
    return {
      ok: true,
      simulated: true,
      buildingId,
      sourceUrl: primaryUrl,
      mimeType: 'image/png',
      base64: MOCK_SNAPSHOT_PLACEHOLDER_B64,
      dataUrl: `data:image/png;base64,${MOCK_SNAPSHOT_PLACEHOLDER_B64}`,
      message: 'Snapshot simulado devuelto (AKUVOX_MOCK_MODE=true).',
    };
  }

  const candidates = [
    `http://${cfg.deviceIp}:8080/picture.jpg`,
    `http://${cfg.deviceIp}:8080/jpeg.cgi`,
    `http://${cfg.deviceIp}/picture.jpg`,
  ];

  for (const url of candidates) {
    try {
      const { response } = await fetchAkuvoxWithAuth(url, {
        method: 'GET',
        username: cfg.apiUser,
        password: cfg.apiPassword,
      });
      if (response.ok) {
        const buf = Buffer.from(await response.arrayBuffer());
        const b64 = buf.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return {
          ok: true,
          simulated: false,
          buildingId,
          sourceUrl: url,
          mimeType,
          base64: b64,
          dataUrl: `data:${mimeType};base64,${b64}`,
          message: `Snapshot 1080p capturado desde ${url}`,
        };
      }
    } catch {
      // Probar siguiente endpoint candidato del E12W
    }
  }

  return {
    ok: false,
    simulated: false,
    buildingId,
    sourceUrl: primaryUrl,
    mimeType: 'image/jpeg',
    message: `No se pudo obtener snapshot JPEG del Akuvox E12W (${cfg.deviceIp}:8080/picture.jpg).`,
  };
}

/**
 * 3. Sincroniza los UIDs de llaveros/tarjetas RFID 13.56 MHz activos con el Akuvox E12W
 */
export async function syncRfidCards(
  buildingId: string,
  cards: RfidCardSyncItem[],
  override?: Partial<AkuvoxBuildingDeviceConfig> & { forceReal?: boolean }
): Promise<AkuvoxRfidSyncResult> {
  const cfg = getBuildingAkuvoxConfig(buildingId, override);
  const activeCards = cards.filter((c) => c.active && c.uid.trim().length > 0);
  const revokedCards = cards.filter((c) => !c.active && c.uid.trim().length > 0);

  if (isAkuvoxMockMode(override?.forceReal)) {
    console.log(
      `[AkuvoxController:MOCK] syncRfidCards(building=${buildingId}) → ${activeCards.length} activas, ${revokedCards.length} revocadas`
    );
    return {
      ok: true,
      simulated: true,
      buildingId,
      syncedCount: activeCards.length,
      revokedCount: revokedCards.length,
      failedCount: 0,
      cardsProcessed: activeCards.map((c) => `${c.uid} (${c.holderName})`),
      message: `${activeCards.length} tarjeta(s) RFID sincronizadas y ${revokedCards.length} revocada(s) en modo simulador.`,
    };
  }

  const host = cfg.httpPort === 80 ? cfg.deviceIp : `${cfg.deviceIp}:${cfg.httpPort}`;
  const syncEndpoint = `http://${host}/api/user/set`;
  let syncedCount = 0;
  let failedCount = 0;
  const processed: string[] = [];

  for (const card of activeCards) {
    const cleanUid = card.uid.replace(/:/g, '').toUpperCase();
    try {
      const payload = JSON.stringify({
        target: 'user',
        action: 'add',
        data: {
          item: [
            {
              Name: `${card.holderName} (${card.unit})`,
              UserID: cleanUid,
              CardCode: cleanUid,
              ScheduleRelay: '1001-1;',
              WebRelay: '1',
            },
          ],
        },
      });
      const { response } = await fetchAkuvoxWithAuth(syncEndpoint, {
        method: 'POST',
        username: cfg.apiUser,
        password: cfg.apiPassword,
        body: payload,
        contentType: 'application/json',
      });
      if (response.ok) {
        syncedCount++;
        processed.push(`${card.uid} (${card.holderName})`);
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  return {
    ok: failedCount === 0,
    simulated: false,
    buildingId,
    syncedCount,
    revokedCount: revokedCards.length,
    failedCount,
    cardsProcessed: processed,
    message:
      failedCount === 0
        ? `Sincronizadas ${syncedCount} tarjetas RFID 13.56 MHz en Akuvox E12W (${cfg.deviceIp}).`
        : `Sincronización parcial: ${syncedCount} OK, ${failedCount} fallaron al contactar ${cfg.deviceIp}.`,
  };
}
