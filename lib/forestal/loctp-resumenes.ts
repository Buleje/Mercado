/**
 * loctp-resumenes.ts — los TRES CUADROS RESUMEN del Libro de Operaciones de CTP
 * (RDE D000025-2023-MIDAGRI-SERFOR-DE), calculados a partir de los movimientos
 * del libro.
 *
 * Son parte del formato oficial igual que las cuatro secciones, y son lo que un
 * fiscalizador lee primero: cierran el período en una tabla por especie y por
 * lote. Hasta ahora el módulo tenía "existencias" propias —útiles, pero con otras
 * columnas y otro nombre—, así que el libro no se podía presentar sin rehacer los
 * cuadros a mano.
 *
 * PURO: recibe los movimientos ya traídos y devuelve las filas. Sin fetch y sin
 * DOM para que lo usen el export, la pantalla y los tests con los mismos números.
 *
 * REGLA DE ORO acá: **un dato que no existe se devuelve `null`, nunca 0**. En un
 * cuadro oficial un 0 afirma "no hubo"; el vacío dice "no se registra". El caso
 * concreto son las piezas consumidas: el libro atribuye consumo en m³, no por
 * troza, así que el número de trozas consumidas no se puede afirmar sin inventarlo
 * (mismo criterio que el costo sin factura: `null`, jamás 0).
 */

/** Cuánto y cuántos: el formato pide volumen Y número de trozas en cada casillero. */
export interface VolPiezas {
  volumen: number;
  /** `null` = el dato no se registra por movimiento (no es cero). */
  piezas: number | null;
}

// ── Entradas ────────────────────────────────────────────────────────────────

export interface MovIngreso {
  especie: string;
  cientifico: string | null;
  cites: boolean;
  volumenM3: number;
  piezas: number;
  /** Producto del ingreso: sólo las trozas/rollizas van al Cuadro Resumen 1. */
  tipoProducto: string | null;
  /** m³ ya consumidos de ESTE ingreso (viene del puente de consumos). */
  consumidoM3: number;
}

export interface MovProduccion {
  especie: string | null;
  cientifico: string | null;
  tipoProducto: string | null;
  unidad: string | null;
  cantidad: number;
  /** m³ de materia prima consumidos por esta corrida. */
  consumidoM3: number;
  /** LP = línea principal · LRE = línea de recuperación. */
  lineaProduccion: string | null;
  lote: string | null;
}

export interface MovSalida {
  especie: string | null;
  cientifico: string | null;
  tipoProducto: string | null;
  unidad: string | null;
  cantidad: number;
  lote: string | null;
}

/** Saldo al cierre del período anterior — el "stock inicial" del formato. */
export interface StockInicial {
  /** Trozas por especie: volumen en m³. */
  trozasM3: Record<string, number>;
  /** Productos transformados por clave especie|tipo|unidad. */
  productos: Record<string, number>;
}

export interface EntradaResumenes {
  ingresos: MovIngreso[];
  produccion: MovProduccion[];
  salidas: MovSalida[];
  inicial?: StockInicial;
  /**
   * Retrozado del período agregado por especie (Apartado 2 · ADR-313). Llena los
   * casilleros (7)/(8) y (9)/(10) del Cuadro Resumen 1. Si no viene, esos
   * casilleros quedan vacíos — que es distinto de declarar que no hubo cortes.
   */
  retrozados?: MovRetrozado[];
}

/** Lo cortado en planta, por especie — sale de `retrozadoPorEspecie()`. */
export interface MovRetrozado {
  especie: string;
  /** Trozas MADRE que se cortaron: volumen que sale de la fila como "troza". */
  retrozado: { volumen: number; piezas: number };
  /** Pedazos que salieron del corte: volumen que vuelve a entrar como troza. */
  deRetrozado: { volumen: number; piezas: number };
}

// ── Salidas ─────────────────────────────────────────────────────────────────

/** CUADRO RESUMEN 1 — saldos y movimientos de TROZAS (16 casilleros). */
export interface FilaResumen1 {
  especie: string;
  cientifico: string | null;
  cites: boolean;
  inicial: VolPiezas;
  ingresado: VolPiezas;
  retrozado: VolPiezas;
  deRetrozado: VolPiezas;
  consumido: VolPiezas;
  salido: VolPiezas;
  saldo: VolPiezas;
}

/** CUADRO RESUMEN 2 — saldos y movimientos de PRODUCTOS TRANSFORMADOS (10 casilleros). */
export interface FilaResumen2 {
  especie: string;
  cientifico: string | null;
  tipoProducto: string;
  unidad: string;
  inicial: number;
  ingresado: number;
  consumido: number;
  producido: number;
  salido: number;
  saldo: number;
}

/** CUADRO RESUMEN 3 — BALANCE DE LA TRANSFORMACIÓN PRIMARIA por lote (13 casilleros). */
export interface FilaResumen3 {
  lote: string;
  tipoProducto: string;
  especie: string;
  cientifico: string | null;
  unidadConsumo: string;
  cantidadConsumida: number;
  lineaProduccion: string;
  unidadProducto: string;
  cantidadProducida: number;
  consumidoReproceso: number | null;
  salido: number;
  stock: number;
  /** % (producido/consumido). `null` si las unidades no son comparables. */
  rendimientoPct: number | null;
  /** Cuando las unidades difieren, el formato pide el FACTOR (ej. "pt/m³"). */
  factorConversion: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tipos de producto que el formato cuenta como TROZA en el Cuadro Resumen 1. */
const ES_TROZA = /rolliza|troza|rollizo/i;

export function esTroza(tipoProducto: string | null | undefined): boolean {
  return ES_TROZA.test(tipoProducto ?? "rolliza");
}

/** Clave del Resumen 2: el formato separa por especie, tipo de producto y unidad. */
export function claveProducto(
  especie: string | null,
  tipoProducto: string | null,
  unidad: string | null,
): string {
  return [especie || "—", tipoProducto || "—", unidad || "m3"].join("|");
}

const vp = (volumen: number, piezas: number | null): VolPiezas => ({ volumen: r4(volumen), piezas });

// ── Cuadro Resumen 1 ────────────────────────────────────────────────────────

/**
 * Trozas por especie. `retrozado` y `deRetrozado` van en `null`: el módulo no
 * registra el Apartado 2 (Retrozado), y declarar 0 sería afirmar que no hubo.
 */
export function resumen1Trozas(entrada: EntradaResumenes): FilaResumen1[] {
  const porEspecie = new Map<string, FilaResumen1>();
  const inicialTrozas = entrada.inicial?.trozasM3 ?? {};

  const filaDe = (especie: string, cientifico: string | null, cites: boolean): FilaResumen1 => {
    const previa = porEspecie.get(especie);
    if (previa) {
      // El científico y CITES se completan con el primer movimiento que los traiga.
      if (!previa.cientifico && cientifico) previa.cientifico = cientifico;
      if (cites) previa.cites = true;
      return previa;
    }
    const nueva: FilaResumen1 = {
      especie,
      cientifico,
      cites,
      inicial: vp(inicialTrozas[especie] ?? 0, null),
      ingresado: vp(0, 0),
      retrozado: vp(0, null),
      deRetrozado: vp(0, null),
      consumido: vp(0, null),
      salido: vp(0, null),
      saldo: vp(0, null),
    };
    porEspecie.set(especie, nueva);
    return nueva;
  };

  // Las especies que sólo tienen stock inicial también van en el cuadro.
  for (const [especie, volumen] of Object.entries(inicialTrozas)) {
    if (volumen !== 0) filaDe(especie, null, false).inicial = vp(volumen, null);
  }

  for (const i of entrada.ingresos) {
    if (!esTroza(i.tipoProducto)) continue;
    const f = filaDe(i.especie, i.cientifico, i.cites);
    f.ingresado = vp(f.ingresado.volumen + i.volumenM3, (f.ingresado.piezas ?? 0) + i.piezas);
    // El consumo se atribuye en m³ contra el ingreso; las piezas no se parten.
    f.consumido = vp(f.consumido.volumen + i.consumidoM3, null);
  }

  for (const s of entrada.salidas) {
    if (!esTroza(s.tipoProducto)) continue;
    const f = filaDe(s.especie || "—", s.cientifico, false);
    f.salido = vp(f.salido.volumen + s.cantidad, null);
  }

  // Retrozado (Apartado 2): la madre sale de la fila y los pedazos vuelven a
  // entrar. Es un movimiento INTERNO —la misma madera de la misma guía—, así que
  // los dos casilleros existen para que el fiscalizador pueda seguir el corte,
  // no para cambiar el total.
  for (const r of entrada.retrozados ?? []) {
    const f = filaDe(r.especie || "—", null, false);
    f.retrozado = vp(f.retrozado.volumen + r.retrozado.volumen, (f.retrozado.piezas ?? 0) + r.retrozado.piezas);
    f.deRetrozado = vp(
      f.deRetrozado.volumen + r.deRetrozado.volumen,
      (f.deRetrozado.piezas ?? 0) + r.deRetrozado.piezas,
    );
  }

  for (const f of porEspecie.values()) {
    // El retrozado NO entra en el saldo: cortar una troza en tres no crea ni
    // destruye madera, y el consumo se atribuye contra el m³ del INGRESO (I2),
    // no contra cada pedazo. Sumarlo contaría la misma madera dos veces.
    f.saldo = vp(
      f.inicial.volumen + f.ingresado.volumen - f.consumido.volumen - f.salido.volumen,
      null,
    );
  }

  return [...porEspecie.values()].sort((a, b) => a.especie.localeCompare(b.especie, "es"));
}

// ── Cuadro Resumen 2 ────────────────────────────────────────────────────────

/**
 * Productos transformados por especie + tipo + unidad. `ingresado` cuenta los
 * productos que entran YA transformados (madera aserrada comprada, no trozas).
 */
export function resumen2Productos(entrada: EntradaResumenes): FilaResumen2[] {
  const porClave = new Map<string, FilaResumen2>();
  const inicialProd = entrada.inicial?.productos ?? {};

  const filaDe = (
    especie: string | null,
    cientifico: string | null,
    tipoProducto: string | null,
    unidad: string | null,
  ): FilaResumen2 => {
    const clave = claveProducto(especie, tipoProducto, unidad);
    const previa = porClave.get(clave);
    if (previa) {
      if (!previa.cientifico && cientifico) previa.cientifico = cientifico;
      return previa;
    }
    const nueva: FilaResumen2 = {
      especie: especie || "—",
      cientifico,
      tipoProducto: tipoProducto || "—",
      unidad: unidad || "m3",
      inicial: r4(inicialProd[clave] ?? 0),
      ingresado: 0,
      consumido: 0,
      producido: 0,
      salido: 0,
      saldo: 0,
    };
    porClave.set(clave, nueva);
    return nueva;
  };

  for (const [clave, cantidad] of Object.entries(inicialProd)) {
    if (cantidad === 0) continue;
    const [especie, tipo, unidad] = clave.split("|");
    filaDe(especie, null, tipo, unidad).inicial = r4(cantidad);
  }

  // Un ingreso que NO es troza es producto transformado que entra.
  for (const i of entrada.ingresos) {
    if (esTroza(i.tipoProducto)) continue;
    const f = filaDe(i.especie, i.cientifico, i.tipoProducto, "m3");
    f.ingresado = r4(f.ingresado + i.volumenM3);
    f.consumido = r4(f.consumido + i.consumidoM3);
  }

  for (const p of entrada.produccion) {
    const f = filaDe(p.especie, p.cientifico, p.tipoProducto, p.unidad);
    f.producido = r4(f.producido + p.cantidad);
  }

  for (const s of entrada.salidas) {
    if (esTroza(s.tipoProducto)) continue;
    const f = filaDe(s.especie, s.cientifico, s.tipoProducto, s.unidad);
    f.salido = r4(f.salido + s.cantidad);
  }

  for (const f of porClave.values()) {
    f.saldo = r4(f.inicial + f.ingresado + f.producido - f.consumido - f.salido);
  }

  /* Una fila con los seis casilleros en cero no declara nada: es una corrida
     abierta —consumió y todavía no dijo qué salió, así que no tiene tipo de
     producto— que se cuela como «TORNILLO · — · m³ · 0 0 0 0 0 0». Un producto
     que nunca existió, con nombre de dato roto, en un cuadro que se presenta a
     la autoridad. Su consumo NO se pierde: vive en el Cuadro 3, que es donde el
     formato pide la materia prima consumida. */
  return [...porClave.values()]
    .filter((f) => f.inicial !== 0 || f.ingresado !== 0 || f.consumido !== 0 || f.producido !== 0 || f.salido !== 0)
    .sort((a, b) => a.especie.localeCompare(b.especie, "es") || a.tipoProducto.localeCompare(b.tipoProducto, "es"));
}

// ── Cuadro Resumen 3 ────────────────────────────────────────────────────────

/**
 * Balance por lote: lo consumido contra lo producido, con el rendimiento.
 *
 * El formato lo pide por lote (o conjunto de lotes) y por línea de producción.
 * Las corridas sin lote se agrupan bajo "(sin lote)" en vez de descartarse: un
 * balance que esconde producción no cierra, y el hueco es justamente lo que hay
 * que ver.
 *
 * Cuando la unidad del producto no es la de la materia prima (m³), el formato
 * pide el FACTOR de conversión en vez del porcentaje — un "73%" entre pies
 * tablares y metros cúbicos no significa nada.
 */
export function resumen3Balance(entrada: EntradaResumenes): FilaResumen3[] {
  const SIN_LOTE = "(sin lote)";
  const porClave = new Map<string, FilaResumen3>();

  for (const p of entrada.produccion) {
    const lote = p.lote || SIN_LOTE;
    const linea = (p.lineaProduccion || "LP").toUpperCase();
    const unidad = p.unidad || "m3";
    const clave = [lote, linea, p.tipoProducto ?? "—", p.especie ?? "—", unidad].join("|");
    const f = porClave.get(clave) ?? {
      lote,
      tipoProducto: p.tipoProducto || "—",
      especie: p.especie || "—",
      cientifico: p.cientifico,
      // La materia prima del CTP se consume en m³ (el libro entero se calcula así).
      unidadConsumo: "m3",
      cantidadConsumida: 0,
      lineaProduccion: linea,
      unidadProducto: unidad,
      cantidadProducida: 0,
      // El reproceso no se registra como tal todavía: null, no 0.
      consumidoReproceso: null,
      salido: 0,
      stock: 0,
      rendimientoPct: null,
      factorConversion: null,
    };
    if (!f.cientifico && p.cientifico) f.cientifico = p.cientifico;
    f.cantidadConsumida = r4(f.cantidadConsumida + p.consumidoM3);
    f.cantidadProducida = r4(f.cantidadProducida + p.cantidad);
    porClave.set(clave, f);
  }

  // Lo que salió se descuenta por lote: el balance cierra cuando el stock llega a 0.
  const salidoPorLote = new Map<string, number>();
  for (const s of entrada.salidas) {
    if (esTroza(s.tipoProducto)) continue;
    const lote = s.lote || SIN_LOTE;
    for (const parte of lote.split(",").map((l) => l.trim()).filter(Boolean)) {
      salidoPorLote.set(parte, r4((salidoPorLote.get(parte) ?? 0) + s.cantidad));
    }
  }

  const filas = [...porClave.values()];
  // Un lote puede tener varias filas (líneas o productos distintos): lo salido se
  // reparte contra la primera fila que lo produjo para no contarlo dos veces.
  const yaAsignado = new Set<string>();
  for (const f of filas) {
    const salido = yaAsignado.has(f.lote) ? 0 : (salidoPorLote.get(f.lote) ?? 0);
    yaAsignado.add(f.lote);
    f.salido = r4(salido);
    f.stock = r4(f.cantidadProducida - salido);
    /* Hace falta numerador Y denominador. Con producción en cero, la cuenta da
       0 % y la pantalla lo leía como «muy bajo: se perdió madera» — pero una
       corrida abierta (ADR-364) consumió hace media hora y declara al final de
       la jornada. Un 0 % ahí acusa una pérdida que no ocurrió, y contaba ese
       lote entre los «fuera de rango». `null` dice lo único cierto: todavía no
       hay rendimiento. El consumo sigue a la vista en su casillero, que es lo
       que el formato pide — no se esconde nada. */
    if (f.cantidadConsumida > 0 && f.cantidadProducida > 0) {
      if (f.unidadProducto === f.unidadConsumo) {
        f.rendimientoPct = r2((f.cantidadProducida / f.cantidadConsumida) * 100);
      } else {
        f.factorConversion = `${r4(f.cantidadProducida / f.cantidadConsumida)} ${f.unidadProducto}/m³`;
      }
    }
  }

  return filas.sort(
    (a, b) => a.lote.localeCompare(b.lote, "es") || a.lineaProduccion.localeCompare(b.lineaProduccion),
  );
}

/** Los tres cuadros de una pasada — lo que consumen el export y la pantalla. */
export function cuadrosResumen(entrada: EntradaResumenes): {
  resumen1: FilaResumen1[];
  resumen2: FilaResumen2[];
  resumen3: FilaResumen3[];
} {
  return {
    resumen1: resumen1Trozas(entrada),
    resumen2: resumen2Productos(entrada),
    resumen3: resumen3Balance(entrada),
  };
}

/** Líneas de producción del formato (casillero 7 del Cuadro Resumen 3). */
/**
 * Las líneas de producción viven en `loctp-catalogos` junto con los demás
 * catálogos del negocio. Se re-exportan acá porque el Cuadro Resumen 3 fue su
 * primer consumidor y varios módulos las importan de este archivo.
 */
export { LINEAS_PRODUCCION, esLineaProduccion, type LineaProduccion } from "./loctp-catalogos";
