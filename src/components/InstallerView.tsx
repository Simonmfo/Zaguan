import { FormEvent, useMemo, useState } from 'react';
import {
  AkuvoxConfig,
  AppAuthUser,
  BuildingRecord,
  BuildingUnit,
  MainScreen,
  ParcelStorageMode,
  RecurringPass,
} from '../types/zaguan';
import { AkuvoxConfigPanel } from './AkuvoxConfigPanel';

type InstallerTab = 'edificios' | 'pisos-unidades' | 'usuarios' | 'hardware';

interface InstallerViewProps {
  buildings: BuildingRecord[];
  activeBuildingId: string;
  onChangeActiveBuilding: (buildingId: string) => void;
  units: BuildingUnit[];
  authUsers: AppAuthUser[];
  akuvoxConfig: AkuvoxConfig;
  recurringPasses: RecurringPass[];
  onChangeAkuvoxConfig: (next: AkuvoxConfig) => void;
  onTestAkuvoxDoorRelay: () => Promise<void>;
  onUpdateLiveSnapshot: (url: string | null) => void;
  onCreateBuilding: (building: Omit<BuildingRecord, 'id'>) => string;
  onBatchCreateUnits: (
    buildingId: string,
    items: Array<{ unitNumber: string; floor: number; towerBlock?: string }>
  ) => number;
  onDeleteUnit: (unitId: string) => void;
  onCreateAuthUser: (params: {
    fullName: string;
    email: string;
    password: string;
    role: AppAuthUser['role'];
    buildingId: string;
    unit?: string;
    phone: string;
  }) => void;
  onNavigate: (screen: MainScreen) => void;
}

export function InstallerView({
  buildings,
  activeBuildingId,
  onChangeActiveBuilding,
  units,
  authUsers,
  akuvoxConfig,
  recurringPasses,
  onChangeAkuvoxConfig,
  onTestAkuvoxDoorRelay,
  onUpdateLiveSnapshot,
  onCreateBuilding,
  onBatchCreateUnits,
  onDeleteUnit,
  onCreateAuthUser,
  onNavigate,
}: InstallerViewProps) {
  const [tab, setTab] = useState<InstallerTab>('edificios');
  const [toast, setToast] = useState<string | null>(null);

  // Create Building Form
  const [bName, setBName] = useState('');
  const [bAddress, setBAddress] = useState('');
  const [bCity, setBCity] = useState('Montevideo');
  const [bLat, setBLat] = useState('-34.91462');
  const [bLng, setBLng] = useState('-56.15189');
  const [bRadius, setBRadius] = useState('30');
  const [bStorage, setBStorage] = useState<ParcelStorageMode>('zaguan');
  const [bAkuvoxIp, setBAkuvoxIp] = useState('192.168.1.125');
  const [bAkuvoxUser, setBAkuvoxUser] = useState('admin');

  // Batch Floors & Apartments Builder
  const [floorStart, setFloorStart] = useState(1);
  const [floorEnd, setFloorEnd] = useState(5);
  const [suffixesText, setSuffixesText] = useState('A, B');
  const [towerBlock, setTowerBlock] = useState('A');

  // Single apartment add
  const [singleUnitNum, setSingleUnitNum] = useState('');
  const [singleUnitFloor, setSingleUnitFloor] = useState('1');

  // Create User Form (Admin / Propietario / Inquilino / Instalador)
  const [uRole, setURole] = useState<AppAuthUser['role']>('owner');
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('zaguan2026');
  const [uPhone, setUPhone] = useState('+598 99 ');
  const [uUnit, setUUnit] = useState('');

  const activeBuilding =
    buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];

  const buildingUnits = useMemo(
    () =>
      units
        .filter((u) => u.buildingId === activeBuildingId)
        .sort((a, b) => b.floor - a.floor || a.unitNumber.localeCompare(b.unitNumber)),
    [units, activeBuildingId]
  );

  // Group units by floor descending for visual blueprint
  const unitsByFloor = useMemo(() => {
    const map = new Map<number, BuildingUnit[]>();
    for (const u of buildingUnits) {
      const list = map.get(u.floor) ?? [];
      list.push(u);
      map.set(u.floor, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [buildingUnits]);

  const batchPreviewUnits = useMemo(() => {
    const suffixes = suffixesText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const items: Array<{ unitNumber: string; floor: number; towerBlock?: string }> = [];
    const start = Math.max(0, Math.min(floorStart, floorEnd));
    const end = Math.min(60, Math.max(floorStart, floorEnd));
    for (let f = start; f <= end; f++) {
      for (const suf of suffixes) {
        items.push({
          unitNumber: `${f}${suf}`,
          floor: f,
          towerBlock: towerBlock.trim() || undefined,
        });
      }
    }
    return items;
  }, [floorStart, floorEnd, suffixesText, towerBlock]);

  const handleUseMyGps = () => {
    if (!('geolocation' in navigator)) {
      setToast('Este dispositivo no soporta GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBLat(pos.coords.latitude.toFixed(6));
        setBLng(pos.coords.longitude.toFixed(6));
        setToast('Coordenadas GPS actuales cargadas para el edificio.');
      },
      () => setToast('No se pudo obtener el GPS. Ingresá latitud y longitud manualmente.'),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleCreateBuildingSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!bName.trim() || !bAddress.trim()) return;
    const newId = onCreateBuilding({
      name: bName.trim(),
      address: bAddress.trim(),
      city: bCity.trim() || 'Montevideo',
      latitude: Number(bLat) || -34.91462,
      longitude: Number(bLng) || -56.15189,
      geofenceRadiusMeters: Number(bRadius) || 30,
      parcelStorageMode: bStorage,
      parcelHoursStart: '08:00',
      parcelHoursEnd: '22:00',
      spontaneousTimeoutSec: 20,
      akuvoxIp: bAkuvoxIp.trim() || '192.168.1.120',
      akuvoxApiUser: bAkuvoxUser.trim() || 'admin',
    });
    onChangeActiveBuilding(newId);
    setToast(`Edificio "${bName.trim()}" creado. Ahora podés generar sus pisos y apartamentos.`);
    setBName('');
    setBAddress('');
    setTab('pisos-unidades');
  };

  const handleBatchGenerateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (batchPreviewUnits.length === 0) return;
    const createdCount = onBatchCreateUnits(activeBuildingId, batchPreviewUnits);
    setToast(
      `Se crearon ${createdCount} apartamentos en ${activeBuilding.name} (Pisos ${floorStart} a ${floorEnd}).`
    );
  };

  const handleSingleUnitSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = singleUnitNum.trim().toUpperCase();
    if (!cleaned) return;
    const createdCount = onBatchCreateUnits(activeBuildingId, [
      { unitNumber: cleaned, floor: Number(singleUnitFloor) || 1, towerBlock: towerBlock || undefined },
    ]);
    setToast(
      createdCount > 0
        ? `Apartamento ${cleaned} (Piso ${singleUnitFloor}) agregado.`
        : `El apartamento ${cleaned} ya existía en este edificio.`
    );
    setSingleUnitNum('');
  };

  const handleCreateUserSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!uName.trim() || !uEmail.trim() || !uPassword.trim()) return;
    const needsUnit = uRole === 'owner' || uRole === 'tenant';
    const assignedUnit = needsUnit
      ? (uUnit || buildingUnits[0]?.unitNumber || '1A').toUpperCase()
      : undefined;
    onCreateAuthUser({
      fullName: uName.trim(),
      email: uEmail.trim().toLowerCase(),
      password: uPassword.trim(),
      role: uRole,
      buildingId: activeBuildingId,
      unit: assignedUnit,
      phone: uPhone.trim() || '+598 99 000 000',
    });
    setToast(
      `Usuario ${uEmail.trim()} (${uRole}) creado y habilitado para iniciar sesión en la app.`
    );
    setUName('');
    setUEmail('');
  };

  return (
    <main className="flex-1 bg-surface-container-low py-6">
      <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-lg">
        {/* Top Installer Header */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-sm bg-primary text-on-primary font-mono text-mono-sm">
                  CONSOLA INSTALADOR · SUPER ADMIN
                </span>
                <span className="font-mono text-mono-sm text-secondary">
                  {buildings.length} edificios · {units.length} apartamentos · {authUsers.length} usuarios
                </span>
              </div>
              <h1 className="font-headline text-headline-md text-on-surface">
                Provisionamiento de Edificios, Pisos, Unidades y Akuvox E12W
              </h1>
              <p className="font-body text-body-md text-on-surface-variant">
                Edificio seleccionado: <strong className="text-on-surface">{activeBuilding.name}</strong> ({activeBuilding.address})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Edificio activo"
                value={activeBuildingId}
                onChange={(e) => onChangeActiveBuilding(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-label text-label-sm"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onNavigate('panel-admin')}
                className="px-3.5 py-2 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-on-surface hover:bg-surface-container cursor-pointer"
              >
                Ver Panel Admin
              </button>
              <button
                type="button"
                onClick={() => onNavigate('portero-ia')}
                className="px-3.5 py-2 rounded bg-primary text-on-primary font-label text-label-sm hover:bg-primary-container cursor-pointer"
              >
                Probar Portero E12W →
              </button>
            </div>
          </div>

          <nav
            aria-label="Secciones del instalador"
            className="flex flex-wrap gap-1.5 pt-3 border-t border-outline-variant"
          >
            {(
              [
                { id: 'edificios', label: `1. Edificios (${buildings.length})`, icon: 'domain_add' },
                { id: 'pisos-unidades', label: `2. Pisos y Apartamentos (${buildingUnits.length})`, icon: 'layers' },
                { id: 'usuarios', label: `3. Usuarios y Roles (${authUsers.length})`, icon: 'group_add' },
                { id: 'hardware', label: '4. Hardware Akuvox E12W', icon: 'router' },
              ] as { id: InstallerTab; label: string; icon: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded font-label text-label-sm cursor-pointer ${
                  tab === item.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </section>

        {toast && (
          <div
            role="status"
            className="p-3.5 rounded bg-success-container text-on-success-container border border-success flex items-center justify-between gap-2"
          >
            <span className="font-label text-label-md">{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="font-label text-label-sm underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* TAB 1: EDIFICIOS */}
        {tab === 'edificios' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
            <form
              onSubmit={handleCreateBuildingSubmit}
              className="lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3"
            >
              <h2 className="font-headline text-title-lg text-on-surface">
                Crear Nuevo Edificio
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="font-label text-label-sm text-on-surface-variant">
                    Nombre del edificio
                  </label>
                  <input
                    type="text"
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    placeholder="Ej. Torre Punta Carretas 910"
                    required
                    className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label text-label-sm text-on-surface-variant">
                    Ciudad / Barrio
                  </label>
                  <input
                    type="text"
                    value={bCity}
                    onChange={(e) => setBCity(e.target.value)}
                    placeholder="Montevideo"
                    className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label text-label-sm text-on-surface-variant">
                  Dirección exacta
                </label>
                <input
                  type="text"
                  value={bAddress}
                  onChange={(e) => setBAddress(e.target.value)}
                  placeholder="Ej. Ellauri 910, Punta Carretas"
                  required
                  className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">Latitud GPS</label>
                  <input
                    type="text"
                    value={bLat}
                    onChange={(e) => setBLat(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">Longitud GPS</label>
                  <input
                    type="text"
                    value={bLng}
                    onChange={(e) => setBLng(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">Radio GPS (m)</label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={bRadius}
                    onChange={(e) => setBRadius(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleUseMyGps}
                className="self-start inline-flex items-center gap-1.5 font-label text-label-sm text-primary hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  my_location
                </span>
                <span>Capturar mi ubicación GPS actual en la puerta de la obra</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-outline-variant">
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">IP Akuvox E12W</label>
                  <input
                    type="text"
                    value={bAkuvoxIp}
                    onChange={(e) => setBAkuvoxIp(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">Usuario API</label>
                  <input
                    type="text"
                    value={bAkuvoxUser}
                    onChange={(e) => setBAkuvoxUser(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label text-[11px] text-on-surface-variant">Paquetería</label>
                  <select
                    value={bStorage}
                    onChange={(e) => setBStorage(e.target.value as ParcelStorageMode)}
                    className="rounded border border-outline-variant bg-surface px-2 py-2 font-body text-body-sm"
                  >
                    <option value="zaguan">Zaguán Doble Exclusa</option>
                    <option value="locker">Lockers Inteligentes</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded bg-primary text-on-primary font-label text-label-md hover:bg-primary-container cursor-pointer mt-1"
              >
                + Crear edificio y continuar a Pisos y Apartamentos
              </button>
            </form>

            {/* Existing Buildings List */}
            <section className="lg:col-span-6 flex flex-col gap-3">
              <h2 className="font-headline text-title-lg text-on-surface">
                Edificios instalados ({buildings.length})
              </h2>
              {buildings.map((b) => {
                const countUnits = units.filter((u) => u.buildingId === b.id).length;
                const floorsSet = new Set(units.filter((u) => u.buildingId === b.id).map((u) => u.floor));
                const isSelected = b.id === activeBuildingId;
                return (
                  <article
                    key={b.id}
                    className={`bg-surface-container-lowest border rounded-md p-4 flex flex-col gap-2.5 ${
                      isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-title text-title-md text-on-surface">{b.name}</h3>
                        <p className="font-body text-body-sm text-on-surface-variant">
                          {b.address}, {b.city}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface-variant text-primary shrink-0">
                        {floorsSet.size} pisos · {countUnits} deptos
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 font-mono text-[11px] text-on-surface-variant">
                      <span>E12W: {b.akuvoxIp}</span>
                      <span>GPS: {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} ({b.geofenceRadiusMeters}m)</span>
                      <span>Modo: {b.parcelStorageMode}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeActiveBuilding(b.id);
                          setTab('pisos-unidades');
                        }}
                        className="px-3 py-1.5 rounded bg-primary text-on-primary font-label text-label-sm cursor-pointer"
                      >
                        Editar pisos / deptos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeActiveBuilding(b.id);
                          onNavigate('panel-admin');
                        }}
                        className="px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm cursor-pointer"
                      >
                        Abrir Panel Admin
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}

        {/* TAB 2: GENERADOR DE PISOS Y APARTAMENTOS */}
        {tab === 'pisos-unidades' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Batch Floor & Apartment Generator */}
              <form
                onSubmit={handleBatchGenerateSubmit}
                className="bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3"
              >
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Generador Masivo de Pisos y Deptos
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Creá la estructura completa de <strong>{activeBuilding.name}</strong> en 1 clic.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-label text-[11px] text-on-surface-variant">Piso desde</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={floorStart}
                      onChange={(e) => setFloorStart(Number(e.target.value))}
                      className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label text-[11px] text-on-surface-variant">Piso hasta</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={floorEnd}
                      onChange={(e) => setFloorEnd(Number(e.target.value))}
                      className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label text-[11px] text-on-surface-variant">Torre/Bloque</label>
                    <input
                      type="text"
                      value={towerBlock}
                      onChange={(e) => setTowerBlock(e.target.value)}
                      className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label text-label-sm text-on-surface-variant">
                    Letras o números por piso (separados por coma)
                  </label>
                  <input
                    type="text"
                    value={suffixesText}
                    onChange={(e) => setSuffixesText(e.target.value)}
                    placeholder="Ej. A, B, C  o  01, 02, 03, 04"
                    className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-sm"
                  />
                </div>

                <div className="p-3 rounded bg-surface-container-low border border-outline-variant font-mono text-[11px] text-on-surface-variant">
                  Vista previa: <strong>{batchPreviewUnits.length} apartamentos</strong> (
                  {batchPreviewUnits
                    .slice(0, 6)
                    .map((i) => i.unitNumber)
                    .join(', ')}
                  {batchPreviewUnits.length > 6 ? '...' : ''})
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
                >
                  Generar {batchPreviewUnits.length} apartamentos ahora
                </button>
              </form>

              {/* Single Apartment Form */}
              <form
                onSubmit={handleSingleUnitSubmit}
                className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col gap-2.5"
              >
                <span className="font-title text-label-lg text-on-surface">
                  Agregar apartamento individual (ej. PH, Local PB)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={singleUnitNum}
                    onChange={(e) => setSingleUnitNum(e.target.value)}
                    placeholder="Ej. PH1"
                    className="col-span-2 rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={singleUnitFloor}
                    onChange={(e) => setSingleUnitFloor(e.target.value)}
                    placeholder="Piso"
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="self-start px-3.5 py-2 rounded bg-secondary text-on-secondary font-label text-label-sm cursor-pointer"
                >
                  + Agregar unidad
                </button>
              </form>
            </div>

            {/* Visual Floor-by-Floor Blueprint */}
            <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
              <div className="p-4 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <h2 className="font-headline text-title-lg text-on-surface">
                    Plano de Pisos — {activeBuilding.name}
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    {unitsByFloor.length} pisos cargados · {buildingUnits.length} apartamentos
                  </p>
                </div>
              </div>
              <div className="divide-y divide-outline-variant max-h-[520px] overflow-y-auto">
                {unitsByFloor.length === 0 ? (
                  <div className="p-6 text-center font-body text-body-md text-on-surface-variant">
                    Este edificio todavía no tiene pisos. Usá el generador masivo a la izquierda.
                  </div>
                ) : (
                  unitsByFloor.map(([floorNum, floorUnits]) => (
                    <div key={floorNum} className="p-4 flex flex-col gap-2">
                      <span className="font-mono text-mono-sm text-primary font-semibold">
                        {floorNum === 0 ? 'Planta Baja (PB)' : `Piso ${floorNum}`}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {floorUnits.map((u) => (
                          <div
                            key={u.id}
                            className="px-3 py-2 rounded border border-outline-variant bg-surface-container-low flex items-center gap-2"
                          >
                            <span className="font-mono text-label-md text-on-surface font-semibold">
                              {u.unitNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => onDeleteUnit(u.id)}
                              aria-label={`Eliminar unidad ${u.unitNumber}`}
                              className="text-on-surface-variant hover:text-error cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                close
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: CREAR USUARIOS Y ROLES */}
        {tab === 'usuarios' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
            <form
              onSubmit={handleCreateUserSubmit}
              className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col gap-3"
            >
              <h2 className="font-headline text-title-lg text-on-surface">
                Crear Cuenta de Acceso (Login App)
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Creá administradores, propietarios o inquilinos y probá iniciar sesión con ellos al instante.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as AppAuthUser['role'])}
                  className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-body text-body-sm"
                >
                  <option value="building_admin">Administrador</option>
                  <option value="owner">Propietario</option>
                  <option value="tenant">Inquilino</option>
                  <option value="installer">Instalador</option>
                </select>

                {(uRole === 'owner' || uRole === 'tenant') && (
                  <select
                    value={uUnit || buildingUnits[0]?.unitNumber || ''}
                    onChange={(e) => setUUnit(e.target.value)}
                    className="rounded border border-outline-variant bg-surface px-2.5 py-2 font-mono text-mono-sm"
                  >
                    {buildingUnits.map((u) => (
                      <option key={u.id} value={u.unitNumber}>
                        Apto {u.unitNumber}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <input
                type="text"
                value={uName}
                onChange={(e) => setUName(e.target.value)}
                placeholder="Nombre completo"
                required
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
              />
              <input
                type="email"
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                required
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  placeholder="Contraseña"
                  required
                  className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-sm"
                />
                <input
                  type="tel"
                  value={uPhone}
                  onChange={(e) => setUPhone(e.target.value)}
                  placeholder="+598 99 ..."
                  className="rounded border border-outline-variant bg-surface px-3 py-2 font-body text-body-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded bg-primary text-on-primary font-label text-label-md cursor-pointer"
              >
                + Crear usuario habilitado en Login
              </button>
            </form>

            <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
              <div className="p-4 border-b border-outline-variant">
                <h2 className="font-headline text-title-lg text-on-surface">
                  Usuarios registrados en la App ({authUsers.length})
                </h2>
              </div>
              <div className="divide-y divide-outline-variant">
                {authUsers.map((u) => (
                  <div key={u.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-sm bg-surface-variant text-primary font-label text-label-sm">
                          {u.roleLabel}
                        </span>
                        <span className="font-label text-label-md text-on-surface">
                          {u.fullName}
                        </span>
                        {u.unit && (
                          <span className="font-mono text-mono-sm text-secondary">
                            Apto {u.unit}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">
                        Email: {u.email} · Clave: {u.password} · PIN {u.personalPin}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: HARDWARE AKUVOX E12W */}
        {tab === 'hardware' && (
          <AkuvoxConfigPanel
            buildingId={activeBuildingId}
            config={akuvoxConfig}
            recurringPasses={recurringPasses}
            onChangeConfig={onChangeAkuvoxConfig}
            onTestDoorRelay={onTestAkuvoxDoorRelay}
            onUpdateLiveSnapshot={onUpdateLiveSnapshot}
          />
        )}
      </div>
    </main>
  );
}
