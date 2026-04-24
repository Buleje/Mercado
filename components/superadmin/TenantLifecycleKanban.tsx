"use client";

import { LoadingState } from "@buleje/design-system";
/**
 * TenantLifecycleKanban.tsx — Roadmap item #40
 *
 * Vista Kanban de 5 columnas: Trial → Onboarded → Active → At-Risk → Churned
 * Cada tarjeta muestra: nombre, MRR, último pedido, signal activo.
 * Click → TenantDetailModal (impersonate, WhatsApp, email, extender trial).
 */

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, ExternalLink, MessageCircle, Mail,
  AlertTriangle, Clock, CheckCircle, XCircle, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// -- Tipos --

type LifecycleStage = "trial" | "onboarded" | "active" | "at_risk" | "churned";

interface TenantCard {
  id: string;
  slug: string;
  name: string;
  plan: string;
  stage: LifecycleStage;
  mrr: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  trialEndsAt: string | null;
  signal: string | null;
}

interface KanbanColumn {
  stage: LifecycleStage;
  label: string;
  icon: typeof Users;
  color: string;
  bgColor: string;
  borderColor: string;
}

// -- Columnas --

const COLUMNS: KanbanColumn[] = [
  { stage: "trial", label: "Trial", icon: Clock, color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bgColor: "bg-emerald-50 dark:bg-emerald-900/20", borderColor: "border-emerald-200 dark:border-emerald-700" },
  { stage: "onboarded", label: "Onboarded", icon: CheckCircle, color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bgColor: "bg-emerald-50 dark:bg-emerald-900/20", borderColor: "border-emerald-200 dark:border-emerald-700" },
  { stage: "active", label: "Activo", icon: Users, color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bgColor: "bg-green-50 dark:bg-green-900/20", borderColor: "border-green-200 dark:border-green-700" },
  { stage: "at_risk", label: "En Riesgo", icon: AlertTriangle, color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]", bgColor: "bg-amber-50 dark:bg-amber-900/20", borderColor: "border-amber-200 dark:border-amber-700" },
  { stage: "churned", label: "Churned", icon: XCircle, color: "text-[var(--data-error)] dark:text-[var(--data-error)]", bgColor: "bg-red-50 dark:bg-red-900/20", borderColor: "border-red-200 dark:border-red-700" },
];

// -- Componente tarjeta --

function TenantCardUI({ tenant, onAction }: { tenant: TenantCard; onAction: (action: string, tenant: TenantCard) => void }) {
  return (
    <div className="bg-white dark:bg-card rounded-lg border border-[var(--rule-soft)] dark:border-card-border p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-foreground truncate">{tenant.name}</h4>
        <span className="text-[length:var(--ts-2xs)] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-muted">{tenant.plan}</span>
      </div>

      {tenant.mrr > 0 && (
        <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold">S/{tenant.mrr}/mes</p>
      )}

      {tenant.lastOrderDate && (
        <p className="text-[length:var(--ts-2xs)] text-muted mt-1">
          Último pedido: {tenant.daysSinceLastOrder === 0 ? "hoy" : `hace ${tenant.daysSinceLastOrder}d`}
        </p>
      )}

      {tenant.signal && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning)] dark:text-[var(--data-warning)] mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {tenant.signal}
        </p>
      )}

      {tenant.trialEndsAt && tenant.stage === "trial" && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-success)] mt-1">
          Trial hasta: {new Date(tenant.trialEndsAt).toLocaleDateString("es-PE")}
        </p>
      )}

      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50 dark:border-[var(--rule-base)]">
        {tenant.ownerPhone && (
          <button
            onClick={() => onAction("whatsapp", tenant)}
            className="p-1.5 rounded-md hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success)]/20 text-[var(--data-success)] transition-colors"
            title="WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        )}
        {tenant.ownerEmail && (
          <button
            onClick={() => onAction("email", tenant)}
            className="p-1.5 rounded-md hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success)]/20 text-[var(--data-success)] transition-colors"
            title="Email"
          >
            <Mail className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onAction("impersonate", tenant)}
          className="p-1.5 rounded-md hover:bg-[var(--surface-sunken)] text-muted transition-colors ml-auto"
          title="Impersonar"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// -- Componente principal --

export default function TenantLifecycleKanban() {
  const [tenants, setTenants] = useState<TenantCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/tenants?include=lifecycle");
      if (!res.ok) throw new Error("Error cargando tenants");
      const data = await res.json();

      const cards: TenantCard[] = (data.tenants ?? data ?? []).map((t: Record<string, unknown>) => {
        const lastOrder = t.lastOrderDate as string | null;
        const daysSince = lastOrder ? Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86400000) : null;

        let stage: LifecycleStage = "active";
        if (t.trialEndsAt && new Date(t.trialEndsAt as string) > new Date()) stage = "trial";
        else if (daysSince === null || daysSince > 30) stage = "churned";
        else if (daysSince > 14) stage = "at_risk";
        else if (t.onboardingCompletedAt) stage = "active";
        else stage = "onboarded";

        return {
          id: t.id as string,
          slug: t.slug as string,
          name: t.name as string,
          plan: (t.plan as string) ?? "free",
          stage,
          mrr: (t.mrr as number) ?? 0,
          lastOrderDate: lastOrder,
          daysSinceLastOrder: daysSince,
          ownerPhone: (t.ownerPhone as string) ?? null,
          ownerEmail: (t.ownerEmail as string) ?? null,
          trialEndsAt: (t.trialEndsAt as string) ?? null,
          signal: (t.churnSignal as string) ?? null,
        };
      });

      setTenants(cards);
    } catch {
      setError("No se pudieron cargar los tenants.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = useCallback((action: string, tenant: TenantCard) => {
    if (action === "whatsapp" && tenant.ownerPhone) {
      window.open(`https://wa.me/${tenant.ownerPhone.replace(/\D/g, "")}`, "_blank");
    } else if (action === "email" && tenant.ownerEmail) {
      window.open(`mailto:${tenant.ownerEmail}`, "_blank");
    } else if (action === "impersonate") {
      window.open(`/${tenant.slug}/admin`, "_blank");
    }
  }, []);

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[var(--data-error)]">{error}</p>
        <button onClick={loadData} className="mt-3 text-sm font-bold text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">Lifecycle de Tenants</h2>
        <button onClick={loadData} className="text-xs text-primary hover:underline">Actualizar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const colTenants = tenants.filter((t) => t.stage === col.stage);
          const Icon = col.icon;

          return (
            <div key={col.stage} className={cn("rounded-xl border p-3", col.borderColor, col.bgColor)}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className={cn("h-4 w-4", col.color)} />
                <h3 className={cn("text-sm font-bold", col.color)}>{col.label}</h3>
                <span className="ml-auto text-xs font-bold text-muted bg-white dark:bg-card rounded-full px-2 py-0.5">
                  {colTenants.length}
                </span>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {colTenants.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">Sin tenants</p>
                ) : (
                  colTenants.map((t) => (
                    <TenantCardUI key={t.id} tenant={t} onAction={handleAction} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
