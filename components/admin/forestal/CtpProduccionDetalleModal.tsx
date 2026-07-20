"use client";

/**
 * CtpProduccionDetalleModal — la ficha simétrica a la del despacho, del otro
 * lado de la cadena (ADR-134): de qué guías salió esta corrida, cuánto costó
 * (materia prima ponderada + proceso, on-read u congelado) y su rendimiento.
 *
 * Acciones post-alta:
 *   - Editar atribución (CtpAtribucionEditor kind="consumos", valida I1/I2).
 *     Bloqueada si el costo está congelado — congelado ⇒ inmutable (D6).
 *   - Congelar costo (POST /ctp/consumos {action:"congelar"}): irreversible,
 *     exige todas las facturas; confirm inline, no modal sobre modal.
 */

import { useCallback, useEffect, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle, SuccessAlert, WarningAlert, ErrorAlert } from "@buleje/design-system";
import {
  AlertCircle,
  Banknote,
  Boxes,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Snowflake,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import CtpAtribucionEditor from "./CtpAtribucionEditor";
import CtpHistorial from "./CtpHistorial";
import { Btn } from "./ctp-shared";

export interface ProduccionResumen {
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  cites: boolean;
  volumeInputM3: string | null;
  rendimientoPct: string | null;
  quantity: string | null;
  unit: string | null;
}

interface ConsumoDTO {
  id: string;
  woodEntryId: string;
  volumeM3: string | number;
  costoUnitarioSnap: string | number | null;
  congeladoAt: string | null;
  woodEntry: {
    gtfNumber: string;
    speciesCommonName: string | null;
    volumeM3: string | number | null;
    costoTotal: string | number | null;
    moneda: string | null;
    entryDate: string | null;
  };
}

interface CostoDTO {
  costoMateriaPrima: number | null;
  costoProceso: number | null;
  costoTotal: number | null;
  costoUnitario: number | null;
  moneda: string | null;
  motivo: "ok" | "sin_consumos" | "falta_factura" | "monedas_mezcladas" | "sin_produccion";
  congelado: boolean;
  atribuidoM3: number;
  sinAtribuirM3: number;
}

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

/** Por qué el costo es desconocido — null NUNCA se disfraza de 0. */
const COSTO_MOTIVO: Record<Exclude<CostoDTO["motivo"], "ok">, string> = {
  sin_consumos: "La corrida no tiene materia prima atribuida: no hay qué costear.",
  falta_factura: "Alguna guía consumida no tiene factura todavía. Sin factura el costo es desconocido, no 0.",
  monedas_mezcladas: "Las guías consumidas mezclan monedas distintas — no se puede sumar un total honesto.",
  sin_produccion: "La línea no declara cantidad producida.",
};

const n4 = (v: number) => v.toFixed(4);
const money = (v: number, moneda: string | null) =>
  `${moneda === "USD" ? "US$" : "S/"} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// timeZone UTC: entryDate del ingreso es date-only a medianoche UTC (off-by-one en Lima sin esto).
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; }
};

export default function CtpProduccionDetalleModal({ entry, onClose }: { entry: ProduccionResumen; onClose: () => void }) {
  const [consumos, setConsumos] = useState<ConsumoDTO[] | null>(null);
  const [costo, setCosto] = useState<CostoDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  const unitLabel = entry.unit ? (UNIT_LABELS[entry.unit] ?? entry.unit) : "";
  const declarado = entry.volumeInputM3 ? Number(entry.volumeInputM3) : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp/consumos?ctpEntryId=${encodeURIComponent(entry.id)}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const json = await r.json();
      setConsumos(json.consumos ?? []);
      setCosto(json.costo ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entry.id]);
  useEffect(() => { void load(); }, [load]);

  async function congelar() {
    setFreezing(true);
    setFreezeError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/consumos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ ctpEntryId: entry.id, action: "congelar" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setConfirmFreeze(false);
      await load();
    } catch (e) {
      setFreezeError(e instanceof Error ? e.message : String(e));
    } finally {
      setFreezing(false);
    }
  }

  /** Costo por m³ de una guía: snap congelado si existe, si no derivado on-read (D6). */
  function costoUnitDe(c: ConsumoDTO): number | null {
    if (c.costoUnitarioSnap != null) return Number(c.costoUnitarioSnap);
    const total = c.woodEntry.costoTotal != null ? Number(c.woodEntry.costoTotal) : null;
    const vol = c.woodEntry.volumeM3 != null ? Number(c.woodEntry.volumeM3) : 0;
    return total != null && vol > 0 ? Math.round((total / vol) * 100) / 100 : null;
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`Producción · línea #${entry.lineNo}`}
      description={`${entry.productType ?? "—"} · ${entry.speciesCommon ?? "—"} · ${entry.quantity ? n4(Number(entry.quantity)) : "—"} ${unitLabel}`}
      icon={Boxes}
    >
      <div className="space-y-4 p-5">
        {loading && (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Reconstruyendo la corrida…</p>
          </div>
        )}
        {error && (
          <ErrorAlert
            title="No se pudo cargar la corrida"
            description={error}
            action={
              <Btn variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Reintentar
              </Btn>
            }
          />
        )}

        {costo && consumos && !loading && (
          <>
            {/* Trazabilidad (izq) · costo (der) en 2 columnas. */}
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div className="space-y-4">
            {/* 1. Veredicto: ¿la corrida sabe de dónde salió? */}
            {consumos.length === 0 ? (
              <WarningAlert
                icon={AlertCircle}
                title="Corrida sin materia prima atribuida"
                description="La cadena de custodia se corta acá: todo despacho que cite esta corrida queda sin certificado."
              />
            ) : costo.sinAtribuirM3 > 0 ? (
              <WarningAlert
                icon={AlertCircle}
                title="Atribución parcial de materia prima"
                description={`Quedan ${n4(costo.sinAtribuirM3)} m³ del volumen consumido sin guía de origen.`}
              />
            ) : (
              <SuccessAlert
                title="Materia prima 100% identificada"
                description={`Los ${n4(costo.atribuidoM3)} m³ consumidos tienen guía GTF de ingreso.`}
              />
            )}

            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Consumido (m³)" value={n4(declarado)} />
              <MiniStat label="Atribuido (m³)" value={n4(costo.atribuidoM3)} tone={costo.atribuidoM3 > 0 ? "ok" : undefined} />
              <MiniStat label="Rendimiento" value={entry.rendimientoPct ? `${Number(entry.rendimientoPct).toFixed(1)}%` : "—"} />
            </div>

            {(() => {
              const { estado, ref } = evaluarRendimiento(entry.productType, entry.rendimientoPct != null ? Number(entry.rendimientoPct) : null);
              return estado === "alto" ? (
                <WarningAlert
                  icon={AlertCircle}
                  title="Rendimiento sobre el referencial SERFOR"
                  description={`El referencial es ${ref}% (RDE D000259-2024). Un rendimiento muy por encima puede indicar sobre-declaración — verificá el volumen consumido y el producido antes de despachar.`}
                />
              ) : null;
            })()}

            {/* 2. Las guías que alimentaron la corrida */}
            <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
              <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Materia prima consumida</CardTitle>
                </div>
                {!editing && !costo.congelado && (
                  <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3" /> Editar atribución
                  </Btn>
                )}
                {costo.congelado && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-info-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-info-700)]">
                    <Snowflake className="h-3 w-3" /> Congelado · inmutable
                  </span>
                )}
              </div>
              {editing ? (
                <div className="p-3">
                  <CtpAtribucionEditor
                    kind="consumos"
                    entryId={entry.id}
                    unitLabel="m³"
                    declared={declarado}
                    current={consumos.map((c) => ({
                      id: c.woodEntryId,
                      label: c.woodEntry.gtfNumber,
                      sub: c.woodEntry.speciesCommonName,
                      quantity: Number(c.volumeM3),
                    }))}
                    onSaved={() => { setEditing(false); void load(); }}
                    onCancel={() => setEditing(false)}
                  />
                </div>
              ) : consumos.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Sin guías atribuidas. Usá &quot;Editar atribución&quot; para declarar de dónde salió.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-sunken)] text-left">
                      <tr>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Guía GTF</th>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Especie</th>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Ingreso</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">m³</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Costo/m³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumos.map((c) => {
                        const unit = costoUnitDe(c);
                        return (
                          <tr key={c.id} className="border-t border-[var(--rule-soft)]">
                            <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{c.woodEntry.gtfNumber}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{c.woodEntry.speciesCommonName ?? "—"}</td>
                            <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{fmtDate(c.woodEntry.entryDate)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(Number(c.volumeM3))}</td>
                            <td className="px-3 py-2 text-right">
                              {unit != null ? (
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                                  {money(unit, c.woodEntry.moneda ?? "PEN")}
                                  {c.congeladoAt && <Snowflake className="h-3 w-3 text-[var(--data-info-500)]" aria-label="Costo congelado" />}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)]">s/factura</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            </div>
            <div className="space-y-4">
            {/* 3. Costo de la corrida (interno) */}
            <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-[var(--text-tertiary)]" />
                <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Costo de la corrida (interno)</CardTitle>
              </div>
              {costo.costoTotal != null ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <p className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{money(costo.costoTotal, costo.moneda)}</p>
                    {costo.costoUnitario != null && (
                      <p className="text-sm text-[var(--text-secondary)]">{money(costo.costoUnitario, costo.moneda)} por {unitLabel || "unidad"} producida</p>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Materia prima {costo.costoMateriaPrima != null ? money(costo.costoMateriaPrima, costo.moneda) : "—"}
                    {costo.costoProceso != null && <> + proceso {money(costo.costoProceso, costo.moneda)}</>}
                    {costo.congelado ? " · congelado al cierre" : " · costo vivo (cambia si llega una factura)"}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">
                  <strong className="text-[var(--text-secondary)]">Costo desconocido.</strong>{" "}
                  {COSTO_MOTIVO[costo.motivo as Exclude<CostoDTO["motivo"], "ok">] ?? ""}
                </p>
              )}
            </section>

            {/* 4. Congelar — irreversible, confirm inline */}
            {!costo.congelado && consumos.length > 0 && (
              <div className="space-y-2 border-t-2 border-[var(--rule-soft)] pt-4">
                {!confirmFreeze ? (
                  <Btn
                    variant="secondary"
                    className="w-full"
                    onClick={() => setConfirmFreeze(true)}
                    disabled={costo.motivo === "falta_factura"}
                    title={costo.motivo === "falta_factura" ? "Falta al menos una factura: no hay costo que congelar" : undefined}
                  >
                    <Snowflake className="h-4 w-4" /> Congelar costo (cierre de período)
                  </Btn>
                ) : (
                  <div className="space-y-2 rounded-2xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] p-3">
                    <p className="text-sm text-[var(--text-primary)]">
                      <strong>Irreversible:</strong> el costo queda fijado con las facturas de hoy y la atribución no se podrá editar más.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Btn variant="secondary" size="sm" onClick={() => setConfirmFreeze(false)} disabled={freezing}>Cancelar</Btn>
                      {/* Sin Btn: confirmación sólida "info" (irreversible) sin variante equivalente — Btn secondary
                          la volvería indistinguible del Cancelar de al lado. */}
                      <button type="button" onClick={() => void congelar()} disabled={freezing} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-info-600)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
                        {freezing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sí, congelar
                      </button>
                    </div>
                  </div>
                )}
                {freezeError && <p className="text-center text-xs font-bold text-[var(--data-error-700)]">{freezeError}</p>}
              </div>
            )}

            </div>
            </div>
            {/* Rec #10 QA: historial de cambios de esta corrida (audit trail). */}
            <CtpHistorial entityId={entry.id} />
          </>
        )}
      </div>
    </AdminModal>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "bad" ? "text-[var(--data-error-700)]" : tone === "ok" ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
