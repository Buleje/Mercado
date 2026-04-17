/**
 * Tests — SearchAutocomplete (voice search)
 *
 * Verifica:
 *  1. El botón de micrófono no aparece cuando Web Speech API no está disponible
 *  2. El botón de micrófono aparece cuando la API está disponible
 *  3. El click inicia el reconocimiento (mock SpeechRecognition)
 *  4. Al recibir resultado, el valor del input se actualiza
 *  5. aria-pressed cambia mientras escucha
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";

// ── mocks base ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ suggestions: [] }) }),
);

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── helpers ────────────────────────────────────────────────────────────────────

/** Crea un mock de SpeechRecognition que expone un método dispatchResult para simular
 *  el evento onresult desde los tests. */
function makeMockSpeechRecognition() {
  let onresult: ((e: SpeechRecognitionEvent) => void) | null = null;
  let onerror: (() => void) | null = null;
  let onend: (() => void) | null = null;
  const startMock = vi.fn();
  const stopMock = vi.fn();

  const MockRecognition = vi.fn().mockImplementation(() => ({
    set onresult(fn: (e: SpeechRecognitionEvent) => void) { onresult = fn; },
    set onerror(fn: () => void) { onerror = fn; },
    set onend(fn: () => void) { onend = fn; },
    start: startMock,
    stop: stopMock,
    lang: "",
    continuous: false,
    interimResults: false,
  }));

  return {
    MockRecognition,
    startMock,
    stopMock,
    dispatchResult: (transcript: string) => onresult?.({
      results: [
        [{ transcript, confidence: 0.95 }],
      ],
    } as unknown as SpeechRecognitionEvent),
    dispatchError: () => onerror?.(),
    dispatchEnd: () => onend?.(),
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("SearchAutocomplete — voice search", () => {
  it("no muestra el botón de micrófono cuando la API no está disponible", () => {
    // Asegurarse de que SpeechRecognition NO esté en window
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    const micBtn = screen.queryByRole("button", { name: /buscar por voz/i });
    expect(micBtn).toBeNull();
  });

  it("muestra el botón de micrófono cuando la API está disponible", () => {
    const { MockRecognition } = makeMockSpeechRecognition();
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    const micBtn = screen.getByRole("button", { name: /buscar por voz/i });
    expect(micBtn).toBeDefined();
  });

  it("el click inicia el reconocimiento de voz", () => {
    const { MockRecognition, startMock } = makeMockSpeechRecognition();
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /buscar por voz/i }));
    expect(startMock).toHaveBeenCalledOnce();
  });

  it("actualiza el valor del input al recibir el transcript", async () => {
    const { MockRecognition, dispatchResult } = makeMockSpeechRecognition();
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    const onSearch = vi.fn();
    render(<SearchAutocomplete onSearch={onSearch} />);

    fireEvent.click(screen.getByRole("button", { name: /buscar por voz/i }));

    await act(async () => {
      dispatchResult("arroz costeño");
    });

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("arroz costeño");
    expect(onSearch).toHaveBeenCalledWith("arroz costeño");
  });

  it("aria-pressed es true mientras escucha y false después de parar", async () => {
    const { MockRecognition, dispatchEnd } = makeMockSpeechRecognition();
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    const micBtn = screen.getByRole("button", { name: /buscar por voz/i });

    // Antes de escuchar: aria-pressed false
    expect(micBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(micBtn);
    // Mientras escucha: aria-pressed true
    expect(micBtn.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      dispatchEnd();
    });
    // Después de terminar: aria-pressed false
    expect(micBtn.getAttribute("aria-pressed")).toBe("false");
  });
});
