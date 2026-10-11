"use client";

/**
 * Crecimiento › Mejores clientes (antes «Análisis RFM»). Ordena a tus clientes
 * por qué tan reciente, qué tan seguido y cuánto compraron en el período,
 * comparándolos ENTRE ELLOS (tercios). Consume /api/analytics/rfm sin tocarlo.
 *
 * No repite a Mis clientes: sus segmentos (`inferSegment`: Frecuente,
 * Ocasional, Nuevo, Perdido) usan cortes fijos (5 compras, 90 días) sobre
 * toda la historia. Por eso acá los grupos tienen OTROS nombres —antes había
 * un «Nuevos» y un «Perdidos» en cada pestaña con reglas distintas— y el ⓘ
 * dice en qué se diferencian.
 *
 * Patrón del panel (11-10): título · período · Más en una fila; los grupos
 * como filtro de 48 px (antes seis tarjetas de ~130 px); la tabla a 14 px.
 */
import { useCallback, useEffect, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { MessageCircle, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PERIODOS_RFM, grupoRfm, type RFMCustomer, type RFMSegment } from "./rfm-grupos";

export default function RFMTab() {
  const [days, setDays] = useState(90);
  const [segments, setSegments] = useState<RFMSegment[]>([]);
  const [customers, setCustomers] = useState<RFMCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/analytics/rfm?days=${days}`);
      if (!res.ok) throw new Error("fetch fail");
      const data = (await res.json()) as { segments?: RFMSegment[]; customers?: RFMCustomer[]; message?: string };
      setSegments(data.segments ?? []);
      setCustomers(data.customers ?? []);
      if (data.message) setMessage(data.message);
    } catch {
      setSegments([]);
      setCustomers([]);
      setMessage("No se pudo cargar. Prueba con Actualizar.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const shown = activeSeg ? customers.filter((c) => c.segment === activeSeg) : customers;
  const activo = activeSeg ? segments.find((s) => s.segment === activeSeg) : undefined;
  const periodo = PERIODOS_RFM.find((p) => p.days === days)?.label ?? `${days} días`;

  const acciones: MenuAccion[] = [
    {
      id: "masivos",
      label: "Escribirles",
      hint: "Clientes › Mensajes masivos: el mensaje redactado, uno por uno en tu WhatsApp",
      icon: MessageCircle,
      onSelect: () => { irAEnlace(hrefDeDestino({ tab: "clientes", params: { vista: "mensajes" } })); },
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => { void load(); } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Mejores clientes</SectionTitle>
          <InfoTip
            title="Mejores clientes (RFM)"
            what="Compara a tus clientes entre ellos por tres cosas del período: hace cuánto compraron (Recencia), cuántas veces (Frecuencia) y cuánto gastaron (Monto). Cada uno cae en un grupo y cada grupo pide un trato distinto."
            affects="No son los segmentos de Mis clientes (Frecuente, Ocasional, Nuevo, Perdido): esos usan cortes fijos sobre toda la historia; estos cambian con el período y con tus demás clientes."
            example="En 90 días Rosa compró 8 veces y la última fue ayer: Los mejores. Juan compraba seguido y hace 2 meses que no viene: En riesgo."
          />
        </div>
        <div role="group" aria-label="Período" className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {PERIODOS_RFM.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "h-10 rounded-lg px-3 text-sm font-semibold transition-colors",
                days === p.days ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-[var(--shadow-xs)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="ml-auto w-12 shrink-0" title="Escribirles y actualizar" />
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Calculando…</p>
      ) : segments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">{message ?? `Sin compras con cliente identificado en ${periodo}.`}</p>
          {days < 365 && (
            <button type="button" onClick={() => setDays(365)} className={button({ variant: "secondary", className: "rounded-xl text-sm" })}>
              Ver el último año
            </button>
          )}
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filtrar por grupo" className="flex flex-wrap items-center gap-2 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1 scrollbar-hide">
            {[{ segment: null as string | null, count: customers.length }, ...segments].map((s) => {
              const g = s.segment ? grupoRfm(s.segment) : null;
              const pulsado = activeSeg === s.segment;
              return (
                <button
                  key={s.segment ?? "todos"}
                  type="button"
                  aria-pressed={pulsado}
                  onClick={() => setActiveSeg(s.segment)}
                  title={g?.accion}
                  className={cn(
                    "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
                    pulsado
                      ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {g && <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", g.punto)} aria-hidden />}
                  {g?.rotulo ?? "Todos"}
                  <span className="font-bold tabular-nums">{s.count}</span>
                </button>
              );
            })}
          </div>

          {activo && (
            <p className="text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Qué hacer:</strong> {grupoRfm(activo.segment).accion}{" "}
              <span className="text-[var(--text-tertiary)]">· gastan {formatCurrency(activo.avgMonetary)} en promedio · {activo.avgFrequency} compras</span>
            </p>
          )}

          <div className="max-h-[32rem] overflow-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <DataTable>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Grupo</th>
                  <th className="text-right">Última compra</th>
                  <th className="text-right">Compras</th>
                  <th className="text-right">Gastó</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map((c) => (
                  <tr key={c.phone}>
                    <td>
                      <p className="max-w-[14rem] truncate font-semibold text-[var(--text-primary)]">{c.name}</p>
                      <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{c.phone}</p>
                    </td>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{grupoRfm(c.segment).rotulo}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">
                      {c.recencyDays === 0 ? "hoy" : c.recencyDays === 1 ? "ayer" : `hace ${c.recencyDays} días`}
                    </td>
                    <td className="text-right tabular-nums text-[var(--text-secondary)]">{c.frequency}</td>
                    <td className="whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(c.monetary)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          {shown.length > 200 && <p className="text-sm text-[var(--text-tertiary)]">Se ven los primeros 200 de {shown.length}.</p>}
        </>
      )}
    </div>
  );
}
