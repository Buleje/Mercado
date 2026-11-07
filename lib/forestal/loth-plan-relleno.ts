/**
 * Valores de RELLENO en el plan de manejo: lo que se escribe para que el campo
 * «no quede vacío» y no es un dato.
 *
 * Medido en Blas (24-10-2026): la resolución de un plan dice «ERERER» y el
 * regente de otro, «-». Los dos cuentan como «lleno» para cualquier lectura
 * que sólo mire si hay texto, y la ficha del plan salía más completa de lo que
 * es. Un campo vacío dice la verdad (falta el dato); uno con relleno miente.
 *
 * Por eso se RECHAZA al guardar —en el formulario y en el servidor, con la
 * misma función— y la ficha lo cuenta como faltante (`loth-plan-ficha`).
 *
 * Qué es relleno (y qué NO):
 *   · sin una sola letra ni cifra: «-», «--», «.», «/», «?»;
 *   · una letra repetida: «x», «xxx», «aaaa» (un solo carácter en un nombre);
 *   · un trozo corto repetido 3 veces o más: «ERERER», «asdasdasd»;
 *   · teclado aporreado o palabra de prueba: «asd», «qwerty», «test», «prueba»;
 *   · «sin dato», «n/a», «pendiente», «por definir», «no tiene»: es un dato
 *     que FALTA, y vacío lo dice mejor (la ficha lo reclama);
 *   · donde va un NÚMERO (resolución, registro, documento): «s/n», «sn»,
 *     «sin número», sólo ceros, o un texto sin ninguna cifra.
 *   · Vacío NO es relleno: es un dato que falta, y lo cuenta la ficha.
 *   · «PO1», «Coco», «Li» o «Sector 3» NO son relleno: tienen forma de dato.
 *
 * PURO: lo usan el formulario (`use-loth-plan-form`) y la ruta del plan.
 */

/** Cómo se lee cada campo: un nombre, un código/número o un texto libre corto. */
export type TipoCampoRelleno = "nombre" | "numero" | "codigo" | "texto";

export type CampoPlanRelleno =
  | "planNumber"
  | "tituloHabilitante"
  | "resolucionNumber"
  | "titularName"
  | "representanteLegal"
  | "regenteName"
  | "regenteRegistro"
  | "propietarioNombre"
  | "propietarioDoc"
  | "arffs"
  | "parcelaCorta"
  | "sector"
  | "cuenca"
  | "alias";

/** Etiqueta (la del formulario) y forma de cada campo que se revisa. */
export const CAMPOS_RELLENO: Readonly<Record<CampoPlanRelleno, { etiqueta: string; tipo: TipoCampoRelleno }>> = {
  planNumber: { etiqueta: "N° del plan", tipo: "codigo" },
  tituloHabilitante: { etiqueta: "Título habilitante", tipo: "codigo" },
  resolucionNumber: { etiqueta: "Resolución", tipo: "numero" },
  titularName: { etiqueta: "Titular", tipo: "nombre" },
  representanteLegal: { etiqueta: "Representante legal", tipo: "nombre" },
  regenteName: { etiqueta: "Regente o encargado", tipo: "nombre" },
  regenteRegistro: { etiqueta: "N° de registro del regente", tipo: "numero" },
  propietarioNombre: { etiqueta: "Propietario del predio", tipo: "nombre" },
  propietarioDoc: { etiqueta: "Documento del propietario", tipo: "numero" },
  arffs: { etiqueta: "ARFFS", tipo: "texto" },
  parcelaCorta: { etiqueta: "Parcela de corta", tipo: "codigo" },
  sector: { etiqueta: "Sector", tipo: "texto" },
  cuenca: { etiqueta: "Cuenca", tipo: "texto" },
  alias: { etiqueta: "Apodo del plan", tipo: "texto" },
};

export const CAMPOS_RELLENO_LISTA = Object.keys(CAMPOS_RELLENO) as CampoPlanRelleno[];

/** Sin tildes, en minúsculas y con los espacios juntos. */
function plano(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* Palabras que dicen «no lo sé» o «es de prueba»; se comparan enteras, nunca como parte de otra. */
const NO_ES_DATO = new Set([
  "na", "n/a", "n.a", "n.a.", "n-a", "nn", "ninguno", "ninguna", "nada", "no", "no tiene", "no hay",
  "sin dato", "sin datos", "sin nombre", "sin informacion", "desconocido", "pendiente", "por definir",
  "por confirmar", "falta", "x definir", "test", "prueba", "pruebas", "ejemplo", "demo", "dummy",
  "asd", "asdf", "asdfg", "asdasd", "qwe", "qwer", "qwert", "qwerty", "zxc", "zxcv", "jkl", "hjkl",
  "lorem", "lorem ipsum", "abc", "abcd", "xyz",
]);

const SIN_NUMERO = new Set(["s/n", "sn", "s.n", "s.n.", "s-n", "sin numero", "sin nro", "sin n", "s/num", "sin n°", "sin no"]);

/**
 * Por qué ese valor es relleno, o `null` si tiene forma de dato. El texto va
 * tal cual al lado del campo: dice qué se encontró y qué hacer.
 */
/** I a XXXIX (las parcelas y sectores de un plan no pasan de ahí). */
const ROMANO = /^x{0,3}(ix|iv|v?i{0,3})$/;

export function motivoDeRelleno(valor: string | null | undefined, tipo: TipoCampoRelleno): string | null {
  const crudo = (valor ?? "").trim();
  if (!crudo) return null;
  const t = plano(crudo);
  const comillas = `«${crudo.length > 24 ? `${crudo.slice(0, 24)}…` : crudo}»`;
  const vacioMejor = "déjalo vacío si todavía no lo tienes: así la ficha lo cuenta como pendiente";

  if (!/[\p{L}\p{N}]/u.test(t)) return `${comillas} no es un dato (sólo signos); ${vacioMejor}.`;

  if (NO_ES_DATO.has(t) || NO_ES_DATO.has(t.replace(/[.\s]/g, ""))) {
    return `${comillas} no es un dato; ${vacioMejor}.`;
  }

  if (tipo === "numero" || tipo === "codigo") {
    if (SIN_NUMERO.has(t) || SIN_NUMERO.has(t.replace(/\s/g, ""))) {
      return `${comillas} dice que no tiene número; ${vacioMejor}.`;
    }
    if (/^[0\W_]+$/u.test(t)) return `${comillas} es sólo ceros; escribe el número real o ${vacioMejor}.`;
  }
  if (tipo === "numero" && !/\p{N}/u.test(t)) {
    return `${comillas} no tiene ninguna cifra y aquí va un número; ${vacioMejor}.`;
  }

  const compacto = t.replace(/[\s.\-_/]/g, "");
  // Un número romano es un dato en un código o un texto: la «Parcela III», el
  // «Sector IV», la «Zona XII» (B2, 25-10). «XXX» sigue siendo el relleno de
  // siempre: una parcela 30 se escribe con cifras.
  if (tipo !== "nombre" && compacto !== "xxx" && ROMANO.test(compacto)) return null;
  // Una letra repetida («xxx», «aaaa»): en un nombre, aun una sola letra.
  if (/^(\p{L})\1+$/u.test(compacto) && (compacto.length >= 3 || tipo === "nombre")) {
    return `${comillas} es una letra repetida, no un dato; ${vacioMejor}.`;
  }
  if (tipo === "nombre" && compacto.length === 1) return `${comillas} es una sola letra, no un nombre; ${vacioMejor}.`;
  if (tipo === "nombre" && !/\p{L}/u.test(t)) return `${comillas} no tiene letras y aquí va un nombre; ${vacioMejor}.`;

  // Un trozo corto repetido tres veces o más: «ERERER», «asdasdasd», «jajaja».
  const rep = /^(\p{L}{1,4})\1{2,}$/u.exec(compacto);
  if (rep) return `${comillas} repite «${rep[1].toUpperCase()}», no parece un dato; ${vacioMejor}.`;

  return null;
}

export interface RellenoEnCampo {
  campo: CampoPlanRelleno;
  etiqueta: string;
  valor: string;
  motivo: string;
}

/**
 * Los campos del plan que traen relleno, en el orden del formulario. Sólo se
 * miran los que vienen: en un PATCH parcial, lo que no se manda no se juzga.
 */
export function rellenoEnPlan(datos: Partial<Record<CampoPlanRelleno, unknown>>): RellenoEnCampo[] {
  const out: RellenoEnCampo[] = [];
  for (const campo of CAMPOS_RELLENO_LISTA) {
    const v = datos[campo];
    if (typeof v !== "string") continue;
    const { etiqueta, tipo } = CAMPOS_RELLENO[campo];
    const motivo = motivoDeRelleno(v, tipo);
    if (motivo) out.push({ campo, etiqueta, valor: v.trim(), motivo });
  }
  return out;
}

/** Una línea para el error del formulario o del servidor: «Resolución: «ERERER» repite…». */
export function mensajeDeRelleno(r: readonly RellenoEnCampo[]): string | null {
  if (r.length === 0) return null;
  const primero = `${r[0].etiqueta}: ${r[0].motivo}`;
  return r.length === 1 ? primero : `${primero} (y ${r.length - 1} ${r.length === 2 ? "campo más" : "campos más"} con relleno).`;
}
