export default function OnboardingLoading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(130% 90% at 6% -10%, var(--accent-soft) 0%, transparent 48%), radial-gradient(130% 90% at 100% 110%, var(--accent-muted) 0%, transparent 50%), var(--surface-canvas)",
      }}
    >
      <div
        className="mx-auto w-full max-w-[460px] overflow-hidden rounded-[26px] border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-10 backdrop-blur-xl"
        style={{ boxShadow: "0 30px 70px -16px rgba(0,0,0,0.28)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-soft)] border-t-[var(--accent)]" />
          <p className="animate-pulse text-sm text-[var(--text-tertiary)]">
            Preparando configuración inicial…
          </p>
        </div>
      </div>
    </div>
  );
}
