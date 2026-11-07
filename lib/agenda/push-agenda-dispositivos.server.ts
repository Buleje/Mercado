import "server-only";

/**
 * Dónde se guardan los celulares del aviso de la agenda (Brandon 20-10).
 *
 * Igual que los de cámaras (`CamarasCelularesDB`): una clave del KV por negocio
 * (`interno:agenda-celulares:<tenantId>`), así el aislamiento es la clave misma
 * y un negocio nunca lee la lista de otro. NO va a la tabla `PushSubscription`
 * (la de los clientes de la tienda: el celular del dueño recibiría las
 * promociones). Clave propia, no la de cámaras: apagar uno no apaga el otro.
 *
 * Todas las escrituras van por `PlatformSettingsDB.actualizar` (candado por
 * clave + lectura de la base): el alta, la baja y el dedupe de los avisos.
 *
 * El cron necesita saber qué negocios tienen celulares sin recorrer todos: un
 * índice global (`interno:agenda-celulares-indice`) con sus ids, que el alta
 * asegura. No se poda: un negocio que apagó todos cuesta una lectura en caché
 * cada 5 min, y podar compite con un alta simultánea (quedaría con celulares y
 * fuera del índice). La verdad es la lista del negocio, no el índice.
 */

import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  altaDispositivo,
  bajaDispositivo,
  estadoAgendaDe,
  liberarAvisos,
  reservarAvisos,
  sinEndpoints,
  type DispositivoAgenda,
  type EstadoAgendaCelulares,
  type PedidoAviso,
  type ResultadoAlta,
} from "./push-agenda";
import type { FechaKey } from "./tipos";

const CLAVE = (tenantId: string) => `interno:agenda-celulares:${tenantId}`;
const CLAVE_INDICE = "interno:agenda-celulares-indice";
const TX = { maxWait: 10_000, timeout: 10_000 } as const;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

const listaDe = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

export const AgendaCelularesStore = {
  async listar(tenantId: string): Promise<EstadoAgendaCelulares> {
    exigirTenant(tenantId);
    return estadoAgendaDe(await PlatformSettingsDB.get<unknown>(CLAVE(tenantId)));
  },

  async alta(tenantId: string, entrada: Omit<DispositivoAgenda, "creado">, ahora: Date = new Date()): Promise<ResultadoAlta> {
    exigirTenant(tenantId);
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoAlta>(
      CLAVE(tenantId),
      (actual) => {
        const res = altaDispositivo(estadoAgendaDe(actual), entrada, ahora);
        return res.ok ? { valor: res.estado, resultado: res } : { resultado: res };
      },
      entrada.username,
      TX,
    );
    if (r.ok) await AgendaCelularesStore.asegurarEnIndice(tenantId);
    return r;
  },

  /** Saca un dispositivo de esa persona. `null` = no había uno suyo con ese id. */
  async baja(tenantId: string, id: string, username: string): Promise<EstadoAgendaCelulares | null> {
    exigirTenant(tenantId);
    return PlatformSettingsDB.actualizar<unknown, EstadoAgendaCelulares | null>(
      CLAVE(tenantId),
      (actual) => {
        const siguiente = bajaDispositivo(estadoAgendaDe(actual), id, username);
        return siguiente ? { valor: siguiente, resultado: siguiente } : { resultado: null };
      },
      username,
      TX,
    );
  },

  /** Borra los que el servicio de push dio por muertos (404/410). */
  async olvidarEndpoints(tenantId: string, endpoints: readonly string[]): Promise<void> {
    exigirTenant(tenantId);
    if (endpoints.length === 0) return;
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE(tenantId),
      (actual) => {
        const siguiente = sinEndpoints(estadoAgendaDe(actual), endpoints);
        return siguiente ? { valor: siguiente, resultado: null } : { resultado: null };
      },
      "agenda",
      TX,
    );
  },

  /** Dedupe ATÓMICO antes de mandar: devuelve sólo lo que nadie avisó hoy, con la lista de dispositivos leída bajo el candado. */
  async reservar(
    tenantId: string,
    hoy: FechaKey,
    pedidos: readonly PedidoAviso[],
    ahora: Date,
  ): Promise<{ reservados: PedidoAviso[]; estado: EstadoAgendaCelulares; enISO: string }> {
    exigirTenant(tenantId);
    const enISO = ahora.toISOString();
    return PlatformSettingsDB.actualizar<unknown, { reservados: PedidoAviso[]; estado: EstadoAgendaCelulares; enISO: string }>(
      CLAVE(tenantId),
      (actual) => {
        const previo = estadoAgendaDe(actual);
        const { siguiente, reservados } = reservarAvisos(previo, hoy, pedidos, enISO);
        const podado = Object.keys(siguiente.avisados).length !== Object.keys(previo.avisados).length;
        const resultado = { reservados, estado: siguiente, enISO };
        return reservados.length > 0 || podado ? { valor: siguiente, resultado } : { resultado };
      },
      "agenda",
      TX,
    );
  },

  /** Devuelve los turnos que no llegaron a ningún celular (el próximo disparo, dentro de la ventana, reintenta). */
  async liberar(tenantId: string, claves: readonly string[], enISO: string): Promise<void> {
    exigirTenant(tenantId);
    if (claves.length === 0) return;
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE(tenantId),
      (actual) => {
        const siguiente = liberarAvisos(estadoAgendaDe(actual), claves, enISO);
        return siguiente ? { valor: siguiente, resultado: null } : { resultado: null };
      },
      "agenda",
      TX,
    );
  },

  /** Los negocios que tienen (o tuvieron) celulares con el aviso. */
  async negocios(): Promise<string[]> {
    return listaDe(await PlatformSettingsDB.get<unknown>(CLAVE_INDICE));
  },

  async asegurarEnIndice(tenantId: string): Promise<void> {
    exigirTenant(tenantId);
    if ((await AgendaCelularesStore.negocios()).includes(tenantId)) return;
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE_INDICE,
      (actual) => {
        const lista = listaDe(actual);
        return lista.includes(tenantId) ? { resultado: null } : { valor: [...lista, tenantId], resultado: null };
      },
      "agenda",
      TX,
    );
  },
};
