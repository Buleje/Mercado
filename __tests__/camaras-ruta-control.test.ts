import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

/**
 * POST/GET /api/admin/camaras/[id]/control (ADR-472): quién puede mover y
 * quién puede armar/sonar, que una cámara de otro negocio no se toca, que el
 * permiso de EZVIZ sólo viaja a `*.ezvizlife.com`, que la alarma está
 * deshabilitada (409) salvo con la bandera, que el rol se mira antes del
 * cupo y que desarmar avisa al dueño. EZVIZ es un fetch simulado con las
 * respuestas REALES del 05-10.
 */

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  camarasPorTenant: {} as Record<string, { id: string; nombre: string }[]>,
  enlaces: {} as Record<
    string,
    { resourceId: string; deviceSerial: string; codigo: string | null }
  >,
  llamadas: [] as { url: string; headers: Record<string, string>; body: string }[],
  ezviz: (() => ({ code: "200", msg: "Operation succeeded" })) as (
    url: string,
    body: URLSearchParams,
  ) => unknown,
  binario: null as Buffer | null,
  despues: [] as (() => Promise<unknown>)[],
  fotos: [] as { nota: string | null; bytes: number }[],
  registros: [] as unknown[],
  avisos: [] as unknown[],
  cupos: [] as string[],
  sinCupo: new Set<string>(),
  alarmaHabilitada: false,
}));

vi.mock("next/server", async (real) => ({
  ...(await real<typeof import("next/server")>()),
  after: (f: () => Promise<unknown>) => void H.despues.push(f),
}));
vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "200.0.0.1",
  createDistributedRateLimiter: (cfg: { key: string; windowMs: number }) => ({
    check: async (k: string) => {
      H.cupos.push(`${cfg.key}|${k}`);
      return !H.sinCupo.has(cfg.key);
    },
    windowMs: cfg.windowMs,
  }),
}));
vi.mock("@/lib/camaras/ezviz-control", async (real) => ({
  ...(await real<typeof import("@/lib/camaras/ezviz-control")>()),
  get ALARMA_HABILITADA() {
    return H.alarmaHabilitada;
  },
}));
vi.mock("@/lib/camaras/ezviz-control-aviso.server", () => ({
  avisarDesarme: vi.fn(async (...a: unknown[]) => void H.avisos.push(a)),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/camaras/ezviz-control-registro.server", () => ({
  registrarControl: vi.fn(async (...a: unknown[]) => void H.registros.push(a)),
}));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: {
    list: async (tenantId: string) => H.camarasPorTenant[tenantId] ?? [],
    capturas: async () => H.fotos.map((f, i) => ({ id: `cap-${i}`, nota: f.nota })),
  },
}));
vi.mock("@/lib/db/camaras-hik-connect.db", () => ({
  CamarasHikConnectDB: {
    enlaceParaVideo: async (tenantId: string, id: string) => H.enlaces[`${tenantId}:${id}`] ?? null,
    credenciales: async () => ({
      ok: true,
      valor: { appKey: "ak", secretKey: "sk", region: "sa" },
    }),
  },
}));
vi.mock("@/lib/camaras/hik-connect-api.server", () => ({
  permisoDeControl: async () => ({
    ok: true,
    valor: {
      appToken: "at.permiso-de-prueba",
      dominioVideo: "https://isaopen.ezvizlife.com",
      token: "tok",
      vence: Date.now() + 3_600_000,
      dominioApi: "https://isa.hikcentralconnect.com",
    },
  }),
}));
vi.mock("@/lib/camaras/ingesta.server", () => ({
  guardarFoto: vi.fn(async (_d: unknown, webp: Buffer, meta: { nota: string | null }) => {
    H.fotos.push({ nota: meta.nota, bytes: webp.length });
    return true;
  }),
}));

import { GET, POST } from "@/app/api/admin/camaras/[id]/control/route";
import { cifrarComoHik } from "@/lib/camaras/ezviz-foto";

const como = (role: string, tenantId = "t-blas") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
const req = (method: "GET" | "POST", body?: unknown) =>
  new NextRequest("http://localhost/api/admin/camaras/x/control", {
    method,
    headers: { cookie: "buleje-admin-sess=x", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const rutas = () => H.llamadas.map((l) => new URL(l.url).pathname);
/** Corre lo que la ruta dejó para `after()` (registro, aviso, apagado). */
const correrDespues = async () => {
  for (const f of H.despues.splice(0)) await f();
};

beforeEach(() => {
  H.llamadas.length = 0;
  H.despues.length = 0;
  H.fotos.length = 0;
  H.registros.length = 0;
  H.avisos.length = 0;
  H.cupos.length = 0;
  H.sinCupo.clear();
  H.alarmaHabilitada = false;
  H.binario = null;
  H.camarasPorTenant = {
    "t-blas": [{ id: "cam_entrada", nombre: "Entrada" }],
    "t-otro": [{ id: "cam_ajena", nombre: "Ajena" }],
  };
  H.enlaces = {
    "t-blas:cam_entrada": { resourceId: "r1", deviceSerial: "GU2373717", codigo: "ABCDEF" },
    "t-otro:cam_ajena": { resourceId: "r2", deviceSerial: "GU0000001", codigo: null },
  };
  H.ezviz = () => ({ code: "200", msg: "Operation succeeded" });
  como("admin");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      const body = typeof init.body === "string" ? init.body : "";
      H.llamadas.push({ url, headers, body });
      if (H.binario && !url.includes("/api/"))
        return new Response(new Uint8Array(H.binario), { status: 200 });
      return new Response(JSON.stringify(H.ezviz(url, new URLSearchParams(body))), { status: 200 });
    }),
  );
});

describe("roles y tenant", () => {
  it("sin sesión → 401 en GET y POST (nunca 404)", async () => {
    H.payload = null;
    expect((await GET(req("GET"), ctx("cam_entrada"))).status).toBe(401);
    expect(
      (await POST(req("POST", { accion: "ptz", direccion: "left" }), ctx("cam_entrada"))).status,
    ).toBe(401);
  });

  it("cámara de otro negocio → 404 y no se llama a EZVIZ", async () => {
    const r = await POST(req("POST", { accion: "ptz", direccion: "left" }), ctx("cam_ajena"));
    expect(r.status).toBe(404);
    expect(H.llamadas).toHaveLength(0);
  });

  it("almacenero mueve pero no arma, no apaga el micrófono ni hace sonar la alarma", async () => {
    como("almacenero");
    expect(
      (await POST(req("POST", { accion: "ptz", direccion: "up" }), ctx("cam_entrada"))).status,
    ).toBe(200);
    for (const cuerpo of [
      { accion: "deteccion", activa: false },
      { accion: "microfono", activa: false },
      { accion: "alarma", activa: true },
    ])
      expect((await POST(req("POST", cuerpo), ctx("cam_entrada"))).status).toBe(403);
    expect(rutas()).toEqual(["/api/lapp/device/ptz/start"]);
    /* El rol se mira antes del cupo: los 403 no gastaron nada. */
    expect(H.cupos).toEqual(["camaras:control:ptz|t-blas:qa-almacenero"]);
  });

  it("cajero no toca nada", async () => {
    como("cajero");
    expect(
      (await POST(req("POST", { accion: "ptz", direccion: "up" }), ctx("cam_entrada"))).status,
    ).toBe(403);
    expect(H.llamadas).toHaveLength(0);
  });

  it("pedido inválido → 400 sin llamar a EZVIZ", async () => {
    for (const malo of [
      { accion: "ptz", direccion: "zoom" },
      { accion: "alarma", activa: true, duracion: 999 },
      { accion: "isapi" },
    ])
      expect((await POST(req("POST", malo), ctx("cam_entrada"))).status).toBe(400);
    expect(H.llamadas).toHaveLength(0);
  });
});

describe("mover", () => {
  it("empezar y frenar van a isaopen con el permiso en el form", async () => {
    await POST(req("POST", { accion: "ptz", direccion: "right" }), ctx("cam_entrada"));
    await POST(
      req("POST", { accion: "ptz", direccion: "stop", ultima: "right" }),
      ctx("cam_entrada"),
    );
    expect(H.llamadas.map((l) => new URL(l.url).origin)).toEqual([
      "https://isaopen.ezvizlife.com",
      "https://isaopen.ezvizlife.com",
    ]);
    const [a, b] = H.llamadas.map((l) => new URLSearchParams(l.body));
    expect(Object.fromEntries(a)).toEqual({
      accessToken: "at.permiso-de-prueba",
      deviceSerial: "GU2373717",
      channelNo: "1",
      direction: "3",
      speed: "1",
    });
    expect(b.get("direction")).toBe("3");
    expect(rutas()).toEqual(["/api/lapp/device/ptz/start", "/api/lapp/device/ptz/stop"]);
    /* Sólo el empezar se anota (el frenar es la otra mitad del mismo toque),
       y dentro de `after()`: en Vercel un `void` suelto se puede perder. */
    expect(H.registros).toHaveLength(0);
    await correrDespues();
    expect(H.registros).toHaveLength(1);
  });

  it("tope de la cámara → 422 con el mensaje en español", async () => {
    H.ezviz = () => ({ code: "60005", msg: "right limit" });
    const r = await POST(req("POST", { accion: "ptz", direccion: "right" }), ctx("cam_entrada"));
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(/tope de la derecha/);
  });
});

describe("detección, micrófono y alarma (admin)", () => {
  it("detección: cambia y devuelve lo que la cámara dice después", async () => {
    H.ezviz = (url) =>
      url.endsWith("/device/info")
        ? { code: "200", data: { defence: 0, status: 1 } }
        : { code: "200", msg: "Operation succeeded" };
    const r = await POST(req("POST", { accion: "deteccion", activa: false }), ctx("cam_entrada"));
    expect(await r.json()).toEqual({ ok: true, deteccion: false });
    expect(new URLSearchParams(H.llamadas[0].body).get("isDefence")).toBe("0");
  });

  it("desarmar avisa al dueño; armar no", async () => {
    await POST(req("POST", { accion: "deteccion", activa: false }), ctx("cam_entrada"));
    await POST(req("POST", { accion: "microfono", activa: false }), ctx("cam_entrada"));
    await POST(req("POST", { accion: "deteccion", activa: true }), ctx("cam_entrada"));
    await correrDespues();
    expect(H.avisos.map((a) => (a as unknown[])[3])).toEqual(["deteccion", "microfono"]);
    expect(H.registros).toHaveLength(3);
  });

  it("detección/micrófono: cupo estricto por persona → 429 sin llamar a EZVIZ", async () => {
    H.sinCupo.add("camaras:control:ajustes");
    const r = await POST(req("POST", { accion: "deteccion", activa: false }), ctx("cam_entrada"));
    expect(r.status).toBe(429);
    expect(H.llamadas).toHaveLength(0);
  });
});

describe("alarma", () => {
  it("DESHABILITADA: sonar → 409 sin llamar a EZVIZ ni gastar cupo", async () => {
    const r = await POST(
      req("POST", { accion: "alarma", activa: true, duracion: 15 }),
      ctx("cam_entrada"),
    );
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/después de probarla en el sitio/);
    expect(H.llamadas).toHaveLength(0);
    expect(H.cupos).toHaveLength(0);
    expect(H.despues).toHaveLength(0);
  });

  it("apagar anda siempre y sin cupo, aunque los cupos estén agotados", async () => {
    for (const k of ["ptz", "ajustes", "foto", "alarma", "leer"])
      H.sinCupo.add(`camaras:control:${k}`);
    for (let i = 0; i < 5; i++)
      expect(
        (await POST(req("POST", { accion: "alarma", activa: false }), ctx("cam_entrada"))).status,
      ).toBe(200);
    expect(H.cupos).toHaveLength(0);
    expect(rutas().every((r) => r === "/api/v3/device/defence")).toBe(true);
    expect(H.llamadas.every((l) => new URLSearchParams(l.body).get("status") === "1")).toBe(true);
  });

  it("habilitada: dispara con status 2 por header y deja programado el apagado", async () => {
    H.alarmaHabilitada = true;
    const r = await POST(
      req("POST", { accion: "alarma", activa: true, duracion: 5 }),
      ctx("cam_entrada"),
    );
    expect(await r.json()).toEqual({ ok: true, activa: true, duracion: 5 });
    const l = H.llamadas[0];
    expect(new URL(l.url).pathname).toBe("/api/v3/device/defence");
    expect(l.headers.accesstoken).toBe("at.permiso-de-prueba");
    expect(l.headers.deviceserial).toBe("GU2373717");
    expect(new URLSearchParams(l.body).get("status")).toBe("2");
    /* Cupo por persona y por IP. */
    expect(H.cupos).toEqual([
      "camaras:control:alarma|t-blas:qa-admin",
      "camaras:control:alarma|ip:200.0.0.1",
    ]);
    vi.useFakeTimers();
    const pendiente = correrDespues();
    await vi.advanceTimersByTimeAsync(5_000);
    await pendiente;
    vi.useRealTimers();
    expect(new URLSearchParams(H.llamadas[1].body).get("status")).toBe("1");
  });

  it("habilitada: un «sonar» con falla dudosa devuelve «quizá sonando» y programa el apagado", async () => {
    H.alarmaHabilitada = true;
    H.ezviz = (url, body) =>
      body.get("status") === "2" ? { code: "20008", msg: "timeout" } : { code: "200" };
    const r = await POST(
      req("POST", { accion: "alarma", activa: true, duracion: 5 }),
      ctx("cam_entrada"),
    );
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ estado: "quiza_sonando", duracion: 5 });
    vi.useFakeTimers();
    const pendiente = correrDespues();
    await vi.advanceTimersByTimeAsync(5_000);
    await pendiente;
    vi.useRealTimers();
    expect(H.llamadas.map((x) => new URLSearchParams(x.body).get("status"))).toEqual(["2", "1"]);
  });

  it("habilitada: un «sonar» rechazado seguro (sin permiso) no queda «quizá sonando»", async () => {
    H.alarmaHabilitada = true;
    H.ezviz = () => ({ code: "20018", msg: "no permission" });
    const r = await POST(req("POST", { accion: "alarma", activa: true }), ctx("cam_entrada"));
    expect(r.status).toBe(422);
    expect((await r.json()).estado).toBeUndefined();
    expect(H.despues).toHaveLength(0);
  });
});

describe("foto", () => {
  it("baja la foto de EZVIZ, la descifra y la guarda «del vivo»", async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 36, channels: 3, background: { r: 64, g: 96, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    H.binario = cifrarComoHik(jpeg, "ABCDEF");
    H.ezviz = () => ({
      code: "200",
      data: { picUrl: "https://pmssa1.ezvizlife.com:8444/image/oracle/pic/abc/common?Expires=1" },
    });
    const r = await POST(req("POST", { accion: "captura" }), ctx("cam_entrada"));
    expect(r.status).toBe(200);
    expect(H.fotos).toHaveLength(1);
    expect(H.fotos[0].nota).toMatch(/^del vivo/);
  });

  it("una URL de foto fuera de EZVIZ no se baja", async () => {
    H.ezviz = () => ({ code: "200", data: { picUrl: "https://169.254.169.254/latest/meta-data" } });
    const r = await POST(req("POST", { accion: "captura" }), ctx("cam_entrada"));
    expect(r.status).toBe(502);
    expect(H.llamadas.every((l) => new URL(l.url).hostname.endsWith(".ezvizlife.com"))).toBe(true);
    expect(H.fotos).toHaveLength(0);
  });
});

describe("GET: qué botones dibujar", () => {
  it("capacidades reales + estado; el almacenero no configura", async () => {
    como("almacenero");
    H.ezviz = (url) => {
      if (url.endsWith("/capacity"))
        return {
          code: "200",
          data: {
            support_ptz: "1",
            ptz_left_right: "1",
            ptz_top_bottom: "1",
            support_defence: "1",
            support_capture: "1",
            support_active_defense: "1",
            support_audio_onoff: "1",
          },
        };
      if (url.endsWith("/device/info")) return { code: "200", data: { status: 1, defence: 1 } };
      if (url.endsWith("/status/get"))
        return { code: "200", data: { battryStatus: 92, diskState: "0---" } };
      if (url.endsWith("/sound/status")) return { code: "200", data: { enable: 1 } };
      return { code: "10001" };
    };
    const r = await GET(req("GET"), ctx("cam_entrada"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      capacidades: {
        mover: true,
        moverVertical: true,
        deteccion: true,
        alarma: true,
        foto: true,
        microfono: true,
      },
      deteccion: true,
      microfono: true,
      enLinea: true,
      bateria: 92,
      tarjeta: "ok",
      puedeConfigurar: false,
      alarmaHabilitada: false,
    });
    expect(
      JSON.stringify(await GET(req("GET"), ctx("cam_entrada")).then((x) => x.json())),
    ).not.toMatch(/at\./);
  });
});
