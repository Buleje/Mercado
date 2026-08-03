/**
 * Retrozado — cortar una troza en pedazos (ADR-313).
 *
 * Es el **Apartado 2 del formato LO-CTP**, que el ADR-311 dejó anotado como
 * pendiente. En el patio pasa todo el tiempo: llega una troza de 9.70 m y no
 * entra en la sierra, o tiene un tramo podrido, así que se corta en dos o tres.
 * Cada pedazo sigue siendo la misma madera de la misma guía y tiene que poder
 * responder de qué troza salió.
 *
 * Las reglas vienen de un ERP forestal que ya operaba (AppForestal, feb 2026);
 * la **fórmula de volumen NO**: la de ellos (Smalian) se aparta de lo que
 * declara SERFOR —3.3113 m³ donde la guía dice 3.268— y acá el volumen tiene que
 * cuadrar con el documento. Se usa Huber sobre el diámetro medio, la misma de
 * `serfor-gtf-a-ingresos.ts`, que reproduce los cuatro volúmenes de la guía real.
 *
 * Puro y sin red: se testea contra los números de esa guía.
 */

/** Un pedazo a crear, tal como lo carga el operador. */
export type RetrozoNuevo = {
  d1Cm: number;
  d2Cm: number;
  largoM: number;
  /** Si no viene, se calcula. El operador puede corregirlo: manda lo que midió. */
  volumenM3?: number | null;
  observaciones?: string | null;
  /** El pedazo que no sirve: ocupa volumen de la madre pero no es producto. */
  descarte?: boolean;
};

/** La troza madre, con lo que hace falta para validar. */
export type TrozaMadre = {
  id: string;
  codificacion: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  volumenM3: number | null;
  /** Los retrozos que YA tiene: el tope es sobre el total, no sobre cada corte. */
  retrozosPrevios: Array<{ volumenM3: number | null; largoM?: number | null; descarte?: boolean }>;
};

export type ResultadoRetrozado =
  | { ok: true; retrozos: RetrozoCalculado[]; volumenRetrozado: number; volumenLibre: number }
  | { ok: false; errores: string[] };

export type RetrozoCalculado = RetrozoNuevo & {
  /** `106/C` → `106/C-1`, `106/C-2`… El código de la madre no se pierde nunca. */
  codificacion: string;
  volumenM3: number;
  orden: number;
};

/**
 * Volumen de una troza por Huber (diámetro medio), en m³.
 *
 * Diámetros en cm, largo en m — el mismo orden en que lo publica SERFOR.
 */
export function volumenHuber(d1Cm: number, d2Cm: number, largoM: number): number {
  if (!(d1Cm > 0) || !(d2Cm > 0) || !(largoM > 0)) return 0;
  const radioM = (d1Cm + d2Cm) / 2 / 200;
  return Number((Math.PI * radioM * radioM * largoM).toFixed(4));
}

/** Tolerancia del redondeo de SERFOR (3 decimales), no un margen de cortesía. */
const EPSILON = 0.001;

/**
 * Valida y calcula el corte completo.
 *
 * Las tres reglas salen de la física de cortar un tronco, no de una preferencia:
 * de una troza no puede salir un pedazo **más grueso ni más largo** que ella, ni
 * la suma de los pedazos puede pasar su volumen. Se valida el conjunto de una
 * vez —no pedazo por pedazo— porque el tope de volumen es sobre el total.
 *
 * Como en las invariantes del libro (I1-I5): **`≤`, nunca `==`**. Al cortar se
 * pierde aserrín y se descartan puntas; exigir que la suma dé exacto obligaría al
 * operador a inflar un número para poder guardar.
 */
export function calcularRetrozado(madre: TrozaMadre, nuevos: RetrozoNuevo[]): ResultadoRetrozado {
  const errores: string[] = [];
  if (nuevos.length === 0) return { ok: false, errores: ["No hay ningún pedazo que registrar."] };

  const retrozos: RetrozoCalculado[] = [];
  const base = (madre.codificacion ?? "").trim();
  const desde = madre.retrozosPrevios.length;
  const mayorMadre =
    madre.d1Cm != null || madre.d2Cm != null ? Math.max(madre.d1Cm ?? 0, madre.d2Cm ?? 0) : null;

  for (const [i, n] of nuevos.entries()) {
    const nro = i + 1;
    if (!(n.d1Cm > 0) || !(n.d2Cm > 0) || !(n.largoM > 0)) {
      errores.push(`Pedazo ${nro}: faltan las medidas (D1, D2 y largo).`);
      continue;
    }
    // El tope de grosor es el diámetro MAYOR de la madre, no "d1 contra d1".
    //
    // Un tronco es cónico: va de 73 cm en la base a 58 en la punta. Al cortarlo
    // por el medio, la cara del corte mide algo intermedio (66), así que el
    // pedazo de arriba queda 66→58 y el de abajo 73→66. Comparar el diámetro
    // menor del pedazo (66) contra el menor de la madre (58) rechazaría un corte
    // perfectamente normal — el ERP de donde vienen estas reglas lo hacía así.
    if (mayorMadre != null) {
      const mayorPedazo = Math.max(n.d1Cm, n.d2Cm);
      if (mayorPedazo - mayorMadre > EPSILON) {
        errores.push(`Pedazo ${nro}: ${mayorPedazo} cm de diámetro no salen de una troza de ${mayorMadre} cm.`);
      }
    }
    if (madre.largoM != null && n.largoM - madre.largoM > EPSILON) {
      errores.push(`Pedazo ${nro}: ${n.largoM} m no puede superar los ${madre.largoM} m de la troza.`);
    }

    // El volumen que escribió el operador manda: midió la madera. Sólo se calcula
    // cuando no lo puso.
    const volumenM3 =
      n.volumenM3 != null && n.volumenM3 > 0
        ? Number(Number(n.volumenM3).toFixed(4))
        : volumenHuber(n.d1Cm, n.d2Cm, n.largoM);
    if (!(volumenM3 > 0)) errores.push(`Pedazo ${nro}: el volumen da 0.`);

    retrozos.push({
      ...n,
      codificacion: base ? `${base}-${desde + nro}` : `RETRO-${desde + nro}`,
      volumenM3,
      orden: desde + nro,
    });
  }

  // Los largos también suman: de una troza de 9.70 m no salen dos pedazos de 6 m,
  // por más que cada uno respete el tope por separado.
  if (madre.largoM != null) {
    const largoPrevio = madre.retrozosPrevios.reduce((a, r) => a + (r.largoM ?? 0), 0);
    const largoTotal = largoPrevio + retrozos.reduce((a, r) => a + r.largoM, 0);
    if (largoTotal - madre.largoM > EPSILON) {
      errores.push(
        `Los pedazos suman ${largoTotal.toFixed(2)} m de largo y la troza mide ${madre.largoM.toFixed(2)} m.`,
      );
    }
  }

  const yaCortado = madre.retrozosPrevios.reduce((a, r) => a + (r.volumenM3 ?? 0), 0);
  const nuevoTotal = retrozos.reduce((a, r) => a + r.volumenM3, 0);
  const volumenRetrozado = Number((yaCortado + nuevoTotal).toFixed(4));

  if (madre.volumenM3 != null && volumenRetrozado - madre.volumenM3 > EPSILON) {
    errores.push(
      `Los pedazos suman ${volumenRetrozado.toFixed(4)} m³ y la troza tiene ${madre.volumenM3.toFixed(4)} m³.` +
        (yaCortado > 0 ? ` (Ya estaban cortados ${yaCortado.toFixed(4)} m³.)` : ""),
    );
  }

  if (errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    retrozos,
    volumenRetrozado,
    volumenLibre: madre.volumenM3 != null ? Number((madre.volumenM3 - volumenRetrozado).toFixed(4)) : 0,
  };
}

/**
 * Qué queda de una troza después de cortarla.
 *
 * `disponible` es lo que todavía se puede consumir: el resto de la madre más los
 * pedazos que sirven. **El descarte no cuenta** —ocupa volumen de la madre pero
 * no es producto—, y por eso se informa aparte en vez de desaparecer: un volumen
 * que se esfuma sin explicación es lo que un fiscalizador marca.
 */
export function saldoDeTroza(madre: TrozaMadre & { retrozosPrevios: Array<{ volumenM3: number | null; descarte?: boolean }> }): {
  original: number;
  retrozado: number;
  descartado: number;
  sinCortar: number;
  disponible: number;
} {
  const original = madre.volumenM3 ?? 0;
  const retrozado = madre.retrozosPrevios.reduce((a, r) => a + (r.volumenM3 ?? 0), 0);
  const descartado = madre.retrozosPrevios.filter((r) => r.descarte).reduce((a, r) => a + (r.volumenM3 ?? 0), 0);
  const sinCortar = Number(Math.max(0, original - retrozado).toFixed(4));
  return {
    original: Number(original.toFixed(4)),
    retrozado: Number(retrozado.toFixed(4)),
    descartado: Number(descartado.toFixed(4)),
    sinCortar,
    disponible: Number((sinCortar + retrozado - descartado).toFixed(4)),
  };
}
