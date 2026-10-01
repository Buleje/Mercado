/**
 * «Contar el patio» (ADR-436): la lógica pura del conteo — tres listas,
 * agrupado de lo que falta, guardado en el equipo y el acta.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  aTrozaDelConteo,
  agruparFaltan,
  anotarDesconocido,
  anotarTroza,
  claveDelConteo,
  clavesViejas,
  leerConteoGuardado,
  motivoDeSorpresa,
  nuevoConteo,
  quitarLectura,
  reemplazarFoto,
  resumirConteo,
} from "@/lib/forestal/conteo-patio";
import { actaDelConteo } from "@/lib/forestal/conteo-patio-acta";

const T0 = "2026-09-26T15:00:00.000Z";

function troza(p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible {
  return {
    woodEntryId: "we-1",
    codificacion: p.id,
    especieComun: "Tornillo",
    volumenM3: 1.5,
    gtfNumber: "G-1",
    ...p,
  };
}

/* Calcado de main (26-09): libres, una consumida, una que no llegó (pieza) y
   una de una guía que todavía no se recepcionó (documento entero). */
const PATIO = [
  troza({ id: "t-libre-1", codigoPlanta: "90100123", especieComun: "Cachimbo", gtfNumber: "QA-435-0004" }),
  troza({ id: "t-libre-2", codigoPlanta: "90100124", especieComun: "Copal", gtfNumber: "QA-435-0004" }),
  troza({ id: "t-libre-3", codigoPlanta: "90100133", especieComun: "Shihuahuaco", gtfNumber: "QA-ADR434-B" }),
  troza({ id: "t-consumida", codigoPlanta: "QP-T1", consumidaEnId: "corrida-1" }),
  troza({ id: "t-no-llego", codigoPlanta: null, codificacion: "13/A (0000045)", noRecepcionada: true }),
  troza({ id: "t-guia-pendiente", codigoPlanta: "90100199", gtfNumber: "QA-PENDIENTE", guiaRecepcionada: false }),
].map(aTrozaDelConteo);

const base = () => nuevoConteo({ fecha: "2026-09-26", quien: "QA Admin", trozas: PATIO, ahora: T0 });

describe("resumirConteo", () => {
  it("esperadas = sólo las libres; encontradas, faltan y sorpresas salen del cruce", () => {
    let c = base();
    c = anotarTroza(c, PATIO[0]!, T0);
    c = anotarTroza(c, PATIO[3]!, T0); // consumida → sorpresa
    c = anotarDesconocido(c, "ZZ-999", T0);
    const r = resumirConteo(c);
    expect(r.total).toBe(3);
    expect(r.contadas).toBe(1);
    expect(r.faltan.map((t) => t.id)).toEqual(["t-libre-2", "t-libre-3"]);
    expect(r.sorpresas.map((s) => motivoDeSorpresa(s))).toEqual([
      "Código desconocido: no es de ninguna troza",
      "Ya entró a otra corrida",
    ]);
    expect(r.m3).toEqual({ esperado: 4.5, encontrado: 1.5, faltan: 3 });
  });

  it("contar dos veces la misma troza no suma dos; un código desconocido repetido tampoco", () => {
    let c = base();
    c = anotarTroza(c, PATIO[0]!, T0);
    c = anotarTroza(c, PATIO[0]!, T0);
    c = anotarDesconocido(c, "zz-999", T0);
    c = anotarDesconocido(c, "ZZ-999 ", T0);
    expect(c.lecturas).toHaveLength(2);
  });

  it("quitar deshace una lectura por troza o por código", () => {
    let c = anotarDesconocido(anotarTroza(base(), PATIO[0]!, T0), "ZZ-999", T0);
    c = quitarLectura(c, { trozaId: "t-libre-1", codigo: "" });
    c = quitarLectura(c, { trozaId: null, codigo: "ZZ-999" });
    expect(c.lecturas).toEqual([]);
  });

  it("una guía sin recepcionar NO cuenta como esperada, aunque la pieza no tenga su propio noRecepcionada", () => {
    const r = resumirConteo(base());
    expect(r.esperadas.map((t) => t.id)).not.toContain("t-guia-pendiente");
    expect(r.total).toBe(3);
  });

  it("si de todos modos se escanea el código de una guía sin recepcionar, es sorpresa con ese motivo", () => {
    let c = base();
    c = anotarTroza(c, PATIO.find((t) => t.id === "t-guia-pendiente")!, T0);
    const r = resumirConteo(c);
    expect(r.contadas).toBe(0);
    expect(r.sorpresas).toHaveLength(1);
    expect(r.sorpresas[0]?.tipo).toBe("bloqueada");
    expect(motivoDeSorpresa(r.sorpresas[0]!)).toBe("No llegó al patio");
  });

  it("si la troza se consumió mientras se contaba, al actualizar la foto pasa a sorpresa", () => {
    const c = anotarTroza(base(), PATIO[0]!, T0);
    const foto = PATIO.map((t) => (t.id === "t-libre-1" ? { ...t, motivo: "ya_consumida" as const } : t));
    const r = resumirConteo(reemplazarFoto(c, foto, T0));
    expect(r.contadas).toBe(0);
    expect(r.sorpresas[0]?.tipo).toBe("bloqueada");
    expect(r.total).toBe(2);
  });

  it("una troza escaneada que desapareció de la foto nueva queda como «ya no figura»", () => {
    const c = anotarTroza(base(), PATIO[0]!, T0);
    const r = resumirConteo(reemplazarFoto(c, PATIO.slice(1), T0));
    expect(r.sorpresas).toHaveLength(1);
    expect(motivoDeSorpresa(r.sorpresas[0]!)).toBe("Ya no figura en el patio");
    const sinElla = quitarLectura(c, { trozaId: "t-libre-1", codigo: "" });
    expect(sinElla.lecturas).toEqual([]);
  });
});

describe("agruparFaltan", () => {
  const faltan = resumirConteo(base()).faltan;
  it("por guía: la guía con más piezas primero", () => {
    expect(agruparFaltan(faltan, "guia").map((g) => [g.clave, g.trozas.length])).toEqual([
      ["QA-435-0004", 2],
      ["QA-ADR434-B", 1],
    ]);
  });
  it("por especie, y lo sin dato no se pierde", () => {
    const sinEspecie = [...faltan, { ...faltan[0]!, id: "x", especieComun: null }];
    const claves = agruparFaltan(sinEspecie, "especie").map((g) => g.clave);
    expect(claves).toContain("Sin especie");
    expect(claves).toContain("Cachimbo");
  });
});

describe("guardado en el equipo", () => {
  it("ida y vuelta por JSON devuelve el mismo conteo", () => {
    const c = anotarDesconocido(anotarTroza(base(), PATIO[0]!, T0), "ZZ-999", T0);
    expect(leerConteoGuardado(JSON.stringify(c))).toEqual(c);
  });
  it("basura, otra versión o campos rotos = empezar de cero, no contar sobre basura", () => {
    expect(leerConteoGuardado(null)).toBeNull();
    expect(leerConteoGuardado("{no es json")).toBeNull();
    expect(leerConteoGuardado(JSON.stringify({ ...base(), v: 2 }))).toBeNull();
    expect(leerConteoGuardado(JSON.stringify({ ...base(), lecturas: [{ trozaId: 3 }] }))).toBeNull();
    expect(
      leerConteoGuardado(JSON.stringify({ ...base(), trozas: [{ ...PATIO[0], motivo: "inventado" }] })),
    ).toBeNull();
  });
  it("la clave separa negocio y día; limpiar sólo toca los otros días del MISMO negocio", () => {
    expect(claveDelConteo("main", "2026-09-26")).toBe("conteo-patio:main:2026-09-26");
    const claves = [
      "conteo-patio:main:2026-09-25",
      "conteo-patio:main:2026-09-26",
      "conteo-patio:otro:2026-09-20",
      "conteo-patio:yo",
      "buleje-theme",
    ];
    expect(clavesViejas(claves, "main", "2026-09-26")).toEqual(["conteo-patio:main:2026-09-25"]);
  });
});

describe("actaDelConteo", () => {
  it("trae totales, las tres listas y escapa lo que se tipeó", () => {
    let c = anotarTroza(base(), PATIO[0]!, T0);
    c = anotarDesconocido(c, "<script>x</script>", T0);
    const { body, title } = actaDelConteo({ ...c, terminadoEn: T0 }, "Blas");
    expect(title).toContain("26/09/2026");
    expect(body).toContain("Faltan (2)");
    expect(body).toContain("Sorpresas (1)");
    expect(body).toContain("Encontradas (1)");
    expect(body).toContain("QA Admin");
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script>");
    expect(body).toMatch(/sábado 26\/09\/2026/);
  });
});
