/**
 * Búsqueda global de comprobantes (F34): un solo campo entiende serie-número,
 * cliente, RUC/DNI, el código del pedido, el importe y el estado. Antes el
 * buscador miraba sólo cliente/serie/número y sobre los 100 últimos que trajo
 * la lista; ahora la ruta arma el filtro con estos criterios y busca en todos.
 *
 * Puro: interpreta lo escrito; la clase de la base arma el `where`.
 */

export interface CriteriosBusqueda {
  /** Lo escrito, limpio: se busca dentro del cliente, el RUC y el pedido. */
  texto: string;
  /** «B001-123» → serie B001 y número 123. */
  serie?: string;
  numero?: number;
  /** «118,50» o «S/ 118» → importe exacto del total. */
  importe?: number;
  /** «#a1b2c3» → el final del id del pedido (el código que se ve en Pedidos). */
  pedido?: string;
  /** «rechazado», «pendiente»… → estados de SUNAT. */
  estados?: string[];
  /** «factura», «boleta», «nota» → tipos guardados. */
  tipos?: string[];
}

const PALABRAS_ESTADO: readonly [RegExp, string[]][] = [
  [/^rechaz/, ["rejected"]],
  [/^pendien|^en cola|^sin respuesta/, ["pending", "retrying"]],
  [/^anulad/, ["voided"]],
  [/^acept/, ["accepted"]],
];

const PALABRAS_TIPO: readonly [RegExp, string[]][] = [
  [/^factura/, ["factura"]],
  [/^boleta/, ["boleta"]],
  [/^nota/, ["nota_credito"]],
];

const TOPE = 80;

function porPalabra(t: string, tabla: readonly [RegExp, string[]][]): string[] | undefined {
  for (const [re, valores] of tabla) if (re.test(t)) return valores;
  return undefined;
}

/** `null` = no hay nada que buscar. */
export function interpretarBusqueda(entrada: string | null | undefined): CriteriosBusqueda | null {
  const texto = (entrada ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE);
  if (!texto) return null;
  const t = texto.toLowerCase();
  const out: CriteriosBusqueda = { texto };

  const serieNumero = /^([a-z]{1,2}[a-z0-9]{2,3})\s*-\s*0*(\d{1,8})$/i.exec(texto);
  if (serieNumero) {
    out.serie = serieNumero[1].toUpperCase();
    out.numero = Number(serieNumero[2]);
    return out;
  }
  if (/^[bf][a-z0-9]{3}$/i.test(texto)) out.serie = texto.toUpperCase();

  const conSoles = /^s\/\.?\s*/i.test(texto);
  const cifra = texto.replace(/^s\/\.?\s*/i, "");
  if (/^\d{1,7}([.,]\d{1,2})?$/.test(cifra)) {
    const valor = Number(cifra.replace(",", "."));
    const conDecimales = /[.,]/.test(cifra);
    if (conSoles || conDecimales) {
      out.importe = valor;
      if (conSoles) out.texto = cifra;
      return out;
    }
    // Sólo dígitos: puede ser el número, el importe en soles enteros o parte del RUC.
    if (cifra.length <= 8) out.numero = Number(cifra);
    out.importe = valor;
    return out;
  }

  const pedido = /^#([a-z0-9-]{4,30})$/i.exec(texto);
  if (pedido) {
    out.pedido = pedido[1].toLowerCase();
    return out;
  }

  out.estados = porPalabra(t, PALABRAS_ESTADO);
  out.tipos = porPalabra(t, PALABRAS_TIPO);
  return out;
}
