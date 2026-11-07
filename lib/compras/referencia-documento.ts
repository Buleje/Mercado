/**
 * lib/compras/referencia-documento.ts — de dónde sale una cuenta por pagar y
 * con qué papel (auditoría Compras C41-C42, 17-10).
 *
 * `Payable` no tiene columnas para el documento: la referencia vive en
 * `description` con una forma fija («Factura F001-123 · emitida jueves 10/10»).
 * Lo que la hace estructurada es la CLAVE: `claveDocumento` reconoce las
 * variantes del mismo número («F1-123», «f001 - 00000123», «F001-123») y las
 * reduce a «F001-123». Con esa clave se busca, y se frena la misma factura
 * cargada dos veces al mismo proveedor (en el servidor y, antes, en la
 * ventana). Un importe igual sólo AVISA: dos compras pueden costar lo mismo.
 *
 * Puro: lo usan la ruta (`app/api/payables`), la ventana y el buscador.
 */

/** Las formas de nacer de una cuenta cargada a mano (las de una OC a crédito nacen solas). */
export const ORIGENES_CUENTA = [
  { id: "documento", label: "Factura o boleta" },
  { id: "orden", label: "Orden de compra" },
  { id: "saldo-inicial", label: "Saldo inicial" },
  { id: "otro", label: "Otro motivo" },
] as const;
export type OrigenCuenta = (typeof ORIGENES_CUENTA)[number]["id"];

export const TIPOS_DOCUMENTO = [
  { id: "factura", label: "Factura" },
  { id: "boleta", label: "Boleta" },
  { id: "recibo", label: "Recibo por honorarios" },
  { id: "nota", label: "Nota de venta" },
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]["id"];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Serie con letra (F001, B001, E001, FF01, F1) o serie física de dígitos que
 * empieza en 0 (0001, 001). Con letra acepta guion o espacio; con dígitos sólo
 * guion: «2026-10» (una fecha) no es una serie, «0001-45» sí.
 */
const CON_LETRA = /(?:^|[^A-Z0-9])([A-Z]{1,2})(\d{1,3})\s*(?:[-–—]\s*|\s+)(?:N[°º]?\s*)?0*(\d{1,10})(?![\d])/i;
const CON_DIGITOS = /(?:^|[^A-Z0-9])(0\d{2,3})\s*[-–—]\s*0*(\d{1,10})(?![\d])/i;

function normalizarSerie(letras: string, digitos: string): string {
  const l = letras.toUpperCase();
  return `${l}${digitos.padStart(Math.max(1, 4 - l.length), "0")}`;
}

/** «F1» + «0000123» → «F001-123». Sin serie o número válidos, `null`. */
export function claveDe(serie: string, numero: string): string | null {
  const s = serie.trim().replace(/\s+/g, "");
  const n = numero.trim().replace(/\D/g, "");
  if (!s || !n || /^0+$/.test(n)) return null;
  const ml = /^([A-Za-z]{1,2})(\d{1,3})$/.exec(s);
  const md = /^\d{1,4}$/.exec(s);
  const serieNorm = ml ? normalizarSerie(ml[1], ml[2]) : md ? s.padStart(4, "0") : null;
  return serieNorm ? `${serieNorm}-${Number(n)}` : null;
}

/**
 * La clave del primer «serie-número» que aparezca en un texto libre, o `null`.
 * Sirve para lo que se cargó antes (texto libre en «Qué es») y para lo que se
 * escribe en el buscador.
 */
export function claveDocumento(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const l = CON_LETRA.exec(texto);
  if (l && !/^0+$/.test(l[3])) return `${normalizarSerie(l[1], l[2])}-${Number(l[3])}`;
  const d = CON_DIGITOS.exec(texto);
  if (d && !/^0+$/.test(d[2])) return `${d[1].padStart(4, "0")}-${Number(d[2])}`;
  return null;
}

/** Una orden que todavía no tiene su cuenta: candidata a origen de una deuda. */
export type OrdenSinCuenta = {
  id: string;
  /** «#AB12CD34». */
  codigo: string;
  /** Día de Lima en que se creó. */
  fecha: string;
  total: number;
  status: string;
  /** Condición elegida al crearla («credito_15», «contado»…), si la tiene. */
  condicion: string | null;
  /** «Factura F001-9» si la orden ya trae el comprobante. */
  documento: string | null;
};

/** «#AB12CD34»: como nombran la orden el PDF y el WhatsApp de la OC. */
export const codigoDeOrden = (id: string) => `#${id.slice(-8).toUpperCase()}`;

/** «jueves 10/10» de una clave «AAAA-MM-DD». */
function diaConNombre(clave: string): string {
  const d = new Date(`${clave}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return clave;
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

export type DatosDeOrigen = {
  origen: OrigenCuenta;
  tipo: TipoDocumento;
  serie: string;
  numero: string;
  /** «AAAA-MM-DD» de emisión del papel (opcional). */
  emitida: string;
  /** Orden elegida (sólo con origen «orden»). */
  ordenId: string;
  /** El comprobante que ya tiene la orden, si lo tiene («Factura F001-9»). */
  ordenDocumento?: string;
  /** Motivo o nota libre. */
  nota: string;
};

/**
 * El texto que se guarda en `description`: primero la referencia con forma
 * fija, después la nota. Lo que falte para el origen elegido devuelve `error`
 * (la ventana lo muestra; el servidor no depende de esto).
 */
export function armarDescripcion(d: DatosDeOrigen): { texto: string } | { error: string } {
  const nota = d.nota.trim().replace(/\s+/g, " ");
  if (d.origen === "documento") {
    const clave = claveDe(d.serie, d.numero);
    if (!clave) return { error: "Escribe la serie (F001) y el número del comprobante." };
    const tipo = TIPOS_DOCUMENTO.find((t) => t.id === d.tipo)?.label ?? "Comprobante";
    const partes = [`${tipo} ${clave}`];
    if (d.emitida) partes.push(`emitida ${diaConNombre(d.emitida)}`);
    if (nota) partes.push(nota);
    return { texto: partes.join(" · ") };
  }
  if (d.origen === "orden") {
    if (!d.ordenId) return { error: "Elige la orden de compra de esta deuda." };
    const partes = [`Orden de compra ${codigoDeOrden(d.ordenId)}`];
    if (d.ordenDocumento) partes.push(d.ordenDocumento);
    if (nota) partes.push(nota);
    return { texto: partes.join(" · ") };
  }
  if (!nota) {
    return { error: d.origen === "saldo-inicial" ? "Escribe de qué es el saldo (ej.: lo que le debías al empezar a usar el sistema)." : "Escribe el motivo de la deuda." };
  }
  return { texto: d.origen === "saldo-inicial" ? `Saldo inicial · ${nota}` : nota };
}

/**
 * Lo que se lee de la descripción guardada. Las cuentas que nacen de una OC a
 * crédito traen «Auto-generado desde OC po-17…» (el id técnico): a la vista
 * pasa a «Orden de compra #AB12CD34». No se reescribe lo guardado.
 */
export function descripcionALaVista(description: string, purchaseOrderId?: string | null): string {
  const t = (description ?? "").trim();
  const auto = /^Auto-generado desde OC (\S+)/i.exec(t);
  if (auto) return `Orden de compra ${codigoDeOrden(auto[1])}${t.slice(auto[0].length)}`;
  if (!t && purchaseOrderId) return `Orden de compra ${codigoDeOrden(purchaseOrderId)}`;
  return t;
}

/** Lo mínimo de una cuenta para comparar documentos e importes. */
export type CuentaComparable = {
  id: string;
  supplierId: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: string;
  purchaseOrderId?: string | null;
  /** Comprobante de la orden vinculada (`PurchaseOrder.invoiceNumber`), si se conoce. */
  documentoDeLaOrden?: string | null;
};

export type RevisionDeAlta = {
  /** Misma clave de documento con el mismo proveedor: NO se crea otra. */
  mismoDocumento: CuentaComparable | null;
  /** Misma orden ya con su cuenta: NO se crea otra. */
  mismaOrden: CuentaComparable | null;
  /** Mismo importe con el mismo proveedor y sin pagar: sólo se avisa. */
  mismoImporte: CuentaComparable[];
};

/** Clave de la cuenta: la de su descripción o, si no tiene, la del comprobante de su orden. */
export function claveDeCuenta(c: Pick<CuentaComparable, "description" | "documentoDeLaOrden">): string | null {
  return claveDocumento(c.description) ?? claveDocumento(c.documentoDeLaOrden ?? null);
}

/**
 * ¿La cuenta nueva repite otra? `existentes` = las del mismo negocio (se
 * filtra por proveedor acá). Las pagadas cuentan para el documento (cargar
 * otra vez una factura pagada también la duplica) y no para el importe.
 */
export function revisarAlta(
  nueva: { supplierId: string; description: string; amount: number; purchaseOrderId?: string | null },
  existentes: readonly CuentaComparable[],
): RevisionDeAlta {
  const delProveedor = existentes.filter((c) => c.supplierId === nueva.supplierId);
  const clave = claveDocumento(nueva.description);
  const mismoDocumento = clave ? (delProveedor.find((c) => claveDeCuenta(c) === clave) ?? null) : null;
  const mismaOrden = nueva.purchaseOrderId
    ? (existentes.find((c) => c.purchaseOrderId === nueva.purchaseOrderId) ?? null)
    : null;
  const pendiente = (c: CuentaComparable) => c.status !== "pagado" && Number(c.amount) - Number(c.paidAmount) > 0.004;
  const mismoImporte = Number.isFinite(nueva.amount) && nueva.amount > 0
    ? delProveedor.filter((c) => pendiente(c) && Math.abs(Number(c.amount) - nueva.amount) <= 0.01 && c !== mismoDocumento)
    : [];
  return { mismoDocumento, mismaOrden, mismoImporte };
}

/**
 * El buscador de Por pagar: proveedor o texto, documento en cualquiera de sus
 * variantes («F1-123» encuentra «Factura F001-00000123») o importe exacto
 * (total o lo que falta).
 */
export function coincideBusqueda(
  c: { supplierName: string; description: string; amount: number; paidAmount: number; purchaseOrderId?: string | null },
  q: string,
): boolean {
  const consulta = q.trim();
  if (!consulta) return true;
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = descripcionALaVista(c.description, c.purchaseOrderId);
  if (plano(`${c.supplierName} ${visible}`).includes(plano(consulta))) return true;
  const clave = claveDocumento(consulta);
  if (clave && claveDocumento(c.description) === clave) return true;
  const importe = Number(consulta.replace(/^s\/\s*/i, "").replace(/,/g, ""));
  if (/\d/.test(consulta) && Number.isFinite(importe) && importe > 0) {
    const falta = Math.max(0, Number(c.amount) - Number(c.paidAmount));
    return Math.abs(Number(c.amount) - importe) <= 0.004 || Math.abs(falta - importe) <= 0.004;
  }
  return false;
}
