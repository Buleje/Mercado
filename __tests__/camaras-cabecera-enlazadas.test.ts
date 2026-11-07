/** «Ver todas en vivo» desde la cabecera: qué cámaras recibe el mosaico. */
import { describe, expect, it } from "vitest";
import { camarasEnlazadas } from "@/components/admin/header/camaras-enlazadas";

const LISTA = {
  camaras: [
    { id: "a", nombre: "Patio", zonasIgnorar: [] },
    { id: "b", nombre: "Puerta" },
    { id: "c", nombre: "Oficina" },
  ],
};

describe("camarasEnlazadas", () => {
  it("sólo las enlazadas, en el orden de la lista, con su conCodigo", () => {
    const r = camarasEnlazadas(LISTA, { vinculado: true, enlaces: { c: { conCodigo: true }, a: { conCodigo: false } } });
    expect(r.vinculado).toBe(true);
    expect(r.mosaico).toEqual([
      { id: "a", nombre: "Patio", conCodigo: false },
      { id: "c", nombre: "Oficina", conCodigo: true },
    ]);
    expect(r.crudas).toHaveLength(3);
  });
  it("Hik-Connect sin vincular → nada para el mosaico", () => {
    const r = camarasEnlazadas(LISTA, { vinculado: false, enlaces: { a: { conCodigo: true } } });
    expect(r).toMatchObject({ mosaico: [], vinculado: false });
  });
  it("respuestas rotas no rompen: lista vacía", () => {
    expect(camarasEnlazadas(null, null)).toEqual({ mosaico: [], crudas: [], vinculado: false });
    expect(camarasEnlazadas({ camaras: "x" }, { vinculado: true, enlaces: {} }).mosaico).toEqual([]);
  });
  it("un enlace sin conCodigo cuenta como sin código", () => {
    const r = camarasEnlazadas(LISTA, { vinculado: true, enlaces: { b: {} } });
    expect(r.mosaico).toEqual([{ id: "b", nombre: "Puerta", conCodigo: false }]);
  });
});
