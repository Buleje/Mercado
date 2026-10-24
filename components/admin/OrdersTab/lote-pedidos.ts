/**
 * Cambiar de estado varios pedidos de la Lista, con revisión antes e informe
 * después (P09, 17-10). Antes era un toast («3 a Preparando; 2 no podían
 * saltar a ese paso») que no decía CUÁLES ni por qué, y un corte de red o un
 * 503 dejaba la duda de si alguno había cambiado.
 *
 *   revisarLote      antes de mandar: cuáles van y cuáles no (con el porqué),
 *                    con la misma máquina de estados que el servidor
 *                    (`lib/order-status.ts`). No la cambia: sólo la lee.
 *   resultadoDelLote después: qué le pasó a CADA pedido según la respuesta
 *                    de `POST /api/orders/bulk-status`. «pendiente» = no se
 *                    sabe o no llegó (red, 5xx, 429, cambió mientras tanto):
 *                    se puede reintentar sólo esos.
 *
 * Sin React ni `window`: se prueba sola (`__tests__/pedidos-lote.test.ts`).
 */
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { transicionesDesde } from "@/lib/order-status";
import { STATUS_LABELS } from "./types";

export type Resultado = "cambiado" | "ya-estaba" | "rechazado" | "pendiente" | "no-encontrado";

export interface FilaLote {
  id: string;
  resultado: Resultado;
  /** Por qué (vacío si cambió). */
  motivo: string;
}

/** Lo que contesta `POST /api/orders/bulk-status` (200 o 422). */
export interface RespuestaLote {
  updated?: number;
  actualizados?: string[];
  rechazados?: { id: string; desde?: string }[];
  /** Cuántos ya estaban en el destino (la forma de siempre). */
  sinCambio?: number;
  /** Cuáles (17-10). */
  sinCambioIds?: string[];
  noEncontrados?: string[];
  error?: string;
}

const nombre = (s: string) => STATUS_LABELS[s as OrderStatus] ?? s;

/** «De Entregado no se pasa a Cancelado»: lo mismo que diría el servidor. */
export function motivoDeSalto(desde: string, destino: OrderStatus): string {
  return `De ${nombre(desde)} no se pasa a ${nombre(destino)}`;
}

/**
 * Qué se manda y qué no. Los que no van ya salen con su resultado: el informe
 * final los muestra junto a los enviados, así se ve el lote entero.
 */
export function revisarLote(
  pedidos: readonly Pick<DbOrder, "id" | "status">[],
  destino: OrderStatus,
): { elegibles: string[]; excluidos: FilaLote[] } {
  const elegibles: string[] = [];
  const excluidos: FilaLote[] = [];
  for (const p of pedidos) {
    if (p.status === destino) {
      excluidos.push({ id: p.id, resultado: "ya-estaba", motivo: `Ya estaba en ${nombre(destino)}` });
    } else if (!transicionesDesde(p.status).includes(destino)) {
      excluidos.push({ id: p.id, resultado: "rechazado", motivo: motivoDeSalto(p.status, destino) });
    } else {
      elegibles.push(p.id);
    }
  }
  return { elegibles, excluidos };
}

const todos = (ids: readonly string[], resultado: Resultado, motivo: string): FilaLote[] =>
  ids.map((id) => ({ id, resultado, motivo }));

/**
 * Qué le pasó a cada enviado. `status` null = no hubo respuesta (sin red).
 *
 * Con un servidor que no manda `actualizados` (la forma vieja), lo que no se
 * rechazó cuenta como cambiado sólo si las cifras cierran; si no, queda
 * «pendiente» para revisarlo en vez de decir que salió bien.
 */
export function resultadoDelLote(
  enviados: readonly string[],
  status: number | null,
  cuerpo: RespuestaLote,
  destino: OrderStatus,
): FilaLote[] {
  if (status === null) {
    return todos(enviados, "pendiente", "Sin conexión: no se sabe si llegó. Reintenta");
  }
  if (status === 429) return todos(enviados, "pendiente", "Muchos cambios seguidos: espera un momento y reintenta");
  if (status === 401) return todos(enviados, "pendiente", "Tu sesión venció: vuelve a entrar y reintenta");
  if (status >= 500) return todos(enviados, "pendiente", `El servidor no contestó (${status}): reintenta`);
  if (status === 403) return todos(enviados, "rechazado", "Tu rol no puede cambiar pedidos");
  if (status === 404) return todos(enviados, "no-encontrado", "No está en este negocio (¿lo borraron?)");
  if (status !== 200 && status !== 422) {
    return todos(enviados, "rechazado", cuerpo.error ?? `No se pudo (${status})`);
  }

  const rechazados = new Map((cuerpo.rechazados ?? []).map((r) => [r.id, r.desde ?? ""]));
  const sinCambio = new Set(cuerpo.sinCambioIds ?? []);
  const noEncontrados = new Set(cuerpo.noEncontrados ?? []);
  const actualizados = cuerpo.actualizados ? new Set(cuerpo.actualizados) : null;
  const cierra =
    (cuerpo.updated ?? 0) + rechazados.size + (cuerpo.sinCambio ?? 0) === enviados.length;

  return enviados.map((id): FilaLote => {
    if (rechazados.has(id)) {
      const desde = rechazados.get(id) ?? "";
      return {
        id,
        resultado: "rechazado",
        motivo: desde ? motivoDeSalto(desde, destino) : `No puede pasar a ${nombre(destino)}`,
      };
    }
    if (sinCambio.has(id)) return { id, resultado: "ya-estaba", motivo: `Ya estaba en ${nombre(destino)}` };
    if (noEncontrados.has(id)) {
      return { id, resultado: "no-encontrado", motivo: "No está en este negocio (¿lo borraron?)" };
    }
    if (actualizados ? actualizados.has(id) : status === 200 && cierra) {
      return { id, resultado: "cambiado", motivo: "" };
    }
    return {
      id,
      resultado: "pendiente",
      motivo: actualizados
        ? "Cambió mientras tanto (otra persona lo movió): reintenta"
        : "No se pudo confirmar: reintenta",
    };
  });
}

/**
 * Junta lo de un reintento con el informe que ya estaba: cada id queda con
 * su último resultado, en el orden del primero.
 */
export function juntarResultados(antes: readonly FilaLote[], nuevas: readonly FilaLote[]): FilaLote[] {
  const porId = new Map(nuevas.map((f) => [f.id, f]));
  return antes.map((f) => porId.get(f.id) ?? f);
}

export function contarResultados(filas: readonly FilaLote[]): Record<Resultado, number> {
  const c: Record<Resultado, number> = {
    cambiado: 0,
    "ya-estaba": 0,
    rechazado: 0,
    pendiente: 0,
    "no-encontrado": 0,
  };
  for (const f of filas) c[f.resultado]++;
  return c;
}

/** Los que se pueden volver a mandar tal cual. */
export const pendientesDe = (filas: readonly FilaLote[]) =>
  filas.filter((f) => f.resultado === "pendiente").map((f) => f.id);

/** Los que siguen elegidos al cerrar el informe: lo que falta decidir. */
export const porDecidir = (filas: readonly FilaLote[]) =>
  filas
    .filter((f) => f.resultado === "rechazado" || f.resultado === "pendiente")
    .map((f) => f.id);
