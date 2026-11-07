/**
 * La presentación de la tarjeta de Musa (`presentacionDe`): sale sólo de lo
 * cargado —ficha técnica, unidad, kit o la cantidad escrita— y nunca se inventa.
 * Los textos son los de la base de Musa al 17-10.
 */
import { describe, expect, it } from "vitest";
import { leerFicha, presentacionDe } from "@/extensiones/pagina-musa/presentacion";

const base = { nombre: "Producto", descripcion: null, unidad: "unidad", ficha: [], kit: null };

describe("presentacionDe", () => {
  it("la ficha técnica del panel manda sobre todo lo demás", () => {
    const ficha = leerFicha(JSON.stringify([{ label: "Origen", value: "Corea" }, { label: "Contenido neto", value: "250 ml" }]));
    expect(presentacionDe({ ...base, ficha, unidad: "500 g", descripcion: "Formato de 1000 ml." })).toBe("250 ml");
  });

  it("una unidad que no es la genérica se muestra tal cual; «unidad» no", () => {
    expect(presentacionDe({ ...base, unidad: "500 g" })).toBe("500 g");
    expect(presentacionDe({ ...base, unidad: "und" })).toBeNull();
    expect(presentacionDe({ ...base, unidad: "unidad" })).toBeNull();
  });

  it("un kit cuenta lo que trae; un dúo, sus unidades", () => {
    const kit = { componentes: [{ cantidad: 1 }, { cantidad: 1 }, { cantidad: 1 }] };
    expect(presentacionDe({ ...base, kit, descripcion: "Incluye: …, Mascarillas faciales en lámina (× 5)." })).toBe("3 productos");
    expect(presentacionDe({ ...base, kit: { componentes: [{ cantidad: 2 }] } })).toBe("2 unidades");
  });

  it("lee la cantidad escrita en la descripción o el nombre (MU001, MU016)", () => {
    expect(presentacionDe({ ...base, descripcion: "Ayuda a limpiar sin resecar y a alargar el efecto de alisados y tintes. Formato de 1000 ml." })).toBe("1000 ml");
    expect(presentacionDe({ ...base, descripcion: "Pack de 5 láminas que ayudan a hidratar." })).toBe("Pack × 5");
    expect(presentacionDe({ ...base, nombre: "Mascarillas faciales en lámina (× 5)" })).toBe("Pack × 5");
    expect(presentacionDe({ ...base, descripcion: "Crema de 1,5 L para el cuerpo." })).toBe("1,5 L");
  });

  it("sin dato no inventa: FPS 50, 10 % o «2-3 horas» no son presentación", () => {
    expect(presentacionDe({ ...base, nombre: "Protector solar facial FPS 50", descripcion: "Renuévalo cada 2-3 horas. Niacinamida 10 %." })).toBeNull();
  });
});

describe("leerFicha", () => {
  it("texto roto, vacío o filas sin valor → se descartan", () => {
    expect(leerFicha(null)).toEqual([]);
    expect(leerFicha("{no es json")).toEqual([]);
    expect(leerFicha(JSON.stringify({ label: "x" }))).toEqual([]);
    expect(leerFicha(JSON.stringify([{ label: " Ingredientes ", value: " Urea 10 % " }, { label: "", value: "x" }, { label: "Peso", value: 30 }]))).toEqual([
      { etiqueta: "Ingredientes", valor: "Urea 10 %" },
      { etiqueta: "Peso", valor: "30" },
    ]);
  });
});
