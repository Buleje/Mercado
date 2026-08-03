"use client";

/**
 * CtpSimuladorModal — "¿qué pasa si…?" ANTES de registrar una corrida.
 *
 * El operador elige qué guías de ingreso consumir y con qué rendimiento
 * esperado, y ve al instante: cuánto va a producir, cuánto le cuesta la madera
 * (COGS) y qué margen deja a un precio meta. Decidir con números antes de
 * comprometer la materia prima — nada se guarda, es un tablero de cálculo.
 *
 * Reusa `availableSource(produccion)` (guías con disponible + costo/m³) y el
 * referencial SERFOR (`ctp-rendimiento.ts`). Regla honesta: si a una guía
 * elegida le falta el costo (factura pendiente), el COGS es DESCONOCIDO (null),
 * nunca 0 — igual que el COGS real del despacho (ADR-134/135).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Calculator, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { rendimientoReferencial } from "@/lib/forestal/ctp-rendimiento";
import { Btn, MODAL_BODY } from "./ctp-shared";

/** 1 m³ = 423.78 pies tablares (misma constante que el cubicador). */
const PT_POR_M3 = 423.78;

interface Guia {
  id: string;
  code: string | null; // GTF
  species: string | null;
  scientific: string | null;
  cites: boolean;
  disponible: number; // m³ sin consumir
  costoUnitario: number | null; // S/ por m³, null si falta factura
  moneda: string;
}

const money = (v: number, m = "PEN") => `${m === "USD" ? "US$" : "S/"} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n4 = (v: number) => v.toFixed(4);

export default function CtpSimuladorModal({ onClose }: { onClose: () => void }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ingresoId → m³ a consumir (0/ausente = no seleccionado).
  const [sel, setSel] = useState<Record<string, number>>({});
  const [producto, setProducto] = useState("Tablones");
  const [rendStr, setRendStr] = useState("");
  const [procesoStr, setProcesoStr] = useState("");
  const [precioStr, setPrecioStr] = useState("");

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

  const ref = rendimientoReferencial(producto);
  const rend = rendStr.trim() !== "" ? Number(rendStr) : (ref ?? 55);

  const toggle = (g: Guia) =>
    setSel((s) => {
      const next = { ...s };
      if (next[g.id] != null) delete next[g.id];
      else next[g.id] = g.disponible;
      return next;
    });
  const setVol = (id: string, v: number) => setSel((s) => ({ ...s, [id]: v }));

  const sim = useMemo(() => {
    const elegidas = guias.filter((g) => sel[g.id] != null && sel[g.id] > 0);
    const inputM3 = elegidas.reduce((a, g) => a + Math.min(sel[g.id], g.disponible), 0);
    const producidoM3 = inputM3 * (rend / 100);
    const producidoPt = producidoM3 * PT_POR_M3;
    // COGS materia prima: null si a alguna guía elegida le falta el costo, o si mezclan monedas.
    const monedas = new Set(elegidas.map((g) => g.moneda || "PEN"));
    const faltaCosto = elegidas.some((g) => g.costoUnitario == null);
    const cogsMP =
      elegidas.length === 0 || faltaCosto || monedas.size > 1
        ? null
        : elegidas.reduce((a, g) => a + Math.min(sel[g.id], g.disponible) * (g.costoUnitario ?? 0), 0);
    const proceso = procesoStr.trim() !== "" ? Number(procesoStr) : 0;
    const cogsTotal = cogsMP != null ? cogsMP + proceso : null;
    const costoUnit = cogsTotal != null && producidoM3 > 0 ? cogsTotal / producidoM3 : null;
    const precio = precioStr.trim() !== "" ? Number(precioStr) : null;
    const margenPct = precio != null && precio > 0 && costoUnit != null ? ((precio - costoUnit) / precio) * 100 : null;
    return {
      nGuias: elegidas.length, inputM3, producidoM3, producidoPt,
      cogsMP, cogsTotal, costoUnit, margenPct,
      motivo: elegidas.length === 0 ? "sin_guias" : faltaCosto ? "falta_costo" : monedas.size > 1 ? "monedas" : "ok",
    };
  }, [guias, sel, rend, procesoStr, precioStr]);

  return (
    <AdminModal open onClose={onClose} variant="info" title="Simulador de corrida" description="Previsualizá producido, costo y margen antes de registrar" icon={Calculator}>
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {loading && <div className="p-8 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando guías disponibles…</p></div>}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div>
            <Btn variant="secondary" size="sm" className="ml-auto" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Form (izq) + preview sticky (der) en 2 columnas. */}
            <div className="grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-start">
            {/* Preview — arriba en mobile, sticky a la derecha en desktop. */}
            <div className="order-1 lg:order-2 lg:sticky lg:top-0">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-canvas)] p-4">
              <Stat label="Materia prima" value={`${n4(sim.inputM3)} m³`} sub={`${sim.nGuias} guía${sim.nGuias === 1 ? "" : "s"}`} />
              <Stat label={`Producido (${rend}%)`} value={`${n4(sim.producidoM3)} m³`} sub={`${sim.producidoPt.toFixed(0)} pt`} tone="ok" />
              <Stat label="COGS estimado" value={sim.cogsTotal != null ? money(sim.cogsTotal) : "—"} sub={sim.costoUnit != null ? `${money(sim.costoUnit)}/m³` : cogsMotivo(sim.motivo)} tone={sim.cogsTotal != null ? undefined : "muted"} />
              <Stat label="Margen a precio meta" value={sim.margenPct != null ? `${sim.margenPct.toFixed(1)}%` : "—"} sub={sim.margenPct == null ? "cargá precio y costo" : sim.margenPct < 0 ? "pérdida" : "ganancia"} tone={sim.margenPct == null ? "muted" : sim.margenPct < 0 ? "bad" : "ok"} />
            </div>
            </div>

            {/* Form: parámetros + guías (izquierda en desktop). */}
            <div className="order-2 space-y-4 lg:order-1">
            {/* Parámetros */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Producto" hint={ref != null ? `Referencial SERFOR: ${ref}%` : "Sin referencial estándar"}>
                <input className={I} value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Tablones, listones…" />
              </Field>
              <Field label="Rendimiento esperado (%)" hint={rendStr.trim() === "" && ref != null ? "usando el referencial" : undefined}>
                <input className={I} value={rendStr} onChange={(e) => setRendStr(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(ref ?? 55)} />
              </Field>
              <Field label="Costo de proceso (S/)" hint="aserrío, secado, mano de obra">
                <input className={I} value={procesoStr} onChange={(e) => setProcesoStr(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" />
              </Field>
              <Field label="Precio meta (S/ por m³)" hint="para calcular el margen">
                <input className={I} value={precioStr} onChange={(e) => setPrecioStr(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" />
              </Field>
            </div>

            {/* Guías disponibles */}
            <div>
              <CardTitle as="h3" className="mb-2 text-sm font-bold text-[var(--text-primary)]">Guías de ingreso disponibles</CardTitle>
              {guias.length === 0 ? (
                <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">No hay materia prima validada sin consumir. Validá ingresos primero.</p>
              ) : (
                <div className="space-y-2">
                  {guias.map((g) => {
                    const on = sel[g.id] != null;
                    return (
                      <div key={g.id} className={`flex flex-wrap items-center gap-3 rounded-xl border-2 p-3 ${on ? "border-[var(--brand-ink)] bg-[var(--surface-canvas)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]"}`}>
                        <button type="button" onClick={() => toggle(g)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-xs font-bold ${on ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white" : "border-[var(--rule-base)] text-transparent"}`} aria-label={on ? "Quitar" : "Agregar"}>✓</button>
                        <div className="min-w-[8rem] flex-1">
                          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">{g.species ?? "—"}{g.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</div>
                          <div className="font-mono text-xs text-[var(--text-tertiary)]">GTF {g.code ?? "—"} · disp. {n4(g.disponible)} m³ · {g.costoUnitario != null ? `${money(g.costoUnitario, g.moneda)}/m³` : "sin costo"}</div>
                        </div>
                        {on && (
                          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            consumir
                            <input className="h-9 w-24 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm text-[var(--text-primary)] outline-none" value={sel[g.id]} onChange={(e) => setVol(g.id, Math.min(Number(e.target.value.replace(/[^\d.]/g, "")) || 0, g.disponible))} inputMode="decimal" /> m³
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-[var(--text-tertiary)]">Es una simulación — no registra nada. Cuando decidas, cargá la corrida real en «{"Nueva producción"}» con estas guías.</p>
            </div>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function cogsMotivo(m: string): string {
  if (m === "sin_guias") return "elegí guías";
  if (m === "falta_costo") return "una guía sin factura → desconocido";
  if (m === "monedas") return "monedas mezcladas";
  return "";
}

const I = "w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)]";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--text-primary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" | "muted" }) {
  const color = tone === "bad" ? "text-[var(--data-error-700)]" : tone === "ok" ? "text-[var(--data-success-700)]" : tone === "muted" ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]";
  return (
    <div>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
