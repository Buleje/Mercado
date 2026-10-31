import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Captura } from "@/lib/camaras/camaras";
import { fechaDeLima, resumenDelDia, textoResumen, type ContextoDelDia } from "@/lib/camaras/resumen";

const H = vi.hoisted(() => ({
  marca: null as Record<string, unknown> | null,
  escrituras: [] as Record<string, unknown>[],
  envios: [] as string[],
  envioOk: true,
  textos: [] as string[],
  camaras: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async () => ({ a: { tenantId: "t1" }, b: { tenantId: "t1" } }),
    actualizar: async (
      _k: string,
      cambio: (a: unknown) => { valor?: unknown; resultado: unknown },
    ) => {
      const r = cambio(H.marca);
      if (r.valor !== undefined) {
        H.marca = r.valor as Record<string, unknown>;
        H.escrituras.push(H.marca);
      }
      return r.resultado;
    },
    set: async (_k: string, v: Record<string, unknown>) => {
      H.marca = v;
      H.escrituras.push(v);
    },
  },
}));
vi.mock("@/lib/db/camaras.db", () => ({ CamarasDB: { list: async () => H.camaras } }));
vi.mock("@/lib/db/membrete.db", () => ({ MembreteDB: { del: async () => ({ nombre: "Blas" }) } }));
vi.mock("@/lib/camaras/resumen.server", () => ({
  armarResumen: async () => ({ resumen: resumenDelDia([], [], "2026-10-01"), camaras: [] }),
}));
vi.mock("@/lib/whatsapp-tenant", () => ({
  enviarWhatsAppDelNegocio: async (_t: string, tel: string, texto: string) => {
    H.envios.push(tel);
    H.textos.push(texto);
    return { ok: H.envioOk, via: "negocio", modo: "texto", plantilla: null, wamid: null, puedeNoLlegar: false, error: H.envioOk ? null : "boom", nota: null };
  },
}));

import { GET as cronGET } from "@/app/api/cron/camaras-resumen/route";
import { NextRequest } from "next/server";

const camaras = [
  { id: "c1", nombre: "Portón", lugar: "Entrada" },
  { id: "c2", nombre: "Sierra", lugar: "" },
];

let n = 0;
const cap = (at: string, extra: Partial<Captura> = {}, camaraId = "c1"): Captura => ({
  id: `cap${++n}`,
  camaraId,
  url: "x",
  evento: "persona",
  at,
  ...extra,
});
const lect = (l: Partial<NonNullable<Captura["lectura"]>> = {}): NonNullable<Captura["lectura"]> => ({
  descripcion: null,
  hayPersona: false,
  hayVehiculo: false,
  personas: null,
  placa: null,
  confianza: "alta",
  motivo: null,
  ...l,
});

describe("resumenDelDia", () => {
  it("el día es el de Lima: 23:59 y 00:00 caen en días distintos", () => {
    const a = cap("2026-10-02T04:59:59Z", { lectura: lect() }); // 23:59:59 del 1
    const b = cap("2026-10-02T05:00:00Z", { lectura: lect() }); // 00:00 del 2
    expect(fechaDeLima("2026-10-02T04:59:59Z")).toBe("2026-10-01");
    expect(resumenDelDia([a, b], camaras, "2026-10-01").fotos).toBe(1);
    expect(resumenDelDia([a, b], camaras, "2026-10-02").fotos).toBe(1);
    const r = resumenDelDia([a], camaras, "2026-10-01");
    expect(r.personasPorHora[0].hora).toBe(23);
  });

  it("la misma placa en varias fotos es UN camión, con la primera hora", () => {
    const fotos = [
      cap("2026-10-01T13:00:00Z", { lectura: lect({ hayVehiculo: true, placa: "abc-123" }) }), // 08:00
      cap("2026-10-01T15:30:00Z", {
        lectura: lect({ hayVehiculo: true, placa: "ABC 123" }),
        cruces: {
          calculadoEn: "x",
          chalecos: [],
          placas: [{ placa: "ABC123", tipo: "gtf", refId: "g", etiqueta: "Guía 019-001-0001", coincidencia: "exacta", confirmadoPor: "ana" }],
        },
      }),
      cap("2026-10-01T16:00:00Z", { lectura: lect({ hayVehiculo: true, placa: "XYZ999" }) }),
    ];
    const r = resumenDelDia(fotos, camaras, "2026-10-01");
    expect(r.camiones).toHaveLength(2);
    expect(r.camiones[0]).toEqual({ hora: "08:00", placa: "ABC123", etiquetaCruce: "Guía 019-001-0001", confirmado: true });
    expect(r.camiones[1].etiquetaCruce).toBeNull();
    expect(r.camiones[1].confirmado).toBe(false);
  });

  it("gente por hora = máximo en una foto, y cuenta las fotos de la hora", () => {
    const fotos = [
      cap("2026-10-01T15:05:00Z", { lectura: lect({ hayPersona: true, personas: 2 }) }), // 10h
      cap("2026-10-01T15:40:00Z", { lectura: lect({ hayPersona: true, personas: 4 }) }),
      cap("2026-10-01T15:50:00Z", { lectura: lect({ hayPersona: true, personas: null }) }),
      cap("2026-10-01T17:00:00Z", { lectura: lect() }), // 12h, nadie
    ];
    const r = resumenDelDia(fotos, camaras, "2026-10-01");
    expect(r.personasPorHora).toEqual([
      { hora: 10, max: 4, fotos: 3 },
      { hora: 12, max: 0, fotos: 1 },
    ]);
  });

  it("una captura sin lectura (o vieja, sin campos nuevos) no rompe y cuenta en sinLectura", () => {
    const fotos = [cap("2026-10-01T15:00:00Z"), cap("2026-10-01T15:10:00Z", { lectura: null }), cap("2026-10-01T15:20:00Z", { lectura: lect() })];
    const r = resumenDelDia(fotos, camaras, "2026-10-01");
    expect(r.fotos).toBe(3);
    expect(r.sinLectura).toBe(2);
    expect(r.camiones).toEqual([]);
    expect(r.chalecos).toEqual([]);
    expect(r.pila).toEqual([]);
    expect(r.actividades).toEqual({});
  });

  it("chalecos: une lectura y cruces, marca al asignado sin asistencia", () => {
    const fotos = [
      cap("2026-10-01T13:00:00Z", {
        lectura: lect({ hayPersona: true, chalecos: ["3", "12"], actividad: "carga" }),
        cruces: {
          calculadoEn: "x",
          placas: [],
          chalecos: [
            { numero: "3", colaboradorId: "u3", nombre: "Juan", asistencia: { estado: "presente", entrada: "07:00", salida: null } },
            { numero: "12", colaboradorId: "u12", nombre: "Pedro", asistencia: null },
          ],
        },
      }),
      cap("2026-10-01T21:00:00Z", { lectura: lect({ hayPersona: true, chalecos: ["3", "40"] }) }),
    ];
    const r = resumenDelDia(fotos, camaras, "2026-10-01");
    const por = Object.fromEntries(r.chalecos.map((c) => [c.numero, c]));
    expect(por["3"]).toMatchObject({ nombre: "Juan", primeraVez: "08:00", ultimaVez: "16:00", asistencia: "presente", sinMarcacion: false });
    expect(por["12"]).toMatchObject({ nombre: "Pedro", asistencia: null, sinMarcacion: true });
    expect(por["40"]).toMatchObject({ nombre: null, sinMarcacion: false });
    expect(r.actividades).toEqual({ carga: 1 });
  });

  it("pila: sólo bajo/subió", () => {
    const fotos = [
      cap("2026-10-01T20:00:00Z", { pila: { comparadaCon: "a", cambio: "bajo", confianza: "alta", despachoDelDia: false, avisada: true } }),
      cap("2026-10-01T21:00:00Z", { pila: { comparadaCon: "a", cambio: "igual", confianza: "alta" } }),
    ];
    const r = resumenDelDia(fotos, camaras, "2026-10-01");
    expect(r.pila).toEqual([{ hora: "15:00", camara: "Portón", cambio: "bajo", despachoDelDia: false, produccionDelDia: null, avisada: true }]);
  });

  it("día vacío: porCamara lista las cámaras con 0 fotos", () => {
    const r = resumenDelDia([], camaras, "2026-10-01");
    expect(r.fotos).toBe(0);
    expect(r.porCamara.map((c) => [c.nombre, c.fotos])).toEqual([["Portón", 0], ["Sierra", 0]]);
  });
});

describe("textoResumen", () => {
  it("día sin fotos: avisa en serio, no un resumen vacío", () => {
    const t = textoResumen(resumenDelDia([], camaras, "2026-10-01"), "Blas");
    expect(t).toContain("La cámara no mandó fotos hoy — revisa batería/datos");
    expect(t).toContain("01/10");
    expect(t).not.toMatch(/Camiones/);
  });

  it("con datos: dice camiones y aclara que la gente es por fotos", () => {
    const fotos = [
      cap("2026-10-01T15:05:00Z", { lectura: lect({ hayPersona: true, hayVehiculo: true, personas: 3, placa: "ABC123" }) }),
    ];
    const t = textoResumen(resumenDelDia(fotos, camaras, "2026-10-01"), "Blas");
    expect(t).toContain("Camiones: 1");
    expect(t).toContain("ABC123");
    expect(t).toContain("no un conteo seguido");
    expect(t).toContain("No mandó nada hoy: Sierra");
  });

  it("nunca pasa de 900 caracteres, aun con montones de datos", () => {
    const fotos: Captura[] = [];
    for (let i = 0; i < 60; i++) {
      const hh = String(13 + (i % 10)).padStart(2, "0");
      fotos.push(
        cap(`2026-10-01T${hh}:${String(i % 60).padStart(2, "0")}:00Z`, {
          lectura: lect({ hayPersona: true, hayVehiculo: true, personas: i % 7, placa: `PL${1000 + i}`, chalecos: [String(i)], actividad: "carga" }),
        }),
      );
    }
    const t = textoResumen(resumenDelDia(fotos, camaras, "2026-10-01"), "Inversiones Agroforestales Blas Sociedad Anónima");
    expect(t.length).toBeLessThanOrEqual(900);
    expect(t.startsWith("📷")).toBe(true);
  });
});

describe("contexto al armar (libro y asistencia releídos)", () => {
  const baja = cap("2026-10-01T15:15:00Z", {
    lectura: lect(),
    pila: { comparadaCon: "a", cambio: "bajo", confianza: "alta", despachoDelDia: false, produccionDelDia: false, avisada: true },
  });

  it("producción anotada después de la foto: ya no hay recordatorio", () => {
    const sin = resumenDelDia([baja], camaras, "2026-10-01");
    expect(textoResumen(sin, "Blas")).toContain("La pila bajó a las 10:15");
    const ctx: ContextoDelDia = { libro: { despacho: false, produccion: true }, chalecos: null };
    const con = resumenDelDia([baja], camaras, "2026-10-01", ctx);
    expect(con.pila[0]).toMatchObject({ despachoDelDia: false, produccionDelDia: true });
    expect(textoResumen(con, "Blas")).not.toMatch(/pila bajó/);
  });

  it("el recordatorio no acusa: pide anotar", () => {
    const ctx: ContextoDelDia = { libro: { despacho: false, produccion: false }, chalecos: null };
    const t = textoResumen(resumenDelDia([baja], camaras, "2026-10-01", ctx), "Blas");
    expect(t).toContain("La pila bajó a las 10:15 y todavía no hay despacho ni producción anotados ese día.");
  });

  it("asistencia cargada tarde: manda la de ahora, no la de la foto", () => {
    const foto = cap("2026-10-01T13:00:00Z", {
      lectura: lect({ hayPersona: true, chalecos: ["3", "9"] }),
      cruces: { calculadoEn: "x", placas: [], chalecos: [{ numero: "3", colaboradorId: "u3", nombre: "Juan", asistencia: null }] },
    });
    const ctx: ContextoDelDia = {
      libro: null,
      chalecos: { "3": { nombre: "Juan", estado: "presente" }, "9": { nombre: "Ana", estado: null } },
    };
    const r = resumenDelDia([foto], camaras, "2026-10-01", ctx);
    const por = Object.fromEntries(r.chalecos.map((c) => [c.numero, c]));
    expect(por["3"]).toMatchObject({ asistencia: "presente", sinMarcacion: false });
    expect(por["9"]).toMatchObject({ nombre: "Ana", sinMarcacion: true });
  });
});

describe("lectura fallida", () => {
  it("sin IA configurada: va a sinLectura y no crea «10h: 0»", () => {
    const fallida = cap("2026-10-01T15:00:00Z", { lectura: lect({ motivo: "sin_ia_configurada" }) });
    const buena = cap("2026-10-01T17:00:00Z", { lectura: lect({ descripcion: "un obrero", hayPersona: true, personas: 2, actividad: "carga" }) });
    const r = resumenDelDia([fallida, buena], camaras, "2026-10-01");
    expect(r.sinLectura).toBe(1);
    expect(r.fotos).toBe(2);
    expect(r.personasPorHora).toEqual([{ hora: 12, max: 2, fotos: 1 }]);
    expect(r.actividades).toEqual({ carga: 1 });
  });

  it("una lectura con descripción y motivo de baja confianza SÍ es leída", () => {
    const f = cap("2026-10-01T15:00:00Z", { lectura: lect({ descripcion: "de noche", motivo: "de noche", hayPersona: true, personas: 1 }) });
    expect(resumenDelDia([f], camaras, "2026-10-01").sinLectura).toBe(0);
  });
});

describe("cron camaras-resumen", () => {
  const llamar = () =>
    cronGET(new NextRequest("http://x/api/cron/camaras-resumen", { headers: { authorization: "Bearer s3cret" } }));
  const hoy = fechaDeLima(new Date());

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    H.marca = null;
    H.escrituras = [];
    H.envios = [];
    H.textos = [];
    H.envioOk = true;
    H.camaras = [
      { id: "c1", nombre: "Portón", lugar: "", activa: true, avisos: { whatsapp: "987654321", cuando: "siempre" } },
      { id: "c2", nombre: "Sierra", lugar: "", activa: true, avisos: { whatsapp: "987 654 321", cuando: "siempre" } },
    ];
  });

  it("manda una vez por número (deduplicado), sella el día y no repite", async () => {
    const r1 = await llamar();
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ tenants: 1, enviados: 1, sinNumero: 0, sinFotos: 1 });
    expect(H.marca).toMatchObject({ fecha: hoy, estado: "enviado" });
    const r2 = await llamar();
    expect(await r2.json()).toMatchObject({ enviados: 0, yaEnviados: 1 });
    expect(H.envios).toHaveLength(1);
  });

  it("todos los envíos fallan: 502 y el día queda libre para reintentar", async () => {
    H.envioOk = false;
    const r = await llamar();
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ enviados: 0, fallidos: 1 });
    expect(H.marca?.fecha ?? null).toBeNull();
    H.envioOk = true;
    const r2 = await llamar();
    expect(r2.status).toBe(200);
    expect(H.envios).toHaveLength(2);
  });

  it("una reserva viva (otra llamada enviando) no manda doble", async () => {
    H.marca = { fecha: hoy, estado: "enviando", en: new Date().toISOString() };
    const r = await llamar();
    expect(await r.json()).toMatchObject({ enviados: 0, yaEnviados: 1 });
    expect(H.envios).toHaveLength(0);
  });

  it("una reserva vieja (proceso caído) se retoma", async () => {
    H.marca = { fecha: hoy, estado: "enviando", en: new Date(Date.now() - 3_600_000).toISOString() };
    const r = await llamar();
    expect(await r.json()).toMatchObject({ enviados: 1 });
  });

  it("sin número configurado: cuenta sinNumero y no manda", async () => {
    H.camaras = [{ id: "c1", nombre: "Portón", lugar: "", activa: true, avisos: null }];
    const r = await llamar();
    expect(await r.json()).toMatchObject({ sinNumero: 1, enviados: 0 });
    expect(r.status).toBe(200);
  });

  it("sin bearer: 401", async () => {
    const r = await cronGET(new NextRequest("http://x/api/cron/camaras-resumen"));
    expect(r.status).toBe(401);
  });
});
