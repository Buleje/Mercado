import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { permisoRef, type PermisoRef } from "@/lib/forestal/vincular-trozas";

/**
 * El permiso de la madera de cada corrida (ADR-519), DERIVADO al leer. Lo usan
 * la propuesta de despacho desde un Anexo 04 (`estadoDelLibro`) y la
 * reasignación a mano de los orígenes de un despacho (`setOrigenesEnTx`): los
 * dos tienen que decir lo mismo de la misma corrida.
 *
 * Fuentes, cada una con `permisoRef` — la misma regla de `vincularCorridaEnTx`:
 *  · cada guía de ingreso que la corrida consumió (ADR-402: una corrida hereda
 *    el permiso de su madera);
 *  · el propio de la corrida (`contratoId` vivo u `originCode`, ADR-447);
 *  · el de las corridas de las que salió por reproceso (I6), con lo que ELLAS
 *    heredan: una corrida reaserrada no tiene consumos de guía y, sin esto,
 *    quedaba «sin dato» y servía a cualquier permiso.
 * Se juntan todas: si dicen cosas distintas, la corrida no sirve a ninguna
 * guía con permiso (`permisoAjeno`), que es lo seguro.
 *
 * Consultas planas y EN SERIE: dentro de una transacción interactiva de
 * Prisma 7 un `Promise.all` o un `select` anidado comparten la conexión.
 */
type LectorPermisos = Pick<
  Prisma.TransactionClient,
  "forestCtpEntry" | "forestCtpConsumo" | "forestCtpReproceso" | "woodEntry" | "forestContrato"
>;

type CorridaConPermiso = { id: string; contratoId: string | null; originCode: string | null };
type ConsumoDeGuia = { ctpEntryId: string; woodEntryId: string };

/** Tope de saltos de reproceso hacia atrás (en Blas hay 0; una cadena real es de 1-2). */
const MAX_SALTOS_REPROCESO = 8;

/**
 * Los permisos de `corridas`, con sus consumos ya leídos por el llamador (el
 * libro los necesita igual para saber qué corrida tiene materia prima).
 */
export async function permisosDeCorridas(
  client: LectorPermisos,
  tenantId: string,
  corridas: readonly CorridaConPermiso[],
  consumos: readonly ConsumoDeGuia[],
): Promise<Map<string, PermisoRef[]>> {
  const corridaDe = new Map(corridas.map((c) => [c.id, c]));
  const todosLosConsumos = [...consumos];
  /* De qué corridas salió cada una por reproceso, hacia atrás: las de origen
     que no vinieron en `corridas` se leen con sus consumos. */
  const origenesDe = new Map<string, string[]>();
  let frontera = corridas.map((c) => c.id);
  for (let salto = 0; salto < MAX_SALTOS_REPROCESO && frontera.length > 0; salto++) {
    const reprocesos = await client.forestCtpReproceso.findMany({
      where: { tenantId, destinoEntryId: { in: frontera } },
      select: { destinoEntryId: true, origenEntryId: true },
    });
    for (const r of reprocesos) origenesDe.set(r.destinoEntryId, [...(origenesDe.get(r.destinoEntryId) ?? []), r.origenEntryId]);
    const nuevas = [...new Set(reprocesos.map((r) => r.origenEntryId))].filter((id) => !corridaDe.has(id));
    if (nuevas.length === 0) break;
    /* Sin filtrar por vigencia: la madera de una corrida de origen anulada
       sigue siendo de su permiso. */
    const leidas = await client.forestCtpEntry.findMany({
      where: { tenantId, id: { in: nuevas } },
      select: { id: true, contratoId: true, originCode: true },
    });
    for (const c of leidas) corridaDe.set(c.id, c);
    todosLosConsumos.push(
      ...(await client.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId: { in: nuevas } },
        select: { ctpEntryId: true, woodEntryId: true },
      })),
    );
    frontera = nuevas;
  }

  const woodIds = [...new Set(todosLosConsumos.map((c) => c.woodEntryId))];
  const guias = woodIds.length
    ? await client.woodEntry.findMany({ where: { tenantId, id: { in: woodIds } }, select: { id: true, contratoId: true, originCode: true } })
    : [];
  const contratoIds = [...new Set([...corridaDe.values(), ...guias].map((x) => x.contratoId).filter((x): x is string => Boolean(x)))];
  const contratos = contratoIds.length
    ? await client.forestContrato.findMany({ where: { tenantId, id: { in: contratoIds } }, select: { id: true, codigo: true, deletedAt: true } })
    : [];
  const contratoDe = new Map(contratos.map((k) => [k.id, k]));
  const ref = (x: { contratoId: string | null; originCode: string | null }): PermisoRef | null => {
    const p = permisoRef(x.contratoId, x.contratoId ? contratoDe.get(x.contratoId) : null, x.originCode);
    return p.contratoId || p.codigo ? p : null;
  };
  const guiaDe = new Map(guias.map((g) => [g.id, ref(g)]));

  /* Lo PROPIO de cada corrida (sus guías + su código), sin reprocesos. */
  const propios = new Map<string, PermisoRef[]>();
  const sumar = (lista: PermisoRef[], p: PermisoRef | null | undefined) => {
    if (p && !lista.some((q) => q.contratoId === p.contratoId && q.codigo === p.codigo)) lista.push(p);
  };
  const propiosDe = (id: string) => {
    let lista = propios.get(id);
    if (!lista) propios.set(id, (lista = []));
    return lista;
  };
  for (const c of todosLosConsumos) sumar(propiosDe(c.ctpEntryId), guiaDe.get(c.woodEntryId));
  for (const c of corridaDe.values()) sumar(propiosDe(c.id), ref(c));

  /* Lo propio + lo de toda la cadena de reprocesos hacia atrás (`vistas`
     corta un ciclo, que I6 no debería permitir pero no cuesta cubrir). */
  const out = new Map<string, PermisoRef[]>();
  for (const c of corridas) {
    const lista: PermisoRef[] = [];
    const vistas = new Set<string>();
    const pendientes = [c.id];
    while (pendientes.length > 0) {
      const id = pendientes.pop()!;
      if (vistas.has(id)) continue;
      vistas.add(id);
      for (const p of propios.get(id) ?? []) sumar(lista, p);
      pendientes.push(...(origenesDe.get(id) ?? []));
    }
    out.set(c.id, lista);
  }
  return out;
}

/** Lo mismo leyendo las corridas y sus consumos por id (la reasignación a mano). */
export async function permisosDeCorridasPorId(
  client: LectorPermisos,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, PermisoRef[]>> {
  if (ids.length === 0) return new Map();
  const corridas = await client.forestCtpEntry.findMany({
    where: { tenantId, id: { in: [...ids] } },
    select: { id: true, contratoId: true, originCode: true },
  });
  const consumos = await client.forestCtpConsumo.findMany({
    where: { tenantId, ctpEntryId: { in: [...ids] } },
    select: { ctpEntryId: true, woodEntryId: true },
  });
  return permisosDeCorridas(client, tenantId, corridas, consumos);
}
