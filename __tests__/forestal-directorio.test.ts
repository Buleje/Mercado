import { describe, it, expect } from "vitest";
import {
  claveBusqueda,
  direccionCompleta,
  esRolValido,
  faltantesParaGuia,
  filtrarPartes,
  filtrarVehiculos,
  formatearPlaca,
  fuenteAutocompletado,
  motivoDocInvalido,
  normalizarDocumento,
  normalizarNombre,
  normalizarPlaca,
  ordenarPorUso,
  parteInputSchema,
  vehiculoInputSchema,
  type Parte,
  type Vehiculo,
} from "@/lib/forestal/directorio";

/**
 * Directorio forestal (ADR-317) — las reglas puras.
 *
 * Lo que se prueba acá es exactamente lo que evita que la libreta reproduzca el
 * problema que vino a resolver: que el mismo camión, el mismo RUC y el mismo
 * nombre escritos de dos formas terminen siendo dos filas.
 */

const parte = (over: Partial<Parte> = {}): Parte => ({
  id: "p1",
  roles: ["destinatario"],
  nombre: "Maderera del Oriente SAC",
  docTipo: "RUC",
  docNumero: "20512345678",
  zona: null,
  direccion: "Av. Los Cedros 123",
  region: "Ucayali",
  provincia: "Coronel Portillo",
  distrito: "Callería",
  ubigeo: null,
  telefono: null,
  email: null,
  registroMtc: null,
  licencia: null,
  tituloHabilitante: null,
  resolucion: null,
  planManejo: null,
  arffs: null,
  representante: null,
  logo: null,
  adjuntos: [],
  notas: null,
  activo: true,
  usos: 0,
  ultimoUso: null,
  ...over,
});

const vehiculo = (over: Partial<Vehiculo> = {}): Vehiculo => ({
  id: "v1",
  placa: "A2C123",
  placaRemolque: null,
  marca: "Volvo",
  tipo: "Camión",
  configuracion: null,
  capacidadM3: 30,
  transportistaId: null,
  transportistaNombre: "Transportes Selva EIRL",
  notas: null,
  activo: true,
  usos: 0,
  ultimoUso: null,
  ...over,
});

describe("normalización", () => {
  it("la placa es la misma escrita de cualquier forma", () => {
    const canonica = "A2C123";
    for (const escrita of ["A2C-123", "a2c123", " A2C 123 ", "a2c-123"]) {
      expect(normalizarPlaca(escrita)).toBe(canonica);
    }
  });

  it("la placa se muestra con guión, como en el papel", () => {
    expect(formatearPlaca("a2c123")).toBe("A2C-123");
    // Corta: todavía no alcanza para partirla, se devuelve tal cual.
    expect(formatearPlaca("A2C")).toBe("A2C");
  });

  it("el documento pierde guiones y espacios", () => {
    expect(normalizarDocumento(" 20-512345678 ")).toBe("20512345678");
    expect(normalizarDocumento("ce-x1234y")).toBe("CEX1234Y");
  });

  it("el nombre colapsa espacios pero respeta la razón social", () => {
    expect(normalizarNombre("  Maderera   del  Oriente  SAC ")).toBe("Maderera del Oriente SAC");
  });

  it("la clave de búsqueda ignora tildes y mayúsculas", () => {
    expect(claveBusqueda("Callería")).toBe(claveBusqueda("calleria"));
    expect(claveBusqueda("PIÑA")).toBe("pina");
  });
});

describe("validación de documento", () => {
  it("vacío es válido: la parte se puede completar después", () => {
    expect(motivoDocInvalido("RUC", "")).toBeNull();
    expect(motivoDocInvalido("DNI", "   ")).toBeNull();
  });

  it("un RUC peruano tiene 11 dígitos y empieza en 1 o 2", () => {
    expect(motivoDocInvalido("RUC", "20512345678")).toBeNull();
    expect(motivoDocInvalido("RUC", "205123456")).toMatch(/11 dígitos/);
    expect(motivoDocInvalido("RUC", "30512345678")).toMatch(/1 o 2/);
  });

  it("acepta el RUC tipeado con guiones (se normaliza antes de validar)", () => {
    expect(motivoDocInvalido("RUC", "20-51234567-8")).toBeNull();
  });

  it("el DNI tiene 8 dígitos", () => {
    expect(motivoDocInvalido("DNI", "45678912")).toBeNull();
    expect(motivoDocInvalido("DNI", "4567891")).toMatch(/8 dígitos/);
  });

  it("sabe qué servicio puede completar cada documento", () => {
    expect(fuenteAutocompletado("RUC")).toBe("SUNAT");
    expect(fuenteAutocompletado("DNI")).toBe("RENIEC");
    expect(fuenteAutocompletado("CE")).toBeNull();
  });
});

describe("roles", () => {
  it("reconoce los cuatro papeles y rechaza inventos", () => {
    expect(esRolValido("proveedor")).toBe(true);
    expect(esRolValido("conductor")).toBe(true);
    expect(esRolValido("regente")).toBe(false);
  });

  it("el input exige al menos un rol", () => {
    const sinRoles = parteInputSchema.safeParse({ roles: [], nombre: "Alguien" });
    expect(sinRoles.success).toBe(false);
    const ok = parteInputSchema.safeParse({ roles: ["proveedor"], nombre: "Alguien" });
    expect(ok.success).toBe(true);
  });

  it("una parte puede cumplir varios roles (dueño-chofer)", () => {
    const r = parteInputSchema.safeParse({ roles: ["transportista", "conductor"], nombre: "Juan Pérez" });
    expect(r.success).toBe(true);
  });
});

describe("faltantes para poder usar la parte en una guía", () => {
  it("un destinatario sin dirección no alcanza: es el punto de llegada", () => {
    const sinDir = parte({ direccion: null, region: null, provincia: null, distrito: null });
    expect(faltantesParaGuia(sinDir, "destinatario")).toContain("dirección (es el punto de llegada)");
  });

  it("un conductor sin licencia no alcanza: el control se la pide", () => {
    const chofer = parte({ roles: ["conductor"], licencia: null });
    expect(faltantesParaGuia(chofer, "conductor")).toContain("licencia de conducir");
  });

  it("una parte completa no tiene faltantes", () => {
    expect(faltantesParaGuia(parte(), "destinatario")).toEqual([]);
  });

  it("el mismo dato falta o no según el rol: la libreta no es un formulario único", () => {
    const sinDireccion = parte({ direccion: null, region: null, provincia: null, distrito: null });
    expect(faltantesParaGuia(sinDireccion, "destinatario").length).toBeGreaterThan(0);
    // Como transportista, la dirección no es lo que se coteja en el control.
    expect(faltantesParaGuia(sinDireccion, "transportista")).toEqual([]);
  });
});

describe("orden y búsqueda", () => {
  it("ordena por uso, después por reciente, y recién ahí alfabético", () => {
    const lista = [
      parte({ id: "a", nombre: "Zapata SAC", usos: 0 }),
      parte({ id: "b", nombre: "Alfa SAC", usos: 5, ultimoUso: "2026-07-01T00:00:00.000Z" }),
      parte({ id: "c", nombre: "Beta SAC", usos: 5, ultimoUso: "2026-07-20T00:00:00.000Z" }),
      parte({ id: "d", nombre: "Ana SAC", usos: 0 }),
    ];
    expect(ordenarPorUso(lista).map((p) => p.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("no muta la lista original", () => {
    const lista = [parte({ id: "a", usos: 0 }), parte({ id: "b", usos: 9 })];
    ordenarPorUso(lista);
    expect(lista.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("busca por nombre sin tildes y por el final del documento", () => {
    const lista = [
      parte({ id: "a", nombre: "Callería Maderas", docNumero: "20512345678" }),
      parte({ id: "b", nombre: "Otra", docNumero: "20999999999" }),
    ];
    expect(filtrarPartes(lista, "calleria").map((p) => p.id)).toEqual(["a"]);
    // Quien tipea "45678" busca el final de un RUC, no el principio.
    expect(filtrarPartes(lista, "45678").map((p) => p.id)).toEqual(["a"]);
  });

  it("busca vehículos por placa aunque la tipeen con guión", () => {
    const lista = [vehiculo({ id: "v1", placa: "A2C123" }), vehiculo({ id: "v2", placa: "B9X777", transportistaNombre: null })];
    expect(filtrarVehiculos(lista, "a2c-123").map((v) => v.id)).toEqual(["v1"]);
    expect(filtrarVehiculos(lista, "selva").map((v) => v.id)).toEqual(["v1"]);
  });
});

describe("dirección completa", () => {
  it("arma la línea que va en la guía y saltea lo vacío", () => {
    expect(direccionCompleta(parte())).toBe("Av. Los Cedros 123, Callería, Coronel Portillo, Ucayali");
    expect(direccionCompleta(parte({ direccion: null, distrito: null }))).toBe("Coronel Portillo, Ucayali");
  });
});

describe("vehículo", () => {
  it("exige placa y admite capacidad nula (no todos la conocen)", () => {
    expect(vehiculoInputSchema.safeParse({ placa: "A2C" }).success).toBe(false);
    const ok = vehiculoInputSchema.safeParse({ placa: "A2C123", capacidadM3: null });
    expect(ok.success).toBe(true);
  });

  it("rechaza una capacidad negativa", () => {
    expect(vehiculoInputSchema.safeParse({ placa: "A2C123", capacidadM3: -1 }).success).toBe(false);
  });
});
