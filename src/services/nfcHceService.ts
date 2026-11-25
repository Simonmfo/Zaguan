/**
 * Zaguán Digital — Servicio Modular NFC HCE (Host Card Emulation) para Android
 *
 * Objetivo: Emular una credencial 13.56 MHz (ISO 14443-4 / ISO-DEP) desde el
 * smartphone Android para que el lector RFID 13.56 MHz del Akuvox E12W
 * reconozca el UID del residente/staff y dispare el Relé 1.
 *
 * Arquitectura híbrida:
 * - En app nativa Capacitor/Android: conecta con `ZaguanNfcHcePlugin` (HostApduService).
 * - En navegador web: detecta soporte `NDEFReader` / Android y ofrece simulación + fallback HTTP.
 */

export const ZAGUAN_HCE_PROTOCOL = {
  /** Custom AID registrado en res/xml/apduservice.xml de Android ("ZAGUAN\x01") */
  AID_HEX: 'F05A414755414E01',
  /** Comando ISO 7816-4 SELECT AID */
  SELECT_APDU_HEADER: '00A40400',
  /** Status Words ISO-DEP */
  SW_OK: '9000',
  SW_ACCESS_DENIED: '6982',
  FREQUENCY_MHZ: 13.56,
} as const;

export interface NfcHceCapabilities {
  platform: 'android-capacitor' | 'android-web' | 'ios' | 'desktop';
  hceSupported: boolean;
  reason: string;
}

export interface NfcHceSession {
  active: boolean;
  emulatedUid: string;
  unit: string;
  aidHex: string;
  startedAt?: string;
  lastApduExchange?: string;
}

interface CapacitorHceBridge {
  startHceEmulation: (opts: { aid: string; uidHex: string; token: string }) => Promise<{ ok: boolean }>;
  stopHceEmulation: () => Promise<void>;
}

function getNativeHceBridge(): CapacitorHceBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { ZaguanNfcHce?: CapacitorHceBridge } };
  };
  return w.Capacitor?.Plugins?.ZaguanNfcHce ?? null;
}

export function detectNfcHceCapabilities(): NfcHceCapabilities {
  if (typeof navigator === 'undefined') {
    return {
      platform: 'desktop',
      hceSupported: false,
      reason: 'Entorno sin navegador móvil.',
    };
  }
  const ua = navigator.userAgent.toLowerCase();
  const nativeBridge = getNativeHceBridge();

  if (nativeBridge) {
    return {
      platform: 'android-capacitor',
      hceSupported: true,
      reason: 'Plugin nativo Android HostApduService (13.56 MHz) disponible.',
    };
  }
  if (/iphone|ipad|ipod/.test(ua)) {
    return {
      platform: 'ios',
      hceSupported: false,
      reason: 'iOS restringe NFC HCE; usá el puente universal BLE 5.0 para apertura de proximidad.',
    };
  }
  if (/android/.test(ua)) {
    return {
      platform: 'android-web',
      hceSupported: true,
      reason: 'Android detectado (listo para emulación HCE vía app Capacitor o modo web asistido).',
    };
  }
  return {
    platform: 'desktop',
    hceSupported: false,
    reason: 'Vista web de escritorio: simulación HCE activa (13.56 MHz → Akuvox E12W).',
  };
}

/** Genera un UID determinístico de 4 bytes (formato 13.56 MHz Mifare/HCE) para una unidad */
export function buildResidentHceUid(unit: string, pin: string): string {
  const cleanUnit = unit.replace(/[^A-Z0-9]/gi, '').padEnd(2, '0').slice(0, 2);
  const b1 = cleanUnit.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  const b2 = cleanUnit.charCodeAt(1).toString(16).toUpperCase().padStart(2, '0');
  const pNum = Number(pin.replace(/\D/g, '')) || 4028;
  const b3 = ((pNum >> 4) & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const b4 = (pNum & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `04:${b1}:${b2}:${b3}:${b4}`;
}

export async function startNfcHceEmulation(params: {
  unit: string;
  pin: string;
  sessionToken: string;
}): Promise<NfcHceSession> {
  const emulatedUid = buildResidentHceUid(params.unit, params.pin);
  const nativeBridge = getNativeHceBridge();

  if (nativeBridge) {
    await nativeBridge.startHceEmulation({
      aid: ZAGUAN_HCE_PROTOCOL.AID_HEX,
      uidHex: emulatedUid.replace(/:/g, ''),
      token: params.sessionToken,
    });
  }

  return {
    active: true,
    emulatedUid,
    unit: params.unit,
    aidHex: ZAGUAN_HCE_PROTOCOL.AID_HEX,
    startedAt: new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
    lastApduExchange: `SELECT ${ZAGUAN_HCE_PROTOCOL.AID_HEX} → UID ${emulatedUid} (${ZAGUAN_HCE_PROTOCOL.SW_OK})`,
  };
}

export async function stopNfcHceEmulation(): Promise<void> {
  const nativeBridge = getNativeHceBridge();
  if (nativeBridge) {
    await nativeBridge.stopHceEmulation();
  }
}
