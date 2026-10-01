/**
 * «Informe del permiso» (PDF de Control del permiso) — el HTML que se imprime.
 * Datos de Blas medidos el 30-09-2026: guía 019-0000002 (6,6102 m³) cuadra con
 * 111-A + 113-A (6,610); el libro cita la 001-0045678, sin registrar; plan de
 * Tornillo vigente hasta el 20/03/2028 (537 días); plan grande sin vigencia;
 * 0 carátulas.
 */
import { describe, expect, it } from "vitest";
import { construirInformePermiso, faltantesDelPermiso, type DatosInformePermiso } from "@/lib/forestal/loth-informe-permiso-print";
import { cuadrarGuias } from "@/lib/forestal/loth-cuadre-guias";
import { saldoDeCupos } from "@/lib/forestal/loth-saldo-especie";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";

const AHORA = new Date("2026-09-30T15:00:00.000Z");

const troza = (p: Partial<TrozaTablero> & { code: string }): TrozaTablero => ({
  treeCode: "T-1", especie: "Tornillo", volumenM3: 1, fecha: "2026-08-01", estado: "disponible", gtf: null,
  fechaSalida: null, diasEnPatio: 10, lineNo: 1, cites: false, especieCientifica: null, diamMayorM: null,
  diamMenorM: null, largoM: null, codigoDespacho: null, planId: null, plan: null, parcela: null, fechaTala: null,
  diasTrozadoASalida: null, diasTalaASalida: null, fechaGuia: null, placa: null, transportista: null,
  conductor: null, destino: null, conFoto: false, ...p,
});

const TROZAS: TrozaTablero[] = [
  troza({ code: "111-A", estado: "despachada", gtf: "019-0000002", volumenM3: 4.951 }),
  troza({ code: "113-A", estado: "despachada", gtf: "019-0000002", volumenM3: 1.659 }),
  troza({ code: "120-A", estado: "despachada", gtf: "001-0045678", volumenM3: 2 }),
  troza({ code: "130-A<script>alert(1)</script>", estado: "disponible", volumenM3: null, especie: "Cedro <b>x</b>" }),
];

const CUPO: CupoEspecie = {
  clave: "tornillo", especie: "Tornillo", arbolesCensados: 10, arbolesTalados: 3, arbolesAutorizados: null,
  censadoM3: 320, autorizadoM3: 320, cupoM3: 320, fuente: "autorizado", taladoM3: 9.537, restanteM3: 310.463,
  excesoM3: 0, pctUsado: 3, talasSinVolumen: 0, veredicto: "ok",
};

const PLANES: PlanFichaApi[] = [
  { id: "g", isActive: true, alias: null, planType: "PO", planNumber: null, estado: "vigente", vigenciaDesde: null, vigenciaHasta: null, parcelaCorta: null },
  { id: "t", isActive: true, alias: "Tornillo", planType: "PO", planNumber: null, estado: "vigente", parcelaCorta: "PC-12",
    vigenciaDesde: "2026-03-20T00:00:00.000Z", vigenciaHasta: "2028-03-20T00:00:00.000Z" },
];

const datos = (over: Partial<DatosInformePermiso> = {}): DatosInformePermiso => ({
  caratula: null,
  plan: PLANES[1],
  planes: PLANES,
  saldo: saldoDeCupos([CUPO], TROZAS),
  cuadre: cuadrarGuias(TROZAS, [{ gtfNumber: "019-0000002", gtfDate: "2026-08-20", volumenTotalM3: "6.6102", piezasTotal: 2, status: "emitida" }]),
  trozas: TROZAS,
  ahora: AHORA,
  ...over,
});

describe("construirInformePermiso", () => {
  it("trae las cinco secciones y el pie con fecha, regente y titular", () => {
    const { body } = construirInformePermiso(datos());
    for (const s of ["1. Ficha del permiso", "2. Saldo por especie", "3. Cuadre por guía", "4. Trozas por estado", "Lista completa de trozas", "5. Faltantes"]) {
      expect(body).toContain(s);
    }
    expect(body).toContain("Regente forestal");
    expect(body).toContain("miércoles 30/09/2026");
    expect(body).toContain("Titular");
  });

  it("escapa todo dato: un <script> en una troza no llega como etiqueta", () => {
    const { body } = construirInformePermiso(datos());
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<b>x</b>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("sin dato imprime «—», nunca «0»: sin carátula, sin vigencia, troza sin volumen", () => {
    const { body } = construirInformePermiso(datos({ caratula: null, plan: PLANES[0] }));
    expect(body).toMatch(/RUC:<\/span> —/);
    expect(body).toMatch(/Vigencia:<\/span> —/);
    expect(body).not.toMatch(/Vigencia:<\/span> 0/);
    // la troza 130-A no tiene volumen: su celda es «—», no 0,000
    expect(body).toMatch(/130-A[\s\S]*?<td class="num">—<\/td>/);
  });

  it("vigencia y días: Tornillo vence el 20/03/2028 (537 días)", () => {
    const { body } = construirInformePermiso(datos());
    expect(body).toContain("lunes 20/03/2028");
    expect(body).toContain("537 días");
  });

  it("cuadre: 6,6102 vs 6,610 cuadra y se ven los cuatro decimales", () => {
    const { body } = construirInformePermiso(datos());
    // separador según el ICU de la máquina (coma en es-PE completo, punto en small-icu)
    expect(body).toMatch(/6[.,]6102/);
    expect(body).toMatch(/019-0000002[\s\S]*?Cuadra/);
    expect(body).toMatch(/001-0045678[\s\S]*?Citada, sin registrar/);
  });

  it("cuadre sin poder leer las guías no acusa a nadie", () => {
    const { body } = construirInformePermiso(datos({ cuadre: null }));
    expect(body).toContain("el cuadre no se hizo");
    expect(body).not.toContain("Citada, sin registrar");
  });

  it("faltantes: carátula, plan sin vigencia, guía citada sin registrar", () => {
    const f = faltantesDelPermiso(datos(), AHORA);
    expect(f).toContain("No hay carátula del libro.");
    expect(f.some((x) => /sin vigencia/.test(x))).toBe(true);
    expect(f).toContain("Guía 001-0045678 citada en el libro, sin registrar.");
  });
});
