/**
 * ADR-457 · dónde quedan los bloques que AGREGAN cuando hay una pieza que
 * REEMPLAZA (revisión 2026-10-01).
 *
 * En `/t/[slug]` los bloques que agregan van dentro del cuerpo, en su lugar
 * del `bodyOrder`. Si la pieza que reemplaza falla, se ve ese cuerpo tal cual
 * (`agregaEnElFallback`): antes el enchufe además los repetía al FINAL de la
 * página. Si la pieza reemplaza bien, los que agregan van después del reemplazo.
 */
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ reemplazoFalla: true }));

vi.mock("@/lib/extensiones/tope", () => ({
  conTope: (p: Promise<unknown>) => p,
  reportarFalloPieza: vi.fn(),
}));
vi.mock("@/lib/extensiones/BordeDePieza", () => ({
  BordeDePieza: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/extensiones/resolver", () => ({
  resolverPiezas: async () => [
    {
      piezaId: "reemplazo",
      opciones: {},
      entrada: {
        portada: {
          modo: "reemplaza",
          cargar: async () => {
            if (H.reemplazoFalla) throw new Error("falla de verdad");
            return "ok";
          },
          Vista: () => "REEMPLAZO",
        },
      },
    },
    {
      piezaId: "extra",
      opciones: {},
      entrada: { portada: { modo: "agrega", cargar: async () => "ok", Vista: () => "EXTRA" } },
    },
  ],
}));

import { Enchufe } from "@/lib/extensiones/Enchufe";

const CUERPO_CON_EXTRA_EN_SU_LUGAR = <section>cuerpo normal con el extra en su lugar</section>;

async function render(agregaEnElFallback: boolean) {
  const el = (await Enchufe({
    nombre: "tienda.portada",
    tenantId: "t1",
    slug: "t1",
    fallback: CUERPO_CON_EXTRA_EN_SU_LUGAR,
    agregaEnElFallback,
  })) as ReactElement<{ children: [ReactNode, ReactNode[]] }>;
  const [cuerpo, extras] = el.props.children;
  return { cuerpo, extras: (extras ?? []).filter(Boolean) };
}

beforeEach(() => {
  H.reemplazoFalla = true;
});

describe("enchufe de la portada: orden de los bloques que agregan", () => {
  it("reemplazo que falla + agregaEnElFallback → el cuerpo tal cual, sin repetir el extra al final", async () => {
    const { cuerpo, extras } = await render(true);
    expect(cuerpo).toBe(CUERPO_CON_EXTRA_EN_SU_LUGAR);
    expect(extras).toHaveLength(0);
  });

  it("reemplazo que funciona → el reemplazo y DESPUÉS el extra", async () => {
    H.reemplazoFalla = false;
    const { cuerpo, extras } = await render(true);
    expect(cuerpo).not.toBe(CUERPO_CON_EXTRA_EN_SU_LUGAR);
    expect(extras).toHaveLength(1);
  });

  it("sin agregaEnElFallback (portada por subdominio) el extra va al final como antes", async () => {
    const { cuerpo, extras } = await render(false);
    expect(cuerpo).toBe(CUERPO_CON_EXTRA_EN_SU_LUGAR);
    expect(extras).toHaveLength(1);
  });
});
