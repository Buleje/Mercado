/**
 * Reportes diarios forestales (ADR-439) — la configuración, el reloj y los
 * errores de envío en palabras.
 *
 * Brandon (2026-09-26): *«recibir reportes diarios por correo y WhatsApp, por
 * ejemplo al terminar el día a las 6 pm, con el reporte completo forestal […]
 * todo configuro: la hora, el reporte, el medio»*.
 *
 * PURO y client-safe: lo usan el editor (pantalla), las rutas (validación) y el
 * despachador del cron (¿le toca a este reporte ahora?). Se prueba sin base.
 */
import { z } from "zod";

// ── Qué trae un reporte ───────────────────────────────────────────────────────

export const SECCIONES_REPORTE = [
  "produccion",
  "tala",
  "ingresos",
  "despachos",
  "patio",
  "plata",
  "pendientes",
  "plazos",
] as const;
export type SeccionReporte = (typeof SECCIONES_REPORTE)[number];

/** Nombre y una línea de qué trae, para las tildes del editor. */
export const SECCION_META: Record<SeccionReporte, { nombre: string; trae: string }> = {
  produccion: { nombre: "Producción", trae: "Corridas, pies tablares y m³ por especie y producto, rendimiento" },
  tala: { nombre: "Tala y trozado", trae: "Lo registrado en el libro de operaciones del bosque (LO-TH)" },
  ingresos: { nombre: "Madera que entró", trae: "Guías, m³, especies, proveedores, recibidas y por recibir" },
  despachos: { nombre: "Despachos y ventas", trae: "Lo que salió con guía: m³, piezas, especies y lo vendido" },
  patio: { nombre: "Patio", trae: "Saldo de madera rolliza, trozas varadas y productos en stock" },
  plata: { nombre: "Plata", trae: "Lo que debes a proveedores, pagos del día y adelantos abiertos" },
  pendientes: { nombre: "Pendientes del libro", trae: "Lo que traba el cierre o se está atrasando" },
  plazos: { nombre: "Plazos SERFOR", trae: "Guías por registrar, lotes y documentos por vencer" },
};

export const RANGOS_REPORTE = ["hoy", "ayer", "semana"] as const;
export type RangoReporte = (typeof RANGOS_REPORTE)[number];

export const RANGO_META: Record<RangoReporte, string> = {
  hoy: "Lo de hoy",
  ayer: "Lo de ayer",
  semana: "Los últimos 7 días",
};

/** 0 = domingo … 6 = sábado, como `Date#getUTCDay`. */
export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

/**
 * Topes contra el relé de mensajes (security 2026-09-26): cada reporte sale
 * con NUESTRO remitente y NUESTRO número de WhatsApp. Sin topes, una cuenta
 * tomada convierte el panel en una máquina de mandar mensajes a terceros.
 *
 * - `TOPE_DESTINATARIOS`: por reporte, sumando correo y WhatsApp.
 * - `TOPE_REPORTES_ACTIVOS`: reportes que salen solos, por negocio.
 * - `TOPE_MENSAJES_DIA`: mensajes (correo + WhatsApp, programados y a mano)
 *   por negocio y día de Lima, contados en `NotificationLog`: 10 reportes × 6
 *   destinatarios; más que eso ya no es un reporte del aserradero.
 * - `TOPE_ENVIAR_AHORA_DIA`: «Enviar ahora» por reporte y día.
 * - `TOPE_INTENTOS_DIA`: si fallaron TODOS los canales, el despachador lo
 *   vuelve a probar en el disparo siguiente del mismo día, hasta este tope.
 */
export const TOPE_DESTINATARIOS = 10;
export const TOPE_REPORTES_ACTIVOS = 10;
export const TOPE_MENSAJES_DIA = 60;
export const TOPE_ENVIAR_AHORA_DIA = 5;
export const TOPE_INTENTOS_DIA = 3;

/**
 * Las horas de Lima en que Vercel dispara el despachador (`vercel.json`). En
 * plan Hobby sólo se permiten crons diarios, y cada uno cae en CUALQUIER minuto
 * de su hora. Sin un disparador externo cada media hora, un reporte sale en el
 * primer disparo igual o posterior a su hora. Un test compara esta lista con
 * `vercel.json`: si alguien mueve uno, el otro tiene que moverse.
 */
export const DISPAROS_LIMA = ["07:00", "13:00", "18:00", "21:00"] as const;
const ULTIMO_DISPARO = DISPAROS_LIMA[DISPAROS_LIMA.length - 1];

/**
 * El disparador de la HORA EXACTA (runbook `docs/runbooks/reportes-hora-exacta.md`):
 * un job de Supabase (`pg_cron` + `pg_net`) llama a
 * `/api/cron/reportes-diarios/hora-exacta` a las :00 y :30 de cada hora. Cada
 * llamada deja un LATIDO; con uno reciente, el editor promete la hora exacta
 * («Llega a las 18:30») en vez de la ventana de Vercel («21:00–21:59»).
 *
 * Se mide, no se configura: si el job se apaga, a la hora deja de haber
 * latido y la pantalla vuelve sola a prometer la ventana de Vercel. Un
 * interruptor en Ajustes seguiría diciendo «18:30» con el job muerto.
 *
 * Etiqueta propia y no la raíz: una llamada a mano a la raíz (una prueba con
 * curl) no debe hacerle creer a la pantalla que hay disparador.
 */
export const DISPARO_HORA_EXACTA = "hora-exacta";
export const CLAVE_LATIDO_HORA_EXACTA = "reportes-diarios:latido-hora-exacta";
/** Dos tics de 30 min + 5 de margen: un tic perdido no apaga la promesa; dos seguidos, sí. */
export const VIGENCIA_LATIDO_MIN = 65;

/** ¿Esta llamada al cron es la del disparador exacto? (`/…/reportes-diarios/hora-exacta`) */
export function esDisparoHoraExacta(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").split("/").pop() === DISPARO_HORA_EXACTA;
}

/**
 * ¿El disparador exacto está vivo? `latido` = ISO de su última llamada.
 * Un latido algo «del futuro» (relojes de dos servidores) cuenta como vivo;
 * uno roto o de hace más de `VIGENCIA_LATIDO_MIN`, no.
 */
export function horaExactaViva(latido: string | null | undefined, ahora: Date): boolean {
  if (!latido) return false;
  const t = Date.parse(latido);
  if (!Number.isFinite(t)) return false;
  const edadMs = ahora.getTime() - t;
  return edadMs < VIGENCIA_LATIDO_MIN * 60_000 && edadMs > -5 * 60_000;
}

// ── Validación ────────────────────────────────────────────────────────────────

/**
 * Saca los saltos de línea y demás caracteres de control (C0, DEL, C1 y los
 * separadores de línea/párrafo de Unicode). El nombre del reporte y el del
 * negocio van al ASUNTO del correo y a la cabecera del WhatsApp: un «\r\n»
 * adentro partiría el asunto o metería renglones que parecen nuestros.
 */
export function sinCaracteresDeControl(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * «HH:MM» de media en media hora, y nunca después del último disparo del día:
 * a las 21:30 no pasa ningún cron, y un reporte que se guarda para no salir
 * nunca es peor que un error al guardarlo.
 */
const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "La hora va de media en media hora, por ejemplo 18:00 o 18:30.")
  .refine(
    (h) => minutosDeHora(h) <= minutosDeHora(ULTIMO_DISPARO),
    `Después de las ${ULTIMO_DISPARO} no hay envío automático: elige una hora hasta las ${ULTIMO_DISPARO}.`,
  );

/** Sólo dígitos: «987 654 321» y «+51 987654321» son el mismo número. */
export function limpiarTelefono(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 9 && d.startsWith("9") ? `51${d}` : d;
}

/**
 * Sólo celulares de Perú (51 + 9 dígitos que empiezan con 9). El reporte es
 * para el dueño y su gente; un número de afuera es la primera señal de que
 * alguien usa la cuenta para mandar a terceros.
 */
const telefonoSchema = z
  .string()
  .transform(limpiarTelefono)
  .refine((d) => /^519\d{8}$/.test(d), "Sólo celulares de Perú: 9 dígitos que empiezan con 9 (el +51 se pone solo).");

const correoSchema = z.string().trim().toLowerCase().email("Ese correo no es válido.");

export const reporteDiarioSchema = z
  .object({
    nombre: z
      .string()
      .transform(sinCaracteresDeControl)
      .pipe(z.string().min(1, "Ponle un nombre al reporte.").max(80)),
    activo: z.boolean(),
    hora: horaSchema,
    dias: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Elige al menos un día de la semana.")
      .max(7)
      .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
    porCorreo: z.boolean(),
    porWhatsapp: z.boolean(),
    correos: z.array(correoSchema).max(TOPE_DESTINATARIOS).transform((c) => [...new Set(c)]),
    telefonos: z.array(telefonoSchema).max(TOPE_DESTINATARIOS).transform((t) => [...new Set(t)]),
    secciones: z
      .array(z.enum(SECCIONES_REPORTE))
      .min(1, "Marca al menos una sección.")
      .transform((s) => SECCIONES_REPORTE.filter((k) => s.includes(k))),
    rango: z.enum(RANGOS_REPORTE),
  })
  .superRefine((r, ctx) => {
    if (!r.porCorreo && !r.porWhatsapp) {
      ctx.addIssue({ code: "custom", path: ["porCorreo"], message: "Elige por dónde sale: correo, WhatsApp o los dos." });
    }
    if (r.porCorreo && r.correos.length === 0) {
      ctx.addIssue({ code: "custom", path: ["correos"], message: "Falta al menos un correo." });
    }
    if (r.porWhatsapp && r.telefonos.length === 0) {
      ctx.addIssue({ code: "custom", path: ["telefonos"], message: "Falta al menos un número de WhatsApp." });
    }
    if (r.correos.length + r.telefonos.length > TOPE_DESTINATARIOS) {
      ctx.addIssue({
        code: "custom",
        path: ["telefonos"],
        message: `A lo más ${TOPE_DESTINATARIOS} destinatarios por reporte, sumando correos y WhatsApp.`,
      });
    }
  });

export type ReporteDiarioInput = z.output<typeof reporteDiarioSchema>;

/** Lo que pide la vista previa: sólo lo que cambia el contenido, sin destinatarios. */
export const vistaPreviaSchema = z.object({
  nombre: z.string().transform(sinCaracteresDeControl).pipe(z.string().max(80)).optional(),
  secciones: z.array(z.enum(SECCIONES_REPORTE)).min(1, "Marca al menos una sección."),
  rango: z.enum(RANGOS_REPORTE),
});

/** Un reporte ya guardado, como viaja a la pantalla. */
export interface ReporteDiario extends ReporteDiarioInput {
  id: string;
  ultimaFechaEnviada: string | null;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

// ── El reloj de Lima ──────────────────────────────────────────────────────────

/**
 * Perú no tiene horario de verano desde 1994: UTC−5 fijo. Se resta a mano en
 * vez de pasar por `Intl` para que el despachador y sus tests den lo mismo en
 * cualquier servidor (un Node sin ICU completo cae a UTC en silencio).
 */
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface RelojLima {
  /** Día civil de Lima, «AAAA-MM-DD». */
  fecha: string;
  /** Minutos desde la medianoche de Lima (0‥1439). */
  minutos: number;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
}

/**
 * Qué día y qué hora es en Lima. `ahora` es un INSTANTE real (`new Date()`);
 * para fijar un momento en un test, con la zona: `new Date("2026-09-26T18:05:00-05:00")`.
 */
export function relojLima(ahora: Date): RelojLima {
  const l = new Date(ahora.getTime() - LIMA_OFFSET_MS);
  return {
    fecha: l.toISOString().slice(0, 10),
    minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
    diaSemana: l.getUTCDay(),
  };
}

export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** El instante de la medianoche de Lima del día de `ahora`: desde ahí se cuentan los topes del día. */
export function inicioDelDiaLima(ahora: Date): Date {
  return new Date(`${relojLima(ahora).fecha}T05:00:00.000Z`);
}

/**
 * `ultimaFechaEnviada` guarda el día ya cerrado («2026-09-26») o, si en ese
 * día fallaron TODOS los canales y todavía quedan intentos, el día con el
 * número de intento («2026-09-26#1»). Distinto de la fecha de hoy = el
 * despachador lo vuelve a tomar, y el reclamo compara contra el valor leído.
 */
export const marcaDeReintento = (fecha: string, intento: number) => `${fecha}#${intento}`;

/** Cuántos intentos fallidos lleva HOY (0 si la marca es de otro día o no hay). */
export function intentosDeHoy(marca: string | null, fecha: string): number {
  if (!marca?.startsWith(`${fecha}#`)) return 0;
  const n = Number(marca.slice(fecha.length + 1));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * ¿Hay que mandarlo ahora? Sí si hoy es uno de sus días, su hora ya pasó y hoy
 * todavía no salió. «Ya pasó» y no «es exactamente»: el disparador puede llegar
 * tarde (Vercel en plan Hobby dispara en cualquier minuto de la hora), y un
 * reporte de las 18:00 que el cron ve a las 18:40 igual tiene que salir.
 *
 * No arrastra al día siguiente: el reporte de ayer que no salió no se manda hoy
 * — hablaría de un día que ya pasó con la hora de otro.
 */
export function leTocaAhora(
  r: Pick<ReporteDiarioInput, "activo" | "hora" | "dias"> & { ultimaFechaEnviada: string | null },
  reloj: RelojLima,
): boolean {
  if (!r.activo) return false;
  if (!r.dias.includes(reloj.diaSemana)) return false;
  if (reloj.minutos < minutosDeHora(r.hora)) return false;
  return r.ultimaFechaEnviada !== reloj.fecha;
}

const sumarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** De qué días habla el reporte que sale el día `fecha` (Lima). Ambos extremos incluidos. */
export function rangoDelReporte(rango: RangoReporte, fecha: string): { desde: string; hasta: string } {
  if (rango === "ayer") {
    const d = sumarDias(fecha, -1);
    return { desde: d, hasta: d };
  }
  if (rango === "semana") return { desde: sumarDias(fecha, -6), hasta: fecha };
  return { desde: fecha, hasta: fecha };
}

/** Los días de un rango, uno por uno (para el resumen de jornadas). */
export function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta && out.length < 31; d = sumarDias(d, 1)) out.push(d);
  return out;
}

// ── Cuándo sale de verdad ────────────────────────────────────────────────────


/**
 * Las horas que ofrece el editor: de media en media hora, de 05:00 hasta el
 * último disparo. Antes de las 5 nadie mira un reporte del aserradero; después
 * del último disparo no sale (el esquema también lo rechaza).
 */
export const HORAS_DEL_EDITOR: readonly string[] = (() => {
  const out: string[] = [];
  for (let m = 5 * 60; m <= minutosDeHora(ULTIMO_DISPARO); m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

/**
 * En qué disparo sale un reporte de esa hora, con sólo los disparos de Vercel.
 * `null` = después del último del día: sin disparador externo, no sale.
 */
export function disparoQueLoManda(hora: string): string | null {
  const m = minutosDeHora(hora);
  return DISPAROS_LIMA.find((d) => minutosDeHora(d) >= m) ?? null;
}

/**
 * Cuándo le llega, dicho para el editor. Con sólo los crons de Vercel no se
 * puede prometer el minuto: se promete la ventana del disparo que lo manda.
 * Con el disparador exacto vivo (`horaExacta`, medido por su latido), sale en
 * el tic de su media hora: se promete la hora.
 */
export function cuandoSale(hora: string, horaExacta = false): string {
  const v = ventanaDeHora(hora);
  if (!v) return `Después de las ${ULTIMO_DISPARO} no hay envío automático: elige una hora más temprana.`;
  if (horaExacta) return `Llega a las ${hora}.`;
  return v.desde === hora ? `Llega entre las ${v.desde} y las ${v.hasta}.` : `Llega a más tardar entre las ${v.desde} y las ${v.hasta}.`;
}

/** La ventana en que llega un reporte de esa hora (el disparo que lo manda y su hora entera). */
export function ventanaDeHora(hora: string): { desde: string; hasta: string } | null {
  const d = disparoQueLoManda(hora);
  return d ? { desde: d, hasta: `${d.slice(0, 2)}:59` } : null;
}

// ── Los errores de envío, en palabras ─────────────────────────────────────────

export type CanalReporte = "email" | "whatsapp";

/**
 * Traduce lo que devolvió Meta o Resend a qué tiene que hacer el dueño. El
 * mensaje crudo («401 … Invalid OAuth access token») no le dice nada a quien
 * tiene que arreglarlo; «el token venció, renuévalo en Meta» sí.
 */
export function explicarFalloEnvio(canal: CanalReporte, crudo: string | null | undefined): string {
  const m = (crudo ?? "").toLowerCase();
  if (m.includes("tope diario")) {
    return `Se llegó al tope de ${TOPE_MENSAJES_DIA} mensajes por día del negocio: sale mañana, o quita destinatarios.`;
  }
  if (canal === "whatsapp") {
    if (m.includes("no configurado")) return "WhatsApp: este servidor no tiene la cuenta de WhatsApp conectada.";
    /* Meta distingue el token que VENCIÓ del que ni siquiera es un token («Cannot
       parse access token»: cortado, con comillas de más o de otra app). Medido
       26-09 con la clave de este servidor: es el segundo caso. */
    if (m.includes("cannot parse access token") || m.includes("malformed")) {
      return "WhatsApp: el token cargado no es válido (Meta no lo puede leer) — copia otra vez el token permanente del usuario del sistema en Meta y cárgalo en Vercel.";
    }
    if (m.includes("expired") || m.includes("session has been invalidated")) {
      return "WhatsApp: el token venció — genera uno permanente en Meta (usuario del sistema) y cárgalo en Vercel.";
    }
    /* «error: 401» y no «401» suelto: un número de teléfono puede contener 401. */
    if (/error: 401\b/.test(m) || m.includes("oauth") || m.includes("access token")) {
      return "WhatsApp: Meta rechazó el token — renuévalo en Meta (usuario del sistema) y cárgalo en Vercel.";
    }
    if (m.includes("131047") || m.includes("re-engagement") || m.includes("24 hour")) {
      return "WhatsApp: ese número no te escribió en las últimas 24 h — mándale un «hola» al número del negocio o aprueba una plantilla en Meta.";
    }
    if (m.includes("131030") || m.includes("allowed list")) {
      return "WhatsApp: la cuenta está en modo prueba — agrega ese número a la lista permitida en Meta.";
    }
    if (m.includes("131026") || m.includes("not a valid whatsapp") || m.includes("undeliverable")) {
      return "WhatsApp: ese número no tiene WhatsApp o está mal escrito.";
    }
    if (m.includes("circuit") || m.includes("timeout") || m.includes("fetch failed")) {
      return "WhatsApp: Meta no respondió. Si no salió por ningún canal se reintenta solo en el próximo disparo del día; si no, usa «Enviar ahora».";
    }
    return `WhatsApp no lo aceptó${crudo ? `: ${crudo.slice(0, 140)}` : "."}`;
  }
  if (m.includes("no configurado")) return "Correo: este servidor no tiene el servicio de correo conectado.";
  if (m.includes("domain is not verified") || m.includes("not verified")) {
    const dominio = /the ([a-z0-9.-]+\.[a-z]{2,}) domain/i.exec(crudo ?? "")?.[1] ?? "el dominio";
    return `Correo: verifica ${dominio} en Resend (registros DNS) para poder mandar desde ahí.`;
  }
  if (m.includes("api key") || /\b40[13]\b/.test(m)) {
    return "Correo: la clave de Resend no sirve — genera otra y cárgala en Vercel.";
  }
  if (m.includes("testing emails") || m.includes("own email")) {
    return "Correo: Resend está en modo prueba y sólo manda a tu propio correo — verifica un dominio.";
  }
  if (m.includes("rate") || m.includes("429")) {
    return "Correo: Resend frenó por exceso de envíos. Si no salió por ningún canal se reintenta solo en el próximo disparo del día; si no, usa «Enviar ahora».";
  }
  return `El correo no salió${crudo ? `: ${crudo.slice(0, 140)}` : "."}`;
}

/** El `type` de `NotificationLog` de cada envío: con el id adentro para leer el historial de UN reporte. */
export const tipoDeLog = (reporteId: string, canal: CanalReporte) => `reporte_diario:${reporteId}:${canal}`;
export const prefijoDeLog = (reporteId: string) => `reporte_diario:${reporteId}:`;
/** Todos los mensajes de reportes del negocio (para el tope diario). */
export const PREFIJO_MENSAJES = "reporte_diario:";
/**
 * Un renglón por «Enviar ahora» (no por destinatario), para contar el tope por
 * reporte. Prefijo distinto de `reporte_diario:` a propósito: no es un mensaje,
 * no entra en el tope diario ni en el historial «Cómo salió».
 */
export const tipoEnvioManual = (reporteId: string) => `reporte_diario_manual:${reporteId}`;
