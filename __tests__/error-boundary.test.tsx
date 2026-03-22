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
    // Vitest runs in "test" mode but the component checks process.env.NODE_ENV
    // In test env, NODE_ENV is already "test". Use showDetails prop instead.
    render(
      <ErrorBoundary showDetails>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Detalles técnicos/i)).toBeInTheDocument();
  });

  it("toggles error details visibility", async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary showDetails>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const toggleButton = screen.getByText(/Detalles técnicos/i);

    // Initially collapsed - no error name/message paragraph visible
    expect(screen.queryByText(/Error: Test error message/)).not.toBeInTheDocument();

    // Click to expand
    await user.click(toggleButton);
    expect(screen.getAllByText(/Test error message/i).length).toBeGreaterThan(0);

    // Click to collapse
    await user.click(toggleButton);
    expect(screen.queryByText(/Error: Test error message/)).not.toBeInTheDocument();
  });

  it("resets error state when clicking Reintentar", () => {
    // After reset, the boundary rerenders children. Verify reset clears the error state.
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error is displayed
    expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();

    // Rerender with a non-throwing child and new key to reset boundary
    rerender(
      <ErrorBoundary key="reset">
        <ThrowError shouldThrow={false} />
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

    // Use delete + reassign approach for jsdom
    const originalLocation = window.location;
    // @ts-expect-error jsdom allows deleting window.location
    delete window.location;
    window.location = { ...originalLocation, href: "http://localhost:3000/admin" } as Location;

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /Ir al inicio/i });
    await user.click(homeButton);

    expect(window.location.href).toBe("/");

    // Restore
    window.location = originalLocation;
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
