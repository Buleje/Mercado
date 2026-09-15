/**
 * __tests__/rrhh-dto-nivel.test.ts
 *
 * ADR-414 §8 — whitelist explícita por nivel. Fija que el JSON de nivel
 * `marcar` (lo que ve un almacenero o un cajero) NO trae `documento`,
 * `celular`, `direccion`, `contactoEmergencia`, `observaciones` ni
 * `tarifa*` — ni siquiera como clave con valor `undefined`. Cada prueba
 * negativa demuestra que el nivel de arriba SÍ los trae, para probar que el
 * test realmente distingue algo (no que `dto.ts` nunca los puso).
 */
import { describe, expect, it } from "vitest";
import {
  aAsistenciaDTO,
  aColaboradorDTO,
  aColaboradorMinDTO,
  aPuestoDTO,
  aTarifaDTO,
  type AsistenciaRow,
  type ColaboradorRow,
  type PuestoRow,
  type TarifaRow,
} from "@/lib/rrhh/dto";

const colaboradorRow = (p: Partial<ColaboradorRow> = {}): ColaboradorRow => ({
  id: "c1",
  nombre: "Victor Quispe",
  apodo: "Vic",
  tipoDocumento: "DNI",
  documento: "12345678",
  celular: "999888777",
  fotoUrl: null,
  direccion: "Jr. Los Pinos 123",
  contactoEmergenciaNombre: "Ana",
  contactoEmergenciaCelular: "999111222",
  puestoId: "p1",
  puesto: { id: "p1", nombre: "Motosierrista" },
  estado: "ACTIVO",
  fechaIngreso: new Date("2026-01-01T00:00:00.000Z"),
  fechaCese: null,
  motivoCese: null,
  observaciones: "Nota interna",
  beneficiarioId: "b1",
  adminUserId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...p,
});

const CAMPOS_PROHIBIDOS_EN_MARCAR = [
  "documento",
  "tipoDocumento",
  "celular",
  "direccion",
  "contactoEmergencia",
  "observaciones",
  "beneficiarioId",
  "adminUserId",
  "tarifaVigente",
  "motivoCese",
];

describe("aColaboradorMinDTO — nivel marcar: sin ningún dato sensible", () => {
  it("el objeto no tiene NINGUNA de las claves prohibidas, ni siquiera undefined", () => {
    const dto = aColaboradorMinDTO(colaboradorRow());
    const claves = Object.keys(dto);
    for (const prohibida of CAMPOS_PROHIBIDOS_EN_MARCAR) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it("CONTROL NEGATIVO: aColaboradorDTO (gestion/completo) SÍ trae esos campos", () => {
    const dto = aColaboradorDTO(colaboradorRow(), "completo");
    expect(Object.keys(dto)).toEqual(
      expect.arrayContaining(["documento", "celular", "direccion", "contactoEmergencia", "observaciones"]),
    );
  });

  it("sólo trae lo que hace falta para marcar", () => {
    const dto = aColaboradorMinDTO(colaboradorRow());
    expect(dto).toEqual({
      id: "c1",
      nombre: "Victor Quispe",
      apodo: "Vic",
      puesto: { id: "p1", nombre: "Motosierrista" },
      estado: "ACTIVO",
      fechaIngreso: "2026-01-01",
      fechaCese: null,
    });
  });
});

describe("aColaboradorDTO — gestion enmascara el documento, completo no", () => {
  it("gestion: documento enmascarado", () => {
    expect(aColaboradorDTO(colaboradorRow(), "gestion").documento).toBe("•••• 5678");
  });
  it("completo: documento completo", () => {
    expect(aColaboradorDTO(colaboradorRow(), "completo").documento).toBe("12345678");
  });
  it("ninguno de los dos niveles agrega tarifaVigente por su cuenta (lo agrega quien arma la ficha)", () => {
    expect(Object.keys(aColaboradorDTO(colaboradorRow(), "gestion"))).not.toContain("tarifaVigente");
    expect(Object.keys(aColaboradorDTO(colaboradorRow(), "completo"))).not.toContain("tarifaVigente");
  });
});

describe("aPuestoDTO — la tarifa sugerida sólo en nivel completo", () => {
  const row: PuestoRow = {
    id: "p1",
    nombre: "Motosierrista",
    descripcion: null,
    tarifaModalidad: "DIA",
    tarifaMonto: 60,
    horasJornada: 8,
    orden: 1,
  };

  it("completo: trae tarifaSugerida", () => {
    expect(aPuestoDTO(row, "completo", 3).tarifaSugerida).toEqual({ modalidad: "DIA", monto: 60 });
  });
  it("gestion y marcar: la clave NO existe", () => {
    expect(Object.keys(aPuestoDTO(row, "gestion", 3))).not.toContain("tarifaSugerida");
    expect(Object.keys(aPuestoDTO(row, "marcar", 3))).not.toContain("tarifaSugerida");
  });
});

describe("aAsistenciaDTO — `reemplazada` sólo en el historial", () => {
  const row: AsistenciaRow = {
    id: "a1",
    colaboradorId: "c1",
    fecha: new Date("2026-09-11T00:00:00.000Z"),
    estado: "PRESENTE",
    entradaMin: 480,
    salidaMin: 1020,
    refrigerioMin: 60,
    horas: 8,
    nota: null,
    origen: "manual",
    marcadoPor: "qaadmin",
    createdAt: new Date("2026-09-11T08:10:00.000Z"),
    deletedAt: null,
    reemplazadaPorId: null,
    motivoCorreccion: null,
  };

  it("sin conHistorial (default): la clave reemplazada no existe", () => {
    expect(Object.keys(aAsistenciaDTO(row))).not.toContain("reemplazada");
  });
  it("con conHistorial=true y la fila viva: reemplazada es null", () => {
    expect(aAsistenciaDTO(row, true).reemplazada).toBeNull();
  });
  it("con conHistorial=true y la fila ya reemplazada: trae quién, cuándo y el motivo", () => {
    const reemplazada = {
      ...row,
      deletedAt: new Date("2026-09-11T09:00:00.000Z"),
      reemplazadaPorId: "a2",
      motivoCorreccion: "Tipeó mal la hora",
    };
    expect(aAsistenciaDTO(reemplazada, true).reemplazada).toEqual({
      en: "2026-09-11T09:00:00.000Z",
      por: "a2",
      motivo: "Tipeó mal la hora",
    });
  });
});

describe("aTarifaDTO", () => {
  it("convierte Date a FechaKey y la moneda siempre sale PEN", () => {
    const row: TarifaRow = {
      id: "t1",
      modalidad: "DIA",
      monto: 60,
      horasJornada: 8,
      vigenteDesde: new Date("2026-08-01T00:00:00.000Z"),
      motivo: null,
      createdBy: "qaadmin",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    };
    const dto = aTarifaDTO(row);
    expect(dto.vigenteDesde).toBe("2026-08-01");
    expect(dto.moneda).toBe("PEN");
  });
});
