import { useState } from 'react';
import { AppAuthUser, MainScreen } from '../types/zaguan';
import { ZaguanLogoMark } from './BrandMark';

interface SiteHeaderProps {
  activeScreen: MainScreen;
  currentUser: AppAuthUser | null;
  openAlertsCount?: number;
  onNavigate: (screen: MainScreen, anchor?: string) => void;
  onLogout: () => void;
  onShowLogin: () => void;
}

export function SiteHeader({
  activeScreen,
  currentUser,
  openAlertsCount = 0,
  onNavigate,
  onLogout,
  onShowLogin,
}: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (screen: MainScreen, anchor?: string) => {
    setMobileMenuOpen(false);
    onNavigate(screen, anchor);
  };

  const navItems: Array<{ screen: MainScreen; label: string; badge?: number }> = (() => {
    if (!currentUser) {
      return [
        { screen: 'web-principal', label: 'Inicio' },
        { screen: 'portero-ia', label: 'Portero IA' },
        { screen: 'modulo-retrofit', label: 'Retrofit' },
      ];
    }
    if (currentUser.role === 'installer') {
      return [
        { screen: 'installer', label: 'Instalador' },
        { screen: 'panel-admin', label: 'Panel Admin', badge: openAlertsCount },
        { screen: 'portero-ia', label: 'Portero E12W' },
        { screen: 'app-residente', label: 'App Residente' },
        { screen: 'modulo-retrofit', label: 'Retrofit' },
      ];
    }
    if (currentUser.role === 'building_admin') {
      return [
        { screen: 'panel-admin', label: 'Panel Admin', badge: openAlertsCount },
        { screen: 'portero-ia', label: 'Portero E12W' },
        { screen: 'app-residente', label: 'Vista Residente' },
      ];
    }
    // owner or tenant
    return [
      { screen: 'app-residente', label: currentUser.role === 'owner' ? 'Mi App (Propietario)' : 'Mi App (Inquilino)' },
      { screen: 'portero-ia', label: 'Probar Portero E12W' },
    ];
  })();

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-outline-variant">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-page-margin h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <button
          type="button"
          onClick={() =>
            currentUser
              ? handleNav(
                  currentUser.role === 'installer'
                    ? 'installer'
                    : currentUser.role === 'building_admin'
                      ? 'panel-admin'
                      : 'app-residente'
                )
              : handleNav('web-principal', 'inicio')
          }
          className="flex items-center gap-2 text-on-surface whitespace-nowrap shrink-0 cursor-pointer rounded"
        >
          <ZaguanLogoMark className="w-8 h-8 shrink-0" />
          <div className="flex flex-col text-left">
            <span className="font-headline text-title-md leading-tight">Zaguán Digital</span>
            {currentUser && (
              <span className="font-mono text-[10px] text-primary leading-tight">
                {currentUser.roleLabel}
                {currentUser.unit ? ` · Apto ${currentUser.unit}` : ''}
              </span>
            )}
          </div>
        </button>

        {/* Desktop Nav */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={() => handleNav(item.screen)}
              className={`inline-flex items-center gap-1.5 font-label text-label-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeScreen === item.screen
                  ? 'text-primary font-semibold underline underline-offset-8 decoration-2'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error font-mono text-[11px] leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Right: User Session + Logout / Login */}
        <div className="flex items-center gap-2 shrink-0">
          {currentUser ? (
            <>
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant font-label text-label-sm text-on-surface">
                <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
                  account_circle
                </span>
                <span>{currentUser.fullName.split(' ')[0]}</span>
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1 px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest hover:bg-error-container hover:text-on-error-container text-on-surface font-label text-label-sm cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  logout
                </span>
                <span>Salir</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onShowLogin}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-container font-label text-label-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                login
              </span>
              <span>Iniciar sesión</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded border border-outline-variant bg-surface-container-lowest text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Menú móvil"
          className="md:hidden border-t border-outline-variant bg-surface-container-lowest px-4 py-3 flex flex-col gap-1"
        >
          {currentUser && (
            <div className="px-3 py-2 mb-1 rounded bg-surface-container-low border border-outline-variant">
              <p className="font-label text-label-md text-on-surface">{currentUser.fullName}</p>
              <p className="font-mono text-[11px] text-primary">
                {currentUser.roleLabel} · {currentUser.email}
              </p>
            </div>
          )}
          {navItems.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={() => handleNav(item.screen)}
              className={`text-left px-3 py-2.5 rounded font-label text-label-lg flex items-center justify-between ${
                activeScreen === item.screen
                  ? 'bg-surface-container-low text-primary font-semibold'
                  : 'text-on-surface-variant'
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-error text-on-error font-mono text-[11px]">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
