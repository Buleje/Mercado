"use client";

/**
 * LoteDetailModal — ficha de un lote de producción forestal (ADR-136):
 * cadena de custodia heredada, miembros (editables si está abierto), acciones
 * de estado (cerrar/reabrir/despachar/anular) y documentos con QR (certificado
 * + etiqueta). El certificado respeta el gate de trazabilidad completa.
 */

import CtpCadenaLote from "./CtpCadenaLote";
import type { CadenaLote } from "@/lib/forestal/ctp-cadena-lote";
import { useCallback, useEffect, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle, DataTable, SuccessAlert, WarningAlert, ErrorAlert, LoadingState } from "@buleje/design-system";
import {
  AlertCircle, Ban, CheckCircle2, Layers, Link2, Loader2, Lock, Pencil,
  Printer, RefreshCw, Tag, Truck, Unlock,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { printCertificadoLote, printEtiquetaLote } from "@/lib/forestal/lote-certificado";
import LoteMiembrosEditor, { loteRowsValidas, type LoteRow } from "./LoteMiembrosEditor";
import { Btn, I, MODAL_BODY } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const n4 = (v: number) => v.toFixed(4);

type LoteStatus = "abierto" | "cerrado" | "despachado" | "anulado";

interface LoteDetail {
  id: string; loteCode: string; productType: string | null;
  speciesCommon: string | null; speciesScientific: string | null; cites: boolean;
  unit: string; grade: string | null; destino: string | null; status: LoteStatus;
  notes: string | null; annulledReason: string | null;
  miembros: { produccionEntryId: string; quantity: number; lineNo: number; productType: string | null; speciesCommon: string | null; producido: number }[];
}

interface TrazaDTO {
  completa: boolean; totalCantidad: number; motivo: "ok" | "sin_miembros" | "corrida_sin_origen";
  corridas: { produccionEntryId: string; lineNo: number; quantity: number; guias: string[]; sinOrigen: boolean; lotesAserrio?: string[] }[];
  /** Las piezas que entraron a la sierra, por lote de aserrío (ADR-334). */
  lotesDeAserrio?: { code: string | null; piezas: number; volumenM3: number; codigos: string[] }[];
}

const TRAZA_MOTIVO: Record<Exclude<TrazaDTO["motivo"], "ok">, string> = {
  sin_miembros: "El lote no tiene corridas. Agregá al menos una para armar la cadena.",
  corrida_sin_origen: "Una corrida del lote no tiene su materia prima atribuida: la cadena se corta un eslabón más atrás (falta el ingreso con GTF).",
};

const STATUS_META: Record<LoteStatus, { label: string; cls: string }> = {
  abierto: { label: "Abierto", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  cerrado: { label: "Cerrado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  despachado: { label: "Despachado", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  anulado: { label: "Anulado", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
};

export default function LoteDetailModal({ loteId, onClose, onChanged }: { loteId: string; onClose: () => void; onChanged: () => void }) {
  const [lote, setLote] = useState<LoteDetail | null>(null);
  const [traza, setTraza] = useState<TrazaDTO | null>(null);
  /** La cadena completa: de qué guías vino y a qué despachos fue (ADR-315). */
  const [cadena, setCadena] = useState<CadenaLote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<LoteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/lotes/detalle?id=${encodeURIComponent(loteId)}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const json = await r.json();
      setLote(json.lote);
      setTraza(json.trazabilidad);
      setCadena(json.cadena ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loteId]);
  useEffect(() => { void load(); }, [load]);

  const unitLabel = lote?.unit ? (UNIT_LABELS[lote.unit] ?? lote.unit) : "";

  function startEdit() {
    if (!lote) return;
    setEditRows(lote.miembros.map((m) => ({
      produccionEntryId: m.produccionEntryId,
      label: `Corrida #${m.lineNo}`,
      sub: [m.productType, m.speciesCommon].filter(Boolean).join(" · ") || null,
      disponible: m.producido, // se recalcula al recargar; el editor trae el saldo real
      quantity: String(m.quantity),
    })));
    setEditing(true);
  }

  async function saveMiembros() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/lotes/detalle", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ loteId, miembros: editRows.filter((x) => Number(x.quantity) > 0).map((x) => ({ produccionEntryId: x.produccionEntryId, quantity: Number(x.quantity) })) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setEditing(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(action: "status" | "anular", status?: LoteStatus, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const body = action === "anular" ? { action: "anular", id: loteId, reason } : { action: "status", id: loteId, status };
      const r = await fetch("/api/admin/forestal/lotes", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulReason(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function imprimir(kind: "cert" | "label") {
    if (!lote) return;
    setPrinting(true);
    setDocError(null);
    try {
      const certData = {
        id: lote.id, loteCode: lote.loteCode, productType: lote.productType,
        speciesCommon: lote.speciesCommon, speciesScientific: lote.speciesScientific,
        cites: lote.cites, unitLabel, grade: lote.grade, destino: lote.destino,
      };
      if (kind === "label") {
        await printEtiquetaLote(certData, traza?.totalCantidad ?? 0);
      } else {
        if (!traza?.completa) return;
        const emisor = await fetch("/api/settings", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { businessName?: string; ruc?: string } | null;
        await printCertificadoLote(
          certData,
          {
            completa: traza.completa,
            totalCantidad: traza.totalCantidad,
            corridas: traza.corridas,
            // El tramo que faltaba en el papel: qué piezas entraron (ADR-334).
            lotesDeAserrio: traza.lotesDeAserrio,
          },
          { businessName: emisor?.businessName ?? null, ruc: emisor?.ruc ?? null },
        );
      }
    } catch (e) {
      setDocError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      /* Rediseño 2026-07-30: era un drawer de 28rem donde la tabla de corridas
         —tres columnas con guías GTF— quedaba comprimida y las acciones caían
         al final de un scroll largo. En `info` entra la ficha completa: la
         cadena a la izquierda, los documentos y el estado a la derecha. */
      variant="info"
      className="sm:w-[min(95vw,80rem)] sm:max-w-none sm:max-h-[95vh]"
      title={lote ? `Lote ${lote.loteCode}` : "Lote"}
      description={lote ? `${lote.productType ?? "—"} · ${lote.speciesCommon ?? "—"} · ${n4(traza?.totalCantidad ?? 0)} ${unitLabel}` : undefined}
      icon={Layers}
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {loading && <LoadingState message="Cargando lote…" className="py-8" />}
        {error && (
          <ErrorAlert title="Error" description={error} action={<Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>} />
        )}

        {lote && traza && !loading && (
          <div className="grid gap-4 md:grid-cols-[2.6fr_1fr] md:items-start">
            <div className="space-y-4">
            {/* Estado + grado */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[lote.status].cls}`}>{STATUS_META[lote.status].label}</span>
              {lote.grade && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-canvas)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]"><Tag className="h-3 w-3" />{lote.grade}</span>}
              {lote.cites && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-100)] px-3 py-1 text-xs font-bold text-[var(--data-error-700)]">CITES</span>}
              {lote.destino && <span className="text-xs text-[var(--text-tertiary)]">→ {lote.destino}</span>}
            </div>
            {lote.annulledReason && <p className="rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]"><strong>Anulado:</strong> {lote.annulledReason}</p>}

            {/* Veredicto de trazabilidad */}
            {traza.completa ? (
              <SuccessAlert title="Cadena de custodia completa" description={`Las ${traza.corridas.length} corridas del lote tienen su materia prima con GTF. Se puede certificar.`} />
            ) : (
              <WarningAlert icon={AlertCircle} title="Cadena de custodia incompleta" description={TRAZA_MOTIVO[traza.motivo as Exclude<TrazaDTO["motivo"], "ok">] ?? "Faltan datos de origen."} />
            )}

            {/* La cadena de punta a punta. Va antes de las corridas porque
                responde la pregunta grande —de dónde salió y a dónde fue— y las
                corridas son el detalle de su tramo del medio. */}
            {cadena && <CtpCadenaLote cadena={cadena} />}

            {/* Miembros */}
            <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
              <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
                <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-[var(--text-tertiary)]" /><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Corridas del lote</CardTitle></div>
                {!editing && lote.status === "abierto" && (
                  <Btn variant="secondary" size="sm" onClick={startEdit}><Pencil className="h-3 w-3" /> Editar</Btn>
                )}
              </div>
              {editing ? (
                <div className="space-y-3 p-3">
                  <LoteMiembrosEditor excludeLoteId={loteId} unitLabel={unitLabel} rows={editRows} onRowsChange={setEditRows} />
                  <div className="flex justify-end gap-2">
                    <Btn variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Btn>
                    <Btn variant="dark" size="sm" onClick={() => void saveMiembros()} disabled={busy || !loteRowsValidas(editRows)}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar</Btn>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <DataTable className="w-full text-sm">
                    <thead className="bg-[var(--surface-sunken)] text-left"><tr><th className="px-3 py-2 font-bold text-[var(--text-primary)]">Corrida</th><th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Cantidad</th><th className="px-3 py-2 font-bold text-[var(--text-primary)]">Lote de aserrío</th><th className="px-3 py-2 font-bold text-[var(--text-primary)]">Guías GTF de ingreso</th></tr></thead>
                    <tbody>
                      {traza.corridas.map((c) => (
                        <tr key={c.produccionEntryId} className="border-t border-[var(--rule-soft)]">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">#{c.lineNo}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(c.quantity)} {unitLabel}</td>
                          {/* El eslabón que faltaba entre la guía y la corrida:
                              QUÉ PILA entró a la sierra (ADR-334). */}
                          <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                            {c.lotesAserrio?.length ? c.lotesAserrio.join(" · ") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {c.sinOrigen
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"><AlertCircle className="h-3 w-3" /> sin materia prima</span>
                              : <span className="font-mono text-xs text-[var(--text-secondary)]">{c.guias.join(" · ") || "—"}</span>}
                          </td>
                        </tr>
                      ))}
                      {traza.corridas.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">Lote vacío. Editá para agregar corridas.</td></tr>}
                    </tbody>
                  </DataTable>
                </div>
              )}
            </section>

            {/* Las PIEZAS. La cadena por GTF dice de qué papel salió la madera;
                esto dice qué palos — que es lo que se cuenta en la pila y lo que
                ahora también sale impreso en el certificado (ADR-334). */}
            {(traza.lotesDeAserrio?.length ?? 0) > 0 && (
              <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
                <div className="flex items-center gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
                  <Layers className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
                    Piezas que entraron a la sierra
                  </CardTitle>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {traza.lotesDeAserrio!.reduce((a, l) => a + l.piezas, 0)} trozas
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <DataTable className="w-full text-sm">
                    <thead className="bg-[var(--surface-sunken)] text-left">
                      <tr>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Lote de aserrío</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Piezas</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Volumen rollizo</th>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Códigos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traza.lotesDeAserrio!.map((l) => (
                        <tr key={l.code ?? "sin-lote"} className="border-t border-[var(--rule-soft)]">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">
                            {l.code ?? <span className="italic text-[var(--text-tertiary)]">sin lote</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{l.piezas}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(l.volumenM3)} m³</td>
                          <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                            {l.codigos.join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              </section>
            )}

            </div>

            {/* Columna derecha: lo que se hace CON el lote (documentos y estado),
                separado de lo que el lote ES (su cadena). */}
            <div className="space-y-4">
            {/* Documentos con QR */}
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="dark" onClick={() => void imprimir("cert")} disabled={!traza.completa || printing} title={!traza.completa ? "Requiere cadena completa" : undefined}>
                {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Certificado
              </Btn>
              <Btn variant="secondary" onClick={() => void imprimir("label")} disabled={printing}>
                <Tag className="h-4 w-4" /> Etiqueta
              </Btn>
            </div>
            {docError && <p className="text-center text-xs font-bold text-[var(--data-error-700)]">{docError}</p>}

            {/* Acciones de estado */}
            {lote.status !== "anulado" && lote.status !== "despachado" && (
              <div className="flex flex-wrap gap-2 border-t-2 border-[var(--rule-soft)] pt-4">
                {lote.status === "abierto" && (
                  // Sin variante "success" en Btn (soft green) — se normaliza a secondary; se pierde
                  // el acento verde, se conserva la altura consistente con Anular en la misma fila.
                  <Btn variant="secondary" onClick={() => void changeStatus("status", "cerrado")} disabled={busy || lote.miembros.length === 0}><Lock className="h-4 w-4" /> Cerrar lote</Btn>
                )}
                {lote.status === "cerrado" && (
                  <>
                    <Btn variant="secondary" onClick={() => void changeStatus("status", "abierto")} disabled={busy}><Unlock className="h-4 w-4" /> Reabrir</Btn>
                    <Btn variant="dark" onClick={() => void changeStatus("status", "despachado")} disabled={busy}><Truck className="h-4 w-4" /> Marcar despachado</Btn>
                  </>
                )}
                <Btn variant="danger" onClick={() => setAnnulReason("")} disabled={busy}><Ban className="h-4 w-4" /> Anular</Btn>
              </div>
            )}
            {lote.status === "despachado" && (
              <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--data-success-600)]" /> Lote despachado — cerrado para cambios.</p>
            )}

            {/* Confirmación de anulación inline */}
            {annulReason !== null && (
              <div className="space-y-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3">
                <p className="text-sm text-[var(--text-primary)]"><strong>Anular {lote.loteCode}:</strong> indicá el motivo (queda en el historial, no se borra).</p>
                <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (mín. 3 caracteres)" className={`${I} border-[var(--data-error-500)]/40 focus:border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/20`} />
                <div className="flex justify-end gap-2">
                  <Btn variant="secondary" size="sm" onClick={() => setAnnulReason(null)} disabled={busy}>Cancelar</Btn>
                  <Btn variant="danger" size="sm" onClick={() => void changeStatus("anular", undefined, annulReason)} disabled={busy || annulReason.trim().length < 3}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar anulación</Btn>
                </div>
              </div>
            )}

            {lote.notes && <p className="rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-secondary)]">{lote.notes}</p>}
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
