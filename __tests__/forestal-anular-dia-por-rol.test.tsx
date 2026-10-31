/**
 * Revisión 23-09 (hallazgo 5): la papelera de «Anular el día» salía a cualquier
 * rol, y el endpoint sólo deja a admin/owner (manager por el bypass de
 * gestión). Ahora la tira decide con `puedePedir` y el MISMO array de la ruta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const H = vi.hoisted(() => ({ rol: null as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => H.rol }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({
  useConfirm: () => ({
    prompt: async () => null,
    notice: async () => {},
    confirm: async () => false,
  }),
}));
vi.mock("@/components/admin/forestal/CtpResumenDeJornadasModal", () => ({ default: () => null }));

import CtpSemanaDeProduccion from "@/components/admin/forestal/CtpSemanaDeProduccion";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import type { JornadaDeProduccion } from "@/components/admin/forestal/hooks/use-jornadas-produccion";

const JUEVES: JornadaDeProduccion = { dia: "2026-09-17", corridas: 2, m3: 1, pt: 424, piezas: 10 };

function tira() {
  render(
    <CtpSemanaDeProduccion
      valor="2026-09-17"
      onElegir={() => {}}
      semana="2026-09-17"
      onSemana={() => {}}
      porDia={new Map([[JUEVES.dia, JUEVES]])}
      onReleer={() => {}}
    />,
  );
}
const papelera = () =>
  screen.queryByRole("button", { name: /Anular lo declarado el jueves 17\/09/ });

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("quién ve «Anular el día»", () => {
  it("la tira y la ruta leen el MISMO array de roles", () => {
    expect(RUTAS_PANEL["/api/admin/forestal/ctp/anular-dia"]).toEqual(["admin", "owner"]);
  });

  it.each(["admin", "owner", "manager"])(
    "%s la ve (manager entra por el bypass de gestión)",
    (rol) => {
      H.rol = rol;
      tira();
      expect(papelera()).toBeInTheDocument();
    },
  );

  it.each(["almacenero", "cajero"])("%s no la ve: el servidor le respondería 403", (rol) => {
    H.rol = rol;
    tira();
    expect(papelera()).not.toBeInTheDocument();
  });

  it("mientras el rol no se sabe, no se ofrece", () => {
    H.rol = null;
    tira();
    expect(papelera()).not.toBeInTheDocument();
  });
});
