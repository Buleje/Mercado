import { describe, expect, it } from "vitest";
import { marcasParaRevisar, motivosDeLaMarca, type HorarioDelPuesto } from "@/lib/rrhh/marcas-para-revisar";
import type { AsistenciaDTO } from "@/lib/rrhh/tipos";

const HOY = "2026-10-26";
const H: HorarioDelPuesto = { horaEntrada: "08:00", toleranciaMin: 10 };

function marca(p: Partial<AsistenciaDTO> = {}): AsistenciaDTO {
  return {
    id: "m1",
    colaboradorId: "c1",
    fecha: "2026-10-25",
    estado: "PRESENTE",
    entrada: "08:00",
    salida: "17:00",
    refrigerioMin: 0,
    horas: 9,
    nota: null,
    origen: "manual",
    marcadoPor: "blasadmin",
    marcadoEn: "2026-10-25T22:00:00Z",
    ...p,
  };
}
const codigos = (m: AsistenciaDTO, h: HorarioDelPuesto | null = H) => motivosDeLaMarca(m, h, HOY).map((x) => x.codigo);

describe("motivosDeLaMarca", () => {
  it("una marca normal no se señala", () => {
    expect(codigos(marca())).toEqual([]);
  });
  it("entrada sin salida de un día anterior; hoy todavía está trabajando", () => {
    expect(codigos(marca({ salida: null, horas: null }))).toEqual(["sin_salida"]);
    expect(codigos(marca({ salida: null, horas: null, fecha: HOY }))).toEqual([]);
  });
  it("sin hora tipeada no hay nada que dudar", () => {
    expect(codigos(marca({ entrada: null, salida: null, horas: null }))).toEqual([]);
  });
  it("salida antes de la entrada y jornada de más de 14 horas", () => {
    expect(codigos(marca({ entrada: "17:00", salida: "08:00", horas: -9 }), null)).toEqual(["salida_antes_de_entrada"]);
    expect(codigos(marca({ salida: "23:30", horas: 15.5 }))).toEqual(["jornada_larga"]);
  });
  it("kiosko sin foto, por la firma y la nota", () => {
    const m = marca({ origen: "kiosko", marcadoPor: "Kiosko de asistencia", nota: "Sin foto en el kiosko" });
    expect(codigos(m)).toEqual(["kiosko_sin_foto"]);
    expect(codigos(marca({ origen: "kiosko", marcadoPor: "Kiosko de asistencia" }))).toEqual([]);
  });
  it("hora fuera del horario por más de 90 min, antes o después", () => {
    expect(codigos(marca({ entrada: "10:00", estado: "TARDANZA" }))).toEqual(["fuera_de_horario"]);
    expect(codigos(marca({ entrada: "06:20" }))).toEqual(["fuera_de_horario"]);
    expect(codigos(marca({ entrada: "07:00" }))).toEqual([]);
  });
  it("tarde pero marcado Presente", () => {
    expect(codigos(marca({ entrada: "08:30" }))).toEqual(["tarde_sin_tardanza"]);
    expect(codigos(marca({ entrada: "08:30", estado: "TARDANZA" }))).toEqual([]);
    expect(codigos(marca({ entrada: "08:10" }))).toEqual([]);
  });
  it("sin horario en el puesto no se juzga la hora", () => {
    expect(codigos(marca({ entrada: "11:00" }), null)).toEqual([]);
  });
  it("falta, permiso y descanso no se revisan", () => {
    expect(codigos(marca({ estado: "FALTA", entrada: null, salida: "03:00" }))).toEqual([]);
  });
});

describe("marcasParaRevisar", () => {
  const colaboradores = [
    { id: "c1", nombre: "Zoila", puesto: { id: "p1", nombre: "Aserrador" } },
    { id: "c2", nombre: "Ana", puesto: null },
  ];
  const horarios = new Map([["p1", H]]);
  const malas = [
    marca({ id: "a", colaboradorId: "c1", salida: null, horas: null }),
    marca({ id: "b", colaboradorId: "c2", salida: null, horas: null }),
    marca({ id: "c", colaboradorId: "c1", fecha: "2026-10-24", entrada: "10:00", estado: "TARDANZA" }),
    marca({ id: "d", colaboradorId: "c1", fecha: "2026-10-23" }),
  ];

  it("deja sólo las dudosas, lo reciente primero y por nombre dentro del día", () => {
    const r = marcasParaRevisar({ marcas: malas, colaboradores, horarios, hoy: HOY, revisadas: new Set() });
    expect(r.map((x) => x.marca.id)).toEqual(["b", "a", "c"]);
  });
  it("las aprobadas salen de la lista y las de alguien que ya no está se ignoran", () => {
    const r = marcasParaRevisar({ marcas: [...malas, marca({ id: "z", colaboradorId: "zz", salida: null })], colaboradores, horarios, hoy: HOY, revisadas: new Set(["a"]) });
    expect(r.map((x) => x.marca.id)).toEqual(["b", "c"]);
  });
});
