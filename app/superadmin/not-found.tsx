import { ShieldX, ArrowLeft } from "@buleje/design-system/icons";

export default function SuperAdminNotFound() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center p-4">
      <div className="bg-[var(--surface-raised)]/80 backdrop-blur-xl border border-[var(--rule-base)] rounded-3xl w-full max-w-md p-8 shadow-xl text-center">
        <div className="mx-auto w-16 h-16 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center mb-6">
          <ShieldX className="w-8 h-8 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Página no encontrada
        </h1>
        <p className="text-[var(--text-tertiary)] text-sm mb-6">
          Esta sección del panel de plataforma no existe o fue movida.
        </p>
        <a
          href="/superadmin/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ir al Dashboard
        </a>
      </div>
    </div>
  );
}
