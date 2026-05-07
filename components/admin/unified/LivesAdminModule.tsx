"use client";

import { CardTitle } from "@buleje/design-system";
/**
 * LivesAdminModule — Gestión de transmisiones en vivo.
 *
 * Bridge ENRICH-5 para la feature "En Vivo" del marketplace.
 * Admin puede empezar transmisión al instante, programar futuras y ver
 * performance de pasadas.
 */

import { useState } from "react";
import {
  Radio,
  Play,
  Calendar,
  Eye,
  ShoppingBag,
  DollarSign,
  Plus,
  Edit2,
  Trash2,
  Clock,
  AlertCircle,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import KPICard from "@/components/admin/shared/KPICard";
import { ScheduleLiveModal, type ScheduledLiveData } from "./lives-admin/ScheduleLiveModal";
import { StartLiveModal } from "./lives-admin/StartLiveModal";
import { LivePerformanceCard, type PastLive } from "./lives-admin/LivePerformanceCard";

// ── Types ───────────────────────────────────────────────────────────────────

interface ScheduledLive {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  featuredProductCount: number;
}

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_SCHEDULED: ScheduledLive[] = [
  {
    id: "LIV-S-001",
    title: "Remate semanal de productos próximos a vencer",
    description: "Descuentos hasta 40% en productos seleccionados.",
    scheduledAt: "2026-04-20T18:00:00",
    featuredProductCount: 8,
  },
  {
    id: "LIV-S-002",
    title: "Ofertas del fin de semana largo",
    description: "Canasta básica con precio especial para el feriado.",
    scheduledAt: "2026-04-25T11:00:00",
    featuredProductCount: 12,
  },
];

const MOCK_PAST: PastLive[] = [
  {
    id: "LIV-001",
    title: "Ofertas de Semana Santa",
    date: "2026-04-12",
    durationMin: 45,
    peakViewers: 87,
    totalViews: 320,
    ordersGenerated: 28,
    revenue: 1240,
    engagement: 68,
  },
  {
    id: "LIV-002",
    title: "Productos frescos del día",
    date: "2026-04-08",
    durationMin: 30,
    peakViewers: 45,
    totalViews: 180,
    ordersGenerated: 14,
    revenue: 580,
    engagement: 52,
  },
  {
    id: "LIV-003",
    title: "Remate de temporada",
    date: "2026-04-01",
    durationMin: 60,
    peakViewers: 112,
    totalViews: 480,
    ordersGenerated: 42,
    revenue: 1950,
    engagement: 74,
  },
  {
    id: "LIV-004",
    title: "Despensa básica mensual",
    date: "2026-03-22",
    durationMin: 40,
    peakViewers: 65,
    totalViews: 240,
    ordersGenerated: 19,
    revenue: 870,
    engagement: 58,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LivesAdminModule() {
  const [scheduled, setScheduled] = useState<ScheduledLive[]>(MOCK_SCHEDULED);
  const [past] = useState<PastLive[]>(MOCK_PAST);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showStart, setShowStart] = useState(false);

  // KPIs
  const now = new Date();
  const thisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const transmisionesEsteMes = past.filter((l) => thisMonth(l.date)).length;
  const viewersPromedio = past.length > 0
    ? Math.round(past.reduce((sum, l) => sum + l.totalViews, 0) / past.length)
    : 0;
  const pedidosTotales = past.reduce((sum, l) => sum + l.ordersGenerated, 0);
  const engagementPromedio = past.length > 0
    ? Math.round(past.reduce((sum, l) => sum + l.engagement, 0) / past.length)
    : 0;

  const handleSchedule = (data: ScheduledLiveData) => {
    const newLive: ScheduledLive = {
      id: `LIV-S-${Date.now()}`,
      title: data.title,
      description: data.description,
      scheduledAt: data.scheduledAt,
      featuredProductCount: data.featuredProductIds.length,
    };
    setScheduled((prev) =>
      [...prev, newLive].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    );
  };

  const handleCancelScheduled = (id: string) => {
    setScheduled((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="En Vivo"
        description="Transmisiones en vivo para mostrar productos y vender en directo"
        icon={Radio}
      />

      {/* Hero CTA */}
      <div className="bg-white border-2 border-primary/20 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-linear-to-br from-[var(--data-error-500)] to-[var(--accent)] text-white flex items-center justify-center shrink-0">
            <Radio className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="font-extrabold text-[var(--text-primary)] text-lg mb-1">¿Listo para transmitir?</CardTitle>
            <p className="text-sm text-[var(--text-secondary)]">
              Empieza una transmisión ahora mismo o programa una para más tarde.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={() => setShowSchedule(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Calendar className="h-4 w-4" />
              Programar
            </button>
            <button
              onClick={() => setShowStart(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors shadow-sm"
            >
              <Play className="h-4 w-4" />
              Empezar ahora
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Transmisiones este mes"
          value={transmisionesEsteMes}
          icon={Radio}
          color="var(--accent)"
          subtitle="En el periodo actual"
        />
        <KPICard
          label="Viewers promedio"
          value={viewersPromedio}
          icon={Eye}
          color="#3B82F6"
          subtitle="Por transmisión"
        />
        <KPICard
          label="Pedidos generados"
          value={pedidosTotales}
          icon={ShoppingBag}
          color="#10B981"
          subtitle="Total histórico"
        />
        <KPICard
          label="Engagement"
          value={`${engagementPromedio}%`}
          icon={DollarSign}
          color="#F59E0B"
          subtitle="Promedio viewers activos"
        />
      </div>

      {/* Programadas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-bold text-[var(--text-primary)] text-sm uppercase tracking-wide">
            Próximas transmisiones
          </CardTitle>
          <button
            onClick={() => setShowSchedule(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </button>
        </div>

        {scheduled.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] bg-white border border-gray-100 rounded-2xl">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">Sin transmisiones programadas</p>
            <p className="text-xs mt-1">Programa tu próxima transmisión.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {scheduled.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3 w-3 text-[var(--text-tertiary)]" />
                      <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                        {fmtDateTime(s.scheduledAt)}
                      </p>
                    </div>
                    <h4 className="font-bold text-[var(--text-primary)] mb-1 line-clamp-2">{s.title}</h4>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{s.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <p className="text-xs text-[var(--text-secondary)]">
                    <span className="font-bold text-[var(--text-primary)]">{s.featuredProductCount}</span> producto{s.featuredProductCount !== 1 ? "s" : ""} destacado{s.featuredProductCount !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleCancelScheduled(s.id)}
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                      title="Cancelar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pasadas */}
      <div className="space-y-3">
        <CardTitle className="font-bold text-[var(--text-primary)] text-sm uppercase tracking-wide">
          Transmisiones pasadas
        </CardTitle>

        {past.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] bg-white border border-gray-100 rounded-2xl">
            <Radio className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">Sin transmisiones históricas</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info-500)] rounded-xl text-xs text-[var(--data-info-500)]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Las métricas se actualizan en tiempo real durante cada transmisión y se consolidan
                al finalizar.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {past.map((l) => (
                <LivePerformanceCard key={l.id} live={l} />
              ))}
            </div>
          </>
        )}
      </div>

      {showSchedule && (
        <ScheduleLiveModal
          onClose={() => setShowSchedule(false)}
          onSchedule={handleSchedule}
        />
      )}

      {showStart && (
        <StartLiveModal
          onClose={() => setShowStart(false)}
          onStart={() => {
            setShowStart(false);
            // En producción: redirect a /admin/lives/streaming
          }}
        />
      )}
    </div>
  );
}
