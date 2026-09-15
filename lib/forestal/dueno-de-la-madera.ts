/**
 * De quién es la madera de una corrida (ADR-412).
 *
 * Pedido de Brandon (2026-09-13) para «Producir sin lote»: «que se pueda poner
 * el dueño… si es madera de tercero o propio».
 *
 * No es un adorno del formulario. Un aserradero que presta **servicio de
 * maquila** asierra madera que no es suya: el producto que sale no le pertenece,
 * y el certificado tiene que decirlo. El libro ya lo declara para el lote
 * comercial (`ForestProdLote.titularNombre`, ADR-327); lo que faltaba es poder
 * decirlo de una corrida suelta — una producción sin lote no consumió ninguna
 * guía ni pertenece a ningún lote, así que no hay de dónde heredarlo.
 *
 * Tres estados y no dos. «No se declaró» NO es «es propia»: una corrida vieja
 * no eligió nada, y responder por ella sería inventarle un dueño.
 *
 * PURO y client-safe.
 */

export type DuenoMadera = "propia" | "tercero";

export const DUENO_MADERA: readonly DuenoMadera[] = ["propia", "tercero"] as const;

/** ¿El texto guardado es uno de los dos valores que el libro entiende? */
export function esDuenoMadera(v: string | null | undefined): v is DuenoMadera {
  return v === "propia" || v === "tercero";
}

export interface DeclaracionDeDueno {
  dueno: DuenoMadera | null;
  titularNombre: string | null;
}

export interface RevisionDeDueno {
  /** `false` cuando lo declarado se contradice y no se puede guardar así. */
  valido: boolean;
  /** Qué está mal o qué falta, en la lengua del patio. */
  problema: string | null;
  /** Lo que hay que guardar, ya normalizado. */
  normalizado: DeclaracionDeDueno;
}

/**
 * Revisa la declaración ANTES de guardarla.
 *
 * Dos reglas, las dos sobre la misma idea: lo que se declara tiene que decir
 * algo. «De tercero» sin nombre no dice de quién es la madera, y un nombre
 * colgado de «propia» dice dos cosas a la vez.
 */
export function revisarDueno(d: DeclaracionDeDueno): RevisionDeDueno {
  const nombre = (d.titularNombre ?? "").trim();

  if (d.dueno == null) {
    /* Sin elegir no hay nada que revisar — es el estado de toda corrida vieja.
       Un nombre suelto sin elección se guarda igual: es un dato que alguien
       escribió, y perderlo sería peor que guardarlo a medias. */
    return {
      valido: true,
      problema: null,
      normalizado: { dueno: null, titularNombre: nombre || null },
    };
  }

  if (d.dueno === "tercero" && !nombre) {
    return {
      valido: false,
      problema: "Di de quién es la madera: «de tercero» sin nombre no dice nada.",
      normalizado: { dueno: "tercero", titularNombre: null },
    };
  }

  if (d.dueno === "propia" && nombre) {
    return {
      valido: false,
      problema: `Marcaste que la madera es del centro y además pusiste a «${nombre}» como titular: es una cosa o la otra.`,
      normalizado: { dueno: "propia", titularNombre: nombre },
    };
  }

  return {
    valido: true,
    problema: null,
    normalizado: { dueno: d.dueno, titularNombre: d.dueno === "tercero" ? nombre : null },
  };
}

/**
 * El titular que queda GUARDADO junto a un dueño.
 *
 * «Del centro» no tiene titular: `null` explícito. No alcanza con
 * `revisarDueno().normalizado`, que conserva el nombre para poder mostrar el
 * problema — guardarlo dejaría la corrida diciendo «propia» Y «CC.NN. San Luis».
 * De tercero o sin elegir, el nombre tal cual (vacío = `null`).
 */
export function titularQueQueda(dueno: DuenoMadera | null, titularNombre: string | null | undefined): string | null {
  if (dueno === "propia") return null;
  return (titularNombre ?? "").trim() || null;
}

/** Por qué no se escribe un titular sobre madera del centro. */
export const MOTIVO_TITULAR_DEL_CENTRO =
  "La madera es del centro: no lleva titular. Cámbiala a «de tercero» para ponerle uno.";

/**
 * Cómo se lee en pantalla y en el papel.
 *
 * Sin elección devuelve `null` y no un «—»: quien lo muestre decide si vale la
 * pena ocupar una línea para decir que no se sabe.
 */
export function etiquetaDeDueno(d: DeclaracionDeDueno): string | null {
  const nombre = (d.titularNombre ?? "").trim();
  if (d.dueno === "tercero") return nombre ? `De tercero · ${nombre}` : "De tercero";
  if (d.dueno === "propia") return "Del centro";
  return nombre ? `Titular: ${nombre}` : null;
}

/** La frase corta para una tabla, sin el nombre. */
export function etiquetaCortaDeDueno(d: DuenoMadera | null): string | null {
  return d === "tercero" ? "De tercero" : d === "propia" ? "Del centro" : null;
}
