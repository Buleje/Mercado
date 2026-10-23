// @vitest-environment node
/**
 * ocr-servidor: los cortes que no pueden perder lo ya leído ni trabar la fila.
 *
 * tesseract.js y el dibujo del PDF van falsos (un worker de mentira que
 * contesta o se cuelga a pedido); sharp y pdf-lib son los de verdad, así la
 * página pasa por el mismo camino (vista chica → página entera → pasadas).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const h = vi.hoisted(() => {
  type Reconocer = () => Promise<{ data: { text: string; confidence: number } }>;
  const estado = {
    /** Qué contesta cada `recognize`, en orden; sin entrada = se cuelga. */
    respuestas: [] as Reconocer[],
    /** Cada `createWorker`: true = se cuelga sin contestar nunca. */
    creacionesColgadas: [] as boolean[],
    creados: 0,
    terminados: 0,
  };
  const colgada = () => new Promise<never>(() => {});
  const createWorker = vi.fn(async () => {
    const n = estado.creados++;
    if (estado.creacionesColgadas[n]) return colgada();
    return {
      setParameters: vi.fn(async () => ({})),
      recognize: vi.fn(() => (estado.respuestas.shift() ?? colgada)()),
      terminate: vi.fn(async () => {
        estado.terminados++;
      }),
    };
  });
  const renderizarPaginaPdf = vi.fn<(d: unknown, p?: number, e?: unknown, o?: { escala?: number }) => Promise<Buffer | null>>();
  return { estado, createWorker, renderizarPaginaPdf };
});

vi.mock("tesseract.js", () => ({ createWorker: h.createWorker }));
vi.mock("@/lib/documents/pdf-a-imagen", () => ({ renderizarPaginaPdf: h.renderizarPaginaPdf }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

type Modulo = typeof import("@/lib/documents/ocr-servidor");
let ocr: Modulo;

const TEXTO_PAG_1 = "MUNICIPALIDAD PROVINCIAL DE CORONEL PORTILLO Licencia de funcionamiento Valida hasta: 15/01/2027";
const contesta = (text: string) => async () => ({ data: { text, confidence: 88 } });

/** Una hoja «llena» (más del 35 % con tinta): se lee entera, una pasada. */
async function hojaLlena(): Promise<Buffer> {
  const negro = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  return sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: negro, left: 150, top: 300 }])
    .png()
    .toBuffer();
}

async function pdfDe(paginas: [number, number][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const tam of paginas) pdf.addPage(tam);
  return Buffer.from(await pdf.save());
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DOC_OCR_TIMEOUT_MS", "300");
  vi.stubEnv("DOC_OCR_PRESUPUESTO_MS", "20000");
  Object.assign(h.estado, { respuestas: [], creacionesColgadas: [], creados: 0, terminados: 0 });
  h.createWorker.mockClear();
  h.renderizarPaginaPdf.mockReset();
  const hoja = await hojaLlena();
  h.renderizarPaginaPdf.mockResolvedValue(hoja);
  ocr = await import("@/lib/documents/ocr-servidor");
});

afterEach(async () => {
  await ocr.apagarOcrServidor();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ocrServidorSoporta", () => {
  it("PDF y fotos sí; Word y texto no", () => {
    expect(ocr.ocrServidorSoporta("application/pdf")).toBe(true);
    expect(ocr.ocrServidorSoporta("image/jpeg")).toBe(true);
    expect(ocr.ocrServidorSoporta("image/PNG")).toBe(true);
    expect(ocr.ocrServidorSoporta("image/svg+xml")).toBe(false);
    expect(ocr.ocrServidorSoporta("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(ocr.ocrServidorSoporta("text/plain")).toBe(false);
  });
});

describe("ocrEnServidor: lo que no se intenta", () => {
  it("muy_grande: no gasta minutos de CPU en un escaneo enorme", async () => {
    const r = await ocr.ocrEnServidor(Buffer.alloc(ocr.OCR_MAX_BYTES + 1), "application/pdf");
    expect(r).toEqual({ ok: false, motivo: "muy_grande" });
    expect(h.createWorker).not.toHaveBeenCalled();
  });

  it("sin_idioma: sin spa.traineddata en el disco no baja nada de internet", async () => {
    vi.stubEnv("TESSERACT_LANG_PATH", "");
    vi.spyOn(process, "cwd").mockReturnValue("/no/existe");
    const r = await ocr.ocrEnServidor(await hojaLlena(), "image/png");
    expect(r).toEqual({ ok: false, motivo: "sin_idioma" });
    expect(h.createWorker).not.toHaveBeenCalled();
  });

  it("no_soportado", async () => {
    expect(await ocr.ocrEnServidor(Buffer.from("hola"), "text/plain")).toEqual({ ok: false, motivo: "no_soportado" });
  });
});

describe("ocrEnServidor: cortes", () => {
  it("un tope en la página 2 conserva el texto de la página 1 y mata el worker colgado", async () => {
    h.estado.respuestas = [contesta(TEXTO_PAG_1)]; // la 2.ª pasada (página 2) se cuelga
    const r = await ocr.ocrEnServidor(await pdfDe([[595, 842], [595, 842]]), "application/pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paginas).toBe(1);
    expect(r.texto).toContain("Valida hasta: 15/01/2027");
    expect(h.estado.terminados).toBe(1);
  });

  it("un createWorker colgado entra al tope y no traba la fila: el próximo documento se lee", async () => {
    h.estado.creacionesColgadas = [true];
    const colgado = await ocr.ocrEnServidor(await hojaLlena(), "image/png");
    expect(colgado).toEqual({ ok: false, motivo: "falla" });

    h.estado.respuestas = [contesta(TEXTO_PAG_1)];
    const siguiente = await ocr.ocrEnServidor(await hojaLlena(), "image/png");
    expect(siguiente.ok).toBe(true);
    expect(h.createWorker).toHaveBeenCalledTimes(2);
  });

  it("dos documentos a la vez van en fila y los dos se leen", async () => {
    h.estado.respuestas = [contesta(TEXTO_PAG_1), contesta(`${TEXTO_PAG_1} segunda copia`)];
    const hoja = await hojaLlena();
    const [a, b] = await Promise.all([ocr.ocrEnServidor(hoja, "image/png"), ocr.ocrEnServidor(hoja, "image/png")]);
    expect(a.ok && b.ok).toBe(true);
    expect(h.createWorker).toHaveBeenCalledTimes(1); // el mismo worker, reutilizado
  });
});

describe("ocrEnServidor: tamaño del dibujo", () => {
  it("una A4 se dibuja a 2× como siempre", async () => {
    h.estado.respuestas = [contesta(TEXTO_PAG_1)];
    await ocr.ocrEnServidor(await pdfDe([[595, 842]]), "application/pdf");
    expect(h.renderizarPaginaPdf.mock.calls[0]?.[3]?.escala).toBe(2);
  });

  it("un plano A1 no se dibuja a 64 MP: tope de ~2600 px de ancho", async () => {
    h.estado.respuestas = [contesta(TEXTO_PAG_1)];
    await ocr.ocrEnServidor(await pdfDe([[1684, 2384]]), "application/pdf");
    const escala = h.renderizarPaginaPdf.mock.calls[0]?.[3]?.escala ?? 0;
    expect(escala).toBeGreaterThan(0);
    expect(1684 * escala).toBeLessThanOrEqual(2600);
    expect(1684 * escala * 2384 * escala).toBeLessThanOrEqual(12_000_000);
  });
});
