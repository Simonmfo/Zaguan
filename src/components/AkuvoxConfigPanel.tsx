import { useState } from 'react';
import {
  buildAkuvoxOpenDoorUrl,
  buildAkuvoxRtspUrl,
  buildAkuvoxSnapshotUrl,
  buildZaguanWebhookUrls,
  testAkuvoxConnection,
} from '../services/akuvoxService';
import { AkuvoxConfig } from '../types/zaguan';

interface AkuvoxConfigPanelProps {
  config: AkuvoxConfig;
  onChangeConfig: (next: AkuvoxConfig) => void;
  onTestDoorRelay: () => Promise<void>;
  onUpdateLiveSnapshot: (url: string | null) => void;
}

export function AkuvoxConfigPanel({
  config,
  onChangeConfig,
  onTestDoorRelay,
  onUpdateLiveSnapshot,
}: AkuvoxConfigPanelProps) {
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const webhooks = buildZaguanWebhookUrls();
  const openDoorUrl = buildAkuvoxOpenDoorUrl(config, 1);
  const rtspUrl = buildAkuvoxRtspUrl(config);
  const snapshotUrl = buildAkuvoxSnapshotUrl(config);

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const handleTest = async () => {
    setTesting(true);
    const result = await testAkuvoxConnection(config);
    setTesting(false);
    setStatusMsg({ ok: result.ok, text: result.message });
    if (result.snapshotDataUrl) {
      onUpdateLiveSnapshot(result.snapshotDataUrl);
    }
  };

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden">
      <div className="p-5 border-b border-outline-variant flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-sm bg-primary text-on-primary font-mono text-mono-sm">
              HARDWARE COMPATIBLE
            </span>
            <h2 className="font-headline text-title-lg text-on-surface">
              Integración Akuvox E12W (SIP · HTTP API · RTSP · QR · RFID/BLE)
            </h2>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            Configurá la IP local de tu Akuvox E12W para abrir el relé físico, capturar fotos 1080p
            y recibir webhooks de botón, QR y tarjetas RFID Mifare 13.56MHz.
          </p>
        </div>

        <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded bg-surface-container-low border border-outline-variant cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChangeConfig({ ...config, enabled: e.target.checked })}
            className="accent-primary"
          />
          <span className="font-label text-label-md text-on-surface">
            {config.enabled ? 'Hardware Real LAN (Activo)' : 'Modo Simulación'}
          </span>
        </label>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg">
        {/* Left: Connection Form */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="ak-ip" className="font-label text-label-sm text-on-surface-variant">
                IP local Akuvox E12W
              </label>
              <input
                id="ak-ip"
                type="text"
                value={config.deviceIp}
                onChange={(e) => onChangeConfig({ ...config, deviceIp: e.target.value })}
                placeholder="192.168.1.120"
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-md"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ak-sip" className="font-label text-label-sm text-on-surface-variant">
                IP Servidor SIP (Asterisk / Voz IA)
              </label>
              <input
                id="ak-sip"
                type="text"
                value={config.sipServerIp}
                onChange={(e) => onChangeConfig({ ...config, sipServerIp: e.target.value })}
                placeholder="192.168.1.50"
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="ak-user" className="font-label text-label-sm text-on-surface-variant">
                Usuario HTTP API
              </label>
              <input
                id="ak-user"
                type="text"
                value={config.apiUser}
                onChange={(e) => onChangeConfig({ ...config, apiUser: e.target.value })}
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-md"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ak-pass" className="font-label text-label-sm text-on-surface-variant">
                Contraseña HTTP API
              </label>
              <input
                id="ak-pass"
                type="password"
                value={config.apiPassword}
                onChange={(e) => onChangeConfig({ ...config, apiPassword: e.target.value })}
                placeholder="••••••••"
                className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-md"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ak-relay2" className="font-label text-label-sm text-on-surface-variant">
              Relé 2 opcional para Puerta Hall / Doble Exclusa (Shelly / Akuvox SR01 URL)
            </label>
            <input
              id="ak-relay2"
              type="text"
              value={config.secondaryRelayUrl}
              onChange={(e) => onChangeConfig({ ...config, secondaryRelayUrl: e.target.value })}
              placeholder="Ej. http://192.168.1.121/relay/0?turn=on&timer=8"
              className="rounded border border-outline-variant bg-surface px-3 py-2 font-mono text-mono-sm"
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={config.highSecurityMode}
                onChange={(e) => onChangeConfig({ ...config, highSecurityMode: e.target.checked })}
                className="accent-primary"
              />
              High Security Mode (Basic Auth)
            </label>
            <label className="inline-flex items-center gap-2 font-label text-label-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={config.hasWiegandKeypad}
                onChange={(e) => onChangeConfig({ ...config, hasWiegandKeypad: e.target.checked })}
                className="accent-primary"
              />
              Teclado Wiegand externo (habilita PIN / Coacción)
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 rounded bg-primary text-on-primary font-label text-label-sm hover:bg-primary-container cursor-pointer disabled:opacity-60"
            >
              {testing ? 'Probando...' : 'Probar conexión + Snapshot 1080p'}
            </button>
            <button
              type="button"
              onClick={() => void onTestDoorRelay()}
              className="px-4 py-2 rounded bg-secondary text-on-secondary font-label text-label-sm hover:opacity-95 cursor-pointer"
            >
              Disparar Relé 1 (Puerta E12W)
            </button>
          </div>

          {statusMsg && (
            <div
              role="status"
              className={`p-3 rounded border font-label text-label-sm ${
                statusMsg.ok
                  ? 'bg-success-container text-on-success-container border-success'
                  : 'bg-warning-container text-on-warning-container border-warning'
              }`}
            >
              {statusMsg.text}
            </div>
          )}
        </div>

        {/* Right: Ready-to-paste URLs for Akuvox E12W Web UI */}
        <div className="lg:col-span-6 flex flex-col gap-2.5 bg-surface-container-low border border-outline-variant rounded-md p-4">
          <div className="flex items-center justify-between">
            <span className="font-title text-label-lg text-on-surface">
              URLs listas para pegar en la Web UI del Akuvox E12W
            </span>
            <span className="font-mono text-mono-sm text-primary">npm run server</span>
          </div>

          {[
            {
              key: 'qr',
              label: '1. Third-Party QR Integration (Access Control > Relay)',
              value: webhooks.qrThirdPartyUrl,
            },
            {
              key: 'call',
              label: '2. Action URL Botón Llamar (Settings > Action URL)',
              value: webhooks.actionCallStart,
            },
            {
              key: 'rfid',
              label: '3. Action URL Tarjeta RFID 13.56MHz',
              value: webhooks.actionRfidValid,
            },
            {
              key: 'open',
              label: '4. Comando HTTP API Abrir Relé 1 (saliente)',
              value: openDoorUrl,
            },
            {
              key: 'rtsp',
              label: '5. Video RTSP (OCR Paquetes + Merodeo 24/7)',
              value: `${rtspUrl}  |  Snapshot: ${snapshotUrl}`,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-label text-label-sm text-on-surface-variant">
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(item.key, item.value)}
                  className="font-mono text-mono-sm text-primary hover:underline cursor-pointer shrink-0"
                >
                  {copiedKey === item.key ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
              <code className="font-mono text-[11px] text-on-surface break-all">{item.value}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
