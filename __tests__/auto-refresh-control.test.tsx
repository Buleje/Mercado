import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";

describe("AutoRefreshControl", () => {
  const baseProps = {
    secondsLeft: 45,
    paused: false,
    isActive: true,
    onTogglePause: vi.fn(),
    onRefreshNow: vi.fn(),
  };

  it("should show countdown when active", () => {
    render(<AutoRefreshControl {...baseProps} />);
    expect(screen.getByText("Actualiza en 45s")).toBeInTheDocument();
  });

  it("should show Pausado when paused", () => {
    render(<AutoRefreshControl {...baseProps} paused isActive={false} />);
    expect(screen.getByText("Pausado")).toBeInTheDocument();
    expect(screen.queryByText(/Actualiza en/)).not.toBeInTheDocument();
  });

  it("should call onTogglePause when pause button clicked", () => {
    const onTogglePause = vi.fn();
    render(<AutoRefreshControl {...baseProps} onTogglePause={onTogglePause} />);
    fireEvent.click(screen.getByTitle("Pausar auto-refresh"));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("should call onRefreshNow when refresh button clicked", () => {
    const onRefreshNow = vi.fn();
    render(<AutoRefreshControl {...baseProps} onRefreshNow={onRefreshNow} />);
    fireEvent.click(screen.getByTitle("Actualizar ahora"));
    expect(onRefreshNow).toHaveBeenCalledTimes(1);
  });

  it("should show resume title when paused", () => {
    render(<AutoRefreshControl {...baseProps} paused isActive={false} />);
    expect(screen.getByTitle("Reanudar auto-refresh")).toBeInTheDocument();
  });
});
