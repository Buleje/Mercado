/**
 * «En vivo» y la guía de la DS-2CFSP4/4G (2026-10-05): a qué app lleva el
 * botón según el aparato, los valores de «HTTP Listening» y «último aviso».
 */
import { describe, expect, it } from "vitest";
import {
  enlaceEnVivo,
  HIK_CONNECT,
  plataformaDe,
  valoresParaCamara,
} from "@/components/admin/forestal/camaras/hik-connect";
import { haceCuanto, lineaDeAviso } from "@/components/admin/forestal/camaras/ultimo-aviso";
import { ultimoAvisoDe } from "@/lib/camaras/contacto";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

describe("En vivo: a dónde lleva", () => {
  it("reconoce el aparato (el iPad se presenta como Mac, con pantalla táctil)", () => {
    expect(plataformaDe(ANDROID)).toBe("android");
    expect(plataformaDe(IPHONE)).toBe("ios");
    expect(plataformaDe(IPAD, 5)).toBe("ios");
    expect(plataformaDe(IPAD, 0)).toBe("pc");
    expect(plataformaDe(WINDOWS)).toBe("pc");
  });

  it("Android: intent al paquete de Hik-Connect con Play Store de respaldo", () => {
    const e = enlaceEnVivo("android");
    expect(e.href.startsWith("intent://#Intent;package=com.connect.enduser;")).toBe(true);
    expect(e.href).toContain(`S.browser_fallback_url=${encodeURIComponent(HIK_CONNECT.playStore)}`);
    expect(e.href.endsWith(";end")).toBe(true);
    expect(e.nuevaPestana).toBe(false);
  });

  it("iOS: App Store de Hik-Connect; PC: la web en otra pestaña", () => {
    expect(enlaceEnVivo("ios").href).toBe("https://apps.apple.com/pe/app/hik-connect/id1087803190");
    expect(enlaceEnVivo("pc")).toMatchObject({
      href: "https://www.hik-connect.com/",
      nuevaPestana: true,
    });
  });
});

describe("valores para HTTP Listening", () => {
  it("parte la dirección del túnel en los campos del menú", () => {
    expect(
      valoresParaCamara("https://abc-def.trycloudflare.com/api/webhooks/camara?k=tok123"),
    ).toEqual({
      host: "abc-def.trycloudflare.com",
      url: "/api/webhooks/camara?k=tok123",
      puerto: 443,
      protocolo: "HTTPS",
      alternativa: { protocolo: "HTTP", puerto: 80 },
    });
  });

  it("respeta un puerto propio y no inventa alternativa", () => {
    expect(valoresParaCamara("http://10.0.0.5:8080/api/webhooks/camara?k=x")).toMatchObject({
      puerto: 8080,
      protocolo: "HTTP",
      alternativa: null,
    });
    expect(valoresParaCamara("")).toBeNull();
  });
});

describe("último aviso", () => {
  const ahora = Date.parse("2026-10-05T17:00:00.000Z");

  it("hace X en minutos, horas o el día", () => {
    expect(haceCuanto("2026-10-05T16:59:30.000Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-10-05T16:55:00.000Z", ahora)).toBe("hace 5 min");
    expect(haceCuanto("2026-10-05T14:00:00.000Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-10-01T15:00:00.000Z", ahora)).toBe("el jueves 01/10");
  });

  it("lo de la cámara gana; las fotos a mano y del puente no cuentan", () => {
    const capturas = [
      { camaraId: "c1", evento: "manual" as const, at: "2026-10-05T16:58:00.000Z" },
      { camaraId: "c1", evento: "persona" as const, at: "2026-10-05T16:40:00.000Z" },
      { camaraId: "c2", evento: "vehiculo" as const, at: "2026-10-05T16:59:00.000Z" },
    ];
    expect(ultimoAvisoDe("c1", capturas, null)).toEqual({
      at: "2026-10-05T16:40:00.000Z",
      tipo: "foto",
    });
    expect(
      ultimoAvisoDe("c1", capturas, { at: "2026-10-05T16:50:00.000Z", tipo: "latido" })?.tipo,
    ).toBe("latido");
    expect(ultimoAvisoDe("c3", capturas, null)).toBeNull();
  });

  it("la línea dice nunca, el tipo, y la foto sólo si es más nueva", () => {
    expect(lineaDeAviso({ ultimoAviso: null, ultimaCapturaEn: null }, ahora)).toBe(
      "la cámara nunca avisó",
    );
    expect(
      lineaDeAviso(
        { ultimoAviso: { at: "2026-10-05T16:55:00.000Z", tipo: "latido" }, ultimaCapturaEn: null },
        ahora,
      ),
    ).toBe("último aviso de la cámara hace 5 min (señal de vida)");
    expect(
      lineaDeAviso(
        {
          ultimoAviso: { at: "2026-10-05T16:30:00.000Z", tipo: "foto" },
          ultimaCapturaEn: "2026-10-05T16:30:00.000Z",
        },
        ahora,
      ),
    ).toBe("último aviso de la cámara hace 30 min");
  });
});
