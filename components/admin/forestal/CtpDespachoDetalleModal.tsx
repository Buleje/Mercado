"use client";

/**
 * CtpDespachoDetalleModal — cadena de custodia + costo de un despacho (ADR-135).
 *
 * El endpoint `/ctp/origenes` ya calculaba trazabilidad y COGS desde que se
 * cerró la cadena, pero nada en la UI lo leía: la atribución se escribía al
 * crear el despacho y nunca más se veía. Esta ficha responde las dos preguntas
 * que importan después de despachar:
 *   1. ¿Puedo certificar de dónde salió esto? (trazabilidad → certificado)
 *   2. ¿Cuánto me costó lo que salió? (COGS — interno, nunca va al certificado)
 *
 * El botón de certificado respeta el gate ADR-135 D3: cadena incompleta ⇒
 * deshabilitado con el motivo, no un certificado que miente.
 */

import { useCallback, useEffect, useState } from "react";
import { UNIT_LABELS } from "./ctp-section-shared";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle, SuccessAlert, WarningAlert, ErrorAlert } from "@buleje/design-system";
import {
  AlertCircle,
  Banknote,
  FileCheck,
  Link2,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Snowflake,
  Truck,
} from "@buleje/design-system/icons";
import { printCertificadoTrazabilidad } from "@/lib/forestal/ctp-certificado";
import { permisoCitesDeEspecie } from "@/lib/forestal/ctp-ficha-types";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import CtpAtribucionEditor from "./CtpAtribucionEditor";
import CtpGtfSeccion from "./CtpGtfSeccion";
import CtpHistorial from "./CtpHistorial";
import { Btn, MODAL_BODY } from "./ctp-shared";

export interface DespachoResumen {
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  quantity: string | null;
  unit: string | null;
  pieces: number | null;
  gtfNumber: string | null;
  destino: string | null;
}

interface TrazabilidadDTO {
  completa: boolean;
  declarado: number;
  atribuido: number;
  sinAtribuir: number;
  motivo: "ok" | "sin_atribucion" | "atribucion_parcial" | "corrida_sin_origen";
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    quantity: number;
    guias: string[];
    sinOrigen: boolean;
    /** De qué lote de aserrío salió la corrida (ADR-337); `null` si se cargó a mano. */
    loteAserrio: { code: string; piezas: number } | null;
  }[];
}

interface CogsDTO {
  cogs: number | null;
  costoUnitario: number | null;
  moneda: string | null;
  motivo: "ok" | "sin_atribucion" | "falta_costo" | "monedas_mezcladas" | "sin_cantidad";
  sinAtribuir: number;
  detalle: { lineNo: number; quantity: number; costoUnitario: number | null; costo: number | null; congelado: boolean }[];
}

/** Por qué la cadena NO está completa, en el idioma del operador. */
const TRAZA_MOTIVO: Record<Exclude<TrazabilidadDTO["motivo"], "ok">, string> = {
  sin_atribucion: "El despacho no está atribuido a ninguna corrida de producción. Sin origen declarado no hay cadena que certificar.",
  atribucion_parcial: "Hay volumen despachado sin corrida de origen. El certificado exige el 100% atribuido.",
  corrida_sin_origen: "Una corrida citada no tiene su propia materia prima atribuida: la cadena se corta un eslabón más atrás (falta el ingreso con GTF).",
};

/** Por qué el costo es desconocido — null NUNCA se disfraza de 0. */
const COGS_MOTIVO: Record<Exclude<CogsDTO["motivo"], "ok">, string> = {
  sin_atribucion: "Hay volumen sin corrida atribuida: no se puede costear lo que no se sabe de dónde salió.",
  falta_costo: "Una o más corridas no tienen costo de materia prima (guía sin factura). Sin factura el costo es desconocido, no 0.",
  monedas_mezcladas: "Las corridas mezclan monedas distintas — no se puede sumar un total honesto.",
  sin_cantidad: "El despacho no declara cantidad.",
};

const n4 = (v: number) => v.toFixed(4);
const money = (v: number, moneda: string | null) =>
  `${moneda === "USD" ? "US$" : "S/"} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CtpDespachoDetalleModal({ entry, onClose }: { entry: DespachoResumen; onClose: () => void }) {
  const [traza, setTraza] = useState<TrazabilidadDTO | null>(null);
  const [cogs, setCogs] = useState<CogsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // La guía tal como está en la BASE (número + cuerpo). Viene con la misma llamada
  // que la cadena: la fila del listado puede tener el número viejo si se emitió
  // desde este modal y la lista no se recargó.
  const [guia, setGuia] = useState<{ gtfNumber: string | null; gtfDatos: unknown } | null>(null);
  // Identidad legal del CTP: la usan el certificado (emisor) y la guía (autollenado).
  const ficha = useFichaCtp();

  const unitLabel = entry.unit ? (UNIT_LABELS[entry.unit] ?? entry.unit) : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp/origenes?despachoEntryId=${encodeURIComponent(entry.id)}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const json = await r.json();
      setTraza(json.trazabilidad ?? null);
      setCogs(json.cogs ?? null);
      setGuia(json.guia ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entry.id]);
  useEffect(() => { void load(); }, [load]);

  async function imprimirCertificado() {
    if (!traza?.completa) return;
    setPrinting(true);
    setPrintError(null);
    try {
      // Emisor = Ficha legal del CTP (Código CTP, ARFFS, dirección), ya leída por
      // `useFichaCtp`. Fallback a /api/settings para el nombre y el RUC si la ficha
      // todavía está a medio llenar.
      const settings = (await fetch("/api/settings", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch((err) => { console.warn("[ctp] settings fetch failed", err); return null; })) as
        | { businessName?: string; ruc?: string }
        | null;
      const f = ficha;
      const direccion = f ? [f.direccion, f.distrito, f.provincia, f.region].filter(Boolean).join(", ") : "";
      await printCertificadoTrazabilidad(
        { ...entry, unitLabel },
        traza,
        {
          businessName: f?.nombreCtp || f?.razonSocial || settings?.businessName || null,
          ruc: f?.ruc || settings?.ruc || null,
          codigoCtp: f?.codigoCtp || null,
          arffs: f?.arffs || null,
          direccion: direccion || null,
        },
      );
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrinting(false);
    }
  }

  // Merge corridas (trazabilidad) + costos (COGS) por línea: una sola tabla.
  const costoPorLinea = new Map((cogs?.detalle ?? []).map((d) => [d.lineNo, d]));

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`Despacho · línea #${entry.lineNo}`}
      description={`${entry.speciesCommon ?? "—"} · ${entry.quantity ? n4(Number(entry.quantity)) : "—"} ${unitLabel}${entry.gtfNumber ? ` · GTF ${entry.gtfNumber}` : ""}`}
      icon={Truck}
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {loading && (
          <div className="p-8 text-center text-[var(--text-tertiary)]">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Reconstruyendo la cadena de custodia…</p>
          </div>
        )}
        {error && (
          <ErrorAlert
            title="No se pudo cargar la cadena"
            description={error}
            action={
              <Btn variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Reintentar
              </Btn>
            }
          />
        )}

        {traza && !loading && (
          <>
            {/* Trazabilidad (izq) · costo y documentos (der) en 2 columnas. */}
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div className="space-y-4">
            {/* 1. Veredicto de trazabilidad — la pregunta del fiscalizador */}
            {traza.completa ? (
              <SuccessAlert
                title="Cadena de custodia completa"
                description={`El 100% del volumen (${n4(traza.atribuido)} ${unitLabel}) tiene corrida de producción e ingreso con GTF identificados. Se puede certificar.`}
              />
            ) : (
              <WarningAlert
                icon={AlertCircle}
                title="Cadena de custodia incompleta"
                description={TRAZA_MOTIVO[traza.motivo as Exclude<TrazabilidadDTO["motivo"], "ok">] ?? "La atribución tiene huecos."}
              />
            )}

            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Declarado" value={`${n4(traza.declarado)}`} suffix={unitLabel} />
              <MiniStat label="Atribuido" value={`${n4(traza.atribuido)}`} suffix={unitLabel} tone={traza.atribuido > 0 ? "ok" : undefined} />
              <MiniStat label="Sin atribuir" value={`${n4(traza.sinAtribuir)}`} suffix={unitLabel} tone={traza.sinAtribuir > 0 ? "bad" : "ok"} />
            </div>

            {/* 2. La cadena: corrida → guías de ingreso, con costo por tramo */}
            <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
              <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Origen del volumen</CardTitle>
                </div>
                {!editing && (
                  <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3" /> Editar atribución
                  </Btn>
                )}
              </div>
              {editing ? (
                <div className="p-3">
                  <CtpAtribucionEditor
                    kind="origenes"
                    entryId={entry.id}
                    unitLabel={unitLabel || "unid."}
                    declared={traza.declarado}
                    current={traza.corridas.map((c) => ({
                      id: c.produccionEntryId,
                      label: `Corrida #${c.lineNo}`,
                      sub: null,
                      quantity: c.quantity,
                    }))}
                    onSaved={() => { setEditing(false); void load(); }}
                    onCancel={() => setEditing(false)}
                  />
                </div>
              ) : traza.corridas.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Sin corridas atribuidas. Usá &quot;Editar atribución&quot; para declarar de dónde salió.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-sunken)] text-left">
                      <tr>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Corrida</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Cantidad</th>
                        {/* El eslabón del patio: de qué pila salió (ADR-337). */}
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Lote de aserrío</th>
                        <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Guías GTF de ingreso</th>
                        <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traza.corridas.map((c) => {
                        const costo = costoPorLinea.get(c.lineNo);
                        return (
                          <tr key={c.produccionEntryId} className="border-t border-[var(--rule-soft)]">
                            <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">#{c.lineNo}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n4(c.quantity)}</td>
                            <td className="px-3 py-2">
                              {c.loteAserrio ? (
                                <span
                                  title={`La corrida #${c.lineNo} se hizo con el lote ${c.loteAserrio.code} (${c.loteAserrio.piezas} troza(s))`}
                                  className="inline-block rounded-lg bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                                >
                                  {c.loteAserrio.code}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)]">cargada a mano</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {c.sinOrigen ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
                                  <AlertCircle className="h-3 w-3" /> sin materia prima atribuida
                                </span>
                              ) : c.guias.length > 0 ? (
                                <span className="font-mono text-xs text-[var(--text-secondary)]">{c.guias.join(" · ")}</span>
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {costo?.costo != null ? (
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                                  {money(costo.costo, cogs?.moneda ?? "PEN")}
                                  {costo.congelado && <Snowflake className="h-3 w-3 text-[var(--data-info-500)]" aria-label="Costo congelado al cierre de la corrida" />}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)]">s/costo</span>
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
            {/* 3. COGS — interno. Nunca viaja al certificado. */}
            <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-[var(--text-tertiary)]" />
                <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Costo de lo despachado (interno)</CardTitle>
              </div>
              {cogs?.cogs != null ? (
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <p className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{money(cogs.cogs, cogs.moneda)}</p>
                  {cogs.costoUnitario != null && (
                    <p className="text-sm text-[var(--text-secondary)]">
                      {money(cogs.costoUnitario, cogs.moneda)} por {unitLabel || "unidad"} — compará contra tu precio de venta.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">
                  <strong className="text-[var(--text-secondary)]">Costo desconocido.</strong>{" "}
                  {cogs ? COGS_MOTIVO[cogs.motivo as Exclude<CogsDTO["motivo"], "ok">] ?? "" : ""}
                </p>
              )}
            </section>

            {/* 5. Certificado — gate ADR-135 D3 */}
            <div className="space-y-2 border-t-2 border-[var(--rule-soft)] pt-4">
              <Btn
                variant="dark"
                className="w-full"
                disabled={!traza.completa || printing}
                onClick={() => void imprimirCertificado()}
              >
                {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : traza.completa ? <Printer className="h-5 w-5" /> : <FileCheck className="h-5 w-5" />}
                {printing ? "Preparando…" : "Imprimir certificado de trazabilidad"}
              </Btn>
              {!traza.completa && (
                <p className="text-center text-xs text-[var(--text-tertiary)]">
                  El certificado exige cadena completa — el libro admite huecos, el certificado no.
                </p>
              )}
              {printError && <p className="text-center text-xs font-bold text-[var(--data-error-700)]">{printError}</p>}
            </div>

            </div>

            {/**
             * 4 · GTF de salida, a lo ANCHO de las dos columnas.
             *
             * Es un formulario de sesenta casilleros: metido en la columna
             * derecha (430 px) medía más de mil píxeles de alto y había que
             * scrollear la ficha entera para llenarlo, mientras la columna
             * izquierda terminaba a media pantalla y dejaba el hueco al lado.
             * Con el ancho completo la misma parte entra en dos filas.
             */}
            <div className="md:col-span-2">
              <CtpGtfSeccion
                // El número de la BASE gana: la fila del listado puede estar vieja.
                despacho={{ ...entry, unitLabel, gtfNumber: guia?.gtfNumber ?? entry.gtfNumber }}
                ficha={ficha}
                cadena={traza ? { corridas: traza.corridas } : null}
                // CITES es legal CON permiso: si la Ficha lo tiene archivado para esta
                // especie, se copia a la guía en vez de pedirlo tipeado otra vez.
                citesPermiso={
                  entry.cites
                    ? permisoCitesDeEspecie(ficha, entry.speciesCommon, entry.speciesScientific)?.numero ?? null
                    : null
                }
                gtfDatosGuardado={guia?.gtfDatos ?? null}
              />
            </div>
            </div>
            {/* Rec #10 QA: historial de cambios de este despacho (audit trail). */}
            <CtpHistorial entityId={entry.id} />
          </>
        )}
      </div>
    </AdminModal>
  );
}

function MiniStat({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: "ok" | "bad" }) {
  const color = tone === "bad" ? "text-[var(--data-error-700)]" : tone === "ok" ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>
        {value} <span className="text-xs font-normal text-[var(--text-tertiary)]">{suffix}</span>
      </p>
    </div>
  );
}
