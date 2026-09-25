import { describe, expect, it } from "vitest";
import { evaluarReposicion, COLCHON_DIAS } from "@/lib/compras/reorden";

/**
 * La regla que decide si el negocio gasta plata. Cada caso de acá es un error
 * que la versión anterior cometía sobre datos reales.
 */

const base = {
  stock: 10,
  enTransito: 0,
  stockMin: 5,
  vendido: 30,
  diasConStock: 30,
  leadTimeDias: 7,
};

describe("evaluarReposicion", () => {
  it("no repone lo que no se vendió, y dice cuánto sobra", () => {
    // El caso real: 52 productos, cero ventas en 30 días, y la pantalla vieja
    // proponía comprar 944 unidades porque no llegaban a su stockMax.
    const r = evaluarReposicion({ ...base, vendido: 0, stock: 102, stockMin: 20 });
    expect(r.tipo).toBe("sin_rotacion");
    if (r.tipo === "sin_rotacion") expect(r.excesoSobreMinimo).toBe(82);
  });

  it("un producto sin rotación y sin exceso no reporta sobrante negativo", () => {
    const r = evaluarReposicion({ ...base, vendido: 0, stock: 2, stockMin: 20 });
    if (r.tipo === "sin_rotacion") expect(r.excesoSobreMinimo).toBe(0);
  });

  it("repone cuando el stock no cubre hasta la próxima entrega", () => {
    // 1/día, tarda 7 días + 3 de colchón = punto de reorden 10. Con 6 falta.
    const r = evaluarReposicion({ ...base, stock: 6, vendido: 30, diasConStock: 30 });
    expect(r.tipo).toBe("reponer");
    if (r.tipo === "reponer") {
      expect(r.ventaDiaria).toBe(1);
      expect(r.puntoReorden).toBe(10);
      // Objetivo = 1 × 10 × 2 = 20 → pedir 14.
      expect(r.cantidad).toBe(14);
    }
  });

  it("no repone lo que ya está pedido", () => {
    // Mismo producto de arriba, pero con 8 en camino: 6 + 8 = 14 > 10.
    // La version anterior no miraba el transito y lo pedia de nuevo.
    const r = evaluarReposicion({ ...base, stock: 6, enTransito: 8 });
    expect(r.tipo).toBe("suficiente");
  });

  it("agotado es CRÍTICO, no urgente", () => {
    // La regla vieja mandaba stock<=0 a URGENTE, debajo de uno con 3 dias.
    const r = evaluarReposicion({ ...base, stock: 0 });
    if (r.tipo === "reponer") expect(r.urgencia).toBe("CRITICO");
    else throw new Error("deberia reponer");
  });

  it("es CRÍTICO si no llega a tiempo, aunque todavía haya stock", () => {
    // 1/día, quedan 5, el proveedor tarda 7: se acaba antes de que entre.
    const r = evaluarReposicion({ ...base, stock: 5, leadTimeDias: 7 });
    if (r.tipo === "reponer") expect(r.urgencia).toBe("CRITICO");
    else throw new Error("deberia reponer");
  });

  it("es URGENTE si se acaba durante la ventana de cobertura", () => {
    // 1/día, quedan 9: sobrevive los 7 de entrega pero no los 10 de cobertura.
    const r = evaluarReposicion({ ...base, stock: 9, stockMin: 0, leadTimeDias: 7 });
    if (r.tipo === "reponer") expect(r.urgencia).toBe("URGENTE");
    else throw new Error("deberia reponer");
  });

  it("el proveedor lento sube la urgencia del mismo producto", () => {
    const rapido = evaluarReposicion({ ...base, stock: 9, stockMin: 0, leadTimeDias: 2 });
    const lento = evaluarReposicion({ ...base, stock: 9, stockMin: 0, leadTimeDias: 20 });
    // Con 9 unidades y 1/dia: si tarda 2 dias alcanza de sobra; si tarda 20, no.
    expect(rapido.tipo).toBe("suficiente");
    expect(lento.tipo).toBe("reponer");
    if (lento.tipo === "reponer") expect(lento.urgencia).toBe("CRITICO");
  });

  it("la velocidad se mide sobre los días CON stock, no sobre la ventana", () => {
    // Vendió 30 en los 5 días que tuvo stock: son 6/día, no 1/día. La version
    // anterior dividia siempre entre 30 y lo hacia parecer lento justo cuando
    // mas falta hacia.
    const r = evaluarReposicion({ ...base, stock: 10, vendido: 30, diasConStock: 5 });
    if (r.tipo === "reponer") {
      expect(r.ventaDiaria).toBe(6);
      expect(r.puntoReorden).toBe(60); // 6 × (7+3)
    } else throw new Error("deberia reponer");
  });

  it("respeta el mínimo declarado como piso del punto de reorden", () => {
    // Se vende poquísimo, pero el bodeguero declaró que nunca baja de 50.
    const r = evaluarReposicion({ ...base, stock: 20, stockMin: 50, vendido: 3, diasConStock: 30 });
    if (r.tipo === "reponer") expect(r.puntoReorden).toBe(50);
    else throw new Error("deberia reponer");
  });

  it("nunca sugiere cero unidades", () => {
    const r = evaluarReposicion({ ...base, stock: 9.9, stockMin: 10, vendido: 1, diasConStock: 30 });
    if (r.tipo === "reponer") expect(r.cantidad).toBeGreaterThanOrEqual(1);
  });

  it("el colchón está donde se dice que está", () => {
    // Documenta la constante: si alguien la cambia, el test lo cuenta.
    const r = evaluarReposicion({ ...base, stock: 0, stockMin: 0, vendido: 30, diasConStock: 30, leadTimeDias: 5 });
    if (r.tipo === "reponer") expect(r.puntoReorden).toBe(5 + COLCHON_DIAS);
    else throw new Error("deberia reponer");
  });
});
