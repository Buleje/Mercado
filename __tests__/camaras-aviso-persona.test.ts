/**
 * WhatsApp por las fotos del detector de personas del mosaico en vivo
 * (`avisarPersonaDelMosaico`, 2026-10-08).
 *
 * Misma configuración de la cámara que las fotos de la IA (número, franja,
 * pausa de 10 min compartida); sólo «apareció» y «llegó otra», nunca «sigue»;
 * el turno se toma bajo candado ANTES de mandar (dos fotos a la vez = un solo
 * WhatsApp) y se devuelve si el envío falla.
 *
 * Corre con el `CamarasDB` real: sólo se reemplaza el KV (con un candado que
 * pone en fila a los escritores, como el advisory lock) y el envío de WhatsApp.
 * Ningún mensaje sale de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  /** Lo que devuelve `get` (la lectura con caché): `null` = lo mismo que la base. */
  cacheViejo: null as unknown,
  fila: Promise.resolve() as Promise<unknown>,
  enviados: [] as { tenantId: string; telefono: string; texto: string; opts: Record<string, unknown> }[],
  salio: true,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (key: string) => structuredClone(H.cacheViejo ?? H.kv.get(key) ?? null),
    actualizar: (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const turno = H.fila.then(async () => {
        await new Promise((ok) => setTimeout(ok, 1));
        const r = cambio(structuredClone(H.kv.get(key) ?? null));
        if (r.valor !== undefined) H.kv.set(key, structuredClone(r.valor));
        return r.resultado;
      });
      H.fila = turno.catch(() => undefined);
      return turno;
    },
  },
}));
vi.mock("@/lib/whatsapp-tenant", () => ({
  enviarWhatsAppDelNegocio: async (tenantId: string, telefono: string, texto: string, opts: Record<string, unknown>) => {
    H.enviados.push({ tenantId, telefono, texto, opts });
    await new Promise((ok) => setTimeout(ok, 5));
    return {
      ok: H.salio,
      via: "servidor",
      modo: "texto",
      plantilla: null,
      wamid: H.salio ? "wamid.X" : null,
      puedeNoLlegar: true,
      error: H.salio ? null : "WhatsApp API error: 500",
      nota: null,
    };
  },
}));

import {
  avisarPersonaDelMosaico,
  debeAvisarPersonaDelMosaico,
  enlaceAPersonasDelMosaico,
  textoAvisoPersonaDelMosaico,
} from "@/lib/camaras/avisar";
import type { AvisosCamara, Camara } from "@/lib/camaras/camaras";

const T = "t-qa";
/** 21:14 del 07-10 en Lima (UTC−5): de noche. */
const NOCHE = new Date("2026-10-08T02:14:00Z");
/** 14:00 del 08-10 en Lima: de día. */
const DIA = new Date("2026-10-08T19:00:00Z");
const minutosAntes = (d: Date, m: number) => new Date(d.getTime() - m * 60_000).toISOString();

function camara(avisos: Partial<AvisosCamara> | null, extra: Partial<Camara> = {}): Camara {
  return {
    id: "cam-patio",
    nombre: "Patio de trozas",
    lugar: "patio",
    token: "tok",
    activa: true,
    creadaEn: "2026-10-01T00:00:00Z",
    avisos: avisos ? { whatsapp: "987654321", cuando: "noche", ultimoAvisoEn: null, ...avisos } : null,
    ...extra,
  } as Camara;
}

function sembrar(c: Camara) {
  H.kv.set(`camaras:${T}`, [c]);
}
const avisosGuardados = () => (H.kv.get(`camaras:${T}`) as Camara[])[0].avisos;

beforeEach(() => {
  H.kv.clear();
  H.cacheViejo = null;
  H.enviados = [];
  H.salio = true;
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://panel.test");
});

describe("debeAvisarPersonaDelMosaico — la decisión pura", () => {
  it("«sigue en cuadro» nunca avisa, aunque la cámara avise siempre y sin pausa", () => {
    expect(debeAvisarPersonaDelMosaico(camara({ cuando: "siempre" }), "sigue", DIA)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(camara({ cuando: "siempre" }), "sigue", NOCHE)).toBe(false);
  });

  it("«apareció» y «llegó otra» avisan con número, franja y pausa en regla", () => {
    expect(debeAvisarPersonaDelMosaico(camara({ cuando: "siempre" }), "aparecio", DIA)).toBe(true);
    expect(debeAvisarPersonaDelMosaico(camara({ cuando: "siempre" }), "mas_gente", DIA)).toBe(true);
  });

  it("«sólo de noche» respeta la hora de Lima (19-06), no la del servidor", () => {
    const c = camara({ cuando: "noche" });
    expect(debeAvisarPersonaDelMosaico(c, "aparecio", DIA)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(c, "aparecio", NOCHE)).toBe(true);
    expect(debeAvisarPersonaDelMosaico(c, "aparecio", new Date("2026-10-08T10:30:00Z"))).toBe(true); // 05:30
    expect(debeAvisarPersonaDelMosaico(c, "aparecio", new Date("2026-10-08T11:30:00Z"))).toBe(false); // 06:30
  });

  it("la pausa de 10 min es la misma que la de las fotos de la IA", () => {
    expect(debeAvisarPersonaDelMosaico(camara({ ultimoAvisoEn: minutosAntes(NOCHE, 9) }), "mas_gente", NOCHE)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(camara({ ultimoAvisoEn: minutosAntes(NOCHE, 11) }), "mas_gente", NOCHE)).toBe(true);
  });

  it("sin número, con «nunca», sin avisos o con la cámara apagada no avisa", () => {
    expect(debeAvisarPersonaDelMosaico(camara({ whatsapp: null }), "aparecio", NOCHE)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(camara({ cuando: "nunca" }), "aparecio", NOCHE)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(camara(null), "aparecio", NOCHE)).toBe(false);
    expect(debeAvisarPersonaDelMosaico(camara({}, { activa: false }), "aparecio", NOCHE)).toBe(false);
  });
});

describe("textoAvisoPersonaDelMosaico", () => {
  const enlace = "https://panel.test/admin?tab=camaras&vista=personas";

  it("cámara, lugar, hora de Lima, cuántas y el enlace", () => {
    const t = textoAvisoPersonaDelMosaico(camara({}), { motivo: "aparecio", personas: 1 }, NOCHE, enlace);
    expect(t).toContain("Patio de trozas (patio)");
    expect(t).toMatch(/\b0?7\/10\b.*\b21:14\b/);
    expect(t).toContain("Apareció una persona");
    expect(t).toContain(enlace);
    expect(t.length).toBeLessThan(200);
  });

  it("varias personas y «llegó otra»", () => {
    expect(textoAvisoPersonaDelMosaico(camara({}), { motivo: "aparecio", personas: 3 }, NOCHE, enlace)).toContain(
      "Aparecieron 3 personas",
    );
    expect(textoAvisoPersonaDelMosaico(camara({}), { motivo: "mas_gente", personas: 2 }, NOCHE, enlace)).toContain(
      "Llegó otra persona: ahora son 2",
    );
  });

  it("el enlace va a la galería «Personas» de Cámaras", () => {
    expect(enlaceAPersonasDelMosaico()).toBe(enlace);
  });
});

describe("avisarPersonaDelMosaico — envío (WhatsApp falso)", () => {
  it("«apareció» de noche: un WhatsApp al número de la cámara y queda anotada la pausa", async () => {
    sembrar(camara({ cuando: "noche" }));
    const r = await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, NOCHE);
    expect(r).toBe("mandado");
    expect(H.enviados).toHaveLength(1);
    expect(H.enviados[0]).toMatchObject({ tenantId: T, telefono: "987654321" });
    expect(H.enviados[0].texto).toContain("Apareció una persona");
    // Peor caso dentro del after() de Vercel (30 s): 2 intentos de 8 s.
    expect(H.enviados[0].opts).toMatchObject({ contexto: "camaras", reintentos: 1, esperaMs: 8_000 });
    expect(avisosGuardados()?.ultimoAvisoEn).toBe(NOCHE.toISOString());
  });

  it("«sigue» no toca la base ni manda nada", async () => {
    sembrar(camara({ cuando: "siempre" }));
    const r = await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "sigue", personas: 2 }, NOCHE);
    expect(r).toBe("no_corresponde");
    expect(H.enviados).toHaveLength(0);
    expect(avisosGuardados()?.ultimoAvisoEn).toBeNull();
  });

  it("de día con «sólo de noche», o sin número: nada", async () => {
    sembrar(camara({ cuando: "noche" }));
    expect(await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA)).toBe("no_corresponde");
    sembrar(camara({ whatsapp: null, cuando: "siempre" }));
    expect(await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, NOCHE)).toBe("no_corresponde");
    expect(H.enviados).toHaveLength(0);
  });

  it("dentro de la pausa que dejó una foto de la IA: «llegó otra» no avisa", async () => {
    sembrar(camara({ cuando: "siempre", ultimoAvisoEn: minutosAntes(NOCHE, 4) }));
    expect(await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "mas_gente", personas: 2 }, NOCHE)).toBe("no_corresponde");
    expect(H.enviados).toHaveLength(0);
  });

  it("«apareció» y «llegó otra» a la vez (o dos pantallas) con el caché viejo: UN solo WhatsApp", async () => {
    sembrar(camara({ cuando: "siempre" }));
    // Cada instancia lee la lista de su caché: ninguna ve el aviso de la otra.
    H.cacheViejo = [camara({ cuando: "siempre" })];
    const [a, b, c] = await Promise.all([
      avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, NOCHE),
      avisarPersonaDelMosaico(T, "cam-patio", { motivo: "mas_gente", personas: 2 }, new Date(NOCHE.getTime() + 1500)),
      avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, new Date(NOCHE.getTime() + 800)),
    ]);
    expect([a, b, c].filter((r) => r === "mandado")).toHaveLength(1);
    expect(H.enviados).toHaveLength(1);
  });

  it("si el WhatsApp no sale, devuelve el turno: la próxima persona sí avisa", async () => {
    const previo = minutosAntes(NOCHE, 30);
    sembrar(camara({ cuando: "siempre", ultimoAvisoEn: previo }));
    H.salio = false;
    expect(await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, NOCHE)).toBe("no_salio");
    expect(avisosGuardados()?.ultimoAvisoEn).toBe(previo);

    H.salio = true;
    const despues = new Date(NOCHE.getTime() + 60_000);
    expect(await avisarPersonaDelMosaico(T, "cam-patio", { motivo: "aparecio", personas: 1 }, despues)).toBe("mandado");
    expect(H.enviados).toHaveLength(2);
  });

  it("cámara de otro tenant o que ya no existe: nada", async () => {
    sembrar(camara({ cuando: "siempre" }));
    expect(await avisarPersonaDelMosaico("otro-tenant", "cam-patio", { motivo: "aparecio", personas: 1 }, NOCHE)).toBe(
      "no_corresponde",
    );
    expect(await avisarPersonaDelMosaico(T, "cam-borrada", { motivo: "aparecio", personas: 1 }, NOCHE)).toBe("no_corresponde");
    expect(H.enviados).toHaveLength(0);
  });
});
