/**
 * AdminTabBar — una pestaña que llega DESPUÉS de montar se dibuja (08-10).
 *
 * El orden se armaba una sola vez con las pestañas del primer render. Una que
 * aparece cuando termina de leerse algo async (el rol, las especializaciones,
 * el plan) no estaba en ese orden y no se dibujaba nunca: «Forestal» del Inicio
 * desaparecía si el rol llegaba un instante tarde.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const tab = (id: string) => ({ id, label: id.toUpperCase() });
const nombres = () => screen.getAllByRole("tab").map((t) => t.textContent?.trim());

function barra(ids: string[]) {
  return (
    <AdminTabBar tabs={ids.map(tab)} activeTab="a" onTabChange={() => {}} moduleId="prueba-tardia">
      <div />
    </AdminTabBar>
  );
}

describe("AdminTabBar · pestañas que llegan tarde", () => {
  beforeEach(() => localStorage.clear());

  it("la nueva entra en su lugar (detrás de la que la precede), no se pierde", () => {
    const { rerender } = render(barra(["a", "c", "d"]));
    expect(nombres()).toEqual(["A", "C", "D"]);
    rerender(barra(["a", "b", "c", "d"]));
    expect(nombres()).toEqual(["A", "B", "C", "D"]);
  });

  it("respeta el orden que el usuario guardó y agrega la nueva", () => {
    localStorage.setItem("tab-order-prueba-tardia", JSON.stringify(["d", "a", "c"]));
    const { rerender } = render(barra(["a", "c", "d"]));
    expect(nombres()).toEqual(["D", "A", "C"]);
    rerender(barra(["a", "b", "c", "d"]));
    expect(nombres()).toEqual(["D", "A", "B", "C"]);
  });

  it("si el usuario movió una pestaña que aparece tarde, conserva su lugar", () => {
    localStorage.setItem("tab-order-prueba-tardia", JSON.stringify(["b", "a", "c"]));
    const { rerender } = render(barra(["a", "c"]));
    expect(nombres()).toEqual(["A", "C"]);
    rerender(barra(["a", "b", "c"]));
    expect(nombres()).toEqual(["B", "A", "C"]);
  });

  it("reordenar mientras la tardía no está no le borra el lugar guardado", () => {
    localStorage.setItem("tab-order-prueba-tardia", JSON.stringify(["b", "a", "c"]));
    const { rerender } = render(barra(["a", "c"]));
    fireEvent.dragStart(screen.getByRole("tab", { name: "C" }));
    fireEvent.drop(screen.getByRole("tab", { name: "A" }));
    expect(nombres()).toEqual(["C", "A"]);
    expect(JSON.parse(localStorage.getItem("tab-order-prueba-tardia") ?? "[]")).toEqual(["b", "c", "a"]);
    rerender(barra(["a", "b", "c"]));
    expect(nombres()).toEqual(["B", "C", "A"]);
  });

  it("sin pestañas nuevas, nada cambia y no ofrece «Restablecer orden»", () => {
    render(barra(["a", "b"]));
    expect(nombres()).toEqual(["A", "B"]);
    expect(screen.queryByText("Restablecer orden")).toBeNull();
  });
});
