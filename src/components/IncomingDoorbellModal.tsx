import { FormEvent, useState } from 'react';
import { PendingVisitRequest } from '../types/zaguan';
import { SmartImage } from './BrandMark';

interface IncomingDoorbellModalProps {
  visit: PendingVisitRequest;
  liveSnapshotUrl?: string | null;
  onApproveOpen: () => void;
  onReject: () => void;
  onSendVoiceMessage: (text: string) => void;
}

export function IncomingDoorbellModal({
  visit,
  liveSnapshotUrl,
  onApproveOpen,
  onReject,
  onSendVoiceMessage,
}: IncomingDoorbellModalProps) {
  const [talking, setTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sentMessages, setSentMessages] = useState<string[]>([]);

  const handleStartTalk = () => {
    setTalking(true);
    setMuted(false);
    // Notify local Akuvox SIP bridge if available (non-blocking)
    fetch('/api/akuvox/sip-talk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', unit: visit.unit }),
    }).catch(() => {});
  };

  const sendToSpeaker = (msg: string) => {
    const clean = msg.trim();
    if (!clean) return;
    setSentMessages((prev) => [...prev, clean]);
    onSendVoiceMessage(clean);
    fetch('/api/akuvox/sip-talk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'speak', unit: visit.unit, message: clean }),
    }).catch(() => {});
    setReplyText('');
  };

  const handleReplySubmit = (e: FormEvent) => {
    e.preventDefault();
    sendToSpeaker(replyText);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timbre en vivo desde Akuvox E12W"
      className="absolute inset-0 z-50 bg-[#0B1016]/95 text-white flex flex-col justify-between overflow-y-auto"
    >
      {/* Top Call Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
          <span className="font-mono text-mono-sm text-emerald-300 uppercase">
            Timbre en vivo · Akuvox E12W
          </span>
        </div>
        <span className="font-mono text-mono-sm text-white/60 tabular-nums">
          {visit.timestamp} hs · Apto {visit.unit}
        </span>
      </div>

      {/* Live Front-Door Camera Feed + Visitor AI Summary */}
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        <div className="relative rounded-lg overflow-hidden border border-white/20 bg-black">
          <SmartImage
            src={liveSnapshotUrl || visit.photoUrl}
            alt={`Captura en vivo de ${visit.visitorName} en la entrada`}
            className="w-full h-48 object-cover"
            fallbackIcon="videocam"
            fallbackLabel="Cámara 1080p · Akuvox E12W"
          />
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/75 font-mono text-[11px] text-white">
            Frente de calle · 1080p
          </div>
          {talking && (
            <div className="absolute bottom-2.5 inset-x-2.5 px-3 py-1.5 rounded bg-sky-600/95 text-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  {muted ? 'mic_off' : 'graphic_eq'}
                </span>
                <span className="font-label text-label-sm">
                  {muted ? 'Micrófono silenciado' : 'Hablando con altavoz E12W (SIP G.722)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="px-2 py-0.5 rounded bg-black/30 font-mono text-[11px] cursor-pointer"
              >
                {muted ? 'Activar' : 'Mutear'}
              </button>
            </div>
          )}
        </div>

        {/* AI Receptionist Context Card */}
        <div className="p-3.5 rounded-lg bg-[#16202C] border border-sky-400/30 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label text-label-sm text-sky-300">
              SOLICITUD DE PORTERO IA
            </span>
            <span className="font-mono text-[11px] text-white/60">Para {visit.residentName}</span>
          </div>
          <h2 className="font-headline text-title-lg text-white leading-tight">
            {visit.visitorName} en la entrada
          </h2>
          <p className="font-body text-body-md text-white/85 italic">
            &ldquo;{visit.spokenTranscript}&rdquo;
          </p>
        </div>

        {/* Two-Way Talk Drawer when [Hablar] is active */}
        {talking && (
          <div className="p-3 rounded-lg bg-white/5 border border-white/15 flex flex-col gap-2">
            {sentMessages.length > 0 && (
              <div className="flex flex-col gap-1 max-h-20 overflow-y-auto">
                {sentMessages.map((m, idx) => (
                  <span
                    key={`${idx}-${m}`}
                    className="font-body text-body-sm text-emerald-200 bg-emerald-900/40 px-2.5 py-1 rounded"
                  >
                    Vos (Altavoz E12W): &ldquo;{m}&rdquo;
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => sendToSpeaker('¡Hola! Ya te abro, subí al 4B.')}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 font-label text-label-sm cursor-pointer"
              >
                &ldquo;Ya te abro, subí al 4B&rdquo;
              </button>
              <button
                type="button"
                onClick={() => sendToSpeaker('Dejá el paquete en el zaguán por favor.')}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 font-label text-label-sm cursor-pointer"
              >
                &ldquo;Dejalo en el zaguán&rdquo;
              </button>
            </div>
            <form onSubmit={handleReplySubmit} className="flex gap-1.5">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Hablar al frente de calle..."
                className="flex-1 rounded bg-black border border-white/20 px-2.5 py-1.5 font-body text-body-sm text-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-sky-600 text-white font-label text-label-sm cursor-pointer"
              >
                Enviar
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 3 Clear Primary Call Actions: [Abrir Puerta] [Hablar] [Rechazar] */}
      <div className="p-4 border-t border-white/10 bg-[#0A0E14] grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onApproveOpen}
          className="py-3 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
            lock_open
          </span>
          <span className="font-label text-label-sm">Abrir Puerta</span>
        </button>

        <button
          type="button"
          onClick={talking ? () => setTalking(false) : handleStartTalk}
          className={`py-3 px-2 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            talking
              ? 'bg-sky-500 text-white ring-2 ring-sky-300'
              : 'bg-sky-700 hover:bg-sky-600 text-white'
          }`}
        >
          <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
            {talking ? 'call_end' : 'mic'}
          </span>
          <span className="font-label text-label-sm">{talking ? 'Cortar voz' : 'Hablar'}</span>
        </button>

        <button
          type="button"
          onClick={onReject}
          className="py-3 px-2 rounded-lg bg-red-600 hover:bg-red-500 text-white flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
            close
          </span>
          <span className="font-label text-label-sm">Rechazar</span>
        </button>
      </div>
    </div>
  );
}
