import { describe, expect, it } from "vitest";
import { leerRucProveedor } from "@/components/admin/compras/factura-xml/use-ruc-proveedor";

const FECHA = "lunes 3 de noviembre";

describe("leerRucProveedor (art. 19 Ley del IGV)", () => {
  it("activo y habido = bien, sin detalle", () => {
    const l = leerRucProveedor({ fase: "listo", estado: "ACTIVO", condicion: "HABIDO" }, FECHA);
    expect(l.nivel).toBe("bien");
    expect(l.detalle).toBeUndefined();
  });

  it("NO HABIDO = grave, cita la fecha de la factura y el art. 19", () => {
    const l = leerRucProveedor({ fase: "listo", estado: "ACTIVO", condicion: "no  habido" }, FECHA);
    expect(l.nivel).toBe("grave");
    expect(l.titulo).toContain("NO HABIDO");
    expect(l.detalle).toContain(FECHA);
    expect(l.detalle).toContain("art. 19");
  });

  it("RUC de baja (de oficio o definitiva) = grave aunque esté habido", () => {
    for (const estado of ["BAJA DE OFICIO", "BAJA DEFINITIVA", "baja provisional"]) {
      const l = leerRucProveedor({ fase: "listo", estado, condicion: "HABIDO" }, FECHA);
      expect(l.nivel).toBe("grave");
      expect(l.titulo).toContain(estado.toLowerCase());
    }
  });

  it("suspensión temporal o NO HALLADO = cuidado (la ley no los nombra)", () => {
    expect(leerRucProveedor({ fase: "listo", estado: "SUSPENSION TEMPORAL", condicion: "HABIDO" }, FECHA).nivel).toBe("cuidado");
    expect(leerRucProveedor({ fase: "listo", estado: "ACTIVO", condicion: "NO HALLADO" }, FECHA).nivel).toBe("cuidado");
  });

  it("RUC inexistente = grave; sin respuesta o sin datos = sin-dato", () => {
    expect(leerRucProveedor({ fase: "no-existe" }, FECHA).nivel).toBe("grave");
    expect(leerRucProveedor({ fase: "sin-respuesta" }, FECHA).nivel).toBe("sin-dato");
    expect(leerRucProveedor({ fase: "cargando" }, FECHA).nivel).toBe("sin-dato");
    expect(leerRucProveedor({ fase: "listo", estado: null, condicion: "" }, FECHA).nivel).toBe("sin-dato");
  });
});
