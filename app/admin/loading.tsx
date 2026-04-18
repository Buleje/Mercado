export default function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--data-success)]/30 border-t-emerald-600" />
        <p className="text-sm text-[var(--text-secondary)] animate-pulse">
          Cargando panel de administracion...
        </p>
      </div>
    </div>
  );
}
