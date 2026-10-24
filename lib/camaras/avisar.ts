import "server-only";

/**
 * Avisar por WhatsApp cuando la cámara vio a alguien (2026-09-12).
 *
 * Corre DESPUÉS de que la IA leyó la foto y siempre en segundo plano: la cámara
 * ya recibió su 200 y el aviso no puede hacer fallar la ingesta. Si el envío
 * falla, se loguea; la foto y su lectura quedan igual en el historial.
 *
 * Las reglas de «cuándo» viven en `debeAvisar` (puro, testeado): acá sólo se
 * arma el texto, se manda y se anota que se mandó.
 */

import { logger } from "@/lib/logger";
import { enviarWhatsAppDelNegocio, type OpcionesEnvioNegocio } from "@/lib/whatsapp-tenant";
import { resumenEnvioWhatsApp } from "@/lib/whatsapp/aviso-plantilla";
import { CamarasDB } from "@/lib/db/camaras.db";
import { debeAvisar, textoDelAviso, type Camara, type Captura } from "./camaras";
import type { MetaFotoPersona, MotivoFotoPersona } from "./personas";

/** A dónde lleva el enlace del WhatsApp: la pestaña de cámaras del panel. */
export function enlaceAlPanelDeCamaras(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  return `${base}/admin?tab=camaras`;
}

/**
 * Manda UN WhatsApp de la cámara por el canal del negocio y dice si salió.
 *
 * Es el único camino de salida de los avisos de cámaras —persona/vehículo y
 * pila de trozas—: con el número del negocio (el del bot) si tiene uno activo;
 * si no, con la cuenta del servidor. Dos reintentos sólo ante fallas pasajeras
 * (red, 5xx), salvo que `envio` pida otra cosa. Nunca tira.
 */
export async function mandarWhatsAppDeCamara(
  tenantId: string,
  telefono: string,
  texto: string,
  log: Record<string, unknown>,
  envio: Pick<OpcionesEnvioNegocio, "reintentos" | "esperaMs" | "pausaMs"> = {},
): Promise<boolean> {
  const wa = await enviarWhatsAppDelNegocio(tenantId, telefono, texto, {
    contexto: "camaras",
    reintentos: 2,
    ...envio,
  });
  const constancia = resumenEnvioWhatsApp(wa);
  if (!wa.ok) {
    logger.warn("[camaras.avisar] no se pudo mandar el WhatsApp", { tenantId, ...log, constancia });
    return false;
  }
  logger.info("[camaras.avisar] aviso mandado", { tenantId, ...log, constancia });
  return true;
}

export async function avisarSiCorresponde(
  tenantId: string,
  camara: Camara,
  captura: Pick<Captura, "id" | "lectura">,
): Promise<void> {
  const ahora = new Date();
  /* La cámara puede haber cambiado desde que llegó la foto (alguien la
     configuró mientras la IA leía): se relee antes de decidir. */
  const actual = (await CamarasDB.list(tenantId)).find((c) => c.id === camara.id) ?? camara;
  if (!debeAvisar(actual, captura.lectura, ahora) || !captura.lectura || !actual.avisos?.whatsapp) return;

  const texto = textoDelAviso(actual, captura.lectura, ahora, enlaceAlPanelDeCamaras());
  const salio = await mandarWhatsAppDeCamara(tenantId, actual.avisos.whatsapp, texto, {
    camaraId: actual.id,
    capturaId: captura.id,
  });
  if (salio) await CamarasDB.marcarAvisada(tenantId, actual.id, ahora);
}

/* ── Fotos del detector de personas del mosaico en vivo (2026-10-08) ─────────
   El mosaico «Ver todas en vivo» mira cada cámara con un detector LOCAL (sin
   IA paga) y sube una foto al Drive cuando aparece gente
   (`POST /api/admin/camaras/[id]/persona`). Esa foto avisa con la MISMA
   configuración de la cámara que las fotos de la IA: número, franja
   («sólo de noche» / «siempre» / «nunca») y la pausa de 10 minutos, que es
   una sola para los dos caminos. */

/**
 * Qué fotos del detector avisan. «Apareció alguien» y «llegó otra persona», sí.
 * «Sigue en cuadro», nunca: el detector manda una por minuto mientras alguien
 * trabaja delante de la cámara; esa persona ya avisó cuando apareció, y con
 * «siempre» saldría un WhatsApp cada 10 minutos por el mismo trabajador.
 */
export const MOTIVOS_PERSONA_QUE_AVISAN: readonly MotivoFotoPersona[] = ["aparecio", "mas_gente"];

/** ¿Esta foto del detector avisa? Pura: motivo + las reglas de `debeAvisar`. */
export function debeAvisarPersonaDelMosaico(
  camara: Pick<Camara, "avisos" | "activa">,
  motivo: MotivoFotoPersona,
  ahora: Date,
): boolean {
  if (!MOTIVOS_PERSONA_QUE_AVISAN.includes(motivo)) return false;
  /* El detector sólo sube fotos con gente: la lectura es «hay persona». */
  return debeAvisar(camara, { hayPersona: true, hayVehiculo: false }, ahora);
}

/**
 * El enlace del WhatsApp: la galería «Personas» de Cámaras. Si esa vista no
 * existe (o el rol no la tiene), el panel cae en la vista de Cámaras que
 * corresponda (`useVistaModulo` ignora una `vista` que no conoce).
 */
export function enlaceAPersonasDelMosaico(): string {
  return `${enlaceAlPanelDeCamaras()}&vista=personas`;
}

/* 24 h («21:14», no «09:14 p. m.»): el aviso se lee de madrugada y de un vistazo. */
const HORA_DEL_AVISO = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

/** El texto: cámara, hora de Lima, cuántas personas y el enlace. Sin la foto (ver abajo). */
export function textoAvisoPersonaDelMosaico(
  camara: Pick<Camara, "nombre" | "lugar">,
  meta: Pick<MetaFotoPersona, "motivo" | "personas">,
  cuando: Date,
  enlace: string,
): string {
  const n = meta.personas;
  const que =
    meta.motivo === "mas_gente"
      ? n > 1
        ? `Llegó otra persona: ahora son ${n}`
        : "Llegó otra persona"
      : n > 1
        ? `Aparecieron ${n} personas`
        : "Apareció una persona";
  const lugar = camara.lugar ? ` (${camara.lugar})` : "";
  return `📷 ${camara.nombre}${lugar} · ${HORA_DEL_AVISO.format(cuando)}\n${que} en el video en vivo.\nVer las fotos: ${enlace}`;
}

export type ResultadoAvisoPersona = "mandado" | "no_corresponde" | "no_salio";

/**
 * El envío tiene que terminar dentro del `after()` de la ruta: en Vercel
 * `app/api/**` corta a los 30 s, y con lo de siempre (3 intentos de hasta 10 s
 * + pausas de 2 y 4 s) el peor caso eran 36 s — cortado ahí, el turno quedaba
 * tomado sin WhatsApp y frenaba el siguiente 10 minutos. Así: 8 + 2 + 8 = 18 s.
 */
const ENVIO_DENTRO_DE_AFTER = { reintentos: 1, esperaMs: 8_000, pausaMs: 2_000 } as const;

/**
 * Avisa por WhatsApp la foto que acaba de guardar el detector, si corresponde.
 *
 * Va sólo texto con el enlace al panel (detrás de la sesión), no la imagen:
 * los avisos salen por la Cloud API de Meta y, fuera de las 24 h desde que el
 * dueño le escribió al negocio, sólo se entrega una plantilla aprobada cuya
 * única variable es TEXTO (`aviso_libro_ctp`). Una imagen iría como mensaje
 * libre —Meta la acepta con 200 y la descarta (131047)— o pediría otra
 * plantilla con cabecera de imagen; y en los dos casos la foto de una persona
 * quedaría copiada en los servidores de Meta (Ley 29733), aunque el enlace
 * firmado del Drive venza en minutos.
 *
 * Corre en `after()` de la ruta: la foto ya está guardada y contestada. Puede
 * tirar por la base: el que llama lo cierra con `.catch(logger)`.
 */
export async function avisarPersonaDelMosaico(
  tenantId: string,
  camaraId: string,
  meta: Pick<MetaFotoPersona, "motivo" | "personas">,
  ahora: Date = new Date(),
): Promise<ResultadoAvisoPersona> {
  if (!MOTIVOS_PERSONA_QUE_AVISAN.includes(meta.motivo)) return "no_corresponde";
  /* Primer filtro con la lista en caché: la mayoría de las fotos (de día con
     «sólo de noche», o dentro de la pausa) no llega a tomar el candado. */
  const enCache = (await CamarasDB.list(tenantId)).find((c) => c.id === camaraId);
  if (!enCache || !debeAvisarPersonaDelMosaico(enCache, meta.motivo, ahora)) return "no_corresponde";

  /* El turno se toma ANTES de mandar y bajo candado, con la cámara fresca:
     «apareció» y «llegó otra» llegan con 1-2 s de diferencia, y con el mosaico
     abierto en dos pantallas cada una sube su foto. Sin esto, dos WhatsApps. */
  const turno = await CamarasDB.reservarAviso(tenantId, camaraId, ahora, (c) =>
    debeAvisarPersonaDelMosaico(c, meta.motivo, ahora),
  );
  const numero = turno.ok ? turno.camara.avisos?.whatsapp : null;
  if (!turno.ok || !numero) return "no_corresponde";

  const texto = textoAvisoPersonaDelMosaico(turno.camara, meta, ahora, enlaceAPersonasDelMosaico());
  const salio = await mandarWhatsAppDeCamara(
    tenantId,
    numero,
    texto,
    { camaraId, origen: "detector-personas", motivo: meta.motivo },
    ENVIO_DENTRO_DE_AFTER,
  );
  if (salio) return "mandado";

  /* No salió: se devuelve el turno para que la próxima persona sí avise. */
  await CamarasDB.liberarAviso(tenantId, camaraId, ahora, turno.previo).catch((err) =>
    logger.error("[camaras.avisar] no se pudo devolver el turno del aviso", {
      tenantId,
      camaraId,
      error: String(err),
    }),
  );
  return "no_salio";
}
