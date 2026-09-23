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
  esTipoComercial,
  type BloqueACobrar,
  type Cotizacion,
  type VersionTarifa,
} from "@/lib/forestal/tarifa-aserrio";
import { cotizarCorrida, type DatosDelCobro } from "@/lib/forestal/argumentos-del-cobro";
import {
  precioDelCliente,
  tarifaVigente,
  type GrupoEspecies,
  type TarifaCliente,
} from "@/lib/forestal/precio-cliente";
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
  /**
   * Madera propia: el trato de VENTA del cliente si se eligió uno y cubre la
   * especie (ADR-430), si no el último usado. Tercero: lo que da su trato de
   * aserrío o la tarifa, en promedio por PT.
   */
  sugerido: { valor: number; origen: "ultimo" | "tarifa" | "cliente" } | null;
  /** La columna Importe. `null` = sin precio: se dice, no se pinta un 0. */
  importe: number | null;
  /**
   * De dónde sale el importe sin precio a mano: el trato del cliente, la
   * tarifa de la planta, o los dos (lo que el trato no cubre va a la tarifa).
   */
  desde: "precio" | "tarifa" | "cliente" | "cliente-y-tarifa" | null;
  /**
   * Sin precio a mano y con el trato, la tarifa o los grupos todavía leyéndose:
   * el importe no se sabe. La tabla dice «calculando», no «no se cobra».
   */
  calculando?: boolean;
}

/** De dónde salió una cotización sin precio a mano. */
function origenDeCotizacion(c: Cotizacion): "tarifa" | "cliente" | "cliente-y-tarifa" {
  const delCliente = c.lineas.some((l) => l.baseDesde.startsWith("cliente-"));
  const deLaPlanta = c.lineas.some((l) => !l.baseDesde.startsWith("cliente-") && l.precioPt > 0);
  return delCliente ? (deLaPlanta ? "cliente-y-tarifa" : "cliente") : "tarifa";
}

/**
 * El precio de VENTA que el trato del cliente propone para una especie: el
 * promedio por PT de sus paquetes, cada uno con el precio de su tipo. Sólo si
 * el trato cubre TODOS: un promedio de la mitad de la madera parecería el
 * precio de toda.
 */
export function ventaSugeridaDelCliente(
  corrida: CorridaDeEspecie | undefined,
  trato: TarifaCliente | null,
  grupos: readonly GrupoEspecies[],
): number | null {
  if (!corrida || !trato || corrida.paquetes.length === 0) return null;
  let pt = 0;
  let soles = 0;
  for (const p of corrida.paquetes) {
    const precio = precioDelCliente(trato, grupos, corrida.especie, esTipoComercial(p.tipo) ? p.tipo : null);
    if (!precio) return null;
    pt += p.pieTablar;
    soles += p.pieTablar * precio.precioPt;
  }
  return pt > 0 ? r4(soles / pt) : null;
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
  /**
   * El trato del cliente elegido (ADR-430): TODAS sus versiones. Tercero usa
   * la de aserrío vigente el día de la producción —la misma que busca el
   * cobro del servidor (`argumentosDelCobro`)—; propia, la de venta.
   */
  tarifasCliente?: readonly TarifaCliente[];
  /** Los grupos de especies de la planta: sin ellos no hay precio «por grupo». */
  grupos?: readonly GrupoEspecies[];
  /** El día de la producción (`AAAA-MM-DD`): con él se elige la versión vigente. */
  fecha?: string;
}): PrecioDeEspecie[] {
  const { servicio } = args;
  const grupos = args.grupos ?? [];
  /* Los MISMOS datos que `cobrarCorrida`: el trato vigente ese día y los grupos. */
  const delCobro: Omit<DatosDelCobro, "precioManualPt"> = {
    tarifasCliente: args.tarifasCliente ?? [],
    grupos,
    fecha: args.fecha ?? null,
  };
  const tratoVenta = tarifaVigente(args.tarifasCliente ?? [], "venta", args.fecha);
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
      const corrida = args.corridas.find((c) => claveEspecie(c.especie) === clave);
      if (servicio === "propia") {
        const ultimo = args.recordados[clave];
        const delCliente = ventaSugeridaDelCliente(corrida, tratoVenta, grupos);
        const imp = importe(e.pt, precio);
        return {
          ...vacia,
          texto,
          invalido,
          precio,
          sugerido:
            delCliente != null
              ? { valor: delCliente, origen: "cliente" }
              : ultimo
                ? { valor: ultimo, origen: "ultimo" }
                : null,
          importe: imp,
          desde: imp != null ? "precio" : null,
        };
      }
      /* Tercero: sin precio a mano, el servidor cobra el trato del cliente y,
         lo que no cubre, la tarifa vigente ese día — la vista previa dice lo
         mismo porque cotiza con los mismos argumentos. */
      const bloques = corrida ? bloquesDeEspecie(corrida) : [];
      const porTarifa = cotizarCorrida(args.tarifa, bloques, delCobro);
      const origen = origenDeCotizacion(porTarifa);
      /* El promedio de los PRECIOS pesado por PT, no importe ÷ PT: el importe
         de cada paquete ya viene redondeado al céntimo y un trato de 0.50
         parejo se leía «≈ 0.5005». */
      const sugerido =
        porTarifa.cobrable && porTarifa.pt > 0
          ? {
              valor: r4(porTarifa.lineas.reduce((a, l) => a + l.pt * l.precioPt, 0) / porTarifa.pt),
              origen: origen === "tarifa" ? ("tarifa" as const) : ("cliente" as const),
            }
          : null;
      if (precio != null) {
        const cot = cotizarCorrida(args.tarifa, bloques, { ...delCobro, precioManualPt: precio });
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
        desde: porTarifa.cobrable ? origen : null,
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
  /**
   * El trato del cliente (ADR-430) y los grupos de especies: el servidor los
   * usa antes que la tarifa, así que valen el mismo criterio — sin saber qué
   * dicen, no se sabe cuánto se carga.
   */
  trato?: { cargando: boolean; error: string | null; cliente?: string | null };
  grupos?: { cargando: boolean; error?: boolean };
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
    const quien = args.trato?.cliente?.trim() || "el cliente";
    if (args.trato?.cargando) return `Leyendo el precio pactado con ${quien}…`;
    if (args.trato?.error)
      return `No se pudo leer el precio pactado con ${quien}: pon el precio a mano en cada especie para saber cuánto se carga.`;
    if (args.grupos?.cargando) return "Leyendo los grupos de especies…";
    if (args.grupos?.error)
      return "No se pudieron leer los grupos de especies: pon el precio a mano en cada especie para saber cuánto se carga.";
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
        : `No se carga nada a ${quien}: falta precio, su trato o la tarifa.`
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
