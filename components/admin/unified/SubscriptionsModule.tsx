"use client";

/**
 * SubscriptionsModule — Bodega al Mes (suscripciones recurrentes).
 *
 * Expone las suscripciones «Bodega al Mes» que los clientes contratan desde el
 * marketplace: KPIs (`/api/admin/subscriptions/stats`), lista real
 * (`/api/admin/subscriptions`) y acciones que escriben de verdad contra
 * `/api/admin/subscriptions/[id]`.
 *
 * Patrón del panel: una fila de cabecera (título · secciones Activas/Pausadas/
 * Canceladas con su cuenta · Indicadores plegables · «⋯»), filtros en una fila
 * y, por suscripción, la acción principal visible y «Cancelar» en el «⋯».
 *
 * No hay sección «Planes»: el modelo real es por producto + frecuencia +
 * descuento, no por tiers fijos; mostrarla habría sido inventar datos.
 */

import { useEffect, useMemo, useState } from "react";
import { DataTable, LoadingState } from "@buleje/design-system";
import { Download, RefreshCw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { leerJson } from "@/lib/errores/sin-dato";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CabeceraVista, CLASE_SELECT, CLASE_TABLA, descargarCsv, FilaFiltros, tarjetasDe, TH, Vacio } from "@/components/admin/campanas/comun";

import { FilaAcciones } from "./subscriptions-admin/FilaAcciones";
import { FREQUENCY_LABELS, STATUS_LABELS, STATUS_STYLES, type Accion, type SubFrequency, type SubStatus, type Subscription, type SubscriptionStats } from "./subscriptions-admin/tipos";

const MODULE_ID = "subscriptions";
const ID_PANEL = "panel-bodega-al-mes";
const TAB_IDS = ["activas", "pausadas", "canceladas"] as const;
type Seccion = (typeof TAB_IDS)[number];
const DE_SECCION: Record<Seccion, SubStatus> = { activas: "active", pausadas: "paused", canceladas: "cancelled" };

const ACTION_TO_STATUS: Record<Accion, SubStatus> = { pausar: "paused", reanudar: "active", cancelar: "cancelled" };

const fmt = (n: number) => `S/ ${formatNumber(n, 2)}`;
const fmtDate = (iso: string) => {
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
};

export default function SubscriptionsModule() {
  const { confirm } = useConfirm();
  // La sección vive en `?sub=` (el hub ya usa `?vista=`): link compartible y «atrás» del navegador.
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>(MODULE_ID, TAB_IDS, TAB_IDS[0]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [search, setSearch] = useState("");
  const [freq, setFreq] = useState<SubFrequency | "all">("all");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/admin/subscriptions", { credentials: "include", signal: ac.signal }),
      fetch("/api/admin/subscriptions/stats", { credentials: "include", signal: ac.signal }),
    ])
      .then(async ([listRes, statsRes]) => {
        if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
        const list = (await listRes.json()) as { items?: Subscription[] };
        setSubs(list.items ?? []);
        if (statsRes.ok) {
          const s = (await statsRes.json()) as SubscriptionStats;
          setStats({ active: s.active, paused: s.paused, cancelled: s.cancelled, mrrEstimated: s.mrrEstimated });
        }
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError("No se pudieron cargar las suscripciones.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [recarga]);

  const handleAction = async (s: Subscription, action: Accion) => {
    if (action === "cancelar") {
      const ok = await confirm({
        title: `¿Cancelar la suscripción de ${s.customerName}?`,
        description: "Ya no se le cobrará ni se le enviará la canasta. Para volver tendría que contratar de nuevo.",
        intent: "danger",
        confirmLabel: "Sí, cancelar",
      });
      if (!ok) return;
    }
    const newStatus = ACTION_TO_STATUS[action];
    const prev = subs;
    setSubs((cur) => cur.map((x) => (x.id === s.id ? { ...x, status: newStatus } : x)));
    try {
      const res = await fetch(`/api/admin/subscriptions/${s.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await leerJson<{ message?: string; error?: string }>(res);
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      toast.success(action === "pausar" ? "Suscripción pausada" : action === "reanudar" ? "Suscripción reanudada" : "Suscripción cancelada");
    } catch (err) {
      setSubs(prev);
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la suscripción");
    }
  };

  const porEstado = useMemo(
    () => ({
      active: subs.filter((s) => s.status === "active"),
      paused: subs.filter((s) => s.status === "paused"),
      cancelled: subs.filter((s) => s.status === "cancelled"),
    }),
    [subs],
  );
  const nuevosEsteMes = useMemo(() => {
    const now = new Date();
    return subs.filter((s) => {
      const d = new Date(s.startDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [subs]);
  const activas = stats?.active ?? porEstado.active.length;
  const mrr = stats?.mrrEstimated ?? 0;

  const kpis = useKpisPlegables({
    claveMemoria: "bodega-al-mes",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading,
    resumen: `${activas} activas`,
    tarjetas: tarjetasDe([
      { rotulo: "Suscripciones activas", valor: String(activas), detalle: "Vigentes hoy" },
      { rotulo: "Ingreso mensual estimado", valor: fmt(mrr), detalle: "Lo que entra cada mes si nadie se va" },
      { rotulo: "Nuevas este mes", valor: String(nuevosEsteMes), detalle: "Altas del mes en curso" },
    ]),
  });

  const secciones = TAB_IDS.map((clave) => ({
    clave,
    rotulo: clave === "activas" ? "Activas" : clave === "pausadas" ? "Pausadas" : "Canceladas",
    cuenta: porEstado[DE_SECCION[clave]].length,
  }));

  const delTab = porEstado[DE_SECCION[seccion]];
  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return delTab.filter((s) => {
      if (freq !== "all" && s.frequency !== freq) return false;
      if (!q) return true;
      return [s.customerName, s.customerPhone, s.productName, s.id].some((x) => x.toLowerCase().includes(q));
    });
  }, [delTab, search, freq]);

  const exportar = () =>
    descargarCsv(
      "suscripciones",
      ["ID", "Cliente", "Teléfono", "Producto", "Frecuencia", "Estado", "Inicio", "Próximo cobro", "Monto mensual"],
      filtradas.map((r) => [r.id, r.customerName, r.customerPhone, r.productName, FREQUENCY_LABELS[r.frequency], STATUS_LABELS[r.status], r.startDate, r.nextBilling, Number(r.monthlyAmount).toFixed(2)]),
    );

  const menu: MenuAccion[] = [
    { id: "csv", label: "Descargar CSV", hint: `${filtradas.length} suscripciones, con los filtros de ahora`, icon: Download, onSelect: exportar, disabled: filtradas.length === 0 },
    { id: "recargar", label: "Actualizar", icon: RefreshCw, onSelect: () => setRecarga((n) => n + 1) },
  ];

  const cabecera = (
    <CabeceraVista
      titulo="Bodega al Mes"
      ayuda={{
        title: "Bodega al Mes",
        what: "Los clientes que reciben una canasta que se repite: cada cuánto, de qué producto y cuánto pagan.",
        affects: "Pausar o cancelar corta los próximos cobros de esa persona.",
        example: "Rosa tiene la canasta básica cada 15 días; la pausas dos semanas y vuelve sola al reanudar.",
      }}
      secciones={<BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={irA} etiqueta="Secciones de Bodega al Mes" idPanel={ID_PANEL} />}
      indicadores={kpis.boton}
      menu={menu}
      tituloMenu="Descargar CSV y actualizar"
    />
  );

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
        <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
        <button type="button" onClick={() => setRecarga((n) => n + 1)} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecera}
      {kpis.panel}
      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)} className="space-y-3">
        <FilaFiltros valor={search} onCambio={setSearch} placeholder="Buscar cliente, teléfono o producto" etiqueta="Buscar suscripciones">
          <select value={freq} onChange={(e) => setFreq(e.target.value as SubFrequency | "all")} aria-label="Filtrar por frecuencia" className={CLASE_SELECT}>
            <option value="all">Todas las frecuencias</option>
            {(Object.keys(FREQUENCY_LABELS) as SubFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
            ))}
          </select>
        </FilaFiltros>

        {filtradas.length === 0 ? (
          <Vacio>{subs.length === 0 ? "Aún no hay suscripciones: aparecerán cuando un cliente contrate Bodega al Mes." : "Ninguna suscripción coincide con los filtros."}</Vacio>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="overflow-x-auto">
              <DataTable className={CLASE_TABLA}>
                <thead className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <tr>
                    <th className={TH}>Cliente</th>
                    <th className={cn(TH, "hidden sm:table-cell")}>Producto</th>
                    <th className={cn(TH, "hidden md:table-cell")}>Frecuencia</th>
                    <th className={cn(TH, "text-right")}>Monto al mes</th>
                    <th className={cn(TH, "hidden md:table-cell")}>Próximo cobro</th>
                    <th className={cn(TH, "text-center")}>Estado</th>
                    <th className={cn(TH, "text-right")}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filtradas.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[var(--surface-sunken)]">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[var(--text-primary)]">{s.customerName}</p>
                        <p className="text-sm text-[var(--text-secondary)]">{s.customerPhone}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-[var(--text-primary)] sm:table-cell">{s.productName}</td>
                      <td className="hidden px-4 py-3 text-[var(--text-secondary)] md:table-cell">{FREQUENCY_LABELS[s.frequency]}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">{fmt(s.monthlyAmount)}</td>
                      <td className="hidden px-4 py-3 text-[var(--text-secondary)] md:table-cell">{s.status === "cancelled" ? "—" : fmtDate(s.nextBilling)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-sm font-bold", STATUS_STYLES[s.status])}>{STATUS_LABELS[s.status]}</span>
                      </td>
                      <td className="px-4 py-3">
                        <FilaAcciones s={s} onAction={handleAction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
