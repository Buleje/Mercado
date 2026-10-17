/**
 * organizacion/organigrama-arbol.ts — el árbol del organigrama a partir de
 * `reportaA` (ADR-497). Puro.
 *
 * Aguanta datos torcidos: un `reportaA` que apunta a un cargo borrado cuenta
 * como cabeza, y un ciclo (A reporta a B y B a A, escrito a mano o por una
 * versión vieja) se corta en el primer cargo que se repite: nadie se dibuja
 * dos veces ni el dibujo entra en un bucle.
 */
import type { DatosSeccion } from "@/lib/planificacion/secciones";

export type Cargo = DatosSeccion<"organizacion">["cargos"][number];
export type Area = DatosSeccion<"organizacion">["areas"][number];

export interface NodoCargo {
  cargo: Cargo;
  hijos: NodoCargo[];
}

export function construirArbol(cargos: readonly Cargo[]): NodoCargo[] {
  const ids = new Set(cargos.map((c) => c.id));
  const hijos = new Map<string, Cargo[]>();
  for (const c of cargos) {
    const padre = c.reportaA && ids.has(c.reportaA) && c.reportaA !== c.id ? c.reportaA : "";
    hijos.set(padre, [...(hijos.get(padre) ?? []), c]);
  }
  const vistos = new Set<string>();
  const armar = (c: Cargo): NodoCargo => {
    vistos.add(c.id);
    return { cargo: c, hijos: (hijos.get(c.id) ?? []).filter((h) => !vistos.has(h.id)).map(armar) };
  };
  const raices = (hijos.get("") ?? []).map(armar);
  // Lo que quedó sin dibujar está en un ciclo: el primero de cada ciclo pasa a cabeza.
  for (const c of cargos) if (!vistos.has(c.id)) raices.push(armar(c));
  return raices;
}

/** Los cargos que están debajo de `id`, a cualquier profundidad. */
export function descendientes(cargos: readonly Cargo[], id: string): Set<string> {
  const out = new Set<string>();
  const pendientes = [id];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const c of cargos) {
      if (c.reportaA === actual && !out.has(c.id) && c.id !== id) {
        out.add(c.id);
        pendientes.push(c.id);
      }
    }
  }
  return out;
}

/** A quién puede reportar un cargo sin armar un ciclo: ni a sí mismo ni a alguien que tiene debajo. */
export function jefesPosibles(cargos: readonly Cargo[], id: string | null): Cargo[] {
  if (!id) return [...cargos];
  const abajo = descendientes(cargos, id);
  return cargos.filter((c) => c.id !== id && !abajo.has(c.id));
}

/** Borra un cargo y sube a sus reportes un nivel (pasan a reportar a su jefe). */
export function quitarCargo(cargos: readonly Cargo[], id: string): Cargo[] {
  const quitado = cargos.find((c) => c.id === id);
  const jefe = quitado?.reportaA ?? "";
  return cargos.filter((c) => c.id !== id).map((c) => (c.reportaA === id ? { ...c, reportaA: jefe === id ? "" : jefe } : c));
}

/** Un organigrama típico para empezar: dueño, administración, ventas y almacén. */
export function organigramaTipico(nuevoId: () => string): { areas: Area[]; cargos: Cargo[] } {
  const a = { gerencia: nuevoId(), ventas: nuevoId(), operaciones: nuevoId() };
  const c = { dueno: nuevoId(), admin: nuevoId(), ventas: nuevoId(), almacen: nuevoId() };
  const cargo = (id: string, nombre: string, areaId: string, reportaA: string, funciones: string[]): Cargo => ({ id, nombre, areaId, reportaA, persona: "", funciones });
  return {
    areas: [
      { id: a.gerencia, nombre: "Gerencia" },
      { id: a.ventas, nombre: "Ventas" },
      { id: a.operaciones, nombre: "Operaciones" },
    ],
    cargos: [
      cargo(c.dueno, "Gerente general", a.gerencia, "", ["Decide el rumbo del negocio", "Aprueba compras grandes y precios"]),
      cargo(c.admin, "Administración", a.gerencia, c.dueno, ["Lleva la caja y los pagos", "Paga a proveedores y al personal"]),
      cargo(c.ventas, "Ventas y atención", a.ventas, c.dueno, ["Atiende y cobra", "Mantiene el orden del local"]),
      cargo(c.almacen, "Almacén", a.operaciones, c.dueno, ["Recibe la mercadería", "Controla el stock y los vencimientos"]),
    ],
  };
}
