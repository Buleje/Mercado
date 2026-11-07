/**
 * Centro de notificaciones (10-10): cada `type` guardado cae en su categoría,
 * los grupos por día son de Lima y la acción del aviso no saca al usuario del
 * panel (WhatsApp va a otra pestaña, lo del panel por `irAEnlace`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const irAEnlace = vi.hoisted(() => vi.fn());
vi.mock("@/components/admin/shared/ir-a-enlace", () => ({ irAEnlace }));

import {
  abrirAccionDeAviso,
  agruparPorDia,
  categoriaDeTipo,
  cuandoFue,
  grupoDelDia,
} from "@/components/notifications/notificaciones-categorias";

describe("categoriaDeTipo", () => {
  // Los 13 tipos que había en la base el 10-10, con su categoría.
  it.each([
    ["FIADO_REMINDER", "plata"],
    ["ADELANTO_VENCIDO", "plata"],
    ["CACAO_BENEFICIO_ATENCION", "campo"],
    ["CTP_PLAZO_SERFOR", "campo"],
    ["marketplace_order", "pedidos"],
    ["CLIENTE_NUEVO", "pedidos"],
    ["DRIVER_APPLICATION", "pedidos"],
    ["CARRITO_ABANDONADO", "pedidos"],
    ["forecast_daily", "inventario"],
    ["camaras", "sistema"],
    ["DOCUMENTO_VENCIMIENTO", "sistema"],
    ["DOCUMENTO_APROBACION", "sistema"],
    ["asistente-aviso", "sistema"],
  ])("%s → %s", (tipo, categoria) => {
    expect(categoriaDeTipo(tipo)).toBe(categoria);
  });

  it("un tipo desconocido no se pierde: cae en Sistema", () => {
    expect(categoriaDeTipo("ALGO_NUEVO")).toBe("sistema");
  });
});

describe("fechas por día de Lima", () => {
  // 10-10 15:00 en Lima = 20:00 UTC.
  const ahora = Date.parse("2026-10-10T20:00:00.000Z");

  it("a las 21:00 de Lima del día anterior (02:00 UTC de hoy) es «Ayer», no «Hoy»", () => {
    expect(grupoDelDia("2026-10-10T02:00:00.000Z", ahora)).toBe("Ayer");
  });

  it("agrupa del más nuevo al más viejo sin grupos vacíos", () => {
    const grupos = agruparPorDia(
      [
        { id: "a", createdAt: "2026-09-01T15:00:00.000Z" },
        { id: "b", createdAt: "2026-10-10T19:00:00.000Z" },
        { id: "c", createdAt: "2026-10-10T18:00:00.000Z" },
      ],
      ahora,
    );
    expect(grupos.map((g) => g.grupo)).toEqual(["Hoy", "Antes"]);
    expect(grupos[0].items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("dice «hace N min», «ayer HH:MM» y «jueves 08/10»", () => {
    expect(cuandoFue("2026-10-10T19:55:00.000Z", ahora)).toBe("hace 5 min");
    expect(cuandoFue("2026-10-09T19:22:00.000Z", ahora)).toBe("ayer 14:22");
    expect(cuandoFue("2026-10-08T15:00:00.000Z", ahora)).toBe("jueves 08/10");
  });
});

describe("abrirAccionDeAviso", () => {
  afterEach(() => vi.restoreAllMocks());

  it("WhatsApp se abre en otra pestaña y el panel se queda", () => {
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    expect(abrirAccionDeAviso("https://wa.me/922334455?text=hola")).toBe(false);
    expect(abrir).toHaveBeenCalledWith(
      "https://wa.me/922334455?text=hola",
      "_blank",
      "noopener,noreferrer",
    );
    expect(irAEnlace).not.toHaveBeenCalled();
  });

  it("un enlace del panel navega sin recargar (irAEnlace) y avisa que navegó", () => {
    expect(abrirAccionDeAviso("/admin?tab=cobranza")).toBe(true);
    expect(irAEnlace).toHaveBeenCalledWith("/admin?tab=cobranza");
  });
});
