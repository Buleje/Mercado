import { formatMonthYear } from "@/lib/format";

export type Canal = "tienda" | "delivery" | "whatsapp";
export type Tipo = "contento" | "conforme" | "descontento";

export interface Opinion {
  id: string;
  cliente: string;
  estrellas: number;
  /** Las estrellas llevadas a la escala 0-10 del índice (ver `puntajeDe`). */
  puntaje: number;
  comentario: string;
  fecha: string;
  canal: Canal;
  /** Sin moderar todavía: cuenta en el índice, pero la tienda aún no la muestra. */
  pendiente: boolean;
  respuesta: string | null;
}

export interface MesTendencia {
  mes: string;
  contentos: number;
  conformes: number;
  descontentos: number;
  indice: number;
}

export type Periodo = "7d" | "30d" | "90d" | "todo";

export const ETIQUETA_CANAL: Record<Canal | "todos", string> = { todos: "Todos los canales", tienda: "Tienda", delivery: "Delivery", whatsapp: "WhatsApp" };
export const ETIQUETA_PERIODO: Record<Periodo, string> = { "7d": "Últimos 7 días", "30d": "Últimos 30 días", "90d": "Últimos 90 días", todo: "Todo el tiempo" };

/** 5★ → 10, 4★ → 8, 3★ → 6, 2★ → 3, 1★ → 1: el puntaje que usa el índice de satisfacción. */
export function puntajeDe(estrellas: number): number {
  if (estrellas === 5) return 10;
  if (estrellas === 4) return 8;
  if (estrellas === 3) return 6;
  if (estrellas === 2) return 3;
  return 1;
}

export function canalDe(lugar: string | null | undefined): Canal {
  const l = (lugar ?? "").toLowerCase();
  if (l.includes("delivery") || l.includes("domicilio") || l.includes("envío") || l.includes("envio")) return "delivery";
  if (l.includes("whatsapp") || l.includes("wsp") || l.includes("ws ")) return "whatsapp";
  return "tienda";
}

/** Contento = 9-10 (5★), conforme = 7-8 (4★), descontento = 0-6 (3★ o menos). */
export function tipoDe(puntaje: number): Tipo {
  return puntaje >= 9 ? "contento" : puntaje >= 7 ? "conforme" : "descontento";
}

export interface Resumen {
  total: number;
  contentos: number;
  conformes: number;
  descontentos: number;
  /** (contentos − descontentos) / total × 100, de −100 a +100. */
  indice: number;
  promedioEstrellas: number;
}

export function resumir(lista: Opinion[]): Resumen {
  const contentos = lista.filter((o) => tipoDe(o.puntaje) === "contento").length;
  const conformes = lista.filter((o) => tipoDe(o.puntaje) === "conforme").length;
  const descontentos = lista.length - contentos - conformes;
  return {
    total: lista.length,
    contentos,
    conformes,
    descontentos,
    indice: lista.length ? Math.round(((contentos - descontentos) / lista.length) * 100) : 0,
    promedioEstrellas: lista.length ? lista.reduce((s, o) => s + o.estrellas, 0) / lista.length : 0,
  };
}

export function nivelDelIndice(indice: number): string {
  return indice >= 50 ? "Excelente" : indice >= 20 ? "Bueno" : indice >= 0 ? "Aceptable" : "Necesita mejora";
}

export function filtrar(lista: Opinion[], periodo: Periodo, canal: Canal | "todos", ahora: number): Opinion[] {
  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : periodo === "90d" ? 90 : 0;
  return lista.filter((o) => (!dias || new Date(o.fecha).getTime() >= ahora - dias * 86400000) && (canal === "todos" || o.canal === canal));
}

/** Los últimos 6 meses con opiniones, del más viejo al más nuevo. */
export function tendenciaMensual(lista: Opinion[]): MesTendencia[] {
  const porMes = new Map<string, { clave: string; contentos: number; conformes: number; descontentos: number }>();
  for (const o of lista) {
    const clave = o.fecha.slice(0, 7);
    const m = porMes.get(clave) ?? { clave, contentos: 0, conformes: 0, descontentos: 0 };
    const t = tipoDe(o.puntaje);
    if (t === "contento") m.contentos++;
    else if (t === "conforme") m.conformes++;
    else m.descontentos++;
    porMes.set(clave, m);
  }
  return [...porMes.values()]
    .sort((a, b) => a.clave.localeCompare(b.clave))
    .slice(-6)
    .map((m) => {
      const total = m.contentos + m.conformes + m.descontentos || 1;
      return { mes: formatMonthYear(`${m.clave}-15T12:00:00`), contentos: m.contentos, conformes: m.conformes, descontentos: m.descontentos, indice: Math.round(((m.contentos - m.descontentos) / total) * 100) };
    });
}
