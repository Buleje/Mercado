/**
 * voz-parser — entender lo dictado en el mostrador. Puro, sin red.
 *
 * El caso que lo motiva es el de Brandon: «2 tablas de tornillo de 1 mt» tiene
 * DOS números, y confundirlos hace buscar «1 metro» en vez de la tabla.
 */
import { describe, it, expect } from "vitest";
import {
  buscarEnCatalogo,
  comandoDe,
  norm,
  parsearPedido,
  resolverDictado,
  separarPedidos,
  type ProductoBuscable,
} from "@/lib/pos/voz-parser";

const CATALOGO: ProductoBuscable[] = [
  { id: 1, name: "Tabla de Tornillo 1m", price: 25, stock: 40 },
  { id: 2, name: "Tabla de Tornillo 3m", price: 68, stock: 12 },
  { id: 3, name: "Tabla de Cedro 1m", price: 42, stock: 5 },
  { id: 4, name: "Clavo 3 pulgadas x kg", price: 9.5, stock: 0 },
  { id: 5, name: "Arroz Costeño Extra 5kg", price: 24.9, stock: 102 },
  { id: 6, name: "Leche Gloria 400g", price: 4.5, stock: 60 },
];

describe("parsearPedido", () => {
  it("separa la cantidad de la MEDIDA del producto", () => {
    const p = parsearPedido("2 tablas de tornillo de 1 mt")!;
    expect(p.cantidad).toBe(2);
    expect(p.consulta).toBe("tablas tornillo");
    expect(p.medida).toEqual({ valor: 1, unidad: "m" });
  });

  it("entiende números dichos con palabras", () => {
    expect(parsearPedido("tres arroces")!.cantidad).toBe(3);
    expect(parsearPedido("una leche")!.cantidad).toBe(1);
    expect(parsearPedido("medio kilo de arroz")!.cantidad).toBe(0.5);
  });

  it("la unidad pegada al número es de la CANTIDAD, no del producto", () => {
    const p = parsearPedido("2 kilos de arroz")!;
    expect(p.cantidad).toBe(2);
    expect(p.unidad).toBe("kg");
    expect(p.consulta).toBe("arroz");
    expect(p.medida).toBeNull();
  });

  it("sin número dicho, es uno", () => {
    expect(parsearPedido("leche gloria")!.cantidad).toBe(1);
  });

  it("descarta palabras vacías y devuelve null si no queda nada", () => {
    expect(parsearPedido("de la")).toBeNull();
    expect(parsearPedido("   ")).toBeNull();
  });

  it("normaliza tildes y signos", () => {
    expect(norm('Tabla de Tornillo 1" ¡NUEVA!')).toBe("tabla de tornillo 1 nueva");
  });
});

describe("separarPedidos", () => {
  it("corta por «y», comas y «más»", () => {
    expect(separarPedidos("2 tablas de tornillo y 3 clavos")).toEqual(["2 tablas de tornillo", "3 clavos"]);
    expect(separarPedidos("dos leches, un arroz mas una gaseosa")).toHaveLength(3);
  });

  it("no parte un solo pedido", () => {
    expect(separarPedidos("2 tablas de tornillo de 1 mt")).toEqual(["2 tablas de tornillo de 1 mt"]);
  });
});

describe("buscarEnCatalogo", () => {
  it("la medida dictada desempata entre dos productos iguales", () => {
    const r = buscarEnCatalogo(parsearPedido("2 tablas de tornillo de 1 mt")!, CATALOGO);
    expect(r[0].producto.id).toBe(1); // la de 1m, no la de 3m
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });

  it("sin medida, la tabla de tornillo gana sobre la de cedro", () => {
    const r = buscarEnCatalogo(parsearPedido("tabla de tornillo")!, CATALOGO);
    expect(r[0].producto.name).toContain("Tornillo");
  });

  it("encuentra en plural y singular", () => {
    expect(buscarEnCatalogo(parsearPedido("3 clavos")!, CATALOGO)[0].producto.id).toBe(4);
    expect(buscarEnCatalogo(parsearPedido("un clavo")!, CATALOGO)[0].producto.id).toBe(4);
  });

  it("lo que no existe no devuelve nada", () => {
    expect(buscarEnCatalogo(parsearPedido("2 martillos")!, CATALOGO)).toHaveLength(0);
  });
});

describe("resolverDictado", () => {
  it("resuelve el caso del mostrador de punta a punta", () => {
    const l = resolverDictado("2 tablas de tornillo de 1 mt", CATALOGO)!;
    expect(l.estado).toBe("listo");
    expect(l.elegido?.name).toBe("Tabla de Tornillo 1m");
    expect(l.pedido.cantidad).toBe(2);
  });

  it("marca ambiguo en vez de adivinar", () => {
    // «tabla de 1m» calza igual con la de tornillo y la de cedro.
    const l = resolverDictado("una tabla de 1 metro", CATALOGO)!;
    expect(l.estado).toBe("ambiguo");
    expect(l.elegido).toBeNull();
    expect(l.candidatos.length).toBeGreaterThan(1);
  });

  it("avisa cuando no hay stock, sin inventarlo", () => {
    const l = resolverDictado("3 clavos", CATALOGO)!;
    expect(l.estado).toBe("sin_stock");
    expect(l.elegido?.id).toBe(4);
  });

  it("avisa cuando pide más de lo que hay", () => {
    const l = resolverDictado("20 tablas de cedro de 1 metro", CATALOGO)!;
    expect(l.estado).toBe("sin_stock"); // hay 5
  });

  it("lo que no está en el catálogo se marca, no se agrega", () => {
    const l = resolverDictado("2 martillos", CATALOGO)!;
    expect(l.estado).toBe("no_encontrado");
    expect(l.elegido).toBeNull();
  });
});

describe("comandoDe", () => {
  it("reconoce las palabras de control", () => {
    expect(comandoDe("listo")).toBe("confirmar");
    expect(comandoDe("ya está")).toBe("confirmar");
    expect(comandoDe("cancelar")).toBe("cancelar");
    expect(comandoDe("deshacer")).toBe("deshacer");
    expect(comandoDe("borra eso")).toBe("deshacer");
  });

  it("un producto no es un comando", () => {
    expect(comandoDe("2 tablas de tornillo")).toBeNull();
  });
});

/**
 * Casos medidos contra el catálogo REAL del tenant (57 productos). Cada uno
 * corresponde a un defecto que sólo apareció con datos de verdad.
 */
describe("regresiones del catálogo real", () => {
  const REAL: ProductoBuscable[] = [
    { id: 1, name: "Arroz Costeño Extra 5kg", price: 24.9, stock: 102 },
    { id: 2, name: "Lentejas Costeño 500g", price: 4.9, stock: 50 },
    { id: 3, name: "Azúcar Rubia Cartavio 1kg", price: 4.8, stock: 73 },
    { id: 4, name: "1/4 de pollo a la brasa", price: 18, stock: 15 },
    { id: 5, name: "Panetón D'Onofrio 900g", price: 22, stock: 30 },
    { id: 6, name: "Pan de Molde Bimbo Blanco 500g", price: 6.5, stock: 25 },
    { id: 7, name: "Coca-Cola 1.5L", price: 8.5, stock: 67 },
    { id: 8, name: "Inca Kola 1.5L", price: 8.5, stock: 80 },
  ];

  it("«2 arroces» encuentra Arroz: el plural en -ces vuelve a -z", () => {
    // Sin la regla z→c elegía «Lentejas Costeño» por compartir sólo «costeño».
    const l = resolverDictado("2 arroces costeño", REAL)!;
    expect(l.estado).toBe("listo");
    expect(l.elegido?.name).toContain("Arroz");
  });

  it("una palabra de una letra no puede calzar con un producto", () => {
    // La «a» de «a la brasa» calzaba con «azúcar»: el pollo ganaba el pedido.
    const l = resolverDictado("medio kilo de azucar", REAL)!;
    expect(l.estado).toBe("listo");
    expect(l.elegido?.name).toContain("Azúcar");
    expect(l.pedido.cantidad).toBe(0.5);
  });

  it("«pan» no es «panetón»: el prefijo corto no alcanza", () => {
    const l = resolverDictado("5 panetones", REAL)!;
    expect(l.estado).toBe("listo");
    expect(l.elegido?.name).toContain("Panetón");
  });

  it("el guion separa: «coca cola» encuentra «Coca-Cola»", () => {
    const l = resolverDictado("una coca cola de 1.5 litros", REAL)!;
    expect(l.estado).toBe("listo");
    expect(l.elegido?.name).toBe("Coca-Cola 1.5L");
  });

  it("dos productos igual de válidos siguen preguntando", () => {
    const conLeches: ProductoBuscable[] = [
      ...REAL,
      { id: 9, name: "Leche Evaporada Gloria 400ml", price: 4.5, stock: 60 },
      { id: 10, name: "Leche Gloria Entera 1L UHT", price: 7.9, stock: 40 },
    ];
    const l = resolverDictado("tres leches gloria", conLeches)!;
    expect(l.estado).toBe("ambiguo");
    expect(l.candidatos).toHaveLength(2);
  });
});
