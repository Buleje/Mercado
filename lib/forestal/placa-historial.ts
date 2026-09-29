/**
 * placa-historial — lo que el negocio ya sabe de una placa, junto en un lugar.
 *
 * Por qué existe (Brandon 29-09-2026: «hacer uso de API que permita buscar
 * información de la placa y ponerse esos datos»): antes de pagar una consulta
 * a SUNARP, la placa casi siempre ya viajó con este negocio. El camión
 * `W2D-853` está en la guía de SERFOR 019-001-0000004 con su tipo, su chofer,
 * el DNI y la licencia; tipearlos otra vez es donde nacen los errores.
 *
 * Tres piezas PURAS (client-safe), para que el servidor junte y el formulario
 * aplique con la misma regla:
 *
 *   · `juntarLoDelSistema` — de todas las veces que la placa aparece, un dato
 *     por casillero: primero la ficha del Directorio (la curó alguien), después
 *     la guía más nueva. El transportista y el conductor viajan como BLOQUE: el
 *     RUC de una guía no se pega al nombre de otra.
 *   · `rellenarDesdePlaca` — qué casilleros de la guía se llenan: SOLO los
 *     vacíos. Lo que alguien escribió no se pisa, y un documento no se agrega
 *     a un nombre distinto del que se encontró.
 *   · `resumenDeRelleno` — la línea que dice qué se llenó y de dónde.
 */

import { leerPlaca, mismaPlaca, partirPlacasDeGuia } from "./placa-peru";

export type FuentePlaca = "directorio" | "guia_th" | "despacho_ctp" | "ingreso_ctp" | "guia_serfor";

/** Una vez que la placa aparece en algo del negocio. */
export interface RegistroPlaca {
  fuente: FuentePlaca;
  /** N° de la guía. En el Directorio, `null`. */
  referencia: string | null;
  /** `YYYY-MM-DD` de la guía (o del último uso de la ficha). */
  fecha: string | null;
  /** Como está escrita (`V2H-901 / -` en SERFOR). */
  placa: string;
  placaRemolque?: string | null;
  /** `fluvial`: la «placa» es una matrícula; no se compara. */
  modo?: string | null;
  tipo?: string | null;
  marca?: string | null;
  transportista?: string | null;
  transportistaDocTipo?: string | null;
  transportistaDoc?: string | null;
  conductor?: string | null;
  conductorDni?: string | null;
  licencia?: string | null;
}

export const CAMPOS_PLACA = [
  "tipo",
  "marca",
  "placaRemolque",
  "transportista",
  "transportistaDocTipo",
  "transportistaDoc",
  "conductor",
  "conductorDni",
  "licencia",
] as const;
export type CampoPlaca = (typeof CAMPOS_PLACA)[number];

export interface OrigenDato {
  fuente: FuentePlaca;
  referencia: string | null;
  fecha: string | null;
}

export interface LoQueSabeElSistema {
  encontrado: boolean;
  /** En cuántos registros aparece (guías vigentes + ficha del Directorio). */
  veces: number;
  datos: Partial<Record<CampoPlaca, string>>;
  origen: Partial<Record<CampoPlaca, OrigenDato>>;
  /** La guía más reciente con esta placa (el Directorio no cuenta como viaje). */
  ultimaGuia: OrigenDato | null;
}

/** Lo que devuelve la consulta externa (SUNARP vía json.pe). */
export interface DatosPlacaExterna {
  placa: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  serie: string | null;
  motor: string | null;
  vin: string | null;
}

/** Texto con algo: sin espacios de borde, y «-» / «—» / «/» sueltos son nada. */
function con(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  return /^[-—/\s.]*$/.test(s) ? "" : s;
}

const mismoNombre = (a: string, b: string) =>
  a.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase() ===
  b.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

function origenDe(r: RegistroPlaca): OrigenDato {
  return { fuente: r.fuente, referencia: r.referencia, fecha: r.fecha };
}

/** Directorio primero; después la fecha más nueva; sin fecha, al final. */
function ordenar(a: RegistroPlaca, b: RegistroPlaca): number {
  if ((a.fuente === "directorio") !== (b.fuente === "directorio")) return a.fuente === "directorio" ? -1 : 1;
  if (a.fecha && b.fecha) return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0;
  if (a.fecha) return -1;
  if (b.fecha) return 1;
  return 0;
}

/**
 * Nombre + documento como un bloque. El nombre sale del primer registro que lo
 * tiene; el documento, de ESE registro o de otro con el MISMO nombre.
 */
function bloque(
  lista: RegistroPlaca[],
  nombreDe: (r: RegistroPlaca) => string,
  extras: Array<(r: RegistroPlaca) => string>,
): { nombre: string; origen: OrigenDato; extras: Array<{ valor: string; registro: RegistroPlaca } | null> } | null {
  const primero = lista.find((r) => nombreDe(r));
  if (!primero) return null;
  const nombre = nombreDe(primero);
  const mismos = lista.filter((r) => nombreDe(r) && mismoNombre(nombreDe(r), nombre));
  // `primero` va adelante: su propio documento gana sobre el de otra guía.
  const orden = [primero, ...mismos.filter((r) => r !== primero)];
  return {
    nombre,
    origen: origenDe(primero),
    extras: extras.map((de) => {
      const r = orden.find((x) => de(x));
      return r ? { valor: de(r), registro: r } : null;
    }),
  };
}

/**
 * Todo lo que el negocio sabe de `placa`, un dato por casillero. Los registros
 * de otra placa, los fluviales (matrícula) y los vacíos no cuentan.
 */
export function juntarLoDelSistema(placa: string, registros: readonly RegistroPlaca[]): LoQueSabeElSistema {
  const lista = registros
    .filter((r) => r.modo !== "fluvial" && mismaPlaca(partirPlacasDeGuia(r.placa).placa, placa))
    .slice()
    .sort(ordenar);

  const datos: LoQueSabeElSistema["datos"] = {};
  const origen: LoQueSabeElSistema["origen"] = {};
  const poner = (campo: CampoPlaca, valor: string, o: OrigenDato) => {
    datos[campo] = valor;
    origen[campo] = o;
  };

  for (const campo of ["tipo", "marca"] as const) {
    const r = lista.find((x) => con(x[campo]));
    if (r) poner(campo, con(r[campo]), origenDe(r));
  }

  // El remolque sólo si es una placa que puede existir: «-----» o un número
  // mal tipeado en una guía vieja no se propone.
  for (const r of lista) {
    const l = leerPlaca(con(r.placaRemolque) || partirPlacasDeGuia(r.placa).remolque);
    if (l.estado === "valida") {
      poner("placaRemolque", l.formateada, origenDe(r));
      break;
    }
  }

  const tr = bloque(lista, (r) => con(r.transportista), [(r) => con(r.transportistaDoc)]);
  if (tr) {
    poner("transportista", tr.nombre, tr.origen);
    const doc = tr.extras[0];
    if (doc) {
      poner("transportistaDoc", doc.valor, origenDe(doc.registro));
      const tipo = con(doc.registro.transportistaDocTipo) || tipoDeDocumento(doc.valor);
      if (tipo) poner("transportistaDocTipo", tipo, origenDe(doc.registro));
    }
  }

  const co = bloque(lista, (r) => con(r.conductor), [(r) => con(r.conductorDni), (r) => con(r.licencia)]);
  if (co) {
    poner("conductor", co.nombre, co.origen);
    const [dni, licencia] = co.extras;
    if (dni) poner("conductorDni", dni.valor, origenDe(dni.registro));
    if (licencia) poner("licencia", licencia.valor, origenDe(licencia.registro));
  }

  const guia = lista.find((r) => r.fuente !== "directorio");
  return { encontrado: lista.length > 0, veces: lista.length, datos, origen, ultimaGuia: guia ? origenDe(guia) : null };
}

/** 11 dígitos = RUC, 8 = DNI; lo demás no se adivina. */
function tipoDeDocumento(doc: string): "RUC" | "DNI" | "" {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return "RUC";
  if (d.length === 8) return "DNI";
  return "";
}

// ── Aplicar a la guía ───────────────────────────────────────────────────────

type DocTipoGuia = "RUC" | "DNI" | "CE" | "PASAPORTE";

/** Los casilleros de la guía que la búsqueda puede llenar. */
export interface TransporteDeGuia {
  vehiculo: {
    tipo: string;
    marca: string;
    placaRemolque: string;
    conductor: string;
    conductorDni: string;
    licencia: string;
  };
  transportista: { nombre: string; docTipo: DocTipoGuia; docNumero: string };
}

export type OrigenAplicado = OrigenDato | { fuente: "externo" };

export interface DatoAplicado {
  /** Cómo se nombra en la línea: «conductor», «DNI 07705709»… */
  texto: string;
  origen: OrigenAplicado;
}

export interface Relleno {
  vehiculo: Partial<TransporteDeGuia["vehiculo"]>;
  transportista: Partial<TransporteDeGuia["transportista"]>;
  aplicados: DatoAplicado[];
}

const DOC_TIPOS: readonly string[] = ["RUC", "DNI", "CE", "PASAPORTE"];

/**
 * Qué casilleros llenar con lo encontrado. SOLO los vacíos; y el DNI/licencia
 * (o el RUC) sólo si el nombre está vacío o es el MISMO que se encontró: pegar
 * el DNI de OVALLE al chofer que alguien ya escribió sería inventar.
 */
export function rellenarDesdePlaca(
  actual: TransporteDeGuia,
  sistema: LoQueSabeElSistema | null,
  externo: DatosPlacaExterna | null,
): Relleno {
  const out: Relleno = { vehiculo: {}, transportista: {}, aplicados: [] };
  const d = sistema?.datos ?? {};
  const o = sistema?.origen ?? {};
  const vacio = (v: string | null | undefined) => !con(v);

  if (vacio(actual.vehiculo.tipo) && d.tipo && o.tipo) {
    out.vehiculo.tipo = d.tipo;
    out.aplicados.push({ texto: d.tipo.toLowerCase(), origen: o.tipo });
  }
  if (vacio(actual.vehiculo.marca)) {
    if (d.marca && o.marca) {
      out.vehiculo.marca = d.marca;
      out.aplicados.push({ texto: `marca ${d.marca}`, origen: o.marca });
    } else if (externo?.marca) {
      out.vehiculo.marca = externo.marca.slice(0, 40);
      out.aplicados.push({ texto: `marca ${externo.marca}`, origen: { fuente: "externo" } });
    }
  }
  if (leerPlaca(actual.vehiculo.placaRemolque).estado === "vacia" && d.placaRemolque && o.placaRemolque) {
    out.vehiculo.placaRemolque = d.placaRemolque;
    out.aplicados.push({ texto: `remolque ${d.placaRemolque}`, origen: o.placaRemolque });
  }

  // Transportista: nombre y documento como bloque.
  const trNombre = con(actual.transportista.nombre);
  if (!trNombre && d.transportista && o.transportista) {
    out.transportista.nombre = d.transportista;
    out.aplicados.push({ texto: `transportista ${d.transportista}`, origen: o.transportista });
  }
  const trEsElMismo = !trNombre || (d.transportista ? mismoNombre(trNombre, d.transportista) : false);
  if (vacio(actual.transportista.docNumero) && trEsElMismo && d.transportistaDoc && o.transportistaDoc) {
    const tipo = d.transportistaDocTipo && DOC_TIPOS.includes(d.transportistaDocTipo) ? (d.transportistaDocTipo as DocTipoGuia) : null;
    out.transportista.docNumero = d.transportistaDoc;
    if (tipo) out.transportista.docTipo = tipo;
    out.aplicados.push({ texto: `${tipo ?? "doc."} ${d.transportistaDoc}`, origen: o.transportistaDoc });
  }

  // Conductor: nombre, DNI y licencia como bloque.
  const coNombre = con(actual.vehiculo.conductor);
  if (!coNombre && d.conductor && o.conductor) {
    out.vehiculo.conductor = d.conductor;
    out.aplicados.push({ texto: `conductor ${d.conductor}`, origen: o.conductor });
  }
  const coEsElMismo = !coNombre || (d.conductor ? mismoNombre(coNombre, d.conductor) : false);
  if (coEsElMismo) {
    if (vacio(actual.vehiculo.conductorDni) && d.conductorDni && o.conductorDni) {
      out.vehiculo.conductorDni = d.conductorDni;
      out.aplicados.push({ texto: `DNI ${d.conductorDni}`, origen: o.conductorDni });
    }
    if (vacio(actual.vehiculo.licencia) && d.licencia && o.licencia) {
      out.vehiculo.licencia = d.licencia;
      out.aplicados.push({ texto: `licencia ${d.licencia}`, origen: o.licencia });
    }
  }
  return out;
}

/** «tu guía del Libro TH 001-0000127», «el Directorio», «SUNARP». */
export function describirOrigen(o: OrigenAplicado): string {
  switch (o.fuente) {
    case "externo":
      return "SUNARP";
    case "directorio":
      return "el Directorio";
    case "guia_th":
      return `tu guía del Libro TH ${o.referencia ?? ""}`.trim();
    case "despacho_ctp":
      return `tu despacho del CTP ${o.referencia ?? ""}`.trim();
    case "ingreso_ctp":
      return `tu ingreso del CTP ${o.referencia ?? ""}`.trim();
    case "guia_serfor":
      return `la guía de SERFOR ${o.referencia ?? ""}`.trim();
  }
}

/**
 * Una frase por origen, en el orden en que se aplicó:
 * «De tu despacho del CTP GTF-001-000003 del 29 jul.: camión, conductor JULIO PAREDES, DNI 44120987».
 * `fecha` formatea el `YYYY-MM-DD` (el cliente pasa `formatDateShort`).
 */
export function resumenDeRelleno(aplicados: readonly DatoAplicado[], fecha: (iso: string) => string): string[] {
  const grupos = new Map<string, { origen: OrigenAplicado; textos: string[] }>();
  for (const a of aplicados) {
    const clave = a.origen.fuente === "externo" ? "externo" : `${a.origen.fuente}|${a.origen.referencia ?? ""}|${a.origen.fecha ?? ""}`;
    const g = grupos.get(clave) ?? { origen: a.origen, textos: [] };
    g.textos.push(a.texto);
    grupos.set(clave, g);
  }
  return [...grupos.values()].map(({ origen, textos }) => {
    const cuando = origen.fuente !== "externo" && origen.fecha ? ` del ${fecha(origen.fecha)}` : "";
    const quien = describirOrigen(origen);
    const de = quien.startsWith("el ") ? `Del ${quien.slice(3)}` : `De ${quien}`;
    return `${de}${cuando}: ${textos.join(", ")}.`;
  });
}
