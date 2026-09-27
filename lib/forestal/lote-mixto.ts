/**
 * lote-mixto.ts — la pila escaneada de varias especies (ADR-441).
 *
 * Brandon (2026-09-26): «en Consumos quiero activar la cámara para escanear el
 * QR de las trozas; se almacenarán en un lote mixto con varias especies; al
 * terminar, de ese lote mixto se crearán lotes de especies individuales».
 *
 * El mixto vive en el servidor (`ForestLoteMixtoDB`) para que varios equipos y
 * días sumen a la misma pila. Acá está lo que la pantalla y el servidor tienen
 * que decir IGUAL: el contrato (Zod), el correlativo, las tarjetas por
 * especie+permiso y el plan de reparto. El agrupamiento NO se reescribe: sale
 * de `gruposDeLaPila`/`lotesQueAceptan` (lote-por-escaneo.ts), la misma regla
 * que ya usa el armado por escaneo.
 *
 * Reglas (ADR-441):
 *   · LM1 — una troza está en UN mixto (`WoodEntryTroza.loteMixtoId`).
 *   · LM2 — en el mixto O en un lote de aserrío, nunca en los dos.
 *   · LM3 — apartar sigue las reglas de un lote (`motivoNoElegible`).
 *   · LM4 — una troza apartada no entra a un lote ni se consume: «repártelo».
 *
 * PURO y client-safe.
 */

import { z } from "zod";
import type { TrozaConsumible } from "./consumo-trozas";
import { pieTablarAserrableDe } from "./cubicacion";
import { ptDeTroza } from "./cubicacion-oxapampa";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { gruposDeLaPila, lotesQueAceptan, type GrupoDeLaPila } from "./lote-por-escaneo";

export const ESTADOS_LOTE_MIXTO = ["abierto", "repartido", "anulado"] as const;
export type EstadoLoteMixto = (typeof ESTADOS_LOTE_MIXTO)[number];

/** Tope de trozas por pedido: una pila grande se aparta en tandas. */
export const MAX_TROZAS_POR_PEDIDO = 500;

// ── Correlativo ─────────────────────────────────────────────────────────────

const PREFIJO = "LM";

/** LM-2026-001: el prefijo del año, para buscar el último. */
export function prefijoLoteMixto(anio: number): string {
  return `${PREFIJO}-${anio}-`;
}

/**
 * El siguiente código del año a partir de los que ya existen (borrados
 * incluidos: un libro numerado con huecos se explica, uno con dos LM-2026-007
 * distintos no). Se compara por NÚMERO, no por texto: «LM-2026-1000» ordena
 * antes que «LM-2026-999» como cadena.
 */
export function siguienteCodigoLoteMixto(existentes: readonly string[], anio: number): string {
  const prefijo = prefijoLoteMixto(anio);
  let max = 0;
  for (const c of existentes) {
    if (!c.startsWith(prefijo)) continue;
    const n = Number(c.slice(prefijo.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(3, "0")}`;
}

/**
 * ¿La reserva sigue viva? Mismo criterio que el resto del libro: se mira el
 * ESTADO del mixto, no el id pelado. Una troza que apunta a un mixto repartido,
 * anulado o borrado está libre.
 */
export function mixtoVivo(
  m: { status: string; deletedAt?: Date | string | null } | null | undefined,
): boolean {
  return Boolean(m) && m!.status === "abierto" && !m!.deletedAt;
}

/** Cuántos códigos se nombran por mixto en un rechazo; el resto va como «y N más». */
const NOMBRADAS_POR_MIXTO = 5;

const listaDeCodigos = (codigos: readonly string[]): string => {
  const nombrados = codigos.slice(0, NOMBRADAS_POR_MIXTO);
  const resto = codigos.length - nombrados.length;
  if (resto > 0) return `${nombrados.join(", ")} y ${resto} más`;
  if (nombrados.length === 1) return nombrados[0]!;
  return `${nombrados.slice(0, -1).join(", ")} y ${nombrados[nombrados.length - 1]}`;
};

/**
 * LM4 fuera de los lotes (ADR-441): la frase del rechazo cuando una pieza
 * apartada en un mixto VIVO quiere consumirse a mano en una corrida, salir sin
 * aserrar o retrozarse. Dice dónde está y los dos caminos: repartir el mixto
 * (la pieza pasa a su lote) o sacarla de la pila.
 *
 *   «La troza 1234 está en LM-2026-001: repártelo o sácala del mixto.»
 *
 * `piezas` ya filtradas con `mixtoVivo`; el orden se respeta (el del pedido).
 */
export function mensajeApartadasEnMixto(piezas: readonly { codigo: string; mixto: string }[]): string {
  const porMixto = new Map<string, string[]>();
  for (const p of piezas) porMixto.set(p.mixto, [...(porMixto.get(p.mixto) ?? []), p.codigo]);
  const una = piezas.length === 1;
  const variosMixtos = porMixto.size > 1;
  const donde = [...porMixto]
    .map(([mixto, codigos]) => `${listaDeCodigos(codigos)} ${codigos.length === 1 ? "está" : "están"} en ${mixto}`)
    .join("; ");
  const quien = una ? "La troza" : "Las trozas";
  return (
    `${quien} ${donde}: ${variosMixtos ? "repártelos" : "repártelo"} ` +
    `o ${una ? "sácala" : "sácalas"} ${variosMixtos ? "de los mixtos" : "del mixto"}.`
  );
}

// ── Contrato HTTP ───────────────────────────────────────────────────────────

const idSchema = z.string().trim().min(1).max(60);
const trozaIdsSchema = z.array(idSchema).min(1).max(MAX_TROZAS_POR_PEDIDO);

/** `GET /api/admin/forestal/lotes-mixtos`. */
export const queryLoteMixtoSchema = z.object({
  status: z.enum(ESTADOS_LOTE_MIXTO).optional(),
  /** Uno solo (la tarjeta del mixto recién abierto). */
  id: idSchema.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * `POST` — abre el mixto. Sin `nuevo`, devuelve el que ya esté ABIERTO: dos
 * tablets que tocan «Lote mixto» a la vez tienen que caer en la misma pila,
 * no en LM-001 y LM-002.
 */
export const crearLoteMixtoSchema = z.object({
  notas: z.string().trim().max(500).nullish(),
  /** El permiso de trabajo de la banda del libro, si hay uno elegido. */
  contratoId: idSchema.nullish(),
  nuevo: z.boolean().optional(),
});

/** Especie+permiso → id del lote abierto al que se SUMA ese grupo. */
const destinosSchema = z
  .record(z.string().min(1).max(200), idSchema)
  .refine((d) => Object.keys(d).length <= 60, "Demasiados destinos");

/** `PATCH` — lo que se le hace a un mixto. */
export const accionLoteMixtoSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("agregar"), loteMixtoId: idSchema, trozaIds: trozaIdsSchema }),
  z.object({ accion: z.literal("quitar"), loteMixtoId: idSchema, trozaIds: trozaIdsSchema }),
  z.object({
    accion: z.literal("repartir"),
    loteMixtoId: idSchema,
    /** Sin destino, el grupo abre su propio lote. */
    destinos: destinosSchema.optional(),
    notas: z.string().trim().max(500).optional(),
  }),
  z.object({
    accion: z.literal("anular"),
    loteMixtoId: idSchema,
    motivo: z.string().trim().min(3, "Pon el motivo (3 letras o más)").max(500),
  }),
]);
export type AccionLoteMixto = z.infer<typeof accionLoteMixtoSchema>;

// ── Respuestas ──────────────────────────────────────────────────────────────

/** Una troza que no entró (o no salió), con el motivo que se lee frente al tronco. */
export interface RechazoDeTroza {
  id: string;
  /** El código que se ve en la chapa: el de planta, si no el de la guía. */
  codigo: string | null;
  motivo: string;
}

export interface RespuestaReserva {
  agregadas: number;
  /** Ya estaban en ESTE mixto: re-escanear no es un error. */
  yaEstaban: number;
  rechazadas: RechazoDeTroza[];
}

export interface RespuestaQuitar {
  quitadas: number;
  rechazadas: RechazoDeTroza[];
}

export interface LoteDelReparto {
  clave: string;
  loteId: string;
  code: string;
  /** `false` = se sumó a un lote que ya estaba abierto. */
  nuevo: boolean;
  especie: string;
  permiso: string | null;
  piezas: number;
  m3: number;
}

export interface RespuestaReparto {
  loteMixtoId: string;
  code: string;
  lotes: LoteDelReparto[];
  /**
   * Trozas que estaban en la pila y ya no podían ir a ningún lote (se
   * consumieron o despacharon por otro camino, su guía se anuló…). Se sueltan
   * del mixto y se dicen: no frenan el reparto de las demás.
   */
  excluidas: RechazoDeTroza[];
}

export interface RespuestaAnular {
  code: string;
  liberadas: number;
}

// ── Lectura: la pila y sus tarjetas ─────────────────────────────────────────

/** Una troza vista desde el mixto: lo justo para las tarjetas y el reparto. */
export interface TrozaDelMixto extends TrozaConsumible {
  /** Cuándo se apartó (ISO): el orden en que se escaneó la pila. */
  reservadaMixtoEn: string | null;
}

/** Una tarjeta del mixto: lo que va a salir como UN lote de aserrío. */
export interface GrupoDelMixto {
  clave: string;
  especie: string;
  especieCientifica: string | null;
  permiso: string | null;
  piezas: number;
  m3: number;
  guias: string[];
  trozaIds: string[];
  /** pt Oxapampa de las cubicadas + ≈ aserrable (56 %) de las demás. */
  pt: number;
  ptOxapampa: number;
  cubicadas: number;
  sinCubicar: number;
}

export interface ResumenLoteMixto {
  piezas: number;
  m3: number;
  especies: number;
  grupos: number;
  guias: string[];
  pt: number;
  cubicadas: number;
  sinCubicar: number;
}

/** Un lote de aserrío que salió de este mixto al repartirlo. */
export interface LoteHijoDelMixto {
  id: string;
  code: string;
  speciesCommon: string;
  permiso: string | null;
  status: string;
  piezas: number;
  /** Mismo nombre que `ForestLoteAserrioDB.list`: es el mismo lote leído desde el mixto. */
  volumenM3: number;
}

export interface LoteMixto {
  id: string;
  code: string;
  status: EstadoLoteMixto;
  notes: string | null;
  contratoId: string | null;
  abiertoEn: string;
  repartidoEn: string | null;
  createdBy: string;
  /** Las apartadas HOY. Un mixto repartido las tiene en sus lotes hijos. */
  trozaIds: string[];
  trozas: TrozaDelMixto[];
  /**
   * Las tarjetas que va a repartir: SIN las de `fuera`. Así la vista previa
   * promete los mismos lotes y piezas que después crea el servidor.
   */
  grupos: GrupoDelMixto[];
  /**
   * Apartadas que ya no pueden ir a ningún lote (se consumieron o despacharon
   * por otro camino, su guía se anuló, dejó de llegar…). Al repartir se sueltan.
   */
  fuera: RechazoDeTroza[];
  lotes: LoteHijoDelMixto[];
  resumen: ResumenLoteMixto;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** pt de un conjunto: Oxapampa de las cubicadas + ≈ aserrable del resto. */
function ptDe(trozas: readonly TrozaConsumible[]) {
  let ptOxapampa = 0;
  let cubicadas = 0;
  let m3SinCubicar = 0;
  for (const t of trozas) {
    const pt = ptDeTroza(t);
    if (pt == null) {
      m3SinCubicar += Number(t.volumenM3) || 0;
      continue;
    }
    ptOxapampa += pt;
    cubicadas += 1;
  }
  ptOxapampa = r2(ptOxapampa);
  return {
    pt: r2(ptOxapampa + pieTablarAserrableDe(m3SinCubicar, RENDIMIENTO_META)),
    ptOxapampa,
    cubicadas,
    sinCubicar: trozas.length - cubicadas,
  };
}

/** Las tarjetas del mixto, en el orden en que apareció cada grupo al escanear. */
export function gruposDelMixto(pila: readonly TrozaConsumible[]): GrupoDelMixto[] {
  return gruposDeLaPila(pila).map((g) => ({
    clave: g.clave,
    especie: g.especie,
    especieCientifica: g.especieCientifica,
    permiso: g.permiso,
    piezas: g.piezas,
    m3: g.m3,
    guias: g.guias,
    trozaIds: g.trozas.map((t) => t.id),
    ...ptDe(g.trozas),
  }));
}

export function resumenDelMixto(pila: readonly TrozaConsumible[], grupos: readonly GrupoDelMixto[]): ResumenLoteMixto {
  const pt = ptDe(pila);
  return {
    piezas: pila.length,
    m3: r3(pila.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0)),
    especies: new Set(grupos.map((g) => g.clave.split("|")[0])).size,
    grupos: grupos.length,
    guias: [...new Set(grupos.flatMap((g) => g.guias))],
    pt: pt.pt,
    cubicadas: pt.cubicadas,
    sinCubicar: pt.sinCubicar,
  };
}

// ── Reparto ─────────────────────────────────────────────────────────────────

/** Un lote de aserrío ABIERTO al que un grupo podría sumarse. */
export interface LoteAbiertoParaReparto {
  id: string;
  code: string;
  speciesCommon: string;
  permiso?: string | null;
  status?: string;
  /** El permiso de la madera que YA tiene (un lote sin permiso lo hereda de ahí). */
  trozas?: readonly { permiso?: string | null }[];
}

export type DestinoDelGrupo = { tipo: "nuevo" } | { tipo: "sumar"; loteId: string; code: string };

export interface PasoDelReparto<T extends TrozaConsumible = TrozaConsumible> {
  grupo: GrupoDeLaPila<T>;
  destino: DestinoDelGrupo;
}

export type PlanDeReparto<T extends TrozaConsumible = TrozaConsumible> =
  | { ok: true; pasos: PasoDelReparto<T>[] }
  | { ok: false; error: string };

const conPermiso = (p: string | null) => (p ? ` del permiso ${p}` : " sin permiso");

/**
 * Qué lote recibe cada grupo de la pila. LA MISMA función arma la vista previa
 * en la pantalla y decide en el servidor, dentro de la transacción: si
 * divergieran, «Terminar y repartir» prometería lotes que después no salen.
 *
 * - Sin destino → el grupo abre su propio lote (lo normal).
 * - Con destino → tiene que ser un lote abierto que lo acepte
 *   (`lotesQueAceptan`: su especie y, si los dos lo fijan, su permiso).
 * - Dos grupos al MISMO lote sin permiso no pueden dejarlo con dos permisos:
 *   cada uno solo pasaba, juntos lo mezclan (ADR-393).
 * - Una clave de `destinos` que ya no es un grupo (se quitaron sus trozas
 *   desde otro equipo) se ignora: no tiene nada que mover.
 *
 * Cualquier destino inválido invalida el plan ENTERO: repartir es todo o nada.
 */
export function planDeReparto<T extends TrozaConsumible>(
  pila: readonly T[],
  lotesAbiertos: readonly LoteAbiertoParaReparto[],
  destinos: Readonly<Record<string, string>> = {},
): PlanDeReparto<T> {
  const grupos = gruposDeLaPila(pila);
  const porId = new Map(lotesAbiertos.map((l) => [l.id, l]));
  const pasos: PasoDelReparto<T>[] = [];
  /** Permisos que terminaría teniendo cada lote destino. */
  const permisosPorLote = new Map<string, Set<string>>();

  for (const grupo of grupos) {
    const loteId = destinos[grupo.clave];
    if (!loteId) {
      pasos.push({ grupo, destino: { tipo: "nuevo" } });
      continue;
    }
    const lote = porId.get(loteId);
    if (!lote || !(lote.status == null || lote.status === "abierto")) {
      return {
        ok: false,
        error: `El lote elegido para ${grupo.especie}${conPermiso(grupo.permiso)} ya no está abierto: elige otro o deja que se cree uno.`,
      };
    }
    if (lotesQueAceptan([lote], grupo).length === 0) {
      return {
        ok: false,
        error: `El lote ${lote.code} no acepta ${grupo.especie}${conPermiso(grupo.permiso)}.`,
      };
    }
    let permisos = permisosPorLote.get(lote.id);
    if (!permisos) {
      permisos = new Set(
        [lote.permiso, ...(lote.trozas ?? []).map((t) => t.permiso)]
          .map((p) => p?.trim() || null)
          .filter((p): p is string => p != null),
      );
      permisosPorLote.set(lote.id, permisos);
    }
    if (grupo.permiso) permisos.add(grupo.permiso);
    if (permisos.size > 1) {
      return {
        ok: false,
        error: `El lote ${lote.code} quedaría con madera de dos permisos (${[...permisos].join(" y ")}): reparte cada permiso en su lote.`,
      };
    }
    pasos.push({ grupo, destino: { tipo: "sumar", loteId: lote.id, code: lote.code } });
  }
  return { ok: true, pasos };
}
