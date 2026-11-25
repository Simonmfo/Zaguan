import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SUPABASE_URL,
  getStoredSupabaseAnonKey,
  setStoredSupabaseAnonKey,
} from '../lib/supabase';
import {
  SupabaseSyncStatus,
  checkSupabaseHealth,
  signInSupabase,
  signOutSupabase,
} from '../services/zaguanDbService';
import {
  AccessEventSource,
  AccessLogRecord,
  AkuvoxConfig,
  BuildingNotice,
  BuildingRecord,
  BuildingTenant,
  BuildingUnit,
  MainScreen,
  MasterKeyRecord,
  RecurringPass,
  SecurityAlert,
  UserRole,
} from '../types/zaguan';
import { AkuvoxConfigPanel } from './AkuvoxConfigPanel';
import { SmartImage } from './BrandMark';

type AdminTab = 'unidades-residentes' | 'llaves-maestras' | 'access-logs' | 'cartelera' | 'hardware-db';

interface PanelAdminViewProps {
  buildings: BuildingRecord[];
  activeBuildingId: string;
  onChangeActiveBuilding: (buildingId: string) => void;
  currentRole: UserRole;
  onChangeCurrentRole: (role: UserRole) => void;
  units: BuildingUnit[];
  onAddUnit: (unitNumber: string, floor: number, towerBlock?: string) => void;
  akuvoxConfig: AkuvoxConfig;
  onChangeAkuvoxConfig: (next: AkuvoxConfig) => void;
  onTestAkuvoxDoorRelay: () => Promise<void>;
  onUpdateLiveSnapshot: (url: string | null) => void;
  tenants: BuildingTenant[];
  recurringPasses: RecurringPass[];
  masterKeys: MasterKeyRecord[];
  notices: BuildingNotice[];
  securityAlerts: SecurityAlert[];
  accessLogs: AccessLogRecord[];
  onAddTenant: (
    unit: string,
    name: string,
    phone: string,
    role: UserRole,
    email?: string
  ) => void;
  onOffboardTenant: (tenantId: string) => void;
  onIssueMasterKey: (
    provider: MasterKeyRecord['provider'],
    technicianName: string,
    scope: string,
    durationMinutes: number
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

const SOURCE_LABELS: Record<AccessEventSource, string> = {
  remote_app: 'Apertura remota / App',
  ai_voice: 'Portero IA (Voz)',
  access_pass: 'Pase QR / RFID / PIN',
  master_key: 'Llave Maestra',
  package_ocr: 'Paquetería OCR',
  duress_pin: 'PIN de Coacción',
  loitering_alert: 'Alerta Merodeo',
  admin_action: 'Administración',
};

export function PanelAdminView({
  buildings,
  activeBuildingId,
  onChangeActiveBuilding,
  currentRole,
  onChangeCurrentRole,
  units,
  onAddUnit,
  akuvoxConfig,
  onChangeAkuvoxConfig,
  onTestAkuvoxDoorRelay,
  onUpdateLiveSnapshot,
  tenants,
  recurringPasses,
  masterKeys,
  notices,
  securityAlerts,
  accessLogs,
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
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('unidades-residentes');
  const [adminToast, setAdminToast] = useState<string | null>(null);

  // Supabase Connection & Auth state
  const [supabaseKeyDraft, setSupabaseKeyDraft] = useState(getStoredSupabaseAnonKey());
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>({
    connected: false,
    message: 'Verificando estado de conexión con Supabase...',
  });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Units & Tenants forms
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitFloor, setNewUnitFloor] = useState('1');
  const [newUnitBlock, setNewUnitBlock] = useState('A');

  const [newTenantUnit, setNewTenantUnit] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantRole, setNewTenantRole] = useState<UserRole>('resident');

  // Master Keys form
  const [mkProvider, setMkProvider] = useState<MasterKeyRecord['provider']>('UTE');
  const [mkTechName, setMkTechName] = useState('');
  const [mkMinutes, setMkMinutes] = useState<number>(120);

  // Notices form
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<BuildingNotice['category']>('Mantenimiento');
  const [showOnIntercom, setShowOnIntercom] = useState(true);
  const [sentToApp, setSentToApp] = useState(true);

  // Access Logs Filters (fecha, unidad, tipo de evento, búsqueda)
  const [logDateFilter, setLogDateFilter] = useState<string>('ALL');
  const [logCustomDate, setLogCustomDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [logUnitFilter, setLogUnitFilter] = useState<string>('ALL');
  const [logTypeFilter, setLogTypeFilter] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');

  useEffect(() => {
    void checkSupabaseHealth().then(setSupabaseStatus);
  }, []);

  const activeBuilding =
    buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];

  // Multi-building isolated slices (simulating RLS isolation in UI)
  const buildingUnits = useMemo(
    () => units.filter((u) => u.buildingId === activeBuildingId),
    [units, activeBuildingId]
  );
  const buildingTenants = useMemo(
    () => tenants.filter((t) => t.buildingId === activeBuildingId),
    [tenants, activeBuildingId]
  );
  const buildingMasterKeys = useMemo(
    () => masterKeys.filter((k) => k.buildingId === activeBuildingId),
    [masterKeys, activeBuildingId]
  );
  const buildingLogs = useMemo(
    () => accessLogs.filter((l) => l.buildingId === activeBuildingId),
    [accessLogs, activeBuildingId]
  );

  const visibleTenants = useMemo(
    () =>
      unitFilter === 'ALL'
        ? buildingTenants
        : buildingTenants.filter((t) => t.unit === unitFilter),
    [buildingTenants, unitFilter]
  );

  const filteredLogs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const q = logSearch.trim().toLowerCase();

    return buildingLogs.filter((log) => {
      if (logDateFilter === 'TODAY' && log.dateKey !== today) return false;
      if (logDateFilter === 'YESTERDAY' && log.dateKey !== yesterday) return false;
      if (logDateFilter === 'CUSTOM' && log.dateKey !== logCustomDate) return false;

      if (logUnitFilter === 'HALL' && log.unit) return false;
      if (logUnitFilter !== 'ALL' && logUnitFilter !== 'HALL' && log.unit !== logUnitFilter) {
        return false;
      }

      if (logTypeFilter !== 'ALL' && log.eventSource !== logTypeFilter) return false;

      if (
        q &&
        !log.actorName.toLowerCase().includes(q) &&
        !log.notes.toLowerCase().includes(q) &&
        !log.methodUsed.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [buildingLogs, logDateFilter, logCustomDate, logUnitFilter, logTypeFilter, logSearch]);

  const openAlerts = securityAlerts.filter((a) => !a.resolved);
  const activeTenantsCount = buildingTenants.filter((t) => t.status === 'Activo').length;
  const activeKeysCount = buildingMasterKeys.filter(
    (k) => k.status === 'Activa' || k.status === 'En edificio'
  ).length;

  const handleAddUnitSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = newUnitNumber.trim().toUpperCase();
    if (!cleaned) return;
    onAddUnit(cleaned, Number(newUnitFloor) || 1, newUnitBlock.trim() || undefined);
    setAdminToast(`Unidad ${cleaned} (Piso ${newUnitFloor}) creada en ${activeBuilding.name}`);
    setNewUnitNumber('');
  };

  const handleAddTenantSubmit = (e: FormEvent) => {
    e.preventDefault();
    const unitCode = (newTenantUnit || buildingUnits[0]?.unitNumber || '').trim().toUpperCase();
    if (!unitCode || !newTenantName.trim()) return;
    onAddTenant(
      unitCode,
      newTenantName.trim(),
      newTenantPhone.trim() || '+598 99 000 000',
      newTenantRole,
      newTenantEmail.trim() || undefined
    );
    setAdminToast(
      `Alta confirmada: ${newTenantName.trim()} (${newTenantRole}) asignado a Apto ${unitCode}`
    );
    setNewTenantName('');
    setNewTenantEmail('');
    setNewTenantPhone('');
  };

  const handleIssueMasterSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tech = mkTechName.trim() || `Cuadrilla ${mkProvider}`;
    onIssueMasterKey(mkProvider, tech, PROVIDER_SCOPES[mkProvider], mkMinutes);
    setAdminToast(
      `Llave maestra temporal emitida para ${mkProvider} (${tech}) · expiración automática en ${mkMinutes} min`
    );
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
    setAdminToast(`Comunicado "${noticeTitle.trim()}" publicado y sincronizado.`);
    setNoticeTitle('');
    setNoticeBody('');
  };

  const handleSaveSupabaseKey = async (e: FormEvent) => {
    e.preventDefault();
    setStoredSupabaseAnonKey(supabaseKeyDraft);
    const status = await checkSupabaseHealth();
    setSupabaseStatus(status);
    setAdminToast(status.message);
  };

  const handleSupabaseLogin = async (e: FormEvent) => {
    e.preventDefault();
    const res = await signInSupabase(authEmail, authPassword);
    setAdminToast(res.message);
    if (res.ok) {
      setAuthPassword('');
      const status = await checkSupabaseHealth();
      setSupabaseStatus(status);
    }
  };

  const handleExportCsv = () => {
    const header = 'Fecha,Hora,Unidad,Actor,Tipo,Metodo,Direccion,Autorizado,Detalle';
    const rows = filteredLogs.map((l) =>
      [
        l.dateKey,
        l.timeLabel,
        l.unit || 'Hall/Común',
        `"${l.actorName.replace(/"/g, '""')}"`,
        SOURCE_LABELS[l.eventSource],
        `"${l.methodUsed.replace(/"/g, '""')}"`,
        l.direction,
        l.granted ? 'SI' : 'NO',
        `"${l.notes.replace(/"/g, '""')}"`,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zaguan_access_logs_${activeBuilding.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setAdminToast(`Exportados ${filteredLogs.length} eventos de auditoría a CSV.`);
  };

  return (
    <main className="flex-1 bg-surface-container-low py-8">
      <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-lg">
        {/* Top Multi-Building & Role Context Header */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-sm bg-primary text-on-primary font-mono text-mono-sm">
                  MULTI-EDIFICIO · RLS
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-sm font-mono text-mono-sm ${
                    supabaseStatus.connected && supabaseStatus.tablesReady
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-warning-container text-on-warning-container'
                  }`}
                >
                  Supabase: {supabaseStatus.connected && supabaseStatus.tablesReady ? 'Conectado Live' : 'Modo Local / Pendiente Key'}
                </span>
              </div>
              <h1 className="font-headline text-headline-md text-on-surface">
                Panel Web de Administración — {activeBuilding.name}
              </h1>
              <p className="font-body text-body-md text-on-surface-variant">
                {activeBuilding.address} · Horario paquetería {activeBuilding.parcelHoursStart}–
                {activeBuilding.parcelHoursEnd} hs · Akuvox E12W ({activeBuilding.akuvoxIp})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Seleccionar edificio"
                value={activeBuildingId}
                onChange={(e) => {
                  onChangeActiveBuilding(e.target.value);
                  setUnitFilter('ALL');
                  setLogUnitFilter('ALL');
                }}
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-label text-label-sm text-on-surface"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Rol activo de sesión"
                value={currentRole}
                onChange={(e) => onChangeCurrentRole(e.target.value as UserRole)}
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-sm text-primary"
              >
                <option value="super_admin">Rol: super_admin</option>
                <option value="building_admin">Rol: building_admin</option>
                <option value="resident">Rol: resident</option>
                <option value="staff">Rol: staff</option>
              </select>

              <button
                type="button"
                onClick={() => onNavigate('portero-ia')}
                className="px-3.5 py-2 rounded bg-primary text-on-primary font-label text-label-sm hover:bg-primary-container cursor-pointer"
              >
                Abrir Portero E12W →
              </button>
            </div>
          </div>

          {/* Admin Section Sub-Navigation */}
          <nav
            aria-label="Módulos del panel de administración"
            className="flex flex-wrap gap-1.5 pt-3 border-t border-outline-variant"
          >
            {(
              [
                { id: 'unidades-residentes', label: `Unidades y Residentes (${buildingUnits.length})`, icon: 'apartment' },
                { id: 'llaves-maestras', label: `Llaves Maestras (${activeKeysCount})`, icon: 'vpn_key' },
                { id: 'access-logs', label: `Access Logs (${buildingLogs.length})`, icon: 'history' },
                { id: 'cartelera', label: `Cartelera (${notices.length})`, icon: 'campaign' },
                { id: 'hardware-db', label: 'Akuvox E12W + Supabase', icon: 'settings_ethernet' },
              ] as { id: AdminTab; label: string; icon: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveAdminTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded font-label text-label-sm transition-colors cursor-pointer ${
                  activeAdminTab === tab.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </section>

        {/* KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-gutter-md">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Unidades / Ocupadas</span>
            <span className="font-headline text-headline-md text-on-surface tabular-nums">
              {buildingUnits.length} / {buildingUnits.filter((u) => u.isOccupied).length}
            </span>
            <span className="font-body text-body-sm text-secondary">{activeTenantsCount} residentes activos</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Llaves maestras activas</span>
            <span className="font-headline text-headline-md text-primary tabular-nums">{activeKeysCount}</span>
            <span className="font-body text-body-sm text-on-surface-variant">Expiración automática activa</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-1">
            <span className="font-label text-label-sm text-on-surface-variant">Eventos auditados</span>
            <span className="font-headline text-headline-md text-on-surface tabular-nums">{buildingLogs.length}</span>
            <span className="font-body text-body-sm text-on-surface-variant">Tabla access_logs en vivo</span>
          </div>
          <div
            className={`border rounded-md p-4 flex flex-col gap-1 ${
              openAlerts.length > 0
                ? 'bg-error-container/40 border-error'
                : 'bg-surface-container-lowest border-outline-variant'
            }`}
          >
            <span className="font-label text-label-sm text-on-surface-variant">Alertas seguridad</span>
            <span
              className={`font-headline text-headline-md tabular-nums ${
                openAlerts.length > 0 ? 'text-error' : 'text-success'
              }`}
            >
              {openAlerts.length} abierta{openAlerts.length === 1 ? '' : 's'}
            </span>
            <span className="font-body text-body-sm text-on-surface-variant">Merodeo / Coacción / Tamper</span>
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

        {/* Open Security Alerts Banner */}
        {openAlerts.length > 0 && (
          <section className="bg-surface-container-lowest border border-error/50 rounded-md overflow-hidden">
            <div className="px-5 py-3 bg-error-container/35 border-b border-error/30 flex items-center justify-between">
              <span className="font-label text-label-md text-on-error-container">
                Alertas activas de seguridad ({openAlerts.length})
              </span>
              <span className="font-mono text-mono-sm text-error">MONITOREO 24/7</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {openAlerts.map((alert) => (
                <div key={alert.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-sm bg-error text-on-error font-label text-label-sm">
                        {alert.type.toUpperCase()}
                      </span>
                      <span className="font-mono text-mono-sm text-on-surface-variant">
                        {alert.timestamp}
                      </span>
                      {alert.clipId && (
                        <span className="font-mono text-mono-sm text-primary">{alert.clipId}</span>
                      )}
                    </div>
                    <p className="font-title text-label-lg text-on-surface">{alert.title}</p>
                    <p className="font-body text-body-sm text-on-surface-variant">{alert.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolveAlert(alert.id)}
                    className="px-3.5 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                  >
                    Marcar revisado
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 1: GESTIÓN DE UNIDADES Y ALTA/BAJA RÁPIDA DE RESIDENTES */}
        {activeAdminTab === 'unidades-residentes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
            {/* Units Management */}
            <section className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
              <div className="p-5 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Unidades (Apartamentos)
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Tocá una unidad para filtrar sus residentes y permisos
                  </p>
                </div>
                {unitFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setUnitFilter('ALL')}
                    className="font-label text-label-sm text-primary hover:underline cursor-pointer"
                  >
                    Ver todas
                  </button>
                )}
              </div>

              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {buildingUnits.map((unit) => {
                  const activeRes = buildingTenants.filter(
                    (t) => t.unit === unit.unitNumber && t.status === 'Activo'
                  ).length;
                  const selected = unitFilter === unit.unitNumber;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => setUnitFilter(selected ? 'ALL' : unit.unitNumber)}
                      className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-low border-outline-variant hover:border-primary'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-title-md font-bold">{unit.unitNumber}</span>
                        <span
                          className={`text-[11px] font-mono ${
                            selected ? 'text-inverse-primary' : 'text-on-surface-variant'
                          }`}
                        >
                          P{unit.floor}
                        </span>
                      </div>
                      <span
                        className={`font-body text-body-sm block mt-1 ${
                          selected ? 'text-white/85' : 'text-on-surface-variant'
                        }`}
                      >
                        {activeRes > 0 ? `${activeRes} activo(s)` : 'Vacante'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={handleAddUnitSubmit}
                className="p-4 bg-surface-container-low border-t border-outline-variant flex flex-col gap-2"
              >
                <span className="font-label text-label-md text-on-surface">Agregar unidad</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(e.target.value)}
                    placeholder="Ej. 602"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={newUnitFloor}
                    onChange={(e) => setNewUnitFloor(e.target.value)}
                    placeholder="Piso"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                  <input
                    type="text"
                    value={newUnitBlock}
                    onChange={(e) => setNewUnitBlock(e.target.value)}
                    placeholder="Bloque"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="self-start px-3.5 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                >
                  + Crear apartamento
                </button>
              </form>
            </section>

            {/* Residents & Rapid Offboarding */}
            <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden flex flex-col">
              <div className="p-5 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Alta y Baja Rápida de Residentes y Staff
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Al dar de baja un residente, el trigger SQL revoca automáticamente todos sus
                    pases QR, PINs y tags RFID.
                  </p>
                </div>
                <span className="font-mono text-mono-sm text-primary">
                  {unitFilter === 'ALL' ? 'Todas' : `Apto ${unitFilter}`}
                </span>
              </div>

              <div className="divide-y divide-outline-variant">
                {visibleTenants.map((t) => (
                  <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-mono-md font-semibold text-primary bg-surface-variant px-2 py-0.5 rounded-sm">
                          Apto {t.unit}
                        </span>
                        <span className="font-label text-label-md text-on-surface">{t.name}</span>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                          {t.role}
                        </span>
                      </div>
                      <span className="font-body text-body-sm text-on-surface-variant">
                        {t.phone} {t.email ? `· ${t.email}` : ''} ·{' '}
                        {t.status === 'Activo'
                          ? `${t.activeCredentials} pase(s) activos · PIN ${t.personalPin}`
                          : 'Todos los pases y permisos revocados'}
                      </span>
                    </div>

                    {t.status === 'Activo' ? (
                      <button
                        type="button"
                        onClick={() => {
                          onOffboardTenant(t.id);
                          setAdminToast(
                            `Baja ejecutada: ${t.name} (Apto ${t.unit}). Todos sus pases asociados fueron revocados automáticamente.`
                          );
                        }}
                        className="px-3 py-1.5 rounded bg-error-container text-on-error-container font-label text-label-sm hover:opacity-90 cursor-pointer shrink-0"
                      >
                        Dar de baja (1 clic)
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 rounded-sm bg-surface-container text-on-surface-variant font-label text-label-sm">
                        Dado de baja
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddTenantSubmit}
                className="p-4 bg-surface-container-low border-t border-outline-variant flex flex-col gap-2.5"
              >
                <span className="font-label text-label-md text-on-surface">
                  Alta rápida de usuario en unidad
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newTenantUnit || buildingUnits[0]?.unitNumber || ''}
                    onChange={(e) => setNewTenantUnit(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  >
                    {buildingUnits.map((u) => (
                      <option key={u.id} value={u.unitNumber}>
                        Apto {u.unitNumber} (Piso {u.floor})
                      </option>
                    ))}
                  </select>
                  <select
                    value={newTenantRole}
                    onChange={(e) => setNewTenantRole(e.target.value as UserRole)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  >
                    <option value="resident">resident (Propietario/Inquilino)</option>
                    <option value="staff">staff (Personal recurrente)</option>
                    <option value="building_admin">building_admin</option>
                  </select>
                  <input
                    type="text"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    placeholder="Nombre completo"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={newTenantEmail}
                    onChange={(e) => setNewTenantEmail(e.target.value)}
                    placeholder="Email (opcional para Supabase Auth)"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                  />
                  <input
                    type="tel"
                    value={newTenantPhone}
                    onChange={(e) => setNewTenantPhone(e.target.value)}
                    placeholder="+598 99 000 000"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="self-start px-4 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                >
                  + Dar de alta y emitir credenciales
                </button>
              </form>
            </section>
          </div>
        )}

        {/* TAB 2: LLAVES MAESTRAS TEMPORALES CON EXPIRACIÓN AUTOMÁTICA */}
        {activeAdminTab === 'llaves-maestras' && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="p-5 border-b border-outline-variant flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-title-lg text-on-surface">
                  Llaves Maestras Temporales con Expiración Automática
                </h2>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Emití accesos acotados para UTE, OSE, Antel, técnicos de ascensor o Bomberos. Al
                  cumplirse el plazo, el permiso pasa automáticamente a estado Expirada.
                </p>
              </div>
              <span className="font-mono text-mono-sm text-secondary">AUTO-EXPIRACIÓN ACTIVA</span>
            </div>

            <form
              onSubmit={handleIssueMasterSubmit}
              className="p-5 bg-surface-container-low border-b border-outline-variant flex flex-col gap-3"
            >
              <div className="flex flex-wrap gap-1.5">
                {(
                  ['UTE', 'OSE', 'Antel', 'Ascensores', 'Bomberos', 'Sanitaria'] as MasterKeyRecord['provider'][]
                ).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => setMkProvider(prov)}
                    className={`px-3 py-1.5 rounded font-label text-label-sm cursor-pointer ${
                      mkProvider === prov
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-lowest border border-outline-variant text-on-surface'
                    }`}
                  >
                    {prov}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={mkTechName}
                  onChange={(e) => setMkTechName(e.target.value)}
                  placeholder={`Técnico / Cuadrilla ${mkProvider}`}
                  className="sm:col-span-2 rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                />
                <select
                  value={mkMinutes}
                  onChange={(e) => setMkMinutes(Number(e.target.value))}
                  className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                >
                  <option value={1}>1 minuto (probar expiración auto)</option>
                  <option value={30}>30 minutos</option>
                  <option value={120}>2 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={480}>8 horas (jornada)</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-mono-sm text-on-surface-variant">
                  Alcance: {PROVIDER_SCOPES[mkProvider]}
                </span>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label text-label-md cursor-pointer"
                >
                  Emitir llave maestra temporal
                </button>
              </div>
            </form>

            <div className="divide-y divide-outline-variant">
              {buildingMasterKeys.map((mk) => (
                <div key={mk.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                        {mk.provider}
                      </span>
                      <span className="font-label text-label-md text-on-surface">
                        {mk.technicianName}
                      </span>
                      <span className="font-mono text-mono-md text-secondary font-semibold">
                        PIN {mk.pin}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-sm font-label text-label-sm ${
                          mk.status === 'Activa' || mk.status === 'En edificio'
                            ? 'bg-success-container text-on-success-container'
                            : mk.status === 'Expirada'
                              ? 'bg-warning-container text-on-warning-container'
                              : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {mk.status}
                      </span>
                    </div>
                    <span className="font-body text-body-sm text-on-surface-variant">
                      {mk.scope} · Vence: {mk.validUntil}
                    </span>
                    {(mk.enteredAt || mk.exitedAt) && (
                      <span className="font-mono text-mono-sm text-primary">
                        Auditoría: Ingresó {mk.enteredAt || '—'}
                        {mk.exitedAt ? ` · Salió ${mk.exitedAt}` : ' · En edificio'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {(mk.status === 'Activa' || mk.status === 'En edificio') && (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleMasterKeyEntry(mk.id)}
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-primary cursor-pointer"
                        >
                          {mk.status === 'En edificio' ? 'Registrar salida' : 'Registrar ingreso'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevokeMasterKey(mk.id)}
                          className="px-3 py-1.5 rounded border border-outline-variant font-label text-label-sm text-error hover:bg-error-container cursor-pointer"
                        >
                          Revocar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: ACCESS LOGS EN TIEMPO REAL CON FILTROS (FECHA, UNIDAD, TIPO) */}
        {activeAdminTab === 'access-logs' && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="p-5 border-b border-outline-variant flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline text-title-lg text-on-surface">
                  Auditoría en Tiempo Real (`access_logs`)
                </h2>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Historial inmutable con foto captura del Akuvox E12W, método usado y filtros por
                  fecha, unidad y tipo de evento.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  download
                </span>
                <span>Exportar CSV ({filteredLogs.length})</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-surface-container-low border-b border-outline-variant grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <select
                aria-label="Filtrar por fecha"
                value={logDateFilter}
                onChange={(e) => setLogDateFilter(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
              >
                <option value="ALL">Fecha: Todas</option>
                <option value="TODAY">Solo Hoy</option>
                <option value="YESTERDAY">Solo Ayer</option>
                <option value="CUSTOM">Fecha específica...</option>
              </select>

              {logDateFilter === 'CUSTOM' && (
                <input
                  type="date"
                  value={logCustomDate}
                  onChange={(e) => setLogCustomDate(e.target.value)}
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                />
              )}

              <select
                aria-label="Filtrar por unidad"
                value={logUnitFilter}
                onChange={(e) => setLogUnitFilter(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
              >
                <option value="ALL">Unidad: Todas</option>
                <option value="HALL">Hall / Áreas comunes</option>
                {buildingUnits.map((u) => (
                  <option key={u.id} value={u.unitNumber}>
                    Apto {u.unitNumber}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtrar por tipo de evento"
                value={logTypeFilter}
                onChange={(e) => setLogTypeFilter(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
              >
                <option value="ALL">Tipo: Todos los eventos</option>
                {(Object.keys(SOURCE_LABELS) as AccessEventSource[]).map((key) => (
                  <option key={key} value={key}>
                    {SOURCE_LABELS[key]}
                  </option>
                ))}
              </select>

              <input
                type="search"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Buscar persona, PIN, detalle..."
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
              />
            </div>

            {/* Filtered Table / Feed */}
            <div className="divide-y divide-outline-variant">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center font-body text-body-md text-on-surface-variant">
                  No hay eventos que coincidan con los filtros seleccionados.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-surface-container-low/50"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {log.snapshotUrl ? (
                        <SmartImage
                          src={log.snapshotUrl}
                          alt={`Captura Akuvox E12W - ${log.actorName}`}
                          className="w-14 h-14 rounded object-cover border border-outline-variant shrink-0"
                          fallbackIcon="videocam"
                          fallbackLabel="E12W"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded bg-surface-container border border-outline-variant flex items-center justify-center shrink-0 text-on-surface-variant">
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {log.direction === 'alert' ? 'warning' : 'key'}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-label text-label-md text-on-surface">
                            {log.actorName}
                          </span>
                          <span className="px-2 py-0.5 rounded-sm bg-surface-variant text-primary font-mono text-[11px]">
                            {log.unit ? `Apto ${log.unit}` : 'Hall / Común'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-sm font-label text-label-sm ${
                              !log.granted || log.direction === 'alert'
                                ? 'bg-error-container text-on-error-container'
                                : 'bg-secondary-container text-on-secondary-container'
                            }`}
                          >
                            {SOURCE_LABELS[log.eventSource]}
                          </span>
                        </div>
                        <p className="font-body text-body-sm text-on-surface-variant">
                          <strong>{log.methodUsed}</strong> — {log.notes}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 font-mono text-mono-sm text-on-surface-variant tabular-nums">
                      <span className="text-on-surface font-medium">{log.timeLabel} hs</span>
                      <span>{log.dateKey}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* TAB 4: CARTELERA DIGITAL Y COMUNICADOS */}
        {activeAdminTab === 'cartelera' && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
            <div className="p-5 border-b border-outline-variant">
              <h2 className="font-headline text-title-lg text-on-surface">
                Cartelera Digital y Comunicados Oficiales
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Sincronización inmediata con la App Residente y pantallas de entrada.
              </p>
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
                placeholder="Detalle del comunicado oficial..."
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-md"
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-label text-label-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOnIntercom}
                      onChange={(e) => setShowOnIntercom(e.target.checked)}
                      className="accent-primary"
                    />
                    Mostrar en pantalla hall
                  </label>
                  <label className="inline-flex items-center gap-2 font-label text-label-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sentToApp}
                      onChange={(e) => setSentToApp(e.target.checked)}
                      className="accent-primary"
                    />
                    Enviar push a App Residente
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
                >
                  Publicar comunicado
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
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleNoticeIntercom(n.id)}
                      className="px-2.5 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm cursor-pointer"
                    >
                      {n.showOnIntercom ? 'Ocultar en hall' : 'Mostrar en hall'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNotice(n.id)}
                      className="px-2.5 py-1.5 rounded border border-outline-variant font-label text-label-sm text-error cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 5: AKUVOX E12W + SUPABASE CONNECTION & AUTH */}
        {activeAdminTab === 'hardware-db' && (
          <div className="flex flex-col gap-gutter-lg">
            {/* Supabase Live Connection & Auth Panel */}
            <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
              <div className="p-5 border-b border-outline-variant flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-sm bg-secondary text-on-secondary font-mono text-mono-sm">
                      SUPABASE POSTGRESQL + RLS
                    </span>
                    <h2 className="font-headline text-title-lg text-on-surface">
                      Conexión Base de Datos y Autenticación
                    </h2>
                  </div>
                  <p className="font-mono text-mono-sm text-on-surface-variant mt-1">
                    Proyecto: {DEFAULT_SUPABASE_URL}
                  </p>
                </div>
                {supabaseStatus.authenticatedEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      void signOutSupabase().then(() => checkSupabaseHealth().then(setSupabaseStatus));
                    }}
                    className="px-3 py-1.5 rounded border border-outline-variant font-label text-label-sm text-error cursor-pointer"
                  >
                    Cerrar sesión ({supabaseStatus.authenticatedEmail})
                  </button>
                )}
              </div>

              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-gutter-lg">
                <form onSubmit={handleSaveSupabaseKey} className="flex flex-col gap-2.5">
                  <label htmlFor="sb-anon" className="font-label text-label-sm text-on-surface">
                    Publishable / Anon Key de Supabase (o definí `VITE_SUPABASE_ANON_KEY` en `.env.local`)
                  </label>
                  <input
                    id="sb-anon"
                    type="password"
                    value={supabaseKeyDraft}
                    onChange={(e) => setSupabaseKeyDraft(e.target.value)}
                    placeholder="sb_publishable_... o eyJhbGci..."
                    className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-sm"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                    >
                      Guardar y probar conexión
                    </button>
                  </div>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Estado: <strong>{supabaseStatus.message}</strong>
                  </p>
                </form>

                <form onSubmit={handleSupabaseLogin} className="flex flex-col gap-2.5">
                  <span className="font-label text-label-sm text-on-surface">
                    Autenticación Supabase Auth (para aplicar políticas RLS por rol/edificio)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="admin@zaguan.uy"
                      className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                      required
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Contraseña"
                      className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="self-start px-4 py-2 rounded bg-secondary text-on-secondary font-label text-label-sm cursor-pointer"
                  >
                    Iniciar sesión con Supabase Auth
                  </button>
                </form>
              </div>
            </section>

            {/* Akuvox E12W Config Panel */}
            <AkuvoxConfigPanel
              buildingId={activeBuildingId}
              config={akuvoxConfig}
              recurringPasses={recurringPasses}
              onChangeConfig={onChangeAkuvoxConfig}
              onTestDoorRelay={onTestAkuvoxDoorRelay}
              onUpdateLiveSnapshot={onUpdateLiveSnapshot}
            />
          </div>
        )}
      </div>
    </main>
  );
}
