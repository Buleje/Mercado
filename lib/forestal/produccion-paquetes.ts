/**
 * produccion-paquetes.ts — la aritmética del registro de producción (ADR-349).
 *
 * El formato del SNIFFS declara **paquetes**: cada uno con su código, su
 * producto, su presentación y —si se dimensiona— espesor, ancho y largo. Lo que
 * la corrida declara como cantidad es la SUMA de esos paquetes, y el rendimiento
 * sale de esa suma contra la materia prima que entró.
 *
 * Todo eso vive acá y no en el modal: son las cuentas que después tienen que dar
 * lo mismo en el libro, en el papel y en la vista de productos disponibles.
 *
 * PURO y client-safe.
 */

import { RENDIMIENTO_META } from "./loctp-catalogos";

export interface PaqueteBorrador {
  /** Id local del borrador — no viaja al servidor. */
  id: string;
  codigo: string;
  productType: string;
  presentacion: string;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * El volumen de un paquete dimensionado: espesor × ancho × largo × piezas.
 *
 * Espesor y ancho en **centímetros**, largo en **metros** — así se cantan en el
 * aserradero y así los pide el formato. Devuelve `null` si falta alguna medida:
 * un volumen a medio calcular es peor que ninguno, porque parece un dato.
 */
export function volumenDimensionado(
  espesorCm: number | null,
  anchoCm: number | null,
  largoM: number | null,
  piezas: number,
): number | null {
  if (!(espesorCm && espesorCm > 0) || !(anchoCm && anchoCm > 0) || !(largoM && largoM > 0)) return null;
  if (!(piezas > 0)) return null;
  return r4((espesorCm / 100) * (anchoCm / 100) * largoM * piezas);
}

export interface TotalesProduccion {
  paquetes: number;
  piezas: number;
  volumen: number;
  /** Producido / consumido, en %. `null` cuando no se puede calcular. */
  rendimientoPct: number | null;
}

/**
 * Lo que la corrida va a declarar.
 *
 * El rendimiento **sólo sale en m³**: convertir pie tablar a m³ para mostrar un
 * porcentaje sería inventar el dato, y es la misma regla que ya aplica el resto
 * del libro.
 */
export function totalesProduccion(
  paquetes: readonly PaqueteBorrador[],
  entradaM3: number,
  unidad = "m3",
): TotalesProduccion {
  const volumen = r4(paquetes.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0));
  const piezas = paquetes.reduce((a, p) => a + (Number(p.cantidad) || 0), 0);
  return {
    paquetes: paquetes.length,
    piezas,
    volumen,
    rendimientoPct:
      unidad === "m3" && entradaM3 > 0 && volumen > 0 ? Math.round((volumen / entradaM3) * 1000) / 10 : null,
  };
}

/** Por qué NO se puede guardar todavía. Vacío = listo. */
export function motivosParaGuardar(
  paquetes: readonly PaqueteBorrador[],
  /** Lo que entró a la sierra. Con esto se aplica el tope de rendimiento. */
  opts: {
    consumidoM3?: number;
    topePct?: number;
    /**
     * Lo que esta MISMA corrida ya declaró en tandas anteriores (ADR-361).
     *
     * El tope se mide sobre el total acumulado: dos tandas del 40 % son 80 %
     * entre las dos, y el techo existe justo para que eso no pase.
     */
    yaDeclaradoM3?: number;
    /** Códigos de paquete que la corrida ya tiene: el servidor los rechaza. */
    codigosUsados?: readonly string[];
  } = {},
): string[] {
  const motivos: string[] = [];
  if (paquetes.length === 0) motivos.push("Agregá al menos un paquete de producción.");
  const sinCodigo = paquetes.filter((p) => !p.codigo.trim()).length;
  if (sinCodigo > 0) motivos.push(`${sinCodigo} paquete(s) sin código: es lo que se busca en la pila.`);
  const codigos = paquetes.map((p) => p.codigo.trim().toLowerCase()).filter(Boolean);
  const repetido = codigos.find((c, i) => codigos.indexOf(c) !== i);
  if (repetido) motivos.push(`El código «${repetido}» está en dos paquetes.`);
  /* Contra los que la corrida YA tiene: al ampliar, un código repetido vuelve
     del servidor como 422 después de tipear toda la tanda. */
  const usados = new Set((opts.codigosUsados ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean));
  const choque = codigos.find((c) => usados.has(c));
  if (choque) motivos.push(`El código «${choque}» ya está en esta corrida.`);
  const sinVolumen = paquetes.filter((p) => !(p.volumenM3 > 0)).length;
  if (sinVolumen > 0) motivos.push(`${sinVolumen} paquete(s) sin volumen.`);

  /* El techo del 56 % (ADR-358). Se frena el asiento antes de escribirlo:
     declarar más producto del que sale físicamente de una troza es lo que un
     fiscalizador lee como madera metida de otro lado. */
  if (opts.consumidoM3 != null && opts.consumidoM3 > 0) {
    const tope = topeDeclarableM3(opts.consumidoM3, opts.topePct);
    const previo = Math.max(0, Number(opts.yaDeclaradoM3 ?? 0));
    const declarado = Number((paquetes.reduce((a, p) => a + (p.volumenM3 || 0), 0) + previo).toFixed(4));
    if (declarado > tope) {
      const pct = opts.topePct ?? RENDIMIENTO_TOPE_PCT;
      motivos.push(
        `Los paquetes suman ${declarado.toFixed(4)} m³ y el tope de rendimiento (${pct} %) permite ` +
          `${tope.toFixed(4)} m³ con los ${Number(opts.consumidoM3).toFixed(4)} m³ que entraron. ` +
          `Sacá ${Number((declarado - tope).toFixed(4))} m³.`,
      );
    }
  }
  return motivos;
}

/**
 * El siguiente código sugerido, con el patrón del anterior.
 *
 * Si el último termina en número, se le suma uno conservando los ceros a la
 * izquierda: el aserradero numera `PQ-001`, `PQ-002`… y tipear eso cincuenta
 * veces es donde aparecen los códigos repetidos.
 */
export function siguienteCodigo(anterior: string): string {
  const m = anterior.trim().match(/^(.*?)(\d+)$/);
  if (!m) return "";
  const [, prefijo, numero] = m;
  return `${prefijo}${String(Number(numero) + 1).padStart(numero.length, "0")}`;
}

// ── El código de paquete que todavía está libre ─────────────────────────────

/**
 * El código de paquete es **único en toda la planta** (`@@unique[tenantId,
 * codigo]`): es lo que se pinta en la pila y lo que se cita en la guía de
 * salida, y dos atados con el mismo cartel no se distinguen.
 *
 * Autonumerar desde «el último de esta corrida» alcanzaba para una corrida y
 * chocaba con la de al lado. Esto propone el siguiente de la **serie de la
 * planta**, saltando los que ya están tomados:
 *
 *   1. Se toma el prefijo que el aserradero más usa (`PQ-`, `ATD-2026-`…) — la
 *      serie que ya existe manda, porque es la que está pintada en el patio.
 *   2. Se le suma uno al mayor número de esa serie, conservando los ceros.
 *   3. Si ese cae ocupado —por otra corrida o por el borrador de este modal— se
 *      sigue avanzando hasta uno libre.
 *   4. Sin ninguna serie previa se arranca `PQ-AAMM-001`: el año y el mes hacen
 *      que dos plantas del mismo dueño no colisionen ni empezando de cero.
 *
 * PURA: `hoy` entra por parámetro para poder testearla.
 */
export function sugerirCodigoPaquete(
  /** Los códigos que YA existen en la planta, los más recientes primero. */
  existentes: readonly string[],
  opts: { hoy: Date; ocupados?: readonly string[] },
): string {
  const tomados = new Set(
    [...existentes, ...(opts.ocupados ?? [])].map((c) => c.trim().toLowerCase()).filter(Boolean),
  );

  /* La serie más usada, no la del último código: una corrida suelta con otro
     prefijo no tiene que arrastrar a toda la planta. */
  const series = new Map<string, { ancho: number; max: number; veces: number; orden: number }>();
  existentes.forEach((crudo, i) => {
    const m = crudo.trim().match(/^(.*?)(\d+)$/);
    if (!m) return;
    const [, prefijo, numero] = m;
    const previo = series.get(prefijo);
    const n = Number(numero);
    if (!previo) series.set(prefijo, { ancho: numero.length, max: n, veces: 1, orden: i });
    else {
      previo.veces += 1;
      previo.max = Math.max(previo.max, n);
      previo.ancho = Math.max(previo.ancho, numero.length);
    }
  });

  const elegida = [...series.entries()].sort(
    /* Más usada primero; a igualdad, la del código más reciente (los `existentes`
       llegan ordenados por fecha descendente). */
    (a, b) => b[1].veces - a[1].veces || a[1].orden - b[1].orden,
  )[0];

  if (!elegida) {
    const aa = String(opts.hoy.getUTCFullYear()).slice(-2);
    const mm = String(opts.hoy.getUTCMonth() + 1).padStart(2, "0");
    const prefijo = `PQ-${aa}${mm}-`;
    for (let n = 1; n <= 9999; n++) {
      const codigo = `${prefijo}${String(n).padStart(3, "0")}`;
      if (!tomados.has(codigo.toLowerCase())) return codigo;
    }
    return `${prefijo}${Date.parse(opts.hoy.toISOString())}`;
  }

  const [prefijo, { ancho, max }] = elegida;
  for (let n = max + 1; n <= max + 1000; n++) {
    const codigo = `${prefijo}${String(n).padStart(ancho, "0")}`;
    if (!tomados.has(codigo.toLowerCase())) return codigo;
  }
  /* Mil ocupados seguidos no es una serie, es otra cosa: se devuelve el patrón
     sin número para que el operador lo complete y el servidor valide. */
  return prefijo;
}

// ── El tope de rendimiento (ADR-358) ────────────────────────────────────────

/**
 * De 1 m³ de troza no salen más de 0.56 m³ de tabla: el resto se va en aserrín,
 * canto y descarte.
 *
 * `RENDIMIENTO_META` (0.56) venía siendo una **meta** que pintaba el número de
 * rojo cuando no se llegaba. Acá pasa a ser un **techo que no se cruza**: es la
 * regla de la planta, y declarar más producto del que físicamente sale de una
 * troza es lo que un fiscalizador lee como madera metida de otro lado. Se
 * prefiere frenar el asiento antes que dejarlo entrar.
 *
 * Sigue siendo el MISMO 0.56 de `loctp-catalogos`: dos constantes distintas para
 * el mismo número ya divergieron una vez (56 en producción, 75 en Consumos).
 */
/* `0.56 * 100` da 56.00000000000001 en JS: el tope tiene que ser el número
   redondo o el truncado de abajo deja pasar una milésima de más. */
export const RENDIMIENTO_TOPE_PCT = Math.round(RENDIMIENTO_META * 1000) / 10;

/** Lo máximo que se puede declarar con lo que entró a la sierra. */
export function topeDeclarableM3(consumidoM3: number, topePct = RENDIMIENTO_TOPE_PCT): number {
  if (!(consumidoM3 > 0)) return 0;
  // Se trunca, no se redondea: redondear hacia arriba deja pasar el tope.
  return Math.floor(consumidoM3 * (topePct / 100) * 10_000) / 10_000;
}

/**
 * Cuánto MÁS entra sin pasar el tope. Nunca negativo: si ya se pasó, es 0 y el
 * formulario deja de ofrecer «agregar».
 */
export function margenDeclarableM3(
  consumidoM3: number,
  yaDeclaradoM3: number,
  topePct = RENDIMIENTO_TOPE_PCT,
): number {
  return Math.max(0, Number((topeDeclarableM3(consumidoM3, topePct) - yaDeclaradoM3).toFixed(4)));
}

// ── Reparto entre orígenes (ADR-358) ────────────────────────────────────────

/** Un origen de la materia prima: un título habilitante o permiso. */
export interface OrigenMateriaPrima {
  /** El N° del título habilitante / permiso, o `null` si la guía no lo trae. */
  permiso: string | null;
  volumenM3: number;
  piezas: number;
}

export interface RepartoOrigen extends OrigenMateriaPrima {
  /** Qué parte del producto declarado le toca. */
  produccionM3: number;
  /** Su peso en la corrida, en %. */
  pctMateriaPrima: number;
}

/**
 * Reparte lo producido entre los títulos habilitantes que lo ampararon.
 *
 * Cuando un lote junta trozas de dos permisos, el paquete que sale de la sierra
 * es madera de los dos y **no hay forma física de saber cuál tabla vino de cuál
 * árbol**. Lo que sí se puede afirmar —y es lo que la trazabilidad exige— es en
 * qué proporción entró cada uno. Se reparte por volumen de materia prima, que es
 * la única base defendible ante un fiscalizador.
 *
 * El ÚLTIMO absorbe el redondeo: sin eso, tres orígenes de un tercio cada uno
 * declaraban 99.9999 de 100 y el acta no cerraba contra sí misma.
 */
export function repartirEntreOrigenes(
  produccionM3: number,
  origenes: readonly OrigenMateriaPrima[],
): RepartoOrigen[] {
  const total = origenes.reduce((a, o) => a + Math.max(0, o.volumenM3), 0);
  if (origenes.length === 0 || !(total > 0)) return [];

  const r4 = (n: number) => Number(n.toFixed(4));
  let asignado = 0;
  return origenes.map((o, i) => {
    const ultimo = i === origenes.length - 1;
    const parte = ultimo
      ? r4(produccionM3 - asignado)
      : r4((Math.max(0, o.volumenM3) / total) * produccionM3);
    asignado = r4(asignado + parte);
    return {
      ...o,
      produccionM3: Math.max(0, parte),
      pctMateriaPrima: Math.round((Math.max(0, o.volumenM3) / total) * 1000) / 10,
    };
  });
}

/** Los orígenes de un puñado de trozas, agrupados y ordenados por volumen. */
export function origenesDeTrozas(
  trozas: readonly { permiso?: string | null; volumenM3?: number | string | null }[],
): OrigenMateriaPrima[] {
  const por = new Map<string, OrigenMateriaPrima>();
  for (const t of trozas) {
    const permiso = (t.permiso ?? "").trim() || null;
    /* Las que no declaran permiso se agrupan bajo `null` y se NOMBRAN: una troza
       sin título habilitante es justo la que hay que poder señalar. */
    const k = permiso ?? " sin-permiso";
    const fila = por.get(k) ?? { permiso, volumenM3: 0, piezas: 0 };
    fila.volumenM3 = Number((fila.volumenM3 + Number(t.volumenM3 ?? 0)).toFixed(4));
    fila.piezas += 1;
    por.set(k, fila);
  }
  return [...por.values()].sort((a, b) => b.volumenM3 - a.volumenM3);
}

// ── Lo que ya estaba por encima del tope (ADR-358) ──────────────────────────

/** Una corrida ya registrada, en lo que este barrido necesita de ella. */
export interface CorridaParaTope {
  id: string;
  lineNo: number;
  entryDate?: string | Date | null;
  productType?: string | null;
  speciesCommon?: string | null;
  volumeInputM3?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  materiaPrimaRef?: string | null;
  /** Una corrida anulada no declara nada: su madera volvió al patio. */
  status?: string | null;
}

export interface CorridaSobreTope {
  id: string;
  lineNo: number;
  producto: string;
  lote: string | null;
  entradaM3: number;
  salidaM3: number;
  rendimientoPct: number;
  /** Cuánto habría que sacar para entrar en el tope. */
  excesoM3: number;
}

/**
 * Las corridas que declaran más de lo que sale de su materia prima.
 *
 * Un guard nuevo sólo frena lo que se registre de ahora en más: lo que ya estaba
 * cargado queda invisible justo cuando la regla pasa a existir. Este barrido es
 * el espejo del de guías descuadradas — el mismo cruce, del otro lado del libro.
 *
 * Sólo mira corridas **en m³**: dividir pies tablares por metros cúbicos no es un
 * rendimiento, es mezclar unidades (ADR-355).
 */
/**
 * Lo que a una corrida todavía le falta declarar (ADR-361/365).
 *
 * Un turno no sale de la sierra en un solo acto: se declaran los paquetes que
 * salieron hoy y al día siguiente sale el resto de la MISMA materia prima —lo
 * que quedó del bloque, la recuperación, las tablillas—. Esa corrida no está
 * mal: está a medio declarar, y el libro tiene que poder decir cuánto le queda.
 *
 * `margenM3` es lo que todavía entra sin cruzar el techo del 56 %, y es el mismo
 * número que el modal ofrece cargar. No se inventa un "faltante esperado": lo
 * que falta es un rango, no una obligación — un lote puede rendir 40 % y estar
 * perfecto.
 */
export interface CorridaAMedioDeclarar {
  id: string;
  lineNo: number;
  entryDate: string | null;
  producto: string;
  especie: string | null;
  lote: string | null;
  entradaM3: number;
  declaradoM3: number;
  topeM3: number;
  /** Cuánto más se puede declarar sobre esta misma materia prima. */
  margenM3: number;
  rendimientoPct: number;
}

/**
 * Un litro. Es lo que la cinta del aserradero distingue: ofrecer «te quedan
 * 0.0004 m³» es ruido que enseña a ignorar el aviso (misma tolerancia de
 * negocio que usa `corridasSobreTope`, no el epsilon del float).
 */
export const MARGEN_MINIMO_M3 = 0.001;

export function corridasAMedioDeclarar(
  corridas: readonly CorridaParaTope[],
  topePct = RENDIMIENTO_TOPE_PCT,
): CorridaAMedioDeclarar[] {
  return corridas
    .map((c) => {
      /* Anulada = madera devuelta al patio; sin declarar (`quantity` nula) es
         deuda de OTRA lista —«corridas sin declarar»— y tiene su propia puerta:
         ampliar lo que nunca se declaró sería declarar por primera vez. */
      if (c.status != null && c.status !== "registrado") return null;
      if ((c.unit ?? "m3") !== "m3") return null;
      const entrada = Number(c.volumeInputM3 ?? 0);
      const declarado = c.quantity == null ? 0 : Number(c.quantity);
      if (!(entrada > 0) || !(declarado > 0)) return null;
      const tope = topeDeclarableM3(entrada, topePct);
      const margen = Number((tope - declarado).toFixed(4));
      if (margen < MARGEN_MINIMO_M3) return null;
      const fecha = c.entryDate == null ? null : new Date(c.entryDate);
      return {
        id: c.id,
        lineNo: c.lineNo,
        entryDate: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : null,
        producto: c.productType?.trim() || "—",
        especie: c.speciesCommon?.trim() || null,
        lote: c.materiaPrimaRef?.trim() || null,
        entradaM3: Number(entrada.toFixed(4)),
        declaradoM3: Number(declarado.toFixed(4)),
        topeM3: tope,
        margenM3: margen,
        rendimientoPct: Math.round((declarado / entrada) * 1000) / 10,
      } satisfies CorridaAMedioDeclarar;
    })
    .filter((c): c is CorridaAMedioDeclarar => c !== null)
    /* La más nueva primero: el turno de ayer es el que se viene a completar. */
    .sort((a, b) => b.lineNo - a.lineNo);
}

export function corridasSobreTope(
  corridas: readonly CorridaParaTope[],
  topePct = RENDIMIENTO_TOPE_PCT,
): CorridaSobreTope[] {
  return corridas
    .map((c) => {
      const entrada = Number(c.volumeInputM3 ?? 0);
      const salida = Number(c.quantity ?? 0);
      if (!(entrada > 0) || !(salida > 0)) return null;
      if ((c.unit ?? "m3") !== "m3") return null;
      const tope = topeDeclarableM3(entrada, topePct);
      /* La tolerancia es la del negocio (un litro), no la del float: sobre
         cuatro decimales, siete corridas rojas por redondeo enseñan a ignorar
         la lista entera. */
      if (salida <= tope + 0.001) return null;
      return {
        id: c.id,
        lineNo: c.lineNo,
        producto: [c.productType, c.speciesCommon].filter(Boolean).join(" · ") || "—",
        lote: c.materiaPrimaRef?.trim() || null,
        entradaM3: Number(entrada.toFixed(4)),
        salidaM3: Number(salida.toFixed(4)),
        rendimientoPct: Math.round((salida / entrada) * 1000) / 10,
        excesoM3: Number((salida - tope).toFixed(4)),
      } satisfies CorridaSobreTope;
    })
    .filter((c): c is CorridaSobreTope => c !== null)
    .sort((a, b) => b.rendimientoPct - a.rendimientoPct);
}
