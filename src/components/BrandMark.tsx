import { useState } from 'react';

export function ZaguanLogoMark({ className = 'w-9 h-9 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <path
        d="M18 2L5 7.5v9.8c0 8.2 5.5 15.2 13 17.7 7.5-2.5 13-9.5 13-17.7V7.5L18 2z"
        className="fill-primary"
      />
      <path
        d="M13 26V16.5a5 5 0 0 1 10 0V26"
        fill="none"
        className="stroke-on-primary"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18.5" r="2.2" className="fill-secondary-container" />
    </svg>
  );
}

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon: string;
  fallbackLabel: string;
}

export function SmartImage({
  src,
  alt,
  className = '',
  fallbackIcon,
  fallbackLabel,
}: SmartImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className} bg-gradient-to-br from-surface-container-low via-surface-variant to-surface-container flex flex-col items-center justify-center gap-2 p-4 text-center`}
      >
        <span className="material-symbols-outlined text-3xl text-primary" aria-hidden="true">
          {fallbackIcon}
        </span>
        <span className="font-label text-label-md text-on-surface-variant max-w-xs">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
