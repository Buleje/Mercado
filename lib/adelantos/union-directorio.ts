/**
 * «Unir con su ficha del Directorio forestal» desde la persona de Adelantos
 * (Brandon 25-10). Lo que arma la respuesta de
 * `GET /api/adelantos/beneficiarios/[id]/directorio`: a quién está unida, a
 * quién se parece y qué fichas calzan con lo que escribes (nombre, RUC o DNI).
 *
 * El vínculo lo escribe el PATCH `vincular_parte` de siempre (ADR-412 §5,
 * ADR-449): acá sólo se lee. El documento sale enmascarado (Ley 29733): basta
 * para distinguir a dos homónimos, no para copiarlo.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */
import { enmascararDocumento } from "@/lib/adelantos/entregar-tipos";
import { normalizarNombre, sugerirVinculo, type VinculoSugerido } from "@/lib/adelantos/vinculo-sugerido";

/** Lo mínimo de una ficha del directorio. */
export interface ParteDelDirectorio {
  id: string;
  nombre: string;
  docTipo: string | null;
  docNumero: string | null;
  activo: boolean;
}

/** Una ficha como la ve la pantalla. */
export interface ParteCorta {
  id: string;
  nombre: string;
  /** «RUC ••••••••438»; null sin documento. */
  documento: string | null;
  activo: boolean;
  /** Otra persona de Adelantos ya unida a esta ficha: no se puede elegir. */
  unidaA: string | null;
}

export interface UnionDirectorio {
  unida: ParteCorta | null;
  /** Sólo el motivo y la ficha enmascarada: el documento entero se compara acá y no viaja. */
  sugerida: { motivo: VinculoSugerido<{ parteId: string; nombre: string; documento: string | null }>["motivo"]; parte: ParteCorta } | null;
  resultados: ParteCorta[];
}

const TOPE_RESULTADOS = 8;
const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function parteCorta(p: ParteDelDirectorio, unidaA: string | null): ParteCorta {
  const doc = enmascararDocumento(p.docNumero);
  return {
    id: p.id,
    nombre: p.nombre,
    documento: doc ? `${p.docTipo ?? "Doc."} ${doc}` : null,
    activo: p.activo,
    unidaA,
  };
}

/**
 * @param persona  la ficha de Adelantos (su `forestPartyId` y su documento sin enmascarar: sólo se compara).
 * @param partes   el directorio del negocio (con las dadas de baja: la unida puede estarlo).
 * @param unidas   parteId → nombre de la persona de Adelantos que ya la tiene (sin contar a esta).
 * @param q        lo que escribió: nombre, RUC o DNI. Menos de 2 letras = sin búsqueda.
 */
export function armarUnionDirectorio(
  persona: { id: string; nombre: string; documento: string | null; forestPartyId: string | null },
  partes: readonly ParteDelDirectorio[],
  unidas: ReadonlyMap<string, string>,
  q: string,
): UnionDirectorio {
  const corta = (p: ParteDelDirectorio) => parteCorta(p, unidas.get(p.id) ?? null);
  const suya = persona.forestPartyId ? partes.find((p) => p.id === persona.forestPartyId) : undefined;
  const unida = suya ? corta(suya) : null;
  /* Se ofrecen sólo las activas y libres: unir una dada de baja o la de otra
     persona lo rechaza el servidor (409) — mejor no ofrecerlas. */
  const libres = partes.filter((p) => p.activo && !unidas.has(p.id) && p.id !== persona.forestPartyId);

  let sugerida: UnionDirectorio["sugerida"] = null;
  if (!unida) {
    const s = sugerirVinculo(
      { nombre: persona.nombre, documento: persona.documento },
      libres.map((p) => ({ parteId: p.id, nombre: p.nombre, documento: p.docNumero })),
    );
    const p = s ? libres.find((x) => x.id === s.candidata.parteId) : undefined;
    if (s && p) sugerida = { motivo: s.motivo, parte: corta(p) };
  }

  const texto = normalizarNombre(q);
  const digitos = soloDigitos(q);
  const buscar = texto.replace(/\s/g, "").length >= 2 || digitos.length >= 3;
  const resultados = buscar
    ? partes
        .filter((p) => p.activo && p.id !== persona.forestPartyId)
        .filter((p) =>
          (digitos.length >= 3 && soloDigitos(p.docNumero).includes(digitos)) ||
          (texto.length >= 2 && normalizarNombre(p.nombre).includes(texto)),
        )
        /* Las libres primero: las que ya tienen otra persona se muestran para que se entienda por qué no salen. */
        .sort((a, b) => Number(unidas.has(a.id)) - Number(unidas.has(b.id)) || a.nombre.localeCompare(b.nombre, "es"))
        .slice(0, TOPE_RESULTADOS)
        .map(corta)
    : [];

  return { unida, sugerida, resultados };
}
