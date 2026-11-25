import { useCallback, useEffect, useState } from 'react';
import { BUILDING_INFO } from '../data/zaguanData';
import {
  fetchPublicMagicLinkFromSupabase,
  redeemMagicLinkInSupabase,
} from '../services/zaguanDbService';
import { BuildingRecord, QrPass } from '../types/zaguan';
import { calculateHaversineMeters, isSingleUsePassValidNow } from '../utils/accessValidation';
import { ZaguanLogoMark } from './BrandMark';
import { QrPreviewSvg } from './QrPreviewSvg';

interface ResolvedPassData {
  token: string;
  pin: string;
  guestName: string;
  unit: string;
  validityLabel: string;
  accessScope: string;
  singleUse: boolean;
  buildingName: string;
  buildingAddress: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

interface PublicMagicLinkViewProps {
  token: string;
  passes: QrPass[];
  building: BuildingRecord;
  onRedeemMagicLinkPass: (
    token: string,
    coords: { lat: number; lng: number; distanceMeters: number }
  ) => { granted: boolean; reason?: string; burned?: boolean };
  onExitToPortal: () => void;
}

export function PublicMagicLinkView({
  token,
  passes,
  building,
  onRedeemMagicLinkPass,
  onExitToPortal,
}: PublicMagicLinkViewProps) {
  const [loading, setLoading] = useState(true);
  const [resolvedPass, setResolvedPass] = useState<ResolvedPassData | null>(null);
  const [invalidReason, setInvalidReason] = useState<{
    status: string;
    message: string;
  } | null>(null);

  // GPS Proximity state
  const [gpsStatus, setGpsStatus] = useState<'checking' | 'ready' | 'denied' | 'unsupported'>(
    'checking'
  );
  const [visitorCoords, setVisitorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // Swipe / Tap Open state
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openedResult, setOpenedResult] = useState<{
    distanceMeters: number;
    burned: boolean;
    countdown: number;
  } | null>(null);
  const [showQr, setShowQr] = useState(false);

  // 1. Validate Token against Supabase / Express Backend / Local State
  useEffect(() => {
    let cancelled = false;
    const normalizedToken = token.trim().toUpperCase();

    async function validateToken() {
      setLoading(true);
      setInvalidReason(null);

      // A. Try Supabase public RPC if configured
      try {
        const sbRes = await fetchPublicMagicLinkFromSupabase(normalizedToken);
        if (!cancelled && sbRes) {
          if (sbRes.valid) {
            setResolvedPass({
              token: String(sbRes.qr_token || normalizedToken),
              pin: String(sbRes.pin_code || '0000'),
              guestName: String(sbRes.holder_name || 'Visita'),
              unit: String(sbRes.unit_number || '4B'),
              validityLabel: sbRes.valid_until
                ? `Válido hasta ${new Date(String(sbRes.valid_until)).toLocaleTimeString('es-UY', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} hs`
                : 'Pase activo',
              accessScope: String(sbRes.access_scope || 'Acceso peatonal'),
              singleUse: String(sbRes.pass_type || 'one_time') === 'one_time',
              buildingName: String(sbRes.building_name || building.name),
              buildingAddress: String(sbRes.building_address || building.address),
              latitude: Number(sbRes.latitude ?? building.latitude),
              longitude: Number(sbRes.longitude ?? building.longitude),
              geofenceRadiusMeters: Number(sbRes.geofence_radius_meters ?? building.geofenceRadiusMeters),
            });
            setLoading(false);
            return;
          } else if (sbRes.status && sbRes.status !== 'not_found') {
            setInvalidReason({
              status: String(sbRes.status),
              message: String(sbRes.reason || 'Este pase no es válido.'),
            });
            setLoading(false);
            return;
          }
        }
      } catch {
        // Continue to LAN backend / local fallback
      }

      // B. Try local Express backend (/api/pase/:token)
      try {
        const resp = await fetch(`/api/pase/${encodeURIComponent(normalizedToken)}`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!cancelled && resp.headers.get('content-type')?.includes('application/json')) {
          const data = (await resp.json()) as {
            valid?: boolean;
            status?: string;
            reason?: string;
            pass?: {
              token: string;
              pin: string;
              guestName: string;
              unit: string;
              passType: string;
              validUntilIso: string;
              accessScope: string;
              buildingName: string;
              buildingAddress: string;
              latitude: number;
              longitude: number;
              geofenceRadiusMeters: number;
            };
          };
          if (data.valid && data.pass) {
            setResolvedPass({
              token: data.pass.token,
              pin: data.pass.pin,
              guestName: data.pass.guestName,
              unit: data.pass.unit,
              validityLabel: `Válido hasta ${new Date(data.pass.validUntilIso).toLocaleTimeString(
                'es-UY',
                { hour: '2-digit', minute: '2-digit' }
              )} hs`,
              accessScope: data.pass.accessScope,
              singleUse: data.pass.passType === 'one_time',
              buildingName: data.pass.buildingName,
              buildingAddress: data.pass.buildingAddress,
              latitude: data.pass.latitude,
              longitude: data.pass.longitude,
              geofenceRadiusMeters: data.pass.geofenceRadiusMeters,
            });
            setLoading(false);
            return;
          } else if (data.status && data.status !== 'not_found') {
            setInvalidReason({
              status: data.status,
              message: data.reason || 'Este pase ya no es válido.',
            });
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fallback cleanly to local SPA state (e.g. static deploy on Vercel)
      }

      // C. Local app state lookup (works seamlessly on Vercel static deploy)
      if (!cancelled) {
        const localPass = passes.find(
          (p) =>
            p.code.toUpperCase() === normalizedToken ||
            p.pin.toUpperCase() === normalizedToken
        );

        if (!localPass) {
          setInvalidReason({
            status: 'not_found',
            message: `El enlace "${normalizedToken}" no existe o fue eliminado.`,
          });
          setLoading(false);
          return;
        }

        const check = isSingleUsePassValidNow(localPass);
        if (!check.ok) {
          setInvalidReason({
            status: localPass.status.toLowerCase(),
            message:
              localPass.status === 'Usado'
                ? 'Este pase de un solo uso ya fue utilizado y se destruyó automáticamente.'
                : localPass.status === 'Revocado'
                  ? 'Este pase fue revocado por el residente.'
                  : check.reason || 'Este pase expiró fuera de su horario permitido.',
          });
          setLoading(false);
          return;
        }

        setResolvedPass({
          token: localPass.code,
          pin: localPass.pin,
          guestName: localPass.guestName,
          unit: localPass.unit || BUILDING_INFO.activeUnit,
          validityLabel: localPass.validityLabel,
          accessScope: localPass.accessScope,
          singleUse: localPass.singleUse,
          buildingName: building.name,
          buildingAddress: building.address,
          latitude: building.latitude,
          longitude: building.longitude,
          geofenceRadiusMeters: building.geofenceRadiusMeters,
        });
        setLoading(false);
      }
    }

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token, passes, building]);

  // 2. Real Browser Geolocation (`navigator.geolocation`)
  const requestBrowserGps = useCallback(() => {
    if (!resolvedPass) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      setGpsErrorMsg('Este dispositivo no soporta geolocalización GPS.');
      return;
    }

    setGpsStatus('checking');
    setGpsErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const dist = calculateHaversineMeters(
          lat,
          lng,
          resolvedPass.latitude,
          resolvedPass.longitude
        );
        setVisitorCoords({ lat, lng });
        setDistanceMeters(dist);
        setGpsStatus('ready');
      },
      (err) => {
        setGpsStatus('denied');
        setGpsErrorMsg(
          err.code === err.PERMISSION_DENIED
            ? 'Necesitamos permiso de ubicación GPS para confirmar que estás frente a la puerta.'
            : 'No pudimos obtener tu señal GPS. Tocá "Reintentar ubicación" o usá el código de voz.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
  }, [resolvedPass]);

  useEffect(() => {
    if (resolvedPass && !openedResult) {
      requestBrowserGps();
    }
  }, [resolvedPass, openedResult, requestBrowserGps]);

  // Countdown after door opens
  useEffect(() => {
    if (!openedResult || openedResult.countdown <= 0) return;
    const t = setTimeout(() => {
      setOpenedResult((prev) =>
        prev ? { ...prev, countdown: Math.max(0, prev.countdown - 1) } : null
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [openedResult]);

  // Demo location simulator (so user can test inside vs outside 30m geofence from anywhere)
  const simulateGpsAtDistance = (nearDoor: boolean) => {
    if (!resolvedPass) return;
    // ~0.00010 deg lat ≈ 11m; ~0.00165 deg lat ≈ 183m
    const delta = nearDoor ? 0.0001 : 0.00165;
    const lat = resolvedPass.latitude + delta;
    const lng = resolvedPass.longitude;
    const dist = calculateHaversineMeters(lat, lng, resolvedPass.latitude, resolvedPass.longitude);
    setVisitorCoords({ lat, lng });
    setDistanceMeters(dist);
    setGpsStatus('ready');
    setGpsErrorMsg(null);
    setOpenError(null);
  };

  const isWithinGeofence =
    resolvedPass !== null &&
    distanceMeters !== null &&
    distanceMeters <= resolvedPass.geofenceRadiusMeters;

  const handleOpenDoor = async () => {
    if (!resolvedPass || !visitorCoords || distanceMeters === null || opening) return;

    if (distanceMeters > resolvedPass.geofenceRadiusMeters) {
      setOpenError(
        `Estás a ${Math.round(distanceMeters)} m del edificio. Acercate a menos de ${resolvedPass.geofenceRadiusMeters} m.`
      );
      setSwipeProgress(0);
      return;
    }

    setOpening(true);
    setOpenError(null);

    // 1. Try Supabase RPC redemption if configured
    try {
      const sbRedeem = await redeemMagicLinkInSupabase(
        resolvedPass.token,
        visitorCoords.lat,
        visitorCoords.lng
      );
      if (sbRedeem && !sbRedeem.granted) {
        setOpenError(sbRedeem.reason || 'No se pudo autorizar el pase.');
        setOpening(false);
        setSwipeProgress(0);
        return;
      }
    } catch {
      // Continue to Express / local redemption
    }

    // 2. Try Express LAN backend `/api/pase/:token/open` (triggers real E12W Relay 1)
    try {
      const resp = await fetch(`/api/pase/${encodeURIComponent(resolvedPass.token)}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: visitorCoords.lat, lng: visitorCoords.lng }),
        signal: AbortSignal.timeout(3000),
      });
      if (resp.status === 403 || resp.status === 410) {
        const errData = (await resp.json()) as { reason?: string };
        setOpenError(errData.reason || 'Acceso denegado por el servidor.');
        setOpening(false);
        setSwipeProgress(0);
        return;
      }
    } catch {
      // Static deploy fallback handled below
    }

    // 3. Local app sync (burns pass + triggers Akuvox relay + logs access_logs)
    const localRes = onRedeemMagicLinkPass(resolvedPass.token, {
      lat: visitorCoords.lat,
      lng: visitorCoords.lng,
      distanceMeters,
    });

    if (!localRes.granted) {
      setOpenError(localRes.reason || 'El pase ya no es válido.');
      setOpening(false);
      setSwipeProgress(0);
      return;
    }

    setOpening(false);
    setOpenedResult({
      distanceMeters,
      burned: resolvedPass.singleUse,
      countdown: 10,
    });
  };

  const handleSwipeChange = (value: number) => {
    setSwipeProgress(value);
    if (value >= 92 && isWithinGeofence && !opening) {
      void handleOpenDoor();
    }
  };

  return (
    <main className="min-h-screen bg-surface-container-low flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-md overflow-hidden flex flex-col">
        {/* Minimal Zero-App Brand Bar */}
        <header className="px-5 py-4 bg-primary text-on-primary flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ZaguanLogoMark className="w-8 h-8 shrink-0" />
            <div>
              <span className="font-headline text-title-md block leading-tight">Zaguán Digital</span>
              <span className="font-mono text-[11px] text-inverse-primary">
                Pase Web Instantáneo · Sin App
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-white/15 font-mono text-[11px]">
            {token.toUpperCase()}
          </span>
        </header>

        {/* LOADING STATE */}
        {loading && (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin" aria-hidden="true">
              progress_activity
            </span>
            <p className="font-label text-label-lg text-on-surface">
              Validando pase de acceso...
            </p>
            <p className="font-body text-body-sm text-on-surface-variant">
              Verificando vigencia y estado de seguridad en el edificio.
            </p>
          </div>
        )}

        {/* INVALID / EXPIRED / USED PASS SCREEN */}
        {!loading && invalidReason && !openedResult && (
          <div className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-error-container text-on-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl" aria-hidden="true">
                gpp_bad
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-mono-sm text-error uppercase">
                PASE NO VÁLIDO ({invalidReason.status})
              </span>
              <h1 className="font-headline text-headline-sm text-on-surface">
                Este acceso ya no se encuentra disponible
              </h1>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                {invalidReason.message}
              </p>
            </div>
            <div className="w-full p-3.5 rounded-md bg-surface-container-low border border-outline-variant text-left font-body text-body-sm text-on-surface-variant">
              Si necesitás ingresar al edificio, pedile al residente un nuevo enlace o tocá el
              botón del portero <strong>Akuvox E12W</strong> para anunciarte con la IA.
            </div>
            <button
              type="button"
              onClick={onExitToPortal}
              className="w-full py-2.5 px-4 rounded bg-surface-container border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              Volver a Zaguán Digital
            </button>
          </div>
        )}

        {/* SUCCESSFUL DOOR OPEN CONFIRMATION SCREEN */}
        {!loading && openedResult && resolvedPass && (
          <div className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-success-container text-on-success-container flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-5xl" aria-hidden="true">
                lock_open
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-mono-sm text-success uppercase">
                PUERTA DESBLOQUEADA · GPS {Math.round(openedResult.distanceMeters)} M
              </span>
              <h1 className="font-headline text-headline-md text-on-surface">
                ¡Bienvenido, {resolvedPass.guestName}!
              </h1>
              <p className="font-body text-body-md text-on-surface-variant">
                {openedResult.countdown > 0
                  ? `Empujá la puerta principal ahora (abierta por ${openedResult.countdown}s).`
                  : 'La puerta se volvió a bloquear automáticamente.'}
              </p>
            </div>

            <div className="w-full p-3.5 rounded-md bg-surface-container-low border border-outline-variant flex flex-col gap-1 text-left">
              <span className="font-label text-label-md text-on-surface">
                {resolvedPass.buildingName} · Apto {resolvedPass.unit}
              </span>
              <span className="font-body text-body-sm text-on-surface-variant">
                {openedResult.burned
                  ? 'Por seguridad, este pase de un solo uso quedó quemado (usado) y el ingreso fue auditado en access_logs.'
                  : 'Ingreso registrado en la auditoría del edificio.'}
              </span>
            </div>

            <button
              type="button"
              onClick={onExitToPortal}
              className="w-full py-2.5 px-4 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
            >
              Listo
            </button>
          </div>
        )}

        {/* ACTIVE MAGIC LINK SCREEN */}
        {!loading && !invalidReason && !openedResult && resolvedPass && (
          <div className="p-5 flex flex-col gap-4">
            {/* Building & Visitor Header */}
            <div className="flex flex-col gap-1.5 border-b border-outline-variant pb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-sm bg-success-container text-on-success-container font-label text-label-sm">
                  Pase Activo · {resolvedPass.singleUse ? '1 solo uso' : 'Recurrente'}
                </span>
                <span className="font-mono text-mono-sm text-primary">
                  Apto {resolvedPass.unit}
                </span>
              </div>
              <h1 className="font-headline text-headline-sm text-on-surface">
                Hola, {resolvedPass.guestName}
              </h1>
              <p className="font-body text-body-md text-on-surface-variant">
                <strong className="text-on-surface">{resolvedPass.buildingName}</strong> —{' '}
                {resolvedPass.buildingAddress}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="font-mono text-mono-sm text-secondary">
                  {resolvedPass.validityLabel}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${resolvedPass.latitude},${resolvedPass.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-label text-label-sm text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    directions
                  </span>
                  <span>Cómo llegar</span>
                </a>
              </div>
            </div>

            {/* GPS PROXIMITY VERIFICATION BOX */}
            <section className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-title-lg ${
                      isWithinGeofence
                        ? 'text-success'
                        : gpsStatus === 'checking'
                          ? 'text-primary'
                          : 'text-warning'
                    }`}
                    aria-hidden="true"
                  >
                    {isWithinGeofence ? 'my_location' : 'location_searching'}
                  </span>
                  <span className="font-title text-label-lg text-on-surface">
                    Verificación GPS ({resolvedPass.geofenceRadiusMeters} m)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestBrowserGps}
                  className="font-label text-label-sm text-primary hover:underline cursor-pointer"
                >
                  Actualizar
                </button>
              </div>

              {gpsStatus === 'checking' && (
                <p className="font-body text-body-sm text-on-surface-variant">
                  Obteniendo tu ubicación GPS para evitar aperturas accidentales a distancia...
                </p>
              )}

              {gpsStatus === 'ready' && distanceMeters !== null && (
                <div
                  className={`p-2.5 rounded border font-label text-label-sm ${
                    isWithinGeofence
                      ? 'bg-success-container text-on-success-container border-success'
                      : 'bg-warning-container text-on-warning-container border-warning'
                  }`}
                >
                  {isWithinGeofence
                    ? `Ubicación confirmada: estás a ${Math.round(distanceMeters)} m de la puerta (dentro del radio de ${resolvedPass.geofenceRadiusMeters} m).`
                    : `Estás a ${Math.round(distanceMeters)} m del edificio. Acercate a menos de ${resolvedPass.geofenceRadiusMeters} m para habilitar la apertura.`}
                </div>
              )}

              {(gpsStatus === 'denied' || gpsStatus === 'unsupported') && gpsErrorMsg && (
                <p className="p-2.5 rounded bg-warning-container text-on-warning-container font-body text-body-sm">
                  {gpsErrorMsg}
                </p>
              )}

              {/* Convenient test simulator pills so anyone testing remotely can verify both states */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-outline-variant/60">
                <span className="font-mono text-[10px] text-on-surface-variant">
                  Prueba GPS remota:
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => simulateGpsAtDistance(true)}
                    className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[10px] text-secondary hover:border-secondary cursor-pointer"
                  >
                    Simular en puerta (11m)
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateGpsAtDistance(false)}
                    className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant font-mono text-[10px] text-warning hover:border-warning cursor-pointer"
                  >
                    Simular lejos (183m)
                  </button>
                </div>
              </div>
            </section>

            {/* SWIPE OR TAP TO OPEN DOOR CONTROL */}
            <section className="flex flex-col gap-2.5">
              {openError && (
                <div
                  role="alert"
                  className="p-2.5 rounded bg-error-container text-on-error-container font-label text-label-sm"
                >
                  {openError}
                </div>
              )}

              {/* Interactive Swipe Track */}
              <div
                className={`p-3 rounded-lg border transition-colors ${
                  isWithinGeofence
                    ? 'bg-primary/5 border-primary'
                    : 'bg-surface-container border-outline-variant opacity-65'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label text-label-sm text-on-surface">
                    {isWithinGeofence
                      ? 'Deslizá hasta el final o tocá el botón para abrir'
                      : 'Bloqueado por seguridad hasta acercarte a la puerta'}
                  </span>
                  <span className="font-mono text-[11px] text-primary">{swipeProgress}%</span>
                </div>
                <input
                  type="range"
                  aria-label="Deslizar para abrir puerta"
                  min={0}
                  max={100}
                  disabled={!isWithinGeofence || opening}
                  value={swipeProgress}
                  onChange={(e) => handleSwipeChange(Number(e.target.value))}
                  onPointerUp={() => {
                    if (swipeProgress < 92) setSwipeProgress(0);
                  }}
                  className="w-full accent-primary h-3 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="button"
                disabled={!isWithinGeofence || opening}
                onClick={() => void handleOpenDoor()}
                className={`w-full py-4 px-5 rounded-lg font-headline text-title-md flex items-center justify-center gap-2 transition-colors ${
                  isWithinGeofence && !opening
                    ? 'bg-secondary hover:opacity-95 text-on-secondary shadow cursor-pointer'
                    : 'bg-surface-container text-on-surface-variant border border-outline-variant cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                  {isWithinGeofence ? 'lock_open' : 'lock'}
                </span>
                <span>
                  {opening
                    ? 'Abriendo puerta...'
                    : 'Deslizar o Tocar para Abrir Puerta'}
                </span>
              </button>
            </section>

            {/* VOICE BACKUP CARD (4-digit short code + explicit instruction) */}
            <section className="p-4 rounded-lg bg-[#121923] text-white border border-sky-400/30 flex flex-col items-center text-center gap-2">
              <div className="inline-flex items-center gap-1.5 text-sky-300 font-label text-label-sm">
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  record_voice_over
                </span>
                <span>RESPALDO POR VOZ · PORTERO IA</span>
              </div>
              <p className="font-body text-body-sm text-white/85">
                Si preferís, tocá el botón del portero y decile este código a la IA
              </p>
              <div className="px-6 py-2 rounded-md bg-white/10 border border-white/20 font-mono text-display-md-mobile tracking-[0.35em] text-white font-bold">
                {resolvedPass.pin}
              </div>
              <button
                type="button"
                onClick={() => setShowQr((s) => !s)}
                className="font-label text-label-sm text-sky-300 hover:underline cursor-pointer mt-1"
              >
                {showQr ? 'Ocultar código QR' : 'Mostrar código QR para la cámara del E12W'}
              </button>
              {showQr && (
                <div className="w-36 h-36 p-2.5 rounded-lg bg-white text-black mt-1">
                  <QrPreviewSvg seed={resolvedPass.token} />
                </div>
              )}
            </section>

            <button
              type="button"
              onClick={onExitToPortal}
              className="self-center font-label text-label-sm text-on-surface-variant hover:text-primary cursor-pointer"
            >
              Salir de vista visitante →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
