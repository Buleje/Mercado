import { describe, expect, it } from "vitest";
import {
  emptyCtpFicha,
  tituloDeGuia,
  tituloDesdePermiso,
  type CtpFicha,
  type PermisoDeGuia,
} from "@/lib/forestal/ctp-ficha-types";
import { cuerpoGtfOficial } from "@/lib/forestal/ctp-gtf-formato";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import { TIPOS_CONTRATO, type Contrato, type TipoContrato } from "@/lib/forestal/contratos";
import { titulosElegibles } from "@/lib/forestal/titulos-de-la-guia";

/**
 * El papel imprime el título que se eligió, venga de donde venga (ADR-421/425).
 *
 * ## El bug que esto cierra
 *
 * El `<select>` de la guía pasó a ofrecer DOS fuentes —los `titulos[]` de la
 * Ficha del CTP y los permisos cargados (`ForestContrato`)—, pero el papel
 * seguía resolviendo los casilleros con `tituloDeGuia(ficha, elegido)`, que sólo
 * mira la Ficha. Medido el 2026-09-21 por SQL en los dos tenants: la Ficha de QA
 * declaraba 1 título y los permisos eran 6 (en el tenant de Blas, 6 permisos
 * `PER-FMP`/`REG-PLT`). Elegir cualquiera de los otros cinco imprimía el (6) con
 * el código y los casilleros **(5) origen, (8) resolución y (9) plan de manejo
 * en blanco** — y ese es el papel que mira un puesto de control.
 *
 * ## Lo que NO se arregla, a propósito
 *
 * Medido el mismo día: **6 de 6 permisos no tienen `resolucionNumero`**. El (8)
 * de esos sigue saliendo en blanco, para llenarlo a mano. Completar el casillero
 * con la resolución de otro papel sería declarar un origen falso en un documento
 * que es declaración jurada (Ley 29763 art. 124).
 */

const permiso = (p: Partial<PermisoDeGuia> = {}): PermisoDeGuia => ({
  codigo: "19-SEC/PER-FMC-2024-008",
  tipo: "PER-FMC",
  resolucionNumero: null,
  vigenciaHasta: null,
  isActive: true,
  ...p,
});

const ficha = (titulos: CtpFicha["titulos"]): CtpFicha => ({ ...emptyCtpFicha(), titulos });

const soloEnLaFicha = ficha([
  { tipo: "concesion", codigo: "CONC-25-001", resolucion: "R.A. 111", planManejo: "PGMF", vencimiento: "" },
]);

describe("tituloDeGuia — el elegido puede ser un permiso, no sólo un título de la Ficha", () => {
  it("si el elegido ESTÁ en la Ficha, gana la Ficha (es la fuente declarada)", () => {
    // El mismo código cargado en los dos lados, con datos distintos: el papel
    // declara lo que dice la Ficha, que es la que el libro publica.
    const t = tituloDeGuia(soloEnLaFicha, "CONC-25-001", [
      permiso({ codigo: "CONC-25-001", tipo: "CONCESION", resolucionNumero: "R.A. 999" }),
    ]);
    expect(t?.resolucion).toBe("R.A. 111");
    expect(t?.planManejo).toBe("PGMF");
    expect(t?.tipo).toBe("concesion");
  });

  it("si el elegido SÓLO es un permiso, salen su código, su resolución y su plan", () => {
    const t = tituloDeGuia(soloEnLaFicha, "19-SEC/PER-FMC-2024-008", [
      permiso({ resolucionNumero: "R.D.R. N° 0123-2024-GRU", vigenciaHasta: "2027-01-14T05:00:00.000Z" }),
    ]);
    expect(t?.codigo).toBe("19-SEC/PER-FMC-2024-008");
    expect(t?.resolucion).toBe("R.D.R. N° 0123-2024-GRU");   // (8)
    expect(t?.planManejo).toBe("Declaración de Manejo (DEMA)"); // (9)
    expect(t?.tipo).toBe("permiso");                          // (5)
    expect(t?.vencimiento).toBe("2027-01-14");
  });

  it("permiso SIN resolución cargada → el (8) queda en blanco, nunca el de otro título", () => {
    // El caso real: 6 de 6 permisos de los dos tenants no tienen resolución.
    const t = tituloDeGuia(soloEnLaFicha, "19-SEC/PER-FMC-2024-008", [permiso()]);
    expect(t?.resolucion).toBe("");
    expect(t?.resolucion).not.toBe("R.A. 111"); // la de la Ficha NO se presta
    expect(t?.planManejo).toBe("Declaración de Manejo (DEMA)");
  });

  it("un tipo que no decide el origen no cruza ninguna casilla del (5)", () => {
    // «CONTRATO» es una compraventa: no habilita a nadie a talar. Y un permiso
    // sin tipo cargado tampoco dice de dónde salió la madera.
    expect(tituloDesdePermiso(permiso({ tipo: "CONTRATO" })).tipo).toBe("");
    expect(tituloDesdePermiso(permiso({ tipo: "otro" })).tipo).toBe("");
    expect(tituloDesdePermiso(permiso({ tipo: null })).tipo).toBe("");
  });

  it("el permiso cargado con el nombre del DOCUMENTO (DEMA/PMFI/PO) igual resuelve", () => {
    expect(tituloDesdePermiso(permiso({ tipo: "DEMA" })).tipo).toBe("permiso");
    expect(tituloDesdePermiso(permiso({ tipo: "PMFI" })).tipo).toBe("permiso");
    expect(tituloDesdePermiso(permiso({ tipo: "PO" })).tipo).toBe("concesion");
    expect(tituloDesdePermiso(permiso({ tipo: "REG-PLT" })).tipo).toBe("plantacion");
  });

  it("el código se compara normalizado, como en el selector", () => {
    const t = tituloDeGuia(soloEnLaFicha, "  19-sec/per-fmc-2024-008 ", [
      permiso({ resolucionNumero: "R-7" }),
    ]);
    expect(t?.resolucion).toBe("R-7");
    // Se imprime la grafía del permiso cargado, no lo que se tipeó.
    expect(t?.codigo).toBe("19-SEC/PER-FMC-2024-008");
  });

  it("un código que no está en ninguna de las dos listas se imprime con (8) y (9) vacíos", () => {
    const t = tituloDeGuia(soloEnLaFicha, "OTRO-999", [permiso({ resolucionNumero: "R-7" })]);
    expect(t?.codigo).toBe("OTRO-999");
    expect(t?.resolucion).toBe("");
    expect(t?.planManejo).toBe("");
    expect(t?.tipo).toBe("");
  });

  it("entre dos filas con el mismo código gana la viva (un código se puede recargar tras una baja)", () => {
    const t = tituloDeGuia(soloEnLaFicha, "19-SEC/PER-FMC-2024-008", [
      permiso({ isActive: false, resolucionNumero: "R-VIEJA" }),
      permiso({ isActive: true, resolucionNumero: "R-NUEVA" }),
    ]);
    expect(t?.resolucion).toBe("R-NUEVA");
  });

  it("un permiso dado de baja igual imprime lo suyo: la guía ya se emitió con ese papel", () => {
    // El selector no lo OFRECE (elegir es otra cosa), pero una guía vieja que lo
    // declara tiene que seguir imprimiendo lo que declaró.
    const t = tituloDeGuia(soloEnLaFicha, "19-SEC/PER-FMC-2024-008", [
      permiso({ isActive: false, resolucionNumero: "R-VIEJA" }),
    ]);
    expect(t?.resolucion).toBe("R-VIEJA");
  });

  // ── Regresión: sin la lista, todo sigue exactamente como estaba ───────────
  it("sin elegido cae al predeterminado de la Ficha, con permisos o sin ellos", () => {
    const f = ficha([
      { tipo: "concesion", codigo: "CONC-25-001", resolucion: "R.A. 111", planManejo: "PGMF", vencimiento: "" },
      { tipo: "permiso", codigo: "PER-2", resolucion: "R.A. 222", planManejo: "DEMA", vencimiento: "" },
    ]);
    expect(tituloDeGuia(f)?.codigo).toBe("CONC-25-001");
    expect(tituloDeGuia(f, "", [permiso()])?.codigo).toBe("CONC-25-001");
    expect(tituloDeGuia(f, null, [permiso()])?.codigo).toBe("CONC-25-001");
    expect(tituloDeGuia(ficha([]), null, [permiso()])).toBeNull();
    expect(tituloDeGuia(null, null, [permiso()])).toBeNull();
  });

  it("sin pasar permisos, un código que no está en la Ficha se comporta como antes", () => {
    const t = tituloDeGuia(soloEnLaFicha, "19-SEC/PER-FMC-2024-008");
    expect(t?.codigo).toBe("19-SEC/PER-FMC-2024-008");
    expect(t?.resolucion).toBe("");
    expect(t?.planManejo).toBe("");
  });
});

/**
 * El (9) del papel y el del `<select>` salen de dos funciones distintas
 * (`ctp-ficha-types` imprime, `titulos-de-la-guia` ofrece). Este test las
 * compara para los nueve tipos: si una cambia la redacción, la otra se entera
 * acá y no en un puesto de control.
 */
describe("el papel escribe el (9) igual que el select de la guía", () => {
  const contrato = (tipo: TipoContrato): Contrato => ({
    id: `c-${tipo}`,
    codigo: `COD-${tipo}`,
    codigoNorm: `COD-${tipo}`.toUpperCase(),
    alias: null,
    titularNombre: "CC.NN. Santa Rosa",
    titularId: null,
    titularDoc: null,
    titularDocTipo: null,
    resolucionNumero: null,
    resolucionFecha: null,
    tipo,
    arffs: null,
    region: null,
    provincia: null,
    distrito: null,
    areaHa: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    estado: "vigente",
    planId: null,
    notas: null,
    isActive: true,
    createdAt: "2026-09-21T00:00:00.000Z",
  });

  it.each(TIPOS_CONTRATO)("%s dice lo mismo en la pantalla y en el papel", (tipo) => {
    const c = contrato(tipo);
    const enElSelect = titulosElegibles([], [c]).permisos[0];
    const enElPapel = tituloDesdePermiso(c);
    expect(enElPapel.planManejo).toBe(enElSelect.planManejo);
    expect(enElPapel.codigo).toBe(enElSelect.codigo);
  });
});

describe("el HTML impreso sale con los casilleros del permiso llenos", () => {
  const base = {
    ficha: { ...soloEnLaFicha, razonSocial: "Maderera San Martín S.A.C." },
    lineas: [],
    numeroGtf: "019-0000004",
    fechaExpedicion: "2026-09-21",
    listasTrozas: "",
    gtfOrigen: "",
  };
  const conTitulo = (codigo: string, permisos?: PermisoDeGuia[]) =>
    cuerpoGtfOficial({ ...base, datos: { ...gtfDatosVacio(), titulos: [codigo] }, permisos });

  it("(6) código, (8) resolución y (9) plan de manejo del permiso elegido", () => {
    const html = conTitulo("19-SEC/PER-FMC-2024-008", [
      permiso({ resolucionNumero: "R.D.R. N° 0123-2024-GRU" }),
    ]);
    expect(html).toContain("19-SEC/PER-FMC-2024-008");
    expect(html).toContain("R.D.R. N° 0123-2024-GRU");
    expect(html).toContain("Declaración de Manejo (DEMA)");
  });

  it("(5) cruza la casilla «Permiso», una sola vez", () => {
    const html = conTitulo("19-SEC/PER-FMC-2024-008", [permiso()]);
    expect(html.match(/>X</g) ?? []).toHaveLength(1);
    expect(html).toMatch(/Permiso<\/span><span class="bx">X/);
  });

  it("sin resolución cargada, el (8) va en blanco y NO toma la de la Ficha", () => {
    const html = conTitulo("19-SEC/PER-FMC-2024-008", [permiso()]);
    expect(html).toContain("(8)");
    expect(html).not.toContain("R.A. 111"); // la resolución del título de la Ficha
    expect(html).not.toContain("<b>—</b>"); // un casillero vacío no se rellena
  });

  it("sin la lista de permisos el papel sale como salía: (8) y (9) en blanco", () => {
    const html = conTitulo("19-SEC/PER-FMC-2024-008");
    expect(html).toContain("19-SEC/PER-FMC-2024-008");
    expect(html).not.toContain("Declaración de Manejo (DEMA)");
    expect(html.match(/>X</g)).toBeNull();
  });
});
