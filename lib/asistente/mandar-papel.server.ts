import "server-only";

/**
 * lib/asistente/mandar-papel.server.ts — el asistente manda un papel por WhatsApp
 *
 * «Manda la resolución de plantación a Alex» desde el chat del panel (o el
 * WhatsApp/Telegram del dueño). Dos tiempos, como toda acción del asistente
 * que se confirma (`requiresApproval`):
 *
 * 1. **Ensayo** (`prepararEnvio`): busca el papel con el rol de quien pide (el
 *    mismo filtro de carpetas del Archivo) y a la persona entre los contactos
 *    que ese rol ve. Con varios candidatos PREGUNTA (no elige). Con uno, arma
 *    la pregunta «¿Mando "X.pdf" a Alex (+51 9•• ••• 123)?» y deja resuelto lo
 *    que se va a ejecutar (`payloadConfirmado`): se manda ESO, no lo que
 *    escribió el modelo. No crea enlaces ni manda nada.
 * 2. **Envío** (`mandarPapel`), sólo tras el «Sí»: vuelve a mirar permiso y
 *    contacto, crea el enlace del Drive que vence en 7 días (el MISMO share de
 *    «Compartir»), lo deja en la auditoría del papel ANTES de mandarlo y manda
 *    el WhatsApp con el número del negocio. Si el WhatsApp no sale, el enlace
 *    se revoca: no queda un enlace público vivo que nadie recibió.
 *
 * Ley 29733: el log del servidor lleva el número tapado y ningún nombre; el
 * número entero queda sólo en la auditoría del papel y en `NotificationLog`.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import type { AgentContext, AgentResult } from "@/lib/agents/types";
import { DocumentsDB } from "@/lib/db/documents.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { createDistributedRateLimiter } from "@/lib/rate-limit";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import { plegar } from "@/lib/documentos/busqueda-natural";
import { ordenarPorRelevancia } from "@/lib/documentos/relevancia";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { explicarFalloWhatsApp } from "@/lib/whatsapp/aviso-plantilla";
import { baseDelPanel, hoyEnLima } from "@/lib/whatsapp/preguntar-archivo";
import { contactosDelNegocio } from "@/lib/forestal/contactos-envio.server";
import {
  DIAS_ENLACE,
  ETIQUETA_FUENTE,
  diaConNombre,
  normalizarTelefono,
  telefonoLegible,
  venceEl,
  type FuenteContacto,
} from "@/lib/forestal/contactos-envio";
import { nivelDeRol } from "@/lib/rrhh/roles";
import type { AdminRole } from "@/lib/session";
import type { DbDocument } from "@/lib/types/documents";
import { enmascararTelefono, mensajeDelPapel, puntajeDeNombre } from "./mandar-papel";

/** Cuántos papeles manda el asistente por negocio y por hora (cada uno es un enlace público). */
export const TOPE_PAPELES_HORA = 20;
/** Cuántos candidatos se listan cuando hay que preguntar. */
const MAX_CANDIDATOS = 5;
/** El tipo en `NotificationLog`: se cuenta y se filtra aparte de los avisos. */
export const TIPO_LOG_PAPEL = "asistente_papel_whatsapp";

const limitador = createDistributedRateLimiter({
  key: "asistente-mandar-papel",
  maxRequests: TOPE_PAPELES_HORA,
  windowMs: 60 * 60 * 1000,
});

type Fuente = FuenteContacto | "colaborador";

interface Contacto {
  nombre: string;
  /** Otro nombre por el que se lo conoce (el apodo de un colaborador). */
  alias?: string | null;
  telefono: string;
  fuente: Fuente;
}

const ETIQUETA: Record<Fuente, string> = { ...ETIQUETA_FUENTE, colaborador: "Colaborador" };

const pedidoSchema = z.object({
  papel: z.string().trim().max(200).nullish(),
  persona: z.string().trim().max(120).nullish(),
  telefono: z.string().trim().max(24).nullish(),
  documentoId: z.string().trim().min(1).max(64).nullish(),
  /** Sólo lo pone el ensayo: el número no está en los contactos y se mostró entero en la pregunta. */
  numeroNuevo: z.boolean().nullish(),
  /** Sólo lo pone el ensayo: el nombre del contacto elegido. */
  nombre: z.string().trim().max(120).nullish(),
});

const SIN_ROL = "No sé con qué permisos estás pidiendo esto: ábrelo desde el chat del panel.";

/**
 * Los contactos que este rol ve: los mismos de «Documentos del permiso»
 * (`contactosDelNegocio`) + los colaboradores con celular, sólo si el rol ve
 * sus datos en RR.HH. (admin, dueño, encargado). Uno por número y nombre.
 */
export async function contactosParaMandar(tenantId: string, role: string): Promise<Contacto[]> {
  const nivel = nivelDeRol(role as AdminRole);
  const veColaboradores = nivel === "completo" || nivel === "gestion";
  const [negocio, colaboradores] = await Promise.all([
    contactosDelNegocio(tenantId, role),
    veColaboradores
      ? ColaboradoresDB.listar(tenantId).catch((err) => {
          logger.warn("[asistente/mandar-papel] no se pudieron leer los colaboradores", { tenantId, error: String(err) });
          return [];
        })
      : Promise.resolve([]),
  ]);
  // Uno por número Y nombre: la colaboradora «Rosa» puede tener el mismo
  // celular que el proveedor donde trabaja; si se deduplicara sólo por número,
  // «manda … a Rosa» no la encontraba (24-10). El desempate de
  // `resolverPersona` junta los que comparten número.
  const clave = (telefono: string, nombre: string) => `${telefono}|${nombre.trim().toLowerCase()}`;
  const vistos = new Set(negocio.map((c) => clave(c.telefono, c.nombre)));
  const out: Contacto[] = negocio.map((c) => ({ ...c }));
  for (const c of colaboradores) {
    const t = normalizarTelefono(c.celular);
    if (!t || vistos.has(clave(t, c.nombre))) continue;
    vistos.add(clave(t, c.nombre));
    out.push({ nombre: c.nombre, alias: c.apodo, telefono: t, fuente: "colaborador" });
  }
  return out;
}

const describir = (c: Contacto) => `${c.nombre} (${enmascararTelefono(c.telefono)}, ${ETIQUETA[c.fuente]})`;

/** «Resolución de plantación.pdf» → «Resolución de plantación», para el ejemplo que se le sugiere. */
const sinExtensionLegible = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();

/**
 * La frase de ejemplo que se le sugiere cuando hay que aclarar algo. Es una
 * orden COMPLETA a propósito: el panel mira sólo el mensaje nuevo, y «Alex
 * Ríos» a secas no vuelve a entrar por el atajo; «manda la resolución a Alex
 * Ríos», sí.
 */
const ejemplo = (papel: string, destino: string) => `«manda ${papel} a ${destino}»`;

type Resolucion<T> = { ok: true; valor: T } | { ok: false; error: string };

/**
 * El papel: el que se llama EXACTO así gana; si no, el único que tiene todas
 * las palabras en el nombre; si no hay uno solo, se pregunta. Con el rol: un
 * papel que su Archivo no le muestra, tampoco existe acá.
 */
async function resolverPapel(tenantId: string, papel: string, destino: string, role: string): Promise<Resolucion<DbDocument>> {
  const sinFotos = { sinTags: [...TAGS_FOTOS_DE_MAQUINA] };
  const docs = await DocumentsDB.list(tenantId, { q: papel, ...sinFotos }, role);
  const buscado = plegar(papel).replace(/\s+/g, " ").trim();
  const sinExtension = (n: string) => plegar(n).replace(/\.[a-z0-9]{1,5}$/, "").replace(/\s+/g, " ").trim();

  if (docs.length === 0) {
    const palabras = buscado.split(" ").filter((w) => w.length > 2);
    const parecidos = palabras.length > 1 ? await DocumentsDB.list(tenantId, { qAny: palabras, ...sinFotos }, role) : [];
    const lista = ordenarPorRelevancia(parecidos, [papel, ...palabras])
      .slice(0, MAX_CANDIDATOS)
      .map((d) => `«${d.name}»`)
      .join(", ");
    return {
      ok: false,
      error: lista
        ? `No encontré un papel que se llame «${papel}». ¿Es alguno de estos? ${lista}. Dime cuál, por ejemplo ${ejemplo(sinExtensionLegible(parecidos[0]?.name ?? papel), destino)}.`
        : `No encontré «${papel}» en tu Archivo (busqué en el nombre, las etiquetas y el texto del papel). Dime cómo se llama.`,
    };
  }

  const exactos = docs.filter((d) => sinExtension(d.name) === buscado);
  if (exactos.length === 1) return { ok: true, valor: exactos[0] };

  const palabras = buscado.split(" ").filter(Boolean);
  const porNombre = docs.filter((d) => {
    const n = plegar(d.name);
    return palabras.every((w) => n.includes(w));
  });
  if (porNombre.length === 1) return { ok: true, valor: porNombre[0] };
  if (porNombre.length === 0 && docs.length === 1) return { ok: true, valor: docs[0] };

  const candidatos = ordenarPorRelevancia(porNombre.length > 0 ? porNombre : docs, [papel, ...palabras]).slice(0, MAX_CANDIDATOS);
  const lista = candidatos.map((d, i) => `${i + 1}) ${d.name}`).join(" · ");
  const total = porNombre.length > 0 ? porNombre.length : docs.length;
  return {
    ok: false,
    error: `Encontré ${total} papeles con «${papel}»: ${lista}${total > candidatos.length ? " · …" : ""}. ¿Cuál mando? Dímelo con su nombre, por ejemplo ${ejemplo(sinExtensionLegible(candidatos[0].name), destino)}.`,
  };
}

/** La persona: por número (si lo escribió) o por nombre entre los contactos que ve. */
function resolverPersona(
  contactos: readonly Contacto[],
  persona: string,
  telefono: string | null,
  papel: string,
): Resolucion<{ contacto: Contacto; numeroNuevo: boolean }> {
  if (telefono) {
    const conocido = contactos.find((c) => c.telefono === telefono);
    if (conocido) return { ok: true, valor: { contacto: conocido, numeroNuevo: false } };
    return {
      ok: true,
      valor: { contacto: { nombre: persona || telefonoLegible(telefono), telefono, fuente: "envio" }, numeroNuevo: true },
    };
  }
  if (!persona) return { ok: false, error: "¿A quién se lo mando? Dime su nombre o su número." };

  const puntuados = contactos
    .map((c) => ({ c, p: Math.max(puntajeDeNombre(persona, c.nombre), c.alias ? puntajeDeNombre(persona, c.alias) : 0) }))
    .filter((x) => x.p > 0);
  if (puntuados.length === 0) {
    return {
      ok: false,
      error:
        `No encontré a «${persona}» entre tus contactos (números ya usados, Adelantos, directorio forestal, proveedores y colaboradores). ` +
        `Si me das su número, se lo mando igual: ${ejemplo(papel, `${persona} 987 654 321`)}.`,
    };
  }
  const mejor = Math.max(...puntuados.map((x) => x.p));
  // Dos nombres con el mismo número son la misma persona: no se pregunta «¿a cuál?».
  const porNumero = new Map<string, Contacto>();
  for (const x of puntuados) if (x.p === mejor && !porNumero.has(x.c.telefono)) porNumero.set(x.c.telefono, x.c);
  const empatados = [...porNumero.values()];
  if (empatados.length === 1) return { ok: true, valor: { contacto: empatados[0], numeroNuevo: false } };

  const lista = empatados.slice(0, MAX_CANDIDATOS).map((c, i) => `${i + 1}) ${describir(c)}`).join(" · ");
  return {
    ok: false,
    error: `Tengo ${empatados.length} contactos que pueden ser «${persona}»: ${lista}${empatados.length > MAX_CANDIDATOS ? " · …" : ""}. ¿A cuál? Dímelo con el nombre completo, por ejemplo ${ejemplo(papel, empatados[0].nombre)}.`,
  };
}

/**
 * El ensayo: entiende el pedido y arma la pregunta. No crea enlaces ni manda
 * nada. Devuelve `resumen` (la pregunta), `payloadConfirmado` (lo que se va a
 * ejecutar tras el «Sí») y `mostrar` (lo que se lee en la tarjeta).
 */
export async function prepararEnvio(tenantId: string, payload: Record<string, unknown>, ctx: AgentContext): Promise<AgentResult> {
  const role = ctx.actorRole;
  if (!role) return { success: false, error: SIN_ROL };
  const parsed = pedidoSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "No entendí qué papel mandar ni a quién. Dímelo así: «manda la resolución a Alex»." };
  const p = parsed.data;

  let doc: DbDocument | null = null;
  if (p.documentoId) {
    doc = await DocumentsDB.getById(tenantId, p.documentoId, role);
    if (!doc) return { success: false, error: "Ese papel no existe o no lo puedes ver en tu Archivo." };
  } else {
    if (!p.papel) return { success: false, error: "¿Qué papel mando? Dime su nombre, por ejemplo «la resolución de plantación»." };
    const destino = p.persona?.trim() || (p.telefono ? telefonoLegible(normalizarTelefono(p.telefono) ?? p.telefono) : "…");
    const r = await resolverPapel(tenantId, p.papel, destino, role);
    if (!r.ok) return { success: false, error: r.error };
    doc = r.valor;
  }

  const telefonoEscrito = p.telefono ? normalizarTelefono(p.telefono) : null;
  if (p.telefono && !telefonoEscrito) {
    return { success: false, error: "Ese número no es un celular: escribe 9 dígitos (o el número con su código de país)." };
  }
  const contactos = await contactosParaMandar(tenantId, role);
  const papelDicho = p.papel?.trim() || sinExtensionLegible(doc.name);
  const persona = resolverPersona(contactos, p.persona ?? "", telefonoEscrito, papelDicho);
  if (!persona.ok) return { success: false, error: persona.error };
  const { contacto, numeroNuevo } = persona.valor;

  const vence = venceEl(hoyEnLima(), DIAS_ENLACE);
  const tapado = enmascararTelefono(contacto.telefono);
  const pregunta = `¿Mando "${doc.name}" a ${contacto.nombre} (${tapado})?`;
  const resumen = numeroNuevo
    ? `${pregunta} Ojo: el ${telefonoLegible(contacto.telefono)} no está en tus contactos; revisa que sea el número correcto.`
    : pregunta;

  logger.info("[asistente/mandar-papel] ensayo listo", {
    tenantId,
    fuente: contacto.fuente,
    numeroNuevo,
    telefono: redactPhone(contacto.telefono),
  });

  return {
    success: true,
    data: {
      resumen,
      payloadConfirmado: {
        documentoId: doc.id,
        telefono: contacto.telefono,
        nombre: contacto.nombre,
        ...(numeroNuevo ? { numeroNuevo: true } : {}),
      },
      mostrar: {
        Papel: doc.name,
        Para: `${contacto.nombre} (${numeroNuevo ? telefonoLegible(contacto.telefono) : tapado})`,
        Enlace: `vence el ${diaConNombre(vence)}`,
        ...(numeroNuevo ? { Aviso: "número fuera de tus contactos" } : {}),
      },
    },
  };
}

async function nombreDelNegocio(tenantId: string): Promise<string | null> {
  try {
    return (await MembreteDB.del(tenantId)).nombre?.trim() || null;
  } catch (err) {
    logger.warn("[asistente/mandar-papel] no se pudo leer el nombre del negocio", { tenantId, error: String(err) });
    return null;
  }
}

async function revocar(tenantId: string, shareId: string, role: string): Promise<void> {
  await DocumentsDB.revokeShare(tenantId, shareId, role).catch((err: unknown) =>
    logger.error("[asistente/mandar-papel] no se pudo revocar el enlace del envío fallido", { tenantId, shareId, error: String(err) }),
  );
}

function registrar(tenantId: string, telefono: string, status: "sent" | "failed", message: string): void {
  NotificationLogsDB.add({ type: TIPO_LOG_PAPEL, recipient: telefono, status, message: message.slice(0, 500) }, tenantId).catch((err) =>
    logger.error("[asistente/mandar-papel] NotificationLog falló", { tenantId, error: String(err) }),
  );
}

/**
 * El envío, después del «Sí». Vuelve a mirar todo (el papel lo sigue viendo,
 * el número sigue en sus contactos o se confirmó como nuevo), crea el enlace,
 * lo audita y manda el WhatsApp. Si algo falla, no queda enlace vivo.
 */
export async function mandarPapel(tenantId: string, payload: Record<string, unknown>, ctx: AgentContext): Promise<AgentResult> {
  const role = ctx.actorRole;
  if (!role) return { success: false, error: SIN_ROL };
  const parsed = pedidoSchema.safeParse(payload);
  const telefono = parsed.success ? normalizarTelefono(parsed.data.telefono) : null;
  if (!parsed.success || !parsed.data.documentoId || !telefono) {
    return { success: false, error: "Falta confirmar qué papel y a quién: pídemelo de nuevo." };
  }
  const { documentoId, numeroNuevo } = parsed.data;
  const actorId = ctx.actorId || "asistente-ia";

  const doc = await DocumentsDB.getById(tenantId, documentoId, role);
  if (!doc) return { success: false, error: "Ese papel ya no existe o no lo puedes ver en tu Archivo." };

  const contactos = await contactosParaMandar(tenantId, role);
  const contacto = contactos.find((c) => c.telefono === telefono);
  if (!contacto && numeroNuevo !== true) {
    return { success: false, error: "Ese número ya no está en tus contactos: pídemelo de nuevo con el número." };
  }
  const nombre = contacto?.nombre ?? parsed.data.nombre ?? telefonoLegible(telefono);

  if (!(await limitador.check(tenantId))) {
    return { success: false, error: `Ya mandé ${TOPE_PAPELES_HORA} papeles de tu negocio en la última hora. Espera un rato y pídemelo de nuevo.` };
  }

  const share = await DocumentsDB.createShare(tenantId, doc.id, { createdById: actorId, expiresInDays: DIAS_ENLACE, viewerRole: role });
  if (!share) return { success: false, error: "No pude crear el enlace de ese papel (su carpeta no está a tu alcance)." };
  const expiresAt = new Date(share.expiresAt).toISOString();
  const vence = venceEl(hoyEnLima(), DIAS_ENLACE);
  const detalle = `Compartido por WhatsApp a ${nombre} (${enmascararTelefono(telefono)})`;

  /* La auditoría del papel ANTES de mandar: un enlace público sin rastro de a
     qué número salió no sale (Ley 29733, igual que «Documentos del permiso»). */
  try {
    await DocumentsDB.logMany(
      tenantId,
      [doc.id],
      {
        actorId,
        action: "share",
        metadata: {
          canal: "asistente-whatsapp",
          telefono,
          nombre,
          detalle,
          token: share.token.slice(0, 8) + "…",
          expiresAt,
          ...(numeroNuevo ? { numeroNuevo: true } : {}),
        },
      },
      { estricto: true },
    );
  } catch (err) {
    logger.error("[asistente/mandar-papel] la auditoría falló: se revoca el enlace", { tenantId, error: String(err) });
    await revocar(tenantId, share.id, role);
    return { success: false, error: "No pude registrar el envío en el historial del papel, así que no mandé nada. Inténtalo de nuevo." };
  }

  const texto = mensajeDelPapel({
    nombrePersona: nombre,
    negocio: await nombreDelNegocio(tenantId),
    nombrePapel: doc.name,
    url: `${baseDelPanel()}/d/${share.token}`,
    vence,
  });
  const envio = await enviarWhatsAppDelNegocio(tenantId, telefono, texto, {
    contexto: "asistente-mandar-papel",
    reintentos: 1,
    pausaMs: 1000,
  });

  if (!envio.ok) {
    await revocar(tenantId, share.id, role);
    registrar(tenantId, telefono, "failed", `Papel «${doc.name}» a ${nombre}: ${envio.error ?? "rechazado sin motivo"}`);
    logger.warn("[asistente/mandar-papel] el WhatsApp no salió", { tenantId, telefono: redactPhone(telefono), via: envio.via });
    const motivo = explicarFalloWhatsApp(envio.error) ?? envio.error ?? "WhatsApp no lo aceptó";
    return { success: false, error: `No salió el WhatsApp a ${nombre}: ${motivo}. Anulé el enlace.` };
  }

  DocumentsDB.log(tenantId, {
    documentId: doc.id,
    actorId,
    action: "whatsapp_send",
    metadata: { canal: "asistente", telefono, nombre, detalle, via: envio.via, modo: envio.modo, wamid: envio.wamid },
  }).catch((err) => logger.error("[asistente/mandar-papel] la bitácora del envío falló", { tenantId, error: String(err) }));
  registrar(tenantId, telefono, "sent", `Papel «${doc.name}» a ${nombre} · enlace hasta ${vence}${envio.puedeNoLlegar ? " · texto libre (puede no llegar)" : ""}`);
  logger.info("[asistente/mandar-papel] papel mandado", { tenantId, telefono: redactPhone(telefono), via: envio.via, modo: envio.modo });

  return {
    success: true,
    data: {
      // `confirmacion`: la frase que muestran la tarjeta del panel y el «✅» de WhatsApp/Telegram.
      confirmacion:
        `Listo: le mandé "${doc.name}" a ${nombre} por WhatsApp. El enlace vence el ${diaConNombre(vence)}.` +
        (envio.puedeNoLlegar ? " Salió como texto: si no te escribió en las últimas 24 h, puede no llegarle." : ""),
      documentoId: doc.id,
      vence,
    },
  };
}
