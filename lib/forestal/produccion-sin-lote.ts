/**
 * Lo que el SERVIDOR decide al declarar producción sin lote (ADR-429).
 *
 * `declarar-produccion.ts` es el contrato que comparten pantalla y servidor
 * (tipos, Zod, vista previa). Esto es la otra mitad: lo que la pantalla NO
 * puede decidir porque el cliente no es de fiar con plata ni con el libro —
 * que el PT de cada paquete salga de su escuadría, que el m³ salga de ese PT,
 * el posible duplicado y el valor de lo producido con lo que quedó guardado.
 *
 * PURO: nada de Prisma. La DB class (`forest-ctp-sin-lote.db.ts`) lee y
 * escribe; acá sólo se decide, y por eso se prueba sin base.
 */
import { claveEspecie } from "./loth-constants";
import { PT_POR_M3, ptDesdeM3 } from "./cubicacion";
import { fmtM3 } from "./cubicacion-formato";
import { esLineaProduccion } from "./loctp-catalogos";
import {
  precioValido,
  type CorridaDeclarada,
  type ErrorProduccionSinLote,
  type ProduccionSinLoteInput,
  type ProduccionSinLoteRespuesta,
} from "./declarar-produccion";
import type { ResultadoCobro } from "./tarifa-aserrio";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** La referencia de materia prima que siempre escribió «Producir sin lote». */
export const MATERIA_PRIMA_SIN_LOTE = "Sin lote — cubicado en el Libro";

/** El producto de un paquete que no trae uno del catálogo LO-CTP. */
export const PRODUCTO_GENERICO = "MADERA ASERRADA";

// ── Errores ─────────────────────────────────────────────────────────────────

/**
 * Los del contrato más los que sólo conoce el servidor. Van aparte porque el
 * contrato (`ErrorProduccionSinLote`) es compartido y no se toca desde acá:
 *  - `PT_NO_CUADRA`: el PT o el m³ de un paquete no sale de su escuadría.
 *  - `ESPECIE_REPETIDA`: dos corridas del pedido son la misma especie.
 *  - `FECHA_INVALIDA` / `LINEA_INVALIDA`: forma que el Zod no alcanza a ver.
 */
export type CodigoProduccionSinLote =
  | ErrorProduccionSinLote
  | "PT_NO_CUADRA"
  | "ESPECIE_REPETIDA"
  | "FECHA_INVALIDA"
  | "LINEA_INVALIDA";

export class ProduccionSinLoteError extends Error {
  constructor(
    readonly code: CodigoProduccionSinLote,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProduccionSinLoteError";
  }
}

/**
 * El estado HTTP de cada código. `Record` y no un `switch`: un código nuevo sin
 * estado no compila.
 *  - 409: choca con algo que YA está en el libro (se resuelve mirándolo).
 *  - 404: la cuenta del cliente no existe para este tenant.
 *  - 422: el dato no cuadra consigo mismo.
 *  - 400: el pedido está mal armado (no lo arma la pantalla).
 */
export const ESTADO_HTTP: Record<CodigoProduccionSinLote, number> = {
  POSIBLE_DUPLICADO: 409,
  PAQUETE_YA_DECLARADO: 409,
  PARTE_NO_EXISTE: 404,
  SIN_ESPECIE: 422,
  PT_NO_CUADRA: 422,
  ESPECIE_REPETIDA: 400,
  FECHA_INVALIDA: 400,
  LINEA_INVALIDA: 400,
  PERIODO_CERRADO: 422,
  validation_error: 400,
};

// ── El PT sale de la escuadría ──────────────────────────────────────────────

const CM_POR_PULG = 2.54;
const M_POR_PIE = 0.3048;

/**
 * Media unidad del último decimal con que el libro guarda la escuadría: cm y m
 * con 2 decimales (`paquetesDeLoCubicado`, Decimal(8,2)). Es todo lo que se
 * puede haber perdido al pasar de «2×8×10» a «5.08 × 20.32 × 3.05».
 */
const MEDIO_CENTESIMO = 0.005;
/** El PT de cada fila cubicada se redondea al centésimo (`cubicarPieza`). */
const REDONDEO_PT_FILA = 0.005;
/** El m³ de cada fila sale de PT ÷ 424 redondeado a 4 decimales (`cubicarPieza`). */
const REDONDEO_M3_FILA = 0.00005;

interface Escuadria {
  cantidad: number;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
}

/** PT = piezas × espesor″ × ancho″ × largo′ ÷ 12, desde la escuadría en cm y m. */
export function ptDeEscuadria(p: Escuadria): number {
  return (p.cantidad * (p.espesorCm / CM_POR_PULG) * (p.anchoCm / CM_POR_PULG) * (p.largoM / M_POR_PIE)) / 12;
}

/**
 * Cuánto puede diferir, SIN que nadie haya hecho nada mal, el PT que mandó la
 * pantalla del que sale de la escuadría guardada.
 *
 * No es un porcentaje elegido a ojo (regla `verificacion-de-verdad` §4): es la
 * suma de lo que el camino pierde de verdad —
 *  1. la escuadría viaja en cm/m con 2 decimales: cada medida puede estar
 *     corrida hasta medio centésimo, y el error relativo del producto es la
 *     suma de los tres relativos (primer orden);
 *  2. el PT se redondea al centésimo por fila cubicada, y un paquete no puede
 *     juntar más filas que piezas.
 *
 * Ejemplo medido: 100 piezas de 2×8×10 son 1 333,33 PT; la escuadría guardada
 * (5.08 × 20.32 × 3.05) da 1 334,21 y la tolerancia es 4,34 PT (0,33 %). Un PT
 * inflado un 1 % (13 PT, unos S/ 50 a S/ 4 el pie) queda afuera; el redondeo
 * honesto, adentro.
 */
export function toleranciaPt(p: Escuadria): number {
  /* El margen relativo tiene TECHO del 2 %: divide por medidas que manda el
     cliente, y con una escuadría minúscula (0,001 cm) se disparaba hasta
     aceptar un PT 5,5 veces mayor (auditoría de seguridad, 22-09). Ninguna
     pieza real se acerca: 2×8×10 da 0,33 %. */
  const relativo = Math.min(
    TECHO_RELATIVO_PT,
    MEDIO_CENTESIMO / p.espesorCm + MEDIO_CENTESIMO / p.anchoCm + MEDIO_CENTESIMO / p.largoM,
  );
  return ptDeEscuadria(p) * relativo + REDONDEO_PT_FILA * p.cantidad + 0.01;
}

/** Tope del margen relativo del PT (ver `toleranciaPt`). */
export const TECHO_RELATIVO_PT = 0.02;

/**
 * Cuánto puede diferir el m³ del paquete de PT ÷ 424. El m³ se DERIVA del PT
 * (regla de la plaza, `PT_POR_M3`), redondeado a 4 decimales por fila: la
 * diferencia honesta es a lo sumo medio diezmilésimo por fila.
 */
export function toleranciaM3(cantidad: number): number {
  return REDONDEO_M3_FILA * (cantidad + 1) + 1e-9;
}

/**
 * ¿El PT y el m³ del paquete salen de su escuadría? `null` = sí; si no, el
 * motivo en palabras del aserradero. Es lo que impide que un PT tipeado (o
 * inflado) se multiplique por el precio: el importe es plata de un tercero.
 */
export function motivoPtNoCuadra(p: Escuadria & { codigo: string; pieTablar: number; volumenM3: number }): string | null {
  const calculado = ptDeEscuadria(p);
  const tolerancia = toleranciaPt(p);
  if (Math.abs(p.pieTablar - calculado) > tolerancia) {
    return (
      `El paquete ${p.codigo} dice ${p.pieTablar} PT, pero ${p.cantidad} pieza(s) de ` +
      `${p.espesorCm} × ${p.anchoCm} cm × ${p.largoM} m son ${r2(calculado)} PT. ` +
      "Vuelve a cubicarlo: el PT tiene que salir de las medidas."
    );
  }
  const m3DelPt = p.pieTablar / PT_POR_M3;
  if (Math.abs(p.volumenM3 - m3DelPt) > toleranciaM3(p.cantidad)) {
    return (
      `El paquete ${p.codigo} dice ${p.volumenM3} m³, pero sus ${p.pieTablar} PT son ` +
      `${fmtM3(r4(m3DelPt))} m³ (${PT_POR_M3} PT = 1 m³). Vuelve a cubicarlo.`
    );
  }
  return null;
}

// ── El plan: una corrida por especie ────────────────────────────────────────

export interface PaquetePlan {
  codigo: string;
  productType: string;
  presentacion: string;
  cantidad: number;
  volumenM3: number;
  pieTablar: number;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
  /** Madera propia: S/ por PT de su especie. `null` = sin precio (y siempre en servicio a tercero). */
  precioVentaPt: number | null;
}

export interface CorridaPlan {
  /** Como vino en el pedido; el nombre del catálogo lo pone la DB class. */
  especie: string;
  clave: string;
  paquetes: PaquetePlan[];
  /** m³ declarados = Σ m³ de los paquetes (el detalle y el total son lo mismo). */
  quantity: number;
  pieces: number;
  pt: number;
  /** Lo que el asiento dice arriba: el primer paquete, como hacía declarar. */
  productType: string;
  presentacion: string;
  codigoProducto: string;
  /** Servicio a tercero: el trato de ESTA corrida. `null` = cobra la tarifa. */
  precioManualPt: number | null;
}

export interface PlanProduccionSinLote {
  fecha: Date;
  lineaProduccion: string;
  corridas: CorridaPlan[];
}

/** «2026-09-22» → medianoche UTC, que es como el libro guarda una fecha sin hora. */
export function fechaDelAsiento(fecha: string): Date | null {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  /* El regex del contrato deja pasar «2026-02-31» y JavaScript lo corre al
     3 de marzo en silencio: el ida y vuelta lo delata. */
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === fecha ? d : null;
}

/** El precio por especie de la lista del pedido; sin fila o sin precio → `null`. */
export function precioDeEspecie(
  lista: readonly { especie: string; precioPt: number | null }[],
  clave: string,
): number | null {
  return precioValido(lista.find((p) => claveEspecie(p.especie) === clave)?.precioPt ?? null);
}

/** Una especie tiene que tener al menos una letra: «—», «-» o «(Cedrela)» no nombran madera. */
const nombraUnaEspecie = (clave: string) => /\p{L}/u.test(clave);

/**
 * Del pedido a lo que se escribe, validado. Tira `ProduccionSinLoteError` con
 * el primer problema; no escribe nada — por eso se corre ANTES de la
 * transacción, y lo que depende de la base (duplicados, códigos ya usados en
 * la planta, la cuenta) se mira adentro.
 */
export function planDeProduccionSinLote(input: ProduccionSinLoteInput): PlanProduccionSinLote {
  const fecha = fechaDelAsiento(input.fecha);
  if (!fecha) {
    throw new ProduccionSinLoteError("FECHA_INVALIDA", `La fecha ${input.fecha} no existe en el calendario.`);
  }
  const linea = (input.lineaProduccion ?? "").trim().toUpperCase() || "LP";
  if (!esLineaProduccion(linea)) {
    throw new ProduccionSinLoteError(
      "LINEA_INVALIDA",
      `La línea de producción «${input.lineaProduccion}» no es del LO-CTP (LP, LRE, LREM o LPC).`,
    );
  }

  const vistas = new Map<string, string>();
  const codigos = new Map<string, string>();
  const corridas = input.corridas.map((c): CorridaPlan => {
    const clave = claveEspecie(c.especie);
    if (!nombraUnaEspecie(clave)) {
      throw new ProduccionSinLoteError(
        "SIN_ESPECIE",
        `«${c.especie}» no es una especie: ponle a esas piezas la especie que se aserró.`,
        { especie: c.especie },
      );
    }
    const previa = vistas.get(clave);
    if (previa != null) {
      throw new ProduccionSinLoteError(
        "ESPECIE_REPETIDA",
        `«${c.especie}» y «${previa}» son la misma especie: van en UNA corrida.`,
        { especie: c.especie },
      );
    }
    vistas.set(clave, c.especie);

    const precioVenta =
      input.servicio.tipo === "propia" ? precioDeEspecie(input.servicio.preciosVentaPt, clave) : null;
    const precioManual =
      input.servicio.tipo === "tercero" ? precioDeEspecie(input.servicio.preciosManualPt, clave) : null;

    const paquetes = c.paquetes.map((p): PaquetePlan => {
      const codigo = p.codigo.trim();
      /* El código es único en TODA la planta, así que tampoco se repite entre
         dos especies del mismo pedido. Minúsculas: en la pila «pq-1» y «PQ-1»
         son el mismo cartel. */
      const k = codigo.toLowerCase();
      const otro = codigos.get(k);
      if (otro != null) {
        throw new ProduccionSinLoteError(
          "PAQUETE_YA_DECLARADO",
          `El código de paquete «${codigo}» viene dos veces (${otro} y ${c.especie}): es lo que se busca en la pila, no puede repetirse.`,
          { codigo, lineNo: null },
        );
      }
      codigos.set(k, c.especie);

      const motivo = motivoPtNoCuadra({ ...p, codigo });
      if (motivo) {
        throw new ProduccionSinLoteError("PT_NO_CUADRA", motivo, {
          codigo,
          pieTablar: p.pieTablar,
          calculado: r2(ptDeEscuadria(p)),
          tolerancia: r2(toleranciaPt(p)),
        });
      }
      return {
        codigo,
        productType: p.productType?.trim() || PRODUCTO_GENERICO,
        presentacion: p.presentacion.trim().toUpperCase(),
        cantidad: p.cantidad,
        volumenM3: r4(p.volumenM3),
        pieTablar: r2(p.pieTablar),
        espesorCm: r2(p.espesorCm),
        anchoCm: r2(p.anchoCm),
        largoM: r2(p.largoM),
        precioVentaPt: precioVenta,
      };
    });

    return {
      especie: c.especie.trim(),
      clave,
      paquetes,
      quantity: r4(paquetes.reduce((a, p) => a + p.volumenM3, 0)),
      pieces: paquetes.reduce((a, p) => a + p.cantidad, 0),
      pt: r2(paquetes.reduce((a, p) => a + p.pieTablar, 0)),
      productType: paquetes[0].productType,
      presentacion: paquetes[0].presentacion,
      codigoProducto: paquetes[0].codigo,
      precioManualPt: precioManual,
    };
  });

  return { fecha, lineaProduccion: linea, corridas };
}

// ── Posible duplicado ───────────────────────────────────────────────────────

/** La misma tolerancia con que el libro compara paquetes contra lo declarado: un litro. */
export const TOLERANCIA_DUPLICADO_M3 = 0.001;

export interface CorridaDelDia {
  id: string;
  lineNo: number | null;
  speciesCommon: string | null;
  quantity: number | null;
  /** Sin consumos ni volumen de entrada: todavía no se le vinculó su materia prima. */
  sinLote: boolean;
  /**
   * De quién es la madera, como la nombra el libro (`etiquetaDeDueno`): «Del
   * centro», «De tercero · WASACO». `null` = la corrida no lo declaró.
   */
  dueno?: string | null;
}

export interface PosibleDuplicado {
  id: string;
  lineNo: number | null;
  especie: string | null;
  m3: number;
  sinLote: boolean;
}

/**
 * Las corridas vivas de ESE día que ya declaran la misma especie y el mismo m³
 * (±1 litro).
 *
 * Con o sin lote: la que se registró sin lote y después se vinculó a su
 * materia prima sigue siendo la misma madera, y reabrir el modal con la
 * libreta llena —el caso que ADR-429 cierra— declara otra vez justamente ésa.
 * Medido el 22-09 en Blas: 0 pares de corridas vivas comparten día, especie y
 * m³, así que mirar también las vinculadas no levanta avisos falsos.
 */
export function posiblesDuplicados(
  pedidas: readonly { clave: string; quantity: number }[],
  delDia: readonly CorridaDelDia[],
  /**
   * El dueño de lo que se declara ahora (Brandon, 2026-09-23: *«registrar en un
   * día dos registros diferentes de dueños diferentes y guardarse»*). Dos
   * dueños que el mismo día sacan la misma especie y el mismo m³ son dos
   * registros, no uno repetido. Sólo se descarta cuando los DOS dueños se
   * saben y difieren: una corrida vieja sin dueño declarado sigue avisando.
   */
  duenoNuevo?: string | null,
): PosibleDuplicado[] {
  const out: PosibleDuplicado[] = [];
  const clave = (d: string | null | undefined) => (d ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  for (const e of delDia) {
    if (e.quantity == null) continue;
    if (clave(duenoNuevo) && clave(e.dueno) && clave(duenoNuevo) !== clave(e.dueno)) continue;
    const q = e.quantity;
    const choca = pedidas.some(
      (p) => p.clave === claveEspecie(e.speciesCommon) && Math.abs(p.quantity - q) <= TOLERANCIA_DUPLICADO_M3,
    );
    if (choca) out.push({ id: e.id, lineNo: e.lineNo, especie: e.speciesCommon, m3: r4(q), sinLote: e.sinLote });
  }
  return out;
}

export function mensajeDuplicado(dups: readonly PosibleDuplicado[], fecha: string): string {
  const [a, m, d] = fecha.split("-");
  const lista = dups
    .map((x) => `${x.especie ?? "sin especie"} ${fmtM3(x.m3)} m³ (corrida N° ${x.lineNo ?? "?"})`)
    .join(", ");
  /* Sólo el hecho: qué hay y dónde. Qué hacer (registrar igual o no) lo
     pregunta la pantalla, que es la que tiene el botón. */
  return `El ${d}/${m}/${a} ya hay producción declarada con la misma especie y el mismo volumen: ${lista}.`;
}

// ── Lo que se responde, con lo que quedó guardado ───────────────────────────

export interface PaqueteGuardado {
  volumenM3: number;
  pieTablar: number | null;
  precioVentaPt: number | null;
}

/**
 * El valor de venta de lo producido: Σ PT × precio de los paquetes que tienen
 * precio. `null` si ninguno tiene — «no sé» no es «vale cero».
 */
export function valorVentaDe(paquetes: readonly PaqueteGuardado[]): number | null {
  let total: number | null = null;
  for (const p of paquetes) {
    if (p.pieTablar == null || p.precioVentaPt == null || !(p.precioVentaPt > 0)) continue;
    total = (total ?? 0) + p.pieTablar * p.precioVentaPt;
  }
  return total == null ? null : r2(total);
}

/** El PT del paquete: el guardado; si no hay (paquete viejo), el que sale del m³. */
export const ptDelPaquete = (p: Pick<PaqueteGuardado, "pieTablar" | "volumenM3">): number =>
  p.pieTablar != null ? p.pieTablar : ptDesdeM3(p.volumenM3);

export function armarRespuesta(
  corridas: readonly {
    id: string;
    lineNo: number | null;
    especie: string;
    paquetes: readonly PaqueteGuardado[];
    aserrio: ResultadoCobro | null;
  }[],
): ProduccionSinLoteRespuesta {
  const declaradas = corridas.map(
    (c): CorridaDeclarada => ({
      id: c.id,
      lineNo: c.lineNo,
      especie: c.especie,
      pt: r2(c.paquetes.reduce((a, p) => a + ptDelPaquete(p), 0)),
      m3: r4(c.paquetes.reduce((a, p) => a + p.volumenM3, 0)),
      valorVenta: valorVentaDe(c.paquetes),
      aserrio: c.aserrio,
    }),
  );
  const conValor = declaradas.filter((c) => c.valorVenta != null);
  return {
    corridas: declaradas,
    total: {
      pt: r2(declaradas.reduce((a, c) => a + c.pt, 0)),
      m3: r4(declaradas.reduce((a, c) => a + c.m3, 0)),
      valorVenta: conValor.length > 0 ? r2(conValor.reduce((a, c) => a + (c.valorVenta ?? 0), 0)) : null,
    },
  };
}
