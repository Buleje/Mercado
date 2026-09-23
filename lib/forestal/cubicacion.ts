/**
 * cubicacion.ts — cubicación de madera aserrada (pie tablar + m³) y parser de
 * dictado por voz en español. PURO y client-safe (sin prisma, sin fetch): se
 * importa en el componente y es testeable de forma aislada.
 *
 * Convención peruana de comercio de madera aserrada:
 *   - Espesor y ancho se miden en PULGADAS, el largo en PIES.
 *   - Unidad de venta = PIE TABLAR (PT): PT = (espesor" × ancho" × largo_pies) / 12.
 *   - 1 m³ = 424 PT (factor comercial de la plaza — ver `PT_POR_M3`).
 */

export type Unidad = "pulg" | "cm" | "pies" | "m";

export interface PiezaCubicada {
  id: string;
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  especie?: string;
  /**
   * De quién es esta madera. Un mismo lote puede cubicar piezas de VARIOS
   * dueños a la vez (aserrío por encargo) — sin esto quedaban mezcladas y no
   * había forma de separar después qué le corresponde a cada uno.
   */
  dueno?: string;
  /**
   * La ficha del Directorio de ese dueño, cuando se eligió de ahí (ADR-430):
   * con ella el cubicador pone el precio de su trato. Los lotes guardados
   * antes sólo traen `dueno` (texto) y siguen valiendo igual: sin ficha, el
   * precio es el de a mano.
   */
  duenoParteId?: string;
  /**
   * Código de la troza de la que salió, tipeado o elegido del patio. Sólo lo
   * pone «Producir sin lote» y es INTERNO (Brandon, 2026-09-14): no se manda al
   * servidor, no agrupa en `unificarPorMedida`, no se declara ni consume la
   * troza — ver `lib/forestal/codigo-de-troza.ts`.
   */
  codigo?: string;
  /**
   * Tipo comercial forzado a mano. `undefined` = lo decide la medida
   * (`clasificarTipo`). Se lee SIEMPRE por `tipoDePieza`, nunca directo: es lo
   * que mantiene la pantalla, el Excel y el Anexo 04 diciendo lo mismo.
   */
  tipo?: import("./cubicacion-tipo").TipoComercial;
  /** Pie tablar total (ya multiplicado por cantidad). */
  pieTablar: number;
  /** m³ total (ya multiplicado por cantidad). */
  m3: number;
}

/**
 * **1 m³ = 424 pie tablar.** Decisión de Brandon (2026-09-02), reafirmada:
 * «1 m³ equivale a 424, así aplicalo; en PT, dividir el PT / 424».
 *
 * Es el factor con el que se compra y se vende madera en la selva peruana. La
 * conversión FÍSICA exacta es otra —un pie tablar son 144 pulg³ y la pulgada
 * 0.0254 m, así que darían 423.776— pero acá manda la convención comercial: el
 * papel, el comprador y el libro tienen que decir el mismo número, y ese número
 * es el que se usa en la plaza.
 *
 * La diferencia contra el factor físico es de 0.05 % (6 PT cada 30 m³). Lo que
 * NO se puede tener es las dos a la vez: hasta hoy este archivo decía 423.78 y
 * `loctp-catalogos.ts` decía 424, y por eso dos pantallas del mismo libro no
 * cuadraban entre sí. Ahora hay una sola, acá, y todo el módulo la importa.
 */
export const PT_POR_M3 = 424;
export const M3_POR_PT = 1 / PT_POR_M3;

/**
 * Pie tablar APROXIMADO que rendiría un volumen de madera ROLLIZA al pasar por
 * la sierra (Brandon, 2026-09-01): no es la conversión directa (`PT_POR_M3`,
 * que es para volumen YA aserrado) — es una estimación de cuánto saldría
 * aserrado, usando el tope de rendimiento del 56 % (`RENDIMIENTO_META`,
 * `loctp-catalogos.ts`) como aproximación. Se muestra siempre etiquetado como
 * "aprox."/"aserrable": es un derivado, no el dato real (que sale de declarar
 * la corrida en Producción).
 */
export function pieTablarAserrableDe(m3Rolliza: number, rendimientoMeta: number): number {
  return Math.round(m3Rolliza * rendimientoMeta * PT_POR_M3);
}

/** Especies comerciales de la Selva Central — single-source para todas las
 *  herramientas forestales (cubicadores, calculadoras). */
export const ESPECIES_MADERA = [
  "Tornillo", "Cedro", "Capirona", "Shihuahuaco", "Cumala", "Moena",
  "Estoraque", "Lupuna", "Bolaina", "Catahua", "Copaiba", "Ishpingo", "Caoba", "Marupá",
] as const;

// ─── Conversiones de longitud ───────────────────────────────────────────────
export const toInches = (v: number, u: Unidad): number =>
  u === "pulg" ? v : u === "cm" ? v / 2.54 : u === "m" ? v * 39.3700787 : v * 12;
export const toFeet = (v: number, u: Unidad): number =>
  u === "pies" ? v : u === "pulg" ? v / 12 : u === "m" ? v * 3.2808399 : v / 30.48;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Cubica una pieza: pie tablar y m³ TOTALES (× cantidad).
 *
 * El PT sale de la fórmula comercial —espesor" × ancho" × largo_pies ÷ 12— y el
 * **m³ sale del PT**, dividiendo por 424 (Brandon, 2026-09-02: «en PT, dividir
 * el PT / 424, eso aplicalo ahí»).
 *
 * Antes el m³ se calculaba aparte, multiplicando las medidas pasadas a metros:
 * el volumen geométrico. Eran dos caminos independientes, y por eso las dos
 * columnas de una misma fila nunca cerraban exactamente al dividirlas a mano —
 * caían sobre 423.776, no sobre el 424 con el que se compra la madera. Con el
 * m³ derivado del PT, la tabla cierra con la cuenta que se hace en la plaza:
 * **m³ × 424 = PT**, y al revés, siempre.
 */
export function cubicarPieza(p: {
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
}): { pieTablar: number; m3: number } {
  const espPulg = toInches(p.espesor, p.uEspesor);
  const anchoPulg = toInches(p.ancho, p.uAncho);
  const largoPies = toFeet(p.largo, p.uLargo);
  const ptUnit = (espPulg * anchoPulg * largoPies) / 12;
  const cant = p.cantidad > 0 ? p.cantidad : 1;
  /* El PT se redondea PRIMERO y el m³ se deriva de ese PT ya redondeado: así el
     número que se ve en la columna de al lado es exactamente el que hay que
     dividir por 424 para llegar al m³ que se ve. Derivarlo del PT crudo dejaría
     filas donde `PT ÷ 424` no da el m³ que muestra la pantalla. */
  const pieTablar = r2(ptUnit * cant);
  return { pieTablar, m3: r4(pieTablar / PT_POR_M3) };
}

/** m³ a partir del pie tablar — la conversión comercial, en un solo lugar. */
export const m3DesdePt = (pt: number): number => r4(pt / PT_POR_M3);

/**
 * Pie tablar a partir del m³ — la vuelta exacta de `m3DesdePt`.
 *
 * Se usa donde la pantalla sólo tiene el volumen (los agregados del reparto: lo
 * que un bloque ampara, lo que sale de un reproceso) y la madera igual se lee
 * en pie tablar, que es como se compra y se vende (Brandon, 2026-09-09: «PT es
 * la multiplicación del volumen m³ por 424»).
 *
 * Redondea el m³ a TRES decimales antes de multiplicar, que es como se imprime
 * (`fmtM3`): así el PT de la pantalla es exactamente el que da la cuenta hecha a
 * mano con el número de al lado. Sin eso, un bloque con 1.6495 m³ mostraba
 * «1.650 m³» y «699 PT», y 1.650 × 424 da 700 — un PT de diferencia que no se
 * puede explicar mirando la fila (medido 2026-09-09).
 *
 * ⚠️ Donde EXISTA el pie tablar medido (`PiezaCubicada.pieTablar`,
 * `AsignacionMedida.pieTablar`) se usa ESE: el m³ sale del PT, no al revés, y
 * derivarlo de vuelta arrastraría el redondeo de tres decimales del volumen.
 */
export const ptDesdeM3 = (m3: number): number => r2(r3(m3) * PT_POR_M3);

/**
 * Vuelve a cubicar una lista de piezas GUARDADAS, desde sus medidas.
 *
 * POR QUÉ EXISTE: el `pieTablar`/`m3` viaja guardado (localStorage del lote
 * activo, cubicaciones en la DB, Excel importado). Un lote medido antes de que
 * el m³ pasara a derivarse del pie tablar sigue trayendo el volumen geométrico
 * —13.026 PT guardados como 30,738 m³ en vez de 30,722— y el total de la
 * pantalla suma ese número viejo sin recalcularlo (Brandon, 2026-09-01). Al
 * hidratar SIEMPRE se re-cubica: las medidas son el dato, el volumen es
 * derivado, y ningún archivo viejo puede volver a contradecir la fórmula.
 *
 * Devuelve el MISMO array si nada cambió, para no invalidar memos ni disparar
 * un guardado inútil.
 */
export function recubicarPiezas<T extends PiezaCubicada>(piezas: T[]): T[] {
  let cambio = false;
  const next = piezas.map((p) => {
    const { pieTablar, m3 } = cubicarPieza(p);
    if (pieTablar === p.pieTablar && m3 === p.m3) return p;
    cambio = true;
    return { ...p, pieTablar, m3 };
  });
  return cambio ? next : piezas;
}

/**
 * Junta piezas de la MISMA medida (especie + tipo + dueño + espesor×ancho×largo,
 * en la MISMA unidad) en una sola fila, sumando cantidad/pieTablar/m³.
 *
 * Nace de un Anexo 04 CONJUNTO (Brandon, 2026-09-02): dos bloques de rolliza
 * distinta pueden haber cortado la MISMA medida —15 piezas de 6×6×2 en uno,
 * 12 en el otro—, y el papel tiene que declarar 27 en una sola fila, no la
 * misma medida repetida dos veces. `pieTablar`/`m3` ya vienen `cantidad ×
 * unitario`: sumarlos es exacto, no hace falta volver a cubicar. El dueño va
 * en la clave para no mezclar la madera de dos encargos aunque coincida la
 * medida — cada uno sigue en su propia fila.
 */
export function unificarPorMedida(piezas: PiezaCubicada[]): PiezaCubicada[] {
  const mapa = new Map<string, PiezaCubicada>();
  for (const p of piezas) {
    const clave = [p.especie ?? "", p.tipo ?? "", p.dueno ?? "", p.duenoParteId ?? "", p.espesor, p.uEspesor, p.ancho, p.uAncho, p.largo, p.uLargo].join("|");
    const acc = mapa.get(clave);
    if (acc) {
      acc.cantidad += p.cantidad;
      acc.pieTablar = r2(acc.pieTablar + p.pieTablar);
      acc.m3 = r4(acc.m3 + p.m3);
    } else {
      /* El código de la troza NO va en la clave (es interno del cubicado,
         Brandon 2026-09-14) y tampoco sobrevive a la unión: una fila que junta
         piezas de varias trozas no puede quedarse con el código de la primera. */
      const { codigo: _codigo, ...sinCodigo } = p;
      mapa.set(clave, { ...sinCodigo });
    }
  }
  return [...mapa.values()];
}

// ─── Parser de dictado por voz ──────────────────────────────────────────────

const ONES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90,
};

/**
 * Centenas. Hacen falta para la CANTIDAD de piezas —«ciento veinte piezas de
 * dos por ocho»—, no para las medidas: no existe una tabla de 120 pulgadas.
 * Se componen con lo que ya hay: «doscientos cincuenta y cinco» → 255.
 *
 * «mil» queda afuera a propósito: la cantidad se topea en 999 (`leerDictado`)
 * y un número de cuatro cifras en un dictado casi siempre es un pegado
 * («2810» = 2·8·10), no mil.
 */
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
  trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500,
  quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700,
  setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900,
  novecientas: 900,
};

/**
 * Lo que el motor es-PE escribe cuando el cubicador dicta desde el patio.
 *
 * Son errores SISTEMÁTICOS del reconocedor (seseo y «h» de más), no errores
 * del que habla: la palabra caía fuera de `ONES` y la medida se perdía en
 * SILENCIO — «sais por hocho por dies» devolvía cero números.
 *
 * Regla para agregar una: la variante NO puede ser una palabra española de
 * verdad ni chocar con una especie o un comando. Por eso quedan afuera
 * «siento» (→ciento: es el verbo sentir), «dias» (→diez: son fechas) y
 * «para» (→por: es el gatillo de pausar; se resuelve aparte, sólo cuando cae
 * entre dos números). Los acentos no hacen falta acá: «dós» ya llega sin
 * tilde porque `normalizeText` pasa antes por `stripAccents`.
 */
const HOMOFONOS: Record<string, string> = {
  sais: "seis", dies: "diez", hocho: "ocho", onse: "once", catorse: "catorce",
  dose: "doce", trese: "trece", quinse: "quince",
};

/**
 * Fracciones de pulgada, por su DENOMINADOR. En aserrío se dicta todo el
 * tiempo «dos y medio por ocho» o «tres cuartos»: perder esa media pulgada de
 * espesor en una tabla es perder ~6 % del volumen declarado.
 */
const FRACCIONES: Record<string, number> = {
  medio: 2, media: 2, medios: 2, medias: 2,
  tercio: 3, tercios: 3,
  cuarto: 4, cuartos: 4,
  octavo: 8, octavos: 8,
};
const NOMBRES_FRACCION = Object.keys(FRACCIONES).join("|");

/**
 * Resuelve las fracciones habladas, ya con los enteros en dígitos:
 *   «2 y 3 cuartos» → 2.75 · «1 y cuarto» → 1.25 · «3 cuartos» → 0.75 ·
 *   «media pulgada» → 0.5.
 *
 * Corre DESPUÉS de `wordsToDigits`, y por eso no choca con el «y» de las
 * decenas: «treinta y cinco» ya se resolvió a «35» antes de llegar acá. El
 * «y» que queda sólo une un entero con una fracción.
 *
 * La fracción SUELTA sin numerador se acepta únicamente para medio/media: un
 * «cuarto» solo es un ambiente de la casa más seguido que una medida, y
 * fabricar un 0.25 de la nada mete un número que nadie dictó.
 */
function resolverFracciones(s: string): string {
  const den = (w: string) => FRACCIONES[w];
  // "N y M cuartos" → N + M/den
  s = s.replace(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s+y\\s+(\\d+)\\s+(${NOMBRES_FRACCION})\\b`, "g"),
    (_m, entero: string, num: string, w: string) => String(r3(Number(entero) + Number(num) / den(w))),
  );
  // "N y medio" / "N y cuarto" → N + 1/den
  s = s.replace(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s+y\\s+(${NOMBRES_FRACCION})\\b`, "g"),
    (_m, entero: string, w: string) => String(r3(Number(entero) + 1 / den(w))),
  );
  // Fracción suelta CON numerador: "tres cuartos" → 0.75, "un cuarto" → 0.25.
  // El lookbehind evita comerse el decimal de "2.5 cuartos".
  s = s.replace(
    new RegExp(`(?<![\\d.])(\\d+)\\s+(${NOMBRES_FRACCION})\\b`, "g"),
    (_m, num: string, w: string) => String(r3(Number(num) / den(w))),
  );
  // "media pulgada" → 0.5 (única fracción que se acepta sin numerador).
  s = s.replace(/\bmedi[oa]s?\b/g, "0.5");
  return s;
}

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Convierte palabras-número a dígitos resolviendo los compuestos del
 * castellano: "treinta y cinco" → 35, "ciento veinte" → 120,
 * "doscientos cincuenta" → 250.
 */
function wordsToDigits(text: string): string {
  // `HOMOFONOS` primero: lo que el motor escribió mal nunca va a estar en las
  // tablas, y un número que no se reconoce se pierde sin avisar.
  const tokens = text.split(/\s+/).map((t) => HOMOFONOS[t] ?? t);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in CENTENAS) {
      // Centena + decena [+ "y" + unidad] o centena + unidad:
      // "ciento veinte" → 120 · "doscientos cincuenta y cinco" → 255 ·
      // "ciento cinco" → 105. Sola ("cien piezas") vale la centena pelada.
      let valor = CENTENAS[t];
      if (tokens[i + 1] in TENS) {
        valor += TENS[tokens[i + 1]];
        i += 1;
        if (tokens[i + 1] === "y" && tokens[i + 2] in ONES && ONES[tokens[i + 2]] < 10) {
          valor += ONES[tokens[i + 2]];
          i += 2;
        }
      } else if (tokens[i + 1] in ONES && ONES[tokens[i + 1]] > 0) {
        valor += ONES[tokens[i + 1]];
        i += 1;
      }
      out.push(String(valor));
    } else if (t in TENS) {
      // "treinta y cinco" → 35 (consume 3 tokens); "treinta" solo → 30.
      if (tokens[i + 1] === "y" && tokens[i + 2] in ONES && ONES[tokens[i + 2]] < 10) {
        out.push(String(TENS[t] + ONES[tokens[i + 2]]));
        i += 2;
      } else {
        out.push(String(TENS[t]));
      }
    } else if (t in ONES) {
      out.push(String(ONES[t]));
    } else {
      out.push(t);
    }
  }
  return out.join(" ");
}

export interface DictadoParse {
  ok: boolean;
  cantidad: number;
  espesor: number | null;
  ancho: number | null;
  largo: number | null;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  especie?: string;
  raw: string;
}

/**
 * Interpreta un dictado como "cinco piezas de dos por ocho por diez" o
 * "espesor 2 ancho 8 largo 3 metros". Default de unidades: espesor y ancho en
 * pulgadas, largo en pies (convención peruana). Devuelve ok=false si no logra
 * extraer las 3 dimensiones — el UI cae al ingreso manual.
 */
/**
 * Normaliza un dictado a texto con dígitos: acentos fuera, separadores a "por",
 * palabras-número a dígitos y decimales hablados ("dos punto cinco" → 2.5).
 * Base compartida por parseDictado / mejoresNumeros / parseVozLote.
 */
function normalizeText(input: string): string {
  let s = " " + stripAccents(input.toLowerCase()) + " ";
  // Puntuación pegada a la palabra ("once," sin espacio antes de la coma) rompe
  // `wordsToDigits`, que tokeniza por espacios: "once," no matchea "once" en la
  // tabla y el número se pierde en silencio. Un transcript de Whisper puntúa así
  // de memoria — se neutraliza ANTES de tokenizar. La "coma" hablada (decimal
  // peruano, "dos coma cinco") es la PALABRA "coma", no este carácter: no choca.
  s = s.replace(/[,;:]+/g, " ");
  s = wordsToDigits(s);
  s = normalizarSeparadores(s);
  s = s.replace(/(\d+)\s+(?:punto|coma)\s+(\d+)/g, "$1.$2");
  s = resolverFracciones(s);
  return s;
}

/**
 * Deja UNA sola forma del separador de medidas: la palabra " por ".
 *
 * El reconocedor lo escribe de cuatro maneras según cómo se habló —"por",
 * "x" suelta, "×" y la "x" PEGADA a los dígitos ("2x8x10")— y además
 * confunde el "por" hablado con "para" (bug de campo conocido: dictar una
 * medida frenaba el trabajo porque "para" es gatillo de pausar). Ese arreglo
 * sólo aplica ENTRE DOS NÚMEROS: "para" dicho solo sigue siendo el comando.
 *
 * Unificarlo no es cosmético: el separador es la señal de dónde termina cada
 * medida, y con esa señal `mejoresNumeros` deja de partir números que el
 * hablante ya delimitó.
 */
function normalizarSeparadores(s: string): string {
  s = s.replace(/\s[x×*]\s/g, " por ");
  s = s.replace(/(\d)\s*[x×*]\s*(?=\d)/g, "$1 por ");
  s = s.replace(/(\d)\s+para\s+(?=\d)/g, "$1 por ");
  return s;
}

export function parseDictado(input: string): DictadoParse {
  const s = normalizeText(input);

  const num = (re: RegExp): number | null => {
    const m = s.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  // Cantidad explícita: "5 piezas / tablas / tablones / listones / unidades".
  const cantMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:piezas?|tablas?|tablones?|listones?|unidades?|pzas?|pz)\b/);
  const cantidad = cantMatch ? Math.max(1, Math.round(parseFloat(cantMatch[1]))) : 1;

  // Dimensiones con etiqueta explícita.
  let espesor = num(/(?:espesor|grueso|grosor)\s+(?:de\s+)?(\d+(?:\.\d+)?)/);
  let ancho = num(/\bancho\s+(?:de\s+)?(\d+(?:\.\d+)?)/);
  let largo = num(/(?:largo|longitud|long)\s+(?:de\s+)?(\d+(?:\.\d+)?)/);

  // Sin etiquetas: tomar la secuencia de números (excluyendo la cantidad).
  if (espesor == null || ancho == null || largo == null) {
    let pool = s;
    if (cantMatch) pool = pool.replace(cantMatch[0], " ");
    const nums = (pool.match(/\d+(?:\.\d+)?/g) ?? []).map(parseFloat);
    if (nums.length >= 3) {
      const dims = nums.slice(-3); // las últimas 3 = E × A × L
      espesor = espesor ?? dims[0];
      ancho = ancho ?? dims[1];
      largo = largo ?? dims[2];
    }
  }

  // Unidades: default pulg/pulg/pies; overrides por palabra clave.
  let uEspesor: Unidad = "pulg", uAncho: Unidad = "pulg", uLargo: Unidad = "pies";
  if (/\bcent[i]metros?\b|\bcm\b/.test(s)) { uEspesor = "cm"; uAncho = "cm"; }
  if (/\bmetros?\b|\bmts?\b/.test(s)) uLargo = "m";
  if (/\bpies?\b/.test(s)) uLargo = "pies";

  const especieMatch = s.match(/especie\s+([a-z]+)/);
  const especie = especieMatch ? especieMatch[1] : undefined;

  const ok = espesor != null && ancho != null && largo != null && espesor > 0 && ancho > 0 && largo > 0;
  return { ok, cantidad, espesor, ancho, largo, uEspesor, uAncho, uLargo, especie, raw: input };
}

/**
 * Modo "3 números seguidos" para el dictado continuo (espesor · ancho · largo).
 * Recibe las N alternativas que devuelve el reconocedor y elige la que mejor
 * parsea. Si el reconocedor pegó tres dígitos ("dos seis ocho" → "268"), lo
 * separa como fallback. Pensado para dictar solo los números, sin "por".
 */
export function parseVozDims(alternativas: string[]): DictadoParse {
  const alts = alternativas.filter(Boolean);
  // 1) La primera alternativa que dé 3 dimensiones válidas gana.
  for (const a of alts) {
    const p = parseDictado(a);
    if (p.ok) return p;
  }
  // 2) Fallback: un único token de 3 dígitos 1-9 pegados (dos seis ocho → 268).
  for (const a of alts) {
    const nums = a.match(/\d+/g);
    if (nums && nums.length === 1 && /^[1-9]{3}$/.test(nums[0])) {
      const d = nums[0].split("").map(Number);
      return { ok: true, cantidad: 1, espesor: d[0], ancho: d[1], largo: d[2], uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", raw: a };
    }
  }
  return parseDictado(alts[0] ?? "");
}

/**
 * Extrae los números del dictado RESPETANDO EL ORDEN. Confía en la hipótesis
 * #1 del reconocedor (alt[0], la más probable — nunca reordena los dígitos que
 * dictaste); solo cae a otras alternativas si la #1 no trae ningún número. Así
 * evita el bug de "dos seis nueve" → 9,6,2 (elegir una alternativa peor y
 * reordenada solo por tener más números). Si la #1 pegó 3 dígitos ("269"), los
 * separa a 2,6,9 manteniendo el orden dictado.
 */
/**
 * Rangos reales del comercio de madera aserrada peruana. Sirven para dos cosas:
 * separar dígitos pegados eligiendo la lectura POSIBLE, y avisar cuando una
 * medida dictada quedó rara (nunca se corrige sola: se marca).
 */
export const RANGOS_MEDIDA = {
  // Media pulgada es un espesor REAL (se dicta "media" o "tres cuartos"): con
  // el mínimo en 1 toda tabla fraccionada salía marcada como rara, y una lista
  // de rojos falsos enseña a ignorar la lista entera. No cambia nada del
  // separador de dígitos pegados: de ahí nunca sale un valor entre 0.5 y 1.
  espesor: { min: 0.5, max: 12 },  // pulgadas
  ancho: { min: 1, max: 30 },     // pulgadas
  largo: { min: 2, max: 30 },     // pies
} as const;

/** ¿Esta medida cae fuera de lo que se ve en un aserradero? */
export function medidaSospechosa(espesor: number, ancho: number, largo: number): boolean {
  const fuera = (v: number, r: { min: number; max: number }) => !(v >= r.min && v <= r.max);
  return (
    fuera(espesor, RANGOS_MEDIDA.espesor) ||
    fuera(ancho, RANGOS_MEDIDA.ancho) ||
    fuera(largo, RANGOS_MEDIDA.largo) ||
    // Una tabla más gruesa que ancha casi siempre es un dictado dado vuelta.
    espesor > ancho
  );
}

/** ¿Este valor es creíble para esta dimensión? (rangos del aserrío) */
function valorPlausible(valor: number, dim: Dimension): boolean {
  const r = RANGOS_MEDIDA[dim];
  return valor >= r.min && valor <= r.max;
}

/**
 * Separa un token de dígitos PEGADOS por dictar rápido ("2810" = 2·8·10).
 *
 * POR QUÉ ES ASÍ DE CUIDADOSO: el reconocedor pega los números cuando se
 * habla rápido, y dónde cortarlos depende de QUÉ MEDIDA toca. Con el largo
 * fijo se dictan dos números y "dos quince" llega como "215": cortarlo con
 * una regla de tres números daba 2·1·5 — una tabla de 1 pulgada de ancho y
 * un 5 huérfano que corría todo el dictado siguiente.
 *
 * Acá se prueban las particiones posibles asignando cada número a la
 * dimensión que le toca (ciclando por las que NO están fijas) y validando el
 * rango real de esa dimensión. Gana la lectura que completa piezas enteras y
 * usa menos números; si ninguna cierra, se devuelven los dígitos como vinieron
 * — ante la duda no se inventa una medida.
 *
 * @param libres dimensiones que hay que dictar, en orden.
 * @param desde  posición del ciclo en la que arranca este token.
 */
function separarPegados(s: string, libres: readonly Dimension[] = DIMENSIONES, desde = 0): number[] {
  const paso = libres.length || 1;
  const soluciones: number[][] = [];

  const explorar = (pos: number, ciclo: number, acc: number[]) => {
    if (soluciones.length >= 24) return;          // tope de seguridad
    if (pos === s.length) { soluciones.push([...acc]); return; }
    for (const largoCorte of [1, 2]) {
      if (pos + largoCorte > s.length) continue;
      const trozo = s.slice(pos, pos + largoCorte);
      if (largoCorte === 2 && trozo[0] === "0") continue; // "05" no es 5
      const valor = Number(trozo);
      if (!(valor > 0)) continue;
      if (!valorPlausible(valor, libres[ciclo % paso])) continue;
      acc.push(valor);
      explorar(pos + largoCorte, ciclo + 1, acc);
      acc.pop();
    }
  };
  explorar(0, desde, []);

  if (soluciones.length > 0) {
    // Preferimos la lectura que deja piezas COMPLETAS (cantidad múltiplo del
    // paso, contando lo que ya venía del ciclo) y, entre esas, la más corta:
    // el reconocedor pega números, no los inventa de a uno.
    const puntaje = (sol: number[]) => ((desde + sol.length) % paso === 0 ? 0 : 1);
    soluciones.sort((a, b) => puntaje(a) - puntaje(b) || a.length - b.length);
    return soluciones[0];
  }

  // Sin lectura plausible: la regla vieja (X0 junto, el resto suelto).
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 1 < s.length && s[i] >= "1" && s[i] <= "4" && s[i + 1] === "0") {
      out.push(Number(s.slice(i, i + 2))); i += 2; // 10/20/30/40
    } else {
      out.push(Number(s[i])); i += 1;
    }
  }
  return out.filter((n) => n > 0);
}

/**
 * Una escuadría completa, en el orden en que se dicta: espesor · ancho · largo
 * (pulgadas · pulgadas · pies, la unidad del dictado).
 */
export type Escuadria = readonly [espesor: number, ancho: number, largo: number];

/**
 * Ajustes opcionales de la lectura. Todo lo de acá SÓLO DESEMPATA: nunca le
 * gana a una hipótesis con más números en rango y nunca reemplaza un número
 * por otro. Ante la duda, lo que se devuelve es lo que se escuchó.
 */
export interface OpcionesLectura {
  /**
   * Escuadrías que este aserradero ya cortó, de la más repetida a la menos
   * (la lista la arma `escuadriasFrecuentes`). Una lectura que reproduce una medida
   * que el libro cortó veinte veces vale más que otra igual de plausible que
   * nadie cortó nunca.
   */
  frecuentes?: readonly Escuadria[];
}

/** Las formas en que el separador de medidas llega escrito (ver `normalizarSeparadores`). */
const SEPARADORES_MEDIDA = new Set(["por", "x", "×"]);
const esSeparador = (t: string | undefined) => t !== undefined && SEPARADORES_MEDIDA.has(t);
const empiezaConDigito = (t: string | undefined) => t !== undefined && /^\d/.test(t);

/** Lo que deja una hipótesis del reconocedor después de leerla. */
interface Lectura {
  /** Los números en el ORDEN dictado (nunca reordenados). */
  nums: number[];
  /** Cuántos "por" venían bien puestos: entre dos números. */
  separadores: number;
}

export function mejoresNumeros(
  alternativas: string[],
  fijas: MedidasFijas = {},
  yaDictados = 0,
  opciones: OpcionesLectura = {},
): number[] {
  const alts = alternativas.filter(Boolean);
  const libres = DIMENSIONES.filter((d) => !(typeof fijas[d] === "number" && fijas[d]! > 0));
  const ciclo = libres.length > 0 ? libres : DIMENSIONES;
  const frecuentes = opciones.frecuentes ?? [];

  // Números pegados por hablar rápido → separar sabiendo qué medida toca.
  // También los de DOS cifras: con el largo fijo, "dos ocho" llega como "28",
  // y 28 no es un espesor que exista — ahí hay dos medidas, no una. Si el
  // valor SÍ es creíble para la medida que toca (un ancho de 28"), se respeta.
  //
  // EXCEPCIÓN: un número de DOS cifras que vino delimitado por "por" no se
  // parte. Si el cubicador dijo "dos por treinta y cinco", ya marcó dónde
  // termina cada medida: partir ese 35 en 3 y 5 sería inventar una tabla que
  // nadie dictó (que el 35 sea raro lo avisa `medidaSospechosa`, que es lo
  // correcto). Con TRES o más cifras el delimitador no salva nada —no existe
  // una medida de 810—: ahí el motor se comió un "por" al pegar los dígitos
  // ("2 por 810" es 2·8·10) y hay que separarlos igual. Medido: sin esta
  // distinción, "2 por 810" devolvía [2, 810] y la pieza no entraba.
  const expandir = (a: string): Lectura => {
    const tokens = normalizeText(a).match(/\d+(?:\.\d+)?|[^\s\d]+/g) ?? [];
    const out: number[] = [];
    let separadores = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!empiezaConDigito(t)) {
        if (esSeparador(t) && empiezaConDigito(tokens[i - 1]) && empiezaConDigito(tokens[i + 1])) separadores++;
        continue;
      }
      const entero = /^\d+$/.test(t);
      const delimitado = esSeparador(tokens[i - 1]) || esSeparador(tokens[i + 1]);
      // La medida que toca depende de lo que YA se dictó, incluidos los
      // números sueltos que quedaron esperando de la frase anterior.
      const dimActual = ciclo[(yaDictados + out.length) % ciclo.length];
      const separable =
        entero && (t.length >= 3 || (t.length === 2 && !delimitado && !valorPlausible(Number(t), dimActual)));
      if (separable) out.push(...separarPegados(t, ciclo, yaDictados + out.length));
      else out.push(parseFloat(t));
    }
    return { nums: out, separadores };
  };

  // Cuántos números de la lectura caen en el rango de la medida que les toca:
  // sirve para elegir ENTRE hipótesis del reconocedor, nunca para reordenar
  // los números de una (eso volteaba las medidas dictadas).
  const puntaje = (nums: number[]) => {
    if (nums.length === 0) return -1;
    const ok = nums.filter((n, i) => valorPlausible(n, ciclo[(yaDictados + i) % ciclo.length])).length;
    const completa = (yaDictados + nums.length) % ciclo.length === 0 ? 0.5 : 0;
    return ok / nums.length + completa;
  };

  /**
   * Cuántas piezas de esta lectura son una escuadría que el libro YA cortó.
   * Sólo cuenta piezas COMPLETAS y alineadas al ciclo: si la frase arranca a
   * mitad de una pieza (quedaron números arrastrados de la anterior) no se
   * sabe qué escuadría forman, y devolver 0 es mejor que adivinar.
   */
  const conocidas = (nums: number[]) => {
    if (frecuentes.length === 0 || nums.length === 0) return 0;
    if (yaDictados % ciclo.length !== 0) return 0;
    const { piezas } = partirConFijas(nums, fijas);
    return piezas.filter((p) =>
      frecuentes.some((f) => f[0] === p.espesor && f[1] === p.ancho && f[2] === p.largo),
    ).length;
  };

  const lecturas = alts.map(expandir);
  if (lecturas.length === 0) return [];
  // Comparación por escalones, de más fuerte a más débil. Ante empate en TODOS
  // gana la hipótesis principal del motor (la #1): es la más probable y no
  // reordena lo que se dictó.
  let mejor = 0;
  for (let i = 1; i < lecturas.length; i++) {
    // 1) Plausibilidad: cuántos números caen en el rango de su medida.
    const dif = puntaje(lecturas[i].nums) - puntaje(lecturas[mejor].nums);
    if (dif > 0.001) { mejor = i; continue; }
    if (dif < -0.001) continue;
    // 2) Los "por" bien puestos: el hablante marcó dónde termina cada medida.
    const difSep = lecturas[i].separadores - lecturas[mejor].separadores;
    if (difSep > 0) { mejor = i; continue; }
    if (difSep < 0) continue;
    // 3) Lo que esta sierra ya cortó (sólo desempata, ver `conocidas`).
    if (conocidas(lecturas[i].nums) > conocidas(lecturas[mejor].nums)) mejor = i;
  }
  return lecturas[mejor].nums;
}

/** Lo mínimo que hace falta de una pieza para saber qué escuadría es. */
export type PiezaParaFrecuentes = Readonly<{
  espesor: number;
  ancho: number;
  largo: number;
  cantidad?: number;
  uEspesor?: Unidad;
  uAncho?: Unidad;
  uLargo?: Unidad;
}>;

/**
 * Las escuadrías que este aserradero MÁS cortó, listas para pasarle a
 * `mejoresNumeros({ frecuentes })`.
 *
 * Se pesa por CANTIDAD de piezas, no por filas: una fila de 200 tablas de
 * 2×8×10 dice más sobre lo que corta esta sierra que tres filas sueltas de
 * una pieza cada una. Quedan afuera las piezas dictadas en otra unidad (cm o
 * metros) y las que caen fuera de rango: una medida rara repetida no tiene que
 * enseñarle nada al reconocedor.
 *
 * Es PURA: recibe las piezas ya cubicadas y devuelve la lista; no toca red ni
 * base de datos.
 */
export function escuadriasFrecuentes(piezas: readonly PiezaParaFrecuentes[], top = 8): Escuadria[] {
  const conteo = new Map<string, { escuadria: Escuadria; piezas: number; orden: number }>();
  for (const p of piezas) {
    if ((p.uEspesor ?? "pulg") !== "pulg" || (p.uAncho ?? "pulg") !== "pulg") continue;
    if ((p.uLargo ?? "pies") !== "pies") continue;
    if (
      !valorPlausible(p.espesor, "espesor") ||
      !valorPlausible(p.ancho, "ancho") ||
      !valorPlausible(p.largo, "largo")
    ) continue;
    const clave = `${p.espesor}x${p.ancho}x${p.largo}`;
    const cuantas = Math.max(1, Math.round(p.cantidad ?? 1));
    const previo = conteo.get(clave);
    if (previo) previo.piezas += cuantas;
    else conteo.set(clave, { escuadria: [p.espesor, p.ancho, p.largo], piezas: cuantas, orden: conteo.size });
  }
  return [...conteo.values()]
    .sort((a, b) => b.piezas - a.piezas || a.orden - b.orden)
    .slice(0, Math.max(0, top))
    .map((e) => e.escuadria);
}

// ─── Comandos de voz ────────────────────────────────────────────────────────

/** Las tres dimensiones de una pieza, en el orden en que se dictan. */
export const DIMENSIONES = ["espesor", "ancho", "largo"] as const;
export type Dimension = (typeof DIMENSIONES)[number];

/** Medidas que quedan FIJAS: lo fijo no se dicta, se repite en cada pieza. */
export type MedidasFijas = Partial<Record<Dimension, number>>;

export type Comando =
  | { tipo: "pausar" }
  | { tipo: "continuar" }
  | { tipo: "borrar-ultimo" }
  | { tipo: "especie"; palabra: string }
  /** "dueño Juan" → asigna el dueño a lo que sigue (mismo mecanismo que especie). */
  | { tipo: "dueno"; palabra: string }
  /** "pon fijo el largo a cuatro" → el largo deja de dictarse. */
  | { tipo: "fijar"; dimension: Dimension; valor: number }
  /** "quita el fijo" (todo) o "quita el fijo del largo" (una sola). */
  | { tipo: "desfijar"; dimension?: Dimension }
  /** "muéstrame por especie" → cambia el agrupado del resumen (dim como string;
   * el componente la valida contra DIMENSIONES_RESUMEN). */
  | { tipo: "resumen"; dimension: string }
  /** "cuánto llevo" / "lee el total" → dice el total en voz. */
  | { tipo: "total" }
  | null;

/** Frases-gatillo por comando (editables desde Ajustes). especie = prefijos. */
export interface ComandosCfg {
  pausar: string[];
  continuar: string[];
  borrarUltimo: string[];
  especie: string[];
  fijar: string[];
  desfijar: string[];
  /** Opcionales: la config vieja guardada no los trae → fallback al default. */
  resumen?: string[];
  total?: string[];
  /** Prefijos de dueño ("dueño Juan"). Opcional por el mismo motivo. */
  dueno?: string[];
}
export const COMANDOS_DEFAULT: ComandosCfg = {
  pausar: ["pausa", "pausar", "para", "pare", "deten", "alto"],
  continuar: ["continua", "continuar", "reanuda", "sigue", "seguir", "dale", "adelante"],
  borrarUltimo: ["elimina el ultimo", "borra el ultimo", "quita el ultimo", "ultimo", "deshacer", "deshace", "borra eso"],
  especie: ["especie", "especies", "madera"],
  fijar: ["fijo", "fija", "fijar", "fijalo", "deja fijo"],
  desfijar: ["quita el fijo", "quitar fijo", "saca el fijo", "desfija", "desfijar", "libera", "liberar", "sin fijo", "todo libre"],
  resumen: ["resumen", "muestra", "muestrame", "agrupa", "agrupame", "agrupalo", "agrupar"],
  total: ["cuanto llevo", "cuanto va", "cuanto tengo", "lee el total", "leer el total", "dame el total", "dime el total", "el total"],
  dueno: ["dueño", "propietario"],
};

/** Sinónimos de cada dimensión del RESUMEN (agrupado hablado del lote). */
const PALABRAS_RESUMEN: Record<string, string[]> = {
  especie: ["especie", "especies"],
  dueno: ["dueño", "dueños", "propietario"],
  seccion: ["seccion", "secciones", "escuadria"],
  medida: ["medida completa", "medidas"],
  espesor: ["espesor", "grueso", "grosor"],
  ancho: ["ancho", "anchos", "anchura"],
  largo: ["largo", "largos", "longitud"],
};
/** Qué dimensión de resumen nombra la frase (la primera por posición). */
function dimensionResumenEn(s: string): string | undefined {
  let mejor: { dim: string; pos: number } | undefined;
  for (const dim of Object.keys(PALABRAS_RESUMEN)) {
    for (const w of PALABRAS_RESUMEN[dim]) {
      const pos = s.indexOf(` ${w}`);
      if (pos >= 0 && (!mejor || pos < mejor.pos)) mejor = { dim, pos };
    }
  }
  return mejor?.dim;
}

/** Sinónimos de cada dimensión, como los dice un maderero. */
const PALABRAS_DIMENSION: Record<Dimension, string[]> = {
  espesor: ["espesor", "grueso", "grosor"],
  ancho: ["ancho", "anchura"],
  largo: ["largo", "longitud", "long", "medida"],
};

/** Qué dimensión nombra la frase (la primera que aparezca). */
function dimensionEn(s: string): Dimension | undefined {
  let mejor: { dim: Dimension; pos: number } | undefined;
  for (const dim of DIMENSIONES) {
    for (const w of PALABRAS_DIMENSION[dim]) {
      const pos = s.indexOf(` ${w}`);
      if (pos >= 0 && (!mejor || pos < mejor.pos)) mejor = { dim, pos };
    }
  }
  return mejor?.dim;
}

const escRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Detecta un comando de voz en el dictado (pausar/continuar/borrar último/fijar
 * especie) según las frases configuradas. Si no hay comando, devuelve null y el
 * texto se trata como números.
 *
 * ⚠️ GUARD DE MEDIDAS (bug real de campo): el reconocedor confunde el "por" de
 * "dos POR ocho" con "para", que es gatillo de pausar — dictar una medida
 * frenaba el trabajo sin motivo. Y "alto" aparece hablando de madera. Regla:
 * una frase con DOS O MÁS números es un dictado de medidas, no un comando; los
 * comandos de verdad se dicen solos ("pausa", "continuá", "borrá el último").
 */
export function detectarComando(input: string, cfg: ComandosCfg = COMANDOS_DEFAULT): Comando {
  // `normalizeText` deja las palabras-número como dígitos: "pon fijo el largo
  // a cuatro" → "… largo a 4". Se usa para leer el valor a fijar.
  const conNumeros = " " + normalizeText(input) + " ";
  const s = " " + stripAccents(input.toLowerCase()) + " ";
  const numeros = (conNumeros.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

  const hitEn = (texto: string, list: string[]) =>
    list.some((w) => {
      const t = stripAccents(w.toLowerCase()).trim();
      return !!t && new RegExp(`(^|\\s)${escRe(t)}(\\s|$)`).test(texto);
    });

  // ── FIJAR / DESFIJAR ── (antes del guard de números: llevan uno propio)
  // Desfijar primero: "quita el fijo" contiene "fijo", que es gatillo de fijar.
  if (hitEn(conNumeros, cfg.desfijar)) {
    return { tipo: "desfijar", dimension: dimensionEn(conNumeros) };
  }
  if (hitEn(conNumeros, cfg.fijar) && numeros.length === 1) {
    const dimension = dimensionEn(conNumeros);
    const valor = numeros[0];
    if (dimension && valor > 0) return { tipo: "fijar", dimension, valor };
  }

  // Una frase con dos o más números es un dictado de medidas, no un comando.
  if (numeros.length >= 2) return null;
  const hit = (list: string[]) =>
    list.some((w) => { const t = stripAccents(w.toLowerCase()).trim(); return !!t && new RegExp(`(^|\\s)${escRe(t)}(\\s|$)`).test(s); });
  // RESUMEN hablado (antes de especie: "muéstrame por especie" trae el gatillo
  // de especie). Con gatillo pero sin dimensión → abre el resumen tal cual está.
  if (hit(cfg.resumen ?? COMANDOS_DEFAULT.resumen!)) {
    return { tipo: "resumen", dimension: dimensionResumenEn(s) ?? "" };
  }
  // TOTAL hablado ("cuánto llevo", "lee el total").
  if (hit(cfg.total ?? COMANDOS_DEFAULT.total!)) return { tipo: "total" };
  // Borrar primero (más específico), luego especie, luego pausar/continuar.
  if (hit(cfg.borrarUltimo)) return { tipo: "borrar-ultimo" };
  for (const pre of cfg.especie) {
    const t = stripAccents(pre.toLowerCase()).trim();
    if (!t) continue;
    const m = s.match(new RegExp(`${escRe(t)}\\s+(?:de\\s+|es\\s+)?([a-z]+)`));
    if (m) return { tipo: "especie", palabra: m[1] };
  }
  // DUEÑO ("dueño Juan", "propietario Pérez") — mismo patrón que especie, una
  // sola palabra: nombres compuestos se ponen mejor desde el selector.
  for (const pre of cfg.dueno ?? COMANDOS_DEFAULT.dueno!) {
    const t = stripAccents(pre.toLowerCase()).trim();
    if (!t) continue;
    const m = s.match(new RegExp(`${escRe(t)}\\s+(?:de\\s+|es\\s+)?([a-z]+)`));
    if (m) return { tipo: "dueno", palabra: m[1] };
  }
  if (hit(cfg.pausar)) return { tipo: "pausar" };
  if (hit(cfg.continuar)) return { tipo: "continuar" };
  return null;
}

/**
 * ¿Lo que acaba de escuchar el micrófono es SU PROPIA VOZ?
 *
 * En el patio se trabaja con el parlante del celular: el cubicador repite
 * "2, 6, 8" y el reconocedor lo escucha y lo vuelve a guardar — la pieza
 * entraba DOS veces. Se compara por los números (el reconocedor puntúa
 * distinto cada vez): misma secuencia = eco, no dictado nuevo.
 *
 * Sólo se usa dentro de la ventana en que el TTS estuvo hablando; fuera de
 * ella, repetir la misma medida a propósito sigue siendo válido.
 */
export function esEco(textoEscuchado: string, textoDicho: string): boolean {
  const nums = (t: string) => (normalizeText(t).match(/\d+(?:\.\d+)?/g) ?? []).join(",");
  const a = nums(textoEscuchado);
  return a !== "" && a === nums(textoDicho);
}

/**
 * Lee una frase del dictado continuo separando la CANTIDAD de las medidas.
 *
 * Antes, "cinco piezas de dos por ocho por diez" entraba como [5,2,8,10]: se
 * guardaba una pieza 5×2×8 y el 10 quedaba huérfano contaminando la frase
 * siguiente. Ahora el número pegado a "piezas/tablas/tablones/unidades" se
 * saca del pool y viaja como cantidad; sin esa palabra, todo son medidas.
 */
export function leerDictado(
  input: string | string[],
  fijas: MedidasFijas = {},
  yaDictados = 0,
  opciones: OpcionesLectura = {},
): { cantidad: number; nums: number[] } {
  const alts = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const s = normalizeText(alts[0] ?? "");
  const m = s.match(/(\d+)\s*(?:piezas?|tablas?|tablones?|listones?|unidades?|pzas?|pz)\b/);
  if (!m) return { cantidad: 1, nums: mejoresNumeros(alts, fijas, yaDictados, opciones) };
  const cantidad = Math.max(1, Math.min(999, Math.round(Number(m[1]))));
  // Se quita SOLO esa aparición; el resto de la frase sigue siendo medidas.
  const resto = s.replace(m[0], " ");
  return { cantidad, nums: mejoresNumeros([resto], fijas, yaDictados, opciones) };
}

/**
 * Dictado rápido: parte una lista de números en tríos (espesor·ancho·largo).
 * Devuelve todas las piezas completas y cuántos números quedaron sueltos (para
 * arrastrarlos a la siguiente frase). Ej.: [2,6,8, 2,8,10, 1] → 2 piezas, resto 1.
 */
export function partirEnPiezas(nums: number[]): { piezas: Array<{ espesor: number; ancho: number; largo: number }>; resto: number[] } {
  return partirConFijas(nums, {});
}

/** Cuántos números hay que dictar por pieza con estas medidas fijas. */
export function numerosPorPieza(fijas: MedidasFijas): number {
  return DIMENSIONES.filter((d) => !(typeof fijas[d] === "number" && fijas[d]! > 0)).length;
}

/**
 * Parte el dictado en piezas RESPETANDO las medidas fijas.
 *
 * Con el largo fijo en 4, un lote entero se dicta de a dos números: "dos ocho,
 * dos seis, dos diez" son tres tablas de 4 pies. Los números libres siguen el
 * orden natural espesor → ancho → largo, salteando lo que está fijo; el
 * sobrante se arrastra a la frase siguiente, como sin fijas.
 *
 * Con las tres fijas no queda nada que dictar: se devuelve todo como resto (el
 * operador tiene que soltar alguna) en vez de inventar piezas por cada número.
 */
export function partirConFijas(
  nums: number[],
  fijas: MedidasFijas,
): { piezas: Array<{ espesor: number; ancho: number; largo: number }>; resto: number[] } {
  const libres = DIMENSIONES.filter((d) => !(typeof fijas[d] === "number" && fijas[d]! > 0));
  const paso = libres.length;
  if (paso === 0) return { piezas: [], resto: nums };

  const piezas: Array<{ espesor: number; ancho: number; largo: number }> = [];
  let i = 0;
  for (; i + paso <= nums.length; i += paso) {
    const grupo = nums.slice(i, i + paso);
    if (grupo.some((n) => !(n > 0))) continue;
    const medidas: Record<Dimension, number> = {
      espesor: fijas.espesor ?? 0,
      ancho: fijas.ancho ?? 0,
      largo: fijas.largo ?? 0,
    };
    libres.forEach((d, k) => { medidas[d] = grupo[k]; });
    piezas.push({ espesor: medidas.espesor, ancho: medidas.ancho, largo: medidas.largo });
  }
  return { piezas, resto: nums.slice(i) };
}
