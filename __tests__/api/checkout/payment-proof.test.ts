/**
 * __tests__/api/checkout/payment-proof.test.ts
 *
 * Tests unitarios para POST /api/marketplace/checkout/payment-proof.
 *
 * NOTA DE IMPLEMENTACIÓN:
 * Next.js 16 / jsdom serializa incorrectamente los File objects cuando se
 * pasa FormData al constructor de NextRequest — el File se convierte a string
 * "undefined" al llamar req.formData(). Para evitar esto, mockeamos
 * req.formData() directamente usando vi.spyOn sobre el prototype de NextRequest,
 * lo que garantiza que el handler recibe los datos exactos que queremos testear.
 *
 * Casos cubiertos:
 *   1. Happy path → 200 { ok, proofUrl, proofToken } (sin storagePath — audit P0)
 *   2. PDF spoofed con content-type "image/jpeg" pero magic bytes PDF → 400
 *   3. Archivo > 5 MB → 400 "Captura muy grande"
 *   4. Sin cookie (requireCustomer retorna 401) → 401
 *   5. storeSlug con caracteres XSS → 400 Zod error
 *   6. amountPEN = 0 → 400 Zod error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

const { mockUpload, mockCreateSignedUrl, mockGetPublicUrl } = vi.hoisted(() => {
  const mockUpload = vi.fn();
  const mockCreateSignedUrl = vi.fn();
  const mockGetPublicUrl = vi.fn();
  return { mockUpload, mockCreateSignedUrl, mockGetPublicUrl };
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  })),
}));

vi.mock("@/lib/auth/require-customer", () => ({
  requireCustomer: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null), // siempre pass
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("webp-bytes")),
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Importar DESPUÉS de los mocks
import { POST } from "@/app/api/marketplace/checkout/payment-proof/route";
import { requireCustomer } from "@/lib/auth/require-customer";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type MockRequireCustomer = ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Construye un NextRequest con formData() mockeado.
 *
 * jsdom no puede serializar File objects a través del constructor de NextRequest
 * (los convierte a string "undefined"). Mockeamos req.formData() directamente
 * para que el handler reciba los datos exactos del test.
 */
function makeRequest(formDataEntries: {
  file: File;
  storeSlug?: string;
  method?: string;
  amountPEN?: string;
}): NextRequest {
  const {
    file,
    storeSlug = "bodega-san-martin",
    method = "yape",
    amountPEN = "10.50",
  } = formDataEntries;

  const req = new NextRequest(
    "http://localhost:3000/api/marketplace/checkout/payment-proof",
    { method: "POST" },
  );

  // Construir un FormData real que el handler pueda leer
  const fd = new FormData();
  fd.append("file", file);
  fd.append("storeSlug", storeSlug);
  fd.append("method", method);
  fd.append("amountPEN", amountPEN);

  // Reemplazar req.formData() para evitar la serialización de jsdom
  vi.spyOn(req, "formData").mockResolvedValue(fd);

  return req;
}

/** Crea un File JPEG con magic bytes válidos y tamaño exacto. */
function makeJpegFile(sizeBytes: number = 1024): File {
  const buf = new Uint8Array(Math.max(sizeBytes, 4)).fill(0x41); // 'A'
  // JPEG magic bytes: FF D8 FF E0
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return new File([buf], "captura.jpg", { type: "image/jpeg" });
}

/** Crea un File con magic bytes de PDF (%PDF-) pero content-type imagen. */
function makePdfSpoofedAsJpeg(): File {
  const content = new TextEncoder().encode("%PDF-1.4 fake pdf content\n");
  return new File([content], "captura.jpg", { type: "image/jpeg" });
}

/** Simula requireCustomer retornando una sesión válida. */
function mockCustomerOk() {
  (requireCustomer as MockRequireCustomer).mockResolvedValue({
    customerId: "customer-abc123",
    email: "test@example.com",
  });
}

/** Simula requireCustomer retornando una NextResponse 401. */
function mockCustomerUnauth() {
  const { NextResponse } = require("next/server");
  (requireCustomer as MockRequireCustomer).mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

// ── Setup por test ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Supabase upload exitoso por defecto
  mockUpload.mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.supabase.co/signed/proof.webp" },
    error: null,
  });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://storage.supabase.co/public/proof.webp" },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/checkout/payment-proof", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Caso 1 — Happy path
  // ──────────────────────────────────────────────────────────────────────────
  it("(1) devuelve 200 con { ok, proofUrl, proofToken } y SIN storagePath", async () => {
    // Arrange
    mockCustomerOk();
    const req = makeRequest({ file: makeJpegFile() });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert — status
    expect(res.status).toBe(200);

    // Assert — campos requeridos
    expect(body.ok).toBe(true);
    expect(typeof body.proofUrl).toBe("string");
    expect(body.proofUrl).toMatch(/^https?:\/\//);
    expect(typeof body.proofToken).toBe("string");
    // El token tiene exactamente 6 partes separadas por "."
    expect(body.proofToken.split(".")).toHaveLength(6);

    // Assert de seguridad P0 — storagePath NO debe exponerse al cliente
    expect(body.storagePath).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 2 — PDF spoofed (content-type "image/jpeg" pero magic bytes PDF)
  // ──────────────────────────────────────────────────────────────────────────
  it("(2) devuelve 400 cuando magic bytes son de PDF aunque content-type sea image/jpeg", async () => {
    // Arrange
    mockCustomerOk();
    const req = makeRequest({ file: makePdfSpoofedAsJpeg() });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/magic bytes/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 3 — Archivo > 5 MB
  // ──────────────────────────────────────────────────────────────────────────
  it("(3) devuelve 400 'Captura muy grande' cuando el archivo supera 5 MB", async () => {
    // Arrange — El check de tamaño ocurre antes que magic bytes en el route.
    // Creamos un File con size > MAX_SIZE pero type válido.
    mockCustomerOk();
    const oversize = makeJpegFile(MAX_SIZE + 1);
    const req = makeRequest({ file: oversize });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/captura muy grande/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 4 — Sin cookie de sesión → 401
  // ──────────────────────────────────────────────────────────────────────────
  it("(4) devuelve 401 cuando no hay cookie buleje-customer-sess", async () => {
    // Arrange
    mockCustomerUnauth();
    const req = makeRequest({ file: makeJpegFile() });

    // Act
    const res = await POST(req);

    // Assert — requireCustomer retorna directamente la NextResponse 401
    expect(res.status).toBe(401);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 5 — storeSlug con XSS → Zod 400
  // ──────────────────────────────────────────────────────────────────────────
  it("(5) devuelve 400 con error Zod cuando storeSlug contiene '<script>'", async () => {
    // Arrange — el slug no pasa la regex /^[a-z0-9-]{2,64}$/
    mockCustomerOk();
    const req = makeRequest({
      file: makeJpegFile(),
      storeSlug: "<script>alert(1)</script>",
    });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/datos incompletos/i);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Caso 6 — amountPEN = 0 → Zod 400
  // ──────────────────────────────────────────────────────────────────────────
  it("(6) devuelve 400 cuando amountPEN es 0 (debajo del mínimo 0.1)", async () => {
    // Arrange
    mockCustomerOk();
    const req = makeRequest({
      file: makeJpegFile(),
      amountPEN: "0",
    });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/datos incompletos/i);
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
