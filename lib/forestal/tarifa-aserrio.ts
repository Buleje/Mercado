/**
 * La tarifa del servicio de aserrío (ADR-412).
 *
 * Pedido de Brandon (2026-09-13): al declarar la producción, «el precio de
 * aserrío de ese momento, variaciones de precio según el largo y dimensiones
 * (parámetros para que lo clasifique), precio variado según la especie
 * (parámetros para hacer los importes)», y que todo eso vaya a la cuenta del
 * dueño de la madera.
 *
 * ## Cómo se arma un precio
 *
 *   precio por PT = base (la de la especie, o la general)
 *                 + ajuste por tipo (Comercial, Paquetería larga…)
 *                 + ajuste por largo (tramos en pies)
 *
 * Tres tablas cortas y no una grilla especie × tipo × largo: con 14 especies,
 * 7 tipos y 4 tramos la grilla son 392 casilleros que nadie llena, y un
 * casillero vacío cobraría cero. Sumando, cada precio se explica en una línea
 * —«0.30 Tornillo + 0.05 Paquetería larga + 0.03 de 12 a 16 pies»—, que es lo
 * que se discute frente al dueño de la madera.
 *
 * ## Se clasifica solo
 *
 * El tipo sale de las MEDIDAS del paquete (`clasificarTipo`, la misma regla del
 * cubicador). Si el paquete no se dimensionó —medido en el tenant real: 27 de
 * 33 paquetes, 85.20 de 85.44 m³— sale del PRODUCTO declarado, que ya dice
 * «MADERA ASERRADA (COMERCIAL)». Nadie tipea el tipo dos veces.
 *
 * ## El precio es el de ESE día
 *
 * El tarifario guarda versiones con fecha de vigencia. Una corrida se cotiza
 * con la versión vigente en SU fecha, y el resultado se congela en la corrida:
 * subir la tarifa mañana no cambia lo que ya se le cobró a nadie.
 *
 * ## Sin precio no se cobra cero
 *
 * Sin tarifa vigente y sin precio a mano la cotización NO es cobrable. Cargar
 * S/ 0 en una cuenta corriente dice «no te debe nada», que es mentira — la
 * misma regla que el flete sin monto (ADR-322 §3).
 *
 * El PT sale del m³ × 424 (`PT_POR_M3`, la regla de la plaza).
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";
import { PT_POR_M3, ptDesdeM3, toFeet } from "./cubicacion";
import { clasificarTipo, ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";
import { tipoComercialDelProducto } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { hoyEnLima } from "./semana-de-registro";
import {
  explicarOrigenCliente,
  grupoDeEspecie,
  precioDelCliente,
  type GrupoEspecies,
  type OrigenPrecioCliente,
  type PrecioGrupo,
  type TarifaCliente,
} from "./precio-cliente";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿El texto es uno de los tipos que el cubicador reconoce? */
export function esTipoComercial(v: unknown): v is TipoComercial {
  return typeof v === "string" && (ORDEN_TIPO as readonly string[]).includes(v);
}

// ── Formas ───────────────────────────────────────────────────────────────────

/** Precio base propio de una especie: reemplaza a la base general. */
export interface PrecioEspecie {
  /** Clave normalizada (`claveEspecie`): «TORNILLO» y «Tornillo» son la misma. */
  clave: string;
  /** Como se muestra. */
  nombre: string;
  precioPt: number;
}

/** Cuánto suma (o resta) un tipo de pieza al precio por PT. */
export interface AjusteTipo {
  tipo: TipoComercial;
  ajustePt: number;
}

/**
 * Un tramo de largo. `desdePies` entra, `hastaPies` NO entra: una pieza de
 * 12 pies cae en «de 12 a 16», no en «de 8 a 12». `null` = sin tope.
 */
export interface TramoLargo {
  desdePies: number;
  hastaPies: number | null;
  ajustePt: number;
}

export interface VersionTarifa {
  id: string;
  /** Desde qué día rige, `AAAA-MM-DD`. Rige hasta que empieza la siguiente. */
  vigenteDesde: string;
  /** S/ por PT para las especies que no tienen precio propio. */
  basePt: number;
  especies: PrecioEspecie[];
  /**
   * Precio por GRUPO de especies (ADR-430): los grupos son de la planta (el
   * catálogo de especies) y una especie está en uno solo. Va después del
   * precio propio de la especie y antes del general. Opcional: las versiones
   * guardadas antes de ADR-430 no lo traen.
   */
  grupos?: PrecioGrupo[];
  tipos: AjusteTipo[];
  largos: TramoLargo[];
  nota: string | null;
  creadoPor: string | null;
  creadoEn: string | null;
}

export interface Tarifario {
  versiones: VersionTarifa[];
}

export const TARIFARIO_VACIO: Tarifario = { versiones: [] };

/** Tope por tenant: es un JSON en el KV, no una tabla (ADR-410 §1). */
export const MAX_VERSIONES = 120;

// ── Entrada ──────────────────────────────────────────────────────────────────

const precioPt = z.coerce.number().min(0, "Un precio no puede ser negativo").max(1000);
/* Un ajuste SÍ puede restar: la paquetería corta se asierra más barata. */
const ajustePt = z.coerce.number().min(-1000).max(1000);

export const versionTarifaInputSchema = z.object({
  id: z.string().trim().max(40).optional(),
  vigenteDesde: z.string().trim().regex(ISO_DIA, "La fecha de vigencia va como AAAA-MM-DD"),
  basePt: precioPt,
  especies: z
    .array(z.object({ nombre: z.string().trim().min(1).max(80), precioPt }))
    .max(300)
    .default([]),
  /* Opcional (no `.default`): las versiones que se arman a mano sin grupos
     —el borrador, las de antes de ADR-430— siguen valiendo tal cual. */
  grupos: z
    .array(z.object({ grupoId: z.string().trim().min(1).max(40), precioPt }))
    .max(50)
    .optional(),
  tipos: z
    .array(
      z.object({
        tipo: z.string().refine((v) => esTipoComercial(v), "Ese tipo de pieza no existe"),
        ajustePt,
      }),
    )
    .max(ORDEN_TIPO.length)
    .default([]),
  largos: z
    .array(
      z.object({
        desdePies: z.coerce.number().min(0).max(100),
        hastaPies: z.coerce.number().min(0).max(100).nullable(),
        ajustePt,
      }),
    )
    .max(20)
    .default([]),
  nota: z.string().trim().max(300).nullable().optional(),
});
export type VersionTarifaInput = z.infer<typeof versionTarifaInputSchema>;

export type RevisionVersion =
  | { ok: true; version: Omit<VersionTarifa, "id" | "creadoPor" | "creadoEn"> }
  | { ok: false; motivo: string };

/**
 * Revisa una versión ANTES de guardarla y la deja normalizada.
 *
 * Lo que se rechaza es lo que produciría dos precios para la misma pieza (dos
 * filas de la misma especie, tramos que se pisan) o ningún precio para nada.
 */
export function revisarVersion(input: VersionTarifaInput): RevisionVersion {
  const especies: PrecioEspecie[] = [];
  for (const e of input.especies) {
    const clave = claveEspecie(e.nombre);
    if (!clave) continue;
    if (especies.some((x) => x.clave === clave)) {
      return { ok: false, motivo: `«${e.nombre}» está dos veces: una especie tiene un solo precio.` };
    }
    especies.push({ clave, nombre: e.nombre.trim(), precioPt: r4(e.precioPt) });
  }

  const grupos: PrecioGrupo[] = [];
  for (const g of input.grupos ?? []) {
    if (grupos.some((x) => x.grupoId === g.grupoId)) {
      return { ok: false, motivo: "Un grupo está dos veces: tiene un solo precio." };
    }
    if (g.precioPt > 0) grupos.push({ grupoId: g.grupoId, precioPt: r4(g.precioPt) });
  }

  const tipos: AjusteTipo[] = [];
  for (const t of input.tipos) {
    if (!esTipoComercial(t.tipo)) return { ok: false, motivo: `El tipo «${t.tipo}» no existe.` };
    if (tipos.some((x) => x.tipo === t.tipo)) {
      return { ok: false, motivo: `«${t.tipo}» está dos veces: un tipo tiene un solo ajuste.` };
    }
    /* Un ajuste en cero no dice nada: se descarta en vez de guardarlo. */
    if (Math.abs(t.ajustePt) > 0) tipos.push({ tipo: t.tipo, ajustePt: r4(t.ajustePt) });
  }

  const largos = [...input.largos]
    .map((l) => ({ desdePies: r2(l.desdePies), hastaPies: l.hastaPies == null ? null : r2(l.hastaPies), ajustePt: r4(l.ajustePt) }))
    .sort((a, b) => a.desdePies - b.desdePies);
  for (let i = 0; i < largos.length; i++) {
    const l = largos[i];
    if (l.hastaPies != null && l.hastaPies <= l.desdePies) {
      return { ok: false, motivo: `El tramo ${etiquetaTramo(l)} termina antes de empezar.` };
    }
    const sig = largos[i + 1];
    if (sig && (l.hastaPies == null || sig.desdePies < l.hastaPies)) {
      return {
        ok: false,
        motivo: `Los tramos ${etiquetaTramo(l)} y ${etiquetaTramo(sig)} se pisan: una pieza no puede tener dos ajustes de largo.`,
      };
    }
  }

  if (!(input.basePt > 0) && !especies.some((e) => e.precioPt > 0) && grupos.length === 0) {
    return { ok: false, motivo: "Pon al menos un precio: el general, el de un grupo o el de una especie." };
  }

  return {
    ok: true,
    version: {
      vigenteDesde: input.vigenteDesde,
      basePt: r4(input.basePt),
      especies,
      grupos,
      tipos,
      largos,
      nota: input.nota?.trim() || null,
    },
  };
}

// ── Tarifario ────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Lee lo que haya en el KV sin confiar en su forma. Una versión rota se
 * descarta entera: cotizar con media tarifa cobraría mal sin avisar.
 */
export function normalizarTarifario(raw: unknown): Tarifario {
  const vs = (raw as { versiones?: unknown } | null)?.versiones;
  if (!Array.isArray(vs)) return TARIFARIO_VACIO;
  const versiones: VersionTarifa[] = [];
  for (const v of vs as Record<string, unknown>[]) {
    const vigenteDesde = typeof v?.vigenteDesde === "string" ? v.vigenteDesde : "";
    const basePt = num(v?.basePt);
    if (!ISO_DIA.test(vigenteDesde) || basePt == null || typeof v.id !== "string") continue;
    const arr = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
    versiones.push({
      id: v.id,
      vigenteDesde,
      basePt,
      especies: arr(v.especies)
        .map((e) => ({ clave: claveEspecie(String(e.nombre ?? e.clave ?? "")), nombre: String(e.nombre ?? ""), precioPt: num(e.precioPt) ?? -1 }))
        .filter((e) => e.clave && e.precioPt >= 0),
      grupos: arr(v.grupos)
        .map((g) => ({ grupoId: typeof g.grupoId === "string" ? g.grupoId : "", precioPt: num(g.precioPt) ?? -1 }))
        .filter((g) => g.grupoId && g.precioPt > 0),
      tipos: arr(v.tipos)
        .map((t) => ({ tipo: t.tipo, ajustePt: num(t.ajustePt) }))
        .filter((t): t is AjusteTipo => esTipoComercial(t.tipo) && t.ajustePt != null),
      largos: arr(v.largos)
        .map((l) => ({ desdePies: num(l.desdePies), hastaPies: l.hastaPies == null ? null : num(l.hastaPies), ajustePt: num(l.ajustePt) }))
        .filter((l): l is TramoLargo => l.desdePies != null && l.ajustePt != null)
        .sort((a, b) => a.desdePies - b.desdePies),
      nota: typeof v.nota === "string" ? v.nota : null,
      creadoPor: typeof v.creadoPor === "string" ? v.creadoPor : null,
      creadoEn: typeof v.creadoEn === "string" ? v.creadoEn : null,
    });
  }
  return { versiones: ordenar(versiones) };
}

/* Por fecha de vigencia; a igual fecha manda la guardada después. */
function ordenar(vs: VersionTarifa[]): VersionTarifa[] {
  return [...vs].sort(
    (a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || (a.creadoEn ?? "").localeCompare(b.creadoEn ?? ""),
  );
}

/**
 * Agrega una versión o reemplaza la del mismo día.
 *
 * Dos versiones con la misma fecha de vigencia no pueden convivir: ¿cuál rige
 * ese día? Guardar otra vez el mismo día es corregir la tarifa de ese día.
 */
export function guardarVersion(t: Tarifario, v: VersionTarifa): Tarifario {
  const resto = t.versiones.filter((x) => x.id !== v.id && x.vigenteDesde !== v.vigenteDesde);
  return { versiones: ordenar([...resto, v]).slice(-MAX_VERSIONES) };
}

export function quitarVersion(t: Tarifario, id: string): Tarifario {
  return { versiones: t.versiones.filter((v) => v.id !== id) };
}

/** La versión que regía ese día. `null` si el día es anterior a toda tarifa. */
export function versionVigente(t: Tarifario, fecha: string | null | undefined): VersionTarifa | null {
  const dia = (fecha ?? "").slice(0, 10);
  if (!ISO_DIA.test(dia)) return null;
  let vigente: VersionTarifa | null = null;
  for (const v of ordenar(t.versiones)) {
    if (v.vigenteDesde <= dia) vigente = v;
  }
  return vigente;
}

// ── Cotizar ──────────────────────────────────────────────────────────────────

/** Una porción de madera a cobrar: en la práctica, un paquete de la corrida. */
export interface BloqueACobrar {
  /** Código del paquete, o lo que la identifique en la explicación. */
  etiqueta: string;
  especie: string | null;
  volumenM3: number;
  /**
   * El PT declarado —la corrida vino en pie tablar, o el paquete guardó el que
   * se midió al cubicar (ADR-429)—: se cobra ESE número. Pasarlo por m³ y
   * volver lo cambia — `ptDesdeM3` redondea el m³ a 3 decimales, y 5000 PT
   * volverían como 4999.81.
   */
  pt?: number | null;
  productType?: string | null;
  espesorCm?: number | null;
  anchoCm?: number | null;
  largoM?: number | null;
}

export interface LineaCotizada {
  etiqueta: string;
  especie: string | null;
  tipo: TipoComercial | null;
  /** De dónde salió el tipo: las medidas del paquete o el producto declarado. */
  tipoDesde: "medidas" | "producto" | null;
  largoPies: number | null;
  pt: number;
  basePt: number;
  /**
   * De dónde salió la base. Los `cliente-*` son el trato del cliente (ADR-430):
   * reemplazan a la tarifa de la planta y NO llevan ajustes por tipo ni largo.
   */
  baseDesde: "especie" | "grupo" | "general" | "manual" | OrigenPrecioCliente;
  /** El grupo de especies cuando el precio salió de uno (del cliente o de la planta). */
  grupo?: string | null;
  ajusteTipoPt: number;
  ajusteLargoPt: number;
  /** El tramo que aplicó, ya como texto. */
  tramo: string | null;
  precioPt: number;
  importe: number;
}

export interface Cotizacion {
  versionId: string | null;
  /** La versión del trato del cliente que se usó, si alguna línea salió de él (ADR-430). */
  clienteTarifaId?: string | null;
  vigenteDesde: string | null;
  /** `true` si se cobró con un precio único puesto a mano. */
  manual: boolean;
  lineas: LineaCotizada[];
  pt: number;
  importe: number;
  /** `false` = no hay con qué cobrar: no se carga nada en la cuenta. */
  cobrable: boolean;
  avisos: string[];
}

/** Las medidas de un paquete alcanzan para clasificarlo. */
const conMedidas = (b: BloqueACobrar) =>
  (b.espesorCm ?? 0) > 0 && (b.anchoCm ?? 0) > 0 && (b.largoM ?? 0) > 0;

function tipoDelBloque(b: BloqueACobrar): { tipo: TipoComercial | null; desde: LineaCotizada["tipoDesde"] } {
  if (conMedidas(b)) {
    const t = clasificarTipo({
      espesor: Number(b.espesorCm),
      ancho: Number(b.anchoCm),
      largo: Number(b.largoM),
      uEspesor: "cm",
      uAncho: "cm",
      uLargo: "m",
    });
    /* «Otro» es no saber: se intenta con el producto antes de rendirse. */
    if (t !== "Otro") return { tipo: t, desde: "medidas" };
  }
  const delProducto = tipoComercialDelProducto(b.productType);
  return esTipoComercial(delProducto) ? { tipo: delProducto, desde: "producto" } : { tipo: null, desde: null };
}

/**
 * Cotiza el aserrío de unos bloques con una versión de la tarifa, o con un
 * precio único puesto a mano.
 *
 * El precio a mano manda sobre la tarifa y NO lleva ajustes: quien lo pone está
 * diciendo «a este le cobro 0.35 todo», que es un trato, no una tabla.
 */
export function cotizarAserrio(
  version: VersionTarifa | null,
  bloques: readonly BloqueACobrar[],
  opts: {
    precioManualPt?: number | null;
    /**
     * El trato vigente del cliente para el servicio de aserrío (ADR-430). Va
     * después del precio a mano y antes que la tarifa de la planta.
     */
    cliente?: TarifaCliente | null;
    /** Los grupos de especies de la planta (catálogo). Sin ellos no hay precio por grupo. */
    grupos?: readonly GrupoEspecies[];
  } = {},
): Cotizacion {
  const manual = opts.precioManualPt != null && opts.precioManualPt > 0 ? r4(opts.precioManualPt) : null;
  const grupos = opts.grupos ?? [];
  const avisos = new Set<string>();
  const lineas: LineaCotizada[] = [];
  let usoCliente = false;
  let usoPlanta = false;

  if (manual == null && !version && !opts.cliente) {
    avisos.add("No hay una tarifa que rija ese día: pon el precio a mano o carga la tarifa.");
  }

  for (const b of bloques) {
    const pt =
      b.pt != null && Number.isFinite(b.pt) ? r2(Math.max(0, b.pt)) : ptDesdeM3(Math.max(0, Number(b.volumenM3) || 0));
    const { tipo, desde } = tipoDelBloque(b);
    const largoPies = (b.largoM ?? 0) > 0 ? r2(toFeet(Number(b.largoM), "m")) : null;

    let basePt = 0;
    let baseDesde: LineaCotizada["baseDesde"] = "general";
    let grupo: string | null = null;
    let ajusteTipoPt = 0;
    let ajusteLargoPt = 0;
    let tramo: string | null = null;
    /* El trato del cliente (ADR-430): reemplaza entero a la planta — sin
       ajustes por tipo ni largo (decisión 1 de Brandon). */
    const delCliente = manual == null ? precioDelCliente(opts.cliente, grupos, b.especie, tipo) : null;

    if (manual != null) {
      basePt = manual;
      baseDesde = "manual";
    } else if (delCliente) {
      basePt = delCliente.precioPt;
      baseDesde = delCliente.desde;
      grupo = delCliente.grupo;
      usoCliente = true;
    } else if (version) {
      usoPlanta = true;
      const clave = claveEspecie(b.especie);
      const propia = clave ? version.especies.find((e) => e.clave === clave) : undefined;
      const suGrupo = grupoDeEspecie(grupos, b.especie);
      const delGrupo = suGrupo ? (version.grupos ?? []).find((g) => g.grupoId === suGrupo.id && g.precioPt > 0) : undefined;
      if (propia) {
        basePt = propia.precioPt;
        baseDesde = "especie";
      } else if (suGrupo && delGrupo) {
        basePt = delGrupo.precioPt;
        baseDesde = "grupo";
        grupo = suGrupo.nombre;
      } else {
        basePt = version.basePt;
        if (!(basePt > 0)) avisos.add(`${b.especie?.trim() || "La madera sin especie"} no tiene precio en la tarifa.`);
      }

      if (version.tipos.length > 0) {
        if (tipo) ajusteTipoPt = version.tipos.find((t) => t.tipo === tipo)?.ajustePt ?? 0;
        /* «Madera» y no «paquetes»: una corrida que declaró sin paquetes se
           cobra entera como un solo bloque, y el aviso tiene que leerse igual. */
        else avisos.add("Hay madera que no dice de qué tipo es: se cobró sin el ajuste por tipo.");
      }

      if (version.largos.length > 0) {
        if (largoPies != null) {
          const t = version.largos.find(
            (l) => largoPies >= l.desdePies && (l.hastaPies == null || largoPies < l.hastaPies),
          );
          if (t) {
            ajusteLargoPt = t.ajustePt;
            tramo = etiquetaTramo(t);
          }
        } else {
          avisos.add("Hay madera sin largo medido: se cobró sin el ajuste por largo.");
        }
      }
    }

    /* Un ajuste negativo puede bajar el precio, nunca volverlo plata a favor
       del dueño de la madera. */
    const precio = Math.max(0, r4(basePt + ajusteTipoPt + ajusteLargoPt));
    lineas.push({
      etiqueta: b.etiqueta,
      especie: b.especie,
      tipo,
      tipoDesde: desde,
      largoPies,
      pt,
      basePt,
      baseDesde,
      grupo,
      ajusteTipoPt,
      ajusteLargoPt,
      tramo,
      precioPt: precio,
      importe: r2(pt * precio),
    });
  }

  const importe = r2(lineas.reduce((a, l) => a + l.importe, 0));
  if (manual == null && opts.cliente && !version && lineas.some((l) => !(l.precioPt > 0))) {
    avisos.add("Hay madera que el trato del cliente no cubre y no hay tarifa de la planta que rija ese día.");
  }
  return {
    versionId: manual != null || !usoPlanta ? null : (version?.id ?? null),
    clienteTarifaId: usoCliente ? (opts.cliente?.id ?? null) : null,
    vigenteDesde: manual != null ? null : usoPlanta ? (version?.vigenteDesde ?? null) : usoCliente ? (opts.cliente?.vigenteDesde ?? null) : (version?.vigenteDesde ?? null),
    manual: manual != null,
    lineas,
    pt: r2(lineas.reduce((a, l) => a + l.pt, 0)),
    importe,
    cobrable: importe > 0,
    avisos: [...avisos],
  };
}

/** Cómo se lee la unidad de una corrida. Vacía = m³, como la lee el resto del libro. */
function unidadDeCantidad(unit: string | null | undefined): "m3" | "pt" | "otra" {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u || u === "m3" || u === "m³") return "m3";
  return u === "pt" ? "pt" : "otra";
}

/**
 * ¿La corrida no tiene de dónde sacar el PT? Los paquetes siempre vienen en m³;
 * sin paquetes manda la unidad: m³ o PT se cobran, kg o unidades no. Tomar
 * 5000 kg como 5000 m³ cobraría más de dos millones de PT.
 */
export function corridaSinPt(unit: string | null | undefined, hayPaquetes: boolean): boolean {
  return !hayPaquetes && unidadDeCantidad(unit) === "otra";
}

/**
 * Los bloques de una corrida: sus paquetes, o —si declaró sin paquetes— la
 * corrida entera como un solo bloque con su producto.
 *
 * Sin paquetes, la cantidad se lee en su unidad: en PT va el PT declarado
 * (y el m³ sale de PT ÷ 424, la regla de la plaza); en kg o en unidades no
 * hay bloque — `corridaSinPt` dice por qué.
 */
export function bloquesDeCorrida(
  corrida: {
    lineNo?: number | null;
    speciesCommon: string | null;
    productType: string | null;
    quantity: number | null;
    /** Ausente = m³: así lo manda la pantalla que cubica. */
    unit?: string | null;
  },
  paquetes: readonly {
    codigo: string;
    productType?: string | null;
    volumenM3: number;
    espesorCm?: number | null;
    anchoCm?: number | null;
    largoM?: number | null;
    /**
     * El PT medido al cubicar, cuando el paquete lo guardó (ADR-429). Manda
     * sobre el que sale del m³: `ptDesdeM3` redondea el volumen a 3 decimales
     * y corría ±0,21 PT por paquete, así que PT × precio no cuadraba con el
     * importe. Ausente o `null` (paquete viejo) = el cálculo de siempre.
     */
    pieTablar?: number | null;
  }[],
): BloqueACobrar[] {
  if (paquetes.length > 0) {
    return paquetes.map((p) => ({
      etiqueta: p.codigo,
      especie: corrida.speciesCommon,
      volumenM3: Number(p.volumenM3) || 0,
      ...(p.pieTablar != null && Number.isFinite(p.pieTablar) && p.pieTablar > 0 ? { pt: p.pieTablar } : {}),
      productType: p.productType ?? corrida.productType,
      espesorCm: p.espesorCm ?? null,
      anchoCm: p.anchoCm ?? null,
      largoM: p.largoM ?? null,
    }));
  }
  const q = Number(corrida.quantity ?? 0);
  const unidad = unidadDeCantidad(corrida.unit);
  if (!(q > 0) || unidad === "otra") return [];
  return [
    {
      etiqueta: corrida.lineNo != null ? `Corrida N° ${corrida.lineNo}` : "Corrida",
      especie: corrida.speciesCommon,
      volumenM3: unidad === "pt" ? r4(q / PT_POR_M3) : q,
      ...(unidad === "pt" ? { pt: q } : {}),
      productType: corrida.productType,
    },
  ];
}

// ── Lo que viaja entre la pantalla y el servidor ─────────────────────────────

/**
 * Lo que la pantalla elige al declarar: a quién se le cobra y, si se pactó, un
 * precio único. `duenoParteId: null` = madera del centro, no se cobra.
 */
export interface CobroAserrioValor {
  duenoParteId: string | null;
  precioManualPt: number | null;
}

/**
 * Lo que responde el servidor después de cobrar (ADR-412 §4).
 *
 * `cobrado: false` no es un error: puede no haber dueño, o no haber precio. La
 * declaración del libro ya se guardó igual; `motivo` dice por qué no se cargó.
 */
export interface ResultadoCobro {
  cobrado: boolean;
  importe: number | null;
  parteNombre: string | null;
  movimientoId: string | null;
  motivo: string | null;
  cotizacion: Cotizacion | null;
  /** Qué se hizo con el cargo de la corrida en la cuenta. */
  accion?: "crear" | "actualizar" | "baja" | "nada";
  /**
   * El monto del cargo vivo que se dio de baja (`accion: "baja"`). Sin esto,
   * «sin cobrar» se lee igual cuando nunca se debió nada y cuando se borró una deuda.
   */
  importeDadoDeBaja?: number | null;
  /** El monto del cargo vivo ANTES de tocarlo (`null` = no había). */
  importeAnterior?: number | null;
  /** `accion: "actualizar"` al mismo importe y a la misma parte: ya estaba cobrada así. */
  sinCambio?: boolean;
}

// ── Cómo se lee ──────────────────────────────────────────────────────────────

const precioTxt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const firmado = (n: number) => `${n < 0 ? "−" : "+"} ${precioTxt(Math.abs(n))}`;

export function etiquetaTramo(t: Pick<TramoLargo, "desdePies" | "hastaPies">): string {
  if (t.hastaPies == null) return `${t.desdePies} pies o más`;
  if (t.desdePies <= 0) return `menos de ${t.hastaPies} pies`;
  return `de ${t.desdePies} a ${t.hastaPies} pies`;
}

/** «0.30 Tornillo + 0.05 Paquetería larga + 0.03 de 12 a 16 pies = S/ 0.38 por PT». */
export function explicarPrecio(l: LineaCotizada): string {
  if (l.baseDesde.startsWith("cliente-")) {
    /* El trato del cliente no lleva ajustes: el precio ES la base (ADR-430). */
    return `S/ ${precioTxt(l.precioPt)} por PT (${explicarOrigenCliente({ precioPt: l.precioPt, desde: l.baseDesde as OrigenPrecioCliente, grupo: l.grupo ?? null }, l.especie, l.tipo)})`;
  }
  const partes = [
    l.baseDesde === "manual"
      ? `${precioTxt(l.basePt)} a mano`
      : l.baseDesde === "especie"
        ? `${precioTxt(l.basePt)} ${l.especie ?? ""}`.trim()
        : l.baseDesde === "grupo"
          ? `${precioTxt(l.basePt)} grupo ${l.grupo ?? ""}`.trim()
          : `${precioTxt(l.basePt)} general`,
  ];
  if (l.ajusteTipoPt !== 0 && l.tipo) partes.push(`${firmado(l.ajusteTipoPt)} ${l.tipo}`);
  if (l.ajusteLargoPt !== 0 && l.tramo) partes.push(`${firmado(l.ajusteLargoPt)} ${l.tramo}`);
  if (partes.length === 1) {
    /* Sin ajustes el precio ES la base: repetir el número entre paréntesis
       («S/ 0.45 por PT (0.45 a mano)») no explica nada. Se dice de dónde sale. */
    const origen =
      l.baseDesde === "manual"
        ? "precio a mano"
        : l.baseDesde === "especie"
          ? `precio de ${l.especie?.trim() || "la especie"}`
          : l.baseDesde === "grupo"
            ? `precio del grupo ${l.grupo ?? ""}`.trim()
            : "precio general";
    return `S/ ${precioTxt(l.precioPt)} por PT (${origen})`;
  }
  return `${partes.join(" ")} = S/ ${precioTxt(l.precioPt)} por PT`;
}

// ── Borrador desde la producción ─────────────────────────────────────────────

/** Una corrida de producción, como la lee el borrador (la cantidad, en su unidad). */
export interface CorridaParaBorrador {
  id: string;
  lineNo?: number | null;
  speciesCommon: string | null;
  productType: string | null;
  quantity: number | null;
  /** Ausente = m³. En PT pesa su m³ (PT ÷ 424); en kg o unidades sin paquetes no pesa. */
  unit?: string | null;
  /** El día de la corrida (`AAAA-MM-DD`), leído como lo lee el cobro. */
  fecha?: string | null;
}

/** Un paquete de esas corridas. */
export interface PaqueteParaBorrador {
  ctpEntryId: string;
  codigo: string;
  productType?: string | null;
  volumenM3: number;
  espesorCm?: number | null;
  anchoCm?: number | null;
  largoM?: number | null;
}

/**
 * De qué está hecha la producción que armó el borrador. Va al lado de los
 * casilleros para que cada precio se ponga sabiendo cuánto pesa: el de una
 * especie con el 99 % del volumen no se decide igual que el de una con el 1 %.
 */
export interface BaseDelBorrador {
  corridas: number;
  m3: number;
  especies: { nombre: string; m3: number }[];
  tipos: { tipo: TipoComercial; m3: number }[];
  /**
   * La corrida más vieja que armó el borrador: desde su día rige la versión,
   * para que la tanda la cobre a ella y a todas las siguientes. `null` = no
   * hubo corridas con fecha, y rige desde hoy.
   */
  desdeCorrida?: { lineNo: number | null; fecha: string } | null;
}

export const NOTA_BORRADOR = "Borrador armado con tu producción: pon los precios";

/**
 * El día `meses` meses antes de `hoy` (`AAAA-MM-DD`). Si ese mes no tiene el
 * día, el último del mes: 31 de agosto menos 6 meses es el 28 de febrero, no
 * el 3 de marzo que daba `setUTCMonth`.
 */
export function desdeHaceMeses(hoy: string, meses: number): string {
  const [y, m, d] = hoy.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) - meses;
  const anio = Math.floor(total / 12);
  const mes = total - anio * 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${anio}-${dos(mes + 1)}-${dos(Math.min(d, ultimoDia))}`;
}

/** Los tramos de la plaza se dicen de 4 en 4 pies: «de 8 a 12», «de 12 a 16». */
const PASO_TRAMO_PIES = 4;

function analizarProduccion(
  corridas: readonly CorridaParaBorrador[],
  paquetes: readonly PaqueteParaBorrador[],
  nombres?: ReadonlyMap<string, string>,
) {
  const porCorrida = new Map<string, PaqueteParaBorrador[]>();
  for (const p of paquetes) porCorrida.set(p.ctpEntryId, [...(porCorrida.get(p.ctpEntryId) ?? []), p]);

  const especies = new Map<string, { m3: number; grafias: Map<string, number> }>();
  const tipos = new Map<TipoComercial, number>();
  const largosPies: number[] = [];
  let m3 = 0;

  for (const c of corridas) {
    /* Los mismos bloques que se cobran: si la corrida tiene paquetes manda el
       paquete (su producto y sus medidas), si no, la corrida entera. */
    for (const b of bloquesDeCorrida(c, porCorrida.get(c.id) ?? [])) {
      const v = Math.max(0, Number(b.volumenM3) || 0);
      m3 += v;
      const clave = claveEspecie(b.especie);
      if (clave) {
        const e = especies.get(clave) ?? { m3: 0, grafias: new Map<string, number>() };
        const grafia = (b.especie ?? "").trim();
        e.m3 += v;
        e.grafias.set(grafia, (e.grafias.get(grafia) ?? 0) + v);
        especies.set(clave, e);
      }
      const { tipo } = tipoDelBloque(b);
      if (tipo) tipos.set(tipo, (tipos.get(tipo) ?? 0) + v);
      if ((b.largoM ?? 0) > 0) largosPies.push(r2(toFeet(Number(b.largoM), "m")));
    }
  }

  return {
    corridas: corridas.length,
    m3: r4(m3),
    /* Como la escribe el catálogo; si el catálogo no la conoce, la grafía con
       más volumen del libro. De la que más pesa a la que menos. */
    especies: [...especies.entries()]
      .map(([clave, e]) => ({
        clave,
        nombre: nombres?.get(clave) ?? [...e.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0],
        m3: r4(e.m3),
      }))
      .sort((a, b) => b.m3 - a.m3),
    tipos: ORDEN_TIPO.filter((t) => tipos.has(t)).map((tipo) => ({ tipo, m3: r4(tipos.get(tipo) ?? 0) })),
    largosPies,
  };
}

/**
 * Tramos de 4 en 4 pies que cubren los largos medidos; `[]` si no se midió
 * ningún largo — sin medidas no hay de dónde sugerir, e inventar tramos haría
 * pensar que el largo ya se está cobrando.
 */
export function tramosSugeridos(largosPies: readonly number[]): { desdePies: number; hastaPies: number | null; ajustePt: number }[] {
  /* Más de 100 pies (30 m) no es una pieza aserrada: es un dato mal cargado. */
  const ls = largosPies.filter((l) => Number.isFinite(l) && l > 0 && l <= 100);
  if (ls.length === 0) return [];
  const min = Math.min(...ls);
  const max = Math.max(...ls);
  const cortes: number[] = [];
  for (let c = Math.floor(min / PASO_TRAMO_PIES) * PASO_TRAMO_PIES + PASO_TRAMO_PIES; c <= max; c += PASO_TRAMO_PIES) {
    cortes.push(c);
  }
  /* Todos en el mismo tramo de 4 pies: se parte en su piso para que el tramo
     medido quede separado de lo más corto. */
  if (cortes.length === 0) {
    const piso = Math.floor(min / PASO_TRAMO_PIES) * PASO_TRAMO_PIES;
    if (piso > 0) cortes.push(piso);
  }
  const tramos: { desdePies: number; hastaPies: number | null; ajustePt: number }[] = [];
  let desde = 0;
  /* Tope del schema: 20 tramos. */
  for (const c of cortes.slice(0, 19)) {
    tramos.push({ desdePies: desde, hastaPies: c, ajustePt: 0 });
    desde = c;
  }
  tramos.push({ desdePies: desde, hastaPies: null, ajustePt: 0 });
  return tramos;
}

/**
 * Un borrador de tarifa armado con la producción real: las especies, los
 * tipos y —si hay paquetes con largo— los tramos que de verdad aparecen.
 *
 * **Todos los precios en 0.** Los precios los decide el dueño del aserradero:
 * un número puesto acá parecería una tarifa sugerida y terminaría cobrándose.
 * Por eso `revisarVersion` lo rechaza tal cual —«pon al menos un precio»—, que
 * es justo lo que tiene que pasar.
 *
 * **Rige desde el día de la corrida más vieja que lo armó.** Una corrida se
 * cobra con la tarifa de SU fecha: con `vigenteDesde` = hoy, la producción que
 * originó el borrador quedaba toda antes de la vigencia y la tanda cobraba 0.
 * Sin corridas con fecha, hoy.
 */
export function borradorDeTarifa(
  corridas: readonly CorridaParaBorrador[],
  paquetes: readonly PaqueteParaBorrador[],
  opts: { hoy?: string; nombres?: ReadonlyMap<string, string> } = {},
): VersionTarifaInput {
  const a = analizarProduccion(corridas, paquetes, opts.nombres);
  return {
    vigenteDesde: corridaMasVieja(corridas)?.fecha ?? opts.hoy ?? hoyEnLima(),
    basePt: 0,
    especies: a.especies.map((e) => ({ nombre: e.nombre, precioPt: 0 })),
    tipos: a.tipos.map((t) => ({ tipo: t.tipo, ajustePt: 0 })),
    largos: tramosSugeridos(a.largosPies),
    nota: NOTA_BORRADOR,
  };
}

/** La corrida con la fecha más vieja; a igual día, la de N° más bajo. `null` si ninguna trae fecha. */
function corridaMasVieja(corridas: readonly CorridaParaBorrador[]): { lineNo: number | null; fecha: string } | null {
  let masVieja: { lineNo: number | null; fecha: string } | null = null;
  for (const c of corridas) {
    const fecha = (c.fecha ?? "").slice(0, 10);
    if (!ISO_DIA.test(fecha)) continue;
    const lineNo = c.lineNo ?? null;
    const antes =
      !masVieja ||
      fecha < masVieja.fecha ||
      (fecha === masVieja.fecha && (lineNo ?? Infinity) < (masVieja.lineNo ?? Infinity));
    if (antes) masVieja = { lineNo, fecha };
  }
  return masVieja;
}

/** Lo que pesa cada especie y cada tipo en la producción del borrador, y desde qué corrida rige. */
export function baseDelBorrador(
  corridas: readonly CorridaParaBorrador[],
  paquetes: readonly PaqueteParaBorrador[],
  nombres?: ReadonlyMap<string, string>,
): BaseDelBorrador {
  const a = analizarProduccion(corridas, paquetes, nombres);
  return {
    corridas: a.corridas,
    m3: a.m3,
    especies: a.especies.map(({ nombre, m3 }) => ({ nombre, m3 })),
    tipos: a.tipos,
    desdeCorrida: corridaMasVieja(corridas),
  };
}
