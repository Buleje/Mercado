import { describe, expect, it } from "vitest";
import { armarAQuienFiarle, decidirFiado, type ClienteParaFiar } from "@/lib/credit/a-quien-fiarle";

const HOY = "2026-10-11";

const cliente = (x: Partial<ClienteParaFiar> = {}): ClienteParaFiar => ({
  telefono: "999000111",
  nombre: "Cliente",
  limite: 0,
  deuda: 0,
  vencido: 0,
  fiados: 0,
  pagados: 0,
  vencidosEstado: 0,
  venceMasViejo: null,
  compras: 0,
  ultimaCompra: null,
  ...x,
});

describe("decidirFiado — la regla de la caja", () => {
  it("3 fiados vencidos: No (lo que la caja ya rechaza)", () => {
    const r = decidirFiado(cliente({ fiados: 3, vencidosEstado: 3, deuda: 90, vencido: 90, venceMasViejo: "2026-10-01" }), HOY);
    expect(r.veredicto).toBe("no");
    expect(r.motivo).toContain("3 fiados vencidos");
  });

  it("vencido hace más de 60 días: No aunque el estado ya sea VENCIDO (el caso de Cliente 4455 en main)", () => {
    const r = decidirFiado(cliente({ fiados: 1, vencidosEstado: 1, deuda: 150, vencido: 150, venceMasViejo: "2026-08-01" }), HOY);
    expect(r.veredicto).toBe("no");
    expect(r.diasAtraso).toBe(71);
    expect(r.motivo).toBe("Debe S/ 150.00 vencido hace 71 días");
  });

  it("deuda que llega al límite: No; con límite 0 no hay tope", () => {
    expect(decidirFiado(cliente({ fiados: 1, limite: 200, deuda: 200 }), HOY).veredicto).toBe("no");
    const sinTope = decidirFiado(cliente({ fiados: 1, limite: 0, deuda: 5000 }), HOY);
    expect(sinTope.veredicto).toBe("si");
    expect(sinTope.disponible).toBeNull();
  });

  it("algo vencido sin llegar a bloquear: Con cuidado", () => {
    const r = decidirFiado(cliente({ fiados: 2, vencidosEstado: 1, deuda: 80, vencido: 30, venceMasViejo: "2026-10-01" }), HOY);
    expect(r.veredicto).toBe("cuidado");
    expect(r.motivo).toBe("Debe S/ 30.00 vencido hace 10 días");
  });

  it("80 % del límite usado: Con cuidado, con lo que le queda", () => {
    const r = decidirFiado(cliente({ fiados: 1, limite: 100, deuda: 85 }), HOY);
    expect(r.veredicto).toBe("cuidado");
    expect(r.disponible).toBe(15);
  });

  it("sin historial: Sí, y dice si compró", () => {
    expect(decidirFiado(cliente({ compras: 4 }), HOY).motivo).toBe("Nunca le fiaste; compró 4 veces");
    expect(decidirFiado(cliente(), HOY).motivo).toContain("empieza con poco");
  });

  it("pagó todo: Sí", () => {
    const r = decidirFiado(cliente({ fiados: 5, pagados: 5 }), HOY);
    expect(r).toMatchObject({ veredicto: "si", motivo: "Pagó sus 5 fiados", diasAtraso: 0 });
  });
});

describe("armarAQuienFiarle", () => {
  it("ordena No → Con cuidado → Sí y suma en céntimos", () => {
    const { filas, resumen } = armarAQuienFiarle(
      [
        cliente({ nombre: "Ana", fiados: 1, pagados: 1 }),
        cliente({ nombre: "Beto", fiados: 1, vencidosEstado: 1, deuda: 0.1, vencido: 0.1, venceMasViejo: "2026-10-10" }),
        cliente({ nombre: "Caro", fiados: 3, vencidosEstado: 3, deuda: 0.2, vencido: 0.2, venceMasViejo: "2026-10-10" }),
        cliente({ nombre: "Dani" }),
      ],
      HOY,
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Caro", "Beto", "Ana", "Dani"]);
    expect(resumen).toMatchObject({ clientes: 4, si: 2, cuidado: 1, no: 1, deuda: 0.3, vencido: 0.3, sinHistorial: 1 });
  });
});
