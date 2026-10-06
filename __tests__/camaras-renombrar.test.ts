import { describe, expect, it } from "vitest";
import { renombrarCamara, type Camara } from "@/lib/camaras/camaras";

const cam = (id: string, nombre: string, lugar = ""): Camara =>
  ({ id, nombre, lugar, token: `t-${id}`, activa: true, creadaEn: "2026-10-05T00:00:00.000Z", ultimaCapturaEn: null }) as Camara;

describe("renombrarCamara (05-10: «Camara 1 oficina» mostraba el patio de trozas)", () => {
  const lista = [cam("a", "Camara 1 oficina"), cam("b", "Camara 2", "Portón")];

  it("cambia sólo el nombre: id, token y lugar quedan", () => {
    const r = renombrarCamara(lista, "a", { nombre: "  Patio de trozas " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.camaras[0]).toMatchObject({ id: "a", nombre: "Patio de trozas", token: "t-a", lugar: "" });
    expect(r.camaras[1]).toBe(lista[1]);
    expect(r.mensaje).toBe("«Camara 1 oficina» ahora se llama «Patio de trozas».");
  });

  it("el lugar cambia sólo si viene", () => {
    const r = renombrarCamara(lista, "b", { nombre: "Entrada", lugar: "Puerta principal" });
    expect(r.ok && r.camaras[1]).toMatchObject({ nombre: "Entrada", lugar: "Puerta principal" });
  });

  it("rechaza vacío, >80, repetido (sin importar mayúsculas) y cámara inexistente", () => {
    expect(renombrarCamara(lista, "a", { nombre: "  " }).ok).toBe(false);
    expect(renombrarCamara(lista, "a", { nombre: "x".repeat(81) }).ok).toBe(false);
    expect(renombrarCamara(lista, "a", { nombre: "camara 2" })).toMatchObject({ ok: false });
    expect(renombrarCamara(lista, "zz", { nombre: "Nueva" })).toMatchObject({ ok: false });
  });

  it("el mismo nombre con otras mayúsculas en la MISMA cámara se permite", () => {
    expect(renombrarCamara(lista, "a", { nombre: "CAMARA 1 OFICINA" }).ok).toBe(true);
  });
});
