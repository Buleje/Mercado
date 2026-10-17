/**
 * «Medir escaneando» (Brandon, 2026-09-26): la tanda del patio, el escaneo que
 * cae en un campo de medida, qué le falta a una fila y la troza anotada sin
 * señal. Y cómo se nombran las actas del conteo en el libro.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_TANDA,
  borraLaMedida,
  conCambioLocal,
  conMedidaDeTanda,
  escaneoReciente,
  faltaParaGuardar,
  filaInicial,
  leerTanda,
  medidasEnCola,
  mezclarCarga,
  mismaMedida,
  oxQueFalta,
  pareceEscaneo,
  ponerEnTanda,
  quedoLaMedida,
  reconciliarTanda,
  restoDelEscaneo,
  resumenDeTanda,
  tandaParaGuardar,
  textoDeLoQueFalta,
  type MedidaDeLaTanda,
} from "@/lib/forestal/medir-patio";
import { ECO_DE_ETIQUETA_MS, VENTANA_FICHA_MS } from "@/lib/forestal/leer-escaneo-troza";
import { cambioDeFila, filaDeTroza, type FilaPlanilla } from "@/lib/forestal/planilla-oxapampa";
import {
  agruparFaltantes,
  diaDelConteo,
  firmaDelConteo,
  fraseDelConteo,
} from "@/lib/forestal/conteo-patio-historial";

const medida = (id: string, o: Partial<MedidaDeLaTanda> = {}): MedidaDeLaTanda => ({
  id,
  codigo: id,
  especie: "Tornillo",
  gtfNumber: "001-0000201",
  d1: 18,
  d2: 22,
  largo: 12,
  pt: 195.92,
  estado: "guardada",
  aviso: null,
  en: "2026-09-26T15:00:00.000Z",
  ...o,
});

const fila = (o: Partial<FilaPlanilla> = {}): FilaPlanilla => ({
  d1: "",
  d2: "",
  largo: "",
  d1Cm: "",
  d2Cm: "",
  ...o,
});

describe("la tanda", () => {
  it("lo último medido va arriba y una troza re-medida no se duplica", () => {
    let t = ponerEnTanda([], medida("a"));
    t = ponerEnTanda(t, medida("b"));
    t = ponerEnTanda(t, medida("a", { pt: 200 }));
    expect(t.map((m) => m.id)).toEqual(["a", "b"]);
    expect(t[0]!.pt).toBe(200);
  });

  it("no crece sin tope", () => {
    let t: MedidaDeLaTanda[] = [];
    for (let i = 0; i < MAX_TANDA + 5; i++) t = ponerEnTanda(t, medida(`t${i}`));
    expect(t).toHaveLength(MAX_TANDA);
    expect(t[0]!.id).toBe(`t${MAX_TANDA + 4}`);
  });

  it("suma el pt de las medidas (las borradas y las sin PT no cuentan) y dice cuántas no subieron", () => {
    const r = resumenDeTanda([
      medida("a", { pt: 195.92 }),
      medida("b", { pt: 100.5, estado: "en-equipo" }),
      medida("c", { pt: null, estado: "borrada" }),
      medida("d", { pt: null, estado: "con-aviso" }),
    ]);
    // «d» no tiene PT (sólo recibió sus cm): no cuenta como medida.
    expect(r).toEqual({ trozas: 2, pt: 296.42, enEquipo: 1, rechazadas: 0 });
  });

  it("lo que el servidor rechazó no suma PT y se cuenta aparte", () => {
    const r = resumenDeTanda([
      medida("a", { pt: 195.92 }),
      medida("b", { pt: 150, estado: "rechazada", aviso: "Su guía está anulada o rechazada: no se mide." }),
    ]);
    expect(r).toEqual({ trozas: 1, pt: 195.92, enEquipo: 0, rechazadas: 1 });
  });

  it("una rechazada guarda en la tablet lo que se mandó (para reenviarlo)", () => {
    const cambio = { id: "b", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60 };
    const json = tandaParaGuardar("2026-09-26", [medida("b", { estado: "rechazada", pt: null, cambio })]);
    expect(leerTanda(json, "2026-09-26")[0]).toMatchObject({ estado: "rechazada", cambio });
  });

  it("se guarda en la tablet y se lee igual el mismo día; la de otro día arranca vacía", () => {
    const json = tandaParaGuardar("2026-09-26", [medida("a"), medida("b", { estado: "en-equipo" })]);
    expect(leerTanda(json, "2026-09-26").map((m) => [m.id, m.estado])).toEqual([
      ["a", "guardada"],
      ["b", "en-equipo"],
    ]);
    expect(leerTanda(json, "2026-09-27")).toEqual([]);
  });

  it("lo roto o ajeno no rompe la pantalla", () => {
    expect(leerTanda(null, "2026-09-26")).toEqual([]);
    expect(leerTanda("{no es json", "2026-09-26")).toEqual([]);
    expect(leerTanda(JSON.stringify({ v: 2, fecha: "2026-09-26", medidas: [] }), "2026-09-26")).toEqual([]);
    const conBasura = JSON.stringify({
      v: 1,
      fecha: "2026-09-26",
      medidas: [null, { id: 3 }, { id: "x", codigo: "118", d1: "18", estado: "raro" }],
    });
    const [m] = leerTanda(conBasura, "2026-09-26");
    expect(m).toMatchObject({ id: "x", codigo: "118", d1: null, estado: "guardada" });
  });
});

describe("pareceEscaneo — la pistola tipeó en el campo de la medida", () => {
  it("una medida no es un escaneo", () => {
    for (const t of ["18", "18,5", "18.25", "120", "12'", "18″", "18 cm", "", "  "]) {
      expect(pareceEscaneo(t), t).toBe(false);
    }
  });

  it("el código de planta, el del bosque, el QR y los códigos con letras sí", () => {
    for (const t of ["90100123", "1180", "13/A (0000008)", "http://x/admin/q/abc123", "QA-T1", "QP-C1"]) {
      expect(pareceEscaneo(t), t).toBe(true);
    }
  });

  it("un número mal tipeado es un error de la celda, no un escaneo", () => {
    expect(pareceEscaneo("1.2.3")).toBe(false);
  });
});

describe("faltaParaGuardar", () => {
  const nueva = { id: "t1", d1Cm: null, d2Cm: null };
  const medida18 = { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92, d1Cm: 55, d2Cm: 51 };

  it("pide las medidas si no hay nada", () => {
    const f = fila();
    expect(faltaParaGuardar(nueva, f, cambioDeFila(nueva, f))).toBe("Anota las puntas y el largo.");
  });

  it("no deja guardar una cubicación a medias", () => {
    const sinLargo = fila({ d1: "18", d2: "22" });
    expect(faltaParaGuardar(nueva, sinLargo, cambioDeFila(nueva, sinLargo))).toBe("Falta el largo.");
    const sinPuntas = fila({ largo: "12" });
    expect(faltaParaGuardar(nueva, sinPuntas, cambioDeFila(nueva, sinPuntas))).toBe("Falta D1″ y D2″.");
  });

  it("con una sola punta no hay PT: dice cuál falta (revisión 26-09)", () => {
    const f = fila({ d1: "18", largo: "12" });
    expect(faltaParaGuardar(nueva, f, cambioDeFila(nueva, f))).toBe("Falta D2″.");
    expect(oxQueFalta(fila({ d2: "22" }))).toEqual(["d1", "largo"]);
    expect(textoDeLoQueFalta(["d1", "largo"])).toBe("Falta D1″ y el largo");
    expect(textoDeLoQueFalta(["d1", "d2", "largo"])).toBe("Falta D1″, D2″ y el largo");
    expect(oxQueFalta(fila())).toEqual([]);
  });

  it("un error de celda manda", () => {
    const f = fila({ d1: "900", d2: "22", largo: "12" });
    expect(faltaParaGuardar(nueva, f, null)).toBe("Corrige lo marcado en rojo.");
  });

  it("sólo los cm (la guía no los trae) se pueden guardar sin Oxapampa", () => {
    const f = fila({ d1Cm: "45", d2Cm: "48" });
    expect(faltaParaGuardar(nueva, f, cambioDeFila(nueva, f))).toBeNull();
  });

  it("una troza ya medida y sin tocar no se vuelve a mandar", () => {
    const f = filaDeTroza(medida18);
    expect(faltaParaGuardar(medida18, f, cambioDeFila(medida18, f))).toBe("Sin cambios: ya está guardada así.");
  });

  it("vaciar las tres celdas de una troza medida = borrar la medida", () => {
    const f = fila();
    const c = cambioDeFila(medida18, f);
    expect(faltaParaGuardar(medida18, f, c)).toBeNull();
    expect(c).toEqual({ id: "t1", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null });
    expect(borraLaMedida(medida18, c!)).toBe(true);
    expect(borraLaMedida(medida18, { id: "t1", oxLargoPies: 13 })).toBe(false);
  });
});

describe("la troza anotada sin señal", () => {
  const base = {
    id: "t1",
    oxD1Pulg: null,
    oxD2Pulg: null,
    oxLargoPies: null,
    oxPt: null,
    d1Cm: null as number | null,
    d2Cm: 51 as number | null,
    especieComun: "Cachimbo",
  };

  it("queda con sus medidas y el mismo pt que calcularía el servidor", () => {
    const t = conCambioLocal(base, { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 45, d2Cm: 99 });
    expect(t).toMatchObject({ oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92, especieComun: "Cachimbo" });
    // cm: sólo sobre vacío, como en el libro.
    expect(t.d1Cm).toBe(45);
    expect(t.d2Cm).toBe(51);
  });

  it("al recargar sin señal, la tanda le devuelve lo anotado", () => {
    const tanda = [medida("t1", { estado: "en-equipo", d1: 18, d2: 22, largo: 12, pt: 195.92 })];
    expect(conMedidaDeTanda(base, tanda)).toMatchObject({ oxD1Pulg: 18, oxPt: 195.92 });
    // Lo que ya subió viene del servidor: la tanda no lo pisa.
    expect(conMedidaDeTanda(base, [medida("t1", { estado: "guardada" })])).toBe(base);
  });
});

describe("reconciliarTanda — la cola subió lo anotado sin señal", () => {
  it("pasa a guardada con el pt del servidor si el servidor ya tiene esas medidas", () => {
    const tanda = [
      medida("a", { estado: "en-equipo", pt: 195.9 }),
      medida("b", { estado: "en-equipo" }),
      medida("c", { estado: "guardada" }),
    ];
    const trozas = [
      { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 },
      { id: "b", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, oxPt: null },
    ];
    const r = reconciliarTanda(tanda, trozas);
    expect(r.map((m) => [m.id, m.estado, m.pt])).toEqual([
      ["a", "guardada", 195.92],
      ["b", "en-equipo", 195.92],
      ["c", "guardada", 195.92],
    ]);
  });

  it("sin nada pendiente devuelve la misma tanda (no re-renderiza)", () => {
    const tanda = [medida("a")];
    expect(reconciliarTanda(tanda, [])).toBe(tanda);
  });

  it("10,125″ anotado sin señal vuelve del servidor como 10,13: es la MISMA medida (revisión 26-09)", () => {
    // Crudo, 10.13 − 10.125 = 0.0050000000000008: no era < 0,005 y la troza
    // quedaba «en la tablet» todo el día.
    expect(Math.abs(10.13 - 10.125) < 0.005).toBe(false);
    const tanda = [medida("a", { estado: "en-equipo", d1: 10.125, d2: 12.345, largo: 8.005, pt: 9.99 })];
    const trozas = [{ id: "a", oxD1Pulg: 10.13, oxD2Pulg: 12.35, oxLargoPies: 8.01, oxPt: 42.42 }];
    expect(reconciliarTanda(tanda, trozas)[0]).toMatchObject({ estado: "guardada", pt: 42.42 });
    expect(mismaMedida(10.125, 10.13)).toBe(true);
    expect(mismaMedida(10.12, 10.13)).toBe(false);
    expect(mismaMedida(null, null)).toBe(true);
    expect(mismaMedida(null, 0)).toBe(false);
  });

  it("la tablet calcula con las medidas redondeadas, como el servidor", () => {
    const t = conCambioLocal(
      { id: "a", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null } as { id: string; oxD1Pulg?: number | null; oxD2Pulg?: number | null },
      { id: "a", oxD1Pulg: 10.125, oxD2Pulg: 10.125, oxLargoPies: 10 },
    );
    expect([t.oxD1Pulg, t.oxD2Pulg]).toEqual([10.13, 10.13]);
  });

  const colaCon = (lista: { estado: string; motivo?: string; cambio: Record<string, unknown> }[]) =>
    medidasEnCola(lista.map((x) => ({ section: "medidas", payload: { trozas: [x.cambio] }, estado: x.estado, motivo: x.motivo })));

  it("si la cola la RECHAZÓ y el servidor no la tiene, pasa a «rechazada» sin PT y con lo mandado", () => {
    const cambio = { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 };
    const cola = colaCon([{ estado: "rechazado", motivo: "Figura como no llegada al patio.", cambio }]);
    const tanda = [medida("a", { estado: "en-equipo", pt: 195.92 })];
    const trozas = [{ id: "a", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, oxPt: null }];
    expect(reconciliarTanda(tanda, trozas, cola)[0]).toMatchObject({
      estado: "rechazada",
      pt: null,
      aviso: "Figura como no llegada al patio.",
      cambio,
    });
    // Mientras siga pendiente, sigue «en la tablet».
    const pendiente = colaCon([{ estado: "pendiente", cambio }]);
    expect(reconciliarTanda(tanda, trozas, pendiente)[0]!.estado).toBe("en-equipo");
  });

  it("si el servidor SÍ la tiene pero la cola rechazó una parte (los cm), queda «con aviso»", () => {
    const cambio = { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60 };
    const cola = colaCon([{ estado: "rechazado", motivo: "D1: el período Agosto 2026 está cerrado.", cambio }]);
    const tanda = [medida("a", { estado: "en-equipo" })];
    const trozas = [{ id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 }];
    expect(reconciliarTanda(tanda, trozas, cola)[0]).toMatchObject({
      estado: "con-aviso",
      pt: 195.92,
      aviso: "D1: el período Agosto 2026 está cerrado.",
    });
  });

  it("una rechazada que alguien guardó después (el servidor ya la tiene) pasa a guardada", () => {
    const tanda = [medida("a", { estado: "rechazada", pt: null, aviso: "x", cambio: { id: "a", oxD1Pulg: 18 } })];
    const trozas = [{ id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92 }];
    const [m] = reconciliarTanda(tanda, trozas, colaCon([]));
    expect(m).toMatchObject({ estado: "guardada", pt: 195.92, aviso: null });
    expect(m).not.toHaveProperty("cambio");
  });

  it("quedoLaMedida distingue el rechazo total del parcial", () => {
    const c = { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 };
    expect(quedoLaMedida(c, { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 })).toBe(true);
    expect(quedoLaMedida(c, { id: "a", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null })).toBe(false);
    // Sin la troza releída (p. ej. «No existe en este negocio») no quedó nada.
    expect(quedoLaMedida(c, undefined)).toBe(false);
    // Sólo mira lo que el cambio tocaba.
    expect(quedoLaMedida({ id: "a", oxD2Pulg: 22 }, { id: "a", oxD1Pulg: 99, oxD2Pulg: 22 })).toBe(true);
  });
});

describe("mezclarCarga — una recarga vieja no pisa la troza recién medida", () => {
  it("lo guardado DESPUÉS de que salió la carga gana; lo de antes, no", () => {
    const vieja = { id: "a", oxPt: null as number | null };
    const recien = { id: "a", oxPt: 195.92 };
    const otra = { id: "b", oxPt: 10 };
    const guardadas = new Map([["a", { n: 5, troza: recien }]]);
    // La carga salió con el contador en 4 y volvió con la «a» vieja.
    expect(mezclarCarga([vieja, otra], guardadas, 4)).toEqual([recien, otra]);
    // La carga salió después del guardado (contador 5): el servidor ya la tiene.
    expect(mezclarCarga([vieja, otra], guardadas, 5)).toEqual([vieja, otra]);
  });
});

describe("filaInicial — reenviar lo que el servidor rechazó", () => {
  const troza = { id: "a", oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, d1Cm: null, d2Cm: 51 };

  it("abre con lo mandado y «Guardar» tiene algo que reenviar", () => {
    const propuesta = { id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60, d2Cm: 99 };
    const f = filaInicial(troza, propuesta);
    expect(f).toEqual({ d1: "18", d2: "22", largo: "12", d1Cm: "60", d2Cm: "" });
    const c = cambioDeFila(troza, f);
    expect(c).toMatchObject({ id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60 });
    expect(faltaParaGuardar(troza, f, c)).toBeNull();
  });

  it("superponer lo rechazado a la troza (como antes) no dejaba reenviar: «Sin cambios»", () => {
    const encima = { ...troza, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 };
    const f = filaDeTroza(encima);
    expect(faltaParaGuardar(encima, f, cambioDeFila(encima, f))).toBe("Sin cambios: ya está guardada así.");
  });

  it("sin propuesta es la fila de siempre", () => {
    expect(filaInicial(troza)).toEqual(filaDeTroza(troza));
  });
});

describe("restoDelEscaneo — lo que la pistola sigue tipeando cae en «D1″»", () => {
  const trozas = [
    { id: "t58", codigoPlanta: "58", codificacion: "13/A (0000008)" },
    { id: "t118", codigoPlanta: "118", codificacion: null },
    { id: "t90", codigoPlanta: "90100127", codificacion: null },
  ];
  const T = 1_000_000;
  const r = escaneoReciente("t58", T);

  it("el «58» de las barras dentro de 2 s es el eco de la etiqueta, NO 58″", () => {
    expect(restoDelEscaneo("58", "", r, trozas, T + 300)).toBe("eco");
    expect(restoDelEscaneo("58", "", r, trozas, T + ECO_DE_ETIQUETA_MS - 1)).toBe("eco");
    // Pegado a la medida que ya tenía la troza (18 + 58).
    expect(restoDelEscaneo("1858", "18", r, trozas, T + 300)).toBe("eco");
    // El QR chico de la misma troza también.
    expect(restoDelEscaneo("https://buleje.pe/admin/q/t58xxxxx", "", escaneoReciente("t58xxxxx", T), [{ id: "t58xxxxx" }], T + 10)).toBe("eco");
  });

  it("pasados los 2 s, «58» es una medida", () => {
    expect(restoDelEscaneo("58", "", r, trozas, T + ECO_DE_ETIQUETA_MS)).toBeNull();
  });

  it("una medida de verdad tipeada rápido no se traga", () => {
    for (const m of ["18", "22,5", "12.25", "120"]) expect(restoDelEscaneo(m, "", r, trozas, T + 500), m).toBeNull();
  });

  it("las líneas del QR grande (con o sin su ícono) se callan dentro de la ventana de la ficha", () => {
    for (const l of ["🌳 Tornillo", "Tornillo", "2.412 m³", "D1 45 cm · D2 50 cm · 3,5 m", "──────", "GTF 001-0000201", "Especie: Tornillo"]) {
      expect(restoDelEscaneo(l, "", r, trozas, T + 800), l).toBe("ficha");
    }
    expect(restoDelEscaneo("Tornillo", "", r, trozas, T + VENTANA_FICHA_MS)).toBeNull();
  });

  it("el escaneo de OTRA troza no es ruido: se atiende aparte", () => {
    expect(restoDelEscaneo("90100127", "", r, trozas, T + 300)).toBeNull();
    expect(restoDelEscaneo("118", "", r, trozas, T + 300)).toBeNull();
  });

  it("sin escaneo reciente no se descarta nada", () => {
    expect(restoDelEscaneo("58", "", null, trozas, T + 300)).toBeNull();
  });
});

describe("las actas del conteo en el libro", () => {
  it("el día se escribe como en todo el panel", () => {
    expect(diaDelConteo("2026-09-26")).toBe("sábado 26/09");
    expect(diaDelConteo("2026-09-24")).toBe("jueves 24/09");
  });

  it("la frase dice lo que faltó primero, y si no faltó nada también", () => {
    expect(fraseDelConteo({ faltan: 3, sobrantes: 0, sorpresas: 0 })).toBe("faltaron 3");
    expect(fraseDelConteo({ faltan: 1, sobrantes: 1, sorpresas: 2 })).toBe(
      "faltó 1 · sobró 1 · 2 códigos desconocidos",
    );
    expect(fraseDelConteo({ faltan: 0, sobrantes: 2, sorpresas: 0 })).toBe("no faltó ninguna · sobraron 2");
    expect(fraseDelConteo({ faltan: 0, sobrantes: 0, sorpresas: 0 })).toBe("estaba todo");
  });

  it("la firma cambia si se sigue contando y se vuelve a terminar", () => {
    const c = { iniciadoEn: "2026-09-26T14:00:00.000Z", terminadoEn: null, lecturas: [] };
    expect(firmaDelConteo(c)).toBeNull();
    const fin = { ...c, terminadoEn: "2026-09-26T14:30:00.000Z", lecturas: [{ trozaId: "a", codigo: "", en: "x" }] };
    const otra = { ...fin, terminadoEn: "2026-09-26T14:40:00.000Z" };
    expect(firmaDelConteo(fin)).not.toBe(firmaDelConteo(otra));
  });

  it("lo que faltó sale por especie, la de más piezas primero y sin especie al final", () => {
    const f = (codigo: string, especieComun: string | null, volumenM3: number | null) => ({
      id: codigo,
      codigo,
      especieComun,
      gtfNumber: null,
      volumenM3,
    });
    const g = agruparFaltantes([
      f("120", "Tornillo", 1.2),
      f("x", null, 0.5),
      f("9", "Tornillo", 0.3),
      f("52/A", "Sapotillo", null),
    ]);
    expect(g.map((x) => [x.especie, x.piezas.map((p) => p.codigo), x.m3])).toEqual([
      ["Tornillo", ["9", "120"], 1.5],
      ["Sapotillo", ["52/A"], 0],
      ["Sin especie", ["x"], 0.5],
    ]);
  });
});
