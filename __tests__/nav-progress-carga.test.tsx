/**
 * NavProgress + CargaPagina: el cargador de navegación es SÓLO el número 1→100
 * (Brandon 2026-10-17: «quita mucho texto y esas opciones… una carga del 1 al
 * 100 minimalista»). Fija que no vuelvan los textos/botones, que el número de
 * un loading.tsx siga el mismo reloj (no vuelve atrás) y que nada quede pegado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { CargaPagina } from "@buleje/design-system/carga-pagina";
import { terminarCargaPagina } from "@buleje/design-system/carga-pagina-reloj";

let ruta = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => ruta,
  useSearchParams: () => new URLSearchParams(),
}));

import NavProgress from "@/components/NavProgress";

function Escena({ conCargador }: { conCargador: boolean }) {
  return (
    <>
      <NavProgress />
      {conCargador && <CargaPagina etiqueta="Cargando el panel" />}
    </>
  );
}

function clicEnEnlace(href: string) {
  const a = document.createElement("a");
  a.href = href;
  // jsdom no navega: el enlace sólo dispara el inicio de la carga.
  a.addEventListener("click", (e) => e.preventDefault());
  document.body.appendChild(a);
  act(() => a.click());
  a.remove();
}

const velo = () => document.querySelector("[data-nav-progress]");
const barraArriba = () => document.querySelector(".fixed.top-0 .carga-progreso");

describe("NavProgress: carga minimalista 1→100", () => {
  beforeEach(() => {
    ruta = "/";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => {
    terminarCargaPagina();
    vi.useRealTimers();
  });

  it("barra fina al clic; a los 400 ms el número en el centro, sin textos ni botones, sin bloquear clics", () => {
    render(<Escena conCargador={false} />);
    clicEnEnlace("/otra");
    expect(barraArriba()).not.toBeNull();
    expect(velo()).toBeNull();

    act(() => vi.advanceTimersByTime(400));
    const v = velo();
    expect(v).not.toBeNull();
    expect(v!.className).toContain("pointer-events-none");
    expect(v!.querySelectorAll("button, a")).toHaveLength(0);
    expect((v!.textContent ?? "").replace(/%/g, "").trim()).toBe("");
    const barra = v!.querySelector("[role=progressbar]")!;
    expect(barra.getAttribute("aria-label")).toBe("Cargando la página");
    expect(barra.getAttribute("aria-busy")).toBe("true");
  });

  it("al llegar la página muestra 100 y se va", () => {
    const { rerender } = render(<Escena conCargador={false} />);
    clicEnEnlace("/otra");
    act(() => vi.advanceTimersByTime(600));

    ruta = "/otra";
    act(() => rerender(<Escena conCargador={false} />));
    const barra = velo()!.querySelector("[role=progressbar]")!;
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    expect(barra.className).toContain("carga-completa");

    act(() => vi.advanceTimersByTime(400));
    expect(velo()).toBeNull();
    expect(barraArriba()).toBeNull();
  });

  it("si la ruta trae su loading.tsx, ese número sigue desde el clic y NavProgress espera a que se vaya", () => {
    const { rerender } = render(<Escena conCargador={false} />);
    clicEnEnlace("/admin");
    act(() => vi.advanceTimersByTime(600));
    expect(velo()).not.toBeNull();

    // Aparece el loading.tsx: arranca 600 ms adelantado (no vuelve a 1) y el velo se aparta.
    act(() => rerender(<Escena conCargador />));
    const pagina = document.querySelector<HTMLElement>("[data-carga-pagina=pantalla]")!;
    expect(pagina.style.animationDelay).toBe("-600ms");
    expect(velo()).toBeNull();

    // Next confirma la URL con el loading.tsx todavía a la vista: no se cierra.
    ruta = "/admin";
    act(() => {
      history.pushState(null, "", "/admin");
      vi.advanceTimersByTime(0);
    });
    act(() => rerender(<Escena conCargador />));
    expect(document.querySelector("[data-carga-pagina=pantalla]")).not.toBeNull();

    // Llega la página (se va el loading.tsx): la barra completa y todo desaparece.
    act(() => rerender(<Escena conCargador={false} />));
    expect(barraArriba()?.className).toContain("carga-completa");
    act(() => vi.advanceTimersByTime(400));
    expect(barraArriba()).toBeNull();
    expect(velo()).toBeNull();
  });

  it("clic al mismo lugar no dispara nada", () => {
    render(<Escena conCargador={false} />);
    clicEnEnlace(location.pathname);
    act(() => vi.advanceTimersByTime(500));
    expect(barraArriba()).toBeNull();
    expect(velo()).toBeNull();
  });
});
