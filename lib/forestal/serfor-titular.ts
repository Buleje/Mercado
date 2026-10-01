/**
 * El RUC/DNI del TITULAR de una guía de SERFOR (revisión 2026-09-25).
 *
 * La consulta pública NO publica el documento del titular. Publica dos RUC:
 *  · «RUC de la Instancia que Registra» (`rucInstancia`): el de la ATFFS o el
 *    Gobierno Regional que registró la guía. NUNCA es del proveedor — medido en
 *    Blas: 26 de 26 ingresos lo guardaban como documento del proveedor, y el RUC
 *    20562836927 figuraba en dos titulares distintos.
 *  · El del propietario del producto (casillero 15, `propietarioDoc`): vale
 *    para el titular SÓLO si el propietario es el mismo titular.
 *
 * Si no son la misma persona, no hay documento del titular y se dice `null`:
 * un casillero vacío es honesto; uno con el RUC de otro, no.
 */


export interface DocumentoDelTitular {
  numero: string;
  tipo: "RUC" | "DNI";
}

export function documentoDelTitular(g: {
  titular?: string | null;
  propietario?: string | null;
  propietarioDoc?: string | null;
}): DocumentoDelTitular | null {
  const titular = (g.titular ?? "").trim();
  const propietario = (g.propietario ?? "").trim();
  if (!titular || !propietario) return null;
  if (!mismaPersona(propietario, titular)) return null;
  const numero = (g.propietarioDoc ?? "").split("/")[0]?.replace(/\D/g, "") ?? "";
  if (numero.length === 11) return { numero, tipo: "RUC" };
  if (numero.length === 8) return { numero, tipo: "DNI" };
  return null;
}

/**
 * Palabras que no distinguen a una persona de otra: el tipo de comunidad y la
 * forma societaria. «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS» y «COMUNIDAD SANTA
 * ROSA DE CHIVIS» son la misma; «SAC» de más tampoco cambia a nadie.
 */
const RELLENO = new Set([
  "COMUNIDAD", "NATIVA", "CAMPESINA", "CC", "NN", "CCNN", "CN",
  "SAC", "SA", "SRL", "EIRL", "SCRL", "SAA", "SOCIEDAD", "ANONIMA", "CERRADA", "EMPRESA", "INDIVIDUAL",
  "RESPONSABILIDAD", "LIMITADA",
]);

function palabras(nombre: string): Set<string> {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    // «S.A.C.» es una palabra: sin esto quedaba en «S», «A», «C» sueltas.
    .replace(/\./g, "")
    .replace(/[^A-Z0-9 ]/g, " ");
  return new Set(limpio.split(/\s+/).filter((w) => w && !RELLENO.has(w)));
}

/**
 * ¿Propietario y titular son la MISMA persona? Las mismas palabras, en
 * cualquier orden («QUINCHUNLLA PEREZ, NELLY» = «NELLY QUINCHUNLLA PEREZ»),
 * sin contar el relleno. NO sirve «uno contiene al otro» (revisión
 * 2026-09-25): «PEREZ GARCIA JUAN» se llevaba el DNI de «PEREZ GARCIA JUAN
 * CARLOS», y en un casillero de declaración jurada eso es declarar a otro.
 */
export function mismaPersona(a: string, b: string): boolean {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pa.size !== pb.size) return false;
  for (const w of pa) if (!pb.has(w)) return false;
  return true;
}
