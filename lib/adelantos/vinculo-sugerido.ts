/**
 * ¿Qué parte del directorio forestal es esta persona de Adelantos? (ADR-449 §1)
 *
 * La ficha de Adelantos y la parte del directorio se escriben a mano en dos
 * pantallas distintas: en Blas, «Wasaco» (Adelantos) y «WASACO» (directorio)
 * son la misma empresa y nadie las unió (`forestPartyId` null). Sin esa unión
 * no se cruza lo que te adelantó contra sus aserríos.
 *
 * Esto SÓLO sugiere: la pantalla pregunta «¿Es la misma persona que WASACO?» y
 * el vínculo lo confirma una persona (`PATCH vincular_parte`). Un nombre
 * parecido no es una prueba — por eso el criterio es estricto: mismo nombre
 * después de normalizar (tildes, mayúsculas, puntuación y la forma societaria),
 * o mismo documento. Si calzan dos partes, no se sugiere ninguna: elegir entre
 * dos homónimos lo decide la persona.
 *
 * Medido en Blas (28-09, sólo lectura): 4 fichas × 11 partes → 1 sugerencia
 * (Wasaco ↔ WASACO), 0 falsos positivos.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

/**
 * Formas societarias peruanas dichas completas o por sigla. `minAntes` = cuántas
 * palabras tienen que quedar delante para sacarla: «sa» sin puntos sólo con dos
 * o más («Maderas Unidas SA»), porque «José Sá» es un apellido.
 */
const FORMAS_SOCIETARIAS: readonly { palabras: string[]; minAntes: number }[] = [
  { palabras: ["sociedad", "anonima", "cerrada"], minAntes: 1 },
  { palabras: ["sociedad", "anonima", "abierta"], minAntes: 1 },
  { palabras: ["sociedad", "anonima"], minAntes: 1 },
  { palabras: ["sociedad", "comercial", "de", "responsabilidad", "limitada"], minAntes: 1 },
  { palabras: ["sociedad", "de", "responsabilidad", "limitada"], minAntes: 1 },
  { palabras: ["empresa", "individual", "de", "responsabilidad", "limitada"], minAntes: 1 },
  { palabras: ["sac"], minAntes: 1 },
  { palabras: ["saa"], minAntes: 1 },
  { palabras: ["srl"], minAntes: 1 },
  { palabras: ["eirl"], minAntes: 1 },
  { palabras: ["sa"], minAntes: 2 },
];

/** Siglas que, escritas CON puntos («S.A.», «E.I.R.L.»), son forma de empresa sin duda. */
const SIGLAS = new Set(["sac", "saa", "sa", "srl", "eirl"]);

/**
 * El nombre como se compara: sin tildes, en minúscula, sin puntuación y sin la
 * forma societaria del final. «Transportes Río Verde S.A.C.» → «transportes rio verde».
 * La «ñ» se conserva: «MUÑOZ» y «MUNOZ» son apellidos distintos para SUNAT.
 */
export function normalizarNombre(nombre: string | null | undefined): string {
  const base = (nombre ?? "")
    .toLowerCase()
    .replace(/ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "ñ");
  /* Una sigla CON puntos al final («S.A.», «S. A. C.») se saca siempre que
     quede algo delante: los puntos dicen que es sigla, no apellido. */
  let texto = base.trim();
  const conPuntos = /(?:^|[\s,])((?:[a-z]\.\s?){2,}[a-z]?\.?)\s*$/.exec(texto);
  if (conPuntos && SIGLAS.has(conPuntos[1].replace(/[^a-z]/g, ""))) {
    const delante = texto.slice(0, conPuntos.index).trim();
    if (/[a-z0-9ñ]/.test(delante)) texto = delante;
  }
  /* Las siglas que quedan («S.A.» sola, o en el medio) se juntan: los puntos no separan letras. */
  texto = texto.replace(/\b((?:[a-z]\.){2,}[a-z]?\.?)/g, (m) => m.replace(/\./g, ""));
  let palabras = texto.split(/[^a-z0-9ñ]+/).filter(Boolean);
  let cambio = true;
  while (cambio && palabras.length > 1) {
    cambio = false;
    for (const forma of FORMAS_SOCIETARIAS) {
      if (palabras.length - forma.palabras.length < forma.minAntes) continue;
      const cola = palabras.slice(palabras.length - forma.palabras.length);
      if (cola.every((p, i) => p === forma.palabras[i])) {
        palabras = palabras.slice(0, palabras.length - forma.palabras.length);
        cambio = true;
        break;
      }
    }
  }
  return palabras.join(" ");
}

/** Sólo dígitos y letras: «20-60585943-8» y «20605859438» son el mismo RUC. */
function normalizarDocumento(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return d.length >= 8 ? d : null;
}

export interface CandidataVinculo {
  parteId: string | null;
  nombre: string;
  documento: string | null;
}

export interface VinculoSugerido<T extends CandidataVinculo> {
  candidata: T;
  /** Por qué se sugiere, para decirlo en la pantalla. */
  motivo: "mismo-nombre" | "mismo-documento";
}

/**
 * La parte que parece ser esta persona, o `null`. Nunca vincula: la respuesta
 * alimenta una pregunta con confirmación.
 *
 * Una sola candidata que calce, o ninguna. Un nombre de menos de 3 letras
 * (después de normalizar) no sugiere nada: «SA» o «Lu» calzan con cualquiera.
 */
export function sugerirVinculo<T extends CandidataVinculo>(
  persona: { nombre: string; documento: string | null },
  candidatas: readonly T[],
): VinculoSugerido<T> | null {
  const validas = candidatas.filter((c) => c.parteId);
  const doc = normalizarDocumento(persona.documento);
  if (doc) {
    const porDoc = validas.filter((c) => normalizarDocumento(c.documento) === doc);
    if (porDoc.length === 1) return { candidata: porDoc[0], motivo: "mismo-documento" };
    if (porDoc.length > 1) return null;
  }
  const nombre = normalizarNombre(persona.nombre);
  if (nombre.replace(/\s/g, "").length < 3) return null;
  /* Los dos con documento y distinto: son dos personas aunque se llamen igual
     (revisión ADR-449). Sólo se sugiere por nombre si a uno le falta. */
  const porNombre = validas.filter((c) => {
    const suyo = normalizarDocumento(c.documento);
    return normalizarNombre(c.nombre) === nombre && !(doc && suyo && suyo !== doc);
  });
  return porNombre.length === 1 ? { candidata: porNombre[0], motivo: "mismo-nombre" } : null;
}
