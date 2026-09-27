/**
 * lote-mixto-vista.ts — lo que SÓLO la pantalla del lote mixto (ADR-441)
 * necesita, encima del contrato compartido (`lote-mixto.ts`).
 *
 * Las tarjetas (`gruposDelMixto`), el plan de reparto (`planDeReparto`) y por
 * qué una troza no entra (`motivoFueraDeLaPila` con `loteMixtoId`) son del
 * contrato: la pantalla y el servidor dicen lo mismo. Acá queda:
 *   · cómo se rotula el PT de una tarjeta (medido, estimado o mezcla);
 *   · el mixto en una línea;
 *   · a qué lotes abiertos se le ofrece sumar cada tarjeta;
 *   · qué quedó en la cola del patio sin subir.
 *
 * PURO y client-safe.
 */

import type { TrozaConsumible } from "./consumo-trozas";
import { PT_POR_M3 } from "./cubicacion";
import { gruposDeLaPila, lotesQueAceptan, type GrupoDeLaPila } from "./lote-por-escaneo";
import type { EstadoLoteMixto, GrupoDelMixto, LoteMixto } from "./lote-mixto";
import type { CorridaDelMixto, LoteDelMixto, VincularCorridaPedido } from "./vincular-desde-mixto";

/** La sección con la que apartar/sacar del mixto viaja por la cola del patio. */
export const SECCION_COLA_MIXTO = "lote-mixto";

/** Cómo se rotula el PT de una tarjeta: medido (Oxapampa), estimado o mezcla. */
export function rotuloDelPt(g: Pick<GrupoDelMixto, "cubicadas" | "piezas">): string {
  if (g.cubicadas === 0) return "≈ PT aserrable";
  if (g.cubicadas >= g.piezas) return "PT Oxapampa";
  return `PT (${g.cubicadas} de ${g.piezas} Oxapampa, el resto ≈ aserrable)`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const ESTADO: Record<EstadoLoteMixto, string> = {
  abierto: "abierto",
  repartido: "repartido",
  anulado: "anulado",
};

/** «LM-2026-003 · abierto · 12 trozas · 4 especies» — el mixto en una línea. */
export function lineaDelMixto(m: { code: string; status: string; piezas: number; especies: number }): string {
  const partes = [m.code, ESTADO[m.status as EstadoLoteMixto] ?? m.status, plural(m.piezas, "troza", "trozas")];
  if (m.especies > 0) partes.push(plural(m.especies, "especie", "especies"));
  return partes.join(" · ");
}

type LoteDestino = {
  id: string;
  speciesCommon: string;
  permiso?: string | null;
  status?: string;
  trozas?: readonly { permiso?: string | null }[];
};

/**
 * Los lotes abiertos que se le ofrecen a cada tarjeta para SUMARSE: los que la
 * aceptan (`lotesQueAceptan`) y no eligió otra tarjeta. Un lote es destino de
 * una sola: dos permisos de la misma especie en el mismo lote sin permiso lo
 * dejaban mezclado (revisión 26-09 de «Armar escaneando»).
 */
export function opcionesDeDestino<L extends LoteDestino>(
  grupos: readonly Pick<GrupoDeLaPila, "clave" | "especie" | "especieCientifica" | "permiso">[],
  lotes: readonly L[],
  destinos: Readonly<Record<string, string>>,
): Map<string, L[]> {
  return new Map(
    grupos.map((g) => {
      const tomados = new Set(
        Object.entries(destinos)
          .filter(([clave]) => clave !== g.clave)
          .map(([, id]) => id),
      );
      return [g.clave, lotesQueAceptan(lotes, g).filter((l) => !tomados.has(l.id))];
    }),
  );
}

/** Lo mínimo que se lee de una anotación de la cola del patio (`AnotacionPatio`). */
interface AnotacionCola {
  section: string;
  estado: "pendiente" | "rechazado";
  payload: Record<string, unknown>;
  motivo?: string;
}

const idsDe = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/**
 * Lo que este equipo apartó o sacó del mixto SIN SEÑAL y todavía no subió, y
 * lo que el libro rechazó al subir. Sale de la cola misma (IndexedDB), no de un
 * estado aparte: sobrevive a un recargo. Se aplica en orden: apartar y después
 * sacar la misma troza = fuera.
 */
export function pendientesDelMixto(
  cola: readonly AnotacionCola[],
  mixtoId: string | null,
): { agregar: Set<string>; quitar: Set<string>; rechazadas: { id: string; motivo: string }[] } {
  const agregar = new Set<string>();
  const quitar = new Set<string>();
  const rechazadas: { id: string; motivo: string }[] = [];
  if (!mixtoId) return { agregar, quitar, rechazadas };
  for (const a of cola) {
    if (a.section !== SECCION_COLA_MIXTO || a.payload.loteMixtoId !== mixtoId) continue;
    const ids = idsDe(a.payload.trozaIds);
    if (a.estado === "rechazado") {
      const motivo = a.motivo?.trim() || "El libro no la aceptó.";
      for (const id of ids) rechazadas.push({ id, motivo });
      continue;
    }
    for (const id of ids) {
      if (a.payload.accion === "agregar") {
        agregar.add(id);
        quitar.delete(id);
      } else if (a.payload.accion === "quitar") {
        quitar.add(id);
        agregar.delete(id);
      }
    }
  }
  return { agregar, quitar, rechazadas };
}

// ── Vincular la producción del día con el mixto (paso 7) ────────────────────

/** Id de un lote que todavía no existe: el grupo de un mixto abierto, antes de repartir. */
export const LOTE_POR_REPARTIR = "por-repartir:";

/** Lo que `planDelMixto` necesita de una corrida del día (`CorridaDelDia`). */
export function corridaAlMixto(c: {
  id: string;
  lineNo: number;
  especie: string | null;
  m3: number;
  dia: string;
  volumenConsumidoM3: number | null;
  paquetes: readonly { largoM: number | null }[];
}): CorridaDelMixto {
  const largos = c.paquetes.map((p) => Number(p.largoM)).filter((v) => Number.isFinite(v) && v > 0);
  return {
    id: c.id,
    lineNo: c.lineNo,
    especie: c.especie,
    volumenM3: c.m3,
    fecha: c.dia,
    largoMaxPiezaM: largos.length > 0 ? Math.max(...largos) : null,
    tieneMateriaPrima: (Number(c.volumenConsumidoM3) || 0) > 0,
  };
}

/** El PT que la corrida declaró: el medido de sus paquetes o, si falta alguno, m³ × 424. */
export function ptDeCorrida(c: { m3: number; paquetes: readonly { pieTablar: number | null }[] }): number {
  const medidos = c.paquetes.map((p) => p.pieTablar);
  if (medidos.length > 0 && medidos.every((v) => v != null && Number.isFinite(v))) {
    return Math.round(medidos.reduce<number>((a, v) => a + (v ?? 0), 0));
  }
  return Math.round((Number(c.m3) || 0) * PT_POR_M3);
}

/**
 * Los lotes de donde puede salir la madera de un mixto.
 *   · Repartido: sus lotes hijos, con las trozas que el patio dice que tienen.
 *   · Abierto (decisión 3 del dueño: va a la sierra sin repartirse): un lote
 *     «por repartir» por especie + permiso, el mismo grupo que va a salir al
 *     repartir. Al firmar se reparte primero y el id se cambia por el real.
 */
export function lotesParaVincular(
  mixto: Pick<LoteMixto, "status" | "trozas" | "lotes"> | null,
  patio: readonly TrozaConsumible[],
): LoteDelMixto[] {
  if (!mixto) return [];
  if (mixto.status === "abierto") {
    return gruposDeLaPila(mixto.trozas).map((g) => ({
      id: `${LOTE_POR_REPARTIR}${g.clave}`,
      code: null,
      especie: g.especie,
      permiso: g.permiso,
      status: "abierto",
      trozas: g.trozas,
    }));
  }
  return mixto.lotes.map((l) => ({
    id: l.id,
    code: l.code,
    especie: l.speciesCommon,
    permiso: l.permiso,
    status: l.status,
    trozas: patio.filter((t) => t.loteAserrioId === l.id),
  }));
}

/**
 * El pedido de una corrida con los lotes REALES: los «por repartir» se cambian
 * por el lote que salió de su grupo, y las trozas que el reparto dejó afuera
 * se sacan. `null` = no queda nada que vincular.
 */
export function pedidoConLotesReales(
  pedido: VincularCorridaPedido,
  lotePorClave: ReadonlyMap<string, string>,
  fuera: ReadonlySet<string> = new Set(),
): VincularCorridaPedido | null {
  const partes: VincularCorridaPedido["partes"] = [];
  for (const p of pedido.partes) {
    const loteId = p.loteId.startsWith(LOTE_POR_REPARTIR)
      ? lotePorClave.get(p.loteId.slice(LOTE_POR_REPARTIR.length))
      : p.loteId;
    const trozaIds = p.trozaIds.filter((id) => !fuera.has(id));
    if (!loteId || trozaIds.length === 0) continue;
    const previa = partes.find((x) => x.loteId === loteId);
    if (previa) previa.trozaIds.push(...trozaIds);
    else partes.push({ loteId, trozaIds });
  }
  return partes.length > 0 ? { ...pedido, partes } : null;
}
