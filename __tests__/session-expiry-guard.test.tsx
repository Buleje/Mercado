/**
 * SessionExpiryGuard — el reloj de inactividad contra el switch "mantener
 * sesión activa".
 *
 * Pedido de Brandon 2026-08-12: «cuando inicio sesión en el admin y lo habilito,
 * que no se cierre por ausencia sino que esté siempre en admin hasta que lo
 * deshabilite».
 *
 * Antes el guard armaba el temporizador de 30 min SIEMPRE y sólo lo frenaban
 * los pings del keepalive; si el navegador congelaba la pestaña de fondo los
 * pings no llegaban, y al volver te echaba al login con la sesión del servidor
 * todavía viva. Estos tests fijan las dos mitades del contrato:
 *   - switch OFF → sigue expirando por inactividad (no se debilita el default)
 *   - switch ON  → no expira nunca por ausencia
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { SessionExpiryGuard } from "@/components/shared/SessionExpiryGuard";

const { mockRefrescar } = vi.hoisted(() => ({ mockRefrescar: vi.fn() }));
vi.mock("@/lib/auth/session-refresh", () => ({
  refrescarSesion: mockRefrescar,
}));

const TREINTA_Y_UN_MINUTOS = 31 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockRefrescar.mockResolvedValue(true);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionExpiryGuard con el switch APAGADO", () => {
  it("cierra la sesión tras 30 min sin actividad", () => {
    localStorage.setItem("bsm-session-keepalive", "0");
    const onExpire = vi.fn();

    render(<SessionExpiryGuard panel="admin" onExpire={onExpire} />);
    vi.advanceTimersByTime(TREINTA_Y_UN_MINUTOS);

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("avisa antes de cerrar, no echa de golpe", () => {
    localStorage.setItem("bsm-session-keepalive", "0");
    const onExpire = vi.fn();

    const { container } = render(<SessionExpiryGuard panel="admin" onExpire={onExpire} />);
    // A los 28 min ya debería estar el aviso, pero todavía no el cierre.
    // `act` es necesario: el aviso lo prende un setTimeout, y sin él React no
    // llega a pintar el cambio de estado antes de la aserción.
    act(() => { vi.advanceTimersByTime(28 * 60 * 1000); });

    expect(onExpire).not.toHaveBeenCalled();
    expect(container.textContent).toContain("¿Seguís por acá?");
  });
});

describe("SessionExpiryGuard con el switch ENCENDIDO", () => {
  it("NO cierra la sesión aunque pasen 31 min sin tocar nada", () => {
    localStorage.setItem("bsm-session-keepalive", "1");
    const onExpire = vi.fn();

    render(<SessionExpiryGuard panel="admin" onExpire={onExpire} />);
    vi.advanceTimersByTime(TREINTA_Y_UN_MINUTOS);

    expect(onExpire).not.toHaveBeenCalled();
  });

  it("tampoco muestra el aviso de cierre", () => {
    localStorage.setItem("bsm-session-keepalive", "1");

    const { container } = render(<SessionExpiryGuard panel="admin" onExpire={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(TREINTA_Y_UN_MINUTOS); });

    expect(container.textContent).not.toContain("¿Seguís por acá?");
  });

  it("renueva al volver a la pestaña (por si el navegador la congeló)", () => {
    localStorage.setItem("bsm-session-keepalive", "1");

    render(<SessionExpiryGuard panel="admin" onExpire={vi.fn()} />);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(mockRefrescar).toHaveBeenCalledWith(
      expect.objectContaining({ forzar: true }),
    );
  });
});
