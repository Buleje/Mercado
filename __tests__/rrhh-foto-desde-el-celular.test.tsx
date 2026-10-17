/**
 * __tests__/rrhh-foto-desde-el-celular.test.tsx
 *
 * «Subir la foto del fotocheck desde el celular, por QR» (ADR-417, 2026-09-15).
 * Medido ese día: 0 de 11 personas tenían foto porque subirla obligaba a
 * tenerla en la computadora. Lo que se cuida acá:
 *
 * 1. El QR apunta a ESTA ficha con `foto=1` — la misma URL del fotocheck, que
 *    pide iniciar sesión. Nada de páginas públicas ni tokens nuevos.
 * 2. Entrar con `foto=1` abre el selector de la CÁMARA (`capture=environment`),
 *    no el de archivos.
 * 3. El parámetro NO queda pegado en la URL: se borra en el acto, así una
 *    segunda visita a la ficha no vuelve a disparar la cámara.
 * 4. La foto tomada viaja por el camino que ya existía (`/api/upload` carpeta
 *    `rrhh`) y se guarda en la ficha con la acción `editar`.
 *
 * El QR se simula: acá se prueba a dónde apunta, no el canvas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Tipado con la firma real de `qrcode`: sin ella, `mock.calls[0][0]` no existe
// para TS (la tupla de argumentos queda vacía) y el gate de tipos falla.
const toDataURL = vi.fn(async (_texto: string, _opciones?: unknown) => "data:image/png;base64,QR");
vi.mock("qrcode", () => ({ default: { toDataURL: (texto: string, opciones?: unknown) => toDataURL(texto, opciones) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FichaFoto from "@/components/admin/rrhh/personal/FichaFoto";

const URL_FICHA = "/admin?tab=rrhh&vista=personal&persona=c1";

/** Los inputs de archivo que el componente abrió solo (no los que tocó el usuario). */
function espiarClicksDeInput(): HTMLInputElement[] {
  const abiertos: HTMLInputElement[] = [];
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    abiertos.push(this);
  });
  return abiertos;
}

function montar(over: Partial<Parameters<typeof FichaFoto>[0]> = {}) {
  const accion = vi.fn(async () => ({ ok: true }));
  const onCambio = vi.fn();
  render(
    <FichaFoto
      colaboradorId="c1"
      nombre="Rosa Huamán"
      fotoUrl={null}
      puedeCambiar
      accion={accion}
      onCambio={onCambio}
      {...over}
    />,
  );
  return { accion, onCambio };
}

beforeEach(() => {
  document.cookie = "csrf-token=test-token";
  window.history.replaceState(null, "", URL_FICHA);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toDataURL.mockClear();
});

describe("La foto de la ficha desde el celular", () => {
  it("el QR lleva a esta misma ficha con foto=1 (con sesión, sin página pública)", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Subir desde el celular/ }));

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    const destino = toDataURL.mock.calls[0]![0];
    expect(destino).toContain("/admin?tab=rrhh&vista=personal&persona=c1&foto=1");
    expect(destino.startsWith(window.location.origin)).toBe(true);
  });

  it("entrar con foto=1 abre la cámara y borra el parámetro de la URL", () => {
    const abiertos = espiarClicksDeInput();
    window.history.replaceState(null, "", `${URL_FICHA}&foto=1`);

    montar();

    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]!.getAttribute("capture")).toBe("environment");
    expect(abiertos[0]!.getAttribute("accept")).toBe("image/*");
    // El parámetro no queda pegado: volver a la ficha no vuelve a abrir la cámara.
    expect(window.location.search).toBe("?tab=rrhh&vista=personal&persona=c1");
    expect(screen.getByRole("button", { name: /Tomar foto/ })).toBeTruthy();
  });

  it("sin foto=1 no se abre ningún selector solo", () => {
    const abiertos = espiarClicksDeInput();
    montar();
    expect(abiertos).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Tomar foto/ })).toBeNull();
  });

  it("la foto tomada se sube a /api/upload (carpeta rrhh) y se guarda en la ficha", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: "https://cdn.test/rosa.webp" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { accion, onCambio } = montar();

    const camara = screen.getByLabelText(/Tomar la foto de Rosa Huamán con la cámara/) as HTMLInputElement;
    const foto = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(camara, { target: { files: [foto] } });

    await waitFor(() => expect(accion).toHaveBeenCalledWith({ action: "editar", fotoUrl: "https://cdn.test/rosa.webp" }));
    const [ruta, opciones] = fetchMock.mock.calls[0]! as unknown as [string, { body: FormData }];
    expect(ruta).toBe("/api/upload");
    expect(opciones.body.get("folder")).toBe("rrhh");
    expect(onCambio).toHaveBeenCalled();
  });
});
