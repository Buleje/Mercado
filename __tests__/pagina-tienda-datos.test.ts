import { describe, expect, it } from "vitest";
import { antesDe, armarCirculos, armarConfianza, armarFranja, armarHeroe, nombreDeCategoria, normalizarWhatsapp, ordenarCategorias, pagosDe } from "@/extensiones/pagina-tienda/armado";

const sinNada: Parameters<typeof armarConfianza>[0] = { pagos: [], envio: { gratisDesde: null, zonas: [] }, devolucionDias: null };

describe("armado de la tienda con datos faltantes", () => {
  it("confianza: sin datos no inventa ninguna promesa", () => {
    expect(armarConfianza({ ...sinNada, pagos: [] })).toEqual([]);
  });
  it("confianza: sólo muestra lo que existe", () => {
    const c = armarConfianza({ pagos: ["Yape", "Efectivo"], envio: { gratisDesde: 50, zonas: [] }, devolucionDias: null });
    expect(c.map((x) => x.titulo)).toEqual(["Envío gratis", "Paga como te acomode"]);
    expect(c[0].texto).toContain("S/ 50");
    expect(c[1].texto).toBe("Yape y efectivo");
  });
  it("confianza: los chips del editor mandan", () => {
    expect(armarConfianza(sinNada, [{ titulo: "Delivery en 30 min", texto: "En Pucallpa" }, "Atención 24 h"])).toEqual([
      { titulo: "Delivery en 30 min", texto: "En Pucallpa" },
      { titulo: "Atención 24 h", texto: "" },
    ]);
  });
  it("categorías: orden del negocio, ocultas fuera, resto por cantidad", () => {
    const prods = [{ categoria: "B" }, { categoria: "A" }, { categoria: "A" }, { categoria: "C" }, { categoria: "Z" }];
    const orden = [
      { id: "c", label: "C", visible: true, order: 0 },
      { id: "b", label: "B", visible: true, order: 1 },
      { id: "z", label: "Z", visible: false, order: 2 },
    ];
    expect(ordenarCategorias(prods, orden)).toEqual(["C", "B", "A"]);
    expect(ordenarCategorias(prods, null)).toEqual(["A", "B", "C", "Z"]);
    expect(ordenarCategorias([], orden)).toEqual([]);
  });
  it("círculos: banner del editor, si no la foto del primer producto con foto, si no null", () => {
    const prods = [
      { categoria: "A", imagen: "" },
      { categoria: "A", imagen: "a2.jpg" },
      { categoria: "B", imagen: "" },
    ];
    expect(armarCirculos(["A", "B"], prods)).toEqual([
      { nombre: "A", categoria: "A", imagen: "a2.jpg" },
      { nombre: "B", categoria: "B", imagen: null },
    ]);
    expect(armarCirculos(["A"], prods, { A: "banner.jpg" })[0].imagen).toBe("banner.jpg");
  });
  it("nombre de categoría: el del dueño o la clave en tipo oración", () => {
    expect(nombreDeCategoria("pollo-brasa")).toBe("Pollo brasa");
    expect(nombreDeCategoria("bebidas", [{ id: "bebidas", label: "Bebidas frías" }])).toBe("Bebidas frías");
    expect(armarCirculos(["pollo-brasa"], [])[0]).toEqual({ nombre: "Pollo brasa", categoria: "pollo-brasa", imagen: null });
  });
  it("héroe: sin editor usa el nombre y el lema; con editor, el del dueño", () => {
    const neg = { nombre: "Pizza Pucallpa", lema: "Horno de leña", descripcion: null };
    expect(armarHeroe(null, neg)).toEqual({ titulo: "Pizza Pucallpa", subtitulo: "Horno de leña", boton: "Ver productos", imagen: null });
    expect(armarHeroe({ heroTitle: "Hoy 2x1", heroCtaLabel: "Pedir", heroImageUrl: "h.jpg" }, neg)).toMatchObject({ titulo: "Hoy 2x1", boton: "Pedir", imagen: "h.jpg", subtitulo: "Horno de leña" });
    expect(armarHeroe({}, { nombre: "X", lema: null, descripcion: "Desc" }).subtitulo).toBe("Desc");
    expect(armarHeroe({}, { nombre: "X", lema: null, descripcion: null }).subtitulo).toBeUndefined();
  });
  it("franja: sólo textos reales", () => {
    expect(armarFranja(undefined)).toEqual([]);
    expect(armarFranja(["Hola", "", 3, "  Envío  "])).toEqual(["Hola", "Envío"]);
  });
  it("whatsapp y pagos", () => {
    expect(normalizarWhatsapp("987 654 321")).toBe("51987654321");
    expect(normalizarWhatsapp("+51 987654321")).toBe("51987654321");
    expect(normalizarWhatsapp("123")).toBeNull();
    expect(normalizarWhatsapp(undefined)).toBeNull();
    expect(pagosDe({ yapeEnabled: true, cashEnabled: false })).toEqual(["Yape"]);
    expect(pagosDe({})).toEqual(["Efectivo"]);
  });
  it("antes: sólo si el historial dejó el precio de hoy y era mayor", () => {
    expect(antesDe(8, [{ oldPrice: 10, newPrice: 8 }])).toEqual({ antes: 10, descuento: 20 });
    expect(antesDe(8, [{ oldPrice: 6, newPrice: 8 }])).toEqual({ antes: null, descuento: null });
    expect(antesDe(8, undefined)).toEqual({ antes: null, descuento: null });
  });
});
