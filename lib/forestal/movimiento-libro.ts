/**
 * movimiento-libro.ts — todo lo que se movió en el libro, por cubo de tiempo.
 *
 * El LO-CTP tiene cuatro secciones y hasta ahora cada una se miraba en su propia
 * pestaña: entraba madera en Ingresos, se gastaba en Consumos, salía producto en
 * Producción y se despachaba en Despacho. Nadie mostraba **las cuatro juntas en
 * el tiempo**, que es la única forma de ver si la planta está tragando más de lo
 * que saca, o al revés.
 *
 * Este módulo es PURO: recibe los movimientos crudos y arma el eje. Lo usan el
 * tablero de Control y la curva de saldo, que tienen que estar de acuerdo en
 * dónde empieza cada semana — dos ejes distintos para el mismo período hacen que
 * dos gráficos de la misma pantalla se contradigan.
 *
 * Nada de `Date.now()` acá adentro: el "hoy" se pasa desde afuera para que los
 * tests no dependan del día en que corren.
 */

export type PasoEje = "dia" | "semana" | "mes";

/** Tope duro de puntos: con «mes», 30 años dan 360. Más que eso es data corrupta. */
export const MAX_PUNTOS = 400;

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const DIA_MS = 86_400_000;

/**
 * Qué granularidad aguanta el eje.
 *
 * Los cortes salen de cuántas barras se leen sin apretujarse: hasta ~4 meses van
 * días; hasta 2 años, semanas; después, meses.
 */
export function pasoParaSpan(dias: number): PasoEje {
  return dias <= 120 ? "dia" : dias <= 730 ? "semana" : "mes";
}

/**
 * Lo mismo, pero para gráficos de BARRAS.
 *
 * Una línea aguanta 120 puntos; una barra, no: el trimestre daba **67 barras
 * diarias** apretadas contra el eje, ilegibles, y la mayoría en cero porque un
 * aserradero no asierra todos los días. Con semanas, el mismo trimestre son 14
 * barras que se leen.
 *
 * Los cubos siguen empezando donde dice `inicioDeCubo`, así que el tablero y la
 * curva de saldo no se contradicen: cambia cuántos cubos, no dónde cortan.
 */
export function pasoParaBarras(dias: number): PasoEje {
  return dias <= 45 ? "dia" : dias <= 400 ? "semana" : "mes";
}

/** El comienzo del cubo que contiene a `d`. La semana arranca LUNES. */
export function inicioDeCubo(d: Date, paso: PasoEje): Date {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (paso === "mes") return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), 1));
  if (paso === "semana") {
    u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7));
    return u;
  }
  return u;
}

export function avanzarCubo(d: Date, paso: PasoEje): Date {
  const n = new Date(d.getTime());
  if (paso === "mes") n.setUTCMonth(n.getUTCMonth() + 1);
  else n.setUTCDate(n.getUTCDate() + (paso === "semana" ? 7 : 1));
  return n;
}

/** Las claves `YYYY-MM-DD` de todos los cubos entre dos fechas, ambas incluidas. */
export function construirEje(desde: Date, hasta: Date, paso: PasoEje): string[] {
  const claves: string[] = [];
  const fin = inicioDeCubo(hasta, paso).getTime();
  for (
    let c = inicioDeCubo(desde, paso);
    c.getTime() <= fin && claves.length < MAX_PUNTOS;
    c = avanzarCubo(c, paso)
  ) {
    claves.push(c.toISOString().slice(0, 10));
  }
  return claves;
}

// ── El movimiento ───────────────────────────────────────────────────────────

/** Un ingreso de materia prima (Sección 1). */
export interface MovIngreso {
  fecha: Date;
  volumenM3: number;
  especie?: string | null;
  piezas?: number | null;
}

/** Una corrida: consume rolliza (Sección 2) y declara producto (Sección 3). */
export interface MovCorrida {
  fecha: Date;
  consumidoM3: number;
  producido: number;
  /**
   * La unidad en que la corrida DECLARA lo producido (`m3`, `pt`, `unidad`…).
   *
   * Es lo que decide si esa corrida puede entrar al rendimiento: dividir pies
   * tablares por metros cúbicos da un porcentaje que parece un dato y no lo es.
   * Medido en el tenant de pruebas: el tablero mostraba **146 %** de rendimiento,
   * que en un aserradero es físicamente imposible.
   */
  unidad?: string | null;
  especie?: string | null;
}

/** Una salida (Sección 4). */
export interface MovDespacho {
  fecha: Date;
  cantidad: number;
  especie?: string | null;
}

export interface PuntoMovimiento {
  /** Inicio del cubo, `YYYY-MM-DD`. */
  fecha: string;
  ingresoM3: number;
  consumoM3: number;
  producido: number;
  despachado: number;
  /** Ponderado por el consumo DEL CUBO, no promedio simple de corridas. */
  rendimiento: number;
}

export interface TotalesMovimiento {
  ingresoM3: number;
  consumoM3: number;
  producido: number;
  despachado: number;
  /** Ponderado por consumo sobre todo el período. Sólo corridas en m³. */
  rendimiento: number;
  /** Cuántas corridas quedaron fuera del rendimiento por declarar en otra unidad. */
  corridasOtraUnidad: number;
  /** `ingreso − consumo`: lo que el patio acumuló (o soltó) en el período. */
  variacionPatioM3: number;
  /**
   * Lo que HAY en el patio al cierre del período: `apertura + variación`.
   *
   * No es lo mismo que `variacionPatioM3` y confundirlos es el error clásico:
   * proyectar «días de materia prima» sobre la variación daba 408 días en un
   * patio que sólo acumuló 57 m³ ese trimestre. El stock es el stock.
   */
  saldoPatioM3: number;
}

export interface EspecieMovimiento {
  especie: string;
  ingresoM3: number;
  consumoM3: number;
}

export interface MovimientoDelLibro {
  paso: PasoEje;
  puntos: PuntoMovimiento[];
  totales: TotalesMovimiento;
  porEspecie: EspecieMovimiento[];
  /** Se cortó el eje por el tope: se DICE, no se recorta en silencio. */
  truncado: boolean;
}

const nombreEspecie = (v: string | null | undefined) => (v ?? "").trim() || "Sin especie";

/**
 * Arma el eje y reparte los movimientos.
 *
 * `desde`/`hasta` acotan el eje aunque no haya movimientos: un mes sin ingresos
 * tiene que verse VACÍO, no desaparecer. Es la diferencia entre «no entró
 * madera» y «no hay datos», y son cosas distintas para un fiscalizador.
 */
export function agruparMovimiento(input: {
  ingresos: readonly MovIngreso[];
  corridas: readonly MovCorrida[];
  despachos: readonly MovDespacho[];
  desde: Date;
  hasta: Date;
  /** Forzar la granularidad; por defecto sale del largo del período. */
  paso?: PasoEje;
  /** Lo que ya había en el patio al abrir el período. */
  aperturaM3?: number;
}): MovimientoDelLibro {
  const span = Math.floor((input.hasta.getTime() - input.desde.getTime()) / DIA_MS) + 1;
  const paso = input.paso ?? pasoParaSpan(Math.max(span, 1));
  const eje = construirEje(input.desde, input.hasta, paso);
  const truncado = eje.length >= MAX_PUNTOS;

  const cubos = new Map<
    string,
    { ingresoM3: number; consumoM3: number; producido: number; despachado: number; rendW: number; rendPeso: number }
  >();
  for (const k of eje) {
    cubos.set(k, { ingresoM3: 0, consumoM3: 0, producido: 0, despachado: 0, rendW: 0, rendPeso: 0 });
  }
  const cuboDe = (d: Date) => cubos.get(inicioDeCubo(d, paso).toISOString().slice(0, 10));

  const especies = new Map<string, EspecieMovimiento>();
  const sumarEspecie = (nombre: string, campo: "ingresoM3" | "consumoM3", v: number) => {
    if (!(v > 0)) return;
    const fila = especies.get(nombre) ?? { especie: nombre, ingresoM3: 0, consumoM3: 0 };
    fila[campo] = r4(fila[campo] + v);
    especies.set(nombre, fila);
  };

  for (const i of input.ingresos) {
    const b = cuboDe(i.fecha);
    const v = Number(i.volumenM3 ?? 0);
    if (b) b.ingresoM3 += v;
    sumarEspecie(nombreEspecie(i.especie), "ingresoM3", v);
  }
  let corridasOtraUnidad = 0;
  let m3Producido = 0;
  let m3Consumido = 0;
  for (const c of input.corridas) {
    const b = cuboDe(c.fecha);
    const cons = Number(c.consumidoM3 ?? 0);
    const prod = Number(c.producido ?? 0);
    /* Sin unidad declarada se asume m³: es el default del libro y los ingresos
       viejos no la traen. Lo que NO se hace es mezclar pt con m³. */
    const enM3 = (c.unidad ?? "m3").trim().toLowerCase() === "m3";
    if (!enM3 && prod > 0) corridasOtraUnidad += 1;
    if (enM3 && cons > 0 && prod > 0) { m3Producido += prod; m3Consumido += cons; }
    if (b) {
      b.consumoM3 += cons;
      b.producido += prod;
      /* El rendimiento se pondera por el consumo REAL de cada corrida y se
         recalcula desde producido/consumido: tomar el `rendimientoPct` guardado
         mezclaría corridas de unidades distintas. Sólo entran las que tienen
         los dos números — una corrida abierta (consumió y no declaró) bajaría el
         rendimiento del turno con producción que todavía no se contó. */
      if (cons > 0 && prod > 0 && enM3) {
        b.rendW += (prod / cons) * 100 * cons;
        b.rendPeso += cons;
      }
    }
    sumarEspecie(nombreEspecie(c.especie), "consumoM3", cons);
  }
  for (const d of input.despachos) {
    const b = cuboDe(d.fecha);
    if (b) b.despachado += Number(d.cantidad ?? 0);
  }

  const puntos: PuntoMovimiento[] = eje.map((fecha) => {
    const b = cubos.get(fecha)!;
    return {
      fecha,
      ingresoM3: r4(b.ingresoM3),
      consumoM3: r4(b.consumoM3),
      producido: r4(b.producido),
      despachado: r4(b.despachado),
      rendimiento: b.rendPeso > 0 ? Math.round((b.rendW / b.rendPeso) * 10) / 10 : 0,
    };
  });

  const sum = (k: keyof PuntoMovimiento) => r4(puntos.reduce((a, p) => a + Number(p[k]), 0));
  const consumoTotal = sum("consumoM3");
  const producidoTotal = sum("producido");
  const ingresoTotal = sum("ingresoM3");

  return {
    paso,
    puntos,
    truncado,
    totales: {
      ingresoM3: ingresoTotal,
      consumoM3: consumoTotal,
      producido: producidoTotal,
      despachado: sum("despachado"),
      /* El rendimiento del período sale SÓLO de las corridas en m³ — no de
         `producido/consumido` global, que sumaría pies tablares al numerador. */
      rendimiento: m3Consumido > 0 ? Math.round((m3Producido / m3Consumido) * 1000) / 10 : 0,
      corridasOtraUnidad,
      variacionPatioM3: r4(ingresoTotal - consumoTotal),
      saldoPatioM3: r4((input.aperturaM3 ?? 0) + ingresoTotal - consumoTotal),
    },
    porEspecie: [...especies.values()].sort((a, b) => b.ingresoM3 + b.consumoM3 - (a.ingresoM3 + a.consumoM3)),
  };
}

/**
 * Cómo se lee un número contra el período anterior.
 *
 * `null` cuando antes era CERO: «+∞ %» no es una lectura, es un artefacto de
 * dividir por cero, y en un libro forestal el primer mes siempre lo dispara.
 */
export function variacionPct(actual: number, previo: number): number | null {
  if (!(previo > 0)) return null;
  return Math.round(((actual - previo) / previo) * 1000) / 10;
}

/** Etiqueta corta del cubo para el eje del gráfico. */
export function etiquetaDeCubo(fecha: string, paso: PasoEje): string {
  const [a, m, d] = fecha.split("-");
  if (paso === "mes") {
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
    return `${meses[Number(m) - 1] ?? m} ${a.slice(2)}`;
  }
  // Día y semana comparten formato: la semana se rotula por su lunes.
  return `${d}/${m}`;
}

/**
 * La misma serie, ACUMULADA. Contesta la pregunta que la barra por cubo no
 * puede: *¿la sierra viene alcanzando a lo que entra, o me estoy quedando
 * atrás?* Dos curvas que se separan son un patio que crece; dos que se juntan,
 * uno que se vacía.
 *
 * `patio` arranca en `apertura` (lo que ya había) y suma ingreso − consumo. Sin
 * apertura queda relativo al inicio del período y **se dice**, porque un saldo
 * que empieza en cero cuando el patio tenía madera es un número falso.
 */
export interface PuntoAcumulado {
  fecha: string;
  ingresoAcum: number;
  consumoAcum: number;
  patio: number;
}

export function acumular(
  puntos: readonly PuntoMovimiento[],
  apertura = 0,
): PuntoAcumulado[] {
  let ing = 0;
  let con = 0;
  return puntos.map((p) => {
    ing = r4(ing + p.ingresoM3);
    con = r4(con + p.consumoM3);
    return { fecha: p.fecha, ingresoAcum: ing, consumoAcum: con, patio: r4(apertura + ing - con) };
  });
}

/**
 * Cuántos días de materia prima quedan al ritmo del período.
 *
 * Es un DERIVADO, no un dato del libro: se calcula con el consumo promedio de
 * los días que se miran y no sabe de feriados ni de un pedido grande la semana
 * que viene. `null` cuando no se consumió nada — dividir por cero daría
 * «infinitos días de madera», que suena bien y no significa nada.
 */
export function diasDeMateriaPrima(
  saldoM3: number,
  consumoM3: number,
  diasDelPeriodo: number,
): number | null {
  if (!(consumoM3 > 0) || !(diasDelPeriodo > 0) || !(saldoM3 > 0)) return null;
  const porDia = consumoM3 / diasDelPeriodo;
  return Math.round((saldoM3 / porDia) * 10) / 10;
}
