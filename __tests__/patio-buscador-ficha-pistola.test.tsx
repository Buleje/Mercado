/**
 * La pistola 2D en modo teclado tipea la ficha del QR grande línea por línea,
 * cada una con su Enter: `TROZA 118`, `Especie: …`, `Titular: …`. La primera
 * busca la pieza; las demás no son códigos. Antes de arreglarlo (revisión
 * 26-09, reproducido) la línea `Titular: …` lanzaba su propia búsqueda y la
 * pantalla terminaba en «Ninguna troza con ese número», sin la 118.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/forestal/patio-cache", () => ({
  leer: async () => null,
  guardar: async () => {},
  antiguedad: () => "",
  esViejo: () => false,
  buscarLocal: () => [],
}));
vi.mock("@/components/admin/forestal/CtpTrozaFichaModal", () => ({ default: () => null }));

import PatioBuscador from "@/components/admin/forestal/PatioBuscador";

const T118 = {
  id: "trz_aaaaaaaaaaaa118",
  codigoPlanta: "118",
  codificacion: "13/A (0000008)",
  especieComun: "Tornillo",
  volumenM3: 1.2,
  ingreso: { gtfNumber: "001-0000013", libroNro: 45, serforNumeroRegistro: "1-19-0313629" },
};

afterEach(() => vi.unstubAllGlobals());

describe("PatioBuscador · pistola 2D leyendo el QR grande (ficha en texto)", () => {
  it("las líneas sueltas de la ficha no pisan la búsqueda de la troza", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      const q = decodeURIComponent(String(u).split("codificacion=")[1] ?? "");
      return new Response(JSON.stringify({ trozas: q.startsWith("118") ? [T118] : [] }), { status: 200 });
    });
    render(<PatioBuscador />);
    const campo = screen.getByPlaceholderText("Escanea o tipea: 118") as HTMLInputElement;

    fireEvent.change(campo, { target: { value: "TROZA 118" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByText(/Tornillo/).length).toBeGreaterThan(0));

    for (const linea of ["Especie: Tornillo", "Titular: COMUNIDAD NATIVA SANTA ROSA", "Permiso: 19-SEC/REG-PLT-2021-017"]) {
      fireEvent.change(campo, { target: { value: linea } });
      fireEvent.keyDown(campo, { key: "Enter" });
    }

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("codificacion=118");
    expect(screen.getAllByText(/Tornillo/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Ninguna troza con ese número/)).toBeNull();
    /* El campo vuelve a lo buscado, listo para que la próxima lectura lo reemplace. */
    await waitFor(() => expect(campo.value).toBe("TROZA 118"));
  });

  it("la ficha de una pieza sin código avisa que se escanee el QR chico", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ trozas: [] }), { status: 200 }));
    render(<PatioBuscador />);
    const campo = screen.getByPlaceholderText("Escanea o tipea: 118");
    fireEvent.change(campo, { target: { value: "TROZA —" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(await screen.findByText(/no tiene código: escanea su QR chico/)).toBeTruthy();
  });
});
