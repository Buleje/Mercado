/**
 * /mi-credito — Customer credit transparency portal
 *
 * Fiado Digital Phase 1. Customers see their own credit score,
 * breakdown, tips to improve, and payment history.
 *
 * Auth: customer session required (redirects to login if not authenticated).
 * Gated behind FIADO_DIGITAL_V2_PHASE1 flag (returns "coming soon" if off).
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditScoreCard } from "@/components/credit/CreditScoreCard";
import { CreditTransparencyBanner } from "@/components/credit/CreditTransparencyBanner";
import { ArrowLeft, Loader2, TrendingUp, Lightbulb, History } from "lucide-react";
import Link from "next/link";

type CreditData = {
  score: number;
  creditLimit: number;
  riskLevel: string;
  breakdown: Record<string, number>;
  credit: {
    limit: number;
    used: number;
    available: number;
    isActive: boolean;
  };
  delta: number | null;
  reason: string;
  nextReviewDate: string;
  tips: string[];
  history: Array<{
    score: number;
    creditLimit: number;
    riskLevel: string;
    trigger: string;
    date: string;
  }>;
};

export default function MiCreditoPage() {
  const [data, setData] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/credit-score");
      if (res.status === 401) {
        setError("login");
        return;
      }
      if (res.status === 404) {
        setError("disabled");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error cargando tu crédito");
        return;
      }
      setData(await res.json());
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredit();
  }, [fetchCredit]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Not logged in
  if (error === "login") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-slate-800">Inicia sesión</h1>
        <p className="mt-2 text-sm text-slate-600">
          Necesitas iniciar sesión para ver tu score de crédito.
        </p>
        <Link
          href="/cuenta"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  // Feature disabled
  if (error === "disabled") {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-slate-800">Próximamente</h1>
        <p className="mt-2 text-sm text-slate-600">
          El portal de crédito estará disponible pronto.
        </p>
      </div>
    );
  }

  // Other error
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-red-600">Error</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <button
          onClick={fetchCredit}
          className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/cuenta"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Mi Crédito</h1>
      </div>

      {/* Transparency Banner */}
      <CreditTransparencyBanner
        score={data.score}
        reason={data.reason}
        nextReviewDate={new Date(data.nextReviewDate)}
      />

      {/* Score Card */}
      <div className="mt-4">
        <CreditScoreCard
          customerId=""
          currentScore={data.score}
          limit={data.credit.limit}
          used={data.credit.used}
        />
      </div>

      {/* Tips */}
      {data.tips.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Lightbulb className="h-4 w-4" />
            Cómo mejorar tu score
          </div>
          <ul className="mt-2 space-y-1">
            {data.tips.map((tip, i) => (
              <li key={i} className="text-sm text-amber-700">
                • {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Score History */}
      {data.history.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <History className="h-4 w-4" />
            Historial de score
          </div>
          <div className="mt-3 space-y-2">
            {data.history.map((h, i) => {
              const prev = i > 0 ? data.history[i - 1].score : null;
              const delta = prev !== null ? h.score - prev : null;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div>
                    <span className="text-lg font-bold text-slate-800">
                      {h.score}
                    </span>
                    {delta !== null && delta !== 0 && (
                      <span
                        className={`ml-2 text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        <TrendingUp
                          className={`mr-0.5 inline h-3 w-3 ${delta < 0 ? "rotate-180" : ""}`}
                        />
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(h.date).toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium text-slate-700">
          Desglose de tu score
        </div>
        <div className="mt-3 space-y-2">
          {Object.entries(data.breakdown).map(([key, value]) => {
            const labels: Record<string, string> = {
              purchaseHistory: "Historial de compras",
              paymentPunctuality: "Puntualidad de pagos",
              avgTicket: "Ticket promedio",
              seniority: "Antigüedad",
              loyaltyPoints: "Puntos de lealtad",
            };
            const pct = Math.min(100, (value / 1000) * 100);
            return (
              <div key={key}>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{labels[key] ?? key}</span>
                  <span className="font-medium">{value}/1000</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
