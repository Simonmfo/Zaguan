import { FormEvent, useState } from 'react';
import { ASSETS, BRAND_COMPATIBILITY } from '../data/zaguanData';
import { EstimatorBrandKey, RetrofitBrandKey, SurveyRequest } from '../types/zaguan';
import { SmartImage } from './BrandMark';

interface ModuloRetrofitViewProps {
  preselectedBrand?: EstimatorBrandKey;
  preselectedUnits?: number;
  lastSurvey: SurveyRequest | null;
  onSubmitSurvey: (request: SurveyRequest) => void;
}

const BRAND_KEYS: RetrofitBrandKey[] = ['bellsonic', 'commax', 'fermax', 'intelbras'];

export function ModuloRetrofitView({
  preselectedBrand,
  preselectedUnits,
  lastSurvey,
  onSubmitSurvey,
}: ModuloRetrofitViewProps) {
  const initialBrandTab: RetrofitBrandKey =
    preselectedBrand === 'commax' || preselectedBrand === 'fermax'
      ? preselectedBrand
      : 'bellsonic';

  const [selectedBrand, setSelectedBrand] = useState<RetrofitBrandKey>(initialBrandTab);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');

  const activeInfo = BRAND_COMPATIBILITY[selectedBrand];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedAddr = address.trim();
    const trimmedPhone = phone.trim();
    if (trimmedAddr.length < 5) {
      setFormError('Ingresá una dirección válida en Montevideo (ej. Bvar. España 2468).');
      return;
    }
    if (trimmedPhone.length < 7) {
      setFormError('Ingresá un teléfono o WhatsApp de contacto válido.');
      return;
    }
    setFormError('');
    onSubmitSurvey({
      address: trimmedAddr,
      phone: trimmedPhone,
      brand: activeInfo.tabLabel,
      units: preselectedUnits,
      submittedAt: new Date().toLocaleTimeString('es-UY', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  };

  return (
    <main id="retrofit-hero" className="flex-1">
      {/* Retrofit Hero */}
      <section className="py-section border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center items-start gap-gutter-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-success-container text-on-success-container">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                settings_input_component
              </span>
              <span className="font-label text-label-sm">
                Retrofit Plug &amp; Play · Cero obra en apartamentos
              </span>
            </div>

            <h1 className="font-display text-display-lg-mobile lg:text-display-lg text-on-surface text-balance">
              Convertí tu portero antiguo a portería virtual en 48 horas.
            </h1>

            <p className="font-body text-body-lg text-on-surface-variant max-w-prose text-pretty">
              La mayoría de los edificios de Montevideo construidos entre 1980 y 2010 usan
              cableados analógicos Bellsonic, Commax o Fermax. Nuestro Gateway Híbrido IP/SIP se
              conecta directo al frente de calle y al pestillo eléctrico sin tocar los teléfonos
              internos.
            </p>

            <div className="flex flex-wrap items-center gap-gutter-md">
              <button
                type="button"
                onClick={() => scrollTo('matriz-marcas')}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
                  hub
                </span>
                <span className="font-label text-label-lg">Ver matriz de marcas</span>
              </button>

              <button
                type="button"
                onClick={() => scrollTo('relevamiento')}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded bg-surface-container-lowest text-secondary border border-outline-variant hover:bg-surface-container-low transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="font-label text-label-lg">Agendar relevamiento</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <div className="rounded-md overflow-hidden border border-outline-variant bg-surface-container-low flex flex-col h-full">
              <SmartImage
                src={ASSETS.retrofitModule}
                alt="Módulo Gateway Híbrido IP/SIP conectado a bornera de portero analógico"
                className="w-full h-[360px] lg:flex-1 lg:min-h-[360px] object-cover"
                fallbackIcon="router"
                fallbackLabel="Gateway Híbrido IP/SIP · Conexión en bornera de hall"
              />
              <div className="p-4 bg-surface-container-lowest border-t border-outline-variant flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-mono-sm text-secondary">
                  Interfaz: Relé IP/SIP + Bus 4+n / 2 hilos
                </span>
                <span className="font-label text-label-md text-on-surface">
                  Estándar abierto ONVIF / SIP
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Brand Compatibility Matrix */}
      <section
        id="matriz-marcas"
        className="py-section bg-surface-container-low border-b border-outline-variant"
      >
        <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-xl">
          <div className="flex flex-col gap-2 max-w-2xl">
            <h2 className="font-display text-display-md-mobile lg:text-display-md text-on-surface text-balance">
              Compatibilidad con porteros instalados en Montevideo
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant text-pretty">
              Seleccioná la marca actual del frente de calle para ver el esquema de adaptación y qué
              infraestructura se conserva intacta.
            </p>
          </div>

          <div className="w-full">
            <div
              role="tablist"
              aria-label="Marcas compatibles"
              className="inline-flex flex-wrap p-1 rounded bg-surface-container border border-outline-variant gap-1"
            >
              {BRAND_KEYS.map((key) => {
                const info = BRAND_COMPATIBILITY[key];
                const active = selectedBrand === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    id={`tab-${key}`}
                    aria-selected={active}
                    onClick={() => setSelectedBrand(key)}
                    className={`px-4 py-2 rounded-sm whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
                      active
                        ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="font-label text-label-lg">{info.tabLabel}</span>
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              aria-labelledby={`tab-${selectedBrand}`}
              className="mt-6 bg-surface-container-lowest border border-outline-variant rounded-md p-6 grid grid-cols-1 md:grid-cols-3 gap-gutter-lg"
            >
              <div className="flex flex-col gap-1.5">
                <span className="font-label text-label-sm text-secondary">
                  Topología de cableado
                </span>
                <h3 className="font-title text-title-lg text-on-surface">{activeInfo.title}</h3>
                <p className="font-mono text-mono-md text-primary">{activeInfo.wiring}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-label text-label-sm text-secondary">Qué se conserva</span>
                <p className="font-body text-body-md text-on-surface-variant">{activeInfo.keep}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-label text-label-sm text-secondary">
                  Intervención Zaguán Digital
                </span>
                <p className="font-body text-body-md text-on-surface-variant">
                  {activeInfo.install}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Step Technical Architecture */}
      <section className="py-section border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col gap-gutter-xl">
          <div className="max-w-2xl flex flex-col gap-2">
            <h2 className="font-display text-display-md-mobile lg:text-display-md text-on-surface text-balance">
              Cómo funciona la convivencia analógico + digital
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant">
              Sin cortes prolongados ni ingreso de técnicos a las unidades privadas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-lg items-stretch">
            <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-3 h-full">
              <header className="flex items-center justify-between">
                <span className="font-mono text-mono-md text-primary bg-surface-variant px-2.5 py-1 rounded-sm">
                  Paso 1 · Hall
                </span>
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  settings_input_component
                </span>
              </header>
              <h3 className="font-title text-title-lg text-on-surface">
                Derivación en frente de calle
              </h3>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                Conectamos el módulo puente en la bornera común del edificio. Captura la señal de
                timbre y audio sin alterar la línea de cada apartamento.
              </p>
            </article>

            <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-3 h-full">
              <header className="flex items-center justify-between">
                <span className="font-mono text-mono-md text-primary bg-surface-variant px-2.5 py-1 rounded-sm">
                  Paso 2 · Red IP
                </span>
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  router
                </span>
              </header>
              <h3 className="font-title text-title-lg text-on-surface">
                Audio y video hacia App y Sala
              </h3>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                Al tocar timbre, la llamada llega en simultáneo al teléfono fijo interno, a la app
                del residente con video HD y a nuestra sala 24/7.
              </p>
            </article>

            <article className="bg-surface-container-lowest border border-outline-variant rounded-md p-6 flex flex-col gap-3 h-full">
              <header className="flex items-center justify-between">
                <span className="font-mono text-mono-md text-primary bg-surface-variant px-2.5 py-1 rounded-sm">
                  Paso 3 · Actuación
                </span>
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  garage
                </span>
              </header>
              <h3 className="font-title text-title-lg text-on-surface">
                Apertura dual puerta y garaje
              </h3>
              <p className="font-body text-body-md text-on-surface-variant text-pretty">
                El relé IoT acciona tanto el pestillo peatonal como la placa del portón vehicular,
                habilitando además pases QR temporales por WhatsApp.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Survey / Quote Form */}
      <section id="relevamiento" className="py-section bg-surface-container-low">
        <div className="max-w-[1200px] mx-auto px-page-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter-xl items-center">
          <div className="lg:col-span-5 flex flex-col gap-3">
            <h2 className="font-display text-display-md-mobile lg:text-display-md text-on-surface text-balance">
              Relevamiento técnico sin costo en Montevideo
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant text-pretty">
              Un técnico verifica el estado del cableado y la bornera actual del edificio en 30
              minutos y entrega presupuesto cerrado para la asamblea de copropietarios.
            </p>
            {preselectedUnits && (
              <p className="font-mono text-mono-sm text-primary">
                Configuración preseleccionada: {activeInfo.tabLabel} · {preselectedUnits}{' '}
                apartamentos
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-md p-6 grid grid-cols-1 sm:grid-cols-2 gap-gutter-md"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edificio-dir" className="font-label text-label-md text-on-surface">
                Dirección del edificio
              </label>
              <input
                id="edificio-dir"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej. Bvar. España 2468, Pocitos"
                className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface font-body text-body-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contacto-tel" className="font-label text-label-md text-on-surface">
                WhatsApp o teléfono
              </label>
              <input
                id="contacto-tel"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+598 99 000 000"
                className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface font-body text-body-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {formError && (
              <div className="sm:col-span-2 p-3 rounded bg-error-container text-on-error-container font-label text-label-md flex items-center gap-2">
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  error
                </span>
                <span>{formError}</span>
              </div>
            )}

            {lastSurvey && !formError && (
              <div
                role="status"
                className="sm:col-span-2 p-3 rounded bg-success-container text-on-success-container font-label text-label-md flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  check_circle
                </span>
                <span>
                  Solicitud registrada para {lastSurvey.address}. Coordinamos visita dentro de las
                  próximas 24 hs.
                </span>
              </div>
            )}

            <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-4 pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Solicitar relevamiento en edificio
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
