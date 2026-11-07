import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: {} }));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: () => "p", deleteFromStorage: async () => {}, uploadToStorage: async () => ({ ok: true }) }));

import { mimePorBytes, validarFotos, type ArchivoEntrada } from "@/lib/asistente/fotos-chat";

const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

const archivo = (name: string, bytes: number[], size?: number): ArchivoEntrada => ({
  name,
  size: size ?? bytes.length,
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

describe("mimePorBytes", () => {
  it("reconoce jpeg, png y webp por sus bytes", () => {
    expect(mimePorBytes(Uint8Array.from(JPG))).toBe("image/jpeg");
    expect(mimePorBytes(Uint8Array.from(PNG))).toBe("image/png");
    expect(mimePorBytes(Uint8Array.from(WEBP))).toBe("image/webp");
  });
  it("RIFF que no es WEBP (un .wav) y texto no pasan", () => {
    expect(mimePorBytes(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    expect(mimePorBytes(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("validarFotos", () => {
  it("acepta una foto buena", async () => {
    const r = await validarFotos([archivo("a.jpg", JPG)]);
    expect(r.ok && r.fotos[0].mime).toBe("image/jpeg");
  });
  it("rechaza bytes falsos aunque se llame .jpg", async () => {
    const r = await validarFotos([archivo("virus.jpg", [0x4d, 0x5a, 0x90, 0x00])]);
    expect(r).toMatchObject({ ok: false, status: 415 });
  });
  it("rechaza >8 MB (declarado)", async () => {
    const r = await validarFotos([archivo("grande.png", PNG, 8 * 1024 * 1024 + 1)]);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });
  it("rechaza >8 MB aunque el cliente declare poco", async () => {
    const grande = new Array(8 * 1024 * 1024 + 1).fill(0);
    grande.splice(0, 8, ...PNG);
    const r = await validarFotos([archivo("mentira.png", grande, 100)]);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });
  it("rechaza más de 4 fotos", async () => {
    const r = await validarFotos(Array.from({ length: 5 }, (_, i) => archivo(`${i}.png`, PNG)));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});
