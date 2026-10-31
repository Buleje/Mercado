/**
 * Alta de persona de Adelantos (30-10): la revisión en vivo de celular, DNI/RUC,
 * CCI y fecha de nacimiento, y el cuerpo que viaja a la API.
 */
import { describe, expect, it } from "vitest";
import {
  avisoBancoDelCci,
  bancoDelCci,
  celularParaGuardar,
  edadDe,
  errorAntesDeGuardar,
  revisarCci,
  revisarCelular,
  revisarDocumentoEnVivo,
  revisarFechaNacimiento,
} from "@/components/admin/adelantos/personas/crear-persona/validacion";
import {
  TIPOS_RELACION,
  cuerpoDe,
  datosDe,
  type Hallado,
  type PersonaEditable,
} from "@/components/admin/adelantos/personas/crear-persona/datos";
import { TIPOS_RELACION as VALORES_API } from "@/lib/adelantos/persona-campos";

const HOY = "2026-10-30";

describe("revisarCelular", () => {
  it("vacío no reprocha; a medias cuenta lo que falta", () => {
    expect(revisarCelular("").estado).toBe("vacio");
    expect(revisarCelular("98765")).toEqual({ estado: "escribiendo", texto: "Faltan 4 dígitos" });
    expect(revisarCelular("98765432")).toEqual({ estado: "escribiendo", texto: "Falta 1 dígito" });
  });
  it("9 dígitos con 9 adelante, con espacios o +51", () => {
    expect(revisarCelular("987 654 321").estado).toBe("ok");
    expect(revisarCelular("+51 987654321").estado).toBe("ok");
  });
  it("marca lo que ya no puede ser", () => {
    expect(revisarCelular("887654321").estado).toBe("mal");
    expect(revisarCelular("9876543210").estado).toBe("mal");
    expect(revisarCelular("98a").estado).toBe("mal");
  });
});

describe("celularParaGuardar", () => {
  it("quita el +51 y los separadores (la API pide 9 dígitos)", () => {
    expect(celularParaGuardar("+51 987 654 321")).toBe("987654321");
    expect(celularParaGuardar("987-654-321")).toBe("987654321");
  });
});

describe("revisarDocumentoEnVivo", () => {
  it("cuenta hasta el DNI y después hasta el RUC", () => {
    expect(revisarDocumentoEnVivo("1234").texto).toBe("Faltan 4 dígitos para el DNI");
    expect(revisarDocumentoEnVivo("12345678").estado).toBe("ok");
    expect(revisarDocumentoEnVivo("123456789").texto).toBe("Faltan 2 dígitos para un RUC (un DNI tiene 8)");
  });
  it("RUC con prefijo válido; sobra o prefijo malo = mal", () => {
    expect(revisarDocumentoEnVivo("20123456789").estado).toBe("ok");
    expect(revisarDocumentoEnVivo("30123456789").estado).toBe("mal");
    expect(revisarDocumentoEnVivo("201234567890").estado).toBe("mal");
    expect(revisarDocumentoEnVivo("4567x").estado).toBe("mal");
  });
});

describe("CCI", () => {
  it("20 dígitos; guiones del voucher no cuentan", () => {
    expect(revisarCci("002-193-001234567890-12").estado).toBe("ok");
    expect(revisarCci("0021930012").texto).toBe("Faltan 10 dígitos");
    expect(revisarCci("002193001234567890123").estado).toBe("mal");
  });
  it("el banco sale de los 3 primeros dígitos y avisa si no coincide", () => {
    expect(bancoDelCci("002193")).toBe("BCP");
    expect(bancoDelCci("011")).toBe("BBVA");
    expect(bancoDelCci("999")).toBeNull();
    expect(avisoBancoDelCci("00219300", "BBVA")).toBe("Ese CCI es del BCP, no de BBVA.");
    expect(avisoBancoDelCci("00219300", "BCP")).toBeNull();
    expect(avisoBancoDelCci("00219300", "Otro")).toBeNull();
  });
});

describe("fecha de nacimiento", () => {
  it("edad cumplida a la fecha de Lima", () => {
    expect(edadDe("1990-10-30", HOY)).toBe(36);
    expect(edadDe("1990-10-31", HOY)).toBe(35);
    expect(edadDe("2027-01-01", HOY)).toBeNull();
  });
  it("ni antes de 1900 ni en el futuro", () => {
    expect(revisarFechaNacimiento("", HOY).estado).toBe("vacio");
    expect(revisarFechaNacimiento("1899-12-31", HOY).estado).toBe("mal");
    expect(revisarFechaNacimiento("2026-10-31", HOY).estado).toBe("mal");
    expect(revisarFechaNacimiento("1985-05-12", HOY).estado).toBe("ok");
  });
});

describe("errorAntesDeGuardar", () => {
  const base = {
    nombre: "Juan Pérez",
    yape: "",
    yapeIgualCelular: false,
    telefono: "",
    referenciaTelefono: "",
    fechaNacimiento: "",
  };
  it("sólo frena lo que el servidor rechazaría", () => {
    expect(errorAntesDeGuardar(base, HOY, false)).toBeNull();
    expect(errorAntesDeGuardar({ ...base, nombre: " " }, HOY, false)).toBe("El nombre es obligatorio.");
    expect(errorAntesDeGuardar({ ...base, yape: "98765" }, HOY, false)).toMatch(/Yape o Plin/);
    expect(errorAntesDeGuardar({ ...base, referenciaTelefono: "123" }, HOY, false)).toMatch(/referencia/);
    expect(errorAntesDeGuardar({ ...base, fechaNacimiento: "2030-01-01" }, HOY, false)).toMatch(/nacimiento/);
  });
  it("un RUC no revisa la fecha; un celular a medias no frena (avisa)", () => {
    expect(errorAntesDeGuardar({ ...base, fechaNacimiento: "2030-01-01" }, HOY, true)).toBeNull();
    expect(errorAntesDeGuardar({ ...base, telefono: "98765" }, HOY, false)).toBeNull();
  });
});

describe("datos y cuerpo", () => {
  it("los chips usan los mismos valores que la API", () => {
    expect(TIPOS_RELACION.map((t) => t.valor)).toEqual([...VALORES_API]);
    expect(TIPOS_RELACION.find((t) => t.valor === "proveedor")?.rotulo).toBe("Proveedor de madera");
  });

  it("datosDe: el Yape igual al celular queda marcado; un tipo desconocido se vacía", () => {
    const p = {
      nombre: "Ana",
      telefono: "987654321",
      yape: "+51987654321",
      tipoRelacion: "socio",
      fechaNacimiento: "1990-02-03T00:00:00.000Z",
      limiteCredito: 1500,
    } as unknown as PersonaEditable;
    const d = datosDe(p);
    expect(d.yapeIgualCelular).toBe(true);
    expect(d.tipoRelacion).toBe("");
    expect(d.fechaNacimiento).toBe("1990-02-03");
    expect(d.limite).toBe("1500");
  });

  it("cuerpoDe: CCI limpio, Yape copiado del celular, campos vacíos = null", () => {
    const d = {
      ...datosDe(),
      nombre: "  Ana Ríos ",
      documento: "12345678",
      telefono: "+51 987 654 321",
      yapeIgualCelular: true,
      cci: "002-193-001234567890-12",
      tipoRelacion: "chofer" as const,
      fechaNacimiento: "1990-02-03",
    };
    const c = cuerpoDe(d, null);
    expect(c).toMatchObject({
      nombre: "Ana Ríos",
      cci: "00219300123456789012",
      yape: "987654321",
      tipoRelacion: "chofer",
      fechaNacimiento: "1990-02-03",
      referenciaNombre: null,
      referenciaTelefono: null,
    });
    expect(c).not.toHaveProperty("verificadoEn");
  });

  it("cuerpoDe: un RUC no manda fecha de nacimiento; un dato de prueba no queda verificado", () => {
    const d = { ...datosDe(), nombre: "Maderas SAC", documento: "20123456789", fechaNacimiento: "1990-02-03" };
    const demo: Hallado = { encontrado: true, tipo: "RUC", numero: "20123456789", nombre: "Maderas SAC", fuente: "SUNAT", demo: true };
    const c = cuerpoDe(d, demo);
    expect(c.fechaNacimiento).toBeNull();
    expect(c.tipoDocumento).toBe("RUC");
    expect(c).not.toHaveProperty("verificadoEn");
    expect(cuerpoDe(d, { ...demo, demo: false })).toHaveProperty("verificadoEn");
  });
});
