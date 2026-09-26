/**
 * Reportes diarios forestales (ADR-439): configuración, ventana horaria de
 * Lima, armado del correo/WhatsApp y errores en palabras.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISPAROS_LIMA,
  disparoQueLoManda,
  cuandoSale,
  explicarFalloEnvio,
  leTocaAhora,
  limpiarTelefono,
  rangoDelReporte,
  relojLima,
  reporteDiarioSchema,
  diasDelRango,
} from "@/lib/forestal/reporte-diario";
import { armarReporteForestal, TOPE_WHATSAPP, type DatosReporteForestal } from "@/lib/forestal/reporte-diario-armado";

/** Un instante de Lima: SIEMPRE con la zona, o `new Date("2026-09-26")` es el 25 a las 19:00. */
const lima = (s: string) => new Date(`${s}-05:00`);

const base = { activo: true, hora: "18:00", dias: [1, 2, 3, 4, 5, 6], ultimaFechaEnviada: null as string | null };

describe("relojLima", () => {
  it("lee el día y la hora de Lima, no los de UTC", () => {
    // 23:30 del sábado 26 en Lima = 04:30 del domingo 27 en UTC.
    expect(relojLima(lima("2026-09-26T23:30:00"))).toEqual({ fecha: "2026-09-26", minutos: 23 * 60 + 30, diaSemana: 6 });
    expect(relojLima(new Date("2026-09-27T05:00:00Z"))).toEqual({ fecha: "2026-09-27", minutos: 0, diaSemana: 0 });
  });
});

describe("leTocaAhora — la ventana horaria", () => {
  it("antes de su hora no sale; en su hora y después, sí", () => {
    expect(leTocaAhora(base, relojLima(lima("2026-09-26T17:59:00")))).toBe(false);
    expect(leTocaAhora(base, relojLima(lima("2026-09-26T18:00:00")))).toBe(true);
    // Vercel Hobby dispara en cualquier minuto de la hora: a las 18:47 igual sale.
    expect(leTocaAhora(base, relojLima(lima("2026-09-26T18:47:00")))).toBe(true);
    // Un disparo tardío (el de las 21:00) todavía lo manda si no salió.
    expect(leTocaAhora(base, relojLima(lima("2026-09-26T21:10:00")))).toBe(true);
  });

  it("idempotente por día: si hoy ya salió, no sale otra vez; mañana sí", () => {
    const yaSalio = { ...base, ultimaFechaEnviada: "2026-09-26" };
    expect(leTocaAhora(yaSalio, relojLima(lima("2026-09-26T21:10:00")))).toBe(false);
    expect(leTocaAhora(yaSalio, relojLima(lima("2026-09-28T18:05:00")))).toBe(true);
  });

  it("respeta los días elegidos y el interruptor", () => {
    // 27/09/2026 es domingo (0), fuera de lunes a sábado.
    expect(leTocaAhora(base, relojLima(lima("2026-09-27T19:00:00")))).toBe(false);
    expect(leTocaAhora({ ...base, activo: false }, relojLima(lima("2026-09-26T19:00:00")))).toBe(false);
  });

  it("no arrastra al día siguiente lo que no salió ayer", () => {
    // Salió por última vez el 24; el 26 a las 07:00 todavía no es su hora.
    expect(leTocaAhora({ ...base, ultimaFechaEnviada: "2026-09-24" }, relojLima(lima("2026-09-26T07:05:00")))).toBe(false);
  });
});

describe("rango del reporte", () => {
  it("hoy, ayer y la semana (7 días con hoy)", () => {
    expect(rangoDelReporte("hoy", "2026-09-26")).toEqual({ desde: "2026-09-26", hasta: "2026-09-26" });
    expect(rangoDelReporte("ayer", "2026-10-01")).toEqual({ desde: "2026-09-30", hasta: "2026-09-30" });
    expect(rangoDelReporte("semana", "2026-09-26")).toEqual({ desde: "2026-09-20", hasta: "2026-09-26" });
    expect(diasDelRango("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});

describe("disparos de Vercel", () => {
  it("un reporte sale en el primer disparo igual o posterior a su hora", () => {
    expect(disparoQueLoManda("18:00")).toBe("18:00");
    expect(disparoQueLoManda("18:30")).toBe("21:00");
    expect(disparoQueLoManda("06:00")).toBe("07:00");
    expect(disparoQueLoManda("22:00")).toBeNull();
    expect(cuandoSale("18:00")).toBe("Llega entre las 18:00 y las 18:59.");
    expect(cuandoSale("18:30")).toBe("Llega a más tardar entre las 21:00 y las 21:59.");
    expect(cuandoSale("23:00")).toMatch(/no hay envío automático/);
  });

  it("DISPAROS_LIMA es lo que está en vercel.json (UTC−5) y cada path tiene su cron", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const propios = vercel.crons.filter((c) => c.path.startsWith("/api/cron/reportes-diarios"));
    const enLima = propios
      .map((c) => {
        const [min, horaUtc] = c.schedule.split(" ").map(Number);
        const h = (horaUtc + 24 - 5) % 24;
        expect(c.path).toBe(`/api/cron/reportes-diarios/${String(h).padStart(2, "0")}${String(min).padStart(2, "0")}`);
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      })
      .sort();
    expect(enLima).toEqual([...DISPAROS_LIMA].sort());
    // Plan Hobby: sólo crons diarios. Uno sub-diario tumba el deploy entero.
    for (const c of propios) expect(c.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});

describe("reporteDiarioSchema", () => {
  const ok = {
    nombre: "Cierre del día",
    activo: true,
    hora: "18:00",
    dias: [6, 1, 1],
    porCorreo: true,
    porWhatsapp: true,
    correos: [" Dueno@Ejemplo.pe "],
    telefonos: ["987 654 321"],
    secciones: ["plata", "produccion"],
    rango: "hoy",
  };

  it("limpia teléfonos, correos, días y ordena las secciones", () => {
    const r = reporteDiarioSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.telefonos).toEqual(["51987654321"]);
    expect(r.data.correos).toEqual(["dueno@ejemplo.pe"]);
    expect(r.data.dias).toEqual([1, 6]);
    expect(r.data.secciones).toEqual(["produccion", "plata"]);
    expect(limpiarTelefono("+51 987-654-321")).toBe("51987654321");
  });

  it("rechaza la hora fuera de la media hora y el canal sin destinatarios", () => {
    expect(reporteDiarioSchema.safeParse({ ...ok, hora: "18:15" }).success).toBe(false);
    const sinCorreo = reporteDiarioSchema.safeParse({ ...ok, correos: [] });
    expect(sinCorreo.success).toBe(false);
    if (!sinCorreo.success) expect(sinCorreo.error.issues[0].message).toMatch(/correo/);
    expect(reporteDiarioSchema.safeParse({ ...ok, porCorreo: false, porWhatsapp: false }).success).toBe(false);
    expect(reporteDiarioSchema.safeParse({ ...ok, telefonos: ["123"] }).success).toBe(false);
    expect(reporteDiarioSchema.safeParse({ ...ok, secciones: [] }).success).toBe(false);
  });
});

/** Cifras con la forma de Blas (sep-2026): tornillo y capirona, una deuda atrasada. */
const datos = (extra: Partial<DatosReporteForestal> = {}): DatosReporteForestal => ({
  negocio: "Inversiones Agroforestales BLAS sac",
  nombreReporte: "Cierre del día",
  fecha: "2026-09-26",
  rango: "hoy",
  desde: "2026-09-26",
  hasta: "2026-09-26",
  panelUrl: "https://buleje.pe/admin?tab=ctp-libro-operaciones",
  produccion: {
    corridas: 3,
    piezas: 412,
    m3: 9.87,
    pt: 4185,
    porEspecie: [
      { especie: "Tornillo", corridas: 2, piezas: 300, m3: 7.5, pt: 3180, productos: [{ producto: "Tablas", piezas: 300, m3: 7.5, pt: 3180 }] },
      { especie: "Capirona", corridas: 1, piezas: 112, m3: 2.37, pt: 1005, productos: [{ producto: "Vigas", piezas: 112, m3: 2.37, pt: 1005 }] },
    ],
    consumidoM3: 19.1,
    rendimientoPct: 51.7,
  },
  plata: {
    deudaProveedores: 12400,
    guiasSinPagar: 3,
    proveedores: [{ nombre: "Nelly <script>alert(1)</script>", guias: 3, pendiente: 12400, atrasado: true }],
    pagos: { pagados: { cantidad: 1, monto: 2500 }, cobrados: { cantidad: 0, monto: 0 } },
    adelantos: [{ moneda: "PEN", saldo: 800, abiertos: 2 }],
  },
  ...extra,
});

describe("armarReporteForestal", () => {
  it("asunto con aviso, html escapado y sin imágenes externas", () => {
    const r = armarReporteForestal(datos(), ["produccion", "plata"]);
    expect(r.asunto).toBe("[Atención] Cierre del día — Inversiones Agroforestales BLAS sac · sábado 26/09");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("Nelly &lt;script&gt;");
    expect(r.html).not.toMatch(/<img|src=/i);
    expect(r.html).toContain("4,185 pt");
    expect(r.html).toContain("rendimiento 51.7 %");
    // escapeHtml también escapa la barra: «S&#x2F;» se ve «S/» en el correo.
    expect(r.html).toContain("Pagaste S&#x2F; 2,500.00 (1 pago)");
  });

  it("WhatsApp: totales primero, link al panel y dentro del tope", () => {
    const r = armarReporteForestal(datos(), ["produccion", "plata"]);
    expect(r.texto.startsWith("*Cierre del día* — Inversiones Agroforestales BLAS sac\nsábado 26/09")).toBe(true);
    expect(r.texto).toContain("*Producción*: 4,185 pt · 9.87 m³ · 412 piezas en 3 corridas");
    expect(r.texto).toContain("Ver más: https://buleje.pe/admin?tab=ctp-libro-operaciones");
    expect(r.texto.length).toBeLessThanOrEqual(TOPE_WHATSAPP);
  });

  it("con muchísimo detalle recorta renglones, nunca los totales ni el link", () => {
    const muchas = Array.from({ length: 60 }, (_, i) => ({
      especie: `Especie número ${i} con un nombre bien largo`,
      corridas: 1,
      piezas: 10,
      m3: 1,
      pt: 424,
      productos: [],
    }));
    const d = datos({ produccion: { ...datos().produccion!, porEspecie: muchas } });
    d.pendientes = Array.from({ length: 30 }, (_, i) => ({ titulo: `Pendiente ${i} que hay que resolver en el libro`, detalle: "", cantidad: 1, urgencia: "pendiente" as const }));
    const r = armarReporteForestal(d, ["produccion", "plata", "pendientes"]);
    expect(r.texto.length).toBeLessThanOrEqual(TOPE_WHATSAPP);
    expect(r.texto).toContain("*Producción*: 4,185 pt");
    expect(r.texto).toContain("*Pendientes del libro*: 30 pendientes");
    expect(r.texto).toContain("https://buleje.pe/admin?tab=ctp-libro-operaciones");
  });

  it("una sección que no se pudo leer se dice, en el orden canónico", () => {
    const r = armarReporteForestal(datos({ fallidas: ["patio"] }), ["patio", "produccion"]);
    const iProd = r.texto.indexOf("*Producción*");
    const iPatio = r.texto.indexOf("*Patio*");
    expect(iPatio).toBeGreaterThan(-1);
    // El orden lo pone quien llama (el schema ya lo ordena); acá se respeta tal cual.
    expect(iPatio).toBeLessThan(iProd);
    expect(r.texto).toContain("No se pudo leer esta parte ahora");
  });

  it("sin movimiento lo dice en vez de mostrar ceros", () => {
    const d = datos({
      produccion: { corridas: 0, piezas: 0, m3: 0, pt: 0, porEspecie: [], consumidoM3: 0, rendimientoPct: null },
      tala: { lineas: 0, taladoM3: 0, trozadoM3: 0 },
    });
    const r = armarReporteForestal(d, ["produccion", "tala"]);
    expect(r.texto).toContain("*Producción*: Sin producción registrada.");
    expect(r.texto).toContain("*Tala y trozado*: No se cortó");
    expect(r.asunto.startsWith("[Atención]")).toBe(false);
  });
});

describe("explicarFalloEnvio — los errores reales de Blas (NotificationLog, 12/09)", () => {
  it("WhatsApp 401: el token que no se puede leer ≠ el que venció", () => {
    // Lo que devolvió Meta el 26-09 con la clave de este servidor (y a Blas el 12/09).
    const crudo = 'WhatsApp API error: 401 {"error":{"message":"Invalid OAuth access token - Cannot parse access token","type":"OAuthException","code":190}}';
    expect(explicarFalloEnvio("whatsapp", crudo)).toMatch(/token cargado no es válido/);
    expect(explicarFalloEnvio("whatsapp", "WhatsApp API error: 401 Error validating access token: Session has expired")).toMatch(/token venció/);
    expect(explicarFalloEnvio("whatsapp", "WhatsApp API error: 401 OAuthException")).toMatch(/Meta rechazó el token/);
    // Un teléfono con «401» adentro no es un 401.
    expect(explicarFalloEnvio("whatsapp", "WhatsApp API error: 400 (#131030) Recipient 51940112345 not in allowed list")).toMatch(/lista permitida/);
  });
  it("Resend dominio sin verificar → verificar buleje.pe", () => {
    expect(explicarFalloEnvio("email", "The buleje.pe domain is not verified. Please, add and verify your domain")).toBe(
      "Correo: verifica buleje.pe en Resend (registros DNS) para poder mandar desde ahí.",
    );
  });
  it("fuera de la ventana de 24 h → plantilla o «hola»", () => {
    expect(explicarFalloEnvio("whatsapp", "WhatsApp API error: 400 (#131047) Re-engagement message")).toMatch(/24 h/);
  });
  it("sin credenciales en el servidor", () => {
    expect(explicarFalloEnvio("whatsapp", "WhatsApp no configurado en el servidor")).toMatch(/no tiene la cuenta/);
    expect(explicarFalloEnvio("email", "Correo no configurado en el servidor")).toMatch(/no tiene el servicio/);
  });
});
