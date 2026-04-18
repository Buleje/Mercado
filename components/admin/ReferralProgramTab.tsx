"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Users, Gift, Share2, TrendingUp, RefreshCw } from "@buleje/design-system/icons";

interface ReferralStats {
  totalReferrals: number;
  totalPointsGiven: number;
  topReferrers: {
    phone: string;
    name: string;
    referralCode: string;
    referralCount: number;
  }[];
  recentReferrals: {
    referrerName: string;
    refereeName: string;
    date: string;
    points: number;
  }[];
}

export default function ReferralProgramTab() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/loyalty/referral/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  const totalReferrals = stats?.totalReferrals ?? 0;
  const totalPoints = stats?.totalPointsGiven ?? 0;
  const topReferrers = stats?.topReferrers ?? [];
  const recentReferrals = stats?.recentReferrals ?? [];

  return (
    <div className="space-y-6 p-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Users className="h-4 w-4" />
            Referidos totales
          </div>
          <p className="mt-1 text-2xl font-bold text-white">{totalReferrals}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Gift className="h-4 w-4" />
            Puntos otorgados
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--data-warning)]">{totalPoints.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <TrendingUp className="h-4 w-4" />
            Conversión
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--data-success)]">
            {totalReferrals > 0 ? "Activo" : "Sin datos"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Share2 className="h-4 w-4" />
            Puntos por referido
          </div>
          <p className="mt-1 text-2xl font-bold text-white">50 c/u</p>
        </div>
      </div>

      {/* Top Referrers */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white/80">Top Referidores</CardTitle>
          <button
            onClick={fetchStats}
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {topReferrers.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">
            Aún no hay referidos. Comparte los códigos con tus clientes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/50">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Código</th>
                  <th className="pb-2 text-right font-medium">Referidos</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.map((r, i) => (
                  <tr key={r.phone} className="border-b border-white/5">
                    <td className="py-2 text-white/60">
                      {i + 1}
                    </td>
                    <td className="py-2 text-white">{r.name}</td>
                    <td className="py-2 font-mono text-xs text-[var(--data-warning)]">{r.referralCode}</td>
                    <td className="py-2 text-right font-semibold text-white">{r.referralCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Referrals */}
      {recentReferrals.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <CardTitle className="mb-3 text-sm font-semibold text-white/80">Referidos recientes</CardTitle>
          <div className="space-y-2">
            {recentReferrals.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
              >
                <div>
                  <span className="text-sm text-white">{r.referrerName}</span>
                  <span className="mx-2 text-white/40">→</span>
                  <span className="text-sm text-white">{r.refereeName}</span>
                </div>
                <span className="text-xs text-[var(--data-warning)]">+{r.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-[var(--data-success)]/30 bg-[var(--accent-soft)] p-4">
        <CardTitle className="mb-2 text-sm font-semibold text-[var(--data-success)]">Cómo funciona</CardTitle>
        <ul className="space-y-1 text-sm text-white/60">
          <li>📱 Cada cliente tiene un código único de referido</li>
          <li>🤝 Cuando alguien usa ese código, ambos ganan <strong>50 puntos</strong></li>
          <li>💰 50 puntos = S/1 de descuento en su próxima compra</li>
          <li>🔄 No hay límite de personas que un cliente puede referir</li>
        </ul>
      </div>
    </div>
  );
}
