/**
 * C64 — Revisar pendientes: lo que en Compras no cuadra, agrupado y con quién
 * lo registró. Cuatro clases:
 *
 *   · costo faltante   — una orden o una devolución con productos sin costo
 *                         (el margen y el reclamo salen mal).
 *   · entrega atrasada — la fecha prometida pasó y todavía falta mercadería.
 *   · factura repetida — el mismo comprobante del mismo proveedor en dos
 *                         órdenes (o dos cuentas). POSIBLE: puede ser legítimo.
 *   · saldo por cuadrar — lo pagado o lo que se debe no coincide con lo que
 *                         llegó (sólo para quien gestiona la plata).
 *
 * Se calcula en cada lectura y no escribe nada: ver la bandeja diez veces no
 * crea nada ni repite avisos. El texto describe la diferencia y no acusa: el
 * responsable es quien la registró, no «quien se equivocó».
 */

import { hrefDe } from "@/lib/admin/enlaces-panel";
import { formatCurrency } from "@/lib/format";
import {
  claveDeDia, diaCorto, diasEntre, esperaEntrega, grupoDeEntrega, lineasDeSeguimiento, listarCorto, valorDeLoRecibido,
  type SeguimientoOC,
} from "./ciclo-oc";
import { claveDocumento, codigoDeOrden, descripcionALaVista } from "./referencia-documento";
import { HREF_DEVOLUCIONES, HREF_POR_PAGAR, plano, type CuentaDeCompras, type DevolucionDeCompras, type OrdenDeCompras } from "./buscar-compras";

export type TipoExcepcion = "costo-faltante" | "entrega-atrasada" | "factura-repetida" | "saldo-por-cuadrar";

export type EnlaceExcepcion = { rotulo: string; href: string };
export type Excepcion = {
  /** `tipo:id` estable: «ya lo revisé» se guarda contra esto + `firma`. */
  id: string;
  tipo: TipoExcepcion;
  titulo: string;
  /** Qué no cuadra, en una línea con cifras. */
  diferencia: string;
  /** «Pidió Ana · recibió Luis», o «Sin responsable anotado». */
  responsable: string;
  enlaces: EnlaceExcepcion[];
  /** Cambia si cambian las cifras: un aviso revisado vuelve si la diferencia es otra. */
  firma: string;
  fecha: string;
};
export type GrupoExcepciones = { tipo: TipoExcepcion; rotulo: string; ayuda: string; excepciones: Excepcion[]; total: number };
export type BandejaExcepciones = { grupos: GrupoExcepciones[]; total: number; plataOculta: boolean };

export type OrdenConSeguimiento = OrdenDeCompras & { seguimiento: SeguimientoOC };
export type DatosExcepciones = {
  ordenes: OrdenConSeguimiento[];
  /** `null` = este rol no ve la plata: sin «saldo por cuadrar» ni cuentas repetidas. */
  cuentas: CuentaDeCompras[] | null;
  devoluciones: DevolucionDeCompras[];
};

const GRUPOS: ReadonlyArray<{ tipo: TipoExcepcion; rotulo: string; ayuda: string }> = [
  { tipo: "saldo-por-cuadrar", rotulo: "Saldo por cuadrar", ayuda: "Lo que debes o pagaste no coincide con lo que llegó. Revisa la cuenta y la recepción." },
  { tipo: "factura-repetida", rotulo: "Posible factura repetida", ayuda: "El mismo comprobante del mismo proveedor aparece dos veces. Puede ser correcto (dos entregas de una factura): revísalo." },
  { tipo: "entrega-atrasada", rotulo: "Entrega atrasada", ayuda: "Pasó la fecha que prometió el proveedor y todavía falta mercadería." },
  { tipo: "costo-faltante", rotulo: "Costo faltante", ayuda: "Productos sin costo: el margen sale mal y no sabes cuánto reclamar." },
];

/** Diferencias de plata que importan: un sol (no el redondeo de céntimos). */
export const TOLERANCIA_SOLES = 1;
const TOPE_POR_GRUPO = 50;
const SIN_RESPONSABLE = "Sin responsable anotado";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function responsableDeOrden(o: OrdenDeCompras): string {
  // Las órdenes que arma la reposición automática nacen con id `auto-…` y sin `createdBy`.
  const pidio = o.createdBy?.trim() ? `Pidió ${o.createdBy.trim()}` : o.id.startsWith("auto-") ? "La armó la reposición automática" : null;
  const partes = [pidio, o.receivedBy?.trim() ? `recibió ${o.receivedBy.trim()}` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : SIN_RESPONSABLE;
}

const enlaceOrden = (o: OrdenDeCompras): EnlaceExcepcion[] => {
  const href = hrefDe("oc", o.id);
  return href ? [{ rotulo: `Ver la orden ${codigoDeOrden(o.id)}`, href }] : [];
};
const enlaceCuenta = (c: CuentaDeCompras): EnlaceExcepcion => ({
  rotulo: "Ver la cuenta",
  href: `${HREF_POR_PAGAR}&q=${encodeURIComponent(descripcionALaVista(c.description, c.purchaseOrderId) || c.supplierName)}`,
});

/** «F001-123» normalizado; si no tiene forma de serie-número, el texto sin espacios. */
export function claveDeComprobante(numero: string | null | undefined): string | null {
  const t = (numero ?? "").trim();
  if (!t) return null;
  return claveDocumento(t) ?? (t.toUpperCase().replace(/\s+/g, "") || null);
}

// ── Cada clase ────────────────────────────────────────────────────────────────

function costosFaltantes(d: DatosExcepciones, hoy: string): Excepcion[] {
  const out: Excepcion[] = [];
  for (const o of d.ordenes) {
    if (o.status === "cancelado") continue;
    const sinCosto = o.items.filter((i) => !(num(i.unitCost) > 0));
    if (sinCosto.length === 0) continue;
    out.push({
      id: `costo-faltante:orden:${o.id}`,
      tipo: "costo-faltante",
      titulo: `Orden ${codigoDeOrden(o.id)} · ${o.supplierName || "Sin proveedor"}`,
      diferencia: `${sinCosto.length === 1 ? "1 producto" : `${sinCosto.length} productos`} sin costo: ${listarCorto(sinCosto.map((i) => i.name))}`,
      responsable: responsableDeOrden(o),
      enlaces: enlaceOrden(o),
      firma: sinCosto.map((i) => i.productId).sort((a, b) => a - b).join(","),
      fecha: claveDeDia(o.createdAt) ?? hoy,
    });
  }
  for (const v of d.devoluciones) {
    if (v.estado === "ANULADA" || v.estado === "RESUELTA") continue;
    const sinCosto = v.items.filter((i) => !(num(i.precioUnitario) > 0));
    if (sinCosto.length === 0) continue;
    out.push({
      id: `costo-faltante:devolucion:${v.id}`,
      tipo: "costo-faltante",
      titulo: `Devolución a ${v.proveedorNombre}`,
      diferencia: `${sinCosto.length === 1 ? "1 producto" : `${sinCosto.length} productos`} sin costo para reclamar: ${listarCorto(sinCosto.map((i) => i.nombre))}`,
      responsable: SIN_RESPONSABLE,
      enlaces: [{ rotulo: "Ver en Devoluciones", href: `${HREF_DEVOLUCIONES}&q=${encodeURIComponent(v.proveedorNombre)}` }],
      firma: String(sinCosto.length),
      fecha: claveDeDia(v.createdAt) ?? hoy,
    });
  }
  return out;
}

function entregasAtrasadas(d: DatosExcepciones, hoy: string): Excepcion[] {
  const out: Excepcion[] = [];
  for (const o of d.ordenes) {
    if (!esperaEntrega(o.status) || grupoDeEntrega(o.deliveryDate ?? null, hoy) !== "atrasadas") continue;
    const prometida = claveDeDia(o.deliveryDate ?? null);
    if (!prometida) continue;
    const dias = diasEntre(prometida, hoy);
    const faltan = lineasDeSeguimiento(o.items, o.seguimiento).filter((l) => l.falta > 0);
    const queFalta = faltan.length > 0
      ? `falta ${listarCorto(faltan.map((l) => `${l.falta}${l.unidad ? ` ${l.unidad}` : ""} de ${l.nombre}`))}`
      : "no hay recepción registrada";
    out.push({
      id: `entrega-atrasada:${o.id}`,
      tipo: "entrega-atrasada",
      titulo: `Orden ${codigoDeOrden(o.id)} · ${o.supplierName || "Sin proveedor"}`,
      diferencia: `Prometida el ${diaCorto(prometida)}, ${dias} día${dias === 1 ? "" : "s"} tarde: ${queFalta}`,
      responsable: responsableDeOrden(o),
      enlaces: enlaceOrden(o),
      firma: `${prometida}|${faltan.map((l) => `${l.productId}:${l.falta}`).join(",")}`,
      fecha: prometida,
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function facturasRepetidas(d: DatosExcepciones, hoy: string): Excepcion[] {
  const out: Excepcion[] = [];
  const porClave = new Map<string, OrdenDeCompras[]>();
  for (const o of d.ordenes) {
    if (o.status === "cancelado") continue;
    const clave = claveDeComprobante(o.invoiceNumber);
    if (!clave) continue;
    const k = `${o.supplierId || plano(o.supplierName)}|${clave}`;
    porClave.set(k, [...(porClave.get(k) ?? []), o]);
  }
  for (const grupo of porClave.values()) {
    if (grupo.length < 2) continue;
    const orden = [...grupo].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const numero = orden[0].invoiceNumber?.trim() ?? "";
    out.push({
      id: `factura-repetida:orden:${orden.map((o) => o.id).sort().join("+")}`,
      tipo: "factura-repetida",
      titulo: `${numero} · ${orden[0].supplierName || "Sin proveedor"}`,
      diferencia: `Está en ${orden.length} órdenes: ${orden.map((o) => `${codigoDeOrden(o.id)} del ${diaCorto(claveDeDia(o.createdAt) ?? hoy)} por ${formatCurrency(num(o.total))}`).join(" y ")}`,
      responsable: [...new Set(orden.map(responsableDeOrden))].join(" / "),
      enlaces: orden.flatMap(enlaceOrden),
      firma: String(orden.length),
      fecha: claveDeDia(orden[0].createdAt) ?? hoy,
    });
  }
  // Cuentas cargadas a mano con el mismo documento del mismo proveedor.
  const cuentasPorClave = new Map<string, CuentaDeCompras[]>();
  for (const c of d.cuentas ?? []) {
    const clave = claveDocumento(c.description);
    if (!clave) continue;
    const k = `${c.supplierId || plano(c.supplierName)}|${clave}`;
    cuentasPorClave.set(k, [...(cuentasPorClave.get(k) ?? []), c]);
  }
  for (const [k, grupo] of cuentasPorClave) {
    if (grupo.length < 2) continue;
    const orden = [...grupo].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    out.push({
      id: `factura-repetida:cuenta:${orden.map((c) => c.id).sort().join("+")}`,
      tipo: "factura-repetida",
      titulo: `${k.split("|")[1]} · ${orden[0].supplierName}`,
      diferencia: `Está en ${orden.length} cuentas por pagar: ${orden.map((c) => `${formatCurrency(num(c.amount))} del ${diaCorto(claveDeDia(c.createdAt) ?? hoy)}`).join(" y ")}`,
      responsable: SIN_RESPONSABLE,
      enlaces: [enlaceCuenta(orden[0])],
      firma: String(orden.length),
      fecha: claveDeDia(orden[0].createdAt) ?? hoy,
    });
  }
  return out;
}

function saldosPorCuadrar(d: DatosExcepciones, hoy: string): Excepcion[] {
  if (d.cuentas === null) return [];
  const out: Excepcion[] = [];
  const ordenPorId = new Map(d.ordenes.map((o) => [o.id, o]));
  for (const c of d.cuentas) {
    const monto = r2(num(c.amount));
    const pagado = r2(num(c.paidAmount));
    const saldo = r2(Math.max(0, monto - pagado));
    const o = c.purchaseOrderId ? ordenPorId.get(c.purchaseOrderId) : undefined;
    const base = {
      responsable: o ? responsableDeOrden(o) : SIN_RESPONSABLE,
      enlaces: [enlaceCuenta(c), ...(o ? enlaceOrden(o) : [])],
      fecha: claveDeDia(c.createdAt) ?? hoy,
      titulo: `${descripcionALaVista(c.description, c.purchaseOrderId) || "Cuenta"} · ${c.supplierName}`,
      tipo: "saldo-por-cuadrar" as const,
    };
    if (pagado - monto > TOLERANCIA_SOLES) {
      out.push({ ...base, id: `saldo-por-cuadrar:pago-de-mas:${c.id}`, diferencia: `Pagaste ${formatCurrency(pagado)} de una cuenta de ${formatCurrency(monto)}: ${formatCurrency(r2(pagado - monto))} de más`, firma: `${monto}|${pagado}` });
      continue;
    }
    if (!o) continue;
    if (o.status === "cancelado" && saldo > TOLERANCIA_SOLES) {
      out.push({ ...base, id: `saldo-por-cuadrar:cancelada:${c.id}`, diferencia: `La orden se canceló y su cuenta sigue con ${formatCurrency(saldo)} por pagar`, firma: `${monto}|${pagado}` });
      continue;
    }
    // Sin recepción registrada no se puede comparar (órdenes antiguas marcadas
    // «recibida» sin hoja de recepción): no se adivina.
    if (o.status !== "recibido" || o.seguimiento.recepciones.length === 0) continue;
    const valor = valorDeLoRecibido(o.items, o.total, o.seguimiento.recibido, o.seguimiento.noAptos ?? {});
    if (monto - valor > TOLERANCIA_SOLES) {
      const pagadaDeMas = pagado - valor > TOLERANCIA_SOLES;
      out.push({
        ...base,
        id: `saldo-por-cuadrar:recibido:${c.id}`,
        diferencia: `La cuenta es de ${formatCurrency(monto)} y lo que llegó en buen estado vale ${formatCurrency(valor)}: ${formatCurrency(r2(monto - valor))} de diferencia${pagadaDeMas ? ` (ya pagaste ${formatCurrency(pagado)})` : ""}`,
        firma: `${monto}|${pagado}|${valor}`,
      });
    }
  }
  return out;
}

/** La bandeja entera, en el orden en que conviene mirarla. */
export function excepcionesDeCompras(d: DatosExcepciones, hoy: string): BandejaExcepciones {
  const todas: Record<TipoExcepcion, Excepcion[]> = {
    "saldo-por-cuadrar": saldosPorCuadrar(d, hoy),
    "factura-repetida": facturasRepetidas(d, hoy),
    "entrega-atrasada": entregasAtrasadas(d, hoy),
    "costo-faltante": costosFaltantes(d, hoy).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
  const grupos = GRUPOS
    .map((g) => ({ ...g, excepciones: todas[g.tipo].slice(0, TOPE_POR_GRUPO), total: todas[g.tipo].length }))
    .filter((g) => g.total > 0);
  return { grupos, total: grupos.reduce((s, g) => s + g.total, 0), plataOculta: d.cuentas === null };
}
