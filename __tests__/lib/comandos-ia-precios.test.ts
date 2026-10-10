import { describe, it, expect } from "vitest";
import {
  aplicarOperacion,
  armarFila,
  describirPlan,
  emparejarNombre,
  filtrarPorOrden,
  interpretarOrdenConReglas,
  margen,
  mismoMonto,
  parsearListaProveedor,
  precioManteniendoMargen,
  precioParaMargen,
  redondear,
  separarSinVenta,
  type ProductoPrecio,
} from "@/lib/admin/comandos-ia/precios";

/** Abarrotes de `main` medidos el 09-10 (precio / costo reales). */
const MAIN: ProductoPrecio[] = [
  { id: 1252382, name: "Arroz Costeño Extra 5kg", category: "Abarrotes", price: 24.9, costPrice: 18.29 },
  { id: 1252383, name: "Azúcar Rubia Cartavio 1kg", category: "Abarrotes", price: 4.8, costPrice: 3.6 },
  { id: 1252385, name: "Fideos Don Vittorio Spaghetti 500g", category: "Abarrotes", price: 3.9, costPrice: 2.8 },
  { id: 1252387, name: "Lentejas Costeño 500g", category: "Abarrotes", price: 4.9, costPrice: 3.4 },
  { id: 1252393, name: "Quinua Perlada Costeño 500g", category: "Abarrotes", price: 9.9, costPrice: 7 },
  { id: 9001, name: "Coca-Cola 500ml", category: "Bebidas", price: 3, costPrice: 2.2 },
  { id: 9002, name: "Corte de cabello", category: "Servicios de salón", price: 25, costPrice: null },
];

describe("aritmética (renace el Análisis viejo)", () => {
  it("Panetón: costo 18,00 y precio 24,90 → margen 27,7 %", () => {
    expect(Math.round((margen(24.9, 18) ?? 0) * 1000) / 10).toBe(27.7);
  });

  it("Panetón con costo 19,50 y «mantener margen» → 26,97 antes de redondear", () => {
    const v = precioManteniendoMargen(24.9, 18, 19.5) ?? 0;
    expect(Math.floor(v * 100) / 100).toBe(26.97);
    expect(precioParaMargen(19.5, margen(24.9, 18) ?? 0)).toBeCloseTo(v, 6);
    expect(redondear(v, 0)).toBe(26.98); // al céntimo, medio hacia arriba (no 26,97 del float)
    expect(redondear(v, 0.1)).toBe(27);
    expect(redondear(v, 0.5)).toBe(27);
    expect(redondear(v, 1)).toBe(27);
  });

  it("redondeo siempre hacia arriba al múltiplo y exacto si ya cae", () => {
    expect(redondear(26.93, 0.1)).toBe(27);
    expect(redondear(26.9, 0.1)).toBe(26.9);
    expect(redondear(5.01, 0.5)).toBe(5.5);
    expect(redondear(3.3, 1)).toBe(4);
  });

  it("calculadora «precio al 15 %» y simulador ±%", () => {
    expect(redondear(precioParaMargen(10, 0.15) ?? 0, 0.1)).toBe(11.8);
    expect(precioParaMargen(10, 1)).toBeNull();
    expect(redondear(aplicarOperacion(4.8, 3.6, { tipo: "pct", valor: 10 }) ?? 0, 0)).toBe(5.28);
    expect(redondear(aplicarOperacion(4.8, 3.6, { tipo: "monto", valor: -0.5 }) ?? 0, 0)).toBe(4.3);
    expect(aplicarOperacion(25, null, { tipo: "margen", valor: 30 })).toBeNull();
  });

  it("mismoMonto compara al céntimo", () => {
    expect(mismoMonto(24.9, 24.900000001)).toBe(true);
    expect(mismoMonto(24.9, 24.91)).toBe(false);
    expect(mismoMonto(null, null)).toBe(true);
    expect(mismoMonto(null, 0)).toBe(false);
  });
});

describe("filas y avisos", () => {
  it("margen bajo 15 %, sin costo y excluido", () => {
    expect(armarFila(MAIN[1], { precio: 4, costo: 3.6 }).aviso).toBe("margen<15");
    expect(armarFila(MAIN[6], { precio: 26, costo: null }).aviso).toBe("sin-costo");
    const ex = armarFila(MAIN[0], { precio: 30, costo: 18.29 }, true);
    expect(ex).toMatchObject({ aviso: "excluido", precioNuevo: 24.9 });
    expect(armarFila(MAIN[4], { precio: 10.4, costo: 7 }).aviso).toBeUndefined();
  });
});

describe("la orden en palabras sin IA", () => {
  const cats = ["Abarrotes", "Bebidas", "Frutas y Verduras", "Servicios de salón"];

  it("«Sube 5 % todo Abarrotes menos el arroz y redondea a 10 céntimos»", () => {
    const p = interpretarOrdenConReglas("Sube 5 % todo Abarrotes menos el arroz y redondea a 10 céntimos", cats);
    expect(p).toEqual({
      filtro: { categorias: ["Abarrotes"], incluye: [], excluye: ["arroz"] },
      operacion: { tipo: "pct", valor: 5 },
      redondeo: 0.1,
    });
    const { incluidos, excluidos } = filtrarPorOrden(MAIN, p!.filtro);
    expect(incluidos.map((x) => x.id)).toEqual([1252383, 1252385, 1252387, 1252393]);
    expect(excluidos.map((x) => x.id)).toEqual([1252382]);
    expect(describirPlan(p!)).toBe("Sube 5 % · Abarrotes · menos arroz · redondea a 10 céntimos");
  });

  it("«Lleva a 30 % de margen las bebidas» y «baja 50 céntimos frutas y verduras, redondea al sol»", () => {
    expect(interpretarOrdenConReglas("Lleva a 30 % de margen las bebidas", cats)).toMatchObject({
      filtro: { categorias: ["Bebidas"] },
      operacion: { tipo: "margen", valor: 30 },
      redondeo: 0,
    });
    expect(interpretarOrdenConReglas("baja 50 céntimos frutas y verduras, redondea al sol", cats)).toMatchObject({
      filtro: { categorias: ["Frutas y Verduras"] },
      operacion: { tipo: "monto", valor: -0.5 },
      redondeo: 1,
    });
  });

  it("lo que no entiende va a la IA (null): sin categoría, dos operaciones o un tope absurdo", () => {
    expect(interpretarOrdenConReglas("las gaseosas súbelas un sol", cats)).toBeNull();
    expect(interpretarOrdenConReglas("sube 5 % y 1 sol las bebidas", cats)).toBeNull();
    expect(interpretarOrdenConReglas("sube 500 % las bebidas", cats)).toBeNull();
    expect(interpretarOrdenConReglas("sube 5 % todo y redondea", cats)).toBeNull();
  });
});

describe("«lo que no se vendió en N días» (Precios en bloque, 10-10)", () => {
  const cats = ["Abarrotes", "Bebidas", "Frutas y Verduras", "Servicios de salón"];

  it("«Rebaja 10 % lo que no se vendió en 30 días»: todo el catálogo, sólo lo quieto", () => {
    const p = interpretarOrdenConReglas("Rebaja 10 % lo que no se vendió en 30 días", cats);
    expect(p).toEqual({
      filtro: { categorias: [], incluye: [], excluye: [], sinVentaDias: 30 },
      operacion: { tipo: "pct", valor: -10 },
      redondeo: 0,
    });
    expect(describirPlan(p!)).toBe("Baja 10 % · sin ventas en 30 días");
  });

  it("con categoría, semanas, «no se mueve» sin cifra (30) y «menos …»", () => {
    expect(interpretarOrdenConReglas("baja 5 % las bebidas que no se vendieron en 2 semanas, redondea a 10 céntimos", cats)).toEqual({
      filtro: { categorias: ["Bebidas"], incluye: [], excluye: [], sinVentaDias: 14 },
      operacion: { tipo: "pct", valor: -5 },
      redondeo: 0.1,
    });
    const quieto = interpretarOrdenConReglas("rebaja 50 céntimos lo que no se mueve menos el arroz", cats);
    expect(quieto?.filtro).toEqual({ categorias: [], incluye: [], excluye: ["arroz"], sinVentaDias: 30 });
    expect(quieto?.operacion).toEqual({ tipo: "monto", valor: -0.5 });
    expect(interpretarOrdenConReglas("baja 10 % sin ventas en los últimos 2 meses", cats)?.filtro.sinVentaDias).toBe(60);
    expect(describirPlan(quieto!)).toBe("Baja S/ 0.50 · sin ventas en 30 días · menos arroz");
  });

  it("la cifra de días no se lee como la operación y una ventana absurda va a la IA", () => {
    // «30 días» no es «30 %» ni «S/ 30».
    expect(interpretarOrdenConReglas("sube 5 % lo que no se vendió en 30 días", cats)?.operacion).toEqual({ tipo: "pct", valor: 5 });
    expect(interpretarOrdenConReglas("baja 10 % lo que no se vendió en 900 días", cats)).toBeNull();
    // Sin la frase, todo sigue igual: sin categoría no hay plan por reglas.
    expect(interpretarOrdenConReglas("baja 10 %", cats)).toBeNull();
    expect(interpretarOrdenConReglas("Sube 5 % todo Abarrotes", cats)?.filtro).not.toHaveProperty("sinVentaDias");
  });

  it("lo quieto detrás de «menos» va a la IA: sacarlo no es tocarlo (el filtro lo invertiría)", () => {
    expect(interpretarOrdenConReglas("sube 10 % Bebidas, menos lo que no se vendió", cats)).toBeNull();
    expect(interpretarOrdenConReglas("sube 10 % Bebidas excepto lo que no se mueve en 30 días", cats)).toBeNull();
    expect(interpretarOrdenConReglas("baja 5 % Abarrotes sin contar lo que no se vendió", cats)).toBeNull();
    // Antes del «menos» sí: el filtro toca lo quieto y saca el arroz.
    expect(interpretarOrdenConReglas("baja 10 % lo que no se vendió en 30 días menos el arroz", cats)?.filtro).toEqual({
      categorias: [],
      incluye: [],
      excluye: ["arroz"],
      sinVentaDias: 30,
    });
  });

  it("la cifra en letras se lee; una ventana que no se lee va a la IA, no a «30 días» a ciegas", () => {
    const dias = (orden: string) => interpretarOrdenConReglas(orden, cats)?.filtro.sinVentaDias;
    expect(dias("baja 10 % lo que no se vendió en dos semanas")).toBe(14);
    expect(dias("baja 10 % lo que no se vendió en tres meses")).toBe(90);
    expect(dias("baja 10 % lo que no se vendió en quince días")).toBe(15);
    expect(dias("baja 10 % lo que no se vendió en un mes")).toBe(30);
    expect(interpretarOrdenConReglas("baja 10 % lo que no se vendió hace más de 45 días", cats)).toBeNull();
    expect(interpretarOrdenConReglas("baja 10 % lo que no se vendió en veintidós días", cats)).toBeNull();
  });

  it("separarSinVenta: fuera lo vendido; sin stock va aparte; stock null (no controla) entra", () => {
    const productos: ProductoPrecio[] = [
      { id: 1, name: "Arroz", category: "Abarrotes", price: 5, stock: 10 },
      { id: 2, name: "Azúcar", category: "Abarrotes", price: 4, stock: 0 },
      { id: 3, name: "Fideos", category: "Abarrotes", price: 3, stock: 8 },
      { id: 4, name: "Corte", category: "Servicios de salón", price: 25, stock: null },
    ];
    const r = separarSinVenta(productos, new Set([1]));
    expect(r.quedan.map((p) => p.id)).toEqual([3, 4]);
    expect(r.sinStock.map((p) => p.id)).toEqual([2]);
  });
});

describe("«menos …» saca la categoría entera", () => {
  it("«todo menos bebidas» no deja productos de Bebidas entre los incluidos", () => {
    const r = filtrarPorOrden(MAIN, { categorias: [], incluye: [], excluye: ["bebidas"] });
    expect(r.incluidos.some((p) => p.category === "Bebidas")).toBe(false);
    expect(r.excluidos.map((p) => p.id)).toEqual([9001]);
  });

  it("«todo menos cigarros» saca Hamilton aunque su nombre no diga cigarros", () => {
    const cat = [...MAIN, { id: 9003, name: "Hamilton x20", category: "Cigarros", price: 12, costPrice: 9 }];
    const r = filtrarPorOrden(cat, { categorias: [], incluye: [], excluye: ["cigarros"] });
    expect(r.incluidos.map((p) => p.id)).not.toContain(9003);
    expect(r.excluidos.map((p) => p.id)).toEqual([9003]);
  });
});

describe("lista del proveedor", () => {
  it("parsea «Panetón D'Onofrio 900g 19.50 · Chifles 3.30» y coma decimal", () => {
    const r = parsearListaProveedor("Panetón D'Onofrio 900g 19.50 · Chifles 3.30\nAceite 1L S/ 8,90\nsolo texto");
    expect(r.filas).toEqual([
      { nombre: "Panetón D'Onofrio 900g", costo: 19.5 },
      { nombre: "Chifles", costo: 3.3 },
      { nombre: "Aceite 1L", costo: 8.9 },
    ]);
    expect(r.ignoradas).toEqual(["solo texto"]);
  });

  it("no corta un número por la mitad: «2,805» y «1,500.00» van a ignoradas", () => {
    const r = parsearListaProveedor("Leche Gloria 2,805\nAzúcar 50kg 1,500.00\nArroz 5kg 18,29");
    expect(r.filas).toEqual([{ nombre: "Arroz 5kg", costo: 18.29 }]);
    expect(r.ignoradas).toEqual(["Leche Gloria 2,805", "Azúcar 50kg 1,500.00"]);
  });

  it("empareja por nombre sin IA y respeta la medida", () => {
    expect(emparejarNombre("Arroz Costeño 5kg", MAIN)).toMatchObject({ estado: "unico", productId: 1252382 });
    expect(emparejarNombre("azucar rubia", MAIN)).toMatchObject({ estado: "unico", productId: 1252383 });
    expect(emparejarNombre("Arroz Costeño 1kg", MAIN).estado).toBe("ninguno");
    expect(emparejarNombre("Costeño 500g", MAIN).estado).toBe("ambiguo");
    expect(emparejarNombre("Panetón D'Onofrio 900g", MAIN).estado).toBe("ninguno");
  });
});
