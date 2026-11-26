import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { ASSETS, BUILDING_INFO } from '../data/zaguanData';
import { buildAkuvoxRtspUrl } from '../services/akuvoxService';
import {
  askLuciaGeminiFallback,
  getLuciaActiveVoiceLabel,
  LuciaClipCategory,
  pickLuciaClip,
  playIntercomChime,
  playLuciaClipFile,
  speakGeminiFallbackReply,
  stopLuciaSpeech,
  unlockLuciaAudio,
} from '../services/luciaVoiceService';
import { ParcelValidationDecision } from '../services/parcelVisionService';
import {
  getSavedDoorbellChannel,
  saveDoorbellChannel,
  sendRemoteDoorbellRing,
  subscribeToRemoteDoorbellResponses,
} from '../services/remoteDoorbellBridge';
import {
  AkuvoxConfig,
  AkuvoxLogEntry,
  BuildingNotice,
  DayOfWeek,
  IntercomHardwareModel,
  MainScreen,
  MasterKeyRecord,
  ParcelStorageMode,
  PendingSpontaneousParcel,
  PendingVisitRequest,
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  UnannouncedParcelRule,
} from '../types/zaguan';
import { SmartImage } from './BrandMark';

type IntercomMode = 'reposo' | 'ia-voz' | 'mayores' | 'teclado' | 'ocr-paquete';

interface ChatBubble {
  id: string;
  sender: 'ia' | 'visitante';
  text: string;
  time: string;
}

interface PorteroIaViewProps {
  hardwareModel: IntercomHardwareModel;
  onChangeHardwareModel: (model: IntercomHardwareModel) => void;
  akuvoxConfig: AkuvoxConfig;
  akuvoxLogs: AkuvoxLogEntry[];
  liveSnapshotUrl: string | null;
  notices: BuildingNotice[];
  passes: QrPass[];
  recurringPasses: RecurringPass[];
  masterKeys: MasterKeyRecord[];
  preAuthParcels: PreAuthorizedParcel[];
  storageMode: ParcelStorageMode;
  onChangeStorageMode: (mode: ParcelStorageMode) => void;
  unannouncedRule: UnannouncedParcelRule;
  pendingVisit: PendingVisitRequest | null;
  pendingSpontaneous: PendingSpontaneousParcel | null;
  residentPin: string;
  duressPin: string;
  door1Countdown: number;
  door2Countdown: number;
  lockerOpenLabel: string | null;
  onRequestVisitApproval: (
    visitorName: string,
    residentName: string,
    unit: string,
    transcript: string
  ) => void;
  onRespondVisit: (approved: boolean) => void;
  onCompletePreAuthParcel: (preAuthId: string, storageMode: ParcelStorageMode) => void;
  onValidateParcelVisionFrame: (params: {
    imageBase64?: string;
    mimeType?: string;
    previewPhotoUrl?: string;
    simulatedLabelText?: string;
  }) => Promise<ParcelValidationDecision>;
  onStartSpontaneousParcel: (carrier: string, unit: string, storageMode: ParcelStorageMode) => void;
  onRespondSpontaneousParcel: (action: 'authorize' | 'reject' | 'timeout-auto') => void;
  onValidatePinOrQr: (
    code: string,
    simDay: DayOfWeek,
    simHour: string
  ) => {
    ok: boolean;
    message: string;
    silentDuress?: boolean;
  };
  onAkuvoxBleUnlock: () => void;
  onTriggerLoitering: (isLateNight: boolean, dwellSeconds: number) => void;
  onLogAkuvoxProtocol: (
    direction: AkuvoxLogEntry['direction'],
    endpoint: string,
    detail: string,
    status?: AkuvoxLogEntry['status']
  ) => void;
  onNavigate: (screen: MainScreen) => void;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  L: 'Lun',
  M: 'Mar',
  X: 'Mié',
  J: 'Jue',
  V: 'Vie',
  S: 'Sáb',
  D: 'Dom',
};

export function PorteroIaView({
  hardwareModel,
  onChangeHardwareModel,
  akuvoxConfig,
  akuvoxLogs,
  liveSnapshotUrl,
  notices,
  passes,
  recurringPasses,
  masterKeys,
  preAuthParcels,
  storageMode,
  onChangeStorageMode,
  unannouncedRule,
  pendingVisit,
  pendingSpontaneous,
  residentPin,
  duressPin,
  door1Countdown,
  door2Countdown,
  lockerOpenLabel,
  onRequestVisitApproval,
  onRespondVisit,
  onCompletePreAuthParcel,
  onValidateParcelVisionFrame,
  onStartSpontaneousParcel,
  onRespondSpontaneousParcel,
  onValidatePinOrQr,
  onAkuvoxBleUnlock,
  onTriggerLoitering,
  onLogAkuvoxProtocol,
  onNavigate,
}: PorteroIaViewProps) {
  const [mode, setMode] = useState<IntercomMode>('reposo');
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState(true);
  const [luciaVoiceLabel, setLuciaVoiceLabel] = useState(() => getLuciaActiveVoiceLabel());
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [doorbellChannel, setDoorbellChannel] = useState(() => getSavedDoorbellChannel());
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remoteRingStatus, setRemoteRingStatus] = useState<string | null>(null);
  const [quickCallUnit, setQuickCallUnit] = useState<'4B' | '3A'>('4B');
  const [spokenInput, setSpokenInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatBubble[]>([]);
  const [elderlyStep, setElderlyStep] = useState<'menu' | 'qr' | 'doc' | 'done'>('menu');
  const [elderlyDoc, setElderlyDoc] = useState('');
  const voiceEnabledRef = useRef(true);
  voiceEnabledRef.current = voiceAudioEnabled;
  const activeRecognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const noAnswerTimerRef = useRef<number | null>(null);
  const pendingPackageCarrierRef = useRef<string | null>(null);
  const liveTranscriptRef = useRef('');
  const micCommittedRef = useRef(false);

  // Keypad / QR / RFID & Schedule simulator
  const [pinInput, setPinInput] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [simScheduleSlot, setSimScheduleSlot] = useState<'allowed' | 'blocked'>('allowed');

  // OCR pre-auth parcel step + Multimodal Vision frame analysis
  const [matchedPreAuth, setMatchedPreAuth] = useState<PreAuthorizedParcel | null>(null);
  const [ocrPhase, setOcrPhase] = useState<'awaiting-label' | 'scanning' | 'deposited'>(
    'awaiting-label'
  );
  const [visionScanning, setVisionScanning] = useState(false);
  const [lastVisionDecision, setLastVisionDecision] = useState<ParcelValidationDecision | null>(
    null
  );

  // Loitering detector state
  const [loiteringActive, setLoiteringActive] = useState(false);
  const [loiteringSeconds, setLoiteringSeconds] = useState(0);
  const [loiteringLateNight, setLoiteringLateNight] = useState(true);
  const [loiteringReported, setLoiteringReported] = useState(false);

  // Rotating notice index on kiosk idle screen
  const intercomNotices = notices.filter((n) => n.showOnIntercom);
  const [noticeIdx, setNoticeIdx] = useState(0);

  useEffect(() => {
    if (intercomNotices.length <= 1) return;
    const t = setInterval(() => {
      setNoticeIdx((i) => (i + 1) % intercomNotices.length);
    }, 5500);
    return () => clearInterval(t);
  }, [intercomNotices.length]);

  useEffect(() => {
    if (!loiteringActive) return;
    const t = setInterval(() => {
      setLoiteringSeconds((prev) => {
        const next = prev + 5;
        if (next >= 45 && !loiteringReported) {
          setLoiteringReported(true);
          onTriggerLoitering(loiteringLateNight, next);
          if (hardwareModel === 'akuvox-e12w') {
            onLogAkuvoxProtocol(
              'rtsp',
              buildAkuvoxRtspUrl(akuvoxConfig),
              `Merodeo detectado por visión IA (${next}s) · Clip guardado`,
              akuvoxConfig.enabled ? 'ok' : 'simulated'
            );
          }
        }
        return next;
      });
    }, 650);
    return () => clearInterval(t);
  }, [
    loiteringActive,
    loiteringLateNight,
    loiteringReported,
    onTriggerLoitering,
    hardwareModel,
    akuvoxConfig,
    onLogAkuvoxProtocol,
  ]);

  const nowTime = () =>
    new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

  const playRecordedCategory = (category: LuciaClipCategory): string => {
    const clip = pickLuciaClip(category);
    if (voiceEnabledRef.current) {
      void playLuciaClipFile(clip.file, (info) => {
        setLuciaVoiceLabel(info.label);
      });
    }
    return clip.text;
  };

  const clearNoAnswerTimer = () => {
    if (noAnswerTimerRef.current !== null) {
      window.clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
  };

  const armNoAnswerTimer = (unit: string) => {
    clearNoAnswerTimer();
    noAnswerTimerRef.current = window.setTimeout(() => {
      const text = playRecordedCategory('no-answer');
      setChatLog((prev) => [
        ...prev,
        { id: `noans-${Date.now()}`, sender: 'ia', text: `${text} (Apto ${unit})`, time: nowTime() },
      ]);
      setRemoteRingStatus(`Sin respuesta del celular en 25s (Apto ${unit})`);
    }, 25000);
  };

  useEffect(() => {
    const unsubscribe = subscribeToRemoteDoorbellResponses(
      doorbellChannel,
      (resp) => {
        clearNoAnswerTimer();
        if (resp.action === 'approve' || resp.action === 'approve_package') {
          const isPkg = resp.action === 'approve_package';
          if (isPkg) {
            onRespondSpontaneousParcel('authorize');
          } else {
            onRespondVisit(true);
          }
          const spoken = playRecordedCategory(isPkg ? 'package-approved' : 'visit-approved');
          setChatLog((prev) => [
            ...prev,
            { id: `remote-${Date.now()}`, sender: 'ia', text: `${spoken} (Apto ${resp.unit})`, time: nowTime() },
          ]);
          setRemoteRingStatus(
            isPkg
              ? `Celular aceptó paquete (Apto ${resp.unit}) → Hall/Zaguán abierto`
              : `Celular aprobó ingreso (Apto ${resp.unit}) → Puerta abierta`
          );
        } else if (resp.action === 'reject' || resp.action === 'reject_package') {
          const isPkg = resp.action === 'reject_package';
          if (isPkg) {
            onRespondSpontaneousParcel('reject');
          } else {
            onRespondVisit(false);
          }
          const spoken = playRecordedCategory(isPkg ? 'package-rejected' : 'visit-rejected');
          setChatLog((prev) => [
            ...prev,
            { id: `remote-${Date.now()}`, sender: 'ia', text: `${spoken} (Apto ${resp.unit})`, time: nowTime() },
          ]);
          setRemoteRingStatus(
            isPkg
              ? `Celular rechazó el paquete (Apto ${resp.unit})`
              : `Celular rechazó el ingreso (Apto ${resp.unit})`
          );
        } else if (resp.action === 'talk' && resp.message) {
          playRecordedCategory('connecting-resident');
          const msg = `Del ${resp.unit} te dicen: ${resp.message}`;
          setChatLog((prev) => [
            ...prev,
            { id: `remote-talk-${Date.now()}`, sender: 'ia', text: msg, time: nowTime() },
          ]);
          setRemoteRingStatus(`Mensaje recibido desde el celular (${resp.unit})`);
          if (voiceEnabledRef.current) {
            playIntercomChime();
          }
        }
      },
      (connected) => setRemoteConnected(connected)
    );
    return () => {
      clearNoAnswerTimer();
      unsubscribe();
      stopLuciaSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorbellChannel]);

  const dispatchRingToAndroidPhone = async (params: {
    kind: 'visit' | 'package';
    visitorName: string;
    residentName: string;
    unit: string;
    carrier?: string;
    transcript: string;
  }) => {
    const label = params.kind === 'package' ? `paquete (${params.carrier || 'Entrega'})` : 'timbre';
    setRemoteRingStatus(`Enviando aviso de ${label} al celular (canal ${doorbellChannel} · Apto ${params.unit})...`);
    const result = await sendRemoteDoorbellRing(doorbellChannel, {
      id: `call-${Date.now()}`,
      kind: params.kind,
      unit: params.unit,
      visitorName: params.visitorName,
      residentName: params.residentName,
      carrier: params.carrier,
      transcript: params.transcript,
      buildingName: BUILDING_INFO.name,
      conciergeName: 'LucIA',
      timestampIso: new Date().toISOString(),
    });
    if (result.ok) {
      setRemoteRingStatus(
        params.kind === 'package'
          ? `📦 ¡Notificación de paquete enviada al celular! (Apto ${params.unit})`
          : `🔔 ¡Notificación enviada al celular! (Canal ${doorbellChannel} · Apto ${params.unit})`
      );
      onLogAkuvoxProtocol(
        'outbound',
        `PUSH /${result.topic}`,
        params.kind === 'package'
          ? `LucIA notificó paquete (${params.carrier}) al celular Android (Apto ${params.unit})`
          : `LucIA envió timbre real al celular Android (Apto ${params.unit} · ${params.visitorName})`,
        'ok'
      );
    } else {
      setRemoteRingStatus(`Error enviando al celular: ${result.error}`);
    }
  };

  const commitMicTranscript = () => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (micCommittedRef.current) return;
    const text = liveTranscriptRef.current.trim();
    liveTranscriptRef.current = '';
    try {
      activeRecognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    activeRecognitionRef.current = null;
    setIsListeningMic(false);
    if (text) {
      micCommittedRef.current = true;
      setSpokenInput('');
      processNaturalUtterance(text);
    }
  };

  const startBrowserMicrophone = () => {
    if (typeof window === 'undefined') return;
    unlockLuciaAudio();

    // Si ya estaba escuchando, enviar de inmediato lo que captó sin esperar silencio
    if (isListeningMic) {
      commitMicTranscript();
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setRemoteRingStatus('Tu navegador no soporta dictado por micrófono (usá Chrome o Edge).');
      return;
    }

    try {
      stopLuciaSpeech();
      liveTranscriptRef.current = '';
      micCommittedRef.current = false;

      const rec = new SpeechRec() as {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        maxAlternatives: number;
        onstart: (() => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        onresult: ((e: {
          results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
        }) => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
      rec.lang = 'es-UY';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      activeRecognitionRef.current = rec;

      rec.onstart = () => setIsListeningMic(true);
      rec.onend = () => {
        if (!micCommittedRef.current && liveTranscriptRef.current.trim()) {
          commitMicTranscript();
        } else {
          setIsListeningMic(false);
        }
      };
      rec.onerror = () => {
        if (silenceTimerRef.current !== null) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setIsListeningMic(false);
      };
      rec.onresult = (event) => {
        let combined = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          combined += item[0]?.transcript || '';
        }
        const clean = combined.trim();
        if (!clean) return;
        liveTranscriptRef.current = clean;
        setSpokenInput(clean);

        if (silenceTimerRef.current !== null) {
          window.clearTimeout(silenceTimerRef.current);
        }
        // Esperar 2 segundos de silencio tras terminar de hablar antes de responder (para no interrumpir)
        silenceTimerRef.current = window.setTimeout(() => {
          commitMicTranscript();
        }, 2000);
      };
      rec.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  const pushBubble = (sender: 'ia' | 'visitante', text: string, audioCategory?: LuciaClipCategory) => {
    setChatLog((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random()}`, sender, text, time: nowTime() },
    ]);
    if (sender === 'ia' && audioCategory) {
      playRecordedCategory(audioCategory);
    }
  };

  const startAiCall = () => {
    unlockLuciaAudio();
    setMode('ia-voz');
    setMatchedPreAuth(null);
    if (hardwareModel === 'akuvox-e12w') {
      onLogAkuvoxProtocol(
        'sip',
        `SIP INVITE sip:lucia@${akuvoxConfig.sipServerIp} (G.722 + AEC)`,
        'Botón físico E12W presionado → Audio local LucIA (100% grabado, sin Gemini)',
        akuvoxConfig.enabled ? 'ok' : 'simulated'
      );
    }
    const greeting = playRecordedCategory('greeting');
    setChatLog([
      {
        id: `msg-greet-${Date.now()}`,
        sender: 'ia',
        text: greeting,
        time: nowTime(),
      },
    ]);
  };

  const KNOWN_BUILDING_UNITS = ['1A', '2B', '3A', '4B', '402', '501'];

  const processNaturalUtterance = (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    if (mode !== 'ia-voz') {
      setMode('ia-voz');
    }

    pushBubble('visitante', text);
    const lower = text.toLowerCase();

    // 0. Emergencias (Bomberos / Ambulancia / Policía) → audio local inmediato + alerta urgente
    if (
      lower.includes('emergencia') ||
      lower.includes('ambulancia') ||
      lower.includes('bomberos') ||
      lower.includes('policía') ||
      lower.includes('policia') ||
      lower.includes('urgencia') ||
      lower.includes('médico') ||
      lower.includes('medico')
    ) {
      const emText = playRecordedCategory('emergency');
      pushBubble('ia', emText);
      void dispatchRingToAndroidPhone({
        kind: 'visit',
        visitorName: 'URGENCIA / EMERGENCIA',
        residentName: 'Administración y Residente',
        unit: BUILDING_INFO.activeUnit,
        transcript: text,
      });
      return;
    }

    // 0.5 Despedida / agradecimiento del visitante → despedida institucional Zaguán
    if (
      lower.includes('chau') ||
      lower.includes('chao') ||
      lower.includes('hasta luego') ||
      lower.includes('nos vemos') ||
      lower.includes('adiós') ||
      lower.includes('adios') ||
      lower === 'gracias' ||
      lower === 'muchas gracias'
    ) {
      const byeText = playRecordedCategory('farewell');
      pushBubble('ia', byeText);
      return;
    }

    // 1. Código numérico de 4 dígitos (dictado por voz)
    const voicePinMatch = text.match(/(?:c[oó]digo|pin|clave|n[uú]mero)?\s*\b(\d{4})\b/i);
    if (
      voicePinMatch &&
      (lower.includes('código') ||
        lower.includes('codigo') ||
        lower.includes('pin') ||
        lower.includes('clave') ||
        /^\d{4}$/.test(text))
    ) {
      const spokenCode = voicePinMatch[1];
      const simDay: DayOfWeek = simScheduleSlot === 'allowed' ? 'M' : 'L';
      const simHour = simScheduleSlot === 'allowed' ? '09:30' : '19:00';
      const res = onValidatePinOrQr(spokenCode, simDay, simHour);
      const isScheduleBlocked =
        !res.ok &&
        (res.message.toLowerCase().includes('horario') ||
          res.message.toLowerCase().includes('franja') ||
          res.message.toLowerCase().includes('día'));
      pushBubble(
        'ia',
        res.message,
        res.ok ? 'code-valid' : isScheduleBlocked ? 'outside-schedule' : 'code-invalid'
      );
      setPinFeedback({ ok: res.ok, text: res.message });
      return;
    }

    // 2. Instrucción de QR / etiqueta en cámara
    if (lower.includes('qr') || lower.includes('etiqueta') || lower.includes('cámara') || lower.includes('camara')) {
      const camText = playRecordedCategory('show-camera');
      pushBubble('ia', camText);
      return;
    }

    // 3. Proveedores / técnicos del edificio (UTE, OSE, Antel, ascensores, mantenimiento)
    if (
      lower.includes('ute') ||
      lower.includes('ose') ||
      lower.includes('antel') ||
      lower.includes('ascensor') ||
      lower.includes('técnico') ||
      lower.includes('tecnico') ||
      lower.includes('sanitaria') ||
      lower.includes('electricista') ||
      lower.includes('mantenimiento')
    ) {
      const provText = playRecordedCategory('provider-help');
      pushBubble('ia', provText);
      return;
    }

    // 4. Paquetes / entregas (si no dijo apartamento, preguntar con `package-ask-unit-1.m4a`)
    const isParcel =
      Boolean(pendingPackageCarrierRef.current) ||
      lower.includes('paquete') ||
      lower.includes('entrega') ||
      lower.includes('mercado libre') ||
      lower.includes('mercadolibre') ||
      lower.includes('pedidosya') ||
      lower.includes('pedidos ya') ||
      lower.includes('correo') ||
      lower.includes('dac') ||
      lower.includes('repartidor') ||
      lower.includes('envío') ||
      lower.includes('envio');

    const unitMatch = text.match(/\b([1-9][a-dA-D]|[1-9]\d{2})\b/);

    if (isParcel) {
      const detectedCarrier =
        (lower.includes('pedidos')
          ? 'PedidosYa'
          : lower.includes('mercado')
            ? 'Mercado Libre'
            : lower.includes('dac')
              ? 'DAC'
              : lower.includes('correo')
                ? 'Correo Uruguayo'
                : pendingPackageCarrierRef.current || 'Paquetería');

      const hasResidentName =
        lower.includes('martín') ||
        lower.includes('martin') ||
        lower.includes('carolina') ||
        lower.includes('roberto');

      if (!unitMatch && !hasResidentName) {
        pendingPackageCarrierRef.current = detectedCarrier;
        const askPkgUnit = playRecordedCategory('package-ask-unit');
        pushBubble('ia', askPkgUnit);
        return;
      }

      pendingPackageCarrierRef.current = null;
      const rawUnit = unitMatch
        ? unitMatch[1].toUpperCase()
        : lower.includes('carolina')
          ? '3A'
          : BUILDING_INFO.activeUnit;

      if (unitMatch && !KNOWN_BUILDING_UNITS.includes(rawUnit)) {
        const notFound = playRecordedCategory('unit-not-found');
        pushBubble('ia', `${notFound} (${rawUnit})`);
        return;
      }

      const unit = rawUnit === '402' ? '4B' : rawUnit;
      const residentName = unit === '3A' ? 'Carolina' : 'Martín';
      const foundPreAuth = preAuthParcels.find(
        (p) =>
          p.status === 'Esperando' &&
          (p.unit.toUpperCase() === unit || lower.includes(p.carrier.toLowerCase()))
      );
      const carrier = foundPreAuth?.carrier || detectedCarrier;

      // SIEMPRE notificar al celular del residente para confirmar si recibe el paquete o no
      const clipText = playRecordedCategory('package');
      pushBubble('ia', `${clipText} (${carrier} · Apto ${unit})`);

      if (hardwareModel === 'akuvox-e12w') {
        onLogAkuvoxProtocol(
          'rtsp',
          `GET http://${akuvoxConfig.deviceIp}:8080/picture.jpg`,
          `Snapshot 1080p enviado al celular por paquete (${carrier} · Apto ${unit})`,
          akuvoxConfig.enabled ? 'ok' : 'simulated'
        );
      }

      if (foundPreAuth) {
        setMatchedPreAuth(foundPreAuth);
        setOcrPhase('awaiting-label');
        setMode('ocr-paquete');
      }
      onStartSpontaneousParcel(carrier, unit, storageMode);
      armNoAnswerTimer(unit);
      void dispatchRingToAndroidPhone({
        kind: 'package',
        visitorName: `Repartidor ${carrier}`,
        residentName,
        unit,
        carrier,
        transcript: text,
      });
      return;
    }

    // 5. Visita a apartamento / residente registrado
    const hasResidentHint =
      Boolean(unitMatch) ||
      lower.includes('martín') ||
      lower.includes('martin') ||
      lower.includes('carolina') ||
      lower.includes('roberto');

    if (hasResidentHint) {
      const rawUnit = unitMatch
        ? unitMatch[1].toUpperCase()
        : lower.includes('carolina')
          ? '3A'
          : BUILDING_INFO.activeUnit;

      if (unitMatch && !KNOWN_BUILDING_UNITS.includes(rawUnit)) {
        const notFound = playRecordedCategory('unit-not-found');
        pushBubble('ia', `${notFound} (${rawUnit})`);
        return;
      }

      const unit = rawUnit === '402' ? '4B' : rawUnit;
      const soyMatch = text.match(/soy\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+)/i);
      const visitorName = soyMatch ? soyMatch[1] : 'Simón';

      const verMatch = text.match(/(?:ver a|para|busco a)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+)/i);
      const defaultResident = unit === '3A' ? 'Carolina' : 'Martín';
      const residentName = verMatch ? verMatch[1] : defaultResident;

      const clipText = playRecordedCategory('visit');
      pushBubble('ia', `${clipText} (${residentName} · Apto ${unit})`);
      if (hardwareModel === 'akuvox-e12w') {
        onLogAkuvoxProtocol(
          'rtsp',
          `GET http://${akuvoxConfig.deviceIp}:8080/picture.jpg`,
          `Foto en vivo enviada por Push/App a ${residentName} (${unit})`,
          akuvoxConfig.enabled ? 'ok' : 'simulated'
        );
      }
      onRequestVisitApproval(visitorName, residentName, unit, text);
      armNoAnswerTimer(unit);
      void dispatchRingToAndroidPhone({
        kind: 'visit',
        visitorName,
        residentName,
        unit,
        transcript: text,
      });
      return;
    }

    // 6. FALLBACK INTELIGENTE A GEMINI: solo si ninguna regla local / de los 31 audios pudo resolver
    setRemoteRingStatus('Consulta fuera de guion → escalando a Gemini Fallback...');
    void (async () => {
      const fb = await askLuciaGeminiFallback({
        utterance: text,
        buildingName: BUILDING_INFO.name,
        knownUnits: KNOWN_BUILDING_UNITS,
      });

      if (fb.clipCategory !== 'none') {
        const recorded = playRecordedCategory(fb.clipCategory);
        pushBubble('ia', recorded);
        setRemoteRingStatus(
          fb.usedGemini
            ? `Gemini clasificó → clip local (${fb.clipCategory})`
            : `Sin API Gemini → clip local (${fb.clipCategory})`
        );
      } else {
        pushBubble('ia', fb.replyText);
        setRemoteRingStatus('Gemini respondió consulta personalizada');
        if (voiceEnabledRef.current) {
          await speakGeminiFallbackReply(fb.replyText, (info) => setLuciaVoiceLabel(info.label));
        }
      }
    })();
  };

  const handleUtteranceSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!spokenInput.trim()) return;
    processNaturalUtterance(spokenInput);
    setSpokenInput('');
  };

  const handleKeypadSubmit = (
    codeOverride?: string,
    via?: 'qr-camera' | 'rfid' | 'wiegand'
  ) => {
    const code = (codeOverride ?? pinInput).trim();
    if (!code) return;
    const simDay: DayOfWeek = simScheduleSlot === 'allowed' ? 'M' : 'L';
    const simHour = simScheduleSlot === 'allowed' ? '09:30' : '19:00';

    if (hardwareModel === 'akuvox-e12w') {
      if (via === 'qr-camera') {
        onLogAkuvoxProtocol(
          'inbound',
          `GET /api/akuvox/webhook/qr?codeKey=${code}&deviceId=e12w`,
          'Cámara Akuvox E12W leyó código QR → validación Third-Party',
          akuvoxConfig.enabled ? 'ok' : 'simulated'
        );
      } else if (via === 'rfid') {
        onLogAkuvoxProtocol(
          'inbound',
          `GET /api/akuvox/webhook/action?event=rfid_scan&card=${code}`,
          'Lector RFID 13.56MHz E12W detectó tarjeta/tag Mifare',
          akuvoxConfig.enabled ? 'ok' : 'simulated'
        );
      }
    }

    const res = onValidatePinOrQr(code, simDay, simHour);
    setPinFeedback({ ok: res.ok, text: res.message });
    const isScheduleBlocked =
      !res.ok &&
      (res.message.toLowerCase().includes('horario') ||
        res.message.toLowerCase().includes('franja') ||
        res.message.toLowerCase().includes('día'));
    playRecordedCategory(
      res.ok ? 'code-valid' : isScheduleBlocked ? 'outside-schedule' : 'code-invalid'
    );
    if (!codeOverride) setPinInput('');
  };

  const handleRunOcrScan = () => {
    if (!matchedPreAuth) return;
    setOcrPhase('scanning');
    if (hardwareModel === 'akuvox-e12w') {
      onLogAkuvoxProtocol(
        'rtsp',
        `POST /api/packages/validate-frame (Snapshot E12W → OCR Local)`,
        `Leyendo etiqueta ${matchedPreAuth.carrier} · Apto ${matchedPreAuth.unit}`,
        akuvoxConfig.enabled ? 'ok' : 'simulated'
      );
    }
    setTimeout(() => {
      setOcrPhase('deposited');
      onCompletePreAuthParcel(matchedPreAuth.id, storageMode);
      playRecordedCategory('package-approved');
    }, 850);
  };

  const runMultimodalFrameScan = async (params: {
    imageBase64?: string;
    mimeType?: string;
    previewPhotoUrl?: string;
    simulatedLabelText?: string;
  }) => {
    setVisionScanning(true);
    onLogAkuvoxProtocol(
      'rtsp',
      'POST /api/packages/validate-frame (Akuvox E12W → OCR)',
      params.imageBase64
        ? 'Analizando foto de etiqueta'
        : `Analizando etiqueta: "${params.simulatedLabelText}"`,
      akuvoxConfig.enabled ? 'ok' : 'simulated'
    );
    const decision = await onValidateParcelVisionFrame(params);
    setLastVisionDecision(decision);
    setVisionScanning(false);
    const detectedUnit = decision.extraction.unitNumber || BUILDING_INFO.activeUnit;
    const detectedCarrier = decision.extraction.carrier || 'Paquetería';
    const detectedResident = decision.extraction.recipientName || (detectedUnit === '3A' ? 'Carolina' : 'Martín');
    const shortReply = playRecordedCategory('package');
    pushBubble('ia', `${shortReply} (${detectedCarrier} · Apto ${detectedUnit})`);
    void dispatchRingToAndroidPhone({
      kind: 'package',
      visitorName: `Repartidor ${detectedCarrier}`,
      residentName: detectedResident,
      unit: detectedUnit,
      carrier: detectedCarrier,
      transcript: `Etiqueta detectada: ${detectedCarrier} para ${detectedResident} (${detectedUnit})`,
    });
  };

  const handleLabelFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      void runMultimodalFrameScan({
        imageBase64: dataUrl,
        mimeType: file.type || 'image/jpeg',
        previewPhotoUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const activeNotice = intercomNotices[noticeIdx] ?? intercomNotices[0];
  const activePasses = passes.filter((p) => p.status === 'Activo');
  const activeStaff = recurringPasses.filter((r) => r.status === 'Activo');
  const activeMaster = masterKeys.filter((m) => m.status === 'Activa' || m.status === 'En edificio');
  const waitingPreAuth = preAuthParcels.filter((p) => p.status === 'Esperando');
  const cameraImage = liveSnapshotUrl || (mode === 'ocr-paquete' ? ASSETS.parcelReception : ASSETS.lobbyCamera);

  return (
    <main className="flex-1 bg-surface-container-low py-8">
      <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-lg">
        {/* Top Hardware & Mode Selector Bar */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-success-container text-on-success-container font-label text-label-sm">
                <span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
                {hardwareModel === 'akuvox-e12w'
                  ? `Akuvox E12W · ${akuvoxConfig.enabled ? `LAN ${akuvoxConfig.deviceIp}` : 'Simulación + Puente Real'}`
                  : `Kiosco Táctil 10" · ${BUILDING_INFO.name}`}
              </span>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                {hardwareModel === 'akuvox-e12w'
                  ? '1 Botón · 2MP 1080p · RFID 13.56MHz · BLE 5.0 · 1 Relé · SIP/ONVIF'
                  : 'Pantalla Táctil 10" · Cámara ColorVu + OCR'}
              </span>
            </div>
            <h1 className="font-headline text-headline-md text-on-surface">
              {hardwareModel === 'akuvox-e12w'
                ? 'LucIA · Portera Virtual Uruguaya sobre Akuvox E12W'
                : 'LucIA · Kiosco Táctil 10" y Paquetería Inteligente'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Hardware Model Toggle */}
            <div
              role="group"
              aria-label="Modelo de hardware en la entrada"
              className="inline-flex p-1 rounded bg-surface-container border border-outline-variant gap-1"
            >
              <button
                type="button"
                onClick={() => onChangeHardwareModel('akuvox-e12w')}
                className={`px-3 py-1.5 rounded-sm font-label text-label-sm cursor-pointer transition-colors ${
                  hardwareModel === 'akuvox-e12w'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Akuvox E12W (Real)
              </button>
              <button
                type="button"
                onClick={() => onChangeHardwareModel('kiosco-10')}
                className={`px-3 py-1.5 rounded-sm font-label text-label-sm cursor-pointer transition-colors ${
                  hardwareModel === 'kiosco-10'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Pantalla Táctil 10&quot;
              </button>
            </div>

            {/* Storage mode switch */}
            <div
              role="group"
              aria-label="Modo físico de paquetería"
              className="inline-flex p-1 rounded bg-surface-container border border-outline-variant gap-1"
            >
              <button
                type="button"
                onClick={() => onChangeStorageMode('zaguan')}
                className={`px-2.5 py-1.5 rounded-sm font-label text-label-sm cursor-pointer transition-colors ${
                  storageMode === 'zaguan'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Zaguán
              </button>
              <button
                type="button"
                onClick={() => onChangeStorageMode('locker')}
                className={`px-2.5 py-1.5 rounded-sm font-label text-label-sm cursor-pointer transition-colors ${
                  storageMode === 'locker'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Lockers
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setVoiceAudioEnabled((prev) => {
                  const next = !prev;
                  if (!next) stopLuciaSpeech();
                  return next;
                });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border font-label text-label-sm cursor-pointer transition-colors ${
                voiceAudioEnabled
                  ? 'bg-secondary-container text-on-secondary-container border-secondary'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface'
              }`}
              title={luciaVoiceLabel}
            >
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                {voiceAudioEnabled ? 'volume_up' : 'volume_off'}
              </span>
              <span>{voiceAudioEnabled ? 'Voz LucIA: ON' : 'Voz LucIA: Mute'}</span>
            </button>
          </div>
        </div>

        {/* Main 2-column Interactive Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-start">
          {/* LEFT COLUMN: AKUVOX E12W PHYSICAL UNIT OR 10" TOUCH KIOSK */}
          {hardwareModel === 'akuvox-e12w' ? (
            <section className="lg:col-span-6 flex flex-col gap-4">
              {/* Authentic Akuvox E12W Physical Device Panel + Voice Stream */}
              <div className="bg-[#12161B] text-white rounded-xl border border-[#2C3540] shadow-lg p-5 flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="font-mono text-mono-sm text-white/90">
                      AKUVOX E12W · IP65 · PoE / Wi-Fi
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('panel-admin')}
                    className="font-mono text-mono-sm text-sky-300 hover:underline cursor-pointer"
                  >
                    Configurar IP / API ({akuvoxConfig.deviceIp}) →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-stretch">
                  {/* Realistic Compact Vertical Akuvox E12W Chassis (146x70mm) */}
                  <div className="sm:col-span-5 bg-gradient-to-b from-[#232931] to-[#171B21] rounded-2xl border-2 border-[#3C4652] p-4 flex flex-col items-center justify-between gap-4 shadow-inner">
                    {/* Top: Brand + 2MP 1080p Camera Lens + White LED */}
                    <div className="w-full flex flex-col items-center gap-2">
                      <span className="font-mono text-[10px] tracking-[0.25em] text-white/60 uppercase">
                        AKUVOX
                      </span>
                      <div className="w-20 h-20 rounded-full bg-[#090B0E] border-2 border-[#4B5563] flex flex-col items-center justify-center relative shadow-md">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0B1C2E] via-[#1B3A5C] to-[#081018] border border-sky-400/40 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-sky-300/70" />
                        </div>
                        <span
                          className="absolute bottom-2 w-2 h-2 rounded-full bg-white/80 shadow-[0_0_8px_#fff]"
                          title="LED nocturno blanco automático"
                        />
                      </div>
                      <span className="font-mono text-[10px] text-emerald-300">
                        2MP 1080p · 123° · QR/OCR
                      </span>
                    </div>

                    {/* Speaker Grille + Mic */}
                    <div className="w-full flex flex-col items-center gap-1 py-1">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5, 6].map((dot) => (
                          <span key={dot} className="w-1.5 h-1.5 rounded-full bg-white/25" />
                        ))}
                      </div>
                      <span className="font-mono text-[10px] text-white/50">
                        {mode === 'ia-voz' ? 'AUDIO SIP G.722 ACTIVO' : 'MIC -36dB · ALTAVOZ 1.5W'}
                      </span>
                    </div>

                    {/* Middle: RFID 13.56MHz / NFC / BLE Tap Zone */}
                    <div className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center gap-1.5">
                      <span className="material-symbols-outlined text-sky-300 text-2xl" aria-hidden="true">
                        contactless
                      </span>
                      <span className="font-mono text-[10px] text-white/75 text-center">
                        RFID 13.56MHz · NFC · BLE 5.0
                      </span>
                      <div className="w-full grid grid-cols-2 gap-1 mt-0.5">
                        {activeStaff[0] && (
                          <button
                            type="button"
                            onClick={() => handleKeypadSubmit(activeStaff[0].rfidTag, 'rfid')}
                            className="py-1 px-1.5 rounded bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 font-mono text-[10px] cursor-pointer"
                            title="Simular apoyo de tarjeta Mifare de Marta"
                          >
                            Tag {activeStaff[0].rfidTag}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onAkuvoxBleUnlock();
                            setPinFeedback({
                              ok: true,
                              text: 'BLE 5.0 / NFC Residente validado → Relé 1 abierto.',
                            });
                          }}
                          className="py-1 px-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 font-mono text-[10px] cursor-pointer"
                        >
                          BLE / NFC
                        </button>
                      </div>
                    </div>

                    {/* Bottom: Iconic Single Backlit Mechanical Call Button */}
                    <button
                      type="button"
                      onClick={startAiCall}
                      className="w-full py-3.5 px-3 rounded-xl bg-gradient-to-b from-[#0E5AA7] to-[#003870] hover:from-[#126BC4] hover:to-[#004488] border-2 border-sky-300/60 shadow-[0_0_18px_rgba(56,189,248,0.28)] flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined text-2xl text-white" aria-hidden="true">
                        notifications_active
                      </span>
                      <span className="font-headline text-label-md text-white">
                        BOTÓN ÚNICO · LLAMAR A LUCÍA
                      </span>
                    </button>
                  </div>

                  {/* Right Side of Hardware Box: Live 1080p Feed + QR Scan + Voice AI Dialogue */}
                  <div className="sm:col-span-7 flex flex-col justify-between gap-3">
                    {/* Live RTSP / Snapshot Preview */}
                    <div className="relative h-36 rounded-lg overflow-hidden border border-white/15 bg-black">
                      <SmartImage
                        src={cameraImage}
                        alt="Video RTSP 1080p del Akuvox E12W"
                        className="w-full h-full object-cover"
                        fallbackIcon="videocam"
                        fallbackLabel="Stream RTSP Akuvox E12W"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-sm bg-black/75 text-emerald-300 font-mono text-[11px]">
                          RTSP :554/live/ch00_0
                        </span>
                      </div>
                      {(door1Countdown > 0 || lockerOpenLabel) && (
                        <div className="absolute bottom-2 inset-x-2 px-2.5 py-1.5 rounded bg-emerald-600/95 text-white font-label text-label-sm flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                            lock_open
                          </span>
                          <span>
                            {lockerOpenLabel
                              ? `${lockerOpenLabel} abierto`
                              : `Relé 1 E12W abierto (${door1Countdown}s)`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Active Feedback / RFID Schedule Switch */}
                    <div className="p-2.5 rounded bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-label text-label-sm text-white/75">
                        Reloj RFID/Horarios:
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSimScheduleSlot('allowed')}
                          className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer ${
                            simScheduleSlot === 'allowed'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white/10 text-white/70'
                          }`}
                        >
                          Mar 09:30
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimScheduleSlot('blocked')}
                          className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer ${
                            simScheduleSlot === 'blocked'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white/10 text-white/70'
                          }`}
                        >
                          Lun 19:00
                        </button>
                      </div>
                    </div>

                    {/* Quick Camera QR Scan & OCR Parcel Triggers */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = activePasses[0];
                          if (target) {
                            handleKeypadSubmit(target.code, 'qr-camera');
                          } else {
                            setPinFeedback({
                              ok: false,
                              text: 'No hay pases QR activos. Creá uno en App Residente.',
                            });
                          }
                        }}
                        className="p-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-sky-300 font-label text-label-sm">
                          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                            qr_code_scanner
                          </span>
                          <span>Mostrar QR a Cámara</span>
                        </div>
                        <span className="font-mono text-[11px] text-white/65 block mt-0.5 truncate">
                          {activePasses[0] ? `${activePasses[0].code} (1 uso)` : 'Sin QR activo'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          startAiCall();
                          setTimeout(
                            () =>
                              processNaturalUtterance(
                                'Traigo un paquete de Mercado Libre para el 4B'
                              ),
                            150
                          );
                        }}
                        className="p-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-emerald-300 font-label text-label-sm">
                          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                            document_scanner
                          </span>
                          <span>OCR Paquete ML</span>
                        </div>
                        <span className="font-mono text-[11px] text-white/65 block mt-0.5">
                          Cámara 1080p → Relé 1
                        </span>
                      </button>
                    </div>

                    {/* PIN / RFID Feedback Banner */}
                    {pinFeedback && (
                      <div
                        role="status"
                        className={`p-2.5 rounded border font-label text-label-sm ${
                          pinFeedback.ok
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                            : 'bg-red-500/20 border-red-400/50 text-red-200'
                        }`}
                      >
                        {pinFeedback.text}
                      </div>
                    )}

                    {/* Optional Wiegand External Keypad notice/input */}
                    {akuvoxConfig.hasWiegandKeypad ? (
                      <div className="p-2.5 rounded bg-white/5 border border-sky-400/30 flex flex-col gap-1.5">
                        <span className="font-mono text-[11px] text-sky-300">
                          TECLADO WIEGAND EXTERNO CONECTADO AL E12W (PIN / COACCIÓN {duressPin})
                        </span>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            placeholder={`PIN ${residentPin} o Coacción ${duressPin}`}
                            className="flex-1 rounded bg-black border border-white/20 px-2.5 py-1.5 font-mono text-mono-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleKeypadSubmit(undefined, 'wiegand')}
                            className="px-3 py-1.5 rounded bg-emerald-600 text-white font-label text-label-sm cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded bg-amber-500/10 border border-amber-400/30 font-body text-body-sm text-amber-100/90">
                        <strong>Nota hardware E12W:</strong> no trae pantalla ni teclado numérico
                        (usa <strong>1 botón + Voz IA + QR + RFID/BLE</strong>). Para PIN numérico /
                        Coacción en puerta, activá <em>Teclado Wiegand</em> en Panel Admin.
                      </div>
                    )}
                  </div>
                </div>

                {/* Voice AI Interaction Drawer for E12W Single Button (LucIA + Remote Phone Ring) */}
                <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-label text-label-sm text-sky-300">
                      LUCÍA · VOZ URUGUAYA SIP ({luciaVoiceLabel})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] ${
                          remoteConnected
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            remoteConnected ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                        Celular APK · Canal: {doorbellChannel}
                      </span>
                      {mode === 'ocr-paquete' && matchedPreAuth && ocrPhase === 'awaiting-label' && (
                        <button
                          type="button"
                          onClick={handleRunOcrScan}
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white font-label text-label-sm cursor-pointer"
                        >
                          Validar etiqueta OCR ahora
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Direct 1-Click Remote Phone Ring Bar (Web → Android APK Notification) */}
                  <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-400/30 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-label text-label-sm text-emerald-200">
                        Llamar directo a tu celular:
                      </span>
                      <div className="inline-flex rounded bg-black/40 p-0.5 border border-white/15">
                        {(['4B', '3A'] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setQuickCallUnit(u)}
                            className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer ${
                              quickCallUnit === u
                                ? 'bg-emerald-600 text-white'
                                : 'text-white/70 hover:text-white'
                            }`}
                          >
                            Apto {u}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={doorbellChannel}
                        onChange={(e) => setDoorbellChannel(saveDoorbellChannel(e.target.value))}
                        aria-label="Canal de timbre remoto"
                        className="w-28 rounded bg-black/50 border border-white/20 px-2 py-0.5 font-mono text-[11px] text-sky-200"
                        title="Código de canal que debe coincidir con tu APK Android"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const resident = quickCallUnit === '3A' ? 'Carolina' : 'Martín';
                          processNaturalUtterance(
                            `Hola LucIA, soy Simón, vengo a ver a ${resident} del ${quickCallUnit}`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-label text-label-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                          notifications_active
                        </span>
                        <span>Timbre Visita ({quickCallUnit})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          processNaturalUtterance(
                            `Traigo un paquete de Mercado Libre para el ${quickCallUnit}`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-label text-label-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                          inventory_2
                        </span>
                        <span>Paquete al Celular ({quickCallUnit})</span>
                      </button>
                    </div>
                  </div>

                  {remoteRingStatus && (
                    <div className="px-2.5 py-1.5 rounded bg-sky-500/15 border border-sky-400/30 font-mono text-[11px] text-sky-200">
                      {remoteRingStatus}
                    </div>
                  )}

                  {chatLog.length > 0 ? (
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                      {chatLog.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-2.5 rounded-lg max-w-[92%] text-body-sm ${
                            msg.sender === 'ia'
                              ? 'self-start bg-[#1B2A3B] border border-sky-400/30 text-white'
                              : 'self-end bg-emerald-700/80 text-white'
                          }`}
                        >
                          <span className="font-label text-[11px] text-white/65 block">
                            {msg.sender === 'ia' ? 'LucIA (Voz Uruguaya · E12W)' : 'Visitante (Mic E12W)'}
                          </span>
                          {msg.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-body text-body-sm text-white/60">
                      Presioná el <strong>botón único del Akuvox E12W</strong> o{' '}
                      <strong>Tocar Timbre al Celular</strong> para hablar con <strong>LucIA</strong>{' '}
                      y hacer sonar la notificación real en tu teléfono Android.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {activePasses[0] && (
                      <button
                        type="button"
                        onClick={() =>
                          processNaturalUtterance(`Tengo el código ${activePasses[0].pin}`)
                        }
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 font-label text-label-sm text-emerald-200 cursor-pointer"
                      >
                        &ldquo;Tengo el código {activePasses[0].pin}&rdquo; (Voz 1 uso)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        processNaturalUtterance('Vengo a ver a Martín del 4B, soy Lucas')
                      }
                      className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 font-label text-label-sm text-white cursor-pointer"
                    >
                      &ldquo;Vengo a ver a Martín del 4B, soy Lucas&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => processNaturalUtterance('Traigo un paquete de DAC para el 4B')}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 font-label text-label-sm text-amber-200 cursor-pointer"
                    >
                      &ldquo;Paquete DAC sin aviso (20s)&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        unlockLuciaAudio();
                        setMode('ia-voz');
                        const helpText = playRecordedCategory('elderly-help');
                        pushBubble('ia', helpText);
                      }}
                      className="px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 font-label text-label-sm text-sky-200 cursor-pointer"
                    >
                      Asistencia mayores (solo voz)
                    </button>
                  </div>

                  <form onSubmit={handleUtteranceSubmit} className="flex gap-2">
                    <button
                      type="button"
                      onClick={startBrowserMicrophone}
                      title="Hablarle a LucIA con tu micrófono (es-UY)"
                      className={`px-3 py-2 rounded font-label text-label-sm cursor-pointer shrink-0 inline-flex items-center gap-1 ${
                        isListeningMic
                          ? 'bg-red-600 text-white animate-pulse'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        {isListeningMic ? 'graphic_eq' : 'mic'}
                      </span>
                      <span>{isListeningMic ? 'Escuchando...' : 'Mic'}</span>
                    </button>
                    <input
                      type="text"
                      value={spokenInput}
                      onChange={(e) => setSpokenInput(e.target.value)}
                      placeholder="Hablale o escribile a LucIA..."
                      className="flex-1 rounded bg-[#0A0E12] border border-white/20 px-3 py-2 text-white placeholder:text-white/40 font-body text-body-sm focus:border-sky-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-label text-label-sm cursor-pointer shrink-0"
                    >
                      Hablar
                    </button>
                  </form>
                </div>
              </div>

              {/* Live Akuvox E12W Protocol & Webhook Console */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-title-md" aria-hidden="true">
                      terminal
                    </span>
                    <span className="font-title text-label-lg text-on-surface">
                      Consola de Integración Akuvox E12W (HTTP API / SIP / RTSP / Webhooks)
                    </span>
                  </div>
                  <span className="font-mono text-mono-sm text-secondary">
                    {akuvoxConfig.enabled ? 'REAL LAN' : 'SIMULADO'}
                  </span>
                </div>
                <div className="divide-y divide-outline-variant max-h-[190px] overflow-y-auto bg-[#0D1117] text-white/90 font-mono text-mono-sm">
                  {akuvoxLogs.length === 0 ? (
                    <div className="p-3 text-white/50">
                      Esperando interacción con el Akuvox E12W (presioná el botón, escaneá un QR o
                      apoyá un tag RFID)...
                    </div>
                  ) : (
                    akuvoxLogs.slice(0, 8).map((log) => (
                      <div key={log.id} className="px-3 py-2 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`uppercase text-[10px] px-1.5 py-0.5 rounded ${
                              log.direction === 'outbound'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : log.direction === 'inbound'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : log.direction === 'sip'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {log.direction}
                          </span>
                          <span className="text-white/45 text-[11px]">{log.time}</span>
                        </div>
                        <span className="text-sky-200 break-all">{log.endpoint}</span>
                        <span className="text-white/70 text-[11px]">{log.detail}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          ) : (
            /* KIOSCO TÁCTIL 10" VIEW (Original Touchscreen + Cartelera) */
            <section className="lg:col-span-6 bg-[#11161C] text-white rounded-xl border-4 border-[#27313D] shadow-lg overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-[#0A0E12] border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span className="font-mono text-mono-sm text-white/80">
                    ZAGUÁN IA KIOSCO 10&quot; · BVAR. ESPAÑA 2468
                  </span>
                </div>
                <span className="font-mono text-mono-sm text-white/60 tabular-nums">
                  {loiteringActive && loiteringLateNight ? '03:15 hs' : `${nowTime()} hs`}
                </span>
              </div>

              <div className="relative h-44 bg-black overflow-hidden">
                <SmartImage
                  src={cameraImage}
                  alt="Cámara del Portero con IA en la entrada del edificio"
                  className="w-full h-full object-cover opacity-90"
                  fallbackIcon="videocam"
                  fallbackLabel="Cámara ColorVu + OCR · Entrada Principal"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#11161C] via-transparent to-black/40" />
                {mode === 'ocr-paquete' && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="w-64 h-28 rounded-md border-2 border-dashed border-sky-300 text-sky-200 flex flex-col items-center justify-center gap-1 bg-black/55">
                      <span className="font-mono text-mono-sm uppercase">
                        {ocrPhase === 'deposited'
                          ? `OCR OK · ${matchedPreAuth?.carrier.toUpperCase()} · APTO ${matchedPreAuth?.unit}`
                          : 'ACERCAR ETIQUETA DEL PAQUETE'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-2 bg-[#161D26] border-y border-white/10 grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'reposo', label: 'Cartelera', icon: 'campaign' },
                    { id: 'ia-voz', label: 'Llamar IA', icon: 'record_voice_over' },
                    { id: 'mayores', label: 'Asistencia', icon: 'accessibility_new' },
                    { id: 'teclado', label: 'QR / PIN', icon: 'dialpad' },
                  ] as { id: IntercomMode; label: string; icon: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.id === 'ia-voz' && chatLog.length === 0) startAiCall();
                      else setMode(tab.id);
                    }}
                    className={`py-2 px-1.5 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      mode === tab.id || (tab.id === 'ia-voz' && mode === 'ocr-paquete')
                        ? 'bg-[#004A8F] text-white'
                        : 'bg-white/5 text-white/75 hover:bg-white/10'
                    }`}
                  >
                    <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                      {tab.icon}
                    </span>
                    <span className="font-label text-label-sm whitespace-nowrap">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="p-5 min-h-[380px] flex flex-col justify-between gap-4">
                {mode === 'reposo' && (
                  <>
                    <div className="flex flex-col gap-3">
                      <span className="font-label text-label-sm text-sky-300 uppercase tracking-wider">
                        Cartelera Digital del Edificio ({intercomNotices.length})
                      </span>
                      {activeNotice && (
                        <div className="p-4 rounded-lg bg-[#1A2430] border border-sky-400/30 flex flex-col gap-2">
                          <span className="font-mono text-mono-sm text-amber-200">
                            {activeNotice.category} · {activeNotice.dateLabel}
                          </span>
                          <h2 className="font-headline text-title-lg text-white">
                            {activeNotice.title}
                          </h2>
                          <p className="font-body text-body-md text-white/80">
                            {activeNotice.body}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={startAiCall}
                      className="py-4 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-headline text-title-lg cursor-pointer"
                    >
                      Tocar para Llamar (IA)
                    </button>
                  </>
                )}

                {mode === 'ia-voz' && (
                  <>
                    <div className="flex flex-col gap-2 max-h-[210px] overflow-y-auto">
                      {chatLog.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg max-w-[92%] ${
                            msg.sender === 'ia'
                              ? 'self-start bg-[#1B2A3B] text-white'
                              : 'self-end bg-emerald-700/80 text-white'
                          }`}
                        >
                          <p className="font-body text-body-md">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            processNaturalUtterance('Vengo a ver a Martín del 4B, soy Lucas')
                          }
                          className="px-2.5 py-1.5 rounded bg-white/10 font-label text-label-sm cursor-pointer"
                        >
                          &ldquo;Vengo a ver a Martín del 4B, soy Lucas&rdquo;
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            processNaturalUtterance('Traigo un paquete de Mercado Libre para el 4B')
                          }
                          className="px-2.5 py-1.5 rounded bg-sky-500/20 font-label text-label-sm text-sky-200 cursor-pointer"
                        >
                          &ldquo;Paquete Mercado Libre 4B&rdquo;
                        </button>
                      </div>
                      <form onSubmit={handleUtteranceSubmit} className="flex gap-2">
                        <input
                          type="text"
                          value={spokenInput}
                          onChange={(e) => setSpokenInput(e.target.value)}
                          placeholder="Escribí qué decís al portero..."
                          className="flex-1 rounded bg-[#0A0E12] border border-white/20 px-3 py-2 text-white font-body text-body-sm"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-2 rounded bg-sky-600 text-white font-label text-label-md cursor-pointer"
                        >
                          Decir
                        </button>
                      </form>
                    </div>
                  </>
                )}

                {mode === 'ocr-paquete' && matchedPreAuth && (
                  <div className="flex flex-col justify-between gap-4 flex-1">
                    <div className="p-4 rounded-lg bg-[#1A2430] border border-sky-400/30">
                      <h2 className="font-headline text-title-lg text-white">
                        {matchedPreAuth.carrier} · Apto {matchedPreAuth.unit}
                      </h2>
                      <p className="font-body text-body-md text-white/80 mt-1">
                        {ocrPhase === 'deposited'
                          ? 'Etiqueta validada. Foto comprobante enviada al residente.'
                          : 'Mostrá la etiqueta del paquete a la cámara superior.'}
                      </p>
                    </div>
                    {ocrPhase === 'awaiting-label' ? (
                      <button
                        type="button"
                        onClick={handleRunOcrScan}
                        className="w-full py-3.5 rounded-lg bg-emerald-600 text-white font-label text-label-lg cursor-pointer"
                      >
                        Validar etiqueta por OCR
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMode('reposo')}
                        className="w-full py-3 rounded-lg bg-white/10 text-white font-label text-label-md cursor-pointer"
                      >
                        Volver a reposo
                      </button>
                    )}
                  </div>
                )}

                {mode === 'mayores' && (
                  <div className="flex flex-col gap-3 flex-1 justify-between">
                    <div className="p-4 rounded-lg bg-amber-400/15 border border-amber-300/60">
                      <h2 className="font-headline text-title-lg text-amber-200">
                        Asistencia Guiada por Voz
                      </h2>
                      <p className="font-body text-body-lg text-white mt-1">
                        {elderlyStep === 'menu' &&
                          'Elegí si traés código QR o preferís decirme tu documento.'}
                        {elderlyStep === 'qr' &&
                          'Acercá el código a la cámara de arriba, despacito.'}
                        {elderlyStep === 'doc' && 'Ingresá tu documento y aviso al 4B.'}
                        {elderlyStep === 'done' && '¡Listo! Ya avisé con tu foto a Martín del 4B.'}
                      </p>
                    </div>
                    {elderlyStep === 'menu' && (
                      <div className="grid gap-2.5">
                        <button
                          type="button"
                          onClick={() => setElderlyStep('qr')}
                          className="py-3.5 rounded-lg bg-amber-400 text-black font-headline text-title-md cursor-pointer"
                        >
                          1. Mostrar código QR
                        </button>
                        <button
                          type="button"
                          onClick={() => setElderlyStep('doc')}
                          className="py-3.5 rounded-lg bg-white text-black font-headline text-title-md cursor-pointer"
                        >
                          2. Decir documento (CI)
                        </button>
                      </div>
                    )}
                    {elderlyStep === 'qr' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activePasses[0]) handleKeypadSubmit(activePasses[0].pin);
                          setElderlyStep('done');
                        }}
                        className="py-3.5 rounded-lg bg-emerald-500 text-black font-headline text-title-md cursor-pointer"
                      >
                        Simular acercar código
                      </button>
                    )}
                    {elderlyStep === 'doc' && (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={elderlyDoc}
                          onChange={(e) => setElderlyDoc(e.target.value)}
                          placeholder="Ej: 1.842.390-4"
                          className="rounded-lg bg-white text-black px-3 py-2.5 font-mono text-title-md"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setElderlyStep('done');
                            onRequestVisitApproval(
                              `Visita CI ${elderlyDoc || '1.842.390-4'}`,
                              'Martín',
                              '4B',
                              'Modo asistencia mayores'
                            );
                          }}
                          className="py-3 rounded-lg bg-emerald-500 text-black font-headline text-title-md cursor-pointer"
                        >
                          Confirmar documento
                        </button>
                      </div>
                    )}
                    {elderlyStep === 'done' && (
                      <button
                        type="button"
                        onClick={() => {
                          setElderlyStep('menu');
                          setMode('reposo');
                        }}
                        className="py-3 rounded-lg bg-white/15 text-white font-label text-label-md cursor-pointer"
                      >
                        Volver
                      </button>
                    )}
                  </div>
                )}

                {mode === 'teclado' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        placeholder="Ingresá PIN, QR o Tag RFID..."
                        className="flex-1 rounded bg-[#0A0E12] border border-white/25 px-3 py-2 font-mono text-title-md text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleKeypadSubmit()}
                        className="px-4 py-2 rounded bg-emerald-600 text-white font-label text-label-md cursor-pointer"
                      >
                        Validar
                      </button>
                    </div>
                    {pinFeedback && (
                      <div
                        className={`p-2.5 rounded border font-label text-label-sm ${
                          pinFeedback.ok
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                            : 'bg-red-500/20 border-red-400/50 text-red-200'
                        }`}
                      >
                        {pinFeedback.text}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      {activePasses[0] && (
                        <button
                          type="button"
                          onClick={() => handleKeypadSubmit(activePasses[0].pin)}
                          className="p-2 rounded bg-white/10 text-left cursor-pointer"
                        >
                          <div className="font-mono text-mono-sm text-sky-300">
                            PIN {activePasses[0].pin} (1 uso)
                          </div>
                        </button>
                      )}
                      {activeStaff[0] && (
                        <button
                          type="button"
                          onClick={() => handleKeypadSubmit(activeStaff[0].pin)}
                          className="p-2 rounded bg-white/10 text-left cursor-pointer"
                        >
                          <div className="font-mono text-mono-sm text-emerald-300">
                            {activeStaff[0].name} ({activeStaff[0].days.map((d) => DAY_LABELS[d]).join('/')})
                          </div>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleKeypadSubmit(duressPin)}
                        className="p-2 rounded bg-red-500/20 border border-red-400/40 text-left cursor-pointer"
                      >
                        <div className="font-mono text-mono-sm text-red-200">
                          PIN {duressPin} (Coacción)
                        </div>
                      </button>
                      {activeMaster[0] && (
                        <button
                          type="button"
                          onClick={() => handleKeypadSubmit(activeMaster[0].pin)}
                          className="p-2 rounded bg-sky-500/20 text-left cursor-pointer"
                        >
                          <div className="font-mono text-mono-sm text-sky-200">
                            {activeMaster[0].provider} ({activeMaster[0].pin})
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* RIGHT COLUMN: Double Airlock Physical Security, Live Resident Push, Loitering Simulator */}
          <aside className="lg:col-span-6 flex flex-col gap-gutter-md">
            {/* 1. Doble Exclusa / Seguridad Física Monitor */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Seguridad Física ·{' '}
                    {storageMode === 'locker' ? 'Lockers Inteligentes' : 'Doble Exclusa (Zaguán)'}
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    {hardwareModel === 'akuvox-e12w'
                      ? 'E12W controla Relé 1 (Zaguán). Relé 2 (Hall) opera vía módulo IP auxiliar.'
                      : 'El repartidor nunca accede a ascensores ni escaleras.'}
                  </p>
                </div>
                <span className="font-mono text-mono-sm px-2.5 py-1 rounded-sm bg-surface-variant text-primary">
                  {waitingPreAuth.length} pre-autorizado{waitingPreAuth.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={`p-3.5 rounded-md border flex flex-col gap-1 ${
                    door1Countdown > 0 || lockerOpenLabel
                      ? 'bg-success-container border-success text-on-success-container'
                      : 'bg-surface-container-low border-outline-variant text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label text-label-sm">
                      {storageMode === 'locker'
                        ? 'Compuerta Locker #B2'
                        : 'Puerta 1 · Relé 1 (E12W)'}
                    </span>
                    <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                      {door1Countdown > 0 || lockerOpenLabel ? 'lock_open' : 'lock'}
                    </span>
                  </div>
                  <span className="font-headline text-title-md tabular-nums">
                    {lockerOpenLabel
                      ? 'Abierta para depósito'
                      : door1Countdown > 0
                        ? `Desbloqueada (${door1Countdown}s)`
                        : 'Cerrada'}
                  </span>
                  <span className="font-mono text-[11px] opacity-80">DoorNum=1 · Zaguán</span>
                </div>

                <div
                  className={`p-3.5 rounded-md border flex flex-col gap-1 ${
                    door2Countdown > 0
                      ? 'bg-success-container border-success text-on-success-container'
                      : 'bg-surface-container-low border-outline-variant text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label text-label-sm">
                      Puerta 2 · Relé Auxiliar (Hall)
                    </span>
                    <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                      {door2Countdown > 0 ? 'lock_open' : 'verified_user'}
                    </span>
                  </div>
                  <span className="font-headline text-title-md tabular-nums">
                    {door2Countdown > 0 ? `Desbloqueada (${door2Countdown}s)` : 'BLOQUEADA'}
                  </span>
                  <span className="font-mono text-[11px] opacity-80">
                    {akuvoxConfig.secondaryRelayUrl ? 'Relé IP vinculado' : 'Shelly / Akuvox SR01'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Live Push / WhatsApp Notification to Resident's Phone */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary" aria-hidden="true">
                    notifications_active
                  </span>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Celular del Residente (Push / WhatsApp en vivo)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('app-residente')}
                  className="font-label text-label-sm text-primary hover:underline cursor-pointer"
                >
                  Abrir App completa →
                </button>
              </div>

              {pendingVisit && pendingVisit.status === 'Pendiente' && (
                <div className="p-4 rounded-md bg-surface-container-low border-2 border-primary flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <SmartImage
                      src={liveSnapshotUrl || pendingVisit.photoUrl}
                      alt="Foto en vivo de la visita"
                      className="w-16 h-16 rounded object-cover border border-outline-variant shrink-0"
                      fallbackIcon="person"
                      fallbackLabel="Foto visita"
                    />
                    <div className="min-w-0">
                      <span className="font-mono text-mono-sm text-primary">
                        WHATSAPP / PUSH · SNAPSHOT E12W · APTO {pendingVisit.unit}
                      </span>
                      <h3 className="font-title text-title-md text-on-surface">
                        {pendingVisit.visitorName} pregunta por {pendingVisit.residentName}
                      </h3>
                      <p className="font-body text-body-sm text-on-surface-variant">
                        &ldquo;{pendingVisit.spokenTranscript}&rdquo;
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        onRespondVisit(true);
                        pushBubble(
                          'ia',
                          `${pendingVisit.residentName} autorizó tu ingreso. Relé del portero activado, bienvenido ${pendingVisit.visitorName}.`
                        );
                      }}
                      className="py-2.5 px-3 rounded bg-success text-on-success font-label text-label-md cursor-pointer"
                    >
                      [Abrir Puerta]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondVisit(false);
                        pushBubble(
                          'ia',
                          `En este momento no pueden recibirte en el ${pendingVisit.unit}. Gracias por avisar.`
                        );
                      }}
                      className="py-2.5 px-3 rounded bg-error-container text-on-error-container font-label text-label-md cursor-pointer"
                    >
                      [Rechazar]
                    </button>
                  </div>
                </div>
              )}

              {pendingSpontaneous && pendingSpontaneous.status === 'Esperando' && (
                <div className="p-4 rounded-md bg-warning-container/40 border-2 border-warning flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label text-label-sm text-on-warning-container">
                      PAQUETE ESPONTÁNEO · APTO {pendingSpontaneous.unit}
                    </span>
                    <span className="font-mono text-mono-md text-warning font-semibold tabular-nums">
                      {pendingSpontaneous.secondsLeft}s restantes
                    </span>
                  </div>
                  <p className="font-body text-body-md text-on-surface">
                    <strong>Llegó un paquete de {pendingSpontaneous.carrier} para vos.</strong>{' '}
                    ¿Lo dejamos en {storageMode === 'locker' ? 'Locker #B2' : 'el zaguán'}?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('authorize');
                        pushBubble('ia', 'Residente autorizó pasar al hall/zaguán. Relé 1 abierto y foto comprobante enviada.');
                      }}
                      className="py-2 px-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                    >
                      Dejar pasar al hall
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('reject');
                        pushBubble('ia', 'El residente rechazó la entrega.');
                      }}
                      className="py-2 px-2 rounded bg-error-container text-on-error-container font-label text-label-sm cursor-pointer"
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRespondSpontaneousParcel('timeout-auto');
                        pushBubble(
                          'ia',
                          unannouncedRule === 'auto-zaguan'
                            ? 'Sin respuesta tras 20s: abriendo Zaguán automáticamente.'
                            : 'Sin respuesta tras 20s: entrega no autorizada.'
                        );
                      }}
                      className="py-2 px-2 rounded bg-surface-container-lowest border border-outline-variant text-on-surface font-label text-label-sm cursor-pointer"
                    >
                      Simular 20s
                    </button>
                  </div>
                </div>
              )}

              {(!pendingVisit || pendingVisit.status !== 'Pendiente') &&
                (!pendingSpontaneous || pendingSpontaneous.status !== 'Esperando') && (
                  <div className="p-4 rounded bg-surface-container-low border border-outline-variant text-on-surface-variant font-body text-body-sm">
                    Tocá el <strong>botón único del Akuvox E12W</strong> y probá una visita o un
                    paquete para ver el snapshot 1080p y los botones rápidos aquí mismo.
                  </div>
                )}
            </div>

            {/* 2.5 Validación Inteligente de Paquetería (Snapshot E12W + Visión Multimodal OCR) */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary" aria-hidden="true">
                    document_scanner
                  </span>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Validación de Paquetería por Visión IA (OCR)
                  </h2>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary hover:bg-surface-container cursor-pointer">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    upload_file
                  </span>
                  <span>Subir foto de etiqueta</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLabelFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>
              <p className="font-body text-body-sm text-on-surface-variant">
                Envía un frame de cámara al endpoint <code>/api/packages/validate-frame</code>{' '}
                (Gemini 2.5 Flash), extrae unidad/destinatario y cruza con pre-autorizaciones.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={visionScanning}
                  onClick={() =>
                    void runMultimodalFrameScan({
                      simulatedLabelText:
                        'MERCADO LIBRE FULL · Destinatario: Martín Silva · Apto 4B · #ML-9042',
                    })
                  }
                  className="p-2.5 rounded bg-success-container/60 hover:bg-success-container border border-success/40 text-left cursor-pointer disabled:opacity-60"
                >
                  <span className="font-label text-label-sm text-on-success-container block">
                    1. ML Apto 4B
                  </span>
                  <span className="font-body text-[11px] text-on-surface-variant">
                    Auto-abrir + delivered
                  </span>
                </button>

                <button
                  type="button"
                  disabled={visionScanning}
                  onClick={() =>
                    void runMultimodalFrameScan({
                      simulatedLabelText:
                        'PEDIDOSYA MARKET · Martín Silva · Apto 4B · #PY-2210',
                    })
                  }
                  className="p-2.5 rounded bg-warning-container/60 hover:bg-warning-container border border-warning/40 text-left cursor-pointer disabled:opacity-60"
                >
                  <span className="font-label text-label-sm text-on-warning-container block">
                    2. PedidosYa 4B
                  </span>
                  <span className="font-body text-[11px] text-on-surface-variant">
                    Regla confirmar con foto
                  </span>
                </button>

                <button
                  type="button"
                  disabled={visionScanning}
                  onClick={() =>
                    void runMultimodalFrameScan({
                      simulatedLabelText:
                        'DAC AGENCIA CENTRAL · Destinatario: Martín Silva · Apto 4B · #DAC-778',
                    })
                  }
                  className="p-2.5 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant text-left cursor-pointer disabled:opacity-60"
                >
                  <span className="font-label text-label-sm text-on-surface block">
                    3. DAC sin aviso
                  </span>
                  <span className="font-body text-[11px] text-on-surface-variant">
                    Alerta foto al residente
                  </span>
                </button>
              </div>

              {visionScanning && (
                <div className="p-3 rounded bg-surface-container-low border border-primary/40 font-mono text-mono-sm text-primary">
                  Analizando frame de cámara E12W con modelo de visión multimodal...
                </div>
              )}

              {lastVisionDecision && !visionScanning && (
                <div className="p-3 rounded bg-surface-container-low border border-outline-variant flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-primary">
                      MOTOR: {lastVisionDecision.extraction.engine} · CONFIANZA{' '}
                      {Math.round(lastVisionDecision.extraction.confidence * 100)}%
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-sm font-label text-[11px] ${
                        lastVisionDecision.outcome === 'auto_opened_delivered'
                          ? 'bg-success-container text-on-success-container'
                          : 'bg-warning-container text-on-warning-container'
                      }`}
                    >
                      {lastVisionDecision.outcome === 'auto_opened_delivered'
                        ? 'OPENED → DELIVERED'
                        : 'CONFIRMATION SENT'}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-on-surface">
                    OCR: Unidad <strong>{lastVisionDecision.extraction.unitNumber || '—'}</strong> ·
                    Destinatario <strong>{lastVisionDecision.extraction.recipientName || '—'}</strong>{' '}
                    · Correo <strong>{lastVisionDecision.extraction.carrier || '—'}</strong>
                  </p>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    {lastVisionDecision.message}
                  </p>
                </div>
              )}
            </div>

            {/* 3. Detección de Merodeo vía RTSP ONVIF del E12W */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-warning" aria-hidden="true">
                    visibility
                  </span>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Detección de Merodeo (Stream RTSP / ONVIF)
                  </h2>
                </div>
                <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loiteringLateNight}
                    onChange={(e) => setLoiteringLateNight(e.target.checked)}
                    className="rounded border-outline-variant accent-primary"
                  />
                  Madrugada (03:15 hs)
                </label>
              </div>
              <p className="font-body text-body-sm text-on-surface-variant">
                El stream RTSP 1080p del Akuvox E12W se analiza 24/7. Si detecta permanencia sin
                tocar el botón, graba clip en MicroSD/NVR y alerta a Administración.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {!loiteringActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLoiteringSeconds(0);
                      setLoiteringReported(false);
                      setLoiteringActive(true);
                    }}
                    className="px-4 py-2 rounded bg-warning-container text-on-warning-container font-label text-label-md cursor-pointer"
                  >
                    Simular merodeo frente al E12W
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setLoiteringActive(false);
                      setLoiteringSeconds(0);
                      setLoiteringReported(false);
                    }}
                    className="px-4 py-2 rounded bg-surface-container border border-outline-variant text-on-surface font-label text-label-md cursor-pointer"
                  >
                    Detener ({loiteringSeconds}s)
                  </button>
                )}

                {loiteringReported && (
                  <button
                    type="button"
                    onClick={() => onNavigate('panel-admin')}
                    className="font-label text-label-sm text-error hover:underline cursor-pointer"
                  >
                    Clip guardado · Ver en Panel Admin →
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
