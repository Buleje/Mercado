import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary, { ErrorBoundaryWrapper, SimpleErrorFallback } from "@/components/ErrorBoundary";

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>Working component</div>;
}

// Suppress console.error for cleaner test output
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("catches errors and shows fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ir al inicio/i })).toBeInTheDocument();
  });

  it("shows custom error message", () => {
    render(
      <ErrorBoundary errorMessage="Error personalizado">
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error personalizado")).toBeInTheDocument();
  });

  it("calls onError callback when error is caught", () => {
    const onError = vi.fn();
    
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
    const [error, errorInfo] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Test error message");
    expect(errorInfo).toHaveProperty("componentStack");
  });

  it("shows error details in development mode", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Detalles técnicos/i)).toBeInTheDocument();
    expect(screen.getByText(/Modo desarrollo/i)).toBeInTheDocument();

    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
    });
  });

  it("toggles error details visibility", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const toggleButton = screen.getByText(/Detalles técnicos/i);
    
    // Initially collapsed
    expect(screen.queryByText(/Test error message/i)).not.toBeInTheDocument();

    // Click to expand
    await user.click(toggleButton);
    expect(screen.getByText(/Test error message/i)).toBeInTheDocument();

    // Click to collapse
    await user.click(toggleButton);
    expect(screen.queryByText(/Test error message/i)).not.toBeInTheDocument();

    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
    });
  });

  it("resets error state when clicking Reintentar", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    // Error is displayed
    expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();

    // Fix the error
    shouldThrow = false;

    // Click reset button
    const resetButton = screen.getByRole("button", { name: /Reintentar/i });
    await user.click(resetButton);

    // Rerender with fixed component
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    // Should show working component
    expect(screen.getByText("Working component")).toBeInTheDocument();
  });

  it("shows custom fallback when provided as ReactNode", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom fallback UI")).toBeInTheDocument();
  });

  it("shows custom fallback when provided as function", () => {
    const customFallback = (error: Error, reset: () => void) => (
      <div>
        <p>Error: {error.message}</p>
        <button onClick={reset}>Reset</button>
      </div>
    );

    render(
      <ErrorBoundary fallbackRender={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Error: Test error message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument();
  });

  it("shows WhatsApp contact link", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const whatsappLink = screen.getByRole("link", { name: /WhatsApp/i });
    expect(whatsappLink).toBeInTheDocument();
    expect(whatsappLink).toHaveAttribute("href", "https://wa.me/51961646678");
    expect(whatsappLink).toHaveAttribute("target", "_blank");
  });

  it("navigates to home when clicking Ir al inicio", async () => {
    const user = userEvent.setup();
    
    // Mock window.location.href setter
    const originalHref = window.location.href;
    Object.defineProperty(window.location, "href", {
      writable: true,
      value: originalHref,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /Ir al inicio/i });
    await user.click(homeButton);

    expect(window.location.href).toBe("/");
  });
});

describe("ErrorBoundaryWrapper", () => {
  it("renders children without errors", () => {
    render(
      <ErrorBoundaryWrapper>
        <div>Wrapped content</div>
      </ErrorBoundaryWrapper>
    );

    expect(screen.getByText("Wrapped content")).toBeInTheDocument();
  });

  it("catches errors like ErrorBoundary", () => {
    render(
      <ErrorBoundaryWrapper>
        <ThrowError shouldThrow={true} />
      </ErrorBoundaryWrapper>
    );

    expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();
  });

  it("passes props to ErrorBoundary", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundaryWrapper errorMessage="Wrapper error" onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundaryWrapper>
    );

    expect(screen.getByText("Wrapper error")).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });
});

describe("SimpleErrorFallback", () => {
  it("renders error message", () => {
    const error = new Error("Simple error");
    const reset = vi.fn();

    render(<SimpleErrorFallback error={error} reset={reset} />);

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Simple error")).toBeInTheDocument();
  });

  it("calls reset callback when button clicked", async () => {
    const user = userEvent.setup();
    const error = new Error("Simple error");
    const reset = vi.fn();

    render(<SimpleErrorFallback error={error} reset={reset} />);

    const resetButton = screen.getByRole("button", { name: /Reintentar/i });
    await user.click(resetButton);

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
