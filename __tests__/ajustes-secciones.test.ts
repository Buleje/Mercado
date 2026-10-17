import { describe, expect, it } from "vitest";
import { filtrarSecciones, TABS } from "@/components/admin/settings/secciones";

const ids = (q: string) => filtrarSecciones(q).map((s) => s.id);

describe("buscador de Configuración", () => {
  it("sin consulta muestra las 8 secciones", () => {
    expect(filtrarSecciones("  ")).toHaveLength(TABS.length);
  });

  it("encuentra por un campo de adentro, no sólo por el título", () => {
    expect(ids("yape")).toEqual(["cobros"]);
    expect(ids("igv")).toEqual(["cobros"]);
    expect(ids("logo")).toEqual(["negocio"]);
  });

  it("ignora tildes y mayúsculas", () => {
    expect(ids("CONTRASENA")).toEqual(["equipo"]);
    expect(ids("menú")).toContain("tienda");
  });

  it("varias palabras: tienen que estar todas", () => {
    expect(ids("envio gratis")).toEqual(["delivery"]);
    expect(ids("yape zona")).toEqual([]);
  });
});
