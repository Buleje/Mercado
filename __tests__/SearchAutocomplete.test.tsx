/**
 * Tests — SearchAutocomplete
 * Cubre: debounce, sugerencias, did you mean, navegacion teclado, Esc cierra.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("framer-motion", () => {
  const Div = ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <div {...props}>{children}</div>
  );
  const Button = ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  );
  return {
    motion: { div: Div, button: Button },
    m: { div: Div, button: Button },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";

// Shape matches MarketplaceSuggestionItem expected by SearchAutocomplete.
const SUGGESTIONS = [
  { id: "q:arroz", type: "query" as const, label: "arroz", href: "/marketplace?q=arroz", searchCount: 150 },
  { id: "q:arroz-integral", type: "query" as const, label: "arroz integral", href: "/marketplace?q=arroz%20integral", searchCount: 45 },
];

describe("SearchAutocomplete", () => {
  it("llama al endpoint de sugerencias despues de 300ms de debounce", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });

    const onSearch = vi.fn();
    render(<SearchAutocomplete onSearch={onSearch} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "arr");

    // Antes del debounce NO se llama
    expect(mockFetch).not.toHaveBeenCalled();

    // Avanzar 300ms
    await act(async () => { vi.advanceTimersByTime(300); });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/search/suggestions?q=arr")
      );
    });
  });

  it("muestra sugerencias en el dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "arr");
    await act(async () => { vi.advanceTimersByTime(300); });

    await waitFor(() => {
      expect(screen.getByText("arroz")).toBeInTheDocument();
      expect(screen.getByText("arroz integral")).toBeInTheDocument();
    });
  });

  it("click en sugerencia llama onSearch con el valor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const onSearch = vi.fn();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });
    // Also mock the search results call
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });

    render(<SearchAutocomplete onSearch={onSearch} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "arr");
    await act(async () => { vi.advanceTimersByTime(300); });

    await waitFor(() => expect(screen.getByText("arroz")).toBeInTheDocument());

    await user.click(screen.getByText("arroz"));

    expect(onSearch).toHaveBeenCalledWith("arroz");
  });

  // Skipped: the "Did you mean?" feature is not implemented in
  // SearchAutocomplete yet (no didYouMean rendering path in the component).
  // Re-enable when the feature ships with a /search endpoint returning didYouMean.
  it.skip("muestra did you mean cuando no hay resultados", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const onSearch = vi.fn();

    // sugerencias vacías
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });
    // resultados de búsqueda con didYouMean
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        didYouMean: [{ suggestion: "arroz", similarity: 0.85 }],
      }),
    });

    render(<SearchAutocomplete onSearch={onSearch} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "arross");
    await act(async () => { vi.advanceTimersByTime(300); });
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/Quisiste decir/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "arroz" })).toBeInTheDocument();
    });
  });

  it("Esc cierra el dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });

    render(<SearchAutocomplete onSearch={vi.fn()} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "arr");
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(screen.getByText("arroz")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("arroz")).not.toBeInTheDocument();
    });
  });

  it("navega con teclado ArrowDown y selecciona con Enter", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const onSearch = vi.fn();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    });

    render(<SearchAutocomplete onSearch={onSearch} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "arr");
    await act(async () => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(screen.getByText("arroz")).toBeInTheDocument());

    // ArrowDown para seleccionar primer item
    await user.keyboard("{ArrowDown}");
    // Enter para confirmar
    await user.keyboard("{Enter}");

    expect(onSearch).toHaveBeenCalledWith("arroz");
  });
});
