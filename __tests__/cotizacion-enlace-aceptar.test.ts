/**
 * El cliente acepta la cotización desde su enlace público (noche 04-11, tramo 2):
 * POST /api/public/cotizacion/[token]/aceptar. Negocio y cotización salen del
 * token; el cambio de estado lleva la condición en el WHERE (la imita el doble
 * de `aceptarSiSigueAbierta`); quién aceptó va al registro de actividad.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.FIADO_STATEMENT_SECRET = "secreto-de-prueba-cotizacion-enlace-0123456789";
  type Fila = { id: string; tenantId: string; numero: string; status: string; validoHasta: string };
  const filas: Fila[] = [];
  const registro: Array<{ action: string; entity: string; detail: string; entityId?: string; user: string; tenantId?: string; createdAt: string }> = [];
  const cupos = new Map<string, number>();

  const getById = vi.fn(async (id: string, tenantId: string) => {
    const f = filas.find((x) => x.id === id && x.tenantId === tenantId);
    if (!f) return null;
    return {
      ...f,
      customerId: null,
      clienteNombre: "Ferretería Rivers",
      clienteRuc: "20123456789",
      subtotal: 100,
      igv: 18,
      total: 118,
      notas: null,
      createdBy: "usuario-interno-1",
      createdAt: "2026-11-01T15:00:00.000Z",
      updatedAt: "2026-11-01T15:00:00.000Z",
      items: [{ id: "item-1", productoId: null, descripcion: "Tornillo 2x4", cantidad: 10, precioUnit: 10, descuento: 0, subtotal: 100 }],
    };
  });
  // Mismo WHERE que el updateMany real: id + tenantId + estado aceptable + vigencia.
  const aceptarSiSigueAbierta = vi.fn(
    async (tenantId: string, id: string, cond: { estados: readonly string[]; vigenteDesde: Date; vigenteLegado: Date }) => {
      const f = filas.find((x) => x.id === id && x.tenantId === tenantId);
      if (!f || !cond.estados.includes(f.status)) return false;
      const v = new Date(f.validoHasta).getTime();
      if (!(v >= cond.vigenteDesde.getTime() || v === cond.vigenteLegado.getTime())) return false;
      f.status = "ACEPTADA";
      return true;
    },
  );
  const logActivity = vi.fn(
    async (action: string, entity: string, detail: string, entityId: string | undefined, user: string, _req?: string, tenantId?: string) => {
      registro.unshift({ action, entity, detail, entityId, user, tenantId, createdAt: new Date().toISOString() });
    },
  );
  const listarActividad = vi.fn(async (tenantId: string, f: { entity?: string; entityId?: string }) =>
    registro.filter((r) => r.tenantId === tenantId && r.entity === f.entity && r.entityId === f.entityId),
  );
  const crearAviso = vi.fn(async () => ({ id: "aviso-1" }));
  const afterDocument = vi.fn();
  return { filas, registro, cupos, getById, aceptarSiSigueAbierta, logActivity, listarActividad, crearAviso, afterDocument };
});

vi.mock("@/lib/db/cotizaciones.db", () => ({
  CotizacionesDB: { getById: h.getById, aceptarSiSigueAbierta: h.aceptarSiSigueAbierta },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/db/activity-log.db", () => ({ ActivityLogDB: { list: h.listarActividad } }));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { create: h.crearAviso } }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: h.afterDocument } }));
vi.mock("@/lib/db/membrete.db", () => ({
  MembreteDB: { del: vi.fn(async () => ({ nombre: "Bodega San Martín", logoUrl: null, telefono: "961 000 111", direccion: null, ruc: null, pie: null })) },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(async () => ({ taxRate: 18 })) } }));
// Cupo real en memoria: cuenta por clave + identificador, como el distribuido.
vi.mock("@/lib/rate-limit", () => ({
  createDistributedRateLimiter: (cfg: { key: string; maxRequests: number }) => ({
    check: vi.fn(async (id: string) => {
      const k = `${cfg.key}:${id}`;
      const n = (h.cupos.get(k) ?? 0) + 1;
      h.cupos.set(k, n);
      return n <= cfg.maxRequests;
    }),
  }),
  getClientIp: (req: { headers: { get(n: string): string | null } }) => req.headers.get("x-forwarded-for") ?? "127.0.0.1",
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/public/cotizacion/[token]/aceptar/route";
import { generarTokenCotizacion } from "@/lib/cotizaciones/enlace-token";
import { leerCotizacionPublica } from "@/lib/cotizaciones/enlace-publico";
import { generateStatementToken } from "@/lib/fiado/statement-token";
import { condicionVigente, ipRecortada, numeroWhatsapp, puedeAceptarse, textoAceptacion } from "@/lib/cotizaciones/aceptacion";
import { vigenciaVencida } from "@/lib/cotizaciones/vigencia";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.parse("2026-11-04T12:00:00.000Z"); // 07:00 en Lima

let ipSiguiente = 0;
function aceptar(token: string, cuerpo: unknown, ip = `200.48.10.${++ipSiguiente}`) {
  const req = new NextRequest(`http://localhost/api/public/cotizacion/${token}/aceptar`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 (Android 14) Chrome/130" },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
  return POST(req, { params: Promise.resolve({ token }) });
}
const tokenDe = (tenantId: string, id: string) => generarTokenCotizacion(tenantId, id, 15 * DIA)!;
const fila = (id: string) => h.filas.find((f) => f.id === id)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  h.filas.length = 0;
  h.registro.length = 0;
  h.cupos.clear();
  vi.clearAllMocks();
  h.filas.push(
    { id: "cot-a", tenantId: "negocio-a", numero: "COT-0007", status: "ENVIADA", validoHasta: "2026-11-20T04:59:59.999Z" },
    { id: "cot-b", tenantId: "negocio-b", numero: "COT-0001", status: "ENVIADA", validoHasta: "2026-11-20T04:59:59.999Z" },
  );
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST aceptar cotización desde el enlace", () => {
  it("acepta: estado ACEPTADA, registro con nombre/IP recortada, aviso en la campana y caché invalidada", async () => {
    const res = await aceptar(tokenDe("negocio-a", "cot-a"), { nombre: "  Juan   Pérez " }, "200.48.10.77");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, estado: "ACEPTADA", numero: "COT-0007", nombre: "Juan Pérez" });
    expect(fila("cot-a").status).toBe("ACEPTADA");

    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const r = h.registro[0]!;
    expect(r).toMatchObject({ action: "cotizacion_aceptada_por_cliente", entity: "Cotizacion", entityId: "cot-a", user: "cliente-enlace", tenantId: "negocio-a" });
    expect(r.detail).toContain("nombre «Juan Pérez»");
    expect(r.detail).toContain("IP 200.48.10.x");
    expect(r.detail).not.toContain("200.48.10.77");

    expect(h.crearAviso).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "negocio-a", title: "Cotización COT-0007 aceptada por Juan Pérez", entityId: "cot-a" }),
    );
    expect(h.afterDocument).toHaveBeenCalledWith("negocio-a");

    // La página al volver a abrirla: sin botón y con quién la aceptó.
    const pub = await leerCotizacionPublica(tokenDe("negocio-a", "cot-a"));
    expect(pub).toMatchObject({ estado: "ACEPTADA", aceptable: false, aceptacion: { nombre: "Juan Pérez" } });
  });

  it("la segunda aceptación da 409 y no vuelve a registrar ni avisar", async () => {
    const t = tokenDe("negocio-a", "cot-a");
    expect((await aceptar(t, { nombre: "Juan Pérez" })).status).toBe(200);
    const otra = await aceptar(t, { nombre: "Otra Persona" });
    expect(otra.status).toBe(409);
    expect(await otra.json()).toMatchObject({ error: "Esta cotización ya no se puede aceptar.", estado: "ACEPTADA" });
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    expect(h.crearAviso).toHaveBeenCalledTimes(1);
  });

  it("vencida (vigencia pasada o estado VENCIDA) da 409 sin intentar el UPDATE", async () => {
    fila("cot-a").validoHasta = "2026-11-03T04:59:59.999Z"; // terminó el 02-11 en Lima
    const r1 = await aceptar(tokenDe("negocio-a", "cot-a"), { nombre: "Juan Pérez" });
    expect(r1.status).toBe(409);
    expect((await r1.json()).error).toMatch(/ya venció/);

    fila("cot-b").status = "VENCIDA";
    fila("cot-b").validoHasta = "2026-11-30T04:59:59.999Z";
    expect((await aceptar(tokenDe("negocio-b", "cot-b"), { nombre: "Juan Pérez" })).status).toBe(409);
    expect(h.aceptarSiSigueAbierta).not.toHaveBeenCalled();
    expect(fila("cot-a").status).toBe("ENVIADA");
  });

  it("rechazada o convertida: 409 y el estado no cambia", async () => {
    for (const status of ["RECHAZADA", "CONVERTIDA"]) {
      fila("cot-a").status = status;
      const res = await aceptar(tokenDe("negocio-a", "cot-a"), { nombre: "Juan Pérez" });
      expect(res.status).toBe(409);
      expect(fila("cot-a").status).toBe(status);
    }
  });

  it("carrera: si el UPDATE condicionado no toca fila (el panel la cambió en medio), 409", async () => {
    h.aceptarSiSigueAbierta.mockResolvedValueOnce(false);
    const res = await aceptar(tokenDe("negocio-a", "cot-a"), { nombre: "Juan Pérez" });
    expect(res.status).toBe(409);
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("token alterado, de estado de cuenta o de otro negocio: 404 genérico, igual para todos", async () => {
    const t = tokenDe("negocio-a", "cot-a");
    const [cuerpo, firma] = t.split(".");
    const alterado = `${cuerpo}.${firma!.slice(0, -2)}${firma!.endsWith("AA") ? "BB" : "AA"}`;
    const deCuenta = generateStatementToken("negocio-a", "cot-a")!;
    // Firmado de verdad, pero la cotización es de OTRO negocio: el WHERE con el tenant del token no la encuentra.
    const cruzado = tokenDe("negocio-a", "cot-b");

    const cuerpos = [];
    for (const tk of [alterado, deCuenta, cruzado, "basura"]) {
      const res = await aceptar(tk, { nombre: "Juan Pérez" });
      expect(res.status).toBe(404);
      cuerpos.push(await res.json());
    }
    expect(new Set(cuerpos.map((c) => JSON.stringify(c))).size).toBe(1);
    expect(fila("cot-b").status).toBe("ENVIADA");
    expect(h.aceptarSiSigueAbierta).not.toHaveBeenCalled();
  });

  it("cuerpo sin nombre, nombre corto, con «» o JSON roto: 400", async () => {
    const t = tokenDe("negocio-a", "cot-a");
    for (const cuerpo of [{}, { nombre: "J" }, { nombre: "Juan «admin»" }, { nombre: 123 }, "{no es json", ""]) {
      h.cupos.clear(); // 6 intentos sobre la misma cotización: acá se prueba el cuerpo, no el cupo
      expect((await aceptar(t, cuerpo)).status).toBe(400);
    }
    expect(fila("cot-a").status).toBe("ENVIADA");
  });

  it("el tenantId o la cotización del cuerpo se ignoran: manda el token", async () => {
    const res = await aceptar(tokenDe("negocio-a", "cot-a"), { nombre: "Juan Pérez", tenantId: "negocio-b", cotizacionId: "cot-b", id: "cot-b" });
    expect(res.status).toBe(200);
    expect(fila("cot-a").status).toBe("ACEPTADA");
    expect(fila("cot-b").status).toBe("ENVIADA");
    expect(h.aceptarSiSigueAbierta).toHaveBeenCalledWith("negocio-a", "cot-a", expect.anything());
    expect(h.registro[0]?.tenantId).toBe("negocio-a");
  });

  it("cupo: la 6.ª petición de la misma IP en 10 min da 429 aunque el enlace sea malo", async () => {
    for (let i = 0; i < 5; i++) expect((await aceptar("basura", { nombre: "Juan Pérez" }, "10.0.0.9")).status).toBe(404);
    const res = await aceptar("basura", { nombre: "Juan Pérez" }, "10.0.0.9");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
  });

  it("cupo por cotización: cambiar de IP no da más de 5 intentos sobre la misma", async () => {
    const t = tokenDe("negocio-a", "cot-a");
    for (let i = 0; i < 5; i++) expect((await aceptar(t, {})).status).toBe(400);
    expect((await aceptar(t, { nombre: "Juan Pérez" })).status).toBe(429);
    expect(fila("cot-a").status).toBe("ENVIADA");
  });
});

describe("reglas puras de la aceptación", () => {
  it("el WHERE de vigencia dice lo mismo que vigenciaVencida en los dos formatos", () => {
    const { vigenteDesde, vigenteLegado } = condicionVigente(AHORA);
    const pasaWhere = (v: string) => {
      const t = Date.parse(v);
      return t >= vigenteDesde.getTime() || t === vigenteLegado.getTime();
    };
    const casos = [
      "2026-11-04T04:59:59.999Z", // nuevo: vence hoy 04-11 en Lima → vigente
      "2026-11-04T00:00:00.000Z", // viejo: medianoche UTC de hoy → vigente
      "2026-11-03T04:59:59.999Z", // nuevo: venció el 02-11
      "2026-11-03T00:00:00.000Z", // viejo: venció ayer
      "2026-11-05T04:59:59.999Z", // nuevo: mañana
      "2026-11-05T00:00:00.000Z", // viejo: mañana
    ];
    for (const v of casos) expect(pasaWhere(v)).toBe(!vigenciaVencida(v, AHORA));
  });

  it("puedeAceptarse: solo BORRADOR y ENVIADA vigentes", () => {
    const v = "2026-11-20T04:59:59.999Z";
    expect(puedeAceptarse("ENVIADA", v, AHORA)).toBe(true);
    expect(puedeAceptarse("BORRADOR", v, AHORA)).toBe(true);
    for (const e of ["ACEPTADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"]) expect(puedeAceptarse(e, v, AHORA)).toBe(false);
  });

  it("WhatsApp solo para celular peruano; IP recortada; texto con hora de Lima", () => {
    expect(numeroWhatsapp("961 000 111")).toBe("51961000111");
    expect(numeroWhatsapp("+51 961-000-111")).toBe("51961000111");
    expect(numeroWhatsapp("(061) 571234")).toBeNull();
    expect(numeroWhatsapp(null)).toBeNull();
    expect(ipRecortada("181.65.2.140")).toBe("181.65.2.x");
    expect(ipRecortada("::ffff:127.0.0.1")).toBe("127.0.0.x"); // la prueba real en local guardó «::ffff::x»
    expect(ipRecortada("2800:200:e840:1234::1")).toBe("2800:200:e840::x");
    expect(ipRecortada("")).toBe("desconocida");
    const t = textoAceptacion("2026-11-04T15:32:00.000Z", "Juan Pérez");
    expect(t).toMatch(/^Aceptada el 4 de noviembre de 2026 a las 10:32/);
    expect(t).toMatch(/por Juan Pérez$/);
  });
});
