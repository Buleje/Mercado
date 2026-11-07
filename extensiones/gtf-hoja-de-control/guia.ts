/**
 * Pieza `gtf-hoja-de-control` — la hoja (enchufe `forestal.guia-impresa`).
 *
 * Arma una hoja más, DESPUÉS de las tres copias oficiales de la GTF. Toma lo
 * que la guía ya declara (producto, cantidad, piezas, vehículo, conductor,
 * destinatario) y le pone al lado un casillero en blanco para lo que se vio al
 * cargar: el control del patio es comparar, no volver a copiar.
 *
 * Todo texto que sale de datos pasa por `esc()` (o por los armadores del
 * documento, que escapan). La hoja se marca como interna en el sello: un papel
 * que no dice lo que NO es termina presentándose como si lo fuera.
 */
import {
  esc,
  firmasDoc,
  seccionDoc,
  selloDoc,
  tituloDoc,
} from "@/lib/forestal/ctp-documento-print";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { DocGuiaImpresa, PiezaGuia } from "../_contrato";
import type { OpcionesHojaDeControl } from "./manifest";

/**
 * Cantidad con la unidad, escrita IGUAL que en las copias oficiales
 * (`ctp-gtf-print`: m³ con `fmtM3`, el resto con 4 decimales): la hoja se
 * compara contra la guía y dos formatos del mismo número confunden.
 */
function cantidad(doc: DocGuiaImpresa): string {
  const q = Number(doc.despacho.quantity ?? NaN);
  if (!Number.isFinite(q)) return "";
  const unidad = doc.despacho.unitLabel;
  return `${unidad === "m³" ? fmtM3(q) : q.toFixed(4)} ${unidad}`;
}

function producto(doc: DocGuiaImpresa): string {
  // Una guía de varios productos (ADR-362) se resume por línea; si no, el despacho.
  if (doc.lineas.length > 1) {
    return doc.lineas.map((l) => [l.comun, l.tipoProducto].filter(Boolean).join(" · ")).join(" / ");
  }
  return [doc.despacho.speciesCommon, doc.despacho.speciesScientific ? `(${doc.despacho.speciesScientific})` : "", doc.despacho.productType]
    .filter(Boolean)
    .join(" ");
}

function vehiculo(doc: DocGuiaImpresa): string {
  const v = doc.datos.vehiculo;
  return [v.placa, v.placaRemolque ? `remolque ${v.placaRemolque}` : "", v.embarcacion].filter(Boolean).join(" · ");
}

function conductor(doc: DocGuiaImpresa): string {
  const v = doc.datos.vehiculo;
  return [v.conductor, v.conductorDni ? `DNI ${v.conductorDni}` : "", v.licencia ? `brevete ${v.licencia}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Un renglón: lo que dice la guía + el casillero de lo que se vio + el visto. */
function renglon(que: string, dice: string): string {
  return `<tr><th>${esc(que)}</th><td class="hc-dice">${dice ? esc(dice) : "—"}</td><td class="hc-visto"></td><td class="hc-ok"><i></i></td></tr>`;
}

export function hojaDeControl(doc: DocGuiaImpresa, o: OpcionesHojaDeControl): string {
  const renglones = [
    renglon("Producto", producto(doc)),
    renglon("Cantidad", cantidad(doc)),
    renglon("Piezas", doc.despacho.pieces != null ? String(doc.despacho.pieces) : ""),
    renglon("Destinatario", doc.datos.destinatario.nombre || doc.despacho.destino || ""),
    renglon("Vehículo", vehiculo(doc)),
    renglon("Conductor", conductor(doc)),
    renglon("Transportista", doc.datos.transportista.nombre),
  ].join("");

  const origen =
    o.mostrarOrigen && doc.guiasDeIngreso.length
      ? `${seccionDoc("Origen de la madera", "GTF de ingreso")}
         <p class="hc-origen">${doc.guiasDeIngreso.map(esc).join(" · ")}</p>`
      : "";

  const verificaciones = o.verificaciones.length
    ? `${seccionDoc("Antes de salir")}
       <ul class="hc-checks">${o.verificaciones.map((v) => `<li><i></i>${esc(v)}</li>`).join("")}</ul>`
    : "";

  return `
    ${selloDoc("Uso interno", "No forma parte de la guía oficial · no se entrega en puestos de control", "verde")}
    ${tituloDoc(o.titulo, `GTF ${doc.numeroGtf} · despacho línea #${doc.despacho.lineNo} · emitida ${doc.emitida.fecha} ${doc.emitida.hora}`)}
    <p class="hc-emisor">${esc([doc.ficha.nombreCtp || doc.ficha.razonSocial, doc.ficha.ruc ? `RUC ${doc.ficha.ruc}` : ""].filter(Boolean).join(" · "))}</p>

    ${seccionDoc("Lo que dice la guía y lo que se cargó")}
    <table class="hc-tabla">
      <thead><tr><th>Dato</th><th>Dice la guía</th><th>Se vio al cargar</th><th class="hc-ok">✓</th></tr></thead>
      <tbody>${renglones}</tbody>
    </table>

    ${origen}
    ${verificaciones}

    <div class="hc-salida"><span>Hora de salida</span><i></i><span>Kilometraje / precinto</span><i></i></div>
    ${o.nota ? `<p class="hc-nota">${esc(o.nota)}</p>` : ""}
    ${firmasDoc(o.firmas)}`;
}

/** Va dentro de `@scope (.pz-gtf-hoja-de-control)`: no alcanza a las copias oficiales. */
export const CSS_HOJA_DE_CONTROL = `
  .hc-emisor { font-size:7.4pt; color:var(--gris); margin:0 0 2mm; }
  .hc-tabla { width:100%; border-collapse:collapse; margin:0 0 3mm; }
  .hc-tabla th, .hc-tabla td { border:.5pt solid var(--linea-suave); padding:1.8mm 1.6mm; font-size:8pt; text-align:left; vertical-align:top; }
  .hc-tabla thead th { background:var(--tenue); font-size:6.8pt; letter-spacing:.3pt; text-transform:uppercase; }
  .hc-tabla tbody th { width:24mm; font-weight:bold; color:var(--gris); }
  .hc-tabla .hc-dice { width:62mm; }
  .hc-tabla .hc-visto { min-height:7mm; }
  .hc-tabla .hc-ok { width:9mm; text-align:center; }
  .hc-tabla td.hc-ok i, .hc-checks i { display:inline-block; width:3.6mm; height:3.6mm; border:.8pt solid var(--tinta); }
  .hc-origen { font-family:"Courier New",Courier,monospace; font-size:7.6pt; margin:0 0 3mm; }
  .hc-checks { list-style:none; padding:0; margin:0 0 3mm; }
  .hc-checks li { display:flex; align-items:center; gap:2.4mm; font-size:8pt; padding:1.2mm 0; border-bottom:.5pt dotted var(--linea-suave); }
  .hc-checks li i { flex:none; }
  .hc-salida { display:flex; align-items:flex-end; gap:3mm; margin:2mm 0 4mm; font-size:7pt; color:var(--gris);
               text-transform:uppercase; letter-spacing:.4pt; }
  .hc-salida i { flex:1; border-bottom:.6pt solid var(--tinta); height:6mm; }
  .hc-nota { font-size:7.6pt; border-left:2pt solid var(--tinta); padding:1mm 2.4mm; margin:0 0 4mm; }
`;

export const pieza: PiezaGuia<OpcionesHojaDeControl> = {
  agregar(_ctx, opciones, doc) {
    return {
      hojasExtra: [hojaDeControl(doc, opciones)],
      cssExtra: CSS_HOJA_DE_CONTROL,
    };
  },
};
