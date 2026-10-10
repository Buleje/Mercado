/**
 * La pantalla de «Extracción» del Libro TH (ADR-454) contra la tabla REAL de
 * Blas medida el 29-09 (plan 19-SEC/REG-PLT-2025-096, 8 especies, 65 árboles)
 * más el plan de prueba PO-2026-001 (Tornillo 6,1988 m³ con 320 autorizados).
 *
 * El fixture vive SÓLO acá: la pantalla consume la ruta. Son las cifras de
 * ANTES del ADR-455 (10 % de semilleros en la plantación: base 400,519); la
 * pantalla no calcula, así que sirven igual para probar cómo las muestra.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  AvisoExtraccion,
  ExtraccionResponse,
  FilaExtraccion,
  PermisoExtraccion,
} from "@/lib/forestal/loth-extraccion-tipos";
import { resolveCtpPeriod } from "@/lib/forestal/ctp-period";
import {
  diaLocal,
  leerExtraccion,
  nombreCorto,
  ordenarAvisos,
  paramsDeExtraccion,
  tonoDeAvance,
  tonoDeSaldo,
  tramosDe,
  vistaDeTabla,
} from "@/components/admin/forestal/loth-extraccion-shared";
import { hojasDeExtraccion, nombreDeArchivo } from "@/components/admin/forestal/loth-extraccion-excel";
import LothExtraccionTabla from "@/components/admin/forestal/loth-extraccion-tabla";
import { CeldasDeFila } from "@/components/admin/forestal/loth-extraccion-celdas";

// ─── Fixture: la tabla del ADR-454 §2 ────────────────────────────────────────

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const suma = (m3: number, n: number) => ({ m3, n, sinVolumen: 0 });

interface Medida {
  censado: number;
  censados: number;
  semPoa: number;
  aprov: number;
  aprovN: number;
  talado?: number;
  taladoN?: number;
  trozado?: number;
  trozas?: number;
  autorizado?: number | null;
}

function fila(clave: string, etiqueta: string, m: Medida): FilaExtraccion {
  const talado = m.talado ?? 0;
  const trozado = m.trozado ?? 0;
  const base = m.autorizado ?? m.aprov;
  const pct = base > 0 ? (talado / base) * 100 : null;
  const saldo = (op: number) => ({ m3: r4(m.aprov - op), pct: m.aprov > 0 ? (op / m.aprov) * 100 : null, nivel: "ok" as const });
  return {
    clave,
    etiqueta,
    cites: false,
    fueraDelPlan: false,
    censo: {
      censadoM3: m.censado,
      censados: m.censados,
      semillerosRegente: 0,
      semillerosPoa: m.semPoa,
      semillerosM3: r4(m.censado - m.aprov),
      excluidos: 0,
      excluidosM3: 0,
      aprovechableM3: m.aprov,
      aprovechables: m.aprovN,
      enPieAprovechables: m.aprovN - (m.taladoN ?? 0),
      autorizadoM3: m.autorizado ?? null,
      arbolesAutorizados: null,
    },
    talado: suma(talado, m.taladoN ?? 0),
    trozado: { ...suma(trozado, m.trozas ?? 0), arboles: m.trozas ?? 0 },
    despachado: suma(0, 0),
    consumidoTh: suma(0, 0),
    enElMonte: suma(trozado, m.trozas ?? 0),
    taladosSinTrozar: suma(r4(talado - trozado), 0),
    recibido: { ...suma(0, 0), m3Guia: 0 },
    aserrado: suma(0, 0),
    saldo: { tala: saldo(talado), trozado: saldo(trozado), despacho: saldo(0) },
    movilizadoM3: 0,
    saldoAutorizado: m.autorizado != null ? { m3: m.autorizado, pct: 0, nivel: "ok" } : null,
    tope: { base: m.autorizado != null ? "autorizado" : "censo", m3: base },
    avance: { m3: talado, pct, nivel: "ok" },
  };
}

const BLAS = [
  fila("copaiba", "Copaiba", { censado: 126.922, censados: 12, semPoa: 2, aprov: 91.768, aprovN: 10, talado: 10.3697, taladoN: 1, trozado: 4.951, trozas: 1 }),
  fila("lupuna", "Lupuna", { censado: 92.666, censados: 4, semPoa: 1, aprov: 50.934, aprovN: 3, talado: 15.5863, taladoN: 1 }),
  fila("catahua", "Catahua", { censado: 89.894, censados: 6, semPoa: 1, aprov: 71.699, aprovN: 5 }),
  fila("mashonaste", "Mashonaste", { censado: 80.233, censados: 13, semPoa: 2, aprov: 62.54, aprovN: 11, talado: 2.8368, taladoN: 1 }),
  fila("sapotillo", "Sapotillo", { censado: 72.397, censados: 16, semPoa: 2, aprov: 58.805, aprovN: 14, talado: 4.1418, taladoN: 1, trozado: 1.6592, trozas: 1 }),
  fila("aguanomasha", "Aguanomasha", { censado: 51.843, censados: 8, semPoa: 1, aprov: 42.527, aprovN: 7 }),
  fila("congona", "Congona", { censado: 31.189, censados: 3, semPoa: 1, aprov: 13.178, aprovN: 2 }),
  fila("quinilla", "Quinilla", { censado: 18.257, censados: 3, semPoa: 1, aprov: 9.068, aprovN: 2 }),
];
const TOTAL_096 = fila("*", "Total", { censado: 563.401, censados: 65, semPoa: 11, aprov: 400.519, aprovN: 54, talado: 32.9346, taladoN: 4, trozado: 6.6102, trozas: 2 });
const TORNILLO = fila("tornillo", "Tornillo", { censado: 6.1988, censados: 2, semPoa: 0, aprov: 6.1988, aprovN: 2, autorizado: 320 });
const TOTAL = fila("*", "Total", { censado: 569.5998, censados: 67, semPoa: 11, aprov: 406.7178, aprovN: 56, talado: 32.9346, taladoN: 4, trozado: 6.6102, trozas: 2 });

function permiso(planId: string, planNumber: string, titular: string, total: FilaExtraccion, especies: FilaExtraccion[]): PermisoExtraccion {
  return {
    planId,
    planNumber,
    planType: null,
    titular,
    alias: null,
    estado: "vigente",
    vigenciaDesde: null,
    vigenciaHasta: null,
    permiso: null,
    poa: { semillerosPct: 10, configurado: false, semillerosRegente: 0, plantacion: false },
    total,
    especies,
    arboles: { porEtapa: { en_pie: 61, talado: 2, trozado: 2 }, conAviso: 0, avisos: {} },
  };
}

const P096 = permiso("plan-096", "19-SEC/REG-PLT-2025-096", "CCNN San Luis de Chinchiguani", TOTAL_096, BLAS);
const P001 = permiso("plan-001", "PO-2026-001", "Maderera Amazonica SAC", TORNILLO, [TORNILLO]);

const aviso = (tipo: AvisoExtraccion["tipo"], nivel: AvisoExtraccion["nivel"], cifraM3: number | null): AvisoExtraccion => ({
  tipo,
  nivel,
  planId: "plan-096",
  especie: null,
  texto: tipo,
  cifraM3,
});

function respuesta(planId: string | null): ExtraccionResponse {
  const permisos = planId ? [P096] : [P096, P001];
  return {
    generadoEn: "2026-09-29T12:00:00.000Z",
    alcance: { planId, contratoId: null },
    permisos,
    total: planId ? TOTAL_096 : TOTAL,
    especies: planId ? BLAS : [...BLAS, TORNILLO],
    periodo: { desde: "2026-09-01", hasta: "2026-09-29", talado: suma(32.9346, 4), trozado: suma(6.6102, 2), despachado: suma(0, 0), diasConActividad: 1 },
    anterior: null,
    semanas: [],
    kpis: {
      extraido: { pct: 8.22, taladoM3: 32.9346, baseM3: 400.519, plazoPct: null },
      porTalar: { m3: 367.5844, arbolesEnPie: 50, ptAserrableRef: 0 },
      ritmoSemanal: { m3: null, anteriorM3: null, variacionPct: null, motivoSinDato: "1 día con tala" },
      agotamiento: { fecha: null, dias: null, vigenciaHasta: null, llegaAlCierre: null, motivoSinDato: "sin ritmo" },
      trozasEnElMonte: { n: 2, m3: 6.6102, diasMasVieja: 3 },
      llegoAPlanta: { pct: null, recibidas: 0, despachadas: 0 },
    },
    embudo: [],
    avisos: [
      aviso("talados_sin_trozar", "info", 18.4231),
      aviso("semilleros_sistema_vs_regente", "warning", 162.882),
      aviso("autorizado_sin_respaldo", "error", 313.8012),
    ],
    limites: { arbolesLeidos: 67, lineasLeidas: 6, truncado: false },
  };
}

// ─── Pruebas ─────────────────────────────────────────────────────────────────

describe("vistaDeTabla", () => {
  it("«Todos»: una fila por permiso y el pie es el total del servidor", () => {
    const v = vistaDeTabla(respuesta(null), null);
    expect(v.modo).toBe("permisos");
    expect(v.filas.map((f) => f.etiqueta)).toEqual(["19-SEC/REG-PLT-2025-096", "PO-2026-001"]);
    expect(v.filas[0]!.hijos).toHaveLength(8);
    expect(v.pie?.etiqueta).toBe("Total · 2 permisos");
    expect(v.pie?.fila.censo.aprovechableM3).toBe(406.7178);
  });

  it("con una especie, cada permiso muestra SU fila y el pie es la especie en todo el alcance", () => {
    const v = vistaDeTabla(respuesta(null), "copaiba");
    expect(v.filas).toHaveLength(1);
    expect(v.filas[0]!.fila.censo.aprovechableM3).toBe(91.768);
    expect(v.pie?.etiqueta).toBe("Total · Copaiba");
  });

  it("un permiso: una fila por especie, y las especies cierran con el total", () => {
    const v = vistaDeTabla(respuesta("plan-096"), null);
    expect(v.modo).toBe("especies");
    expect(v.filas).toHaveLength(8);
    const sumaAprov = v.filas.reduce((a, f) => a + f.fila.censo.aprovechableM3, 0);
    expect(r4(sumaAprov)).toBe(400.519);
    expect(r4(v.filas.reduce((a, f) => a + f.fila.talado.m3, 0))).toBe(32.9346);
  });
});

describe("tramosDe (de punta a punta)", () => {
  it("los tramos no se pisan: suman lo aprobado cuando no se midió de más", () => {
    for (const f of [...BLAS, TOTAL_096]) {
      const t = tramosDe(f.etiqueta, f.clave, f);
      const sumaTramos = t.despachado + t.consumido + t.monte + t.sinTrozar + t.porTalar;
      expect(r4(sumaTramos)).toBe(r4(Math.max(f.censo.aprovechableM3, f.talado.m3)));
    }
  });

  it("una tala medida por encima del censo no deja «por talar» negativo", () => {
    const main = fila("tornillo", "Tornillo", { censado: 4.2474, censados: 1, semPoa: 0, aprov: 4.2474, aprovN: 1, talado: 5.003, taladoN: 1, trozado: 4.887, trozas: 4 });
    const t = tramosDe("PO 12", "p", main);
    expect(t.porTalar).toBe(0);
    expect(r4(t.sinTrozar)).toBe(0.116);
  });
});

describe("tono", () => {
  it("saldo negativo contra el censo = ámbar, nunca rojo", () => {
    expect(tonoDeSaldo({ m3: -0.7556, pct: 117.8, nivel: "exceso" })).toBe("atencion");
  });
  it("el rojo es sólo pasar lo autorizado", () => {
    expect(tonoDeAvance({ m3: 81, pct: 101, nivel: "exceso" }, "autorizado")).toBe("error");
    expect(tonoDeAvance({ m3: 5, pct: 117, nivel: "exceso" }, "censo")).toBe("atencion");
  });
});

describe("paramsDeExtraccion", () => {
  it("«Todo el histórico» no manda fechas", () => {
    expect(paramsDeExtraccion(null, resolveCtpPeriod("todo")).toString()).toBe("");
  });
  it("el mes en curso corta en hoy y pide el mes anterior entero", () => {
    const p = resolveCtpPeriod("mes-actual", undefined, new Date(2026, 8, 29, 20, 0));
    const q = paramsDeExtraccion("plan-096", p, "2026-09-29");
    expect(q.get("planId")).toBe("plan-096");
    expect(q.get("desde")).toBe("2026-09-01");
    expect(q.get("hasta")).toBe("2026-09-29");
    expect(q.get("antDesde")).toBe("2026-08-01");
    expect(q.get("antHasta")).toBe("2026-08-31");
  });
  it("diaLocal lee el día que eligió la persona, no el de otra zona", () => {
    expect(diaLocal(new Date(2026, 8, 1, 0, 0).toISOString())).toBe("2026-09-01");
    expect(diaLocal(new Date(2026, 8, 30, 23, 59, 59, 999).toISOString())).toBe("2026-09-30");
  });
});

describe("respuesta, avisos y Excel", () => {
  it("acepta el cuerpo directo o envuelto, y rechaza lo que no se parece", () => {
    const d = respuesta(null);
    expect(leerExtraccion(d)).toBe(d);
    expect(leerExtraccion({ extraccion: d })).toBe(d);
    expect(leerExtraccion({ error: "not_found" })).toBeNull();
  });
  it("avisos: rojo primero, después ámbar, al final lo informativo", () => {
    expect(ordenarAvisos(respuesta(null).avisos).map((a) => a.nivel)).toEqual(["error", "warning", "info"]);
  });
  it("Excel: permisos + TOTAL, permiso × especie, semanas y avisos", () => {
    const hojas = hojasDeExtraccion(respuesta(null));
    expect(hojas.map((h) => h.nombre)).toEqual(["Por permiso", "Por especie", "Por semana", "Avisos"]);
    expect(hojas[0]!.filas).toHaveLength(3);
    expect(hojas[0]!.filas[2]).toMatchObject({ Permiso: "TOTAL", "Aprobado según censo m³": 406.7178 });
    expect(hojas[1]!.filas).toHaveLength(9);
    expect(nombreDeArchivo("19-SEC/REG-PLT-2025-096", "2026-09-29")).toBe("extraccion-libro-th-19-SEC-REG-PLT-2025-096-2026-09-29");
  });
});

describe("<LothExtraccionTabla>", () => {
  it("abre un permiso en sus especies y el pie dice el total del servidor", () => {
    render(<LothExtraccionTabla datos={respuesta(null)} especie={null} onEspecie={() => {}} />);
    const tabla = screen.getByRole("table");
    const pie = tabla.querySelector("tfoot")!;
    expect(within(pie as HTMLElement).getByText("Total · 2 permisos")).toBeTruthy();
    // Aprobado y saldo de despacho (sin despachos) dicen lo mismo: 406.718.
    expect(within(pie as HTMLElement).getAllByText("406.718")).toHaveLength(2);
    expect(screen.queryByText("Copaiba")).toBeNull();
    const boton = screen.getByRole("button", { name: /19-SEC\/REG-PLT-2025-096/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Copaiba")).toBeTruthy();
    expect(screen.getByText("Quinilla")).toBeTruthy();
  });

  it("el filtro de especie de la cabecera avisa a la vista", () => {
    let elegida: string | null = null;
    render(<LothExtraccionTabla datos={respuesta(null)} especie={null} onEspecie={(c) => (elegida = c)} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por Especie" }), { target: { value: "lupuna" } });
    expect(elegida).toBe("lupuna");
  });
});

describe("sin censo contra qué medir", () => {
  it("la fila «Sin plan» no muestra saldos negativos inventados", () => {
    // QA-ui: 5 trozas sin plan, 16,985 m³; sin árbol censado la base es 0.
    const sinPlan = fila("sin-plan", "Sin plan", { censado: 0, censados: 0, semPoa: 0, aprov: 0, aprovN: 0, trozado: 16.985, trozas: 5 });
    sinPlan.saldo.trozado = { m3: -16.985, pct: null, nivel: "tope" };
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <CeldasDeFila f={sinPlan} />
          </tr>
        </tbody>
      </table>,
    );
    expect(container.textContent).not.toContain("-16.985");
    expect(container.querySelectorAll('[title="Sin censo contra qué medir"]')).toHaveLength(3);
  });

  it("en el eje de un gráfico el permiso se nombra por su final", () => {
    expect(nombreCorto("19-SEC/REG-PLT-2025-096")).toBe("…PLT-2025-096");
    expect(nombreCorto("PO 12")).toBe("PO 12");
  });
});
