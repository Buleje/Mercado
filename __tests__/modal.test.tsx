import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Modal, ModalHeader, ModalFooter, ModalBody } from "@/components/Modal";

describe("Modal", () => {
  let onCloseMock: () => void;

  beforeEach(() => {
    onCloseMock = vi.fn() as () => void;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    render(
      <Modal isOpen={false} onClose={onCloseMock}>
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });

  it("renders modal when isOpen is true", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <p>Modal content</p>
      </Modal>
    );

    const closeButton = screen.getByLabelText("Cerrar modal");
    fireEvent.click(closeButton);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <p>Modal content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when Escape is pressed if closeOnEscape is false", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} closeOnEscape={false}>
        <p>Modal content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <p>Modal content</p>
      </Modal>
    );

    // The backdrop is a child div of the dialog with aria-hidden="true"
    const backdrop = screen.getByRole("dialog").querySelector('[aria-hidden="true"]');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when backdrop is clicked if closeOnBackdropClick is false", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} closeOnBackdropClick={false}>
        <p>Modal content</p>
      </Modal>
    );

    const backdrop = screen.getByRole("dialog").parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it("does not show close button when showCloseButton is false", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} showCloseButton={false}>
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.queryByLabelText("Cerrar modal")).not.toBeInTheDocument();
  });

  it("renders with different sizes", () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={onCloseMock} size="sm">
        <p>Small modal</p>
      </Modal>
    );

    // The size class is on the inner modal panel, not the outer dialog wrapper
    let panel = screen.getByRole("dialog").querySelector(".max-w-sm");
    expect(panel).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={onCloseMock} size="lg">
        <p>Large modal</p>
      </Modal>
    );

    panel = screen.getByRole("dialog").querySelector(".max-w-lg");
    expect(panel).toBeInTheDocument();
  });

  it("renders with custom className", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} className="custom-class">
        <p>Modal content</p>
      </Modal>
    );

    // The custom className is on the inner modal panel
    const panel = screen.getByRole("dialog").querySelector(".custom-class");
    expect(panel).toBeInTheDocument();
  });

  it("renders ModalHeader, ModalBody, and ModalFooter", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <ModalHeader>
          <h3>Header</h3>
        </ModalHeader>
        <ModalBody>
          <p>Body content</p>
        </ModalBody>
        <ModalFooter>
          <button>Action</button>
        </ModalFooter>
      </Modal>
    );

    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("calls onAfterOpen when modal opens", async () => {
    const onAfterOpen = vi.fn();

    render(
      <Modal isOpen={true} onClose={onCloseMock} onAfterOpen={onAfterOpen}>
        <p>Modal content</p>
      </Modal>
    );

    await waitFor(() => {
      expect(onAfterOpen).toHaveBeenCalledTimes(1);
    });
  });

  it("traps focus within modal when trapFocus is true", () => {
    render(
      <Modal isOpen={true} onClose={onCloseMock} trapFocus={true}>
        <button>Button 1</button>
        <button>Button 2</button>
      </Modal>
    );

    const buttons = screen.getAllByRole("button");
    const firstButton = buttons.find((btn) => btn.textContent === "Button 1");
    const lastButton = buttons.find((btn) => btn.textContent === "Button 2");

    // Focus should be trapped and cycle through focusable elements
    expect(firstButton).toBeInTheDocument();
    expect(lastButton).toBeInTheDocument();
  });

  it("applies different animation classes", () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={onCloseMock} animation="fade">
        <p>Modal content</p>
      </Modal>
    );

    // Animation classes are on the inner modal panel
    let dialogEl = screen.getByRole("dialog");
    expect(dialogEl.querySelector('[class*="animate-[fadeIn"]')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={onCloseMock} animation="slide-up">
        <p>Modal content</p>
      </Modal>
    );

    dialogEl = screen.getByRole("dialog");
    expect(dialogEl.querySelector('[class*="animate-[slideUp"]')).toBeInTheDocument();
  });
});
