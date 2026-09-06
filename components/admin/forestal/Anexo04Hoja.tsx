"use client";

/**
 * Anexo04Hoja — dibuja UNA hoja del ANEXO N° 04 (SERFOR) en HTML, con la misma
 * geometría en pt que usa el PDF (`geometriaHoja`), convertida a px (72pt = 96px).
 * Es papel, no UI: por eso vive fuera del design system (blanco, negro y el verde
 * del formato oficial) y se estiliza con un CSS propio en vez de tokens — lo que
 * se ve acá es exactamente lo que se descarga.
 */
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  geometriaHoja, fmtAnexo, fmtMedida, notaUnidad,
  BLOQUES_POR_HOJA, FUENTES, HEAD_COLS, PAGINA, TEXTO_LEGAL, ETIQUETAS_FIRMA, aPx,
  type Anexo04, type DatosAnexo04, type HojaAnexo04,
} from "@/lib/forestal/anexo04-serfor";

/** pt → px (una hoja A4 mide 794 × 1123 px a 96 dpi). */
const PX = 96 / 72;
const px = (v: number) => `${v * PX}px`;
const caja = (x: number, y: number, w: number, h: number): CSSProperties => ({
  position: "absolute", left: px(x), top: px(y), width: px(w), height: px(h),
});

export const ANEXO04_CSS = `
.anx-hoja { position: relative; background: #fff; color: #000; font-family: Helvetica, Arial, sans-serif; overflow: hidden; }
.anx-hoja * { box-sizing: border-box; }
.anx-b { border: 0.5px solid #000; }
.anx-verde { background: #e2efd9; }
.anx-banner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
.anx-banner b { font-size: ${aPx(FUENTES.banner)}px; }
.anx-banner i { font-style: normal; font-weight: 700; font-size: ${aPx(FUENTES.bannerTitulo)}px; }
.anx-instr { display: flex; align-items: center; padding-left: 3px; font-size: ${aPx(FUENTES.instrucciones)}px; }
.anx-logo { object-fit: contain; object-position: center; }
.anx-empresa { display: flex; align-items: center; font-size: ${aPx(FUENTES.empresa)}px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.anx-titulo { display: flex; align-items: center; justify-content: center; font-size: ${aPx(FUENTES.titulo)}px; font-weight: 700; }
.anx-campos { font-size: ${aPx(FUENTES.campos)}px; line-height: 20px; text-align: right; }
.anx-campos b { font-weight: 700; }
.anx-campos span { font-weight: 400; }
.anx-bh { font-size: ${aPx(FUENTES.bloqueHead)}px; line-height: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.anx-bh div { overflow: hidden; text-overflow: ellipsis; }
.anx-bh b { font-weight: 700; }
.anx-fila { display: flex; }
.anx-cell { display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: ${aPx(FUENTES.celda)}px; line-height: 1; }
.anx-cell.r { justify-content: flex-end; padding-right: 2px; }
/* Modo edición (Excel-like): celda editable resaltada en amarillo tenue para
   que se note dónde se puede tocar; foco en celeste, como una hoja de cálculo. */
.anx-cell.ed { background: #fffbdd; cursor: text; }
.anx-input { width: 100%; height: 100%; border: 0; background: transparent; padding: 0; margin: 0; text-align: center; font: inherit; color: inherit; outline: none; }
.anx-input:focus { background: #cfe8ff; }
.anx-head .anx-cell { font-size: ${aPx(FUENTES.tablaHead)}px; font-weight: 700; }
.anx-sub { display: flex; align-items: stretch; }
.anx-sub-lbl { display: flex; align-items: center; justify-content: flex-end; padding-right: 3px; font-size: ${aPx(FUENTES.subtotalLabel)}px; font-weight: 700; }
.anx-sub-val { display: flex; align-items: center; justify-content: flex-end; padding-right: 2px; border: 0.8px solid #000; font-size: ${aPx(FUENTES.subtotalValor)}px; font-weight: 700; }
.anx-obs { padding: 4px 5px; font-size: ${aPx(FUENTES.observaciones)}px; }
.anx-obs b { font-weight: 700; }
.anx-obs p { margin: 4px 0 0; width: 52%; white-space: pre-wrap; font-size: ${aPx(FUENTES.observaciones)}px; line-height: 1.25; }
.anx-firma { text-align: right; font-size: ${aPx(FUENTES.firma)}px; }
.anx-firma-linea { border-top: 1px dotted #000; }
.anx-firma-lbl { font-size: ${aPx(FUENTES.firmaLabel)}px; font-weight: 700; }
.anx-legal { font-size: ${aPx(FUENTES.legal)}px; line-height: 1.35; color: #3c3c3c; }
.anx-nota { font-size: ${aPx(FUENTES.nota)}px; color: #787878; display: flex; justify-content: space-between; }
`;

/** Campos de una fila que se pueden corregir a mano en modo edición. */
export type CampoEditable = "cantidad" | "espesor" | "ancho" | "largo";

/**
 * Input de una celda del anexo en modo edición — buffer de texto LOCAL, igual
 * que `Num` en CubicadorMadera.tsx: con el valor atado directo al número de
 * la fila, borrar para retipear hacía que el campo VOLVIERA solo al valor
 * viejo a mitad de tecleo. Recién sincroniza con el valor de afuera al perder
 * el foco.
 */
function CeldaEditable({ valor, onCommit }: { valor: number; onCommit: (n: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(String(valor)); }, [valor]);

  /**
   * El commit va DEMORADO, no por tecla.
   *
   * Escribir "125" confirmaba tres veces —1, 12, 125— y cada confirmación
   * reconstruye el anexo entero: `construirAnexo04` sobre todas las filas, las
   * tres hojas y sus ~840 celdas cada una. Además de la lentitud, el que mira
   * la hoja ve totales calculados con "1" mientras el otro todavía tipea.
   *
   * Se mantiene la promesa del cartel («los totales se recalculan solos»): sigue
   * siendo en vivo, sólo que cuando la mano para. Y salir del campo o apretar
   * Enter confirma en el acto, sin esperar el timer: nadie tiene que adivinar
   * si su último dígito entró.
   */
  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelar = () => { if (pendiente.current) { clearTimeout(pendiente.current); pendiente.current = null; } };
  useEffect(() => cancelar, []);

  const confirmar = (crudo: string) => {
    cancelar();
    const n = Number(crudo);
    if (crudo !== "" && Number.isFinite(n) && n > 0) onCommit(n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      onFocus={(e) => { enfocado.current = true; e.currentTarget.select(); }}
      onBlur={(e) => {
        enfocado.current = false;
        /* Confirmar ANTES de resincronizar: si no, el último valor tipeado se
           pierde en silencio cuando el timer todavía no corrió. */
        confirmar(e.currentTarget.value.replace(/[^\d.,]/g, "").replace(",", "."));
        setTexto(String(valor));
      }}
      /* Enter confirma y sale, como en una planilla. Escape NO se toca: en este
         modal ya significa «cerrar», y probándolo en el navegador cerró el
         anexo Y el cubicador debajo, con todo lo cargado adentro. Revertir una
         celda vale mucho menos que perder la hoja entera; para eso se retipea
         el valor, que es lo que se hacía antes. */
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      }}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
        setTexto(limpio);
        cancelar();
        pendiente.current = setTimeout(() => confirmar(limpio), MS_COMMIT_CELDA);
      }}
      className="anx-input"
    />
  );
}

/**
 * Cuánto se espera después de la última tecla para recalcular el anexo.
 *
 * 350 ms: por encima de la pausa entre dígitos de alguien tipeando corrido
 * (~150 ms) y por debajo de lo que se siente como demora.
 */
const MS_COMMIT_CELDA = 350;

/**
 * Los 4 bloques con sus 35 filas: ~840 celdas por hoja. Va MEMOIZADO y aparte
 * de la cabecera porque sólo depende de la hoja — sin esto, tipear la razón
 * social re-renderizaba toda la grilla y el input se sentía pegajoso (~100ms
 * por tecla con 3 hojas). `editando`/`onEditarCelda` entran como props más:
 * al tocar una medida, `hoja` cambia de referencia (el total se recalcula) y
 * ACÁ SÍ conviene re-renderizar — es la corrección que se está mirando.
 */
const Bloques = memo(function Bloques({ hoja, compacto, editando, onEditarCelda }: {
  hoja: HojaAnexo04; compacto: boolean; editando: boolean;
  onEditarCelda?: (id: string, campo: CampoEditable, valor: number) => void;
}) {
  const g = geometriaHoja(hoja.filasPorBloque);
  const wLabel = g.cols.slice(0, 5).reduce((a, c) => a + c, 0);
  return (
    <>
      {Array.from({ length: BLOQUES_POR_HOJA }).map((_, i) => {
        const b = hoja.bloques[i];
        if (!b && compacto) return null;
        const x0 = g.xBloque(i);
        return (
          <div key={i}>
            <div className="anx-bh" style={caja(x0 + 2, g.yBloqueHead + 2, g.bloqueW - 4, g.hBloqueHead)}>
              <div><b>(4) Especie: {b?.especie ?? ""}</b></div>
              <div>(5) Tipo de producto: {b ? `${b.tipo}${b.continuacion ? " (cont.)" : ""}` : ""}</div>
            </div>
            <div className="anx-fila anx-head" style={caja(x0, g.yTblHead, g.bloqueW, g.hTblHead)}>
              {HEAD_COLS.map((h, j) => (
                <div key={j} className="anx-b anx-cell" style={{ width: px(g.cols[j]) }}>{h}</div>
              ))}
            </div>
            {Array.from({ length: hoja.filasPorBloque }).map((_, f) => {
              const fila = b?.filas[f];
              // Cant./E/A/L son editables (columnas 1 a 4); N° y V (0 y 5) no
              // — V es SIEMPRE derivado, nunca se escribe directo.
              const columnas: { campo: CampoEditable | null; valor: number | null; texto: string }[] = [
                { campo: null, valor: null, texto: String(f + 1) },
                { campo: "cantidad", valor: fila?.cantidad ?? null, texto: fila ? String(fila.cantidad) : "" },
                { campo: "espesor", valor: fila?.e ?? null, texto: fila ? fmtMedida(fila.e) : "" },
                { campo: "ancho", valor: fila?.a ?? null, texto: fila ? fmtMedida(fila.a) : "" },
                { campo: "largo", valor: fila?.l ?? null, texto: fila ? fmtMedida(fila.l) : "" },
                { campo: null, valor: null, texto: fmtAnexo(fila ? fila.v : 0) },
              ];
              return (
                <div key={f} className="anx-fila" style={caja(x0, g.yFilas + f * g.hFila, g.bloqueW, g.hFila)}>
                  {columnas.map(({ campo, valor, texto }, j) => {
                    const editable = editando && fila && campo && valor != null && onEditarCelda;
                    return (
                      <div key={j} className={`anx-b anx-cell${j === 5 ? " r" : ""}${editable ? " ed" : ""}`} style={{ width: px(g.cols[j]) }}>
                        {editable
                          ? <CeldaEditable valor={valor} onCommit={(n) => onEditarCelda(fila!.id, campo, campo === "cantidad" ? Math.round(n) : n)} />
                          : texto}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="anx-sub" style={caja(x0, g.ySub, g.bloqueW, g.hSub)}>
              <div className="anx-sub-lbl" style={{ width: px(wLabel) }}>(11) SUB TOTAL</div>
              <div className="anx-sub-val" style={{ width: px(g.cols[5]) }}>{fmtAnexo(b?.subtotal ?? 0)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
});

export default function Anexo04Hoja({
  hoja, datos, anexo, nro, total, editando = false, onEditarCelda,
}: {
  hoja: HojaAnexo04;
  datos: DatosAnexo04;
  anexo: Anexo04;
  nro: number;
  total: number;
  /** Modo edición: Cant./E/A/L se vuelven celdas tocables, estilo Excel. */
  editando?: boolean;
  onEditarCelda?: (id: string, campo: CampoEditable, valor: number) => void;
}) {
  const g = geometriaHoja(hoja.filasPorBloque);
  const m = PAGINA.margen;
  const xFirma = m + g.contentW - 218;
  const valores = ["", datos.firmante, datos.documento, datos.cargo];

  return (
    <div className="anx-hoja" style={{ width: px(PAGINA.w), height: px(PAGINA.h) }}>
      {/* Banner del anexo + instrucciones */}
      <div className="anx-b anx-verde anx-banner" style={caja(m, g.yBanner, g.contentW, g.hBanner)}>
        <b>ANEXO N° 04</b>
        <i>&quot;LISTA DE PRODUCTOS TRANSFORMADOS&quot;</i>
      </div>
      <div className="anx-b anx-verde anx-instr" style={caja(m, g.yInstr, g.contentW, g.hInstr)}>
        Para el llenado del presente Anexo se utilizarán las instrucciones adjuntas.
      </div>

      {/* Logo · emisor · título · datos (1)(2)(3) */}
      {datos.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- dataURL local del tenant, no pasa por el optimizador
        <img src={datos.logo} alt="" className="anx-logo" style={caja(g.logoBox.x, g.logoBox.y, g.logoBox.w, g.logoBox.h)} />
      )}
      <div className="anx-empresa" style={caja(g.xEmpresa(Boolean(datos.logo)), g.yInfo + 8, g.wEmpresa(Boolean(datos.logo)), 20)}>{datos.empresa.toUpperCase()}</div>
      <div className="anx-titulo" style={caja(m + 150, g.yInfo + 6, g.contentW - 340, 20)}>LISTA DE PRODUCTOS TRANSFORMADOS</div>
      <div className="anx-campos" style={caja(m + g.contentW - 210, g.yInfo + 8, 210, 52)}>
        <div><b>(1) N°:</b> <span>{datos.numero || "…………………"}</span></div>
        <div><b>(2) GTF N°:</b> <span>{datos.gtf || "…………………"}</span></div>
        {/* El volumen de ESTA hoja, no el del anexo: cada hoja se muestra sola
            en un puesto de control y no puede amparar lo que lleva otra. */}
        <div><b>(3) VOLUMEN TOTAL:</b> <span>{fmtAnexo(hoja.totalM3)} m³</span></div>
      </div>

      {/* Los 4 bloques (especie × tipo, sin mezclar) */}
      <Bloques hoja={hoja} compacto={datos.modo === "compacto"} editando={editando} onEditarCelda={onEditarCelda} />

      {/* (12) Observaciones + firmas (13)-(16) */}
      <div className="anx-b anx-obs" style={caja(m, g.yObs, g.contentW, g.hObs)}>
        <b>(12) OBSERVACIONES:</b>
        <p>{datos.observaciones}</p>
      </div>
      {datos.sello && (
        // eslint-disable-next-line @next/next/no-img-element -- dataURL local del tenant
        <img src={datos.sello} alt="" className="anx-logo" style={caja(g.selloBox.x, g.selloBox.y, g.selloBox.w, g.selloBox.h)} />
      )}
      {datos.firma && (
        // eslint-disable-next-line @next/next/no-img-element -- dataURL local del tenant
        <img src={datos.firma} alt="" className="anx-logo" style={caja(g.firmaBox.x, g.firmaBox.y, g.firmaBox.w, g.firmaBox.h)} />
      )}
      {ETIQUETAS_FIRMA.map((lbl, i) => (
        <div key={lbl} className="anx-firma" style={caja(xFirma, g.yFirmas[i] - 12, 210, 26)}>
          <div style={{ height: px(11) }}>{valores[i]}</div>
          <div className="anx-firma-linea" />
          <div className="anx-firma-lbl">{lbl}</div>
        </div>
      ))}

      {/* Legal de la GTF + nota de unidades */}
      <div className="anx-legal" style={caja(m, g.yLegal - 7, g.contentW, 26)}>
        <div>{TEXTO_LEGAL[0]}</div>
        <div>{TEXTO_LEGAL[1]}</div>
      </div>
      <div className="anx-nota" style={caja(m, g.yLegal + 18, g.contentW, 12)}>
        <span>{notaUnidad(anexo.unidadV)}</span>
        {/* Con más de una hoja, el total del anexo va al pie: el (3) es el de
            esta hoja y el lector tiene que poder ver de qué conjunto es parte. */}
        <span>
          {total > 1 ? `Anexo completo: ${fmtAnexo(anexo.totalM3)} m³ · ` : ""}Hoja {nro} de {total}
        </span>
      </div>
    </div>
  );
}
