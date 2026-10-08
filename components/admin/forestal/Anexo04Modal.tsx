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
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, Truck, X } from "@buleje/design-system/icons";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04, fmtAnexo } from "@/lib/forestal/anexo04-serfor";
import { validarAnexo04, avisosDeProcedencia, anexoPresentable, type AvisoAnexo04, type DeclaradoEnLibro, type ProcedenciaBloques } from "@/lib/forestal/anexo04-validacion";
import { useAnexo04Datos } from "@/hooks/use-anexo04-datos";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import Anexo04Campos from "./Anexo04Campos";
import Anexo04Origen, { ORIGEN_ACTUAL } from "./Anexo04Origen";
import Anexo04Historial, { ICONO_HISTORIAL } from "./Anexo04Historial";
import Anexo04Checklist from "./Anexo04Checklist";
import Anexo04Preview from "./Anexo04Preview";
import { ANEXO04_CSS, type CampoEditable } from "./Anexo04Hoja";
import Anexo04Acciones from "./Anexo04Acciones";
import { inicioDeEmision, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { useAnexosEmitidos } from "@/hooks/use-anexos-emitidos";
import { useAnexo04Salidas } from "@/hooks/use-anexo04-salidas";
import { useAnexo04Contraste } from "@/hooks/use-anexo04-contraste";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import Anexo04GtfSalida, { type DespachoParaGtf } from "./Anexo04GtfSalida";
import Anexo04Cuadre from "./Anexo04Cuadre";
import Anexo04Comparar from "./Anexo04Comparar";
import Anexo04BloquesPapel from "./Anexo04BloquesPapel";
import CtpApartados, { CtpApartadoPanel, type Apartado } from "./ctp-apartados";
import { useAnexo04Comparar } from "./hooks/use-anexo04-comparar";
import { useTraseraDelPapel } from "./hooks/use-anexo04-trasera";
import { useAnexo04Vista } from "./hooks/use-anexo04-vista";
import Anexo04Filtros from "./Anexo04Filtros";
import Anexo04Variado from "./Anexo04Variado";
import { useAnexo04Variado } from "./hooks/use-anexo04-variado";
import Anexo04PorTipo from "./Anexo04PorTipo";
import Anexo04ConfirmarCuadre, { LineaCuadre } from "./Anexo04ConfirmarCuadre";
import { useCandadoCuadre } from "./hooks/use-candado-cuadre";
import { cuadreFrena, type CuadreDelPapel } from "@/lib/forestal/cuadre-del-papel";
import { traseraDelEmitido } from "@/lib/forestal/anexo04-registro";
import type { TraseraParaPdf } from "@/lib/forestal/anexo04-pdf";
import { formatNumber } from "@/lib/format";

const A4_PX = 794; // ancho de una hoja A4 a 96 dpi
/**
 * Hasta cuánto se agranda la hoja SOLA para llenar el panel. Era 1 (tamaño
 * real); con el modal casi a pantalla completa (2026-10-03, «más ancho para
 * que se vea») una hoja a 1:1 dejaba media columna vacía y la letra de 8 pt.
 */
const ESCALA_AUTO_MAX = 1.3;

/** Tira de dato de la cabecera: el mismo alto para que la fila se lea pareja. */
const CHIP_HEAD =
  "inline-flex h-7 items-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-xs text-[var(--text-secondary)]";

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
  rows, especieGlobal, onPdfDetallado, onCerrar, onAviso, ctpEntryId, declarado, abrirHistorial = false, despacho, procedencia, avisosExtra, rotuloDeLasPiezas, trasera,
  cuadre, onVerCuadre, piezasLote,
}: {
  /**
   * Las piezas del lote con la marca del Variado (`variadoPiezas`), antes de
   * repartir: con ellas la vista previa puede resaltar las medidas que vienen
   * de Varios aunque el reparto haya perdido la marca. Sólo pantalla.
   */
  piezasLote?: readonly PiezaCubicada[];
  /**
   * El cuadre de la distribución de la que salen estas piezas (Brandon,
   * 2026-10-03: «el cuadre como candado»). Con «difiere», una línea roja
   * arriba y descargar/imprimir piden confirmar; «redondeo» no frena. Sólo lo
   * pasa el reparto: las otras pantallas no lo dan y no cambian.
   */
  cuadre?: CuadreDelPapel | null;
  /** «Revisar el cuadre»: quien abre el anexo muestra su modal del cuadre. */
  onVerCuadre?: () => void;
  /**
   * La parte trasera del camión del lote (cubicador): el PDF la agrega como
   * última hoja, croquis + formato (Brandon, 2026-10-03). Sin trasera, el PDF
   * no cambia.
   */
  trasera?: TraseraParaPdf | null;
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
  /**
   * De qué bloques de la distribución salieron estas piezas (rolliza vs
   * madera ya aserrada). Sólo alimenta el CHECKLIST — el formato oficial no
   * cambia ni un casillero: es un aviso para quien firma, no un campo nuevo.
   */
  procedencia?: ProcedenciaBloques | null;
  /**
   * Lo que quien abre el anexo sabe y el anexo no (2026-09-23): desde los días
   * marcados, los paquetes que no tienen escuadría y por eso NO están en estas
   * hojas. Va al checklist, al final, como lo de la procedencia.
   */
  avisosExtra?: readonly AvisoAnexo04[];
  /** De dónde salen `rows` si no es el lote del cubicador («Días marcados: …»). */
  rotuloDeLasPiezas?: string;
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
  /** Qué se está mirando: el anexo, su comparación con el resumen o la guía con la que sale el camión. */
  const [docActivo, setDocActivo] = useState<"anexo" | "comparar" | "gtf">("anexo");
  const idPapeles = useId();
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
  /* Accesibilidad del diálogo: foco adentro, Tab atrapado y foco devuelto. El
     Escape ya lo maneja el efecto de abajo (hay un modal hijo que lo intercepta
     para no cerrar el anexo entero mientras se escriben las observaciones). */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { cerrarConEscape: false });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventana = useVentanaDeModal(true, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "ctp-anexo04",
  });

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
          "Si es el mismo viaje, ábrelo desde «Emitidos» en vez de emitir otro.",
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
    const medir = () => setFit(Math.min(ESCALA_AUTO_MAX, (el.clientWidth - 24) / A4_PX));
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

  /**
   * Filtro por dueño — cuando el origen trae piezas de MÁS DE UNO, permite
   * generar el anexo de un solo dueño a la vez en vez de mezclarlos en un
   * documento (pedido: aserrío por encargo, cada dueño se lleva su propio
   * ANEXO N° 04). "todos" = comportamiento de siempre, sin filtrar.
   *
   * Se resetea al cambiar de origen por el mismo motivo que `overrides`: un
   * nombre de dueño de OTRO conjunto de piezas no tiene por qué existir acá.
   */
  const duenosDisponibles = useMemo(
    () => [...new Set(filas.map((r) => r.dueno?.trim()).filter((d): d is string => !!d))],
    [filas],
  );
  const [duenoFiltro, setDuenoFiltro] = useState<string | "todos">("todos");
  useEffect(() => { setDuenoFiltro("todos"); }, [origen]);
  const filasPorDueno = useMemo(
    () => (duenoFiltro === "todos" ? filas : filas.filter((r) => (r.dueno?.trim() || "") === duenoFiltro)),
    [filas, duenoFiltro],
  );

  /**
   * Correcciones de "Editar medidas" (modo Excel de la hoja) — LOCALES a esta
   * sesión del anexo, por id de pieza. A propósito NO tocan el lote real
   * (`rows`) ni la cubicación guardada (`piezasGuardadas`): el anexo es una
   * declaración que se está preparando para imprimir, y este modal se abre
   * desde CUATRO lugares distintos (cubicador, Libro CTP, reparto…) — mutar
   * la fuente desde acá exigiría un callback distinto y confiable en cada
   * uno. Cambiar de origen (`origen`) descarta las correcciones: apuntan a
   * ids de OTRO conjunto de piezas y quedarían pegadas por error.
   */
  const [overrides, setOverrides] = useState<Record<string, Partial<Pick<PiezaCubicada, "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo">>>>({});
  useEffect(() => { setOverrides({}); }, [origen]);
  const filasEditadas = useMemo(() => {
    if (Object.keys(overrides).length === 0) return filasPorDueno;
    return filasPorDueno.map((r) => {
      const ov = overrides[r.id];
      if (!ov) return r;
      const upd = { ...r, ...ov };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    });
  }, [filasPorDueno, overrides]);
  /**
   * La celda edita en la UNIDAD que se ve impresa: E/A en pulgadas, L en
   * pies (la convención del anexo, `notaUnidad`) — sin esto, una pieza
   * cargada en cm quedaría con un espesor "8" interpretado en su unidad
   * vieja y el pie tablar saldría mal.
   */
  const onEditarCelda = useCallback((id: string, campo: CampoEditable, valor: number) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [campo]: valor,
        ...(campo === "espesor" ? { uEspesor: "pulg" as const } : {}),
        ...(campo === "ancho" ? { uAncho: "pulg" as const } : {}),
        ...(campo === "largo" ? { uLargo: "pies" as const } : {}),
      },
    }));
  }, []);

  /**
   * Filtro tipo × especie y formato de la cantidad (Brandon, 2026-10-03). De
   * acá para abajo TODO usa `filasPapel`: hoja, PDF, Excel, registro, cuadre,
   * checklist y comparación — un anexo filtrado es otro papel, no una vista.
   */
  const vista = useAnexo04Vista(filasEditadas, especie, origen);
  const { filasPapel } = vista;
  const variado = useAnexo04Variado(filasPapel, piezasLote, especie);
  const anexo = useMemo(
    () => construirAnexo04(filasPapel, { unidadV: datos.unidadV, modo: datos.modo }, { especieGlobal: especie, totalManualM3: totalManual }),
    [filasPapel, datos.unidadV, datos.modo, especie, totalManual],
  );
  const escala = Math.max(0.25, fit * factor);

  /* «Comparar con el resumen» (pestaña) y la trasera que viaja en el PDF. */
  const cmp = useAnexo04Comparar({
    rows, filasOrigen: filas, filasEditadas: filasPapel, dueno: duenoFiltro, unidadV: datos.unidadV, especieGlobal: especie,
    totalManualM3: totalManual, corregidas: Object.keys(overrides).length, otroOrigen: piezasGuardadas != null, rotuloDeLasPiezas,
    pasa: vista.filtrado ? vista.pasa : undefined, rotuloFiltro: vista.rotulo,
  });
  /* Con un emitido cargado desde la bandeja, SU trasera guardada (si la
     tiene): volver a bajarlo sin ella borraría el croquis del registro. */
  const traseraEmitido = useMemo(
    () => (origen.startsWith("emitido:") ? traseraDelEmitido(emitidos.find((e) => `emitido:${e.id}` === origen)) : null),
    [origen, emitidos],
  );
  const traseraPapel = useTraseraDelPapel(traseraEmitido ?? trasera, {
    origenActual: piezasGuardadas == null || traseraEmitido != null, dueno: duenoFiltro, correcciones: overrides, pasa: vista.filtrado ? vista.pasa : undefined,
  });
  const candado = useCandadoCuadre(cuadre);
  const papeles: Apartado[] = [
    { id: "anexo", label: "ANEXO N° 04", contador: `${anexo.hojas.length} hoja${anexo.hojas.length === 1 ? "" : "s"}` },
    { id: "comparar", label: "Comparar con el resumen", contador: cmp.pastilla, hint: "Por especie y tipo: el resumen contra lo que imprime la hoja" },
    ...(despacho?.gtfNumber ? [{ id: "gtf", label: `GTF ${despacho.gtfNumber}`, contador: "Original + 2 copias" }] : []),
  ];

  const { generando, descargarPdf, descargarExcel, descargarResumenPapel, reDescargar, pdfDeLote } = useAnexo04Salidas({
    filas: filasPapel, datos, especieGlobal: especie, ctpEntryId, totalManualM3: totalManual, trasera: traseraPapel, onAviso,
    onRegistrado: () => setHistorialToken((t) => t + 1),
  });
  // Checklist de emisión: lo que la ARFFS devuelve (errores) y lo que un
  // fiscalizador va a preguntar (avisos). No bloquea: la hoja en blanco para
  // llenar a mano es un uso legítimo del formato.
  const avisos = useMemo(
    () => [
      ...validarAnexo04(datos, anexo, filasPapel, { declarado: contraste, emitidos, ctpEntryId, ficha }),
      /* Al final: es lo que hay que MIRAR, no lo que impide presentar — los
         errores del formato siguen arriba, donde se leen primero. */
      ...avisosDeProcedencia(procedencia),
      ...(avisosExtra ?? []),
    ],
    [datos, anexo, filasPapel, contraste, emitidos, ctpEntryId, ficha, procedencia, avisosExtra],
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
    /* Y su (3) VOLUMEN TOTAL declarado, si el papel llevaba uno: cargar la
       emisión tiene que devolver el MISMO documento, casillero por casillero. */
    setTotalBuffer(a.totalManualM3 != null ? String(a.totalManualM3).replace(".", ",") : "");
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
      className="modal-backdrop fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-3"
      onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onCerrar(); }}
    >
      {/* Alto ACOTADO y scroll adentro (Brandon 2026-09-09: «está muy
          alargado»): antes el modal crecía con su contenido y el backdrop
          scrolleaba la página entera, así que el pie con «Descargar PDF»
          quedaba a dos pantallas del título. Ahora el marco entra siempre en la
          ventana, el pie está fijo y lo que scrollea es cada columna.
          Casi a pantalla completa (2026-10-03, «más ancho para que se vea»):
          con 76rem fijos, en 1920 sobraban 700 px a los costados. 110rem y no
          más: en 1920 el borde derecho queda en x=1840, justo donde empieza el
          botón flotante de acciones rápidas (z-50, igual que el modal). */}
      <div ref={cajaRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Vista previa del Anexo N° 04" className="relative flex max-h-[94vh] w-full max-w-[min(96vw,110rem)] flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]">
        <div {...ventana.asaProps} className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <FileText className="h-5 w-5 text-[var(--accent)]" /> Vista previa · ANEXO N° 04
              {duenoFiltro !== "todos" && (
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  Cubicación de {duenoFiltro}
                </span>
              )}
            </CardTitle>
            {/* La cabecera, en tiras: hojas · piezas · el volumen editable · lo
                que dice la guía. Era un párrafo corrido donde el input del
                volumen —lo único que se toca— se perdía entre el texto. */}
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <span className={CHIP_HEAD}>
                {anexo.hojas.length} hoja{anexo.hojas.length === 1 ? "" : "s"}
              </span>
              <span className={CHIP_HEAD}>{anexo.totalPiezas} piezas</span>
              <span className={CHIP_HEAD} title="Pie tablar exacto de todas las piezas de la hoja">
                {formatNumber(anexo.totalPt, { max: 2 })} PT
              </span>
              <span className={CHIP_HEAD} title="Bloques impresos (uno por especie y tipo, de a 35 renglones)">
                {anexo.hojas.reduce((a, h) => a + h.bloques.length, 0)} bloques
              </span>
              {traseraPapel && (
                <span className={`${CHIP_HEAD} gap-1`} title="El PDF lleva al final una hoja con el croquis y el formato de la parte trasera del camión">
                  <Truck className="h-3.5 w-3.5 text-[var(--data-8)]" aria-hidden />
                  + trasera · {traseraPapel.piezas.reduce((a, r) => a + r.cantidad, 0)} pzas
                </span>
              )}
              <label className={`${CHIP_HEAD} gap-1`}>
                <span className="font-bold uppercase tracking-wide text-[var(--text-tertiary)]">(3) Volumen</span>
                <input
                  value={totalBuffer}
                  onChange={(e) => setTotalBuffer(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder={fmtAnexo(anexo.totalCalculadoM3)}
                  aria-label="Volumen total del anexo, editable"
                  title={
                    totalManual == null
                      ? "Se calcula sumando las piezas. Escribe el tuyo para declarar otro (ajuste mínimo, las medidas de cada pieza no cambian)."
                      : `Declarado a mano: el cálculo desde las piezas da ${fmtAnexo(anexo.totalCalculadoM3)} m³. Las hojas se reparten para sumar EXACTO este número.`
                  }
                  className={`h-6 w-16 rounded-lg border-2 bg-[var(--surface-raised)] px-1 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${totalManual == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-secondary)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
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
              {/* La diferencia contra el cálculo ya no se dice acá: la banda de
                  abajo la dice CON qué medida moverla para cerrarla. */}
              {contraste && contraste.cantidad > 0 && (
                <span className={CHIP_HEAD}>
                  {contraste.fuente === "corrida" ? "corrida" : "guía"}:{" "}
                  <span className="ml-1 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {formatNumber(contraste.cantidad, { max: 3 })}
                  </span>
                  <span className="ml-1">{contraste.unidad === "m3" ? "m³" : contraste.unidad?.toUpperCase() ?? ""}</span>
                  {contraste.piezas ? <span className="ml-1">· {contraste.piezas} pzas</span> : null}
                </span>
              )}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {cuadre && cuadreFrena(cuadre) && (
          <div className="mt-3 shrink-0"><LineaCuadre cuadre={cuadre} onVerCuadre={onVerCuadre} /></div>
        )}

        {/* «Me pasé por 0,003 m³»: qué medida mover y hasta cuánto. Va pegado
            al volumen porque es la respuesta a lo que se acaba de tipear. */}
        {totalManual != null && filasPapel.length > 0 && (
          <div className="mt-3 shrink-0">
            {vista.editable ? (
              <Anexo04Cuadre filas={filasPapel} objetivoM3={totalManual} onAplicar={onEditarCelda} />
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">Para ver qué medida mover y cerrar el volumen, vuelve a «Como se cargó».</p>
            )}
          </div>
        )}

        {/* En monitores anchos, una tercera columna con lo que lleva el papel
            (sólo con la hoja a la vista: la comparación usa todo el ancho). */}
        <div className={`mt-3 grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[19rem_1fr] lg:overflow-hidden xl:grid-cols-[21rem_1fr] ${docActivo === "anexo" ? "2xl:grid-cols-[22rem_1fr_19rem]" : "2xl:grid-cols-[22rem_1fr]"}`}>
          {/* Datos del formato */}
          <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <Anexo04Campos datos={datos} onChange={set} ficha={ficha} onError={(msg) => onAviso?.(msg, "error")} anexo={anexo} />
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
          <div ref={areaRef} className="min-w-0 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            {/* El anexo, su comparación con el resumen (Brandon, 2026-10-03) y
                la guía con que sale el camión. La guía sólo se ofrece si el
                despacho ya tiene número: sin GTF emitida no hay guía que mirar,
                y una pestaña que abre un papel vacío hace pensar que se perdió
                algo. */}
            <div className="mb-3">
              <CtpApartados
                apartados={papeles}
                activo={docActivo}
                onIr={(id) => setDocActivo(id as typeof docActivo)}
                idBase={idPapeles}
                etiqueta="Qué mirar del anexo"
              />
            </div>

            <CtpApartadoPanel idBase={idPapeles} id={docActivo}>
            {docActivo === "comparar" && (
              <Anexo04Comparar comparacion={cmp.comparacion} rotuloResumen={cmp.rotulo} contexto={cmp.contexto} />
            )}
            {docActivo === "gtf" && despacho ? (
              <Anexo04GtfSalida despacho={despacho} ficha={ficha} onHtml={setGtfHtml} />
            ) : (
            /* Con la comparación a la vista la hoja sigue montada (oculta):
               «Imprimir» imprime sus hojas y «Editar medidas» no se pierde. */
            <div className={docActivo === "comparar" ? "hidden" : undefined}>
            <Anexo04Preview
              ref={hojasRef}
              anexo={anexo}
              datos={datos}
              escala={escala}
              onZoom={(paso) => setFactor((f) => Math.min(3, Math.max(0.5, f + paso)))}
              origen={
                <Anexo04Origen
                  piezasActuales={rows.length}
                  rotuloActual={rotuloDeLasPiezas}
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
              duenoSelector={
                duenosDisponibles.length > 1 ? (
                  <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setDuenoFiltro("todos")}
                      aria-pressed={duenoFiltro === "todos"}
                      className={`h-7 rounded-lg px-2 text-xs font-bold transition ${duenoFiltro === "todos" ? "bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                    >
                      Todos
                    </button>
                    {duenosDisponibles.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuenoFiltro(d)}
                        aria-pressed={duenoFiltro === d}
                        title={`Ver sólo la cubicación de ${d}`}
                        className={`h-7 rounded-lg px-2 text-xs font-bold transition ${duenoFiltro === d ? "bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
              checklist={<Anexo04Checklist avisos={avisos} presentable={presentable} onSugerencia={(campo, valor) => set({ [campo]: valor })} />}
              filtros={filas.length > 0 ? <Anexo04Filtros vista={vista} piezasPapel={anexo.totalPiezas} /> : undefined}
              variadoControl={variado.hay ? <Anexo04Variado variado={variado} /> : undefined}
              marcasVariado={variado.marcas}
              onEditarCelda={onEditarCelda}
              bloqueoEdicion={vista.editable ? undefined : "Para editar medidas, vuelve a «Como se cargó»"}
            />
            </div>
            )}
            </CtpApartadoPanel>
          </div>

          {docActivo === "anexo" && (
            <aside className="hidden 2xl:block 2xl:min-h-0 2xl:overflow-y-auto 2xl:pr-1" aria-label="Lo que lleva el papel">
              <Anexo04BloquesPapel anexo={anexo} />
            </aside>
          )}
        </div>

        <div className="shrink-0">
          <Anexo04Acciones
            presentable={presentable}
            generando={generando}
            onPdfDetallado={onPdfDetallado}
            onExcel={descargarExcel}
            onResumenPapel={descargarResumenPapel}
            onImprimir={candado.conCandado(imprimir)}
            onDescargar={candado.conCandado(descargarPdf)}
            extra={
              <Anexo04PorTipo
                filas={filasPapel} especieGlobal={especie} datos={datos} trasera={traseraPapel}
                totalManual={totalManual} conCandado={candado.conCandado} onAviso={onAviso}
              />
            }
          />
        </div>

        <TiradorDeVentana ventana={ventana} />
      </div>
      {/* Hermano de la caja, no hijo: la caja se mueve con transform. */}
      {candado.pidiendo && cuadre && (
        <Anexo04ConfirmarCuadre
          cuadre={cuadre}
          onConfirmar={candado.confirmar}
          onCancelar={candado.cancelar}
          onVerCuadre={onVerCuadre ? () => { candado.cancelar(); onVerCuadre(); } : undefined}
        />
      )}
    </div>
  );
}
