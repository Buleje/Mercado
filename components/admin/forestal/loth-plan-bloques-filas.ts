/**
 * Las filas de especies del alta repartidas por bloque o zona (Brandon 24-10).
 *
 * Todas las filas siguen en UNA lista (`FilaEspecie[]`, la del formulario):
 * cada una dice en qué bloque está (`bloque`, el uid). Así el lector de la
 * constancia y el resto del formulario no cambian: una fila sin bloque (la que
 * agrega la constancia) cae en el primero. Lo que se registra como especie del
 * plan es la suma por especie de todos los bloques (`juntarPorEspecie`).
 *
 * Puro: sin React (lo prueba `__tests__/loth-plan-bloques.test.ts`).
 */
import {
  juntarPorEspecie,
  subtotalDelBloque,
  type BloqueDelPlan,
  type EspecieDelBloque,
  type SubtotalDelBloque,
} from "@/lib/forestal/loth-plan-bloques";
import {
  aEspecieParaGuardar,
  especiesRepetidas,
  filaDesdeEspecie,
  filaEnBlanco,
  filaVacia,
  type EspecieParaGuardar,
  type FilaEspecie,
} from "./loth-plan-especies-api";

export interface BloqueEnEdicion {
  uid: string;
  /** Lo que se escribió; vacío → «Bloque N» al guardar. */
  nombre: string;
}

let secuencia = 0;
export function bloqueNuevo(nombre = ""): BloqueEnEdicion {
  secuencia += 1;
  return { uid: `bloque-${secuencia}`, nombre };
}

/** El nombre que se guarda: el escrito o «Bloque N» por su orden. */
export const nombreDelBloque = (b: BloqueEnEdicion, i: number): string => b.nombre.trim() || `Bloque ${i + 1}`;

/** ¿Esta fila es de este bloque? La que no tiene un bloque que exista va al primero. */
function esDelBloque(f: FilaEspecie, uid: string, bloques: readonly BloqueEnEdicion[]): boolean {
  if (f.bloque === uid) return true;
  const existe = bloques.some((b) => b.uid === f.bloque);
  return !existe && bloques[0]?.uid === uid;
}

export function filasDelBloque(filas: readonly FilaEspecie[], bloques: readonly BloqueEnEdicion[], uid: string): FilaEspecie[] {
  return filas.filter((f) => esDelBloque(f, uid, bloques));
}

/** Cambia las filas de UN bloque y deja las otras como estaban. */
export function conFilasDelBloque(
  filas: readonly FilaEspecie[],
  bloques: readonly BloqueEnEdicion[],
  uid: string,
  nuevas: readonly FilaEspecie[],
): FilaEspecie[] {
  return [...filas.filter((f) => !esDelBloque(f, uid, bloques)), ...nuevas.map((f) => ({ ...f, bloque: uid }))];
}

/** «Por bloques o zonas»: lo ya escrito pasa al Bloque 1 y se abre el Bloque 2 vacío. */
export function partirEnBloques(filas: readonly FilaEspecie[]): { bloques: BloqueEnEdicion[]; filas: FilaEspecie[] } {
  const uno = bloqueNuevo();
  const dos = bloqueNuevo();
  const escritas = filas.filter((f) => !filaEnBlanco(f));
  const delUno = (escritas.length > 0 ? escritas : [filaVacia()]).map((f) => ({ ...f, bloque: uno.uid }));
  return { bloques: [uno, dos], filas: [...delUno, { ...filaVacia(), bloque: dos.uid }] };
}

export function agregarBloque(filas: readonly FilaEspecie[], bloques: readonly BloqueEnEdicion[]): { bloques: BloqueEnEdicion[]; filas: FilaEspecie[]; nuevo: BloqueEnEdicion } {
  const nuevo = bloqueNuevo();
  return { bloques: [...bloques, nuevo], filas: [...filas, { ...filaVacia(), bloque: nuevo.uid }], nuevo };
}

/** Quita el bloque con sus filas. Sin bloques, vuelve a la lista simple con una fila vacía. */
export function quitarBloque(
  filas: readonly FilaEspecie[],
  bloques: readonly BloqueEnEdicion[],
  uid: string,
): { bloques: BloqueEnEdicion[] | null; filas: FilaEspecie[] } {
  const quedan = bloques.filter((b) => b.uid !== uid);
  const resto = filas.filter((f) => !esDelBloque(f, uid, bloques));
  if (quedan.length === 0) return { bloques: null, filas: [filaVacia()] };
  return { bloques: quedan, filas: resto.length > 0 ? resto : [{ ...filaVacia(), bloque: quedan[0]!.uid }] };
}

/** «Sin bloques»: todas las filas en una sola lista (si una especie estaba en dos bloques, la lista lo marca repetido). */
export function juntarEnUnaLista(filas: readonly FilaEspecie[]): FilaEspecie[] {
  const sinBloque = filas.filter((f) => !filaEnBlanco(f)).map(({ bloque: _bloque, ...f }) => f);
  return sinBloque.length > 0 ? sinBloque : [filaVacia()];
}

/** El reparto que se guarda: sólo las filas escritas; un bloque sin ninguna no se guarda. */
export function bloquesParaGuardar(filas: readonly FilaEspecie[], bloques: readonly BloqueEnEdicion[]): BloqueDelPlan[] {
  return bloques
    .map((b, i) => ({
      nombre: nombreDelBloque(b, i),
      especies: filasDelBloque(filas, bloques, b.uid)
        .filter((f) => !filaEnBlanco(f))
        .map(aEspecieDelBloque),
    }))
    .filter((b) => b.especies.length > 0);
}

/** Una fila escrita, como se guarda dentro de su bloque. */
function aEspecieDelBloque(f: FilaEspecie): EspecieDelBloque {
  const e = aEspecieParaGuardar(f);
  return {
    speciesCommon: e.speciesCommon,
    speciesScientific: e.speciesScientific,
    cites: e.cites,
    volumenM3: e.volumenAutorizadoM3,
    arboles: e.arbolesAutorizados,
    superficieHa: e.superficieHa,
    anioInstalacion: e.anioInstalacion,
    precioVentaSoles: e.precioVentaSoles,
  };
}

/** Lo que suma un bloque mientras se escribe: m³, árboles y hectáreas de sus filas escritas. */
export function subtotalDeLasFilas(filas: readonly FilaEspecie[]): SubtotalDelBloque {
  return subtotalDelBloque({ especies: filas.filter((f) => !filaEnBlanco(f)).map(aEspecieDelBloque) });
}

/** Las especies del plan que salen de los bloques: una por especie, sumada (lo que va en el POST del alta). */
export function especiesDeLosBloques(filas: readonly FilaEspecie[], bloques: readonly BloqueEnEdicion[]): EspecieParaGuardar[] {
  return juntarPorEspecie(bloquesParaGuardar(filas, bloques)).map(({ bloques: _n, ...e }) => e);
}

/** Los bloques (por `uid`) cuyo nombre se repite con otro: el reparto se guarda por nombre. */
export function bloquesConNombreRepetido(bloques: readonly BloqueEnEdicion[]): Set<string> {
  const nombres = new Map<string, number>();
  bloques.forEach((b, i) => {
    const n = nombreDelBloque(b, i).toLowerCase();
    nombres.set(n, (nombres.get(n) ?? 0) + 1);
  });
  return new Set(bloques.filter((b, i) => (nombres.get(nombreDelBloque(b, i).toLowerCase()) ?? 0) > 1).map((b) => b.uid));
}

/** Por qué el reparto no se puede guardar todavía, en palabras; `null` si se puede. */
export function problemaDeLosBloques(filas: readonly FilaEspecie[], bloques: readonly BloqueEnEdicion[]): string | null {
  const repetidos = bloquesConNombreRepetido(bloques);
  const i = bloques.findIndex((b) => repetidos.has(b.uid));
  if (i >= 0) return `Hay dos bloques que se llaman «${nombreDelBloque(bloques[i]!, i)}»: ponle otro nombre a uno.`;
  for (const [i, b] of bloques.entries()) {
    const rep = especiesRepetidas(filasDelBloque(filas, bloques, b.uid).filter((f) => !filaEnBlanco(f)));
    if (rep.length > 0) return `${rep.join(", ")} está dos veces en «${nombreDelBloque(b, i)}»: deja una sola fila por especie en cada bloque.`;
  }
  return null;
}

// ─── Desde lo guardado (pestaña «Registro y saldo») ─────────────────────────

/** Una especie de un bloque guardado, vuelta fila para corregirla. */
function filaDesdeEspecieDelBloque(e: EspecieDelBloque, bloque: string): FilaEspecie {
  return {
    ...filaDesdeEspecie({
      id: filaVacia().uid,
      speciesCommon: e.speciesCommon,
      speciesScientific: e.speciesScientific,
      cites: e.cites,
      volumenAutorizadoM3: String(e.volumenM3),
      arbolesAutorizados: e.arboles,
      anioInstalacion: e.anioInstalacion,
      superficieHa: e.superficieHa != null ? String(e.superficieHa) : null,
      precioVentaSoles: e.precioVentaSoles != null ? String(e.precioVentaSoles) : null,
    }),
    bloque,
  };
}

/** El reparto guardado, listo para editarlo. */
export function edicionDesdeReparto(reparto: readonly BloqueDelPlan[]): { bloques: BloqueEnEdicion[]; filas: FilaEspecie[] } {
  const bloques = reparto.map((b) => bloqueNuevo(b.nombre));
  const filas = reparto.flatMap((b, i) => b.especies.map((e) => filaDesdeEspecieDelBloque(e, bloques[i]!.uid)));
  return { bloques, filas };
}

/**
 * Un plan que todavía no tiene reparto: lo registrado entra entero al Bloque 1
 * (con sus árboles, ha y m³) y desde ahí se reparte. Así la suma arranca
 * cuadrando con el registro y sólo se mueve lo que se mueve.
 */
export function edicionDesdeRegistro(
  registradas: readonly Parameters<typeof filaDesdeEspecie>[0][],
): { bloques: BloqueEnEdicion[]; filas: FilaEspecie[] } {
  const uno = bloqueNuevo();
  const filas = registradas.map((s) => ({ ...filaDesdeEspecie({ ...s, id: filaVacia().uid }), bloque: uno.uid }));
  return { bloques: [uno], filas: filas.length > 0 ? filas : [{ ...filaVacia(), bloque: uno.uid }] };
}
