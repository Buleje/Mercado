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
import { haySecretoEnRuta, tacharSecretosDeRuta, tacharSecretosEnObjeto } from "@/lib/telemetry/secretos-en-url";

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

describe("los 4 canales pasan por el tachado", () => {
  const leer = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it.each([
    ["instrumentation-client.ts", /before_send:[\s\S]*tacharSecretosEnObjeto\(ev\.properties\)/],
    ["sentry.client.config.ts", /tacharSecretosDeRuta/],
    ["sentry.server.config.ts", /event\.request\.url = tacharSecretosDeRuta\(/],
    ["components/MedicionVercel.tsx", /<Analytics beforeSend=\{\(ev\) => \(\{ \.\.\.ev, url: tacharSecretosDeRuta\(ev\.url\) \}\)\}/],
  ])("%s", (archivo, patron) => {
    expect(leer(archivo)).toMatch(patron);
  });
});
