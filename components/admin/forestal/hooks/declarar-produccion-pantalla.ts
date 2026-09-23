/**
 * Las cuentas de PANTALLA de «Declarar producción» (ADR-429).
 *
 * El contrato con el servidor —tipos, Zod, `armarPedido`— vive en
 * `lib/forestal/declarar-produccion.ts` y lo comparten los dos lados. Esto es
 * lo que sólo le importa a la pantalla: el precio sugerido, el importe que se
 * ve en la vista previa, qué falta para poder registrar, cómo se explica un
 * error del servidor y el mensaje final.
 *
 * Todo es VISTA PREVIA: el importe que vale lo calcula el servidor con lo que
 * quedó guardado (regla 6 del repo). Por eso el cargo de un tercero sale de
 * `cotizarAserrio`, la misma función pura que corre `cobrarCorrida`: lo que se
 * ve acá es lo que se va a cargar, no una cuenta parecida.
 */
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  cotizarAserrio,
  type BloqueACobrar,
  type VersionTarifa,
} from "@/lib/forestal/tarifa-aserrio";
import {
  importe,
  precioValido,
  type CorridaDeEspecie,
  type PreciosPorEspecie,
  type ProduccionSinLoteRespuesta,
  type SubtotalEspecie,
  type TipoServicio,
} from "@/lib/forestal/declarar-produccion";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { formatCurrency, formatNumber } from "@/lib/format";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** El tope del esquema del servidor (`precioSchema`): más que esto es un dedo de más. */
const PRECIO_MAXIMO = 100_000;
/** Los topes del esquema del pedido: una corrida por especie, hasta 12, con hasta 500 paquetes. */
export const MAX_CORRIDAS = 12;
export const MAX_PAQUETES_POR_CORRIDA = 500;

/**
 * El PT con sus decimales (`277.33`, `160`). El Libro muestra el PT entero,
 * pero acá está al lado de un precio: con «277» × 3.50 el ojo espera 969.50 y
 * el importe dice 970.66. Cifras contiguas tienen que cerrar.
 */
export const fmtPtExacto = (n: number): string => formatNumber(n, { max: 2 });

/** `0.35` → «0.35»; `2.5` → «2.50»: como se escribe un precio por pie tablar. */
export const fmtPrecioPt = (n: number): string => formatNumber(n, { min: 2, max: 4 });

/**
 * Lo tipeado en la columna de precio, POR SERVICIO. Cambiar de «madera propia»
 * a «aserrío a un tercero» no puede convertir un precio de venta (S/ 3.50 el
 * pie) en un cobro de aserrío diez veces más caro: cada servicio tiene su
 * columna y cambiar de uno a otro sólo cambia cuál se ve.
 */
export type TextosDePrecio = Record<TipoServicio, Record<string, string>>;

export const TEXTOS_VACIOS: TextosDePrecio = { propia: {}, tercero: {} };

export interface PrecioDeEspecie {
  clave: string;
  especie: string;
  texto: string;
  /** Tipeado y no es un precio («abc», «-3», un millón): no se adivina, bloquea registrar. */
  invalido: boolean;
  /** Lo tipeado ya validado. Vacío o cero = `null` (sin precio, nunca 0). */
  precio: number | null;
  /** Madera propia: el último usado. Tercero: lo que da la tarifa, en promedio por PT. */
  sugerido: { valor: number; origen: "ultimo" | "tarifa" } | null;
  /** La columna Importe. `null` = sin precio: se dice, no se pinta un 0. */
  importe: number | null;
  desde: "precio" | "tarifa" | null;
}

/** Los paquetes de una especie en la forma que cotiza el aserrío. Con su PT: el servidor lo guarda (ADR-429). */
export function bloquesDeEspecie(c: CorridaDeEspecie): BloqueACobrar[] {
  return c.paquetes.map((p) => ({
    etiqueta: p.codigo,
    especie: c.especie,
    volumenM3: p.volumenM3,
    pt: p.pieTablar,
    productType: p.productType,
    espesorCm: p.espesorCm,
    anchoCm: p.anchoCm,
    largoM: p.largoM,
  }));
}

function textoInvalido(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  const n = Number(t.replace(",", "."));
  return !Number.isFinite(n) || n < 0 || n > PRECIO_MAXIMO;
}

/**
 * Una línea de precio por especie con nombre (lo «sin especie» no se declara,
 * así que tampoco se le pone precio).
 */
export function lineasDePrecio(args: {
  especies: readonly SubtotalEspecie[];
  corridas: readonly CorridaDeEspecie[];
  servicio: TipoServicio | null;
  textos: TextosDePrecio;
  recordados: Readonly<Record<string, number>>;
  tarifa: VersionTarifa | null;
}): PrecioDeEspecie[] {
  const { servicio } = args;
  return args.especies
    .filter((e) => claveEspecie(e.especie))
    .map((e): PrecioDeEspecie => {
      const clave = claveEspecie(e.especie);
      const vacia: PrecioDeEspecie = {
        clave,
        especie: e.especie,
        texto: "",
        invalido: false,
        precio: null,
        sugerido: null,
        importe: null,
        desde: null,
      };
      if (!servicio) return vacia;
      const texto = args.textos[servicio][clave] ?? "";
      const invalido = textoInvalido(texto);
      const precio = invalido ? null : precioValido(texto);
      if (servicio === "propia") {
        const ultimo = args.recordados[clave];
        const imp = importe(e.pt, precio);
        return {
          ...vacia,
          texto,
          invalido,
          precio,
          sugerido: ultimo ? { valor: ultimo, origen: "ultimo" } : null,
          importe: imp,
          desde: imp != null ? "precio" : null,
        };
      }
      /* Tercero: sin precio a mano, el servidor cobra la tarifa si hay una
         vigente ese día — la vista previa dice lo mismo. */
      const corrida = args.corridas.find((c) => claveEspecie(c.especie) === clave);
      const bloques = corrida ? bloquesDeEspecie(corrida) : [];
      const porTarifa = cotizarAserrio(args.tarifa, bloques);
      const sugerido =
        porTarifa.cobrable && porTarifa.pt > 0
          ? { valor: r4(porTarifa.importe / porTarifa.pt), origen: "tarifa" as const }
          : null;
      if (precio != null) {
        const cot = cotizarAserrio(args.tarifa, bloques, { precioManualPt: precio });
        return {
          ...vacia,
          texto,
          invalido,
          precio,
          sugerido,
          importe: cot.cobrable ? cot.importe : null,
          desde: "precio",
        };
      }
      return {
        ...vacia,
        texto,
        invalido,
        sugerido,
        importe: porTarifa.cobrable ? porTarifa.importe : null,
        desde: porTarifa.cobrable ? "tarifa" : null,
      };
    });
}

/** Lo que va en `armarPedido`: el precio TIPEADO por especie (el sugerido no viaja). */
export function preciosDelPedido(lineas: readonly PrecioDeEspecie[]): PreciosPorEspecie {
  return Object.fromEntries(lineas.map((l) => [l.clave, l.precio]));
}

/** La suma de lo que tiene importe, y las especies que quedaron sin: se nombran. */
export function totalDePrecios(lineas: readonly PrecioDeEspecie[]): {
  total: number | null;
  sinImporte: string[];
} {
  let total: number | null = null;
  const sinImporte: string[] = [];
  for (const l of lineas) {
    if (l.importe == null) sinImporte.push(l.especie);
    else total = r2((total ?? 0) + l.importe);
  }
  return { total, sinImporte };
}

/**
 * Lo PRIMERO que falta para poder registrar, o `null`. Uno solo, en el orden
 * en que conviene resolverlo: una lista de cinco faltantes se lee como «no se
 * puede», uno se lee como «haz esto».
 */
export function faltaParaRegistrar(args: {
  corridas: readonly CorridaDeEspecie[];
  servicio: TipoServicio | null;
  parteId: string | null;
  lineas: readonly PrecioDeEspecie[];
  fechaValida: boolean;
  /**
   * La tarifa de aserrío. Mientras carga (o si falló) la vista previa no sabe
   * cuánto cobra lo que quede sin trato, pero el servidor SÍ lo cobra: sin
   * esto la pantalla decía «no se carga nada» y el servidor cargaba la tarifa
   * (medido por el revisor: S/ 9 272,68).
   */
  tarifa?: { cargando: boolean; error: string | null };
}): string | null {
  const { corridas } = args;
  if (corridas.length === 0) return "Cubica al menos una medida para poder declarar.";
  const sinEspecie = corridas.find((c) => !claveEspecie(c.especie));
  if (sinEspecie) {
    return `${sinEspecie.piezas === 1 ? "Una pieza no tiene" : `${sinEspecie.piezas} piezas no tienen`} especie: el Libro declara una por asiento.`;
  }
  if (corridas.length > MAX_CORRIDAS)
    return `Son ${corridas.length} especies: se registran hasta ${MAX_CORRIDAS} a la vez.`;
  const grande = corridas.find((c) => c.paquetes.length > MAX_PAQUETES_POR_CORRIDA);
  if (grande)
    return `${grande.especie} tiene ${grande.paquetes.length} medidas: se registran hasta ${MAX_PAQUETES_POR_CORRIDA} por especie.`;
  if (!args.fechaValida) return "Pon la fecha de la producción.";
  if (!args.servicio) return "Elige el tipo de servicio: madera propia o aserrío a un tercero.";
  if (args.servicio === "tercero" && !args.parteId) return "Elige la cuenta del cliente, o créala.";
  if (args.servicio === "tercero" && args.lineas.some((l) => l.precio == null)) {
    if (args.tarifa?.cargando) return "Leyendo la tarifa de aserrío…";
    if (args.tarifa?.error)
      return "No se pudo leer la tarifa de aserrío: pon el precio a mano en cada especie para saber cuánto se carga.";
  }
  const mal = args.lineas.find((l) => l.invalido);
  if (mal)
    return `El precio de ${mal.especie} no es válido: pon un número en soles por pie tablar, o déjalo vacío.`;
  return null;
}

/**
 * La nota del pie cuando no falta nada: lo que va a pasar al registrar, en
 * soles y con nombre. Sin permiso se dice aparte —se registra igual, pero
 * queda bajo «Sin permiso declarado» en el saldo—.
 */
export function notaDelPie(args: {
  servicio: TipoServicio | null;
  total: { total: number | null; sinImporte: string[] };
  cliente: string | null;
  conPermiso: boolean;
}): string {
  const { total } = args;
  const quien = args.cliente ?? "el cliente";
  const base =
    args.servicio === "tercero"
      ? total.total != null
        ? `Se cargará ${formatCurrency(total.total)} a la cuenta de ${quien}.`
        : `No se carga nada a ${quien}: falta precio o tarifa.`
      : total.total != null
        ? `Valor de lo producido: ${formatCurrency(total.total)}${total.sinImporte.length ? ` · sin precio: ${total.sinImporte.join(", ")}` : ""}.`
        : "Sin precio de venta: se registra igual, sin valorizar.";
  return args.conPermiso ? base : `${base} Sin permiso declarado.`;
}

/** El `detail` de un error del servidor: lo que sirve para decir DÓNDE está el problema. */
export type DetalleError = Record<string, unknown> | null;

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Las corridas que el servidor encontró parecidas (409 `POSIBLE_DUPLICADO`,
 * `detail.duplicados`), dichas como se leen en el Libro: «N.º 31 · Tornillo · 0.236 m³».
 */
export function duplicadosDelDetalle(detalle: DetalleError): string[] {
  const lista = Array.isArray(detalle?.duplicados) ? (detalle.duplicados as unknown[]) : [];
  return lista.flatMap((d) => {
    if (!d || typeof d !== "object") return [];
    const x = d as Record<string, unknown>;
    const nro = num(x.lineNo);
    const m3 = num(x.m3);
    return [
      [
        nro != null ? `N.º ${nro}` : "Una corrida",
        txt(x.especie),
        m3 != null ? `${fmtM3(m3)} m³` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ];
  });
}

/**
 * Cómo se explica cada código que devuelve el servidor (`{ error, message, detail }`).
 *
 * Se compara contra `string` y no contra `ErrorProduccionSinLote`: el servidor
 * conoce códigos que el contrato compartido todavía no lista (`PT_NO_CUADRA`,
 * `PERIODO_CERRADO`…), y un código nuevo tiene que caer al mensaje del
 * servidor, no romper el tipo.
 */
export function explicarErrorDeRegistro(
  codigo: string | null,
  mensaje: string | null,
  status: number,
  detalle: DetalleError = null,
): string {
  const delServidor = mensaje?.trim() ? ` ${mensaje.trim()}` : "";
  switch (codigo) {
    case "PAQUETE_YA_DECLARADO": {
      const cod = txt(detalle?.codigo);
      const nro = num(detalle?.lineNo);
      const donde = cod
        ? `El paquete ${cod} ya está en el Libro${nro != null ? ` (corrida N.º ${nro})` : ""}.`
        : `Un código de paquete ya está en el Libro.${delServidor}`;
      return `${donde} Si ya registraste esta producción, no hace falta repetirla; si no, cierra y vuelve a abrir «Producir sin lote» para que proponga códigos libres — lo cubicado no se pierde.`;
    }
    case "PARTE_NO_EXISTE":
      return `La cuenta elegida ya no está en el Directorio (¿se dio de baja?).${delServidor} Elige otra o créala de nuevo.`;
    case "SIN_ESPECIE":
      return `Hay medidas sin especie.${delServidor} Pónsela en la columna «Especie» de lo cubicado.`;
    case "PT_NO_CUADRA": {
      const cod = txt(detalle?.codigo);
      const pt = num(detalle?.pieTablar);
      const calc = num(detalle?.calculado);
      return cod && pt != null && calc != null
        ? `El paquete ${cod} declara ${fmtPtExacto(pt)} PT y su escuadría da ${fmtPtExacto(calc)}. Revisa esa medida en lo cubicado.`
        : `El PT de un paquete no sale de su escuadría.${delServidor}`;
    }
    case "PERIODO_CERRADO": {
      const mes = txt(detalle?.periodKey);
      return `${mes ? `El mes ${mes}` : "Ese mes"} ya está cerrado en el Libro: cambia la fecha o reabre el mes.`;
    }
    case "POSIBLE_DUPLICADO": {
      const dup = duplicadosDelDetalle(detalle);
      return `Parece una producción ya registrada${dup.length ? `: ${dup.join("; ")}` : "."}`;
    }
    case "LINEA_INVALIDA":
      return "Elige la línea de producción de la lista (LP, LRE, LREM o LPC).";
    case "FECHA_INVALIDA":
      return `La fecha no es válida.${delServidor}`;
    case "ESPECIE_REPETIDA":
      return `Una especie salió dos veces escrita distinto.${delServidor} Unifícala en la columna «Especie».`;
    default:
      /* Un 5xx puede llegar DESPUÉS de guardar (falló sólo la respuesta):
         no se promete que no quedó nada. Reintentar es seguro — si ya está,
         vuelve el aviso de duplicado o el de código ya usado. */
      if (status >= 500)
        return `El servidor falló al responder (${status}); puede que la producción SÍ haya quedado registrada. Mira el Libro antes de reintentar: si ya está, al reintentar te avisa.`;
      return mensaje?.trim() || `El servidor respondió ${status}.`;
  }
}

/** El aviso final: qué corridas quedaron, cuánto y qué se valorizó o cargó. */
export function mensajeDeRegistro(
  resp: ProduccionSinLoteRespuesta,
  servicio: TipoServicio,
  cliente: string | null,
): string {
  const n = resp.corridas.length;
  const cuales = resp.corridas
    .map((c) => `${c.especie}${c.lineNo != null ? ` N.º ${c.lineNo}` : ""}`)
    .join(", ");
  const partes = [
    `Producción registrada sin lote: ${n === 1 ? "1 corrida" : `${n} corridas`} (${cuales}) · ${fmtPt(resp.total.pt)} PT · ${fmtM3(resp.total.m3)} m³.`,
  ];
  if (servicio === "propia") {
    const sinPrecio = resp.corridas.filter((c) => c.valorVenta == null).map((c) => c.especie);
    if (resp.total.valorVenta != null)
      partes.push(`Valor de lo producido: ${formatCurrency(resp.total.valorVenta)}.`);
    if (sinPrecio.length > 0) partes.push(`Sin precio de venta: ${sinPrecio.join(", ")}.`);
  } else {
    const cobradas = resp.corridas.filter((c) => c.aserrio?.cobrado);
    const cargado = r2(cobradas.reduce((a, c) => a + (c.aserrio?.importe ?? 0), 0));
    const nombre = cobradas[0]?.aserrio?.parteNombre ?? cliente ?? "el cliente";
    if (cobradas.length > 0)
      partes.push(`Se cargaron ${formatCurrency(cargado)} a la cuenta de ${nombre}.`);
    for (const c of resp.corridas.filter((x) => !x.aserrio?.cobrado)) {
      partes.push(`${c.especie}: no se cobró${c.aserrio?.motivo ? ` — ${c.aserrio.motivo}` : ""}.`);
    }
  }
  partes.push("Falta vincularle su materia prima.");
  return partes.join(" ");
}
