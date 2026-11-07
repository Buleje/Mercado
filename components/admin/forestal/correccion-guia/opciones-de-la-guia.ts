/**
 * Qué se le puede pedir corregir a una guía EMITIDA (ADR-512): sus casilleros
 * del formato SERFOR 2024 y sus filas (trozas del Libro TH, líneas del
 * despacho del CTP), cada una con lo que dice HOY.
 *
 * El «dice» de acá es una VISTA PREVIA para que la persona elija bien: el que
 * vale es el que lee el servidor de la guía guardada (`CambioResuelto.dice`).
 * Se arma con el MISMO camino que «Imprimir hoja SERFOR» (`entradasDeLaGuia` →
 * `casillerosGtf`), así que el casillero dice lo mismo que el papel.
 */

import { claveLineaCtp } from "@/lib/soporte/correccion-guia";
import { CASILLEROS_GTF_2024, casillerosGtf, detalleGtf, type FuenteGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import type { Gtf } from "../gtf-tabla-columnas";

export interface OpcionCorregible {
  donde: "casillero" | "item";
  /** Número del casillero 2024 («28») o identificador de la fila (código de troza, id de la línea). */
  clave: string;
  /** Cómo se lee en la lista: «(28) Placa (s)/ Matrícula N.º», «Troza 12A». */
  etiqueta: string;
  /** Lo que dice hoy (vista previa); null = vacío o no se pudo leer acá. */
  dice: string | null;
}

/** La clave única de una opción en el formulario (`casillero:28`, `item:12A`). */
export const claveOpcion = (o: Pick<OpcionCorregible, "donde" | "clave">): string => `${o.donde}:${o.clave}`;

/**
 * Los casilleros que se ofrecen: todos los del Anexo I menos los que el sistema
 * no llena (título del cuadro, firma, nombre y DNI del emisor: van a mano) y el
 * detalle por fila (34a)–(34g), que se corrige eligiendo la troza o la línea.
 */
const DETALLE_POR_FILA = new Set(["34a", "34b", "34c", "34d", "34e", "34f", "34g"]);
const CASILLEROS_OFRECIDOS = CASILLEROS_GTF_2024.filter((c) => !("vacio" in c) && !DETALLE_POR_FILA.has(c.n));

const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

function opcionesDeCasilleros(valores: Partial<Record<FuenteGtf2024, string>>): OpcionCorregible[] {
  return CASILLEROS_OFRECIDOS.map((c) => ({
    donde: "casillero" as const,
    clave: c.n,
    etiqueta: `(${c.n}) ${c.rotulo}`,
    dice: limpio(
      ("de" in c ? (c.de as readonly FuenteGtf2024[]) : [])
        .map((k) => (valores[k] ?? "").trim())
        .filter(Boolean)
        .join(" / "),
    ),
  }));
}

const n3 = (v: number | null): string | null => (v == null ? null : v.toLocaleString("es-PE", { maximumFractionDigits: 3 }));
const cm = (m: number | null): string | null => (m == null ? null : `${Math.round(m * 100)} cm`);

/** Guía del Libro TH: casilleros del papel + una opción por troza. */
export function opcionesGuiaLoth(g: Gtf, caratula: LothGtfCaratula | null): OpcionCorregible[] {
  let casilleros: OpcionCorregible[] = [];
  try {
    const e = entradasDeLaGuia(g as unknown as LothGtfDoc, caratula);
    casilleros = opcionesDeCasilleros({
      ...casillerosGtf(e.cuerpo),
      numeroGtf: g.gtfNumber,
      volumenTotal: detalleGtf(e.cuerpo.lineas).total,
    });
  } catch (err) {
    /* Una guía vieja con datos raros: se ofrecen los casilleros sin vista previa (el servidor lee el valor). */
    console.warn("[correccion-guia] no se pudieron leer los casilleros", err);
    casilleros = opcionesDeCasilleros({ numeroGtf: g.gtfNumber });
  }
  const trozas = piezasDeItems(g.items).map((p): OpcionCorregible => {
    const impreso = p.codigoGuia && p.codigoGuia !== p.codigo ? p.codigoGuia : p.codigo;
    return {
      donde: "item",
      clave: p.codigo.slice(0, 40),
      etiqueta: `Troza ${impreso}`,
      dice: limpio(
        [p.comun ?? p.cientifico, p.diamMayorM != null ? `D ${cm(p.diamMayorM)}` : null, p.lengthM != null ? `L ${n3(p.lengthM)} m` : null, p.volumeM3 != null ? `${n3(p.volumeM3)} m³` : null]
          .filter(Boolean)
          .join(" · "),
      ),
    };
  });
  return [...casilleros, ...trozas.filter((t) => t.clave)];
}

/**
 * Guía de salida del CTP: la fila de la lista no trae la guía entera, así que
 * la vista previa sólo cubre lo que sí trae (N°, destinatario, placa) y cada
 * línea del despacho; el resto lo lee el servidor.
 */
export function opcionesGuiaCtp(lineas: readonly GuiaEmitida[]): OpcionCorregible[] {
  const g = lineas[0];
  if (!g) return [];
  const casilleros = opcionesDeCasilleros({
    numeroGtf: g.gtfNumber,
    "22": g.destinatario ?? "",
    "31p": g.placa ?? "",
  });
  /* Clave de la línea = `claveLineaCtp(N°)` del contrato (la que el servidor reconoce). Sin N° de
     línea, el id del despacho. */
  const items = lineas.map((l): OpcionCorregible => ({
    donde: "item",
    clave: l.lineNo != null ? claveLineaCtp(l.lineNo) : l.despachoId.slice(0, 40),
    etiqueta: l.lineNo != null ? claveLineaCtp(l.lineNo) : `Línea ${l.producto ?? ""}`.trim(),
    dice: limpio(
      [l.producto, l.especie, l.cantidad != null ? `${n3(l.cantidad)} ${l.unidad ?? ""}`.trim() : null].filter(Boolean).join(" · "),
    ),
  }));
  return [...casilleros, ...items];
}
