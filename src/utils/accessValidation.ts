import { DayOfWeek, QrPass, RecurringPass } from '../types/zaguan';

export const VALID_DAYS: DayOfWeek[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function timeToMinutes(hhmm: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateRfidUid(uid: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = uid.trim().toUpperCase();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }
  // Supports 13.56MHz Mifare HEX UID (e.g. 04:A3:2F:8B or 04A32F8B) or building tag code (RF-402M)
  const isHexUid = /^([0-9A-F]{2}:){3,6}[0-9A-F]{2}$/.test(trimmed) || /^[0-9A-F]{8,14}$/.test(trimmed);
  const isTagCode = /^RF-[A-Z0-9]{3,10}$/.test(trimmed);
  if (!isHexUid && !isTagCode) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'UID RFID inválido. Usá formato Mifare 13.56 MHz (ej. 04:A3:2F:8B) o código RF-402M.',
    };
  }
  return { valid: true, normalized: trimmed };
}

export function validateRecurringConfig(params: {
  name: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  rfidTag?: string;
  mobileAccessEnabled: boolean;
}): { valid: boolean; error?: string; normalizedRfid: string } {
  if (params.name.trim().length < 2) {
    return { valid: false, error: 'Ingresá el nombre del personal o servicio.', normalizedRfid: '' };
  }
  if (!params.days || params.days.length === 0) {
    return { valid: false, error: 'Seleccioná al menos un día de la semana.', normalizedRfid: '' };
  }
  const startMin = timeToMinutes(params.startTime);
  const endMin = timeToMinutes(params.endTime);
  if (startMin < 0 || endMin < 0) {
    return { valid: false, error: 'Ingresá horarios válidos en formato HH:MM.', normalizedRfid: '' };
  }
  if (endMin <= startMin) {
    return {
      valid: false,
      error: 'La hora de fin debe ser posterior a la hora de inicio.',
      normalizedRfid: '',
    };
  }
  const rfidCheck = validateRfidUid(params.rfidTag || '');
  if (!rfidCheck.valid) {
    return { valid: false, error: rfidCheck.error, normalizedRfid: '' };
  }
  if (!rfidCheck.normalized && !params.mobileAccessEnabled) {
    return {
      valid: false,
      error: 'Vinculá un UID RFID físico o habilitá el acceso móvil.',
      normalizedRfid: '',
    };
  }
  return { valid: true, normalizedRfid: rfidCheck.normalized };
}

export function isSingleUsePassValidNow(pass: QrPass, nowMs = Date.now()): { ok: boolean; reason?: string } {
  if (pass.status !== 'Activo') {
    return { ok: false, reason: `Pase en estado ${pass.status}.` };
  }
  if (pass.validUntilIso && new Date(pass.validUntilIso).getTime() <= nowMs) {
    return { ok: false, reason: 'El pase expiró por ventana horaria.' };
  }
  return { ok: true };
}

export function isRecurringPassAllowedAt(
  staff: RecurringPass,
  day: DayOfWeek,
  hhmm: string
): { ok: boolean; reason?: string } {
  if (staff.status !== 'Activo') {
    return { ok: false, reason: `Acceso de ${staff.name} fue revocado.` };
  }
  if (!staff.days.includes(day)) {
    return {
      ok: false,
      reason: `Día ${day} no autorizado (permitido: ${staff.days.join(', ')}).`,
    };
  }
  const currentMin = timeToMinutes(hhmm);
  const startMin = timeToMinutes(staff.startTime);
  const endMin = timeToMinutes(staff.endTime);
  if (currentMin < startMin || currentMin > endMin) {
    return {
      ok: false,
      reason: `Horario ${hhmm} fuera de franja permitida (${staff.startTime}–${staff.endTime}).`,
    };
  }
  return { ok: true };
}

export function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function buildMagicLinkUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://zaguan.uy';
  return `${origin}/pase/${encodeURIComponent(code)}`;
}

export function buildWhatsAppShareHref(params: {
  guestName: string;
  buildingAddress: string;
  unit: string;
  pin: string;
  validityLabel: string;
  magicLink: string;
}): string {
  const message = [
    `Hola ${params.guestName}, te comparto tu pase de acceso a Zaguán (Apto ${params.unit}):`,
    `📍 Dirección: ${params.buildingAddress}`,
    `🗣️ Código de voz (dictalo al portero IA): ${params.pin}`,
    `⏱️ Vigencia: ${params.validityLabel} (1 solo uso)`,
    `🔗 Enlace QR y mapa: ${params.magicLink}`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
