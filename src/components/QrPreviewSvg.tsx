interface QrPreviewSvgProps {
  seed: string;
  className?: string;
}

export function QrPreviewSvg({ seed, className = 'w-full h-full text-on-surface' }: QrPreviewSvgProps) {
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const shift = hash % 3;

  return (
    <svg viewBox="0 0 36 36" className={className} aria-label={`Código QR ${seed}`}>
      <rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="5" y="5" width="4" height="4" fill="currentColor" />
      <rect x="24" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="27" y="5" width="4" height="4" fill="currentColor" />
      <rect x="2" y="24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="5" y="27" width="4" height="4" fill="currentColor" />

      <rect x={15 + shift} y="4" width="4" height="4" fill="currentColor" />
      <rect x="16" y={11 + shift} width="4" height="4" fill="currentColor" />
      <rect x="4" y="16" width={5 + shift} height="4" fill="currentColor" />
      <rect x={14 - shift} y="18" width="6" height="4" fill="currentColor" />
      <rect x="24" y="16" width="4" height={5 + shift} fill="currentColor" />
      <rect x="30" y="18" width="4" height="4" fill="currentColor" />
      <rect x="16" y="26" width="4" height="8" fill="currentColor" />
      <rect x="24" y="26" width="10" height="4" fill="currentColor" />
      <rect x={28 - shift} y="31" width="6" height="3" fill="currentColor" />
    </svg>
  );
}
