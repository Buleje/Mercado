import { describe, expect, it } from "vitest";
import { edadMiniatura, MINIATURA_VIEJA_MS } from "@/lib/camaras/personas";

const AHORA = Date.parse("2026-10-08T15:00:00Z");
const hace = (ms: number) => edadMiniatura(AHORA - ms, AHORA);

describe("edad de la miniatura de la burbuja", () => {
  it("dice cuánto hace en minutos, horas y días", () => {
    expect(hace(20_000).texto).toBe("recién");
    expect(hace(3 * 60_000 + 5_000).texto).toBe("hace 3 min");
    expect(hace(2 * 3_600_000).texto).toBe("hace 2 h");
    expect(hace(26 * 3_600_000).texto).toBe("hace 1 día");
    expect(hace(3 * 86_400_000).texto).toBe("hace 3 días");
  });

  it("se atenúa desde los 30 min, no antes", () => {
    expect(hace(MINIATURA_VIEJA_MS - 1).vieja).toBe(false);
    expect(hace(MINIATURA_VIEJA_MS).vieja).toBe(true);
    expect(hace(MINIATURA_VIEJA_MS).texto).toBe("hace 30 min");
  });

  it("una hora en el futuro (relojes desfasados) cuenta como recién", () => {
    expect(edadMiniatura(AHORA + 90_000, AHORA)).toEqual({ texto: "recién", vieja: false });
  });
});
