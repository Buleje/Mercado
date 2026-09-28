/**
 * La bandeja de «¿De qué trozas salió?» (ADR-447) montada con Blas CONGELADO
 * el 28-09, tras corregir las llegadas (lo que mide `simularArreglos`):
 *
 *  - dice cuánto falta y una línea por arreglo;
 *  - abrir una decisión del dueño muestra sus dos caminos y NO escribe nada;
 *  - «Revisar y vincular» abre la tanda por especie y permiso, y «Vincular
 *    las 11» manda un POST por grupo con exactamente lo propuesto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CtpSinOrigenBandeja from "@/components/admin/forestal/CtpSinOrigenBandeja";
import {
  diagnosticarSinOrigen,
  type ContextoDelPatio,
  type CorridaParaDiagnostico,
  type TrozaParaDiagnostico,
  type VincularTrozasPedido,
} from "@/lib/forestal/vincular-trozas";
import { proponerTandaDeOrigen, simularArreglos } from "@/lib/forestal/origen-en-tanda";

vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => "admin" }));

interface Fixture {
  corridas: CorridaParaDiagnostico[];
  trozas: TrozaParaDiagnostico[];
  contexto: ContextoDelPatio;
}
const BLAS: Fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/blas-sin-origen-2026-09-28.json"), "utf8"));

/** Blas con las llegadas corregidas a la fecha de su guía. */
function trasLlegada() {
  const hoy = diagnosticarSinOrigen(BLAS.corridas, BLAS.trozas, undefined, { contexto: BLAS.contexto });
  const llegadas = new Map<string, string>();
  for (const c of hoy.corridas) {
    if (c.arreglo.tipo !== "corregir_llegada") continue;
    for (const g of c.arreglo.guias) {
      const prev = llegadas.get(g.gtfNumber);
      if (g.propuesta && (!prev || g.propuesta < prev)) llegadas.set(g.gtfNumber, g.propuesta);
    }
  }
  const trozas = BLAS.trozas.map((t) => {
    const p = t.gtfNumber ? llegadas.get(t.gtfNumber) : undefined;
    if (!p || !t.guiaRecibida || t.llegada?.sigueALaGuia === false) return t;
    return t.fechaIngreso && p < t.fechaIngreso ? { ...t, fechaIngreso: p } : t;
  });
  return {
    diag: diagnosticarSinOrigen(BLAS.corridas, trozas, undefined, { contexto: BLAS.contexto }),
    tanda: {
      propuesta: proponerTandaDeOrigen(BLAS.corridas, trozas, undefined, { contexto: BLAS.contexto }),
      simulacion: simularArreglos(BLAS.corridas, trozas, BLAS.contexto),
    },
  };
}

const { diag, tanda } = trasLlegada();
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

function montar() {
  const posts: VincularTrozasPedido[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { tanda: t } = JSON.parse(String(init.body)) as { tanda: VincularTrozasPedido[] };
        posts.push(t);
        const corridas = t.map((p) => ({ corridaId: p.corridaId, lineNo: null, estado: "vinculada", trozas: p.trozaIds.length, m3: 1, lotesArmados: [], rendimientoPct: 40, sobreElTope: false }));
        return json({ ok: true, tanda: { corridas, resumen: {} } });
      }
      if (String(url).includes("?tanda=1")) return json(tanda);
      return json({ error: "no_mock" }, 404);
    }),
  );
  const onCambio = vi.fn();
  render(<CtpSinOrigenBandeja datos={diag} cargando={false} error={null} onReleer={vi.fn()} onCambio={onCambio} onElegirAMano={vi.fn()} />);
  return { posts, onCambio };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("la bandeja con Blas tras corregir las llegadas", () => {
  it("cuenta, lista los arreglos y una decisión no escribe nada", async () => {
    const { posts } = montar();
    expect(screen.getByRole("heading", { name: "44 corridas sin origen" })).toBeTruthy();
    expect(screen.getByText("11 corridas listas para vincular")).toBeTruthy();
    const cachimbo = screen.getByText("La N.º 61 del 27/09 tiene la madera de 5 corridas de Cachimbo").closest("li")!;
    fireEvent.click(within(cachimbo).getByRole("button", { name: "Ver y decidir" }));
    expect(within(cachimbo).getByText("Salieron de esa madera las 5 de antes")).toBeTruthy();
    expect(within(cachimbo).getByText("La N.º 61 sí salió de esa madera")).toBeTruthy();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(posts).toHaveLength(0);
  });

  it("«Vincular las 11» manda un POST por grupo, con lo propuesto, y avisa a la vista", async () => {
    const { posts, onCambio } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Revisar y vincular" }));
    const dialogo = await screen.findByRole("dialog", {}, { timeout: 10_000 });
    await within(dialogo).findByText("Mashonaste");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Vincular las 11" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, vincular" }));
    await waitFor(() => expect(onCambio).toHaveBeenCalledWith(expect.stringMatching(/^Se vincularon 11 corridas/)), { timeout: 10_000 });
    expect(posts.map((p) => p.length)).toEqual(tanda.propuesta.grupos.map((g) => g.corridas.length));
    const orden = (xs: VincularTrozasPedido[]) => [...xs].sort((a, b) => a.corridaId.localeCompare(b.corridaId));
    expect(orden(posts.flat())).toEqual(orden(tanda.propuesta.pedido));
  });
});
