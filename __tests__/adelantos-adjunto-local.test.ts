// @vitest-environment jsdom
/**
 * (10-10, Ley 29733) «Adjuntar archivo» de Adelantos ya no sube al bucket
 * público: lee la foto o el PDF en el navegador y lo guarda privado al guardar.
 * Lo que el cliente corta antes de mandar nada, y cómo reconoce lo local.
 */
import { describe, it, expect } from "vitest";
import { esAdjuntoLocal, esPdfLocal, leerAdjuntoLocal } from "@/lib/adelantos/adjunto-local";

describe("leerAdjuntoLocal", () => {
  it("un PDF sin `type` (Windows) sale igual como data:application/pdf", async () => {
    const r = await leerAdjuntoLocal(new File(["%PDF-1.4\n%%EOF"], "estado.pdf", { type: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pdf).toBe(true);
      expect(r.dataUrl.startsWith("data:application/pdf;base64,")).toBe(true);
      expect(esAdjuntoLocal(r.dataUrl)).toBe(true);
      expect(esPdfLocal(r.dataUrl)).toBe(true);
    }
  });

  it("una foto queda como data:image/…", async () => {
    const r = await leerAdjuntoLocal(new File([new Uint8Array([1, 2, 3])], "v.jpg", { type: "image/jpeg" }));
    expect(r.ok && r.dataUrl.startsWith("data:image/jpeg")).toBe(true);
  });

  it("rechaza lo que no es foto ni PDF y lo que pasa de 4 MB, sin leerlo", async () => {
    expect(await leerAdjuntoLocal(new File(["MZ"], "x.exe", { type: "application/x-msdownload" }))).toEqual({ ok: false, error: "Elige una foto (JPG, PNG, WebP) o un PDF." });
    const grande = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "g.pdf", { type: "application/pdf" });
    expect(await leerAdjuntoLocal(grande)).toEqual({ ok: false, error: "El archivo pesa más de 4 MB." });
  });

  it("una URL (pública o `priv:`) no es local: no se vuelve a subir", () => {
    expect(esAdjuntoLocal("https://x.supabase.co/storage/v1/object/public/media/t1/media/1-v.webp")).toBe(false);
    expect(esAdjuntoLocal("priv:t1/adelantos/a1/1-adjunto-abcdef12.webp")).toBe(false);
  });
});
