/**
 * anexo04-cuadre.ts — «me pasé por 0,003 m³: ¿qué medida muevo?»
 *
 * El caso real (Brandon, 2026-09-09): en el ANEXO N° 04 se declara a mano un
 * VOLUMEN TOTAL —el que ampara la guía— y la suma de las piezas cae 0,003 /
 * 0,004 / 0,005 m³ por encima o por debajo. Hasta ahora la pantalla sólo
 * avisaba de la diferencia; cerrarla era tantear medidas a ojo en la hoja hasta
 * que el total diera.
 *
 * Esto responde la pregunta que sigue: **qué escuadría tocar y hasta cuánto**.
 * Una medida por vez, en la unidad que se imprime (E y A en pulgadas, L en
 * pies), y diciendo lo que queda después de aplicarla — nunca «ya cuadra» sin
 * mostrarlo.
 *
 * ## Cómo sale el número
 *
 * El pie tablar es lineal en cada dimensión: `PT = E" × A" × L' ÷ 12 × cant`.
 * Para que la pieza aporte `m³ + Δ` hace falta `PT × (m³+Δ)/m³`, y como sólo se
 * mueve una dimensión, la nueva medida es la actual escalada por esa razón.
 *
 * Pero el anexo imprime **2 decimales** en la medida y el m³ sale del PT ya
 * redondeado (`cubicarPieza`): la medida ideal casi nunca cae justo. Así que la
 * ideal se redondea y se prueban también sus vecinas de a 0,01 — se recalcula
 * el total ENTERO con `cubicarPieza`, igual que lo hará la hoja, y se elige la
 * que menos resto deja. El resto se muestra siempre: cerrar 0,003 dejando 0,001
 * es válido, mentir que quedó en cero no.
 *
 * PURO: sin DOM, sin React. Lo consume `Anexo04Cuadre`.
 */
import { cubicarPieza, toFeet, toInches, type PiezaCubicada, type Unidad } from "./cubicacion";

/** Las tres dimensiones que el anexo imprime (la cantidad no se toca acá). */
export type DimensionAnexo = "espesor" | "ancho" | "largo";

/** Bajo esto el anexo ya cuadra: media milésima no se imprime. */
export const TOL_CUADRE_M3 = 0.0005;

/** Cuánto se deja mover una medida antes de que deje de ser un ajuste. */
const CAMBIO_MAX_PCT = 50;

/**
 * Con qué grilla se propone la medida nueva.
 *
 * · `exacta` — de a 0,01, que es lo que imprime la hoja: cierra el total al
 *   milímetro cúbico, aunque «10,04 pies» no sea un largo que alguien pida.
 * · `real` — como corta la sierra: **cuartos de pulgada** en escuadría y medios
 *   pies en el largo (Brandon, 2026-09-09). Casi nunca cierra exacto —el salto
 *   más chico de una 6×6 es ~0,03 m³, diez veces una diferencia de milésimas—
 *   así que sirve cuando la diferencia es grande, y cuando no llega se dice.
 */
export type ModoCuadre = "exacta" | "real";

const PASO: Record<ModoCuadre, Record<DimensionAnexo, number>> = {
  exacta: { espesor: 0.01, ancho: 0.01, largo: 0.01 },
  real: { espesor: 0.25, ancho: 0.25, largo: 0.5 },
};

export const DIMENSION_ANEXO: Record<DimensionAnexo, { etiqueta: string; unidad: string; corta: string }> = {
  espesor: { etiqueta: "(7) Espesor", unidad: "pulg", corta: "E" },
  ancho: { etiqueta: "(8) Ancho", unidad: "pulg", corta: "A" },
  largo: { etiqueta: "(9) Largo", unidad: "pies", corta: "L" },
};

/** Una fila del anexo, como se lee en la hoja. */
export interface FilaCuadre {
  id: string;
  /** "2×8×10" en las unidades impresas. */
  medida: string;
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  m3: number;
}

/** Una medida movida y lo que deja el movimiento. */
export interface AjusteCuadre {
  id: string;
  medida: string;
  cantidad: number;
  campo: DimensionAnexo;
  /** Valor impreso hoy (pulgadas o pies). */
  actual: number;
  /** Valor que haría cuadrar el total, ya redondeado a lo que imprime la hoja. */
  sugerido: number;
  /** Total del anexo si se aplica. */
  totalM3: number;
  /**
   * Lo que seguiría sobrando (+) o faltando (−) después de aplicarlo. Cero
   * exacto es lo normal en diferencias de milésimas; cuando no lo es, se dice.
   */
  restaM3: number;
  /** Cuánto se movió la medida, en % — para preferir el ajuste más chico. */
  cambioPct: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** «2×8×10», «6×6×10,04» — coma decimal, como se escribe la medida en el papel. */
function etiquetaMedida(e: number, a: number, l: number): string {
  const n = (v: number) => String(r2(v)).replace(".", ",");
  return `${n(e)}×${n(a)}×${n(l)}`;
}

/** El valor IMPRESO de una dimensión: E/A en pulgadas, L en pies. */
function valorImpreso(p: PiezaCubicada, campo: DimensionAnexo): number {
  if (campo === "largo") return r2(toFeet(p.largo, p.uLargo));
  return r2(toInches(campo === "espesor" ? p.espesor : p.ancho, (campo === "espesor" ? p.uEspesor : p.uAncho) as Unidad));
}

/** La pieza con una dimensión cambiada, en la unidad que imprime el anexo. */
function conMedida(p: PiezaCubicada, campo: DimensionAnexo, valor: number): PiezaCubicada {
  const base = {
    ...p,
    espesor: toInches(p.espesor, p.uEspesor),
    ancho: toInches(p.ancho, p.uAncho),
    largo: toFeet(p.largo, p.uLargo),
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    [campo]: valor,
  };
  const { pieTablar, m3 } = cubicarPieza(base);
  return { ...base, pieTablar, m3 };
}

/** Total del anexo tal como lo calcula `construirAnexo04`: suma de m³, a 3 decimales. */
export function totalCalculado(filas: readonly PiezaCubicada[]): number {
  return r3(filas.reduce((a, r) => a + r.m3, 0));
}

/** Las filas candidatas a moverse, de mayor a menor volumen. */
export function filasDeCuadre(filas: readonly PiezaCubicada[]): FilaCuadre[] {
  return filas
    .filter((r) => (r.cantidad ?? 0) > 0 && r.m3 > 0)
    .map((r) => {
      const e = valorImpreso(r, "espesor");
      const a = valorImpreso(r, "ancho");
      const l = valorImpreso(r, "largo");
      return {
        id: r.id,
        medida: etiquetaMedida(e, a, l),
        cantidad: r.cantidad,
        espesor: e,
        ancho: a,
        largo: l,
        m3: r.m3,
      };
    })
    .sort((x, y) => y.m3 - x.m3);
}

/**
 * Qué medidas moverían el total hasta `objetivoM3`, una por vez.
 *
 * Devuelve como mucho un ajuste por (fila × dimensión), ordenados por el resto
 * que dejan y, a igual resto, por el cambio más chico: mover un largo de 10 a
 * 10,08 es un ajuste; de 10 a 6 es otra madera.
 */
export function ajustesParaCuadrar(
  filas: readonly PiezaCubicada[],
  objetivoM3: number,
  opts: { soloId?: string; modo?: ModoCuadre } = {},
): AjusteCuadre[] {
  const paso = PASO[opts.modo ?? "exacta"];
  const total = totalCalculado(filas);
  const delta = r3(objetivoM3 - total);
  if (!Number.isFinite(delta) || Math.abs(delta) < TOL_CUADRE_M3) return [];

  /* La suma de las OTRAS piezas se calcula una vez: cada candidata sólo cambia
     la suya. Sin esto, un lote de 300 filas recalcula 300 sumas por tecla. */
  const sumaTotal = filas.reduce((a, r) => a + r.m3, 0);
  const out: AjusteCuadre[] = [];

  for (const p of filas) {
    if (opts.soloId && p.id !== opts.soloId) continue;
    if (!((p.cantidad ?? 0) > 0) || !(p.m3 > 0)) continue;
    const resto = sumaTotal - p.m3;
    const medida = etiquetaMedida(valorImpreso(p, "espesor"), valorImpreso(p, "ancho"), valorImpreso(p, "largo"));

    for (const campo of ["espesor", "ancho", "largo"] as DimensionAnexo[]) {
      const actual = valorImpreso(p, campo);
      if (!(actual > 0)) continue;
      /* Escalar la dimensión en la misma proporción que el volumen que se le
         pide: el PT es lineal en E, en A y en L. */
      const ideal = actual * ((p.m3 + delta) / p.m3);
      if (!(ideal > 0)) continue;

      const grano = paso[campo];
      let mejor: AjusteCuadre | null = null;
      /* La ideal cae entre dos valores de la grilla: se prueban ésos y sus
         vecinos, y gana el que menos resto deja. Con `grano` 0,01 es la hoja;
         con 0,25 / 0,5 es lo que la sierra sabe cortar. */
      for (const salto of [0, 1, -1, 2, -2]) {
        const sugerido = r2(Math.round(ideal / grano) * grano + salto * grano);
        if (!(sugerido > 0) || sugerido === actual) continue;
        const cambioPct = Math.abs((sugerido - actual) / actual) * 100;
        if (cambioPct > CAMBIO_MAX_PCT) continue;
        const nuevaTotal = r3(resto + conMedida(p, campo, sugerido).m3);
        const restaM3 = r3(nuevaTotal - objetivoM3);
        /* Sólo sirve si acerca: un «ajuste» que deja más diferencia que la que
           había es ruido en una lista que se lee para decidir. */
        if (Math.abs(restaM3) >= Math.abs(delta)) continue;
        const cand: AjusteCuadre = {
          id: p.id, medida, cantidad: p.cantidad, campo,
          actual, sugerido, totalM3: nuevaTotal, restaM3, cambioPct: Math.round(cambioPct * 10) / 10,
        };
        if (!mejor || Math.abs(cand.restaM3) < Math.abs(mejor.restaM3) - 1e-9) mejor = cand;
      }
      if (mejor) out.push(mejor);
    }
  }

  return out.sort(
    (a, b) => Math.abs(a.restaM3) - Math.abs(b.restaM3) || a.cambioPct - b.cambioPct,
  );
}

/**
 * Cuánto mueve el volumen UN paso de la grilla en esa medida.
 *
 * Es lo que hay que decir cuando el modo «medidas reales» no llega: no es que
 * no haya solución, es que el escalón más chico que la sierra sabe cortar
 * (¼ de pulgada) mueve más m³ que la diferencia que se quiere tapar.
 */
export function saltoMinimoM3(
  fila: PiezaCubicada,
  campo: DimensionAnexo,
  modo: ModoCuadre = "real",
): number {
  const actual = valorImpreso(fila, campo);
  if (!(actual > 0)) return 0;
  const grano = PASO[modo][campo];
  return r3(Math.abs(conMedida(fila, campo, r2(actual + grano)).m3 - fila.m3));
}

/** Un plan: varias medidas movidas, en orden, hasta llegar al objetivo. */
export interface PlanDeCuadre {
  pasos: AjusteCuadre[];
  /** Total del anexo con TODOS los pasos aplicados. */
  totalM3: number;
  /** Lo que sigue sobrando (+) o faltando (−) al final del plan. */
  restaM3: number;
}

/**
 * Reparte la diferencia entre varias medidas en vez de cargarla toda en una.
 *
 * Por qué: tapar 0,050 m³ moviendo una sola tabla la deforma más que repartirlo
 * entre varias (Brandon, 2026-09-09).
 *
 * ## El reparto es PROPORCIONAL al volumen, no en partes iguales
 *
 * Medido al escribir el test: con partes iguales, repartir entre 3 daba un
 * cambio máximo del **5,5 %** contra el **2,8 %** de mover una sola medida — la
 * fila chica absorbía lo mismo que la grande y se deformaba el triple. Con cada
 * fila absorbiendo `Δ × m³ᵢ / Σm³`, todas se mueven el MISMO porcentaje
 * (`Δ / Σm³`), que por construcción es menor o igual al de cualquier fila sola.
 * Repartir sólo tiene sentido si deforma menos; si no, es tocar tres medidas
 * para nada.
 *
 * Cada paso se calcula sobre el anexo YA ajustado por los anteriores: por eso
 * se re-invoca `ajustesParaCuadrar` con las filas de trabajo, y no se suman
 * tres cálculos hechos sobre el mismo estado inicial. La última fila apunta al
 * objetivo COMPLETO, así el redondeo de las anteriores no queda colgado.
 */
export function planDeCuadre(
  filas: readonly PiezaCubicada[],
  objetivoM3: number,
  opts: { medidas: number; modo?: ModoCuadre } = { medidas: 2 },
): PlanDeCuadre | null {
  const cuantas = Math.max(1, Math.floor(opts.medidas));
  const candidatas = filasDeCuadre(filas).slice(0, cuantas);
  if (candidatas.length === 0) return null;
  /* La proporción de cada fila sobre el volumen que se reparte: es lo que hace
     que todas se muevan el mismo %. */
  const suma = candidatas.reduce((a, c) => a + c.m3, 0);
  if (!(suma > 0)) return null;

  let trabajo = [...filas];
  const pasos: AjusteCuadre[] = [];
  const deltaTotal = objetivoM3 - totalCalculado(trabajo);
  for (const [i, c] of candidatas.entries()) {
    const ultima = i === candidatas.length - 1;
    const total = totalCalculado(trabajo);
    const restante = objetivoM3 - total;
    if (Math.abs(restante) < TOL_CUADRE_M3) break;
    /* La última apunta al objetivo entero; las anteriores a su parte proporcional. */
    const objetivoPaso = ultima ? objetivoM3 : r3(total + deltaTotal * (c.m3 / suma));
    const [mejor] = ajustesParaCuadrar(trabajo, objetivoPaso, { soloId: c.id, modo: opts.modo });
    if (!mejor) continue;
    trabajo = trabajo.map((r) => (r.id === mejor.id ? conMedida(r, mejor.campo, mejor.sugerido) : r));
    /* El resto de cada paso se mide contra el objetivo FINAL, no contra la
       parte que le tocaba: si no, el primer paso diría «cuadra exacto» con dos
       medidas todavía por mover. */
    const acumulado = totalCalculado(trabajo);
    pasos.push({ ...mejor, totalM3: acumulado, restaM3: r3(acumulado - objetivoM3) });
  }

  if (pasos.length === 0) return null;
  const totalM3 = totalCalculado(trabajo);
  return { pasos, totalM3, restaM3: r3(totalM3 - objetivoM3) };
}
