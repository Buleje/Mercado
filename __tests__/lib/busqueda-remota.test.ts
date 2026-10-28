import { describe, expect, it } from "vitest";
import {
  anexosQueCoinciden, deAnexo, deGuia, deLote, dePermiso, deTrabajadores, deTroza, nivelDeCoincidencia, normalizarConsulta,
  porParecido, variantesDeNumero, veGrupo, type GrupoRemoto,
} from "@/lib/admin/busqueda-remota";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";

describe("la consulta", () => {
  it("normaliza espacios y corta en 80", () => {
    expect(normalizarConsulta("  PLT-2026   032 ")).toBe("PLT-2026 032");
    expect(normalizarConsulta("x".repeat(100))).toHaveLength(80);
    expect(normalizarConsulta(null)).toBe("");
  });

  it("N° de guía: el primer tramo con y sin ceros; un número suelto no pierde sus ceros", () => {
    expect(variantesDeNumero("019-001-0000008")).toEqual(["019-001-0000008", "19-001-0000008"]);
    expect(variantesDeNumero("19-001-0000071")).toEqual(["19-001-0000071", "019-001-0000071"]);
    /* «71» estaría en media lista. */
    expect(variantesDeNumero("0000071")).toEqual(["0000071"]);
    expect(variantesDeNumero("PLT-2026-032")).toEqual(["PLT-2026-032"]);
  });

  it("parecido: igual > empieza o termina > contiene; sin tildes ni mayúsculas", () => {
    expect(nivelDeCoincidencia("19-001-0000071", "0000071")).toBe(2);
    expect(nivelDeCoincidencia("Rosa Huamán", "huaman")).toBe(2);
    expect(nivelDeCoincidencia("85-TOR-D", "85-tor-d")).toBe(3);
    expect(nivelDeCoincidencia("A-0000071-B", "0000071")).toBe(1);
    expect(nivelDeCoincidencia(null, "x")).toBe(0);
    const filas = [{ c: "X-85-TOR-C-1" }, { c: "85-TOR-C" }, { c: "85-TOR-CX" }];
    expect(porParecido(filas, "85-TOR-C", (f) => [f.c]).map((f) => f.c)).toEqual(["85-TOR-C", "85-TOR-CX", "X-85-TOR-C-1"]);
  });
});

describe("qué grupo ve cada rol (el criterio de la ruta del recurso)", () => {
  const tabla: Record<string, GrupoRemoto[]> = {
    admin: ["productos", "clientes", "pedidos", "proveedores", "guias", "trozas", "trabajadores"],
    owner: ["clientes", "guias", "trabajadores"],
    manager: ["clientes", "guias", "trabajadores"],
    almacenero: ["productos", "pedidos", "proveedores", "guias", "anexos", "trozas", "permisos", "lotes", "partes", "trabajadores"],
    cajero: ["productos", "pedidos", "trabajadores"],
  };
  for (const [rol, grupos] of Object.entries(tabla)) {
    it(`${rol} ve ${grupos.join(", ")}`, () => {
      for (const g of grupos) expect(veGrupo(rol as never, g)).toBe(true);
    });
  }
  it("almacenero no ve clientes; cajero no ve aserradero, clientes ni proveedores; analista no ve personal", () => {
    expect(veGrupo("almacenero", "clientes")).toBe(false);
    for (const g of ["clientes", "proveedores", "guias", "anexos", "trozas", "permisos", "lotes", "partes"] as GrupoRemoto[]) expect(veGrupo("cajero", g)).toBe(false);
    expect(veGrupo("analista", "trabajadores")).toBe(false);
    expect(veGrupo("tienda_owner", "guias")).toBe(false);
  });
});

describe("las filas", () => {
  const anexo = (p: Partial<AnexoEmitido>): AnexoEmitido => ({ id: "a", numero: "", gtf: "", fecha: "2026-10-20", empresa: "", totalPiezas: 1, totalM3: 1, ...p }) as AnexoEmitido;

  it("Anexo 04: se encuentra por la GTF, su N° o su permiso; sin registrar lleva a Despacho", () => {
    const lista = [
      anexo({ id: "1", numero: "2-19-0491391", gtf: "19-001-0000071", permiso: "19-SEC/REG-PLT-2025-167" }),
      anexo({ id: "2", numero: "2-19-0491392", gtf: "19-001-0000072" }),
    ];
    expect(anexosQueCoinciden(lista, "0000071").map((a) => a.id)).toEqual(["1"]);
    expect(anexosQueCoinciden(lista, "PLT-2025-167").map((a) => a.id)).toEqual(["1"]);
    expect(anexosQueCoinciden(lista, "0491392").map((a) => a.id)).toEqual(["2"]);
    const fila = deAnexo(lista[0]);
    expect(fila.href).toBe("/admin?tab=ctp-libro-operaciones&vista=despacho");
    expect(fila.badge).toBe("Sin registrar");
    expect(fila.subtitle).toContain("20/10/2026");
    expect(deAnexo({ ...lista[0], despachoIds: ["d1"] }).href).toContain("sub=guias");
  });

  it("guía: ingreso abre su ingreso; del LO-TH a su libro (o a la bandeja del CTP si no hay LO-TH); fecha date-only en UTC", () => {
    const base = { id: "g1", gtfNumber: "19-001-0000071", quien: "Blas", fecha: new Date("2026-10-20T00:00:00Z"), volumenM3: 12.3456, anulada: false };
    const ingreso = deGuia({ ...base, origen: "ingreso" });
    expect(ingreso.href).toContain("vista=ingresos");
    expect(ingreso.href).toContain("ingreso=g1");
    expect(ingreso.subtitle).toBe("Blas · 20/10/2026 · 12.346 m³");
    expect(deGuia({ ...base, origen: "loth" }).href).toBe("/admin?tab=loth-libro-operaciones&vista=gtf&sub=guias&gtf=19-001-0000071");
    const baja = deGuia({ ...base, origen: "loth", anulada: true }).href;
    expect(baja).toContain("sub=bajas");
    expect(baja).toContain("gtf=19-001-0000071");
    expect(deGuia({ ...base, origen: "loth" }, false).href).toBe("/admin?tab=ctp-libro-operaciones&vista=ingresos");
    expect(deGuia({ ...base, origen: "salida" }).href).toContain("vista=despacho&sub=guias");
  });

  it("troza: su estado y su lote", () => {
    const t = deTroza({ id: "t1", codificacion: "85-TOR-D", codigoPlanta: "118", especie: "Tornillo", gtfNumber: "19-001-0000071", loteCodigo: "L-3", estado: "lote" });
    expect(t.title).toBe("85-TOR-D · planta 118");
    expect(t.subtitle).toBe("Tornillo · GTF 19-001-0000071 · lote L-3 · En lote");
    expect(t.href).toContain("troza=t1");
  });

  it("permiso vencido lo dice", () => {
    const p = dePermiso({ id: "c1", codigo: "19-SEC/REG-PLT-2026-032", alias: null, titularNombre: "Blas", tipo: null, vigenciaHasta: new Date("2020-01-01T12:00:00Z"), estado: "vigente" });
    expect(p.subtitle).toContain("venció 01/01/2020");
    expect(p.href).toContain("contrato=c1");
  });

  it("lote de aserrío: abre la historia de ESE lote", () => {
    const l = deLote({ id: "lt1", code: "QA-SEM-1", especie: "Tornillo", status: "abierto", permiso: null, fechaApertura: new Date("2026-10-20T00:00:00Z") });
    expect(l.href).toBe("/admin?tab=ctp-libro-operaciones&vista=lotes&sub=historia&loteAserrio=lt1");
  });

  it("trabajadores: gestión abre la ficha; marcar sólo la asistencia; sin plata", () => {
    const filas = [{ id: "w1", nombre: "Mario Ríos", apodo: "Chato", puesto: "Aserrador", estado: "ACTIVO" }];
    const admin = deTrabajadores(filas, "admin");
    expect(admin[0].title).toBe("Mario Ríos («Chato»)");
    expect(admin[0].subtitle).toBe("Aserrador · Activo");
    expect(admin[0].href).toContain("vista=personal&persona=w1");
    expect(admin[1]).toMatchObject({ sinContar: true, href: "/admin?tab=rrhh&vista=asistencia" });
    const almacenero = deTrabajadores(filas, "almacenero");
    /* La persona va en la URL: la hoja de asistencia resalta su fila. */
    expect(almacenero[0].href).toBe("/admin?tab=rrhh&vista=asistencia&persona=w1");
    expect(almacenero[1].href).toBe("/admin?tab=rrhh&vista=asistencia");
    expect(deTrabajadores([], "admin")).toEqual([]);
  });
});
