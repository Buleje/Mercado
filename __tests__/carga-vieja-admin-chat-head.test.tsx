/**
 * __tests__/carga-vieja-admin-chat-head.test.tsx
 *
 * La mini-ventana de chat del panel pide los mensajes cada 5 s. Un poll que
 * salió antes de enviar volvía DESPUÉS del GET que trae tu respuesta y el
 * mensaje desaparecía hasta el siguiente poll (invita a mandarlo dos veces); y
 * el poll de un chat recién minimizado pintaba sus mensajes en la ventana del
 * cliente que abriste después. Mismo mecanismo que el bug medido en Tareas el
 * 2026-09-14: una carga vieja que llega tarde pisa lo más nuevo.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve, y el poll de 5 s
 * lo dispara el test a mano (se capturan los `setInterval` de 5 s).
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant-fetch", () => ({ tenantFetch: vi.fn() }));

import { tenantFetch } from "@/lib/tenant-fetch";
import AdminChatHead from "@/components/admin/AdminChatHead";

const hilo = (id: string, customerName: string) => ({
  id,
  customerName,
  customerPhone: "987654321",
  unreadForSeller: 1,
  lastMessageText: "Hola",
  lastMessageAt: "2026-09-14T15:00:00.000Z",
  lastSenderType: "buyer",
});
const JUAN = hilo("t1", "Juan Pérez");
const MARIA = hilo("t2", "María Soto");

const mensaje = (id: string, threadId: string, senderType: string, body: string) => ({
  id,
  threadId,
  senderType,
  body,
  createdAt: "2026-09-14T15:00:00.000Z",
});
const HOLA_JUAN = mensaje("m1", "t1", "buyer", "¿Tienen tornillo de 2x4?");
const RESPUESTA = mensaje("m2", "t1", "seller", "Sí, a S/ 3.50 el pie");
const HOLA_MARIA = mensaje("m3", "t2", "buyer", "¿Hacen delivery a Yarinacocha?");

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];
let polls: Array<() => void> = [];

beforeEach(() => {
  pendientes = [];
  polls = [];
  // jsdom no implementa `scrollTo`; la ventana baja al último mensaje con él.
  Element.prototype.scrollTo = () => {};
  vi.mocked(tenantFetch).mockImplementation(
    (url, init) =>
      new Promise<Response>((resolve) => {
        pendientes.push({
          metodo: init?.method ?? "GET",
          url: String(url),
          resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo } as Response),
        });
      }),
  );
  // Los polls de 5 s los dispara el test; el resto de intervalos corre normal.
  const setIntervalReal = window.setInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (ms === 5_000 && typeof handler === "function") {
      polls.push(handler as () => void);
      return 0;
    }
    return setIntervalReal(handler, ms, ...args);
  }) as typeof window.setInterval);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mensajesDe = (threadId: string) =>
  pendientes.filter((p) => p.metodo === "GET" && p.url === `/api/admin/chat/threads/${threadId}/messages`);
const hilos = () => pendientes.filter((p) => p.metodo === "GET" && p.url.startsWith("/api/admin/chat/threads?"));

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

async function clic(nombre: string | RegExp) {
  await act(async () => {
    screen.getByRole("button", { name: nombre }).click();
  });
}

async function dispararPolls() {
  const ahora = polls;
  polls = [];
  await act(async () => {
    ahora.forEach((poll) => poll());
  });
}

async function montarYAbrir(lista: unknown[], nombre: RegExp) {
  render(
    <StrictMode>
      <AdminChatHead />
    </StrictMode>,
  );
  await waitFor(() => expect(hilos().length).toBeGreaterThan(0));
  for (const p of hilos()) await resolver(p, { data: lista });
  await clic(nombre);
}

describe("AdminChatHead — un poll viejo no pisa los mensajes más nuevos", () => {
  it("tu respuesta no desaparece cuando un poll que salió antes de enviar vuelve después", async () => {
    await montarYAbrir([JUAN], /Chat con Juan Pérez/);
    await waitFor(() => expect(mensajesDe("t1")).toHaveLength(1));
    await resolver(mensajesDe("t1")[0], { data: [HOLA_JUAN] });
    expect(await screen.findByText(HOLA_JUAN.body)).toBeTruthy();

    // El poll de 5 s sale y queda en vuelo.
    await dispararPolls();
    expect(mensajesDe("t1")).toHaveLength(2);

    // Respondes: el POST confirma y el GET que le sigue trae tu respuesta.
    fireEvent.change(screen.getByLabelText("Responder al cliente"), { target: { value: RESPUESTA.body } });
    await clic("Enviar respuesta");
    await resolver(
      pendientes.find((p) => p.metodo === "POST"),
      { data: RESPUESTA },
    );
    await waitFor(() => expect(mensajesDe("t1")).toHaveLength(3));
    await resolver(mensajesDe("t1")[2], { data: [HOLA_JUAN, RESPUESTA] });
    expect(screen.getByText(RESPUESTA.body)).toBeTruthy();

    // El poll viejo llega ahora, con la conversación de antes de enviar.
    await resolver(mensajesDe("t1")[1], { data: [HOLA_JUAN] });
    expect(screen.getByText(RESPUESTA.body)).toBeTruthy();
  });

  it("el poll de un chat minimizado no pinta sus mensajes en el chat que abriste después", async () => {
    await montarYAbrir([JUAN, MARIA], /Chat con Juan Pérez/);
    await waitFor(() => expect(mensajesDe("t1")).toHaveLength(1));
    await resolver(mensajesDe("t1")[0], { data: [HOLA_JUAN] });
    expect(await screen.findByText(HOLA_JUAN.body)).toBeTruthy();

    await dispararPolls();
    expect(mensajesDe("t1")).toHaveLength(2);

    // Minimizas a Juan con su poll en vuelo y abres a María.
    await clic("Minimizar chat");
    await clic(/Chat con María Soto/);
    await waitFor(() => expect(mensajesDe("t2")).toHaveLength(1));
    await resolver(mensajesDe("t2")[0], { data: [HOLA_MARIA] });
    expect(await screen.findByText(HOLA_MARIA.body)).toBeTruthy();

    // El poll de Juan llega tarde.
    await resolver(mensajesDe("t1")[1], { data: [HOLA_JUAN] });
    expect(screen.getByRole("dialog", { name: "Chat con María Soto" })).toBeTruthy();
    expect(screen.queryByText(HOLA_JUAN.body)).toBeNull();
  });
});
