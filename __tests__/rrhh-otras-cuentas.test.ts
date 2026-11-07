/**
 * «Sus cuentas»: la misma persona en otro módulo se reconoce por documento o
 * celular, nunca por nombre.
 */
import { describe, expect, it } from "vitest";
import {
  motivosDeCoincidencia,
  ordenarCuentas,
  textoDeMotivos,
  textoDeSaldo,
  ultimos9,
  type OtraCuentaDTO,
} from "@/lib/rrhh/otras-cuentas";

describe("ultimos9", () => {
  it("quita +51, espacios y guiones; menos de 9 dígitos no une nada", () => {
    expect(ultimos9("+51 987-654-321")).toBe("987654321");
    expect(ultimos9("987654321")).toBe("987654321");
    expect(ultimos9("54321")).toBeNull();
    expect(ultimos9(null)).toBeNull();
  });
});

describe("motivosDeCoincidencia", () => {
  const el = { documento: "4512 3456", celular: "+51987654321" };

  it("mismo documento (normalizado) y mismo celular", () => {
    expect(motivosDeCoincidencia(el, { documentos: ["45123456"], telefonos: ["987 654 321"] })).toEqual(["documento", "celular"]);
  });

  it("un proveedor con RUC y DNI: alcanza uno de los dos", () => {
    expect(motivosDeCoincidencia(el, { documentos: ["20123456789", "45123456"], telefonos: [] })).toEqual(["documento"]);
  });

  it("documento distinto y otro celular → no es él", () => {
    expect(motivosDeCoincidencia(el, { documentos: ["45123457"], telefonos: ["987654320"] })).toEqual([]);
  });

  it("sin documento ni celular suyos no encuentra nada", () => {
    expect(motivosDeCoincidencia({ documento: null, celular: "" }, { documentos: [null], telefonos: [null] })).toEqual([]);
  });
});

describe("textoDeSaldo", () => {
  it("positivo te debe, negativo le debes, cero al día, sin dato sin cifra", () => {
    expect(textoDeSaldo(150)).toMatchObject({ tono: "atencion" });
    expect(textoDeSaldo(150).cifra).toMatch(/^Te debe S\/ 150[.,]00$/);
    expect(textoDeSaldo(-80.5).cifra).toMatch(/^Le debes S\/ 80[.,]50$/);
    expect(textoDeSaldo(0.001)).toEqual({ cifra: "Al día", tono: "bien" });
    expect(textoDeSaldo(null)).toEqual({ cifra: null, tono: "neutro" });
  });
});

describe("ordenarCuentas y textoDeMotivos", () => {
  const c = (tipo: OtraCuentaDTO["tipo"], nombre: string, por: OtraCuentaDTO["por"]): OtraCuentaDTO => ({
    clave: `${tipo}:${nombre}`,
    tipo,
    id: nombre,
    nombre,
    por,
    cifra: null,
    tono: "neutro",
    href: null,
    vinculable: false,
  });

  it("primero lo que coincide por documento; después persona, comunidad, proveedor, cliente", () => {
    const r = ordenarCuentas([
      c("cliente", "Z", ["celular"]),
      c("proveedor", "B", ["documento"]),
      c("persona", "A", ["celular"]),
      c("comunidad", "C", ["documento"]),
    ]);
    expect(r.map((x) => x.clave)).toEqual(["comunidad:C", "proveedor:B", "persona:A", "cliente:Z"]);
  });

  it("dice por qué", () => {
    expect(textoDeMotivos(["documento", "celular"])).toBe("Mismo documento y celular");
    expect(textoDeMotivos(["documento"])).toBe("Mismo documento");
    expect(textoDeMotivos(["celular"])).toBe("Mismo celular");
  });
});
