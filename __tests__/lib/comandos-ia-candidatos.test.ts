import { describe, expect, it } from "vitest";
import {
  armarBandeja,
  conRef,
  formatoMonto,
  leerRef,
  proximoViernes,
  refDeCandidato,
  reglaFiado,
  reglaRitmo,
  reglaSeguimiento,
  type EntradaBandeja,
} from "@/lib/admin/comandos-ia/candidatos";
import { plantillaValida, rellenarPlantilla, PLANTILLAS_SIN_IA } from "@/lib/admin/comandos-ia/plantillas-sin-ia";

const HOY = "2026-10-09";

function entrada(p: Partial<EntradaBandeja> = {}): EntradaBandeja {
  return { hoy: HOY, fiados: [], nombres: new Map(), compras: [], adelantos: [], recordatorios: [], ...p };
}

const fiado = (id: string, status: string, fechaVence?: string, saldo = 150) => ({
  id, customerId: `9223344${id.length}5`, saldo, status, fechaVence, createdAt: "2026-07-20T15:00:00.000Z",
});

describe("reglaFiado: por status, nunca por saldo", () => {
  it("VENCIDO entra con los días desde que venció", () => {
    expect(reglaFiado({ status: "VENCIDO", fechaVence: "2026-08-01T00:00:00.000Z" }, HOY)).toEqual({ tipo: "fiado-vencido", dias: 69 });
  });
  it("CANCELADO y PAGADO no entran aunque tengan saldo", () => {
    const b = armarBandeja(entrada({ fiados: [fiado("a", "CANCELADO", undefined, 350), fiado("b", "PAGADO", "2026-10-01", 20)] }));
    expect(b).toHaveLength(0);
  });
  it("ACTIVO entra si vence en ≤7 días; a los 8 no", () => {
    expect(reglaFiado({ status: "ACTIVO", fechaVence: "2026-10-16" }, HOY)).toEqual({ tipo: "fiado-por-vencer", dias: 7 });
    expect(reglaFiado({ status: "ACTIVO", fechaVence: "2026-10-17" }, HOY)).toBeNull();
    expect(reglaFiado({ status: "ACTIVO", fechaVence: "2026-10-09" }, HOY)).toEqual({ tipo: "fiado-por-vencer", dias: 0 });
  });
  it("ACTIVO con la fecha ya pasada (nadie lo marcó) cuenta como vencido", () => {
    expect(reglaFiado({ status: "ACTIVO", fechaVence: "2026-10-05" }, HOY)).toEqual({ tipo: "fiado-vencido", dias: 4 });
  });
  it("ACTIVO sin fecha de vencimiento no entra", () => {
    expect(reglaFiado({ status: "ACTIVO" }, HOY)).toBeNull();
  });
});

describe("reglaRitmo: ≥3 compras y más de 2× su intervalo sin comprar", () => {
  it("cada 7 días y 15 sin venir → roto", () => {
    expect(reglaRitmo(["2026-09-10", "2026-09-17", "2026-09-24"], HOY)).toEqual({ compras: 3, intervalo: 7, diasSin: 15, ultima: "2026-09-24" });
  });
  it("cada 7 días y 14 sin venir → todavía no (es > 2×, no ≥)", () => {
    expect(reglaRitmo(["2026-09-11", "2026-09-18", "2026-09-25"], HOY)).toBeNull();
  });
  it("2 compras no alcanzan; el mismo día cuenta una vez", () => {
    expect(reglaRitmo(["2026-08-01", "2026-08-08"], HOY)).toBeNull();
    expect(reglaRitmo(["2026-08-01T10:00:00Z", "2026-08-01T18:00:00Z", "2026-08-08"], HOY)).toBeNull();
  });
});

describe("reglaSeguimiento", () => {
  const r = { id: "r1", title: "x", description: "", type: "pago", status: "pendiente", dueDate: "2026-10-09" };
  it("pendiente o vencido con fecha ≤ hoy, solo pago|cliente", () => {
    expect(reglaSeguimiento(r, HOY)).toBe(true);
    expect(reglaSeguimiento({ ...r, status: "vencido", dueDate: "2026-10-01" }, HOY)).toBe(true);
    expect(reglaSeguimiento({ ...r, dueDate: "2026-10-10" }, HOY)).toBe(false);
    expect(reglaSeguimiento({ ...r, status: "completado" }, HOY)).toBe(false);
    expect(reglaSeguimiento({ ...r, type: "inventario" }, HOY)).toBe(false);
  });
});

describe("armarBandeja", () => {
  it("un seguimiento vencido de un fiado ya pagado sale como pagado (para cerrarlo) y el fiado no se repite", () => {
    const f = fiado("f1", "PAGADO", "2026-10-01");
    const r = { id: "r1", title: "Cobrar", description: conRef("Hola", { tipo: "fiado", id: "f1" }), type: "pago", status: "vencido", dueDate: "2026-10-08" };
    const b = armarBandeja(entrada({ fiados: [f], recordatorios: [r] }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: "seg:r1", tipo: "seguimiento", pagado: true, recordatorioId: "r1" });
  });
  it("si no pagó, el seguimiento trae el saldo de HOY", () => {
    const f = fiado("f1", "VENCIDO", "2026-08-01", 90);
    const r = { id: "r1", title: "Cobrar", description: conRef("Hola", { tipo: "fiado", id: "f1" }), type: "pago", status: "pendiente", dueDate: "2026-10-09" };
    const [c] = armarBandeja(entrada({ fiados: [f], recordatorios: [r] }));
    expect(c).toMatchObject({ tipo: "seguimiento", pagado: false, datos: { monto: 90 }, ref: { tipo: "fiado", id: "f1" } });
    // Reprogramarlo apunta al MISMO fiado: el próximo vuelve a releer su saldo.
    expect(refDeCandidato(c)).toEqual({ tipo: "fiado", id: "f1" });
    expect(refDeCandidato({ id: "cliente:922334455", tipo: "cliente-ritmo" })).toEqual({ tipo: "cliente", id: "922334455" });
  });
  it("un deudor con un recordatorio todavía por venir no entra (ya le escribiste)", () => {
    const r = { id: "r1", title: "Cobrar", description: conRef("Hola", { tipo: "fiado", id: "f1" }), type: "pago", status: "pendiente", dueDate: "2026-10-16" };
    expect(armarBandeja(entrada({ fiados: [fiado("f1", "VENCIDO", "2026-08-01")], recordatorios: [r] }))).toHaveLength(0);
  });
  it("un recordatorio sin referencia (del dueño) no es alguien a quien escribir", () => {
    const r = { id: "r1", title: "Pagar la luz", description: "", type: "pago", status: "vencido", dueDate: "2026-10-01" };
    expect(armarBandeja(entrada({ recordatorios: [r] }))).toHaveLength(0);
  });
  it("adelantos sin teléfono o sin saldo no entran", () => {
    const b = armarBandeja(entrada({ adelantos: [
      { id: "a1", beneficiarioId: "b1", nombre: "Pepe", telefono: null, saldo: 100, moneda: "PEN", fecha: "2026-09-01" },
      { id: "a2", beneficiarioId: "b2", nombre: "Luis", telefono: "987654321", saldo: 0, moneda: "PEN", fecha: "2026-09-01" },
      { id: "a3", beneficiarioId: "b3", nombre: "Ana", telefono: "912345678", saldo: 300, moneda: "USD", fecha: "2026-09-01" },
    ] }));
    expect(b.map((c) => c.id)).toEqual(["adelanto:b3.USD"]);
  });
  it("varios adelantos de la misma persona y moneda son UN mensaje con el saldo sumado", () => {
    const b = armarBandeja(entrada({ adelantos: [
      { id: "a1", beneficiarioId: "b1", nombre: "Pepe", telefono: "987000111", saldo: 400, moneda: "PEN", fecha: "2026-08-04" },
      { id: "a2", beneficiarioId: "b1", nombre: "Pepe", telefono: "987000111", saldo: 333.34, moneda: "PEN", fecha: "2026-08-03" },
    ] }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: "adelanto:b1.PEN", datos: { monto: 733.34, desde: "2026-08-03" } });
    expect(b[0].origen).toContain("sus 2 adelantos");
  });
  it("un cliente que ya debe un fiado no sale además como «no ha vuelto»", () => {
    const tel = "922334455";
    const b = armarBandeja(entrada({
      fiados: [{ ...fiado("f1", "VENCIDO", "2026-08-01"), customerId: tel }],
      compras: ["2026-07-01", "2026-07-08", "2026-07-15"].map((fecha) => ({ telefono: tel, fecha })),
    }));
    expect(b.map((c) => c.tipo)).toEqual(["fiado-vencido"]);
  });
});

describe("referencia y textos", () => {
  it("conRef/leerRef van y vuelven sin ensuciar el mensaje", () => {
    const t = conRef("Hola Rosa", { tipo: "fiado", id: "cmthhhy4d00022pvzi6xpbp03" });
    expect(leerRef(t)).toEqual({ ref: { tipo: "fiado", id: "cmthhhy4d00022pvzi6xpbp03" }, texto: "Hola Rosa" });
    expect(leerRef(conRef(t, { tipo: "cliente", id: "922334455" })).ref).toEqual({ tipo: "cliente", id: "922334455" });
  });
  it("un teléfono con + o con espacios también vuelve (si no, el recordatorio queda huérfano)", () => {
    for (const id of ["+51987654321", "51 987 654 321", "+99999999999"]) {
      expect(leerRef(conRef("Hola", { tipo: "cliente", id }))).toEqual({ ref: { tipo: "cliente", id }, texto: "Hola" });
    }
  });
  it("monto con coma decimal y espacio de miles; viernes siguiente", () => {
    expect(formatoMonto(150)).toBe("S/ 150,00");
    expect(formatoMonto(1619.6)).toBe("S/ 1 619,60");
    expect(formatoMonto(300, "USD")).toBe("US$ 300,00");
    expect(proximoViernes("2026-10-09")).toBe("2026-10-16"); // hoy es viernes
    expect(proximoViernes("2026-10-07")).toBe("2026-10-09");
  });
  it("la plantilla de siempre se rellena con los datos releídos", () => {
    const texto = rellenarPlantilla(PLANTILLAS_SIN_IA.amable["fiado-vencido"], { nombre: "Rosa María", datos: { monto: 150, dias: 69, desde: "2026-07-20" } }, "Bodega San Martín");
    expect(texto).toContain("Hola Rosa,");
    expect(texto).toContain("S/ 150,00");
    expect(texto).toContain("lunes 20/07");
    expect(texto).not.toMatch(/\{\w+\}/);
  });
  it("una plantilla de IA con una cifra escrita o sin el hueco del monto se descarta", () => {
    expect(plantillaValida("fiado-vencido", "Hola {nombre}, debes {monto} desde hace tiempo, gracias")).toBe(true);
    expect(plantillaValida("fiado-vencido", "Hola {nombre}, debes S/ 20 desde hace tiempo, gracias")).toBe(false);
    expect(plantillaValida("fiado-vencido", "Hola {nombre}, tienes una cuenta pendiente con nosotros")).toBe(false);
  });
});
