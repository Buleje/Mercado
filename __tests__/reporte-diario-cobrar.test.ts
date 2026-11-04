import { describe, expect, it } from "vitest";
import { armarBloques, type DatosReporteForestal } from "@/lib/forestal/reporte-diario-bloques";

/* «Quién te debe» (03-11): la lista para cobrar del parte por correo. */
const datos = (cobrar: DatosReporteForestal["cobrar"]): DatosReporteForestal => ({ cobrar } as DatosReporteForestal);

describe("sección «Quién te debe» del parte forestal", () => {
  it("separa adelantos y madera y el resumen dice el total y cuántas personas", () => {
    const [b] = armarBloques(
      datos({
        total: 25690,
        personas: [
          { nombre: "Quispe", adelantos: 17000, madera: 0, total: 17000 },
          { nombre: "Wasaco", adelantos: 3217, madera: 3031, total: 6248 },
          { nombre: "Alex", adelantos: 2442, madera: 0, total: 2442 },
        ],
        mas: 0,
        otrasMonedas: [],
        truncado: false,
      }),
      ["cobrar"],
    );
    expect(b.titulo).toBe("Quién te debe");
    expect(b.resumen).toContain("25,690.00");
    expect(b.resumen).toContain("3 personas");
    expect(b.tabla?.cabecera).toEqual(["Persona", "Adelantos", "Madera", "Total"]);
    expect(b.tabla?.filas[0]).toEqual(["Quispe", expect.stringContaining("17,000.00"), "—", expect.stringContaining("17,000.00")]);
    expect(b.detalle.find((d) => d.startsWith("Wasaco"))).toMatch(/adelantos .*\+ madera/);
  });

  it("cuenta a los que no entraron, avisa los dólares aparte y el tope de movimientos", () => {
    const [b] = armarBloques(
      datos({
        total: 100,
        personas: [{ nombre: "Uno", adelantos: 100, madera: 0, total: 100 }],
        mas: 2,
        otrasMonedas: [{ moneda: "USD", monto: 50 }],
        truncado: true,
      }),
      ["cobrar"],
    );
    expect(b.resumen).toContain("3 personas");
    expect(b.notas?.join(" ")).toMatch(/US\$ 50/);
    expect(b.notas?.join(" ")).toMatch(/2 personas más/);
    expect(b.notas?.join(" ")).toMatch(/Puede faltar algo/);
  });

  it("sin deudas dice «Nadie te debe» y no arma tabla", () => {
    const [b] = armarBloques(datos({ total: 0, personas: [], mas: 0, otrasMonedas: [], truncado: false }), ["cobrar"]);
    expect(b.resumen).toBe("Nadie te debe.");
    expect(b.tabla).toBeUndefined();
  });
});
