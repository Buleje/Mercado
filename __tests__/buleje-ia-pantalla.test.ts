/**
 * Buleje IA (ADR-528), pantalla: lo que tiene lógica sin red ni React —
 * achicar fotos, armar el FormData, estado optimista, frases de error, URLs.
 */
import { describe, expect, it } from "vitest";
import { achicarFoto, armarFormData, medidasAchicadas, revisarAntesDeSumar, revisarParaSubir, type Lienzo } from "@/components/admin/buleje-ia/fotos";
import { confirmarEnvio, hayEnvioEnCurso, marcarEnviando, marcarFallo, mensajeOptimista, quitarMensaje, urlsLocales } from "@/components/admin/buleje-ia/optimista";
import { fraseDeError } from "@/components/admin/buleje-ia/api";
import { leerVista, urlDeVista } from "@/components/admin/buleje-ia/vistas";
import { fechaCorta, horaLima } from "@/components/admin/buleje-ia/formato";
import { jsonConexion, urlConClave } from "@/components/admin/buleje-ia/InstruccionesApps";
import { leeFotos } from "@/hooks/use-buleje-ia-modelos";
import type { MensajeApp, ProveedorCatalogo, ProveedorConfigurado } from "@/lib/ia-proveedores/tipos";

const archivo = (nombre: string, type: string, bytes: number) => new File([new Uint8Array(bytes)], nombre, { type });

function lienzoFalso(w: number, h: number, salida: Blob | null = new Blob([new Uint8Array(1000)], { type: "image/jpeg" })) {
  const llamadas: { medidas?: { ancho: number; alto: number }; cerrado: boolean } = { cerrado: false };
  const lienzo: Lienzo = {
    leer: async () => ({ width: w, height: h, dibujable: {} as CanvasImageSource, cerrar: () => (llamadas.cerrado = true) }),
    aJpeg: async (_img, medidas) => {
      llamadas.medidas = medidas;
      return salida;
    },
  };
  return { lienzo, llamadas };
}

describe("fotos", () => {
  it("achica el lado largo a 1600 sin agrandar", () => {
    expect(medidasAchicadas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasAchicadas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(medidasAchicadas(0, 600)).toEqual({ ancho: 0, alto: 0 });
  });
  it("revisa cupo, tipo y peso", () => {
    expect(revisarAntesDeSumar({ type: "image/png" }, 0)).toBeNull();
    expect(revisarAntesDeSumar({ type: "image/png" }, 4)).toMatch(/Hasta 4/);
    expect(revisarAntesDeSumar({ type: "application/pdf" }, 0)).toMatch(/no es una foto/);
    expect(revisarParaSubir({ type: "image/heic", size: 10 })).toMatch(/JPG, PNG o WEBP/);
    expect(revisarParaSubir({ type: "image/jpeg", size: 9 * 1024 * 1024 })).toMatch(/8 MB/);
    expect(revisarParaSubir({ type: "image/webp", size: 1000 })).toBeNull();
  });
  it("una foto grande sale JPEG a 1600 y suelta el bitmap", async () => {
    const { lienzo, llamadas } = lienzoFalso(4032, 3024);
    const r = await achicarFoto(archivo("recibo.png", "image/png", 5000), lienzo);
    expect(r.type).toBe("image/jpeg");
    expect(r.name).toBe("recibo.jpg");
    expect(llamadas.medidas).toEqual({ ancho: 1600, alto: 1200 });
    expect(llamadas.cerrado).toBe(true);
  });
  it("un JPEG chico y liviano va tal cual", async () => {
    const { lienzo, llamadas } = lienzoFalso(1200, 900);
    const f = archivo("a.jpg", "image/jpeg", 2000);
    expect(await achicarFoto(f, lienzo)).toBe(f);
    expect(llamadas.medidas).toBeUndefined();
  });
  it("si no se puede leer: pasa si es válida, frase si no", async () => {
    const roto: Lienzo = { leer: async () => Promise.reject(new Error("x")), aJpeg: async () => null };
    const ok = archivo("a.webp", "image/webp", 100);
    expect(await achicarFoto(ok, roto)).toBe(ok);
    await expect(achicarFoto(archivo("a.heic", "image/heic", 100), roto)).rejects.toThrow(/No pude abrir esa foto/);
  });
  it("arma el FormData del contrato, máximo 4 fotos", () => {
    const fotos = [1, 2, 3, 4, 5].map((i) => archivo(`f${i}.jpg`, "image/jpeg", 10));
    const fd = armarFormData("Gasté 120 en combustible", "conv1", fotos);
    expect(fd.get("texto")).toBe("Gasté 120 en combustible");
    expect(fd.get("conversacionId")).toBe("conv1");
    expect(fd.getAll("fotos")).toHaveLength(4);
    expect(armarFormData("hola", null, []).has("conversacionId")).toBe(false);
  });
});

describe("estado optimista", () => {
  const usuario: MensajeApp = { id: "u1", rol: "user", texto: "hola", creadoEl: "2026-11-01T15:00:00Z" };
  const asistente: MensajeApp = { id: "a1", rol: "assistant", texto: "¡Hola!", creadoEl: "2026-11-01T15:00:02Z" };
  it("se ve al instante y se cambia por el de verdad", () => {
    const tmp = mensajeOptimista("tmp-1", "hola", [{ nombre: "f.jpg", url: "blob:1" }]);
    expect(tmp.estado).toBe("enviando");
    expect(urlsLocales(tmp)).toEqual(["blob:1"]);
    const lista = [tmp];
    expect(hayEnvioEnCurso(lista)).toBe(true);
    const final = confirmarEnvio(lista, "tmp-1", usuario, asistente);
    expect(final.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(hayEnvioEnCurso(final)).toBe(false);
    expect(confirmarEnvio(final, "tmp-x", usuario, asistente)).toBe(final);
  });
  it("falla, reintenta y se quita", () => {
    const lista = [mensajeOptimista("tmp-1", "hola", [])];
    const mal = marcarFallo(lista, "tmp-1", "Sin conexión");
    expect(mal[0]).toMatchObject({ estado: "error", error: "Sin conexión" });
    expect(marcarEnviando(mal, "tmp-1")[0]).toMatchObject({ estado: "enviando", error: undefined });
    expect(quitarMensaje(mal, "tmp-1")).toEqual([]);
  });
});

describe("textos y direcciones", () => {
  it("frases de error sin códigos", () => {
    expect(fraseDeError(0)).toMatch(/internet/);
    expect(fraseDeError(401)).toMatch(/sesión/);
    expect(fraseDeError(500)).toMatch(/servidor/);
    expect(fraseDeError(500, "La clave no es válida")).toBe("La clave no es válida");
    expect(fraseDeError(429, "rate")).toMatch(/rápido/);
  });
  it("vistas por ?vista=", () => {
    expect(leerVista(null)).toBe("chat");
    expect(leerVista("raro")).toBe("chat");
    expect(leerVista("memoria")).toBe("memoria");
    expect(urlDeVista("chat", "c1")).toBe("/admin/ia?c=c1");
    expect(urlDeVista("modelos")).toBe("/admin/ia?vista=modelos");
  });
  it("fechas en hora de Pucallpa", () => {
    const ahora = new Date("2026-11-01T20:00:00Z"); // 15:00 en Lima
    expect(horaLima("2026-11-01T15:30:00Z")).toBe("10:30");
    expect(fechaCorta("2026-11-01T15:30:00Z", ahora)).toBe("10:30");
    expect(fechaCorta("2026-10-31T15:30:00Z", ahora)).toBe("ayer");
    expect(fechaCorta("2026-09-10T15:30:00Z", ahora)).toBe("jueves 10/09");
    expect(fechaCorta("2026-11-01T03:00:00Z", ahora)).toBe("ayer"); // 22:00 del 31 en Lima
  });
  it("conexión para Gemini y Cursor", () => {
    expect(urlConClave("https://x.pe/api/mcp/", "abc")).toBe("https://x.pe/api/mcp/t/abc");
    expect(JSON.parse(jsonConexion("gemini", "https://x.pe/api/mcp", "abc"))).toEqual({
      mcpServers: { buleje: { httpUrl: "https://x.pe/api/mcp", headers: { Authorization: "Bearer abc" } } },
    });
    expect(JSON.parse(jsonConexion("cursor", "u", "k")).mcpServers.buleje.url).toBe("u");
  });
  it("¿lee fotos el modelo?", () => {
    const catalogo = [{ id: "openai", modelosSugeridos: [{ id: "gpt-4o", vision: true }, { id: "o3-mini", vision: false }] }] as unknown as ProveedorCatalogo[];
    const p = (x: Partial<ProveedorConfigurado>) => ({ proveedor: "openai", modelo: "gpt-4o", modeloVision: null, ...x }) as ProveedorConfigurado;
    expect(leeFotos(p({}), catalogo)).toBe(true);
    expect(leeFotos(p({ modelo: "o3-mini" }), catalogo)).toBe(false);
    expect(leeFotos(p({ modelo: "o3-mini", modeloVision: "gpt-4o" }), catalogo)).toBe(true);
    expect(leeFotos(p({ modelo: "raro" }), catalogo)).toBeNull();
  });
});
