import { FormEvent, useEffect, useState } from 'react';
import { ASSETS, BUILDING_INFO, PASS_TYPE_PRESETS } from '../data/zaguanData';
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
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  ResidentTab,
  UnannouncedParcelRule,
} from '../types/zaguan';
import { SmartImage, ZaguanLogoMark } from './BrandMark';
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
  onRespondVisit: (approved: boolean) => void;
  pendingSpontaneous: PendingSpontaneousParcel | null;
  onRespondSpontaneousParcel: (action: 'authorize' | 'reject' | 'timeout-auto') => void;
  residentPin: string;
  duressPin: string;
  onUpdateResidentPin: (newPin: string) => void;
  door1Countdown: number;
  door2Countdown: number;
  onUnlockDirectDoor: (method: 'app' | 'bt-nfc') => void;
  onCreatePass: (pass: QrPass) => void;
  onRevokePass: (id: string) => void;
  onCreateRecurringPass: (staff: Omit<RecurringPass, 'id' | 'status' | 'currentlyInside' | 'auditLog'>) => void;
  onRevokeRecurringPass: (id: string) => void;
  onToggleStaffShift: (id: string) => void;
  onCreatePreAuthParcel: (carrier: string, description: string, mode: ParcelStorageMode) => void;
  onConfirmParcel: (id: string) => void;
  onAuthorizeParcelPin: (id: string) => string;
  onTriggerDuressAlert: (source: string) => void;
  onLogActivity: (event: Omit<ActivityEvent, 'id'>) => void;
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
  onRespondVisit,
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
  onNavigateMain,
}: AppResidenteViewProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inlineQrOpen, setInlineQrOpen] = useState(false);
  const [inicioSubTab, setInicioSubTab] = useState<InicioSubTab>('actividad');
  const [accessSubTab, setAccessSubTab] = useState<AccessSubTab>('un-uso');
  const [barbacoaReserved, setBarbacoaReserved] = useState(false);
  const [gateCountdown, setGateCountdown] = useState(0);
  const [bluetoothNear, setBluetoothNear] = useState(true);

  // WhatsApp Guest Link preview modal
  const [sharedPassPreview, setSharedPassPreview] = useState<QrPass | null>(null);

  // Single-use QR/PIN generator state
  const [passType, setPassType] = useState<PassTypeKey>('visita');
  const [guestName, setGuestName] = useState(PASS_TYPE_PRESETS.visita.defaultName);
  const [guestDuration, setGuestDuration] = useState(PASS_TYPE_PRESETS.visita.defaultDuration);
  const [previewCode, setPreviewCode] = useState(PASS_TYPE_PRESETS.visita.defaultCode);
  const [previewPin, setPreviewPin] = useState(PASS_TYPE_PRESETS.visita.defaultPin);
  const [previewSummary, setPreviewSummary] = useState(PASS_TYPE_PRESETS.visita.summary);

  // Recurring staff creation form
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<RecurringPass['role']>('Limpieza');
  const [staffDays, setStaffDays] = useState<DayOfWeek[]>(['M', 'J']);
  const [staffStart, setStaffStart] = useState('08:00');
  const [staffEnd, setStaffEnd] = useState('13:00');

  // Duress PIN editor
  const [pinDraft, setPinDraft] = useState(residentPin);

  // Pre-auth parcel quick form
  const [preAuthCarrier, setPreAuthCarrier] = useState('Mercado Libre');
  const [preAuthDesc, setPreAuthDesc] = useState('');
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

  const pendingParcels = parcels.filter((p) => p.status === 'Para retirar');
  const primaryParcel = parcels[0];
  const historyParcels = parcels.slice(1);
  const appNotices = notices.filter((n) => n.sentToApp);
  const activeUnitPreAuth = preAuthParcels.filter(
    (p) => p.status === 'Esperando' && p.unit === BUILDING_INFO.activeUnit
  );

  const handleOpenDoor = (method: 'app' | 'bt-nfc') => {
    onUnlockDirectDoor(method);
    showFeedback(
      method === 'bt-nfc'
        ? 'Puerta desbloqueada por Bluetooth/NFC (Proximidad 1.2m)'
        : 'Puerta principal desbloqueada por 8 seg'
    );
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

  const handleQuickPass = (type: PassTypeKey) => {
    const preset = PASS_TYPE_PRESETS[type];
    const randomPin = String(Math.floor(1000 + Math.random() * 8999));
    const randomCode = `ZAG-${randomPin}`;
    const created: QrPass = {
      id: `pass-${Date.now()}`,
      code: randomCode,
      pin: randomPin,
      guestName: preset.defaultName,
      typeLabel: preset.label,
      validityLabel: preset.defaultDuration,
      timeWindow: preset.defaultWindow,
      accessScope: preset.scope,
      singleUse: true,
      status: 'Activo',
      detailText: `1 uso · ${preset.defaultDuration} · PIN ${randomPin}`,
      unit: BUILDING_INFO.activeUnit,
    };
    onCreatePass(created);
    setSharedPassPreview(created);
    showFeedback(`Link WhatsApp + QR/PIN ${randomPin} creado en 2 toques`);
    setInlineQrOpen(false);
  };

  const handleSelectPassType = (type: PassTypeKey) => {
    const preset = PASS_TYPE_PRESETS[type];
    setPassType(type);
    setGuestName(preset.defaultName);
    setGuestDuration(preset.defaultDuration);
    setPreviewCode(preset.defaultCode);
    setPreviewPin(preset.defaultPin);
    setPreviewSummary(preset.summary);
  };

  const handleSendWhatsAppQr = () => {
    const cleanName = guestName.trim() || 'Invitado';
    const preset = PASS_TYPE_PRESETS[passType];
    const created: QrPass = {
      id: `pass-${Date.now()}`,
      code: previewCode,
      pin: previewPin,
      guestName: cleanName,
      typeLabel: preset.label,
      validityLabel: guestDuration,
      timeWindow: `Válido ${guestDuration} · 1 solo uso (se destruye al entrar)`,
      accessScope: preset.scope,
      singleUse: true,
      status: 'Activo',
      detailText: `1 uso · ${guestDuration} · PIN ${previewPin}`,
      unit: BUILDING_INFO.activeUnit,
    };
    onCreatePass(created);
    setSharedPassPreview(created);
    showFeedback(`Link WhatsApp enviado a ${cleanName} (QR + PIN ${previewPin})`);
    const nextPin = String(Math.floor(1000 + Math.random() * 8999));
    setPreviewPin(nextPin);
    setPreviewCode(`ZAG-${nextPin}`);
  };

  const handleCreateStaffSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || staffDays.length === 0) return;
    const newPin = String(Math.floor(1000 + Math.random() * 8999));
    const rfid = `RF-4B${staffName.trim().charAt(0).toUpperCase()}${Math.floor(10 + Math.random() * 89)}`;
    onCreateRecurringPass({
      name: staffName.trim(),
      role: staffRole,
      unit: BUILDING_INFO.activeUnit,
      pin: newPin,
      rfidTag: rfid,
      days: staffDays,
      startTime: staffStart,
      endTime: staffEnd,
    });
    showFeedback(`Acceso recurrente creado para ${staffName.trim()} (PIN ${newPin} / ${rfid})`);
    setStaffName('');
    setShowAddStaff(false);
  };

  const toggleDay = (day: DayOfWeek) => {
    setStaffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handlePreAuthSubmit = (e: FormEvent) => {
    e.preventDefault();
    const desc = preAuthDesc.trim() || `Envío ${preAuthCarrier} esperado hoy`;
    onCreatePreAuthParcel(preAuthCarrier, desc, preAuthMode);
    showFeedback(
      `Pre-autorizado: ${preAuthCarrier} (${preAuthMode === 'locker' ? 'Locker' : 'Zaguán'}) · IA validará por OCR sin molestarte`
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
      ? 'Accesos y PIN'
      : activeTab === 'paquetes'
        ? 'Paquetería IA'
        : activeTab === 'consorcio'
          ? 'Edificio'
          : 'Zaguán App';

  return (
    <main className="flex-1 bg-surface-container-low">
      <div className="max-w-[1200px] mx-auto lg:px-page-margin lg:py-8 grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-start">
        {/* Mobile App Frame (authentic 390px mobile experience) */}
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
                      IA 24/7
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerPanic}
                aria-label="Botón de pánico y coacción"
                className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded bg-error-container text-on-error-container font-label text-label-sm hover:opacity-90 transition-opacity duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  emergency_share
                </span>
                <span>SOS</span>
              </button>
            </header>

            {/* Scrollable Mobile Content */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 flex flex-col gap-3.5">
              {/* Live Incoming AI Visit Push Banner */}
              {pendingVisit && pendingVisit.status === 'Pendiente' && (
                <div className="p-3 rounded-md bg-primary text-on-primary flex flex-col gap-2.5 shadow">
                  <div className="flex items-center gap-2.5">
                    <SmartImage
                      src={pendingVisit.photoUrl}
                      alt="Foto en vivo de visita en puerta"
                      className="w-12 h-12 rounded object-cover border border-white/30 shrink-0"
                      fallbackIcon="person"
                      fallbackLabel="Visita"
                    />
                    <div className="min-w-0">
                      <span className="font-mono text-mono-sm text-inverse-primary">
                        PORTERO IA · FOTO EN VIVO
                      </span>
                      <p className="font-label text-label-md text-white leading-tight">
                        {pendingVisit.visitorName} busca a {pendingVisit.residentName} ({pendingVisit.unit})
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRespondVisit(true);
                        showFeedback(`Puerta abierta para ${pendingVisit.visitorName}`);
                      }}
                      className="py-2 rounded bg-secondary text-on-secondary font-label text-label-md cursor-pointer"
                    >
                      Abrir Puerta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondVisit(false);
                        showFeedback(`Visita de ${pendingVisit.visitorName} rechazada`);
                      }}
                      className="py-2 rounded bg-white/15 text-white font-label text-label-md cursor-pointer"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}

              {/* Live Spontaneous Parcel Push Banner (20s countdown) */}
              {pendingSpontaneous && pendingSpontaneous.status === 'Esperando' && (
                <div className="p-3 rounded-md bg-warning-container text-on-warning-container border border-warning flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label text-label-sm">PAQUETE EN PUERTA</span>
                    <span className="font-mono text-mono-sm font-semibold tabular-nums">
                      {pendingSpontaneous.secondsLeft}s
                    </span>
                  </div>
                  <p className="font-body text-body-sm">
                    Llegó <strong>{pendingSpontaneous.carrier}</strong>. ¿Lo dejamos en el{' '}
                    {storageMode === 'locker' ? 'Locker #B2' : 'zaguán'}?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('authorize');
                        showFeedback('Autorizado depósito en zona segura con foto');
                      }}
                      className="py-1.5 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                    >
                      Dejar en Zaguán
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('reject');
                        showFeedback('Entrega rechazada');
                      }}
                      className="py-1.5 rounded bg-surface-container-lowest border border-outline-variant text-on-surface font-label text-label-sm cursor-pointer"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}

              {/* Live Feedback Banner */}
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
                    className="text-on-success-container hover:opacity-75 p-1 shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              )}

              {/* TAB 1: INICIO */}
              {activeTab === 'inicio' && (
                <>
                  {/* Direct Bluetooth / NFC Proximity Bar */}
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${
                          bluetoothNear
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
                          nfc
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="font-label text-label-md text-on-surface truncate">
                          {bluetoothNear ? 'Bluetooth / NFC cerca (1.2m)' : 'Fuera de rango BT/NFC'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setBluetoothNear((b) => !b)}
                          className="font-body text-body-sm text-primary hover:underline cursor-pointer"
                        >
                          {bluetoothNear ? 'Simular alejarse' : 'Simular acercarse'}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!bluetoothNear}
                      onClick={() => handleOpenDoor('bt-nfc')}
                      className={`px-3 py-2 rounded font-label text-label-sm whitespace-nowrap shrink-0 transition-colors ${
                        bluetoothNear
                          ? 'bg-secondary text-on-secondary hover:opacity-90 cursor-pointer'
                          : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                      }`}
                    >
                      Abrir BT/NFC
                    </button>
                  </section>

                  {/* Live Lobby Camera & Direct Door/Garage Controls */}
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
                    <div className="relative">
                      <SmartImage
                        src={ASSETS.lobbyCamera}
                        alt="Cámara en vivo del acceso principal del edificio"
                        className="w-full h-36 object-cover"
                        fallbackIcon="videocam"
                        fallbackLabel="Cámara ColorVu · Hall PB"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-inverse-surface/85 px-3 py-1.5 flex items-center justify-between text-inverse-on-surface">
                        <span className="font-label text-label-sm">
                          Frente de calle · Portero IA
                        </span>
                        <span className="font-mono text-mono-sm tabular-nums">{nowTime()} hs</span>
                      </div>
                    </div>

                    <div className="p-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDoor('app')}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded bg-primary text-on-primary hover:bg-primary-container transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                          door_front
                        </span>
                        <span className="font-label text-label-md">
                          {door2Countdown > 0 ? `Abierta (${door2Countdown}s)` : 'Abrir puerta'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenGate}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded bg-surface-container-lowest text-secondary border border-outline-variant hover:bg-surface-container-low transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                          garage
                        </span>
                        <span className="font-label text-label-md">
                          {gateCountdown > 0 ? `Abierto (${gateCountdown}s)` : 'Abrir portón'}
                        </span>
                      </button>
                    </div>
                  </section>

                  {/* Ultra-fast 2-Tap Actions */}
                  <section className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setInlineQrOpen((prev) => !prev)}
                      className="bg-surface-container-lowest border border-outline-variant rounded-md px-3 py-3 min-h-[52px] flex items-center gap-2 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
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
                          QR + PIN WhatsApp
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onChangeTab('paquetes')}
                      className="bg-surface-container-lowest border border-outline-variant rounded-md px-3 py-3 min-h-[52px] flex items-center gap-2 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
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
                          Toque 2: Elegí y compartí al instante
                        </span>
                        <span className="font-mono text-mono-sm text-primary">1 solo uso</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuickPass('pedidosya')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm text-on-surface hover:border-primary cursor-pointer"
                        >
                          PedidosYa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPass('mercadolibre')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm text-on-surface hover:border-primary cursor-pointer"
                        >
                          Mercado Libre
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPass('visita')}
                          className="py-2.5 px-2 rounded bg-surface-container-lowest border border-outline-variant font-label text-label-sm text-on-surface hover:border-primary cursor-pointer"
                        >
                          Visita
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
                              Tu paquete ya está en {primaryParcel.storageMode === 'locker' ? 'Locker' : 'el zaguán'}
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
                            className="px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary hover:bg-surface-container cursor-pointer"
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

                  {/* Activity & Official Notices Tabs */}
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
                        className={`py-1.5 rounded-sm transition-colors cursor-pointer ${
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
                        className={`py-1.5 rounded-sm transition-colors cursor-pointer ${
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

              {/* TAB 2: ACCESOS (Un solo uso + Recurrentes + Coacción) */}
              {activeTab === 'accesos' && (
                <>
                  {/* Sub-tabs inside Accesos */}
                  <div
                    role="tablist"
                    aria-label="Tipos de acceso"
                    className="grid grid-cols-3 p-1 rounded bg-surface-container border border-outline-variant gap-1"
                  >
                    {(
                      [
                        { id: 'un-uso', label: '1 Uso' },
                        { id: 'recurrentes', label: 'Personal' },
                        { id: 'coaccion', label: 'Coacción' },
                      ] as { id: AccessSubTab; label: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        role="tab"
                        aria-selected={accessSubTab === st.id}
                        onClick={() => setAccessSubTab(st.id)}
                        className={`py-1.5 rounded-sm font-label text-label-sm cursor-pointer transition-colors ${
                          accessSubTab === st.id
                            ? 'bg-surface-container-lowest text-primary shadow-sm'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* SUB-TAB 2A: PASES DE UN SOLO USO (QR + PIN + Link WhatsApp) */}
                  {accessSubTab === 'un-uso' && (
                    <>
                      <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <h2 className="font-title text-title-md text-on-surface">
                            Pase 1 solo uso (QR + PIN)
                          </h2>
                          <span className="font-mono text-mono-sm text-secondary bg-secondary-container px-2 py-0.5 rounded-sm">
                            Autodestruible
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(['visita', 'pedidosya', 'mercadolibre'] as PassTypeKey[]).map((key) => {
                            const active = passType === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => handleSelectPassType(key)}
                                className={`py-2 px-1.5 rounded font-label text-label-sm transition-colors cursor-pointer whitespace-nowrap ${
                                  active
                                    ? 'bg-primary text-on-primary'
                                    : 'bg-surface-container-low border border-outline-variant text-on-surface'
                                }`}
                              >
                                {PASS_TYPE_PRESETS[key].label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label htmlFor="guest-name" className="font-label text-label-sm text-on-surface-variant">
                              Visita / Delivery
                            </label>
                            <input
                              id="guest-name"
                              type="text"
                              value={guestName}
                              onChange={(e) => setGuestName(e.target.value)}
                              className="rounded border border-outline-variant bg-surface text-on-surface font-body text-body-sm py-1.5 px-2"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label htmlFor="guest-duration" className="font-label text-label-sm text-on-surface-variant">
                              Ventana de validez
                            </label>
                            <select
                              id="guest-duration"
                              value={guestDuration}
                              onChange={(e) => setGuestDuration(e.target.value)}
                              className="rounded border border-outline-variant bg-surface text-on-surface font-body text-body-sm py-1.5 px-2"
                            >
                              <option value="Hoy 20:00–21:30">Hoy 20:00 a 21:30</option>
                              <option value="1 uso · 30 min">30 min (1 uso)</option>
                              <option value="1 uso · 2 hs">2 horas (1 uso)</option>
                            </select>
                          </div>
                        </div>

                        {/* QR + Numeric PIN Preview */}
                        <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex items-center gap-3">
                          <div className="w-16 h-16 rounded bg-surface-container-lowest border border-outline-variant p-1.5 shrink-0">
                            <QrPreviewSvg seed={previewCode} />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-mono-md text-primary font-semibold">
                                PIN {previewPin}
                              </span>
                              <span className="font-mono text-mono-sm text-on-surface-variant">
                                {previewCode}
                              </span>
                            </div>
                            <span className="font-body text-body-sm text-on-surface-variant">
                              {previewSummary}
                            </span>
                            <span className="font-label text-label-sm text-success">
                              Se destruye tras 1er uso o al vencer
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSendWhatsAppQr}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded bg-primary text-on-primary hover:bg-primary-container transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                            share
                          </span>
                          <span className="font-label text-label-md">
                            Generar link WhatsApp (QR + PIN)
                          </span>
                        </button>
                      </section>

                      {/* Active & Destroyed Single-use Passes */}
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
                              <div className="flex items-center gap-1 shrink-0">
                                {pass.status === 'Activo' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setSharedPassPreview(pass)}
                                      className="px-2 py-1 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                                    >
                                      Link
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onRevokePass(pass.id);
                                        showFeedback(`Pase PIN ${pass.pin} revocado`);
                                      }}
                                      className="px-2 py-1 rounded border border-outline-variant font-label text-label-sm text-error hover:bg-error-container cursor-pointer"
                                    >
                                      Borrar
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}

                  {/* SUB-TAB 2B: PASES RECURRENTES (Limpieza, Paseadores, Horarios + Auditoría) */}
                  {accessSubTab === 'recurrentes' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-title text-title-md text-on-surface">
                          Personal y recurrentes
                        </h2>
                        <button
                          type="button"
                          onClick={() => setShowAddStaff((s) => !s)}
                          className="px-2.5 py-1.5 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                        >
                          {showAddStaff ? 'Cancelar' : '+ Nuevo perfil'}
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
                              placeholder="Nombre (ej. Sofía)"
                              className="rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-body text-body-sm"
                              required
                            />
                            <select
                              value={staffRole}
                              onChange={(e) => setStaffRole(e.target.value as RecurringPass['role'])}
                              className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                            >
                              <option value="Limpieza">Limpieza</option>
                              <option value="Paseador">Paseador</option>
                              <option value="Mantenimiento">Mantenimiento</option>
                              <option value="Cuidado">Cuidado</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="font-label text-label-sm text-on-surface-variant">
                              Días habilitados (bloqueo automático fuera de franja):
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
                            <input
                              type="time"
                              value={staffStart}
                              onChange={(e) => setStaffStart(e.target.value)}
                              className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-mono-sm"
                            />
                            <input
                              type="time"
                              value={staffEnd}
                              onChange={(e) => setStaffEnd(e.target.value)}
                              className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-mono-sm"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2 rounded bg-secondary text-on-secondary font-label text-label-md cursor-pointer"
                          >
                            Guardar perfil y generar PIN/RFID
                          </button>
                        </form>
                      )}

                      {recurringPasses.map((staff) => (
                        <article
                          key={staff.id}
                          className={`bg-surface-container-lowest border rounded-md p-3.5 flex flex-col gap-2.5 ${
                            staff.status === 'Revocado'
                              ? 'border-outline-variant opacity-60'
                              : 'border-outline-variant'
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
                                Días: {staff.days.join(' · ')} | {staff.startTime}–{staff.endTime} hs
                              </p>
                              <p className="font-mono text-mono-sm text-on-surface-variant">
                                PIN {staff.pin} · Tag {staff.rfidTag}
                              </p>
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
                                ? 'Eliminado'
                                : staff.currentlyInside
                                  ? 'En depto'
                                  : 'Habilitado'}
                            </span>
                          </div>

                          {/* Audit Log */}
                          <div className="p-2 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                            <span className="font-label text-label-sm text-on-surface-variant">
                              Auditoría silenciosa de jornadas:
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
                                onClick={() => {
                                  onToggleStaffShift(staff.id);
                                  showFeedback(
                                    staff.currentlyInside
                                      ? `Salida silenciosa registrada: ${staff.name}`
                                      : `Ingreso silencioso registrado: ${staff.name}`
                                  );
                                }}
                                className="py-1.5 px-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                              >
                                {staff.currentlyInside ? 'Registrar salida' : 'Simular ingreso'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onRevokeRecurringPass(staff.id);
                                  showFeedback(`Perfil de ${staff.name} eliminado al instante`);
                                }}
                                className="py-1.5 px-2 rounded bg-error-container text-on-error-container font-label text-label-sm cursor-pointer"
                              >
                                Revocar en 1 seg
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}

                  {/* SUB-TAB 2C: BOTÓN DE PÁNICO / COACCIÓN */}
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
                        Si un delincuente te obliga a abrir la puerta, invertí los últimos dos
                        dígitos de tu PIN. <strong>La puerta abre normalmente</strong> sin sonar
                        alarmas, pero dispara alerta silenciosa con audio/video a tus contactos y
                        seguridad.
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
                            PIN Coacción (invertido)
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
                              showFeedback(`PIN actualizado a ${pinDraft} (Coacción recalculado)`);
                            }
                          }}
                          className="px-3 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                        >
                          Cambiar PIN
                        </button>
                      </div>

                      <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                        <span className="font-label text-label-sm text-on-surface">
                          Contactos alertados con audio/video en vivo:
                        </span>
                        {BUILDING_INFO.emergencyContacts.map((contact) => (
                          <span key={contact} className="font-body text-body-sm text-on-surface-variant">
                            • {contact}
                          </span>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => onNavigateMain('portero-ia')}
                        className="w-full py-2.5 px-3 rounded bg-error text-on-error font-label text-label-md cursor-pointer"
                      >
                        Probar PIN {duressPin} en Pantalla Portero IA →
                      </button>
                    </section>
                  )}
                </>
              )}

              {/* TAB 3: PAQUETERÍA INTELIGENTE */}
              {activeTab === 'paquetes' && (
                <>
                  {/* Pre-authorize Expected Parcel Form */}
                  <form
                    onSubmit={handlePreAuthSubmit}
                    className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-title text-label-lg text-on-surface">
                        Pre-autorizar envío (Sin molestias)
                      </h2>
                      <span className="font-mono text-mono-sm text-primary bg-surface-variant px-2 py-0.5 rounded-sm">
                        OCR IA
                      </span>
                    </div>
                    <p className="font-body text-body-sm text-on-surface-variant">
                      Avisá qué esperás hoy. La IA leerá la etiqueta en cámara y abrirá solo la
                      primera puerta sin interrumpirte.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={preAuthCarrier}
                        onChange={(e) => setPreAuthCarrier(e.target.value)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                      >
                        <option value="Mercado Libre">Mercado Libre</option>
                        <option value="PedidosYa">PedidosYa</option>
                        <option value="DAC">DAC Agencia Central</option>
                        <option value="Correo Uruguayo">Correo Uruguayo</option>
                      </select>
                      <select
                        value={preAuthMode}
                        onChange={(e) => setPreAuthMode(e.target.value as ParcelStorageMode)}
                        className="rounded border border-outline-variant bg-surface px-2 py-1.5 font-body text-body-sm"
                      >
                        <option value="zaguan">Zona Zaguán</option>
                        <option value="locker">Locker Inteligente</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={preAuthDesc}
                      onChange={(e) => setPreAuthDesc(e.target.value)}
                      placeholder="Ej. Pedido Mercado Libre Full hoy..."
                      className="rounded border border-outline-variant bg-surface px-2.5 py-1.5 font-body text-body-sm"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container cursor-pointer"
                    >
                      Cargar &ldquo;Espero paquete hoy&rdquo;
                    </button>

                    {activeUnitPreAuth.length > 0 && (
                      <div className="pt-2 border-t border-outline-variant flex flex-col gap-1">
                        <span className="font-label text-label-sm text-secondary">
                          Esperados hoy (Apto {BUILDING_INFO.activeUnit}):
                        </span>
                        {activeUnitPreAuth.map((pa) => (
                          <div
                            key={pa.id}
                            className="flex items-center justify-between font-body text-body-sm text-on-surface"
                          >
                            <span className="truncate">
                              • {pa.carrier} ({pa.description})
                            </span>
                            <span className="font-mono text-mono-sm text-primary shrink-0">
                              {pa.storageMode === 'locker' ? 'Locker' : 'Zaguán'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </form>

                  {/* Spontaneous Parcel 20s Rule Setting */}
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-title text-label-lg text-on-surface">
                        Regla sin aviso (tras 20 seg)
                      </span>
                      <span className="font-mono text-mono-sm text-secondary">Doble exclusa</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <label className="flex items-start gap-2 p-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
                        <input
                          type="radio"
                          name="unannounced-rule"
                          checked={unannouncedRule === 'auto-zaguan'}
                          onChange={() => onChangeUnannouncedRule('auto-zaguan')}
                          className="mt-1 accent-primary"
                        />
                        <span className="font-body text-body-sm text-on-surface">
                          Si no contesto en 20s, <strong>dejar pasar al zaguán/locker</strong>{' '}
                          automáticamente con foto comprobante.
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
                          Si no contesto en 20s, no autorizar depósito.
                        </span>
                      </label>
                    </div>
                  </section>

                  {/* Primary Received Parcel with Visual Photo Proof */}
                  {primaryParcel && (
                    <article className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
                      <div className="relative">
                        <SmartImage
                          src={primaryParcel.imageUrl || ASSETS.parcelReception}
                          alt="Foto comprobante de paquete depositado"
                          className="w-full h-36 object-cover"
                          fallbackIcon="inventory_2"
                          fallbackLabel="Foto comprobante Zaguán"
                        />
                        <div className="absolute top-2.5 right-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-sm font-label text-label-sm ${
                              primaryParcel.status === 'Para retirar'
                                ? 'bg-warning-container text-on-warning-container'
                                : 'bg-success-container text-on-success-container'
                            }`}
                          >
                            {primaryParcel.status}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-title text-title-md text-on-surface">
                              {primaryParcel.carrier}
                            </h3>
                            <p className="font-body text-body-sm text-on-surface-variant">
                              {primaryParcel.receivedAt} · {primaryParcel.location}
                            </p>
                          </div>
                          <span className="font-mono text-mono-sm text-primary bg-surface-variant px-2 py-0.5 rounded-sm shrink-0">
                            {primaryParcel.code}
                          </span>
                        </div>

                        <p className="font-body text-body-sm text-on-surface-variant">
                          {primaryParcel.note}
                        </p>

                        {primaryParcel.authorizedPin && (
                          <div className="p-2 rounded bg-surface-container-low border border-outline-variant flex items-center justify-between">
                            <span className="font-label text-label-sm text-on-surface-variant">
                              PIN retiro tercero
                            </span>
                            <span className="font-mono text-mono-md text-primary font-semibold">
                              {primaryParcel.authorizedPin}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            disabled={primaryParcel.status === 'Retirado'}
                            onClick={() => handleConfirmParcelClick(primaryParcel)}
                            className={`py-2 px-2 rounded font-label text-label-sm ${
                              primaryParcel.status === 'Retirado'
                                ? 'bg-success-container text-on-success-container cursor-default'
                                : 'bg-primary text-on-primary cursor-pointer'
                            }`}
                          >
                            {primaryParcel.status === 'Retirado' ? 'Retirado ✓' : 'Confirmar retiro'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAuthorizeThirdParty(primaryParcel)}
                            className="py-2 px-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-secondary cursor-pointer"
                          >
                            PIN tercero
                          </button>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Parcel History */}
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
                        <span className="font-label text-label-sm px-2 py-0.5 rounded-sm bg-success-container text-on-success-container shrink-0">
                          {parcel.status}
                        </span>
                      </div>
                    ))}
                  </section>
                </>
              )}

              {/* TAB 4: CONSORCIO & COMUNICADOS OFICIALES */}
              {activeTab === 'consorcio' && (
                <>
                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="font-title text-title-md text-on-surface">
                        Comunicados Oficiales
                      </h2>
                      <span className="font-mono text-mono-sm text-primary">Cartelera sync</span>
                    </div>
                    <div className="divide-y divide-outline-variant">
                      {appNotices.map((n) => (
                        <div key={n.id} className="py-2.5 first:pt-0 last:pb-0 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-label text-label-md text-on-surface">
                              {n.title}
                            </span>
                            <span className="font-mono text-mono-sm text-secondary shrink-0">
                              {n.category}
                            </span>
                          </div>
                          <p className="font-body text-body-sm text-on-surface-variant">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="font-title text-title-md text-on-surface">
                        Documentación Ley 18.251
                      </h2>
                      <span className="font-mono text-mono-sm text-success bg-success-container px-2 py-0.5 rounded-sm">
                        Al día
                      </span>
                    </div>
                    <div className="divide-y divide-outline-variant">
                      {[
                        { label: 'Certificado BPS', code: 'BPS-2026-11' },
                        { label: 'Certificado Único DGI', code: 'DGI-884102' },
                        { label: 'Póliza Accidentes BSE', code: 'BSE-99214' },
                      ].map((doc) => (
                        <div key={doc.code} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-label text-label-md text-on-surface">
                            {doc.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => showFeedback(`${doc.label} (${doc.code}) validado`)}
                            className="font-mono text-mono-sm text-primary hover:underline cursor-pointer"
                          >
                            {doc.code}
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-3.5 flex flex-col gap-2.5">
                    <h2 className="font-title text-title-md text-on-surface">
                      Amenities · Barbacoa Piso 10
                    </h2>
                    <button
                      type="button"
                      onClick={handleBarbacoaClick}
                      className="w-full py-2.5 px-4 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
                    >
                      {barbacoaReserved
                        ? 'Barbacoa reservada hoy 20:00 hs ✓'
                        : 'Reservar Barbacoa hoy 20:00 hs'}
                    </button>
                  </section>
                </>
              )}
            </div>

            {/* Guest WhatsApp Shared Pass Preview Overlay */}
            {sharedPassPreview && (
              <div className="absolute inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-3">
                <div className="w-full bg-surface-container-lowest rounded-lg border border-outline-variant p-4 flex flex-col gap-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                        chat
                      </span>
                      <span className="font-title text-label-lg text-on-surface">
                        Vista del Link WhatsApp (Visita)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSharedPassPreview(null)}
                      aria-label="Cerrar vista previa"
                      className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </div>

                  <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                    <span className="font-label text-label-sm text-secondary">
                      INVITACIÓN DE {BUILDING_INFO.activeResident.toUpperCase()} · APTO{' '}
                      {BUILDING_INFO.activeUnit}
                    </span>
                    <span className="font-headline text-title-md text-on-surface">
                      {BUILDING_INFO.address}
                    </span>
                    <span className="font-body text-body-sm text-on-surface-variant">
                      Cómo llegar: Entre Libertad y 21 de Setiembre · Frente táctil Zaguán IA
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-32 h-32 p-2 rounded-md bg-white border border-outline-variant">
                      <QrPreviewSvg seed={sharedPassPreview.code} />
                    </div>
                    <span className="font-mono text-headline-sm text-primary font-bold tracking-widest">
                      PIN: {sharedPassPreview.pin}
                    </span>
                    <span className="font-label text-label-sm text-on-surface-variant text-center">
                      {sharedPassPreview.timeWindow || sharedPassPreview.validityLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-sm bg-warning-container text-on-warning-container font-label text-label-sm">
                      Caducidad automática · Se destruye al ingresar
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSharedPassPreview(null);
                        onNavigateMain('portero-ia');
                      }}
                      className="py-2 px-3 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                    >
                      Probar en Portero IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setSharedPassPreview(null)}
                      className="py-2 px-3 rounded bg-surface-container border border-outline-variant font-label text-label-sm text-on-surface cursor-pointer"
                    >
                      Cerrar
                    </button>
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
                  { id: 'accesos', label: 'Accesos', icon: 'key' },
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

        {/* Desktop Companion Panel */}
        <aside className="hidden lg:flex lg:col-span-7 flex-col gap-gutter-lg">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-headline-sm text-on-surface">
                  App Residente · Control en 2 toques
                </h2>
                <p className="font-body text-body-md text-on-surface-variant">
                  Todos los pases QR/PIN, horarios de personal, pre-autorizaciones de paquetes y
                  PIN de coacción funcionan en vivo con la pantalla del Portero IA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateMain('portero-ia')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary text-on-primary hover:bg-primary-container font-label text-label-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  record_voice_over
                </span>
                <span>Probar en Portero IA</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-outline-variant">
              {(
                [
                  { id: 'inicio', label: 'Inicio + BT/NFC', icon: 'home' },
                  { id: 'accesos', label: 'QR / Personal / SOS', icon: 'key' },
                  { id: 'paquetes', label: 'Paquetería IA', icon: 'inventory_2' },
                  { id: 'consorcio', label: 'Comunicados', icon: 'apartment' },
                ] as { id: ResidentTab; label: string; icon: string }[]
              ).map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => onChangeTab(screen.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded border font-label text-label-sm transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === screen.id
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container'
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

          {/* Live Relays & Credentials Telemetry */}
          <div className="grid grid-cols-3 gap-gutter-md">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
              <span className="font-label text-label-sm text-on-surface-variant">
                Doble Exclusa PB
              </span>
              <span
                className={`font-headline text-title-lg tabular-nums ${
                  door2Countdown > 0 || door1Countdown > 0 ? 'text-success' : 'text-on-surface'
                }`}
              >
                {door2Countdown > 0
                  ? `Completa (${door2Countdown}s)`
                  : door1Countdown > 0
                    ? `Solo Zaguán (${door1Countdown}s)`
                    : 'Bloqueada'}
              </span>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                BT/NFC + Relé IP
              </span>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
              <span className="font-label text-label-sm text-on-surface-variant">
                PIN Personal / Coacción
              </span>
              <span className="font-headline text-title-lg text-primary tabular-nums">
                {residentPin} / <span className="text-error">{duressPin}</span>
              </span>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                Alerta silenciosa activa
              </span>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
              <span className="font-label text-label-sm text-on-surface-variant">
                Accesos y Envíos
              </span>
              <span className="font-headline text-title-lg text-on-surface tabular-nums">
                {passes.filter((p) => p.status === 'Activo').length} 1-uso ·{' '}
                {recurringPasses.filter((r) => r.status === 'Activo').length} rec.
              </span>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                {activeUnitPreAuth.length} pre-aut · {pendingParcels.length} paq.
              </span>
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
                  Sincronizado entre App Residente, Portero IA y Panel Administración
                </p>
              </div>
              <span className="font-mono text-mono-sm text-secondary">AUDIO / OCR / RFID</span>
            </div>

            <div className="divide-y divide-outline-variant max-h-[340px] overflow-y-auto">
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
