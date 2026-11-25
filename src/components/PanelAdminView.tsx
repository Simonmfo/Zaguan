import { FormEvent, useState } from 'react';
import { BUILDING_INFO } from '../data/zaguanData';
import {
  ActivityEvent,
  AkuvoxConfig,
  BuildingNotice,
  BuildingTenant,
  MainScreen,
  MasterKeyRecord,
  SecurityAlert,
} from '../types/zaguan';
import { AkuvoxConfigPanel } from './AkuvoxConfigPanel';

interface PanelAdminViewProps {
  akuvoxConfig: AkuvoxConfig;
  onChangeAkuvoxConfig: (next: AkuvoxConfig) => void;
  onTestAkuvoxDoorRelay: () => Promise<void>;
  onUpdateLiveSnapshot: (url: string | null) => void;
  tenants: BuildingTenant[];
  masterKeys: MasterKeyRecord[];
  notices: BuildingNotice[];
  securityAlerts: SecurityAlert[];
  activities: ActivityEvent[];
  onAddTenant: (unit: string, name: string, phone: string) => void;
  onOffboardTenant: (tenantId: string) => void;
  onIssueMasterKey: (
    provider: MasterKeyRecord['provider'],
    technicianName: string,
    scope: string,
    validUntil: string
  ) => void;
  onToggleMasterKeyEntry: (keyId: string) => void;
  onRevokeMasterKey: (keyId: string) => void;
  onPublishNotice: (notice: Omit<BuildingNotice, 'id'>) => void;
  onDeleteNotice: (noticeId: string) => void;
  onToggleNoticeIntercom: (noticeId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onNavigate: (screen: MainScreen) => void;
}

const PROVIDER_SCOPES: Record<MasterKeyRecord['provider'], string> = {
  UTE: 'Tablero General Eléctrico + Medidores PB',
  OSE: 'Sala de Bombas + Tanques Azotea',
  Antel: 'Montante Fibra Óptica + Rack PB',
  Ascensores: 'Hall PB + Sala de Máquinas Ascensor',
  Bomberos: 'Acceso Total Emergencia (Exclusas 1 y 2 + Garaje)',
  Sanitaria: 'Subsuelo + Cámaras Sanitarias',
};

export function PanelAdminView({
  akuvoxConfig,
  onChangeAkuvoxConfig,
  onTestAkuvoxDoorRelay,
  onUpdateLiveSnapshot,
  tenants,
  masterKeys,
  notices,
  securityAlerts,
  activities,
  onAddTenant,
  onOffboardTenant,
  onIssueMasterKey,
  onToggleMasterKeyEntry,
  onRevokeMasterKey,
  onPublishNotice,
  onDeleteNotice,
  onToggleNoticeIntercom,
  onResolveAlert,
  onNavigate,
}: PanelAdminViewProps) {
  const [adminToast, setAdminToast] = useState<string | null>(null);

  // New Tenant Form
  const [newUnit, setNewUnit] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');

  // New Master Key Form
  const [mkProvider, setMkProvider] = useState<MasterKeyRecord['provider']>('UTE');
  const [mkTechName, setMkTechName] = useState('');
  const [mkDuration, setMkDuration] = useState('Hoy 19:00 hs');

  // New Notice Form
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<BuildingNotice['category']>('Mantenimiento');
  const [showOnIntercom, setShowOnIntercom] = useState(true);
  const [sentToApp, setSentToApp] = useState(true);

  const openAlerts = securityAlerts.filter((a) => !a.resolved);
  const activeTenants = tenants.filter((t) => t.status === 'Activo');
  const activeKeys = masterKeys.filter((k) => k.status === 'Activa' || k.status === 'En edificio');

  const handleAddTenantSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newUnit.trim() || !newTenantName.trim()) return;
    onAddTenant(
      newUnit.trim().toUpperCase(),
      newTenantName.trim(),
      newTenantPhone.trim() || '+598 99 000 000'
    );
    setAdminToast(
      `Alta confirmada: ${newTenantName.trim()} (${newUnit.trim().toUpperCase()}) con PIN personal y PIN de coacción`
    );
    setNewUnit('');
    setNewTenantName('');
    setNewTenantPhone('');
  };

  const handleIssueMasterSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tech = mkTechName.trim() || `Cuadrilla ${mkProvider}`;
    onIssueMasterKey(mkProvider, tech, PROVIDER_SCOPES[mkProvider], mkDuration);
    setAdminToast(`Llave maestra temporal emitida para ${mkProvider} (${tech})`);
    setMkTechName('');
  };

  const handlePublishNoticeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeBody.trim()) return;
    onPublishNotice({
      title: noticeTitle.trim(),
      body: noticeBody.trim(),
      category: noticeCategory,
      dateLabel: 'Publicado ahora',
      showOnIntercom,
      sentToApp,
    });
    setAdminToast(
      `Comunicado "${noticeTitle.trim()}" publicado en ${[
        showOnIntercom ? 'Cartelera Portero IA' : '',
        sentToApp ? 'App Residente' : '',
      ]
        .filter(Boolean)
        .join(' y ')}`
    );
    setNoticeTitle('');
    setNoticeBody('');
  };

  return (
    <main className="flex-1 bg-surface-container-low py-8">
      <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-lg">
        {/* Top Header */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                Panel Copropiedad · {BUILDING_INFO.name}
              </span>
              <span className="font-mono text-mono-sm text-secondary">
                Ley 18.251 &amp; DI.GE.F.E. Al Día
              </span>
            </div>
            <h1 className="font-headline text-headline-md text-on-surface">
              Panel para la Administración y Copropiedad
            </h1>
            <p className="font-body text-body-md text-on-surface-variant">
              Control centralizado de mudanzas en 1 clic, llaves maestras auditadas para servicios
              públicos, cartelera digital del hall y alertas de seguridad nocturna.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('portero-ia')}
              className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container cursor-pointer"
            >
              Ver Cartelera en Portero IA →
            </button>
            <button
              type="button"
              onClick={() => onNavigate('app-residente')}
              className="px-4 py-2 rounded bg-surface-container-low border border-outline-variant text-on-surface font-label text-label-md hover:bg-surface-container cursor-pointer"
            >
              Ver Comunicados en App
            </button>
          </div>
        </section>

        {/* KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-gutter-md">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">
              Unidades activas
            </span>
            <span className="font-headline text-headline-md text-on-surface tabular-nums">
              {activeTenants.length} / {tenants.length}
            </span>
            <span className="font-body text-body-sm text-secondary">
              Revocación en 1 clic activa
            </span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">
              Llaves maestras activas
            </span>
            <span className="font-headline text-headline-md text-primary tabular-nums">
              {activeKeys.length}
            </span>
            <span className="font-body text-body-sm text-on-surface-variant">
              UTE · OSE · Antel · Ascensores
            </span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">
              Avisos en Cartelera IA
            </span>
            <span className="font-headline text-headline-md text-on-surface tabular-nums">
              {notices.filter((n) => n.showOnIntercom).length}
            </span>
            <span className="font-body text-body-sm text-on-surface-variant">
              Sincronizados con pantalla hall
            </span>
          </div>
          <div
            className={`border rounded-md p-4 flex flex-col gap-1 ${
              openAlerts.length > 0
                ? 'bg-error-container/40 border-error'
                : 'bg-surface-container-lowest border-outline-variant'
            }`}
          >
            <span className="font-label text-label-sm text-on-surface-variant">
              Alertas de seguridad
            </span>
            <span
              className={`font-headline text-headline-md tabular-nums ${
                openAlerts.length > 0 ? 'text-error' : 'text-success'
              }`}
            >
              {openAlerts.length} abierta{openAlerts.length === 1 ? '' : 's'}
            </span>
            <span className="font-body text-body-sm text-on-surface-variant">
              Merodeo nocturno / Coacción
            </span>
          </div>
        </section>

        {adminToast && (
          <div
            role="status"
            className="p-3.5 rounded bg-success-container text-on-success-container border border-success flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                check_circle
              </span>
              <span className="font-label text-label-md">{adminToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setAdminToast(null)}
              className="font-label text-label-sm underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Hardware Integration Panel: Akuvox E12W */}
        <AkuvoxConfigPanel
          config={akuvoxConfig}
          onChangeConfig={onChangeAkuvoxConfig}
          onTestDoorRelay={onTestAkuvoxDoorRelay}
          onUpdateLiveSnapshot={onUpdateLiveSnapshot}
        />

        {/* Security Alerts Section (Merodeo & Duress PIN) */}
        {securityAlerts.length > 0 && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error" aria-hidden="true">
                  shield_with_heart
                </span>
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Centro de Alertas (Merodeo en Madrugada y Coacción Silenciosa)
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Clips grabados automáticamente por el Portero IA y eventos silenciosos de pánico
                  </p>
                </div>
              </div>
              <span className="font-mono text-mono-sm text-error">MONITOREO 24/7</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {securityAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`px-6 py-4 flex flex-wrap items-center justify-between gap-4 ${
                    !alert.resolved && alert.severity === 'critica'
                      ? 'bg-error-container/35'
                      : !alert.resolved
                        ? 'bg-warning-container/25'
                        : ''
                  }`}
                >
                  <div className="flex flex-col gap-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-sm font-label text-label-sm ${
                          alert.type === 'coaccion' || alert.type === 'sos'
                            ? 'bg-error text-on-error'
                            : 'bg-warning-container text-on-warning-container'
                        }`}
                      >
                        {alert.type === 'coaccion'
                          ? 'COACCIÓN SILENCIOSA'
                          : alert.type === 'sos'
                            ? 'SOS RESIDENTE'
                            : 'MERODEO NOCTURNO'}
                      </span>
                      <span className="font-mono text-mono-sm text-on-surface-variant">
                        {alert.timestamp}
                      </span>
                      {alert.clipId && (
                        <span className="font-mono text-mono-sm text-primary bg-surface-variant px-2 py-0.5 rounded-sm">
                          VIDEO: {alert.clipId}
                        </span>
                      )}
                    </div>
                    <h3 className="font-title text-title-md text-on-surface">{alert.title}</h3>
                    <p className="font-body text-body-sm text-on-surface-variant">{alert.detail}</p>
                  </div>

                  {!alert.resolved ? (
                    <button
                      type="button"
                      onClick={() => {
                        onResolveAlert(alert.id);
                        setAdminToast(`Incidente "${alert.title}" marcado como revisado`);
                      }}
                      className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-sm hover:bg-primary-container cursor-pointer shrink-0"
                    >
                      Marcar revisado
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-sm bg-success-container text-on-success-container font-label text-label-sm">
                      Revisado ✓
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main 2-column Admin Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
          {/* MODULE 1: ALTA Y BAJA DE INQUILINOS (1 CLIC) */}
          <section className="lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-outline-variant flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-title-lg text-on-surface">
                  1. Alta y Baja de Inquilinos (1 clic)
                </h2>
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  person_remove
                </span>
              </div>
              <p className="font-body text-body-sm text-on-surface-variant">
                Al dar de baja a un inquilino saliente, todos sus PINs, pases QR, personal de
                limpieza y permisos desaparecen al instante.
              </p>
            </div>

            <div className="divide-y divide-outline-variant">
              {tenants.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-mono-md font-semibold text-primary bg-surface-variant px-2 py-0.5 rounded-sm">
                        Apto {t.unit}
                      </span>
                      <span className="font-label text-label-md text-on-surface truncate">
                        {t.name}
                      </span>
                    </div>
                    <span className="font-body text-body-sm text-on-surface-variant">
                      {t.phone} · Desde {t.moveInDate} ·{' '}
                      {t.status === 'Activo'
                        ? `${t.activeCredentials} códigos/permisos activos`
                        : '0 permisos (todos revocados)'}
                    </span>
                  </div>

                  {t.status === 'Activo' ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOffboardTenant(t.id);
                        setAdminToast(
                          `Baja ejecutada: ${t.name} (Apto ${t.unit}). Todos sus códigos y permisos fueron eliminados.`
                        );
                      }}
                      className="px-3 py-1.5 rounded bg-error-container text-on-error-container font-label text-label-sm hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Dar de baja (1 clic)
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-sm bg-surface-container text-on-surface-variant font-label text-label-sm shrink-0">
                      Dado de baja
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Quick Onboarding Form */}
            <form
              onSubmit={handleAddTenantSubmit}
              className="p-4 bg-surface-container-low border-t border-outline-variant flex flex-col gap-2.5"
            >
              <span className="font-label text-label-md text-on-surface">
                Dar de alta nuevo inquilino
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Depto (ej. 1A)"
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                  required
                />
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Nombre completo"
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                  required
                />
                <input
                  type="tel"
                  value={newTenantPhone}
                  onChange={(e) => setNewTenantPhone(e.target.value)}
                  placeholder="+598 99 ..."
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                />
              </div>
              <button
                type="submit"
                className="self-start px-4 py-2 rounded bg-primary text-on-primary font-label text-label-sm hover:bg-primary-container cursor-pointer"
              >
                + Registrar inquilino y habilitar App
              </button>
            </form>
          </section>

          {/* MODULE 2: LLAVES MAESTRAS TEMPORALES */}
          <section className="lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-outline-variant flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-title-lg text-on-surface">
                  2. Llaves Maestras Temporales (Servicios y Emergencias)
                </h2>
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  vpn_key
                </span>
              </div>
              <p className="font-body text-body-sm text-on-surface-variant">
                Acceso auditado para técnicos de ascensores, UTE, OSE, Antel o Bomberos con
                registro exacto de quién entró y a qué hora.
              </p>
            </div>

            <form
              onSubmit={handleIssueMasterSubmit}
              className="p-4 bg-surface-container-low border-b border-outline-variant flex flex-col gap-2.5"
            >
              <div className="flex flex-wrap gap-1.5">
                {(
                  ['UTE', 'OSE', 'Antel', 'Ascensores', 'Bomberos', 'Sanitaria'] as MasterKeyRecord['provider'][]
                ).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => setMkProvider(prov)}
                    className={`px-2.5 py-1 rounded font-label text-label-sm cursor-pointer ${
                      mkProvider === prov
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-lowest border border-outline-variant text-on-surface'
                    }`}
                  >
                    {prov}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={mkTechName}
                  onChange={(e) => setMkTechName(e.target.value)}
                  placeholder={`Técnico / Cuadrilla ${mkProvider}`}
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                />
                <select
                  value={mkDuration}
                  onChange={(e) => setMkDuration(e.target.value)}
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                >
                  <option value="Hoy 19:00 hs">Válida 2 horas</option>
                  <option value="Hoy 22:00 hs">Válida hoy (hasta 22 hs)</option>
                  <option value="Emergencia 60 min">Emergencia inmediata (60 min)</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-mono-sm text-on-surface-variant">
                  Alcance: {PROVIDER_SCOPES[mkProvider]}
                </span>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label text-label-sm hover:opacity-95 cursor-pointer"
                >
                  Emitir llave temporal
                </button>
              </div>
            </form>

            <div className="divide-y divide-outline-variant">
              {masterKeys.map((mk) => (
                <div key={mk.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                        {mk.provider}
                      </span>
                      <span className="font-label text-label-md text-on-surface">
                        {mk.technicianName}
                      </span>
                      <span className="font-mono text-mono-sm text-secondary">PIN {mk.pin}</span>
                    </div>
                    <span className="font-body text-body-sm text-on-surface-variant">
                      {mk.scope} · Vence: {mk.validUntil}
                    </span>
                    {(mk.enteredAt || mk.exitedAt) && (
                      <span className="font-mono text-mono-sm text-primary">
                        Auditoría: Ingresó {mk.enteredAt || '—'}
                        {mk.exitedAt ? ` · Salió ${mk.exitedAt}` : ' · Actualmente en edificio'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(mk.status === 'Activa' || mk.status === 'En edificio') && (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleMasterKeyEntry(mk.id)}
                          className="px-2.5 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                        >
                          {mk.status === 'En edificio' ? 'Registrar salida' : 'Registrar ingreso'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevokeMasterKey(mk.id)}
                          className="px-2.5 py-1.5 rounded border border-outline-variant font-label text-label-sm text-error hover:bg-error-container cursor-pointer"
                        >
                          Revocar
                        </button>
                      </>
                    )}
                    {mk.status !== 'Activa' && mk.status !== 'En edificio' && (
                      <span className="px-2 py-0.5 rounded-sm bg-surface-container text-on-surface-variant font-label text-label-sm">
                        {mk.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* MODULE 3: CARTELERA DIGITAL & COMUNICADOS OFICIALES */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
          <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="p-5 border-b border-outline-variant flex items-center justify-between">
              <div>
                <h2 className="font-headline text-title-lg text-on-surface">
                  3. Cartelera Digital (Pantalla Portero IA + App Residente)
                </h2>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Publicá avisos que aparecen automáticamente en la pantalla del portero en reposo y
                  como comunicados oficiales en el celular de los vecinos.
                </p>
              </div>
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                campaign
              </span>
            </div>

            <form
              onSubmit={handlePublishNoticeSubmit}
              className="p-5 bg-surface-container-low border-b border-outline-variant flex flex-col gap-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="Ej. Corte de agua programado el jueves"
                  className="sm:col-span-2 rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                  required
                />
                <select
                  value={noticeCategory}
                  onChange={(e) => setNoticeCategory(e.target.value as BuildingNotice['category'])}
                  className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                >
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Aviso">Aviso general</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                placeholder="Detalle del aviso para vecinos y visitas..."
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOnIntercom}
                      onChange={(e) => setShowOnIntercom(e.target.checked)}
                      className="accent-primary"
                    />
                    Mostrar en pantalla Portero IA
                  </label>
                  <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sentToApp}
                      onChange={(e) => setSentToApp(e.target.checked)}
                      className="accent-primary"
                    />
                    Enviar comunicado a App Residente
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container cursor-pointer"
                >
                  Publicar aviso ahora
                </button>
              </div>
            </form>

            <div className="divide-y divide-outline-variant">
              {notices.map((n) => (
                <div key={n.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                        {n.category}
                      </span>
                      <span className="font-title text-label-lg text-on-surface">{n.title}</span>
                    </div>
                    <p className="font-body text-body-sm text-on-surface-variant">{n.body}</p>
                    <div className="flex items-center gap-3 font-mono text-mono-sm text-secondary">
                      <span>{n.showOnIntercom ? '✓ En Pantalla Portero IA' : '— Oculto en Portero'}</span>
                      <span>{n.sentToApp ? '✓ Enviado a App' : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleNoticeIntercom(n.id)}
                      className="px-2.5 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-on-surface cursor-pointer"
                    >
                      {n.showOnIntercom ? 'Ocultar en hall' : 'Mostrar en hall'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNotice(n.id)}
                      className="px-2.5 py-1.5 rounded border border-outline-variant font-label text-label-sm text-error hover:bg-error-container cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Global Building Audit Stream */}
          <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="p-5 border-b border-outline-variant flex items-center justify-between">
              <div>
                <h2 className="font-headline text-title-lg text-on-surface">
                  Auditoría Global del Edificio
                </h2>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Todos los eventos de Portero IA, App y Administración
                </p>
              </div>
              <span className="font-mono text-mono-sm text-secondary">LIVE</span>
            </div>
            <div className="divide-y divide-outline-variant max-h-[420px] overflow-y-auto">
              {activities.map((ev) => (
                <div key={ev.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-label text-label-md text-on-surface truncate">{ev.title}</p>
                    <p className="font-body text-body-sm text-on-surface-variant truncate">
                      {ev.subtitle}
                    </p>
                  </div>
                  <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums shrink-0">
                    {ev.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
