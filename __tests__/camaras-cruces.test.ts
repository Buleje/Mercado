/**
 * Cruces de la cámara (ADR-456 §3-4) — las reglas puras.
 *
 * Lo que se prueba acá es lo que puede acusar a alguien: una placa «parecida»
 * que en realidad es otro camión, un chaleco que se le pone a la persona
 * equivocada, o un WhatsApp de «bajó la pila» un día que la sierra trabajó.
 */

import { describe, expect, it } from "vitest";
import {
  bajadaDeNoche,
  comoDigito,
  puedeCompararPila,
  anteriorParaPila,
  comparadaHacePoco,
  aplicarAnalisis,
  asignarChaleco,
  chalecosDe,
  compararPlacas,
  confirmarCruce,
  configurarVigilaPila,
  cruzarChalecos,
  cruzarPlaca,
  dentroDeDias,
  diaDelRegistro,
  diaLima,
  diasDeLaComparacion,
  horaDeMinutos,
  movimientosEnDias,
  normalizarChaleco,
  normalizarChalecos,
  normalizarPlacaCruce,
  numeroParaAvisoPila,
  pilaBajoDeVerdad,
  puedeAvisarPila,
  textoAvisoPila,
  type CandidatoPlaca,
} from "@/lib/camaras/cruces";
import { esNocheEnLima, type Camara, type Captura } from "@/lib/camaras/camaras";

const cand = (tipo: CandidatoPlaca["tipo"], refId: string, placa: string): CandidatoPlaca => ({
  tipo,
  refId,
  placa,
  etiqueta: `${tipo} ${refId}`,
});

describe("placas: normalizar y comparar", () => {
  it("normaliza a mayúsculas sin guion ni espacios", () => {
    expect(normalizarPlacaCruce("w2d-835")).toBe("W2D835");
    expect(normalizarPlacaCruce(" abc 123 ")).toBe("ABC123");
    expect(normalizarPlacaCruce(null)).toBe("");
  });

  it("peruanas ABC-123 y A1B-234: exacta aunque una venga con guion y la otra no", () => {
    expect(compararPlacas("ABC-123", "abc123")).toBe("exacta");
    expect(compararPlacas("A1B-234", "A1B 234")).toBe("exacta");
  });

  it("parecida = UNA diferencia entre caracteres que la cámara confunde", () => {
    expect(compararPlacas("ABC-1Z3", "ABC-123")).toBe("parecida"); // 2/Z
    expect(compararPlacas("A1B-234", "AIB-234")).toBe("parecida"); // 1/I
    expect(compararPlacas("W2D-835", "W2O-835")).toBe("parecida"); // D/O
    expect(compararPlacas("A1B-834", "A1B-B34")).toBe("parecida"); // 8/B
    expect(compararPlacas("AB5-123", "ABS-123")).toBe("parecida"); // 5/S
    expect(compararPlacas("AB6-123", "ABG-123")).toBe("parecida"); // 6/G
  });

  it("sin falsos positivos: dos diferencias confundibles ya es otro camión", () => {
    expect(compararPlacas("ABC-1Z3", "ABC-I23")).toBeNull(); // Z≠2 y I≠1 → dos
    expect(compararPlacas("W2D-835", "WZO-835")).toBeNull();
  });

  it("una diferencia NO confundible es otra placa", () => {
    expect(compararPlacas("ABC-123", "ABC-124")).toBeNull(); // 3/4
    expect(compararPlacas("ABC-123", "ABX-123")).toBeNull();
  });

  it("largos distintos o placa demasiado corta: nada", () => {
    expect(compararPlacas("ABC-123", "ABC-1234")).toBeNull();
    expect(compararPlacas("AB1", "AB1")).toBeNull();
    expect(compararPlacas("", "")).toBeNull();
  });
});

describe("cruzarPlaca", () => {
  it("exacta primero, después guía > flete > vehículo; la placa sale normalizada", () => {
    const r = cruzarPlaca("abc-123", [
      cand("vehiculo", "v1", "ABC123"),
      cand("gtf", "g1", "ABC-1Z3"),
      cand("flete", "f1", "ABC-123"),
      cand("gtf", "g2", "ABC-123"),
    ]);
    expect(r.map((c) => [c.tipo, c.refId, c.coincidencia])).toEqual([
      ["gtf", "g2", "exacta"],
      ["flete", "f1", "exacta"],
      ["vehiculo", "v1", "exacta"],
    ]);
    expect(r[0].placa).toBe("ABC123");
  });

  it("máximo 3 por placa", () => {
    const muchos = ["a", "b", "c", "d", "e"].map((id) => cand("gtf", id, "ABC-123"));
    expect(cruzarPlaca("ABC-123", muchos)).toHaveLength(3);
  });

  it("el mismo vehículo por placa y remolque cuenta UNA vez, con la mejor coincidencia", () => {
    const r = cruzarPlaca("ABC-123", [cand("vehiculo", "v1", "ABC-1Z3"), cand("vehiculo", "v1", "ABC-123")]);
    expect(r).toHaveLength(1);
    expect(r[0].coincidencia).toBe("exacta");
  });

  it("sin placa leída o sin coincidencias: lista vacía", () => {
    expect(cruzarPlaca(null, [cand("gtf", "g", "ABC-123")])).toEqual([]);
    expect(cruzarPlaca("XYZ-999", [cand("gtf", "g", "ABC-123")])).toEqual([]);
  });
});

describe("días de Lima", () => {
  it("un instante se lee en Lima: 02:00 UTC del 2 es todavía el 1", () => {
    expect(diaLima("2026-10-02T02:00:00.000Z")).toBe("2026-10-01");
  });

  it("una fecha sola (medianoche o mediodía UTC) NO retrocede un día", () => {
    expect(diaDelRegistro(new Date("2026-09-29T00:00:00.000Z"))).toBe("2026-09-29");
    expect(diaDelRegistro("2026-09-29T12:00:00.000Z")).toBe("2026-09-29");
    expect(diaDelRegistro("2026-09-30T03:15:00.000Z")).toBe("2026-09-29"); // instante: 22:15 del 29 en Lima
  });

  it("±1 día alrededor de la foto", () => {
    expect(dentroDeDias("2026-09-30", "2026-10-01", 1)).toBe(true);
    expect(dentroDeDias("2026-10-02", "2026-10-01", 1)).toBe(true);
    expect(dentroDeDias("2026-09-29", "2026-10-01", 1)).toBe(false);
    expect(dentroDeDias("", "2026-10-01", 1)).toBe(false);
  });
});

describe("chalecos", () => {
  it("normaliza: «03» y «3» son el mismo; sin dígito no es un número de persona", () => {
    expect(normalizarChaleco("03")).toBe("3");
    expect(normalizarChaleco(12)).toBe("12");
    expect(normalizarChaleco(" a3 ")).toBe("A3");
    expect(normalizarChaleco("AB")).toBeNull();
    expect(normalizarChaleco("12345")).toBeNull();
    expect(normalizarChalecos(["3", "03", 7, null, "AB"])).toEqual(["3", "7"]);
  });

  it("el número leído trae a su dueño y la asistencia de ESE día con hora de pared", () => {
    const r = cruzarChalecos(
      ["3", "7", "9"],
      { "3": "c-juan", "7": "c-ana" },
      new Map([["c-juan", "Juan Pérez"], ["c-ana", "Ana Ríos"]]),
      new Map([["c-juan", { estado: "PRESENTE", entradaMin: 478, salidaMin: null }]]),
    );
    expect(r).toEqual([
      { numero: "3", colaboradorId: "c-juan", nombre: "Juan Pérez", asistencia: { estado: "PRESENTE", entrada: "07:58", salida: null } },
      { numero: "7", colaboradorId: "c-ana", nombre: "Ana Ríos", asistencia: null },
      { numero: "9", colaboradorId: null, nombre: null },
    ]);
  });

  it("horaDeMinutos", () => {
    expect(horaDeMinutos(478)).toBe("07:58");
    expect(horaDeMinutos(0)).toBe("00:00");
    expect(horaDeMinutos(null)).toBeNull();
    expect(horaDeMinutos(1440)).toBeNull();
  });

  it("chalecosDe limpia lo que haya en el KV", () => {
    expect(chalecosDe({ "03": "c1", AB: "c2", "7": 5, "9": " c3 " })).toEqual({ "3": "c1", "9": "c3" });
    expect(chalecosDe(null)).toEqual({});
    expect(chalecosDe(["x"])).toEqual({});
  });
});

describe("asignarChaleco", () => {
  const nombre = (id: string) => ({ c1: "Juan", c2: "Ana" })[id] ?? null;

  it("asigna, y un número por persona: el viejo queda libre", () => {
    const r = asignarChaleco({ "3": "c1" }, "7", "c1", nombre);
    expect(r).toMatchObject({ ok: true, chalecos: { "7": "c1" } });
    if (r.ok) expect(r.mensaje).toContain("(3) quedó libre");
  });

  it("si el número era de otra persona, pasa al nuevo dueño y lo dice", () => {
    const r = asignarChaleco({ "3": "c1" }, "03", "c2", nombre);
    expect(r).toMatchObject({ ok: true, chalecos: { "3": "c2" } });
    if (r.ok) expect(r.mensaje).toContain("Antes era de Juan");
  });

  it("libera con null; liberar uno que no estaba es un error claro", () => {
    expect(asignarChaleco({ "3": "c1", "4": "c2" }, "3", null, nombre)).toMatchObject({ ok: true, chalecos: { "4": "c2" } });
    expect(asignarChaleco({}, "3", null, nombre)).toMatchObject({ ok: false });
  });

  it("número inválido no se guarda", () => {
    expect(asignarChaleco({}, "ABCDE", "c1", nombre)).toMatchObject({ ok: false });
    expect(asignarChaleco({}, "", "c1", nombre)).toMatchObject({ ok: false });
  });
});

const captura = (over: Partial<Captura> & Pick<Captura, "id" | "at">): Captura => ({
  camaraId: "cam-pila",
  url: `https://x/${over.id}.webp`,
  evento: "movimiento",
  ...over,
});

describe("confirmarCruce y aplicarAnalisis", () => {
  const base = captura({
    id: "cap-1",
    at: "2026-10-01T15:00:00.000Z",
    cruces: {
      placas: [{ placa: "ABC123", tipo: "gtf", refId: "g1", etiqueta: "Guía 1", coincidencia: "exacta" }],
      chalecos: [],
      calculadoEn: "2026-10-01T15:00:05.000Z",
    },
  });

  it("marca quién y cuándo en la captura; la segunda vez no cambia nada", () => {
    const r = confirmarCruce([base], "cap-1", "g1", "brandon", "2026-10-01T16:00:00.000Z");
    expect(r.ok && r.cambio).toBe(true);
    if (!r.ok) return;
    expect(r.captura.cruces?.placas[0]).toMatchObject({ confirmadoPor: "brandon", confirmadoEn: "2026-10-01T16:00:00.000Z" });
    const otra = confirmarCruce(r.capturas, "cap-1", "g1", "otro", "2026-10-01T17:00:00.000Z");
    expect(otra).toMatchObject({ ok: true, cambio: false });
  });

  it("foto o cruce que no existen → motivo, sin tocar nada", () => {
    expect(confirmarCruce([base], "cap-x", "g1", "u", "t")).toMatchObject({ ok: false });
    expect(confirmarCruce([base], "cap-1", "g-x", "u", "t")).toMatchObject({ ok: false });
  });

  it("aplicarAnalisis pone lectura+cruces+pila juntos; si la foto ya no está, null", () => {
    const pila = { comparadaCon: "cap-0", cambio: "igual" as const, confianza: "alta" as const };
    const r = aplicarAnalisis([base, captura({ id: "cap-2", at: "x" })], "cap-1", { lectura: null, cruces: null, pila });
    expect(r?.[0]).toMatchObject({ id: "cap-1", lectura: null, cruces: null, pila });
    expect(r?.[1].pila).toBeUndefined();
    expect(aplicarAnalisis([base], "cap-borrada", { lectura: null, cruces: null, pila: null })).toBeNull();
  });
});

describe("pila de trozas", () => {
  const nueva = { id: "n", at: "2026-10-01T15:00:00.000Z" };

  it("compara con la más reciente de ≥30 min de la MISMA cámara, nunca con una subida a mano", () => {
    const caps = [
      captura({ id: "hace-10", at: "2026-10-01T14:50:00.000Z" }),
      captura({ id: "manual", at: "2026-10-01T14:20:00.000Z", evento: "manual" }),
      captura({ id: "otra-cam", at: "2026-10-01T14:25:00.000Z", camaraId: "cam-porton" }),
      captura({ id: "hace-40", at: "2026-10-01T14:20:00.000Z" }),
      captura({ id: "hace-2h", at: "2026-10-01T13:00:00.000Z" }),
    ];
    expect(anteriorParaPila(caps, "cam-pila", nueva)?.id).toBe("hace-40");
    expect(anteriorParaPila([caps[0]], "cam-pila", nueva)).toBeNull();
  });

  it("sólo «bajó» con confianza media o alta mira el libro", () => {
    expect(pilaBajoDeVerdad({ cambio: "bajo", confianza: "media" })).toBe(true);
    expect(pilaBajoDeVerdad({ cambio: "bajo", confianza: "baja" })).toBe(false);
    expect(pilaBajoDeVerdad({ cambio: "igual", confianza: "alta" })).toBe(false);
  });

  it("los días de la comparación van de la foto anterior a la nueva (Lima)", () => {
    expect(diasDeLaComparacion("2026-09-30T22:00:00.000Z", "2026-10-01T12:00:00.000Z")).toEqual({
      desde: "2026-09-30",
      hasta: "2026-10-01",
    });
  });

  it("despacho o producción anotados esos días explican que baje; fuera de la ventana no", () => {
    const asientos = [
      { section: "produccion", entryDate: new Date("2026-10-01T00:00:00.000Z") },
      { section: "despacho", entryDate: new Date("2026-10-03T12:00:00.000Z") },
    ];
    expect(movimientosEnDias(asientos, "2026-10-01", "2026-10-01")).toEqual({ despacho: false, produccion: true });
    expect(movimientosEnDias(asientos, "2026-10-02", "2026-10-02")).toEqual({ despacho: false, produccion: false });
    expect(movimientosEnDias(asientos, "2026-10-03", "2026-10-03")).toEqual({ despacho: true, produccion: false });
  });

  it("un aviso de pila cada 3 h por cámara", () => {
    const ahora = new Date("2026-10-01T15:00:00.000Z");
    expect(puedeAvisarPila(null, ahora)).toBe(true);
    expect(puedeAvisarPila("2026-10-01T13:00:00.000Z", ahora)).toBe(false);
    expect(puedeAvisarPila("2026-10-01T12:00:00.000Z", ahora)).toBe(true);
  });

  it("avisa al número de la cámara salvo que diga «nunca» o esté apagada", () => {
    const cam = (avisos: Camara["avisos"], activa = true) => ({ activa, avisos });
    expect(numeroParaAvisoPila(cam({ whatsapp: "987654321", cuando: "noche" }))).toBe("987654321");
    expect(numeroParaAvisoPila(cam({ whatsapp: "987654321", cuando: "nunca" }))).toBeNull();
    expect(numeroParaAvisoPila(cam({ whatsapp: null, cuando: "siempre" }))).toBeNull();
    expect(numeroParaAvisoPila(cam({ whatsapp: "987654321", cuando: "siempre" }, false))).toBeNull();
  });

  it("el texto dice desde cuándo, con fecha si la anterior es de otro día", () => {
    const t = textoAvisoPila({ nombre: "Patio", lugar: "Pila 1" }, "2026-09-30T22:00:00.000Z", new Date("2026-10-01T13:00:00.000Z"), "https://x/admin?tab=camaras");
    expect(t).toContain("Patio (Pila 1)");
    expect(t).toMatch(/más baja que el 30/);
    expect(t).toContain("https://x/admin?tab=camaras");
  });

  it("configurarVigilaPila prende y apaga sin tocar lo demás", () => {
    const camaras = [{ id: "c1", nombre: "Patio", lugar: "", token: "t".repeat(32), activa: true, creadaEn: "x" }] as Camara[];
    const r = configurarVigilaPila(camaras, "c1", true);
    expect(r.ok && r.camaras[0].vigilaPila).toBe(true);
    expect(configurarVigilaPila(camaras, "nope", true).ok).toBe(false);
  });
});

describe("comparadaHacePoco — una ráfaga no paga N comparaciones de pila", () => {
  const base = { camaraId: "cam1", pila: { comparadaCon: "x", cambio: "igual" as const, confianza: "alta" as const } };
  const ahora = { id: "nueva", at: "2026-10-01T15:30:00.000Z" };

  it("si la misma cámara ya comparó hace 10 min, no se vuelve a comparar", () => {
    expect(comparadaHacePoco([{ ...base, id: "a", at: "2026-10-01T15:20:00.000Z" }], "cam1", ahora)).toBe(true);
  });

  it("hace 40 min, sí", () => {
    expect(comparadaHacePoco([{ ...base, id: "a", at: "2026-10-01T14:50:00.000Z" }], "cam1", ahora)).toBe(false);
  });

  it("una foto sin comparación, otra cámara o la misma foto no cuentan", () => {
    const at = "2026-10-01T15:25:00.000Z";
    expect(
      comparadaHacePoco(
        [
          { id: "a", camaraId: "cam1", at, pila: null },
          { ...base, id: "b", camaraId: "cam2", at },
          { ...base, id: "nueva", at },
        ],
        "cam1",
        ahora,
      ),
    ).toBe(false);
  });
});

describe("revisión adversarial 01-10: noche, turno de comparar, dígitos", () => {
  it("noche = 19:00–06:00 de Lima, la misma regla de los avisos «de noche»", () => {
    expect(esNocheEnLima("2026-10-02T00:00:00.000Z")).toBe(true); // 19:00
    expect(esNocheEnLima("2026-10-01T10:59:00.000Z")).toBe(true); // 05:59
    expect(esNocheEnLima("2026-10-01T11:00:00.000Z")).toBe(false); // 06:00
    expect(esNocheEnLima("2026-10-01T23:59:00.000Z")).toBe(false); // 18:59
  });

  it("la bajada es de noche sólo si las DOS fotos son de la misma noche", () => {
    expect(bajadaDeNoche("2026-10-02T02:00:00.000Z", "2026-10-02T03:00:00.000Z")).toBe(true); // 21:00 → 22:00
    expect(bajadaDeNoche("2026-10-02T04:30:00.000Z", "2026-10-02T09:00:00.000Z")).toBe(true); // 23:30 → 04:00
    expect(bajadaDeNoche("2026-10-01T23:30:00.000Z", "2026-10-02T00:30:00.000Z")).toBe(false); // 18:30 → 19:30
    expect(bajadaDeNoche("2026-10-01T10:30:00.000Z", "2026-10-02T00:30:00.000Z")).toBe(false); // 05:30 → 19:30: un día en el medio
    expect(bajadaDeNoche("2026-10-01T15:00:00.000Z", "2026-10-01T16:00:00.000Z")).toBe(false); // de día
  });

  it("turno de comparar: uno cada 30 min por la hora de la FOTO", () => {
    expect(puedeCompararPila(null, "2026-10-02T03:00:00.000Z")).toBe(true);
    expect(puedeCompararPila("2026-10-02T03:00:00.000Z", "2026-10-02T03:00:06.000Z")).toBe(false);
    expect(puedeCompararPila("2026-10-02T03:00:00.000Z", "2026-10-02T03:30:00.000Z")).toBe(true);
  });

  it("comoDigito: la letra gemela del dígito; lo demás no", () => {
    expect(["O", "D", "Q", "I", "L", "Z", "S", "G", "B", "7"].map(comoDigito)).toEqual(["0", "0", "0", "1", "1", "2", "5", "6", "8", "7"]);
    expect(comoDigito("X")).toBeNull();
  });
});
