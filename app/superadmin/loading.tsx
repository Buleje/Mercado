import { Loader2, ShieldCheck } from "lucide-react";

export default function SuperAdminLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
        >
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando plataforma…</p>
      </div>
    </div>
  );
}
