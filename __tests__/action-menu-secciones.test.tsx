/**
 * ActionMenu — grupos con título (`seccion`), usados por «Capas» del mapa del
 * Libro TH (Base / Encima / Tus datos, 29-09). El título se dibuja UNA vez,
 * arriba de la primera opción del grupo; un menú sin `seccion` no cambia.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Check } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

afterEach(() => cleanup());

const op = (id: string, seccion?: string): MenuAccion => ({ id, label: `Opción ${id}`, icon: Check, onSelect: () => {}, seccion });

describe("ActionMenu — secciones", () => {
  it("un título por grupo, en orden, y las opciones siguen siendo menuitem", () => {
    render(<ActionMenu label="Capas" actions={[op("a", "Base"), op("b", "Base"), op("c", "Encima"), op("d", "Encima")]} />);
    fireEvent.click(screen.getByRole("button", { name: /Capas/i }));
    const titulos = screen.getAllByRole("separator").map((s) => s.getAttribute("aria-label"));
    expect(titulos).toEqual(["Base", "Encima"]);
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });

  it("sin `seccion` no aparece ningún título", () => {
    render(<ActionMenu label="Opciones" actions={[op("a"), op("b")]} />);
    fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
  });
});
