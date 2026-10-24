/**
 * Lo que se imprime en una guía no puede ejecutar código.
 *
 * Las dos funciones de impresión de `LothGtfView` arman HTML a mano y lo meten
 * en `document.write` de una ventana nueva. Todo lo que va ahí —titular,
 * transportista, placa, observaciones, motivo de anulación, código y especie de
 * cada troza— lo tipea una persona en el formulario y llega desde la base SIN
 * pasar por React, que es lo que normalmente escapa por nosotros.
 *
 * La ventana comparte origen con el panel: un `<img onerror>` en «observaciones»
 * corría con la sesión del dueño.
 *
 * Este test protege el `esc()` COMPARTIDO (`ctp-documento-print`), que es el que
 * usan tanto la hoja oficial del CTP como la guía interna del libro TH. Si
 * alguien lo "simplifica", esto avisa.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { esc } = await import("@/lib/forestal/ctp-documento-print");

describe("los vectores que llegarían por un campo del formulario", () => {
  const casos: Array<[string, string]> = [
    ["etiqueta con handler", '<img src=x onerror="alert(1)">'],
    ["script directo", "<script>alert(1)</script>"],
    ["cierre de atributo", '" onmouseover="alert(1)'],
    ["cierre de etiqueta", "</td><script>alert(1)</script>"],
    ["svg con onload", "<svg/onload=alert(1)>"],
  ];

  for (const [nombre, payload] of casos) {
    it(`${nombre} sale inerte`, () => {
      const salida = esc(payload);
      expect(salida).not.toContain("<");
      expect(salida).not.toContain(">");
      // Sin `<` ni `>` no hay etiqueta que el parser pueda abrir.
      expect(salida).not.toMatch(/<\s*(script|img|svg)/i);
    });
  }

  it("las comillas dobles se escapan: si no, se cierra el atributo y se inyecta un handler", () => {
    expect(esc('" onmouseover="x')).not.toContain('"');
  });
});

describe("no rompe el texto normal de una guía", () => {
  it("un nombre con ampersand se ve bien", () => {
    expect(esc("Maderera Blas & Hijos")).toBe("Maderera Blas &amp; Hijos");
  });

  it("las tildes y la ñ pasan intactas", () => {
    expect(esc("Camión Ñandú · Ucayali")).toBe("Camión Ñandú · Ucayali");
  });

  it("una placa normal no se toca", () => {
    expect(esc("A4B-892")).toBe("A4B-892");
  });

  it("un número llega como texto, no como «undefined»", () => {
    expect(esc(12.5)).toBe("12.5");
  });
});

describe("los vacíos no ensucian el papel", () => {
  it("null y undefined salen como cadena vacía, no como «null»", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("escapar dos veces no duplica el escape en la guía", () => {
  /**
   * No es idempotente —`&` se vuelve `&amp;` y eso se volvería `&amp;amp;`— y
   * está bien que no lo sea. Se fija acá para que quede claro que el escape va
   * UNA vez, al armar el HTML, y no en capas.
   */
  it("aplicar esc() sobre algo ya escapado se nota", () => {
    expect(esc(esc("Blas & Hijos"))).toBe("Blas &amp;amp; Hijos");
  });
});
