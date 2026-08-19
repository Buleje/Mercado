"use client";

/**
 * CtpPatioAging — "gemelo del patio": qué materia prima está PARADA y hace
 * cuánto. La madera en troza sin procesar se degrada (mancha azul, insectos,
 * rajaduras) y encima inmoviliza capital. Esta vista lista las guías con saldo
 * sin consumir ordenadas por antigüedad, con el valor inmovilizado, para que el
 * operador procese primero lo más viejo (FIFO) antes de que pierda valor.
 *
 * Deriva de `availableSource(produccion)` (guías con `disponible` + `entryDate` +
 * costo/m³). Sin migración. El costo puede faltar (factura pendiente) → el valor
 * inmovilizado se reporta como parcial, nunca inventado.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Clock, RefreshCw } from "@buleje/design-system/icons";
import { bucketsAntiguedad } from "@/lib/forestal/ctp-saldos-analisis";

interface Guia {
  id: string; code: string | null; entryDate: string; species: string | null;
  cites: boolean; disponible: number; costoUnitario: number | null; moneda: string;
}

// Umbrales de antigüedad (días parado). La madera tropical en troza se degrada
// rápido: pasados ~2 meses el riesgo de mancha/insectos es alto.
const DIAS_ATENCION = 30;
const DIAS_RIESGO = 60;

/**
 * Colores de ESTADO, no de serie: cada tramo es una condición de la madera
 * (fresca / hay que mirarla / se está degradando). Van siempre con su etiqueta
 * de días al lado, así el tramo se identifica sin depender del color.
 *
 * En dark el texto sube a `-500` (el color BASE del preset) en vez del `-700`.
 * Motivo medido, no estético: `DesignTokensProvider` deriva la escala del
 * preset activo con `darken(base, 24%)` para el 700 sin mirar el tema, y esa
 * inyección pisa el bloque `.dark` de `globals.css`. Resultado sobre el fondo
 * oscuro real de la tarjeta: «Más de 60 días» quedaba en 2.15:1 y «Hasta 30
 * días» en 2.76:1 — por debajo del piso de 4.5:1 para texto. El 500 no pasa por
 * el `darken`, así que sobrevive al pisón.
 */
const TONO_TRAMO = {
  fresca: {
    texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
  },
  atencion: {
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  riesgo: {
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    barra: "bg-[var(--data-error-500)]",
  },
} as const;

const n2 = (v: number) => v.toFixed(2);
const money = (v: number, m = "PEN") => `${m === "USD" ? "US$" : "S/"} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diasDesde = (iso: string) => {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
};

export default function CtpPatioAging() {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp?available=produccion", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setGuias((await r.json()).items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const { filas, totM3, totValor, valorParcial, enRiesgo, tramos } = useMemo(() => {
    const filas = guias
      .map((g) => ({ ...g, dias: diasDesde(g.entryDate), valor: g.costoUnitario != null ? g.disponible * g.costoUnitario : null }))
      .sort((a, b) => b.dias - a.dias);
    const totM3 = filas.reduce((a, f) => a + f.disponible, 0);
    const totValor = filas.reduce((a, f) => a + (f.valor ?? 0), 0);
    const valorParcial = filas.some((f) => f.valor == null);
    const enRiesgo = filas.filter((f) => f.dias > DIAS_RIESGO).length;
    const tramos = bucketsAntiguedad(filas, DIAS_ATENCION, DIAS_RIESGO);
    return { filas, totM3, totValor, valorParcial, enRiesgo, tramos };
  }, [guias]);

  const badge = (dias: number) => {
    if (dias > DIAS_RIESGO) return { label: `${dias} días`, cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" };
    if (dias > DIAS_ATENCION) return { label: `${dias} días`, cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" };
    return { label: `${dias} días`, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  };

  if (loading && guias.length === 0) return null;
  if (error) return null; // sección secundaria — no rompe Saldos si falla
  if (guias.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Clock className="h-4 w-4" /> Antigüedad de materia prima (patio)</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Guías con saldo sin consumir, de más vieja a más nueva. Procesá primero lo más antiguo (FIFO) — la troza parada se degrada.</p>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Inmovilizado</p>
            <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{n2(totM3)} m³{totValor > 0 ? ` · ${money(totValor)}${valorParcial ? "*" : ""}` : ""}</p>
          </div>
          <button type="button" onClick={() => void load()} className="grid h-9 w-9 place-items-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]" aria-label="Recargar"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {enRiesgo > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--data-error-50)] px-4 py-2 text-xs font-medium text-[var(--data-error-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {enRiesgo} {enRiesgo === 1 ? "guía lleva" : "guías llevan"} más de {DIAS_RIESGO} días sin procesar — riesgo de degradación.
        </div>
      )}

      {/* Los tres tramos, a escala. La tabla de abajo lista guía por guía; esto
          contesta antes la pregunta que se hace al entrar al patio: cuánto de lo
          que está parado ya es viejo. Tres categorías no justifican un gráfico
          con ejes — barras proporcionales con el número al lado alcanzan y se
          leen igual sin color. */}
      {totM3 > 0 && (
        <ul className="space-y-2.5 border-b border-[var(--rule-soft)] px-4 py-3">
          {tramos.map((t) => {
            const pct = totM3 > 0 ? (t.m3 / totM3) * 100 : 0;
            const tono = TONO_TRAMO[t.clave];
            return (
              <li key={t.clave}>
                <div className="flex items-baseline gap-2 text-xs">
                  <span className={`font-bold ${tono.texto}`}>{t.label}</span>
                  <span className="text-[var(--text-tertiary)]">
                    {t.guias} {t.guias === 1 ? "guía" : "guías"}
                  </span>
                  <span className="ml-auto font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {n2(t.m3)} m³
                  </span>
                  <span className="w-10 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {pct.toFixed(0)} %
                  </span>
                  <span className="w-28 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {t.valor != null ? `${money(t.valor)}${t.valorParcial ? "*" : ""}` : "sin costo"}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className={`h-full rounded-full ${tono.barra}`}
                    style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>
            <Th>Especie</Th><Th>GTF</Th>
            <Th className="text-right">Sin consumir (m³)</Th>
            <Th className="text-right">Parada</Th>
            <Th className="text-right">Valor inmovilizado</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const b = badge(f.dias);
            return (
              <tr key={f.id} className="border-t border-[var(--rule-soft)]">
                <Td>
                  <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">{f.species ?? "—"}{f.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</span>
                </Td>
                <Td className="font-mono text-xs text-[var(--text-secondary)]">{f.code ?? "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(f.disponible)}</Td>
                <Td className="text-right"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${b.cls}`}>{b.label}</span></Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{f.valor != null ? money(f.valor, f.moneda) : <span className="text-xs text-[var(--text-tertiary)]">sin costo</span>}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {valorParcial && <p className="px-4 py-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">* Valor parcial: algunas guías no tienen costo cargado (factura pendiente).</p>}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
