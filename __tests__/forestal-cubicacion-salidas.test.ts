/**
 * Salidas de una cubicación guardada (Brandon 28-10: «si ya se llevó una parte
 * o se llevó completo… y en guardados diga cuánto se despachó y cuánto sobra»).
 *
 *  · los grupos especie × tipo salen de las piezas (el tipo forzado a mano gana);
 *  · el saldo nunca es negativo: lo de más se marca `excedido`, no se esconde;
 *  · «salió todo» tolera 1 PT (unidad del negocio), no el epsilon del float;
 *  · guardar el lote desde el cubicador CONSERVA los viajes (el POST no los trae);
 *  · anotar/quitar un viaje no toca `updatedAt` (el cubicador abierto no da 409).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ kv: new Map<string, unknown>(), audit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => H.kv.get(k) ?? null,
    getFresco: async (k: string) => JSON.parse(JSON.stringify(H.kv.get(k) ?? null)),
    set: async (k: string, v: unknown) => void H.kv.set(k, v),
    actualizar: async (k: string, cambio: (actual: unknown, t: unknown) => Promise<{ valor?: unknown; resultado: unknown }>) => {
      const r = await cambio(JSON.parse(JSON.stringify(H.kv.get(k) ?? null)), {});
      if (r.valor !== undefined) H.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
      return r.resultado;
    },
  },
}));

import { ForestCubicacionesDB, SalidaInvalidaError } from "@/lib/db/forest-cubicaciones.db";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  gruposDeLaCubicacion,
  lineasDeLoQueQueda,
  normalizarSalida,
  ptProporcional,
  saldoDeLaCubicacion,
  type SalidaCubicacion,
} from "@/lib/forestal/cubicacion-salidas";

const T = "tenant-a";
/** 10 tablas de 1×8×10' (66,67 PT), 4 comerciales 2×8×10' (53,33 PT) de Tornillo y 6 cortas de Cedro 2×6×4' (24 PT). */
const piezasCrudas = [
  { id: "a", cantidad: 10, espesor: 1, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Tornillo", precio: 2 },
  { id: "b", cantidad: 4, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "tornillo ", precio: 3 },
  { id: "c", cantidad: 6, espesor: 2, ancho: 6, largo: 4, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Cedro" },
];

const salida = (lineas: SalidaCubicacion["lineas"], extra: Partial<SalidaCubicacion> = {}): SalidaCubicacion => ({
  id: "s1", fecha: "2026-10-28", completo: false, lineas, registradoAt: "2026-10-28T15:00:00.000Z", ...extra,
});

async function guardada(): Promise<{ id: string; piezas: PiezaCubicada[]; updatedAt: string }> {
  const r = await ForestCubicacionesDB.save(T, { nombre: "Lote QA", fecha: "2026-10-28", precioPt: 1.5, piezas: piezasCrudas });
  return { id: r.id, piezas: r.piezas, updatedAt: r.updatedAt };
}

beforeEach(() => {
  H.kv.clear();
  H.audit.mockClear();
});

describe("grupos y saldo (puro)", () => {
  it("agrupa por especie (sin mayúsculas ni espacios) × tipo, con su valor por pieza", async () => {
    const { piezas } = await guardada();
    const g = gruposDeLaCubicacion(piezas, 1.5);
    expect(g.map((x) => [x.especie, x.tipo, x.piezas])).toEqual([
      ["Cedro", "Corta", 6],
      ["Tornillo", "Comercial", 4],
      ["Tornillo", "Tabla", 10],
    ]);
    const cedro = g[0];
    expect(cedro.valor).toBeCloseTo(cedro.pt * 1.5, 2); // sin precio propio → el general
    const tabla = g[2];
    expect(tabla.valor).toBeCloseTo(tabla.pt * 2, 2);
  });

  it("sin viajes: queda todo; un viaje parcial resta y da el % del PT", async () => {
    const { piezas } = await guardada();
    const sin = saldoDeLaCubicacion(piezas, undefined);
    expect(sin.estado).toBe("sin-salidas");
    expect(sin.queda).toEqual(sin.total);

    const tabla = gruposDeLaCubicacion(piezas).find((g) => g.tipo === "Tabla")!;
    const lleva = ptProporcional(tabla, 5);
    expect(lleva).toBeCloseTo(tabla.pt / 2, 1);
    const s = saldoDeLaCubicacion(piezas, [salida([{ especie: "TORNILLO", tipo: "Tabla", piezas: 5, pt: lleva }])]);
    expect(s.estado).toBe("parcial");
    expect(s.salio.piezas).toBe(5);
    expect(s.queda.piezas).toBe(s.total.piezas - 5);
    expect(s.queda.m3).toBeCloseTo(s.queda.pt / 424, 3); // el m³ sale del PT
    expect(s.porcentaje).toBe(Math.round((lleva / s.total.pt) * 100));
  });

  it("«todo lo que queda» cierra la cubicación; 1 PT de redondeo no la deja abierta", async () => {
    const { piezas } = await guardada();
    const primero = salida([{ especie: "Cedro", tipo: "Corta", piezas: 6, pt: 23.4 }]);
    const resto = lineasDeLoQueQueda(saldoDeLaCubicacion(piezas, [primero]));
    expect(resto.map((l) => l.tipo)).toEqual(["Comercial", "Tabla"]); // Cedro ya salió entero (24 − 23,4 < 1 PT)
    const s = saldoDeLaCubicacion(piezas, [primero, salida(resto, { id: "s2", completo: true })]);
    expect(s.estado).toBe("completo");
    expect(s.queda.piezas).toBe(0);
  });

  it("anotar de más se marca, no se esconde; una línea de un grupo que ya no está va a `fuera`", async () => {
    const { piezas } = await guardada();
    const s = saldoDeLaCubicacion(piezas, [
      salida([{ especie: "Cedro", tipo: "Corta", piezas: 8, pt: 30 }, { especie: "Moena", tipo: "Tabla", piezas: 2, pt: 10 }]),
    ]);
    expect(s.estado).toBe("excedido");
    const cedro = s.grupos.find((g) => g.especie === "Cedro")!;
    expect(cedro.excedido).toBe(true);
    expect(cedro.queda.piezas).toBe(0);
    expect(s.fuera).toHaveLength(1);
  });

  it("normalizar: suma las líneas del mismo grupo, descarta las vacías y un viaje sin nada", () => {
    const sello = { id: "x", registradoAt: "2026-10-28T10:00:00.000Z", por: "qa" };
    const n = normalizarSalida({
      fecha: "2026-10-27", placa: " ABC-123 ",
      lineas: [
        { especie: "Tornillo", tipo: "Tabla", piezas: 2, pt: 10 },
        { especie: "tornillo", tipo: "Tabla", piezas: 3.4, pt: 5.555 },
        { especie: "Cedro", tipo: "Corta", piezas: 0, pt: 0 },
        { especie: "Cedro", tipo: "Inventado", piezas: 9, pt: 9 },
      ],
    }, sello)!;
    expect(n.lineas).toEqual([{ especie: "Tornillo", tipo: "Tabla", piezas: 5, pt: 15.56 }]);
    expect(n.placa).toBe("ABC-123");
    expect(n.fecha).toBe("2026-10-27");
    expect(normalizarSalida({ fecha: "2026-10-27", lineas: [{ especie: "a", tipo: "Tabla", piezas: 0, pt: 0 }] }, sello)).toBeNull();
  });
});

describe("ForestCubicacionesDB · viajes", () => {
  it("anota un viaje sin tocar updatedAt; re-guardar el lote lo conserva", async () => {
    const { id, updatedAt } = await guardada();
    const r = await ForestCubicacionesDB.anotarSalida(T, id, {
      fecha: "2026-10-28", placa: "ABC-123", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 6, pt: 24 }],
    }, "qa");
    expect(r?.salidas).toHaveLength(1);
    expect(r?.salidas?.[0].por).toBe("qa");
    expect(r?.updatedAt).toBe(updatedAt);
    expect(H.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "ctp_cubicacion_salida" }));

    /* El cubicador re-guarda el lote (su POST nunca trae `salidas`). */
    const otra = await ForestCubicacionesDB.save(T, { id, nombre: "Lote QA", fecha: "2026-10-28", precioPt: 1.5, piezas: piezasCrudas });
    expect(otra.salidas).toHaveLength(1);
  });

  it("editar conserva id, registradoAt y quién; quitar lo borra; uno quitado da 404", async () => {
    const { id } = await guardada();
    const r1 = await ForestCubicacionesDB.anotarSalida(T, id, { fecha: "2026-10-28", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 2, pt: 8 }] }, "ana");
    const s = r1!.salidas![0];
    const r2 = await ForestCubicacionesDB.anotarSalida(T, id, { id: s.id, fecha: "2026-10-29", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 3, pt: 12 }] }, "beto");
    expect(r2!.salidas).toHaveLength(1);
    expect(r2!.salidas![0]).toMatchObject({ id: s.id, registradoAt: s.registradoAt, por: "ana", fecha: "2026-10-29" });

    const r3 = await ForestCubicacionesDB.quitarSalida(T, id, s.id, "beto");
    expect(r3?.salidas).toBeUndefined();
    await expect(ForestCubicacionesDB.quitarSalida(T, id, s.id)).rejects.toBeInstanceOf(SalidaInvalidaError);
    await expect(ForestCubicacionesDB.anotarSalida(T, id, { id: s.id, fecha: "2026-10-29", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 1, pt: 4 }] }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("«Todo» lo calcula el servidor con lo guardado, aunque la pantalla mande el saldo viejo", async () => {
    const { id, piezas } = await guardada();
    await ForestCubicacionesDB.anotarSalida(T, id, { fecha: "2026-10-28", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 6, pt: 24 }] });
    /* La pantalla no se enteró del viaje de arriba y manda «todo» con el saldo entero. */
    const todo = gruposDeLaCubicacion(piezas).map((g) => ({ especie: g.especie, tipo: g.tipo, piezas: g.piezas, pt: g.pt }));
    const r = await ForestCubicacionesDB.anotarSalida(T, id, { fecha: "2026-10-29", completo: true, lineas: todo });
    const s = saldoDeLaCubicacion(r!.piezas, r!.salidas);
    expect(s.estado).toBe("completo");
    expect(r!.salidas![1].lineas.map((l) => l.tipo)).toEqual(["Comercial", "Tabla"]); // sin el Cedro que ya salió
    await expect(ForestCubicacionesDB.anotarSalida(T, id, { fecha: "2026-10-30", completo: true, lineas: todo })).rejects.toMatchObject({ status: 409 });
  });

  it("un viaje vacío no se anota; otra cubicación u otro negocio → null", async () => {
    const { id } = await guardada();
    await expect(ForestCubicacionesDB.anotarSalida(T, id, { fecha: "2026-10-28", lineas: [] })).rejects.toMatchObject({ status: 400 });
    expect(await ForestCubicacionesDB.anotarSalida(T, "no-existe", { fecha: "2026-10-28", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 1, pt: 4 }] })).toBeNull();
    expect(await ForestCubicacionesDB.anotarSalida("tenant-b", id, { fecha: "2026-10-28", lineas: [{ especie: "Cedro", tipo: "Corta", piezas: 1, pt: 4 }] })).toBeNull();
  });
});
