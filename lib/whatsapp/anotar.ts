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
import { conversar, errorParaLaPersona } from "@/lib/asistente/conversar";
import { olvidar, anotarHecho } from "@/lib/asistente/memoria";
import { nombreDelNegocio } from "@/lib/asistente/negocio";
import { TOOL_MANDAR_PAPEL } from "@/lib/asistente/mandar-papel";
import { DIAS_ENLACE } from "@/lib/forestal/contactos-envio";
import { WhatsAppDuenosDB } from "@/lib/db/whatsapp-duenos.db";
import type { Role } from "@/lib/auth/role-permissions";
import { TenantsDB } from "@/lib/db/tenants.db";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { getPendingApproval, removePendingApproval } from "@/lib/agents/pending-approvals";
import { bajarMedia, mandarTexto, mandarBotones, type CredencialesMeta } from "./bot-dueno";
import {
  MENSAJE_NO_GUARDADO,
  analizarYOrdenar,
  archivarPapel,
  autorDeWhatsApp,
  mensajeGuardado,
  mensajeMovido,
  ordenDeGuardar,
} from "./archivar-papel";
import { leerPreguntaDePapeles } from "./preguntar-archivo";

/**
 * El rol con el que corre lo que entra por WhatsApp: el ACTUAL de quien vinculó
 * el teléfono (`WhatsAppDuenosDB.rolActual`), resuelto una vez por mensaje y
 * usado en TODAS las ramas — buscar papeles, `conversar` (que también tiene
 * herramientas del Archivo) y el Confirmar. Antes era «admin» fijo: un
 * encargado vinculado veía por el asistente los papeles con candado de dueños.
 */
const VOLVER_A_VINCULAR =
  "🔒 Este teléfono necesita volver a vincularse. Pídele un código nuevo a quien " +
  "administra el negocio (en el panel: Ajustes › WhatsApp).";

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
  "Cuéntame qué pasó y lo anoto donde va. Escríbeme o mándame una *nota de voz*.\n\n" +
  "*Para anotar*\n" +
  "• «25 galones de petróleo para el camión N12 a 27 el galón»\n" +
  "• «le adelanté 300 soles en efectivo a Juan Pérez»\n" +
  "• «Doña Rosa me pagó 50 de lo que debía»\n" +
  "• «recordame el lunes a las 8 llamar al ingeniero»\n\n" +
  "*Para preguntar*\n" +
  "• «¿cuánto gasté este mes?» · «¿quién me debe?» · «¿cómo viene la caja?»\n\n" +
  "*Para guardar papeles*\n" +
  "• Reenvíame la foto o el PDF (un DNI, un contrato, una boleta) y queda en tu *Archivo*. " +
  "Si le pones un texto, ese es su nombre: «DNI de Juan».\n\n" +
  "*Para buscar papeles*\n" +
  "• «¿qué está vencido?» · «¿qué vence este año?»\n" +
  "• «¿dónde está el DNI del jefe?» · «mándame el contrato del local»\n\n" +
  "Puedes decirme *varias cosas en un mismo audio* y las anoto todas. Antes de " +
  "guardar te muestro qué se va a anotar y por cuánto: recién cuando tocas " +
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
  /** Foto o documento adjunto: va al Archivo (`archivar-papel.ts`). */
  archivo?: { id: string; mime?: string; filename?: string; tipo: "imagen" | "documento" };
  /** `message.id` de Meta: con él una re-entrega no guarda dos veces el mismo papel. */
  waMessageId?: string;
  /** `id` del botón que tocó (viene de `interactive.button_reply.id`). */
  botonId?: string;
  cred: CredencialesMeta;
}

/** Prefijos de los botones. El id lleva la acción y la aprobación: `ok:<id>`. */
const BOTON_OK = "anotar-ok";
const BOTON_NO = "anotar-no";

// ── Entrada principal ────────────────────────────────────────────────────────

export async function manejarMensajeDeDueno(entrada: MensajeDueno): Promise<void> {
  // Quien vinculó el teléfono, HOY: si la desactivaron, el teléfono no hace nada.
  const quien = await WhatsAppDuenosDB.rolActual(entrada.tenantId, entrada.telefono);
  if ("revocado" in quien) {
    logger.info("[whatsapp/dueño] vínculo sin autor activo", { tenantId: entrada.tenantId });
    await mandarTexto(entrada.cred, entrada.telefono, VOLVER_A_VINCULAR);
    return;
  }
  const rol = quien.rol;

  if (entrada.botonId) {
    await manejarBoton(entrada, rol);
    return;
  }

  /**
   * Una foto o un documento se guarda SIEMPRE en el Archivo, con o sin texto.
   * Si además trae un dictado («180 soles de combustible»), el dictado sigue su
   * camino de siempre; si el texto era la orden de guardar, no queda nada más.
   */
  let msg = entrada;
  if (entrada.archivo) {
    const resto = await guardarEnElArchivo(entrada, entrada.archivo);
    if (!resto) return;
    msg = { ...entrada, texto: resto, archivo: undefined };
  }
  const { tenantId, telefono, cred } = msg;

  if (!pasaElFreno(telefono)) {
    await mandarTexto(cred, telefono, "⏳ Vas muy rápido. Espera un minuto y seguimos.");
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
    await mandarTexto(cred, telefono, "🧹 Listo, empezamos de nuevo. Cuéntame qué pasó.");
    return;
  }

  if (comando === "desvincular") {
    await WhatsAppDuenosDB.desvincular(tenantId, telefono);
    await mandarTexto(
      cred,
      telefono,
      "🔌 Desvinculado. Ya no puedo anotar nada desde este teléfono.\n\n" +
        "Si vuelves a escribir, te atiende el bot de la tienda como a cualquier cliente.",
    );
    return;
  }

  // ── Audio → texto ────────────────────────────────────────────────────────
  let dictado = msg.texto;
  if (msg.audio) {
    const archivo = await bajarMedia(msg.audio.id, cred.token);
    if (!archivo) {
      await mandarTexto(cred, telefono, "No pude bajar el audio de WhatsApp. Prueba mandarlo de nuevo.");
      return;
    }
    if (archivo.bytes.byteLength > MAX_BYTES_AUDIO) {
      await mandarTexto(
        cred,
        telefono,
        "🎤 Ese audio es muy largo. Mándame uno más corto, de una operación por vez.",
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

  if (!dictado) {
    await mandarTexto(cred, telefono, AYUDA_DUENO);
    return;
  }

  // ── Preguntas por papeles: el Archivo contesta sin pasar por el modelo ────
  // Antes que `conversar` y después del audio (una nota de voz también
  // pregunta). Plata y agenda nunca caen acá: `leerPreguntaDePapeles` las deja
  // pasar (ver su cabecera). El pie de una foto («DNI de Juan») es su NOMBRE,
  // no una pregunta: con adjunto no se busca nada.
  const pregunta = entrada.archivo ? null : leerPreguntaDePapeles(dictado);
  if (pregunta) {
    const { responderPreguntaDePapeles } = await import("./responder-archivo");
    await responderPreguntaDePapeles({ tenantId, telefono, rol, pregunta, cred });
    WhatsAppDuenosDB.marcarUso(tenantId, telefono).catch((err) =>
      logger.warn("[whatsapp/dueño] no se pudo marcar el uso", { error: String(err) }),
    );
    return;
  }

  // ── Entender y proponer ──────────────────────────────────────────────────
  const r = await conversar({
    tenantId,
    // La sesión es el TELÉFONO: es lo que hace que «el N12» después de «¿cuál
    // de los dos?» signifique algo.
    sesionId: sesionDe(telefono),
    texto: dictado,
    actorRole: rol,
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
    /**
     * Mandar un papel no anota nada: sale a OTRA persona. La pregunta ya trae
     * el papel, el nombre y el número tapado («¿Mando "X" a Alex (+51 9•• •••
     * 123)?»); los botones dicen «mándalo», no «confirmar».
     */
    if (p.tool === TOOL_MANDAR_PAPEL) {
      const desde = negocio ? `Sale desde *${negocio}*` : "Sale";
      await mandarBotones(cred, telefono, `📎 *${p.resumen}*\n\n${desde}, con un enlace que vence en ${DIAS_ENLACE} días.`, [
        { id: `${BOTON_OK}:${p.id}`, titulo: "✅ Sí, mándalo" },
        { id: `${BOTON_NO}:${p.id}`, titulo: "✖ No" },
      ]);
      continue;
    }
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
    await mandarTexto(cred, telefono, "🤔 No terminé de entender. Dímelo de otra forma, o escríbeme *ayuda*.");
  }
}

// ── Papeles al Archivo ───────────────────────────────────────────────────────

/**
 * Freno aparte para archivos: guardar no gasta IA al instante (el análisis va
 * en cola), y reenviar los diez papeles de un trámite de golpe es lo normal.
 * Con el tope de los dictados (12) se perdían los últimos. Se avisa UNA vez
 * por ventana: cuarenta «espera un minuto» seguidos son peor que el freno.
 */
const TOPE_ARCHIVOS_POR_MINUTO = 30;
const pulsosArchivos = new Map<string, number[]>();

function frenoDeArchivos(telefono: string): "pasa" | "avisar" | "callar" {
  const ahora = Date.now();
  const recientes = (pulsosArchivos.get(telefono) ?? []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  pulsosArchivos.set(telefono, recientes);
  if (pulsosArchivos.size > 500) {
    for (const [id, ts] of pulsosArchivos) if (ts.every((t) => ahora - t > 60_000)) pulsosArchivos.delete(id);
  }
  if (recientes.length <= TOPE_ARCHIVOS_POR_MINUTO) return "pasa";
  return recientes.length === TOPE_ARCHIVOS_POR_MINUTO + 1 ? "avisar" : "callar";
}

/**
 * Guarda la foto o el documento y contesta dónde quedó.
 *
 * Devuelve el texto que le queda al asistente («» = nada: no había texto, era
 * la orden de guardar, o era una re-entrega de Meta que ya se atendió).
 */
async function guardarEnElArchivo(msg: MensajeDueno, archivo: NonNullable<MensajeDueno["archivo"]>): Promise<string> {
  const { tenantId, telefono, cred } = msg;
  const orden = ordenDeGuardar(msg.texto);
  const resto = orden ? "" : msg.texto.trim();

  const freno = frenoDeArchivos(telefono);
  if (freno !== "pasa") {
    if (freno === "avisar") {
      await mandarTexto(cred, telefono, "⏳ Me mandaste muchos archivos seguidos. Espera un minuto y reenvía los que falten.");
    }
    return "";
  }

  const r = await archivarPapel(tenantId, cred, {
    waMessageId: msg.waMessageId ?? archivo.id,
    mediaId: archivo.id,
    tipo: archivo.tipo,
    mimeDeclarado: archivo.mime,
    filename: archivo.filename,
    pie: orden ? orden.nombre : resto,
    contacto: msg.nombre,
    telefono,
  });

  if (!r.ok) {
    // Re-entrega: la primera vez ya contestó y ya pasó el dictado al asistente.
    if (r.motivo === "duplicado") return "";
    const aviso = MENSAJE_NO_GUARDADO[r.motivo];
    if (aviso) await mandarTexto(cred, telefono, aviso);
    return resto;
  }

  await mandarTexto(cred, telefono, mensajeGuardado(r));
  WhatsAppDuenosDB.marcarUso(tenantId, telefono).catch((err) =>
    logger.warn("[whatsapp/dueño] no se pudo marcar el uso", { error: String(err) }),
  );
  analizarYOrdenar(tenantId, r, autorDeWhatsApp(telefono), (destino) =>
    mandarTexto(cred, telefono, mensajeMovido(destino)),
  );
  return resto;
}

// ── Botones ──────────────────────────────────────────────────────────────────

async function manejarBoton(msg: MensajeDueno, rol: Role): Promise<void> {
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

  const esPapel = pendiente.toolName === TOOL_MANDAR_PAPEL;

  if (accion === BOTON_NO) {
    removePendingApproval(aprobacionId);
    await mandarTexto(cred, telefono, esPapel ? "✖ Listo, no mandé nada." : "✖ Listo, no anoté nada.");
    return;
  }

  if (accion !== BOTON_OK) return;

  await ensureAgentsRegistered();
  const res = await orchestrator.executeSync({
    domain: pendiente.domain as Parameters<typeof orchestrator.executeSync>[0]["domain"],
    action: pendiente.action,
    payload: pendiente.payload,
    tenantId,
    actorRole: rol,
    actorId: pendiente.requestedBy,
  });
  removePendingApproval(aprobacionId);

  if (!res.success) {
    await mandarTexto(cred, telefono, `⚠️ ${esPapel ? "No salió" : "No se pudo anotar"}: ${errorParaLaPersona(res.error)}`);
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
        "Pide uno nuevo en el panel: *Asistente IA › Automatizaciones › Vincular WhatsApp*.",
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
      "❌ Ese código es de otro negocio. Escríbele al WhatsApp del negocio que te lo dio.",
    );
    logger.warn("[whatsapp/dueño] código canjeado en el número de otro negocio", {
      tenantIdDelNumero,
      tenantIdDelCodigo: canje.tenantId,
    });
    return true;
  }

  await WhatsAppDuenosDB.vincular(canje.tenantId, {
    telefono,
    nombre,
    ultimoUso: null,
    // Quién lo pidió: su rol se relee en cada mensaje (si lo desactivan, se corta).
    pedidoPor: canje.pedidoPor,
    ...(canje.rol ? { rol: canje.rol } : {}),
  });
  const negocio = await TenantsDB.getBasicById(canje.tenantId);
  await mandarTexto(
    cred,
    telefono,
    `✅ Listo, este teléfono quedó conectado a *${negocio?.name ?? canje.tenantId}*.\n\n${AYUDA_DUENO}`,
  );
  return true;
}
