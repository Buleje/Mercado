import { describe, it, expect } from "vitest";
import { documentoDelTitular, mismaPersona } from "@/lib/forestal/serfor-titular";

/** El RUC de la instancia (ATFFS) nunca es del proveedor: medido en Blas, 26 de 26. */
describe("documentoDelTitular", () => {
  it("usa el RUC del propietario cuando el propietario ES el titular", () => {
    expect(
      documentoDelTitular({ titular: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", propietario: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", propietarioDoc: "20156701263" }),
    ).toEqual({ numero: "20156701263", tipo: "RUC" });
  });
  it("el propietario escrito un poco distinto sigue siendo el mismo («NATIVA» de más)", () => {
    expect(
      documentoDelTitular({ titular: "COMUNIDAD SANTA ROSA DE CHIVIS", propietario: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", propietarioDoc: "20604112233" })?.numero,
    ).toBe("20604112233");
  });
  it("si el propietario es OTRA persona, no hay documento del titular", () => {
    expect(documentoDelTitular({ titular: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", propietario: "QUINCHUNLLA PEREZ, NELLY", propietarioDoc: "10456789012" })).toBeNull();
  });
  it("DNI de 8 dígitos; lo que no es RUC ni DNI no se inventa", () => {
    expect(documentoDelTitular({ titular: "JUAN PEREZ", propietario: "JUAN PEREZ", propietarioDoc: "45678912" })).toEqual({ numero: "45678912", tipo: "DNI" });
    expect(documentoDelTitular({ titular: "JUAN PEREZ", propietario: "JUAN PEREZ", propietarioDoc: "123" })).toBeNull();
  });
  it("«RUC / DNI» juntos: vale el primero", () => {
    expect(documentoDelTitular({ titular: "X SAC", propietario: "X SAC", propietarioDoc: "20111111111 / 45678912" })?.numero).toBe("20111111111");
  });
  it("sin propietario publicado no hay de dónde sacarlo", () => {
    expect(documentoDelTitular({ titular: "X SAC", propietario: null, propietarioDoc: "20111111111" })).toBeNull();
  });
});

describe("mismaPersona (las mismas palabras, no «una contiene a la otra»)", () => {
  it("padre e hijo NO son la misma persona", () => {
    expect(mismaPersona("PEREZ GARCIA JUAN", "PEREZ GARCIA JUAN CARLOS")).toBe(false);
    expect(documentoDelTitular({ titular: "PEREZ GARCIA JUAN", propietario: "PEREZ GARCIA JUAN CARLOS", propietarioDoc: "45678912" })).toBeNull();
  });
  it("una comunidad no se lleva el RUC de otra cuyo nombre la contiene", () => {
    expect(mismaPersona("COMUNIDAD NATIVA SAN MARTIN", "EMPRESA FORESTAL NUEVO SAN MARTIN SAC")).toBe(false);
  });
  it("el orden y la coma no importan; el relleno tampoco", () => {
    expect(mismaPersona("QUINCHUNLLA PEREZ, NELLY", "NELLY QUINCHUNLLA PEREZ")).toBe(true);
    expect(mismaPersona("COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", "COMUNIDAD SANTA ROSA DE CHIVIS")).toBe(true);
    expect(mismaPersona("MADERERA DEL ORIENTE S.A.C.", "Maderera del Oriente")).toBe(true);
  });
});
