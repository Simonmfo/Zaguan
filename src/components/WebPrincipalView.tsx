import {
  ASSETS,
  COMPARISON_ROWS,
  PILLARS,
  calculateRetrofitEstimate,
} from '../data/zaguanData';
import { EstimatorBrandKey, MainScreen } from '../types/zaguan';
import { SmartImage } from './BrandMark';

interface WebPrincipalViewProps {
  estimatorBrand: EstimatorBrandKey;
  estimatorUnits: number;
  onChangeBrand: (brand: EstimatorBrandKey) => void;
  onChangeUnits: (units: number) => void;
  onNavigate: (screen: MainScreen, anchor?: string) => void;
}

export function WebPrincipalView({
  estimatorBrand,
  estimatorUnits,
  onChangeBrand,
  onChangeUnits,
  onNavigate,
}: WebPrincipalViewProps) {
  const estimate = calculateRetrofitEstimate(estimatorBrand, estimatorUnits);

  return (
    <main id="inicio" className="flex-1">
      {/* Hero Split Section */}
      <section className="py-section border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between items-start gap-gutter-lg">
            <div className="flex flex-col items-start gap-gutter-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-success-container text-on-success-container">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  verified_user
                </span>
                <span className="font-label text-label-sm">
                  Portero con IA · Doble Exclusa · DI.GE.F.E. Vigente
                </span>
              </div>

              <h1 className="font-display text-display-lg-mobile lg:text-display-lg text-on-surface text-balance">
                El portero con IA que recibe visitas y paquetes por vos.
              </h1>

              <p className="font-body text-body-lg text-on-surface-variant max-w-prose text-pretty">
                Zaguán actúa como un recepcionista real por voz y pantalla: valida visitas con foto
                en vivo a tu celular, gestiona paquetería de Mercado Libre y PedidosYa por OCR en
                doble exclusa o lockers, y te da control total de accesos en 2 toques sin recablear
                tu edificio.
              </p>

              <div className="flex flex-wrap items-center gap-gutter-md pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('portero-ia')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded bg-primary text-on-primary hover:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
                    record_voice_over
                  </span>
                  <span className="font-label text-label-lg">Probar Portero IA en vivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('app-residente')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded bg-surface-container-lowest text-secondary border border-outline-variant hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
                    smartphone
                  </span>
                  <span className="font-label text-label-lg">Explorar App Residente</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-gutter-lg pt-4 border-t border-outline-variant w-full">
              <div className="flex flex-col">
                <span className="font-headline text-headline-md text-on-surface tabular-nums">
                  2 toques
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Crear pase QR/PIN WhatsApp
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-headline-md text-on-surface tabular-nums">
                  20 seg
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Regla auto en paquetería
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline text-headline-md text-primary tabular-nums">
                  -65%
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Costo vs. guardia física
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <div className="relative rounded-md overflow-hidden border border-outline-variant bg-surface-container-low flex flex-col h-full">
              <SmartImage
                src={ASSETS.heroBuilding}
                alt="Frente de edificio residencial en Montevideo con Portero con IA"
                className="w-full h-[380px] lg:flex-1 lg:min-h-[380px] object-cover"
                fallbackIcon="apartment"
                fallbackLabel="Acceso residencial en Montevideo · Pantalla Portero IA"
              />
              <div className="p-4 bg-surface-container-lowest border-t border-outline-variant flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-title-lg" aria-hidden="true">
                    videocam
                  </span>
                  <span className="font-label text-label-md text-on-surface">
                    Voz Natural IA · OCR Paquetes · Doble Exclusa / Lockers
                  </span>
                </div>
                <span className="font-mono text-mono-sm text-secondary bg-secondary-container px-2 py-0.5 rounded-sm whitespace-nowrap shrink-0">
                  SIN COMODATO
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Core Ecosystem Pillars */}
      <section id="ecosistema" className="py-section bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-xl">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-2 max-w-2xl">
              <h2 className="font-display text-display-md-mobile lg:text-display-md text-on-surface text-balance">
                Cuatro módulos conectados en tiempo real
              </h2>
              <p className="font-body text-body-lg text-on-surface-variant text-pretty">
                Desde la pantalla táctil en la entrada hasta el celular de cada vecino y el tablero
                de la administración. Todo sincronizado al segundo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('panel-admin')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-surface-container-lowest border border-outline-variant text-primary hover:bg-surface-container font-label text-label-md whitespace-nowrap shrink-0 self-start md:self-auto cursor-pointer transition-colors duration-150"
            >
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                admin_panel_settings
              </span>
              <span>Ver Panel Administración</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg items-stretch">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.title}
                className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col justify-between gap-4 h-full"
              >
                <div className="flex flex-col gap-3">
                  <header className="flex items-center gap-3">
                    <span
                      className={`w-10 h-10 rounded ${pillar.accentBg} inline-flex items-center justify-center shrink-0`}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {pillar.icon}
                      </span>
                    </span>
                    <div>
                      <h3 className="font-title text-title-lg text-on-surface">{pillar.title}</h3>
                      <p className="font-body text-body-sm text-on-surface-variant">
                        {pillar.subtitle}
                      </p>
                    </div>
                  </header>
                  <p className="font-body text-body-md text-on-surface-variant text-pretty">
                    {pillar.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => onNavigate(pillar.targetScreen)}
                    className="inline-flex items-center gap-1.5 font-label text-label-md text-primary hover:underline cursor-pointer"
                  >
                    <span>{pillar.ctaLabel}</span>
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Retrofit Capex Estimator */}
      <section id="retrofit" className="py-section border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-start">
          <div className="lg:col-span-5 flex flex-col gap-gutter-md">
            <h2 className="font-display text-display-md-mobile lg:text-display-md text-on-surface text-balance">
              Estimador de ahorro en Retrofit
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant text-pretty">
              Instalación sin obras en departamentos sobre porteros Bellsonic, Commax o Fermax
              existentes, sumando pantalla Portero IA y doble exclusa de paquetería.
            </p>
            <div className="p-4 rounded-md bg-surface-container-low border border-outline-variant flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary mt-0.5" aria-hidden="true">
                architecture
              </span>
              <p className="font-body text-body-md text-on-surface-variant">
                <strong className="text-on-surface font-semibold">Convenio Estudios y SAU:</strong>{' '}
                15% de bonificación en equipamiento e instalación, más videovigilancia de obrador sin
                costo en obra nueva.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-gutter-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-md">
              <div className="flex flex-col gap-2">
                <label htmlFor="brand-select" className="font-label text-label-md text-on-surface">
                  Portero eléctrico instalado
                </label>
                <select
                  id="brand-select"
                  value={estimatorBrand}
                  onChange={(e) => onChangeBrand(e.target.value as EstimatorBrandKey)}
                  className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface font-body text-body-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="bellsonic">Bellsonic Analógico (4+n / 2 hilos)</option>
                  <option value="commax">Commax / Golmar Multihilo</option>
                  <option value="fermax">Fermax VDS / MDS</option>
                  <option value="nuevo">Obra nueva / Sin cableado previo</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="units-select" className="font-label text-label-md text-on-surface">
                  Cantidad de unidades
                </label>
                <select
                  id="units-select"
                  value={estimatorUnits}
                  onChange={(e) => onChangeUnits(Number(e.target.value))}
                  className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface font-body text-body-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={12}>12 apartamentos</option>
                  <option value={24}>24 apartamentos</option>
                  <option value={48}>48 apartamentos</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter-md p-4 rounded bg-surface-container-low border border-outline-variant">
              <div className="flex flex-col gap-1">
                <span className="font-label text-label-sm text-on-surface-variant">
                  Recableado IP tradicional
                </span>
                <span className="font-headline text-headline-md text-on-surface-variant line-through tabular-nums">
                  USD {estimate.traditional.toLocaleString('es-UY')}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label text-label-sm text-primary">Con Gateway Zaguán IA</span>
                <span className="font-headline text-headline-md text-primary tabular-nums">
                  USD {estimate.zaguan.toLocaleString('es-UY')}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label text-label-sm text-success">
                  Ahorro estimado Capex
                </span>
                <span className="font-headline text-headline-md text-success tabular-nums">
                  {estimate.savings}%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="font-mono text-mono-sm text-secondary">{estimate.note}</span>
              <button
                type="button"
                onClick={() => onNavigate('modulo-retrofit', 'relevamiento')}
                className="px-5 py-2.5 rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Agendar visita técnica sin costo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Legal Compliance & Competitive Comparison */}
      <section id="legal" className="py-section bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter-lg">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-mono-sm text-secondary bg-secondary-container px-2.5 py-1 rounded-sm">
                  LEY 19.721 · DECRETO 35/022
                </span>
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  verified_user
                </span>
              </div>
              <h3 className="font-headline text-headline-sm text-on-surface">
                Habilitación DI.GE.F.E. Vigente
              </h3>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                Toda empresa que preste monitoreo electrónico o guardia física en Uruguay debe contar
                con habilitación oficial del Ministerio del Interior renovable cada 3 años. Zaguán
                Digital opera bajo registro vigente auditable.
              </p>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-mono-sm text-primary bg-surface-variant px-2.5 py-1 rounded-sm">
                  LEY 18.251 · TERCERIZACIÓN
                </span>
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  gavel
                </span>
              </div>
              <h3 className="font-headline text-headline-sm text-on-surface">
                Protección Laboral para Consorcios
              </h3>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                Entregamos automáticamente cada mes recibos de sueldo, aportes al BPS, certificados
                de DGI y póliza del BSE para que el consorcio mantenga responsabilidad subsidiaria y
                evite contingencias solidarias.
              </p>
            </div>
          </div>

          <div
            id="comparativa"
            className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden"
          >
            <div className="p-6 border-b border-outline-variant flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-headline text-headline-sm text-on-surface">
                  Comparativa de Modelos en Montevideo
                </h3>
                <p className="font-body text-body-sm text-on-surface-variant">
                  Transparencia operativa frente a portería virtual tradicional y guardia presencial
                </p>
              </div>
              <span className="font-mono text-mono-sm text-secondary tabular-nums">
                SLA Respuesta IA: &lt; 1 seg
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="py-3.5 px-6 font-label text-label-md text-on-surface">
                      Dimensión
                    </th>
                    <th className="py-3.5 px-6 font-label text-label-md text-primary">
                      Zaguán Digital IA
                    </th>
                    <th className="py-3.5 px-6 font-label text-label-md text-on-surface-variant">
                      Portería Virtual Tradicional
                    </th>
                    <th className="py-3.5 px-6 font-label text-label-md text-on-surface-variant">
                      Guardia Presencial 24 hs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body text-body-md">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.dimension}>
                      <td className="py-3.5 px-6 font-medium text-on-surface">{row.dimension}</td>
                      <td
                        className={`py-3.5 px-6 ${
                          row.highlightZaguan ? 'text-success font-medium' : 'text-on-surface'
                        }`}
                      >
                        {row.zaguan}
                      </td>
                      <td className="py-3.5 px-6 text-on-surface-variant">{row.traditional}</td>
                      <td className="py-3.5 px-6 text-on-surface-variant">{row.guard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
