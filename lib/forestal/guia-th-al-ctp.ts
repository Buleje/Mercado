/**
 * De la guía del Libro TH al ingreso del Libro CTP, sin volver a tipear
 * (Brandon 28-09-2026: «cuando se va a emitir la guía quiero que ese registro
 * pase a libro CTP de mi sistema para luego poner recepcionarla»).
 *
 * Blas lleva los dos libros: el del bosque (LO-TH) despacha trozas con su GTF y
 * el de la planta (LO-CTP) las recibe con ESA misma guía. Hasta hoy la guía se
 * armaba en el bosque y se volvía a escribir en Ingresos, troza por troza.
 *
 * Reglas (todas acá, PURAS, para que la pantalla muestre exactamente lo que el
 * servidor va a registrar):
 *
 *   · sólo pasa si el DESTINATARIO de la guía es este mismo negocio: su RUC es
 *     el de la Ficha del CTP. Una guía que va a otra empresa no entra al libro
 *     de la planta propia (esa madera no llega acá);
 *   · la guía del TH y la guardada del CTP son la MISMA guía cuando su N°
 *     coincide tramo a tramo (`mismoNumeroGtf`: `019-0000001` ≡ `19-0000001`);
 *   · al recibir, la guía se parte en un ingreso por especie (como el alta
 *     desde SERFOR, ADR-312) con sus trozas: código, D1, D2, largo y m³ tal
 *     como los declaró el Trozado. El volumen es la SUMA de las trozas.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";
import { m3OficialDeFila, totalizarGTF } from "./gtf-redondeo";
import { claveEspecie } from "./loth-constants";
import type { GtfDatos } from "./ctp-gtf-datos";
import { esFechaReal } from "./guias-guardadas";
import { mismoNumeroGtf } from "./gtf-talonario";
import { motivoOpcionalSchema } from "./motivo";
import { ConteoSchema, HuellaSchema, SobrantesSchema, type CodigoConteo, type ResumenConteo } from "./conteo-guia-th";

/** 4 decimales: la precisión del libro (m³). */
const r4 = (n: number): number => Math.round(n * 10000) / 10000;
const txt = (v: string | null | undefined): string => (v ?? "").trim();

/** Sólo los dígitos de un documento: `20605859438`, `20-605859438 ` y `RUC 20605859438` son el mismo. */
export const soloDigitos = (v: string | null | undefined): string => String(v ?? "").replace(/\D/g, "");

// ── La guía del TH, leída con desconfianza ──────────────────────────────────

/**
 * Una pieza de `ForestGtf.items`: lo que el despacho del TH fotografió al
 * emitir. Viene de una columna JSON escrita por dos formularios (el despacho
 * con guía y la GTF corta de antes), así que todo es opcional.
 */
export interface ItemGuiaTh {
  /**
   * Código ÚNICO de la troza en el Libro TH. Es el que va a `codificacion` del
   * ingreso del CTP, también en una troza renombrada (ADR-474, «12A (0000002)»):
   * con el de la guía («12A»), `trozasYaEnElLibro` la tomaría por la «12A» de la
   * otra guía del mismo permiso y especie (falso «ya está en tu libro») y la
   * atadura por código (guías sin `trozadoId`) caería en la troza de la otra
   * guía. El código único contiene el de la guía y su correlativo: se lee igual.
   */
  code: string | null;
  /** ADR-474: el código impreso en la guía, sólo si difiere de `code`. Informativo: el CTP guarda `code`. */
  codigoGuia?: string | null;
  treeCode: string | null;
  species: string | null;
  scientific: string | null;
  cites: boolean;
  /** Diámetros y largo en METROS, como los guarda el Libro TH. */
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
  pieces: number | null;
  /**
   * La línea de Trozado del Libro TH de esta troza (ADR-450): la escribe
   * «Despachar con guía» desde el 29-09-2026. Las guías emitidas antes no la
   * traen: «Recibir» la busca por plan + código + trozado vigente.
   */
  trozadoId: string | null;
}

const numOpc = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
  z.number().finite().nonnegative().nullable().catch(null),
);
const textoOpc = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().nullable().catch(null),
);
const itemSchema = z.object({
  code: textoOpc.optional(),
  codigoGuia: textoOpc.optional(),
  treeCode: textoOpc.optional(),
  species: textoOpc.optional(),
  scientific: textoOpc.optional(),
  cites: z.boolean().catch(false).optional(),
  diamMayorM: numOpc.optional(),
  diamMenorM: numOpc.optional(),
  lengthM: numOpc.optional(),
  volumeM3: numOpc.optional(),
  pieces: numOpc.optional(),
  trozadoId: textoOpc.optional(),
});

/** `ForestGtf.items` → piezas. Una fila que no se entiende se descarta sola, no tumba la guía. */
export function leerItemsGuiaTh(raw: unknown): ItemGuiaTh[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemGuiaTh[] = [];
  for (const r of raw) {
    const p = itemSchema.safeParse(r);
    if (!p.success) continue;
    const d = p.data;
    out.push({
      code: d.code ?? null,
      codigoGuia: d.codigoGuia ?? null,
      treeCode: d.treeCode ?? null,
      species: d.species ?? null,
      scientific: d.scientific ?? null,
      cites: d.cites ?? false,
      diamMayorM: d.diamMayorM ?? null,
      diamMenorM: d.diamMenorM ?? null,
      lengthM: d.lengthM ?? null,
      volumeM3: d.volumeM3 ?? null,
      pieces: d.pieces != null ? Math.round(d.pieces) : null,
      trozadoId: d.trozadoId ?? null,
    });
  }
  return out;
}

// ── ¿Va a este mismo negocio? ───────────────────────────────────────────────

export type DestinoDeGuiaTh =
  | { propio: true }
  | {
      propio: false;
      motivo: "sin_ruc_propio" | "sin_destinatario" | "otra_empresa";
      mensaje: string;
    };

/**
 * La guía pasa al Libro CTP propio sólo si su destinatario es este negocio:
 * RUC del destinatario = RUC de la Ficha del CTP. Sin alguno de los dos no se
 * adivina: se dice qué falta.
 */
export function destinoDeGuiaTh(
  datos: Pick<GtfDatos, "destinatario">,
  rucPropio: string | null | undefined,
): DestinoDeGuiaTh {
  const propio = soloDigitos(rucPropio);
  if (propio.length !== 11) {
    return {
      propio: false,
      motivo: "sin_ruc_propio",
      mensaje:
        "Tu Ficha del CTP no tiene el RUC de tu planta: sin él no se sabe si esta guía va a tu planta. Complétalo en la Ficha y vuelve a intentarlo.",
    };
  }
  const dest = soloDigitos(datos.destinatario?.docNumero);
  if (!dest) {
    return {
      propio: false,
      motivo: "sin_destinatario",
      mensaje: "La guía no dice el RUC del destinatario: no se sabe si la madera va a tu planta.",
    };
  }
  if (dest !== propio) {
    const nombre = txt(datos.destinatario?.nombre) || "otra empresa";
    return {
      propio: false,
      motivo: "otra_empresa",
      mensaje: `La guía va a ${nombre} (RUC ${dest}), no a tu planta: no pasa a tu Libro CTP.`,
    };
  }
  return { propio: true };
}

// ── El ingreso que sale de la guía ──────────────────────────────────────────

/** Una troza como la espera el ingreso del CTP (`WoodEntryTrozaInput`). */
export interface TrozaDeIngresoTh {
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  /** «D1 X D2 X L» (cm, cm, m), como lo publica SERFOR: lo relee `medidasDeTroza`. */
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  cantidad: number;
  volumenM3: number | null;
  /** Parcela de corta del plan de la guía. */
  parcela: string | null;
  /** Su línea de Trozado del Libro TH (ADR-450); `null` = no se supo cuál. */
  trozadoId: string | null;
  /** El árbol del que salió, como lo escribió el Trozado (`treeCode`). */
  arbolCodigo: string | null;
}

/** Un renglón del libro: una especie de la guía con sus trozas. */
export interface LineaDeIngresoTh {
  especieComun: string;
  especieCientifica: string | null;
  cites: boolean;
  presentacion: string;
  volumenM3: number;
  piezas: number;
  trozas: TrozaDeIngresoTh[];
}

export type IngresosDeGuiaTh =
  | { ok: true; lineas: LineaDeIngresoTh[]; totalM3: number; trozas: number; avisos: string[] }
  | { ok: false; motivo: string };

/**
 * La lista de trozas de la guía es una FOTO de lo que viajó: completar después
 * el Trozado del TH no la cambia. Lo que falta en ella se arregla emitiendo
 * otra guía o cargando el ingreso a mano.
 */
export const SIN_ARREGLO_EN_LA_LISTA =
  "La lista de la guía no cambia después de emitirla: anúlala y emítela de nuevo con el volumen, o ingrésala a mano.";

/** La presentación que el libro guarda para madera en rollo (EMBALAJE_TROZA en mayúsculas). */
export const PRESENTACION_TROZAS = "TROZAS";

/** Diferencia que se avisa entre la suma de las trozas y el total de la guía: 10 litros. */
export const TOLERANCIA_M3 = 0.01;

/** Metros → centímetros a 1 decimal (el Libro TH guarda el Ø en m; el CTP lo lleva en cm). */
const aCm = (m: number | null): number | null => (m == null || !Number.isFinite(m) || m <= 0 ? null : Math.round(m * 1000) / 10);

const decimal = (n: number): string => String(Number(n.toFixed(2)));

/** «100 X 96 X 6.5»: los dos diámetros en cm y el largo en m, como SERFOR. */
export function dimensionesDeTroza(d1Cm: number | null, d2Cm: number | null, largoM: number | null): string | null {
  if (d1Cm == null || largoM == null || !(largoM > 0)) return null;
  return `${decimal(d1Cm)} X ${decimal(d2Cm ?? d1Cm)} X ${decimal(largoM)}`;
}

/**
 * La guía del TH → los ingresos del CTP: uno por especie, con sus trozas.
 *
 * Se agrupa con `claveEspecie` —la misma vara del (37) de la guía—:
 * «Tornillo» y «TORNILLO (Cedrelinga cateniformis)» son un renglón. El volumen
 * de cada renglón es la SUMA de sus trozas (lo que declaró el Trozado); si la
 * guía dice otro total, se avisa y manda la suma: es la madera que se puede
 * contar en el patio, pieza por pieza.
 *
 * Una troza sin especie o sin volumen frena todo: el ingreso del libro las
 * exige y un renglón «sin especie» ante SERFOR es peor que volver al Trozado.
 */
export function ingresosDesdeGuiaTh(
  items: readonly ItemGuiaTh[],
  opts: { parcela?: string | null; volumenDeclaradoM3?: number | null; gtfNumber?: string } = {},
): IngresosDeGuiaTh {
  if (items.length === 0) return { ok: false, motivo: `La guía del Libro TH no tiene su lista de trozas. ${SIN_ARREGLO_EN_LA_LISTA}` };
  const sinEspecie = items.filter((i) => !txt(i.species) && !txt(i.scientific));
  if (sinEspecie.length > 0) {
    const cual = sinEspecie[0].code ? `La troza ${sinEspecie[0].code}` : "Una troza";
    return { ok: false, motivo: `${cual} de la guía no dice su especie. ${SIN_ARREGLO_EN_LA_LISTA}` };
  }
  const sinVolumen = items.filter((i) => !(Number(i.volumeM3) > 0));
  if (sinVolumen.length > 0) {
    const cual = sinVolumen[0].code ? `La troza ${sinVolumen[0].code}` : "Una troza";
    return { ok: false, motivo: `${cual} de la guía no tiene volumen. ${SIN_ARREGLO_EN_LA_LISTA}` };
  }

  const parcela = txt(opts.parcela) || null;
  const grupos = new Map<string, LineaDeIngresoTh>();
  items.forEach((it, i) => {
    const comun = txt(it.species) || txt(it.scientific);
    const clave = claveEspecie(comun);
    const g =
      grupos.get(clave) ??
      ({
        especieComun: comun,
        especieCientifica: null,
        cites: false,
        presentacion: PRESENTACION_TROZAS,
        volumenM3: 0,
        piezas: 0,
        trozas: [],
      } satisfies LineaDeIngresoTh);
    if (!g.especieCientifica && txt(it.scientific)) g.especieCientifica = txt(it.scientific);
    g.cites = g.cites || it.cites;
    const d1Cm = aCm(it.diamMayorM);
    const d2Cm = aCm(it.diamMenorM);
    const largoM = it.lengthM != null && it.lengthM > 0 ? r4(it.lengthM) : null;
    const diams = [d1Cm, d2Cm].filter((d): d is number => d != null);
    const cantidad = it.pieces != null && it.pieces > 0 ? it.pieces : 1;
    const volumenM3 = r4(Number(it.volumeM3));
    g.trozas.push({
      orden: i + 1,
      codificacion: txt(it.code) || null,
      especieComun: comun,
      especieCientifica: txt(it.scientific) || null,
      dimensiones: dimensionesDeTroza(d1Cm, d2Cm, largoM),
      largoM,
      diametroCm: diams.length ? Math.round((diams.reduce((a, b) => a + b, 0) / diams.length) * 100) / 100 : null,
      d1Cm,
      d2Cm,
      cantidad,
      volumenM3,
      parcela,
      trozadoId: it.trozadoId ?? null,
      arbolCodigo: txt(it.treeCode) || null,
    });
    g.volumenM3 = g.volumenM3 + volumenM3;
    g.piezas += cantidad;
    grupos.set(clave, g);
  });

  /* Cada línea es una fila de la GTF: su m³ oficial es la suma exacta de sus
     trozas redondeada UNA vez a 3 decimales HALF_UP, y el total es la suma de
     esas líneas (regla de la GTF, 2026-10-03). */
  for (const g of grupos.values()) g.volumenM3 = m3OficialDeFila(g.trozas.map((t) => t.volumenM3));
  const lineas = [...grupos.values()].sort(
    (a, b) => b.volumenM3 - a.volumenM3 || a.especieComun.localeCompare(b.especieComun, "es"),
  );
  const totalM3 = totalizarGTF(lineas.map((l) => ({ m3: l.volumenM3 }))).m3;
  const trozas = lineas.reduce((a, l) => a + l.trozas.length, 0);
  const avisos: string[] = [];
  const declarado = opts.volumenDeclaradoM3;
  if (declarado != null && Number.isFinite(declarado) && Math.abs(declarado - totalM3) > TOLERANCIA_M3) {
    avisos.push(
      `La suma de las trozas (${totalM3.toFixed(3)} m³) no es el total de la guía${opts.gtfNumber ? ` ${opts.gtfNumber}` : ""} (${declarado.toFixed(3)} m³): el libro registra la suma de las trozas.`,
    );
  }
  return { ok: true, lineas, totalM3, trozas, avisos };
}

// ── Cada troza con su línea de Trozado (ADR-450 L4) ─────────────────────────

/** Una línea de Trozado del Libro TH, como la trae la DB class para atar. */
export interface TrozadoParaAtar {
  id: string;
  trozaCode: string | null;
  treeCode: string | null;
  planId: string | null;
  status: string;
  deletedAt: Date | string | null;
}

const clave = (v: string | null | undefined): string => (v ?? "").trim().toUpperCase();
const listaCorta = (c: readonly string[]): string =>
  c.length <= 5 ? c.join(", ") : `${c.slice(0, 5).join(", ")} y ${c.length - 5} más`;

/**
 * Cada troza de la guía con su línea de Trozado (PURO: la DB class sólo trae
 * las candidatas del negocio). Una línea se ata sólo si es de ESA troza (mismo
 * código), del plan de la guía, VIGENTE y del mismo árbol que dice la guía.
 *
 *   · La guía emitida desde el 29-09 trae el id: si esa línea no cumple (se
 *     anuló, es de otra troza, de otro plan o de otro negocio —entonces no
 *     llega entre las candidatas—), se busca la vigente por plan + código.
 *   · Las guías de antes no lo traen: se busca por plan + código + vigente.
 *   · Exactamente una candidata, o ninguna: dos con el mismo código no se
 *     adivinan. Un árbol distinto al de la guía tampoco se ata.
 *
 * Todo lo que no se ata entra igual (el libro admite huecos), con aviso.
 */
export function atarTrozadosDeGuia(
  lineas: readonly LineaDeIngresoTh[],
  filas: readonly TrozadoParaAtar[],
  planId: string | null,
): { lineas: LineaDeIngresoTh[]; avisos: string[] } {
  const plan = planId ?? null;
  const vigente = (f: TrozadoParaAtar) => f.status === "registrado" && !f.deletedAt;
  const nombre = (t: TrozaDeIngresoTh) => t.codificacion?.trim() || `N° ${t.orden}`;
  const reatadas: string[] = [];
  const ajenas: string[] = [];
  const otroArbol: string[] = [];
  const sinAtar: string[] = [];
  const out = lineas.map((l) => ({
    ...l,
    trozas: l.trozas.map((t): TrozaDeIngresoTh => {
      const cod = clave(t.codificacion);
      const suya = (f: TrozadoParaAtar) => !!cod && clave(f.trozaCode) === cod && (f.planId ?? null) === plan;
      const mismoArbol = (f: TrozadoParaAtar) => !t.arbolCodigo || !f.treeCode || clave(f.treeCode) === clave(t.arbolCodigo);
      const atar = (f: TrozadoParaAtar): TrozaDeIngresoTh => ({ ...t, trozadoId: f.id, arbolCodigo: t.arbolCodigo ?? (f.treeCode?.trim() || null) });

      if (t.trozadoId) {
        const f = filas.find((x) => x.id === t.trozadoId);
        if (f && suya(f) && vigente(f)) {
          if (mismoArbol(f)) return atar(f);
          otroArbol.push(nombre(t));
          return { ...t, trozadoId: null };
        }
      }
      const cands = filas.filter((x) => suya(x) && vigente(x));
      if (cands.length === 1) {
        if (!mismoArbol(cands[0])) {
          otroArbol.push(nombre(t));
          return { ...t, trozadoId: null };
        }
        if (t.trozadoId) reatadas.push(nombre(t));
        return atar(cands[0]);
      }
      if (t.trozadoId) ajenas.push(nombre(t));
      else if (cod) sinAtar.push(nombre(t));
      return { ...t, trozadoId: null };
    }),
  }));
  const avisos: string[] = [];
  const una = (c: readonly string[]) => c.length === 1;
  if (reatadas.length > 0) {
    avisos.push(
      `La guía nombraba una línea de Trozado anulada o que no es suya para ${una(reatadas) ? "la troza" : "las trozas"} ${listaCorta(reatadas)}: se ${una(reatadas) ? "ató" : "ataron"} a su línea vigente de tu Libro TH.`,
    );
  }
  if (ajenas.length > 0) {
    avisos.push(
      `${una(ajenas) ? "La troza" : "Las trozas"} ${listaCorta(ajenas)} ${una(ajenas) ? "dice" : "dicen"} venir de una línea de Trozado anulada o que no es suya, y no hay otra vigente: ${una(ajenas) ? "entra" : "entran"} sin su árbol del Libro TH.`,
    );
  }
  if (otroArbol.length > 0) {
    avisos.push(
      `El Trozado de ${una(otroArbol) ? "la troza" : "las trozas"} ${listaCorta(otroArbol)} dice otro árbol que la guía: ${una(otroArbol) ? "entra" : "entran"} sin su árbol del Libro TH. Revisa ese Trozado.`,
    );
  }
  if (sinAtar.length > 0) {
    avisos.push(
      `No se encontró en tu Libro TH la línea de Trozado de ${una(sinAtar) ? "la troza" : "las trozas"} ${listaCorta(sinAtar)} (o hay más de una con ese código): ${una(sinAtar) ? "entra" : "entran"} sin su árbol.`,
    );
  }
  return { lineas: out, avisos };
}

// ── El enlace entre las dos guías ───────────────────────────────────────────

/**
 * Lo que la guía guardada del CTP sabe de su guía del Libro TH. Se DEDUCE por
 * el N° (tramo a tramo), no se guarda: la guardada y la del TH son la misma
 * guía impresa del mismo talonario.
 */
export interface VinculoLibroTh {
  gtfId: string;
  gtfNumber: string;
  /** `emitida` | `anulada`, como la tiene el Libro TH. */
  estado: string;
  trozas: number;
  volumenM3: number | null;
  especies: string[];
  destinatario: string | null;
  /** `AAAA-MM-DD`: hasta cuándo vale la guía, casillero (4) de la guía del TH. */
  vencimiento: string | null;
  /** Va a este mismo negocio (RUC del destinatario = RUC de la Ficha). */
  destinoPropio: boolean;
  /** «Recibir» registra el ingreso con sus trozas desde acá. */
  recibible: boolean;
  /** Por qué no se puede recibir desde acá (se ingresa a mano), o null. */
  motivo: string | null;
}

/** Especies de la guía, sin repetir, en el orden en que aparecen. */
export function especiesDeItems(items: readonly ItemGuiaTh[]): string[] {
  const vistas = new Map<string, string>();
  for (const it of items) {
    const n = txt(it.species) || txt(it.scientific);
    const k = claveEspecie(n);
    if (k && !vistas.has(k)) vistas.set(k, n);
  }
  return [...vistas.values()];
}

/** Letras y dígitos, sin tildes ni signos: `S.A.C.` ≡ `SAC`, `17-CPO/C-J-001-02` ≡ `17 CPO C J 001 02`. */
const plano = (v: string | null | undefined): string =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** El permiso y el titular que declara la guía del TH. */
export function identidadDeGuiaTh(
  gtf: { tituloHabilitante: string | null; titularName: string | null },
  datos: Pick<GtfDatos, "titulos" | "propietario">,
): { permiso: string | null; titular: string | null } {
  return {
    permiso: gtf.tituloHabilitante?.trim() || datos.titulos[0]?.trim() || null,
    titular: gtf.titularName?.trim() || datos.propietario.nombre.trim() || null,
  };
}

/**
 * ¿La guardada y la guía del TH son la MISMA guía, además del N°? El N° solo
 * no alcanza: dos talonarios pueden repetirlo. Manda el PERMISO: si los dos lo
 * tienen, tienen que coincidir. El titular se mira sólo cuando falta el permiso
 * de un lado (un mismo titular se escribe «COMUNIDAD NATIVA SANTA ROSA» y
 * «COMUNIDAD SANTA ROSA»: comparado siempre, frenaba guías que sí son la misma).
 * Lo que falta de un lado no objeta.
 */
export function mismaGuiaTh(
  guardada: { permisoCodigo: string | null; titularNombre: string | null },
  th: { permiso: string | null; titular: string | null },
): { ok: true } | { ok: false; motivo: string } {
  const pg = plano(guardada.permisoCodigo);
  const pt = plano(th.permiso);
  if (pg && pt) {
    return pg === pt
      ? { ok: true }
      : {
          ok: false,
          motivo: `La guía guardada dice el permiso ${guardada.permisoCodigo?.trim()} y la de tu Libro TH el ${th.permiso?.trim()}: no parece la misma guía. Corrige la guardada o ingrésala a mano.`,
        };
  }
  const tg = plano(guardada.titularNombre);
  const tt = plano(th.titular);
  if (tg && tt && tg !== tt) {
    return {
      ok: false,
      motivo: `La guía guardada es de ${guardada.titularNombre?.trim()} y la de tu Libro TH de ${th.titular?.trim()}: no parece la misma guía. Corrige la guardada o ingrésala a mano.`,
    };
  }
  return { ok: true };
}

/** «N° 115–116», «N° 115, 118 y 120»: los folios del libro como se leen. */
export function foliosEnTexto(nros: readonly (number | null)[]): string {
  const n = [...new Set(nros.filter((x): x is number => x != null))].sort((a, b) => a - b);
  if (n.length === 0) return "sin N° de libro";
  const seguidos = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  if (n.length > 1 && seguidos) return `N° ${n[0]}–${n[n.length - 1]}`;
  if (n.length === 1) return `N° ${n[0]}`;
  return `N° ${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/** El «no» de anular en el TH una guía que ya entró al Libro CTP. */
export function mensajeGuiaYaRecibida(nros: readonly (number | null)[]): string {
  const n = nros.filter((x) => x != null).length;
  return `Esta guía ya entró a tu Libro CTP como ${n === 1 ? "ingreso" : "ingresos"} ${foliosEnTexto(nros)}. ${n === 1 ? "Anúlalo" : "Anúlalos"} allá primero y después anula la guía.`;
}

/** La guía del TH que corresponde a este N°: la emitida primero, después la más nueva. */
export function guiaThDeNumero<T extends { gtfNumber: string; status: string; createdAt: Date | string }>(
  gtfNumber: string,
  guias: readonly T[],
): T | null {
  const mias = guias.filter((g) => mismoNumeroGtf(g.gtfNumber, gtfNumber));
  if (mias.length === 0) return null;
  return (
    [...mias].sort(
      (a, b) =>
        (a.status === "emitida" ? 0 : 1) - (b.status === "emitida" ? 0 : 1) ||
        String(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt).localeCompare(
          String(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt),
        ),
    )[0] ?? null
  );
}

// ── Lo que manda la pantalla al recibir ─────────────────────────────────────

/** Cuánto aceptan la observación y el motivo de una llegada vencida (pantalla y servidor). */
export const MAX_TEXTO_RECIBIR = 300;

export const RecibirGuiaThInput = z.object({
  /** Día en que bajó la madera (`AAAA-MM-DD`): lo pone quien recibe. */
  fechaLlegada: z
    .string()
    .trim()
    .refine(esFechaReal, "La fecha de llegada no existe o no va como AAAA-MM-DD"),
  /** Lo que se vio al recibir, si no es lo que dice el papel (va a la auditoría). Sin invisibles. */
  observacion: motivoOpcionalSchema(MAX_TEXTO_RECIBIR),
  /** Llegó después del vencimiento de la guía y se confirma con motivo (ADR-434, regla de `motivo.ts`). */
  aceptaVencida: z.boolean().optional(),
  motivoVencida: motivoOpcionalSchema(MAX_TEXTO_RECIBIR),
  /**
   * ADR-450: la huella de la lista que se contó (`PreparadoRecibirTh.huella`).
   * Si al recibir la guía del TH ya no es la misma → 409 `GUIA_CAMBIO`.
   */
  huella: HuellaSchema,
  /** ADR-450: TODAS las trozas de la guía, una vez cada una (`TrozaContada`). */
  conteo: ConteoSchema,
  /** Hay trozas `llego: false` y quien recibe confirma que no llegaron. */
  confirmaFaltantes: z.boolean().optional(),
  /** Códigos escaneados que no vienen en la guía: sólo van a la auditoría. */
  sobrantes: SobrantesSchema.optional(),
});
export type RecibirGuiaThInput = z.infer<typeof RecibirGuiaThInput>;
/** Lo que arma la pantalla (antes de limpiar los textos). */
export type RecibirGuiaThBody = z.input<typeof RecibirGuiaThInput>;

/**
 * El «no» de un cuerpo mal formado, SIEMPRE en español: los mensajes propios de
 * Zod («Too big: expected string…») no llegan a la pantalla.
 */
export function mensajeDeRecibirInvalido(issues: readonly { path: readonly PropertyKey[]; message: string; code?: string }[]): string {
  const i = issues[0];
  if (!i) return "Revisa los datos de la recepción.";
  const campo = String(i.path[0] ?? "");
  if (campo === "fechaLlegada") return "La fecha de llegada no existe o no va como AAAA-MM-DD.";
  if (campo === "observacion") return `La observación va en hasta ${MAX_TEXTO_RECIBIR} letras.`;
  if (campo === "motivoVencida") return `El motivo de la llegada vencida va en hasta ${MAX_TEXTO_RECIBIR} letras.`;
  if (campo === "aceptaVencida") return "Confirma la llegada vencida marcando la casilla.";
  if (campo === "huella") return "Vuelve a abrir la guía: le falta su huella para recibirla.";
  if (campo === "conteo") {
    if (i.path.length <= 1) return "Cuenta las trozas de la guía antes de recibirla.";
    const sub = String(i.path[2] ?? "");
    if (sub === "medida") return "Una medida en planta no es válida: el diámetro va en cm (hasta 400) y el largo en m (hasta 30).";
    if (sub === "obs") return "La observación de una troza va en hasta 120 letras.";
    return "El conteo trae una troza mal escrita: vuelve a abrir la guía y cuenta otra vez.";
  }
  if (campo === "confirmaFaltantes") return "Confirma las trozas que no llegaron marcando la casilla.";
  if (campo === "sobrantes") return "Los códigos que no vienen en la guía van hasta 50, de hasta 60 letras cada uno.";
  return "Revisa los datos de la recepción.";
}

// ── Lo que devuelve el servidor ─────────────────────────────────────────────

/** La planta propia (Ficha del CTP): la llegada de las guías del TH. */
export interface PlantaPropia {
  /** Sólo dígitos; null = la Ficha no lo tiene. */
  ruc: string | null;
  nombre: string | null;
  direccion: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

/** Qué pasó con la guía del TH en el Libro CTP al emitirla. */
export type EstadoPaseAlCtp =
  | "creada"
  | "ya_estaba"
  | "ya_ingresada"
  | "sin_libro_ctp"
  | "sin_ruc_propio"
  | "sin_destinatario"
  | "otra_empresa"
  | "no_es_de_trozas"
  | "error";

export interface PaseAlCtp {
  estado: EstadoPaseAlCtp;
  /** Qué se le dice a la persona en el Libro TH (vacío = no se dice nada). */
  mensaje: string;
  guardadaId?: string;
}

/** Qué pasó en el Libro CTP al anular la guía en el Libro TH. */
export interface BajaEnCtp {
  estado: "anulada" | "ya_recibida" | "sin_guardada" | "error";
  mensaje: string;
  /** Con `ya_recibida`: cuántos ingresos vivos tiene la guía en el CTP. */
  ingresos?: number;
}

/** Lo que la pantalla muestra antes de «Recibir»: exactamente lo que se va a registrar. */
export interface PreparadoRecibirTh {
  guardadaId: string;
  gtfNumber: string;
  /** `AAAA-MM-DD` de la guía: la llegada no puede ser antes. */
  gtfDate: string | null;
  titular: string | null;
  permiso: string | null;
  destinatario: string | null;
  vencimiento: string | null;
  lineas: LineaDeIngresoTh[];
  totalM3: number;
  trozas: number;
  avisos: string[];
  /**
   * ADR-450: huella de la lista (orden, código y m³ de cada troza). Vuelve en
   * el POST tal cual; si la guía cambió en el Libro TH → 409 `GUIA_CAMBIO`.
   */
  huella: string;
}

/**
 * Por qué no se recibe desde acá, con su status: 409 choca con algo que ya
 * existe o cambió; 422 es un dato que no alcanza para registrarla.
 */
export type CodigoGuiaTh =
  | "YA_INGRESADA"
  | "YA_NO_ESTA"
  | "SIN_GUIA_TH"
  | "GUIA_ANULADA"
  | "OTRO_DESTINATARIO"
  | "OTRA_GUIA"
  | "TROZA_YA_EN_EL_LIBRO"
  | "GUIA_INCOMPLETA"
  /** 409 · la lista de la guía no es la que se contó (ADR-450). */
  | "GUIA_CAMBIO"
  /** 422 · el conteo (ADR-450): falta, sobra o repite una troza · no llegó ninguna · faltantes sin confirmar. */
  | CodigoConteo;

export interface RecibidaTh {
  ingresos: { id: string; libroNro: number | null; especie: string; volumeM3: number; pieces: number }[];
  trozas: number;
  totalM3: number;
  fecha: string;
  /** false = el ingreso quedó registrado pero la recepción falló (se dice por qué). */
  recibida: boolean;
  motivoSinRecibir: string | null;
  avisos: string[];
  /** ADR-450: cuántas trozas llegaron (las demás entraron como «no llegó»). */
  llegaron: number;
  /** Códigos de las que no llegaron (`N° <orden>` si la troza no tiene código). */
  noLlegaron: string[];
  /** Llegaron con otra medida (guardada en `recibida*`, la guía intacta). */
  distintas: number;
  /** m³ de lo que llegó: la medida de planta si la hay, si no la de la guía. */
  m3Recibido: number;
  /** `totalM3 − m3Recibido`. Positivo = falta madera. */
  brechaM3: number;
  /** El resumen del conteo (por especie incluido), el mismo que ve la pantalla. */
  resumen: ResumenConteo;
}

/** El mensaje del Libro TH después de emitir, según lo que pasó en el CTP. */
export function mensajeDelPase(estado: EstadoPaseAlCtp, detalle?: string): string {
  switch (estado) {
    case "creada":
      return "La guía quedó en tu Libro CTP para recibirla cuando llegue la madera.";
    case "ya_estaba":
      return "La guía ya estaba guardada en tu Libro CTP: ahí la recibes cuando llegue la madera.";
    case "ya_ingresada":
      return "Esta guía ya tiene su ingreso en tu Libro CTP.";
    case "sin_libro_ctp":
      return "";
    case "error":
      return "La guía quedó emitida, pero no se pudo pasar a tu Libro CTP. Ingrésala desde Ingresos.";
    default:
      return detalle ?? "";
  }
}
