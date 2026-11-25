import { useState } from 'react';
import { MainScreen } from '../types/zaguan';
import { ZaguanLogoMark } from './BrandMark';

interface SiteHeaderProps {
  activeScreen: MainScreen;
  openAlertsCount?: number;
  onNavigate: (screen: MainScreen, anchor?: string) => void;
}

export function SiteHeader({
  activeScreen,
  openAlertsCount = 0,
  onNavigate,
}: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (screen: MainScreen, anchor?: string) => {
    setMobileMenuOpen(false);
    onNavigate(screen, anchor);
  };

  const handleQuoteClick = () => {
    setMobileMenuOpen(false);
    if (activeScreen === 'modulo-retrofit') {
      onNavigate('modulo-retrofit', 'relevamiento');
    } else if (activeScreen === 'web-principal') {
      onNavigate('web-principal', 'retrofit');
    } else {
      onNavigate('modulo-retrofit', 'relevamiento');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-outline-variant">
      <div className="max-w-[1200px] mx-auto px-page-margin h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand wordmark */}
        <button
          type="button"
          onClick={() => handleNav('web-principal', 'inicio')}
          className="flex items-center gap-2.5 text-on-surface whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
        >
          <ZaguanLogoMark className="w-9 h-9 shrink-0" />
          <span className="font-headline text-title-lg tracking-tight whitespace-nowrap shrink-0">
            Zaguán Digital
          </span>
        </button>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 lg:gap-8">
          <button
            type="button"
            onClick={() => handleNav('portero-ia')}
            className={`font-label text-label-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
              activeScreen === 'portero-ia'
                ? 'text-primary font-semibold underline underline-offset-8 decoration-2'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            Portero IA
          </button>
          <button
            type="button"
            onClick={() => handleNav('app-residente')}
            className={`font-label text-label-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
              activeScreen === 'app-residente'
                ? 'text-primary font-semibold underline underline-offset-8 decoration-2'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            App Residente
          </button>
          <button
            type="button"
            onClick={() => handleNav('panel-admin')}
            className={`inline-flex items-center gap-1.5 font-label text-label-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
              activeScreen === 'panel-admin'
                ? 'text-primary font-semibold underline underline-offset-8 decoration-2'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span>Panel Admin</span>
            {openAlertsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error font-mono text-mono-sm leading-none tabular-nums">
                {openAlertsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleNav('modulo-retrofit')}
            className={`font-label text-label-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
              activeScreen === 'modulo-retrofit'
                ? 'text-primary font-semibold underline underline-offset-8 decoration-2'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            Solución Retrofit
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleQuoteClick}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-primary text-on-primary hover:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="font-label text-label-lg">Cotizar</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low cursor-pointer"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Menú móvil"
          className="md:hidden border-t border-outline-variant bg-surface-container-lowest px-page-margin py-3 flex flex-col gap-1"
        >
          <button
            type="button"
            onClick={() => handleNav('web-principal', 'inicio')}
            className={`text-left px-3 py-2.5 rounded font-label text-label-lg ${
              activeScreen === 'web-principal'
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            Inicio
          </button>
          <button
            type="button"
            onClick={() => handleNav('portero-ia')}
            className={`text-left px-3 py-2.5 rounded font-label text-label-lg ${
              activeScreen === 'portero-ia'
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            Portero con IA (Pantalla Entrada)
          </button>
          <button
            type="button"
            onClick={() => handleNav('app-residente')}
            className={`text-left px-3 py-2.5 rounded font-label text-label-lg ${
              activeScreen === 'app-residente'
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            App Residente
          </button>
          <button
            type="button"
            onClick={() => handleNav('panel-admin')}
            className={`text-left px-3 py-2.5 rounded font-label text-label-lg flex items-center justify-between ${
              activeScreen === 'panel-admin'
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            <span>Panel Administración</span>
            {openAlertsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-error text-on-error font-mono text-mono-sm">
                {openAlertsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleNav('modulo-retrofit')}
            className={`text-left px-3 py-2.5 rounded font-label text-label-lg ${
              activeScreen === 'modulo-retrofit'
                ? 'bg-surface-container-low text-primary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            Solución Retrofit
          </button>
        </nav>
      )}
    </header>
  );
}
