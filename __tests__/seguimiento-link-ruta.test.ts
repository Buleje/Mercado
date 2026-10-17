/**
 * El link de seguimiento que se comparte tiene que abrir (02-10-2026).
 *
 * `OrderTrackingDB.generateShareToken` arma `/t/<negocio>/seguimiento/<token>`,
 * y el proxy reescribe todo `/t/<negocio>/*` (salvo `/admin`) hacia la tienda
 * (`app/(store)`). La página vivía sólo en `app/t/[slug]/seguimiento` —que el
 * proxy nunca deja alcanzar— y todo link compartido daba 404.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..");

describe("link de seguimiento compartido", () => {
  it("el proxy reescribe /t/<negocio>/seguimiento/<token> hacia la tienda", () => {
    const proxy = readFileSync(path.join(raiz, "lib/middleware/slug-routes.ts"), "utf8");
    // Todo /t/<slug>/<algo-que-no-es-admin> va a la tienda con el resto de la ruta.
    expect(proxy).toMatch(/\^\\\/t\\\/\(\[\^\/\]\+\)\(\\\/\(\?!admin\)\.\+\)\$/);
    const generador = readFileSync(path.join(raiz, "lib/db/order-tracking.db.ts"), "utf8");
    expect(generador).toContain("/seguimiento/${encodeURIComponent(token)}");
  });

  it("y en la tienda EXISTE la página que lo atiende", () => {
    expect(existsSync(path.join(raiz, "app/(store)/seguimiento/[token]/page.tsx"))).toBe(true);
  });
});
