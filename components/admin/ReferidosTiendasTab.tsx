"use client";

import { useState, useEffect, useCallback } from "react";

interface ReferredTenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
  active: boolean;
  registeredAt: string;
  trialEndsAt: string | null;
  reward: string;
  status: "activo" | "inactivo";
}

interface ReferralStats {
  total: number;
  activos: number;
  recompensasGanadas: number;
}

interface ReferralData {
  referralCode: string | null;
  referred: ReferredTenant[];
  stats: ReferralStats;
}

export default function ReferidosTiendasTab() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/stores");
      if (!res.ok) throw new Error("Error al cargar referidos");
      const json = (await res.json()) as ReferralData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateCode() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/stores", { method: "POST" });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Error al generar codigo");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGenerating(false);
    }
  }

  function copyCode() {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    if (!data?.referralCode) return;
    const msg = encodeURIComponent(
      `Unete a Buleje con mi codigo ${data.referralCode} y ambos ganamos 30 dias gratis. Registrate en: ${window.location.origin}/registro`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Cargando referidos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total referidos", value: data.stats.total },
            { label: "Tiendas activas", value: data.stats.activos },
            { label: "Recompensas ganadas", value: data.stats.recompensasGanadas },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-center"
            >
              <p className="text-2xl font-bold text-[#00B4A6]">{kpi.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Codigo de referido */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Mi codigo de referido</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Comparte este codigo con otras tiendas. Ambos ganan 30 dias de trial extra.
          </p>
        </div>

        {data?.referralCode ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 font-mono text-lg font-bold tracking-widest text-[#00B4A6] bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 border border-green-200 dark:border-green-800 select-all">
              {data.referralCode}
            </div>
            <button
              onClick={copyCode}
              className="px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={shareWhatsApp}
              className="px-4 py-3 rounded-lg bg-[#25d366] hover:bg-[#1fb855] text-white text-sm font-medium transition-colors"
            >
              WhatsApp
            </button>
          </div>
        ) : (
          <button
            onClick={generateCode}
            disabled={generating}
            className="w-full py-2.5 px-4 rounded-lg bg-[#00B4A6] hover:bg-[#009690] text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generando..." : "Generar mi codigo de referido"}
          </button>
        )}

        {/* Mensaje de compartir */}
        {data?.referralCode && (
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 italic">
            &ldquo;Unete a Buleje con mi codigo {data.referralCode} y ambos ganamos 30 dias gratis&rdquo;
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Tabla de tiendas referidas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">Tiendas que invite</h3>
        </div>

        {data?.referred.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            Aun no has referido ninguna tienda. Comparte tu codigo para empezar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Tienda</th>
                  <th className="text-left px-5 py-3 font-medium">Plan</th>
                  <th className="text-left px-5 py-3 font-medium">Registro</th>
                  <th className="text-left px-5 py-3 font-medium">Trial hasta</th>
                  <th className="text-left px-5 py-3 font-medium">Estado</th>
                  <th className="text-left px-5 py-3 font-medium">Recompensa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data?.referred.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300 capitalize">{t.plan}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{formatDate(t.registeredAt)}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{formatDate(t.trialEndsAt)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === "activo"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#00B4A6] dark:text-green-400 font-medium text-xs">
                      {t.reward}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
