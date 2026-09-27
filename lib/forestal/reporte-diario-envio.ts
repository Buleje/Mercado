import "server-only";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { juntarDatosReporte } from "@/lib/db/forest-reporte-diario-datos.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { sendReporteDiario } from "@/lib/email/resend";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { describirEnvioWhatsApp, sufijoDeFallo } from "@/lib/whatsapp/aviso-plantilla";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { logger } from "@/lib/logger";
import { armarReporteForestal, type ReporteArmado } from "./reporte-diario-armado";
import {
  PREFIJO_MENSAJES,
  TOPE_ENVIAR_AHORA_DIA,
  TOPE_INTENTOS_DIA,
  TOPE_MENSAJES_DIA,
  explicarEnvioOk,
  explicarFalloEnvio,
  inicioDelDiaLima,
  intentosDeHoy,
  leTocaAhora,
  marcaDeReintento,
  relojLima,
  tipoDeLog,
  tipoEnvioManual,
  type CanalReporte,
  type RangoReporte,
  type ReporteDiario,
  type SeccionReporte,
} from "./reporte-diario";

/**
 * Reportes diarios (ADR-439) — armar, mandar y dejar constancia.
 *
 * Cada intento, salga o falle, queda en `NotificationLog` con el error CRUDO
 * (la pantalla lo traduce con `explicarFalloEnvio`). Un reporte que falla en
 * silencio es un reporte que no existe: medido 23-09, los avisos de plazos de
 * Blas fallaban desde el 12/09 y nadie lo vio desde el panel.
 */

const PANEL_URL = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe"}/admin?tab=ctp-libro-operaciones`;

export interface ResultadoEnvio {
  canal: CanalReporte;
  destino: string;
  ok: boolean;
  /** Lo que devolvió Meta/Resend, tal cual. */
  error: string | null;
  /** Lo mismo, en palabras de qué hacer; si salió, la advertencia que corresponda (WhatsApp de texto libre). */
  explicacion: string | null;
  /**
   * Lo que queda en `NotificationLog` además del asunto: cómo salió el WhatsApp
   * (plantilla o texto libre), por qué número y su `wamid`. `null` en correo.
   */
  constancia?: string | null;
}

/** Arma el reporte con los datos de HOY (Lima) sin mandar nada: la vista previa. */
export async function armarReporteDe(
  tenantId: string,
  r: { nombre?: string; secciones: readonly SeccionReporte[]; rango: RangoReporte },
  ahora: Date,
): Promise<ReporteArmado & { desde: string; hasta: string; fallidas: SeccionReporte[] }> {
  const { fecha } = relojLima(ahora);
  const datos = await juntarDatosReporte(tenantId, {
    secciones: r.secciones,
    rango: r.rango,
    fecha,
    ahora,
    nombreReporte: r.nombre?.trim() || "Reporte del día",
    panelUrl: PANEL_URL,
  });
  return { ...armarReporteForestal(datos, r.secciones), desde: datos.desde, hasta: datos.hasta, fallidas: datos.fallidas ?? [] };
}

async function registrar(tenantId: string, reporteId: string, res: ResultadoEnvio, detalleOk: string) {
  const ok = [detalleOk, res.constancia].filter(Boolean).join(" · ");
  const fallo = `${(res.error ?? "rechazado sin motivo").slice(0, 400)}${res.constancia ?? ""}`;
  await NotificationLogsDB.add(
    {
      type: tipoDeLog(reporteId, res.canal),
      recipient: res.destino,
      status: res.ok ? "sent" : "failed",
      message: (res.ok ? ok : fallo).slice(0, 500),
    },
    tenantId,
  ).catch((err) =>
    logger.error("[reporte-diario] no se pudo registrar el envío", { tenantId, reporteId, err: String(err).slice(0, 200) }),
  );
}

async function porCorreo(destino: string, armado: ReporteArmado): Promise<ResultadoEnvio> {
  const r = await sendReporteDiario(destino, armado.asunto, armado.html);
  const error = r?.error ? String(r.error.message ?? "rechazado sin motivo") : null;
  return { canal: "email", destino, ok: !error, error, explicacion: error ? explicarFalloEnvio("email", error) : null };
}

/**
 * Con el número del negocio si tiene uno conectado; si no, con la cuenta del
 * servidor. Plantilla si el negocio tiene una aprobada; si no, texto libre con
 * su advertencia (ver `enviarWhatsAppDelNegocio`).
 */
async function porWhatsapp(tenantId: string, destino: string, armado: ReporteArmado): Promise<ResultadoEnvio> {
  const r = await enviarWhatsAppDelNegocio(tenantId, destino, armado.texto, { contexto: "reporte_diario" });
  if (!r.ok) {
    const error = r.error ?? "rechazado sin motivo";
    const constancia = sufijoDeFallo(r.via);
    return { canal: "whatsapp", destino, ok: false, error, explicacion: explicarFalloEnvio("whatsapp", `${error}${constancia}`), constancia };
  }
  const constancia = describirEnvioWhatsApp(r);
  const explicacion = r.puedeNoLlegar ? explicarEnvioOk("whatsapp", constancia) : null;
  return { canal: "whatsapp", destino, ok: true, error: null, explicacion, constancia };
}

/** El negocio ya mandó hoy todos los mensajes de reportes que se le permiten. */
export class TopeDiarioError extends Error {
  constructor(usados: number, necesita: number) {
    super(
      `Tope diario de ${TOPE_MENSAJES_DIA} mensajes de reportes alcanzado (${usados} hoy; este reporte necesita ${necesita}). Sale mañana, o quita destinatarios.`,
    );
  }
}

/** El presupuesto de tiempo de la corrida se acabó antes del primer mensaje. */
export class SinTiempoError extends Error {
  constructor() {
    super("Sin tiempo en esta corrida: queda para el disparo siguiente.");
  }
}

/** Los destinatarios que de verdad se usan: los de los canales prendidos. */
const destinatarios = (r: Pick<ReporteDiario, "porCorreo" | "porWhatsapp" | "correos" | "telefonos">) =>
  [
    ...(r.porCorreo ? r.correos.map((d) => ({ canal: "email" as const, destino: d })) : []),
    ...(r.porWhatsapp ? r.telefonos.map((d) => ({ canal: "whatsapp" as const, destino: d })) : []),
  ];

/**
 * «Enviar ahora»: reserva uno de los `TOPE_ENVIAR_AHORA_DIA` del día para este
 * reporte. Se cuenta en `NotificationLog` (un renglón por pedido, con su propio
 * prefijo) y no en memoria: en Vercel cada llamada puede caer en otra
 * instancia, y un contador en memoria se reinicia solo. `false` = ya no quedan.
 */
export async function reservarEnvioManual(tenantId: string, reporteId: string, ahora: Date, usuario: string): Promise<boolean> {
  const usados = await NotificationLogsDB.contarDesde(tenantId, tipoEnvioManual(reporteId), inicioDelDiaLima(ahora));
  if (usados >= TOPE_ENVIAR_AHORA_DIA) return false;
  await NotificationLogsDB.add(
    { type: tipoEnvioManual(reporteId), recipient: usuario, status: "sent", message: "Enviar ahora" },
    tenantId,
  );
  return true;
}

/**
 * Manda un reporte a TODOS sus destinatarios, por los canales prendidos. De a
 * uno y no en paralelo: son pocos (≤ 10) y así un 429 de Meta no tumba a los
 * demás a la vez.
 *
 * Antes de mandar mira el tope diario del NEGOCIO (`TOPE_MENSAJES_DIA`,
 * contado en `NotificationLog`): si no entran todos, no manda ninguno y tira
 * `TopeDiarioError` — medio reporte a medio destinatario no le sirve a nadie.
 *
 * `limiteMs` (sólo el despachador): si el reloj lo pasa antes del primer
 * mensaje, tira `SinTiempoError` sin mandar nada; después del primero, corta
 * los que falten (lo mandado ya cierra el día).
 */
export async function enviarReporteDiario(
  tenantId: string,
  reporte: ReporteDiario,
  o: { ahora: Date; motivo: "programado" | "manual"; usuario: string; limiteMs?: number; reloj?: () => number },
): Promise<{ asunto: string; resultados: ResultadoEnvio[] }> {
  const lista = destinatarios(reporte);
  const usados = await NotificationLogsDB.contarDesde(tenantId, PREFIJO_MENSAJES, inicioDelDiaLima(o.ahora));
  if (usados + lista.length > TOPE_MENSAJES_DIA) throw new TopeDiarioError(usados, lista.length);

  const armado = await armarReporteDe(tenantId, reporte, o.ahora);
  const resultados: ResultadoEnvio[] = [];
  const marca = o.motivo === "manual" ? `Enviado a mano por ${o.usuario}: ` : "";
  const reloj = o.reloj ?? Date.now;
  for (const d of lista) {
    if (o.limiteMs != null && reloj() > o.limiteMs) {
      if (resultados.length === 0) throw new SinTiempoError();
      break;
    }
    const res = d.canal === "email" ? await porCorreo(d.destino, armado) : await porWhatsapp(tenantId, d.destino, armado);
    resultados.push(res);
    await registrar(tenantId, reporte.id, res, `${marca}${armado.asunto}`);
  }
  const ok = resultados.filter((r) => r.ok).length;
  auditCtp({
    tenantId,
    action: "ctp_reporte_diario_enviar",
    entity: "ForestReporteDiario",
    entityId: reporte.id,
    detail: `«${reporte.nombre}» (${o.motivo}): ${ok} de ${resultados.length} envíos salieron`,
    user: o.usuario,
  });
  return { asunto: armado.asunto, resultados };
}

export interface ResumenDespacho {
  revisados: number;
  tocaban: number;
  enviados: number;
  /** Otro disparo ya lo había reclamado hoy (idempotencia). */
  yaReclamados: number;
  enviosOk: number;
  enviosFallidos: number;
  /** Fallaron TODOS sus canales y quedaron para el disparo siguiente del día. */
  reintentos: number;
  /** No salieron por el tope diario de mensajes del negocio. */
  topeDiario: number;
  /** La corrida cortó por tiempo: lo que no alcanzó queda sin reclamar. */
  cortadoPorTiempo: boolean;
}

/**
 * Cuánto puede durar una corrida del despachador. La ruta del cron tiene
 * `maxDuration: 300` en `vercel.json`: se corta a los 250 s para no morir a
 * mitad de un envío con la reserva tomada.
 */
export const PRESUPUESTO_CORRIDA_MS = 250_000;

/**
 * El despachador del cron: manda los reportes a los que ya les llegó la hora
 * hoy y todavía no salieron. Idempotente por (reporte, día de Lima): el
 * reclamo es un `updateMany` compare-and-swap, así dos disparos no duplican.
 *
 * Reintento (revisión 26-09): el día queda CERRADO si al menos un mensaje
 * salió. Si fallaron TODOS (credenciales caídas, Meta sin responder), la
 * reserva se devuelve con la marca del intento y el disparo siguiente del
 * mismo día lo vuelve a probar, hasta `TOPE_INTENTOS_DIA`; ahí se cierra. Se
 * eligió esto y no «nunca reintentar» porque el aviso decía «se intenta de
 * nuevo en el próximo envío» y no era verdad; y no «reintentar siempre»
 * porque con un token vencido son cuatro 401 por destinatario al día.
 *
 * Presupuesto de tiempo: antes de reclamar cada reporte mira el reloj; los
 * que no alcanzan quedan SIN reclamar (el disparo siguiente los toma, en el
 * mismo orden). Si el tiempo se acaba entre el reclamo y el primer mensaje,
 * la reserva se devuelve tal como estaba.
 */
export async function despacharReportesDiarios(
  ahora: Date,
  opts: { presupuestoMs?: number; reloj?: () => number } = {},
): Promise<ResumenDespacho> {
  const reloj = opts.reloj ?? Date.now;
  const limiteMs = reloj() + (opts.presupuestoMs ?? PRESUPUESTO_CORRIDA_MS);
  const lima = relojLima(ahora);
  const todos = await ForestReporteDiarioDB.paraDespachar();
  const res: ResumenDespacho = {
    revisados: todos.length,
    tocaban: 0,
    enviados: 0,
    yaReclamados: 0,
    enviosOk: 0,
    enviosFallidos: 0,
    reintentos: 0,
    topeDiario: 0,
    cortadoPorTiempo: false,
  };
  for (const r of todos) {
    if (!leTocaAhora(r, lima)) continue;
    if (reloj() > limiteMs) {
      res.cortadoPorTiempo = true;
      break;
    }
    res.tocaban += 1;
    const previo = r.ultimaFechaEnviada;
    let reclamado = false;
    try {
      reclamado = await ForestReporteDiarioDB.reclamarEnvio(r.tenantId, r.id, lima.fecha, previo);
      if (!reclamado) {
        res.yaReclamados += 1;
        continue;
      }
      const { resultados } = await enviarReporteDiario(r.tenantId, r, { ahora, motivo: "programado", usuario: "cron", limiteMs, reloj });
      const ok = resultados.filter((x) => x.ok).length;
      res.enviados += 1;
      res.enviosOk += ok;
      res.enviosFallidos += resultados.length - ok;
      if (ok === 0 && resultados.length > 0 && (await reintentarLuego(r, lima.fecha, previo))) res.reintentos += 1;
    } catch (err) {
      if (err instanceof SinTiempoError) {
        await ForestReporteDiarioDB.devolverReserva(r.tenantId, r.id, lima.fecha, previo);
        res.cortadoPorTiempo = true;
        break;
      }
      if (err instanceof TopeDiarioError) {
        // El tope es del día: no se reintenta; queda dicho en «Cómo salió».
        res.topeDiario += 1;
        const canal = r.porCorreo ? "email" : "whatsapp";
        await registrar(r.tenantId, r.id, { canal, destino: "—", ok: false, error: err.message, explicacion: null }, "");
        continue;
      }
      // Un reporte que falla no deja sin su reporte a los demás negocios.
      logger.error("[reporte-diario] no se pudo mandar", { tenantId: r.tenantId, reporteId: r.id, err: String(err).slice(0, 300) });
      if (reclamado && (await reintentarLuego(r, lima.fecha, previo))) res.reintentos += 1;
    }
  }
  return res;
}

/** Fallaron todos: devuelve la reserva con la marca del intento, si quedan intentos hoy. */
async function reintentarLuego(r: ReporteDiario & { tenantId: string }, fecha: string, previo: string | null): Promise<boolean> {
  const intento = intentosDeHoy(previo, fecha) + 1;
  if (intento >= TOPE_INTENTOS_DIA) return false;
  return ForestReporteDiarioDB.devolverReserva(r.tenantId, r.id, fecha, marcaDeReintento(fecha, intento));
}
