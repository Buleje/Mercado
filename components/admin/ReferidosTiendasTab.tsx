"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

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
      const res = await fetch("/api/referrals/stores", { method: "POST", headers: csrfHeaders() });
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
      <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
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
              className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center"
            >
              <p className="text-2xl font-bold text-primary">{kpi.value}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Codigo de referido */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
        <div>
          <CardTitle className="font-semibold text-[var(--text-primary)]">Mi codigo de referido</CardTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Comparte este codigo con otras tiendas. Ambos ganan 30 dias de trial extra.
          </p>
        </div>

        {data?.referralCode ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 font-mono text-lg font-bold tracking-widest text-primary bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg px-4 py-3 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 select-all">
              {data.referralCode}
            </div>
            <button
              onClick={copyCode}
              className="px-4 py-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
            className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generando..." : "Generar mi codigo de referido"}
          </button>
        )}

        {/* Mensaje de compartir */}
        {data?.referralCode && (
          <div className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] rounded-lg px-3 py-2 italic">
            &quot;ldquo;Unete a Buleje con mi codigo {data.referralCode} y ambos ganamos 30 dias gratis&rdquo&quot;
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Tabla de tiendas referidas */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--rule-base)]">
          <CardTitle className="font-semibold text-[var(--text-primary)]">Tiendas que invite</CardTitle>
        </div>

        {data?.referred.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--text-tertiary)] text-sm">
            Aun no has referido ninguna tienda. Comparte tu codigo para empezar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)] text-[var(--text-tertiary)] text-xs">
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
                  <tr key={t.id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-[var(--text-primary)]">{t.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{t.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)] capitalize">{t.plan}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(t.registeredAt)}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(t.trialEndsAt)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === "activo"
                          ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
                          : "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-700 dark:text-[var(--text-tertiary)]"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-primary dark:text-[var(--data-success-500)] font-medium text-xs">
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
