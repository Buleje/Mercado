/**
 * La foto de una planilla de campo leída por la IA → el texto que pega el
 * importador de su destino. Se prueba con el lector REAL de cada importador:
 * si un encabezado de la hoja no es alias del lector, la columna se pierde
 * sin error (17-10: «Código del paquete» no lo reconocía producción).
 */
import { describe, expect, it } from "vitest";
import { columnasAMano, planillaPorId } from "@/lib/forestal/planillas/catalogo";
import type { LecturaPlanilla, PlanillaCampo, PlanillaId } from "@/lib/forestal/planillas/tipos";
import { filasDesdeTexto, interpretarProduccion } from "@/lib/forestal/produccion-import";
import { parseCensoTabla } from "@/lib/forestal/loth-censo-import";
import { dudasDeLaLectura, lecturaATexto } from "@/components/admin/forestal/planillas/lectura-a-texto";

function planilla(id: PlanillaId): PlanillaCampo {
  const p = planillaPorId(id);
  if (!p) throw new Error(`falta la planilla ${id}`);
  return p;
}

/** Una lectura con el renglón de ejemplo de la hoja (+ la calculada, que no debe viajar). */
function lecturaDeEjemplo(p: PlanillaCampo, dudosas: string[] = []): LecturaPlanilla {
  const valores: Record<string, string> = {};
  for (const c of p.columnas) valores[c.clave] = c.calculada ? "999" : c.ejemplo;
  return { planillaId: p.id, cabecera: {}, filas: [{ valores, dudosas }], prompt: { origen: "fabrica", version: p.versionPrompt } };
}

describe("lecturaATexto · parte de producción", () => {
  const p = planilla("parte-produccion");

  it("el renglón de ejemplo entra como 1 corrida sin errores, cada valor en su campo", () => {
    const r = interpretarProduccion(filasDesdeTexto(lecturaATexto(p, lecturaDeEjemplo(p))), {
      fechaPorDefecto: "2026-10-17",
    });
    expect(r.errores).toEqual([]);
    expect(r.corridas).toHaveLength(1);
    const c = r.corridas[0];
    expect(c.fecha).toBe("2026-10-17");
    expect(c.cantidad).toBe(2.35);
    expect(c.especie).toBe("Tornillo");
    expect(c.codigoRaiz).toBe("T-0412");
    expect(c.observaciones).toBe("Con nudos");
  });

  it("un tabulador o salto de línea dentro de una celda no corre las columnas", () => {
    const l = lecturaDeEjemplo(p);
    l.filas[0].valores.observaciones = "Con\tnudos\nchicos";
    const r = interpretarProduccion(filasDesdeTexto(lecturaATexto(p, l)), { fechaPorDefecto: "2026-10-17" });
    expect(r.corridas[0]?.observaciones).toBe("Con nudos chicos");
  });
});

describe("lecturaATexto · censo de árboles", () => {
  const p = planilla("censo-arboles");

  it("el renglón de ejemplo entra como 1 árbol válido, con DAP en metros y coordenadas", () => {
    const r = parseCensoTabla(lecturaATexto(p, lecturaDeEjemplo(p)));
    expect(r.conEncabezado).toBe(true);
    expect(r.filas).toHaveLength(1);
    expect(r.conError).toBe(0);
    const f = r.filas[0];
    expect(f.treeCode).toBe("A-001");
    expect(f.speciesCommon).toBe("Shihuahuaco");
    expect(f.dapM).toBeCloseTo(0.85, 6);
    expect(f.alturaComercialM).toBe(18);
    expect(f.utmX).toBe(512345);
    expect(f.utmY).toBe(8956789);
  });
});

describe("lecturaATexto · forma", () => {
  it("las columnas calculadas no viajan: el volumen lo calcula el importador", () => {
    const p = planilla("censo-arboles");
    const texto = lecturaATexto(p, lecturaDeEjemplo(p));
    expect(texto).not.toContain("999");
    const [enc] = filasDesdeTexto(texto);
    expect(enc).toHaveLength(columnasAMano(p).length + 1);
  });

  it("las dudas salen con el título impreso de la columna", () => {
    const p = planilla("censo-arboles");
    expect(dudasDeLaLectura(p, lecturaDeEjemplo(p, ["dap", "especie"]))).toEqual(["Fila 1: DAP, N. Común"]);
  });
});
