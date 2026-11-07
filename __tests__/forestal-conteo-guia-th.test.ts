/**
 * ADR-450 L1 — recibir la guía del Libro TH CONTANDO las trozas (reglas puras).
 *
 * La pantalla (pie en vivo) y el servidor (lo que registra) llaman a estas
 * mismas funciones: lo que se prueba acá es lo que queda en el libro.
 */
import { describe, expect, it } from "vitest";
import {
  huellaDeReparto,
  medidaRecibidaFinal,
  MOTIVO_NO_LLEGO,
  planearConteo,
  resumenConteo,
  SobrantesSchema,
  TOLERANCIA_DIAMETRO_CM,
  TOLERANCIA_LARGO_M,
  TrozaContada,
  type TrozaContadaInput,
} from "@/lib/forestal/conteo-guia-th";
import { ingresosDesdeGuiaTh, type ItemGuiaTh, type LineaDeIngresoTh } from "@/lib/forestal/guia-th-al-ctp";

const item = (o: Partial<ItemGuiaTh>): ItemGuiaTh => ({
  code: null,
  treeCode: null,
  species: "Sapotillo",
  scientific: null,
  cites: false,
  diamMayorM: null,
  diamMenorM: null,
  lengthM: null,
  volumeM3: null,
  pieces: 1,
  trozadoId: null,
  ...o,
});

/** Como Blas: 113-A (Ø 0,70 → 0,60 m, 5 m = 1,6592 m³ con smalianVolume), 113-B y una Lupuna. */
const guia = (): LineaDeIngresoTh[] => {
  const r = ingresosDesdeGuiaTh([
    item({ code: "113-A", treeCode: "113", diamMayorM: 0.7, diamMenorM: 0.6, lengthM: 5, volumeM3: 1.6592 }),
    item({ code: "113-B", treeCode: "113", diamMayorM: 0.6, diamMenorM: 0.55, lengthM: 4, volumeM3: 1.0387 }),
    item({ code: "114-A", treeCode: "114", species: "Lupuna", diamMayorM: 0.9, diamMenorM: 0.85, lengthM: 4, volumeM3: 2.4053 }),
  ]);
  if (!r.ok) throw new Error(r.motivo);
  return r.lineas;
};

/** El conteo validado por el MISMO schema del POST (limpia la obs). */
const contar = (filas: TrozaContadaInput[]): TrozaContada[] =>
  filas.map((f) => {
    const p = TrozaContada.safeParse(f);
    if (!p.success) throw new Error(JSON.stringify(p.error.issues));
    return p.data;
  });

const todas = (llego = true): TrozaContadaInput[] => [1, 2, 3].map((orden) => ({ orden, llego }));

describe("planearConteo — cada troza de la guía una vez", () => {
  it("un orden que falta, repetido o que no es de la guía → CONTEO_INCOMPLETO con la troza nombrada", () => {
    const falta = planearConteo(guia(), contar([{ orden: 1, llego: true }, { orden: 2, llego: true }]), true);
    expect(falta).toMatchObject({ ok: false, code: "CONTEO_INCOMPLETO" });
    expect(falta.ok === false && falta.motivo).toContain("114-A");

    const repetida = planearConteo(guia(), contar([...todas(), { orden: 1, llego: false }]), true);
    expect(repetida).toMatchObject({ ok: false, code: "CONTEO_INCOMPLETO" });
    expect(repetida.ok === false && repetida.motivo).toContain("113-A está contada dos veces");

    const ajena = planearConteo(guia(), contar([...todas(), { orden: 9, llego: true }]), true);
    expect(ajena).toMatchObject({ ok: false, code: "CONTEO_INCOMPLETO" });
    expect(ajena.ok === false && ajena.motivo).toContain("N° 9");
  });

  it("nada llegó → NADA_LLEGO, aunque se confirme", () => {
    expect(planearConteo(guia(), contar(todas(false)), true)).toMatchObject({ ok: false, code: "NADA_LLEGO" });
  });

  it("faltantes sin confirmar → FALTANTES_SIN_CONFIRMAR; confirmadas → entran «no llegó» con motivo", () => {
    const conteo = contar([{ orden: 1, llego: true }, { orden: 2, llego: false }, { orden: 3, llego: true }]);
    const sin = planearConteo(guia(), conteo, undefined);
    expect(sin).toMatchObject({ ok: false, code: "FALTANTES_SIN_CONFIRMAR" });
    expect(sin.ok === false && sin.motivo).toContain("113-B");

    const con = planearConteo(guia(), conteo, true);
    if (!con.ok) throw new Error(con.motivo);
    const b = con.piezas.find((p) => p.codificacion === "113-B");
    expect(b).toMatchObject({ llego: false, recepcionObs: MOTIVO_NO_LLEGO, recibida: null, como: null });
    expect(con.resumen).toMatchObject({ total: 3, llegaron: 2, noLlegaron: 1, sinContar: 0, m3NoLlego: 1.0387 });
    /* El m³ declarado no se mueve: la faltante se informa. */
    expect(con.resumen.m3Declarado).toBe(5.1032);
    expect(con.avisos.join(" ")).toContain("faltan 1.039 m³");
  });

  it("la observación del que recibe manda sobre el motivo por defecto (y sin invisibles)", () => {
    const con = planearConteo(
      guia(),
      contar([{ orden: 1, llego: true }, { orden: 2, llego: false, obs: "​Se quedó en el embarcadero" }, { orden: 3, llego: true }]),
      true,
    );
    if (!con.ok) throw new Error(con.motivo);
    expect(con.piezas[1].recepcionObs).toBe("Se quedó en el embarcadero");
  });

  it("una medida en una troza que no llegó es un error: si se midió, llegó", () => {
    const r = planearConteo(guia(), contar([{ orden: 1, llego: false, medida: { largoM: 4.2 } }, { orden: 2, llego: true }, { orden: 3, llego: true }]), true);
    expect(r).toMatchObject({ ok: false, code: "CONTEO_INCOMPLETO" });
    expect(r.ok === false && r.motivo).toContain("113-A figura como que no llegó y trae medidas");
  });

  it("R1: una especie sin ninguna troza llegada se registra igual, con aviso obligatorio", () => {
    const r = planearConteo(guia(), contar([{ orden: 1, llego: true }, { orden: 2, llego: true }, { orden: 3, llego: false }]), true);
    if (!r.ok) throw new Error(r.motivo);
    const lupuna = r.resumen.porEspecie.find((e) => e.especie === "Lupuna");
    expect(lupuna).toMatchObject({ trozas: 1, llegaron: 0, m3Guia: 2.4053, m3Llego: 0, m3Falta: 2.4053 });
    expect(r.avisos.some((a) => a.startsWith("De Lupuna no llegó ninguna troza"))).toBe(true);
  });
});

describe("la que llegó distinta: la guía no se pisa", () => {
  const a113 = () => guia()[0].trozas[0];

  it("113-A corregida a L 4,20 → 1,3937 m³ (smalianVolume); los diámetros salen de la guía", () => {
    expect(medidaRecibidaFinal(a113(), { largoM: 4.2 })).toEqual({ d1Cm: 70, d2Cm: 60, largoM: 4.2, volumenM3: 1.3937 });
    const r = planearConteo(guia(), contar([{ orden: 1, llego: true, medida: { largoM: 4.2 } }, { orden: 2, llego: true }, { orden: 3, llego: true }]), undefined);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.piezas[0]).toMatchObject({ llego: true, volumenGuiaM3: 1.6592, masGrandeQueLaGuia: false });
    expect(r.resumen).toMatchObject({ distintas: 1, m3Recibido: 4.8377, brechaM3: 0.2655 });
    expect(r.avisos.join(" ")).toContain("El libro sigue con la medida de la guía");
  });

  it(`dentro de la tolerancia de la cinta (${TOLERANCIA_LARGO_M * 100} cm de largo, ${TOLERANCIA_DIAMETRO_CM} cm de Ø) no se guarda`, () => {
    expect(medidaRecibidaFinal(a113(), { largoM: 4.95 })).toBeNull();
    expect(medidaRecibidaFinal(a113(), { largoM: 5.05, d1Cm: 71, d2Cm: 59 })).toBeNull();
    expect(medidaRecibidaFinal(a113(), { largoM: 4.94 })).toMatchObject({ largoM: 4.94 });
    expect(medidaRecibidaFinal(a113(), { d1Cm: 71.5 })).toMatchObject({ d1Cm: 71.5, d2Cm: 60, largoM: 5 });
    expect(medidaRecibidaFinal(a113(), {})).toBeNull();
    expect(medidaRecibidaFinal(a113(), undefined)).toBeNull();
  });

  it("si mide MÁS que la guía, avisa «¿es otra troza?» sin bloquear", () => {
    const r = planearConteo(guia(), contar([{ orden: 1, llego: true, medida: { largoM: 6 } }, { orden: 2, llego: true }, { orden: 3, llego: true }]), undefined);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.piezas[0].masGrandeQueLaGuia).toBe(true);
    expect(r.avisos.join(" ")).toContain("La troza 113-A mide más que la guía");
  });

  it("los diámetros invertidos de la guía (R5, 111-A de Blas) se corrigen como medida recibida", () => {
    const r = ingresosDesdeGuiaTh([item({ code: "111-A", diamMayorM: 1, diamMenorM: 1.05, lengthM: 4, volumeM3: 3.3006 })]);
    if (!r.ok) throw new Error(r.motivo);
    const m = medidaRecibidaFinal(r.lineas[0].trozas[0], { d1Cm: 105, d2Cm: 100 });
    expect(m).toMatchObject({ d1Cm: 105, d2Cm: 100, largoM: 4 });
    /* Mismo promedio: mismo m³. La guía (1,000 / 1,050) no se toca. */
    expect(m?.volumenM3).toBe(3.3006);
    expect(r.lineas[0].trozas[0]).toMatchObject({ d1Cm: 100, d2Cm: 105 });
  });
});

describe("la huella de la lista", () => {
  it("es estable para la misma guía y cambia si cambia un código, un m³ o una troza", () => {
    const h = huellaDeReparto(guia());
    expect(h).toMatch(/^v1-[0-9a-f]{14}-3$/);
    expect(huellaDeReparto(guia())).toBe(h);
    const otroM3 = guia();
    otroM3[0].trozas[0].volumenM3 = 1.6593;
    expect(huellaDeReparto(otroM3)).not.toBe(h);
    const otroCodigo = guia();
    otroCodigo[0].trozas[1].codificacion = "113-C";
    expect(huellaDeReparto(otroCodigo)).not.toBe(h);
    const menos = guia().slice(0, 1);
    expect(huellaDeReparto(menos)).not.toBe(h);
    /* La especie o el árbol no son la lista: no cambian la huella. */
    const otraObs = guia();
    otraObs[0].trozas[0].arbolCodigo = "999";
    expect(huellaDeReparto(otraObs)).toBe(h);
  });
});

describe("resumenConteo — el pie mientras se cuenta", () => {
  it("cuenta lo contado, ignora lo ajeno y lo repetido, y deja sin contar el resto", () => {
    const r = resumenConteo(guia(), [
      { orden: 1, llego: true, medida: { largoM: 4.2 } },
      { orden: 1, llego: false },
      { orden: 9, llego: true },
    ]);
    expect(r).toMatchObject({ contadas: 1, total: 3, llegaron: 1, noLlegaron: 0, sinContar: 2, distintas: 1, m3Recibido: 1.3937 });
    /* En el orden de los renglones del libro (por m³): Sapotillo 2,698 antes que Lupuna 2,405. */
    expect(r.porEspecie.map((e) => [e.especie, e.llegaron, e.m3Falta])).toEqual([
      ["Sapotillo", 1, 1.0387],
      ["Lupuna", 0, 2.4053],
    ]);
  });
});

describe("revisión 29-09: el m³ tipeado a mano y los sobrantes", () => {
  it("con el m³ de la guía tipeado (1,500 con medidas que dan 1,659), 10 cm más corta NO «mide más» ni da brecha negativa", () => {
    const r = ingresosDesdeGuiaTh([item({ code: "113-A", diamMayorM: 0.7, diamMenorM: 0.6, lengthM: 5, volumeM3: 1.5 })]);
    if (!r.ok) throw new Error(r.motivo);
    const plan = planearConteo(r.lineas, contar([{ orden: 1, llego: true, medida: { largoM: 4.9 } }]), undefined);
    if (!plan.ok) throw new Error(plan.motivo);
    expect(plan.piezas[0]).toMatchObject({ masGrandeQueLaGuia: false, volumenGuiaM3: 1.5, volumenGuiaPorMedidasM3: 1.6592 });
    expect(plan.piezas[0].recibida?.volumenM3).toBe(1.626);
    /* Lo que llegó = el m³ escrito menos la diferencia física (1,626 − 1,659). */
    expect(plan.resumen).toMatchObject({ m3Declarado: 1.5, m3Recibido: 1.4668, brechaM3: 0.0332 });
    expect(plan.avisos.join(" ")).not.toContain("mide más que la guía");
    expect(plan.avisos.join(" ")).toContain("1.626 m³ contra 1.659 m³");
  });
  it("los sobrantes pierden invisibles, controles de dirección y controles ASCII antes de ir a la auditoría", () => {
    const r = SobrantesSchema.safeParse(["\u202Egnp.exe\u2066", "115-B\t", " 116\u200B "]);
    expect(r.success && r.data).toEqual(["gnp.exe", "115-B", "116"]);
    expect(SobrantesSchema.safeParse(["\u200B\u202E"]).success).toBe(false);
  });
});
