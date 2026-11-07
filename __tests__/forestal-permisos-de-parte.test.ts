import { describe, it, expect } from "vitest";
import {
  areaDelPermiso,
  completarPlanDesdeDirectorio,
  camposDelPlanDesdePermiso,
  habilitaPlanDeManejo,
  opcionesEscritas,
  permisosDeParte,
  permisosOfrecibles,
  tipoPermisoDesdePlan,
  tipoPlanDesdePermiso,
} from "@/lib/forestal/permisos-de-parte";
import type { Contrato, TipoContrato } from "@/lib/forestal/contratos";

/**
 * Los permisos de un titular (ADR-425).
 *
 * Los casos NO son inventados: salen de los datos reales del tenant de Blas
 * medidos el 2026-09-21 — 6 permisos, ninguno atado a una ficha, ninguno con
 * área, y el titular escrito distinto en el Directorio y en el libro.
 */

const base: Contrato = {
  id: "c1",
  codigo: "19-SEC/REG-PLT-2021-017",
  codigoNorm: "19-SEC/REG-PLT-2021-017",
  alias: null,
  titularNombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
  titularId: null,
  titularDoc: null,
  titularDocTipo: null,
  resolucionNumero: null,
  resolucionFecha: null,
  tipo: "REG-PLT",
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
  createdAt: "2026-01-01T00:00:00.000Z",
};

const con = (cambios: Partial<Contrato>): Contrato => ({ ...base, ...cambios });

describe("permisosDeParte", () => {
  it("separa los atados por titularId de los candidatos por nombre", () => {
    const atado = con({ id: "a", codigo: "PER-FMC-1", titularId: "parte-1", titularNombre: "CCNN X" });
    const suelto = con({ id: "b" });
    const r = permisosDeParte({ id: "parte-1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" }, [atado, suelto]);
    expect(r.suyos.map((c) => c.id)).toEqual(["a"]);
    expect(r.candidatos.map((c) => c.id)).toEqual(["b"]);
  });

  it("reconoce al titular aunque el libro lo escriba con NATIVA de más (caso real de Chivis)", () => {
    const r = permisosDeParte({ id: "p", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" }, [base]);
    expect(r.candidatos).toHaveLength(1);
  });

  it("no ofrece permisos que ya son de OTRA ficha", () => {
    const deOtro = con({ id: "z", titularId: "otra-parte" });
    const r = permisosDeParte({ id: "p", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" }, [deOtro]);
    expect(r.suyos).toHaveLength(0);
    expect(r.candidatos).toHaveLength(0);
  });

  it("ignora los dados de baja: un permiso inactivo no declara un plan nuevo", () => {
    const bajado = con({ id: "x", isActive: false, titularId: "p" });
    const r = permisosDeParte({ id: "p", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" }, [bajado]);
    expect(permisosOfrecibles(r)).toHaveLength(0);
  });

  it("una ficha sin id (alta en curso) igual ve candidatos por nombre", () => {
    const r = permisosDeParte({ nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS" }, [base]);
    expect(r.suyos).toHaveLength(0);
    expect(r.candidatos).toHaveLength(1);
  });

  it("no empareja a cualquiera: otro titular no es candidato", () => {
    const r = permisosDeParte({ id: "p", nombre: "QUINCHUNLLA PEREZ, NELLY" }, [base]);
    expect(r.candidatos).toHaveLength(0);
  });

  it("los suyos van primero al ofrecerlos", () => {
    const atado = con({ id: "a", titularId: "p", titularNombre: "otro nombre" });
    const r = permisosDeParte({ id: "p", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" }, [base, atado]);
    expect(permisosOfrecibles(r).map((c) => c.id)).toEqual(["a", "c1"]);
  });
});

describe("qué documento de gestión le toca a cada papel", () => {
  it("mapea los títulos habilitantes a su documento por norma", () => {
    expect(tipoPlanDesdePermiso("PER-FMC")).toBe("DEMA"); // comunidad nativa
    expect(tipoPlanDesdePermiso("PER-FMP")).toBe("PMFI"); // predio privado
    expect(tipoPlanDesdePermiso("REG-PLT")).toBe("PLANTACION");
    expect(tipoPlanDesdePermiso("CONCESION")).toBe("PO");
  });

  it("no inventa documento para los papeles que no lo determinan", () => {
    expect(tipoPlanDesdePermiso("CONTRATO")).toBeNull();
    expect(tipoPlanDesdePermiso("otro")).toBeNull();
    expect(tipoPlanDesdePermiso(null)).toBeNull();
  });

  it("va y vuelve sin cambiar de papel", () => {
    for (const t of ["PER-FMC", "PER-FMP", "REG-PLT"] as TipoContrato[]) {
      expect(tipoPermisoDesdePlan(tipoPlanDesdePermiso(t)!)).toBe(t);
    }
  });

  it("un papel comercial no habilita a aprovechar bosque", () => {
    expect(habilitaPlanDeManejo(con({ tipo: "CONTRATO" }))).toBe(false);
    expect(habilitaPlanDeManejo(con({ tipo: "PER-FMC" }))).toBe(true);
    // Sin tipo cargado se deja pasar: no saber no es saber que no sirve.
    expect(habilitaPlanDeManejo(con({ tipo: null }))).toBe(true);
  });
});

describe("camposDelPlanDesdePermiso", () => {
  it("el código del permiso ES el título habilitante que se declara", () => {
    expect(camposDelPlanDesdePermiso(base).tituloHabilitante).toBe("19-SEC/REG-PLT-2021-017");
  });

  it("recorta las fechas a lo que come un input date", () => {
    const c = camposDelPlanDesdePermiso(con({ resolucionFecha: "2021-03-04T00:00:00.000Z", vigenciaHasta: "2031-03-04T00:00:00.000Z" }));
    expect(c.resolucionDate).toBe("2021-03-04");
    expect(c.vigenciaHasta).toBe("2031-03-04");
  });

  it("un área sin cargar queda vacía, nunca en cero", () => {
    expect(camposDelPlanDesdePermiso(base).areaHa).toBe("");
    expect(camposDelPlanDesdePermiso(con({ areaHa: 0.76 })).areaHa).toBe("0.76");
  });
});

describe("areaDelPermiso", () => {
  it("dice null cuando nadie la cargó — que es lo que pasa en 6 de 6 permisos reales", () => {
    expect(areaDelPermiso(base)).toBeNull();
  });

  it("muestra hectáreas con dos decimales", () => {
    expect(areaDelPermiso(con({ areaHa: 1200 }))).toBe("1,200.00 ha");
  });
});

describe("opcionesEscritas", () => {
  it("junta las grafías iguales sin mirar mayúsculas ni tildes, y ordena por uso", () => {
    const r = opcionesEscritas(["ATFFS Selva Central", "ATFFS SELVA CENTRAL", "GERFOR Ucayali", "atffs selva central"]);
    expect(r[0]).toBe("ATFFS Selva Central");
    expect(r).toHaveLength(2);
  });

  it("NO fusiona la autoridad con su sede: son dos datos distintos", () => {
    const r = opcionesEscritas(["ATFFS SELVA CENTRAL", "ATFFS SELVA CENTRAL - SEDE PUERTO BERMUDEZ"]);
    expect(r).toHaveLength(2);
  });

  it("descarta vacíos y nulos en vez de ofrecer una opción en blanco", () => {
    expect(opcionesEscritas([null, undefined, "   ", "GERFOR Ucayali"])).toEqual(["GERFOR Ucayali"]);
  });
});

describe("completarPlanDesdeDirectorio", () => {
  const vacio = {
    planType: "PO" as const,
    titularName: "",
    representanteLegal: "",
    tituloHabilitante: "",
    resolucionNumber: "",
    resolucionDate: "",
    arffs: "",
    region: "Ucayali",
    areaHa: "",
    vigenciaDesde: "",
    vigenciaHasta: "",
  };
  const opts = { tipoTocado: false, regionPorDefecto: "Ucayali" };
  const ccnn = { nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" };

  it("cuenta cada campo UNA vez aunque se la llame dos veces (React invoca los updaters dos veces en dev)", () => {
    const permiso = con({ resolucionNumero: "RDF 45", areaHa: 12.5 });
    const a = completarPlanDesdeDirectorio(vacio, ccnn, permiso, opts);
    const b = completarPlanDesdeDirectorio(vacio, ccnn, permiso, opts);
    expect(a.completados).toEqual(["título habilitante", "N° de resolución", "área de manejo"]);
    expect(b.completados).toEqual(a.completados);
  });

  it("no pisa lo que alguien ya escribió, y no lo cuenta como completado", () => {
    const previo = { ...vacio, tituloHabilitante: "ESCRITO A MANO" };
    const r = completarPlanDesdeDirectorio(previo, ccnn, con({}), opts);
    expect(r.campos.tituloHabilitante).toBe("ESCRITO A MANO");
    expect(r.completados).not.toContain("título habilitante");
  });

  it("el permiso gana sobre la ficha: es EL papel de este plan", () => {
    const fichaConTitulo = { ...ccnn, tituloHabilitante: "EL VIEJO DE LA FICHA" };
    const r = completarPlanDesdeDirectorio(vacio, fichaConTitulo, con({ codigo: "PER-FMC-2024-008" }), opts);
    expect(r.campos.tituloHabilitante).toBe("EL VIEJO DE LA FICHA");
    // La ficha llenó el hueco primero; el permiso no lo pisa, pero SÍ completa
    // lo que la ficha no tenía.
    expect(r.campos.titularName).toBe(ccnn.nombre);
  });

  it("la región por defecto no es una elección: el papel la puede completar", () => {
    const r = completarPlanDesdeDirectorio(vacio, ccnn, con({ region: "Pasco" }), opts);
    expect(r.campos.region).toBe("Pasco");
    expect(r.completados).toContain("región");
  });

  it("una región elegida a mano NO se pisa", () => {
    const r = completarPlanDesdeDirectorio({ ...vacio, region: "Loreto" }, ccnn, con({ region: "Pasco" }), opts);
    expect(r.campos.region).toBe("Loreto");
  });

  it("propone el documento que le toca al papel, salvo que ya lo hayan elegido", () => {
    expect(completarPlanDesdeDirectorio(vacio, ccnn, con({ tipo: "PER-FMC" }), opts).campos.planType).toBe("DEMA");
    const tocado = completarPlanDesdeDirectorio(vacio, ccnn, con({ tipo: "PER-FMC" }), { ...opts, tipoTocado: true });
    expect(tocado.campos.planType).toBe("PO");
  });

  it("sin permiso trae sólo la ficha y no anuncia nada", () => {
    const r = completarPlanDesdeDirectorio(vacio, { ...ccnn, arffs: "ATFFS Selva Central" }, null, opts);
    expect(r.campos.arffs).toBe("ATFFS Selva Central");
    expect(r.completados).toEqual([]);
  });
});
