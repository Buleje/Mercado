/**
 * N04 — Conciliación de documentos (auditoría Compras, noche 17-10).
 *
 * Pone lado a lado, por orden de compra, lo que dice cada papel: lo PEDIDO
 * (la orden, que en Comprar se arma con la factura leída), lo que LLEGÓ y se
 * aceptó (las hojas de recepción), la FACTURA o boleta (de la orden o de su
 * cuenta), la CUENTA por pagar y lo PAGADO. Dice qué no cuadra y de qué papel
 * sale cada diferencia, sin forzar igualdades: una propuesta de vínculo explica
 * por qué (mismo proveedor, mismo comprobante, mismo monto) y nunca se aplica
 * sola. Nada de esto paga ni cambia una cuenta: es lectura.
 *
 * Además de las órdenes del período salen dos clases sueltas:
 *   · cuentas SIN orden — una factura cargada a mano no tiene recepción con qué
 *     compararla (si es un servicio, no la lleva);
 *   · recepciones SIN orden — llegaron, pero no sumaron stock ni deuda.
 *
 * Fechas en el día de Lima (`claveDeDia`).
 * Tolerancia: S/ 1 (la unidad del negocio, no el epsilon del float), la misma
 * que «Revisar pendientes». Las cantidades se comparan exactas.
 *
 * Puro: lo usan la ruta (`GET /api/compras/conciliacion`) y los tests.
 */

import { formatCurrency } from "@/lib/utils";
import { acumularNoAptos, acumularNoLlegara, acumularRecibido, claveDeDia, diaCorto, diasEntre, type ItemOc, type RecepcionCruda } from "./ciclo-oc";
import { claveDocumento, codigoDeOrden, descripcionALaVista } from "./referencia-documento";
import { comprobanteDeOrden } from "./ficha-proveedor";

export const TOLERANCIA_SOLES = 1;
/** Hacia atrás del período: órdenes que todavía pueden ser el origen de una cuenta o recepción suelta. */
export const DIAS_PARA_PROPONER = 60;

export type OrdenAConciliar = {
  id: string;
  supplierId: string;
  supplierName: string;
  items: ItemOc[];
  total: number;
  status: string;
  invoiceType: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  createdAt: string;
};
export type RecepcionAConciliar = RecepcionCruda & { supplierId: string | null; supplierName: string };
export type CuentaAConciliar = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  description: string;
  amount: number;
  paidAmount: number;
  status: string;
  createdAt: string;
  /** Suma de los pagos anotados de la cuenta (tabla Payment). */
  pagosAnotados: number;
};
export type DatosConciliacion = { ordenes: OrdenAConciliar[]; recepciones: RecepcionAConciliar[]; cuentas: CuentaAConciliar[] };
export type FiltrosConciliacion = { desde: string; hasta: string; proveedorId?: string | null };

export type OrigenDiferencia = "orden" | "recepcion" | "documento" | "cuenta" | "pago";
export type TonoDiferencia = "alerta" | "aviso" | "info";
export type Diferencia = { clave: string; tono: TonoDiferencia; origen: OrigenDiferencia; texto: string; monto: number | null };
export type EstadoConciliacion = "revisar" | "cuadra" | "en-curso" | "sin-comparar";

export type LineaConciliada = {
  productId: number;
  nombre: string;
  unidad: string;
  pedido: number;
  llego: number;
  noAptos: number;
  aceptadas: number;
  noLlegara: number;
  /** Pedido − aceptadas. Negativo = llegó de más. */
  diferencia: number;
  /** Lo que falta sin descuento anotado (ni «no llegará» ni no apto). */
  sinExplicar: number;
};
/** Un vínculo que puede ser. `cuentaId`: la cuenta suelta que se uniría (con «Vincular a su orden» de Por pagar). */
export type Propuesta = { texto: string; motivo: string; cuentaId?: string };

export type FilaConciliacion = {
  id: string;
  tipo: "orden" | "cuenta" | "recepcion";
  ordenId: string | null;
  codigo: string;
  proveedorId: string | null;
  proveedor: string;
  fecha: string;
  estadoOrden: string | null;
  pedido: { unidades: number; monto: number } | null;
  llego: { unidades: number; aceptadas: number; valor: number | null; recepciones: number } | null;
  documento: string | null;
  sinComprobante: boolean;
  cuenta: { texto: string; monto: number; pagado: number; saldo: number; pagosAnotados: number; cuantas: number } | null;
  /** Las cuentas por pagar de la fila (para «Ver la cuenta» y «Vincular a su orden»). */
  cuentaIds: string[];
  lineas: LineaConciliada[];
  diferencias: Diferencia[];
  propuestas: Propuesta[];
  estado: EstadoConciliacion;
};
export type ResumenConciliacion = {
  filas: number;
  revisar: number;
  cuadra: number;
  enCurso: number;
  sinComparar: number;
  /** Soles en juego en las diferencias de plata por revisar (alerta o aviso). */
  enDiferencia: number;
  pedido: number;
  aceptado: number;
  cuentas: number;
  pagado: number;
};
export type Conciliacion = {
  desde: string;
  hasta: string;
  filas: FilaConciliacion[];
  resumen: ResumenConciliacion;
  proveedores: Array<{ id: string; nombre: string }>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** «S/ 30.00» con espacio duro: el monto no se parte de su «S/» al final de una línea. */
const soles = (n: number) => formatCurrency(r2(n)).replace("S/ ", "S/\u00a0");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const diaDe = (iso: string | Date | null | undefined) => claveDeDia(iso) ?? "";
const ABIERTAS = new Set(["pendiente", "parcial", "auto_generated"]);
const DOC_DE_PAGO = new Set(["factura", "boleta"]);

/** La factura o boleta de la orden; la guía sola no es un comprobante de pago. */
function comprobanteDePago(o: OrdenAConciliar): string | null {
  const tipo = norm(o.invoiceType);
  if (tipo && !DOC_DE_PAGO.has(tipo)) return null;
  return comprobanteDeOrden(o.invoiceType, o.invoiceNumber);
}

/** «Factura F001-45» de la descripción de una cuenta, si la trae. */
function comprobanteDeCuenta(c: CuentaAConciliar): string | null {
  if (!claveDocumento(c.description)) return null;
  const primero = descripcionALaVista(c.description, c.purchaseOrderId).split(" · ").find((p) => claveDocumento(p));
  return primero ?? null;
}

function diferenciasDePago(c: { monto: number; pagado: number; pagosAnotados: number }): Diferencia[] {
  const out: Diferencia[] = [];
  if (c.pagado - c.monto > TOLERANCIA_SOLES) {
    out.push({ clave: "pago-de-mas", tono: "alerta", origen: "pago", monto: r2(c.pagado - c.monto), texto: `Pagaste ${soles(c.pagado)} de una cuenta de ${soles(c.monto)}: ${soles(c.pagado - c.monto)} de más` });
  }
  if (Math.abs(c.pagado - c.pagosAnotados) > 0.01) {
    out.push({ clave: "pagos-anotados", tono: "aviso", origen: "pago", monto: r2(Math.abs(c.pagado - c.pagosAnotados)), texto: `Lo pagado de la cuenta (${soles(c.pagado)}) no coincide con los pagos anotados (${soles(c.pagosAnotados)})` });
  }
  return out;
}

function estadoDe(diferencias: Diferencia[], base: EstadoConciliacion): EstadoConciliacion {
  return diferencias.some((d) => d.tono !== "info") ? "revisar" : base;
}

type Indices = {
  recepcionesDe: Map<string, RecepcionAConciliar[]>;
  cuentasDe: Map<string, CuentaAConciliar[]>;
  sueltas: CuentaAConciliar[];
};

function indexar(d: DatosConciliacion): Indices {
  const recepcionesDe = new Map<string, RecepcionAConciliar[]>();
  for (const r of d.recepciones) {
    if (r.purchaseOrderId) recepcionesDe.set(r.purchaseOrderId, [...(recepcionesDe.get(r.purchaseOrderId) ?? []), r]);
  }
  const cuentasDe = new Map<string, CuentaAConciliar[]>();
  const sueltas: CuentaAConciliar[] = [];
  for (const c of d.cuentas) {
    if (c.purchaseOrderId) cuentasDe.set(c.purchaseOrderId, [...(cuentasDe.get(c.purchaseOrderId) ?? []), c]);
    else sueltas.push(c);
  }
  return { recepcionesDe, cuentasDe, sueltas };
}

/** Órdenes del mismo proveedor que pueden ser el origen de una cuenta suelta: mismo comprobante o mismo monto. */
function proponerOrdenes(c: CuentaAConciliar, d: DatosConciliacion, ix: Indices): Propuesta[] {
  const clave = claveDocumento(c.description);
  const dia = diaDe(c.createdAt);
  const candidatas = d.ordenes
    .filter((o) => o.supplierId === c.supplierId && o.status !== "cancelado" && !ix.cuentasDe.has(o.id))
    .map((o) => {
      const mismoDoc = !!clave && claveDocumento(o.invoiceNumber) === clave;
      const mismoMonto = Math.abs(o.total - c.amount) <= TOLERANCIA_SOLES;
      const dias = diasEntre(diaDe(o.createdAt), dia);
      return { o, mismoDoc, mismoMonto, dias };
    })
    .filter((x) => x.mismoDoc || (x.mismoMonto && x.dias >= -7 && x.dias <= DIAS_PARA_PROPONER))
    .sort((a, b) => Number(b.mismoDoc) - Number(a.mismoDoc) || Math.abs(a.dias) - Math.abs(b.dias))
    .slice(0, 3);
  return candidatas.map(({ o, mismoDoc, mismoMonto, dias }) => ({
    texto: `Orden ${codigoDeOrden(o.id)} del ${diaCorto(diaDe(o.createdAt))} por ${soles(o.total)}`,
    motivo: [
      "mismo proveedor",
      mismoDoc ? "el mismo comprobante" : null,
      mismoMonto ? "el mismo monto" : null,
      dias > 0 ? `${plural(dias, "día", "días")} antes de la cuenta` : dias < 0 ? `${plural(-dias, "día", "días")} después de la cuenta` : "el mismo día",
    ].filter(Boolean).join(" · "),
  }));
}

function filaDeOrden(o: OrdenAConciliar, d: DatosConciliacion, ix: Indices): FilaConciliacion | null {
  const recepciones = ix.recepcionesDe.get(o.id) ?? [];
  const cuentas = ix.cuentasDe.get(o.id) ?? [];
  const cancelada = o.status === "cancelado";
  if (cancelada && recepciones.length === 0 && cuentas.length === 0) return null;
  const abierta = ABIERTAS.has(o.status);
  const recibida = o.status === "recibido";
  const hayHoja = recepciones.length > 0;

  const recibido = acumularRecibido(recepciones, o.items);
  const noAptos = acumularNoAptos(recepciones, o.items);
  const noLlegara = acumularNoLlegara(recepciones, o.items);
  const subtotal = o.items.reduce((s, i) => s + i.quantity * num(i.unitCost), 0);
  const factor = subtotal > 0 && o.total > 0 ? o.total / subtotal : 1;
  // Las órdenes automáticas guardan el total con costo 0 por producto: sin ese
  // dato, el total se reparte por unidad pedida (si no, lo aceptado valdría 0).
  const unidadesPedidas = o.items.reduce((s, i) => s + i.quantity, 0);
  const costoRespaldo = subtotal === 0 && o.total > 0 && unidadesPedidas > 0 ? o.total / unidadesPedidas : 0;
  const costo = (i: ItemOc | undefined) => (subtotal > 0 ? num(i?.unitCost) * factor : costoRespaldo);
  const lineas: LineaConciliada[] = o.items.map((i) => {
    const llego = num(recibido.get(i.productId));
    const noApt = Math.min(llego, num(noAptos.get(i.productId)));
    const nl = num(noLlegara.get(i.productId));
    const aceptadas = llego - noApt;
    return {
      productId: i.productId, nombre: i.name, unidad: i.unit ?? "", pedido: i.quantity, llego, noAptos: noApt, aceptadas, noLlegara: nl,
      diferencia: i.quantity - aceptadas, sinExplicar: Math.max(0, i.quantity - llego - nl),
    };
  });
  const valor = r2(lineas.reduce((s, l, k) => s + Math.min(l.aceptadas, l.pedido) * costo(o.items[k]), 0));
  const unidadesLlego = lineas.reduce((s, l) => s + l.llego, 0);

  const documento = comprobanteDePago(o) ?? cuentas.map(comprobanteDeCuenta).find(Boolean) ?? null;
  const sinComprobante = norm(o.invoiceType) === "ninguno";
  const guia = norm(o.invoiceType) === "guia" && o.invoiceNumber?.trim() ? `la guía ${o.invoiceNumber.trim()}` : null;
  const diferencias: Diferencia[] = [];

  const monto = r2(cuentas.reduce((s, c) => s + c.amount, 0));
  const pagado = r2(cuentas.reduce((s, c) => s + c.paidAmount, 0));
  const pagosAnotados = r2(cuentas.reduce((s, c) => s + c.pagosAnotados, 0));
  const saldo = r2(Math.max(0, monto - pagado));

  if (cancelada && saldo > TOLERANCIA_SOLES) {
    diferencias.push({ clave: "cancelada-con-saldo", tono: "alerta", origen: "cuenta", monto: saldo, texto: `La orden se canceló y su cuenta sigue con ${soles(saldo)} por pagar` });
  }
  if (cancelada && unidadesLlego > 0 && saldo <= TOLERANCIA_SOLES) {
    diferencias.push({ clave: "cancelada-con-recibido", tono: "aviso", origen: "recepcion", monto: valor > 0 ? valor : null, texto: `Se canceló con ${plural(unidadesLlego, "unidad recibida", "unidades recibidas")}${valor > 0 ? ` (${soles(valor)})` : ""} y sin cuenta: si no las devolviste, quedaron sin deuda` });
  }
  if (unidadesLlego > 0 && !documento && !sinComprobante && !cancelada) {
    diferencias.push({ clave: "recibido-sin-comprobante", tono: "aviso", origen: "documento", monto: null, texto: `Llegó mercadería${guia ? ` con ${guia}` : ""} y no hay factura ni boleta anotada en la orden ni en su cuenta` });
  }
  if (documento && !hayHoja && unidadesLlego === 0 && !cancelada) {
    diferencias.push(abierta
      ? { clave: "comprobante-sin-recepcion", tono: "aviso", origen: "recepcion", monto: null, texto: `Hay ${documento} y todavía no se registró lo que llegó` }
      : { clave: "recibida-sin-hoja", tono: "info", origen: "recepcion", monto: null, texto: `Se marcó recibida sin hoja de recepción: no hay con qué comparar la ${documento} producto por producto` });
  } else if (recibida && !hayHoja) {
    diferencias.push({ clave: "recibida-sin-hoja", tono: "info", origen: "recepcion", monto: null, texto: "Se marcó recibida sin hoja de recepción: no se puede comparar producto por producto" });
  }

  const comparable = hayHoja && (recibida || !!documento);
  if (comparable && !cancelada) {
    const faltan = lineas.filter((l) => l.sinExplicar > 0);
    if (faltan.length > 0) {
      const unidades = faltan.reduce((s, l) => s + l.sinExplicar, 0);
      const plata = r2(faltan.reduce((s, l) => s + l.sinExplicar * costo(o.items.find((i) => i.productId === l.productId)), 0));
      diferencias.push(recibida
        ? { clave: "aceptado-menos", tono: "aviso", origen: "recepcion", monto: plata, texto: `En ${plural(faltan.length, "producto", "productos")} se aceptó menos de lo ${documento ? "facturado" : "pedido"}: ${plural(unidades, "unidad", "unidades")} (${soles(plata)}) sin descuento anotado` }
        : { clave: "faltan-llegar", tono: "info", origen: "recepcion", monto: plata, texto: `Faltan llegar ${plural(unidades, "unidad", "unidades")} de la ${documento}: la orden sigue abierta` });
    }
    const deMas = lineas.filter((l) => l.llego > l.pedido);
    if (deMas.length > 0) {
      const unidades = deMas.reduce((s, l) => s + (l.llego - l.pedido), 0);
      diferencias.push({ clave: "llego-de-mas", tono: "aviso", origen: "recepcion", monto: null, texto: `Llegó de más en ${plural(deMas.length, "producto", "productos")}: ${plural(unidades, "unidad", "unidades")} que no están en la orden` });
    }
    const malas = lineas.reduce((s, l) => s + l.noAptos, 0);
    const noVienen = lineas.reduce((s, l) => s + l.noLlegara, 0);
    if (malas + noVienen > 0) {
      const partes = [malas > 0 ? `${plural(malas, "unidad llegó dañada o vencida", "unidades llegaron dañadas o vencidas")}` : null, noVienen > 0 ? `${plural(noVienen, "unidad no llegará", "unidades no llegarán")}` : null].filter(Boolean);
      diferencias.push({ clave: "descontado-al-recibir", tono: "info", origen: "recepcion", monto: null, texto: `${partes.join(" y ")}: al recibir se descontó de su cuenta o quedó como reclamo en Devoluciones` });
    }
  }

  if (cuentas.length > 0) {
    if (cuentas.length > 1) {
      diferencias.push({ clave: "varias-cuentas", tono: "aviso", origen: "cuenta", monto: null, texto: `La orden tiene ${cuentas.length} cuentas por pagar (${soles(monto)} en total): revisa que no sea la misma deuda dos veces` });
    }
    if (recibida && hayHoja && !cancelada) {
      const dif = r2(monto - valor);
      const yaPagaste = pagado - valor > TOLERANCIA_SOLES && pagado <= monto + TOLERANCIA_SOLES ? ` (ya pagaste ${soles(pagado)})` : "";
      if (dif > TOLERANCIA_SOLES) {
        diferencias.push({ clave: "cuenta-mayor", tono: "alerta", origen: "cuenta", monto: dif, texto: `La cuenta pide ${soles(monto)} y lo aceptado vale ${soles(valor)}: ${soles(dif)} de más${yaPagaste}` });
      } else if (-dif > TOLERANCIA_SOLES) {
        diferencias.push({ clave: "cuenta-menor", tono: "aviso", origen: "cuenta", monto: -dif, texto: `La cuenta (${soles(monto)}) es menor que lo aceptado (${soles(valor)}): ${soles(-dif)} sin explicar, ¿un descuento o un abono que no se anotó?` });
      }
    } else if (!cancelada && monto - o.total > TOLERANCIA_SOLES) {
      diferencias.push({ clave: "cuenta-supera-orden", tono: "alerta", origen: "cuenta", monto: r2(monto - o.total), texto: `La cuenta (${soles(monto)}) supera el total de la orden (${soles(o.total)})` });
    }
    diferencias.push(...diferenciasDePago({ monto, pagado, pagosAnotados }));
  } else if (!cancelada && norm(o.paymentMethod).startsWith("credito")) {
    diferencias.push({ clave: "credito-sin-cuenta", tono: "aviso", origen: "cuenta", monto: null, texto: "Orden a crédito sin cuenta por pagar: esta deuda no aparece en Por pagar" });
  }

  const propuestas: Propuesta[] = cuentas.length === 0 && !cancelada
    ? ix.sueltas
        .filter((c) => c.supplierId === o.supplierId && Math.abs(c.amount - o.total) <= TOLERANCIA_SOLES)
        .slice(0, 3)
        .map((c) => ({ texto: `Cuenta «${descripcionALaVista(c.description) || "sin descripción"}» por ${soles(c.amount)}`, motivo: "mismo proveedor · el mismo monto · está cargada sin orden", cuentaId: c.id }))
    : [];

  const base: EstadoConciliacion = abierta ? "en-curso" : recibida && !hayHoja ? "sin-comparar" : "cuadra";
  return {
    id: `oc:${o.id}`, tipo: "orden", ordenId: o.id, codigo: codigoDeOrden(o.id), proveedorId: o.supplierId, proveedor: o.supplierName,
    fecha: diaDe(o.createdAt), estadoOrden: o.status,
    pedido: { unidades: lineas.reduce((s, l) => s + l.pedido, 0), monto: r2(o.total) },
    llego: { unidades: unidadesLlego, aceptadas: lineas.reduce((s, l) => s + l.aceptadas, 0), valor, recepciones: recepciones.length },
    documento, sinComprobante,
    cuenta: cuentas.length > 0 ? { texto: descripcionALaVista(cuentas[0].description, o.id), monto, pagado, saldo, pagosAnotados, cuantas: cuentas.length } : null,
    cuentaIds: cuentas.map((c) => c.id),
    lineas: comparable ? lineas.filter((l) => l.diferencia !== 0 || l.noLlegara > 0) : [],
    diferencias, propuestas, estado: estadoDe(diferencias, base),
  };
}

function filaDeCuentaSuelta(c: CuentaAConciliar, d: DatosConciliacion, ix: Indices): FilaConciliacion {
  const texto = descripcionALaVista(c.description) || "Cuenta sin descripción";
  const documento = comprobanteDeCuenta(c);
  const saldoInicial = /^saldo inicial/i.test(c.description.trim());
  const propuestas = saldoInicial ? [] : proponerOrdenes(c, d, ix);
  const diferencias: Diferencia[] = [];
  if (saldoInicial) {
    diferencias.push({ clave: "saldo-inicial", tono: "info", origen: "cuenta", monto: null, texto: "Saldo inicial: no lleva orden ni recepción" });
  } else if (propuestas.length > 0) {
    diferencias.push({ clave: "cuenta-sin-orden", tono: "aviso", origen: "orden", monto: null, texto: `${documento ?? "La cuenta"} no está unida a su orden: abajo, la que puede ser` });
  } else {
    diferencias.push({ clave: "cuenta-sin-orden", tono: "info", origen: "orden", monto: null, texto: `${documento ?? "La cuenta"} no tiene orden ni recepción con qué compararla. Si es un servicio, no lleva recepción` });
  }
  const cuenta = { texto, monto: r2(c.amount), pagado: r2(c.paidAmount), saldo: r2(Math.max(0, c.amount - c.paidAmount)), pagosAnotados: r2(c.pagosAnotados), cuantas: 1 };
  diferencias.push(...diferenciasDePago(cuenta));
  return {
    id: `cuenta:${c.id}`, tipo: "cuenta", ordenId: null, codigo: documento ?? (saldoInicial ? "Saldo inicial" : "Sin comprobante"),
    proveedorId: c.supplierId, proveedor: c.supplierName, fecha: diaDe(c.createdAt), estadoOrden: null,
    pedido: null, llego: null, documento, sinComprobante: false, cuenta, cuentaIds: [c.id], lineas: [], diferencias, propuestas,
    estado: estadoDe(diferencias, saldoInicial ? "cuadra" : "sin-comparar"),
  };
}

function filaDeRecepcionSuelta(r: RecepcionAConciliar, d: DatosConciliacion): FilaConciliacion {
  const items = Array.isArray(r.itemsJson) ? (r.itemsJson as Array<{ receivedQty?: unknown }>) : [];
  const unidades = items.reduce((s, i) => s + Math.max(0, num(i?.receivedQty)), 0);
  const delProveedor = (o: OrdenAConciliar) => (r.supplierId ? o.supplierId === r.supplierId : norm(o.supplierName) === norm(r.supplierName));
  const propuestas = d.ordenes
    .filter((o) => ABIERTAS.has(o.status) && o.status !== "auto_generated" && delProveedor(o))
    .slice(0, 3)
    .map((o) => ({ texto: `Orden ${codigoDeOrden(o.id)} del ${diaCorto(diaDe(o.createdAt))} por ${soles(o.total)}`, motivo: "mismo proveedor · sigue esperando entrega" }));
  const diferencias: Diferencia[] = [
    { clave: "recepcion-sin-orden", tono: "aviso", origen: "orden", monto: null, texto: "Llegó sin orden de compra: no sumó al stock ni a lo que le debes" },
  ];
  return {
    id: `recepcion:${r.id}`, tipo: "recepcion", ordenId: null, codigo: r.ref, proveedorId: r.supplierId, proveedor: r.supplierName,
    fecha: diaDe(r.receivedDate ?? r.createdAt), estadoOrden: null, pedido: null,
    llego: { unidades, aceptadas: unidades, valor: null, recepciones: 1 },
    documento: null, sinComprobante: false, cuenta: null, cuentaIds: [], lineas: [], diferencias, propuestas, estado: "revisar",
  };
}

const ORDEN_ESTADO: Record<EstadoConciliacion, number> = { revisar: 0, "sin-comparar": 1, "en-curso": 2, cuadra: 3 };

/** La conciliación del período: filas, resumen y los proveedores que aparecen (para el filtro). */
export function conciliar(d: DatosConciliacion, f: FiltrosConciliacion): Conciliacion {
  const ix = indexar(d);
  const enPeriodo = (dia: string) => dia >= f.desde && dia <= f.hasta;
  const todas: FilaConciliacion[] = [];
  for (const o of d.ordenes) {
    if (!enPeriodo(diaDe(o.createdAt))) continue;
    const fila = filaDeOrden(o, d, ix);
    if (fila) todas.push(fila);
  }
  for (const c of ix.sueltas) if (enPeriodo(diaDe(c.createdAt))) todas.push(filaDeCuentaSuelta(c, d, ix));
  for (const r of d.recepciones) if (!r.purchaseOrderId && enPeriodo(diaDe(r.receivedDate ?? r.createdAt))) todas.push(filaDeRecepcionSuelta(r, d));

  const proveedores = new Map<string, string>();
  for (const fila of todas) if (fila.proveedorId) proveedores.set(fila.proveedorId, fila.proveedor);
  const filas = (f.proveedorId ? todas.filter((x) => x.proveedorId === f.proveedorId) : todas)
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || b.fecha.localeCompare(a.fecha));

  const cuenta = (e: EstadoConciliacion) => filas.filter((x) => x.estado === e).length;
  const resumen: ResumenConciliacion = {
    filas: filas.length,
    revisar: cuenta("revisar"),
    cuadra: cuenta("cuadra"),
    enCurso: cuenta("en-curso"),
    sinComparar: cuenta("sin-comparar"),
    enDiferencia: r2(filas.reduce((s, x) => s + x.diferencias.reduce((t, dd) => t + (dd.tono !== "info" && dd.monto ? dd.monto : 0), 0), 0)),
    pedido: r2(filas.reduce((s, x) => s + (x.pedido?.monto ?? 0), 0)),
    aceptado: r2(filas.reduce((s, x) => s + (x.llego?.valor ?? 0), 0)),
    cuentas: r2(filas.reduce((s, x) => s + (x.cuenta?.monto ?? 0), 0)),
    pagado: r2(filas.reduce((s, x) => s + (x.cuenta?.pagado ?? 0), 0)),
  };
  return {
    desde: f.desde, hasta: f.hasta, filas, resumen,
    proveedores: [...proveedores.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}
