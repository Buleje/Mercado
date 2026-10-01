/**
 * Qué se puede editar de una corrida del libro, y por qué puerta entra cada
 * cambio (ADR-401).
 *
 * Vive fuera del modal porque son DOS reglas distintas y ninguna es de
 * presentación:
 *
 *  1. **Qué clase de campo es cada uno** — descriptivo o del registro. El
 *     descriptivo no cambia ninguna cuenta; el del registro dice qué se
 *     produjo, y si algo ya depende del asiento no se toca (§1 y §2).
 *  2. **Completar no es corregir** — llenar un hueco agrega lo que el asiento
 *     nunca dijo; sobrescribir cambia lo que el libro afirmó. Son dos acciones
 *     del API y dos entradas distintas en la auditoría, porque un fiscalizador
 *     tiene que poder distinguir «acá siempre estuvo en blanco» de «acá decía
 *     otra cosa».
 *
 * `entryDate` no está y no es un olvido: mover la fecha cambia de qué mes es la
 * producción y toca dos períodos a la vez (ADR-401 §1.1).
 */

import { esCampoSinDato } from "./campo-sin-dato";

export type CampoEditable =
  | "speciesCommon"
  | "speciesScientific"
  | "productType"
  | "presentacion"
  | "quantity"
  | "unit"
  | "volumeInputM3"
  | "materiaPrimaRef"
  | "duenoMadera"
  | "titularNombre"
  | "observations";

export interface DefCampoEditable {
  key: CampoEditable;
  label: string;
  /** Del REGISTRO: sólo se toca si NADA depende del asiento (ADR-401 §2). */
  registro: boolean;
  /** Con qué control se pide el dato. */
  control: "texto" | "textarea" | "numero" | "producto" | "presentacion" | "unidad" | "dueno";
  /**
   * Si estando vacío se llena por `completar_linea`. Los numéricos NO: ponerle
   * valor a un hueco de cantidad o de volumen mueve saldos, así que aunque esté
   * en blanco entra por la puerta de corregir, que revalida las invariantes.
   */
  completable: boolean;
  ayuda?: string;
}

/** En el orden en que se lee la fila en la tabla. */
export const CAMPOS_EDITABLES: DefCampoEditable[] = [
  { key: "speciesCommon", label: "Especie", registro: true, control: "texto", completable: true },
  { key: "speciesScientific", label: "Especie científica", registro: true, control: "texto", completable: true },
  { key: "productType", label: "Tipo de producto", registro: true, control: "producto", completable: true },
  {
    key: "presentacion",
    label: "Presentación",
    registro: false,
    control: "presentacion",
    completable: true,
    ayuda: "Cómo se encuentra en la pila",
  },
  {
    key: "quantity",
    label: "Producción declarada",
    registro: true,
    control: "numero",
    completable: false,
    ayuda: "Lo que la corrida declara haber producido. Lo ya despachado o reprocesado es el piso.",
  },
  { key: "unit", label: "Unidad", registro: true, control: "unidad", completable: false },
  {
    key: "volumeInputM3",
    label: "Volumen consumido (m³)",
    registro: true,
    control: "numero",
    completable: false,
    ayuda: "Materia prima que entró a la sierra. No puede quedar por debajo de lo ya atribuido a las guías (I1).",
  },
  {
    key: "materiaPrimaRef",
    label: "Referencia de materia prima / lote",
    registro: false,
    control: "texto",
    completable: true,
  },
  /* De quién es la madera (ADR-412). Descriptivos los dos: no cambian qué se
     produjo ni cuánto, así que ningún saldo ni invariante depende de ellos —
     por eso se tocan con el período abierto aunque la corrida ya esté
     despachada. Que el titular quede coherente con el dueño lo resuelve la DB
     class, que es donde viven las dos mitades juntas. */
  {
    key: "duenoMadera",
    label: "Dueño de la madera",
    registro: false,
    control: "dueno",
    completable: true,
    ayuda: "Un centro que asierra por encargo produce madera que no es suya, y el certificado lo dice.",
  },
  {
    key: "titularNombre",
    label: "Titular de la madera",
    registro: false,
    control: "texto",
    completable: true,
    ayuda: "Sólo cuando es de un tercero. Se guarda tal como se certifica.",
  },
  { key: "observations", label: "Observaciones", registro: false, control: "textarea", completable: true },
];

/** Lo que dice hoy el asiento, campo por campo, como texto de formulario. */
export type ValoresLinea = Partial<Record<CampoEditable, string | number | null>>;

/**
 * Con qué arranca cada input: el dato tal como está, o vacío si el campo no
 * dice nada. Un «—» arranca vacío igual que un `null` — la tabla los pinta
 * iguales, y dejar el guion adentro del input haría que corregirlo sea borrarlo
 * primero.
 */
export function valorInicial(actual: string | number | null | undefined): string {
  if (actual == null) return "";
  const texto = typeof actual === "number" ? String(actual) : actual;
  return esCampoSinDato(texto) ? "" : texto.trim();
}

export interface RepartoDeCambios {
  /** Huecos que se llenan: acción `completar_linea`. */
  completar: Partial<Record<CampoEditable, string>>;
  /** Valores que se sobrescriben: acción `corregir_linea`. */
  corregir: Partial<Record<CampoEditable, string>>;
  /**
   * Campos que el operador dejó en blanco teniendo dato. No se vacían desde
   * acá —borrar lo que el libro afirmó no es corregirlo— y la pantalla lo dice
   * en vez de tragárselo en silencio.
   */
  vaciados: CampoEditable[];
}

const mismoNumero = (a: string, b: string) => {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/**
 * Parte lo que el operador escribió en las dos acciones del API, dejando afuera
 * lo que no cambió. Comparar es lo que evita mandar «corregí especie a lo mismo
 * que ya decía» y ensuciar la auditoría con cambios que no cambiaron nada.
 */
export function partirCambios(actual: ValoresLinea, escrito: Partial<Record<CampoEditable, string>>): RepartoDeCambios {
  const reparto: RepartoDeCambios = { completar: {}, corregir: {}, vaciados: [] };
  for (const def of CAMPOS_EDITABLES) {
    /* Un campo que no vino no es un campo que se vació: quien no manda una
       clave no la tocó, y tratarlo como blanco haría que un formulario parcial
       reportara vaciados que nadie escribió. */
    if (escrito[def.key] === undefined) continue;
    const nuevo = (escrito[def.key] ?? "").trim();
    const previoCrudo = actual[def.key];
    const previo = valorInicial(previoCrudo);
    const estabaVacio = previo === "";

    if (nuevo === "") {
      if (!estabaVacio) reparto.vaciados.push(def.key);
      continue;
    }
    if (!estabaVacio) {
      if (previo === nuevo) continue;
      if (def.control === "numero" && mismoNumero(previo, nuevo)) continue;
    }
    if (estabaVacio && def.completable) reparto.completar[def.key] = nuevo;
    else reparto.corregir[def.key] = nuevo;
  }
  return reparto;
}

/** ¿Hay algo que mandar? */
export const hayCambios = (r: RepartoDeCambios) =>
  Object.keys(r.completar).length > 0 || Object.keys(r.corregir).length > 0;
