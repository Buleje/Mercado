/**
 * Los enlaces de FIRMA no salen a la analítica (ADR-491, security 10-10 VETO).
 *
 * El token de `/firmar-adelanto/<t>` y `/firmar-contrato/<t>` ES la credencial
 * para firmar un recibo o un contrato; PostHog, Vercel Analytics y Sentry
 * guardan la URL completa. Fija: (1) las 4 rutas con secreto se tachan, con
 * query, hash, dentro de JSON y sin tocar otras rutas; (2) los 4 canales que
 * mandan URLs pasan por el tachado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  haySecretoEnRuta,
  tacharEventoSentry,
  tacharMiga,
  tacharSecretosDeRuta,
  tacharSecretosEnObjeto,
} from "@/lib/telemetry/secretos-en-url";

const T = "QgqyRsC6G20Tji5BpxMNRCL5F6BCR5qQx9d8HzGE3JU";

describe("las 4 rutas de firma se tachan", () => {
  it.each([
    [`https://bodega.buleje.pe/firmar-adelanto/${T}?utm=wa#x`, "https://bodega.buleje.pe/firmar-adelanto/[token]?utm=wa#x"],
    [`/firmar-contrato/${T}`, "/firmar-contrato/[token]"],
    [`/api/public/adelantos/${T}/firmar`, "/api/public/adelantos/[token]/firmar"],
    [`/api/public/contratos/${T}/pdf`, "/api/public/contratos/[token]/pdf"],
    [`{"$current_url":"https://x.pe/firmar-adelanto/${T}"}`, '{"$current_url":"https://x.pe/firmar-adelanto/[token]"}'],
  ])("%s", (url, tachada) => {
    expect(haySecretoEnRuta(url)).toBe(true);
    expect(tacharSecretosDeRuta(url)).toBe(tachada);
    expect(haySecretoEnRuta(tachada)).toBe(false);
    expect(tacharSecretosDeRuta(tachada)).toBe(tachada);
  });

  it("el kiosko sigue tachándose y lo demás no se toca", () => {
    expect(tacharSecretosDeRuta("/kiosko/asistencia/main.abc")).toBe("/kiosko/asistencia/[token]");
    for (const u of ["/admin?tab=plata", "/api/public/catalogo", "/firmar-adelanto", "/t/main/tienda/arroz", "/api/adelantos/a1/firmas"]) {
      expect(tacharSecretosDeRuta(u)).toBe(u);
    }
  });

  it("las propiedades de un evento de PostHog quedan sin token", () => {
    const props: Record<string, unknown> = { $current_url: `https://x.pe/firmar-adelanto/${T}`, $pathname: `/firmar-adelanto/${T}`, $referrer: `https://x.pe/firmar-contrato/${T}` };
    tacharSecretosEnObjeto(props);
    expect(JSON.stringify(props)).not.toContain(T);
  });
});

describe("token en la query (chat de invitados, security 17-10 T4)", () => {
  it.each([
    [`/api/chat/public/stream?threadId=h1&threadToken=${T}`, "/api/chat/public/stream?threadId=h1&threadToken=[token]"],
    [`https://x.pe/api/chat/public?action=messages&threadToken=${T}&since=1`, "https://x.pe/api/chat/public?action=messages&threadToken=[token]&since=1"],
    [`/reset?token=${T}#a`, "/reset?token=[token]#a"],
    [`https://open.ys7.com/x?accessToken=${T}&appToken=${T}`, "https://open.ys7.com/x?accessToken=[token]&appToken=[token]"],
    [`threadId=h1&threadToken=${T}`, "threadId=h1&threadToken=[token]"],
    [`{"url":"/api/chat/public/stream?threadToken=${T}"}`, '{"url":"/api/chat/public/stream?threadToken=[token]"}'],
  ])("%s", (url, tachada) => {
    expect(haySecretoEnRuta(url)).toBe(true);
    expect(tacharSecretosDeRuta(url)).toBe(tachada);
    expect(haySecretoEnRuta(tachada)).toBe(false);
    expect(tacharSecretosDeRuta(tachada)).toBe(tachada);
  });

  it("no toca otros parámetros ni nombres parecidos", () => {
    for (const u of ["/api/chat/public?action=open&phone=987654321", "/x?tokens=3&maxTokens=200", "/x?tokenId=7"]) {
      expect(tacharSecretosDeRuta(u)).toBe(u);
    }
  });

  it("evento de Sentry: url, query_string, referer, migas y spans quedan sin token; sdkProcessingMetadata intacto", () => {
    const meta = { capturedSpanScope: { vivo: true } };
    const evento = {
      transaction: "GET /api/chat/public/stream",
      request: {
        url: `https://x.pe/api/chat/public/stream?threadToken=${T}`,
        query_string: `threadId=h1&threadToken=${T}`,
        headers: { referer: `https://x.pe/t/main/tienda?threadToken=${T}` },
      },
      breadcrumbs: [{ category: "fetch", data: { url: `/api/chat/public?action=messages&threadToken=${T}` } }],
      spans: [{ description: `GET /api/chat/public/stream?threadToken=${T}`, data: { "http.query": `?threadToken=${T}` } }],
      sdkProcessingMetadata: meta,
    };
    const limpio = tacharEventoSentry(evento);
    const { sdkProcessingMetadata, ...resto } = limpio;
    expect(JSON.stringify(resto)).not.toContain(T);
    expect(sdkProcessingMetadata).toBe(meta);
    expect(limpio.request.url).toBe("https://x.pe/api/chat/public/stream?threadToken=[token]");
  });

  it("evento sin secretos sale igual (mismo objeto) y uno circular tacha al menos la URL", () => {
    const sano = { request: { url: "https://x.pe/admin?tab=plata" } };
    expect(tacharEventoSentry(sano)).toBe(sano);
    const circular: { request: { url: string }; extra: Record<string, unknown> } = {
      request: { url: `/api/chat/public/stream?threadToken=${T}` },
      extra: {},
    };
    circular.extra.yo = circular;
    expect(tacharEventoSentry(circular).request.url).toBe("/api/chat/public/stream?threadToken=[token]");
  });

  it("miga de red: mensaje y todos los datos de texto", () => {
    const miga = tacharMiga({ message: `GET /x?token=${T}`, data: { url: `/x?threadToken=${T}`, "http.query": `token=${T}`, status_code: 200 } });
    expect(JSON.stringify(miga)).not.toContain(T);
    expect(miga.data.status_code).toBe(200);
  });
});

describe("los canales pasan por el tachado", () => {
  const leer = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it.each([
    ["instrumentation-client.ts", /before_send:[\s\S]*tacharSecretosEnObjeto\(ev\.properties\)/],
    ["sentry.client.config.ts", /beforeBreadcrumb\(miga\) \{\s*return tacharMiga\(miga\)[\s\S]*beforeSend\(event, hint\) \{\s*event = tacharEventoSentry\(event\)/],
    ["sentry.server.config.ts", /beforeBreadcrumb\(miga\) \{\s*return tacharMiga\(miga\)[\s\S]*beforeSend\(event, hint\) \{\s*event = tacharEventoSentry\(event\)/],
    ["sentry.edge.config.ts", /beforeBreadcrumb\(miga\) \{\s*return tacharMiga\(miga\)[\s\S]*beforeSend\(event, hint\) \{\s*event = tacharEventoSentry\(event\)/],
    ["components/MedicionVercel.tsx", /<Analytics beforeSend=\{\(ev\) => \(\{ \.\.\.ev, url: tacharSecretosDeRuta\(ev\.url\) \}\)\}/],
  ])("%s", (archivo, patron) => {
    expect(leer(archivo)).toMatch(patron);
  });
});
