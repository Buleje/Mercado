import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conCodigo,
  leerCamaras,
  leerDireccion,
  leerStreamToken,
  leerToken,
  normalizarCodigo,
  pedidoCamaras,
  pedidoDireccion,
  rangoDeGrabacion,
  traducirError,
  venceDe,
} from "@/lib/camaras/hik-connect-api";
import { mensajeDelReproductor } from "@/components/admin/forestal/camaras/hik-connect-teams";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Hik-Connect for Teams OpenAPI (ADR-471). Las respuestas tienen la forma REAL:
 *  · errores: medidos el 05-10 contra isa/ius/ieu/isgp.hikcentralconnect.com
 *    con claves falsas (HTTP 200 + errorCode).
 *  · token y cámaras: la forma que lee Frens98/hikconnect-nvr (`api.py`), que
 *    funciona contra la API real; y la que documenta Syscom.
 */

const AK_NOT_FOUND = { message: "AK_NOT_FOUND{OPEN000001}", errorCode: "OPEN000001" };
const SIN_SECRET = {
  message: "param valid error,validated failed argument [secretKey]",
  errorCode: "OPEN000010",
};
const TOKEN_NOT_FOUND = { errorCode: "OPEN000006", message: "TOKEN_NOT_FOUND{OPEN000006}" };
const AHORA = Date.parse("2026-10-05T12:00:00Z");

const tokenOk = (extra: Record<string, unknown> = {}) => ({
  errorCode: "0",
  message: "success",
  data: {
    accessToken: "tok-1",
    expireTime: AHORA / 1000 + 7 * 86400,
    userId: "u1",
    areaDomain: "https://isa.hikcentralconnect.com",
    ...extra,
  },
});

describe("errores de Hikvision → español", () => {
  it("los medidos el 05-10 se traducen con su tipo", () => {
    expect(traducirError(AK_NOT_FOUND.errorCode, AK_NOT_FOUND.message)).toMatchObject({
      tipo: "clave",
      codigo: "OPEN000001",
    });
    expect(traducirError(SIN_SECRET.errorCode, SIN_SECRET.message).tipo).toBe("parametro");
    expect(traducirError(TOKEN_NOT_FOUND.errorCode, TOKEN_NOT_FOUND.message).tipo).toBe("token");
    expect(traducirError("OPEN000007", "TOKEN_ERROR{OPEN000007}").tipo).toBe("token");
    expect(traducirError("EVZ60019", "").mensaje).toMatch(/código de verificación/);
  });

  it("uno desconocido muestra el nombre que da Hikvision y su código, sin inventar", () => {
    const e = traducirError("OPEN000099", "SOMETHING_NEW{OPEN000099}");
    expect(e.tipo).toBe("otro");
    expect(e.mensaje).toContain("SOMETHING_NEW");
    expect(e.mensaje).toContain("OPEN000099");
  });

  it("un código nuevo con TOKEN en el nombre igual dispara el reintento", () => {
    expect(traducirError("OPEN000123", "TOKEN_EXPIRED{OPEN000123}").tipo).toBe("token");
  });
});

describe("token", () => {
  it("lee accessToken, areaDomain y expireTime en segundos epoch", () => {
    const r = leerToken(tokenOk(), "sa", AHORA);
    expect(r).toEqual({
      ok: true,
      valor: {
        token: "tok-1",
        vence: AHORA + 7 * 86400_000,
        dominioApi: "https://isa.hikcentralconnect.com",
      },
    });
  });

  it("acepta el expireTime ISO de Syscom y uno ilegible vale 1 h", () => {
    expect(venceDe("2026-10-12T12:00:00Z", AHORA)).toBe(Date.parse("2026-10-12T12:00:00Z"));
    expect(venceDe("mañana", AHORA)).toBe(AHORA + 3_600_000);
  });

  it("un areaDomain que no es de hikcentralconnect.com (o es http) no se usa: SSRF", () => {
    for (const malo of [
      "http://169.254.169.254",
      "https://evil.example.com",
      "https://hikcentralconnect.com.evil.io",
      "https://u:p@isa.hikcentralconnect.com",
    ]) {
      const r = leerToken(tokenOk({ areaDomain: malo }), "sa", AHORA);
      expect(r.ok && r.valor.dominioApi).toBe("https://isa.hikcentralconnect.com");
    }
  });

  it("el error real de una AppKey falsa vuelve como error, no como token", () => {
    expect(leerToken(AK_NOT_FOUND, "sa", AHORA)).toMatchObject({
      ok: false,
      error: { codigo: "OPEN000001" },
    });
    expect(leerToken("<html>502</html>", "sa", AHORA)).toMatchObject({
      ok: false,
      error: { tipo: "red" },
    });
  });
});

describe("streamtoken (lo de EZUIKit)", () => {
  it("lee appToken y el dominio de video; uno ajeno cae al de la región", () => {
    const ok = {
      errorCode: "0",
      data: { appKey: "ak", appToken: "at.123", streamAreaDomain: "https://isaopen.ezvizlife.com" },
    };
    expect(leerStreamToken(ok, "sa")).toEqual({
      ok: true,
      valor: { appToken: "at.123", dominioVideo: "https://isaopen.ezvizlife.com" },
    });
    const china = {
      errorCode: "0",
      data: { appToken: "at.123", streamAreaDomain: "https://open.ys7.com" },
    };
    expect(leerStreamToken(china, "sa")).toMatchObject({
      ok: true,
      valor: { dominioVideo: "https://isaopen.ezvizlife.com" },
    });
  });
});

describe("lista de cámaras", () => {
  it("forma real (data.camera + device.devInfo.serialNo) y forma Syscom (data.list)", () => {
    const real = {
      errorCode: "0",
      data: {
        camera: [
          {
            id: "res1",
            name: "Portón",
            device: { devInfo: { serialNo: "fx1234567", id: "dev1" } },
            onlineStatus: 1,
          },
          { name: "sin id" },
        ],
      },
    };
    expect(leerCamaras(real)).toEqual({
      ok: true,
      valor: {
        camaras: [
          { resourceId: "res1", nombre: "Portón", deviceSerial: "FX1234567", enLinea: true },
        ],
        hayMas: false,
      },
    });
    const syscom = {
      errorCode: "0",
      data: {
        total: 1,
        list: [{ resourceId: "r2", cameraName: "Patio", deviceSerial: "AB12", status: "offline" }],
      },
    };
    expect(leerCamaras(syscom)).toMatchObject({
      ok: true,
      valor: { camaras: [{ resourceId: "r2", nombre: "Patio", enLinea: false }] },
    });
  });

  it("pide toda la cuenta (areaID -1 + subáreas) de a 500", () => {
    expect(pedidoCamaras(2)).toEqual({
      pageIndex: "2",
      pageSize: 500,
      filter: { areaID: "-1", includeSubArea: "1", deviceID: "", deviceSerialNo: "" },
    });
  });
});

describe("dirección de video", () => {
  const base = { resourceId: "res1", deviceSerial: "FX1234567", calidad: "sd" as const };

  it("vivo = type 1, EZOPEN, SD = quality 2", () => {
    expect(pedidoDireccion({ ...base, tipo: "vivo" })).toEqual({
      ok: true,
      valor: {
        resourceId: "res1",
        deviceSerial: "FX1234567",
        type: "1",
        code: "0",
        protocol: "1",
        quality: "2",
      },
    });
  });

  it("grabación = type 3 (microSD) con rango del mismo día; uno cruzado se rechaza antes de salir", () => {
    const r = pedidoDireccion({
      ...base,
      tipo: "grabacion",
      desde: "2026-10-04 22:00:00",
      hasta: "2026-10-04 23:00:00",
    });
    expect(r).toMatchObject({
      ok: true,
      valor: { type: "3", startTime: "2026-10-04 22:00:00", stopTime: "2026-10-04 23:00:00" },
    });
    expect(
      pedidoDireccion({
        ...base,
        tipo: "grabacion",
        desde: "2026-10-04 23:00:00",
        hasta: "2026-10-05 01:00:00",
      }).ok,
    ).toBe(false);
    expect(
      pedidoDireccion({
        ...base,
        tipo: "grabacion",
        desde: "2026-10-04T22:00:00Z",
        hasta: "2026-10-04 23:00:00",
      }).ok,
    ).toBe(false);
  });

  it("rango del formulario: 1 hora, sin pasar la medianoche", () => {
    expect(rangoDeGrabacion("2026-10-04", "22:00")).toEqual({
      desde: "2026-10-04 22:00:00",
      hasta: "2026-10-04 23:00:00",
    });
    expect(rangoDeGrabacion("2026-10-04", "23:30")).toEqual({
      desde: "2026-10-04 23:30:00",
      hasta: "2026-10-04 23:59:59",
    });
    expect(rangoDeGrabacion("2026-10-04", "25:00")).toBeNull();
  });

  it("lee la URL EZOPEN; EVZ60019 (cifrada por HLS) vuelve traducido", () => {
    expect(
      leerDireccion({ errorCode: "0", data: { url: "ezopen://open.ezviz.com/FX1234567/1.live" } }),
    ).toEqual({
      ok: true,
      valor: "ezopen://open.ezviz.com/FX1234567/1.live",
    });
    expect(leerDireccion({ errorCode: "0", data: { url: "https://x/hls.m3u8" } }).ok).toBe(false);
    expect(leerDireccion({ errorCode: "EVZ60019", message: "encrypted" })).toMatchObject({
      ok: false,
      error: { tipo: "camara" },
    });
  });

  it("el código de verificación va dentro de la URL (ezopen://CODIGO@host/…) y no se duplica", () => {
    expect(conCodigo("ezopen://open.ezviz.com/FX1234567/1.live", "ABCDEF")).toBe(
      "ezopen://ABCDEF@open.ezviz.com/FX1234567/1.live",
    );
    expect(conCodigo("ezopen://XYZ@open.ezviz.com/FX1/1.live", "ABCDEF")).toBe(
      "ezopen://XYZ@open.ezviz.com/FX1/1.live",
    );
    expect(conCodigo("ezopen://open.ezviz.com/FX1/1.live", null)).toBe(
      "ezopen://open.ezviz.com/FX1/1.live",
    );
    expect(normalizarCodigo(" abc def ")).toBe("ABCDEF");
    expect(normalizarCodigo("ab")).toBeNull();
  });
});

describe("errores del reproductor EZUIKit", () => {
  it("nErrorCode 5 = código de verificación incorrecto (README de ezuikit-js)", () => {
    expect(
      mensajeDelReproductor({ type: "handleRunTimeInfoError", data: { nErrorCode: 5 } }),
    ).toMatch(/código de verificación/);
    expect(mensajeDelReproductor({ retcode: "EVZ20007", msg: "offline" })).toMatch(/desconectada/);
    expect(mensajeDelReproductor(undefined)).toMatch(/Reintentar/);
  });
});

/* ── La red, con fetch simulado: regiones, reintento del token, timeout ── */

describe("hik-connect-api.server", () => {
  const llamadas: { url: string; body: unknown; token: string | null }[] = [];
  let responder: (url: string, body: unknown) => unknown;

  beforeEach(() => {
    vi.resetModules();
    llamadas.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        const headers = (init.headers ?? {}) as Record<string, string>;
        llamadas.push({ url, body, token: headers.Token ?? null });
        const r = responder(url, body);
        if (r instanceof Error) throw r;
        return new Response(JSON.stringify(r), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const cargar = () => import("@/lib/camaras/hik-connect-api.server");

  it("«auto» sigue de región en región SÓLO mientras la AppKey no exista; se queda con la que contesta", async () => {
    responder = (url) =>
      url.startsWith("https://ius.")
        ? tokenOk({ areaDomain: "https://ius.hikcentralconnect.com" })
        : AK_NOT_FOUND;
    const { probarCredenciales } = await cargar();
    expect(await probarCredenciales("ak-12345678", "sk-12345678", "auto")).toEqual({
      ok: true,
      valor: { region: "us" },
    });
    expect(llamadas.map((l) => new URL(l.url).host)).toEqual([
      "isa.hikcentralconnect.com",
      "ius.hikcentralconnect.com",
    ]);
  });

  it("otro error (secret mal, sin red) corta: no tiene sentido probar más regiones", async () => {
    responder = () => SIN_SECRET;
    const { probarCredenciales } = await cargar();
    expect(await probarCredenciales("ak-12345678", "sk-12345678", "auto")).toMatchObject({
      ok: false,
      error: { codigo: "OPEN000010" },
    });
    expect(llamadas).toHaveLength(1);
  });

  it("sin respuesta de Hikvision → error de red (no se cuelga ni tira)", async () => {
    responder = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const { probarCredenciales } = await cargar();
    expect(await probarCredenciales("ak-12345678", "sk-12345678", "sa")).toMatchObject({
      ok: false,
      error: { tipo: "red" },
    });
  });

  it("token vencido en Hikvision → pide uno nuevo y repite UNA vez; manda `Token:` (no Bearer)", async () => {
    let tokens = 0;
    let listas = 0;
    responder = (url) => {
      if (url.endsWith("/token/get")) return tokenOk({ accessToken: `tok-${++tokens}` });
      listas++;
      return listas === 1
        ? TOKEN_NOT_FOUND
        : {
            errorCode: "0",
            data: {
              camera: [{ id: "res1", name: "Portón", device: { devInfo: { serialNo: "FX1" } } }],
            },
          };
    };
    const { listarCamarasHik } = await cargar();
    const r = await listarCamarasHik("t-main", {
      appKey: "ak-12345678",
      secretKey: "sk",
      region: "sa",
    });
    expect(r).toMatchObject({ ok: true, valor: [{ resourceId: "res1" }] });
    expect(llamadas.filter((l) => l.url.endsWith("/cameras/get")).map((l) => l.token)).toEqual([
      "tok-1",
      "tok-2",
    ]);
  });

  it("el token se reusa entre pedidos del mismo tenant y no se mezcla con otro tenant", async () => {
    responder = (url) =>
      url.endsWith("/token/get") ? tokenOk() : { errorCode: "0", data: { camera: [] } };
    const { listarCamarasHik } = await cargar();
    const cred = { appKey: "ak-12345678", secretKey: "sk", region: "sa" as const };
    await listarCamarasHik("t-main", cred);
    await listarCamarasHik("t-main", cred);
    await listarCamarasHik("t-otro", cred);
    expect(llamadas.filter((l) => l.url.endsWith("/token/get"))).toHaveLength(2);
  });

  it("dirección de video: appToken + dominio de video + URL EZOPEN, todo a la API del areaDomain", async () => {
    responder = (url) => {
      if (url.endsWith("/token/get")) return tokenOk();
      if (url.endsWith("/streamtoken/get"))
        return {
          errorCode: "0",
          data: {
            appKey: "ak",
            appToken: "at.9",
            streamAreaDomain: "https://isaopen.ezvizlife.com",
          },
        };
      return { errorCode: "0", data: { url: "ezopen://open.ezviz.com/FX1/1.live" } };
    };
    const { direccionDeVideo } = await cargar();
    const r = await direccionDeVideo(
      "t-main",
      { appKey: "ak-12345678", secretKey: "sk", region: "sa" },
      { resourceId: "res1", deviceSerial: "FX1", tipo: "vivo", calidad: "hd" },
    );
    expect(r).toEqual({
      ok: true,
      valor: {
        appToken: "at.9",
        dominioVideo: "https://isaopen.ezvizlife.com",
        url: "ezopen://open.ezviz.com/FX1/1.live",
      },
    });
    const dir = llamadas.find((l) => l.url.endsWith("/live/address/get"));
    expect(dir?.url).toBe("https://isa.hikcentralconnect.com/api/hccgw/video/v1/live/address/get");
    expect(dir?.body).toMatchObject({ protocol: "1", quality: "1", type: "1" });
  });
});
