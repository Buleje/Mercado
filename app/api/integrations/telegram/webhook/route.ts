import "server-only";

/**
 * app/api/integrations/telegram/webhook/route.ts
 *
 * El bot que anota. Le hablás por Telegram —escribiendo o con un audio— y la
 * operación queda en los libros del negocio.
 *
 *   Vos: 🎤 «anotame 25 galones de petróleo para el camión N12 a 27 el galón»
 *   Bot: Gasto de S/ 675.00 · combustible · Camión N12 (placa A4B-892)
 *        25 × S/ 27.00 = S/ 675.00
 *        Se anota en Mi Plata › Reportes › Activos
 *        [ ✅ Confirmar ]  [ ✖ Cancelar ]
 *   Vos: (tocás Confirmar)
 *   Bot: ✅ Anotado: S/ 675.00 de combustible para Camión N12.
 *
 * ── Seguridad ────────────────────────────────────────────────────────────────
 * Tres candados, porque esto escribe plata desde afuera del panel:
 *   1. `X-Telegram-Bot-Api-Secret-Token` — sin él, cualquiera que descubra la
 *      URL podría inyectar mensajes. Se compara en tiempo constante.
 *   2. El chat tiene que estar VINCULADO a un negocio; si no, el bot explica
 *      cómo vincularlo y no hace nada más.
 *   3. La escritura sigue pasando por el ensayo y por la confirmación: el botón
 *      Confirmar es el mismo gate que la tarjeta del chat del panel.
 *
 * Exento de CSRF (`/api/integrations/`): es máquina a máquina, no hay sesión de
 * navegador que un tercero pueda abusar.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { TelegramDB } from "@/lib/db/telegram.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { transcribirAudio } from "@/lib/ai/transcribir";
import { conversar } from "@/lib/asistente/conversar";
import { olvidar, anotarHecho } from "@/lib/asistente/memoria";
import { nombreDelNegocio } from "@/lib/asistente/negocio";
import { canjearCodigo } from "@/lib/telegram/vinculacion";
import {
  secretoValido, botConfigurado, mandarMensaje, editarMensaje, contestarBoton,
  mostrarEscribiendo, bajarArchivo, esc,
  type TgUpdate, type TgMessage, type TgCallback,
} from "@/lib/telegram/bot";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { getPendingApproval, removePendingApproval } from "@/lib/agents/pending-approvals";

/**
 * El rol con el que corre lo que entra por Telegram.
 *
 * Vincular un chat es una acción de `settings:write` que sólo hace el dueño
 * desde el panel: quien está del otro lado ya tiene, en los hechos, su negocio.
 */
const ROL = "admin" as const;

/**
 * Cuántos mensajes por minuto aguanta un chat.
 *
 * Cada mensaje puede disparar una transcripción y dos llamadas al modelo. Sin
 * freno, un audio reenviado en cadena vacía la cuota del día del negocio.
 */
const TOPE_POR_MINUTO = 12;
const pulsos = new Map<number, number[]>();

function pasaElFreno(chatId: number): boolean {
  const ahora = Date.now();
  const recientes = (pulsos.get(chatId) ?? []).filter((t) => ahora - t < 60_000);
  if (recientes.length >= TOPE_POR_MINUTO) {
    pulsos.set(chatId, recientes);
    return false;
  }
  recientes.push(ahora);
  pulsos.set(chatId, recientes);
  if (pulsos.size > 500) {
    // No dejar crecer el mapa para siempre con chats de una sola vez.
    for (const [id, ts] of pulsos) if (ts.every((t) => ahora - t > 60_000)) pulsos.delete(id);
  }
  return true;
}

const AYUDA =
  "Contame qué pasó y lo anoto donde va. Escribime o mandame un <b>audio</b>.\n\n" +
  "<b>Para anotar</b>\n" +
  "• «25 galones de petróleo para el camión N12 a 27 el galón»\n" +
  "• «le adelanté 300 soles en efectivo a Juan Pérez»\n" +
  "• «Doña Rosa me pagó 50 de lo que debía»\n" +
  "• «compré 20 sacos de arroz a 18.50 a Distribuidora Ucayali»\n" +
  "• «pasá 2000 del BCP a la caja chica»\n" +
  "• «el flete de la placa A4B-892, 800 soles por 30 m³»\n\n" +
  "<b>Para preguntar</b>\n" +
  "• «¿cuánto gasté este mes?» · «¿quién me debe?» · «¿cómo viene la caja?»\n" +
  "• «¿qué hay de nuevo?» — te cuento lo que vi\n\n" +
  "Podés decirme <b>varias cosas en un mismo audio</b> y las anoto todas. " +
  "Antes de guardar te muestro qué se va a anotar y por cuánto: recién cuando " +
  "tocás <b>Confirmar</b> queda en los libros.\n\n" +
  "<b>Comandos:</b> /hoy · /olvidar · /desvincular · /ayuda";

/**
 * Telegram REINTENTA cualquier update que no conteste 200 rápido.
 *
 * Un 500 acá hace que el mismo audio se procese cuatro veces —y se anote
 * cuatro veces si el usuario confirma— así que TODO error se traga, se loguea
 * y se contesta 200. El usuario se entera por el mensaje del bot, no por el
 * código HTTP, que nadie ve.
 */
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!botConfigurado()) {
    logger.warn("[telegram] llegó un update sin TELEGRAM_BOT_TOKEN configurado");
    return ok();
  }
  if (!secretoValido(req.headers.get("x-telegram-bot-api-secret-token"))) {
    logger.warn("[telegram] update rechazado: secreto inválido");
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return ok();
  }

  try {
    if (update.callback_query) await manejarBoton(update.callback_query);
    else if (update.message) await manejarMensaje(update.message);
  } catch (err) {
    logger.error("[telegram] update falló", { error: String(err), updateId: update.update_id });
  }
  return ok();
}

// ── Mensajes ────────────────────────────────────────────────────────────────

async function manejarMensaje(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const quien = msg.from?.first_name ?? msg.from?.username ?? "alguien";

  if (!pasaElFreno(chatId)) {
    await mandarMensaje(chatId, "⏳ Vas muy rápido. Esperá un minuto y seguimos.");
    return;
  }

  const texto = (msg.text ?? msg.caption ?? "").trim();

  // ── Comandos ───────────────────────────────────────────────────────────
  if (texto.startsWith("/")) {
    const [comando, ...resto] = texto.split(/\s+/);
    const base = comando.split("@")[0].toLowerCase();

    if (base === "/start" || base === "/ayuda" || base === "/help") {
      const tenantId = await TelegramDB.tenantDeChat(chatId);
      if (!tenantId) {
        await mandarMensaje(
          chatId,
          "👋 Soy el asistente de tu negocio.\n\n" +
            "Este chat todavía <b>no está vinculado</b>. Entrá al panel, andá a " +
            "<b>Asistente IA › Automatizaciones</b>, tocá <b>Vincular Telegram</b> y " +
            "mandame acá:\n\n<code>/vincular CÓDIGO</code>",
        );
        return;
      }
      const negocio = await TenantsDB.getBasicById(tenantId);
      await mandarMensaje(chatId, `👋 Estás conectado a <b>${esc(negocio?.name ?? tenantId)}</b>.\n\n${AYUDA}`);
      return;
    }

    if (base === "/vincular") {
      const canje = canjearCodigo(resto.join(""));
      if (!canje) {
        await mandarMensaje(
          chatId,
          "❌ Ese código no vale (o ya pasaron los 15 minutos).\n\n" +
            "Pedí uno nuevo en el panel: <b>Asistente IA › Automatizaciones › Vincular Telegram</b>.",
        );
        return;
      }
      await TelegramDB.vincular(canje.tenantId, { chatId, nombre: quien, ultimoUso: null });
      const negocio = await TenantsDB.getBasicById(canje.tenantId);
      await mandarMensaje(
        chatId,
        `✅ Listo, este chat quedó conectado a <b>${esc(negocio?.name ?? canje.tenantId)}</b>.\n\n${AYUDA}`,
      );
      return;
    }

    if (base === "/hoy") {
      const tenantId = await TelegramDB.tenantDeChat(chatId);
      if (!tenantId) {
        await mandarMensaje(chatId, "🔒 Este chat no está vinculado a ningún negocio.");
        return;
      }
      await mostrarEscribiendo(chatId);
      const { calcularAvisos, comoTexto } = await import("@/lib/asistente/avisos");
      const avisos = await calcularAvisos(tenantId);
      await mandarMensaje(chatId, `☀️ <b>Lo que veo hoy</b>\n\n${comoTexto(avisos)}`);
      return;
    }

    if (base === "/olvidar") {
      olvidar(`telegram:${chatId}`);
      await mandarMensaje(chatId, "🧹 Listo, empezamos de nuevo. Contame qué pasó.");
      return;
    }

    if (base === "/desvincular") {
      const tenantId = await TelegramDB.tenantDeChat(chatId);
      if (!tenantId) {
        await mandarMensaje(chatId, "Este chat no estaba vinculado a ningún negocio.");
        return;
      }
      await TelegramDB.desvincular(tenantId, chatId);
      await mandarMensaje(chatId, "🔌 Desvinculado. Ya no puedo anotar nada desde acá.");
      return;
    }

    await mandarMensaje(chatId, `No conozco ese comando.\n\n${AYUDA}`);
    return;
  }

  // ── A partir de acá hace falta estar vinculado ─────────────────────────
  const tenantId = await TelegramDB.tenantDeChat(chatId);
  if (!tenantId) {
    await mandarMensaje(
      chatId,
      "🔒 Este chat no está vinculado a ningún negocio, así que no puedo anotar nada.\n\n" +
        "Pedí el código en <b>Asistente IA › Automatizaciones</b> y mandame " +
        "<code>/vincular CÓDIGO</code>.",
    );
    return;
  }

  // ── Audio → texto ──────────────────────────────────────────────────────
  let dictado = texto;
  const audio = msg.voice ?? msg.audio;
  if (audio) {
    await mostrarEscribiendo(chatId);
    if (audio.duration > 300) {
      await mandarMensaje(chatId, "🎤 Ese audio dura más de 5 minutos. Mandame uno más corto, de una operación por vez.");
      return;
    }
    const archivo = await bajarArchivo(audio.file_id);
    if (!archivo) {
      await mandarMensaje(chatId, "No pude bajar el audio de Telegram. Probá mandarlo de nuevo.");
      return;
    }
    const t = await transcribirAudio(archivo.bytes, archivo.nombre);
    if (!t.ok) {
      await mandarMensaje(chatId, `🎤 ${esc(t.error)}`);
      return;
    }
    dictado = t.transcripcion.texto;
    // Se muestra lo que se entendió ANTES de interpretarlo: si Whisper oyó mal
    // «27» como «venti siete», el usuario lo ve acá y no en el asiento.
    await mandarMensaje(chatId, `🎤 Te entendí: «<i>${esc(dictado)}</i>»`);
  }

  if (!dictado) {
    await mandarMensaje(chatId, AYUDA);
    return;
  }

  // ── Entender y proponer ────────────────────────────────────────────────
  await mostrarEscribiendo(chatId);
  const r = await conversar({
    tenantId,
    // La sesión es el CHAT, no la persona: es lo que hace que «el N12» después
    // de «¿cuál de los dos?» signifique algo.
    sesionId: `telegram:${chatId}`,
    texto: dictado,
    actorRole: ROL,
    solicitante: `telegram:${quien}`,
    canal: "telegram",
  });

  TelegramDB.marcarUso(tenantId, chatId).catch((err) =>
    logger.warn("[telegram] no se pudo marcar el uso", { error: String(err) }),
  );

  // Lo que dijo va primero: suele ser la aclaración de lo que está por anotar.
  if (r.texto) await mandarMensaje(chatId, esc(r.texto));

  /**
   * Una tarjeta por operación. Un audio que dicta tres cosas deja tres
   * confirmaciones, no una: aprobarlas juntas obligaría a aceptar o rechazar el
   * paquete entero cuando una sola está mal.
   */
  /**
   * El negocio va EN la pregunta, no en una nota al pie. El mismo chat puede
   * estar vinculado a un negocio distinto del que se está mirando en el panel,
   * y «¿lo anoto?» sin decir dónde manda a buscar el dato al lugar equivocado.
   */
  const negocio = await nombreDelNegocio(tenantId);
  const dondePregunta = negocio ? `¿Lo anoto en <b>${esc(negocio)}</b>?` : "¿Lo anoto?";

  for (const p of r.pendientes) {
    await mandarMensaje(chatId, `📝 <b>${esc(p.resumen)}</b>\n\n${dondePregunta}`, [
      { texto: "✅ Confirmar", data: `ok:${p.id}` },
      { texto: "✖ Cancelar", data: `no:${p.id}` },
    ]);
  }

  // Las que se registraron sin pasar por tarjeta también dicen dónde quedaron.
  for (const reg of r.registradas) {
    await mandarMensaje(
      chatId,
      `✅ ${esc(reg.resumen)}` + (negocio ? `\n📍 <i>${esc(negocio)}</i>` : ""),
    );
  }

  // Ni texto ni operaciones: hay que decir algo, o el bot se queda mudo.
  if (!r.texto && r.pendientes.length === 0 && r.registradas.length === 0) {
    await mandarMensaje(chatId, "🤔 No terminé de entender. Decímelo de otra forma, o mandame /ayuda.");
  }
}

// ── Botones ─────────────────────────────────────────────────────────────────

async function manejarBoton(cb: TgCallback): Promise<void> {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const data = cb.data ?? "";
  if (!chatId || !messageId) {
    await contestarBoton(cb.id);
    return;
  }

  const [accion, aprobacionId] = data.split(":");
  const tenantId = await TelegramDB.tenantDeChat(chatId);
  const pendiente = aprobacionId ? getPendingApproval(aprobacionId) : null;

  /**
   * El tenant se compara SIEMPRE, aunque el botón venga del mensaje del propio
   * bot: sin esto, un chat vinculado a un negocio podría confirmar la operación
   * pendiente de otro reenviando el `callback_data`.
   */
  if (!tenantId || !pendiente || pendiente.tenantId !== tenantId) {
    await contestarBoton(cb.id, "Esa operación ya no está pendiente");
    await editarMensaje(
      chatId,
      messageId,
      "⌛ Esa operación ya no está pendiente (se confirmó, se canceló, o pasaron los 10 minutos). Mandámela de nuevo.",
    );
    return;
  }

  if (accion === "no") {
    removePendingApproval(aprobacionId);
    await contestarBoton(cb.id, "Cancelado");
    await editarMensaje(chatId, messageId, "✖ Listo, no anoté nada.");
    return;
  }

  if (accion !== "ok") {
    await contestarBoton(cb.id);
    return;
  }

  await contestarBoton(cb.id, "Anotando…");
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
    await editarMensaje(chatId, messageId, `⚠️ No se pudo anotar: ${esc(res.error ?? "error desconocido")}`);
    return;
  }
  const datos = (res.data ?? {}) as Record<string, unknown>;
  const donde = datos.dondeVerlo as { pantalla?: string } | undefined;
  logger.info("[telegram] operación anotada", { tenantId, tool: pendiente.toolName });
  /**
   * Que la conversación sepa que esto YA quedó anotado. Sin esto, un «anotalo»
   * dos minutos después vuelve a proponer la misma operación como si nada.
   */
  anotarHecho(`telegram:${chatId}`, tenantId, String(datos.confirmacion ?? pendiente.toolName));
  // La confirmación dice negocio Y pantalla: son las dos mitades de «dónde lo
  // veo». Con una sola, buscarlo sigue siendo adivinar.
  const negocioConfirmado = await nombreDelNegocio(tenantId);
  const ubicacion = [negocioConfirmado, donde?.pantalla].filter(Boolean).map((x) => esc(String(x)));
  await editarMensaje(
    chatId,
    messageId,
    `✅ ${esc(String(datos.confirmacion ?? "Operación registrada."))}` +
      (ubicacion.length ? `\n\n📍 <i>${ubicacion.join(" › ")}</i>` : ""),
  );
}
