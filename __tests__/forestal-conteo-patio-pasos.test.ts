/**
 * «Contar el patio» guiado (Brandon 2026-10-05): en qué paso está la pantalla,
 * cuántas piezas no tienen etiqueta, los días y la cancha de lo que falta (en
 * pantalla, en el acta impresa y en el acta guardada) y la línea de la pestaña
 * Trozas («Último conteo: hoy, 12 de 13»).
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  aTrozaDelConteo,
  agruparFaltan,
  anotarTroza,
  leerConteoGuardado,
  nuevoConteo,
  resumirConteo,
} from "@/lib/forestal/conteo-patio";
import {
  canchaDe,
  diasEnElPatio,
  etiquetasDelPatio,
  nombreDeCancha,
  pasoDelConteo,
  textoDias,
  urlContarElPatio,
  volverSeguro,
} from "@/lib/forestal/conteo-patio-pasos";
import { actaDelConteo } from "@/lib/forestal/conteo-patio-acta";
import { actaParaGuardar, guardarConteoSchema } from "@/lib/forestal/conteo-patio-guardado";
import { cuandoDelConteo, lineaDelUltimoConteo } from "@/lib/forestal/conteo-patio-historial";

const T0 = "2026-10-05T15:00:00.000Z";

function troza(p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible {
  return { woodEntryId: "we-1", codificacion: p.id, especieComun: "Tornillo", volumenM3: 1, gtfNumber: "G-1", ...p };
}

const CANCHAS = { "z-a": "Cancha A" };
const PATIO = [
  { ...troza({ id: "t1", codigoPlanta: "118", etiquetadaEn: T0, fechaRecepcion: "2026-09-23" }), zonaId: "z-a" },
  { ...troza({ id: "t2", codigoPlanta: "119", fechaRecepcion: "2026-10-05" }), zonaId: null },
  { ...troza({ id: "t3", codigoPlanta: "120", guiaFechaRecepcion: "2026-10-04" }), zonaId: "z-borrada" },
  { ...troza({ id: "t-aserrada", codigoPlanta: "121", consumidaEnId: "c-1" }), zonaId: null },
].map((t) => ({ ...aTrozaDelConteo(t), cancha: canchaDe(t, CANCHAS) }));

const base = () => nuevoConteo({ fecha: "2026-10-05", quien: "QA Admin", trozas: PATIO, ahora: T0 });

describe("la troza del conteo trae etiqueta, cancha y desde cuándo está", () => {
  it("lee `etiquetadaEn`, la cancha por `zonaId` (una zona borrada no ubica) y la fecha de ingreso", () => {
    expect(PATIO.map((t) => [t.id, t.etiquetada, t.cancha, t.desde])).toEqual([
      ["t1", true, "Cancha A", "2026-09-23"],
      ["t2", false, null, "2026-10-05"],
      ["t3", false, null, "2026-10-04"],
      ["t-aserrada", false, null, null],
    ]);
  });

  it("un conteo guardado ANTES de estos campos se sigue leyendo (no se pierde lo contado)", () => {
    const viejo = { ...base(), trozas: base().trozas.map(({ etiquetada: _e, cancha: _c, desde: _d, ...t }) => t) };
    expect(leerConteoGuardado(JSON.stringify(viejo))?.trozas).toHaveLength(4);
    const roto = { ...base(), trozas: [{ ...PATIO[0], cancha: 5 }] };
    expect(leerConteoGuardado(JSON.stringify(roto))).toBeNull();
  });
});

describe("pasoDelConteo / etiquetasDelPatio", () => {
  it("sin escanear y con piezas sin etiqueta arranca en «Etiquetas»; sólo cuenta las esperadas", () => {
    const e = etiquetasDelPatio(base());
    expect(e).toMatchObject({ esperadas: 3, conocido: true });
    expect(e.sin.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(pasoDelConteo(base(), null)).toBe(1);
  });

  it("con todo etiquetado, o sin saberlo (foto vieja), va directo a «Recorrer»", () => {
    const todas = { ...base(), trozas: PATIO.map((t) => ({ ...t, etiquetada: true })) };
    expect(pasoDelConteo(todas, null)).toBe(2);
    const sinDato = { ...base(), trozas: PATIO.map(({ etiquetada: _e, ...t }) => t) };
    expect(etiquetasDelPatio(sinDato)).toMatchObject({ conocido: false, sin: [] });
    expect(pasoDelConteo(sinDato, null)).toBe(2);
  });

  it("ya escaneó → «Recorrer» al recargar; lo elegido manda; terminado → «Acta» siempre", () => {
    const c = anotarTroza(base(), PATIO[0]!, T0);
    expect(pasoDelConteo(c, null)).toBe(2);
    expect(pasoDelConteo(c, 1)).toBe(1);
    expect(pasoDelConteo(base(), 2)).toBe(2);
    expect(pasoDelConteo({ ...c, terminadoEn: T0 }, 1)).toBe(3);
  });
});

describe("días y cancha de lo que falta", () => {
  it("días por día (no por hora) desde la fecha de ingreso hasta el día del conteo", () => {
    expect(diasEnElPatio({ desde: "2026-09-23" }, "2026-10-05")).toBe(12);
    expect(diasEnElPatio({ desde: "2026-10-05" }, "2026-10-05")).toBe(0);
    expect(diasEnElPatio({ desde: null }, "2026-10-05")).toBeNull();
    expect(diasEnElPatio({ desde: "basura" }, "2026-10-05")).toBeNull();
    expect([0, 1, 12, null].map(textoDias)).toEqual(["llegó hoy", "1 día", "12 días", null]);
  });

  it("se agrupa lo que falta por cancha, lo sin ubicar al final como «Sin cancha»", () => {
    const r = resumirConteo(base());
    expect(agruparFaltan(r.faltan, "cancha").map((g) => [g.clave, g.trozas.length])).toEqual([
      ["Sin cancha", 2],
      ["Cancha A", 1],
    ]);
  });

  it("el acta guardada lleva cancha y días de cada faltante; el POST las acepta y una tablet vieja también", () => {
    const c = { ...base(), terminadoEn: T0 };
    const acta = actaParaGuardar(c);
    expect(acta.faltantes.map((f) => [f.codigo, f.cancha, f.dias])).toEqual([
      ["118", "Cancha A", 12],
      ["119", null, 0],
      ["120", null, 1],
    ]);
    expect(guardarConteoSchema.safeParse({ conteo: c }).success).toBe(true);
    const viejo = { ...c, trozas: c.trozas.map(({ etiquetada: _e, cancha: _c, desde: _d, ...t }) => t) };
    expect(guardarConteoSchema.safeParse({ conteo: viejo }).success).toBe(true);
  });

  it("el acta impresa trae cancha y días, y «Sobran» en vez de «Sorpresas»", () => {
    const { body } = actaDelConteo({ ...base(), terminadoEn: T0 }, "Blas");
    expect(body).toContain("<th>Cancha</th>");
    expect(body).toContain("Cancha A");
    expect(body).toContain("12 días");
    expect(body).toContain("Sobran: el libro dice que no están (0)");
    expect(body).not.toContain("Sorpresas");
  });

  it("nombreDeCancha: el nombre, o el código si no tiene", () => {
    expect(nombreDeCancha({ codigo: "C-1", nombre: " Cancha norte " })).toBe("Cancha norte");
    expect(nombreDeCancha({ codigo: "C-1", nombre: null })).toBe("C-1");
  });
});

describe("la línea de la pestaña Trozas", () => {
  it("«Último conteo: hoy, 12 de 13»; ayer; si no, el día; y lo que sobró", () => {
    const r = { fecha: "2026-10-05", contadas: 12, esperadas: 13, sobrantes: 0, sorpresas: 0 };
    expect(lineaDelUltimoConteo(r, "2026-10-05")).toBe("Último conteo: hoy, 12 de 13");
    expect(lineaDelUltimoConteo({ ...r, sobrantes: 1, sorpresas: 1 }, "2026-10-05")).toBe(
      "Último conteo: hoy, 12 de 13 · sobraron 2",
    );
    expect(cuandoDelConteo("2026-10-04", "2026-10-05")).toBe("ayer");
    expect(cuandoDelConteo("2026-09-30", "2026-10-01")).toBe("ayer");
    expect(cuandoDelConteo("2026-09-26", "2026-10-05")).toMatch(/sábado 26\/09/);
  });
});

describe("la puerta desde el libro", () => {
  it("abre el conteo y sólo vuelve a rutas del panel", () => {
    expect(urlContarElPatio("/admin?tab=ctp-libro-operaciones&vista=trozas")).toBe(
      "/admin/patio?contar=1&volver=%2Fadmin%3Ftab%3Dctp-libro-operaciones%26vista%3Dtrozas",
    );
    expect(volverSeguro("/admin?tab=x&vista=trozas")).toBe("/admin?tab=x&vista=trozas");
    expect(volverSeguro("/admin/patio")).toBe("/admin/patio");
    for (const malo of ["//evil.com/admin", "https://evil.com", "/administrador", "/admin\\..", null, ""]) {
      expect(volverSeguro(malo)).toBeNull();
    }
  });
});
