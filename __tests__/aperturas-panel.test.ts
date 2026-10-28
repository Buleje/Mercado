import { describe, expect, it } from "vitest";
import { CLAVE_APERTURA_RE, campoDelDia, campoUltima, resumirAperturas, usoPorPestana } from "@/lib/admin/aperturas-panel";
import { cuandoFue, diaConFecha, filasDeUso } from "@/lib/admin/uso-del-panel-filas";

const HOY = "2026-10-28";
const ULTIMA = Date.UTC(2026, 9, 28, 19, 5); // 14:05 en Lima

describe("resumirAperturas", () => {
  const hash = {
    [campoDelDia("2026-10-28", "camaras")]: "3",
    [campoDelDia("2026-10-22", "camaras")]: "2", // hace 6 días: entra en 7
    [campoDelDia("2026-10-21", "camaras")]: "4", // hace 7: sólo en 30
    [campoDelDia("2026-09-29", "camaras")]: "5", // hace 29: en 30
    [campoDelDia("2026-09-28", "camaras")]: "6", // hace 30: ya no cuenta, se guarda
    [campoDelDia("2026-09-20", "camaras")]: "9", // hace 38: se poda
    [campoDelDia("2026-10-29", "camaras")]: "7", // futuro (reloj corrido): no cuenta
    [campoDelDia("2026-10-28", "finanzas:gastos")]: 1,
    [campoUltima("camaras")]: String(ULTIMA),
    [campoUltima("vieja")]: String(Date.UTC(2026, 7, 1)),
    "basura": "1",
    "d:2026-10-28:../x": "5",
  };

  it("suma 7 y 30 días con hoy incluido", () => {
    const { claves } = resumirAperturas(hash, HOY);
    expect(claves.camaras).toEqual({ d7: 5, d30: 14, ultima: ULTIMA });
    expect(claves["finanzas:gastos"]).toEqual({ d7: 1, d30: 1, ultima: null });
  });

  it("poda lo de 35 días o más (y la «última vez» vieja); ignora campos raros", () => {
    const { claves, viejos, desde } = resumirAperturas(hash, HOY);
    expect(viejos.sort()).toEqual([campoDelDia("2026-09-20", "camaras"), campoUltima("vieja")].sort());
    expect(claves.vieja).toBeUndefined();
    expect(Object.keys(claves).sort()).toEqual(["camaras", "finanzas:gastos"]);
    expect(desde).toBe("2026-09-28");
  });

  it("hash vacío o nulo", () => {
    expect(resumirAperturas(null, HOY)).toEqual({ claves: {}, desde: null, viejos: [] });
  });

  it("usoPorPestana: sólo pestañas (sin vistas) con aperturas", () => {
    const { claves } = resumirAperturas(hash, HOY);
    expect(usoPorPestana({ ...claves, ventas: { d7: 0, d30: 0, ultima: null } })).toEqual({ camaras: 14 });
  });

  it("la regex de claves acepta tab y tab:vista, nada más", () => {
    for (const ok of ["camaras", "ctp-libro-operaciones", "finanzas:gastos", "plata:Bancos.2"]) expect(CLAVE_APERTURA_RE.test(ok)).toBe(true);
    for (const no of ["", "Camaras", "a:b:c", "../x", "a b", "x".repeat(49)]) expect(CLAVE_APERTURA_RE.test(no)).toBe(false);
  });
});

describe("filasDeUso", () => {
  const cats = [
    { id: "inicio", label: "Inicio", tabs: ["vendor-dashboard"] },
    { id: "forestal", label: "Forestal", tabs: ["ctp-libro-operaciones", "loth-libro-operaciones", "oculta"] },
    { id: "otra", label: "Otra", tabs: ["vendor-dashboard"] },
  ];
  const claves = {
    "loth-libro-operaciones": { d7: 2, d30: 9, ultima: 100 },
    "ctp-libro-operaciones": { d7: 1, d30: 20, ultima: 50 },
    "ctp-libro-operaciones:ingresos": { d7: 1, d30: 12, ultima: 300 },
    "ctp-libro-operaciones:saldos": { d7: 0, d30: 4, ultima: 10 },
    oculta: { d7: 9, d30: 99, ultima: 1 },
  };
  const filas = filasDeUso(
    cats,
    claves,
    (t) => t.toUpperCase(),
    (_t, v) => (v === "ingresos" ? "Ingresos" : null),
    (t) => t !== "oculta",
  );

  it("una fila por pestaña visible (sin repetir), de más a menos abierta; las de 0 al final", () => {
    expect(filas.map((f) => f.tab)).toEqual(["ctp-libro-operaciones", "loth-libro-operaciones", "vendor-dashboard"]);
    expect(filas[2]).toMatchObject({ d7: 0, d30: 0, ultima: null, vista: null, categoria: "Inicio" });
  });

  it("la última vez mira también sus vistas; la vista más abierta con su rótulo", () => {
    expect(filas[0]).toMatchObject({ etiqueta: "CTP-LIBRO-OPERACIONES", d30: 20, ultima: 300, vista: { etiqueta: "Ingresos", d30: 12 } });
  });
});

describe("fechas en hora de Lima", () => {
  it("diaConFecha", () => {
    expect(diaConFecha("2026-09-10")).toBe("jueves 10/09");
  });
  it("cuandoFue: hoy, ayer o «jueves 10/09»", () => {
    const ahora = Date.UTC(2026, 9, 29, 2); // 21:00 del 28 en Lima (en UTC ya es 29)
    expect(cuandoFue(ULTIMA, ahora)).toBe("hoy 14:05");
    expect(cuandoFue(ULTIMA - 86_400_000, ahora)).toBe("ayer 14:05");
    expect(cuandoFue(Date.UTC(2026, 8, 10, 15), ahora)).toBe("jueves 10/09");
  });
});
