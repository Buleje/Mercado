"use client";

/**
 * Una GUÍA de la bandeja de Ingresos en la tabla (≥640 px), y sus asientos
 * desplegados debajo.
 *
 * Compacta a propósito (Brandon, 2026-09-25: «ves guía, proveedor, permiso,
 * especie y m³ de un vistazo, sin desplazar»). Medido antes: la tabla medía
 * 2 010 px en una caja de 960 a 1280 px de pantalla. Tres celdas explicaban
 * casi todo el sobrante —la resolución del permiso sin tope de ancho (449 px),
 * el aviso de descuadre en una sola línea (270 px) y las acciones con texto
 * largo (334 px)—. Ningún dato se fue: lo que dejó de estar a la vista quedó en
 * el `title`, en la columna opcional que ya lo tenía o en el menú «Más».
 */

import {
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  Download,
  Eye,
  MoreHorizontal,
  PackageCheck,
} from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { faltaRecibirMadera, loQueFaltaRecibir } from "@/lib/forestal/recepcion-guias";
import { esSinCosto } from "@/lib/forestal/madera-de-servicio";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";
import { formatNumber } from "@/lib/format";
import ActionMenu from "@/components/admin/shared/action-menu";
import CtpEntryActions from "./CtpEntryActions";
import EspecieFoto from "./EspecieFoto";
import CtpChipVencimiento from "./CtpChipVencimiento";
import { ChipDocumentosGuia, useDocumentosGuiaCtx } from "./ctp-documentos-guia-contexto";
import type { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { accionesDeAsiento, accionesDeGuia, type ManejadoresDeGuia } from "./ctp-guia-acciones";
import { guiasVisiblesEnOrden, type ColsGuiasVisibles } from "./ctp-guias-columnas";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import {
  PLAZO_REGISTRO_DIAS,
  StatusBadge,
  DescuadreChip,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  type WoodEntry,
  type WoodEntryStatus,
} from "./ctp-shared";
import { UNIT_LABELS } from "./ctp-section-shared";

type Guia = GuiaIngreso<WoodEntry>;

/** Las props de `CtpEntryActions` que no dependen de la fila. */
export type AccionesDeAsiento = Omit<React.ComponentProps<typeof CtpEntryActions>, "entry" | "onVerGuia" | "block">;

export interface FilaGuiaProps extends Omit<ManejadoresDeGuia, "asientos" | "onStartReject" | "onDetail" | "onChain" | "onDuplicate" | "onEdit"> {
  guia: Guia;
  abierta: boolean;
  marcada: boolean;
  /** Por qué no se puede tildar (`tildeDeGuia`); `null` = se puede. */
  motivoSinTilde: string | null;
  cols: ColsGuiasVisibles;
  /** El orden de las columnas movibles (`useOrdenColumnas`), el mismo de la cabecera. */
  orden: readonly string[];
  fotosEspecie: ReturnType<typeof useEspeciesFotos>["indice"];
  actionProps: AccionesDeAsiento;
  onVerFicha: (g: Guia) => void;
  onCuadrar: (g: Guia) => void;
  onValidarGuia: (g: Guia) => void;
  onRecepcionarGuia: (g: Guia) => void;
  onAlternarDetalle: () => void;
  onAlternarMarca: (v: boolean) => void;
}

/** El aviso de descuadre, corto: la frase entera va en el `title`. */
function avisoCorto(c: ReturnType<typeof cuadreDeIngreso>): string {
  /* Espacio duro entre la cifra y la unidad: el chip puede partirse en dos
     renglones, pero nunca dejar «m³» solo abajo. */
  if (c.estado === "faltan") return `faltan ${fmtM3(c.brecha)}\u00a0m³`;
  if (c.estado === "sobran") return `sobran ${fmtM3(Math.abs(c.brecha))}\u00a0m³`;
  return "";
}

export default function FilaGuia({
  guia,
  abierta,
  marcada,
  motivoSinTilde,
  cols,
  orden,
  fotosEspecie,
  actionProps,
  onVerGuia,
  onVerDocumento,
  onVerFicha,
  onCuadrar,
  onValidarGuia,
  onRecepcionarGuia,
  onCostear,
  onCorregirRecepcion,
  onAcomodar,
  onImprimirEtiquetas,
  onCubicarOxapampa,
  onAlternarDetalle,
  onAlternarMarca,
}: FilaGuiaProps) {
  const primera = guia.lineas[0];
  const unaSola = guia.lineas.length === 1;
  const tarde = guia.lineas.some((l) => estaFueraDePlazo(l));
  const pendientes = guia.lineas.filter((l) => l.status === "pendiente").map((l) => l.id);
  /* Rechazar/anular pide un motivo en la misma celda: mientras se escribe, la
     fila cede el lugar a ese formulario (es el flujo de `CtpEntryActions`). */
  const enRechazo = actionProps.rejectingId === primera.id;
  /**
   * ¿Queda madera de este papel por recibir? Lo contesta la GUÍA y no la
   * pestaña en la que se la esté mirando (2026-09-15): la misma guía tenía o no
   * «Recepcionar» según desde dónde se llegara, y una validada a mano se iba al
   * archivo con sus trozas sin fechar.
   */
  const faltaRecibir = faltaRecibirMadera(guia);
  const queFalta = loQueFaltaRecibir(guia);
  const cuadre = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
  /* Las visibles en el orden elegido: la fila principal y sus asientos pintan
     con la misma lista que la cabecera. */
  const visibles = guiasVisiblesEnOrden(orden, cols);
  const rotulo = visibles.find((id) => id !== "fecha" && id !== "especies" && id !== "cantidad" && id !== "estado");

  const docsGuia = useDocumentosGuiaCtx();
  const masAcciones = accionesDeGuia(guia, {
    /* Los casilleros de papeles (ADR-438): vienen del contexto de la vista. */
    onDocumentos: docsGuia?.abrir,
    docsLlenos: docsGuia?.llenos[guia.gtfNumber],
    onVerDocumento,
    onVerGuia,
    onCostear,
    onCorregirRecepcion,
    onAcomodar,
    onImprimirEtiquetas,
    onCubicarOxapampa,
    onDetail: actionProps.onDetail,
    onChain: actionProps.onChain,
    onDuplicate: actionProps.onDuplicate,
    onEdit: actionProps.onEdit,
    onStartReject: actionProps.onStartReject,
    asientos: { abierta, onAlternar: onAlternarDetalle },
  });

  return (
    <>
      <tr
        className={`border-t border-[var(--rule-soft)] align-top transition-colors hover:bg-[var(--surface-canvas)]/40 ${
          marcada ? "bg-primary/5" : ""
        }`}
      >
        <Td>
          {/* Siempre la casilla: apagada, dice por qué (lector de pantalla y
              `title`), en vez de un hueco que no explica nada. */}
          <input
            type="checkbox"
            aria-label={
              motivoSinTilde
                ? `No se puede seleccionar la guía ${guia.gtfNumber}: ${motivoSinTilde}`
                : `Seleccionar la guía ${guia.gtfNumber}`
            }
            title={motivoSinTilde ? `No se puede seleccionar: ${motivoSinTilde}` : undefined}
            disabled={motivoSinTilde != null}
            checked={marcada}
            onChange={(ev) => onAlternarMarca(ev.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[var(--brand-ink)] disabled:cursor-not-allowed disabled:opacity-30"
          />
        </Td>
        <EnOrden
          orden={orden}
          celdas={{
          /* Fecha y N° de libro en UNA celda (2026-09-25): el libro es
              cronológico, el folio y su día se leen juntos. Eran dos columnas
              de 73 y 107 px en una tabla que no entraba. */
          fecha: (
          <Td>
            <div className="whitespace-nowrap font-bold text-[var(--text-primary)]">{formatDate(guia.entryDate)}</div>
            <div className="whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]" title="N° de libro: el folio que cita la autoridad">
              N°{" "}
              {guia.libroDesde == null
                ? "—"
                : guia.libroHasta != null && guia.libroHasta !== guia.libroDesde
                  ? `${guia.libroDesde}–${guia.libroHasta}`
                  : guia.libroDesde}
            </div>
            {!unaSola && (
              <div className="whitespace-nowrap text-xs text-[var(--text-tertiary)]">{guia.lineas.length} asientos</div>
            )}
            {tarde && (
              <div
                title={`Registrada ${diasDeRegistro(primera)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS} días hábiles)`}
                className="whitespace-nowrap text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                fuera de plazo
              </div>
            )}
            {/* ADR-434 §Vencimiento: recibida después de que venció su guía, o vencida sin recibir. */}
            <CtpChipVencimiento guia={guia} className="mt-0.5 max-w-36" />
          </Td>
          ),
          tipoDoc: cols.tipoDoc && (
            <Td>
              <span className="whitespace-nowrap rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                {guia.docType || "GTF"}
              </span>
              {guia.gtfSeries && (
                <div className="mt-0.5 text-xs tabular-nums text-[var(--text-tertiary)]">Serie {guia.gtfSeries}</div>
              )}
            </Td>
          ),
          documento: cols.documento && (
            <Td>
              <button
                type="button"
                onClick={() => actionProps.onDetail(primera)}
                title={guia.gtfNumber}
                className="block max-w-28 truncate text-left text-sm font-bold tabular-nums text-[var(--brand-ink)] underline-offset-2 hover:underline dark:text-[var(--text-primary)]"
              >
                {guia.gtfNumber}
              </button>
              <div className="max-w-28 truncate text-xs text-[var(--text-tertiary)]">
                <span className="font-bold uppercase tracking-wide">{guia.docType || "GTF"}</span>
                {guia.gtfSeries ? ` · ${guia.gtfSeries}` : ""}
              </div>
              {guia.gtfDate && <div className="whitespace-nowrap text-xs text-[var(--text-tertiary)]">{formatDate(guia.gtfDate)}</div>}
              <ChipDocumentosGuia guia={guia} className="mt-0.5" />{/* ADR-438 */}
            </Td>
          ),
          fechaGuia: cols.fechaGuia && (
            <Td>
              {guia.gtfDate ? (
                <span className="whitespace-nowrap font-medium text-[var(--text-primary)]">{formatDate(guia.gtfDate)}</span>
              ) : (
                <span className="text-sm text-[var(--text-tertiary)]">—</span>
              )}
            </Td>
          ),
          /* El N° de constancia del SNIFFS: con él se vuelve a la guía en la base
              de SERFOR, y es lo que pide una fiscalización que quiere contrastar. */
          sniffs: cols.sniffs && (
            <Td>
              {primera.serforNumeroRegistro ? (
                <span className="text-sm tabular-nums text-[var(--text-primary)]">{primera.serforNumeroRegistro}</span>
              ) : (
                <span className="text-sm text-[var(--text-tertiary)]">—</span>
              )}
            </Td>
          ),
          /* Proveedor y permiso en DOS columnas (Brandon, 2026-09-26: «separar
              la columna proveedor · permiso en dos con su respectivo campo»).
              Contrato (9) y Resolución (5) del LO-CTP Sección 1: lo que ampara
              la madera. */
          proveedor: cols.proveedor && (
            <Td>
              <div
                title={`${guia.providerName} · ${originLabel(primera.originType)}`}
                className="max-w-36 truncate font-medium text-[var(--text-primary)]"
              >
                {guia.providerName}
              </div>
              {/* La guía importada como existencia de apertura no trae proveedor:
                  el importador escribe siempre este texto (`ctp-serfor-a-libro.ts`). */}
              {guia.providerName === PROVEEDOR_INVENTARIO_APERTURA ? (
                <span
                  title="Existencia de apertura: entró por el importador del libro, no es una GTF recepcionada"
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                >
                  <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
                </span>
              ) : guia.lineas.some((l) => l.maderaDeTercero === true) ? (
                /* Madera de servicio (ADR-437): el dueño a la vista, al lado del
                   proveedor — la columna «Valorizado» viene apagada por defecto. */
                <ChipServicio guia={guia} />
              ) : (
                <div className="text-xs text-[var(--text-tertiary)]">{originLabel(primera.originType)}</div>
              )}
            </Td>
          ),
          permiso: cols.permiso && (
            <Td>
              <div
                className="max-w-36 truncate text-sm font-bold tabular-nums text-[var(--text-secondary)]"
                title={guia.originCode ? `Permiso ${guia.originCode}${guia.originSourceNumber ? ` · Resolución ${guia.originSourceNumber}` : ""}` : "Sin permiso cargado"}
              >
                {guia.originCode || <span className="font-normal text-[var(--text-tertiary)]">—</span>}
              </div>
              {guia.originSourceNumber && (
                <div className="max-w-36 truncate text-xs tabular-nums text-[var(--text-tertiary)]" title={`Resolución ${guia.originSourceNumber}`}>
                  Res. {guia.originSourceNumber}
                </div>
              )}
            </Td>
          ),
          /* De dónde salió la madera. `originLabel` traduce el tipo (concesión,
              predio, plantación); región y distrito vienen del asiento. */
          origen: cols.origen && (
            <Td>
              <div className="max-w-36 truncate text-sm font-medium text-[var(--text-primary)]">
                {primera.originRegion || primera.originDistrict ? (
                  [primera.originRegion, primera.originDistrict].filter(Boolean).join(" · ")
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">{originLabel(primera.originType)}</div>
            </Td>
          ),
          /* Cuándo LLEGÓ la madera a planta (ADR-335) — distinta de la fecha del
              asiento y de la del papel. */
          recepcion: cols.recepcion && (
            <Td>
              {primera.fechaRecepcion ? (
                <div className="whitespace-nowrap font-medium text-[var(--text-primary)]">
                  {formatDate(primera.fechaRecepcion)}
                </div>
              ) : (
                <span className="text-sm text-[var(--text-tertiary)]">sin recepcionar</span>
              )}
              {faltaRecibir && (
                <div
                  title={queFalta.join(" · ")}
                  className="mt-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                >
                  falta recibir
                </div>
              )}
            </Td>
          ),
          producto: cols.producto && (
            <Td>
              <span className="whitespace-nowrap rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                {[...new Set(guia.lineas.map((l) => productLabel(l.productType)))].join(" · ") || "—"}
              </span>
            </Td>
          ),
          especies: (
          <Td>
            {/* Todas las especies del papel. Con una sola, su m³ es el de
                «Cantidad» y no se repite; con varias, cada una lleva el suyo. */}
            <button
              type="button"
              onClick={onAlternarDetalle}
              aria-expanded={abierta}
              className="flex w-full max-w-40 items-start gap-1.5 text-left"
              title={unaSola ? "Ver el asiento del libro" : `Ver los ${guia.lineas.length} asientos del libro`}
            >
              <ChevronRight
                className={`mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "rotate-90" : ""}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                {guia.especies.slice(0, 3).map((e) => (
                  <span key={e.comun} className="flex min-w-0 items-center gap-1.5">
                    <EspecieFoto especie={e.comun} indice={fotosEspecie} />
                    <span className="min-w-0 truncate font-medium text-[var(--text-primary)]">{e.comun}</span>
                    {guia.especies.length > 1 && (
                      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]">
                        {fmtM3(e.volumenM3)}
                      </span>
                    )}
                    {e.cites && (
                      <span
                        title="Especie protegida CITES"
                        className="shrink-0 rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"
                      >
                        CITES
                      </span>
                    )}
                  </span>
                ))}
                {guia.especies.length > 3 && (
                  <span className="block text-xs font-bold text-[var(--text-tertiary)]">
                    +{guia.especies.length - 3} especies más
                  </span>
                )}
                <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
                  {guia.especies.length === 1
                    ? productLabel(primera.productType)
                    : `${guia.especies.length} especies · ${[...new Set(guia.lineas.map((l) => productLabel(l.productType)))].join(" · ")}`}
                </span>
              </span>
            </button>
          </Td>
          ),
          /* El m³ y las trozas JUNTOS: es lo que se chequea contra la pila. */
          cantidad: (
          <Td className="text-right">
            <div className="whitespace-nowrap font-bold tabular-nums text-[var(--text-primary)]">
              {fmtM3(guia.volumenM3)} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
            </div>
            <div className="whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]">
              {guia.trozasCount > 0
                ? `${guia.trozasCount} ${guia.trozasCount === 1 ? "troza" : "trozas"}`
                : guia.piezas > 0
                  ? `${guia.piezas} ${guia.piezas === 1 ? "pieza" : "piezas"}`
                  : "sin piezas"}
            </div>
            {/* El descuadre de la GUÍA entera (ADR-353), y es un BOTÓN: el aviso
                que no lleva a ningún lado se lee como «arreglate». Corto a la
                vista; la frase con los dos lados del documento, en el `title`. */}
            {descuadra(cuadre) && (
              <button
                type="button"
                onClick={() => onCuadrar(guia)}
                title={`La guía declara ${fmtM3(guia.volumenM3)} m³${unaSola ? "" : ` entre sus ${guia.lineas.length} asientos`} y sus ${guia.trozasCount} piezas suman ${fmtM3(guia.trozasM3 ?? 0)} m³ (${cuadre.aviso}). Abre el cuadre para ver los dos lados del documento.`}
                className="mt-1 inline-flex items-start gap-1 rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-left text-xs font-bold text-[var(--data-warning-700)] underline-offset-2 hover:underline dark:text-[var(--data-warning-500)]"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>{avisoCorto(cuadre)}</span>
              </button>
            )}
          </Td>
          ),
          piezas: cols.piezas && (
            <Td className="text-right tabular-nums text-[var(--text-secondary)]">
              {guia.piezas > 0 ? guia.piezas : <span className="text-[var(--text-tertiary)]">—</span>}
            </Td>
          ),
          /* Lo CARGADO en el detalle, que puede no coincidir con lo que declara
              el papel — el descuadre ya se avisa en «Cantidad». */
          trozas: cols.trozas && (
            <Td className="text-right tabular-nums text-[var(--text-secondary)]">
              {guia.trozasCount > 0 ? (
                <>
                  {guia.trozasCount}
                  {guia.trozasM3 != null && (
                    <div className="whitespace-nowrap text-xs text-[var(--text-tertiary)]">{fmtM3(guia.trozasM3)} m³</div>
                  )}
                </>
              ) : (
                <span className="text-[var(--text-tertiary)]">—</span>
              )}
            </Td>
          ),
          unidad: cols.unidad && (
            <Td className="text-sm text-[var(--text-secondary)]">
              {primera.unit ? (UNIT_LABELS[primera.unit] ?? primera.unit) : <span className="text-[var(--text-tertiary)]">—</span>}
            </Td>
          ),
          /* Lo que se pagó por esta madera (ADR-135). Suma los asientos de la guía. */
          costo: cols.costo && (
            <Td className="text-right tabular-nums">
              <CeldaCosto guia={guia} />
            </Td>
          ),
          registro: cols.registro && (
            <Td className="text-sm text-[var(--text-secondary)]">
              <div className="max-w-28 truncate" title={primera.createdBy}>{primera.createdBy || "—"}</div>
              {primera.validatedBy && (
                <div className="max-w-28 truncate text-xs text-[var(--text-tertiary)]" title={`Validó ${primera.validatedBy}`}>
                  validó {primera.validatedBy}
                </div>
              )}
            </Td>
          ),
          estado: cols.estado && (
            <Td>
              <EstadoDeGuia guia={guia} />
              {guia.trozasCount > 0 && (
                <div className="mt-1 whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]" title="Piezas con decisión de recepción">
                  {guia.trozasDecididas}/{guia.trozasCount} recibidas
                </div>
              )}
            </Td>
          ),
          }}
        />
        <Td className="text-right">
          {enRechazo ? (
            <CtpEntryActions entry={primera} {...actionProps} onVerGuia={primera.serforGtf ? onVerGuia : undefined} />
          ) : (
            <div className="flex items-center justify-end gap-1">
              {/* La FICHA es donde se revisa y se recibe (ADR-350): queda visible. */}
              <BotonGuia icon={Eye} texto="Ficha" soloIcono title="Ficha de la guía: casilleros, asientos, piezas y recepción" onClick={() => onVerFicha(guia)} />
              {faltaRecibir ? (
                <BotonGuia
                  icon={PackageCheck}
                  tono="accion"
                  texto="Recepcionar"
                  title={`Fecha la guía y sus piezas el día que bajó del camión${queFalta.length > 0 ? ` — hoy le falta: ${queFalta.join(", ")}` : ""}. Sin eso la madera no aparece en Consumos.`}
                  onClick={() => onRecepcionarGuia(guia)}
                  disabled={Boolean(actionProps.busy)}
                />
              ) : pendientes.length > 0 ? (
                <BotonGuia
                  icon={CheckCheck}
                  tono="accion"
                  texto={unaSola ? "Validar" : `Validar ${pendientes.length}`}
                  onClick={() => (unaSola ? actionProps.onValidate(primera.id) : onValidarGuia(guia))}
                  disabled={Boolean(actionProps.busy)}
                />
              ) : !cols.estado ? (
                /* Sin acto pendiente y sin la columna «Estado», el lugar del
                   botón dice dónde quedó la guía: validada, procesada o
                   rechazada no pueden verse iguales. */
                <EstadoDeGuia guia={guia} compacto />
              ) : null}
              <ActionMenu
                label="Más"
                title="Documento, fotos, costo, corregir la recepción y el resto"
                icon={MoreHorizontal}
                size="xs"
                actions={masAcciones}
                soloIcono
              />
            </div>
          )}
        </Td>
      </tr>

      {abierta &&
        guia.lineas.map((l) => (
          <tr key={l.id} className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60">
            <Td />
            {/* El asiento pone lo suyo bajo SU columna, esté donde esté (las
                columnas se arrastran, 2026-09-26): fecha, especie, m³ y estado.
                La primera otra columna visible dice qué es la fila; el resto,
                vacías — el asiento no tiene papel ni proveedor propios. */}
            <EnOrden
              orden={orden}
              celdas={Object.fromEntries(
                visibles.map((id) => [
                  id,
                  id === "fecha" ? (
                    <Td className="whitespace-nowrap text-sm text-[var(--text-tertiary)]">
                      {formatDate(l.entryDate)}
                      <div className="text-xs tabular-nums text-[var(--text-secondary)]">N° {l.libroNro ?? "—"}</div>
                    </Td>
                  ) : id === "especies" ? (
                    <Td>
                      <span className="font-medium text-[var(--text-primary)]">{l.speciesCommonName}</span>
                      {l.speciesScientificName && (
                        <span className="ml-2 text-xs italic text-[var(--text-tertiary)]">{l.speciesScientificName}</span>
                      )}
                      <span className="ml-2 whitespace-nowrap rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                        {productLabel(l.productType)}
                      </span>
                    </Td>
                  ) : id === "cantidad" ? (
                    <Td className="text-right">
                      <div className="whitespace-nowrap font-bold tabular-nums text-[var(--text-primary)]">
                        {fmtM3(Number(l.volumeM3))} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                      </div>
                      <DescuadreChip entry={l} />
                    </Td>
                  ) : id === "estado" ? (
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                  ) : id === rotulo ? (
                    <Td className="text-sm text-[var(--text-tertiary)]">
                      asiento del libro{l.originCode ? ` · ${l.originCode}` : ""}
                    </Td>
                  ) : (
                    <Td />
                  ),
                ]),
              )}
            />
            <Td className="text-right">
              {actionProps.rejectingId === l.id ? (
                /* El motivo del rechazo, en la misma celda (flujo de `CtpEntryActions`). */
                <CtpEntryActions entry={l} {...actionProps} onVerGuia={l.serforGtf ? onVerGuia : undefined} />
              ) : (
                <div className="flex items-center justify-end gap-1">
                  {!cols.estado && <StatusBadge status={l.status} />}
                  {l.status === "pendiente" && (
                    <BotonGuia
                      icon={CheckCheck}
                      tono="accion"
                      texto="Validar"
                      title="Validar este asiento"
                      onClick={() => actionProps.onValidate(l.id)}
                      disabled={actionProps.busy === `${l.id}:validate`}
                    />
                  )}
                  <ActionMenu
                    label={`Más del asiento N° ${l.libroNro ?? "—"}`}
                    title="Ver, GTF, duplicar, cadena, corregir y rechazar este asiento"
                    icon={MoreHorizontal}
                    size="xs"
                    soloIcono
                    actions={accionesDeAsiento(l, {
                      onDetail: actionProps.onDetail,
                      onVerGuia: l.serforGtf ? onVerGuia : undefined,
                      onChain: actionProps.onChain,
                      onDuplicate: actionProps.onDuplicate,
                      onEdit: actionProps.onEdit,
                      onStartReject: actionProps.onStartReject,
                    })}
                  />
                </div>
              )}
            </Td>
          </tr>
        ))}
    </>
  );
}

/**
 * El estado de la guía: uno, o uno por asiento cuando no coinciden.
 * `compacto` (en la celda de acciones): el mixto va en UNA pastilla con el
 * detalle en el `title` — dos pastillas ahí ensanchaban la tabla ~90 px.
 */
export function EstadoDeGuia({ guia, compacto = false }: { guia: Guia; compacto?: boolean }) {
  if (!guia.statusMixto) return <StatusBadge status={guia.status as WoodEntryStatus} />;
  if (compacto) {
    return (
      <span
        title={Object.entries(guia.porEstado).map(([estado, n]) => `${estado} ×${n}`).join(" · ")}
        className="inline-flex shrink-0 items-center rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
      >
        mixto
      </span>
    );
  }
  /* Decir «validada» porque la primera lo está esconde justo la línea que hay
     que mirar. */
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {Object.entries(guia.porEstado).map(([estado, n]) => (
        <span key={estado} className="whitespace-nowrap">
          <StatusBadge status={estado as WoodEntryStatus} />
          <span className="ml-1 text-xs text-[var(--text-tertiary)]">×{n}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Madera de servicio (ADR-437): no se compró, se asierra para su dueño. Se
 * nombra al dueño en vez de «sin valorizar» — no le falta nada.
 */
export function ChipServicio({ guia }: { guia: Guia }) {
  const l = guia.lineas.find((x) => x.maderaDeTercero === true);
  if (!l) return null;
  return (
    <span
      title={`Madera de servicio${l.duenoNombre ? ` de ${l.duenoNombre}` : ""}: no la compraste, la asierras para su dueño. No lleva costo.`}
      className="inline-flex max-w-[12rem] items-center truncate whitespace-nowrap rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
    >
      Servicio{l.duenoNombre ? ` · ${l.duenoNombre}` : ""}
    </span>
  );
}

function CeldaCosto({ guia }: { guia: Guia }) {
  if (guia.lineas.some((l) => l.maderaDeTercero === true)) return <ChipServicio guia={guia} />;
  const conCosto = guia.lineas.filter((l) => l.costoTotal != null);
  const faltan = guia.lineas.filter((l) => esSinCosto(l)).length;
  if (conCosto.length === 0) return <span className="text-sm text-[var(--text-tertiary)]">{faltan > 0 ? "sin valorizar" : "—"}</span>;
  const total = conCosto.reduce((n, l) => n + Number(l.costoTotal ?? 0), 0);
  const moneda = conCosto[0]?.moneda === "USD" ? "US$" : "S/";
  return (
    <>
      <div className="whitespace-nowrap font-bold text-[var(--text-primary)]">
        {moneda} {formatNumber(total, 2)}
      </div>
      {faltan > 0 && (
        <div className="whitespace-nowrap text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {conCosto.length} de {conCosto.length + faltan} asientos
        </div>
      )}
    </>
  );
}

/**
 * Botón de la fila. `h-8` para que la altura de la guía la mande el DATO y no el
 * control; `tono="accion"` marca el acto que toca ahora (validar, recepcionar),
 * que es el único que se distingue del resto.
 */
function BotonGuia({
  icon: Icon,
  texto,
  onClick,
  disabled,
  tono = "neutro",
  title,
  soloIcono = false,
}: {
  icon: typeof PackageCheck;
  texto: string;
  onClick: () => void;
  disabled?: boolean;
  tono?: "neutro" | "accion";
  /** Qué hace de verdad, cuando el texto del botón no alcanza para decirlo. */
  title?: string;
  /** Sólo el ícono, con su texto en el tooltip y en `aria-label`: la acción
   *  que se repite en cada fila no suma una palabra por fila (2026-10-01). */
  soloIcono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? texto}
      aria-label={soloIcono ? texto : undefined}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg ${soloIcono ? "w-8" : "px-1.5"} text-xs font-bold transition-colors disabled:opacity-40 ${
        tono === "accion"
          ? "border-2 border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white hover:opacity-90"
          : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      }`}
    >
      <Icon className={soloIcono ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      {!soloIcono && texto}
    </button>
  );
}

/**
 * Celda de la tabla. `px-2!`: `DataTable` fuerza `px-3` con un selector
 * descendiente que le gana a la clase del hijo (memoria
 * `tabla-del-panel-tres-trampas-de-ancho`); con nueve columnas eran 70 px.
 */
export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2! py-2.5 ${className ?? ""}`}>
      {children}
    </td>
  );
}
