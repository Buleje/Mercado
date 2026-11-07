import { describe, expect, it } from "vitest";
import {
  enlacePedirPrecio,
  formatearCantidad,
  lineaDeProducto,
  mensajePedirPrecio,
  ordenarProveedores,
  proveedoresPorDefecto,
  telefonoLegible,
  telefonoParaWhatsApp,
  type ProductoAPedir,
  type ProveedorContacto,
} from "@/lib/compras/pedir-precio";

const arroz: ProductoAPedir = { productId: 1, nombre: "Arroz Costeño 5 kg", cantidad: 12, unidad: "und", proveedorId: "p1" };
const aceite: ProductoAPedir = { productId: 2, nombre: "Aceite  Primor 1 L ", cantidad: 2.5, unidad: "caja", proveedorId: "p2" };

const lopez: ProveedorContacto = { id: "p1", name: "Distribuidora López", phone: "987 654 321" };
const sinTel: ProveedorContacto = { id: "p2", name: "Alicorp", phone: "" };
const fijo: ProveedorContacto = { id: "p3", name: "Mayorista Ucayali", phone: "061-575757", whatsappSecundario: "912345678" };

describe("telefonoParaWhatsApp", () => {
  it("9 dígitos locales → antepone 51", () => {
    expect(telefonoParaWhatsApp({ phone: "987 654 321" })).toBe("51987654321");
  });
  it("ya con 51 no lo duplica (dato legacy)", () => {
    expect(telefonoParaWhatsApp({ phone: "+51 987-654-321" })).toBe("51987654321");
  });
  it("sin teléfono, vacío o a medias → null", () => {
    expect(telefonoParaWhatsApp({})).toBeNull();
    expect(telefonoParaWhatsApp({ phone: "   " })).toBeNull();
    expect(telefonoParaWhatsApp({ phone: "575757" })).toBeNull();
  });
  it("un fijo no sirve: cae al WhatsApp secundario", () => {
    expect(telefonoParaWhatsApp(fijo)).toBe("51912345678");
  });
  it("se lee con espacios de a tres", () => {
    expect(telefonoLegible("51987654321")).toBe("987 654 321");
  });
});

describe("el mensaje", () => {
  it("cantidad con coma, a lo más 2 decimales", () => {
    expect(formatearCantidad(12)).toBe("12");
    expect(formatearCantidad(2.5)).toBe("2,5");
    expect(formatearCantidad(1.23456)).toBe("1,23");
  });
  it("una línea por producto: cantidad, unidad y nombre", () => {
    expect(lineaDeProducto(arroz)).toBe("- 12 und Arroz Costeño 5 kg");
    expect(lineaDeProducto(aceite)).toBe("- 2,5 caja Aceite Primor 1 L");
  });
  it("sin unidad va «und»; sin cantidad válida, solo el nombre", () => {
    expect(lineaDeProducto({ productId: 3, nombre: "Sal", cantidad: 3 })).toBe("- 3 und Sal");
    expect(lineaDeProducto({ productId: 3, nombre: "Sal", cantidad: 0 })).toBe("- Sal");
  });
  it("saludo con el proveedor, lista, la pregunta y la firma del negocio", () => {
    expect(mensajePedirPrecio({ proveedor: "Distribuidora López", productos: [arroz, aceite], negocio: "Bodega San Martín" })).toBe(
      [
        "Hola Distribuidora López, ¿cómo estás? Quisiera tu precio de:",
        "",
        "- 12 und Arroz Costeño 5 kg",
        "- 2,5 caja Aceite Primor 1 L",
        "",
        "¿A cuánto me lo dejas y para cuándo lo traes?",
        "",
        "Gracias.",
        "Bodega San Martín",
      ].join("\n"),
    );
  });
  it("sin nombre del negocio sale sin firma, nunca «null»", () => {
    const m = mensajePedirPrecio({ proveedor: "López", productos: [arroz], negocio: null });
    expect(m.endsWith("Gracias.")).toBe(true);
    expect(m).not.toContain("null");
  });
});

describe("el enlace", () => {
  it("wa.me con 51 + número y el mensaje codificado", () => {
    const url = enlacePedirPrecio({ proveedor: lopez, productos: [arroz], negocio: "Bodega San Martín" });
    expect(url).not.toBeNull();
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe("https://wa.me/51987654321");
    expect(u.searchParams.get("text")).toBe(mensajePedirPrecio({ proveedor: "Distribuidora López", productos: [arroz], negocio: "Bodega San Martín" }));
  });
  it("sin teléfono → null (no se abre wa.me vacío)", () => {
    expect(enlacePedirPrecio({ proveedor: sinTel, productos: [arroz] })).toBeNull();
  });
});

describe("quién arranca marcado", () => {
  it("el proveedor de cada producto, si se le puede escribir", () => {
    expect(proveedoresPorDefecto([arroz, aceite], [lopez, sinTel, fijo])).toEqual(["p1"]);
  });
  it("sin proveedor sugerido no marca a nadie", () => {
    expect(proveedoresPorDefecto([{ ...arroz, proveedorId: null }], [lopez, fijo])).toEqual([]);
  });
  it("orden: sugeridos, el resto, y al final los sin teléfono", () => {
    const orden = ordenarProveedores([sinTel, fijo, lopez], new Set(["p1"]));
    expect(orden.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });
});
