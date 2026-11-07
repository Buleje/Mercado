/**
 * Productos quitados del ticket ANTES de cobrar (Square: «comps & voids»).
 *
 * El POS borraba la línea sin dejar rastro: un cajero podía marcar, mostrar el
 * total, quitar y cobrar «por fuera» sin que nadie lo viera. Cada quitada va al
 * registro de actividad que ya existe (`ActivityLog`, sin schema nuevo) con el
 * producto, la cantidad, el precio de la línea, quién y en qué turno.
 *
 * Puro y sin `"use client"`: lo usan la ruta (`/api/pos/quitado`), el resumen
 * del mes por cajero y la vista de Turnos › Cajeros.
 */

export const ACCION_QUITADO = "pos_quitar_linea";
export const ENTIDAD_QUITADO = "pos_ticket";

/** «linea» = la X de una línea; «vaciar» = «Vaciar carrito» con todo adentro. */
export type MotivoQuitado = "linea" | "vaciar";

export type LineaQuitada = {
  productoId: number;
  nombre: string;
  cantidad: number;
  /** Precio unitario de la línea en el ticket (vista previa del POS). */
  precio: number;
  /** % de descuento de la línea, si tenía. */
  descuentoPct?: number;
};

/** Lo que queda guardado en `ActivityLog.detail` (JSON). */
export type DetalleQuitado = {
  motivo: MotivoQuitado;
  lineas: LineaQuitada[];
  unidades: number;
  monto: number;
  turnoId: string | null;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lo que valía la línea en el ticket: precio × cantidad, menos su descuento. */
export function montoDeLinea(l: Pick<LineaQuitada, "precio" | "cantidad" | "descuentoPct">): number {
  const pct = Math.min(100, Math.max(0, l.descuentoPct ?? 0));
  return redondear(l.precio * l.cantidad * (1 - pct / 100));
}

/** El detalle a guardar: el monto y las unidades los calcula el servidor, no el POS. */
export function armarDetalle(motivo: MotivoQuitado, lineas: LineaQuitada[], turnoId: string | null): DetalleQuitado {
  return {
    motivo,
    lineas,
    unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    monto: redondear(lineas.reduce((s, l) => s + montoDeLinea(l), 0)),
    turnoId,
  };
}

/** Lee el `detail` de un renglón; `null` si no es de este formato (renglón viejo o roto). */
export function leerDetalle(detail: string | null | undefined): DetalleQuitado | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as Partial<DetalleQuitado>;
    if (!d || !Array.isArray(d.lineas) || typeof d.monto !== "number") return null;
    return {
      motivo: d.motivo === "vaciar" ? "vaciar" : "linea",
      lineas: d.lineas.filter((l): l is LineaQuitada => !!l && typeof l.nombre === "string" && typeof l.cantidad === "number"),
      unidades: typeof d.unidades === "number" ? d.unidades : 0,
      monto: d.monto,
      turnoId: typeof d.turnoId === "string" ? d.turnoId : null,
    };
  } catch {
    return null;
  }
}

export type RenglonQuitado = { id: string; user: string; createdAt: Date | string; detail: string };

export type QuitadosDeCajero = { veces: number; unidades: number; monto: number };

/** Suma por usuario (el `username` del cajero, que es como se guarda). */
export function resumirPorUsuario(renglones: RenglonQuitado[]): Map<string, QuitadosDeCajero> {
  const out = new Map<string, QuitadosDeCajero>();
  for (const r of renglones) {
    const d = leerDetalle(r.detail);
    if (!d) continue;
    const prev = out.get(r.user) ?? { veces: 0, unidades: 0, monto: 0 };
    prev.veces += 1;
    prev.unidades += d.unidades;
    prev.monto = redondear(prev.monto + d.monto);
    out.set(r.user, prev);
  }
  return out;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const PARTES_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** «jueves 10/09 · 14:32» en hora de Lima. */
export function cuandoLima(instante: Date | string): string {
  const d = new Date(instante);
  if (!Number.isFinite(d.getTime())) return "";
  const p = Object.fromEntries(PARTES_LIMA.formatToParts(d).map((x) => [x.type, x.value]));
  const dia = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
  const hora = p.hour === "24" ? "00" : p.hour;
  return `${DIAS[dia]} ${p.day}/${p.month} · ${hora}:${p.minute}`;
}
