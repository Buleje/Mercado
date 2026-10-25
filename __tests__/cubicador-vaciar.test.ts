/**
 * __tests__/cubicador-vaciar.test.ts
 *
 * La pregunta de «Vaciar» (Brandon, 2026-10-24): dice cuánto se va y qué queda
 * a salvo. Lo que no puede pasar es decir «se pierde» de algo guardado, ni
 * callar que se pierde algo que no lo está.
 */
import { describe, expect, it } from "vitest";
import { avisoVaciarLecturas, avisoVaciarLote, avisoVaciarPatio, avisoVaciarTrasera } from "@/lib/forestal/cubicador-vaciar";

describe("avisoVaciarLote", () => {
  it("sin guardar avisa que se pierde", () => {
    const a = avisoVaciarLote({ piezas: 513, pt: "7,507.98", guardada: null, cambiosSinGuardar: true });
    expect(a.title).toBe("¿Vaciar el lote?");
    expect(a.description).toContain("513 piezas (7,507.98 PT)");
    expect(a.description).toContain("No está guardado: se pierde.");
    expect(a).toMatchObject({ intent: "danger", confirmLabel: "Sí, vaciar" });
  });

  it("guardada y sin cambios: la guardada no se toca", () => {
    const a = avisoVaciarLote({ piezas: 1, pt: "10", guardada: "Lote López", cambiosSinGuardar: false });
    expect(a.description).toContain("1 pieza (10 PT)");
    expect(a.description).toContain("La guardada «Lote López» no se toca.");
    expect(a.description).not.toContain("se pierde");
  });

  it("guardada con cambios: avisa que los cambios se pierden", () => {
    const a = avisoVaciarLote({ piezas: 3, pt: "30", guardada: "Lote López", cambiosSinGuardar: true });
    expect(a.description).toContain("lo que cambiaste sin guardar se pierde");
  });

  it("ya en el Libro y sin guardar: no dice que se pierde", () => {
    const a = avisoVaciarLote({ piezas: 3, pt: "30", guardada: null, cambiosSinGuardar: true, enElLibro: true });
    expect(a.description).toContain("Lo registrado en el Libro no se toca.");
    expect(a.description).not.toContain("se pierde");
  });
});

describe("avisoVaciarPatio", () => {
  it("cuenta las trozas con su unidad", () => {
    const a = avisoVaciarPatio({ trozas: 12, volumen: "4.250", unidad: "m³" });
    expect(a.title).toBe("¿Vaciar el patio?");
    expect(a.description).toContain("12 trozas (4.250 m³)");
  });
});

describe("avisoVaciarTrasera", () => {
  it("cuenta las piezas y aclara que siguen en el lote", () => {
    const a = avisoVaciarTrasera({ piezas: 70, pt: "1,520.00" });
    expect(a.title).toBe("¿Vaciar la trasera?");
    expect(a.description).toContain("70 piezas (1,520.00 PT)");
    expect(a.description).toContain("Las piezas siguen en el lote.");
    expect(a).toMatchObject({ intent: "danger", confirmLabel: "Sí, vaciar" });
  });

  it("una pieza en singular", () => {
    const d = avisoVaciarTrasera({ piezas: 1, pt: "10" }).description;
    expect(d).toContain("Se quita su pieza (10 PT)");
    expect(d).toContain("La pieza sigue en el lote.");
  });
});

describe("avisoVaciarLecturas", () => {
  it("cuenta las lecturas y dice que el libro no se toca", () => {
    const a = avisoVaciarLecturas({ trozas: 8, m3: "3.214" });
    expect(a.title).toBe("¿Vaciar la lista?");
    expect(a.description).toContain("8 trozas leídas (3.214 m³)");
    expect(a.description).toContain("Las trozas del libro no se tocan");
  });

  it("una sola lectura en singular", () => {
    expect(avisoVaciarLecturas({ trozas: 1, m3: "0.512" }).description).toContain("Se borra la troza leída (0.512 m³)");
  });
});
