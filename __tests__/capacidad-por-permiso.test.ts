/**
 * «Llevar al cubicador» separado por PERMISO (Brandon, 2026-10-19: «que sólo
 * separe según el permiso, no irá todo unificado … al llevarlo al bloque
 * cubicador se pondrá así separado por permiso»).
 *
 * Lo que se protege: la madera se PARTE, no se recalcula (Σ de las partes =
 * lo que antes viajaba en un solo bloque), nada se inventa (sin permiso dice
 * «Sin permiso», un lote de dos títulos dice «Permisos mezclados») y la hoja
 * que ya tenía el bloque entero no termina con la misma madera dos veces.
 *
 * Las cifras son las del patio de Blas del 19-10 (SELECT de sólo lectura):
 * 65 trozas de Tornillo de tres permisos = 96.957 m³.
 */

import { describe, expect, it } from "vitest";
import {
  PERMISOS_MEZCLADOS,
  SIN_PERMISO,
  agruparPorPermiso,
  codigoCortoDePermiso,
  etiquetaCortaDePermiso,
  partirPorPermiso,
  permisoDeVarios,
} from "@/lib/forestal/capacidad-por-permiso";
import {
  bloquesDeCandidato,
  bloquesDesdeCapacidad,
  itemsPorPermiso,
  llegadasDeCandidatos,
  totalesDeCandidatos,
} from "@/lib/forestal/capacidad-a-bloques";
import { unirSiembra } from "@/lib/forestal/sembrar-reparto";
import { resumenDeLlevar } from "@/components/admin/forestal/saldos/resumen-llevar-agrupar";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { EntradaCapacidad, LoteDeCapacidad } from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const P17 = "19-SEC/REG-PLT-2021-017";
const P96 = "19-SEC/REG-PLT-2025-096";
const P167 = "19-SEC/REG-PLT-2025-167";

const troza = (id: string, permiso: string | null, volumenM3: number): TrozaConsumible =>
  ({
    id,
    woodEntryId: `w-${permiso ?? "x"}`,
    codificacion: id,
    especieComun: "TORNILLO",
    volumenM3,
    permiso,
    guiaRecepcionada: true,
  }) as TrozaConsumible;

/** n trozas de un permiso que suman `total` exacto (n−1 iguales + el resto). */
function deUnPermiso(permiso: string, n: number, cada: number, total: number): TrozaConsumible[] {
  const out = Array.from({ length: n - 1 }, (_, i) => troza(`${permiso}-${i}`, permiso, cada));
  const resto = Math.round((total - cada * (n - 1)) * 10000) / 10000;
  out.push(troza(`${permiso}-ultima`, permiso, resto));
  return out;
}

/* El patio de Blas, mezclado como llega del endpoint (no ordenado). */
const PATIO_BLAS: TrozaConsumible[] = [
  ...deUnPermiso(P167, 19, 2.4, 45.178),
  ...deUnPermiso(P17, 34, 0.6, 20.687),
  ...deUnPermiso(P96, 12, 2.5, 31.092),
].sort((a, b) => a.id.localeCompare(b.id));

const lote = (o: Partial<LoteDeCapacidad> & { code: string }): LoteDeCapacidad => ({
  id: o.code,
  trozas: [],
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: 0,
  restaM3: 0,
  apartadoM3: 0,
  piezas: 0,
  ...o,
});

const entrada = (o: Partial<EntradaCapacidad>): EntradaCapacidad => ({
  patio: [],
  lotes: [],
  corridas: [],
  stockLibroM3: 0,
  pendienteSinPiezasM3: 0,
  ...o,
});

const sumaM3 = (xs: readonly { m3: number }[]) => Math.round(xs.reduce((s, x) => s + x.m3, 0) * 1000) / 1000;

describe("65 trozas de Tornillo de 3 permisos (patio de Blas, 19-10)", () => {
  const candidatos = bloquesDesdeCapacidad(entrada({ patio: PATIO_BLAS }), {});
  const tornillo = candidatos.find((c) => c.fuente === "patio")!;

  it("la lista de la izquierda sigue siendo UNA línea: 65 piezas, 96.957 m³", () => {
    expect(candidatos).toHaveLength(1);
    expect(tornillo).toMatchObject({ especie: "Tornillo", piezas: 65, m3: 96.957, permiso: null });
  });

  it("se parte en 3 permisos con sus piezas y m³", () => {
    expect(partirPorPermiso(PATIO_BLAS).map((p) => [p.permiso, p.piezas, p.m3])).toEqual([
      [P17, 34, 20.687],
      [P96, 12, 31.092],
      [P167, 19, 45.178],
    ]);
  });

  it("«Lo que se va al cubicador»: 3 filas que suman 65 / 96.957", () => {
    const r = resumenDeLlevar([tornillo], candidatos);
    expect(r.filas.map((f) => [etiquetaCortaDePermiso(f), f.especie, f.tipo, f.piezas, f.m3])).toEqual([
      ["PLT-2021-017", "Tornillo", "rolliza", 34, 20.687],
      ["PLT-2025-096", "Tornillo", "rolliza", 12, 31.092],
      ["PLT-2025-167", "Tornillo", "rolliza", 19, 45.178],
    ]);
    expect(r).toMatchObject({ totalPiezas: 65, totalM3: 96.957, disponibleM3: 96.957, permisos: 3 });
    // Los totales del pie del modal salen de las MISMAS filas.
    expect(totalesDeCandidatos([tornillo]).rolliza).toBe(96.957);
  });

  it("al cubicador van 3 bloques, uno por permiso, con sus trozas, que suman lo de antes", () => {
    const bloques = bloquesDeCandidato(tornillo);
    expect(bloques.map((b) => b.etiqueta)).toEqual([
      "PLT-2021-017 · Tornillo · patio",
      "PLT-2025-096 · Tornillo · patio",
      "PLT-2025-167 · Tornillo · patio",
    ]);
    expect(bloques.map((b) => b.permiso)).toEqual([P17, P96, P167]);
    expect(bloques.map((b) => b.trozaIds?.length)).toEqual([34, 12, 19]);
    expect(bloques.map((b) => b.piezasOrigen)).toEqual([34, 12, 19]);
    expect(sumaM3(bloques)).toBe(96.957);
    expect(new Set(bloques.flatMap((b) => b.trozaIds ?? [])).size).toBe(65);
  });

  it("«Llegan a la distribución como»: Tornillo · cada permiso", () => {
    expect(llegadasDeCandidatos([tornillo]).map((l) => `${l.especie} · ${l.permiso} · ${l.bloques}`)).toEqual([
      "Tornillo · PLT-2021-017 · 1",
      "Tornillo · PLT-2025-096 · 1",
      "Tornillo · PLT-2025-167 · 1",
    ]);
  });

  it("en una hoja vacía se siembran los 3 (la huella lleva el permiso)", () => {
    const r = unirSiembra([], bloquesDeCandidato(tornillo), "capacidad", "t");
    expect(r).toMatchObject({ sembrados: 3, repetidos: 0 });
    expect(r.lista.every((b) => !("partidoDe" in b))).toBe(true);
  });
});

describe("la hoja que ya tenía el bloque ENTERO", () => {
  const tornillo = bloquesDesdeCapacidad(entrada({ patio: PATIO_BLAS }), {})[0]!;
  const entero = (m3: number, permiso?: string): BloqueRolliza => ({
    id: "viejo",
    etiqueta: "Trozas en el patio · TORNILLO",
    especie: "Tornillo",
    m3,
    origen: "manual",
    tipo: "rolliza",
    ...(permiso ? { permiso } : {}),
  });
  const otro: BloqueRolliza = { id: "g", etiqueta: "G-9", especie: "Copal", m3: 2, origen: "manual", tipo: "rolliza" };

  it("misma madera: el entero sale y entran sus 3 partes (nunca los dos)", () => {
    const r = unirSiembra([otro, entero(96.957)], bloquesDeCandidato(tornillo), "capacidad", "t");
    expect(r.lista.map((b) => b.etiqueta)).toEqual([
      "G-9",
      "PLT-2021-017 · Tornillo · patio",
      "PLT-2025-096 · Tornillo · patio",
      "PLT-2025-167 · Tornillo · patio",
    ]);
    expect(sumaM3(r.lista.filter((b) => b.especie === "Tornillo"))).toBe(96.957);
  });

  it("un entero de UN solo permiso (traía el permiso en su campo) también se cambia", () => {
    const solo = bloquesDesdeCapacidad(entrada({ patio: deUnPermiso(P17, 34, 0.6, 20.687) }), {})[0]!;
    const r = unirSiembra([entero(20.687, P17)], bloquesDeCandidato(solo), "capacidad", "t");
    expect(r.lista.map((b) => b.etiqueta)).toEqual(["PLT-2021-017 · Tornillo · patio"]);
  });

  it("si la madera cambió desde entonces, el entero se respeta y las partes no entran", () => {
    const r = unirSiembra([entero(90)], bloquesDeCandidato(tornillo), "capacidad", "t");
    expect(r.lista.map((b) => b.m3)).toEqual([90]);
    expect(r).toMatchObject({ sembrados: 0, repetidos: 3 });
  });
});

describe("la hoja que ya tenía las partes con la etiqueta de antes (permiso al final)", () => {
  const tornillo = bloquesDesdeCapacidad(entrada({ patio: PATIO_BLAS }), {})[0]!;
  const previa = (codigo: string, permiso: string, m3: number): BloqueRolliza => ({
    id: `v-${codigo}`,
    etiqueta: `Trozas en el patio · TORNILLO · ${codigo}`,
    especie: "Tornillo",
    m3,
    permiso,
    origen: "manual",
    tipo: "rolliza",
  });

  it("misma madera: se renombran con el permiso primero, sin duplicarse", () => {
    const vieja = [previa("PLT-2021-017", P17, 20.687), previa("PLT-2025-096", P96, 31.092), previa("PLT-2025-167", P167, 45.178)];
    const r = unirSiembra(vieja, bloquesDeCandidato(tornillo), "capacidad", "t");
    expect(r.lista.map((b) => [b.id, b.etiqueta])).toEqual([
      ["v-PLT-2021-017", "PLT-2021-017 · Tornillo · patio"],
      ["v-PLT-2025-096", "PLT-2025-096 · Tornillo · patio"],
      ["v-PLT-2025-167", "PLT-2025-167 · Tornillo · patio"],
    ]);
    expect(r).toMatchObject({ sembrados: 0, repetidos: 3 });
    expect(sumaM3(r.lista)).toBe(96.957);
  });

  it("si esa parte cambió de m³, la vieja se respeta y la nueva no entra", () => {
    const r = unirSiembra([previa("PLT-2021-017", P17, 19)], bloquesDeCandidato(tornillo), "capacidad", "t");
    expect(r.lista.map((b) => [b.etiqueta, b.m3])).toEqual([
      ["Trozas en el patio · TORNILLO · PLT-2021-017", 19],
      ["PLT-2025-096 · Tornillo · patio", 31.092],
      ["PLT-2025-167 · Tornillo · patio", 45.178],
    ]);
  });

  it("dos permisos con la misma cola llevan el código entero (si no, la huella los junta)", () => {
    const patio = [troza("a", "19-SEC/REG-PLT-2021-017", 1), troza("b", "25-UCAY/REG-PLT-2021-017", 2)];
    const [c] = bloquesDesdeCapacidad(entrada({ patio }), {});
    const etiquetas = bloquesDeCandidato(c!).map((b) => b.etiqueta);
    expect(new Set(etiquetas).size).toBe(2);
    expect(etiquetas.every((e) => /^\d{2}-[A-Z]+\/REG-PLT-2021-017 · Tornillo · patio$/.test(e))).toBe(true);
  });
});

describe("nada se inventa", () => {
  it("una troza sin permiso dice «Sin permiso», en su propio grupo y su propio bloque", () => {
    const patio = [troza("a", P17, 1), troza("b", null, 2), troza("c", "  ", 0.5)];
    const [c] = bloquesDesdeCapacidad(entrada({ patio }), {});
    expect(c!.partes!.map((p) => [etiquetaCortaDePermiso(p), p.piezas, p.m3])).toEqual([
      ["PLT-2021-017", 1, 1],
      [SIN_PERMISO, 2, 2.5],
    ]);
    const bloques = bloquesDeCandidato(c!);
    expect(bloques[1]).toMatchObject({ etiqueta: "Sin permiso · Tornillo · patio", permiso: null, m3: 2.5 });
  });

  it("un lote que juntó dos permisos es «Permisos mezclados»: no se elige uno ni se parte", () => {
    const candidatos = bloquesDesdeCapacidad(
      entrada({
        lotes: [
          lote({ code: "L-7", permisos: [P17, P96], apartadoM3: 3, piezas: 4 }),
          lote({ code: "L-8", permisos: [P17], apartadoM3: 2, piezas: 2 }),
        ],
      }),
      {},
    );
    const filas = agruparPorPermiso(itemsPorPermiso(candidatos)).filter((f) => f.tipo === "rolliza");
    expect(filas.map((f) => [etiquetaCortaDePermiso(f), f.m3])).toEqual([
      ["PLT-2021-017", 2],
      [PERMISOS_MEZCLADOS, 3],
    ]);
    const l7 = candidatos.find((c) => c.clave === "apartado:L-7")!;
    expect(bloquesDeCandidato(l7)).toHaveLength(1);
    expect(bloquesDeCandidato(l7)[0]).toMatchObject({ loteId: "L-7", permiso: null, etiqueta: "Lote L-7 · apartado" });
  });

  it("permisoDeVarios: uno, ninguno o mezclado", () => {
    expect(permisoDeVarios([P17, ` ${P17} `, null])).toEqual({ permiso: P17, mezclado: false });
    expect(permisoDeVarios([null, "", undefined])).toEqual({ permiso: null, mezclado: false });
    expect(permisoDeVarios([P17, P96])).toEqual({ permiso: null, mezclado: true });
  });

  it("código corto: la cola TIPO-AÑO-N°; otra forma se deja entera", () => {
    expect(codigoCortoDePermiso(P17)).toBe("PLT-2021-017");
    expect(codigoCortoDePermiso("10-HUA-PUE/PER-FMP-2026-007")).toBe("FMP-2026-007");
    expect(codigoCortoDePermiso("QA-ADR430-PERMISO-01")).toBe("QA-ADR430-PERMISO…");
    expect(codigoCortoDePermiso("P-1")).toBe("P-1");
    expect(codigoCortoDePermiso(null)).toBe("");
  });
});
