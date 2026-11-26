import { useCallback, useEffect, useRef, useState } from 'react';
import { AppResidenteView } from './components/AppResidenteView';
import { InstallerView } from './components/InstallerView';
import { LoginView } from './components/LoginView';
import { ModuloRetrofitView } from './components/ModuloRetrofitView';
import { PanelAdminView } from './components/PanelAdminView';
import { PorteroIaView } from './components/PorteroIaView';
import { PublicMagicLinkView } from './components/PublicMagicLinkView';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { WebPrincipalView } from './components/WebPrincipalView';
import {
  DEFAULT_AKUVOX_CONFIG,
  pollAkuvoxEvents,
  triggerAkuvoxDoor,
} from './services/akuvoxService';
import {
  ParcelValidationDecision,
  validateParcelCameraFrame,
} from './services/parcelVisionService';
import {
  deactivateTenantInSupabase,
  revokePassInSupabase,
  subscribeToAccessLogsRealtime,
  syncAccessLogToSupabase,
  syncBuildingToSupabase,
  syncDeliveredPackageToSupabase,
  syncMasterKeyToSupabase,
  syncNoticeToSupabase,
  syncPreAuthPackageToSupabase,
  syncRecurringPassToSupabase,
  syncSingleUsePassToSupabase,
  syncTenantToSupabase,
  syncUnitToSupabase,
} from './services/zaguanDbService';
import {
  isRecurringPassAllowedAt,
  isSingleUsePassValidNow,
} from './utils/accessValidation';
import {
  ASSETS,
  BUILDING_INFO,
  INITIAL_ACCESS_LOGS,
  INITIAL_ACTIVITY,
  INITIAL_BUILDINGS,
  INITIAL_DEMO_USERS,
  INITIAL_MASTER_KEYS,
  INITIAL_NOTICES,
  INITIAL_PARCELS,
  INITIAL_PREAUTH_PARCELS,
  INITIAL_QR_PASSES,
  INITIAL_RECURRING_PASSES,
  INITIAL_SECURITY_ALERTS,
  INITIAL_TENANTS,
  INITIAL_UNITS,
  computeDuressPin,
} from './data/zaguanData';
import {
  AccessEventSource,
  AccessLogRecord,
  ActivityEvent,
  AkuvoxConfig,
  AkuvoxLogEntry,
  AppAuthUser,
  BuildingNotice,
  BuildingRecord,
  BuildingTenant,
  BuildingUnit,
  DayOfWeek,
  EstimatorBrandKey,
  IntercomHardwareModel,
  MainScreen,
  MasterKeyRecord,
  ParcelItem,
  ParcelStorageMode,
  PendingSpontaneousParcel,
  PendingVisitRequest,
  PreAuthParcelRule,
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  ResidentTab,
  SecurityAlert,
  SurveyRequest,
  UnannouncedParcelRule,
  UserRole,
} from './types/zaguan';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function extractMagicLinkTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = /^\/pase\/([^/?#]+)/i.exec(window.location.pathname);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }
  const params = new URLSearchParams(window.location.search);
  const queryPass = params.get('pass');
  return queryPass ? queryPass.trim() : null;
}

export default function App() {
  const [magicLinkToken, setMagicLinkToken] = useState<string | null>(() =>
    extractMagicLinkTokenFromUrl()
  );

  // Unified Multi-Role Auth (Login-first on App / APK launch!)
  const [authUsers, setAuthUsers] = useState<AppAuthUser[]>(INITIAL_DEMO_USERS);
  const [currentUser, setCurrentUser] = useState<AppAuthUser | null>(null);
  const [viewingPublicWeb, setViewingPublicWeb] = useState(false);

  const [activeScreen, setActiveScreen] = useState<MainScreen>('installer');
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [residentTab, setResidentTab] = useState<ResidentTab>('inicio');

  // Retrofit Estimator & Survey state
  const [estimatorBrand, setEstimatorBrand] = useState<EstimatorBrandKey>('bellsonic');
  const [estimatorUnits, setEstimatorUnits] = useState<number>(24);
  const [lastSurvey, setLastSurvey] = useState<SurveyRequest | null>(null);

  // Resident & Building Shared State
  const [passes, setPasses] = useState<QrPass[]>(INITIAL_QR_PASSES);
  const [recurringPasses, setRecurringPasses] = useState<RecurringPass[]>(INITIAL_RECURRING_PASSES);
  const [parcels, setParcels] = useState<ParcelItem[]>(INITIAL_PARCELS);
  const [preAuthParcels, setPreAuthParcels] =
    useState<PreAuthorizedParcel[]>(INITIAL_PREAUTH_PARCELS);
  const [activities, setActivities] = useState<ActivityEvent[]>(INITIAL_ACTIVITY);

  // Parcel configuration
  const [storageMode, setStorageMode] = useState<ParcelStorageMode>('zaguan');
  const [unannouncedRule, setUnannouncedRule] = useState<UnannouncedParcelRule>('auto-zaguan');

  // Personal PIN & Duress PIN for active unit (Apto 4B)
  const [residentPin, setResidentPin] = useState<string>(BUILDING_INFO.personalPin);
  const duressPin = computeDuressPin(residentPin);

  // Hardware: Akuvox E12W integration state
  const [hardwareModel, setHardwareModel] = useState<IntercomHardwareModel>('akuvox-e12w');
  const [akuvoxConfig, setAkuvoxConfig] = useState<AkuvoxConfig>(DEFAULT_AKUVOX_CONFIG);
  const [akuvoxLogs, setAkuvoxLogs] = useState<AkuvoxLogEntry[]>([
    {
      id: 'ak-init-1',
      direction: 'sip',
      endpoint: `SIP REGISTER sip:${DEFAULT_AKUVOX_CONFIG.sipExtension}@${DEFAULT_AKUVOX_CONFIG.sipServerIp}`,
      detail: 'Akuvox E12W listo · 1 botón SIP + Cámara 1080p RTSP + RFID 13.56MHz + BLE 5.0',
      status: 'simulated',
      time: '14:30',
    },
  ]);
  const [liveSnapshotUrl, setLiveSnapshotUrl] = useState<string | null>(null);
  const lastPolledEventId = useRef<string | undefined>(undefined);

  // Live hardware states (Double Airlock + Smart Locker)
  const [door1Countdown, setDoor1Countdown] = useState(0);
  const [door2Countdown, setDoor2Countdown] = useState(0);
  const [lockerOpenLabel, setLockerOpenLabel] = useState<string | null>(null);

  // Live AI Portero pending flows
  const [pendingVisit, setPendingVisit] = useState<PendingVisitRequest | null>(null);
  const [pendingSpontaneous, setPendingSpontaneous] = useState<PendingSpontaneousParcel | null>(
    null
  );

  // Multi-building, Roles & Admin Panel state
  const [buildings, setBuildings] = useState<BuildingRecord[]>(INITIAL_BUILDINGS);
  const [activeBuildingId, setActiveBuildingId] = useState<string>(INITIAL_BUILDINGS[0].id);
  const [currentRole, setCurrentRole] = useState<UserRole>('building_admin');
  const [units, setUnits] = useState<BuildingUnit[]>(INITIAL_UNITS);
  const [tenants, setTenants] = useState<BuildingTenant[]>(INITIAL_TENANTS);
  const [masterKeys, setMasterKeys] = useState<MasterKeyRecord[]>(INITIAL_MASTER_KEYS);
  const [notices, setNotices] = useState<BuildingNotice[]>(INITIAL_NOTICES);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>(INITIAL_SECURITY_ALERTS);
  const [accessLogs, setAccessLogs] = useState<AccessLogRecord[]>(INITIAL_ACCESS_LOGS);

  const nowTime = useCallback(
    () => new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
    []
  );

  const handleLogActivity = useCallback(
    (event: Omit<ActivityEvent, 'id'>) => {
      setActivities((prev) => [{ ...event, id: `act-${Date.now()}-${Math.random()}` }, ...prev]);

      // Mirror every event into structured `access_logs` for real-time Admin filtering + Supabase sync
      const sourceMap: Record<ActivityEvent['category'], AccessEventSource> = {
        acceso: 'remote_app',
        qr: 'access_pass',
        paquete: 'package_ocr',
        alerta: event.title.toLowerCase().includes('coacción') ? 'duress_pin' : 'loitering_alert',
        ia: 'ai_voice',
        admin: 'admin_action',
      };
      const unitMatch = `${event.title} ${event.subtitle}`.match(/Apto\s+([A-Z0-9]+)/i);
      const now = new Date();
      const iso = now.toISOString();
      const newLog: AccessLogRecord = {
        id: `log-${Date.now()}-${Math.random()}`,
        buildingId: activeBuildingId,
        unit: unitMatch ? unitMatch[1].toUpperCase() : undefined,
        actorName: event.title,
        eventSource: event.title.toLowerCase().includes('llave maestra')
          ? 'master_key'
          : sourceMap[event.category],
        methodUsed: event.category === 'paquete' ? 'OCR / Exclusa E12W' : event.category.toUpperCase(),
        direction:
          event.category === 'alerta'
            ? 'alert'
            : event.title.toLowerCase().includes('salió') ||
                event.title.toLowerCase().includes('salida')
              ? 'exit'
              : event.category === 'admin'
                ? 'system'
                : 'entry',
        granted: !event.title.toLowerCase().includes('bloqueado') && !event.title.toLowerCase().includes('rechazad'),
        snapshotUrl:
          event.category === 'paquete'
            ? ASSETS.parcelReception
            : event.category === 'ia' || event.category === 'alerta'
              ? liveSnapshotUrl || ASSETS.lobbyCamera
              : undefined,
        notes: event.subtitle,
        occurredAtIso: iso,
        dateKey: iso.slice(0, 10),
        timeLabel: event.time,
      };
      setAccessLogs((prev) => [newLog, ...prev]);
      void syncAccessLogToSupabase(newLog);
    },
    [activeBuildingId, liveSnapshotUrl]
  );

  // Automatic real-time expiration of temporary Master Keys & Single-use Passes (checks every 5s)
  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      setMasterKeys((prev) => {
        let changed = false;
        const next = prev.map((mk) => {
          if (
            (mk.status === 'Activa' || mk.status === 'En edificio') &&
            mk.expiresAtIso &&
            new Date(mk.expiresAtIso).getTime() <= nowMs
          ) {
            changed = true;
            return { ...mk, status: 'Expirada' as const };
          }
          return mk;
        });
        return changed ? next : prev;
      });
      setPasses((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          if (
            p.status === 'Activo' &&
            p.validUntilIso &&
            new Date(p.validUntilIso).getTime() <= nowMs
          ) {
            changed = true;
            return {
              ...p,
              status: 'Expirado' as const,
              detailText: `Expirado automáticamente · Voz ${p.pin}`,
            };
          }
          return p;
        });
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Optional Supabase Realtime subscription for `access_logs`
  useEffect(() => {
    const channel = subscribeToAccessLogsRealtime((rtLog) => {
      setAccessLogs((prev) =>
        prev.some((existing) => existing.id === rtLog.id) ? prev : [rtLog, ...prev]
      );
    });
    return () => {
      if (channel) {
        void channel.unsubscribe();
      }
    };
  }, []);

  const handleLogAkuvoxProtocol = useCallback(
    (
      direction: AkuvoxLogEntry['direction'],
      endpoint: string,
      detail: string,
      status: AkuvoxLogEntry['status'] = akuvoxConfig.enabled ? 'ok' : 'simulated'
    ) => {
      setAkuvoxLogs((prev) => [
        {
          id: `ak-${Date.now()}-${Math.random()}`,
          direction,
          endpoint,
          detail,
          status,
          time: nowTime(),
        },
        ...prev.slice(0, 29),
      ]);
    },
    [akuvoxConfig.enabled, nowTime]
  );

  const dispatchHardwareRelay = useCallback(
    async (doorNum: 1 | 2) => {
      const result = await triggerAkuvoxDoor(akuvoxConfig, doorNum);
      handleLogAkuvoxProtocol(
        'outbound',
        result.endpoint,
        result.message,
        result.ok ? (result.simulated ? 'simulated' : 'ok') : 'error'
      );
    },
    [akuvoxConfig, handleLogAkuvoxProtocol]
  );

  // Poll real Akuvox E12W webhook events when real LAN mode is enabled
  useEffect(() => {
    if (!akuvoxConfig.enabled) return;
    const timer = setInterval(async () => {
      const events = await pollAkuvoxEvents(akuvoxConfig, lastPolledEventId.current);
      if (events.length === 0) return;
      lastPolledEventId.current = events[0].id;
      for (const ev of events.reverse()) {
        handleLogAkuvoxProtocol(
          'inbound',
          `/api/akuvox/webhook (${ev.event})`,
          JSON.stringify(ev.payload),
          'ok'
        );
        if (ev.event === 'call_start') {
          handleLogActivity({
            title: 'Botón físico Akuvox E12W presionado',
            subtitle: `Llamada SIP iniciada desde ${ev.payload.ip || akuvoxConfig.deviceIp}`,
            time: ev.receivedAt,
            category: 'ia',
          });
        } else if (ev.event === 'tamper') {
          setSecurityAlerts((prev) => [
            {
              id: `sec-tamper-${Date.now()}`,
              type: 'merodeo',
              title: 'Alarma Tamper / Vandalismo en Akuvox E12W',
              detail: `Sensor físico del portero activado (${ev.payload.mac || akuvoxConfig.deviceIp}).`,
              timestamp: `Hoy ${ev.receivedAt}`,
              severity: 'critica',
              resolved: false,
            },
            ...prev,
          ]);
        }
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [akuvoxConfig, handleLogActivity, handleLogAkuvoxProtocol]);

  // Sync browser URL changes (/pase/[token] <-> portal)
  useEffect(() => {
    const onPopState = () => {
      setMagicLinkToken(extractMagicLinkTokenFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleOpenPublicMagicLink = (token: string) => {
    const clean = token.trim().toUpperCase();
    window.history.pushState({}, '', `/pase/${encodeURIComponent(clean)}`);
    setMagicLinkToken(clean);
    window.scrollTo({ top: 0 });
  };

  const handleExitPublicMagicLink = () => {
    window.history.pushState({}, '', '/');
    setMagicLinkToken(null);
  };

  // Scroll anchor effect
  useEffect(() => {
    if (!pendingAnchor) return;
    const timer = setTimeout(() => {
      const target = document.getElementById(pendingAnchor);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
      setPendingAnchor(null);
    }, 60);
    return () => clearTimeout(timer);
  }, [activeScreen, pendingAnchor]);

  // Door countdown timers
  useEffect(() => {
    if (door1Countdown <= 0) return;
    const t = setTimeout(() => setDoor1Countdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [door1Countdown]);

  useEffect(() => {
    if (door2Countdown <= 0) return;
    const t = setTimeout(() => setDoor2Countdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [door2Countdown]);

  // Helper to deposit a parcel into Zaguán / Locker (only Door 1 or Locker opens; Door 2 stays LOCKED)
  const completeParcelDeposit = useCallback(
    (
      carrier: string,
      unit: string,
      mode: ParcelStorageMode,
      validationMethod: ParcelItem['validationMethod']
    ) => {
      const time = nowTime();
      const shortCode = `#${carrier.slice(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
      const location =
        mode === 'locker' ? 'Locker Inteligente #B2' : 'Zaguán Paquetería (Exclusa 1)';

      if (mode === 'locker') {
        setLockerOpenLabel('Locker #B2');
        setTimeout(() => setLockerOpenLabel(null), 9000);
      } else {
        setDoor1Countdown(12);
        void dispatchHardwareRelay(1);
        // Door 2 deliberately remains locked!
      }

      const newParcel: ParcelItem = {
        id: `parcel-${Date.now()}`,
        code: shortCode,
        carrier,
        unit,
        receivedAt: `Hoy ${time} hs`,
        location,
        storageMode: mode,
        validationMethod,
        note: `${validationMethod}. Foto comprobante enviada al residente ("Tu paquete ya está en ${mode === 'locker' ? 'el Locker #B2' : 'el zaguán'} · ${time} hs"). Puerta a ascensores bloqueada.`,
        status: 'delivered',
        imageUrl: ASSETS.parcelReception,
      };

      setParcels((prev) => [newParcel, ...prev]);
      const matchedUnit = units.find(
        (u) => u.buildingId === activeBuildingId && u.unitNumber.toUpperCase() === unit.toUpperCase()
      );
      void syncDeliveredPackageToSupabase(activeBuildingId, matchedUnit?.id, newParcel);
      handleLogActivity({
        title: `Paquete ${shortCode} entregado (delivered) en ${mode === 'locker' ? 'Locker #B2' : 'el zaguán'}`,
        subtitle: `${carrier} · ${validationMethod} · Comprobante con foto enviado · Apto ${unit}`,
        time,
        category: 'paquete',
      });
    },
    [activeBuildingId, dispatchHardwareRelay, handleLogActivity, nowTime, units]
  );

  // Live 20s countdown for spontaneous parcel
  useEffect(() => {
    if (!pendingSpontaneous || pendingSpontaneous.status !== 'Esperando') return;
    if (pendingSpontaneous.secondsLeft <= 0) {
      if (unannouncedRule === 'auto-zaguan') {
        setPendingSpontaneous((prev) => (prev ? { ...prev, status: 'Auto-autorizado' } : null));
        completeParcelDeposit(
          pendingSpontaneous.carrier,
          pendingSpontaneous.unit,
          pendingSpontaneous.storageMode,
          'Regla automática 20s'
        );
      } else {
        setPendingSpontaneous((prev) => (prev ? { ...prev, status: 'Rechazado' } : null));
        handleLogActivity({
          title: `Paquete ${pendingSpontaneous.carrier} no autorizado (20s sin respuesta)`,
          subtitle: `Regla estricta de Apto ${pendingSpontaneous.unit}`,
          time: nowTime(),
          category: 'paquete',
        });
      }
      return;
    }

    const t = setTimeout(() => {
      setPendingSpontaneous((prev) =>
        prev && prev.status === 'Esperando'
          ? { ...prev, secondsLeft: Math.max(0, prev.secondsLeft - 1) }
          : prev
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [pendingSpontaneous, unannouncedRule, completeParcelDeposit, handleLogActivity, nowTime]);

  const handleNavigate = (screen: MainScreen, anchor?: string) => {
    setActiveScreen(screen);
    if (anchor) {
      setPendingAnchor(anchor);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // --- Direct Door Unlock ---
  const handleUnlockDirectDoor = (method: 'app' | 'bt-nfc', detail?: string) => {
    setDoor1Countdown(8);
    setDoor2Countdown(8);
    void dispatchHardwareRelay(1);
    if (akuvoxConfig.secondaryRelayUrl) {
      void dispatchHardwareRelay(2);
    }
    handleLogActivity({
      title:
        method === 'bt-nfc'
          ? 'Puerta abierta por NFC HCE / BLE 5.0 (Akuvox E12W)'
          : 'Puerta principal abierta desde App (Relé E12W)',
      subtitle: detail || `Acceso completo (Exclusas 1 y 2) · Apto ${BUILDING_INFO.activeUnit}`,
      time: nowTime(),
      category: 'acceso',
    });
  };

  // --- Single-use Passes ---
  const handleCreatePass = (newPass: QrPass) => {
    setPasses((prev) => [newPass, ...prev]);
    void syncSingleUsePassToSupabase(activeBuildingId, newPass);
    const activeBldg = buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];
    // Sincronizar con backend LAN (/api/pase/register) para validación pública en /pase/[token]
    fetch('/api/pase/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: newPass.code,
        pin: newPass.pin,
        guestName: newPass.guestName,
        unit: newPass.unit || BUILDING_INFO.activeUnit,
        passType: newPass.singleUse ? 'one_time' : 'permanent',
        status: 'active',
        validFromIso: new Date().toISOString(),
        validUntilIso: newPass.validUntilIso,
        accessScope: newPass.accessScope,
        buildingName: activeBldg.name,
        buildingAddress: activeBldg.address,
        latitude: activeBldg.latitude,
        longitude: activeBldg.longitude,
        geofenceRadiusMeters: activeBldg.geofenceRadiusMeters,
      }),
    }).catch(() => {});
    handleLogActivity({
      title: `Pase 1 uso código voz ${newPass.pin} creado (${newPass.typeLabel})`,
      subtitle: `${newPass.guestName} · ${newPass.validityLabel} · Magic Link /pase/${newPass.code}`,
      time: nowTime(),
      category: 'qr',
    });
  };

  const handleRedeemMagicLinkPass = (
    token: string,
    coords: { lat: number; lng: number; distanceMeters: number }
  ): { granted: boolean; reason?: string; burned?: boolean } => {
    const clean = token.trim().toUpperCase();
    const target = passes.find(
      (p) => p.code.toUpperCase() === clean || p.pin.toUpperCase() === clean
    );
    const activeBldg = buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];

    if (!target) {
      return { granted: false, reason: 'El enlace del pase no existe.' };
    }
    const validity = isSingleUsePassValidNow(target);
    if (!validity.ok) {
      return { granted: false, reason: validity.reason || 'El pase ya no es válido.' };
    }
    if (coords.distanceMeters > activeBldg.geofenceRadiusMeters) {
      handleLogActivity({
        title: `Intento Magic Link a distancia bloqueado (${Math.round(coords.distanceMeters)}m)`,
        subtitle: `${target.guestName} · Radio máximo ${activeBldg.geofenceRadiusMeters}m · Apto ${target.unit || '4B'}`,
        time: nowTime(),
        category: 'alerta',
      });
      return {
        granted: false,
        reason: `Estás a ${Math.round(coords.distanceMeters)} m. Acercate a menos de ${activeBldg.geofenceRadiusMeters} m.`,
      };
    }

    // Trigger physical Akuvox E12W Relay 1 + burn single-use pass immediately!
    setDoor1Countdown(10);
    setDoor2Countdown(10);
    void dispatchHardwareRelay(1);

    if (target.singleUse) {
      setPasses((prev) =>
        prev.map((p) =>
          p.id === target.id
            ? {
                ...p,
                status: 'Usado',
                detailText: `Abrió vía Magic Link (${Math.round(coords.distanceMeters)}m) · Quemado`,
              }
            : p
        )
      );
    }

    handleLogActivity({
      title: `Apertura Magic Link ${target.code} (GPS ${Math.round(coords.distanceMeters)}m)`,
      subtitle: `${target.guestName} · Pase ${target.singleUse ? 'quemado (1 uso)' : 'activo'} · Apto ${target.unit || '4B'}`,
      time: nowTime(),
      category: 'qr',
    });

    return { granted: true, burned: target.singleUse };
  };

  const handleRevokePass = (passId: string) => {
    setPasses((prev) =>
      prev.map((p) =>
        p.id === passId
          ? { ...p, status: 'Revocado', detailText: `Revocado · Voz ${p.pin}` }
          : p
      )
    );
    const target = passes.find((p) => p.id === passId);
    if (target) {
      void revokePassInSupabase(target.code);
      handleLogActivity({
        title: `Pase ${target.code} revocado al instante`,
        subtitle: target.guestName,
        time: nowTime(),
        category: 'qr',
      });
    }
  };

  // --- Recurring Staff Passes ---
  const handleCreateRecurringPass = (
    staff: Omit<RecurringPass, 'id' | 'status' | 'currentlyInside' | 'auditLog'>
  ) => {
    const created: RecurringPass = {
      ...staff,
      id: `rec-${Date.now()}`,
      status: 'Activo',
      currentlyInside: false,
      auditLog: [],
    };
    setRecurringPasses((prev) => [created, ...prev]);
    void syncRecurringPassToSupabase(activeBuildingId, created);
    handleLogActivity({
      title: `Permiso recurrente creado: ${staff.name} (${staff.role})`,
      subtitle: `Días ${staff.days.join('/')} · ${staff.startTime}–${staff.endTime} · ${
        staff.rfidTag ? `RFID ${staff.rfidTag}` : 'Acceso móvil'
      }`,
      time: nowTime(),
      category: 'acceso',
    });
  };

  const handleRevokeRecurringPass = (id: string) => {
    const target = recurringPasses.find((r) => r.id === id);
    setRecurringPasses((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Revocado', currentlyInside: false } : r))
    );
    if (target) {
      void revokePassInSupabase(target.pin);
      handleLogActivity({
        title: `Permiso de ${target.name} revocado al instante`,
        subtitle: `PIN ${target.pin}${target.rfidTag ? ` y RFID ${target.rfidTag}` : ''} invalidados`,
        time: nowTime(),
        category: 'acceso',
      });
    }
  };

  const handleToggleStaffShift = (id: string) => {
    const time = nowTime();
    setRecurringPasses((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!r.currentlyInside) {
          handleLogActivity({
            title: `Notificación silenciosa: ingresó ${r.name} (${r.role})`,
            subtitle: `Tag ${r.rfidTag} · Apto ${r.unit}`,
            time,
            category: 'acceso',
          });
          return {
            ...r,
            currentlyInside: true,
            lastCheckIn: time,
            auditLog: [
              {
                id: `aud-${Date.now()}`,
                dateLabel: 'Hoy',
                checkIn: time,
                durationLabel: 'En curso',
              },
              ...r.auditLog,
            ],
          };
        } else {
          const updatedLog = [...r.auditLog];
          if (updatedLog[0] && !updatedLog[0].checkOut) {
            updatedLog[0] = {
              ...updatedLog[0],
              checkOut: time,
              durationLabel: '4h 50m (auditoría)',
            };
          }
          handleLogActivity({
            title: `Notificación silenciosa: salió ${r.name} (${r.role})`,
            subtitle: `Jornada registrada: ${r.lastCheckIn || '08:05'} → ${time} (4h 50m)`,
            time,
            category: 'acceso',
          });
          return {
            ...r,
            currentlyInside: false,
            auditLog: updatedLog,
          };
        }
      })
    );
  };

  // --- Parcels ---
  const handleCreatePreAuthParcel = (
    carrier: string,
    description: string,
    mode: ParcelStorageMode,
    timeWindowLabel: string,
    autoRule: PreAuthParcelRule
  ) => {
    const item: PreAuthorizedParcel = {
      id: `pre-${Date.now()}`,
      unit: BUILDING_INFO.activeUnit,
      residentName: BUILDING_INFO.activeResident,
      carrier,
      description,
      timeWindowLabel,
      autoRule,
      storageMode: mode,
      createdAt: `Hoy ${nowTime()}`,
      status: 'Esperando',
    };
    setPreAuthParcels((prev) => [item, ...prev]);
    const matchedUnit = units.find(
      (u) => u.buildingId === activeBuildingId && u.unitNumber === BUILDING_INFO.activeUnit
    );
    void syncPreAuthPackageToSupabase(activeBuildingId, matchedUnit?.id, item);
    fetch('/api/packages/preauthorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }).catch(() => {});
    handleLogActivity({
      title: `Pre-autorización cargada: ${carrier} (${timeWindowLabel})`,
      subtitle: `${
        autoRule === 'auto_open_after_ocr'
          ? 'Abrir zaguán auto tras OCR'
          : 'Pedir confirmación con foto'
      } · Apto ${BUILDING_INFO.activeUnit}`,
      time: nowTime(),
      category: 'paquete',
    });
  };

  const handleCompletePreAuthParcel = (preAuthId: string, mode: ParcelStorageMode) => {
    const found = preAuthParcels.find((p) => p.id === preAuthId);
    if (!found) return;
    setPreAuthParcels((prev) =>
      prev.map((p) => (p.id === preAuthId ? { ...p, status: 'delivered' } : p))
    );
    completeParcelDeposit(found.carrier, found.unit, mode, 'Pre-autorizado (OCR Visión IA)');
  };

  const handleValidateParcelVisionFrame = async (params: {
    imageBase64?: string;
    mimeType?: string;
    previewPhotoUrl?: string;
    simulatedLabelText?: string;
  }): Promise<ParcelValidationDecision> => {
    const decision = await validateParcelCameraFrame({
      ...params,
      akuvoxDeviceIp: akuvoxConfig.enabled ? akuvoxConfig.deviceIp : undefined,
      preAuthParcels,
      tenants,
    });

    if (decision.outcome === 'auto_opened_delivered' && decision.matchedPreAuth) {
      const targetPreAuth = decision.matchedPreAuth;
      setPreAuthParcels((prev) =>
        prev.map((p) => (p.id === targetPreAuth.id ? { ...p, status: 'delivered' } : p))
      );
      completeParcelDeposit(
        decision.extraction.carrier || targetPreAuth.carrier,
        decision.matchedUnit || targetPreAuth.unit,
        targetPreAuth.storageMode,
        'Pre-autorizado (OCR Visión IA)'
      );
    } else if (decision.outcome === 'needs_resident_confirmation') {
      const unit = decision.matchedUnit || BUILDING_INFO.activeUnit;
      const carrier = decision.extraction.carrier || 'Envío / Correo';
      setPendingSpontaneous({
        id: `spon-${Date.now()}`,
        carrier,
        unit,
        residentName: decision.matchedResidentName || BUILDING_INFO.activeResident,
        detectedLabel: `OCR (${Math.round(decision.extraction.confidence * 100)}%): ${
          decision.extraction.recipientName || 'Destinatario'
        } · ${decision.extraction.trackingCode || carrier}`,
        storageMode,
        secondsLeft: 20,
        status: 'Esperando',
        photoUrl: decision.proofPhotoUrl,
      });
      handleLogActivity({
        title: `Confirmación con foto enviada (${carrier})`,
        subtitle: `Apto ${unit} · ${
          decision.matchedPreAuth
            ? 'Regla pre-autorizada requiere confirmación'
            : 'Paquete no pre-autorizado'
        }`,
        time: nowTime(),
        category: 'paquete',
      });
    }

    return decision;
  };

  const handleStartSpontaneousParcel = (
    carrier: string,
    unit: string,
    mode: ParcelStorageMode
  ) => {
    setPendingSpontaneous({
      id: `spon-${Date.now()}`,
      carrier,
      unit,
      residentName: BUILDING_INFO.activeResident,
      detectedLabel: `${carrier} · Apto ${unit}`,
      storageMode: mode,
      secondsLeft: 20,
      status: 'Esperando',
      photoUrl: ASSETS.parcelReception,
    });
    handleLogActivity({
      title: `Paquete espontáneo detectado (${carrier})`,
      subtitle: `Alerta enviada a Apto ${unit} · Ventana 20 seg`,
      time: nowTime(),
      category: 'ia',
    });
  };

  const handleRespondSpontaneousParcel = (action: 'authorize' | 'reject' | 'timeout-auto') => {
    if (!pendingSpontaneous) return;
    if (action === 'authorize') {
      setPendingSpontaneous({ ...pendingSpontaneous, status: 'Autorizado' });
      completeParcelDeposit(
        pendingSpontaneous.carrier,
        pendingSpontaneous.unit,
        pendingSpontaneous.storageMode,
        'Autorización residente'
      );
    } else if (action === 'timeout-auto') {
      setPendingSpontaneous({ ...pendingSpontaneous, secondsLeft: 0 });
    } else {
      setPendingSpontaneous({ ...pendingSpontaneous, status: 'Rechazado' });
      handleLogActivity({
        title: `Entrega espontánea ${pendingSpontaneous.carrier} rechazada`,
        subtitle: `Decisión del residente · Apto ${pendingSpontaneous.unit}`,
        time: nowTime(),
        category: 'paquete',
      });
    }
  };

  const handleConfirmParcel = (parcelId: string) => {
    setParcels((prev) =>
      prev.map((p) => (p.id === parcelId ? { ...p, status: 'Retirado' } : p))
    );
    const target = parcels.find((p) => p.id === parcelId);
    if (target) {
      handleLogActivity({
        title: `Encomienda ${target.code} retirada`,
        subtitle: `${target.carrier} · Confirmado por Apto ${target.unit}`,
        time: nowTime(),
        category: 'paquete',
      });
    }
  };

  const handleAuthorizeParcelPin = (parcelId: string) => {
    const pin = String(Math.floor(1000 + Math.random() * 8999));
    setParcels((prev) =>
      prev.map((p) => (p.id === parcelId ? { ...p, authorizedPin: pin } : p))
    );
    const target = parcels.find((p) => p.id === parcelId);
    if (target) {
      handleLogActivity({
        title: `PIN ${pin} generado para retiro de ${target.code}`,
        subtitle: 'Autorización a tercero enviada por WhatsApp',
        time: nowTime(),
        category: 'paquete',
      });
    }
    return pin;
  };

  // --- AI Visit Approval ---
  const handleRequestVisitApproval = (
    visitorName: string,
    residentName: string,
    unit: string,
    transcript: string
  ) => {
    setPendingVisit({
      id: `vis-${Date.now()}`,
      visitorName,
      residentName,
      unit,
      spokenTranscript: transcript,
      timestamp: nowTime(),
      photoUrl: ASSETS.lobbyCamera,
      status: 'Pendiente',
    });
    handleLogActivity({
      title: `Portero IA avisó a ${residentName} (${unit})`,
      subtitle: `Visita: ${visitorName} · Push con foto en vivo enviado`,
      time: nowTime(),
      category: 'ia',
    });
  };

  const handleRespondVisit = (approved: boolean) => {
    if (!pendingVisit) return;
    setPendingVisit({ ...pendingVisit, status: approved ? 'Aprobado' : 'Rechazado' });
    if (approved) {
      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      if (akuvoxConfig.secondaryRelayUrl) {
        void dispatchHardwareRelay(2);
      }
      handleLogActivity({
        title: `Ingreso aprobado para ${pendingVisit.visitorName}`,
        subtitle: `Autorizado desde Push/WhatsApp por ${pendingVisit.residentName} (${pendingVisit.unit})`,
        time: nowTime(),
        category: 'acceso',
      });
    } else {
      handleLogActivity({
        title: `Visita de ${pendingVisit.visitorName} rechazada`,
        subtitle: `Respondido por ${pendingVisit.residentName} (${pendingVisit.unit})`,
        time: nowTime(),
        category: 'ia',
      });
    }
  };

  // --- Duress / Security Alerts ---
  const handleTriggerDuressAlert = (source: string) => {
    const time = nowTime();
    const newAlert: SecurityAlert = {
      id: `sec-${Date.now()}`,
      type: source.includes('PIN') ? 'coaccion' : 'sos',
      title: source.includes('PIN')
        ? `ALERTA COACCIÓN SILENCIOSA — Apto ${BUILDING_INFO.activeUnit}`
        : `Alerta SOS activada — Apto ${BUILDING_INFO.activeUnit}`,
      detail: `${source}. Puerta abierta sin alarma sonora para resguardar al residente. Audio y video en vivo enviados a contactos de emergencia y Sala 24/7.`,
      timestamp: `Hoy ${time}`,
      severity: 'critica',
      clipId: `STREAM-COACCION-${time.replace(':', '')}.mp4`,
      unit: BUILDING_INFO.activeUnit,
      resolved: false,
    };
    setSecurityAlerts((prev) => [newAlert, ...prev]);
    handleLogActivity({
      title: newAlert.title,
      subtitle: 'Audio/video enviado silenciosamente a contactos y seguridad',
      time,
      category: 'alerta',
    });
  };

  const handleTriggerLoitering = useCallback(
    (isLateNight: boolean, dwellSeconds: number) => {
      const stamp = isLateNight ? '03:15' : nowTime();
      const clipId = `CLIP-MERODEO-${stamp.replace(':', '')}.mp4`;
      const newAlert: SecurityAlert = {
        id: `sec-loit-${Date.now()}`,
        type: 'merodeo',
        title: isLateNight
          ? `Merodeo detectado en madrugada (${stamp} hs)`
          : `Merodeo frente a puerta (${stamp} hs)`,
        detail: `Persona permaneció ${dwellSeconds}s frente al acceso sin tocar timbre. Video guardado (${clipId})${
          isLateNight ? ' y alerta enviada a Administración.' : '.'
        }`,
        timestamp: `Hoy ${stamp}`,
        severity: isLateNight ? 'alta' : 'alta',
        clipId,
        resolved: false,
      };
      setSecurityAlerts((prev) => [newAlert, ...prev]);
      handleLogActivity({
        title: newAlert.title,
        subtitle: `Clip ${clipId} guardado automáticamente`,
        time: stamp,
        category: 'alerta',
      });
    },
    [dispatchHardwareRelay, handleLogActivity, nowTime]
  );

  // --- Unified Portero IA Keypad / QR / RFID / Duress Validator ---
  const handleValidatePinOrQr = (
    rawCode: string,
    simDay: DayOfWeek,
    simHour: string
  ): { ok: boolean; message: string; silentDuress?: boolean } => {
    const clean = rawCode.trim().toUpperCase();

    // 1. Check Duress PIN FIRST -> Opens normally without warning on screen, triggers silent critical alert!
    if (clean === duressPin) {
      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      handleTriggerDuressAlert(`PIN de Coacción (${duressPin}) ingresado en pantalla de entrada`);
      return {
        ok: true,
        silentDuress: true,
        message: `Bienvenido ${BUILDING_INFO.activeResident} (Apto ${BUILDING_INFO.activeUnit}). Puerta abierta.`,
      };
    }

    // 2. Normal Resident PIN
    if (clean === residentPin) {
      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      handleLogActivity({
        title: `Ingreso residente con PIN · Apto ${BUILDING_INFO.activeUnit}`,
        subtitle: BUILDING_INFO.activeResident,
        time: nowTime(),
        category: 'acceso',
      });
      return {
        ok: true,
        message: `Bienvenido ${BUILDING_INFO.activeResident} (Apto ${BUILDING_INFO.activeUnit}). Puerta abierta.`,
      };
    }

    // 3. Single-use QR / Voice Code passes (strict expiration + auto-destroys immediately on use!)
    const matchedPass = passes.find(
      (p) => p.pin.toUpperCase() === clean || p.code.toUpperCase() === clean
    );
    if (matchedPass) {
      const validity = isSingleUsePassValidNow(matchedPass);
      if (!validity.ok) {
        return {
          ok: false,
          message: `Código ${matchedPass.pin} rechazado: ${validity.reason}`,
        };
      }
      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      setPasses((prev) =>
        prev.map((p) =>
          p.id === matchedPass.id
            ? {
                ...p,
                status: 'Usado',
                detailText: `Ingresó ${nowTime()} hs · Código autodestruido`,
              }
            : p
        )
      );
      handleLogActivity({
        title: `Pase 1 uso ${matchedPass.code} utilizado y destruido`,
        subtitle: `${matchedPass.guestName} · Código voz ${matchedPass.pin} · Apto ${matchedPass.unit || '4B'}`,
        time: nowTime(),
        category: 'qr',
      });
      return {
        ok: true,
        message: `Pase válido para ${matchedPass.guestName}. Puerta abierta — código autodestruido tras este uso.`,
      };
    }

    // 4. Recurring Staff Passes (strict day & time schedule enforcement!)
    const matchedStaff = recurringPasses.find(
      (r) =>
        (r.mobileAccessEnabled && r.pin.toUpperCase() === clean) ||
        (r.rfidTag && r.rfidTag.toUpperCase() === clean)
    );
    if (matchedStaff) {
      const scheduleCheck = isRecurringPassAllowedAt(matchedStaff, simDay, simHour);
      if (!scheduleCheck.ok) {
        handleLogActivity({
          title: `Intento fuera de horario bloqueado: ${matchedStaff.name}`,
          subtitle: `${scheduleCheck.reason} · Apto ${matchedStaff.unit}`,
          time: nowTime(),
          category: 'alerta',
        });
        return {
          ok: false,
          message: `BLOQUEADO: ${matchedStaff.name} (${matchedStaff.role}) — ${scheduleCheck.reason}`,
        };
      }

      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      handleToggleStaffShift(matchedStaff.id);
      return {
        ok: true,
        message: `Acceso autorizado: ${matchedStaff.name} (${matchedStaff.role}). Notificación push enviada al Apto ${matchedStaff.unit}.`,
      };
    }

    // 5. Admin Temporary Master Keys (UTE, OSE, Antel, Ascensores, Bomberos)
    const matchedMaster = masterKeys.find((m) => m.pin.toUpperCase() === clean);
    if (matchedMaster) {
      if (
        matchedMaster.status === 'Revocada' ||
        matchedMaster.status === 'Finalizada' ||
        matchedMaster.status === 'Expirada' ||
        new Date(matchedMaster.expiresAtIso).getTime() <= Date.now()
      ) {
        return {
          ok: false,
          message: `Llave maestra ${matchedMaster.provider} expirada o revocada.`,
        };
      }
      setDoor1Countdown(10);
      setDoor2Countdown(10);
      void dispatchHardwareRelay(1);
      handleToggleMasterKeyEntry(matchedMaster.id);
      return {
        ok: true,
        message: `Llave Maestra ${matchedMaster.provider} (${matchedMaster.technicianName}) validada. Ingreso auditado.`,
      };
    }

    return {
      ok: false,
      message: `Código "${rawCode}" no reconocido o dado de baja.`,
    };
  };

  // --- Login / Logout & Installer Provisioning ---
  const handleLoginSuccess = (user: AppAuthUser) => {
    setCurrentUser(user);
    setViewingPublicWeb(false);
    setActiveBuildingId(user.buildingId);
    setCurrentRole(user.role);
    setResidentPin(user.personalPin);
    if (user.role === 'installer') {
      setActiveScreen('installer');
    } else if (user.role === 'building_admin') {
      setActiveScreen('panel-admin');
    } else {
      setActiveScreen('app-residente');
      setResidentTab('inicio');
    }
    window.scrollTo({ top: 0 });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setViewingPublicWeb(false);
    window.scrollTo({ top: 0 });
  };

  const handleCreateBuilding = (buildingData: Omit<BuildingRecord, 'id'>): string => {
    const newId = `bldg-${Date.now()}`;
    const created: BuildingRecord = { ...buildingData, id: newId };
    setBuildings((prev) => [created, ...prev]);
    void syncBuildingToSupabase(created);
    handleLogActivity({
      title: `Nuevo edificio creado: ${created.name}`,
      subtitle: `${created.address} · Akuvox E12W ${created.akuvoxIp} · Radio GPS ${created.geofenceRadiusMeters}m`,
      time: nowTime(),
      category: 'admin',
    });
    return newId;
  };

  const handleBatchCreateUnits = (
    buildingId: string,
    items: Array<{ unitNumber: string; floor: number; towerBlock?: string }>
  ): number => {
    const existingSet = new Set(
      units
        .filter((u) => u.buildingId === buildingId)
        .map((u) => u.unitNumber.toUpperCase())
    );
    const toInsert: BuildingUnit[] = [];
    for (const item of items) {
      const code = item.unitNumber.trim().toUpperCase();
      if (!code || existingSet.has(code)) continue;
      existingSet.add(code);
      const unitObj: BuildingUnit = {
        id: `unit-${Date.now()}-${code}-${Math.floor(Math.random() * 999)}`,
        buildingId,
        unitNumber: code,
        floor: item.floor,
        towerBlock: item.towerBlock,
        isOccupied: false,
      };
      toInsert.push(unitObj);
      void syncUnitToSupabase(unitObj);
    }
    if (toInsert.length > 0) {
      setUnits((prev) => [...prev, ...toInsert]);
      handleLogActivity({
        title: `Instalador generó ${toInsert.length} apartamentos`,
        subtitle: `Edificio ${buildingId} (${toInsert.slice(0, 4).map((u) => u.unitNumber).join(', ')}...)`,
        time: nowTime(),
        category: 'admin',
      });
    }
    return toInsert.length;
  };

  const handleDeleteUnit = (unitId: string) => {
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  const handleCreateAuthUser = (params: {
    fullName: string;
    email: string;
    password: string;
    role: AppAuthUser['role'];
    buildingId: string;
    unit?: string;
    phone: string;
  }) => {
    const pin = String(Math.floor(1000 + Math.random() * 8999));
    const roleLabels: Record<AppAuthUser['role'], string> = {
      installer: 'Instalador',
      building_admin: 'Administrador',
      owner: 'Propietario',
      tenant: 'Inquilino',
    };
    const newUser: AppAuthUser = {
      id: `auth-${Date.now()}`,
      email: params.email,
      password: params.password,
      fullName: params.fullName,
      role: params.role,
      roleLabel: roleLabels[params.role],
      buildingId: params.buildingId,
      unit: params.unit,
      phone: params.phone,
      personalPin: pin,
      duressPin: computeDuressPin(pin),
    };
    setAuthUsers((prev) => [...prev, newUser]);

    if (params.unit) {
      handleAddTenant(params.unit, params.fullName, params.phone, params.role, params.email);
    } else {
      handleLogActivity({
        title: `Cuenta creada: ${params.fullName} (${roleLabels[params.role]})`,
        subtitle: `${params.email} · Habilitado en Login`,
        time: nowTime(),
        category: 'admin',
      });
    }
  };

  // --- Admin Panel Actions ---
  const handleAddUnit = (unitNumber: string, floor: number, towerBlock?: string) => {
    const created: BuildingUnit = {
      id: `unit-${Date.now()}`,
      buildingId: activeBuildingId,
      unitNumber,
      floor,
      towerBlock,
      isOccupied: false,
    };
    setUnits((prev) => [...prev, created]);
    void syncUnitToSupabase(created);
    handleLogActivity({
      title: `Unidad Apto ${unitNumber} creada (Piso ${floor})`,
      subtitle: `Edificio ${activeBuildingId}`,
      time: nowTime(),
      category: 'admin',
    });
  };

  const handleAddTenant = (
    unit: string,
    name: string,
    phone: string,
    role: UserRole = 'resident',
    email?: string
  ) => {
    const newPin = String(Math.floor(1000 + Math.random() * 8999));
    const created: BuildingTenant = {
      id: `ten-${Date.now()}`,
      buildingId: activeBuildingId,
      unit,
      role,
      name,
      email,
      phone,
      personalPin: newPin,
      duressPin: computeDuressPin(newPin),
      activeCredentials: 2,
      status: 'Activo',
      moveInDate: 'Hoy',
    };
    setTenants((prev) => [created, ...prev]);
    setUnits((prev) =>
      prev.map((u) =>
        u.buildingId === activeBuildingId && u.unitNumber === unit
          ? { ...u, isOccupied: true }
          : u
      )
    );
    const matchingUnit = units.find(
      (u) => u.buildingId === activeBuildingId && u.unitNumber === unit
    );
    void syncTenantToSupabase(created, matchingUnit?.id);
    handleLogActivity({
      title: `Alta de ${role}: ${name} (Apto ${unit})`,
      subtitle: 'Credenciales emitidas con PIN personal y PIN de coacción',
      time: nowTime(),
      category: 'admin',
    });
  };

  const handleOffboardTenant = (tenantId: string) => {
    const target = tenants.find((t) => t.id === tenantId);
    if (!target) return;
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId ? { ...t, status: 'Dado de baja', activeCredentials: 0 } : t
      )
    );
    // Revoke all passes and recurring staff for that unit immediately!
    setPasses((prev) =>
      prev.map((p) =>
        p.unit === target.unit && p.status === 'Activo'
          ? { ...p, status: 'Revocado', detailText: 'Revocado por baja de inquilino' }
          : p
      )
    );
    setRecurringPasses((prev) =>
      prev.map((r) =>
        r.unit === target.unit ? { ...r, status: 'Revocado', currentlyInside: false } : r
      )
    );
    void deactivateTenantInSupabase(tenantId);
    handleLogActivity({
      title: `Baja en 1 clic: ${target.name} (Apto ${target.unit})`,
      subtitle: 'Todos sus códigos QR, PINs y tags RFID fueron revocados automáticamente',
      time: nowTime(),
      category: 'admin',
    });
  };

  const handleIssueMasterKey = (
    provider: MasterKeyRecord['provider'],
    technicianName: string,
    scope: string,
    durationMinutes: number
  ) => {
    const pin = String(Math.floor(1000 + Math.random() * 8999));
    const expiresDate = new Date(Date.now() + durationMinutes * 60 * 1000);
    const validUntil = expiresDate.toLocaleTimeString('es-UY', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const record: MasterKeyRecord = {
      id: `mk-${Date.now()}`,
      buildingId: activeBuildingId,
      provider,
      technicianName,
      pin,
      scope,
      validUntil: `Hoy ${validUntil} hs (${durationMinutes} min)`,
      expiresAtIso: expiresDate.toISOString(),
      status: 'Activa',
    };
    setMasterKeys((prev) => [record, ...prev]);
    void syncMasterKeyToSupabase(record);
    handleLogActivity({
      title: `Llave maestra emitida: ${provider} (PIN ${pin})`,
      subtitle: `${technicianName} · ${scope} · Expira ${validUntil} hs`,
      time: nowTime(),
      category: 'admin',
    });
  };

  const handleToggleMasterKeyEntry = (keyId: string) => {
    const time = nowTime();
    setMasterKeys((prev) =>
      prev.map((k) => {
        if (k.id !== keyId) return k;
        if (k.status === 'Activa') {
          handleLogActivity({
            title: `Ingreso técnico ${k.provider}: ${k.technicianName}`,
            subtitle: `Llave PIN ${k.pin} · ${k.scope}`,
            time,
            category: 'admin',
          });
          return { ...k, status: 'En edificio', enteredAt: time };
        }
        handleLogActivity({
          title: `Salida técnico ${k.provider}: ${k.technicianName}`,
          subtitle: `Ingresó ${k.enteredAt || '—'} · Salió ${time}`,
          time,
          category: 'admin',
        });
        return { ...k, status: 'Finalizada', exitedAt: time };
      })
    );
  };

  const handleRevokeMasterKey = (keyId: string) => {
    const target = masterKeys.find((k) => k.id === keyId);
    setMasterKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, status: 'Revocada' } : k))
    );
    if (target) {
      handleLogActivity({
        title: `Llave maestra ${target.provider} revocada`,
        subtitle: target.technicianName,
        time: nowTime(),
        category: 'admin',
      });
    }
  };

  const handlePublishNotice = (notice: Omit<BuildingNotice, 'id'>) => {
    const created: BuildingNotice = { ...notice, id: `not-${Date.now()}` };
    setNotices((prev) => [created, ...prev]);
    void syncNoticeToSupabase(activeBuildingId, created);
    handleLogActivity({
      title: `Aviso publicado: ${notice.title}`,
      subtitle: `${notice.showOnIntercom ? 'Cartelera Portero IA' : ''}${
        notice.showOnIntercom && notice.sentToApp ? ' + ' : ''
      }${notice.sentToApp ? 'App Residente' : ''}`,
      time: nowTime(),
      category: 'admin',
    });
  };

  const handleDeleteNotice = (noticeId: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== noticeId));
  };

  const handleToggleNoticeIntercom = (noticeId: string) => {
    setNotices((prev) =>
      prev.map((n) => (n.id === noticeId ? { ...n, showOnIntercom: !n.showOnIntercom } : n))
    );
  };

  const handleResolveAlert = (alertId: string) => {
    setSecurityAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, resolved: true } : a))
    );
  };

  const openAlertsCount = securityAlerts.filter((a) => !a.resolved).length;
  const activeBuilding = buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];

  // Standalone Zero-App Public Magic Link Route (/pase/[token])
  if (magicLinkToken) {
    return (
      <PublicMagicLinkView
        token={magicLinkToken}
        passes={passes}
        building={activeBuilding}
        onRedeemMagicLinkPass={handleRedeemMagicLinkPass}
        onExitToPortal={handleExitPublicMagicLink}
      />
    );
  }

  // Unified Login Screen FIRST on App / APK entry
  if (!currentUser && !viewingPublicWeb) {
    return (
      <LoginView
        users={authUsers}
        onLoginSuccess={handleLoginSuccess}
        onOpenWebLanding={() => {
          setViewingPublicWeb(true);
          setActiveScreen('web-principal');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface font-body">
      <SiteHeader
        activeScreen={activeScreen}
        currentUser={currentUser}
        openAlertsCount={openAlertsCount}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onShowLogin={() => setViewingPublicWeb(false)}
      />

      {activeScreen === 'installer' && (
        <InstallerView
          buildings={buildings}
          activeBuildingId={activeBuildingId}
          onChangeActiveBuilding={setActiveBuildingId}
          units={units}
          authUsers={authUsers}
          akuvoxConfig={akuvoxConfig}
          recurringPasses={recurringPasses}
          onChangeAkuvoxConfig={setAkuvoxConfig}
          onTestAkuvoxDoorRelay={async () => {
            setDoor1Countdown(8);
            await dispatchHardwareRelay(1);
          }}
          onUpdateLiveSnapshot={setLiveSnapshotUrl}
          onCreateBuilding={handleCreateBuilding}
          onBatchCreateUnits={handleBatchCreateUnits}
          onDeleteUnit={handleDeleteUnit}
          onCreateAuthUser={handleCreateAuthUser}
          onNavigate={handleNavigate}
        />
      )}

      {activeScreen === 'web-principal' && (
        <WebPrincipalView
          estimatorBrand={estimatorBrand}
          estimatorUnits={estimatorUnits}
          onChangeBrand={setEstimatorBrand}
          onChangeUnits={setEstimatorUnits}
          onNavigate={handleNavigate}
        />
      )}

      {activeScreen === 'portero-ia' && (
        <PorteroIaView
          hardwareModel={hardwareModel}
          onChangeHardwareModel={setHardwareModel}
          akuvoxConfig={akuvoxConfig}
          akuvoxLogs={akuvoxLogs}
          liveSnapshotUrl={liveSnapshotUrl}
          notices={notices}
          passes={passes}
          recurringPasses={recurringPasses}
          masterKeys={masterKeys}
          preAuthParcels={preAuthParcels}
          storageMode={storageMode}
          onChangeStorageMode={setStorageMode}
          unannouncedRule={unannouncedRule}
          pendingVisit={pendingVisit}
          pendingSpontaneous={pendingSpontaneous}
          residentPin={residentPin}
          duressPin={duressPin}
          door1Countdown={door1Countdown}
          door2Countdown={door2Countdown}
          lockerOpenLabel={lockerOpenLabel}
          onRequestVisitApproval={handleRequestVisitApproval}
          onRespondVisit={handleRespondVisit}
          onCompletePreAuthParcel={handleCompletePreAuthParcel}
          onValidateParcelVisionFrame={handleValidateParcelVisionFrame}
          onStartSpontaneousParcel={handleStartSpontaneousParcel}
          onRespondSpontaneousParcel={handleRespondSpontaneousParcel}
          onValidatePinOrQr={handleValidatePinOrQr}
          onAkuvoxBleUnlock={() => handleUnlockDirectDoor('bt-nfc')}
          onTriggerLoitering={handleTriggerLoitering}
          onLogAkuvoxProtocol={handleLogAkuvoxProtocol}
          onNavigate={handleNavigate}
        />
      )}

      {activeScreen === 'app-residente' && (
        <AppResidenteView
          currentUser={currentUser}
          activeBuilding={activeBuilding}
          activeTab={residentTab}
          onChangeTab={setResidentTab}
          passes={passes}
          recurringPasses={recurringPasses}
          parcels={parcels}
          preAuthParcels={preAuthParcels}
          activities={activities}
          notices={notices}
          storageMode={storageMode}
          unannouncedRule={unannouncedRule}
          onChangeUnannouncedRule={setUnannouncedRule}
          pendingVisit={pendingVisit}
          liveSnapshotUrl={liveSnapshotUrl}
          onRespondVisit={handleRespondVisit}
          onSimulateIncomingDoorbell={() =>
            handleRequestVisitApproval(
              'Lucas Fernández',
              BUILDING_INFO.activeResident,
              BUILDING_INFO.activeUnit,
              'Vengo a ver a Martín del 4B, soy Lucas. Traigo unos documentos.'
            )
          }
          onSendDoorbellVoiceReply={(msg) =>
            handleLogActivity({
              title: 'Mensaje de voz enviado al altavoz E12W',
              subtitle: `"${msg}" · Apto ${BUILDING_INFO.activeUnit}`,
              time: nowTime(),
              category: 'ia',
            })
          }
          pendingSpontaneous={pendingSpontaneous}
          onRespondSpontaneousParcel={handleRespondSpontaneousParcel}
          residentPin={residentPin}
          duressPin={duressPin}
          onUpdateResidentPin={setResidentPin}
          door1Countdown={door1Countdown}
          door2Countdown={door2Countdown}
          onUnlockDirectDoor={handleUnlockDirectDoor}
          onCreatePass={handleCreatePass}
          onRevokePass={handleRevokePass}
          onCreateRecurringPass={handleCreateRecurringPass}
          onRevokeRecurringPass={handleRevokeRecurringPass}
          onToggleStaffShift={handleToggleStaffShift}
          onCreatePreAuthParcel={handleCreatePreAuthParcel}
          onConfirmParcel={handleConfirmParcel}
          onAuthorizeParcelPin={handleAuthorizeParcelPin}
          onTriggerDuressAlert={handleTriggerDuressAlert}
          onLogActivity={handleLogActivity}
          onOpenPublicMagicLink={handleOpenPublicMagicLink}
          onNavigateMain={handleNavigate}
        />
      )}

      {activeScreen === 'panel-admin' && (
        <PanelAdminView
          buildings={buildings}
          activeBuildingId={activeBuildingId}
          onChangeActiveBuilding={setActiveBuildingId}
          currentRole={currentRole}
          onChangeCurrentRole={setCurrentRole}
          units={units}
          onAddUnit={handleAddUnit}
          akuvoxConfig={akuvoxConfig}
          onChangeAkuvoxConfig={setAkuvoxConfig}
          onTestAkuvoxDoorRelay={async () => {
            setDoor1Countdown(8);
            await dispatchHardwareRelay(1);
          }}
          onUpdateLiveSnapshot={setLiveSnapshotUrl}
          tenants={tenants}
          recurringPasses={recurringPasses}
          masterKeys={masterKeys}
          notices={notices}
          securityAlerts={securityAlerts}
          accessLogs={accessLogs}
          onAddTenant={handleAddTenant}
          onOffboardTenant={handleOffboardTenant}
          onIssueMasterKey={handleIssueMasterKey}
          onToggleMasterKeyEntry={handleToggleMasterKeyEntry}
          onRevokeMasterKey={handleRevokeMasterKey}
          onPublishNotice={handlePublishNotice}
          onDeleteNotice={handleDeleteNotice}
          onToggleNoticeIntercom={handleToggleNoticeIntercom}
          onResolveAlert={handleResolveAlert}
          onNavigate={handleNavigate}
        />
      )}

      {activeScreen === 'modulo-retrofit' && (
        <ModuloRetrofitView
          preselectedBrand={estimatorBrand}
          preselectedUnits={estimatorUnits}
          lastSurvey={lastSurvey}
          onSubmitSurvey={setLastSurvey}
        />
      )}

      {activeScreen !== 'app-residente' && <SiteFooter />}
    </div>
  );
}
