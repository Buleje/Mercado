/**
 * Operaciones hermanas del CTP (ADR-395): las reglas que se deciden sin base.
 */

import { describe, expect, it } from "vitest";
import { nombreDeOperacionValido, puedeCambiarA, slugDeOperacion, type GrupoOperaciones } from "@/lib/forestal/ctp-operaciones";

describe("el slug de una hermana", () => {
  it("sale del slug base más el nombre, sin tildes ni espacios", () => {
    expect(slugDeOperacion("blas-sa", "Secado y Cepillado")).toBe("blas-sa-op-secado-y-cepillado");
    expect(slugDeOperacion("blas-sa", "Ñandú Ágil")).toBe("blas-sa-op-nandu-agil");
  });

  it("una hermana de una hermana cuelga del libro raíz, no encadena `-op-`", () => {
    expect(slugDeOperacion("blas-sa-op-secado", "Tercera")).toBe("blas-sa-op-tercera");
  });

  it("un nombre sin letras válidas no deja el slug vacío", () => {
    expect(slugDeOperacion("blas", "!!!")).toBe("blas-op-2");
  });
});

describe("el nombre de una operación", () => {
  it("rechaza vacío, sin letras o demasiado largo", () => {
    expect(nombreDeOperacionValido(" ")).toMatch(/2 letras/);
    expect(nombreDeOperacionValido("1234")).toMatch(/alguna letra/);
    expect(nombreDeOperacionValido("a".repeat(61))).toMatch(/Máximo/);
    expect(nombreDeOperacionValido("Secado")).toBeNull();
  });
});

describe("a dónde se puede cambiar", () => {
  const grupo: GrupoOperaciones = {
    grupoId: "g1",
    operaciones: [
      { tenantId: "a", slug: "blas", nombre: "Aserrío", accesible: true, actual: true },
      { tenantId: "b", slug: "blas-op-secado", nombre: "Secado", accesible: true, actual: false },
      { tenantId: "c", slug: "blas-op-terceros", nombre: "Terceros", accesible: false, actual: false },
    ],
  };

  it("sólo a una hermana accesible que no sea la actual", () => {
    expect(puedeCambiarA(grupo, "blas-op-secado")?.tenantId).toBe("b");
    expect(puedeCambiarA(grupo, "blas")).toBeNull(); // la actual
    expect(puedeCambiarA(grupo, "blas-op-terceros")).toBeNull(); // sin cuenta ahí
    expect(puedeCambiarA(grupo, "otro")).toBeNull(); // fuera del grupo
    expect(puedeCambiarA(null, "blas-op-secado")).toBeNull(); // libro único
  });
});
