import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BulkActionsBar from "@/components/admin/shared/BulkActionsBar";
import type { BulkAction } from "@/components/admin/shared/BulkActionsBar";
import { Download, Trash2 } from "lucide-react";

describe("BulkActionsBar", () => {
  const baseActions: BulkAction[] = [
    { id: "export", label: "Exportar", icon: Download, onClick: vi.fn() },
    { id: "delete", label: "Eliminar", icon: Trash2, variant: "danger", onClick: vi.fn() },
  ];

  it("should render nothing when no items selected", () => {
    const { container } = render(
      <BulkActionsBar
        selectedIds={[]}
        totalCount={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        actions={baseActions}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should show selection count", () => {
    render(
      <BulkActionsBar
        selectedIds={["1", "2", "3"]}
        totalCount={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        actions={baseActions}
      />
    );
    expect(screen.getByText("3 de 10 seleccionados")).toBeInTheDocument();
  });

  it("should render action buttons", () => {
    render(
      <BulkActionsBar
        selectedIds={["1"]}
        totalCount={5}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        actions={baseActions}
      />
    );
    expect(screen.getByText("Exportar")).toBeInTheDocument();
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
  });

  it("should call action onClick with selected IDs", () => {
    const onClick = vi.fn();
    const actions: BulkAction[] = [
      { id: "export", label: "Exportar", icon: Download, onClick },
    ];
    render(
      <BulkActionsBar
        selectedIds={["1", "2"]}
        totalCount={5}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        actions={actions}
      />
    );
    fireEvent.click(screen.getByText("Exportar"));
    expect(onClick).toHaveBeenCalledWith(["1", "2"]);
  });

  it("should call onSelectAll when not all selected", () => {
    const onSelectAll = vi.fn();
    render(
      <BulkActionsBar
        selectedIds={["1"]}
        totalCount={5}
        onSelectAll={onSelectAll}
        onClearSelection={vi.fn()}
        actions={baseActions}
      />
    );
    fireEvent.click(screen.getByText("1 de 5 seleccionados"));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("should call onClearSelection when all selected", () => {
    const onClearSelection = vi.fn();
    render(
      <BulkActionsBar
        selectedIds={["1", "2", "3"]}
        totalCount={3}
        onSelectAll={vi.fn()}
        onClearSelection={onClearSelection}
        actions={baseActions}
      />
    );
    fireEvent.click(screen.getByText("3 de 3 seleccionados"));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
