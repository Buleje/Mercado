import { describe, expect, it } from "vitest";
import { enlaceSoporte, mensajeSoporte, numeroSoporte } from "@/lib/soporte/enlace-soporte";

const texto = (url: string) => decodeURIComponent(url.split("?text=")[1]);

describe("enlaceSoporte", () => {
  it("lleva nombre e ID formateado", () => {
    const url = enlaceSoporte({ negocio: "Buleje", codigo: "525146", numero: "51929340532" });
    expect(url.startsWith("https://wa.me/51929340532?text=")).toBe(true);
    expect(texto(url)).toBe("Hola, soy Buleje, ID 525-146: ");
  });
  it("codifica tildes y espacios", () => {
    const url = enlaceSoporte({ negocio: "Ñandú & Cía", codigo: "525146" });
    expect(url).toContain("%C3%91");
    expect(url.split("?text=")[1]).not.toContain(" ");
    expect(texto(url)).toBe("Hola, soy Ñandú & Cía, ID 525-146: ");
  });
  it("sin ID manda sin ID", () => {
    expect(mensajeSoporte("Buleje", null)).toBe("Hola, soy Buleje: ");
    expect(mensajeSoporte(null, null)).toBe("Hola, necesito ayuda: ");
  });
  it("número: 9 dígitos suma 51; vacío cae al de legal", () => {
    expect(numeroSoporte("929 340 532")).toBe("51929340532");
    expect(numeroSoporte("")).toBe("51929340532");
  });
});
