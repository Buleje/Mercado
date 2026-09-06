import "server-only";

/**
 * lib/whatsapp/anotar.ts
 *
 * El bot que ANOTA por WhatsApp. Le hablás al número del negocio —escribiendo
 * o con una nota de voz— y la operación queda en los libros.
 *
 *   Vos: 🎤 «anotame 25 galones de petróleo para el camión N12 a 27 el galón»
 *   Bot: Gasto de S/ 675.00 · combustible · Camión N12
 *        25 × S/ 27.00 = S/ 675.00
 *        [ Confirmar ]  [ Cancelar ]
 *   Vos: (tocás Confirmar)
 *   Bot: ✅ Anotado: S/ 675.00 de combustible para Camión N12.
 *
 * ── Qué NO es ────────────────────────────────────────────────────────────────
 * No es un motor nuevo. `conversar()` ya recibe un `canal` y hace todo el
 * trabajo —entender, recordar el turno anterior, ensayar la escritura, dejarla
 * pendiente de aprobación—; Telegram (ADR-388) es el otro que lo llama. Acá
 * sólo se traduce ese flujo a los mensajes de WhatsApp. Cambia el canal, no la
 * regla: si mañana cambia una validación, cambia para los dos a la vez.
 *
 * ── El riesgo propio de este canal ───────────────────────────────────────────
 * A diferencia de Telegram, este número TAMBIÉN atiende clientes (el Concierge,
 * ADR-058). Nada de lo de acá corre si el teléfono no está en la lista blanca
 * de `WhatsAppDuenosDB`: el webhook decide de qué lado cae ANTES de llamarnos.
 */

import { logger } from "@/lib/logger";
import { transcribirAudio } from "@/lib/ai/transcribir";
import { conversar } from "@/lib/asistente/conversar";
import { olvidar, anotarHecho } from "@/lib/asistente/memoria";
import { nombreDelNegocio } from "@/lib/asistente/negocio";
import { WhatsAppDuenosDB } from "@/lib/db/whatsapp-duenos.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { getPendingApproval, removePendingApproval } from "@/lib/agents/pending-approvals";
import { bajarMedia, mandarTexto, mandarBotones, type CredencialesMeta } from "./bot-dueno";

/**
 * El rol con el que corre lo que entra por WhatsApp.
 *
 * Vincular un teléfono es una acción que sólo se hace desde el panel con un
 * código de 15 minutos: quien está del otro lado ya tiene, en los hechos, su
 * negocio. Mismo criterio que Telegram.
 */
const ROL = "admin" as const;

/**
 * Cuántos mensajes por minuto aguanta un teléfono.
 *
 * Cada mensaje puede disparar una transcripción y dos llamadas al modelo, y el
 * free tier de Groq son 8.000 tokens POR MINUTO para todo el negocio. Sin
 * freno, un audio reenviado en cadena deja al asistente sin cuota.
 */
const TOPE_POR_MINUTO = 12;
const pulsos = new Map<string, number[]>();

function pasaElFreno(telefono: string): boolean {
  const ahora = Date.now();
  const recientes = (pulsos.get(telefono) ?? []).filter((t) => ahora - t < 60_000);
  if (recientes.length >= TOPE_POR_MINUTO) {
    pulsos.set(telefono, recientes);
    return false;
  }
  recientes.push(ahora);
  pulsos.set(telefono, recientes);
  if (pulsos.size > 500) {
    for (const [id, ts] of pulsos) if (ts.every((t) => ahora - t > 60_000)) pulsos.delete(id);
  }
  return true;
}

/**
 * Los audios largos son conversaciones, no operaciones: transcribirlos quema
 * cuota para nada.
 *
 * Se mide en BYTES, no en segundos: el webhook de Meta manda el `id` y el mime
 * del adjunto pero **no su duración**, así que un tope en segundos sería una
 * comparación contra `undefined` que nunca frena nada. Una nota de voz de
 * WhatsApp ronda 1 KB por segundo; 4 MB son varios minutos largos.
 */
const MAX_BYTES_AUDIO = 4 * 1024 * 1024;

export const AYUDA_DUENO =
  "Contame qué pasó y lo anoto donde va. Escribime o mandame una *nota de voz*.\n\n" +
  "*Para anotar*\n" +
  "• «25 galones de petróleo para el camión N12 a 27 el galón»\n" +
  "• «le adelanté 300 soles en efectivo a Juan Pérez»\n" +
  "• «Doña Rosa me pagó 50 de lo que debía»\n" +
  "• «recordame el lunes a las 8 llamar al ingeniero»\n\n" +
  "*Para preguntar*\n" +
  "• «¿cuánto gasté este mes?» · «¿quién me debe?» · «¿cómo viene la caja?»\n\n" +
  "Podés decirme *varias cosas en un mismo audio* y las anoto todas. Antes de " +
  "guardar te muestro qué se va a anotar y por cuánto: recién cuando tocás " +
  "*Confirmar* queda en los libros.\n\n" +
  "*Comandos:* hoy · olvidar · desvincular · ayuda";

/**
 * Los datos que el webhook ya extrajo del mensaje de Meta. Se le pasan armados
 * para que este módulo no tenga que conocer la forma del payload de WhatsApp.
 */
export interface MensajeDueno {
  tenantId: string;
  telefono: string;
  nombre: string;
  /** Texto escrito, o el `caption` de un adjunto. Puede venir vacío. */
  texto: string;
  /** Nota de voz o audio adjunto. Meta no manda la duración, sólo el id. */
  audio?: { id: string; mime?: string };
  /** Foto adjunta — hoy sólo sirve para explicar por qué todavía no se lee. */
  imagen?: { id: string; mime?: string };
  /** `id` del botón que tocó (viene de `interactive.button_reply.id`). */
  botonId?: string;
  cred: CredencialesMeta;
}

/** Prefijos de los botones. El id lleva la acción y la aprobación: `ok:<id>`. */
const BOTON_OK = "anotar-ok";
const BOTON_NO = "anotar-no";

// ── Entrada principal ────────────────────────────────────────────────────────

export async function manejarMensajeDeDueno(msg: MensajeDueno): Promise<void> {
  const { tenantId, telefono, cred } = msg;

  if (msg.botonId) {
    await manejarBoton(msg);
    return;
  }

  if (!pasaElFreno(telefono)) {
    await mandarTexto(cred, telefono, "⏳ Vas muy rápido. Esperá un minuto y seguimos.");
    return;
  }

  const comando = msg.texto.trim().replace(/^\//, "").toLowerCase();

  if (comando === "ayuda" || comando === "help" || comando === "hola") {
    const negocio = await TenantsDB.getBasicById(tenantId);
    await mandarTexto(cred, telefono, `👋 Estás conectado a *${negocio?.name ?? tenantId}*.\n\n${AYUDA_DUENO}`);
    return;
  }

  if (comando === "hoy") {
    const { calcularAvisos, comoTexto } = await import("@/lib/asistente/avisos");
    const avisos = await calcularAvisos(tenantId);
    await mandarTexto(cred, telefono, `☀️ *Lo que veo hoy*\n\n${comoTexto(avisos)}`);
    return;
  }

  if (comando === "olvidar") {
    olvidar(sesionDe(telefono));
    await mandarTexto(cred, telefono, "🧹 Listo, empezamos de nuevo. Contame qué pasó.");
    return;
  }

  if (comando === "desvincular") {
    await WhatsAppDuenosDB.desvincular(tenantId, telefono);
    await mandarTexto(
      cred,
      telefono,
      "🔌 Desvinculado. Ya no puedo anotar nada desde este teléfono.\n\n" +
        "Si volvés a escribir, te atiende el bot de la tienda como a cualquier cliente.",
    );
    return;
  }

  // ── Audio → texto ────────────────────────────────────────────────────────
  let dictado = msg.texto;
  if (msg.audio) {
    const archivo = await bajarMedia(msg.audio.id, cred.token);
    if (!archivo) {
      await mandarTexto(cred, telefono, "No pude bajar el audio de WhatsApp. Probá mandarlo de nuevo.");
      return;
    }
    if (archivo.bytes.byteLength > MAX_BYTES_AUDIO) {
      await mandarTexto(
        cred,
        telefono,
        "🎤 Ese audio es muy largo. Mandame uno más corto, de una operación por vez.",
      );
      return;
    }
    const t = await transcribirAudio(archivo.bytes, archivo.nombre);
    if (!t.ok) {
      await mandarTexto(cred, telefono, `🎤 ${t.error}`);
      return;
    }
    dictado = [msg.texto, t.transcripcion.texto].filter(Boolean).join(" ").trim();
    // Se muestra lo que se entendió ANTES de interpretarlo: si Whisper oyó mal
    // «27» como «venti siete», se ve acá y no en el asiento.
    await mandarTexto(cred, telefono, `🎤 Te entendí: «_${t.transcripcion.texto}_»`);
  }

  /**
   * Las fotos todavía no se leen: hoy no hay ningún modelo de visión disponible
   * (Groq —el único proveedor con credenciales vivas— no sirve ninguno). Se
   * dice explícitamente en vez de ignorar el mensaje, porque una boleta enviada
   * y no contestada se lee como «lo anotó».
   */
  if (msg.imagen && !dictado) {
    await mandarTexto(
      cred,
      telefono,
      "📷 Recibí la foto, pero todavía no puedo leer boletas.\n\n" +
        "Contame en un audio o por escrito qué es y lo anoto: «esta boleta es de 180 soles de combustible del grifo El Sol».",
    );
    return;
  }

  if (!dictado) {
    await mandarTexto(cred, telefono, AYUDA_DUENO);
    return;
  }

  // ── Entender y proponer ──────────────────────────────────────────────────
  const r = await conversar({
    tenantId,
    // La sesión es el TELÉFONO: es lo que hace que «el N12» después de «¿cuál
    // de los dos?» signifique algo.
    sesionId: sesionDe(telefono),
    texto: dictado,
    actorRole: ROL,
    solicitante: `whatsapp:${msg.nombre}`,
    canal: "whatsapp",
  });

  WhatsAppDuenosDB.marcarUso(tenantId, telefono).catch((err) =>
    logger.warn("[whatsapp/dueño] no se pudo marcar el uso", { error: String(err) }),
  );

  // Lo que dijo va primero: suele ser la aclaración de lo que está por anotar.
  if (r.texto) await mandarTexto(cred, telefono, r.texto);

  /**
   * Una tarjeta por operación. Un audio que dicta tres cosas deja tres
   * confirmaciones, no una: aprobarlas juntas obligaría a aceptar o rechazar el
   * paquete entero cuando una sola está mal.
   */
  /**
   * El negocio va EN la pregunta. Acá pesa más que en Telegram: el mismo número
   * de WhatsApp atiende clientes y anota, y quien dicta puede tener el panel
   * abierto en otro negocio. «¿Lo anoto?» sin decir dónde manda a buscar el dato
   * al lugar equivocado (pasó de verdad el 2026-09-05).
   */
  const negocio = await nombreDelNegocio(tenantId);
  const dondePregunta = negocio ? `¿Lo anoto en *${negocio}*?` : "¿Lo anoto?";

  for (const p of r.pendientes) {
    await mandarBotones(cred, telefono, `📝 *${p.resumen}*\n\n${dondePregunta}`, [
      { id: `${BOTON_OK}:${p.id}`, titulo: "✅ Confirmar" },
      { id: `${BOTON_NO}:${p.id}`, titulo: "✖ Cancelar" },
    ]);
  }

  // Las que se registraron sin pasar por tarjeta también dicen dónde quedaron.
  for (const reg of r.registradas) {
    await mandarTexto(cred, telefono, `✅ ${reg.resumen}` + (negocio ? `\n📍 _${negocio}_` : ""));
  }

  // Ni texto ni operaciones: hay que decir algo, o el bot se queda mudo.
  if (!r.texto && r.pendientes.length === 0 && r.registradas.length === 0) {
    await mandarTexto(cred, telefono, "🤔 No terminé de entender. Decímelo de otra forma, o escribime *ayuda*.");
  }
}

// ── Botones ──────────────────────────────────────────────────────────────────

async function manejarBoton(msg: MensajeDueno): Promise<void> {
  const { tenantId, telefono, cred } = msg;
  const [accion, aprobacionId] = (msg.botonId ?? "").split(":");
  const pendiente = aprobacionId ? getPendingApproval(aprobacionId) : null;

  /**
   * El tenant se compara SIEMPRE, aunque el botón venga de un mensaje del
   * propio bot: sin esto, un teléfono vinculado a un negocio podría confirmar
   * la operación pendiente de otro reenviando el id del botón.
   */
  if (!pendiente || pendiente.tenantId !== tenantId) {
    await mandarTexto(
      cred,
      telefono,
      "⌛ Esa operación ya no está pendiente (se confirmó, se canceló, o pasaron los 10 minutos). Mandámela de nuevo.",
    );
    return;
  }

  if (accion === BOTON_NO) {
    removePendingApproval(aprobacionId);
    await mandarTexto(cred, telefono, "✖ Listo, no anoté nada.");
    return;
  }

  if (accion !== BOTON_OK) return;

  await ensureAgentsRegistered();
  const res = await orchestrator.executeSync({
    domain: pendiente.domain as Parameters<typeof orchestrator.executeSync>[0]["domain"],
    action: pendiente.action,
    payload: pendiente.payload,
    tenantId,
    actorRole: ROL,
  });
  removePendingApproval(aprobacionId);

  if (!res.success) {
    await mandarTexto(cred, telefono, `⚠️ No se pudo anotar: ${res.error ?? "error desconocido"}`);
    return;
  }

  const datos = (res.data ?? {}) as Record<string, unknown>;
  const donde = datos.dondeVerlo as { pantalla?: string } | undefined;
  logger.info("[whatsapp/dueño] operación anotada", { tenantId, tool: pendiente.toolName });
  // Negocio Y pantalla: son las dos mitades de «dónde lo veo».
  const negocioConfirmado = await nombreDelNegocio(tenantId);
  const ubicacion = [negocioConfirmado, donde?.pantalla].filter(Boolean);
  /**
   * Que la conversación sepa que esto YA quedó anotado. Sin esto, un «anotalo»
   * dos minutos después vuelve a proponer la misma operación como si nada.
   */
  anotarHecho(sesionDe(telefono), tenantId, String(datos.confirmacion ?? pendiente.toolName));
  await mandarTexto(
    cred,
    telefono,
    `✅ ${String(datos.confirmacion ?? "Operación registrada.")}` +
      (ubicacion.length ? `\n\n📍 _${ubicacion.join(" › ")}_` : ""),
  );
}

/** La memoria de la conversación se guarda por teléfono, no por persona. */
const sesionDe = (telefono: string) => `whatsapp:${telefono}`;

// ── Vinculación ──────────────────────────────────────────────────────────────

/**
 * Reconoce el mensaje con el que un teléfono se engancha al negocio.
 *
 * Hace falta una puerta explícita porque hay un huevo y una gallina: mientras
 * el teléfono NO está vinculado, el webhook lo manda al bot de clientes, así
 * que nunca llegaría acá para vincularse. Esta frase es lo único que se mira
 * ANTES de esa decisión.
 *
 * El patrón es angosto a propósito —la palabra `vincular` seguida de un código
 * de seis caracteres del alfabeto sin 0/O ni 1/I/L— para que ningún cliente
 * caiga acá escribiendo normal. Si un cliente igual la escribe, el peor caso es
 * que le contesten «ese código no vale».
 */
const FRASE_VINCULAR = /^\/?vincular[\s:]+([A-Za-z0-9]{6})$/;

export function pareceVinculacion(texto: string): string | null {
  const m = texto.trim().match(FRASE_VINCULAR);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Canjea el código y deja el teléfono habilitado para anotar.
 *
 * Devuelve `true` si el mensaje quedó atendido (con vínculo o con el aviso de
 * código inválido). El webhook no debe seguir al bot de clientes en ninguno de
 * los dos casos: quien tipeó «vincular XXXXXX» no está comprando nada.
 */
export async function intentarVincular(params: {
  codigo: string;
  telefono: string;
  nombre: string;
  /** El negocio dueño del número que recibió el mensaje. */
  tenantIdDelNumero: string;
  cred: CredencialesMeta;
}): Promise<boolean> {
  const { codigo, telefono, nombre, tenantIdDelNumero, cred } = params;
  const { canjearCodigo } = await import("@/lib/asistente/vinculacion");
  const canje = canjearCodigo(codigo, "whatsapp");

  if (!canje) {
    await mandarTexto(
      cred,
      telefono,
      "❌ Ese código no vale (o ya pasaron los 15 minutos).\n\n" +
        "Pedí uno nuevo en el panel: *Asistente IA › Automatizaciones › Vincular WhatsApp*.",
    );
    return true;
  }

  /**
   * El código sólo sirve en el número del MISMO negocio que lo emitió. Sin esta
   * comparación, un código de otro negocio habilitaría a anotar desde acá —y el
   * `puedeAnotar` de después compara contra el tenant del número, así que
   * quedaría un vínculo que no sirve para nada y confunde.
   */
  if (canje.tenantId !== tenantIdDelNumero) {
    await mandarTexto(
      cred,
      telefono,
      "❌ Ese código es de otro negocio. Escribile al WhatsApp del negocio que te lo dio.",
    );
    logger.warn("[whatsapp/dueño] código canjeado en el número de otro negocio", {
      tenantIdDelNumero,
      tenantIdDelCodigo: canje.tenantId,
    });
    return true;
  }

  await WhatsAppDuenosDB.vincular(canje.tenantId, { telefono, nombre, ultimoUso: null });
  const negocio = await TenantsDB.getBasicById(canje.tenantId);
  await mandarTexto(
    cred,
    telefono,
    `✅ Listo, este teléfono quedó conectado a *${negocio?.name ?? canje.tenantId}*.\n\n${AYUDA_DUENO}`,
  );
  return true;
}
