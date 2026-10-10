/**
 * __tests__/rrhh-dias-abiertos.test.ts
 *
 * Los días de asistencia que nadie abrió (ADR-417). El caso base es el real,
 * medido el 2026-09-15 contra la base de Blas: del 1 al 15 de setiembre
 * quedaron 8 días sin ninguna marca (01 a 07 y el 13, que fue domingo).
 *
 * Lo que importa: que el aviso no invente días (hoy y el futuro no están
 * abiertos, un día sin nadie trabajando tampoco) ni tape los que sí lo están
 * (alcanza UNA marca de UNA persona para cerrar un día).
 */
import { describe, expect, it } from "vitest";
import { diasAbiertos, notaDomingos, tituloDiasAbiertos } from "@/components/admin/rrhh/asistencia/dias-abiertos";
import { rangoDeDias } from "@/lib/rrhh/fechas";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";

const HOY = "2026-09-15"; // martes

function persona(id: string, fechaIngreso: string | null = "2026-08-01"): ColaboradorMinDTO {
  return { id, nombre: `Persona ${id}`, apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso, fechaCese: null };
}

const EQUIPO = [persona("c1"), persona("c2")];

/** Una marca por (persona, día): al aviso sólo le importa la fecha. */
const marcasEn = (fechas: string[], colaboradorId = "c1") => fechas.map((fecha) => ({ fecha, colaboradorId }));

describe("días abiertos — el mes con huecos al principio (caso real de Blas)", () => {
  const setiembre = rangoDeDias("2026-09-01", "2026-09-30");
  // Empezaron a marcar el 08; el 13 (domingo) quedó vacío. El 14 y el 15 sí
  // tienen marcas. Del 16 en adelante todavía no pasó.
  const marcas = marcasEn(["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-14", "2026-09-15"]);

  const abiertos = diasAbiertos({ dias: setiembre, marcas, hoy: HOY, colaboradores: EQUIPO });

  it("avisa los 8 días que nadie marcó, del más viejo al más nuevo", () => {
    expect(abiertos.map((d) => d.fecha)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-13",
    ]);
  });

  it("cada día viaja con su día de la semana: el 13 fue domingo, lo juzga el dueño", () => {
    const trece = abiertos.find((d) => d.fecha === "2026-09-13");
    expect(trece).toMatchObject({ diaSemana: "domingo", esDomingo: true, etiqueta: "domingo 13/09" });
    // El 06 también cayó domingo: dos en la lista, y el aviso lo dice.
    expect(abiertos.filter((d) => d.esDomingo).map((d) => d.fecha)).toEqual(["2026-09-06", "2026-09-13"]);
    expect(notaDomingos(abiertos)).toBe("2 son domingos");
  });

  it("el texto de la banda cuenta los días y nombra el mes como se dice en el Perú", () => {
    expect(tituloDiasAbiertos(abiertos, "2026-09")).toBe("Quedaron 8 días sin marcar en setiembre");
    expect(tituloDiasAbiertos(abiertos.slice(0, 1), "2026-09")).toBe("Quedó 1 día sin marcar en setiembre");
    expect(notaDomingos(abiertos.slice(0, 1))).toBeNull();
  });
});

describe("días abiertos — lo que NO se avisa", () => {
  it("hoy no está abierto (la jornada recién empieza) y el futuro tampoco", () => {
    const abiertos = diasAbiertos({
      dias: rangoDeDias("2026-09-14", "2026-09-18"),
      marcas: marcasEn(["2026-09-14"]),
      hoy: HOY,
      colaboradores: EQUIPO,
    });
    expect(abiertos).toEqual([]);
  });

  it("sin ninguna marca, hoy y los días por venir siguen sin contar: sólo el ayer sin marcar", () => {
    const abiertos = diasAbiertos({ dias: rangoDeDias("2026-09-14", "2026-09-18"), marcas: [], hoy: HOY, colaboradores: EQUIPO });
    expect(abiertos.map((d) => d.fecha)).toEqual(["2026-09-14"]);
  });

  it("un día con UNA sola marca de UNA sola persona ya no está abierto", () => {
    const dias = rangoDeDias("2026-09-10", "2026-09-12");
    const soloUna = diasAbiertos({ dias, marcas: marcasEn(["2026-09-11"], "c2"), hoy: HOY, colaboradores: EQUIPO });
    expect(soloUna.map((d) => d.fecha)).toEqual(["2026-09-10", "2026-09-12"]);
    // Lo que falte adentro de ese día es por persona: eso lo cuenta `conteo-mes.ts`, no este aviso.
    expect(soloUna.some((d) => d.fecha === "2026-09-11")).toBe(false);
  });

  it("un día en que nadie estaba vigente todavía no está abierto: no había a quién marcar", () => {
    const reciente = [persona("c3", "2026-09-10")];
    const abiertos = diasAbiertos({ dias: rangoDeDias("2026-09-07", "2026-09-12"), marcas: [], hoy: HOY, colaboradores: reciente });
    expect(abiertos.map((d) => d.fecha)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("fuera de la ventana de corrección del rol no se avisa: sería un aviso sin nada que hacer", () => {
    const abiertos = diasAbiertos({
      dias: rangoDeDias("2026-09-01", "2026-09-15"),
      marcas: [],
      hoy: HOY,
      colaboradores: EQUIPO,
      ventana: { desde: "2026-09-13", hasta: HOY }, // almacenero: hoy−2…hoy
    });
    expect(abiertos.map((d) => d.fecha)).toEqual(["2026-09-13", "2026-09-14"]);
  });

  it("sin colaboradores vigentes no hay días abiertos, aunque el mes esté vacío de marcas", () => {
    const cesado: ColaboradorMinDTO = { ...persona("c4"), estado: "CESADO", fechaCese: "2026-08-31" };
    expect(diasAbiertos({ dias: rangoDeDias("2026-09-01", "2026-09-14"), marcas: [], hoy: HOY, colaboradores: [cesado] })).toEqual([]);
  });
});
