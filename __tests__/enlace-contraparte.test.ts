import { describe, expect, it } from "vitest";
import { enlaceDeContraparte } from "@/components/admin/contratos/enlace-contraparte";

describe("enlaceDeContraparte — el nombre del contrato lleva a la ficha de con quién es", () => {
  it("cliente: por su teléfono (el id del CRM)", () => {
    expect(enlaceDeContraparte({ customerId: "+51982111222", supplierId: null, colaboradorId: null }))
      .toEqual({ cosa: "cliente", id: "+51982111222" });
  });

  it("proveedor y colaborador por su id", () => {
    expect(enlaceDeContraparte({ supplierId: "sup1" })).toEqual({ cosa: "proveedor", id: "sup1" });
    expect(enlaceDeContraparte({ colaboradorId: "col1" })).toEqual({ cosa: "colaborador", id: "col1" });
  });

  it("texto suelto (sin vínculo) = sin destino, queda como texto", () => {
    expect(enlaceDeContraparte({ customerId: null, supplierId: null, colaboradorId: null })).toEqual({});
    expect(enlaceDeContraparte({ customerId: "" })).toEqual({});
  });
});
