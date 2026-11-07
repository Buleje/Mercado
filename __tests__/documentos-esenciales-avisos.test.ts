import { describe, expect, it } from "vitest";
import { avisosDeEsenciales, TIPO_AVISO_ESENCIALES } from "@/lib/documentos/esenciales-avisos";
import { TAG_ESENCIAL } from "@/lib/documentos/esenciales";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";

const hoy = new Date("2026-10-23T12:00:00Z");
const en = (d: number) => new Date(hoy.getTime() + d * 86_400_000).toISOString();
const carpetas = [
  { id: "lic", name: "Licencias", parentId: null, tags: [TAG_ESENCIAL], allowedRoles: [] },
  { id: "sub", name: "2026", parentId: "lic", tags: [], allowedRoles: [] },
  { id: "otra", name: "Suelta", parentId: null, tags: [], allowedRoles: [] },
];
const doc = (id: string, folderId: string, d: number, extra = {}) => ({
  id,
  folderId,
  name: `${id}.pdf`,
  expiresAt: en(d),
  ...extra,
});

describe("avisosDeEsenciales", () => {
  it("etapa vencido, HIGH, con el papel más urgente y «y N más»", () => {
    const [a] = avisosDeEsenciales({ carpetas, docs: [doc("a", "lic", -3), doc("b", "lic", 20)], hoy });
    expect(a.type).toBe(TIPO_AVISO_ESENCIALES);
    expect(a.severity).toBe("HIGH");
    expect(a.entityId).toBe("lic:vencido");
    expect(a.title).toContain("«Licencias»");
    // Lo vencido no se esconde dentro de «por vencer».
    expect(a.title).toContain("1 vencido y 1 por vencer");
    expect(a.body).toContain("a.pdf venció hace 3 días y 1 más");
    expect(a.actionUrl).toBe("/admin?tab=documentos&vista=esenciales&esencial=lic");
  });
  it("etapas 7 y 30", () => {
    expect(avisosDeEsenciales({ carpetas, docs: [doc("a", "lic", 5)], hoy })[0]).toMatchObject({ entityId: "lic:7", severity: "HIGH" });
    const [m] = avisosDeEsenciales({ carpetas, docs: [doc("a", "lic", 25)], hoy });
    expect(m).toMatchObject({ entityId: "lic:30", severity: "MEDIUM" });
    expect(m.title).toContain("1 papel por vencer");
  });
  it("cuenta papeles de subcarpetas", () => {
    expect(avisosDeEsenciales({ carpetas, docs: [doc("a", "sub", 2)], hoy })).toHaveLength(1);
  });
  it("carpeta no marcada no avisa", () => {
    expect(avisosDeEsenciales({ carpetas, docs: [doc("a", "otra", -2)], hoy })).toEqual([]);
  });
  it("papel borrado o lejano no cuenta; sin papeles, sin aviso", () => {
    expect(
      avisosDeEsenciales({ carpetas, docs: [doc("a", "lic", -2, { deletedAt: en(-1) }), doc("b", "lic", 90)], hoy }),
    ).toEqual([]);
    expect(avisosDeEsenciales({ carpetas, docs: [], hoy })).toEqual([]);
  });
  it("candado (en la carpeta o una madre): sin nombres", () => {
    const cc = carpetas.map((c) => (c.id === "lic" ? { ...c, allowedRoles: [ROL_CANDADO_DUENO] } : c));
    const [a] = avisosDeEsenciales({ carpetas: cc, docs: [doc("secreto", "sub", -2)], hoy });
    expect(a.title).toBe("Esenciales: una carpeta con candado tiene papeles por vencer");
    expect(JSON.stringify(a)).not.toMatch(/Licencias|secreto/);
  });
});
