import { describe, expect, it } from "vitest";
import { decidirAvisoLista, diasEntre, esperadosEseDia, minutosDeLima, textoAvisoLista, ultimoDiaMarcado } from "@/lib/rrhh/aviso-pasar-lista";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";

const base = { minutosLima: 9 * 60, esperados: 11, marcasHoy: 0 };
const col = (o: Partial<ColaboradorMinDTO>): ColaboradorMinDTO => ({
  id: "c", nombre: "Ana", apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso: null, fechaCese: null, eventual: false, ...o,
});

describe("decidirAvisoLista", () => {
  it("avisa un lunes a las 9 sin marcas", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-10-26" })).toEqual({ avisar: true, motivo: "avisar" });
  });
  it("avisa el sábado", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-10-31" }).avisar).toBe(true);
  });
  it("no avisa el domingo", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-11-01" })).toEqual({ avisar: false, motivo: "domingo" });
  });
  it("no avisa en feriado (1 de enero, jueves en 2026)", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-01-01" })).toEqual({ avisar: false, motivo: "feriado" });
  });
  it("no avisa antes de las 9", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-10-26", minutosLima: 8 * 60 + 59 }).motivo).toBe("temprano");
  });
  it("no avisa si ya hay marcas", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-10-26", marcasHoy: 1 }).motivo).toBe("ya_hay_marcas");
  });
  it("no avisa sin trabajadores", () => {
    expect(decidirAvisoLista({ ...base, fecha: "2026-10-26", esperados: 0 }).motivo).toBe("sin_personal");
  });
});

describe("esperadosEseDia", () => {
  it("deja fuera eventuales, retirados, no ingresados y no activos", () => {
    const lista = [
      col({ id: "a" }),
      col({ id: "b", eventual: true }),
      col({ id: "c", fechaCese: "2026-10-01" }),
      col({ id: "d", fechaIngreso: "2026-11-01" }),
      col({ id: "e", estado: "LICENCIA" }),
    ];
    expect(esperadosEseDia(lista, "2026-10-26").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("textoAvisoLista / minutosDeLima", () => {
  it("arma el mensaje de Brandon", () => {
    expect(textoAvisoLista("Blas", 11, "https://x/y")).toBe("Hoy nadie marcó asistencia en Blas (11 trabajadores). Pasar lista: https://x/y");
    expect(textoAvisoLista("Blas", 1, "u")).toContain("(1 trabajador)");
  });
  it("suma «último día marcado» cuando se conoce", () => {
    expect(textoAvisoLista("Blas", 11, "https://x/y", { fecha: "2026-10-27", hoy: "2026-11-04" })).toBe(
      "Hoy nadie marcó asistencia en Blas (11 trabajadores; último día marcado: 27-10, hace 8 días). Pasar lista: https://x/y",
    );
    expect(textoAvisoLista("Blas", 1, "u", { fecha: "2026-11-03", hoy: "2026-11-04" })).toContain("hace 1 día)");
    expect(textoAvisoLista("Blas", 1, "u", null)).toBe("Hoy nadie marcó asistencia en Blas (1 trabajador). Pasar lista: u");
  });
  it("Lima es UTC-5", () => {
    expect(minutosDeLima(new Date("2026-10-26T14:00:00Z"))).toBe(9 * 60);
    expect(minutosDeLima(new Date("2026-10-26T03:00:00Z"))).toBe(22 * 60);
  });
});

describe("ultimoDiaMarcado / diasEntre", () => {
  it("toma el día más reciente ANTERIOR a hoy, con cualquier marca", () => {
    expect(ultimoDiaMarcado(["2026-10-20", "2026-10-27", "2026-10-27", "2026-10-22"], "2026-11-04")).toBe("2026-10-27");
  });
  it("ignora hoy y el futuro; sin marcas da null", () => {
    expect(ultimoDiaMarcado(["2026-11-04", "2026-11-09"], "2026-11-04")).toBeNull();
    expect(ultimoDiaMarcado([], "2026-11-04")).toBeNull();
  });
  it("cuenta días de calendario (cruza mes y año)", () => {
    expect(diasEntre("2026-10-27", "2026-11-04")).toBe(8);
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
  });
});
