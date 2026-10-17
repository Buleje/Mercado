import { describe, expect, it } from "vitest";
import { correrColumna, fusionarOrden, moverColumna, ordenCambiado } from "@/lib/admin/orden-columnas";

const DEF = ["fecha", "doc", "proveedor", "especies", "cantidad"];

describe("fusionarOrden", () => {
  it("sin nada guardado devuelve el orden por defecto", () => {
    expect(fusionarOrden(null, DEF)).toEqual(DEF);
    expect(fusionarOrden([], DEF)).toEqual(DEF);
  });

  it("respeta lo guardado", () => {
    const g = ["cantidad", "fecha", "doc", "proveedor", "especies"];
    expect(fusionarOrden(g, DEF)).toEqual(g);
  });

  it("descarta ids que la tabla ya no tiene y duplicados", () => {
    expect(fusionarOrden(["x", "doc", "doc", "fecha", "proveedor", "especies", "cantidad"], DEF)).toEqual([
      "doc",
      "fecha",
      "proveedor",
      "especies",
      "cantidad",
    ]);
  });

  it("una columna nueva entra detrás de su vecina por defecto, no al final", () => {
    // «proveedor» no estaba guardada; su vecina izquierda por defecto es «doc».
    expect(fusionarOrden(["cantidad", "fecha", "doc", "especies"], DEF)).toEqual([
      "cantidad",
      "fecha",
      "doc",
      "proveedor",
      "especies",
    ]);
  });

  it("una nueva sin vecina a la izquierda va primera", () => {
    expect(fusionarOrden(["doc", "proveedor", "especies", "cantidad"], DEF)[0]).toBe("fecha");
  });
});

describe("moverColumna", () => {
  it("suelta antes o después de la destino", () => {
    expect(moverColumna(DEF, "cantidad", "doc", "antes")).toEqual(["fecha", "cantidad", "doc", "proveedor", "especies"]);
    expect(moverColumna(DEF, "fecha", "proveedor", "despues")).toEqual(["doc", "proveedor", "fecha", "especies", "cantidad"]);
  });

  it("sobre sí misma o con ids ajenos no cambia nada", () => {
    expect(moverColumna(DEF, "doc", "doc", "antes")).toEqual(DEF);
    expect(moverColumna(DEF, "zz", "doc", "antes")).toEqual(DEF);
  });
});

describe("correrColumna", () => {
  it("un paso entre las visibles salta las ocultas", () => {
    // «doc» oculta: correr «proveedor» a la izquierda la pone antes de «fecha».
    const vis = ["fecha", "proveedor", "especies", "cantidad"];
    expect(correrColumna(DEF, "proveedor", -1, vis)).toEqual(["proveedor", "fecha", "doc", "especies", "cantidad"]);
  });

  it("en el borde no se mueve", () => {
    expect(correrColumna(DEF, "fecha", -1)).toEqual(DEF);
    expect(correrColumna(DEF, "cantidad", 1)).toEqual(DEF);
  });
});

describe("ordenCambiado", () => {
  it("detecta el cambio", () => {
    expect(ordenCambiado(DEF, DEF)).toBe(false);
    expect(ordenCambiado(moverColumna(DEF, "fecha", "doc", "despues"), DEF)).toBe(true);
  });
});
