import { FormEvent, useEffect, useState } from 'react';
import { ASSETS, BUILDING_INFO, PASS_TYPE_PRESETS } from '../data/zaguanData';
import {
  BleProximityState,
  estimateDistanceFromRssi,
  getInitialBleState,
  performBleProximityUnlock,
} from '../services/bleAccessService';
import {
  NfcHceSession,
  buildResidentHceUid,
  detectNfcHceCapabilities,
  startNfcHceEmulation,
  stopNfcHceEmulation,
} from '../services/nfcHceService';
import {
  ActivityEvent,
  BuildingNotice,
  DayOfWeek,
  InicioSubTab,
  MainScreen,
  ParcelItem,
  ParcelStorageMode,
  PassTypeKey,
  PendingSpontaneousParcel,
  PendingVisitRequest,
  PreAuthParcelRule,
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  ResidentTab,
  UnannouncedParcelRule,
} from '../types/zaguan';
import {
  buildMagicLinkUrl,
  buildWhatsAppShareHref,
  validateRecurringConfig,
} from '../utils/accessValidation';
import { SmartImage, ZaguanLogoMark } from './BrandMark';
import { IncomingDoorbellModal } from './IncomingDoorbellModal';
import { QrPreviewSvg } from './QrPreviewSvg';

type AccessSubTab = 'un-uso' | 'recurrentes' | 'coaccion';

interface AppResidenteViewProps {
  activeTab: ResidentTab;
  onChangeTab: (tab: ResidentTab) => void;
  passes: QrPass[];
  recurringPasses: RecurringPass[];
  parcels: ParcelItem[];
  preAuthParcels: PreAuthorizedParcel[];
  activities: ActivityEvent[];
  notices: BuildingNotice[];
  storageMode: ParcelStorageMode;
  unannouncedRule: UnannouncedParcelRule;
  onChangeUnannouncedRule: (rule: UnannouncedParcelRule) => void;
  pendingVisit: PendingVisitRequest | null;
  liveSnapshotUrl?: string | null;
  onRespondVisit: (approved: boolean) => void;
  onSimulateIncomingDoorbell: () => void;
  onSendDoorbellVoiceReply: (text: string) => void;
  pendingSpontaneous: PendingSpontaneousParcel | null;
  onRespondSpontaneousParcel: (action: 'authorize' | 'reject' | 'timeout-auto') => void;
  residentPin: string;
  duressPin: string;
  onUpdateResidentPin: (newPin: string) => void;
  door1Countdown: number;
  door2Countdown: number;
  onUnlockDirectDoor: (method: 'app' | 'bt-nfc', detail?: string) => void;
  onCreatePass: (pass: QrPass) => void;
  onRevokePass: (id: string) => void;
  onCreateRecurringPass: (
    staff: Omit<RecurringPass, 'id' | 'status' | 'currentlyInside' | 'auditLog'>
  ) => void;
  onRevokeRecurringPass: (id: string) => void;
  onToggleStaffShift: (id: string) => void;
  onCreatePreAuthParcel: (
    carrier: string,
    description: string,
    mode: ParcelStorageMode,
    timeWindowLabel: string,
    autoRule: PreAuthParcelRule
  ) => void;
  onConfirmParcel: (id: string) => void;
  onAuthorizeParcelPin: (id: string) => string;
  onTriggerDuressAlert: (source: string) => void;
  onLogActivity: (event: Omit<ActivityEvent, 'id'>) => void;
  onOpenPublicMagicLink: (token: string) => void;
  onNavigateMain: (screen: MainScreen) => void;
}

const ALL_DAYS: DayOfWeek[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function AppResidenteView({
  activeTab,
  onChangeTab,
  passes,
  recurringPasses,
  parcels,
  preAuthParcels,
  activities,
  notices,
  storageMode,
  unannouncedRule,
  onChangeUnannouncedRule,
  pendingVisit,
  liveSnapshotUrl,
  onRespondVisit,
  onSimulateIncomingDoorbell,
  onSendDoorbellVoiceReply,
  pendingSpontaneous,
  onRespondSpontaneousParcel,
  residentPin,
  duressPin,
  onUpdateResidentPin,
  door1Countdown,
  door2Countdown,
  onUnlockDirectDoor,
  onCreatePass,
  onRevokePass,
  onCreateRecurringPass,
  onRevokeRecurringPass,
  onToggleStaffShift,
  onCreatePreAuthParcel,
  onConfirmParcel,
  onAuthorizeParcelPin,
  onTriggerDuressAlert,
  onLogActivity,
  onOpenPublicMagicLink,
  onNavigateMain,
}: AppResidenteViewProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [staffPushBanner, setStaffPushBanner] = useState<{
    title: string;
    detail: string;
    time: string;
  } | null>(null);
  const [inlineQrOpen, setInlineQrOpen] = useState(false);
  const [inicioSubTab, setInicioSubTab] = useState<InicioSubTab>('actividad');
  const [accessSubTab, setAccessSubTab] = useState<AccessSubTab>('un-uso');
  const [barbacoaReserved, setBarbacoaReserved] = useState(false);
  const [gateCountdown, setGateCountdown] = useState(0);

  // Modular NFC HCE (Android 13.56 MHz) & Universal BLE 5.0 (iOS/Android) state
  const [nfcCapabilities] = useState(() => detectNfcHceCapabilities());
  const [nfcSession, setNfcSession] = useState<NfcHceSession | null>(null);
  const [bleState, setBleState] = useState<BleProximityState>(() => getInitialBleState());

  // WhatsApp Guest Magic Link preview modal
  const [sharedPassPreview, setSharedPassPreview] = useState<QrPass | null>(null);
  const [copiedMagicLink, setCopiedMagicLink] = useState(false);

  // Single-use Visit Pass form (name + hours validity -> 4-digit voice code + magic_link)
  const [passType, setPassType] = useState<PassTypeKey>('visita');
  const [guestName, setGuestName] = useState(PASS_TYPE_PRESETS.visita.defaultName);
  const [hoursValid, setHoursValid] = useState<number>(2);
  const [previewPin, setPreviewPin] = useState(PASS_TYPE_PRESETS.visita.defaultPin);
  const [previewCode, setPreviewCode] = useState(PASS_TYPE_PRESETS.visita.defaultCode);
  const [previewSummary, setPreviewSummary] = useState(PASS_TYPE_PRESETS.visita.summary);

  // Recurring staff creation form with strict validation & physical RFID UID binding
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<RecurringPass['role']>('Limpieza');
  const [staffDays, setStaffDays] = useState<DayOfWeek[]>(['M', 'J']);
  const [staffStart, setStaffStart] = useState('08:00');
  const [staffEnd, setStaffEnd] = useState('13:00');
  const [staffRfidUid, setStaffRfidUid] = useState('');
  const [staffMobileAccess, setStaffMobileAccess] = useState(true);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  // Duress PIN editor
  const [pinDraft, setPinDraft] = useState(residentPin);

  // Pre-auth parcel quick form
  const [preAuthCarrier, setPreAuthCarrier] = useState('Mercado Libre');
  const [preAuthDesc, setPreAuthDesc] = useState('');
  const [preAuthWindow, setPreAuthWindow] = useState('Hoy 09:00–18:00');
  const [preAuthAutoRule, setPreAuthAutoRule] =
    useState<PreAuthParcelRule>('auto_open_after_ocr');
  const [preAuthMode, setPreAuthMode] = useState<ParcelStorageMode>(storageMode);

  useEffect(() => {
    setPinDraft(residentPin);
  }, [residentPin]);

  useEffect(() => {
    if (gateCountdown <= 0) return;
    const t = setTimeout(() => setGateCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [gateCountdown]);

  const nowTime = () =>
    new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

  const showFeedback = (msg: string) => {
    setToastMessage(msg);
  };

  const emitResidentPush = (title: string, detail: string) => {
    setStaffPushBanner({ title, detail, time: nowTime() });
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, { body: detail });
      } catch {
        // Ignore browser notification restrictions
      }
    }
  };

  const pendingParcels = parcels.filter(
    (p) => p.status === 'Para retirar' || p.status === 'delivered'
  );
  const primaryParcel = parcels[0];
  const historyParcels = parcels.slice(1);
  const appNotices = notices.filter((n) => n.sentToApp);
  const activeUnitPreAuth = preAuthParcels.filter(
    (p) => p.status === 'Esperando' && p.unit === BUILDING_INFO.activeUnit
  );

  // Direct Quick Open (Primary button)
  const handleQuickOpenDoor = () => {
    onUnlockDirectDoor('app', 'Botón rápido de apertura directa · Akuvox E12W Relé 1');
    showFeedback('Puerta abierta al instante (Akuvox E12W · 8 seg)');
  };

  // Modular BLE 5.0 Proximity Unlock (Universal iOS & Android)
  const handleBleUnlock = async () => {
    const result = await performBleProximityUnlock({
      unit: BUILDING_INFO.activeUnit,
      residentName: BUILDING_INFO.activeResident,
      state: bleState,
    });
    if (!result.ok) {
      showFeedback(result.message);
      return;
    }
    onUnlockDirectDoor('bt-nfc', result.message);
    showFeedback(result.message);
  };

  const handleToggleBleRange = () => {
    setBleState((prev) => {
      const nextInRange = !prev.inRange;
      const rssiDbm = nextInRange ? -56 : -84;
      return {
        ...prev,
        inRange: nextInRange,
        rssiDbm,
        estimatedMeters: estimateDistanceFromRssi(rssiDbm),
      };
    });
  };

  // Modular Android NFC HCE 13.56 MHz Emulation
  const handleToggleNfcHce = async () => {
    if (nfcSession?.active) {
      await stopNfcHceEmulation();
      setNfcSession(null);
      showFeedback('Emulación NFC HCE 13.56 MHz detenida');
      return;
    }
    const session = await startNfcHceEmulation({
      unit: BUILDING_INFO.activeUnit,
      pin: residentPin,
      sessionToken: `hce-${Date.now()}`,
    });
    setNfcSession(session);
    onUnlockDirectDoor(
      'bt-nfc',
      `NFC HCE 13.56 MHz emulado (${session.emulatedUid}) → Lector Akuvox E12W`
    );
    showFeedback(`NFC HCE activo: UID ${session.emulatedUid} acercado al E12W`);
  };

  const handleOpenGate = () => {
    setGateCountdown(35);
    showFeedback('Portón de garaje abierto · cierre auto 35s');
    onLogActivity({
      title: 'Portón de garaje accionado',
      subtitle: 'Cierre automático en 35s · Apto 4B',
      time: nowTime(),
      category: 'acceso',
    });
  };

  const handleTriggerPanic = () => {
    onTriggerDuressAlert('Botón SOS en App Residente (Apto 4B)');
    showFeedback('Alerta SOS silenciosa enviada con audio/video y geolocalización');
  };

  const buildSingleUsePass = (
    name: string,
    type: PassTypeKey,
    hrs: number,
    pinOverride?: string,
    codeOverride?: string
  ): QrPass => {
    const preset = PASS_TYPE_PRESETS[type];
    const pin = pinOverride || String(Math.floor(1000 + Math.random() * 8999));
    const code = codeOverride || `ZAG-${pin}`;
    const validUntilDate = new Date(Date.now() + hrs * 3600 * 1000);
    const validUntilClock = validUntilDate.toLocaleTimeString('es-UY', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const validityLabel = `${hrs} ${hrs === 1 ? 'hora' : 'horas'} (hasta ${validUntilClock} hs)`;
    return {
      id: `pass-${Date.now()}`,
      code,
      pin,
      guestName: name,
      typeLabel: preset.label,
      validityLabel,
      hoursValid: hrs,
      validUntilIso: validUntilDate.toISOString(),
      magicLink: buildMagicLinkUrl(code),
      timeWindow: `Válido ${validityLabel} · 1 solo uso (código de voz + QR)`,
      accessScope: preset.scope,
      singleUse: true,
      status: 'Activo',
      detailText: `1 uso · ${hrs}h (hasta ${validUntilClock}) · Voz ${pin}`,
      unit: BUILDING_INFO.activeUnit,
    };
  };

  const handleQuickPass = (type: PassTypeKey) => {
    const preset = PASS_TYPE_PRESETS[type];
    const hrs = type === 'pedidosya' ? 1 : type === 'mercadolibre' ? 2 : 4;
    const created = buildSingleUsePass(preset.defaultName, type, hrs);
    onCreatePass(created);
    setSharedPassPreview(created);
    showFeedback(`Pase creado en 2 toques · Código voz ${created.pin} + Magic Link`);
    setInlineQrOpen(false);
  };

  const handleSelectPassType = (type: PassTypeKey) => {
    const preset = PASS_TYPE_PRESETS[type];
    setPassType(type);
    setGuestName(preset.defaultName);
    setHoursValid(type === 'pedidosya' ? 1 : type === 'mercadolibre' ? 2 : 4);
    setPreviewCode(preset.defaultCode);
    setPreviewPin(preset.defaultPin);
    setPreviewSummary(preset.summary);
  };

  const handleCreateSingleUsePass = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = guestName.trim() || 'Visita';
    const created = buildSingleUsePass(cleanName, passType, hoursValid, previewPin, previewCode);
    onCreatePass(created);
    setSharedPassPreview(created);
    showFeedback(`Código de voz ${created.pin} y Magic Link listos para ${cleanName}`);
    const nextPin = String(Math.floor(1000 + Math.random() * 8999));
    setPreviewPin(nextPin);
    setPreviewCode(`ZAG-${nextPin}`);
  };

  const handleCreateStaffSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateRecurringConfig({
      name: staffName,
      days: staffDays,
      startTime: staffStart,
      endTime: staffEnd,
      rfidTag: staffRfidUid,
      mobileAccessEnabled: staffMobileAccess,
    });
    if (!check.valid) {
      setStaffFormError(check.error || 'Revisá los horarios y permisos.');
      return;
    }
    setStaffFormError(null);
    const newPin = String(Math.floor(1000 + Math.random() * 8999));
    onCreateRecurringPass({
      name: staffName.trim(),
      role: staffRole,
      unit: BUILDING_INFO.activeUnit,
      pin: newPin,
      rfidTag: check.normalizedRfid,
      mobileAccessEnabled: staffMobileAccess,
      days: staffDays,
      startTime: staffStart,
      endTime: staffEnd,
    });
    showFeedback(
      `Permiso recurrente creado para ${staffName.trim()} (${staffDays.join('/')} ${staffStart}–${staffEnd})`
    );
    setStaffName('');
    setStaffRfidUid('');
    setShowAddStaff(false);
  };

  const toggleDay = (day: DayOfWeek) => {
    setStaffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleStaffShiftClick = (staff: RecurringPass) => {
    onToggleStaffShift(staff.id);
    if (!staff.currentlyInside) {
      emitResidentPush(
        `Ingreso de personal · ${staff.name} (${staff.role})`,
        `Ingresó a las ${nowTime()} hs · ${staff.rfidTag ? `RFID ${staff.rfidTag}` : 'Acceso móvil NFC/BLE'}`
      );
    } else {
      emitResidentPush(
        `Egreso de personal · ${staff.name} (${staff.role})`,
        `Salió a las ${nowTime()} hs · Jornada auditada registrada en historial`
      );
    }
  };

  const handlePreAuthSubmit = (e: FormEvent) => {
    e.preventDefault();
    const desc = preAuthDesc.trim() || `Envío ${preAuthCarrier} esperado`;
    onCreatePreAuthParcel(preAuthCarrier, desc, preAuthMode, preAuthWindow, preAuthAutoRule);
    showFeedback(
      `Pre-autorizado: ${preAuthCarrier} (${preAuthWindow}) · ${
        preAuthAutoRule === 'auto_open_after_ocr'
          ? 'Apertura automática tras OCR'
          : 'Pedir confirmación con foto'
      }`
    );
    setPreAuthDesc('');
  };

  const handleConfirmParcelClick = (parcel: ParcelItem) => {
    onConfirmParcel(parcel.id);
    showFeedback(`Encomienda ${parcel.code} marcada como retirada`);
  };

  const handleAuthorizeThirdParty = (parcel: ParcelItem) => {
    const pin = onAuthorizeParcelPin(parcel.id);
    showFeedback(`PIN ${pin} de autorización enviado por WhatsApp`);
  };

  const handleBarbacoaClick = () => {
    if (!barbacoaReserved) {
      setBarbacoaReserved(true);
      showFeedback('Barbacoa Piso 10 reservada hoy 20:00 hs · Apto 4B');
      onLogActivity({
        title: 'Reserva Barbacoa Piso 10',
        subtitle: 'Confirmada hoy 20:00 hs · Apto 4B',
        time: nowTime(),
        category: 'acceso',
      });
    } else {
      showFeedback('Barbacoa Piso 10: tu reserva hoy 20:00 hs está confirmada');
    }
  };

  const headerTitle =
    activeTab === 'accesos'
      ? 'Pases y Accesos'
      : activeTab === 'paquetes'
        ? 'Paquetería IA'
        : activeTab === 'consorcio'
          ? 'Edificio'
          : 'Zaguán App';

  const residentHceUid = buildResidentHceUid(BUILDING_INFO.activeUnit, residentPin);

  return (
    <main className="flex-1 bg-surface-container-low">
      <div className="max-w-[1200px] mx-auto lg:px-page-margin lg:py-8 grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-start">
        {/* Mobile App Frame (390px Resident App) */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[390px] min-h-[calc(100vh-4rem)] lg:min-h-[780px] lg:max-h-[840px] bg-surface lg:border lg:border-outline-variant lg:rounded-lg lg:shadow-sm flex flex-col relative overflow-hidden">
            {/* App Top Header */}
            <header className="sticky top-0 z-20 bg-surface border-b border-outline-variant px-4 py-3 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <ZaguanLogoMark className="w-8 h-8 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-label text-label-sm text-on-surface-variant truncate">
                    {BUILDING_INFO.name} · Apto {BUILDING_INFO.activeUnit} ({BUILDING_INFO.activeResident})
                  </span>
                  <div className="flex items-center gap-2">
                    <h1 className="font-headline text-title-lg text-on-surface whitespace-nowrap">
                      {headerTitle}
                    </h1>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-success-container text-on-success-container font-label text-label-sm whitespace-nowrap shrink-0">
                      E12W
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerPanic}
                aria-label="Botón de pánico y coacción"
                className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded bg-error-container text-on-error-container font-label text-label-sm hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  emergency_share
                </span>
                <span>SOS</span>
              </button>
            </header>

            {/* Scrollable Mobile Content */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 flex flex-col gap-3.5">
              {/* Live Staff Check-In / Check-Out Push Notification Card */}
              {staffPushBanner && (
                <div
                  role="status"
                  className="p-3 rounded-md bg-primary text-on-primary flex items-start justify-between gap-2 shadow"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="material-symbols-outlined text-title-md text-inverse-primary shrink-0 mt-0.5" aria-hidden="true">
                      notifications_active
                    </span>
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] text-inverse-primary uppercase block">
                        NOTIFICACIÓN PUSH · {staffPushBanner.time} hs
                      </span>
                      <p className="font-label text-label-md text-white leading-snug">
                        {staffPushBanner.title}
                      </p>
                      <p className="font-body text-body-sm text-white/80">
                        {staffPushBanner.detail}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStaffPushBanner(null)}
                    aria-label="Descartar push"
                    className="text-white/75 hover:text-white p-0.5 shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              )}

              {/* Live Unannounced / Confirmation-Required Parcel Push Banner with Photo */}
              {pendingSpontaneous && pendingSpontaneous.status === 'Esperando' && (
                <div className="p-3 rounded-md bg-warning-container text-on-warning-container border-2 border-warning flex flex-col gap-2.5 shadow">
                  <div className="flex items-center justify-between">
                    <span className="font-label text-label-sm">
                      PAQUETE EN PUERTA · CONFIRMACIÓN
                    </span>
                    <span className="font-mono text-mono-sm font-semibold tabular-nums">
                      {pendingSpontaneous.secondsLeft}s
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <SmartImage
                      src={pendingSpontaneous.photoUrl}
                      alt="Foto del repartidor y paquete en la puerta"
                      className="w-14 h-14 rounded object-cover border border-warning/50 shrink-0"
                      fallbackIcon="inventory_2"
                      fallbackLabel="Foto paquete"
                    />
                    <div className="min-w-0">
                      <p className="font-label text-label-md text-on-surface leading-tight">
                        {pendingSpontaneous.carrier} · Apto {pendingSpontaneous.unit}
                      </p>
                      <p className="font-body text-body-sm text-on-warning-container">
                        {pendingSpontaneous.detectedLabel}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('authorize');
                        showFeedback('Hall/zaguán abierto · comprobante enviado (delivered)');
                      }}
                      className="py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                    >
                      Dejar pasar al hall
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('reject');
                        showFeedback('Entrega rechazada');
                      }}
                      className="py-2 rounded bg-surface-container-lowest border border-outline-variant text-error font-label text-label-sm cursor-pointer"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}

              {/* Toast Feedback */}
              {toastMessage && (
                <div
                  role="status"
                  className="p-2.5 rounded bg-success-container text-on-success-container border border-success flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-title-md shrink-0" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="font-label text-label-sm">{toastMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToastMessage(null)}
                    aria-label="Cerrar aviso"
                    className="text-on-success-container p-1 shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              )}

              {/* TAB 1: INICIO (Apertura Directa + NFC HCE + BLE 5.0 + 2 Toques) */}
              {activeTab === 'inicio' && (
                <>
                  {/* HERO PRIMARY QUICK-OPEN CARD */}
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
                    <div className="relative">
                      <SmartImage
                        src={liveSnapshotUrl || ASSETS.lobbyCamera}
                        alt="Cámara en vivo Akuvox E12W"
                        className="w-full h-32 object-cover"
                        fallbackIcon="videocam"
                        fallbackLabel="Cámara 1080p · Akuvox E12W"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-inverse-surface/85 px-3 py-1.5 flex items-center justify-between text-inverse-on-surface">
                        <span className="font-label text-label-sm">
                          Frente de calle · Akuvox E12W
                        </span>
                        <span className="font-mono text-mono-sm tabular-nums">{nowTime()} hs</span>
                      </div>
                    </div>

                    <div className="p-3 flex flex-col gap-2">
                      {/* Primary Ultra-Fast Quick Open Button */}
                      <button
                        type="button"
                        onClick={handleQuickOpenDoor}
                        className="w-full py-3.5 px-4 rounded-md bg-primary text-on-primary hover:bg-primary-container transition-colors flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                          {door2Countdown > 0 || door1Countdown > 0 ? 'lock_open' : 'door_front'}
                        </span>
                        <span className="font-headline text-title-md">
                          {door2Countdown > 0
                            ? `Puerta Abierta (${door2Countdown}s)`
                            : 'Abrir Puerta Ahora'}
                        </span>
                      </button>

                      {/* Modular NFC HCE (Android 13.56MHz) + Universal BLE 5.0 (iOS/Android) */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleNfcHce()}
                          className={`py-2.5 px-2.5 rounded border flex flex-col items-start gap-0.5 text-left transition-colors cursor-pointer ${
                            nfcSession?.active
                              ? 'bg-secondary text-on-secondary border-secondary'
                              : 'bg-surface-container-low border-outline-variant text-on-surface hover:border-primary'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full justify-between">
                            <span className="font-label text-label-sm">NFC HCE</span>
                            <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                              nfc
                            </span>
                          </div>
                          <span
                            className={`font-mono text-[10px] truncate w-full ${
                              nfcSession?.active ? 'text-white/90' : 'text-on-surface-variant'
                            }`}
                          >
                            {nfcSession?.active ? `UID ${nfcSession.emulatedUid}` : '13.56 MHz Android'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleBleUnlock()}
                          className={`py-2.5 px-2.5 rounded border flex flex-col items-start gap-0.5 text-left transition-colors cursor-pointer ${
                            bleState.inRange
                              ? 'bg-secondary-container/70 border-secondary/40 text-on-secondary-container hover:bg-secondary-container'
                              : 'bg-surface-container border-outline-variant text-on-surface-variant'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full justify-between">
                            <span className="font-label text-label-sm">BLE 5.0</span>
                            <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                              bluetooth_connected
                            </span>
                          </div>
                          <span className="font-mono text-[10px] truncate w-full">
                            {bleState.inRange
                              ? `${bleState.estimatedMeters}m (${bleState.rssiDbm} dBm)`
                              : 'Fuera de rango'}
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-outline-variant">
                        <button
                          type="button"
                          onClick={handleToggleBleRange}
                          className="font-mono text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          {bleState.inRange ? 'Simular alejarse (>2m)' : 'Simular acercarse (<2m)'}
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenGate}
                          className="inline-flex items-center gap-1 font-label text-label-sm text-secondary hover:underline cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            garage
                          </span>
                          <span>
                            {gateCountdown > 0 ? `Garaje (${gateCountdown}s)` : 'Abrir Garaje'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* 2-Tap Quick Actions */}
                  <section className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setInlineQrOpen((prev) => !prev)}
                      className="bg-surface-container-lowest border border-outline-variant rounded-md px-3 py-3 min-h-[52px] flex items-center gap-2 text-left hover:bg-surface-container-low cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded bg-surface-variant text-primary inline-flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                          bolt
                        </span>
                      </span>
                      <div className="min-w-0">
                        <span className="font-title text-label-lg text-on-surface block leading-tight">
                          Pase 2 toques
                        </span>
                        <span className="font-body text-label-sm text-on-surface-variant">
                          Voz + Magic Link
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onChangeTab('paquetes')}
                      className="bg-surface-container-lowest border border-outline-variant rounded-md px-3 py-3 min-h-[52px] flex items-center gap-2 text-left hover:bg-surface-container-low cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded bg-secondary-container text-on-secondary-container inline-flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                          package_2
                        </span>
                      </span>
                      <div className="min-w-0">
                        <span className="font-title text-label-lg text-on-surface block leading-tight">
                          Espero paquete
                        </span>
                        <span className="font-body text-label-sm text-on-surface-variant">
                          {activeUnitPreAuth.length} pre-autorizado
                        </span>
                      </div>
                    </button>
                  </section>

                  {/* 2-Tap Inline Pass Generator */}
                  {inlineQrOpen && (
                    <section className="bg-surface-container-low border border-primary/40 rounded-md p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-title text-label-lg text-on-surface">
                          Toque 2: Generar código voz + WhatsApp
                        </span>
                        <span className="font-mono text-mono-sm text-primary">1 uso</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuickPass('visita')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm hover:border-primary cursor-pointer"
                        >
                          Visita (4h)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPass('pedidosya')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm hover:border-primary cursor-pointer"
                        >
                          Delivery (1h)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPass('mercadolibre')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm hover:border-primary cursor-pointer"
                        >
                          Paquete (2h)
                        </button>
                      </div>
                    </section>
                  )}

                  {/* Parcel Visual Receipt Card */}
                  {primaryParcel && (
                    <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-3 flex flex-col gap-2.5">
                      <div className="flex items-center gap-3">
                        <SmartImage
                          src={primaryParcel.imageUrl || ASSETS.parcelReception}
                          alt="Foto comprobante de paquete en zaguán"
                          className="w-14 h-14 rounded object-cover border border-outline-variant shrink-0"
                          fallbackIcon="inventory_2"
                          fallbackLabel="Zaguán"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="font-title text-label-lg text-on-surface truncate">
                              Paquete en {primaryParcel.storageMode === 'locker' ? 'Locker' : 'Zaguán'}
                            </h2>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-sm font-label text-label-sm shrink-0 ${
                                primaryParcel.status === 'Para retirar'
                                  ? 'bg-warning-container text-on-warning-container'
                                  : 'bg-success-container text-on-success-container'
                              }`}
                            >
                              {primaryParcel.status === 'Para retirar' ? 'Pendiente' : 'Retirado'}
                            </span>
                          </div>
                          <p className="font-body text-body-sm text-on-surface-variant mt-0.5 truncate">
                            {primaryParcel.carrier} · {primaryParcel.receivedAt}
                          </p>
                        </div>
                      </div>
                      <footer className="flex items-center justify-between pt-2 border-t border-outline-variant">
                        <span className="font-mono text-mono-sm text-secondary">
                          {primaryParcel.validationMethod}
                        </span>
                        {primaryParcel.status === 'Para retirar' ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmParcelClick(primaryParcel)}
                            className="px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                          >
                            Confirmar retiro
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onChangeTab('paquetes')}
                            className="px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-secondary cursor-pointer"
                          >
                            Ver paquetes
                          </button>
                        )}
                      </footer>
                    </article>
                  )}

                  {/* Activity & Official Notices */}
                  <div className="w-full">
                    <div
                      role="tablist"
                      aria-label="Actividad y comunicados"
                      className="grid grid-cols-2 p-1 rounded bg-surface-container border border-outline-variant gap-1"
                    >
                      <button
                        role="tab"
                        aria-selected={inicioSubTab === 'actividad'}
                        onClick={() => setInicioSubTab('actividad')}
                        className={`py-1.5 rounded-sm cursor-pointer ${
                          inicioSubTab === 'actividad'
                            ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        <span className="font-label text-label-md">Auditoría</span>
                      </button>
                      <button
                        role="tab"
                        aria-selected={inicioSubTab === 'reglamento'}
                        onClick={() => setInicioSubTab('reglamento')}
                        className={`py-1.5 rounded-sm cursor-pointer ${
                          inicioSubTab === 'reglamento'
                            ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        <span className="font-label text-label-md">
                          Comunicados ({appNotices.length})
                        </span>
                      </button>
                    </div>

                    {inicioSubTab === 'actividad' ? (
                      <div className="mt-2.5 bg-surface-container-lowest border border-outline-variant rounded-md divide-y divide-outline-variant">
                        {activities.slice(0, 4).map((item) => (
                          <div key={item.id} className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-label text-label-md text-on-surface truncate">
                                {item.title}
                              </p>
                              <p className="font-body text-body-sm text-on-surface-variant truncate">
                                {item.subtitle}
                              </p>
                            </div>
                            <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums shrink-0">
                              {item.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2.5 bg-surface-container-lowest border border-outline-variant rounded-md divide-y divide-outline-variant">
                        {appNotices.map((notice) => (
                          <div key={notice.id} className="p-3 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-label text-label-md text-on-surface">
                                {notice.title}
                              </span>
                              <span className="font-mono text-mono-sm text-primary shrink-0">
                                {notice.category}
                              </span>
                            </div>
                            <p className="font-body text-body-sm text-on-surface-variant">
                              {notice.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 2: ACCESOS (Un solo uso + Recurrentes RFID/Móvil + Coacción) */}
              {activeTab === 'accesos' && (
                <>
                  <div
                    role="tablist"
                    aria-label="Tipos de acceso"
                    className="grid grid-cols-3 p-1 rounded bg-surface-container border border-outline-variant gap-1"
                  >
                    {(
                      [
                        { id: 'un-uso', label: '1 Uso (Voz/Link)' },
                        { id: 'recurrentes', label: 'Recurrentes' },
                        { id: 'coaccion', label: 'Coacción' },
                      ] as { id: AccessSubTab; label: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        role="tab"
                        aria-selected={accessSubTab === st.id}
                        onClick={() => setAccessSubTab(st.id)}
                        className={`py-1.5 rounded-sm font-label text-label-sm cursor-pointer ${
                          accessSubTab === st.id
                            ? 'bg-surface-container-lowest text-primary shadow-sm'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* SUB-TAB 2A: PASE DE UN SOLO USO (Código Voz 4 dígitos + Magic Link + WhatsApp) */}
                  {accessSubTab === 'un-uso' && (
                    <>
                      <form
                        onSubmit={handleCreateSingleUsePass}
                        className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <h2 className="font-title text-title-md text-on-surface">
                            Pase 1 uso · Código Voz + Magic Link
                          </h2>
                          <span className="font-mono text-mono-sm text-secondary bg-secondary-container px-2 py-0.5 rounded-sm">
                            Autodestruible
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(['visita', 'pedidosya', 'mercadolibre'] as PassTypeKey[]).map((key) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleSelectPassType(key)}
                              className={`py-2 px-1.5 rounded font-label text-label-sm cursor-pointer whitespace-nowrap ${
                                passType === key
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container-low border border-outline-variant text-on-surface'
                              }`}
                            >
                              {PASS_TYPE_PRESETS[key].label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label htmlFor="guest-name" className="font-label text-label-sm text-on-surface-variant">
                              Nombre de la visita
                            </label>
                            <input
                              id="guest-name"
                              type="text"
                              value={guestName}
                              onChange={(e) => setGuestName(e.target.value)}
                              placeholder="Ej. Lucas"
                              required
                              className="rounded border border-outline-variant bg-surface text-on-surface font-body text-body-sm py-1.5 px-2"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label htmlFor="guest-hours" className="font-label text-label-sm text-on-surface-variant">
                              Vigencia (horas)
                            </label>
                            <select
                              id="guest-hours"
                              value={hoursValid}
                              onChange={(e) => setHoursValid(Number(e.target.value))}
                              className="rounded border border-outline-variant bg-surface text-on-surface font-body text-body-sm py-1.5 px-2"
                            >
                              <option value={1}>1 hora</option>
                              <option value={2}>2 horas</option>
                              <option value={4}>4 horas</option>
                              <option value={8}>8 horas</option>
                              <option value={24}>24 horas</option>
                            </select>
                          </div>
                        </div>

                        {/* Voice Code + QR + Magic Link Preview */}
                        <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex items-center gap-3">
                          <div className="w-16 h-16 rounded bg-surface-container-lowest border border-outline-variant p-1.5 shrink-0">
                            <QrPreviewSvg seed={previewCode} />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-label text-[11px] text-on-surface-variant">
                              Código de voz (dictar al portero IA):
                            </span>
                            <span className="font-mono text-title-lg text-primary font-bold tracking-widest">
                              {previewPin}
                            </span>
                            <span className="font-mono text-[10px] text-secondary truncate">
                              {buildMagicLinkUrl(previewCode)}
                            </span>
                            <span className="font-body text-[11px] text-on-surface-variant">
                              {previewSummary}
                            </span>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded bg-primary text-on-primary hover:bg-primary-container cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                            share
                          </span>
                          <span className="font-label text-label-md">
                            Crear pase y compartir por WhatsApp
                          </span>
                        </button>
                      </form>

                      {/* Active & Used Single-use Passes */}
                      <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-title text-label-lg text-on-surface">
                            Pases de un solo uso
                          </h3>
                          <span className="font-mono text-mono-sm text-on-surface-variant">
                            {passes.length} registros
                          </span>
                        </div>
                        <div className="bg-surface-container-lowest border border-outline-variant rounded-md divide-y divide-outline-variant">
                          {passes.map((pass) => (
                            <div key={pass.id} className="p-3 flex items-center justify-between gap-2">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-label text-label-md text-on-surface truncate">
                                    {pass.guestName}
                                  </span>
                                  <span
                                    className={`font-label text-label-sm px-1.5 py-0.5 rounded-sm shrink-0 ${
                                      pass.status === 'Activo'
                                        ? 'bg-success-container text-on-success-container'
                                        : pass.status === 'Usado'
                                          ? 'bg-surface-variant text-on-surface-variant'
                                          : 'bg-error-container text-on-error-container'
                                    }`}
                                  >
                                    {pass.status}
                                  </span>
                                </div>
                                <span className="font-body text-body-sm text-on-surface-variant truncate">
                                  {pass.detailText}
                                </span>
                              </div>
                              {pass.status === 'Activo' && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setSharedPassPreview(pass)}
                                    className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label text-label-sm cursor-pointer"
                                  >
                                    WhatsApp
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onRevokePass(pass.id);
                                      showFeedback(`Pase voz ${pass.pin} revocado`);
                                    }}
                                    className="px-2 py-1 rounded border border-outline-variant font-label text-label-sm text-error hover:bg-error-container cursor-pointer"
                                  >
                                    Revocar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}

                  {/* SUB-TAB 2B: PERMISOS RECURRENTES (Horarios estrictos + RFID UID físico + Acceso móvil + Push) */}
                  {accessSubTab === 'recurrentes' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-title text-title-md text-on-surface">
                          Personal y servicios recurrentes
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setStaffFormError(null);
                            setShowAddStaff((s) => !s);
                          }}
                          className="px-2.5 py-1.5 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                        >
                          {showAddStaff ? 'Cancelar' : '+ Nuevo permiso'}
                        </button>
                      </div>

                      {showAddStaff && (
                        <form
                          onSubmit={handleCreateStaffSubmit}
                          className="bg-surface-container-lowest border border-primary/40 rounded-md p-3.5 flex flex-col gap-2.5"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={staffName}
                              onChange={(e) => setStaffName(e.target.value)}
                              placeholder="Nombre (ej. Marta)"
                              className="rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-body text-body-sm"
                              required
                            />
                            <select
                              value={staffRole}
                              onChange={(e) => setStaffRole(e.target.value as RecurringPass['role'])}
                              className="rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-body text-body-sm"
                            >
                              <option value="Limpieza">Limpieza</option>
                              <option value="Paseador">Paseador</option>
                              <option value="Mantenimiento">Mantenimiento</option>
                              <option value="Cuidado">Cuidado</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="font-label text-label-sm text-on-surface-variant">
                              Días permitidos (bloqueo estricto fuera de franja):
                            </span>
                            <div className="grid grid-cols-7 gap-1">
                              {ALL_DAYS.map((day) => {
                                const selected = staffDays.includes(day);
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleDay(day)}
                                    className={`py-1.5 rounded font-label text-label-sm cursor-pointer ${
                                      selected
                                        ? 'bg-primary text-on-primary'
                                        : 'bg-surface-container-low border border-outline-variant text-on-surface'
                                    }`}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-label text-[11px] text-on-surface-variant">Desde</span>
                              <input
                                type="time"
                                value={staffStart}
                                onChange={(e) => setStaffStart(e.target.value)}
                                className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-mono-sm"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-label text-[11px] text-on-surface-variant">Hasta</span>
                              <input
                                type="time"
                                value={staffEnd}
                                onChange={(e) => setStaffEnd(e.target.value)}
                                className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-mono-sm"
                              />
                            </div>
                          </div>

                          {/* Physical RFID Keyfob UID input + Mobile Access toggle */}
                          <div className="flex flex-col gap-1">
                            <label htmlFor="rfid-uid" className="font-label text-label-sm text-on-surface-variant">
                              UID de llavero RFID físico 13.56 MHz (opcional)
                            </label>
                            <input
                              id="rfid-uid"
                              type="text"
                              value={staffRfidUid}
                              onChange={(e) => setStaffRfidUid(e.target.value)}
                              placeholder="Ej. 04:A3:2F:8B o RF-402M"
                              className="rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-mono text-mono-sm"
                            />
                          </div>

                          <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface cursor-pointer">
                            <input
                              type="checkbox"
                              checked={staffMobileAccess}
                              onChange={(e) => setStaffMobileAccess(e.target.checked)}
                              className="accent-primary"
                            />
                            Habilitar acceso móvil (NFC HCE / BLE / Código voz)
                          </label>

                          {staffFormError && (
                            <p className="p-2 rounded bg-error-container text-on-error-container font-label text-label-sm">
                              {staffFormError}
                            </p>
                          )}

                          <button
                            type="submit"
                            className="w-full py-2 rounded bg-secondary text-on-secondary font-label text-label-md cursor-pointer"
                          >
                            Guardar permiso recurrente
                          </button>
                        </form>
                      )}

                      {recurringPasses.map((staff) => (
                        <article
                          key={staff.id}
                          className={`bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5 ${
                            staff.status === 'Revocado' ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-title text-label-lg text-on-surface">
                                  {staff.name}
                                </h3>
                                <span className="px-1.5 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                                  {staff.role}
                                </span>
                              </div>
                              <p className="font-mono text-mono-sm text-secondary mt-0.5">
                                {staff.days.join(' · ')} | {staff.startTime}–{staff.endTime} hs
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {staff.rfidTag && (
                                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface">
                                    RFID: {staff.rfidTag}
                                  </span>
                                )}
                                {staff.mobileAccessEnabled && (
                                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                                    Móvil + Voz {staff.pin}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-sm font-label text-label-sm shrink-0 ${
                                staff.status === 'Revocado'
                                  ? 'bg-error-container text-on-error-container'
                                  : staff.currentlyInside
                                    ? 'bg-secondary-container text-on-secondary-container'
                                    : 'bg-success-container text-on-success-container'
                              }`}
                            >
                              {staff.status === 'Revocado'
                                ? 'Revocado'
                                : staff.currentlyInside
                                  ? 'En depto'
                                  : 'Activo'}
                            </span>
                          </div>

                          <div className="p-2 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                            <span className="font-label text-label-sm text-on-surface-variant">
                              Auditoría con notificación push (ingreso / egreso):
                            </span>
                            {staff.auditLog.slice(0, 2).map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between font-mono text-mono-sm text-on-surface"
                              >
                                <span>
                                  {entry.dateLabel} · {entry.checkIn}→{entry.checkOut || 'ahora'}
                                </span>
                                <span className="text-primary font-medium">{entry.durationLabel}</span>
                              </div>
                            ))}
                          </div>

                          {staff.status === 'Activo' && (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleStaffShiftClick(staff)}
                                className="py-1.5 px-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                              >
                                {staff.currentlyInside ? 'Simular egreso (Push)' : 'Simular ingreso (Push)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRevokeRecurringPass(staff.id);
                                  showFeedback(`Permiso de ${staff.name} revocado al instante`);
                                }}
                                className="py-1.5 px-2 rounded bg-error-container text-on-error-container font-label text-label-sm cursor-pointer"
                              >
                                Revocar al instante
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}

                  {/* SUB-TAB 2C: PIN DE PÁNICO / COACCIÓN */}
                  {accessSubTab === 'coaccion' && (
                    <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-error">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          gpp_maybe
                        </span>
                        <h2 className="font-title text-title-md text-on-surface">
                          PIN de Pánico / Coacción Silenciosa
                        </h2>
                      </div>
                      <p className="font-body text-body-sm text-on-surface-variant">
                        Invertí los últimos dos dígitos de tu PIN en el teclado Wiegand o dictado de
                        emergencia: abre normalmente sin alertar y dispara alerta silenciosa con
                        audio/video.
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-3 rounded bg-surface-container-low border border-outline-variant">
                          <span className="font-label text-label-sm text-on-surface-variant block">
                            Tu PIN normal
                          </span>
                          <span className="font-mono text-headline-sm text-on-surface tabular-nums">
                            {residentPin}
                          </span>
                        </div>
                        <div className="p-3 rounded bg-error-container/60 border border-error/40">
                          <span className="font-label text-label-sm text-on-error-container block">
                            PIN Coacción
                          </span>
                          <span className="font-mono text-headline-sm text-on-error-container tabular-nums">
                            {duressPin}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={4}
                          value={pinDraft}
                          onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="4 dígitos"
                          className="flex-1 rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-md"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (pinDraft.length === 4) {
                              onUpdateResidentPin(pinDraft);
                              showFeedback(`PIN actualizado a ${pinDraft}`);
                            }
                          }}
                          className="px-3 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                        >
                          Cambiar PIN
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* TAB 3: PAQUETERÍA INTELIGENTE */}
              {activeTab === 'paquetes' && (
                <>
                  <form
                    onSubmit={handlePreAuthSubmit}
                    className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-title text-label-lg text-on-surface">
                        Espero un paquete
                      </h2>
                      <span className="font-mono text-mono-sm text-primary bg-surface-variant px-2 py-0.5 rounded-sm">
                        Visión OCR IA
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Empresa o correo"
                        value={preAuthCarrier}
                        onChange={(e) => setPreAuthCarrier(e.target.value)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                      >
                        <option value="Mercado Libre">Mercado Libre</option>
                        <option value="PedidosYa">PedidosYa</option>
                        <option value="DAC">DAC Agencia Central</option>
                        <option value="Correo Uruguayo">Correo Uruguayo</option>
                        <option value="Amazon / Courier">Amazon / Courier</option>
                      </select>
                      <select
                        aria-label="Ventana de tiempo esperada"
                        value={preAuthWindow}
                        onChange={(e) => setPreAuthWindow(e.target.value)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                      >
                        <option value="Hoy 09:00–13:00">Hoy 09:00–13:00</option>
                        <option value="Hoy 13:00–18:00">Hoy 13:00–18:00</option>
                        <option value="Hoy 18:00–22:00">Hoy 18:00–22:00</option>
                        <option value="Hoy 09:00–18:00">Todo el día</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={preAuthDesc}
                        onChange={(e) => setPreAuthDesc(e.target.value)}
                        placeholder="Remitente o detalle (ej. Full)"
                        className="col-span-2 rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-body text-body-sm"
                      />
                      <select
                        aria-label="Zona de depósito"
                        value={preAuthMode}
                        onChange={(e) => setPreAuthMode(e.target.value as ParcelStorageMode)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                      >
                        <option value="zaguan">Zaguán</option>
                        <option value="locker">Locker</option>
                      </select>
                    </div>

                    {/* Per-package automatic rule selector */}
                    <div className="flex flex-col gap-1.5 pt-0.5">
                      <span className="font-label text-[11px] text-on-surface-variant">
                        Regla automática al validar la etiqueta:
                      </span>
                      <label className="flex items-start gap-2 p-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
                        <input
                          type="radio"
                          name="preauth-rule"
                          checked={preAuthAutoRule === 'auto_open_after_ocr'}
                          onChange={() => setPreAuthAutoRule('auto_open_after_ocr')}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="font-body text-body-sm text-on-surface">
                          <strong>Abrir zaguán automáticamente</strong> tras validar etiqueta
                        </span>
                      </label>
                      <label className="flex items-start gap-2 p-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
                        <input
                          type="radio"
                          name="preauth-rule"
                          checked={preAuthAutoRule === 'ask_confirmation_photo'}
                          onChange={() => setPreAuthAutoRule('ask_confirmation_photo')}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="font-body text-body-sm text-on-surface">
                          <strong>Pedirme confirmación con foto</strong> antes de abrir
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
                    >
                      Registrar entrega esperada
                    </button>

                    {/* List of pre-authorized packages for Apto 4B */}
                    {preAuthParcels.filter((p) => p.unit === BUILDING_INFO.activeUnit).length > 0 && (
                      <div className="pt-2 border-t border-outline-variant flex flex-col gap-1.5">
                        <span className="font-label text-label-sm text-secondary">
                          Mis entregas pre-autorizadas (Apto {BUILDING_INFO.activeUnit}):
                        </span>
                        {preAuthParcels
                          .filter((p) => p.unit === BUILDING_INFO.activeUnit)
                          .slice(0, 4)
                          .map((pa) => (
                            <div
                              key={pa.id}
                              className="p-2 rounded bg-surface-container-low border border-outline-variant flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="font-label text-label-sm text-on-surface truncate">
                                  {pa.carrier} · {pa.timeWindowLabel}
                                </p>
                                <p className="font-body text-[11px] text-on-surface-variant truncate">
                                  {pa.autoRule === 'auto_open_after_ocr'
                                    ? 'Auto-abrir zaguán tras OCR'
                                    : 'Pedir confirmación con foto'}
                                </p>
                              </div>
                              <span
                                className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm shrink-0 ${
                                  pa.status === 'delivered'
                                    ? 'bg-success-container text-on-success-container'
                                    : 'bg-surface-variant text-primary'
                                }`}
                              >
                                {pa.status === 'delivered' ? 'delivered' : 'Esperando'}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </form>

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2">
                    <span className="font-title text-label-lg text-on-surface">
                      Regla sin aviso (tras 20 seg)
                    </span>
                    <label className="flex items-start gap-2 p-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
                      <input
                        type="radio"
                        name="unannounced-rule"
                        checked={unannouncedRule === 'auto-zaguan'}
                        onChange={() => onChangeUnannouncedRule('auto-zaguan')}
                        className="mt-1 accent-primary"
                      />
                      <span className="font-body text-body-sm text-on-surface">
                        Autorizar ingreso automático al zaguán/locker con foto comprobante.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 p-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
                      <input
                        type="radio"
                        name="unannounced-rule"
                        checked={unannouncedRule === 'reject'}
                        onChange={() => onChangeUnannouncedRule('reject')}
                        className="mt-1 accent-primary"
                      />
                      <span className="font-body text-body-sm text-on-surface">
                        No autorizar sin mi confirmación.
                      </span>
                    </label>
                  </section>

                  {primaryParcel && (
                    <article className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
                      <SmartImage
                        src={primaryParcel.imageUrl || ASSETS.parcelReception}
                        alt="Foto comprobante de paquete"
                        className="w-full h-36 object-cover"
                        fallbackIcon="inventory_2"
                        fallbackLabel="Foto comprobante Zaguán"
                      />
                      <div className="p-3.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-title text-title-md text-on-surface">
                            {primaryParcel.carrier} ({primaryParcel.code})
                          </h3>
                          <span className="font-label text-label-sm px-2 py-0.5 rounded-sm bg-warning-container text-on-warning-container">
                            {primaryParcel.status}
                          </span>
                        </div>
                        <p className="font-body text-body-sm text-on-surface-variant">
                          {primaryParcel.note}
                        </p>
                        {primaryParcel.authorizedPin && (
                          <p className="font-mono text-mono-sm text-primary">
                            PIN retiro tercero: {primaryParcel.authorizedPin}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            disabled={primaryParcel.status === 'Retirado'}
                            onClick={() => handleConfirmParcelClick(primaryParcel)}
                            className="py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer disabled:opacity-60"
                          >
                            {primaryParcel.status === 'Retirado' ? 'Retirado ✓' : 'Confirmar retiro'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAuthorizeThirdParty(primaryParcel)}
                            className="py-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-secondary cursor-pointer"
                          >
                            PIN tercero
                          </button>
                        </div>
                      </div>
                    </article>
                  )}

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md divide-y divide-outline-variant">
                    {historyParcels.map((parcel) => (
                      <div key={parcel.id} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-label text-label-md text-on-surface truncate">
                            {parcel.carrier} · {parcel.code}
                          </p>
                          <p className="font-body text-body-sm text-on-surface-variant truncate">
                            {parcel.receivedAt} · {parcel.location}
                          </p>
                        </div>
                        <span className="font-label text-label-sm px-2 py-0.5 rounded-sm bg-success-container text-on-success-container">
                          {parcel.status}
                        </span>
                      </div>
                    ))}
                  </section>
                </>
              )}

              {/* TAB 4: EDIFICIO / COMUNICADOS */}
              {activeTab === 'consorcio' && (
                <>
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5">
                    <h2 className="font-title text-title-md text-on-surface">Comunicados Oficiales</h2>
                    <div className="divide-y divide-outline-variant">
                      {appNotices.map((n) => (
                        <div key={n.id} className="py-2.5 first:pt-0 last:pb-0 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-label text-label-md text-on-surface">{n.title}</span>
                            <span className="font-mono text-mono-sm text-secondary">{n.category}</span>
                          </div>
                          <p className="font-body text-body-sm text-on-surface-variant">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5">
                    <h2 className="font-title text-title-md text-on-surface">Barbacoa Piso 10</h2>
                    <button
                      type="button"
                      onClick={handleBarbacoaClick}
                      className="w-full py-2.5 px-4 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
                    >
                      {barbacoaReserved ? 'Reservada hoy 20:00 hs ✓' : 'Reservar hoy 20:00 hs'}
                    </button>
                  </section>
                </>
              )}
            </div>

            {/* FULL-SCREEN LIVE INCOMING DOORBELL CALL MODAL ([Abrir Puerta] [Hablar] [Rechazar]) */}
            {pendingVisit && pendingVisit.status === 'Pendiente' && (
              <IncomingDoorbellModal
                visit={pendingVisit}
                liveSnapshotUrl={liveSnapshotUrl}
                onApproveOpen={() => {
                  onRespondVisit(true);
                  showFeedback(`Puerta abierta para ${pendingVisit.visitorName}`);
                }}
                onReject={() => {
                  onRespondVisit(false);
                  showFeedback(`Visita de ${pendingVisit.visitorName} rechazada`);
                }}
                onSendVoiceMessage={onSendDoorbellVoiceReply}
              />
            )}

            {/* Magic Link & WhatsApp Direct Share Modal */}
            {sharedPassPreview && (
              <div className="absolute inset-0 z-40 bg-black/65 flex items-end sm:items-center justify-center p-3">
                <div className="w-full bg-surface-container-lowest rounded-lg border border-outline-variant p-4 flex flex-col gap-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                    <span className="font-title text-label-lg text-on-surface">
                      Pase listo para compartir (Magic Link + Voz)
                    </span>
                    <button
                      type="button"
                      onClick={() => setSharedPassPreview(null)}
                      aria-label="Cerrar"
                      className="p-1 text-on-surface-variant cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </div>

                  <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                    <span className="font-label text-label-sm text-secondary">
                      INVITACIÓN PARA {sharedPassPreview.guestName.toUpperCase()}
                    </span>
                    <span className="font-headline text-title-md text-on-surface">
                      {BUILDING_INFO.address}
                    </span>
                    <span className="font-mono text-[11px] text-primary break-all">
                      {sharedPassPreview.magicLink || buildMagicLinkUrl(sharedPassPreview.code)}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 py-1">
                    <div className="w-28 h-28 p-2 rounded-md bg-white border border-outline-variant">
                      <QrPreviewSvg seed={sharedPassPreview.code} />
                    </div>
                    <span className="font-label text-label-sm text-on-surface-variant">
                      Código de voz (dictar al Portero IA):
                    </span>
                    <span className="font-mono text-headline-md text-primary font-bold tracking-widest">
                      {sharedPassPreview.pin}
                    </span>
                    <span className="font-label text-label-sm text-on-surface-variant text-center">
                      {sharedPassPreview.validityLabel} · 1 solo uso
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <a
                      href={buildWhatsAppShareHref({
                        guestName: sharedPassPreview.guestName,
                        buildingAddress: BUILDING_INFO.address,
                        unit: BUILDING_INFO.activeUnit,
                        pin: sharedPassPreview.pin,
                        validityLabel: sharedPassPreview.validityLabel,
                        magicLink:
                          sharedPassPreview.magicLink || buildMagicLinkUrl(sharedPassPreview.code),
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 rounded bg-[#128C7E] hover:bg-[#0E7368] text-white font-label text-label-md inline-flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                        chat
                      </span>
                      <span>Compartir directo por WhatsApp</span>
                    </a>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const link =
                            sharedPassPreview.magicLink ||
                            buildMagicLinkUrl(sharedPassPreview.code);
                          navigator.clipboard?.writeText(link).catch(() => {});
                          setCopiedMagicLink(true);
                          setTimeout(() => setCopiedMagicLink(false), 1800);
                        }}
                        className="py-2 px-2 rounded bg-surface-container border border-outline-variant font-label text-label-sm text-on-surface cursor-pointer"
                      >
                        {copiedMagicLink ? 'Enlace copiado ✓' : 'Copiar Magic Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetToken = sharedPassPreview.code;
                          setSharedPassPreview(null);
                          onOpenPublicMagicLink(targetToken);
                        }}
                        className="py-2 px-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                      >
                        Abrir /pase/{sharedPassPreview.code}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Navigation Dock */}
            <nav
              aria-label="Navegación de la app"
              className="fixed lg:absolute bottom-0 inset-x-0 max-w-[390px] mx-auto bg-surface-container-lowest border-t border-outline-variant px-2 py-2 grid grid-cols-4 gap-1 z-30"
            >
              {(
                [
                  { id: 'inicio', label: 'Inicio', icon: 'home' },
                  { id: 'accesos', label: 'Pases', icon: 'key' },
                  { id: 'paquetes', label: 'Paquetes', icon: 'inventory_2' },
                  { id: 'consorcio', label: 'Edificio', icon: 'apartment' },
                ] as { id: ResidentTab; label: string; icon: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChangeTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-1 min-h-[44px] cursor-pointer ${
                    activeTab === tab.id
                      ? 'text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-title-lg ${
                      activeTab === tab.id ? 'material-symbols-filled' : ''
                    }`}
                    aria-hidden="true"
                  >
                    {tab.icon}
                  </span>
                  <span className="font-label text-label-sm">{tab.label}</span>
                  {tab.id === 'paquetes' && pendingParcels.length > 0 && (
                    <span className="absolute top-0.5 right-5 w-4 h-4 rounded-full bg-primary text-on-primary font-label text-label-sm inline-flex items-center justify-center tabular-nums">
                      {pendingParcels.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Desktop Companion Panel: Live E12W Doorbell Tester + NFC HCE / BLE Diagnostics */}
        <aside className="hidden lg:flex lg:col-span-7 flex-col gap-gutter-lg">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-headline-sm text-on-surface">
                  App Residente · Akuvox E12W + NFC HCE + BLE 5.0
                </h2>
                <p className="font-body text-body-md text-on-surface-variant">
                  Probá la recepción de timbre en vivo con foto + [Abrir / Hablar / Rechazar],
                  emulación NFC HCE 13.56 MHz para Android y puente BLE universal.
                </p>
              </div>
              <button
                type="button"
                onClick={onSimulateIncomingDoorbell}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-secondary text-on-secondary hover:opacity-95 font-label text-label-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  notifications_active
                </span>
                <span>Simular Timbre E12W en Vivo</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-outline-variant">
              {(
                [
                  { id: 'inicio', label: 'Apertura + NFC/BLE', icon: 'home' },
                  { id: 'accesos', label: 'Pases + RFID', icon: 'key' },
                  { id: 'paquetes', label: 'Paquetería OCR', icon: 'inventory_2' },
                  { id: 'consorcio', label: 'Comunicados', icon: 'apartment' },
                ] as { id: ResidentTab; label: string; icon: string }[]
              ).map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => onChangeTab(screen.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded border font-label text-label-sm whitespace-nowrap cursor-pointer ${
                    activeTab === screen.id
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-low text-on-surface border-outline-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                    {screen.icon}
                  </span>
                  <span>{screen.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Modular NFC HCE & BLE Bridge Technical Telemetry */}
          <div className="grid grid-cols-2 gap-gutter-md">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-label text-label-sm text-primary">
                  NFC HCE (Android 13.56 MHz)
                </span>
                <span
                  className={`font-mono text-[11px] px-2 py-0.5 rounded-sm ${
                    nfcSession?.active
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {nfcSession?.active ? 'EMULANDO' : 'STANDBY'}
                </span>
              </div>
              <span className="font-mono text-title-md text-on-surface">
                UID: {residentHceUid}
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant">
                AID: F05A414755414E01 (ISO-DEP)
              </span>
              <p className="font-body text-body-sm text-on-surface-variant">
                {nfcCapabilities.reason}
              </p>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-label text-label-sm text-secondary">
                  Puente BLE 5.0 (iOS + Android)
                </span>
                <span
                  className={`font-mono text-[11px] px-2 py-0.5 rounded-sm ${
                    bleState.inRange
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-warning-container text-on-warning-container'
                  }`}
                >
                  {bleState.inRange ? 'EN RANGO' : 'LEJOS'}
                </span>
              </div>
              <span className="font-mono text-title-md text-on-surface tabular-nums">
                {bleState.rssiDbm} dBm · {bleState.estimatedMeters} m
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant">
                Dispositivo: {bleState.deviceLabel}
              </span>
              <p className="font-body text-body-sm text-on-surface-variant">
                Transporte: <strong>{bleState.transportMode}</strong> (umbral ≥ -68 dBm)
              </p>
            </div>
          </div>

          {/* Live Synchronized Event Log */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between">
              <div>
                <h3 className="font-title text-title-md text-on-surface">
                  Registro de auditoría en tiempo real
                </h3>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Sincronizado entre App Residente, Akuvox E12W y Panel Admin
                </p>
              </div>
              <span className="font-mono text-mono-sm text-secondary">HCE · BLE · SIP</span>
            </div>

            <div className="divide-y divide-outline-variant max-h-[300px] overflow-y-auto">
              {activities.map((act) => (
                <div key={act.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-label text-label-md text-on-surface">{act.title}</span>
                    <span className="font-body text-body-sm text-on-surface-variant">
                      {act.subtitle}
                    </span>
                  </div>
                  <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums shrink-0">
                    {act.time} hs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
