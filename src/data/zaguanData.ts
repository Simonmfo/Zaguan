import {
  AccessLogRecord,
  ActivityEvent,
  BrandCompatibilityInfo,
  BuildingNotice,
  BuildingRecord,
  BuildingTenant,
  BuildingUnit,
  EstimatorBrandKey,
  MasterKeyRecord,
  ParcelItem,
  PassTypeKey,
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  RetrofitBrandKey,
  SecurityAlert,
} from '../types/zaguan';

export const ASSETS = {
  heroBuilding: '/src/assets/images/hero_edificio_montevideo_1795628875225.jpg',
  retrofitModule: '/src/assets/images/retrofit_modulo_bellsonic_1795628875885.jpg',
  lobbyCamera: '/src/assets/images/lobby_camara_vivo_1795628890476.jpg',
  parcelReception: '/src/assets/images/paquete_recepcion_1795628876338.jpg',
} as const;

export const BUILDING_INFO = {
  name: 'Edificio Pocitos 2468',
  address: 'Bvar. España 2468, Pocitos, Montevideo',
  latitude: -34.91462,
  longitude: -56.15189,
  geofenceRadiusMeters: 30,
  activeUnit: '4B',
  activeResident: 'Martín Silva',
  personalPin: '4028',
  duressPin: '4082',
  emergencyContacts: ['Laura Silva (+598 99 412 880)', 'Sala Seguridad 24/7 · DI.GE.F.E.'],
} as const;

export function computeDuressPin(pin: string): string {
  const digits = pin.replace(/\D/g, '');
  if (digits.length < 4) return '4082';
  const lastTwo = digits.slice(-2);
  if (lastTwo[0] === lastTwo[1]) {
    const bumped = String((Number(lastTwo[1]) + 1) % 10);
    return digits.slice(0, -1) + bumped;
  }
  return digits.slice(0, -2) + lastTwo[1] + lastTwo[0];
}

export const BRAND_COMPATIBILITY: Record<RetrofitBrandKey, BrandCompatibilityInfo> = {
  bellsonic: {
    key: 'bellsonic',
    tabLabel: 'Bellsonic',
    title: 'Bellsonic Analógico (1980–2005)',
    wiring: 'Bus 4+n / 2 hilos · 12V AC',
    keep: '100% del cableado vertical en montante y los teléfonos interiores de cada apartamento siguen funcionando en paralelo.',
    install:
      'Gateway SIP en caja de hall + Pantalla Portero IA con cámara ColorVu y lector OCR + relé doble exclusa (zaguán/hall) y portón.',
  },
  commax: {
    key: 'commax',
    tabLabel: 'Commax / Golmar',
    title: 'Commax / Golmar Multihilo',
    wiring: 'Audio analógico 4+n o video coaxial',
    keep: 'Conservamos monitores y porteros internos existentes sin ingresar a los departamentos.',
    install:
      'Módulo de derivación de llamada y audio bidireccional IP conectado al Portero con IA y central del edificio.',
  },
  fermax: {
    key: 'fermax',
    tabLabel: 'Fermax VDS/MDS',
    title: 'Fermax VDS / MDS Digital',
    wiring: 'Bus digital 3 hilos / cableado UTP',
    keep: 'Se mantiene el bus troncal de datos y los terminales Fermax instalados en cada unidad.',
    install:
      'Interfaz de pasarela SIP/Fermax en tablero general para atención natural por IA, app móvil y sala de monitoreo.',
  },
  intelbras: {
    key: 'intelbras',
    tabLabel: 'Bticino / Intelbras',
    title: 'Bticino / Legrand / Intelbras',
    wiring: 'Bus 2 hilos no polarizado / PBX',
    keep: 'Se conserva la central telefónica de portería o el bus de 2 hilos interno.',
    install:
      'Gateway VoIP/SIP + frente IP táctil con Portero IA, detección de merodeo, QR/PIN/NFC y lectura OCR de paquetes.',
  },
};

export function calculateRetrofitEstimate(brand: EstimatorBrandKey, units: number) {
  const traditional = units * 310;
  let zaguan = 1450;
  let note = 'Protocolo: Gateway SIP/Relé doble exclusa + Portero IA · Cero obra en deptos';

  if (brand === 'commax') {
    zaguan = 1520;
    note = 'Protocolo: Interfaz multihilo Commax/Golmar + Portero IA · Cero obra en deptos';
  } else if (brand === 'fermax') {
    zaguan = 1600;
    note = 'Protocolo: Módulo adaptador Fermax VDS/MDS + Portero IA · Cero obra en deptos';
  } else if (brand === 'nuevo') {
    zaguan = Math.round(units * 145);
    note = 'Protocolo: Frente táctil Portero IA + Lockers inteligentes (sin monitores internos)';
  }

  const savings = Math.round(((traditional - zaguan) / traditional) * 100);
  return {
    traditional,
    zaguan,
    savings,
    note,
  };
}

export const PASS_TYPE_PRESETS: Record<
  PassTypeKey,
  {
    label: string;
    defaultName: string;
    defaultDuration: string;
    defaultWindow: string;
    codePrefix: string;
    defaultCode: string;
    defaultPin: string;
    summary: string;
    scope: string;
  }
> = {
  pedidosya: {
    label: 'PedidosYa',
    defaultName: 'Delivery PedidosYa',
    defaultDuration: '1 uso · 30 min',
    defaultWindow: 'Hoy · 30 min (autodestrucción al usar)',
    codePrefix: 'ZAG',
    defaultCode: 'ZAG-8492',
    defaultPin: '8492',
    summary: 'Puerta Zaguán · 1 solo uso · QR + PIN',
    scope: 'Acceso Zaguán / Peatonal',
  },
  mercadolibre: {
    label: 'Mercado Libre',
    defaultName: 'Repartidor Mercado Libre',
    defaultDuration: '1 uso · 1 hs',
    defaultWindow: 'Hoy · Ventana 1 hs (1 uso)',
    codePrefix: 'ZAG',
    defaultCode: 'ZAG-9105',
    defaultPin: '9105',
    summary: 'Exclusa paquetería / Locker · 1 uso',
    scope: 'Exclusa paquetería (Puerta 1)',
  },
  visita: {
    label: 'Visita',
    defaultName: 'Lucas Fernández (Visita)',
    defaultDuration: 'Hoy 20:00–21:30',
    defaultWindow: 'Válido hoy de 20:00 a 21:30 hs',
    codePrefix: 'ZAG',
    defaultCode: 'ZAG-5520',
    defaultPin: '5520',
    summary: 'Puerta principal + Garaje · 1 uso',
    scope: 'Acceso peatonal y garaje',
  },
};

export const INITIAL_QR_PASSES: QrPass[] = [
  {
    id: 'pass-1',
    code: 'ZAG-7310',
    pin: '7310',
    guestName: 'Sofía Méndez (Visita)',
    typeLabel: 'Visita',
    validityLabel: '4 horas (1 uso)',
    hoursValid: 4,
    validUntilIso: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    magicLink: 'https://zaguan.uy/pase/ZAG-7310',
    timeWindow: 'Válido por 4 horas · 1 solo uso (código voz + QR)',
    accessScope: 'Acceso peatonal y garaje',
    singleUse: true,
    status: 'Activo',
    detailText: '1 uso · 4 hs · Código voz 7310',
    unit: '4B',
  },
  {
    id: 'pass-2',
    code: 'ZAG-6104',
    pin: '6104',
    guestName: 'PedidosYa Market',
    typeLabel: 'PedidosYa',
    validityLabel: '1 hora (1 uso)',
    hoursValid: 1,
    magicLink: 'https://zaguan.uy/pase/ZAG-6104',
    timeWindow: 'Destruido automáticamente al ingresar',
    accessScope: 'Acceso peatonal',
    singleUse: true,
    status: 'Usado',
    detailText: 'Ingresó 10:42 hs · Código destruido',
    unit: '4B',
  },
];

export const INITIAL_RECURRING_PASSES: RecurringPass[] = [
  {
    id: 'rec-marta',
    name: 'Marta Giménez',
    role: 'Limpieza',
    unit: '4B',
    pin: '3140',
    rfidTag: '04:A3:2F:8B',
    mobileAccessEnabled: true,
    days: ['M', 'J'],
    startTime: '08:00',
    endTime: '13:00',
    status: 'Activo',
    currentlyInside: false,
    auditLog: [
      {
        id: 'aud-1',
        dateLabel: 'Mar 24 nov',
        checkIn: '08:04',
        checkOut: '12:58',
        durationLabel: '4h 54m',
      },
      {
        id: 'aud-2',
        dateLabel: 'Jue 19 nov',
        checkIn: '08:02',
        checkOut: '13:00',
        durationLabel: '4h 58m',
      },
    ],
  },
  {
    id: 'rec-diego',
    name: 'Diego Rojas',
    role: 'Paseador',
    unit: '4B',
    pin: '6290',
    rfidTag: 'RF-402P',
    mobileAccessEnabled: false,
    days: ['L', 'X', 'V'],
    startTime: '14:00',
    endTime: '16:30',
    status: 'Activo',
    currentlyInside: false,
    auditLog: [
      {
        id: 'aud-3',
        dateLabel: 'Lun 23 nov',
        checkIn: '14:10',
        checkOut: '15:25',
        durationLabel: '1h 15m',
      },
    ],
  },
];

export const INITIAL_PREAUTH_PARCELS: PreAuthorizedParcel[] = [
  {
    id: 'pre-ml-1',
    unit: '4B',
    residentName: 'Martín Silva',
    carrier: 'Mercado Libre',
    description: 'Paquete Full · Cafetera Express',
    storageMode: 'zaguan',
    createdAt: 'Hoy 09:15',
    status: 'Esperando',
  },
  {
    id: 'pre-ml-2',
    unit: '3A',
    residentName: 'Carolina Vega',
    carrier: 'Mercado Libre',
    description: 'Pedido Full · Electrónica',
    storageMode: 'locker',
    createdAt: 'Hoy 10:30',
    status: 'Esperando',
  },
];

export const INITIAL_PARCELS: ParcelItem[] = [
  {
    id: 'parcel-ml-402',
    code: '#ML-402',
    carrier: 'Mercado Libre Full',
    unit: '4B',
    receivedAt: 'Hoy 14:32 hs',
    location: 'Zaguán Paquetería (Exclusa 1)',
    storageMode: 'zaguan',
    validationMethod: 'Pre-autorizado (OCR IA)',
    note: 'Etiqueta validada por OCR de Portero IA. Puerta hacia ascensores permaneció bloqueada.',
    status: 'Para retirar',
    imageUrl: ASSETS.parcelReception,
  },
  {
    id: 'parcel-dac-398',
    code: '#DAC-398',
    carrier: 'DAC Agencia Central',
    unit: '4B',
    receivedAt: '19 nov',
    location: 'Locker Inteligente #B2',
    storageMode: 'locker',
    validationMethod: 'Regla automática 20s',
    note: 'Depositado en Locker #B2 por regla de ausencia 20s. Retirado 19 nov 18:40 hs.',
    status: 'Retirado',
  },
  {
    id: 'parcel-cu-381',
    code: '#CU-381',
    carrier: 'Correo Uruguayo',
    unit: '4B',
    receivedAt: '14 nov',
    location: 'Zaguán Paquetería',
    storageMode: 'zaguan',
    validationMethod: 'Autorización residente',
    note: 'Retirado el 14 nov a las 09:15 hs.',
    status: 'Retirado',
  },
];

export const INITIAL_ACTIVITY: ActivityEvent[] = [
  {
    id: 'act-1',
    title: 'Paquete #ML-402 depositado en Zaguán',
    subtitle: 'Validación OCR sin interrumpir · Foto enviada · Apto 4B',
    time: '14:32',
    category: 'paquete',
  },
  {
    id: 'act-2',
    title: 'Marta (Limpieza) finalizó jornada (4h 54m)',
    subtitle: 'Notificación silenciosa · 08:04 → 12:58 · RFID RF-402M',
    time: '12:58',
    category: 'acceso',
  },
  {
    id: 'act-3',
    title: 'Ingreso directo por proximidad Bluetooth/NFC',
    subtitle: 'Martín Silva · Puerta principal · Apto 4B',
    time: '12:05',
    category: 'acceso',
  },
  {
    id: 'act-4',
    title: 'Pase 1 uso ZAG-6104 autodestruido',
    subtitle: 'PedidosYa Market · Puerta Zaguán · Caducidad automática',
    time: '10:42',
    category: 'qr',
  },
];

const todayKey = new Date().toISOString().slice(0, 10);
const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export const INITIAL_BUILDINGS: BuildingRecord[] = [
  {
    id: 'bldg-pocitos-2468',
    name: 'Edificio Pocitos 2468',
    address: 'Bvar. España 2468, Pocitos',
    city: 'Montevideo',
    latitude: -34.91462,
    longitude: -56.15189,
    geofenceRadiusMeters: 30,
    parcelStorageMode: 'zaguan',
    parcelHoursStart: '08:00',
    parcelHoursEnd: '22:00',
    spontaneousTimeoutSec: 20,
    akuvoxIp: '192.168.1.120',
    akuvoxApiUser: 'admin',
  },
  {
    id: 'bldg-cordon-1820',
    name: 'Torre Cordón 1820',
    address: 'Av. 18 de Julio 1820, Cordón',
    city: 'Montevideo',
    latitude: -34.90418,
    longitude: -56.17854,
    geofenceRadiusMeters: 30,
    parcelStorageMode: 'locker',
    parcelHoursStart: '07:00',
    parcelHoursEnd: '23:00',
    spontaneousTimeoutSec: 20,
    akuvoxIp: '192.168.10.45',
    akuvoxApiUser: 'admin',
  },
];

export const INITIAL_UNITS: BuildingUnit[] = [
  { id: 'unit-1a', buildingId: 'bldg-pocitos-2468', unitNumber: '1A', floor: 1, towerBlock: 'A', isOccupied: true },
  { id: 'unit-2b', buildingId: 'bldg-pocitos-2468', unitNumber: '2B', floor: 2, towerBlock: 'A', isOccupied: true },
  { id: 'unit-3a', buildingId: 'bldg-pocitos-2468', unitNumber: '3A', floor: 3, towerBlock: 'A', isOccupied: true },
  { id: 'unit-4b', buildingId: 'bldg-pocitos-2468', unitNumber: '4B', floor: 4, towerBlock: 'A', isOccupied: true },
  { id: 'unit-501', buildingId: 'bldg-pocitos-2468', unitNumber: '501', floor: 5, towerBlock: 'A', isOccupied: false },
  { id: 'unit-c-101', buildingId: 'bldg-cordon-1820', unitNumber: '101', floor: 1, towerBlock: 'Norte', isOccupied: true },
  { id: 'unit-c-202', buildingId: 'bldg-cordon-1820', unitNumber: '202', floor: 2, towerBlock: 'Norte', isOccupied: true },
];

export const INITIAL_TENANTS: BuildingTenant[] = [
  {
    id: 'ten-4b',
    buildingId: 'bldg-pocitos-2468',
    unit: '4B',
    role: 'resident',
    name: 'Martín Silva',
    email: 'martin.silva@example.com',
    phone: '+598 99 312 402',
    personalPin: '4028',
    duressPin: '4082',
    activeCredentials: 4,
    status: 'Activo',
    moveInDate: 'Mar 2024',
  },
  {
    id: 'ten-3a',
    buildingId: 'bldg-pocitos-2468',
    unit: '3A',
    role: 'resident',
    name: 'Carolina Vega',
    email: 'carolina.vega@example.com',
    phone: '+598 98 640 301',
    personalPin: '3019',
    duressPin: '3091',
    activeCredentials: 2,
    status: 'Activo',
    moveInDate: 'Ago 2025',
  },
  {
    id: 'ten-2b',
    buildingId: 'bldg-pocitos-2468',
    unit: '2B',
    role: 'resident',
    name: 'Roberto Pereyra',
    email: 'roberto.p@example.com',
    phone: '+598 94 218 990',
    personalPin: '2256',
    duressPin: '2265',
    activeCredentials: 3,
    status: 'Activo',
    moveInDate: 'Ene 2023',
  },
  {
    id: 'ten-1a',
    buildingId: 'bldg-pocitos-2468',
    unit: '1A',
    role: 'resident',
    name: 'Elena Morales (Saliente)',
    email: 'elena.m@example.com',
    phone: '+598 99 775 110',
    personalPin: '1184',
    duressPin: '1148',
    activeCredentials: 5,
    status: 'Activo',
    moveInDate: 'Nov 2022',
  },
  {
    id: 'ten-c-101',
    buildingId: 'bldg-cordon-1820',
    unit: '101',
    role: 'resident',
    name: 'Federico Núñez',
    email: 'fede.nunez@example.com',
    phone: '+598 99 881 204',
    personalPin: '1014',
    duressPin: '1041',
    activeCredentials: 2,
    status: 'Activo',
    moveInDate: 'May 2025',
  },
];

export const INITIAL_MASTER_KEYS: MasterKeyRecord[] = [
  {
    id: 'mk-1',
    buildingId: 'bldg-pocitos-2468',
    provider: 'Ascensores',
    technicianName: 'Carlos Méndez (Otis UY)',
    pin: '9041',
    scope: 'Hall PB + Sala de Máquinas',
    validUntil: 'Expira en 3 hs',
    expiresAtIso: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    status: 'En edificio',
    enteredAt: '14:15',
  },
  {
    id: 'mk-2',
    buildingId: 'bldg-pocitos-2468',
    provider: 'OSE',
    technicianName: 'Cuadrilla OSE #14',
    pin: '7712',
    scope: 'Sala de Medidores + Azotea',
    validUntil: 'Expira en 6 hs',
    expiresAtIso: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    status: 'Activa',
  },
  {
    id: 'mk-3',
    buildingId: 'bldg-pocitos-2468',
    provider: 'Antel',
    technicianName: 'Técnico Fibra Óptica',
    pin: '5328',
    scope: 'Montante Telecomunicaciones',
    validUntil: 'Ayer 17:00 hs',
    expiresAtIso: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    status: 'Finalizada',
    enteredAt: '15:02',
    exitedAt: '15:48',
  },
];

export const INITIAL_ACCESS_LOGS: AccessLogRecord[] = [
  {
    id: 'log-1',
    buildingId: 'bldg-pocitos-2468',
    unit: '4B',
    actorName: 'Repartidor Mercado Libre',
    eventSource: 'package_ocr',
    methodUsed: 'OCR Etiqueta + Relé 1 E12W',
    direction: 'entry',
    granted: true,
    snapshotUrl: ASSETS.parcelReception,
    notes: 'Paquete #ML-402 pre-autorizado depositado en Zaguán. Puerta 2 permaneció bloqueada.',
    occurredAtIso: `${todayKey}T14:32:00.000Z`,
    dateKey: todayKey,
    timeLabel: '14:32',
  },
  {
    id: 'log-2',
    buildingId: 'bldg-pocitos-2468',
    actorName: 'Carlos Méndez (Otis UY)',
    eventSource: 'master_key',
    methodUsed: 'Llave Maestra PIN 9041',
    direction: 'entry',
    granted: true,
    snapshotUrl: ASSETS.lobbyCamera,
    notes: 'Ingreso de mantenimiento técnico de ascensores (Sala de Máquinas).',
    occurredAtIso: `${todayKey}T14:15:00.000Z`,
    dateKey: todayKey,
    timeLabel: '14:15',
  },
  {
    id: 'log-3',
    buildingId: 'bldg-pocitos-2468',
    unit: '4B',
    actorName: 'Marta Giménez (Limpieza)',
    eventSource: 'access_pass',
    methodUsed: 'RFID 13.56MHz (RF-402M)',
    direction: 'exit',
    granted: true,
    snapshotUrl: ASSETS.lobbyCamera,
    notes: 'Salida registrada en franja Mar/Jue 08:00–13:00 · Jornada total 4h 54m.',
    occurredAtIso: `${todayKey}T12:58:00.000Z`,
    dateKey: todayKey,
    timeLabel: '12:58',
  },
  {
    id: 'log-4',
    buildingId: 'bldg-pocitos-2468',
    unit: '4B',
    actorName: 'Martín Silva',
    eventSource: 'remote_app',
    methodUsed: 'BLE 5.0 / NFC Proximidad',
    direction: 'entry',
    granted: true,
    notes: 'Apertura directa de puerta principal vía Akuvox E12W.',
    occurredAtIso: `${todayKey}T12:05:00.000Z`,
    dateKey: todayKey,
    timeLabel: '12:05',
  },
  {
    id: 'log-5',
    buildingId: 'bldg-pocitos-2468',
    unit: '3A',
    actorName: 'PedidosYa Market',
    eventSource: 'access_pass',
    methodUsed: 'Magic Link QR (ZAG-6104)',
    direction: 'entry',
    granted: true,
    snapshotUrl: ASSETS.lobbyCamera,
    notes: 'Pase de 1 uso validado por cámara Akuvox E12W y autodestruido.',
    occurredAtIso: `${todayKey}T10:42:00.000Z`,
    dateKey: todayKey,
    timeLabel: '10:42',
  },
  {
    id: 'log-6',
    buildingId: 'bldg-pocitos-2468',
    actorName: 'Persona no identificada',
    eventSource: 'loitering_alert',
    methodUsed: 'RTSP Visión IA (E12W)',
    direction: 'alert',
    granted: false,
    snapshotUrl: ASSETS.lobbyCamera,
    notes: 'Merodeo en madrugada (2m 14s sin tocar timbre). Clip CLIP-MERODEO-0318.mp4 guardado.',
    occurredAtIso: `${todayKey}T03:18:00.000Z`,
    dateKey: todayKey,
    timeLabel: '03:18',
  },
  {
    id: 'log-7',
    buildingId: 'bldg-pocitos-2468',
    unit: '2B',
    actorName: 'Técnico Fibra Óptica (Antel)',
    eventSource: 'master_key',
    methodUsed: 'Llave Maestra PIN 5328',
    direction: 'exit',
    granted: true,
    notes: 'Trabajo finalizado en montante de telecomunicaciones (15:02 → 15:48).',
    occurredAtIso: `${yesterdayKey}T15:48:00.000Z`,
    dateKey: yesterdayKey,
    timeLabel: '15:48',
  },
];

export const INITIAL_NOTICES: BuildingNotice[] = [
  {
    id: 'not-1',
    title: 'Corte de agua programado el jueves',
    body: 'Limpieza semestral de tanques OSE este jueves de 09:00 a 13:00 hs. Se recomienda prever reserva.',
    category: 'Mantenimiento',
    dateLabel: 'Jue 26 nov · 09:00–13:00',
    showOnIntercom: true,
    sentToApp: true,
  },
  {
    id: 'not-2',
    title: 'Mantenimiento preventivo de ascensor',
    body: 'Revisión mensual técnica el viernes de 10:00 a 11:30 hs. Acceso por escalera habilitado.',
    category: 'Aviso',
    dateLabel: 'Vie 27 nov · 10:00–11:30',
    showOnIntercom: true,
    sentToApp: true,
  },
];

export const INITIAL_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: 'sec-1',
    type: 'merodeo',
    title: 'Merodeo detectado frente a puerta (03:18 hs)',
    detail: 'Persona permaneció 2m 14s frente al acceso sin tocar timbre. Clip guardado automáticamente.',
    timestamp: 'Hoy 03:18',
    severity: 'alta',
    clipId: 'CLIP-MERODEO-0318.mp4',
    resolved: false,
  },
];

export const COMPARISON_ROWS = [
  {
    dimension: 'Atención en entrada',
    zaguan: 'Portero con IA por voz + Asistencia a mayores + Foto al residente',
    traditional: 'Timbre que interrumpe o espera a operador telefónico',
    guard: 'Atención manual sujeta a rotación y descansos',
    highlightZaguan: true,
  },
  {
    dimension: 'Paquetería (ML / PedidosYa)',
    zaguan: 'Pre-autorización OCR + Doble exclusa / Lockers + Foto comprobante',
    traditional: 'Repartidor espera o deja paquetes en la vereda',
    guard: 'Recepción manual sin foto ni regla automática',
    highlightZaguan: true,
  },
  {
    dimension: 'Control de accesos y seguridad',
    zaguan: 'QR/PIN en 2 toques, horarios personal, BT/NFC y PIN de Coacción',
    traditional: 'Claves fijas o desvío manual por WhatsApp',
    guard: 'Planilla en papel sin revocación instantánea',
    highlightZaguan: false,
  },
  {
    dimension: 'Administración e infraestructura',
    zaguan: 'Baja inquilino en 1 clic, llaves UTE/OSE/Antel, Cartelera + Retrofit',
    traditional: 'Recableado IP costoso y comodato con retención',
    guard: 'Costo mensual alto + auditoría crítica Ley 18.251',
    highlightZaguan: false,
  },
];

export const PILLARS = [
  {
    icon: 'record_voice_over',
    accentBg: 'bg-surface-variant text-primary',
    title: 'El Portero con IA (Voz, Pantalla y Merodeo)',
    subtitle: 'Atención natural · Foto en vivo · Modo personas mayores',
    description:
      'Recibe visitas por voz natural, valida con foto al celular del residente ([Abrir] o [Rechazar]), guía paso a paso a adultos mayores y guarda clips ante merodeo en madrugada.',
    targetScreen: 'portero-ia' as const,
    ctaLabel: 'Probar Pantalla Portero IA',
  },
  {
    icon: 'key',
    accentBg: 'bg-secondary-container text-on-secondary-container',
    title: 'Accesos en 2 Toques, Personal y PIN de Coacción',
    subtitle: 'QR + PIN autodestruible · Bluetooth/NFC · Horarios estrictos',
    description:
      'Generá links WhatsApp de 1 uso con mapa y QR/PIN, restringí días/horarios para limpieza o paseadores con auditoría de horas y activá apertura silenciosa por coacción.',
    targetScreen: 'app-residente' as const,
    ctaLabel: 'Abrir App Residente',
  },
  {
    icon: 'package_2',
    accentBg: 'bg-surface-variant text-primary',
    title: 'Paquetería Inteligente (OCR + Doble Exclusa / Lockers)',
    subtitle: 'Mercado Libre · PedidosYa · Regla automática 20 seg',
    description:
      'Pre-autorizá envíos para validar etiquetas por OCR sin interrumpirte o aplicá reglas automáticas a los 20s. Puerta a ascensores bloqueada y foto comprobante instantánea.',
    targetScreen: 'portero-ia' as const,
    ctaLabel: 'Simular entrega inteligente',
  },
  {
    icon: 'admin_panel_settings',
    accentBg: 'bg-secondary-container text-on-secondary-container',
    title: 'Panel Administración + Retrofit Zero-Obra',
    subtitle: 'Baja en 1 clic · Llaves UTE/OSE/Antel · Cartelera Digital',
    description:
      'Dá de baja inquilinos salientes anulando todos sus códigos al instante, emití llaves temporales para técnicos y publicá avisos en la pantalla del hall sin recablear.',
    targetScreen: 'panel-admin' as const,
    ctaLabel: 'Explorar Panel Administración',
  },
];
