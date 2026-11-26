import { FormEvent, useState } from 'react';
import { AppAuthUser } from '../types/zaguan';
import { ZaguanLogoMark } from './BrandMark';

interface LoginViewProps {
  users: AppAuthUser[];
  onLoginSuccess: (user: AppAuthUser) => void;
  onOpenWebLanding: () => void;
}

const ROLE_STYLES: Record<
  AppAuthUser['role'],
  { icon: string; badgeClass: string; desc: string }
> = {
  installer: {
    icon: 'engineering',
    badgeClass: 'bg-primary text-on-primary',
    desc: 'Crear edificios, pisos, deptos, usuarios y configurar Akuvox E12W',
  },
  building_admin: {
    icon: 'admin_panel_settings',
    badgeClass: 'bg-secondary text-on-secondary',
    desc: 'Gestionar unidades, altas/bajas, llaves UTE/OSE/Antel, logs y cartelera',
  },
  owner: {
    icon: 'home_work',
    badgeClass: 'bg-surface-variant text-primary',
    desc: 'Apto 4B · Accesos, paquetería OCR, timbre vivo y control de su unidad',
  },
  tenant: {
    icon: 'person',
    badgeClass: 'bg-secondary-container text-on-secondary-container',
    desc: 'Apto 3A · Apertura NFC/BLE, pases WhatsApp, limpieza y paquetes',
  },
};

export function LoginView({ users, onLoginSuccess, onOpenWebLanding }: LoginViewProps) {
  const [email, setEmail] = useState('instalador@zaguan.uy');
  const [password, setPassword] = useState('zaguan2026');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const matched = users.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.password === password
    );
    if (!matched) {
      setError('Email o contraseña incorrectos. Probá uno de los usuarios de prueba de abajo.');
      return;
    }
    setError(null);
    onLoginSuccess(matched);
  };

  const handleQuickLogin = (user: AppAuthUser) => {
    setEmail(user.email);
    setPassword(user.password);
    setError(null);
    onLoginSuccess(user);
  };

  // Show 1 representative quick-access card per role (plus any newly created users)
  const featuredDemoUsers = users.slice(0, 6);

  return (
    <main className="min-h-screen bg-surface-container-low flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-[440px] flex flex-col gap-4">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-md">
            <ZaguanLogoMark className="w-10 h-10" />
          </div>
          <div>
            <h1 className="font-display text-headline-md text-on-surface tracking-tight">
              Zaguán Digital
            </h1>
            <p className="font-body text-body-sm text-on-surface-variant">
              Portería inteligente · Acceso unificado multi-rol
            </p>
          </div>
        </div>

        {/* Login Card */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-headline text-title-lg text-on-surface">Iniciar sesión</h2>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-success-container text-on-success-container">
              App + Web
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="login-email" className="font-label text-label-sm text-on-surface">
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@zaguan.uy"
                required
                className="rounded-md border border-outline-variant bg-surface px-3.5 py-2.5 font-body text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="login-pass" className="font-label text-label-sm text-on-surface">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-md border border-outline-variant bg-surface px-3.5 py-2.5 pr-11 font-body text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-2.5 rounded bg-error-container text-on-error-container font-label text-label-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-title-md shrink-0" aria-hidden="true">
                  error
                </span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-md bg-primary text-on-primary hover:bg-primary-container font-headline text-title-md transition-colors cursor-pointer"
            >
              Ingresar a Zaguán
            </button>
          </form>
        </section>

        {/* Quick-Access Demo Accounts (1 per Role) */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-title text-label-lg text-on-surface">
              Usuarios de prueba (1 toque para entrar)
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant">
              Clave: <strong>zaguan2026</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {featuredDemoUsers.map((user) => {
              const style = ROLE_STYLES[user.role];
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickLogin(user)}
                  className="w-full p-3 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant hover:border-primary text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-10 h-10 rounded-lg inline-flex items-center justify-center shrink-0 ${style.badgeClass}`}
                    >
                      <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
                        {style.icon}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-label text-label-md text-on-surface">
                          {user.roleLabel}
                        </span>
                        <span className="font-mono text-[11px] text-primary truncate">
                          {user.email}
                        </span>
                      </div>
                      <p className="font-body text-body-sm text-on-surface-variant truncate">
                        {user.fullName}
                        {user.unit ? ` · Apto ${user.unit}` : ''} — {style.desc}
                      </p>
                    </div>
                  </div>
                  <span
                    className="material-symbols-outlined text-primary shrink-0"
                    aria-hidden="true"
                  >
                    arrow_forward
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={onOpenWebLanding}
          className="self-center font-label text-label-sm text-on-surface-variant hover:text-primary cursor-pointer py-1"
        >
          Ver portal comercial público de Zaguán Digital →
        </button>
      </div>
    </main>
  );
}
