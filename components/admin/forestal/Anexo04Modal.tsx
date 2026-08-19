"use client";

/**
 * Anexo04Modal — vista previa del PDF antes de descargarlo. Muestra el lote
 * cubicado ya maquetado en el ANEXO N° 04 de SERFOR ("Lista de productos
 * transformados"): 4 bloques por hoja, un bloque por especie + tipo de producto.
 * Lo que se ve es lo que se descarga: el preview y el PDF comparten geometría
 * (`geometriaHoja`) y datos (`construirAnexo04`).
 *
 * Los datos de cabecera/pie (N°, GTF, emisor, firmante) quedan guardados por
 * tenant en localStorage: en el aserradero se emite guía tras guía y nadie
 * quiere re-tipear la razón social ni el DNI del responsable.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, X } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04, fmtAnexo } from "@/lib/forestal/anexo04-serfor";
import { validarAnexo04, anexoPresentable, type DeclaradoEnLibro } from "@/lib/forestal/anexo04-validacion";
import { useAnexo04Datos } from "@/hooks/use-anexo04-datos";
import Anexo04Campos from "./Anexo04Campos";
import Anexo04Origen, { ORIGEN_ACTUAL } from "./Anexo04Origen";
import Anexo04Historial, { ICONO_HISTORIAL } from "./Anexo04Historial";
import Anexo04Checklist from "./Anexo04Checklist";
import Anexo04Preview from "./Anexo04Preview";
import { ANEXO04_CSS } from "./Anexo04Hoja";
import Anexo04Acciones from "./Anexo04Acciones";
import { inicioDeEmision, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { useAnexosEmitidos } from "@/hooks/use-anexos-emitidos";
import { useAnexo04Salidas } from "@/hooks/use-anexo04-salidas";
import { useAnexo04Contraste } from "@/hooks/use-anexo04-contraste";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import Anexo04GtfSalida, { type DespachoParaGtf } from "./Anexo04GtfSalida";

const A4_PX = 794; // ancho de una hoja A4 a 96 dpi

/** Imprime un HTML independiente vía iframe oculto (sin popup). */
function imprimirHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 400);
}

export default function Anexo04Modal({
  rows, especieGlobal, onPdfDetallado, onCerrar, onAviso, ctpEntryId, declarado, abrirHistorial = false, despacho,
}: {
  /** Lote abierto en el cubicador; puede venir vacío (p. ej. desde el Libro CTP). */
  rows: PiezaCubicada[];
  especieGlobal?: string;
  /** Despacho del Libro que origina la emisión (queda en el historial). */
  ctpEntryId?: string;
  /**
   * La línea del despacho, para poder mirar su GUÍA al lado del anexo: los dos
   * papeles viajan juntos en el camión y se revisan juntos antes de imprimir.
   */
  despacho?: DespachoParaGtf;
  /** Lo que esa línea del Libro declara amparar: el anexo no puede pasarse. */
  declarado?: DeclaradoEnLibro | null;
  /** Abre con la bandeja de emitidos desplegada (consulta, no emisión). */
  abrirHistorial?: boolean;
  /** Descarga el PDF interno detallado (el de siempre, con precios y tipos). */
  onPdfDetallado?: () => void;
  onCerrar: () => void;
  onAviso?: (msg: string, tono: "success" | "error") => void;
}) {
  /* Sin precargas: ni la GTF de la línea del Libro ni sus observaciones. El
     anexo es una declaración jurada — lo que dice lo escribe quien lo firma. */
  const [datos, set] = useAnexo04Datos({ onError: (msg) => onAviso?.(msg, "error") });
  const [factor, setFactor] = useState(1);      // multiplica el ajuste automático
  const [fit, setFit] = useState(0.9);          // escala para que la hoja entre a lo ancho
  /** Origen de las medidas: el lote del cubicador o una cubicación guardada. */
  const [origen, setOrigen] = useState(ORIGEN_ACTUAL);
  const [piezasGuardadas, setPiezasGuardadas] = useState<PiezaCubicada[] | null>(null);
  /** Especie predominante de la cubicación elegida (fallback de los bloques). */
  const [especieOrigen, setEspecieOrigen] = useState<string | undefined>();
  /** Contra qué se coteja: la guía si vino del Libro, si no la corrida de origen. */
  const { contraste, usarCorrida } = useAnexo04Contraste(declarado);
  const [verHistorial, setVerHistorial] = useState(abrirHistorial);
  /** Qué papel se está mirando: el anexo o la guía con la que sale el camión. */
  const [docActivo, setDocActivo] = useState<"anexo" | "gtf">("anexo");
  const [, setGtfHtml] = useState<string | null>(null);
  const [historialToken, setHistorialToken] = useState(0);
  /** Los emitidos alimentan la bandeja Y el checklist (N° repetido, volumen ya
   *  amparado por otra emisión de la misma guía): por eso se cargan siempre. */
  const { lista: emitidos, cargando: cargandoEmitidos, quitar } = useAnexosEmitidos(historialToken);
  /** Identidad legal del CTP: completa lo que esté vacío y coteja el resto. */
  const ficha = useFichaCtp();
  /**
   * (3) VOLUMEN TOTAL declarado a mano — texto crudo (mismo motivo que los
   * buffers de `ResumenReparto`: sin esto, tipear "27,771" se ve colapsar a
   * "27771" en cuanto se procesa el ".").  Vacío = usar el calculado, como
   * siempre. Arranca vacío en cada apertura: el anexo abre en blanco.
   */
  const [totalBuffer, setTotalBuffer] = useState("");
  const totalManual = useMemo(() => {
    if (totalBuffer.trim() === "") return null;
    const n = Number(totalBuffer.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [totalBuffer]);

  const areaRef = useRef<HTMLDivElement>(null);
  const hojasRef = useRef<HTMLDivElement>(null);

  /**
   * El anexo abre EN BLANCO (Brandon, 2026-08). Nada se rellena solo: ni el N°
   * correlativo, ni la GTF, ni la razón social o el firmante de la ficha, ni el
   * anexo que esa guía ya tenía emitido.
   *
   * Lo que SÍ se hace es avisar: si la guía ya tiene un anexo, emitir otro sin
   * saberlo ampararía el mismo volumen dos veces. El aviso dice cuál es y la
   * bandeja de emitidos lo carga con un clic — cargarlo solo era rellenar siete
   * campos que después nadie relee.
   */
  const inicioAplicado = useRef(false);
  useEffect(() => {
    if (cargandoEmitidos || inicioAplicado.current) return;
    inicioAplicado.current = true;
    const inicio = inicioDeEmision(datos.numero, datos.gtf, emitidos, ctpEntryId);
    if (inicio.emision) {
      onAviso?.(
        `Esta guía ya tiene el anexo N° ${inicio.emision.numero || "(sin numerar)"} emitido. ` +
          "Si es el mismo viaje, abrilo desde «Emitidos» en vez de emitir otro.",
        "success",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, con la bandeja ya cargada
  }, [cargandoEmitidos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // La hoja entra siempre a lo ancho del panel; el ± sólo la agranda desde ahí.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setFit(Math.min(1, (el.clientWidth - 24) / A4_PX));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ojo con las deps: sólo lo ESTRUCTURAL. Si dependiera de `datos` entero, cada
  // tecla en la razón social devolvería hojas nuevas y tiraría abajo el memo de
  // la grilla (840 celdas por hoja).
  const filas = piezasGuardadas ?? rows;
  const especie = piezasGuardadas ? especieOrigen : especieGlobal;
  const anexo = useMemo(
    () => construirAnexo04(filas, { unidadV: datos.unidadV, modo: datos.modo }, { especieGlobal: especie, totalManualM3: totalManual }),
    [filas, datos.unidadV, datos.modo, especie, totalManual],
  );
  const escala = Math.max(0.25, fit * factor);


  const { generando, descargarPdf, descargarExcel, reDescargar, pdfDeLote } = useAnexo04Salidas({
    filas, datos, especieGlobal: especie, ctpEntryId, totalManualM3: totalManual, onAviso,
    onRegistrado: () => setHistorialToken((t) => t + 1),
  });
  // Checklist de emisión: lo que la ARFFS devuelve (errores) y lo que un
  // fiscalizador va a preguntar (avisos). No bloquea: la hoja en blanco para
  // llenar a mano es un uso legítimo del formato.
  const avisos = useMemo(
    () => validarAnexo04(datos, anexo, filas, { declarado: contraste, emitidos, ctpEntryId, ficha }),
    [datos, anexo, filas, contraste, emitidos, ctpEntryId, ficha],
  );
  const presentable = anexoPresentable(avisos);

  /** Trae una emisión pasada al formulario (datos + medidas exactas). */
  const cargarEmision = (a: AnexoEmitido) => {
    set({
      numero: a.numero, gtf: a.gtf, empresa: a.empresa, firmante: a.firmante,
      documento: a.documento, cargo: a.cargo, observaciones: a.observaciones,
      unidadV: a.unidadV, modo: a.modo,
    });
    setPiezasGuardadas(a.piezas);
    setEspecieOrigen(undefined);
    setOrigen(`emitido:${a.id}`);
    setVerHistorial(false);
  };

  /**
   * Imprime lo que se está viendo. Con la guía activa se imprime SU iframe —el
   * documento ya trae su `@page` y sus cortes—; con el anexo, sus hojas.
   */
  const imprimirGtf = () => {
    const marco = areaRef.current?.querySelector<HTMLIFrameElement>('iframe[data-gtf-salida="1"]');
    marco?.contentWindow?.focus();
    marco?.contentWindow?.print();
  };

  const imprimir = () => {
    if (docActivo === "gtf") { imprimirGtf(); return; }
    const hojas = [...(hojasRef.current?.querySelectorAll(".anx-hoja") ?? [])].map((n) => n.outerHTML).join("");
    imprimirHtml(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Anexo N° 04</title><style>${ANEXO04_CSS}
      @page { size: A4 portrait; margin: 0 }
      body { margin: 0 }
      /* break-BEFORE en las hojas siguientes: con "after" el navegador imprime
         una página en blanco al final. */
      .anx-hoja + .anx-hoja { page-break-before: always; }
    </style></head><body>${hojas}</body></html>`);
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[3vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Vista previa del Anexo N° 04" className="w-full max-w-[76rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <FileText className="h-5 w-5 text-[var(--accent)]" /> Vista previa · ANEXO N° 04
            </CardTitle>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-[var(--text-tertiary)]">
              <span>
                Lista de productos transformados · {anexo.hojas.length} hoja{anexo.hojas.length === 1 ? "" : "s"} ·{" "}
                {anexo.totalPiezas} piezas ·
              </span>
              <label className="inline-flex items-center gap-1">
                <input
                  value={totalBuffer}
                  onChange={(e) => setTotalBuffer(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder={fmtAnexo(anexo.totalCalculadoM3)}
                  aria-label="Volumen total del anexo, editable"
                  title={
                    totalManual == null
                      ? "Se calcula sumando las piezas. Escribí el tuyo para declarar otro (ajuste mínimo, las medidas de cada pieza no cambian)."
                      : `Declarado a mano: el cálculo desde las piezas da ${fmtAnexo(anexo.totalCalculadoM3)} m³. Las hojas se reparten para sumar EXACTO este número.`
                  }
                  className={`h-6 w-16 rounded-md border-2 bg-[var(--surface-raised)] px-1 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${totalManual == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-secondary)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
                />
                <span>m³</span>
              </label>
              {totalManual != null && (
                <button
                  type="button"
                  onClick={() => setTotalBuffer("")}
                  aria-label="Volver el volumen total al calculado"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {totalManual != null && Math.abs(anexo.totalM3 - anexo.totalCalculadoM3) >= 0.0005 && (
                <span className={Math.abs(anexo.totalM3 - anexo.totalCalculadoM3) / Math.max(anexo.totalCalculadoM3, 0.001) > 0.02
                  ? "font-bold text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--text-tertiary)]"}
                >
                  (cálculo desde las piezas: {fmtAnexo(anexo.totalCalculadoM3)} m³)
                </span>
              )}
              {contraste && contraste.cantidad > 0 && (
                <span className="ml-1 text-[var(--text-secondary)]">
                  {" · "}{contraste.fuente === "corrida" ? "corrida" : "guía"}: {contraste.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 })}{" "}
                  {contraste.unidad === "m3" ? "m³" : contraste.unidad?.toUpperCase() ?? ""}
                  {contraste.piezas ? ` · ${contraste.piezas} pzas` : ""}
                </span>
              )}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
          {/* Datos del formato */}
          <div className="lg:max-h-[74vh] lg:overflow-y-auto lg:pr-1">
            <Anexo04Campos datos={datos} onChange={set} ficha={ficha} onError={(msg) => onAviso?.(msg, "error")} />
            <div className="mt-3 border-t-2 border-[var(--rule-soft)] pt-3">
              <button
                type="button"
                onClick={() => setVerHistorial((v) => !v)}
                aria-expanded={verHistorial}
                className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 text-xs font-bold transition ${verHistorial ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                <ICONO_HISTORIAL className="h-4 w-4" /> Anexos emitidos
                {emitidos.length > 0 && <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 font-mono">{emitidos.length}</span>}
              </button>
              {verHistorial && (
                <div className="mt-2">
                  <Anexo04Historial
                    lista={emitidos}
                    cargando={cargandoEmitidos}
                    ctpEntryId={ctpEntryId}
                    onCargar={cargarEmision}
                    onDescargar={reDescargar}
                    onQuitar={quitar}
                    onPdfLote={pdfDeLote}
                    onError={(msg) => onAviso?.(msg, "error")}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Preview del papel */}
          <div ref={areaRef} className="min-w-0 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            {/* Los dos papeles del camión. La guía sólo se ofrece si el despacho
                ya tiene número: sin GTF emitida no hay guía que mirar, y una
                pestaña que abre un papel vacío hace pensar que se perdió algo. */}
            {despacho?.gtfNumber && (
              <div className="mb-3 flex flex-wrap gap-2">
                {([
                  { id: "anexo" as const, label: "ANEXO N° 04", nota: `${anexo.hojas.length} hoja(s)` },
                  { id: "gtf" as const, label: `GTF ${despacho.gtfNumber}`, nota: "Original + 2 copias" },
                ]).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDocActivo(p.id)}
                    aria-pressed={docActivo === p.id}
                    className={`inline-flex min-h-11 flex-col items-start justify-center rounded-2xl border-2 px-4 py-1 text-left transition-colors ${
                      docActivo === p.id
                        ? "border-[var(--accent)] bg-primary/10"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
                    }`}
                  >
                    <span className={`text-sm font-bold ${docActivo === p.id ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                      {p.label}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">{p.nota}</span>
                  </button>
                ))}
              </div>
            )}

            {docActivo === "gtf" && despacho ? (
              <Anexo04GtfSalida despacho={despacho} ficha={ficha} onHtml={setGtfHtml} />
            ) : (
            <Anexo04Preview
              ref={hojasRef}
              anexo={anexo}
              datos={datos}
              escala={escala}
              onZoom={(paso) => setFactor((f) => Math.min(3, Math.max(0.5, f + paso)))}
              origen={
                <Anexo04Origen
                  piezasActuales={rows.length}
                  valor={origen}
                  despachoId={ctpEntryId}
                  onCambio={(id, piezas, registro) => {
                    setOrigen(id);
                    setPiezasGuardadas(piezas);
                    // La guardada trae su especie predominante: fallback para las
                    // piezas que se cargaron sin especie propia.
                    setEspecieOrigen(registro?.especie);
                    void usarCorrida(registro?.ctpEntryId);
                  }}
                />
              }
              checklist={<Anexo04Checklist avisos={avisos} presentable={presentable} onSugerencia={(campo, valor) => set({ [campo]: valor })} />}
            />
            )}
          </div>
        </div>

        <Anexo04Acciones
          presentable={presentable}
          generando={generando}
          onPdfDetallado={onPdfDetallado}
          onExcel={descargarExcel}
          onImprimir={imprimir}
          onDescargar={descargarPdf}
        />
      </div>
    </div>
  );
}
