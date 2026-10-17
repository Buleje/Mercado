/**
 * edad-del-patio — hace cuánto que esa madera no se mueve.
 *
 * Medido en el patio de Blas (2026-09-15): un paquete lleva **331 días** parado
 * (3,814 m³), otros dos llevan 95, veinticuatro llevan 45 (77,875 m³) y seis
 * llevan 5. La pestaña «Productos disponibles» no muestra ni la fecha ni los
 * días: el operador ve el stock como si todo hubiera entrado ayer.
 *
 * Y la antigüedad es plata: la madera aserrada parada se mancha (hongo azul),
 * se tuerce y se raja. Un paquete de casi un año en el patio ya no vale lo que
 * dice la tabla; lo primero que hay que aserrar, vender o mover es lo viejo.
 * Por eso el tramo se muestra con tono —no es un dato más de la fila, es una
 * decisión de despacho.
 *
 * PURO: la hora entra por parámetro (`ahora`). Sin `Date.now()` adentro — un
 * módulo que lee el reloj no se puede testear, ni congelar en un reporte que
 * dos personas tienen que ver igual.
 */

/** Los tres estados en los que el patio mira un paquete. */
export type TramoEdad = "fresco" | "maduro" | "viejo";

/**
 * Un mes parado todavía es operación normal: la madera se estaciona, se espera
 * al camión, se junta pedido. A partir de acá empieza a ser una decisión.
 */
export const DIAS_MADURO = 30;

/**
 * Tres meses es el punto donde en la selva ya se ve la mancha. Pasado esto el
 * paquete no es stock, es un problema con fecha.
 */
export const DIAS_VIEJO = 90;

/** Para pintar la leyenda en el orden en que se degrada la madera. */
export const TRAMOS_EDAD: readonly TramoEdad[] = ["fresco", "maduro", "viejo"];

/**
 * El día calendario UTC de una fecha del libro.
 *
 * Las fechas del libro son date-only (`2026-08-01` = medianoche UTC) y así se
 * leen en todos lados (`ctp-ingresos-csv` las formatea con `timeZone:"UTC"`):
 * restarlas en hora local corre un día según la hora a la que se mire.
 */
const diaUtc = (v: string | Date): number | null => {
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
};

/** El día que es HOY en la planta. Lima es UTC−5: a las 8 de la noche ya es el
 *  día siguiente en UTC, y sin esto toda la columna sumaba un día al anochecer. */
const DIA_EN_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `ahora` es un INSTANTE real (el reloj de la planta), no una fecha del libro:
 * por eso se lee en el calendario de Lima y no en UTC.
 *
 * Ojo al pasarlo: `new Date()` es lo correcto. `new Date("2026-09-15")` NO es
 * «hoy 15», es la medianoche UTC del 15 = las 19:00 del 14 en Lima, y da un día
 * de menos. Para fijar un día en un test, pasa la hora: `2026-09-15T12:00:00-05:00`.
 */
const diaDeHoy = (ahora: Date): number | null => {
  const t = ahora instanceof Date ? ahora.getTime() : Number.NaN;
  if (!Number.isFinite(t)) return null;
  return diaUtc(DIA_EN_LIMA.format(ahora));
};

/** Suma de m³ del patio: se redondea UNA vez, al final. Redondear en cada paso
 *  arrastra el error fila por fila y el total no cuadra con la columna. */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Cuántos días lleva parada esa madera. `null` cuando no hay fecha utilizable.
 *
 * Nunca negativo: una fecha futura (un dedazo al cargar, o una corrida fechada
 * mañana) da 0 — «recién movida». Un «hace −12 días» en la columna de un patio
 * no significa nada y hace desconfiar de toda la tabla.
 */
export function edadEnDias(fechaISO: string | null | undefined, ahora: Date): number | null {
  if (fechaISO == null || (typeof fechaISO === "string" && fechaISO.trim() === "")) return null;
  const desde = diaUtc(fechaISO);
  const hasta = diaDeHoy(ahora);
  if (desde == null || hasta == null) return null;
  return Math.max(0, hasta - desde);
}

/**
 * En qué tramo cae esa cantidad de días.
 *
 * El borde se mide con `>`, no con `>=`: **exactamente 30 días es «fresco»** y
 * **exactamente 90 es «maduro»**. Las etiquetas que ve el operador dicen «Hasta
 * 30 días» y «30 a 90 días», así que el día del umbral pertenece al tramo de
 * abajo. Si el rojo se prendiera justo al cumplir los 90, el paquete cambiaría
 * de color el mismo día que la etiqueta todavía lo incluye en el tramo previo:
 * un aviso que se contradice con su propio texto se aprende a ignorar.
 */
export function tramoDeEdad(dias: number | null): TramoEdad | null {
  if (dias == null || !Number.isFinite(dias)) return null;
  if (dias > DIAS_VIEJO) return "viejo";
  if (dias > DIAS_MADURO) return "maduro";
  return "fresco";
}

/** El texto del tramo: dice el rango, no un adjetivo suelto. «Viejo» no se
 *  puede discutir; «Más de 90 días» sí se puede verificar contra la fecha. */
export const ETIQUETA_TRAMO: Record<TramoEdad, string> = {
  fresco: "Hasta 30 días",
  maduro: "30 a 90 días",
  viejo: "Más de 90 días",
};

/** Tono del DS por tramo (`--data-success/warning/error`). Verde no es «bueno»
 *  en abstracto: es «esta madera todavía está en su ventana». */
export const TONO_TRAMO: Record<TramoEdad, "success" | "warning" | "danger"> = {
  fresco: "success",
  maduro: "warning",
  viejo: "danger",
};

/** Lo mínimo de una fila del stock para poder resumir la edad del patio. */
export interface FilaConEdad {
  dias: number | null;
  volumenM3: number;
}

export interface ResumenEdad {
  porTramo: Record<TramoEdad, { filas: number; volumenM3: number }>;
  /**
   * Las filas que no se pudieron fechar. Van aparte y NO se reparten entre los
   * tramos: meterlas en «fresco» pintaría de verde madera que puede llevar un
   * año. Un dato ausente se muestra como ausente.
   */
  sinFecha: { filas: number; volumenM3: number };
  /** El récord del patio, para el titular. `null` si nada tiene fecha. */
  masViejoDias: number | null;
}

/**
 * Cuánto hay en cada tramo — en filas y, sobre todo, en m³.
 *
 * Las dos cifras juntas a propósito: «24 paquetes viejos» y «77,875 m³ viejos»
 * mueven decisiones distintas. Veinticuatro paquetes chicos se mueven en una
 * tarde; 77 m³ son dos camiones.
 */
export function resumenDeEdad(filas: readonly FilaConEdad[]): ResumenEdad {
  const acc: Record<TramoEdad, { filas: number; volumenM3: number }> = {
    fresco: { filas: 0, volumenM3: 0 },
    maduro: { filas: 0, volumenM3: 0 },
    viejo: { filas: 0, volumenM3: 0 },
  };
  const sinFecha = { filas: 0, volumenM3: 0 };
  let masViejoDias: number | null = null;

  for (const f of filas) {
    const vol = Number.isFinite(f.volumenM3) ? f.volumenM3 : 0;
    const tramo = tramoDeEdad(f.dias);
    const destino = tramo == null ? sinFecha : acc[tramo];
    destino.filas += 1;
    destino.volumenM3 += vol;
    if (f.dias != null && Number.isFinite(f.dias) && (masViejoDias == null || f.dias > masViejoDias)) {
      masViejoDias = f.dias;
    }
  }

  for (const t of TRAMOS_EDAD) acc[t].volumenM3 = r4(acc[t].volumenM3);
  sinFecha.volumenM3 = r4(sinFecha.volumenM3);

  return { porTramo: acc, sinFecha, masViejoDias };
}

/**
 * Cómo se lee la edad en la celda: «hace 45 días», «hace 1 día», «hoy», «—».
 *
 * En castellano y en singular cuando corresponde. El guion (no «0 días», no
 * «null») para lo que no tiene fecha: una celda vacía se lee como «no sé», que
 * es exactamente lo que pasa.
 */
export function fmtEdad(dias: number | null): string {
  if (dias == null || !Number.isFinite(dias)) return "—";
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  return `hace ${dias} días`;
}
