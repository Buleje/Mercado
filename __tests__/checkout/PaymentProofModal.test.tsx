/**
 * __tests__/checkout/PaymentProofModal.test.tsx
 *
 * Tests unitarios de componente para PaymentProofModal.
 *
 * Estrategia: black-box sobre el componente. Se mockean:
 *   - @buleje/design-system/icons → stubs SVG
 *   - @/lib/utils (cn) → concatenador trivial
 *   - @/lib/csrf-client → csrfHeaders retorna {} para evitar hit real
 *   - fetch global → vi.fn() por test
 *
 * Casos cubiertos:
 *   1. Archivo > 5 MB → error "no debe pesar más de 5 MB", fetch NO llamado
 *   2. Archivo PDF → error "Formato no soportado"
 *   3. Sin imagen uploadada → botón "Confirmar pago" deshabilitado
 *   4. Upload exitoso → botón se habilita + click llama onConfirm con los datos
 *   5. Upload fallido (fetch 500) → muestra el error del server
 *   6. method = "transfer" → muestra campos banco/titular/cuenta, SIN QR/phone
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Iconos del design-system — stubs mínimos para evitar crash de imports
vi.mock("@buleje/design-system/icons", () => ({
  X:             () => <span data-testid="icon-x" />,
  Copy:          () => <span data-testid="icon-copy" />,
  Check:         () => <span data-testid="icon-check" />,
  Upload:        () => <span data-testid="icon-upload" />,
  Image:         () => <span data-testid="icon-image" />,
  Camera:        () => <span data-testid="icon-camera" />,
  Smartphone:    () => <span data-testid="icon-smartphone" />,
  Landmark:      () => <span data-testid="icon-landmark" />,
  Loader2:       () => <span data-testid="icon-loader" />,
  CheckCircle2:  () => <span data-testid="icon-check-circle" />,
  AlertCircle:   () => <span data-testid="icon-alert" />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/csrf-client", () => ({
  csrfHeaders: vi.fn(() => ({})),
}));

// Importar después de los mocks
import { PaymentProofModal, type PaymentProofModalConfig } from "@/components/checkout/PaymentProofModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PaymentProofModalConfig = {
  yape: {
    image: "https://example.com/qr-yape.png",
    name: "Bodega San Martín",
    phone: "999000111",
  },
  plin: {
    image: "https://example.com/qr-plin.png",
    name: "Bodega San Martín",
    phone: "999000222",
  },
  transfer: {
    bankName: "BCP",
    accountNumber: "123-456789-0-12",
    accountHolder: "Carlos Mamani",
  },
};

type OnConfirm = (result: { proofUrl: string; proofToken: string; reference?: string }) => void;
type OnClose = () => void;

interface RenderOpts {
  method?: "yape" | "plin" | "transfer";
  amount?: number;
  config?: PaymentProofModalConfig;
  onConfirm?: OnConfirm;
  onClose?: OnClose;
}

function renderModal(opts: RenderOpts = {}) {
  const {
    method = "yape",
    amount = 10.5,
    config = DEFAULT_CONFIG,
    onConfirm = vi.fn<OnConfirm>(),
    onClose = vi.fn<OnClose>(),
  } = opts;

  const utils = render(
    <PaymentProofModal
      open={true}
      storeSlug="bodega-san-martin"
      storeName="Bodega San Martín"
      method={method}
      amount={amount}
      config={config}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );

  return { ...utils, onConfirm, onClose };
}

/** Crea un File con la configuración dada. */
function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes).fill(0x41); // 'A'
  return new File([content], name, { type });
}

/** Encuentra el input[type=file] oculto. */
function getFileInput(): HTMLInputElement {
  // El input está hidden — lo buscamos por tipo
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  expect(inputs.length).toBeGreaterThan(0);
  return inputs[0];
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Restaurar fetch a un mock limpio
  global.fetch = vi.fn();
  // URL.createObjectURL no existe en jsdom — stub mínimo
  global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-preview");
  global.URL.revokeObjectURL = vi.fn();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PaymentProofModal", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Caso 1 — Archivo > 5 MB
  // ──────────────────────────────────────────────────────────────────────────
  it("(1) muestra error 'no debe pesar más de 5 MB' cuando el archivo supera el límite y NO llama a fetch", async () => {
    // Arrange
    renderModal();
    const oversize = makeFile("captura.jpg", "image/jpeg", 5 * 1024 * 1024 + 1);
    const input = getFileInput();

    // Act — simular selección de archivo
    await act(async () => {
      fireEvent.change(input, { target: { files: [oversize] } });
    });

    // Assert — error de peso visible
    expect(screen.getByText(/no debe pesar más de 5 MB/i)).toBeInTheDocument();

    // Assert — fetch no llamado
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 2 — Archivo con tipo no permitido (PDF)
  // ──────────────────────────────────────────────────────────────────────────
  it("(2) muestra 'Formato no soportado' cuando se selecciona un PDF", async () => {
    // Arrange
    renderModal();
    const pdf = makeFile("recibo.pdf", "application/pdf", 1024);
    const input = getFileInput();

    // Act
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf] } });
    });

    // Assert
    expect(screen.getByText(/formato no soportado/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 3 — Sin imagen uploadada → botón Confirmar deshabilitado
  // ──────────────────────────────────────────────────────────────────────────
  it("(3) el botón de confirmar está deshabilitado cuando no se ha hecho upload", () => {
    // Arrange — modal recién abierto, sin archivo ni upload
    renderModal();

    // Assert — el botón no está habilitado (canConfirm === false)
    // Cuando canConfirm=false el botón muestra "Sube la captura primero"
    // y tiene el atributo disabled.
    const confirmBtn = screen.getByRole("button", { name: /sube la captura primero/i });
    expect(confirmBtn).toBeDisabled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 4 — Upload exitoso → botón se habilita + onConfirm llamado con datos
  // ──────────────────────────────────────────────────────────────────────────
  it("(4) tras upload exitoso habilita 'Confirmar pago' y llama a onConfirm con proofUrl/proofToken", async () => {
    // Arrange
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderModal({ onConfirm });

    // Mock fetch → 200 con proofUrl y proofToken
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          proofUrl: "https://storage.example.com/proof.webp",
          proofToken: "cust.store.yape.1050.abc123def456.sig1234",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Seleccionar archivo válido
    const validJpeg = makeFile("captura.jpg", "image/jpeg", 500);
    const input = getFileInput();
    await act(async () => {
      fireEvent.change(input, { target: { files: [validJpeg] } });
    });

    // Clicar "Subir captura" (aparece después de seleccionar archivo)
    const uploadBtn = await screen.findByRole("button", { name: /subir captura/i });
    await user.click(uploadBtn);

    // Esperar a que el upload termine y el botón "Confirmar pago" aparezca
    const confirmBtn = await screen.findByRole("button", { name: /confirmar pago/i });
    expect(confirmBtn).not.toBeDisabled();

    // Click en confirmar
    await user.click(confirmBtn);

    // Assert — onConfirm llamado con los datos del servidor
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        proofUrl: "https://storage.example.com/proof.webp",
        proofToken: "cust.store.yape.1050.abc123def456.sig1234",
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 5 — Upload fallido (fetch retorna 500) → muestra error del server
  // ──────────────────────────────────────────────────────────────────────────
  it("(5) muestra el mensaje de error del servidor cuando el upload falla con 500", async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Error subiendo la imagen" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Seleccionar archivo
    const validJpeg = makeFile("captura.jpg", "image/jpeg", 500);
    const input = getFileInput();
    await act(async () => {
      fireEvent.change(input, { target: { files: [validJpeg] } });
    });

    // Click en subir
    const uploadBtn = await screen.findByRole("button", { name: /subir captura/i });
    await user.click(uploadBtn);

    // Assert — mensaje de error visible
    await waitFor(() => {
      expect(screen.getByText(/error subiendo la imagen/i)).toBeInTheDocument();
    });

    // El botón confirmar sigue deshabilitado
    const confirmBtn = screen.getByRole("button", { name: /sube la captura primero/i });
    expect(confirmBtn).toBeDisabled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 6 — method = "transfer" → datos bancarios visibles, SIN QR ni phone
  // ──────────────────────────────────────────────────────────────────────────
  it("(6) method='transfer' muestra banco/titular/cuenta y NO muestra QR ni número de teléfono", () => {
    // Arrange
    renderModal({ method: "transfer" });

    // Assert — datos bancarios presentes
    expect(screen.getByText("BCP")).toBeInTheDocument();
    expect(screen.getByText("Carlos Mamani")).toBeInTheDocument();
    expect(screen.getByText("123-456789-0-12")).toBeInTheDocument();

    // Assert — elementos exclusivos de Yape/Plin ausentes
    // El número de teléfono Yape (999000111) NO debe aparecer
    expect(screen.queryByText("999000111")).not.toBeInTheDocument();
    // El número de operación (campo Yape/Plin) NO debe renderizarse
    expect(screen.queryByLabelText(/número de operación/i)).not.toBeInTheDocument();

    // Assert — el label del método es "Transferencia bancaria"
    expect(screen.getByText("Transferencia bancaria")).toBeInTheDocument();
  });
});
