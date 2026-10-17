import { formatCurrency } from "@/lib/format";
import { TIPOS_COMPROBANTE } from "@/lib/compras/estados-oc";

/**
 * ciclo-oc.ts — en qué va cada orden de compra y qué sigue (auditoría Compras
 * C10, C14, C15, C19 y C23; noche 17-10).
 *
 * El estado de la orden es UNO (pendiente / parcial / recibido / cancelado) y
 * no dice si ya se pagó, si falta el comprobante ni cuánto llegó de cada cosa.
 * Esto lo arma con lo que YA está guardado —las recepciones de la orden y su
 * cuenta por pagar— sin campos nuevos. Es puro: lo usa el servidor
 * (`GET /api/purchases?seguimiento=1`) y la pantalla, con la misma cuenta.
 *
 * «Llegó» suma TODO lo recibido (sano, dañado o vencido), igual que
 * `recibido-acumulado.ts` para decidir parcial/recibido; «no llegará» son los
 * faltantes que la recepción ya acreditó (`creditoUnidades`).
 */

export type ItemOcRef = { productId: number; name: string };
export type ItemOc = ItemOcRef & { quantity: number; unit?: string; unitCost?: number };

type ItemGuardado = {
  product?: unknown;
  productId?: unknown;
  receivedQty?: unknown;
  condition?: unknown;
  creditoUnidades?: unknown;
};
type RecepcionGuardada = { id: string; itemsJson: unknown };

const norm = (s: string) => s.trim().toLowerCase();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** productId exacto si vino (y es de la orden); si no, por nombre contra los ítems de la orden. */
export function resolverLineaDeOrden(raw: ItemGuardado, ocItems: readonly ItemOcRef[]): number | null {
  const directo = Number(raw.productId);
  if (Number.isInteger(directo) && directo > 0) {
    return ocItems.some((i) => i.productId === directo) ? directo : null;
  }
  if (typeof raw.product !== "string") return null;
  const porNombre = ocItems.find((i) => norm(i.name) === norm(raw.product as string));
  return porNombre ? porNombre.productId : null;
}

function itemsDe(r: RecepcionGuardada): ItemGuardado[] {
  if (!Array.isArray(r.itemsJson)) return [];
  return (r.itemsJson as unknown[]).filter((x): x is ItemGuardado => x != null && typeof x === "object");
}

/**
 * Por producto, todo lo que llegó en las recepciones de una orden. Es la cuenta
 * que decide parcial/recibido (`getRecibidoAcumulado` la usa tal cual).
 */
export function acumularRecibido(
  recepciones: readonly RecepcionGuardada[],
  ocItems: readonly ItemOcRef[],
  excluirRecepcionId?: string,
): Map<number, number> {
  const recibido = new Map<number, number>();
  for (const recepcion of recepciones) {
    if (excluirRecepcionId && recepcion.id === excluirRecepcionId) continue;
    for (const raw of itemsDe(recepcion)) {
      const cantidad = Number(raw.receivedQty ?? 0);
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
      const productId = resolverLineaDeOrden(raw, ocItems);
      if (productId == null) continue;
      recibido.set(productId, (recibido.get(productId) ?? 0) + cantidad);
    }
  }
  return recibido;
}

/** Unidades que el proveedor ya no mandará: los «faltante» que una recepción acreditó. */
export function acumularNoLlegara(recepciones: readonly RecepcionGuardada[], ocItems: readonly ItemOcRef[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const recepcion of recepciones) {
    for (const raw of itemsDe(recepcion)) {
      if (raw.condition !== "faltante") continue;
      const unidades = num(raw.creditoUnidades);
      if (unidades <= 0) continue;
      const productId = resolverLineaDeOrden(raw, ocItems);
      if (productId != null) mapa.set(productId, (mapa.get(productId) ?? 0) + unidades);
    }
  }
  return mapa;
}

/**
 * Unidades que llegaron dañadas o vencidas: no entraron al stock vendible y su
 * valor ya se descontó de la cuenta (o se reclamó) al recibir.
 */
export function acumularNoAptos(recepciones: readonly RecepcionGuardada[], ocItems: readonly ItemOcRef[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const recepcion of recepciones) {
    for (const raw of itemsDe(recepcion)) {
      if (raw.condition !== "dañado" && raw.condition !== "vencido") continue;
      const cantidad = num(raw.receivedQty);
      if (cantidad <= 0) continue;
      const productId = resolverLineaDeOrden(raw, ocItems);
      if (productId != null) mapa.set(productId, (mapa.get(productId) ?? 0) + cantidad);
    }
  }
  return mapa;
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que vale, al precio de la orden, lo que llegó en buen estado (revisión 17-10).
 * Por línea, como mucho lo pedido; con el factor total ÷ subtotal, que es donde
 * el total metió el IGV o el descuento (misma regla que el crédito al recibir).
 */
export function valorDeLoRecibido(
  items: readonly ItemOc[],
  total: number | null | undefined,
  recibido: ReadonlyMap<number, number> | Readonly<Record<number, number>>,
  noAptos: ReadonlyMap<number, number> | Readonly<Record<number, number>> = new Map(),
): number {
  const leer = (m: ReadonlyMap<number, number> | Readonly<Record<number, number>>, id: number) =>
    num(m instanceof Map ? m.get(id) : (m as Readonly<Record<number, number>>)[id]);
  const subtotal = items.reduce((s, i) => s + i.quantity * num(i.unitCost), 0);
  const factor = subtotal > 0 && num(total) > 0 ? num(total) / subtotal : 1;
  const valor = items.reduce((s, i) => {
    const aptas = Math.max(0, leer(recibido, i.productId) - leer(noAptos, i.productId));
    return s + Math.min(aptas, i.quantity) * num(i.unitCost) * factor;
  }, 0);
  return redondear2(valor);
}

export type DeudaAlCancelar = { accion: "anular" | "bajar" | "igual"; monto: number };

/**
 * Qué pasa con una deuda SIN pagos al cancelar la orden (revisión 17-10, Brandon
 * delegó: contabilidad correcta). Antes se anulaba entera aunque la mercadería
 * hubiera llegado: el proveedor quedaba sin cobrar lo que sí entregó. Ahora la
 * deuda baja a lo que vale lo que llegó; nunca sube. Sin nada llegado, se anula.
 */
export function deudaAlCancelar(montoActual: number, valorRecibido: number): DeudaAlCancelar {
  if (valorRecibido <= 0.005) return { accion: "anular", monto: 0 };
  const nuevo = redondear2(Math.min(montoActual, valorRecibido));
  return nuevo < montoActual - 0.005 ? { accion: "bajar", monto: nuevo } : { accion: "igual", monto: redondear2(montoActual) };
}

// ── Fechas (YYYY-MM-DD, sin depender del ICU del navegador) ────────────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const LIMA_MS = 5 * 3600 * 1000;

/**
 * El día en Lima de un instante. Una fecha sin hora (medianoche UTC exacta: la
 * fecha prometida, una fecha elegida en un calendario) se toma tal cual: pasada
 * a Lima caería el día anterior.
 */
export function claveDeDia(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const t = valor instanceof Date ? valor.getTime() : Date.parse(valor);
  if (!Number.isFinite(t)) return null;
  const iso = new Date(t).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return new Date(t - LIMA_MS).toISOString().slice(0, 10);
}

/** «jueves 10/09» de un YYYY-MM-DD. */
export function diaCorto(clave: string): string {
  const d = new Date(`${clave}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

/** Días de `desde` a `hasta` (positivo si `hasta` es después). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
}

// ── Seguimiento: lo guardado, por orden ────────────────────────────────────────

export type RecepcionDeOrden = { id: string; ref: string; fecha: string | null; estado: string };
export type CuentaDeOrden = { monto: number; pagado: number; saldo: number; vence: string | null; estado: string };

/** Lo que el servidor adjunta a cada orden con `?seguimiento=1`. */
export type SeguimientoOC = {
  /** productId → unidades que llegaron (sanas, dañadas o vencidas). */
  recibido: Record<number, number>;
  /** productId → unidades que el proveedor ya no mandará. */
  noLlegara: Record<number, number>;
  /** productId → unidades que llegaron dañadas o vencidas (dentro de `recibido`). */
  noAptos?: Record<number, number>;
  recepciones: RecepcionDeOrden[];
  cuenta: CuentaDeOrden | null;
  /** La deuda existe pero este rol no la ve (revisión 17-10: el almacenero no ve plata). */
  cuentaOculta?: true;
};

export type RecepcionCruda = RecepcionGuardada & {
  ref: string;
  purchaseOrderId: string | null;
  status: string;
  receivedDate: Date | string | null;
  createdAt: Date | string;
};
export type CuentaCruda = { purchaseOrderId: string | null; amount: unknown; paidAmount: unknown; status: string; dueDate: Date | string | null };

export function armarSeguimiento(ocItems: readonly ItemOcRef[], recepciones: readonly RecepcionCruda[], cuenta: CuentaCruda | null): SeguimientoOC {
  const monto = num(cuenta?.amount);
  const pagado = num(cuenta?.paidAmount);
  return {
    recibido: Object.fromEntries(acumularRecibido(recepciones, ocItems)),
    noLlegara: Object.fromEntries(acumularNoLlegara(recepciones, ocItems)),
    noAptos: Object.fromEntries(acumularNoAptos(recepciones, ocItems)),
    recepciones: recepciones.map((r) => ({ id: r.id, ref: r.ref, fecha: claveDeDia(r.receivedDate ?? r.createdAt), estado: r.status })),
    cuenta: cuenta
      ? { monto, pagado, saldo: Math.max(0, Math.round((monto - pagado) * 100) / 100), vence: claveDeDia(cuenta.dueDate), estado: cuenta.status }
      : null,
  };
}

/**
 * Cada orden con su `seguimiento` (lo que devuelve `GET /api/purchases?seguimiento=1`).
 * `ocultarCuenta`: para quien no gestiona plata (almacenero) la deuda no viaja;
 * la pantalla dice dónde verla en vez de «no está en Por pagar».
 */
export function conSeguimiento<O extends { id: string; items: readonly ItemOcRef[] }>(
  ordenes: readonly O[],
  recepciones: readonly RecepcionCruda[],
  cuentas: readonly CuentaCruda[],
  opts: { ocultarCuenta?: boolean } = {},
): Array<O & { seguimiento: SeguimientoOC }> {
  const porOrden = new Map<string, RecepcionCruda[]>();
  for (const r of recepciones) {
    if (!r.purchaseOrderId) continue;
    porOrden.set(r.purchaseOrderId, [...(porOrden.get(r.purchaseOrderId) ?? []), r]);
  }
  const cuentaDe = new Map(cuentas.filter((c) => c.purchaseOrderId).map((c) => [c.purchaseOrderId as string, c]));
  return ordenes.map((o) => {
    const seguimiento = armarSeguimiento(o.items, porOrden.get(o.id) ?? [], opts.ocultarCuenta ? null : cuentaDe.get(o.id) ?? null);
    return { ...o, seguimiento: opts.ocultarCuenta ? { ...seguimiento, cuentaOculta: true as const } : seguimiento };
  });
}

export type LineaSeguimiento = { productId: number; nombre: string; unidad: string; pedido: number; llego: number; noLlegara: number; falta: number };

/** Por producto: pedido, llegó, no llegará y lo que falta (C19: el remanente no desaparece). */
export function lineasDeSeguimiento(items: readonly ItemOc[], seg?: Pick<SeguimientoOC, "recibido" | "noLlegara"> | null): LineaSeguimiento[] {
  return items.map((i) => {
    const llego = num(seg?.recibido?.[i.productId]);
    const noLlegara = num(seg?.noLlegara?.[i.productId]);
    return {
      productId: i.productId, nombre: i.name, unidad: i.unit ?? "", pedido: i.quantity, llego, noLlegara,
      falta: Math.max(0, i.quantity - llego - noLlegara),
    };
  });
}

/** «4 de 10 Arroz, 2 de 2 Aceite y 3 más». */
export function listarCorto(partes: readonly string[], max = 3): string {
  if (partes.length <= max) return partes.join(", ");
  return `${partes.slice(0, max).join(", ")} y ${partes.length - max} más`;
}

// ── El ciclo: cada paso con su estado y quién lo mueve ─────────────────────────

export type Tono = "ok" | "info" | "aviso" | "alerta" | "neutro";
export type PasoCiclo = { clave: "aprobacion" | "entrega" | "comprobante" | "pago"; etiqueta: string; texto: string; quien: string; tono: Tono };
export type SiguientePaso = { texto: string; quien: string; tono: Tono; accion: "aprobar" | "recibir" | "comprobante" | "pagar" | null };
export type OrdenParaCiclo = {
  status: string;
  items: readonly ItemOc[];
  paymentMethod?: string;
  deliveryDate?: string;
  invoiceNumber?: string;
  invoiceType?: string;
};

const TU = "tú";
const PROVEEDOR = "el proveedor";

function pasoEntrega(o: OrdenParaCiclo, lineas: LineaSeguimiento[], hoy: string): PasoCiclo {
  const base = { clave: "entrega" as const, etiqueta: "Entrega" };
  const conFalta = lineas.filter((l) => l.falta > 0);
  const llegoAlgo = lineas.some((l) => l.llego > 0);
  if (o.status === "recibido" || conFalta.length === 0) {
    const noLlegan = lineas.filter((l) => l.noLlegara > 0).length;
    return { ...base, texto: noLlegan > 0 ? `Cerrada · ${plural(noLlegan, "producto no llegará", "productos no llegarán")}` : "Llegó todo", quien: TU, tono: "ok" };
  }
  if (o.status === "cancelado") {
    return { ...base, texto: llegoAlgo ? `Llegó una parte · se dejó de esperar ${plural(conFalta.length, "producto", "productos")}` : "No llegó nada", quien: TU, tono: "neutro" };
  }
  const resto = llegoAlgo ? `Faltan ${conFalta.length} de ${plural(lineas.length, "producto", "productos")}` : "Por recibir";
  const prometida = claveDeDia(o.deliveryDate);
  if (!prometida) return { ...base, texto: `${resto} · sin fecha prometida`, quien: PROVEEDOR, tono: "info" };
  const dias = diasEntre(prometida, hoy);
  if (dias > 0) return { ...base, texto: `${resto} · atrasada ${plural(dias, "día", "días")}`, quien: PROVEEDOR, tono: "alerta" };
  if (dias === 0) return { ...base, texto: `${resto} · llega hoy`, quien: PROVEEDOR, tono: "aviso" };
  return { ...base, texto: `${resto} · llega el ${diaCorto(prometida)}`, quien: PROVEEDOR, tono: "info" };
}

function pasoComprobante(o: OrdenParaCiclo, llegoAlgo: boolean): PasoCiclo {
  const base = { clave: "comprobante" as const, etiqueta: "Comprobante", quien: TU };
  if (o.invoiceNumber) {
    const tipo = TIPOS_COMPROBANTE.find((t) => t.id === o.invoiceType)?.label ?? "Comprobante";
    return { ...base, texto: `${tipo} ${o.invoiceNumber}`, tono: "ok" };
  }
  if (o.invoiceType === "ninguno") return { ...base, texto: "Sin comprobante", tono: "neutro" };
  if (!llegoAlgo || o.status === "cancelado") return { ...base, texto: "Llega con la mercadería", quien: PROVEEDOR, tono: "neutro" };
  return { ...base, texto: "Falta anotarlo", tono: "aviso" };
}

function pasoPago(o: OrdenParaCiclo, seg: SeguimientoOC | null | undefined, hoy: string): PasoCiclo {
  const base = { clave: "pago" as const, etiqueta: "Pago", quien: TU };
  const forma = o.paymentMethod ?? "contado";
  // Sin la cuenta (almacenero), sólo se sabe por la forma anotada; vacía puede ser crédito.
  const puedeDeber = !o.paymentMethod || o.paymentMethod.startsWith("credito_");
  if (seg?.cuentaOculta && puedeDeber) return { ...base, texto: "La deuda la ve el administrador en Por pagar", quien: "el administrador", tono: "neutro" };
  // La cuenta en Por pagar manda sobre la forma anotada: el servidor cobra y
  // anula por la cuenta, no por `paymentMethod` (80 de 91 órdenes de main lo tienen vacío).
  const cuenta = seg?.cuenta ?? null;
  if (!cuenta && forma === "transferencia") return { ...base, texto: "Ya pagada al pedirla", tono: "ok" };
  if (!cuenta && !forma.startsWith("credito_")) return { ...base, texto: "Contado: se paga al recibir", tono: "neutro" };
  if (!cuenta) {
    return o.status === "cancelado"
      ? { ...base, texto: "Sin deuda: se anuló al cancelar", tono: "neutro" }
      : { ...base, texto: seg ? "No está en Por pagar" : "A crédito", tono: seg ? "aviso" : "neutro" };
  }
  if (cuenta.saldo <= 0.005) return { ...base, texto: `Pagada (${formatCurrency(cuenta.pagado)})`, tono: "ok" };
  const debe = cuenta.pagado > 0 ? `Pagaste ${formatCurrency(cuenta.pagado)}, debes ${formatCurrency(cuenta.saldo)}` : `Debes ${formatCurrency(cuenta.saldo)}`;
  if (!cuenta.vence) return { ...base, texto: debe, tono: "aviso" };
  const dias = diasEntre(cuenta.vence, hoy);
  if (dias > 0) return { ...base, texto: `${debe} · venció el ${diaCorto(cuenta.vence)}`, tono: "alerta" };
  return { ...base, texto: `${debe} · vence ${dias === 0 ? "hoy" : `el ${diaCorto(cuenta.vence)}`}`, tono: dias === 0 ? "aviso" : "info" };
}

/**
 * Los pasos de la orden por separado (aprobación, entrega, comprobante, pago)
 * y EL siguiente. Una orden pagada puede seguir esperando mercadería y una
 * recibida puede deber plata: cada paso dice lo suyo y quién lo mueve.
 *
 * @param hoy YYYY-MM-DD en Lima (`limaDateKey()`).
 */
export function cicloDeOrden(o: OrdenParaCiclo, seg: SeguimientoOC | null | undefined, hoy: string): { pasos: PasoCiclo[]; siguiente: SiguientePaso } {
  const lineas = lineasDeSeguimiento(o.items, seg);
  const llegoAlgo = o.status === "recibido" || lineas.some((l) => l.llego > 0);
  const aprobacion: PasoCiclo = {
    clave: "aprobacion", etiqueta: "Aprobación", quien: TU,
    ...(o.status === "auto_generated"
      ? { texto: "Por aprobar: la armó la reposición", tono: "aviso" as const }
      : o.status === "cancelado"
        ? { texto: "Cancelada", tono: "neutro" as const }
        : { texto: "Aprobada", tono: "ok" as const }),
  };
  const entrega = pasoEntrega(o, lineas, hoy);
  const comprobante = pasoComprobante(o, llegoAlgo);
  const pago = pasoPago(o, seg, hoy);
  const pasos = [aprobacion, entrega, comprobante, pago];
  const saldo = seg?.cuenta?.saldo ?? 0;

  const siguiente = ((): SiguientePaso => {
    if (o.status === "auto_generated") return { texto: "Revisar y aprobar", quien: TU, tono: "aviso", accion: "aprobar" };
    if (o.status === "cancelado") {
      return saldo > 0.005
        ? { texto: `Revisar la deuda que quedó (${formatCurrency(saldo)})`, quien: TU, tono: "alerta", accion: "pagar" }
        : { texto: "Nada: cancelada", quien: "", tono: "neutro", accion: null };
    }
    if (pago.tono === "alerta") return { texto: `Pagar ${formatCurrency(saldo)} · venció`, quien: TU, tono: "alerta", accion: "pagar" };
    if (entrega.tono !== "ok") {
      const texto = entrega.tono === "alerta" ? `Recibir · ${entrega.texto.split(" · ").pop()}`
        : entrega.tono === "aviso" ? "Recibir hoy"
        : claveDeDia(o.deliveryDate) ? `Recibir el ${diaCorto(claveDeDia(o.deliveryDate) as string)}`
        : o.status === "parcial" ? "Recibir lo que falta" : "Recibir cuando llegue";
      return { texto, quien: entrega.quien, tono: entrega.tono, accion: "recibir" };
    }
    if (saldo > 0.005) return { texto: `Pagar ${formatCurrency(saldo)}`, quien: TU, tono: pago.tono, accion: "pagar" };
    if (comprobante.tono === "aviso") return { texto: "Anotar el comprobante", quien: TU, tono: "info", accion: "comprobante" };
    return { texto: "Nada: orden cerrada", quien: "", tono: "ok", accion: null };
  })();

  return { pasos, siguiente };
}

// ── Cancelar: qué pasa con lo recibido y con la plata (C15) ────────────────────

/**
 * Lo que hay que saber ANTES de cancelar. La regla la aplica
 * `PATCH /api/purchases/[id]`: lo recibido se queda en el stock, lo que falta
 * se deja de esperar, la deuda sin pagos baja a lo que vale lo que llegó en
 * buen estado (`deudaAlCancelar`; sin nada llegado se anula) y la que tiene
 * pagos se conserva. Cancelar nunca devuelve plata.
 */
export function resumenCancelacion(o: OrdenParaCiclo & { total?: number }, seg: SeguimientoOC | null | undefined): string[] {
  const lineas = lineasDeSeguimiento(o.items, seg);
  const llegaron = lineas.filter((l) => l.llego > 0);
  const faltan = lineas.filter((l) => l.falta > 0);
  // La misma cuenta que hace el servidor al cancelar: lo dañado o vencido no cuenta.
  const valorLlego = valorDeLoRecibido(o.items, o.total, seg?.recibido ?? {}, seg?.noAptos ?? {});
  const salida: string[] = [];

  if (llegaron.length > 0) {
    salida.push(`Lo que ya llegó se queda en el stock (${listarCorto(llegaron.map((l) => `${l.llego} de ${l.pedido} ${l.nombre}`))}).`);
  }
  if (faltan.length > 0) {
    salida.push(`Se deja de esperar: ${listarCorto(faltan.map((l) => `${l.falta} ${l.nombre}`))}.`);
  }
  const forma = o.paymentMethod ?? "contado";
  const cuenta = seg?.cuenta ?? null;
  // Igual que el PATCH: ajusta o conserva la cuenta que tenga, sea cual sea la forma anotada.
  if (seg?.cuentaOculta && (!o.paymentMethod || o.paymentMethod.startsWith("credito_"))) {
    salida.push("Lo que pasa con la deuda lo ve el administrador en Por pagar.");
  } else if (forma.startsWith("credito_") || cuenta) {
    if (!cuenta) salida.push("No tiene cuenta en Por pagar.");
    else if (cuenta.pagado > 0.005) {
      salida.push(`La deuda se queda en Por pagar: ya le pagaste ${formatCurrency(cuenta.pagado)} y quedan ${formatCurrency(cuenta.saldo)}. Ajústala ahí.`);
    } else {
      const d = deudaAlCancelar(cuenta.monto, valorLlego);
      salida.push(
        d.accion === "anular" ? `Se anula su deuda de ${formatCurrency(cuenta.monto)}: no llegó nada que pagar.`
        : d.accion === "bajar" ? `La deuda baja de ${formatCurrency(cuenta.monto)} a ${formatCurrency(d.monto)}: lo que ya llegó se paga, lo que falta se deja de deber.`
        : `La deuda de ${formatCurrency(cuenta.monto)} se queda: es lo que vale lo que ya llegó.`,
      );
    }
  } else {
    salida.push(forma === "transferencia"
      ? "Ya la habías pagado: cancelar no devuelve la plata; pídele la devolución o una nota de crédito al proveedor."
      : "Al contado: cancelar no registra ni devuelve pagos.");
  }
  const n = seg?.recepciones.length ?? 0;
  if (n > 0) salida.push(`${n === 1 ? "Su recepción queda registrada" : `Sus ${n} recepciones quedan registradas`}.`);
  salida.push("Una orden cancelada no vuelve atrás.");
  return salida;
}

// ── Agenda de entregas (C14) ───────────────────────────────────────────────────

export type GrupoEntrega = "atrasadas" | "hoy" | "semana" | "despues" | "sin_fecha";
export const GRUPOS_ENTREGA: ReadonlyArray<{ id: GrupoEntrega; rotulo: string }> = [
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "hoy", rotulo: "Hoy" },
  { id: "semana", rotulo: "Próximos 7 días" },
  { id: "despues", rotulo: "Más adelante" },
  { id: "sin_fecha", rotulo: "Sin fecha prometida" },
];

export function grupoDeEntrega(deliveryDate: string | null | undefined, hoy: string): GrupoEntrega {
  const prometida = claveDeDia(deliveryDate);
  if (!prometida) return "sin_fecha";
  const dias = diasEntre(hoy, prometida);
  if (dias < 0) return "atrasadas";
  if (dias === 0) return "hoy";
  return dias <= 7 ? "semana" : "despues";
}

/** Sólo esperan entrega las pendientes y parciales (la automática todavía no se pidió). */
export const esperaEntrega = (status: string) => status === "pendiente" || status === "parcial";

// ── Recepción: qué pasa al guardar (C23) ───────────────────────────────────────

export type ItemBorrador = { product: string; productId?: number; expectedQty: number; receivedQty: number; condition: string };
type Cantidad = { nombre: string; n: number };
export type EfectosRecepcion = {
  aStock: Cantidad[];
  /** Llegó dañado o vencido: se registra como merma, no entra a la venta. */
  merma: Cantidad[];
  /** Marcado «Faltante (no llegará)»: la orden deja de esperarlo. */
  noLlegara: Cantidad[];
  /** Pasa lo que faltaba de la orden. */
  deMas: Cantidad[];
  /** No es de la orden: se anota pero no mueve stock. */
  fueraDeOrden: string[];
  /** Lo que la orden sigue esperando después de guardar. */
  quedaPendiente: Cantidad[];
  ordenQueda: "recibido" | "parcial" | null;
};

/**
 * Lo que va a hacer `POST /api/compras/recepciones` con este borrador, contado
 * igual que el servidor: sólo con orden mueve stock; lo dañado o vencido va a
 * merma; lo faltante cierra la línea; la orden queda recibida cuando no le falta
 * nada. Sin orden no mueve stock ni deuda.
 */
export function efectosDeRecepcion(
  items: readonly ItemBorrador[],
  orden: { items: readonly ItemOc[]; seguimiento?: Pick<SeguimientoOC, "recibido" | "noLlegara"> | null } | null,
): EfectosRecepcion {
  const vacio: EfectosRecepcion = { aStock: [], merma: [], noLlegara: [], deMas: [], fueraDeOrden: [], quedaPendiente: [], ordenQueda: null };
  if (!orden) return vacio;
  const previas = lineasDeSeguimiento(orden.items, orden.seguimiento);
  const llego = new Map(previas.map((l) => [l.productId, l.llego]));
  const cerrado = new Map(previas.map((l) => [l.productId, l.noLlegara]));
  const sumar = (lista: Cantidad[], nombre: string, n: number) => {
    const ya = lista.find((x) => x.nombre === nombre);
    if (ya) ya.n += n; else lista.push({ nombre, n });
  };
  const r = { ...vacio, aStock: [] as Cantidad[], merma: [] as Cantidad[], noLlegara: [] as Cantidad[], fueraDeOrden: [] as string[] };

  for (const it of items) {
    if (!it.product && it.productId == null) continue;
    const pid = resolverLineaDeOrden(it, orden.items);
    if (pid == null) { r.fueraDeOrden.push(it.product || "Producto sin nombre"); continue; }
    const linea = previas.find((l) => l.productId === pid)!;
    const recibida = Math.max(0, num(it.receivedQty));
    if (recibida > 0) {
      sumar(it.condition === "dañado" || it.condition === "vencido" ? r.merma : r.aStock, linea.nombre, recibida);
      llego.set(pid, (llego.get(pid) ?? 0) + recibida);
    }
    if (it.condition === "faltante") {
      const declarado = Math.max(0, num(it.expectedQty) - recibida);
      const falta = Math.max(0, linea.pedido - (llego.get(pid) ?? 0) - (cerrado.get(pid) ?? 0));
      const n = Math.min(declarado, falta);
      if (n > 0) { sumar(r.noLlegara, linea.nombre, n); cerrado.set(pid, (cerrado.get(pid) ?? 0) + n); }
    }
  }
  const deMas: Cantidad[] = [];
  const quedaPendiente: Cantidad[] = [];
  for (const l of previas) {
    const total = llego.get(l.productId) ?? 0;
    const exceso = Math.max(0, total - l.pedido) - Math.max(0, l.llego - l.pedido);
    if (exceso > 0) deMas.push({ nombre: l.nombre, n: exceso });
    const falta = Math.max(0, l.pedido - total - (cerrado.get(l.productId) ?? 0));
    if (falta > 0) quedaPendiente.push({ nombre: l.nombre, n: falta });
  }
  return { ...r, deMas, quedaPendiente, ordenQueda: quedaPendiente.length === 0 ? "recibido" : "parcial" };
}

// ── Repetir una orden con revisión (C16) ───────────────────────────────────────

type OrdenParaRepetir = { id: string; createdAt: string; status: string; items: readonly ItemOc[]; paymentMethod?: string };
export type CambioDeCosto = { nombre: string; antes: number; ahora: number; dia: string };
export type PlanRepetir = {
  /** Día de la orden original y cuántos días tiene. */
  dia: string;
  dias: number;
  /** Los productos con el costo de tu última compra (si cambió). */
  items: ItemOc[];
  cambios: CambioDeCosto[];
  /** La condición de la nueva: «ya pagada» no se copia (la nueva no está pagada). */
  paymentMethod: string;
  condicionCambio: boolean;
};

/**
 * Antes de repetir: qué tan vieja es la original y qué costos cambiaron desde
 * entonces (el último que pagaste por cada producto, en órdenes no
 * canceladas). La nueva sale con esos costos; comprobante, flete, pagos y fecha
 * de entrega no se copian.
 */
export function planParaRepetir(o: OrdenParaRepetir, ordenes: readonly OrdenParaRepetir[], hoy: string): PlanRepetir {
  const recientes = [...ordenes]
    .filter((x) => x.status !== "cancelado")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const cambios: CambioDeCosto[] = [];
  const items = o.items.map((it) => {
    const ultima = recientes.find((x) => x.items.some((i) => i.productId === it.productId && num(i.unitCost) > 0));
    const costo = num(ultima?.items.find((i) => i.productId === it.productId)?.unitCost);
    if (!ultima || ultima.id === o.id || Math.abs(costo - num(it.unitCost)) < 0.005) return { ...it };
    cambios.push({ nombre: it.name, antes: num(it.unitCost), ahora: costo, dia: diaCorto(claveDeDia(ultima.createdAt) ?? hoy) });
    return { ...it, unitCost: costo };
  });
  const original = claveDeDia(o.createdAt) ?? hoy;
  const forma = o.paymentMethod ?? "contado";
  return {
    dia: diaCorto(original),
    dias: Math.max(0, diasEntre(original, hoy)),
    items,
    cambios,
    paymentMethod: forma === "transferencia" ? "contado" : forma,
    condicionCambio: forma === "transferencia",
  };
}
