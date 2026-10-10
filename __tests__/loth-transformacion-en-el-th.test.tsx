/**
 * Tests — «¿asierras la madera dentro del título habilitante?» (2026-09-28).
 *
 * Las secciones 4-6 del LO-TH (consumo, producto terminado y su despacho) sólo
 * se llenan si el titular transforma en el bosque. La carátula lo pregunta una
 * vez y el riel de secciones obedece. Lo que se prueba:
 *   - el KV guarda una respuesta por carátula, `null` borra, y sólo audita si cambió;
 *   - «No» esconde las tres y deja el camino al Libro CTP;
 *   - «No» con una línea asentada ahí NO la esconde (una línea del libro nunca
 *     queda escondida);
 *   - «Sí» las muestra abiertas sin plegar; sin respuesta, plegadas como antes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const H = vi.hoisted(() => ({ kv: new Map<string, unknown>(), audit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => H.kv.get(k) ?? null,
    // Mismo contrato que el real: `valor === undefined` no escribe nada.
    actualizar: async (k: string, cambio: (actual: unknown, tx: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = await cambio(H.kv.get(k) ?? null, {});
      if (r.valor !== undefined) H.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: H.audit }));

import { ForestLothTransformacionDB } from "@/lib/db/forest-loth-transformacion.db";
import LothSeccionesRiel from "@/components/admin/forestal/LothSeccionesRiel";
import type { LothSection } from "@/lib/forestal/loth-constants";

const T = "tenant-qa";

beforeEach(() => {
  H.kv.clear();
  H.audit.mockClear();
  window.localStorage.clear();
});

describe("ForestLothTransformacionDB", () => {
  it("sin respuesta es null, no «no asierra»", async () => {
    expect(await ForestLothTransformacionDB.get(T, "car-1")).toBeNull();
    expect(await ForestLothTransformacionDB.get(T, null)).toBeNull();
  });

  it("una respuesta por carátula; null la borra", async () => {
    await ForestLothTransformacionDB.set(T, "car-1", false, "brandon");
    await ForestLothTransformacionDB.set(T, "car-2", true, "brandon");
    expect(await ForestLothTransformacionDB.get(T, "car-1")).toBe(false);
    expect(await ForestLothTransformacionDB.get(T, "car-2")).toBe(true);
    await ForestLothTransformacionDB.set(T, "car-1", null, "brandon");
    expect(await ForestLothTransformacionDB.get(T, "car-1")).toBeNull();
    expect(await ForestLothTransformacionDB.get(T, "car-2")).toBe(true);
  });

  it("guardar lo mismo no ensucia la auditoría", async () => {
    await ForestLothTransformacionDB.set(T, "car-1", false, "brandon");
    await ForestLothTransformacionDB.set(T, "car-1", false, "brandon");
    expect(H.audit).toHaveBeenCalledTimes(1);
    expect(H.audit.mock.calls[0][0].detail).toContain("Libro CTP");
  });

  it("un valor que no es booleano en el KV no se lee como respuesta", async () => {
    H.kv.set(`loth-transformacion:${T}`, { "car-1": "no" });
    expect(await ForestLothTransformacionDB.get(T, "car-1")).toBeNull();
  });
});

function riel(opts: { transformaEnElTh: boolean | null; cuentas?: Partial<Record<LothSection, number>>; section?: LothSection; onIrAlCtp?: () => void }) {
  return render(
    <LothSeccionesRiel
      section={opts.section ?? "tala"}
      contar={(s) => opts.cuentas?.[s] ?? 0}
      onSection={() => {}}
      onIrAlCtp={opts.onIrAlCtp}
      transformaEnElTh={opts.transformaEnElTh}
    />,
  );
}

describe("riel de secciones según la carátula", () => {
  it("«No, la llevo a una planta» sin líneas: sin 4-6, sólo el camino al Libro CTP", () => {
    const irAlCtp = vi.fn();
    riel({ transformaEnElTh: false, onIrAlCtp: irAlCtp });
    expect(screen.queryByRole("button", { name: /En el TH/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Transformación en el TH" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /van a la planta/ }));
    expect(irAlCtp).toHaveBeenCalledTimes(1);
  });

  it("«No» sin Libro CTP en el negocio: lo dice sin botón muerto", () => {
    riel({ transformaEnElTh: false });
    expect(screen.getByText(/van a la planta/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /van a la planta/ })).toBeNull();
  });

  it("«No» pero con una línea de consumo asentada: la sección no se esconde", () => {
    riel({ transformaEnElTh: false, cuentas: { consumo_troza: 1 } });
    expect(screen.getByRole("button", { name: /En el TH/ })).toBeTruthy();
    expect(screen.queryByText(/van a la planta/)).toBeNull();
  });

  it("«No» pero llegaste a Consumo (un aviso, la URL): se ve", () => {
    riel({ transformaEnElTh: false, section: "consumo_troza" });
    expect(screen.getByRole("group", { name: "Transformación en el TH" }).hidden).toBe(false);
  });

  it("«Sí, asierro en el bosque»: las tres abiertas y sin botón de plegar", () => {
    riel({ transformaEnElTh: true });
    expect(screen.getByRole("group", { name: "Transformación en el TH" }).hidden).toBe(false);
    expect(screen.queryByRole("button", { name: /En el TH/ })).toBeNull();
  });

  it("sin respuesta: plegadas tras «En el TH», como antes", () => {
    riel({ transformaEnElTh: null });
    const boton = screen.getByRole("button", { name: /En el TH/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(boton.getAttribute("aria-controls")!)!.hidden).toBe(true);
  });
});
