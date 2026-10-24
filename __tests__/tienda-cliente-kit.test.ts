/**
 * Kit «cómo te piden» de las tiendas individuales (2026-10-11): celular,
 * disposición de la imagen del pedido, envío por WhatsApp y lo que la tienda
 * toma de la cuenta de Google. Lo que dibuja canvas no se prueba aquí (jsdom no
 * tiene canvas); se prueba el plan que canvas sólo recorre.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  celularPeParaWhatsapp,
  formatearCelularPe,
  normalizarCelularPe,
} from "@/lib/tienda-cliente/celular";
import {
  ALTO_MAXIMO,
  ANCHO_IMAGEN,
  LETRA_MINIMA,
  cortarLineas,
  fechaPedidoLima,
  formatoSoles,
  inicialDe,
  planificarImagenPedido,
  textoSobre,
  type Medir,
} from "@/lib/tienda-cliente/imagen-pedido-plan";
import { enlaceWhatsapp, enviarPedidoWhatsapp, numeroParaWa } from "@/lib/tienda-cliente/compartir";
import { urlDeVuelta } from "@/components/store/cliente/use-cliente-tienda";
import { clienteDesdeUsuario } from "@/lib/tienda-cliente/cliente";
import type { DatosImagenPedido } from "@/lib/tienda-cliente/contrato";

describe("normalizarCelularPe", () => {
  it.each([
    ["987654321", "987654321"],
    ["987 654 321", "987654321"],
    ["987-654-321", "987654321"],
    ["+51 987 654 321", "987654321"],
    ["51987654321", "987654321"],
    ["0051 987654321", "987654321"],
    ["(+51) 987.654.321", "987654321"],
    ["  987654321  ", "987654321"],
  ])("acepta %s", (crudo, esperado) => {
    expect(normalizarCelularPe(crudo)).toBe(esperado);
  });

  it.each([
    ["", "vacío"],
    ["12345678", "8 dígitos"],
    ["887654321", "no empieza con 9"],
    ["9876543210", "10 dígitos"],
    ["+52 987654321", "otro país"],
    ["9876abc21", "letras"],
    ["061 571234", "fijo de Pucallpa"],
  ])("rechaza %s (%s)", (crudo) => {
    expect(normalizarCelularPe(crudo)).toBeNull();
  });

  it("no lanza con null/undefined", () => {
    expect(normalizarCelularPe(null)).toBeNull();
    expect(normalizarCelularPe(undefined)).toBeNull();
  });

  it("formatea y arma el número de WhatsApp", () => {
    expect(formatearCelularPe("+51987654321")).toBe("987 654 321");
    expect(celularPeParaWhatsapp("987-654-321")).toBe("51987654321");
    expect(celularPeParaWhatsapp("123")).toBeNull();
  });
});

describe("formatos de la imagen", () => {
  it("soles a la peruana sin Intl", () => {
    expect(formatoSoles(0)).toBe("S/ 0.00");
    expect(formatoSoles(25)).toBe("S/ 25.00");
    expect(formatoSoles(1234.5)).toBe("S/ 1,234.50");
    expect(formatoSoles(1234567.891)).toBe("S/ 1,234,567.89");
    expect(formatoSoles(Number.NaN)).toBe("S/ 0.00");
  });

  it("fecha en hora de Lima aunque el UTC ya sea mañana", () => {
    // 2026-10-12 02:30 UTC = domingo 11/10 21:30 en Lima.
    expect(fechaPedidoLima(new Date("2026-10-12T02:30:00Z"))).toBe("domingo 11/10 · 9:30 p. m.");
    expect(fechaPedidoLima(new Date("2026-09-10T17:05:00Z"))).toBe("jueves 10/09 · 12:05 p. m.");
    expect(fechaPedidoLima(new Date("2026-09-10T05:00:00Z"))).toBe("jueves 10/09 · 12:00 a. m.");
  });

  it("inicial y color del texto sobre el acento", () => {
    expect(inicialDe("  ácido hialurónico")).toBe("Á");
    expect(inicialDe("")).toBe("•");
    expect(textoSobre("#00a0a0")).toBe("#ffffff");
    expect(textoSobre("#fde68a")).toBe("#111827");
    expect(textoSobre("#22d3ee")).toBe("#111827");
    expect(textoSobre("rgb(17, 24, 39)")).toBe("#ffffff");
    expect(textoSobre("no-es-color")).toBe("#ffffff");
  });
});

/** 0,55 × tamaño por letra: cerca del promedio real de una sans a ese tamaño. */
const medirFalso: Medir = (t, f) => t.length * f.tam * 0.55;

describe("cortarLineas", () => {
  const medir = (s: string) => s.length * 10;

  it("parte por palabras sin pasar el ancho", () => {
    const l = cortarLineas("Labial mate rojo cereza de larga duración", 200, medir);
    expect(l.length).toBeGreaterThan(1);
    for (const r of l) expect(medir(r)).toBeLessThanOrEqual(200);
    expect(l.join(" ")).toBe("Labial mate rojo cereza de larga duración");
  });

  it("corta por letra una palabra más larga que el ancho (enlaces)", () => {
    const url = "https://maps.google.com/?q=-8.379123,-74.553456";
    const l = cortarLineas(url, 150, medir);
    expect(l.join("")).toBe(url);
    for (const r of l) expect(medir(r)).toBeLessThanOrEqual(150);
  });

  it("con tope de renglones termina en «…» dentro del ancho", () => {
    const l = cortarLineas("uno dos tres cuatro cinco seis siete ocho nueve diez", 100, medir, 2);
    expect(l).toHaveLength(2);
    expect(l[1].endsWith("…")).toBe(true);
    expect(medir(l[1])).toBeLessThanOrEqual(100);
  });

  it("texto vacío → sin renglones", () => {
    expect(cortarLineas("   ", 100, medir)).toEqual([]);
  });
});

const BASE: DatosImagenPedido = {
  negocio: { nombre: "Musa Belleza", colorAcento: "#c2185b", logo: "/logo.png" },
  lineas: [
    { nombre: "Labial mate rojo cereza", codigo: "LAB-01", cantidad: 2, precio: 25, imagen: "/a.jpg" },
    { nombre: "Sérum de vitamina C con ácido hialurónico para piel mixta", codigo: null, cantidad: 1, precio: 89.9, nota: "Tono claro, por favor" },
  ],
  total: 139.9,
  cliente: {
    nombre: "Ana Torres",
    celular: "987654321",
    entrega: "Ciudad Constitución",
    ubicacion: { lat: -9.85, lng: -75.01, precision: 12, enlaceMapa: "https://maps.google.com/?q=-9.850000,-75.010000", leidaEn: 0 },
    pago: "Yape",
  },
  notas: ["Envío gratis"],
  fecha: new Date("2026-10-11T20:00:00Z"),
};

describe("planificarImagenPedido", () => {
  it("1080 de ancho y ninguna letra bajo 32 px", () => {
    const plan = planificarImagenPedido(BASE, medirFalso, { conLogo: true, fotosOk: new Set(["/a.jpg"]) });
    expect(plan.ancho).toBe(ANCHO_IMAGEN);
    const textos = plan.ops.filter((o) => o.t === "texto");
    expect(textos.length).toBeGreaterThan(10);
    for (const t of textos) expect(t.fuente.tam).toBeGreaterThanOrEqual(LETRA_MINIMA);
  });

  it("lleva productos, total, datos del cliente y fecha de Lima", () => {
    const plan = planificarImagenPedido(BASE, medirFalso);
    const todo = plan.ops.flatMap((o) => (o.t === "texto" ? [o.texto] : [])).join(" | ");
    expect(todo).toContain("2 × Labial mate rojo");
    expect(todo).toContain("Cód. LAB-01");
    expect(todo).toContain("S/ 50.00");
    expect(todo).toContain("S/ 25.00 c/u");
    expect(todo).toContain("S/ 139.90");
    expect(todo).toContain("Ana Torres");
    expect(todo).toContain("987 654 321");
    expect(todo).toContain("Yape");
    expect(todo).toContain("maps.google.com");
    expect(todo).toContain("domingo 11/10 · 3:00 p. m.");
    expect(todo).toContain("3 productos");
  });

  it("sin foto cargada va la inicial; sin logo cargado no reserva su lugar", () => {
    const plan = planificarImagenPedido(BASE, medirFalso, { conLogo: false, fotosOk: new Set() });
    const fotos = plan.ops.filter((o) => o.t === "imagen");
    expect(fotos).toHaveLength(2);
    expect(fotos.every((f) => f.t === "imagen" && f.src === null)).toBe(true);
    expect(fotos[0].t === "imagen" && fotos[0].inicial).toBe("L");
  });

  it("el alto crece con los productos y nada se dibuja fuera", () => {
    const uno = planificarImagenPedido({ ...BASE, lineas: BASE.lineas.slice(0, 1) }, medirFalso);
    const dos = planificarImagenPedido(BASE, medirFalso);
    expect(dos.alto).toBeGreaterThan(uno.alto);
    for (const o of dos.ops) {
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeLessThan(dos.alto);
    }
  });

  it("un pedido enorme se recorta al tope y dice cuántos faltan", () => {
    const lineas = Array.from({ length: 200 }, (_, i) => ({ nombre: `Producto ${i + 1}`, codigo: null, cantidad: 1, precio: 1 }));
    const plan = planificarImagenPedido({ ...BASE, lineas, total: 200 }, medirFalso);
    expect(plan.alto).toBeLessThanOrEqual(ALTO_MAXIMO);
    expect(plan.lineasOmitidas).toBeGreaterThan(0);
    const todo = plan.ops.flatMap((o) => (o.t === "texto" ? [o.texto] : [])).join(" ");
    expect(todo).toContain(`y ${plan.lineasOmitidas} productos más`);
  });
});

describe("enviarPedidoWhatsapp", () => {
  const nav = globalThis.navigator;
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("wa.me con 51 delante de un celular de 9 dígitos", () => {
    expect(numeroParaWa("987 654 321")).toBe("51987654321");
    expect(numeroParaWa("+51 987654321")).toBe("51987654321");
    expect(enlaceWhatsapp("987654321", "Hola & chau")).toBe("https://wa.me/51987654321?text=Hola%20%26%20chau");
  });

  it("celular con Web Share: comparte la imagen; cerrar el menú = cancelado", async () => {
    const share = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DOMException("x", "AbortError"));
    vi.spyOn(nav, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Mobile");
    Object.assign(nav, { canShare: () => true, share });
    const blob = new Blob(["png"], { type: "image/png" });
    await expect(enviarPedidoWhatsapp({ blob, texto: "t", numero: "987654321" })).resolves.toEqual({ via: "compartir" });
    expect(share.mock.calls[0][0].files[0].name).toBe("pedido.png");
    await expect(enviarPedidoWhatsapp({ blob, texto: "t", numero: "987654321" })).resolves.toEqual({ via: "cancelado" });
  });

  it("computadora: copia la imagen y abre el chat del negocio", async () => {
    vi.spyOn(nav, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/141");
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(nav, "clipboard", { value: { write }, configurable: true });
    vi.stubGlobal("ClipboardItem", class {
      constructor(public items: Record<string, unknown>) {}
    });
    const open = vi.spyOn(window, "open").mockReturnValue({ opener: {} } as Window);
    const r = await enviarPedidoWhatsapp({ blob: new Blob(["png"], { type: "image/png" }), texto: "Pedido", numero: "987654321" });
    expect(r).toEqual({ via: "portapapeles" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://wa.me/51987654321?text=Pedido", "_blank");
  });

  it("sin imagen: abre el chat sólo con el texto", async () => {
    vi.spyOn(nav, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0)");
    const open = vi.spyOn(window, "open").mockReturnValue({ opener: {} } as Window);
    await expect(enviarPedidoWhatsapp({ blob: null, texto: "Hola", numero: "51987654321" })).resolves.toEqual({ via: "texto", descargada: false });
    expect(open).toHaveBeenCalledWith("https://wa.me/51987654321?text=Hola", "_blank");
  });
});

describe("cuenta de Google en la tienda", () => {
  it("sólo nombre, correo y foto; nombre de respaldo = el correo", () => {
    const u = { email: "ana@gmail.com", user_metadata: { full_name: "Ana Torres", avatar_url: "https://lh3/x" } };
    expect(clienteDesdeUsuario(u)).toEqual({ nombre: "Ana Torres", email: "ana@gmail.com", avatar: "https://lh3/x", proveedor: "google" });
    expect(clienteDesdeUsuario({ email: "beto@gmail.com", user_metadata: {} })?.nombre).toBe("beto");
    expect(clienteDesdeUsuario({ email: null, user_metadata: { given_name: "Ana", family_name: "T." } })?.nombre).toBe("Ana T.");
    expect(clienteDesdeUsuario(null)).toBeNull();
  });

  it("vuelve por el callback con la ruta de la tienda codificada", () => {
    expect(urlDeVuelta("http://localhost:3000", "/t/musa/tienda?bolsa=1")).toBe(
      "http://localhost:3000/api/auth/oauth/callback?next=%2Ft%2Fmusa%2Ftienda%3Fbolsa%3D1&origen=tienda",
    );
  });
});
