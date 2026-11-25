export function SiteFooter() {
  return (
    <footer className="bg-surface border-t border-outline-variant py-8">
      <div className="max-w-[1200px] mx-auto px-page-margin flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-headline text-title-md text-on-surface">
            Zaguán Digital · Montevideo, Uruguay
          </span>
          <span className="font-body text-body-sm text-on-surface-variant">
            Pocitos · Cordón · Centro · Habilitación DI.GE.F.E. vigente
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6 font-mono text-mono-sm text-on-surface-variant tabular-nums">
          <span>Emergencias 24/7: 2713 3000</span>
          <span>WhatsApp: +598 97 999 561</span>
        </div>
      </div>
    </footer>
  );
}
