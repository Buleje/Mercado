"use client";

import { useState, useEffect } from "react";
import { Star, MessageSquare, TrendingUp } from "lucide-react";

type SurveyStats = {
  total: number;
  average: number;
  distribution: Record<number, number>;
};

type SurveyResponse = {
  id: string;
  orderId: string;
  customerPhone: string | null;
  rating: number;
  comment: string;
  type: string;
  createdAt: string;
};

export default function SurveysTab() {
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [recent, setRecent] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/surveys");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats(data.stats);
        setRecent(data.recent);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxCount = stats ? Math.max(...Object.values(stats.distribution), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-foreground">Encuestas y NPS</h2>
        <p className="text-sm text-muted">Calificaciones post-entrega de clientes</p>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Total respuestas
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-xs mb-1">
              <Star className="h-3.5 w-3.5" /> Promedio
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-foreground">{stats.average}</p>
              <div className="flex">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-4 h-4 ${s <= Math.round(stats.average) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-xs mb-1">
              <MessageSquare className="h-3.5 w-3.5" /> Con comentario
            </div>
            <p className="text-2xl font-bold text-foreground">
              {recent.filter(r => r.comment.trim()).length}
            </p>
          </div>
        </div>
      )}

      {/* Distribution chart */}
      {stats && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Distribución de calificaciones</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(star => {
              const count = stats.distribution[star] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-12 justify-end">
                    <span className="text-xs font-medium text-foreground">{star}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="flex-1 h-5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted w-14 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent responses */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Respuestas recientes</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">Sin respuestas aún</p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map(r => (
              <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted">Pedido #{r.orderId.slice(-6)}</span>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(r.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                  </span>
                </div>
                {r.comment.trim() && (
                  <p className="text-xs text-foreground/80 mt-1 pl-0.5">&ldquo;{r.comment}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

