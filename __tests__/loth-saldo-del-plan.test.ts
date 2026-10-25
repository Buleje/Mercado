import { describe, expect, it } from "vitest";
import { frenoDeSaldo, frenoSinPlan, saldoDelPlan, type MovimientoDelSaldo } from "@/lib/forestal/loth-saldo-cascada";
import { excedeTechoM3, excesoT6, mensajeT6 } from "@/lib/forestal/loth-t6";

const PLAN = "plan-096";
const especies = [
  { speciesCommon: "Tornillo (Cedrelinga catenaeformis)", speciesScientific: "Cedrelinga catenaeformis", cites: false, volumenAutorizadoM3: 10 },
  { speciesCommon: "Cumala", speciesScientific: null, cites: false, volumenAutorizadoM3: 5 },
];

let n = 0;
/** Una troza del libro y su despacho por la guía `gtf`. */
function troza(especie: string, m3: number, gtf: string | null, planId: string | null = PLAN, status?: string): MovimientoDelSaldo[] {
  const codigo = `T-${++n}`;
  const base = { speciesScientific: null, quantity: null, unit: null, planId, status };
  return [
    { ...base, section: "trozado", speciesCommon: especie, trozaCode: codigo, volumeM3: m3, gtfNumber: null },
    { ...base, section: "despacho_troza", speciesCommon: especie, trozaCode: codigo, volumeM3: m3, gtfNumber: gtf },
  ];
}

describe("saldoDelPlan — autorizado · usado · queda por especie", () => {
  it("«TORNILLO» del libro descuenta del «Tornillo (Cedrelinga …)» del plan", () => {
    const s = saldoDelPlan(especies, [...troza("TORNILLO", 2.5, "001-1"), ...troza("tornillo", 1.25, "001-2")], PLAN);
    const t = s.especies.find((e) => e.clave === "tornillo");
    expect(t).toMatchObject({ autorizadoM3: 10, usadoM3: 3.75, quedaM3: 6.25, pctUsado: 37.5, excedido: false });
    expect(t?.guias.map((g) => [g.gtfNumber, g.m3, g.trozas])).toEqual([["001-1", 2.5, 1], ["001-2", 1.25, 1]]);
  });

  it("dos especies no se mezclan y el total suma sólo las que tienen techo", () => {
    const s = saldoDelPlan(especies, [...troza("Tornillo", 4, "001-1"), ...troza("Cumala", 1, "001-1"), ...troza("Capirona", 2, "001-1")], PLAN);
    expect(s.especies.map((e) => [e.clave, e.usadoM3, e.quedaM3])).toEqual([["tornillo", 4, 6], ["cumala", 1, 4], ["capirona", 2, null]]);
    expect(s.total).toEqual({ autorizadoM3: 15, usadoM3: 5, usadoSinPlanM3: 0, quedaM3: 10 });
    expect(s.sinTecho).toBe(false);
  });

  it("lo sin plan cuenta (ADR-459) y se dice aparte; lo de otro plan y lo anulado, no", () => {
    const s = saldoDelPlan(
      especies,
      [...troza("Tornillo", 2, "001-1"), ...troza("Tornillo", 3, "019-4", null), ...troza("Tornillo", 7, "001-9", "otro-plan"), ...troza("Tornillo", 6, "001-3", PLAN, "anulado")],
      PLAN,
    );
    const t = s.especies[0];
    expect(t).toMatchObject({ usadoM3: 5, usadoSinPlanM3: 3, quedaM3: 5 });
    expect(t.guias).toEqual([
      { gtfNumber: "019-4", m3: 3, trozas: 1, sinPlan: true },
      { gtfNumber: "001-1", m3: 2, trozas: 1, sinPlan: false },
    ]);
  });

  it("lo que mide T6 manda sobre la cuenta propia (la pantalla dice lo mismo que el 422)", () => {
    const s = saldoDelPlan(especies, troza("Tornillo", 2, "001-1"), PLAN, new Map([["tornillo", { autorizado: 10, movilizado: 2.4 }]]));
    expect(s.especies[0]).toMatchObject({ usadoM3: 2.4, quedaM3: 7.6 });
  });

  it("justo en el borde no está excedido; un litro más, sí; un diezmilésimo, no (excedeTechoM3)", () => {
    expect(saldoDelPlan(especies, troza("Cumala", 5, "001-1"), PLAN).especies[1].excedido).toBe(false);
    expect(saldoDelPlan(especies, troza("Cumala", 5.001, "001-1"), PLAN).especies[1].excedido).toBe(true);
    expect(saldoDelPlan(especies, troza("Cumala", 5.0003, "001-1"), PLAN).especies[1].excedido).toBe(false);
  });

  it("plan dado de baja con tala: el despacho sin plan cuenta con el volumen de su Trozado de OTRO plan (el despacho decide)", () => {
    // Blas 096: el despacho vuelve a sin plan, el trozado con árbol se queda en el plan dado de baja.
    const [z, d] = troza("Tornillo", 2, "096-1", "plan-baja");
    const prestado = [z, { ...d, planId: null }];
    const s = saldoDelPlan(especies, prestado, PLAN);
    expect(s.especies[0]).toMatchObject({ usadoM3: 2, usadoSinPlanM3: 2, quedaM3: 8 });
    expect(s.especies[0].guias).toEqual([{ gtfNumber: "096-1", m3: 2, trozas: 1, sinPlan: true }]);
    // El trozado de otro plan sin despacho en el alcance no cuenta; el despacho de otro plan, tampoco.
    expect(saldoDelPlan(especies, [z], PLAN).especies[0].usadoM3).toBe(0);
    expect(saldoDelPlan(especies, [z, d], PLAN).especies[0].usadoM3).toBe(0);
  });

  it("un plan sin especies queda sin techo", () => {
    const s = saldoDelPlan([], troza("Tornillo", 2, "001-1"), PLAN);
    expect(s.sinTecho).toBe(true);
    expect(s.especies[0]).toMatchObject({ clave: "tornillo", autorizadoM3: null, quedaM3: null, usadoM3: 2 });
  });
});

describe("frenoDeSaldo — la guía que se pasa del saldo, antes de enviar", () => {
  const saldo = saldoDelPlan(especies, [...troza("Tornillo", 8, "001-1"), ...troza("Cumala", 1, "001-1")], PLAN);

  it("justo en el borde pasa (≤, nunca ==)", () => {
    const f = frenoDeSaldo(saldo, especies, [{ comun: "Tornillo", volumeM3: 1.5 }, { comun: "TORNILLO", volumeM3: 0.5 }], "096");
    expect(f.bloqueos).toEqual([]);
  });

  it("se pasa: dice por cuánto y cuánto queda, igual que el servidor", () => {
    const f = frenoDeSaldo(saldo, especies, [{ comun: "TORNILLO", volumeM3: 3 }, { comun: "Tornillo", volumeM3: 2.2 }], "096");
    expect(f.bloqueos).toHaveLength(1);
    expect(f.bloqueos[0]).toMatchObject({ clave: "tornillo", guiaM3: 5.2, quedaM3: 2, excesoM3: 3.2 });
    expect(f.bloqueos[0].mensaje).toBe("Te pasas por 3.200 m³ de Tornillo (Cedrelinga catenaeformis): el plan 096 tiene 2.000 m³ de saldo.");
    const delServidor = mensajeT6("Tornillo (Cedrelinga catenaeformis)", { autorizado: 10, movilizado: 8 }, 5.2, false, "096");
    expect(delServidor.startsWith(f.bloqueos[0].mensaje)).toBe(true);
  });

  it("dos especies: frena la que se pasa, deja la otra", () => {
    const f = frenoDeSaldo(saldo, especies, [{ comun: "Tornillo", volumeM3: 1 }, { comun: "Cumala", volumeM3: 4.5 }], "096");
    expect(f.bloqueos.map((b) => [b.clave, b.excesoM3])).toEqual([["cumala", 0.5]]);
  });

  it("especie fuera del plan o plan sin volumen: avisa, no frena", () => {
    expect(frenoDeSaldo(saldo, especies, [{ comun: "Capirona", volumeM3: 3 }], "096")).toEqual({
      bloqueos: [],
      avisos: [{ especie: "Capirona", guiaM3: 3, mensaje: "Capirona no está entre las especies del plan 096: no tiene saldo contra qué medirse." }],
    });
    const vacio = saldoDelPlan([], [], PLAN);
    const f = frenoDeSaldo(vacio, [], [{ comun: "Tornillo", volumeM3: 99 }], null);
    expect(f.bloqueos).toEqual([]);
    expect(f.avisos[0].mensaje).toBe("El plan no tiene volumen autorizado: esta guía no se frena.");
  });

  it("lo que no pasa a 3 decimales no frena: nunca «Te pasas por 0.000 m³»", () => {
    /* Quedan 2,000 de Tornillo: 2,0003 se escribe 2,000 en la guía. */
    expect(frenoDeSaldo(saldo, especies, [{ comun: "Tornillo", volumeM3: 2.0003 }], "096").bloqueos).toEqual([]);
    const f = frenoDeSaldo(saldo, especies, [{ comun: "Tornillo", volumeM3: 2.001 }], "096");
    expect(f.bloqueos[0].mensaje).toBe("Te pasas por 0.001 m³ de Tornillo (Cedrelinga catenaeformis): el plan 096 tiene 2.000 m³ de saldo.");
    expect(excesoT6({ autorizado: 161.258, movilizado: 0 }, 161.265)).toBe(0.007);
    expect(excedeTechoM3(2.0003, 2)).toBe(false);
    expect(excedeTechoM3(161.265, 161.258)).toBe(true);
  });

  it("piezas sin volumen o sin especie no cuentan", () => {
    expect(frenoDeSaldo(saldo, especies, [{ comun: "Tornillo", volumeM3: null }, { comun: null, volumeM3: 50 }], "096")).toEqual({ bloqueos: [], avisos: [] });
  });
});

describe("frenoSinPlan — la guía SIN plan se mide contra todos los planes vigentes (revisión 25-10)", () => {
  const conTornillo = (id: string, nombre: string, m3: number, usado = 0) => {
    const delPlan = [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)", speciesScientific: "Cedrelinga catenaeformis", cites: false, volumenAutorizadoM3: m3 }];
    return { plan: { id, nombre }, delPlan, saldo: saldoDelPlan(delPlan, usado > 0 ? troza("Tornillo", usado, "000-1", id) : [], id) };
  };
  const sinTornillo = { plan: { id: "b", nombre: "PO-B" }, delPlan: [{ speciesCommon: "Capirona", speciesScientific: null }], saldo: saldoDelPlan([{ speciesCommon: "Capirona", speciesScientific: null, cites: false, volumenAutorizadoM3: 50 }], [], "b") };
  const vacio = { plan: { id: "c", nombre: "PO-C" }, delPlan: [], saldo: saldoDelPlan([], [], "c") };

  it("A con Tornillo 5 + B más nuevo sin la especie (y C sin especies): 6 m³ frenan contra A", () => {
    const f = frenoSinPlan([vacio, sinTornillo, conTornillo("a", "PO-A", 5)], [{ comun: "Tornillo", volumeM3: 6 }]);
    expect(f.bloqueos).toEqual([expect.objectContaining({ clave: "a:tornillo", excesoM3: 1 })]);
    expect(f.bloqueos[0].mensaje).toBe("Te pasas por 1.000 m³ de Tornillo (Cedrelinga catenaeformis): el plan PO-A tiene 5.000 m³ de saldo.");
    expect(f.avisos).toEqual([]);
  });

  it("dos planes con Tornillo: frena con el que se pasa, nombrándolo; si se pasan los dos, los dos (claves distintas)", () => {
    const uno = frenoSinPlan([conTornillo("a", "PO-A", 100), conTornillo("b", "PO-B", 5, 2)], [{ comun: "Tornillo", volumeM3: 4 }]);
    expect(uno.bloqueos.map((b) => [b.clave, b.excesoM3])).toEqual([["b:tornillo", 1]]);
    expect(uno.bloqueos[0].mensaje).toContain("el plan PO-B tiene 3.000 m³ de saldo");
    const dos = frenoSinPlan([conTornillo("a", "PO-A", 3), conTornillo("b", "PO-B", 5, 2)], [{ comun: "Tornillo", volumeM3: 4 }]);
    expect(dos.bloqueos.map((b) => b.clave)).toEqual(["a:tornillo", "b:tornillo"]);
  });

  it("hay planes con especies y ninguno tiene ésta → AVISA «Ningún plan vigente autoriza», no frena (el servidor tampoco)", () => {
    const f = frenoSinPlan([sinTornillo, vacio], [{ comun: "Cedro", volumeM3: 1 }, { comun: "CEDRO", volumeM3: 2 }]);
    expect(f.bloqueos).toEqual([]);
    expect(f.avisos).toEqual([{ especie: "Cedro", guiaM3: 3, mensaje: "Ningún plan vigente autoriza Cedro. Si es de un título tuyo, crea su plan en Planes." }]);
  });

  it("sin planes (o sólo sin especies) no hay contra qué medir: no dice nada", () => {
    expect(frenoSinPlan([], [{ comun: "Tornillo", volumeM3: 99 }])).toEqual({ bloqueos: [], avisos: [] });
    expect(frenoSinPlan([vacio], [{ comun: "Tornillo", volumeM3: 99 }])).toEqual({ bloqueos: [], avisos: [] });
  });
});
