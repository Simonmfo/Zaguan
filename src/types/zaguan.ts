export type MainScreen =
  | 'web-principal'
  | 'portero-ia'
  | 'app-residente'
  | 'panel-admin'
  | 'modulo-retrofit';

export type IntercomHardwareModel = 'akuvox-e12w' | 'kiosco-10';

export interface AkuvoxConfig {
  enabled: boolean; // false = simulación local, true = conexión real al puente HTTP/LAN
  deviceIp: string;
  httpPort: number;
  apiUser: string;
  apiPassword: string;
  highSecurityMode: boolean;
  sipServerIp: string;
  sipExtension: string;
  hasWiegandKeypad: boolean;
  secondaryRelayUrl: string; // Opcional: Shelly / Akuvox SR01 para Puerta 2 (Doble Exclusa)
  bridgeUrl: string; // Ej. http://localhost:3001 o '' (usa proxy /api)
}

export interface AkuvoxLogEntry {
  id: string;
  direction: 'outbound' | 'inbound' | 'sip' | 'rtsp';
  endpoint: string;
  detail: string;
  status: 'ok' | 'simulated' | 'error';
  time: string;
}

export type ResidentTab = 'inicio' | 'accesos' | 'paquetes' | 'consorcio';

export type InicioSubTab = 'actividad' | 'reglamento';

export type RetrofitBrandKey = 'bellsonic' | 'commax' | 'fermax' | 'intelbras';

export type EstimatorBrandKey = 'bellsonic' | 'commax' | 'fermax' | 'nuevo';

export type PassTypeKey = 'pedidosya' | 'mercadolibre' | 'visita';

export type DayOfWeek = 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D';

export type ParcelStorageMode = 'zaguan' | 'locker';

export type UnannouncedParcelRule = 'auto-zaguan' | 'reject';

export interface BrandCompatibilityInfo {
  key: RetrofitBrandKey;
  tabLabel: string;
  title: string;
  wiring: string;
  keep: string;
  install: string;
}

export interface QrPass {
  id: string;
  code: string;
  pin: string;
  guestName: string;
  typeLabel: string;
  validityLabel: string;
  timeWindow?: string;
  accessScope: string;
  singleUse: boolean;
  status: 'Activo' | 'Usado' | 'Expirado' | 'Revocado';
  detailText: string;
  unit?: string;
}

export interface StaffAuditEntry {
  id: string;
  dateLabel: string;
  checkIn: string;
  checkOut?: string;
  durationLabel: string;
}

export interface RecurringPass {
  id: string;
  name: string;
  role: 'Limpieza' | 'Paseador' | 'Mantenimiento' | 'Cuidado';
  unit: string;
  pin: string;
  rfidTag: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  status: 'Activo' | 'Revocado';
  currentlyInside: boolean;
  lastCheckIn?: string;
  auditLog: StaffAuditEntry[];
}

export interface PreAuthorizedParcel {
  id: string;
  unit: string;
  residentName: string;
  carrier: string;
  description: string;
  storageMode: ParcelStorageMode;
  createdAt: string;
  status: 'Esperando' | 'Entregado';
}

export interface ParcelItem {
  id: string;
  code: string;
  carrier: string;
  unit: string;
  receivedAt: string;
  location: string;
  storageMode: ParcelStorageMode;
  validationMethod: 'Pre-autorizado (OCR IA)' | 'Autorización residente' | 'Regla automática 20s' | 'Monitoreo 24/7';
  note: string;
  status: 'Para retirar' | 'Retirado';
  imageUrl?: string;
  authorizedPin?: string;
}

export interface ActivityEvent {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  category: 'acceso' | 'qr' | 'paquete' | 'alerta' | 'ia' | 'admin';
}

export interface SurveyRequest {
  address: string;
  phone: string;
  brand?: string;
  units?: number;
  submittedAt: string;
}

export interface PendingVisitRequest {
  id: string;
  visitorName: string;
  residentName: string;
  unit: string;
  spokenTranscript: string;
  timestamp: string;
  photoUrl: string;
  status: 'Pendiente' | 'Aprobado' | 'Rechazado';
}

export interface PendingSpontaneousParcel {
  id: string;
  carrier: string;
  unit: string;
  residentName: string;
  detectedLabel: string;
  storageMode: ParcelStorageMode;
  secondsLeft: number;
  status: 'Esperando' | 'Autorizado' | 'Auto-autorizado' | 'Rechazado';
  photoUrl: string;
}

export interface SecurityAlert {
  id: string;
  type: 'merodeo' | 'coaccion' | 'sos';
  title: string;
  detail: string;
  timestamp: string;
  severity: 'alta' | 'critica';
  clipId?: string;
  unit?: string;
  resolved: boolean;
}

export interface BuildingTenant {
  id: string;
  unit: string;
  name: string;
  phone: string;
  personalPin: string;
  duressPin: string;
  activeCredentials: number;
  status: 'Activo' | 'Dado de baja';
  moveInDate: string;
}

export interface MasterKeyRecord {
  id: string;
  provider: 'UTE' | 'OSE' | 'Antel' | 'Ascensores' | 'Bomberos' | 'Sanitaria';
  technicianName: string;
  pin: string;
  scope: string;
  validUntil: string;
  status: 'Activa' | 'En edificio' | 'Finalizada' | 'Revocada';
  enteredAt?: string;
  exitedAt?: string;
}

export interface BuildingNotice {
  id: string;
  title: string;
  body: string;
  category: 'Mantenimiento' | 'Aviso' | 'Urgente';
  dateLabel: string;
  showOnIntercom: boolean;
  sentToApp: boolean;
}
