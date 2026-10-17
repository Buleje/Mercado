/**
 * El sonido del vivo de la nube (C1 s1, 08-10): `openSound()` de EZUIKit
 * 9.0.23 NO falla cuando el decodificador no abre el audio — resuelve con 0 —
 * y el flujo dice en `audioInfo` si trae audio (formato 0 = no). El parlante
 * tiene que creerle a eso, no a que la promesa no falló.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EZUIKitPlayer } from "ezuikit-js";
import {
  AUDIO_SIN_SABER,
  audioDelReproductor,
  escucharAudio,
  leerAudio,
  sonar,
} from "@/components/admin/forestal/camaras/reproductor-nube";
import { useSonidoNube } from "@/components/admin/forestal/camaras/use-sonido-nube";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Oyente = (info: unknown) => void;

/** Un reproductor falso con lo que usa el panel: openSound/closeSound, audioInfo y el emisor. */
function falso(opciones: { abre?: unknown; audioInfo?: unknown } = {}) {
  const oyentes: Record<string, Oyente[]> = {};
  const p = {
    openSound: vi.fn(async () => ("abre" in opciones ? opciones.abre : 1)),
    closeSound: vi.fn(async () => 1),
    audioInfo: opciones.audioInfo,
    eventEmitter: {
      on: (ev: string, cb: Oyente) => {
        (oyentes[ev] ??= []).push(cb);
      },
    },
    emitir: (ev: string, info: unknown) => oyentes[ev]?.forEach((cb) => cb(info)),
  };
  return p;
}
const comoPlayer = (p: unknown) => p as EZUIKitPlayer;

describe("leerAudio", () => {
  it("formato 0 = el flujo llegó sin audio", () => {
    expect(leerAudio({ audioFormat: 0 })).toEqual({ trae: false, codec: null });
  });
  it("AAC / G711U = trae audio, con su códec", () => {
    expect(leerAudio({ audioFormat: 8193, audioFormatName: "AAC" })).toEqual({
      trae: true,
      codec: "AAC",
    });
    expect(leerAudio({ audioFormat: 28944, audioFormatName: "G711U" }).codec).toBe("G711U");
  });
  it("sin dato todavía = no se sabe (no se acusa a la cámara)", () => {
    expect(leerAudio(undefined)).toBe(AUDIO_SIN_SABER);
    expect(leerAudio({})).toBe(AUDIO_SIN_SABER);
    expect(leerAudio("AAC")).toBe(AUDIO_SIN_SABER);
  });
});

describe("sonar", () => {
  it("código 1 = sonando; código 0 = el decodificador no lo abrió", async () => {
    expect(await sonar(comoPlayer(falso({ abre: 1 })), true)).toBe(true);
    expect(await sonar(comoPlayer(falso({ abre: 0 })), true)).toBe(false);
  });
  it("sin reproductor o sin el método (reproductor de QA) = no se pudo", async () => {
    expect(await sonar(null, true)).toBe(false);
    expect(await sonar(comoPlayer({}), true)).toBe(false);
  });
  it("si el SDK tira, no se pudo (y no rompe)", async () => {
    const p = { openSound: () => Promise.reject(new Error("destroyed")) };
    expect(await sonar(comoPlayer(p), true)).toBe(false);
  });
});

describe("audioDelReproductor / escucharAudio", () => {
  it("lee `player.audioInfo` y avisa cuando EZUIKit informa de nuevo", () => {
    const p = falso({ audioInfo: { audioFormat: 0 } });
    expect(audioDelReproductor(comoPlayer(p))).toEqual({ trae: false, codec: null });
    const cb = vi.fn();
    escucharAudio(comoPlayer(p), cb);
    p.emitir("audioInfo", { audioFormat: 8193, audioFormatName: "AAC" });
    expect(cb).toHaveBeenCalledWith({ trae: true, codec: "AAC" });
  });
});

describe("useSonidoNube", () => {
  function montar(p: ReturnType<typeof falso> | null) {
    const ref = { current: p ? comoPlayer(p) : null };
    const actividad = vi.fn();
    const h = renderHook(() => useSonidoNube(ref, actividad));
    return { h, ref, actividad };
  }

  it("prende el sonido cuando el decodificador lo abre y cuenta como toque", async () => {
    const { h, actividad } = montar(falso({ abre: 1 }));
    await act(() => h.result.current.alternarSonido());
    expect(h.result.current.sonido).toBe(true);
    expect(h.result.current.falla).toBeNull();
    expect(actividad).toHaveBeenCalled();
  });

  it("si no abre, el parlante sigue en «Sin sonido» y explica por qué (antes decía «Sonido»)", async () => {
    const { h } = montar(falso({ abre: 0 }));
    await act(() => h.result.current.alternarSonido());
    expect(h.result.current.sonido).toBe(false);
    expect(h.result.current.falla).toBe("no-abre");
  });

  it("el flujo sin audio manda sobre todo lo demás: «la cámara no manda sonido»", async () => {
    const p = falso({ abre: 1, audioInfo: { audioFormat: 0 } });
    const { h, ref } = montar(p);
    act(() => h.result.current.alVer(ref.current));
    expect(h.result.current.audio.trae).toBe(false);
    expect(h.result.current.falla).toBe("sin-audio");
    /* Cuando la cámara empieza a mandar audio (micrófono prendido), se corrige solo. */
    act(() => p.emitir("audioInfo", { audioFormat: 28945, audioFormatName: "G711A" }));
    expect(h.result.current.audio).toEqual({ trae: true, codec: "G711A" });
    expect(h.result.current.falla).toBeNull();
  });

  it("un aviso de un reproductor viejo no pisa al nuevo", () => {
    const viejo = falso({ audioInfo: { audioFormat: 8193, audioFormatName: "AAC" } });
    const { h, ref } = montar(viejo);
    act(() => h.result.current.alVer(ref.current));
    ref.current = comoPlayer(falso());
    act(() => viejo.emitir("audioInfo", { audioFormat: 0 }));
    expect(h.result.current.audio.trae).toBe(true);
  });

  it("si el reproductor cambia mientras abre el sonido, el nuevo sigue mudo", async () => {
    let soltar: (codigo: number) => void = () => {};
    const viejo = falso();
    viejo.openSound.mockImplementation(() => new Promise((r) => (soltar = r)));
    const { h, ref } = montar(viejo);
    let pendiente: Promise<void> = Promise.resolve();
    act(() => {
      pendiente = h.result.current.alternarSonido();
    });
    ref.current = comoPlayer(falso());
    await act(async () => {
      soltar(1);
      await pendiente;
    });
    expect(h.result.current.sonido).toBe(false);
    expect(h.result.current.falla).toBeNull();
  });

  it("si no se puede silenciar, el parlante sigue en «Sonido» (es lo que se oye)", async () => {
    const p = falso({ abre: 1 });
    p.closeSound.mockImplementation(async () => 0);
    const { h } = montar(p);
    await act(() => h.result.current.alternarSonido());
    await act(() => h.result.current.alternarSonido());
    expect(p.closeSound).toHaveBeenCalled();
    expect(h.result.current.sonido).toBe(true);
  });

  it("reiniciar (reproductor nuevo) vuelve a mudo y sin saber", async () => {
    const { h } = montar(falso({ abre: 1 }));
    await act(() => h.result.current.alternarSonido());
    act(() => h.result.current.reiniciar());
    expect(h.result.current.sonido).toBe(false);
    expect(h.result.current.audio).toBe(AUDIO_SIN_SABER);
  });
});
