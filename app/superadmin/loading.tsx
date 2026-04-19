import { Loader2, ShieldCheck } from "@buleje/design-system/icons";

export default function SuperAdminLoading() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
          style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
        >
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <p className="text-sm text-[var(--text-tertiary)]">Cargando plataforma…</p>
      </div>
    </div>
  );
}
