"use client";

import { useEffect, useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, Plus, ShoppingCart } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ListaDeAlertas } from "@/components/admin/hoy/ListaDeAlertas";
import { useOverview } from "@/components/admin/hoy/use-overview";
import { SkeletonEditorial, button } from "@/components/ui-system";
import { usePersonalizedGreeting } from "@/hooks/use-personalized-greeting";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { useTenant } from "@/contexts/tenant-context";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { fechaConDia, soles } from "@/lib/admin/inicio/formato-tablero";
import type { AlertaDeInicio } from "@/lib/admin/overview-tipos";
import { cn } from "@/lib/utils";
import type { DateRange } from "../DashboardDateRange";

/**
 * «Para hoy» — lo primero que se mira en Inicio › Resumen (2026-10-11).
 *
 * Funde dos bloques que decían lo mismo (medido en main el 11-10):
 *  - la tarjeta «Tienes 3 cosas por resolver» (`MorningBriefingCard`, de
 *    `/api/admin/stats`): «1 fiado vencido», «8 pedidos pendientes»,
 *    «1 producto por agotarse»;
 *  - la columna «Alertas accionables» (`DashboardAlertsList`, de
 *    `/api/admin/overview`): «1 fiado atrasado», «18 pedidos esperan…»,
 *    «1 producto en su mínimo o agotado».
 * Quedan los avisos de `/api/admin/overview` (llevan a la lista ya filtrada) y,
 * de la tarjeta vieja, lo que sólo ella sabía: los pagos Yape por verificar,
 * lo vendido ayer y la sugerencia del día (en el ⓘ). El saludo del Resumen vive
 * acá (uno solo). Se pliega y se recuerda (`inicio:resumen:para-hoy`): reemplaza
 * al «ocultar por hoy». Cabecera propia (no `Plegable`): a 400 px las acciones
 * bajan a otra línea en vez de exprimir el título.
 */

interface Briefing {
  ventasAyer: number;
  yape: number;
}

/** Lo que sólo sabía la tarjeta vieja: Yape por verificar y lo vendido ayer. */
function useBriefing(): Briefing | null {
  const [b, setB] = useState<Briefing | null>(null);
  const rol = useMiRol();
  useEffect(() => {
    // /api/admin/stats sólo deja pasar admin: un cajero recibía 403 en cada carga.
    if (!puedePedir("/api/admin/stats", rol)) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/stats");
        if (cancelado || !r.ok) return;
        const s = (await r.json()) as { salesYesterday?: number; pendingYape?: number } | null;
        if (cancelado || !s) return;
        setB({ ventasAyer: s.salesYesterday ?? 0, yape: s.pendingYape ?? 0 });
      } catch {
        /* sin estas dos cifras el bloque igual sale con los avisos */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [rol]);
  return b;
}

const RANGO_SEVERIDAD = { danger: 0, warning: 1, info: 2 } as const;

/** La sugerencia de la tarjeta vieja, por prioridad: Yape → fiados → pedidos → stock. */
function sugerenciaDe(ids: Set<string>): string | null {
  if (ids.has("yape")) return "Verifica los pagos Yape pendientes antes de preparar el pedido: así no despachas sin tener la plata confirmada.";
  if (ids.has("overdue")) return "Cobra los fiados atrasados hoy: mientras más esperas, más difícil es recuperar esa plata.";
  if (ids.has("stale-orders") || ids.has("active-orders")) return "Confirma los pedidos pendientes rápido para no perder la venta.";
  if (ids.has("stock-critical")) return "Repón el stock bajo antes de quedarte sin vender tus productos estrella.";
  return null;
}

export function ParaHoy({ dateRange }: { dateRange?: DateRange }) {
  const { data, loading } = useOverview(dateRange);
  const brief = useBriefing();
  const { brand } = usePlatformBrand();
  const { branding } = useTenant();
  const negocio = branding?.name?.trim() || brand?.identity.name?.trim() || "tu negocio";
  const saludo = usePersonalizedGreeting(negocio);
  const [abierto, setAbierto] = useLocalStorage<boolean>("inicio:resumen:para-hoy", true);
  const idLista = `${useId()}-lista`;

  if (loading && !data) return <SkeletonEditorial height={120} rounded="xl" />;

  const alertas: AlertaDeInicio[] = [
    ...(brief && brief.yape > 0
      ? [{
          id: "yape",
          severity: "warning" as const,
          text: `${brief.yape} ${brief.yape === 1 ? "pago Yape por verificar" : "pagos Yape por verificar"}`,
          href: "/admin?tab=pedidos",
        }]
      : []),
    ...(data?.alerts ?? []),
  ].sort((a, b) => RANGO_SEVERIDAD[a.severity] - RANGO_SEVERIDAD[b.severity]);
  const n = alertas.length;
  const sugerencia = sugerenciaDe(new Set(alertas.map((a) => a.id)));

  const titulo = (
    <span className="block min-w-0 flex-1">
      <span className="block text-sm font-semibold text-[var(--text-secondary)]">
        {saludo} · {fechaConDia(new Date())}
        {brief && <> · Ayer vendiste <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(brief.ventasAyer)}</span></>}
      </span>
      <span className="mt-0.5 block text-xl font-extrabold leading-tight tracking-tight text-[var(--text-primary)]">
        {n === 0 ? "Todo en orden por ahora" : `Tienes ${n} ${n === 1 ? "cosa" : "cosas"} por resolver`}
      </span>
    </span>
  );

  const acciones = (
    <>
      {sugerencia && <InfoTip title="Sugerencia del día" what={sugerencia} ariaLabel="Sugerencia del día" />}
      <EnlacePanel apariencia="heredada" href="/admin?tab=ventas-caja" className={button({ variant: "primary", className: "rounded-xl gap-2 hover:no-underline" })}>
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Registrar venta
      </EnlacePanel>
      <EnlacePanel apariencia="heredada" href="/admin?tab=pedidos" className={button({ variant: "secondary", className: "rounded-xl gap-2 hover:no-underline max-sm:w-12 max-sm:px-0" })}>
        <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
        <span className="max-sm:sr-only">Ver pedidos</span>
      </EnlacePanel>
    </>
  );

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <CardTitle className="min-w-0 flex-1 basis-56">
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idLista}
            onClick={() => setAbierto((v) => !v)}
            className="-mx-2 flex w-[calc(100%+1rem)] min-h-12 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {titulo}
            <ChevronDown
              aria-hidden
              className={cn("h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-fast)]", abierto && "rotate-180")}
            />
          </button>
        </CardTitle>
        <div className="flex items-center gap-2">{acciones}</div>
      </div>
      <div id={idLista} hidden={!abierto} className="border-t border-[var(--rule-soft)]">
        {abierto &&
          (n === 0 ? (
            <p className="px-5 py-4 text-sm font-semibold text-[var(--text-secondary)]">
              Sin fiados atrasados, pedidos olvidados ni productos en su mínimo.
            </p>
          ) : (
            <ListaDeAlertas
              alerts={alertas}
              tamano="amplio"
              className={cn(
                n > 1 && "lg:grid lg:grid-cols-2 lg:divide-y-0 lg:[&>li]:border-b lg:[&>li]:border-[var(--rule-soft)] lg:-mb-px",
              )}
            />
          ))}
      </div>
    </section>
  );
}
