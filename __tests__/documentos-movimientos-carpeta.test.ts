import { describe, expect, it } from "vitest";
import {
  agruparMovimientos,
  cortarPagina,
  cuandoCorto,
  destinoDeMetadata,
  fraseDelMovimiento,
  quienMovio,
  renombreDeMetadata,
  type FilaMovimiento,
} from "@/lib/documentos/movimientos-carpeta";

describe("destinoDeMetadata — las formas medidas en el registro (24-10)", () => {
  it("lote y «Ordenar»: folderId, null = raíz", () => {
    expect(destinoDeMetadata({ bulk: true, action: "move", ids: ["a"], folderId: "c1" })).toEqual({ id: "c1" });
    expect(destinoDeMetadata({ ordenar: true, deshacer: true, folderId: null })).toEqual({ id: null });
  });
  it("PATCH del papel: to.folderId", () => {
    expect(destinoDeMetadata({ from: { folderId: "c0", name: "x" }, to: { folderId: "c2", name: "x" } })).toEqual({ id: "c2" });
  });
  it("WhatsApp: hacia; guía vieja y PC: el último tramo de la ruta", () => {
    expect(destinoDeMetadata({ origen: "whatsapp", desde: "c0", hacia: "c3" })).toEqual({ id: "c3" });
    expect(destinoDeMetadata({ origen: "guia", destino: "Guías › GTF 12" })).toEqual({ ruta: "GTF 12" });
    expect(destinoDeMetadata({ origen: "sync-escritorio", de: "a.pdf", a: "Contratos/2026" })).toEqual({ ruta: "2026" });
  });
  it("sin nada reconocible: null", () => {
    expect(destinoDeMetadata(null)).toBeNull();
    expect(destinoDeMetadata({ motivo: "x" })).toBeNull();
    expect(destinoDeMetadata(["c1"])).toBeNull();
  });
});

describe("renombreDeMetadata", () => {
  it("texto con ruta: se queda con el nombre", () => {
    expect(renombreDeMetadata({ from: "CCNN/19-SEC/denuncia.docx", to: "Denuncia.docx", ordenar: true })).toEqual({ de: "denuncia.docx", a: "Denuncia.docx" });
  });
  it("si sólo cambió la ruta, la ruta es el cambio", () => {
    expect(renombreDeMetadata({ from: "CCNN/GTF 3.pdf", to: "GTF 3.pdf" })).toEqual({ de: "CCNN/GTF 3.pdf", a: "GTF 3.pdf" });
  });
  it("el papel entero (PATCH): usa name; igual = null", () => {
    expect(renombreDeMetadata({ from: { name: "a.pdf" }, to: { name: "b.pdf" } })).toEqual({ de: "a.pdf", a: "b.pdf" });
    expect(renombreDeMetadata({ from: { name: "a.pdf" }, to: { name: "a.pdf" } })).toBeNull();
    expect(renombreDeMetadata({})).toBeNull();
  });
});

describe("quienMovio", () => {
  const usuarios = new Map([["karla", "Karla Mendoza Ríos"], ["sinnombre", ""]]);
  it("tú, por WhatsApp, persona con nombre corto", () => {
    expect(quienMovio("yo", "yo", usuarios, true)).toEqual({ tipo: "tu" });
    expect(quienMovio("whatsapp:51916409675", "yo", usuarios, true)).toEqual({ tipo: "whatsapp" });
    expect(quienMovio("karla", "yo", usuarios, true)).toEqual({ tipo: "persona", nombre: "Karla Mendoza" });
    expect(quienMovio("sinnombre", "yo", usuarios, true)).toEqual({ tipo: "persona", nombre: "sinnombre" });
  });
  it("sin permiso de ver nombres: «alguien del equipo», nunca el usuario", () => {
    expect(quienMovio("karla", "yo", usuarios, false)).toEqual({ tipo: "equipo" });
  });
  it("los que escriben solos", () => {
    expect(quienMovio("sync-escritorio", "yo", usuarios, true)).toEqual({ tipo: "sistema", etiqueta: "La sincronización con tu PC" });
    expect(quienMovio("Kiosko de asistencia", "yo", usuarios, false)).toEqual({ tipo: "sistema", etiqueta: "El kiosko de asistencia" });
    expect(quienMovio("cron-leer-noche", "yo", usuarios, true)).toEqual({ tipo: "sistema", etiqueta: "El sistema" });
    expect(quienMovio("cuentaborrada", "yo", usuarios, true)).toEqual({ tipo: "equipo" });
  });
});

describe("agruparMovimientos + cortarPagina", () => {
  const f = (id: string, min: number, extra: Partial<FilaMovimiento> = {}): FilaMovimiento => ({
    id,
    accion: "view",
    cuando: new Date(Date.UTC(2026, 9, 24, 15, 0) - min * 60_000).toISOString(),
    actor: "karla",
    papelId: "p1",
    ...extra,
  });
  it("junta lo seguido en una hora y corta al cambiar algo", () => {
    const g = agruparMovimientos([f("1", 0), f("2", 10), f("3", 50), f("4", 70), f("5", 71, { papelId: "p2" })]);
    expect(g.map((x) => [x.id, x.veces])).toEqual([["1", 3], ["4", 1], ["5", 1]]);
    expect(g[0].hasta).toBe(f("3", 50).cuando);
  });
  it("cursor = el más viejo del último grupo de la página; null si no hay más", () => {
    const g = agruparMovimientos([f("1", 0), f("2", 5, { accion: "download" }), f("3", 6, { accion: "upload" })]);
    expect(cortarPagina(g, 2, false)).toEqual({ pagina: g.slice(0, 2), siguiente: g[1].hasta });
    expect(cortarPagina(g, 5, false).siguiente).toBeNull();
    expect(cortarPagina(g, 5, true).siguiente).toBe(g[2].hasta);
    expect(cortarPagina([], 5, true).siguiente).toBeNull();
  });
});

describe("fraseDelMovimiento", () => {
  const papel = { id: "p1", nombre: "Acta.pdf", borrado: false };
  it("tú, otra persona, el equipo, WhatsApp y el sistema", () => {
    expect(fraseDelMovimiento({ accion: "upload", quien: { tipo: "tu" }, papel })).toBe("Subiste «Acta.pdf»");
    expect(fraseDelMovimiento({ accion: "view", quien: { tipo: "persona", nombre: "Karla" }, papel })).toBe("Karla abrió «Acta.pdf»");
    expect(fraseDelMovimiento({ accion: "delete", quien: { tipo: "equipo" }, papel })).toBe("Alguien del equipo mandó a la papelera «Acta.pdf»");
    expect(fraseDelMovimiento({ accion: "upload", quien: { tipo: "whatsapp" }, papel })).toBe("Por WhatsApp se subió «Acta.pdf»");
    expect(fraseDelMovimiento({ accion: "ai_expiry", quien: { tipo: "sistema", etiqueta: "El sistema" }, papel })).toBe("El sistema anotó cuándo vence «Acta.pdf»");
  });
  it("mover dice adónde; renombrar dice de qué a qué", () => {
    expect(fraseDelMovimiento({ accion: "move", quien: { tipo: "tu" }, papel, destino: { tipo: "carpeta", nombre: "Personal" } })).toBe("Moviste «Acta.pdf» a «Personal»");
    expect(fraseDelMovimiento({ accion: "move", quien: { tipo: "tu" }, papel, destino: { tipo: "raiz" } })).toBe("Moviste «Acta.pdf» a la raíz del Archivo");
    expect(fraseDelMovimiento({ accion: "move", quien: { tipo: "tu" }, papel, destino: { tipo: "otra" } })).toBe("Moviste «Acta.pdf» a otra carpeta");
    expect(fraseDelMovimiento({ accion: "rename", quien: { tipo: "tu" }, papel, renombre: { de: "a.pdf", a: "Acta.pdf" } })).toBe("Cambiaste el nombre de «a.pdf» a «Acta.pdf»");
  });
});

describe("cuandoCorto — hora de Lima", () => {
  // 24-10-2026 20:30 en Lima = 25-10 01:30 UTC (el UTC ya es mañana).
  const ahora = Date.UTC(2026, 9, 25, 1, 30);
  it("hoy y ayer por el día de Lima, no el de UTC", () => {
    expect(cuandoCorto(new Date(Date.UTC(2026, 9, 24, 23, 20)).toISOString(), ahora)).toBe("hoy 18:20");
    expect(cuandoCorto(new Date(Date.UTC(2026, 9, 24, 4, 0)).toISOString(), ahora)).toBe("ayer 23:00");
  });
  it("más atrás: día de la semana y fecha; otro año, con el año", () => {
    expect(cuandoCorto(new Date(Date.UTC(2026, 8, 10, 17, 5)).toISOString(), ahora)).toBe("jueves 10/09 · 12:05");
    expect(cuandoCorto(new Date(Date.UTC(2025, 8, 10, 17, 5)).toISOString(), ahora)).toBe("miércoles 10/09/2025 · 12:05");
    expect(cuandoCorto("nada", ahora)).toBe("");
  });
});
