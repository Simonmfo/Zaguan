import { AkuvoxConfig } from '../types/zaguan';

export const DEFAULT_AKUVOX_CONFIG: AkuvoxConfig = {
  enabled: false,
  deviceIp: '192.168.1.120',
  httpPort: 80,
  apiUser: 'admin',
  apiPassword: '',
  highSecurityMode: true,
  sipServerIp: '192.168.1.50',
  sipExtension: 'e12w_entrada',
  hasWiegandKeypad: false,
  secondaryRelayUrl: '',
  bridgeUrl: '',
};

export function buildAkuvoxOpenDoorUrl(config: AkuvoxConfig, doorNum: 1 | 2 = 1): string {
  const host = config.httpPort === 80 ? config.deviceIp : `${config.deviceIp}:${config.httpPort}`;
  if (config.highSecurityMode) {
    return `http://${config.apiUser}:****@${host}/fcgi/OpenDoor?action=OpenDoor&DoorNum=${doorNum}`;
  }
  return `http://${host}/fcgi/do?action=OpenDoor&UserName=${config.apiUser}&Password=****&DoorNum=${doorNum}`;
}

export function buildAkuvoxRtspUrl(config: AkuvoxConfig): string {
  return `rtsp://${config.apiUser}:****@${config.deviceIp}:554/live/ch00_0`;
}

export function buildAkuvoxSnapshotUrl(config: AkuvoxConfig): string {
  return `http://${config.deviceIp}:8080/picture.jpg`;
}

export function buildZaguanWebhookUrls(serverHost = 'http://<IP_SERVIDOR_ZAGUAN>:3001') {
  return {
    qrThirdPartyUrl: `${serverHost}/api/akuvox/webhook/qr?codeKey={QRCode}&deviceId={DeviceID}`,
    actionCallStart: `${serverHost}/api/akuvox/webhook/action?event=call_start&mac=$mac&ip=$ip`,
    actionRfidValid: `${serverHost}/api/akuvox/webhook/action?event=rfid_scan&card=$card_sn&relay1status=$relay1status&mac=$mac`,
    actionRelayChange: `${serverHost}/api/akuvox/webhook/action?event=relay_change&relay1status=$relay1status&mac=$mac`,
    actionTamper: `${serverHost}/api/akuvox/webhook/action?event=tamper&mac=$mac&ip=$ip`,
  };
}

export interface AkuvoxCommandResult {
  ok: boolean;
  simulated: boolean;
  endpoint: string;
  message: string;
}

function apiBase(config: AkuvoxConfig): string {
  return config.bridgeUrl ? config.bridgeUrl.replace(/\/$/, '') : '';
}

export async function triggerAkuvoxDoor(
  config: AkuvoxConfig,
  doorNum: 1 | 2 = 1
): Promise<AkuvoxCommandResult> {
  const displayEndpoint =
    doorNum === 2 && config.secondaryRelayUrl
      ? config.secondaryRelayUrl
      : buildAkuvoxOpenDoorUrl(config, 1);

  if (!config.enabled) {
    return {
      ok: true,
      simulated: true,
      endpoint: displayEndpoint,
      message:
        doorNum === 1
          ? 'Relé 1 del Akuvox E12W disparado (simulación)'
          : 'Relé 2 externo (Doble Exclusa) disparado (simulación)',
    };
  }

  try {
    const res = await fetch(`${apiBase(config)}/api/akuvox/open-door`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceIp: config.deviceIp,
        httpPort: config.httpPort,
        apiUser: config.apiUser,
        apiPassword: config.apiPassword,
        highSecurityMode: config.highSecurityMode,
        doorNum,
        secondaryRelayUrl: config.secondaryRelayUrl,
      }),
    });
    const data = (await res.json()) as { ok: boolean; message?: string };
    return {
      ok: res.ok && data.ok,
      simulated: false,
      endpoint: displayEndpoint,
      message: data.message || (res.ok ? 'Relé activado en hardware E12W' : 'Error HTTP en E12W'),
    };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      endpoint: displayEndpoint,
      message: `No se pudo contactar al puente local (ejecutá "npm run server"): ${
        err instanceof Error ? err.message : 'Error de red'
      }`,
    };
  }
}

export async function testAkuvoxConnection(
  config: AkuvoxConfig
): Promise<{ ok: boolean; message: string; snapshotDataUrl?: string }> {
  if (!config.enabled) {
    return {
      ok: true,
      message:
        'Modo Simulación activo. Activá "Conectar hardware real" y ejecutá "npm run server" para probar tu Akuvox E12W en la LAN.',
    };
  }

  try {
    const params = new URLSearchParams({
      deviceIp: config.deviceIp,
      apiUser: config.apiUser,
      apiPassword: config.apiPassword,
    });
    const res = await fetch(`${apiBase(config)}/api/akuvox/test?${params.toString()}`);
    const data = (await res.json()) as {
      ok: boolean;
      message: string;
      snapshotDataUrl?: string;
    };
    return data;
  } catch (err) {
    return {
      ok: false,
      message: `Puente local no disponible en ${apiBase(config) || '/api'}. Corré "npm run server" en tu red local. (${
        err instanceof Error ? err.message : 'Error'
      })`,
    };
  }
}

export interface AkuvoxIncomingEvent {
  id: string;
  event: 'qr_scan' | 'call_start' | 'rfid_scan' | 'relay_change' | 'tamper';
  payload: Record<string, string>;
  receivedAt: string;
}

export async function pollAkuvoxEvents(
  config: AkuvoxConfig,
  sinceId?: string
): Promise<AkuvoxIncomingEvent[]> {
  if (!config.enabled) return [];
  try {
    const query = sinceId ? `?since=${encodeURIComponent(sinceId)}` : '';
    const res = await fetch(`${apiBase(config)}/api/akuvox/events${query}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: AkuvoxIncomingEvent[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}
