/**
 * Autofiltros en cascada, como Excel (Brandon 23-10: «se anidan entre ellas…
 * para ir filtrando más a detalle»): la lista de cada columna ofrece sólo lo
 * que dejan los filtros de las DEMÁS columnas, nunca la suya propia.
 */
import { describe, expect, it } from "vitest";
import { opcionesEnCascada, type ColumnaFiltro } from "@/lib/admin/filtros-columna";

type Fila = { persona: string; estado: string; monto: number };

const FILAS: Fila[] = [
  { persona: "Ana", estado: "Abierto", monto: 100 },
  { persona: "Ana", estado: "Cancelado", monto: 50 },
  { persona: "Beto", estado: "Cancelado", monto: 300 },
  { persona: "Caro", estado: "Abierto", monto: 20 },
];

const COLUMNAS: ColumnaFiltro<Fila>[] = [
  { id: "persona", label: "Persona", tipo: "multi", valor: (f) => f.persona },
  { id: "estado", label: "Estado", tipo: "multi", valor: (f) => f.estado },
  { id: "monto", label: "Monto", tipo: "rango", numero: (f) => f.monto },
];

const valores = (o: { value: string }[]) => o.map((x) => x.value).sort();

describe("opcionesEnCascada", () => {
  it("sin filtros ofrece todo", () => {
    const o = opcionesEnCascada(FILAS, COLUMNAS, {});
    expect(valores(o.persona)).toEqual(["Ana", "Beto", "Caro"]);
    expect(valores(o.estado)).toEqual(["Abierto", "Cancelado"]);
    expect(o.monto).toBeUndefined();
  });

  it("elegir «Abierto» deja en Persona sólo a quien tiene uno abierto, con su cuenta", () => {
    const o = opcionesEnCascada(FILAS, COLUMNAS, { estado: ["Abierto"] });
    expect(valores(o.persona)).toEqual(["Ana", "Caro"]);
    expect(o.persona.find((x) => x.value === "Ana")?.count).toBe(1);
  });

  it("la columna filtrada sigue ofreciendo sus otras opciones (no se filtra a sí misma)", () => {
    const o = opcionesEnCascada(FILAS, COLUMNAS, { estado: ["Abierto"] });
    expect(valores(o.estado)).toEqual(["Abierto", "Cancelado"]);
  });

  it("un rango también recorta las listas de las demás", () => {
    const o = opcionesEnCascada(FILAS, COLUMNAS, { monto: { min: 60, max: null } });
    expect(valores(o.persona)).toEqual(["Ana", "Beto"]);
  });

  it("lo tildado que otra columna dejó en cero sigue a la vista con 0, para poder destildarlo", () => {
    const o = opcionesEnCascada(FILAS, COLUMNAS, { persona: ["Beto"], estado: ["Abierto"] });
    expect(o.persona.find((x) => x.value === "Beto")?.count).toBe(0);
    expect(valores(o.estado)).toEqual(["Abierto", "Cancelado"]);
  });
});
