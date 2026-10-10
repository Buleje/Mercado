/**
 * Modo TV por el camino del televisor: sin cookie pide un código y lo muestra
 * 3-3; cuando el panel lo vincula, pasa solo al mosaico; OK amplía una cámara
 * y «Atrás» vuelve; «Desconectar este TV» pide confirmar y vuelve al código.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PantallaTv from "@/components/tv/PantallaTv";

const fetchMock = vi.fn();
let vinculada = false;
let estadoLlamadas = 0;

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });

beforeEach(() => {
  vinculada = false;
  estadoLlamadas = 0;
  sessionStorage.clear();
  document.cookie = "csrf-token=tok-123; path=/";
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/tv/camaras") {
      return vinculada
        ? json(200, {
            pantalla: { nombre: "Sala", expiraEn: new Date(Date.now() + 8 * 3600_000).toISOString() },
            camaras: [
              { id: "c1", nombre: "Portón", activa: true, conexion: null, nubeEnlazada: false, token: "" },
              { id: "c2", nombre: "Patio", activa: true, conexion: null, nubeEnlazada: false, token: "" },
            ],
          })
        : json(401, { error: "sin pantalla" });
    }
    if (u === "/api/tv/emparejar" && init?.method === "POST") {
      return json(201, { codigo: "ABC234", secreto: "s3cr3t", expiraEn: new Date(Date.now() + 600_000).toISOString() });
    }
    if (u.startsWith("/api/tv/estado?")) {
      estadoLlamadas += 1;
      vinculada = true;
      return json(200, { estado: "vinculada", pantalla: { nombre: "Sala", expiraEn: "2026-10-08T00:00:00Z" } });
    }
    if (u === "/api/tv/salir") {
      vinculada = false;
      return json(200, { ok: true });
    }
    return json(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Modo TV", () => {
  it("sin vincular muestra el código 3-3, lo guarda y pasa solo al mosaico", async () => {
    render(<PantallaTv />);
    expect(await screen.findByText("ABC 234")).toBeTruthy();
    expect(screen.getByText(/Cámaras → Ver en otra pantalla → escribe este código/)).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("buleje-tv-codigo") ?? "{}").codigo).toBe("ABC234");
    /* El POST del TV lleva el CSRF de la cookie que siembra `/tv` (el backend lo exige). */
    const post = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/tv/emparejar");
    expect(new Headers(post?.[1]?.headers).get("x-csrf-token")).toBe("tok-123");

    /* El sondeo (cada 2 s) lleva el secreto en un header, nunca en la URL; al quedar vinculada, el mosaico. */
    expect(await screen.findByRole("button", { name: "Portón: ver en grande" }, { timeout: 5000 })).toBeTruthy();
    const estado = fetchMock.mock.calls.find((c) => String(c[0]).startsWith("/api/tv/estado?"));
    expect(String(estado?.[0])).toBe("/api/tv/estado?codigo=ABC234");
    expect(new Headers(estado?.[1]?.headers).get("x-tv-secreto")).toBe("s3cr3t");
    expect(estadoLlamadas).toBe(1);
    expect(sessionStorage.getItem("buleje-tv-codigo")).toBeNull();
    expect(document.querySelector("[data-tv-mosaico]")?.getAttribute("data-tv-mosaico")).toBe("2x1");
    expect(screen.getByText("Sala")).toBeTruthy();
  });

  it("OK amplía una cámara, «Atrás» vuelve y «Desconectar» pide confirmar", async () => {
    vinculada = true;
    render(<PantallaTv />);
    fireEvent.click(await screen.findByRole("button", { name: "Patio: ver en grande" }));
    expect(screen.getByRole("button", { name: /Todas/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Portón: ver en grande" })).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Portón: ver en grande" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Desconectar este TV/ }));
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/tv/salir")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /OK para desconectar/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/tv/salir")).toBe(true));
    expect(await screen.findByText("ABC 234")).toBeTruthy();
  });
});
