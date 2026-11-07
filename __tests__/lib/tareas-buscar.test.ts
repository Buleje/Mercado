import { describe, expect, it } from "vitest";
import { filtrarTareas, nombresDelEquipo, normalizarBusqueda, ordenarPorUrgencia } from "@/lib/admin/tareas-buscar";

const T = [
  { id: "1", title: "Contar el aceite", assignedTo: "Jhon Pérez", status: "pendiente" },
  { id: "2", title: "Pagar la luz", assignedTo: "Rosa Huamán", status: "completada" },
  { id: "3", title: "Ordenar el almacén", description: "aceite y arroz", assignedTo: null, status: "pendiente" },
];

describe("filtrarTareas", () => {
  it("sin búsqueda respeta sólo el estado", () => {
    expect(filtrarTareas(T, "todas", "").map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(filtrarTareas(T, "pendiente", "  ").map((t) => t.id)).toEqual(["1", "3"]);
  });
  it("busca en título, encargado y descripción, sin tildes ni mayúsculas", () => {
    expect(filtrarTareas(T, "todas", "perez").map((t) => t.id)).toEqual(["1"]);
    expect(filtrarTareas(T, "todas", "HUAMAN").map((t) => t.id)).toEqual(["2"]);
    expect(filtrarTareas(T, "todas", "aceite").map((t) => t.id)).toEqual(["1", "3"]);
  });
  it("cada palabra tiene que aparecer, no la frase seguida", () => {
    expect(filtrarTareas(T, "todas", "aceite jhon").map((t) => t.id)).toEqual(["1"]);
    expect(filtrarTareas(T, "completada", "aceite").map((t) => t.id)).toEqual([]);
  });
});

describe("nombresDelEquipo", () => {
  it("sin repetir, sin vacíos y en orden alfabético", () => {
    expect(nombresDelEquipo([{ nombre: "Rosa" }, { nombre: " Ángel " }, { nombre: "Rosa" }, { nombre: "" }])).toEqual(["Ángel", "Rosa"]);
  });
  it("normalizarBusqueda quita tildes", () => {
    expect(normalizarBusqueda("  Ríos ÑANDÚ ")).toBe("rios nandu");
  });
});

describe("ordenarPorUrgencia", () => {
  it("la que vence antes primero; sin fecha al final; a igual fecha, la de más prioridad", () => {
    const lista = [
      { id: "sin", priority: "urgente" },
      { id: "viernes-baja", dueDate: "2026-10-23", priority: "baja" },
      { id: "jueves", dueDate: "2026-10-22", priority: "media" },
      { id: "viernes-alta", dueDate: "2026-10-23", priority: "alta" },
    ];
    expect(ordenarPorUrgencia(lista).map((t) => t.id)).toEqual(["jueves", "viernes-alta", "viernes-baja", "sin"]);
  });
  it("no muta la lista y respeta el orden en los empates", () => {
    const lista = [{ id: "a", priority: "media" }, { id: "b", priority: "media" }, { id: "c", priority: "media" }];
    expect(ordenarPorUrgencia(lista).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(lista.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
