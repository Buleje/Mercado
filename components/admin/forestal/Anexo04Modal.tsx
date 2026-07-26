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
import { construirAnexo04, fmtAnexo, type DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
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
import { useFichaCtp } from "@/hooks/use-ficha-ctp";

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
  rows, especieGlobal, onPdfDetallado, onCerrar, onAviso, gtfInicial, observacionesIniciales, ctpEntryId, declarado, abrirHistorial = false,
}: {
  /** Lote abierto en el cubicador; puede venir vacío (p. ej. desde el Libro CTP). */
  rows: PiezaCubicada[];
  especieGlobal?: string;
  /** GTF de salida con la que se abre el anexo (desde una línea del Libro). */
  gtfInicial?: string;
  /** Despacho del Libro que origina la emisión (queda en el historial). */
  ctpEntryId?: string;
  /** Lo que esa línea del Libro declara amparar: el anexo no puede pasarse. */
  declarado?: DeclaradoEnLibro | null;
  /** Abre con la bandeja de emitidos desplegada (consulta, no emisión). */
  abrirHistorial?: boolean;
  observacionesIniciales?: string;
  /** Descarga el PDF interno detallado (el de siempre, con precios y tipos). */
  onPdfDetallado?: () => void;
  onCerrar: () => void;
  onAviso?: (msg: string, tono: "success" | "error") => void;
}) {
  const [datos, set] = useAnexo04Datos({ gtfInicial, observacionesIniciales, onError: (msg) => onAviso?.(msg, "error") });
  const [factor, setFactor] = useState(1);      // multiplica el ajuste automático
  const [fit, setFit] = useState(0.9);          // escala para que la hoja entre a lo ancho
  /** Origen de las medidas: el lote del cubicador o una cubicación guardada. */
  const [origen, setOrigen] = useState(ORIGEN_ACTUAL);
  const [piezasGuardadas, setPiezasGuardadas] = useState<PiezaCubicada[] | null>(null);
  /** Especie predominante de la cubicación elegida (fallback de los bloques). */
  const [especieOrigen, setEspecieOrigen] = useState<string | undefined>();
  const [verHistorial, setVerHistorial] = useState(abrirHistorial);
  const [historialToken, setHistorialToken] = useState(0);
  /** Los emitidos alimentan la bandeja Y el checklist (N° repetido, volumen ya
   *  amparado por otra emisión de la misma guía): por eso se cargan siempre. */
  const { lista: emitidos, cargando: cargandoEmitidos, quitar } = useAnexosEmitidos(historialToken);
  /** Identidad legal del CTP: completa lo que esté vacío y coteja el resto. */
  const ficha = useFichaCtp();

  const areaRef = useRef<HTMLDivElement>(null);
  const hojasRef = useRef<HTMLDivElement>(null);

  /**
   * Punto de partida al abrir: si la guía ya tiene anexo se carga ese (vienen a
   * re-imprimirlo), y si el N° guardado es el de la guía anterior se propone el
   * siguiente libre. Corre una sola vez, cuando llega la bandeja.
   */
  const inicioAplicado = useRef(false);
  useEffect(() => {
    if (cargandoEmitidos || inicioAplicado.current) return;
    inicioAplicado.current = true;
    const inicio = inicioDeEmision(datos.numero, datos.gtf, emitidos, ctpEntryId);
    if (inicio.emision) {
      cargarEmision(inicio.emision);
      onAviso?.(`Esta guía ya tenía el anexo N° ${inicio.emision.numero || "(sin numerar)"}: lo cargué para revisarlo o re-imprimirlo.`, "success");
    } else if (inicio.numeroSugerido) {
      set({ numero: inicio.numeroSugerido });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, con la bandeja ya cargada
  }, [cargandoEmitidos]);

  // Autocompleta SÓLO lo que está vacío: si el operario escribió algo, manda él.
  const fichaAplicada = useRef(false);
  useEffect(() => {
    if (!ficha || fichaAplicada.current) return;
    fichaAplicada.current = true;
    const patch: Partial<DatosAnexo04> = {};
    if (!datos.empresa.trim() && ficha.razonSocial) patch.empresa = ficha.razonSocial;
    if (!datos.firmante.trim() && ficha.representante) patch.firmante = ficha.representante;
    if (!datos.documento.trim() && ficha.representanteDni) patch.documento = ficha.representanteDni;
    if (Object.keys(patch).length > 0) set(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, cuando llega la ficha
  }, [ficha]);

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
    () => construirAnexo04(filas, { unidadV: datos.unidadV, modo: datos.modo }, { especieGlobal: especie }),
    [filas, datos.unidadV, datos.modo, especie],
  );
  const escala = Math.max(0.25, fit * factor);
  const { generando, descargarPdf, descargarExcel, reDescargar, pdfDeLote } = useAnexo04Salidas({
    filas, datos, especieGlobal: especie, ctpEntryId, onAviso,
    onRegistrado: () => setHistorialToken((t) => t + 1),
  });
  // Checklist de emisión: lo que la ARFFS devuelve (errores) y lo que un
  // fiscalizador va a preguntar (avisos). No bloquea: la hoja en blanco para
  // llenar a mano es un uso legítimo del formato.
  const avisos = useMemo(
    () => validarAnexo04(datos, anexo, filas, { declarado, emitidos, ctpEntryId, ficha }),
    [datos, anexo, filas, declarado, emitidos, ctpEntryId, ficha],
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

  const imprimir = () => {
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
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              Lista de productos transformados · {anexo.hojas.length} hoja{anexo.hojas.length === 1 ? "" : "s"} ·{" "}
              {anexo.totalPiezas} piezas · {fmtAnexo(anexo.totalM3)} m³
              {declarado && declarado.cantidad > 0 && (
                <span className="ml-1 text-[var(--text-secondary)]">
                  {" · "}guía: {declarado.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 })}{" "}
                  {declarado.unidad === "m3" ? "m³" : declarado.unidad?.toUpperCase() ?? ""}
                  {declarado.piezas ? ` · ${declarado.piezas} pzas` : ""}
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
                className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 text-xs font-bold transition ${verHistorial ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
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
                  }}
                />
              }
              checklist={<Anexo04Checklist avisos={avisos} presentable={presentable} onSugerencia={(campo, valor) => set({ [campo]: valor })} />}
            />
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
