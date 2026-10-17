/**
 * Reportes diarios (ADR-439) — lo que las revisiones del 26-09 encontraron mal.
 *
 * Cada caso sale de una cifra medida en `main` (20/09–26/09):
 *  · «11 guías · 7 por recibir» contaba ASIENTOS: una GTF con dos especies son
 *    dos asientos. La bandeja dice 8 guías · 5 por recibir.
 *  · «rendimiento 41,6 %» sumaba lo producido por corridas SIN entrada (una
 *    corrida sin materia prima declarada sube el numerador y no el divisor).
 *    El libro dice 38,5 % (ponderado por volumen consumido).
 *  · horas 21:30–23:30 se ofrecían y nunca salían (último disparo 21:00).
 */
import { describe, expect, it } from "vitest";
import { resumirIngresosPorGuia } from "@/lib/forestal/reporte-diario-ingresos";
import { rendimientoPonderado } from "@/lib/forestal/ctp-kpis-seccion";
import {
  HORAS_DEL_EDITOR,
  TOPE_DESTINATARIOS,
  explicarFalloEnvio,
  intentosDeHoy,
  marcaDeReintento,
  reporteDiarioSchema,
  sinCaracteresDeControl,
  ventanaDeHora,
} from "@/lib/forestal/reporte-diario";
import { armarReporteForestal, type DatosReporteForestal } from "@/lib/forestal/reporte-diario-armado";

const asiento = (extra: Partial<Parameters<typeof resumirIngresosPorGuia>[0][number]> = {}) => ({
  id: Math.random().toString(36).slice(2),
  gtfSeries: null,
  gtfNumber: "QA-1",
  maderaDeTercero: false,
  speciesCommonName: "Tornillo",
  providerName: "Proveedor A",
  volumeM3: 1,
  ...extra,
});

describe("ingresos por GUÍA, no por asiento", () => {
  it("una GTF con 3 especies es UNA guía (y cuenta una vez por especie y por proveedor)", () => {
    const filas = [
      asiento({ id: "a", speciesCommonName: "Tornillo", volumeM3: 2 }),
      asiento({ id: "b", speciesCommonName: "Cachimbo", volumeM3: 3 }),
      asiento({ id: "c", speciesCommonName: "Copal", volumeM3: 1.5 }),
    ];
    const r = resumirIngresosPorGuia(filas, new Set());
    expect(r.guias).toBe(1);
    expect(r.porRecibir).toBe(1);
    expect(r.m3).toBe(6.5);
    expect(r.porProveedor).toEqual([{ nombre: "Proveedor A", cantidad: 1, m3: 6.5 }]);
    expect(r.porEspecie.map((e) => e.cantidad)).toEqual([1, 1, 1]);
  });

  it("por recibir se cuenta por guía: basta un asiento sin recibir; recibida = todos recibidos", () => {
    const filas = [
      asiento({ id: "a1", gtfNumber: "G1" }),
      asiento({ id: "a2", gtfNumber: "G1", speciesCommonName: "Copal" }),
      asiento({ id: "b1", gtfNumber: "G2" }),
      asiento({ id: "c1", gtfNumber: "G3" }),
    ];
    const r = resumirIngresosPorGuia(filas, new Set(["a1", "a2", "b1"]));
    expect(r).toMatchObject({ guias: 3, porRecibir: 1 });
  });

  it("la serie separa guías con el mismo número (la bandeja agrupa por serie + número)", () => {
    const r = resumirIngresosPorGuia([asiento({ gtfSeries: "001" }), asiento({ gtfSeries: "002" })], new Set());
    expect(r.guias).toBe(2);
  });

  it("un asiento sin GTF es su propia guía; la madera de servicio se cuenta aparte", () => {
    const r = resumirIngresosPorGuia(
      [asiento({ id: "x", gtfNumber: "" }), asiento({ id: "y", gtfNumber: null }), asiento({ gtfNumber: "S1", maderaDeTercero: true })],
      new Set(),
    );
    expect(r).toMatchObject({ guias: 3, deServicio: 1 });
  });
});

describe("rendimiento con la fórmula del libro", () => {
  const corrida = (quantity: number | null, volumeInputM3: number | null, rendimientoPct: number | null) => ({
    status: "registrado",
    quantity,
    volumeInputM3,
    rendimientoPct,
  });

  it("una corrida SIN entrada no cambia el rendimiento", () => {
    const base = [corrida(1.5, 3.6, 41.67), corrida(0.9, 1.9607, 45.9)];
    const sin = rendimientoPonderado(base);
    const con = rendimientoPonderado([...base, corrida(0.2, null, null), corrida(3, 0, null)]);
    expect(con.pct).toBe(sin.pct);
    expect(con.entradaM3).toBe(sin.entradaM3);
  });

  it("es PONDERADO por volumen consumido y lo anulado no cuenta", () => {
    const r = rendimientoPonderado([corrida(1, 10, 10), corrida(9, 10, 90), { ...corrida(5, 100, 5), status: "anulado" }]);
    expect(r.pct).toBe(50);
    expect(r.entradaM3).toBe(20);
  });

  it("sin corridas con entrada → null (no 0 %)", () => {
    expect(rendimientoPonderado([corrida(2, null, null)]).pct).toBeNull();
  });
});

describe("horas: sólo las que tienen disparo", () => {
  const ok = {
    nombre: "Cierre",
    activo: true,
    hora: "18:00",
    dias: [1],
    porCorreo: true,
    porWhatsapp: false,
    correos: ["dueno@ejemplo.pe"],
    telefonos: [],
    secciones: ["plata"],
    rango: "hoy",
  };

  it("21:00 pasa; 21:30, 22:00 y 23:30 se rechazan con mensaje", () => {
    expect(reporteDiarioSchema.safeParse({ ...ok, hora: "21:00" }).success).toBe(true);
    for (const hora of ["21:30", "22:00", "23:30"]) {
      const r = reporteDiarioSchema.safeParse({ ...ok, hora });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toMatch(/21:00/);
    }
  });

  it("el editor no ofrece horas sin disparo y cada una dice su ventana", () => {
    expect(HORAS_DEL_EDITOR.at(-1)).toBe("21:00");
    expect(HORAS_DEL_EDITOR).not.toContain("21:30");
    expect(ventanaDeHora("18:00")).toEqual({ desde: "18:00", hasta: "18:59" });
    expect(ventanaDeHora("18:30")).toEqual({ desde: "21:00", hasta: "21:59" });
    expect(ventanaDeHora("06:00")).toEqual({ desde: "07:00", hasta: "07:59" });
  });

  it("sólo celulares de Perú (+51 9…)", () => {
    expect(reporteDiarioSchema.safeParse({ ...ok, porWhatsapp: true, telefonos: ["987 654 321"] }).success).toBe(true);
    for (const t of ["+1 415 555 0100", "+54 9 11 5555 5555", "51 612 345 678"]) {
      const r = reporteDiarioSchema.safeParse({ ...ok, porWhatsapp: true, telefonos: [t] });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toMatch(/Perú/);
    }
  });

  it(`a lo más ${TOPE_DESTINATARIOS} destinatarios por reporte, sumando los dos canales`, () => {
    const correos = Array.from({ length: 6 }, (_, i) => `c${i}@ejemplo.pe`);
    const telefonos = Array.from({ length: 5 }, (_, i) => `98765432${i}`);
    const r = reporteDiarioSchema.safeParse({ ...ok, porWhatsapp: true, correos, telefonos });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /10 destinatarios/.test(i.message))).toBe(true);
    expect(reporteDiarioSchema.safeParse({ ...ok, porWhatsapp: true, correos, telefonos: telefonos.slice(0, 4) }).success).toBe(true);
  });

  it("el nombre pierde los saltos de línea y caracteres de control", () => {
    const r = reporteDiarioSchema.safeParse({ ...ok, nombre: "Cierre\r\nBcc: otro@x.pe\u0000" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nombre).toBe("Cierre Bcc: otro@x.pe");
    expect(sinCaracteresDeControl("a b\tc\u007F")).toBe("a b c");
  });
});

const datos = (extra: Partial<DatosReporteForestal> = {}): DatosReporteForestal => ({
  negocio: "BLAS",
  nombreReporte: "Cierre",
  fecha: "2026-09-26",
  rango: "hoy",
  desde: "2026-09-26",
  hasta: "2026-09-26",
  panelUrl: "https://buleje.pe/admin?tab=ctp-libro-operaciones",
  ...extra,
});

describe("armado: asunto y texto sin CRLF; monedas sin mezclar", () => {
  it("un nombre de negocio o de reporte con \\r\\n no parte el asunto ni el texto", () => {
    const r = armarReporteForestal(datos({ negocio: "BLAS\r\nX-Evil: 1", nombreReporte: "Cierre\nBcc: a@b.pe" }), ["tala"]);
    expect(r.asunto).not.toMatch(/[\r\n]/);
    expect(r.texto).not.toMatch(/\r/);
    expect(r.html).not.toMatch(/\r/);
    expect(r.texto.startsWith("*Cierre Bcc: a@b.pe* — BLAS X-Evil: 1")).toBe(true);
  });

  it("adelantos en soles y en dólares van en renglones separados, nunca sumados", () => {
    const r = armarReporteForestal(
      datos({
        plata: {
          deudaProveedores: 0,
          guiasSinPagar: 0,
          proveedores: [],
          pagos: { pagados: { cantidad: 0, monto: 0 }, cobrados: { cantidad: 0, monto: 0 } },
          adelantos: [
            { moneda: "PEN", saldo: 4506.34, abiertos: 12 },
            { moneda: "USD", saldo: 100, abiertos: 1 },
          ],
        },
      }),
      ["plata"],
    );
    expect(r.texto).toContain("S/ 4,506.34 en 12 adelantos abiertos");
    expect(r.texto).toContain("US$ 100.00 en 1 adelanto abierto");
    expect(r.texto).not.toContain("4,606.34");
  });

  it("ingresos: dice las guías de servicio aparte", () => {
    const r = armarReporteForestal(
      datos({ ingresos: { guias: 8, m3: 24.2, porRecibir: 5, deServicio: 1, porEspecie: [], porProveedor: [] } }),
      ["ingresos"],
    );
    expect(r.texto).toContain("8 guías (1 de servicio) · 24.20 m³ · 5 por recibir en patio");
  });
});

describe("reintento del mismo día", () => {
  it("la marca de reintento lleva el día y el número de intento", () => {
    expect(marcaDeReintento("2026-09-26", 1)).toBe("2026-09-26#1");
    expect(intentosDeHoy("2026-09-26#2", "2026-09-26")).toBe(2);
    expect(intentosDeHoy("2026-09-25#2", "2026-09-26")).toBe(0);
    expect(intentosDeHoy(null, "2026-09-26")).toBe(0);
  });

  it("los errores pasajeros no prometen un reintento que no siempre ocurre", () => {
    expect(explicarFalloEnvio("whatsapp", "fetch failed")).toMatch(/Enviar ahora/);
    expect(explicarFalloEnvio("email", "429 rate limit")).toMatch(/Enviar ahora/);
    expect(explicarFalloEnvio("email", "Tope diario de 60 mensajes alcanzado")).toMatch(/tope/i);
  });
});
