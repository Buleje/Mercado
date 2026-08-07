/**
 * ctp-saldos-analisis.ts — las preguntas que el panel de Existencias no contestaba.
 *
 * La pestaña Control mostraba cuatro totales y cuatro tablas. Los totales dicen
 * QUÉ hay; no dicen si eso es mucho, poco, o si alcanza para la semana que viene.
 * Las cuatro preguntas que un jefe de planta hace mirando ese mismo tablero:
 *
 *  1. **¿Cuánto de lo que entró ya se transformó?** (rotación)
 *  2. **¿Para cuántos días me alcanza la madera parada?** (cobertura)
 *  3. **¿De qué especie dependo?** (concentración — si el 80 % del patio es una
 *     sola especie, un problema con ESE permiso para la planta entera)
 *  4. **¿Cuánto volumen está en el limbo?** (ingresado sin validar: no computa
 *     como saldo pero está físicamente en el patio)
 *
 * ── Lo que acá NO se calcula, y por qué ──────────────────────────────────────
 * El rendimiento de planta (producido ÷ consumido) NO sale de acá: `productos[]`
 * no declara unidad, y sumar pies tablares con metros cúbicos para dividirlos por
 * m³ da un número con aspecto de verdad. Ese cálculo vive en
 * `loctp-consumos-analisis.ts`, que sí ve la unidad de cada corrida y devuelve
 * `null` cuando están mezcladas.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

/** Redondeo del libro. */
const r2 = (n: number): number => Number(n.toFixed(2));

/** Debajo de esto un volumen es ruido de coma flotante, no existencia. */
const EPS = 1e-4;

const MS_DIA = 86_400_000;

export interface EspecieSaldo {
  especie: string;
  cites: boolean;
  ingresoM3: number;
  consumidoM3: number;
  saldoM3: number;
  pendienteM3: number;
}

export interface MateriaPrimaTotales {
  ingresoM3: number;
  consumidoM3: number;
  /**
   * m³ que salieron SIN ASERRAR (ADR-363): madera vendida en rollo. Bajó del
   * patio igual que la consumida, pero no pasó por ninguna corrida — por eso no
   * se suma a `consumidoM3`, que significa "se aserró". Opcional: los saldos
   * cacheados de antes de ADR-363 no lo traen.
   */
  despachadoDirectoM3?: number;
  saldoM3: number;
  pendienteM3: number;
}

export interface ProductoStock {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
}

/** Ventana de tiempo del período; `null` en los extremos = sin límite. */
export interface VentanaPeriodo {
  from: string | null;
  to: string | null;
  /** "Ahora" inyectado: un cálculo con reloj propio no se puede testear. */
  ahora: number;
}

export interface KpisDePlanta {
  /** Consumido ÷ ingresado, en %. `null` sin ingresos. */
  rotacionPct: number | null;
  /**
   * Días que dura el saldo al ritmo de consumo del período. `null` cuando no
   * hay ritmo que medir (sin consumo, o período sin inicio).
   */
  coberturaDias: number | null;
  /** m³/día consumidos en el período — el ritmo detrás de la cobertura. */
  consumoDiario: number | null;
  /** Días efectivamente transcurridos que se usaron para el ritmo. */
  diasMedidos: number | null;
  /** La especie que más pesa en el saldo, y cuánto pesa. */
  concentracion: { especie: string; pct: number } | null;
  /** Volumen sin validar sobre el total físico en patio, en %. */
  sinValidarPct: number | null;
  /** Especies con movimiento en el período. */
  especiesActivas: number;
  /** Líneas de producto con stock disponible, sobre el total de líneas. */
  productosConStock: { con: number; total: number };
}

/**
 * Los cuatro números derivados, cada uno con su `null` cuando no se puede
 * afirmar. Un KPI que muestra "0 días de cobertura" porque todavía no hubo
 * consumo es peor que uno que dice "sin dato": el primero manda a comprar madera
 * que no hace falta.
 */
export function kpisDePlanta(
  mp: MateriaPrimaTotales,
  porEspecie: ReadonlyArray<EspecieSaldo>,
  productos: ReadonlyArray<ProductoStock>,
  ventana: VentanaPeriodo,
): KpisDePlanta {
  const rotacionPct =
    mp.ingresoM3 > EPS ? r2((mp.consumidoM3 / mp.ingresoM3) * 100) : null;

  const diasMedidos = diasTranscurridos(ventana);
  const consumoDiario =
    diasMedidos != null && mp.consumidoM3 > EPS ? mp.consumidoM3 / diasMedidos : null;
  const coberturaDias =
    consumoDiario != null && consumoDiario > EPS && mp.saldoM3 > EPS
      ? Math.round(mp.saldoM3 / consumoDiario)
      : null;

  // La concentración se mide sobre saldos POSITIVOS: una especie en negativo no
  // ocupa patio, y meterla en el denominador encogería el total y exageraría al
  // resto.
  const positivos = porEspecie.filter((e) => e.saldoM3 > EPS);
  const totalSaldo = positivos.reduce((a, e) => a + e.saldoM3, 0);
  const top = positivos.reduce<EspecieSaldo | null>(
    (mejor, e) => (mejor == null || e.saldoM3 > mejor.saldoM3 ? e : mejor),
    null,
  );
  const concentracion =
    top && totalSaldo > EPS
      ? { especie: top.especie, pct: r2((top.saldoM3 / totalSaldo) * 100) }
      : null;

  const fisico = mp.ingresoM3 + mp.pendienteM3;
  const sinValidarPct = fisico > EPS ? r2((mp.pendienteM3 / fisico) * 100) : null;

  return {
    rotacionPct,
    coberturaDias,
    consumoDiario: consumoDiario != null ? r2(consumoDiario) : null,
    diasMedidos,
    concentracion,
    sinValidarPct,
    especiesActivas: porEspecie.length,
    productosConStock: {
      con: productos.filter((p) => p.stock > EPS).length,
      total: productos.length,
    },
  };
}

/**
 * Días de consumo REAL del período.
 *
 * El corte es `min(fin, ahora)` a propósito: el 2 del mes, un período "mes
 * actual" tiene 31 días de calendario pero 2 de operación. Dividir por 31 daría
 * un ritmo quince veces más lento y una cobertura de un año para madera que
 * dura una semana. Sin fecha de inicio (histórico completo) no hay ventana que
 * medir y devuelve `null`.
 */
export function diasTranscurridos({ from, to, ahora }: VentanaPeriodo): number | null {
  if (!from) return null;
  const desde = new Date(from).getTime();
  if (Number.isNaN(desde)) return null;
  const fin = to ? new Date(to).getTime() : ahora;
  const hasta = Math.min(Number.isNaN(fin) ? ahora : fin, ahora);
  if (hasta < desde) return null;
  // Un período de un solo día es 1 día de consumo, no 0.
  return Math.max(1, Math.ceil((hasta - desde) / MS_DIA));
}

export interface PasoBalance {
  label: string;
  value: number;
  type: "baseline" | "positive" | "negative" | "total";
}

/**
 * El saldo, contado como se cuenta a mano: de dónde salí, qué entró, qué gasté,
 * dónde quedé. Es la conciliación del ADR-139 dibujada.
 *
 * Sin conciliación (período sin inicio) la apertura no existe —no es cero, no se
 * sabe— y la cascada arranca directamente en el ingreso del período.
 */
export function pasosDeBalance(
  mp: MateriaPrimaTotales,
  apertura: number | null,
): PasoBalance[] {
  const pasos: PasoBalance[] = [];
  if (apertura != null) {
    pasos.push({ label: "Apertura", value: r2(apertura), type: "baseline" });
    pasos.push({ label: "Ingresos", value: r2(mp.ingresoM3), type: "positive" });
  } else {
    pasos.push({ label: "Ingresos", value: r2(mp.ingresoM3), type: "baseline" });
  }
  pasos.push({ label: "Consumo", value: -r2(mp.consumidoM3), type: "negative" });
  // "Existencia final" y no "Saldo": con apertura, este total incluye lo
  // heredado del cierre anterior y el KPI «Saldo de materia prima» no —
  // dos números distintos con el mismo nombre se leen como una contradicción.
  pasos.push({
    label: "Existencia",
    value: r2((apertura ?? 0) + mp.ingresoM3 - mp.consumidoM3),
    type: "total",
  });
  return pasos;
}

export interface FilaRanking extends EspecieSaldo {
  /** Participación en el saldo total positivo, en %. */
  pct: number;
}

/**
 * Especies ordenadas por lo que queda en patio.
 *
 * Ordenar por saldo y no por ingreso es deliberado: la pregunta operativa es
 * "qué tengo para aserrar el lunes", no "qué compré en marzo". Las de saldo
 * negativo van al final —son un problema contable, no existencia— pero NO se
 * esconden.
 */
export function rankingEspecies(porEspecie: ReadonlyArray<EspecieSaldo>): FilaRanking[] {
  const totalSaldo = porEspecie.reduce((a, e) => a + Math.max(0, e.saldoM3), 0);
  return [...porEspecie]
    .map((e) => ({
      ...e,
      pct: totalSaldo > EPS ? r2((Math.max(0, e.saldoM3) / totalSaldo) * 100) : 0,
    }))
    .sort((a, b) => b.saldoM3 - a.saldoM3 || a.especie.localeCompare(b.especie, "es"));
}

export interface RebanadaSaldo {
  name: string;
  value: number;
  /** Cuántas especies representa (>1 sólo en la rebanada «Otras»). */
  especies: number;
}

/**
 * Composición del patio para una dona, con cola agrupada.
 *
 * Más de seis rebanadas es un anillo de tiras ilegibles: de la séptima en
 * adelante entran a «Otras», que dice cuántas son para que nadie crea que
 * desaparecieron.
 */
export function composicionSaldo(
  porEspecie: ReadonlyArray<EspecieSaldo>,
  max = 6,
): RebanadaSaldo[] {
  const positivos = porEspecie
    .filter((e) => e.saldoM3 > EPS)
    .sort((a, b) => b.saldoM3 - a.saldoM3);
  if (positivos.length <= max) {
    return positivos.map((e) => ({ name: e.especie, value: r2(e.saldoM3), especies: 1 }));
  }
  const cabeza = positivos.slice(0, max - 1);
  const cola = positivos.slice(max - 1);
  return [
    ...cabeza.map((e) => ({ name: e.especie, value: r2(e.saldoM3), especies: 1 })),
    {
      name: "Otras",
      value: r2(cola.reduce((a, e) => a + e.saldoM3, 0)),
      especies: cola.length,
    },
  ];
}

export interface BucketAntiguedad {
  clave: "fresca" | "atencion" | "riesgo";
  label: string;
  /** m³ sin consumir en el tramo. */
  m3: number;
  /** Guías en el tramo. */
  guias: number;
  /** Valor inmovilizado; `null` si NINGUNA guía del tramo tiene costo. */
  valor: number | null;
  /** `true` si alguna guía del tramo no tiene costo cargado. */
  valorParcial: boolean;
}

export interface GuiaEnPatio {
  dias: number;
  disponible: number;
  costoUnitario: number | null;
}

/**
 * Reparte el patio en tres tramos de antigüedad.
 *
 * Los cortes (30 / 60 días) son los de `CtpPatioAging` y salen de la práctica:
 * la troza tropical parada empieza a mancharse alrededor del mes y a los dos
 * meses el riesgo de insectos y rajaduras es alto. El valor se reporta parcial
 * en vez de completarse con ceros: una guía sin factura vale «no sé», no «S/ 0».
 */
export function bucketsAntiguedad(
  guias: ReadonlyArray<GuiaEnPatio>,
  diasAtencion = 30,
  diasRiesgo = 60,
): BucketAntiguedad[] {
  const def: { clave: BucketAntiguedad["clave"]; label: string; test: (d: number) => boolean }[] = [
    { clave: "fresca", label: `Hasta ${diasAtencion} días`, test: (d) => d <= diasAtencion },
    {
      clave: "atencion",
      label: `${diasAtencion + 1}–${diasRiesgo} días`,
      test: (d) => d > diasAtencion && d <= diasRiesgo,
    },
    { clave: "riesgo", label: `Más de ${diasRiesgo} días`, test: (d) => d > diasRiesgo },
  ];

  return def.map(({ clave, label, test }) => {
    const dentro = guias.filter((g) => test(g.dias));
    const conCosto = dentro.filter((g) => g.costoUnitario != null);
    return {
      clave,
      label,
      m3: r2(dentro.reduce((a, g) => a + g.disponible, 0)),
      guias: dentro.length,
      valor: conCosto.length
        ? r2(conCosto.reduce((a, g) => a + g.disponible * (g.costoUnitario ?? 0), 0))
        : null,
      valorParcial: conCosto.length > 0 && conCosto.length < dentro.length,
    };
  });
}
