/**
 * «Compartir esenciales» (23-10): un enlace de carpeta por cada esencial
 * marcada, en UNA llamada (`folders/share-lote`), y UN enlace que los junta
 * (`/c/<t1>?mas=<t2>`). Si falla, lo dice y no arma el enlace (el servidor corta
 * lo que alcanzó a crear).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DbDocumentFolder } from "@/lib/types/documents";
import CompartirEsencialesModal from "@/components/admin/documentos/esenciales/CompartirEsencialesModal";

const carpeta = (id: string, name: string) => ({ id, name }) as DbDocumentFolder;
const CARPETAS = [carpeta("f1", "Licencias"), carpeta("f2", "Contratos"), carpeta("f3", "SUNAT")];
const VENCE = "2026-11-22T15:00:00.000Z";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompartirEsencialesModal", () => {
  it("todas marcadas de entrada; desmarcar baja la cuenta", () => {
    render(<CompartirEsencialesModal carpetas={CARPETAS} onClose={() => {}} />);
    const casillas = CARPETAS.map((c) => screen.getByLabelText(c.name) as HTMLInputElement);
    expect(casillas.every((c) => c.checked)).toBe(true);
    expect(screen.getByText("3 de 3 carpetas")).toBeInTheDocument();
    fireEvent.click(casillas[1]);
    expect(screen.getByText("2 de 3 carpetas")).toBeInTheDocument();
  });

  it("crea los enlaces en una sola llamada con los mismos días y clave, y arma uno solo", async () => {
    const llamadas: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        llamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return json(200, {
          enlaces: [{ folderId: "f3", token: "tok2", expiresAt: VENCE }, { folderId: "f1", token: "tok1", expiresAt: VENCE }],
          expiresAt: VENCE,
          hasPassword: true,
        });
      }),
    );
    render(<CompartirEsencialesModal carpetas={CARPETAS} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Contratos"));
    fireEvent.click(screen.getByRole("radio", { name: "90 días" }));
    fireEvent.click(screen.getByLabelText(/Pedir una clave/));
    fireEvent.change(screen.getByLabelText("Clave del enlace"), { target: { value: "qa-1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear enlace/ }));

    await waitFor(() => expect(screen.getByText(`${window.location.origin}/c/tok1?mas=tok2`)).toBeInTheDocument());
    expect(llamadas).toEqual([
      { url: "/api/admin/documents/folders/share-lote", body: { folderIds: ["f1", "f3"], expiresInDays: 90, password: "qa-1234" } },
    ]);
    expect(screen.getByText("2 carpetas · vence el domingo 22/11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar por WhatsApp/ })).toBeInTheDocument();
  });

  it("si falla: lo dice y no arma el enlace", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(403, { error: "forbidden" })));
    render(<CompartirEsencialesModal carpetas={CARPETAS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Crear enlace/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no tienes permiso"));
    expect(screen.queryByText(/\/c\//)).not.toBeInTheDocument();
  });
});
