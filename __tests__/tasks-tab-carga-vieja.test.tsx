/**
 * __tests__/tasks-tab-carga-vieja.test.tsx
 *
 * Medido en el navegador el 2026-09-14 (ADR-415): al recargar Tareas salen dos
 * GET (doble montaje); el viejo volvió 470 ms DESPUÉS del clic en Eliminar y la
 * tarea reapareció en pantalla aunque ya no estaba en la base.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import TasksTab from "@/components/admin/TasksTab";

const CONTAR = { id: "k1", title: "Contar el stock", priority: "media", status: "pendiente", createdAt: "2026-09-14T15:00:00.000Z" };
const LUZ = { id: "k2", title: "Pagar la luz", priority: "alta", status: "pendiente", createdAt: "2026-09-14T14:00:00.000Z" };

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          pendientes.push({
            metodo: init?.method ?? "GET",
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === "/api/tasks");
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

function montar() {
  render(
    <StrictMode>
      <TasksTab />
    </StrictMode>,
  );
}

describe("TasksTab — una carga vieja no pisa lo que ya cambió", () => {
  it("la tarea eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [CONTAR]);
    expect(await screen.findByText("Contar el stock")).toBeTruthy();

    await act(async () => {
      screen.getByRole("button", { name: "Eliminar" }).click();
    });
    await resolver(pedido("DELETE", "/api/tasks/k1"), { ok: true });
    expect(screen.queryByText("Contar el stock")).toBeNull();

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], [CONTAR]);
    expect(screen.queryByText("Contar el stock")).toBeNull();

    // La carga silenciosa que sigue al borrado trae lo guardado.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], []);
    expect(screen.queryByText("Contar el stock")).toBeNull();
  });

  it("una carga que vuelve mientras se guarda un cambio de estado no lo revierte", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], [CONTAR, LUZ]);
    await resolver(gets()[0], [CONTAR, LUZ]);
    expect(await screen.findByText("Pagar la luz")).toBeTruthy();

    // Borrar «Contar el stock»: su carga silenciosa queda en vuelo.
    await act(async () => {
      screen.getAllByRole("button", { name: "Eliminar" })[0].click();
    });
    await resolver(pedido("DELETE", "/api/tasks/k1"), { ok: true });
    await waitFor(() => expect(gets()).toHaveLength(3));

    // Completar «Pagar la luz» mientras esa carga viaja; el PATCH queda pendiente.
    await act(async () => {
      screen.getByRole("button", { name: "Completada" }).click();
    });
    expect(screen.getByText("Completadas (1)")).toBeTruthy();

    // La carga llega con el estado de antes del PATCH: no puede revertir la pantalla.
    await resolver(gets()[2], [LUZ]);
    expect(screen.getByText("Completadas (1)")).toBeTruthy();

    // El PATCH confirma y la carga que le sigue trae lo guardado.
    const completada = { ...LUZ, status: "completada", completedAt: "2026-09-14T16:00:00.000Z" };
    await resolver(pedido("PATCH", "/api/tasks/k2"), completada);
    await waitFor(() => expect(gets()).toHaveLength(4));
    await resolver(gets()[3], [completada]);
    expect(screen.getByText("Completadas (1)")).toBeTruthy();
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [CONTAR]);
    expect(await screen.findByText("Contar el stock")).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Contar el stock")).toBeTruthy();
  });
});
