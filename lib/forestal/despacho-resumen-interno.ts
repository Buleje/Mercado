/**
 * despacho-resumen-interno — el «Resumen interno» de una GTF de SALIDA del CTP
 * (Brandon 27-10: «las funciones parecidas a las del Libro TH … para la madera
 * que sale, sea aserrada o directa en trozas»). Es la hoja de gestión que
 * acompaña a la guía: qué salió por especie y producto, de qué corridas y
 * guías de ingreso viene (cadena), qué trozas salieron sin aserrar, con qué
 * permiso, si el Anexo 04 ya se emitió y el plazo de registro.
 *
 * No calcula nada propio: las filas son las de la guía (`filasDeLaGuia`), el
 * total es el del (34h) (`volumenTotalDeLaGuia`), el plazo es `venceElRegistro`
 * / `estaFueraDePlazo` (2 días hábiles, RDE D000025-2023) y la cadena llega
 * armada por el servidor. Lo que la cadena no cubre se dice «sin atribuir»
 * (≤, nunca se fuerza: forzar la atribución fabrica el fraude que previene).
 * PURO y client-safe; el estilo es el del resumen del Libro TH (`CSS_RESUMEN`).
 */

import { TOLERANCIA_ATRIBUCION } from "./atribucion-despacho";
import { estaFueraDePlazo } from "./ctp-compliance";
import { cabeceraDoc, documentoHtml, esc, notaDoc, resumenDoc, seccionDoc, tituloDoc, type FichaResumen } from "./ctp-documento-print";
import { filasDeLaGuia, volumenTotalDeLaGuia } from "./ctp-gtf-formato";
import { fmtM3 } from "./cubicacion-formato";
import { CSS_RESUMEN, type HojaResumenInterno } from "./gtf-resumen-interno-print";
import { guiasDeOrigen, type GuiaSalidaImprimible } from "./guia-salida-imprimible";
import { diaDeVencimiento, venceElRegistro } from "./salidas-por-registrar";
import { limaDateKey } from "@/lib/utils";

export interface ExtraResumenSalida {
  /** El Anexo 04 de esta guía ya se emitió. */
  anexo04: boolean;
  /** Cuándo se registró la línea en el Libro (ISO). Sin él sólo se dice hasta cuándo había plazo. */
  createdAt?: string | null;
  /** Motivo de la anulación ("" si no se escribió); `null` = vigente. */
  anulada?: string | null;
  /** `limaDateKey()`: para decir «vence hoy» o «venció». */
  hoy: string;
}

export interface PlazoSalida {
  venceEl: string;
  /** `true` = se registró (o se registraría hoy) después de `venceEl`. */
  fuera: boolean;
  texto: string;
}

const dia = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const cm = (m: number | null): string => (m == null ? "—" : (m * 100).toFixed(1));
const met = (v: number | null): string => (v == null ? "—" : v.toFixed(2));
const m3 = (v: number | null): string => (v == null ? "—" : fmtM3(v));

/** El plazo de registro de la salida, con el mismo predicado del badge, el panel y el Excel. */
export function plazoDeLaSalida(fecha: string, createdAt: string | null | undefined, hoy: string): PlazoSalida {
  const venceEl = venceElRegistro(fecha);
  const vence = diaDeVencimiento(venceEl);
  if (createdAt) {
    const fuera = estaFueraDePlazo({ entryDate: fecha, createdAt });
    return { venceEl, fuera, texto: `${fuera ? "Registrada fuera de plazo" : "Registrada en plazo"} el ${dia(limaDateKey(createdAt))} (vencía el ${vence})` };
  }
  const fuera = venceEl < hoy;
  return { venceEl, fuera, texto: fuera ? `Venció el ${vence}` : venceEl === hoy ? "Vence hoy" : `Vence el ${vence}` };
}

/** Lo que la cadena no cubre: total de la guía − Σ cadena, sólo si hay una sola unidad y pasa la tolerancia. */
export function sinAtribuirDeLaGuia(guia: Pick<GuiaSalidaImprimible, "lineas" | "cadena">): number | null {
  const unidades = new Set(guia.lineas.map((l) => l.unidad));
  if (unidades.size !== 1) return null;
  const atribuido = guia.cadena.corridas.reduce((a, c) => a + (Number(c.quantity) || 0), 0);
  const resto = volumenTotalDeLaGuia(guia.lineas) - atribuido;
  return resto > TOLERANCIA_ATRIBUCION ? Math.round(resto * 1000) / 1000 : 0;
}

/** La hoja «Resumen interno» de la guía de salida, lista para el visor. */
export function hojaResumenInternoDespacho(guia: GuiaSalidaImprimible, extra: ExtraResumenSalida): HojaResumenInterno {
  const numero = guia.gtfNumber;
  const filas = filasDeLaGuia(guia.lineas);
  const unidad = filas[0]?.unidad ?? "m³";
  const unaUnidad = new Set(filas.map((f) => f.unidad)).size <= 1;
  const total = volumenTotalDeLaGuia(guia.lineas);
  const piezas = filas.reduce((a, f) => a + (Number(f.cantidad) || 0), 0);
  const sinAtribuir = sinAtribuirDeLaGuia(guia);
  const plazo = plazoDeLaSalida(guia.fecha, extra.createdAt, extra.hoy);
  const anulada = extra.anulada != null || guia.anulada ? (extra.anulada ?? "").trim() || "La guía se anuló en el libro" : null;
  const permisos = guia.datos.titulos.map((t) => t.trim()).filter(Boolean);
  const destino = guia.datos.destinatario?.nombre?.trim() || null;

  const fichas: FichaResumen[] = [
    { k: "Productos", v: String(filas.length) },
    { k: "Volumen", v: unaUnidad ? fmtM3(total) : "Varias unidades", u: unaUnidad ? unidad : undefined },
    { k: "Piezas", v: String(piezas) },
    { k: "Trozas sin aserrar", v: String(guia.trozas.length) },
    { k: "Anexo 04", v: extra.anexo04 ? "Emitido" : "Falta", tono: extra.anexo04 ? "ok" : "aviso" },
    { k: "Plazo de registro", v: plazo.fuera ? "Fuera de plazo" : "En plazo", tono: plazo.fuera ? "mal" : "ok" },
    ...(sinAtribuir ? [{ k: "Sin atribuir", v: fmtM3(sinAtribuir), u: unidad, tono: "aviso" as const }] : []),
  ];

  const productos = `<table class="ri"><thead><tr><th>Especie</th><th>Producto</th><th class="r">Piezas</th><th class="r">Cantidad</th><th>Unidad</th></tr></thead><tbody>
    ${filas
      .map(
        (f) =>
          `<tr><td>${esc(f.comun || "—")}${f.cientifico ? ` <i>${esc(f.cientifico)}</i>` : ""}</td><td>${esc(f.tipoProducto || "—")}</td><td class="r">${f.cantidad || "—"}</td><td class="r">${fmtM3(f.total)}</td><td>${esc(f.unidad)}</td></tr>`,
      )
      .join("")}
    ${unaUnidad ? `<tr><td colspan="2"><b>Total de la guía (34h)</b></td><td class="r"><b>${piezas}</b></td><td class="r"><b>${fmtM3(total)}</b></td><td>${esc(unidad)}</td></tr>` : ""}
  </tbody></table>`;

  const cadena = guia.cadena.corridas.length
    ? `<table class="ri"><thead><tr><th>De dónde sale</th><th class="r">Cantidad</th><th>Guías GTF de ingreso</th></tr></thead><tbody>
      ${guia.cadena.corridas
        .map(
          (c) =>
            `<tr><td>${c.lineNo != null ? `Corrida de producción #${c.lineNo}` : "Trozas sin transformar"}</td><td class="r">${fmtM3(c.quantity)}</td><td>${c.guias.length ? c.guias.map(esc).join(" · ") : "—"}</td></tr>`,
        )
        .join("")}
      ${sinAtribuir ? `<tr><td><b>Sin atribuir</b> (la guía − la cadena)</td><td class="r"><b>${fmtM3(sinAtribuir)}</b></td><td>—</td></tr>` : ""}
    </tbody></table>`
    : `<p class="doc-sub">Sin cadena: ninguna corrida ni troza está atada a esta guía${sinAtribuir ? ` — ${fmtM3(sinAtribuir)} ${esc(unidad)} sin atribuir` : ""}.</p>`;

  const trozas = guia.trozas.length
    ? `<table class="ri"><thead><tr><th class="r">N°</th><th>Código</th><th>Árbol</th><th>Especie</th><th class="r">Ø mayor cm</th><th class="r">Ø menor cm</th><th class="r">Largo m</th><th class="r">m³</th></tr></thead><tbody>
      ${guia.trozas
        .map(
          (p, i) =>
            `<tr><td class="r">${i + 1}</td><td class="m">${esc(p.codigoGuia || p.codigo)}</td><td>${esc(p.arbol ?? "—")}</td><td>${esc(p.comun ?? "—")}</td><td class="r">${cm(p.diamMayorM)}</td><td class="r">${cm(p.diamMenorM)}</td><td class="r">${met(p.lengthM)}</td><td class="r">${m3(p.volumeM3)}</td></tr>`,
        )
        .join("")}
    </tbody></table>`
    : `<p class="doc-sub">Madera transformada: no salieron trozas sin aserrar.</p>`;

  const papeles = `<table class="ri"><tbody>
    <tr><td>Permiso${permisos.length === 1 ? "" : "s"} (título habilitante)</td><td>${permisos.length ? permisos.map(esc).join(" · ") : "—"}</td></tr>
    <tr><td>CITES</td><td>${esc(guia.datos.citesPermiso?.trim() || (guia.trozas.some((t) => t.cites) ? "Especie CITES sin permiso escrito" : "No aplica"))}</td></tr>
    <tr><td>Guías de ingreso (32)</td><td>${guiasDeOrigen(guia.cadena).map(esc).join(" · ") || "—"}</td></tr>
    <tr><td>Anexo 04</td><td>${extra.anexo04 ? "Emitido" : "Falta emitirlo"}</td></tr>
    <tr><td>Registro en el Libro</td><td>${esc(plazo.texto)}</td></tr>
  </tbody></table>`;

  const cuerpo = `
    ${cabeceraDoc({
      emisor: guia.titular || "Centro de transformación",
      meta: [permisos.length ? `Permiso: ${permisos.join(" · ")}` : null, destino ? `Destino: ${destino}` : null],
      tipo: "RESUMEN INTERNO DE LA GTF DE SALIDA",
      numero,
      numeroNota: `Emitida el ${dia(guia.fecha)} · línea #${guia.lineNo}`,
    })}
    ${tituloDoc("Resumen interno", "Documento de gestión del CTP · no reemplaza a la GTF ni a su lista de trozas")}
    ${anulada ? `<p class="doc-sello rojo">GUÍA ANULADA<i>${esc(anulada)}</i></p>` : ""}
    ${resumenDoc(fichas)}
    ${seccionDoc("S1 · Por especie y producto", "Las filas de la guía, como las agrupa SERFOR")}
    ${productos}
    ${seccionDoc("S2 · Cadena de custodia", "Corridas y trozas de las que sale la madera")}
    ${cadena}
    ${seccionDoc("S3 · Trozas sin aserrar", guia.trozas.length ? `${guia.trozas.length} trozas` : "")}
    ${trozas}
    ${seccionDoc("S4 · Permiso, Anexo 04 y plazo", "Plazo: 2 días hábiles (RDE D000025-2023)")}
    ${papeles}
    ${notaDoc("Cifras del Libro CTP al momento de imprimir. La cadena y lo sin atribuir salen de las corridas y trozas atadas a la guía.")}
  `;
  const pieCorrido = `Resumen interno · GTF de salida ${numero}`;
  return {
    nombre: "Resumen interno",
    etiqueta: anulada ? "Anulada · documento de gestión" : "Documento de gestión del CTP",
    archivo: `resumen-interno-gtf-salida-${numero}`,
    html: documentoHtml({ titulo: `Resumen interno GTF ${numero}`, css: CSS_RESUMEN, cuerpo, pieCorrido }),
    pieCorrido,
  };
}
