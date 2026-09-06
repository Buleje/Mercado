/**
 * Que la ficha de una persona sirva para encontrarla después.
 *
 * Dos cosas rompen una libreta con el tiempo: los documentos mal tipeados —un
 * DNI de 7 dígitos no es de nadie— y la misma persona cargada tres veces con el
 * nombre escrito distinto. Lo segundo es peor: cada copia lleva su propio saldo,
 * así que el tope de crédito deja de significar nada y la cobranza persigue a
 * un fantasma.
 *
 * Nada de esto BLOQUEA: en el mostrador puede haber un caso raro y frenar la
 * carga es peor que un dato imperfecto. Se avisa, y quien atiende decide.
 */

import { sinTildes } from "@/components/admin/adelantos/shared";

/** DNI peruano: 8 dígitos. RUC: 11 y arranca en 10/15/16/17/20. */
export function revisarDocumento(documento: string): string | null {
  const v = documento.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "El documento debería ser sólo números (DNI o RUC).";
  if (v.length === 8) return null;
  if (v.length === 11) {
    return /^(10|15|16|17|20)/.test(v) ? null : "Un RUC de 11 dígitos arranca con 10, 15, 16, 17 o 20.";
  }
  return "Un DNI tiene 8 dígitos y un RUC 11. Revisá el número.";
}

/** Celular peruano: 9 dígitos y empieza con 9. Los fijos con código pasan. */
export function revisarTelefono(telefono: string): string | null {
  const d = telefono.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 9) return d.startsWith("9") ? null : "Un celular peruano de 9 dígitos empieza con 9.";
  if (d.length < 6) return "El teléfono parece incompleto.";
  return null;
}

export type PersonaExistente = { id: string; nombre: string; documento?: string | null; telefono?: string | null };

export type Duplicado = { persona: PersonaExistente; motivo: "documento" | "telefono" | "nombre" };

/**
 * Alguien que probablemente ya está cargado.
 *
 * El documento y el teléfono son identidad: si coinciden, es la misma persona
 * casi seguro. El nombre se compara sin tildes ni mayúsculas —«José Pérez» y
 * «jose perez» son el mismo señor— pero como aviso más débil, porque dos
 * personas distintas sí pueden llamarse igual.
 */
export function buscarDuplicado(
  datos: { nombre: string; documento?: string; telefono?: string },
  existentes: readonly PersonaExistente[],
  /** Al editar, la persona no es duplicado de sí misma. */
  ignorarId?: string,
): Duplicado | null {
  const doc = (datos.documento ?? "").replace(/\D/g, "");
  const tel = (datos.telefono ?? "").replace(/\D/g, "");
  const nom = sinTildes(datos.nombre);
  if (!nom && !doc && !tel) return null;

  for (const p of existentes) {
    if (p.id === ignorarId) continue;
    const pDoc = (p.documento ?? "").replace(/\D/g, "");
    const pTel = (p.telefono ?? "").replace(/\D/g, "");
    if (doc && pDoc && doc === pDoc) return { persona: p, motivo: "documento" };
    if (tel && pTel && tel === pTel) return { persona: p, motivo: "telefono" };
    if (nom && sinTildes(p.nombre) === nom) return { persona: p, motivo: "nombre" };
  }
  return null;
}

/** Cómo se le cuenta al usuario, con el dato repetido a la vista. */
export function avisoDeDuplicado(d: Duplicado): string {
  const quien = d.persona.nombre;
  if (d.motivo === "documento") return `Ese documento ya es de ${quien}. ¿Es la misma persona?`;
  if (d.motivo === "telefono") return `Ese teléfono ya es de ${quien}. ¿Es la misma persona?`;
  return `Ya existe alguien que se llama ${quien}. Si son dos personas distintas, agregá el documento para distinguirlas.`;
}
