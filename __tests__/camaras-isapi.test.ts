// @vitest-environment node
/**
 * __tests__/camaras-isapi.test.ts
 *
 * Cliente ISAPI de Hikvision. NO hay cámara en esta red (escaneada el
 * 2026-09-15: sólo contesta el router), así que la cámara está simulada — pero
 * la simulación no es complaciente: el servidor falso **verifica de verdad** el
 * hash del header Digest con la clave, igual que lo haría el firmware. Si el
 * `response` que arma el cliente está mal, el falso contesta 401 y los tests
 * del camino feliz se caen.
 *
 * Lo que se fija acá:
 *  - el header Digest contra el ejemplo canónico de la RFC 2617 (valor conocido);
 *  - que una clave con `@` o `/` no parta la URL RTSP;
 *  - los seis motivos de falla, cada uno con su mensaje accionable;
 *  - que NINGÚN mensaje de error lleve la clave adentro.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  armarAutorizacion,
  leerDesafio,
  leerInfoDelAparato,
  moverPtz,
  olvidarSesiones,
  probarCamara,
  traerSnapshot,
  urlRtsp,
  urlRtspEnmascarada,
  type CredencialesCamara,
} from "@/lib/camaras/isapi";

// ───────────────────────────── Cámara simulada ───────────────────────────

const CLAVE = "Cla/ve@Secreta#2026";
const CAMARA: CredencialesCamara = { host: "192.168.1.64", puerto: 80, usuario: "admin", clave: CLAVE };

const NONCE = "4d5237356533363a3834383a3462";
const REALM = "IP Camera(C2543)";
const DESAFIO = `Digest qop="auth", realm="${REALM}", nonce="${NONCE}", stale="FALSE"`;

const XML_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<deviceName></deviceName>
<deviceID>48443031-3131-3234-3131-bcad28c3a1b2</deviceID>
<model>DS-2CD2043G2-I</model>
<serialNumber>DS-2CD2043G2-I20230412AAWRJ12345678</serialNumber>
<firmwareVersion>V5.7.3</firmwareVersion>
<videoInputPortNums>1</videoInputPortNums>
</DeviceInfo>`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

interface Llamada {
  ruta: string;
  metodo: string;
  auth: string | null;
  cuerpo: string | null;
  tieneSignal: boolean;
}

function md5(t: string): string {
  return createHash("md5").update(t, "utf8").digest("hex");
}

function paramsDe(crudo: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const re = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo)) !== null) salida[m[1].toLowerCase()] = (m[2] ?? m[3] ?? "").replace(/\\(.)/g, "$1");
  return salida;
}

/** Lo que hace el firmware: recalcula el hash y compara. */
function firmaValida(auth: string | null, metodo: string, ruta: string): boolean {
  if (!auth?.startsWith("Digest ")) return false;
  const p = paramsDe(auth.slice(7));
  if (p.username !== CAMARA.usuario || p.nonce !== NONCE || p.uri !== ruta) return false;
  const ha1 = md5(`${CAMARA.usuario}:${REALM}:${CLAVE}`);
  const ha2 = md5(`${metodo}:${ruta}`);
  const esperado = p.qop ? md5(`${ha1}:${NONCE}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`) : md5(`${ha1}:${NONCE}:${ha2}`);
  return p.response === esperado;
}

function camaraFalsa(rutas: Record<string, () => Response>) {
  const llamadas: Llamada[] = [];
  const fetchFalso = vi.fn(async (entrada: string | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(entrada));
    const ruta = `${u.pathname}${u.search}`;
    const metodo = init?.method ?? "GET";
    const auth = new Headers(init?.headers as HeadersInit).get("authorization");
    llamadas.push({
      ruta,
      metodo,
      auth,
      cuerpo: typeof init?.body === "string" ? init.body : null,
      tieneSignal: Boolean(init?.signal),
    });
    if (!firmaValida(auth, metodo, ruta)) {
      return new Response("<html><body>401 Unauthorized</body></html>", {
        status: 401,
        headers: { "WWW-Authenticate": DESAFIO, "Content-Type": "text/html" },
      });
    }
    const manejador = rutas[ruta];
    return manejador ? manejador() : new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetchFalso);
  return { llamadas, fetchFalso };
}

/** Un `fetch` que siempre explota con el error que se le pasa. */
function fetchQueExplota(error: unknown) {
  const fn = vi.fn(async () => {
    throw error;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const xml = (cuerpo: string, estado = 200) =>
  new Response(cuerpo, { status: estado, headers: { "Content-Type": "application/xml" } });
const jpeg = () => new Response(JPEG, { status: 200, headers: { "Content-Type": "image/jpeg" } });

beforeEach(() => {
  vi.unstubAllGlobals();
  olvidarSesiones();
});

// ─────────────────────────── 1. Digest (RFC 2617) ────────────────────────

describe("leerDesafio", () => {
  it("lee el WWW-Authenticate real de una Hikvision", () => {
    const d = leerDesafio(DESAFIO);
    expect(d).toEqual({
      esquema: "digest",
      parametros: { qop: "auth", realm: REALM, nonce: NONCE, stale: "FALSE" },
    });
  });

  it("con Basic y Digest en la misma línea gana Digest (Basic manda la clave en claro)", () => {
    const d = leerDesafio(`Basic realm="IP Camera", Digest qop="auth", realm="${REALM}", nonce="${NONCE}"`);
    expect(d?.esquema).toBe("digest");
    expect(d?.parametros.nonce).toBe(NONCE);
  });

  it("si sólo ofrece Basic, lo acepta", () => {
    expect(leerDesafio('Basic realm="IP Camera"')).toEqual({ esquema: "basic", parametros: { realm: "IP Camera" } });
  });

  it("sin cabecera o con basura devuelve null", () => {
    expect(leerDesafio(null)).toBeNull();
    expect(leerDesafio("")).toBeNull();
    expect(leerDesafio("Negotiate")).toBeNull();
  });
});

describe("armarAutorizacion", () => {
  /* Ejemplo canónico de la RFC 2617 §3.5: si el hash cambia, algo se rompió. */
  const DESAFIO_RFC = leerDesafio(
    'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
  );

  it("reproduce el valor conocido de la RFC", () => {
    const h = armarAutorizacion(DESAFIO_RFC!, {
      usuario: "Mufasa",
      clave: "Circle Of Life",
      metodo: "GET",
      uri: "/dir/index.html",
      cnonce: "0a4f113b",
      nc: 1,
    });
    expect(h).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(h).toContain("qop=auth");
    expect(h).toContain("nc=00000001");
    expect(h).toContain('cnonce="0a4f113b"');
    expect(h).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
    expect(h).toContain('uri="/dir/index.html"');
  });

  it("el contador nc va en 8 dígitos hexadecimales", () => {
    const h = armarAutorizacion(DESAFIO_RFC!, { usuario: "u", clave: "p", metodo: "GET", uri: "/x", nc: 255 });
    expect(h).toContain("nc=000000ff");
  });

  it("MD5-sess y SHA-256 dan respuestas distintas de MD5 pelado", () => {
    const base = { usuario: "u", clave: "p", metodo: "GET", uri: "/x", cnonce: "abc", nc: 1 };
    const plano = armarAutorizacion({ esquema: "digest", parametros: { nonce: "n", realm: "r", qop: "auth" } }, base);
    const sess = armarAutorizacion({ esquema: "digest", parametros: { nonce: "n", realm: "r", qop: "auth", algorithm: "MD5-sess" } }, base);
    const sha = armarAutorizacion({ esquema: "digest", parametros: { nonce: "n", realm: "r", qop: "auth", algorithm: "SHA-256" } }, base);
    expect(plano).not.toBe(sess);
    expect(sha).toMatch(/response="[0-9a-f]{64}"/); // SHA-256 = 64 hex
    expect(plano).toMatch(/response="[0-9a-f]{32}"/);
  });

  it("sin nonce o con un algoritmo que no existe devuelve null (mejor que firmar mal)", () => {
    expect(armarAutorizacion({ esquema: "digest", parametros: { realm: "r" } }, { usuario: "u", clave: "p", metodo: "GET", uri: "/x" })).toBeNull();
    expect(
      armarAutorizacion({ esquema: "digest", parametros: { nonce: "n", algorithm: "GOST-3411" } }, { usuario: "u", clave: "p", metodo: "GET", uri: "/x" }),
    ).toBeNull();
  });

  it("Basic arma el base64 de usuario:clave", () => {
    const h = armarAutorizacion({ esquema: "basic", parametros: {} }, { usuario: "admin", clave: "1234", metodo: "GET", uri: "/x" });
    expect(h).toBe(`Basic ${Buffer.from("admin:1234").toString("base64")}`);
  });
});

// ──────────────────────────────── 2. RTSP ────────────────────────────────

describe("urlRtsp", () => {
  it("una clave con @ y / no parte la URL", () => {
    const u = new URL(urlRtsp(CAMARA));
    expect(u.hostname).toBe("192.168.1.64");
    expect(u.port).toBe("554");
    expect(u.pathname).toBe("/Streaming/Channels/101");
    expect(decodeURIComponent(u.username)).toBe("admin");
    expect(decodeURIComponent(u.password)).toBe(CLAVE);
    expect(urlRtsp(CAMARA)).toContain("%40"); // el @ viajó escapado
    expect(urlRtsp(CAMARA)).toContain("%2F"); // y la barra también
  });

  it("canal y calidad eligen el stream (101 alta, 102 baja, 201 canal 2)", () => {
    expect(urlRtsp(CAMARA, "baja")).toMatch(/\/Streaming\/Channels\/102$/);
    expect(urlRtsp({ ...CAMARA, canal: 2 })).toMatch(/\/Streaming\/Channels\/201$/);
    expect(urlRtsp({ ...CAMARA, canal: 0 })).toMatch(/\/Streaming\/Channels\/101$/); // canal inválido → 1
  });

  it("limpia lo que el usuario escribe de más en el host", () => {
    expect(urlRtsp({ ...CAMARA, host: "http://192.168.1.64/" })).toContain("@192.168.1.64:554/");
    expect(urlRtsp({ ...CAMARA, host: "192.168.1.64:8080" })).toContain("@192.168.1.64:554/");
  });

  it("la versión enmascarada no lleva la clave", () => {
    const visible = urlRtspEnmascarada(CAMARA);
    expect(visible).not.toContain(CLAVE);
    expect(visible).not.toContain(encodeURIComponent(CLAVE));
    expect(visible).toContain("admin:***@192.168.1.64:554");
  });
});

// ─────────────────────────── 3. XML sin librería ─────────────────────────

describe("leerInfoDelAparato", () => {
  it("saca los cuatro campos y tolera el namespace", () => {
    expect(leerInfoDelAparato(XML_INFO)).toEqual({
      modelo: "DS-2CD2043G2-I",
      firmware: "V5.7.3",
      serie: "DS-2CD2043G2-I20230412AAWRJ12345678",
      nombre: null, // <deviceName></deviceName> vacío es null, no ""
      canales: 1,
      soportaPtz: false,
    });
    const conNs = leerInfoDelAparato("<ns:DeviceInfo><ns:model>DS-2DE4A425IW-DE</ns:model></ns:DeviceInfo>");
    expect(conNs?.modelo).toBe("DS-2DE4A425IW-DE");
    expect(conNs?.firmware).toBeNull();
  });

  it("lo que no es un deviceInfo de Hikvision devuelve null", () => {
    expect(leerInfoDelAparato("<html><body>Router login</body></html>")).toBeNull();
    expect(leerInfoDelAparato("{\"json\":true}")).toBeNull();
  });
});

// ──────────────────────── 4. Camino feliz (simulado) ─────────────────────

describe("probarCamara contra una cámara simulada que valida el Digest", () => {
  it("identifica el aparato, descubre la ruta de la foto y detecta el PTZ", async () => {
    const { llamadas } = camaraFalsa({
      "/ISAPI/System/deviceInfo": () => xml(XML_INFO),
      "/Streaming/channels/101/picture": () => jpeg(), // el firmware viejo: sólo la ruta sin /ISAPI
      "/ISAPI/PTZCtrl/channels/1/capabilities": () => xml("<PTZChanelCap/>"),
    });

    const r = await probarCamara(CAMARA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.info).toMatchObject({ modelo: "DS-2CD2043G2-I", firmware: "V5.7.3", nombre: null, soportaPtz: true });
    expect(r.valor.rutaSnapshot).toBe("/Streaming/channels/101/picture");
    expect(r.valor.ms).toBeGreaterThanOrEqual(0);

    // La primera vez van dos pedidos (el 401 y el firmado); después reusa el desafío.
    expect(llamadas[0].auth).toBeNull();
    expect(llamadas[1].auth).toContain("Digest ");
    expect(llamadas.filter((l) => l.auth === null)).toHaveLength(1);
    expect(llamadas.map((l) => l.ruta)).toEqual([
      "/ISAPI/System/deviceInfo",
      "/ISAPI/System/deviceInfo",
      "/ISAPI/Streaming/channels/101/picture", // 404 → prueba la siguiente
      "/Streaming/channels/101/picture",
      "/ISAPI/PTZCtrl/channels/1/capabilities",
    ]);
    // Timeout propio en TODOS los pedidos: una cámara apagada no cuelga el panel.
    expect(llamadas.every((l) => l.tieneSignal)).toBe(true);
  });

  it("sin PTZ (404 en capabilities) igual conecta, con soportaPtz false", async () => {
    camaraFalsa({
      "/ISAPI/System/deviceInfo": () => xml(XML_INFO),
      "/ISAPI/Streaming/channels/101/picture": () => jpeg(),
    });
    const r = await probarCamara(CAMARA);
    expect(r.ok && r.valor.info.soportaPtz).toBe(false);
    expect(r.ok && r.valor.rutaSnapshot).toBe("/ISAPI/Streaming/channels/101/picture");
  });

  it("usa el fallback de ONVIF cuando las dos rutas de Hikvision dan 404", async () => {
    camaraFalsa({
      "/ISAPI/System/deviceInfo": () => xml(XML_INFO),
      "/onvif-http/snapshot?Profile_1": () => jpeg(),
    });
    const r = await probarCamara(CAMARA);
    expect(r.ok && r.valor.rutaSnapshot).toBe("/onvif-http/snapshot?Profile_1");
  });
});

describe("traerSnapshot", () => {
  it("devuelve el JPEG y su tipo, y recuerda la ruta que funcionó", async () => {
    const { llamadas } = camaraFalsa({ "/Streaming/channels/101/picture": () => jpeg() });

    const uno = await traerSnapshot(CAMARA);
    expect(uno.ok).toBe(true);
    if (!uno.ok) return;
    expect(uno.valor.tipo).toBe("image/jpeg");
    expect(Array.from(uno.valor.jpeg.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);

    const cuantasLaPrimera = llamadas.length;
    const dos = await traerSnapshot(CAMARA);
    expect(dos.ok).toBe(true);
    // La segunda foto es UN solo pedido: ni re-descubre la ruta ni re-negocia el Digest.
    expect(llamadas.length - cuantasLaPrimera).toBe(1);
    expect(llamadas[llamadas.length - 1].ruta).toBe("/Streaming/channels/101/picture");
  });

  /* La dirección la escribe el operario: si apunta a algo que devuelve un
     archivo enorme, el servidor no puede tragárselo entero en memoria. Se
     prueban las TRES rutas con lo mismo, porque el mensaje que ve el operario
     es el de la última que se intentó. */
  const enTodasLasRutas = (respuesta: () => Response) => ({
    "/ISAPI/Streaming/channels/101/picture": respuesta,
    "/Streaming/channels/101/picture": respuesta,
    "/onvif-http/snapshot?Profile_1": respuesta,
  });

  it("no se traga una respuesta que se declara gigante (content-length)", async () => {
    camaraFalsa(
      enTodasLasRutas(() => new Response(JPEG, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": "999999999" } })),
    );
    const r = await traerSnapshot(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("no-es-hikvision");
    expect(r.detalle).toContain("12 MB");
  });

  it("corta el chorro cuando no hay content-length y el cuerpo no para", async () => {
    let entregados = 0;
    camaraFalsa(
      enTodasLasRutas(
        () =>
          new Response(
            new ReadableStream({
              pull(controlador) {
                const pedazo = new Uint8Array(1024 * 1024); // 1 MB por vez
                pedazo[0] = 0xff;
                entregados += 1;
                controlador.enqueue(pedazo);
                if (entregados > 200) controlador.close(); // red de seguridad del test
              },
            }),
            { status: 200, headers: { "Content-Type": "image/jpeg" } },
          ),
      ),
    );
    const r = await traerSnapshot(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalle).toContain("12 MB");
    // Cortó cerca del tope en cada ruta, no en los 200 MB del generador.
    expect(entregados).toBeLessThan(60);
  });

  it("si en vez de una foto llega HTML, es no-es-hikvision", async () => {
    camaraFalsa({
      "/ISAPI/Streaming/channels/101/picture": () => new Response("<html>Login</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      "/Streaming/channels/101/picture": () => new Response("<html>Login</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      "/onvif-http/snapshot?Profile_1": () => new Response("<html>Login</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    });
    const r = await traerSnapshot(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("no-es-hikvision");
  });
});

describe("moverPtz", () => {
  it("manda el movimiento y después el freno en ceros", async () => {
    const { llamadas } = camaraFalsa({ "/ISAPI/PTZCtrl/channels/1/continuous": () => xml("<ResponseStatus><statusCode>1</statusCode></ResponseStatus>") });
    const r = await moverPtz(CAMARA, { x: 40, y: -20, zoom: 0 }, { ms: 0 });
    expect(r.ok).toBe(true);
    const puts = llamadas.filter((l) => l.metodo === "PUT" && l.auth);
    expect(puts).toHaveLength(2);
    expect(puts[0].cuerpo).toContain("<pan>40</pan><tilt>-20</tilt><zoom>0</zoom>");
    expect(puts[1].cuerpo).toContain("<pan>0</pan><tilt>0</tilt><zoom>0</zoom>");
  });

  it("recorta los valores fuera de rango en vez de mandarlos crudos", async () => {
    const { llamadas } = camaraFalsa({ "/ISAPI/PTZCtrl/channels/1/continuous": () => xml("<ResponseStatus/>") });
    await moverPtz(CAMARA, { x: 9999, y: -9999, zoom: Number.NaN }, { ms: 0 });
    expect(llamadas.find((l) => l.cuerpo?.includes("<pan>"))?.cuerpo).toContain("<pan>100</pan><tilt>-100</tilt><zoom>0</zoom>");
  });

  it("una cámara fija (404) lo dice con esas palabras", async () => {
    camaraFalsa({});
    const r = await moverPtz(CAMARA, { x: 10, y: 0, zoom: 0 }, { ms: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("rechazado");
    expect(r.detalle).toContain("cámara fija");
  });
});

// ───────────────────── 5. Los motivos de falla, uno por uno ──────────────

describe("motivos de falla", () => {
  it("401 siempre → credenciales (y reintentó firmado antes de rendirse)", async () => {
    const fetchFalso = vi.fn(
      async () => new Response("", { status: 401, headers: { "WWW-Authenticate": DESAFIO } }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probarCamara(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("credenciales");
    expect(r.detalle).toContain("usuario y la clave");
    expect(fetchFalso).toHaveBeenCalledTimes(2); // sin credenciales + firmado
  });

  it("ECONNREFUSED → inalcanzable, con la pista del puerto", async () => {
    fetchQueExplota(new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 192.168.1.64:80"), { code: "ECONNREFUSED" }) }));
    const r = await probarCamara(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("inalcanzable");
    expect(r.detalle).toContain("192.168.1.64:80");
    expect(r.detalle).toContain("puerto");
  });

  it("nombre que no resuelve (ENOTFOUND) → inalcanzable, con la pista de la IP", async () => {
    fetchQueExplota(new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND camara.local"), { code: "ENOTFOUND" }) }));
    const r = await probarCamara({ ...CAMARA, host: "camara.local" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("inalcanzable");
    expect(r.detalle).toContain("dirección IP");
  });

  it("aborto por tiempo → tiempo", async () => {
    fetchQueExplota(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const r = await probarCamara(CAMARA, { timeoutMs: 2000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("tiempo");
    expect(r.detalle).toContain("2 s");
  });

  it("200 con algo que no es Hikvision → no-es-hikvision", async () => {
    camaraFalsa({ "/ISAPI/System/deviceInfo": () => new Response("<html><body>Router</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }) });
    const r = await probarCamara(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("no-es-hikvision");
  });

  it("403 → rechazado (permiso del usuario o IP bloqueada por intentos)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    const r = await probarCamara(CAMARA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("rechazado");
    expect(r.detalle).toContain("403");
  });

  it("faltan datos → sin-configurar y NI SIQUIERA toca la red", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    for (const rota of [
      { ...CAMARA, host: "" },
      { ...CAMARA, usuario: "  " },
      { ...CAMARA, clave: "" },
      { ...CAMARA, puerto: 0 },
    ]) {
      const r = await probarCamara(rota);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("sin-configurar");
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("los segundos se muestran sin redondear de más (1500 ms → «1,5 s», no «2 s»)", async () => {
    fetchQueExplota(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    const r = await probarCamara(CAMARA, { timeoutMs: 1500 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalle).toContain("1,5 s");
  });

  /* Medido el 2026-09-15: Node ni intenta conectar a los puertos de su lista
     negra (21, 22, 25…) y el error de arriba sólo dice «fetch failed». */
  it("un puerto que Node bloquea se explica, no se reporta como «fetch failed»", async () => {
    fetchQueExplota(new TypeError("fetch failed", { cause: new Error("bad port") }));
    const r = await probarCamara({ ...CAMARA, puerto: 22 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("inalcanzable");
    expect(r.detalle).toContain("puerto 22");
    expect(r.detalle).not.toContain("fetch failed");
  });

  it("HTTPS contra un puerto que habla HTTP lo dice con todas las letras", async () => {
    fetchQueExplota(new TypeError("fetch failed", { cause: Object.assign(new Error("wrong version number"), { code: "ERR_SSL_WRONG_VERSION_NUMBER" }) }));
    const r = await probarCamara({ ...CAMARA, https: true, puerto: 80 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalle).toContain("HTTPS");
  });
});

// ────────────────── 6. La clave no sale NUNCA en un mensaje ──────────────

describe("la clave nunca viaja en un mensaje de error", () => {
  it("ningún detalle de ninguna falla la contiene", async () => {
    const detalles: string[] = [];

    const fallas: Array<() => void> = [
      () => fetchQueExplota(new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) })),
      () => fetchQueExplota(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
      () => vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 }))),
      () => vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401, headers: { "WWW-Authenticate": DESAFIO } }))),
      () => vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 200, headers: { "Content-Type": "text/html" } }))),
      /* El caso feo: un error de red cuyo mensaje trae la URL RTSP entera. */
      () => fetchQueExplota(new Error(`connect failed for rtsp://admin:${CLAVE}@192.168.1.64:554/`)),
      () => fetchQueExplota(new Error(`clave usada: ${encodeURIComponent(CLAVE)}`)),
    ];

    for (const preparar of fallas) {
      olvidarSesiones();
      preparar();
      for (const r of [await probarCamara(CAMARA), await traerSnapshot(CAMARA), await moverPtz(CAMARA, { x: 1, y: 1, zoom: 0 }, { ms: 0 })]) {
        if (!r.ok) detalles.push(r.detalle);
      }
    }

    expect(detalles.length).toBeGreaterThan(15);
    for (const d of detalles) {
      expect(d).not.toContain(CLAVE);
      expect(d).not.toContain(encodeURIComponent(CLAVE));
      expect(d).not.toContain("Secreta");
    }
  });
});
