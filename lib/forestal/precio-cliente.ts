/**
 * Precios por cliente y grupos de especies (ADR-430, Brandon 2026-09-22).
 *
 * Pedido: «en el Directorio, para ese cliente, a cuánto se le vende el pie de
 * servicio de aserrío o de madera; por tipo (comercial 0.50), por especie
 * (Tornillo 0.60, Anacaspi 1.20); dos modos: Global (toda especie a 0.50) o
 * por grupos que yo creo, y lo demás al general; que al cubicar, elegir el
 * cliente ponga solo ese precio».
 *
 * Decisiones de Brandon (22-09):
 *  1. El precio del cliente REEMPLAZA a la tarifa de la planta: «0.50 toda
 *     especie» es 0.50, sin los recargos por tipo o largo de la planta.
 *  2. Los grupos son DE LA PLANTA (catálogo de especies) y cada especie está
 *     en UN solo grupo: nunca hay dos precios en conflicto para una especie.
 *  3. Gana la especie o el grupo; el precio por TIPO sólo se usa si la
 *     especie no tiene precio propio (ni por especie ni por grupo).
 *  4. La deuda va siempre al cliente (el cargo lleva el permiso anotado).
 *
 * «Global» y «Por grupos» no son una columna: Global es no tener grupos (sólo
 * `basePt`), y Por grupos es tener grupos con `basePt` como «lo demás». Un
 * modo guardado aparte permitiría un «global» con grupos cargados.
 *
 * PURO y client-safe: lo usan la pantalla (vista previa, cubicador) y el
 * servidor (el cobro) con los MISMOS argumentos.
 */
import { z } from "zod";
import { claveEspecie } from "./loth-constants";
import type { TipoComercial } from "./cubicacion-tipo";

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Un día `AAAA-MM-DD` que existe en el calendario. El regex solo deja pasar
 * «2026-02-31» (JavaScript lo corre al 3 de marzo en silencio y la auditoría
 * diría otra fecha) y «2026-13-01» (500 al guardar): el ida y vuelta los delata.
 */
export const diaDelCalendario = z
  .string()
  .trim()
  .regex(ISO_DIA, "La fecha va como AAAA-MM-DD")
  .refine((d) => {
    const t = new Date(`${d}T00:00:00.000Z`);
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, "Esa fecha no existe en el calendario");
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Qué se le cobra al cliente: el servicio de aserrío o la madera vendida. */
export type ServicioPrecio = "aserrio" | "venta";
export const SERVICIOS_PRECIO: readonly ServicioPrecio[] = ["aserrio", "venta"];
export const ETIQUETA_SERVICIO_PRECIO: Record<ServicioPrecio, string> = {
  aserrio: "Servicio de aserrío",
  venta: "Venta de madera",
};

/** Un grupo de especies de la planta: «Duras: Anacaspi, Shihuahuaco». */
export interface GrupoEspecies {
  id: string;
  nombre: string;
  /** Claves normalizadas (`claveEspecie`). Una especie está en UN solo grupo. */
  claves: string[];
}

export interface PrecioGrupo {
  grupoId: string;
  precioPt: number;
}
export interface PrecioEspecieCliente {
  clave: string;
  nombre: string;
  precioPt: number;
}
export interface PrecioTipoCliente {
  tipo: TipoComercial;
  precioPt: number;
}

/** Una versión del trato con un cliente, para un servicio, desde una fecha. */
export interface TarifaCliente {
  id: string;
  parteId: string;
  servicio: ServicioPrecio;
  /** `AAAA-MM-DD`. Rige hasta que empieza la siguiente del mismo cliente y servicio. */
  vigenteDesde: string;
  /** El «Global» del cliente (o «lo demás» cuando hay grupos). `null` = sin global. */
  basePt: number | null;
  grupos: PrecioGrupo[];
  especies: PrecioEspecieCliente[];
  tipos: PrecioTipoCliente[];
  nota: string | null;
}

export type OrigenPrecioCliente = "cliente-especie" | "cliente-grupo" | "cliente-tipo" | "cliente-general";

export interface PrecioResuelto {
  precioPt: number;
  desde: OrigenPrecioCliente;
  /** Nombre del grupo cuando el precio salió de un grupo. */
  grupo: string | null;
}

/** El grupo de la planta al que pertenece una especie, o `null`. */
export function grupoDeEspecie(grupos: readonly GrupoEspecies[], especie: string | null | undefined): GrupoEspecies | null {
  const clave = claveEspecie(especie);
  if (!clave) return null;
  return grupos.find((g) => g.claves.includes(clave)) ?? null;
}

/**
 * El precio que el cliente tiene pactado para esta pieza, o `null` si su trato
 * no la cubre (entonces rige la tarifa de la planta).
 *
 * Orden (decisión 3): especie → grupo → tipo → su global. Un precio en cero o
 * negativo no cuenta: «no pactado» no es «gratis».
 */
export function precioDelCliente(
  tarifa: TarifaCliente | null | undefined,
  grupos: readonly GrupoEspecies[],
  especie: string | null | undefined,
  tipo: TipoComercial | null | undefined,
): PrecioResuelto | null {
  if (!tarifa) return null;
  const clave = claveEspecie(especie);
  const propia = clave ? tarifa.especies.find((e) => e.clave === clave && e.precioPt > 0) : undefined;
  if (propia) return { precioPt: r4(propia.precioPt), desde: "cliente-especie", grupo: null };
  const grupo = grupoDeEspecie(grupos, especie);
  const delGrupo = grupo ? tarifa.grupos.find((g) => g.grupoId === grupo.id && g.precioPt > 0) : undefined;
  if (grupo && delGrupo) return { precioPt: r4(delGrupo.precioPt), desde: "cliente-grupo", grupo: grupo.nombre };
  const delTipo = tipo ? tarifa.tipos.find((t) => t.tipo === tipo && t.precioPt > 0) : undefined;
  if (delTipo) return { precioPt: r4(delTipo.precioPt), desde: "cliente-tipo", grupo: null };
  if (tarifa.basePt != null && tarifa.basePt > 0) return { precioPt: r4(tarifa.basePt), desde: "cliente-general", grupo: null };
  return null;
}

/**
 * La versión del trato que regía ese día para ese cliente y servicio. Entre
 * dos del mismo día manda la que viene después en la lista (la guardada
 * después): el servidor las entrega ordenadas por fecha y alta.
 */
export function tarifaVigente(
  tarifas: readonly TarifaCliente[],
  servicio: ServicioPrecio,
  fecha: string | null | undefined,
): TarifaCliente | null {
  const dia = (fecha ?? "").slice(0, 10);
  if (!ISO_DIA.test(dia)) return null;
  let vigente: TarifaCliente | null = null;
  for (const t of tarifas) {
    if (t.servicio !== servicio || t.vigenteDesde > dia) continue;
    if (!vigente || t.vigenteDesde >= vigente.vigenteDesde) vigente = t;
  }
  return vigente;
}

/** Cómo se cuenta el origen del precio, en palabras del aserradero. */
export function explicarOrigenCliente(p: PrecioResuelto, especie?: string | null, tipo?: string | null): string {
  switch (p.desde) {
    case "cliente-especie":
      return `precio del cliente para ${especie?.trim() || "la especie"}`;
    case "cliente-grupo":
      return `precio del cliente para el grupo ${p.grupo ?? ""}`.trim();
    case "cliente-tipo":
      return `precio del cliente para ${tipo ?? "el tipo"}`;
    default:
      return "precio general del cliente";
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

const precioPt = z.coerce.number().positive("Un precio pactado es mayor que cero").max(1000);

const MAX_ESPECIES_EN_GRUPOS = 500;

/** Los grupos de la planta, tal como se guardan en el catálogo de especies. */
export const gruposEspeciesSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(40),
      nombre: z.string().trim().min(1).max(60),
      especies: z.array(z.string().trim().min(1).max(80)).max(300),
    }),
  )
  .max(50)
  .superRefine((grupos, ctx) => {
    const nombres = new Set<string>();
    const ids = new Set<string>();
    const dueno = new Map<string, string>();
    for (const g of grupos) {
      /* Dos grupos con el mismo id son uno solo para los precios: la especie
         del segundo quedaba en dos grupos a la vez (decisión 2). */
      if (ids.has(g.id)) ctx.addIssue({ code: "custom", message: `El grupo «${g.nombre}» repite el identificador de otro.` });
      ids.add(g.id);
      const n = claveEspecie(g.nombre);
      if (nombres.has(n)) ctx.addIssue({ code: "custom", message: `El grupo «${g.nombre}» está dos veces.` });
      nombres.add(n);
      for (const e of g.especies) {
        const c = claveEspecie(e);
        if (!c) continue;
        const otro = dueno.get(c);
        if (otro && otro !== g.id) {
          ctx.addIssue({ code: "custom", message: `«${e}» está en dos grupos: una especie va en un solo grupo.` });
        }
        dueno.set(c, g.id);
      }
    }
    /* Se guardan en el KV del catálogo: 50 × 300 serían 15 000 nombres en un JSON. */
    if (dueno.size > MAX_ESPECIES_EN_GRUPOS) {
      ctx.addIssue({ code: "custom", message: `Los grupos suman más de ${MAX_ESPECIES_EN_GRUPOS} especies.` });
    }
  });

export type GruposEspeciesInput = z.infer<typeof gruposEspeciesSchema>;

/** De la entrada validada a lo que se guarda: claves normalizadas y sin repetir. */
export function normalizarGrupos(input: GruposEspeciesInput): GrupoEspecies[] {
  return input.map((g) => ({
    id: g.id,
    nombre: g.nombre.trim(),
    claves: [...new Set(g.especies.map((e) => claveEspecie(e)).filter(Boolean))],
  }));
}

/** Cuerpo de `POST /api/admin/forestal/tarifas-cliente`: una versión nueva. */
export const tarifaClienteInputSchema = z
  .object({
    parteId: z.string().trim().min(1).max(64),
    servicio: z.enum(["aserrio", "venta"]),
    vigenteDesde: diaDelCalendario,
    basePt: precioPt.nullable(),
    grupos: z.array(z.object({ grupoId: z.string().trim().min(1).max(40), precioPt })).max(50).default([]),
    especies: z.array(z.object({ nombre: z.string().trim().min(1).max(80), precioPt })).max(300).default([]),
    tipos: z.array(z.object({ tipo: z.string().trim().min(1).max(40), precioPt })).max(10).default([]),
    nota: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((t, ctx) => {
    if (t.basePt == null && t.grupos.length === 0 && t.especies.length === 0 && t.tipos.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pon al menos un precio: el global, el de un grupo, una especie o un tipo." });
    }
    const vistas = new Set<string>();
    for (const e of t.especies) {
      const c = claveEspecie(e.nombre);
      if (vistas.has(c)) ctx.addIssue({ code: "custom", message: `«${e.nombre}» está dos veces: una especie tiene un solo precio.` });
      vistas.add(c);
    }
    const gs = new Set<string>();
    for (const g of t.grupos) {
      if (gs.has(g.grupoId)) ctx.addIssue({ code: "custom", message: "Un grupo está dos veces: tiene un solo precio." });
      gs.add(g.grupoId);
    }
    const ts = new Set<string>();
    for (const x of t.tipos) {
      if (ts.has(x.tipo)) ctx.addIssue({ code: "custom", message: `«${x.tipo}» está dos veces: un tipo tiene un solo precio.` });
      ts.add(x.tipo);
    }
  });

export type TarifaClienteInput = z.infer<typeof tarifaClienteInputSchema>;
