/**
 * Comandos del buscador del panel (M04, noche 17-10): cada uno lleva a un
 * lugar que EXISTE (pestaña, vista, sección), «cobrar a Juan» separa el
 * comando de la persona y, sin saber el rol, no se ofrece ninguno.
 */
import { describe, expect, it } from "vitest";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import {
  buscarComandos,
  COMANDOS_PANEL,
  comandoConPersona,
  comandoPermitido,
  consultaRemota,
  esConsultaDeAccion,
  hrefDeComando,
} from "@/lib/admin/comandos-panel";
import { ANIDADAS_POR_MODULO, vistasDelModulo } from "@/lib/admin/subvistas-modulos";

const TABS = new Set(ALL_TABS.map((t) => t.id as string));

describe("catálogo de comandos", () => {
  it.each(COMANDOS_PANEL.map((c) => [c.id, c] as const))("%s lleva a un lugar que existe", (_id, c) => {
    expect(TABS.has(c.tab)).toBe(true);
    if (c.vista) expect(vistasDelModulo(c.tab).map((v) => v.key)).toContain(c.vista);
    if (c.sub) {
      const subs = (ANIDADAS_POR_MODULO[c.tab] ?? []).filter((a) => a.vista === c.vista).map((a) => a.key);
      expect(subs).toContain(c.sub);
    }
  });

  it("los ids no se repiten", () => {
    expect(new Set(COMANDOS_PANEL.map((c) => c.id)).size).toBe(COMANDOS_PANEL.length);
  });
});

describe("buscar", () => {
  const todos = () => true;

  it("«nueva venta» pone primero el POS", () => {
    const [primero] = buscarComandos("nueva venta", todos);
    expect(primero?.id).toBe("nueva-venta");
    expect(hrefDeComando(primero!)).toBe("/admin?tab=ventas-caja&vista=pos");
  });

  it("«cuadrar» encuentra la caja y respeta el filtro de permiso", () => {
    expect(buscarComandos("cuadrar", todos).map((c) => c.id)).toContain("cuadrar-caja");
    expect(buscarComandos("cuadrar", (c) => c.tab !== "ventas-caja")).toEqual([]);
  });

  it("sin palabras útiles no devuelve nada", () => {
    expect(buscarComandos("de la", todos)).toEqual([]);
  });

  it("un verbo al inicio es una consulta de acción", () => {
    expect(esConsultaDeAccion("Cobrar a Juan")).toBe(true);
    expect(esConsultaDeAccion("juan")).toBe(false);
  });
});

describe("«cobrar a …»", () => {
  it("separa el comando de la persona y conserva cómo se escribió", () => {
    const r = comandoConPersona("cobrar a Juan Pérez");
    expect(r?.comando.id).toBe("cobrar-deuda");
    expect(r?.persona).toBe("Juan Pérez");
    expect(hrefDeComando(r!.comando, r!.persona)).toContain("q=Juan+P%C3%A9rez");
  });

  it("«pagarle al Molino» va a Por pagar", () => {
    expect(comandoConPersona("pagarle al Molino")?.comando.id).toBe("pagar-proveedor");
  });

  it("«cobrar deuda» o «cobrarle una deuda» no nombran a nadie", () => {
    expect(comandoConPersona("cobrar deuda")).toBeNull();
    expect(comandoConPersona("cobrarle una deuda")).toBeNull();
  });

  it("al servidor viaja sólo el nombre", () => {
    expect(consultaRemota("cobrar a Rosa")).toBe("Rosa");
    expect(consultaRemota("  arroz ")).toBe("arroz");
  });
});

describe("permiso", () => {
  it("sin el rol confirmado no se ofrece ningún comando", () => {
    expect(COMANDOS_PANEL.some((c) => comandoPermitido(null, c))).toBe(false);
  });
});
