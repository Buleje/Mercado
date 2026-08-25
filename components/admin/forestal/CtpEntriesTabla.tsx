"use client";

/**
 * CtpEntriesTabla — las filas de Producción/Despacho, desktop y mobile.
 *
 * Sale de `CtpEntriesView`, que pasaba de 740 líneas contra el ~300 que pide el
 * repo. El corte es por responsabilidad, no por cantidad: la vista se queda con
 * el estado, los KPIs, los filtros y los modales; acá vive **cómo se ve una
 * línea**, que es lo que cambia cuando se agrega una columna o un aviso.
 *
 * Dual-render: la <table> sólo a ≥640px (`hidden sm:block`) y cards a medida
 * debajo. El `hidden` gana sobre la conversión genérica table→card del shell
 * admin, así que la tabla NO se auto-convierte y no compite con las cards.
 *
 * Todo el estado vive arriba: acá no hay `useState`. Una fila que no puede
 * decidir nada por su cuenta es una fila que no se desincroniza de los KPIs.
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Boxes, FileText, Link2, PackagePlus, Paperclip, Scale, Truck, X as XIcon } from "@buleje/design-system/icons";
import CtpSeccionCardMobile from "./CtpSeccionCardMobile";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import { atribucionDeDespacho, faltaAtribuir, origenDeCorrida } from "@/lib/forestal/atribucion-despacho";
import { type CtpEntry, type CtpSection, Th, Td, estadoSalida, UNIT_LABELS } from "./ctp-section-shared";
import { IconAction } from "./ctp-shared";
import { estadoDeGuia } from "@/lib/forestal/gtf-estado";
import type { totalesDeSeccion } from "@/lib/forestal/ctp-secciones-filtro";

/** Por qué columna se puede ordenar. Lo resuelve la vista; acá sólo se dibuja. */
export type SortKey = "fecha" | "cantidad" | "rend";
export type OrdenCtp = { by: SortKey | null; dir: "asc" | "desc" };

// timeZone UTC: entryDate es date-only guardada a medianoche UTC — en hora Lima
// se corría un día.
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n4 = (v: string | null) => (v == null ? "—" : Number(v).toFixed(4));

export interface CtpEntriesTablaProps {
  section: CtpSection;
  /** Las filas YA filtradas y ordenadas por la vista. */
  visible: CtpEntry[];
  sort: OrdenCtp;
  onSort: (by: SortKey) => void;
  /** Despachos que ya tienen su ANEXO N° 04 emitido. */
  conAnexo: Set<string>;
  /** Línea cuyo "enviar a inventario" está en curso. */
  toProductId: string | null;
  onChain: (e: CtpEntry) => void;
  onAnexo: (e: CtpEntry) => void;
  onSendInventory: (id: string) => void;
  onAnnul: (id: string) => void;
  /**
   * Corridas que todavía admiten producción sobre la misma materia prima
   * (ADR-365). Lo decide la vista con `corridasAMedioDeclarar`: la fila no
   * calcula topes, sólo dibuja el atajo cuando lo hay.
   */
  ampliables?: Set<string>;
  onAmpliar?: (id: string) => void;
  /** Adjuntar los papeles que viajan con el despacho (ADR-371). */
  onPapeles?: (e: CtpEntry) => void;
  /** Abrir la guía de transporte de esa línea (borrador editable o emitida). */
  onGuia?: (e: CtpEntry) => void;
  /** Totales de lo que se está viendo — los calcula la vista, para que el pie de
   *  la tabla y los KPIs de arriba no puedan decir números distintos. */
  totalesVista: ReturnType<typeof totalesDeSeccion>;
}


/**
 * ¿Cuánto de este despacho salió SIN corrida de origen declarada?
 *
 * La atribución parcial está permitida a propósito (invariante I4: `≤`, nunca
 * `==` — exigir el 100% para poder guardar empuja a inventar un origen). Lo que
 * no puede pasar es que sea invisible: hasta ahora el faltante sólo se veía
 * abriendo la ficha de cadena de custodia, de a un despacho por vez, y es lo
 * primero que cruza un fiscalizador.
 *
 * Silencioso cuando está completo o cuando el despacho no declara cantidad.
 */
function AtribucionBadge({ entry }: { entry: CtpEntry }) {
  const estado = atribucionDeDespacho(
    entry.quantity == null ? null : Number(entry.quantity),
    entry.atribuidoQty,
    UNIT_LABELS[entry.unit ?? "m3"] ?? entry.unit ?? "",
  );
  if (!faltaAtribuir(estado)) return null;
  return (
    <div
      title="Este volumen salió de la planta sin corrida de producción atribuida. Abrí la cadena de custodia para completarlo: sin origen no se puede certificar."
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {estado.aviso}
    </div>
  );
}

/**
 * ¿De qué ingreso salió la materia prima de esta corrida?
 *
 * Una corrida sin origen atribuido es producto que apareció de la nada. La
 * pestaña de Consumos ya lo contaba, pero había que ir a buscarlo; acá se ve en
 * la fila, que es donde se miran las corridas. Mismo criterio que el aviso de
 * despacho: el faltante se declara, no se bloquea el guardado.
 */
function OrigenBadge({ entry }: { entry: CtpEntry }) {
  const estado = origenDeCorrida(
    entry.volumeInputM3 == null ? null : Number(entry.volumeInputM3),
    entry.mpAtribuidaM3,
  );
  if (!faltaAtribuir(estado)) return null;
  return (
    <div
      title="Esta corrida consumió madera que no está atada a ningún ingreso con GTF. Atribuila desde su ficha: sin origen no se puede certificar la cadena."
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {estado.aviso}
    </div>
  );
}

/**
 * ¿El paquete sigue en el patio o ya se lo llevaron?
 *
 * Es el reporte "estado de productos" del ERP forestal de referencia, pero en la
 * misma fila en vez de en una pantalla aparte: la pregunta aparece mirando la
 * lista de producción, no yendo a buscarla.
 */
function SalidaBadge({ entry }: { entry: CtpEntry }) {
  const est = estadoSalida(entry);
  if (!est) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  const tono =
    est.tono === "salido"
      ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]"
      : est.tono === "parcial"
        ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${tono}`}>
      {est.label}
    </span>
  );
}

function RendimientoCell({ productType, rendimientoPct }: { productType: string | null; rendimientoPct: string | null }) {
  const pct = rendimientoPct != null ? Number(rendimientoPct) : null;
  const { estado, ref } = evaluarRendimiento(productType, pct);
  const alto = estado === "alto";
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {alto && (
        <AlertCircle
          className="h-3.5 w-3.5 text-[var(--data-warning-600)]"
          aria-label={`Rendimiento sobre el referencial SERFOR (${ref}%): revisá que no haya sobre-declaración`}
        />
      )}
      <span className={`font-mono text-xs font-bold tabular-nums ${alto ? "text-[var(--data-warning-700)]" : "text-[var(--data-info-700)]"}`}>
        {pct != null ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}

function SortTh({ label, by, sort, onSort, className }: {
  label: string; by: SortKey; sort: { by: SortKey | null; dir: "asc" | "desc" }; onSort: (by: SortKey) => void; className?: string;
}) {
  const active = sort.by === by;
  const Ico = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const right = className?.includes("text-right");
  return (
    <th className={`px-4 py-3 font-bold ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(by)}
        className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""} ${active ? "text-[var(--accent)]" : "text-[var(--text-primary)] hover:text-[var(--accent)]"}`}
      >
        {label} <Ico className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

export default function CtpEntriesTabla({
  section,
  visible,
  sort,
  onSort,
  conAnexo,
  toProductId,
  onChain,
  onAnexo,
  onSendInventory,
  onAnnul,
  ampliables,
  onAmpliar,
  onPapeles,
  onGuia,
  totalesVista,
}: CtpEntriesTablaProps) {
  return (
    <>
      {/* ── Desktop: tabla (≥640px). El `hidden` a <640px gana sobre la
             auto-conversión genérica del shell, dejando lugar a las cards. ── */}
      <div className="hidden overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block">
        <DataTable className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="w-12 text-right">#</Th>
              <SortTh label="Fecha" by="fecha" sort={sort} onSort={onSort} />
              <Th>Especie</Th>
              <Th>Producto</Th>
              {section === "produccion" ? (<><Th className="text-right">Consumido (m³)</Th><SortTh label="Producido" by="cantidad" sort={sort} onSort={onSort} className="text-right" /><SortTh label="Rend." by="rend" sort={sort} onSort={onSort} className="text-right" /><Th>Salida</Th></>)
                : (<><SortTh label="Cantidad" by="cantidad" sort={sort} onSort={onSort} className="text-right" /><Th className="text-right">Piezas</Th><Th>GTF salida</Th><Th>Destino</Th></>)}
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className={`border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${e.status === "anulado" ? "opacity-50" : ""}`}>
                <Td className="text-right font-mono text-xs text-[var(--text-tertiary)]">{e.lineNo}</Td>
                <Td className="font-medium text-[var(--text-primary)]">{fmtDate(e.entryDate)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon ?? "—"}</span>
                    {e.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                  </div>
                  {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
                </Td>
                <Td>
                  <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{e.productType ?? "—"}</span>
                  {e.codigoProducto && (
                    <div className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{e.codigoProducto}</div>
                  )}
                </Td>
                {section === "produccion" ? (
                  <>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {n4(e.volumeInputM3)}
                      <OrigenBadge entry={e} />
                    </Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
                    <Td className="text-right"><RendimientoCell productType={e.productType} rendimientoPct={e.rendimientoPct} /></Td>
                    <Td><SalidaBadge entry={e} /></Td>
                  </>
                ) : (
                  <>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {n4(e.quantity)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span>
                      <AtribucionBadge entry={e} />
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{e.pieces ?? "—"}</Td>
                    <Td className="font-mono text-xs font-bold text-[var(--text-primary)]">{e.gtfNumber ?? "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{e.destino ?? "—"}</Td>
                  </>
                )}
                <Td>{e.status === "anulado"
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"><XIcon className="h-3 w-3" />Anulado</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">Registrado</span>}
                  {e.annulledReason && <div className="mt-1 text-xs text-[var(--data-error-700)]">{e.annulledReason}</div>}
                </Td>
                <Td className="text-right">
                  {e.status === "registrado" ? (
                    <div className="inline-flex items-center gap-1">
                      <IconAction
                        icon={Link2}
                        tone="success"
                        onClick={() => onChain(e)}
                        label={section === "despacho"
                          ? "Cadena de custodia: origen, costo y certificado"
                          : "Corrida: materia prima consumida, costo y congelado"}
                      />
                      {/* Agregar producción a ESTA corrida (ADR-365): lo que
                          salió después de la misma madera no abre una corrida
                          nueva — se suma acá, sin volver a elegir trozas. */}
                      {onAmpliar && ampliables?.has(e.id) && (
                        <IconAction
                          icon={Boxes}
                          tone="accent"
                          onClick={() => onAmpliar(e.id)}
                          label="Agregar producción a esta corrida (salió más de la misma materia prima)"
                        />
                      )}
                      <IconAction
                        icon={PackagePlus}
                        tone="info"
                        disabled={toProductId === e.id}
                        busy={toProductId === e.id}
                        onClick={() => onSendInventory(e.id)}
                        label={toProductId === e.id ? "Creando el producto…" : "Enviar a inventario (borrador inactivo)"}
                      />
                      {section === "despacho" && onGuia && (
                        <IconAction
                          icon={Truck}
                          tone={estadoDeGuia(e.gtfNumber) === "emitida" ? "accent" : "muted"}
                          done={estadoDeGuia(e.gtfNumber) === "emitida"}
                          onClick={() => onGuia(e)}
                          label={
                            estadoDeGuia(e.gtfNumber) === "emitida"
                              ? `Guía ${e.gtfNumber} emitida — abrir para verla o imprimirla`
                              : "Guía de transporte: borrador — abrir para completarla y emitirla"
                          }
                        />
                      )}
                      {section === "despacho" && onPapeles && (
                        <IconAction
                          icon={Paperclip}
                          tone="muted"
                          onClick={() => onPapeles(e)}
                          label="Papeles del despacho: subir GTF, factura, guías de origen… y archivarlos etiquetados"
                        />
                      )}
                      {section === "despacho" && (
                        <IconAction
                          icon={FileText}
                          tone={conAnexo.has(e.id) ? "accent" : "muted"}
                          done={conAnexo.has(e.id)}
                          onClick={() => onAnexo(e)}
                          label={conAnexo.has(e.id)
                            ? "ANEXO N° 04 emitido — abrir para re-imprimir o corregir"
                            : "Emitir el ANEXO N° 04 de esta GTF"}
                        />
                      )}
                      <IconAction
                        icon={XIcon}
                        tone="danger"
                        onClick={() => onAnnul(e.id)}
                        label="Anular la línea"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                  {totalesVista.lineas} {totalesVista.lineas === 1 ? "línea vigente" : "líneas vigentes"} en pantalla
                </td>
                {section === "produccion" ? (
                  <>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.consumido.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    <td colSpan={4} />
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.piezas}</td>
                    <td colSpan={4} />
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>

      {/* ── Mobile: cards a medida (<640px) ── */}
      {visible.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {visible.map((e) => (
            <CtpSeccionCardMobile
              key={e.id}
              entry={e}
              section={section}
              toProductId={toProductId}
              onChain={onChain}
              onAnexo={section === "despacho" ? onAnexo : undefined}
              anexoEmitido={conAnexo.has(e.id)}
              onSendInventory={onSendInventory}
              onAnnul={onAnnul}
              ampliable={ampliables?.has(e.id)}
              onAmpliar={onAmpliar}
              onPapeles={section === "despacho" ? onPapeles : undefined}
              onGuia={section === "despacho" ? onGuia : undefined}
            />
          ))}
        </div>
      )}

    </>
  );
}
