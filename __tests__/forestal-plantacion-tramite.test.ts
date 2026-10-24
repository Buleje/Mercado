/**
 * Registro de Plantación Forestal — RNPF (ADR-380).
 *
 * Lo que importa acá: el código interno nunca se confunde con el código
 * SERFOR, un estado desconocido nunca cae en algo distinto de "borrador", las
 * advertencias avisan sin borrar nada, y el resumen numérico ("8.50 ha | 3
 * bloques…") cuenta lo que el operador realmente cargó — no lo que el sistema
 * cree que debería haber.
 */
import { describe, expect, it } from "vitest";
import {
  calcularAvance,
  calcularResumen,
  nombreTitular,
  normalizarEstado,
  siguienteCodigoInterno,
  validarPlantacion,
  type BloqueInput,
  type PlantacionInput,
} from "@/lib/forestal/plantacion-tramite";

const vacia = (): PlantacionInput => ({
  tipoTramite: "inscripcion",
  bloques: [],
});

const bloque = (over: Partial<BloqueInput> = {}): BloqueInput => ({
  numero: 1,
  superficieHa: 2,
  vertices: [
    { orden: 0, este: 500_000, norte: 9_000_000, zonaUtm: "18S" },
    { orden: 1, este: 500_100, norte: 9_000_000, zonaUtm: "18S" },
    { orden: 2, este: 500_050, norte: 9_000_100, zonaUtm: "18S" },
  ],
  especies: [
    { nombreComun: "Tornillo", nombreCientifico: "Cedrelinga cateniformis", cantidad: 100, mesInstalacion: 3, anioInstalacion: 2024 },
  ],
  ...over,
});

describe("siguienteCodigoInterno", () => {
  it("arranca en 0001 el primer año", () => {
    expect(siguienteCodigoInterno([], new Date("2026-01-01"))).toBe("RPF-2026-0001");
  });

  it("sigue el correlativo del mismo año", () => {
    const existentes = ["RPF-2026-0001", "RPF-2026-0002"];
    expect(siguienteCodigoInterno(existentes, new Date("2026-06-01"))).toBe("RPF-2026-0003");
  });

  it("resetea al cambiar de año — no arrastra la numeración del año anterior", () => {
    const existentes = ["RPF-2025-0001", "RPF-2025-0002", "RPF-2025-0099"];
    expect(siguienteCodigoInterno(existentes, new Date("2026-01-01"))).toBe("RPF-2026-0001");
  });

  it("ignora códigos de otro tenant/formato que no matchean el prefijo", () => {
    expect(siguienteCodigoInterno(["algo-random", "RPF-2027-0005"], new Date("2026-01-01"))).toBe("RPF-2026-0001");
  });
});

describe("normalizarEstado", () => {
  it("un estado desconocido cae a borrador, nunca a otro estado", () => {
    expect(normalizarEstado("presentado")).toBe("borrador");
    expect(normalizarEstado(undefined)).toBe("borrador");
    expect(normalizarEstado(null)).toBe("borrador");
  });

  it("preserva un estado válido", () => {
    expect(normalizarEstado("listo_presentar")).toBe("listo_presentar");
  });
});

describe("nombreTitular", () => {
  it("persona jurídica usa la razón social", () => {
    expect(nombreTitular({ ...vacia(), titularTipoPersona: "juridica", titularRazonSocial: "Alas Verdes SAC" })).toBe("Alas Verdes SAC");
  });

  it("persona natural arma nombre + apellidos, sin huecos por campos vacíos", () => {
    expect(
      nombreTitular({ ...vacia(), titularTipoPersona: "natural", titularNombres: "José", titularApellidoPaterno: "López", titularApellidoMaterno: "" }),
    ).toBe("José López");
  });

  it("sin datos, nunca inventa un nombre", () => {
    expect(nombreTitular(vacia())).toBe("—");
  });
});

describe("calcularResumen", () => {
  it("cuenta bloques, especies únicas (case-insensitive) y plantas totales", () => {
    const datos: PlantacionInput = {
      ...vacia(),
      predioAreaTotalHa: 10,
      bloques: [
        bloque({ numero: 1, superficieHa: 3, especies: [{ nombreComun: "Tornillo", cantidad: 100 }, { nombreComun: "tornillo", cantidad: 50 }] }),
        bloque({ numero: 2, superficieHa: 2, especies: [{ nombreComun: "Bolaina", cantidad: 200 }] }),
      ],
    };
    const r = calcularResumen(datos);
    expect(r.numBloques).toBe(2);
    expect(r.numEspecies).toBe(2); // "Tornillo" y "tornillo" son la misma especie
    expect(r.totalPlantas).toBe(350);
    expect(r.areaBloquesHa).toBe(5);
    expect(r.areaDeclaradaHa).toBe(10);
  });

  it("sin bloques, todo en cero — nunca NaN", () => {
    const r = calcularResumen(vacia());
    expect(r).toEqual({ areaDeclaradaHa: 0, areaBloquesHa: 0, numBloques: 0, numEspecies: 0, totalPlantas: 0 });
  });
});

describe("calcularAvance", () => {
  it("un trámite vacío está en 0%", () => {
    expect(calcularAvance(vacia())).toBe(0);
  });

  it("sube a medida que se completan secciones, sin pasar de 100", () => {
    const parcial = calcularAvance({ ...vacia(), titularTipoPersona: "natural", titularNumeroDocumento: "12345678", titularCelular: "999999999" });
    expect(parcial).toBeGreaterThan(0);
    expect(parcial).toBeLessThan(100);
  });

  it("con todas las secciones completas llega a 100", () => {
    const completa: PlantacionInput = {
      ...vacia(),
      titularTipoPersona: "natural",
      titularNumeroDocumento: "12345678",
      titularCelular: "999999999",
      predioNombre: "Predio Alas Verdes",
      predioAreaTotalHa: 5,
      predioDepartamento: "San Martín",
      predioDistrito: "La Banda de Shilcayo",
      bloques: [bloque()],
      documentos: [{ categoria: "mapa_ubicacion", clasificacion: "requerido", documentId: "doc-1" }],
      djAceptado: true,
    };
    expect(calcularAvance(completa)).toBe(100);
  });
});

describe("validarPlantacion", () => {
  it("avisa si falta la superficie, con el mensaje exacto del pedido original", () => {
    const avisos = validarPlantacion(vacia());
    expect(avisos.some((a) => a.mensaje === "Ingrese la superficie de la plantación.")).toBe(true);
  });

  it("avisa de vértices incompletos (1 o 2 puntos) pero no si el bloque no tiene ninguno todavía", () => {
    const conDosVertices = validarPlantacion({ ...vacia(), predioAreaTotalHa: 5, bloques: [bloque({ vertices: [{ orden: 0, este: 1, norte: 1 }, { orden: 1, este: 2, norte: 2 }] })] });
    expect(conDosVertices.some((a) => a.mensaje.includes("vértices incompletos"))).toBe(true);

    const sinVertices = validarPlantacion({ ...vacia(), predioAreaTotalHa: 5, bloques: [bloque({ vertices: [] })] });
    expect(sinVertices.some((a) => a.mensaje.includes("vértices incompletos"))).toBe(false);
  });

  it("avisa si una especie no tiene mes/año de instalación", () => {
    const avisos = validarPlantacion({ ...vacia(), predioAreaTotalHa: 5, bloques: [bloque({ especies: [{ nombreComun: "Cedro" }] })] });
    expect(avisos.some((a) => a.mensaje.includes("mes y año de instalación"))).toBe(true);
  });

  it("avisa si la suma de bloques supera el área declarada del predio", () => {
    const avisos = validarPlantacion({ ...vacia(), predioAreaTotalHa: 1, bloques: [bloque({ superficieHa: 5 })] });
    expect(avisos.some((a) => a.mensaje.includes("supera el área declarada"))).toBe(true);
  });

  it("una plantación bien formada no dispara avisos", () => {
    const datos: PlantacionInput = { ...vacia(), predioAreaTotalHa: 10, bloques: [bloque({ superficieHa: 2 })] };
    expect(validarPlantacion(datos)).toEqual([]);
  });

  it("nunca muta el input recibido", () => {
    const datos = { ...vacia(), predioAreaTotalHa: 1, bloques: [bloque({ superficieHa: 5 })] };
    const antes = JSON.stringify(datos);
    validarPlantacion(datos);
    expect(JSON.stringify(datos)).toBe(antes);
  });
});
