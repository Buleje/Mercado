import { describe, expect, it } from "vitest";
import { cambiosDe, cuantos } from "@/components/admin/store-customizer/cambios";
import { saludDeLaTienda } from "@/components/admin/store-customizer/salud";
import type { StoreTheme } from "@/components/admin/StoreCustomizer";

/**
 * Tienda online › Apariencia guarda SÓLO lo que cambió (11-10): el servidor
 * mezcla `storeTheme`, y mandar el tema entero cargado al abrir pisaba lo que
 * otro editor guardó mientras tanto (las secciones del inicio).
 */
describe("cambiosDe", () => {
  it("devuelve sólo las claves que cambiaron, también arrays y objetos", () => {
    const antes = { storeName: "Buleje Beauty", slogan: "Hola", trustChips: ["a", "b"], tiendaSections: ["hero"] };
    const ahora = { ...antes, slogan: "Chau", trustChips: ["a", "c"] };
    expect(cambiosDe(antes, ahora)).toEqual({ slogan: "Chau", trustChips: ["a", "c"] });
  });

  it("sin cambios no manda nada (no hay PUT)", () => {
    const t = { storeName: "X", sections: ["hero", "faq"] };
    expect(cuantos(cambiosDe(t, { ...t, sections: ["hero", "faq"] }))).toBe(0);
  });

  it("una clave que el editor no tiene no viaja: no se borra en el servidor", () => {
    const guardado = { storeName: "X", tiendaSections: ["hero"] } as Record<string, unknown>;
    const restaurado = { storeName: "Mi Bodega" } as Record<string, unknown>;
    expect(cambiosDe(guardado, restaurado)).toEqual({ storeName: "Mi Bodega" });
  });
});

describe("saludDeLaTienda", () => {
  const base = {
    logo: "https://x/logo.png", storeName: "Buleje", slogan: "s", description: "d",
    heroTitle: "t", heroSubtitle: "s", heroImage: "",
    primaryColor: "#4dcbcb", secondaryColor: "#0d2b3a", accentColor: "#00a0a0",
    whatsapp: "", email: "", phone: "", address: "",
    analyticsId: "", favicon: "",
  } as unknown as StoreTheme;

  it("cuenta lo que falta por sección y avisa contraste bajo con el número", () => {
    const s = saludDeLaTienda(base);
    expect(s.faltan).toEqual({ portada: 1, contacto: 4, avanzado: 2 });
    expect(s.pct).toBe(56); // 9 de 16: identidad 4, portada 2, colores 3
    expect(s.avisos.map((a) => a.seccion)).toEqual(["contacto", "portada", "colores"]);
    expect(s.avisos.at(-1)?.label).toMatch(/contraste bajo \(\d/);
  });
});
