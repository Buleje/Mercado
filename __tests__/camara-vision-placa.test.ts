/**
 * La placa que lee la cámara (ADR-411 · fase 2).
 *
 * Esto se prueba aparte porque es lo que puede terminar en un papel oficial: la
 * placa de un camión cruzada contra una guía forestal. Media placa, una placa
 * inventada o una leída de noche valen menos que un «no se lee» — el resto del
 * flujo ya sabe qué hacer con `null`, no con un dato falso.
 */

import { describe, expect, it } from "vitest";
import { normalizarPlaca } from "@/lib/ai/camara-vision";

describe("normalizarPlaca", () => {
  it("le pone el guion donde va, en mayúsculas", () => {
    expect(normalizarPlaca("abc123")).toBe("ABC-123");
    expect(normalizarPlaca("ABC-123")).toBe("ABC-123");
    expect(normalizarPlaca(" a1b 234 ")).toBe("A1B-234");
  });

  it("acepta las de siete caracteres (camiones y remolques)", () => {
    expect(normalizarPlaca("A1B234")).toBe("A1B-234");
    expect(normalizarPlaca("AB1C234")).toBe("AB1C-234");
  });

  it("media placa no es una placa", () => {
    expect(normalizarPlaca("ABC")).toBeNull();
    expect(normalizarPlaca("12")).toBeNull();
    expect(normalizarPlaca("")).toBeNull();
    expect(normalizarPlaca(null)).toBeNull();
  });

  it("lo que no entra en el formato se descarta en vez de recortarse", () => {
    expect(normalizarPlaca("ABC12345678")).toBeNull();
  });

  it("una FRASE no es una placa, aunque tenga el largo justo", () => {
    /* Bug real: «no se lee» sin espacios es NOSELEE (7 caracteres) y entraba
       como «NOSE-LEE». Las placas peruanas terminan en tres dígitos. */
    expect(normalizarPlaca("no se lee")).toBeNull();
    expect(normalizarPlaca("ilegible")).toBeNull();
    expect(normalizarPlaca("SIN DATO")).toBeNull();
  });

  it("sin letras adelante tampoco: seis dígitos no son una placa", () => {
    expect(normalizarPlaca("123456")).toBeNull();
  });
});
