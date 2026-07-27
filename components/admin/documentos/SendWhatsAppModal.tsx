"use client";

/**
 * Enviar documentos por WhatsApp — EL ARCHIVO, no un enlace.
 *
 * Antes esto abría wa.me con un mensaje y un link `/d/{token}`. Un enlace no es
 * un documento: el que lo recibe tiene que tocarlo, esperar el navegador y
 * confiar; no le queda el archivo en el chat, no lo puede reenviar a su
 * contador y a los 30 días vence. Brandon lo pidió claro: que llegue el PDF, el
 * Excel, el Word o la foto.
 *
 * Tres vías, en orden de preferencia:
 *
 *  1. ARCHIVO (WhatsApp del negocio conectado) — el binario sale del servidor
 *     directo a Meta y llega como adjunto real, con su nombre, y queda en el
 *     inbox del panel. Es la única forma de mandar un archivo sin que el dueño
 *     toque el celular.
 *  2. DESDE ESTE EQUIPO — `navigator.share` con los archivos: abre el menú de
 *     compartir del sistema (WhatsApp incluido) con los documentos adjuntos.
 *     Es la salida natural en el celular y no necesita nada configurado.
 *  3. ENLACE — el camino viejo, como último recurso: sirve para lo que no se
 *     puede adjuntar (archivos enormes) y para pedir una firma, que ES un link.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageCircle, X, Search, User, Link2, Copy, Check, Send, Loader2, PenLine, FileWarning,
  Paperclip, Share2, AlertCircle, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { createShare } from "@/hooks/use-documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { pedirArchivo } from "@/lib/documentos/archivo-remoto";

type Contact = { name: string; phone: string };
type Via = "archivo" | "dispositivo" | "enlace";

/** Topes de WhatsApp (los mismos que valida el endpoint). */
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_DOCUMENTO = 95 * 1024 * 1024;
const IMAGEN_NATIVA = /^image\/(jpeg|png|webp)$/;

/**
 * Cuántos enlaces se pueden crear de una tanda. El endpoint de compartir corre
 * con el preset STRICT (10 solicitudes cada 15 minutos): pedir más no falla a
 * medias, deja al usuario sin poder compartir nada por un cuarto de hora.
 */
const LIMITE_LOTE = 10;

/** Espera `ms` (para el reintento tras un 429). */
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea los enlaces de a `concurrencia` en vez de todos juntos: veinte fetch
 * simultáneos contra un endpoint con límite estricto es la forma más rápida de
 * comerse un 429. Si aun así aparece, reintenta una vez tras esperar.
 */
async function crearEnlaces(
  docs: DbDocument[],
  ruta: string,
  concurrencia = 3,
  clave?: string,
): Promise<{ ok: Map<string, string>; mal: Map<string, string> }> {
  const ok = new Map<string, string>();
  const mal = new Map<string, string>();
  const cola = [...docs];

  const trabajador = async () => {
    for (;;) {
      const d = cola.shift();
      if (!d) return;
      for (let intento = 0; intento < 2; intento++) {
        try {
          const share = await createShare(d.id, { expiresInDays: 30, password: clave || undefined });
          ok.set(d.id, `${window.location.origin}/${ruta}/${share.token}`);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const limitado = msg.includes("429");
          if (limitado && intento === 0) { await dormir(1500); continue; }
          mal.set(d.id, limitado ? "límite de enlaces alcanzado" : "no se pudo compartir");
          break;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrencia, docs.length) }, trabajador));
  return { ok, mal };
}

/** Normaliza a dígitos y antepone el código de Perú (51) a celulares de 9 dígitos. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

/** ¿Este equipo sabe compartir archivos (celular, o Chrome con la API)? */
function equipoComparteArchivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File(["x"], "prueba.txt", { type: "text/plain" })] });
  } catch {
    return false;
  }
}

/** Motivo por el que un documento no puede viajar como adjunto (o null). */
function noEntraComoArchivo(doc: DbDocument): string | null {
  const tope = IMAGEN_NATIVA.test(doc.mimeType ?? "") ? MAX_IMAGEN : MAX_DOCUMENTO;
  if (doc.size > tope) {
    return `pesa ${(doc.size / 1024 / 1024).toFixed(1)} MB (WhatsApp acepta hasta ${Math.round(tope / 1024 / 1024)} MB)`;
  }
  return null;
}

export function SendWhatsAppModal({ docs, mode = "share", telefono, onClose }: {
  docs: DbDocument[];
  mode?: "share" | "sign";
  /** Número precargado (ej. el cliente de la cotización recién generada). */
  telefono?: string;
  onClose: () => void;
}) {
  const isSign = mode === "sign";
  const doc = docs[0];
  const multi = docs.length > 1;
  const isPdf = doc?.mimeType === "application/pdf";
  const blocked = isSign && !isPdf; // solo PDFs se pueden firmar

  const comparteEquipo = useMemo(equipoComparteArchivos, []);
  // Firmar ES un enlace (hay que abrir la pantalla de firma). Todo lo demás
  // arranca en "mandar el archivo", que es lo que se espera de "enviar".
  const [via, setVia] = useState<Via>(isSign ? "enlace" : "archivo");
  const [phone, setPhone] = useState(telefono ?? "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ enviados: { nombre: string }[]; fallidos: { nombre: string; error: string }[] } | null>(null);

  /** id → enlace público (sólo se generan si se elige la vía "enlace"). */
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [fallos, setFallos] = useState<Map<string, string>>(new Map());
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Enlace protegido: la página pública pide esta clave antes de mostrar nada. */
  const [conClave, setConClave] = useState(false);
  const [clave, setClave] = useState("");

  const [message, setMessage] = useState(
    isSign
      ? `Hola, te pido que firmes este documento "${doc?.name ?? ""}". Podés firmarlo desde este enlace:`
      : ""
  );

  const problemas = useMemo(
    () => docs.map((d) => ({ doc: d, motivo: noEntraComoArchivo(d) })).filter((x) => x.motivo),
    [docs],
  );

  // Los enlaces se crean SÓLO si hacen falta: generarlos siempre gastaba el
  // presupuesto del endpoint (10 cada 15 min) aunque el envío fuera del archivo.
  // Si se pidió clave, se espera a que la escriba: un enlace ya nacido sin clave
  // seguiría abierto aunque después se genere otro.
  useEffect(() => {
    if (blocked || via !== "enlace" || links.size > 0 || creating || conClave) return;
    let vivo = true;
    setCreating(true);
    crearEnlaces(docs, isSign ? "firmar" : "d")
      .then(({ ok, mal }) => { if (vivo) { setLinks(ok); setFallos(mal); } })
      .finally(() => { if (vivo) setCreating(false); });
    return () => { vivo = false; };
  // Los ids son lo que define el lote; `docs` es un array nuevo en cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [via, docs.map((d) => d.id).join(","), isSign, blocked, conClave]);

  /** Rehace los enlaces del lote pidiendo clave. El anterior (si lo hubo) queda vivo. */
  const generarConClave = async () => {
    const limpia = clave.trim();
    if (limpia.length < 4 || creating) return;
    setCreating(true);
    try {
      const { ok, mal } = await crearEnlaces(docs, isSign ? "firmar" : "d", 3, limpia);
      setLinks(ok);
      setFallos(mal);
    } finally {
      setCreating(false);
    }
  };

  // Escape para cerrar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Contactos desde el inbox de WhatsApp (dedupe por número).
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/whatsapp/conversations", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d: { conversations?: Array<{ customerPhone?: string; customerName?: string }> }) => {
        if (!alive) return;
        const seen = new Set<string>();
        const list: Contact[] = [];
        for (const c of d.conversations ?? []) {
          const p = (c.customerPhone ?? "").replace(/\D/g, "");
          if (!p || seen.has(p)) continue;
          seen.add(p);
          list.push({ phone: p, name: c.customerName?.trim() || c.customerPhone || p });
        }
        setContacts(list);
      })
      .catch(() => { /* sin contactos: solo entrada manual */ });
    return () => { alive = false; };
  }, []);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    const base = q
      ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      : contacts;
    return base.slice(0, 40);
  }, [contacts, contactQuery]);

  const normalized = normalizePhone(phone);
  const link = docs.length === 1 ? (links.get(docs[0].id) ?? null) : null;
  const linkError = docs.length === 1 ? (fallos.get(docs[0].id) ?? null) : null;
  const listos = links.size;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard bloqueado */ }
  };

  /** Vía 1 — el servidor sube el archivo a Meta y lo manda al número. */
  const enviarArchivo = useCallback(async () => {
    if (!normalized) { setErrorEnvio("Poné el número de WhatsApp del destinatario."); return; }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await fetch("/api/admin/whatsapp/send-document", {
        method: "POST",
        credentials: "include",
        headers: { ...csrfHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          docIds: docs.map((d) => d.id),
          phone: normalized,
          caption: message.trim() || undefined,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        enviados?: { nombre: string }[];
        fallidos?: { nombre: string; error: string }[];
        error?: string;
        motivo?: string;
      };
      if (r.status === 409 && data.motivo === "sin_conexion") {
        setErrorEnvio(
          "El WhatsApp del negocio no está conectado. Conectalo en Configuración › WhatsApp, o mandá el archivo desde tu celular con «Compartir desde este equipo».",
        );
        return;
      }
      if (!data.enviados?.length && !data.fallidos?.length) {
        setErrorEnvio(data.error ?? "No se pudo enviar.");
        return;
      }
      setResultado({ enviados: data.enviados ?? [], fallidos: data.fallidos ?? [] });
    } catch {
      setErrorEnvio("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }, [docs, message, normalized]);

  /** Vía 2 — el menú de compartir del sistema, con los archivos adjuntos. */
  const compartirDesdeEquipo = useCallback(async () => {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const archivos: File[] = [];
      for (const d of docs) {
        const res = await pedirArchivo(`/api/admin/documents/${d.id}/raw`);
        const blob = await res.blob();
        archivos.push(new File([blob], d.name, { type: d.mimeType || blob.type }));
      }
      if (!navigator.canShare?.({ files: archivos })) {
        setErrorEnvio("Este equipo no puede compartir estos archivos. Probá con «Mandar el archivo» o con el enlace.");
        return;
      }
      await navigator.share({ files: archivos, ...(message.trim() ? { text: message.trim() } : {}) });
      setResultado({ enviados: docs.map((d) => ({ nombre: d.name })), fallidos: [] });
    } catch (e) {
      // Cancelar el menú de compartir tira AbortError: no es un error que
      // haya que mostrar.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErrorEnvio(e instanceof Error ? e.message : "No se pudo compartir.");
    } finally {
      setEnviando(false);
    }
  }, [docs, message]);

  /** Vía 3 — wa.me con el mensaje y los enlaces (lo de siempre). */
  const abrirWhatsAppConEnlace = () => {
    if (listos === 0) return;
    const cuerpo = docs.length === 1
      ? links.get(docs[0].id) ?? ""
      : docs.filter((d) => links.has(d.id)).map((d) => `• ${d.name}\n${links.get(d.id)}`).join("\n\n");
    const text = encodeURIComponent(`${message}\n\n${cuerpo}`.trim());
    const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
    window.open(`${base}?text=${text}`, "_blank", "noopener");
  };

  const accion = via === "archivo" ? enviarArchivo : via === "dispositivo" ? compartirDesdeEquipo : abrirWhatsAppConEnlace;
  const textoBoton = via === "archivo"
    ? (multi ? `Mandar ${docs.length} archivos` : "Mandar el archivo")
    : via === "dispositivo" ? "Compartir" : (multi ? `Abrir WhatsApp con ${listos}` : "Abrir WhatsApp");
  const deshabilitado = enviando || (via === "enlace" ? creating || listos === 0 : false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-[34rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
            {isSign ? <PenLine className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">{isSign ? "Solicitar firma" : multi ? `Enviar ${docs.length} documentos por WhatsApp` : "Enviar por WhatsApp"}</p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{multi ? docs.map((d) => d.name).join(" · ") : doc?.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {blocked ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"><FileWarning className="h-6 w-6" /></span>
              <p className="text-sm font-bold text-[var(--text-primary)]">Solo se pueden firmar PDFs</p>
              <p className="max-w-xs text-xs text-[var(--text-secondary)]">Este documento no es un PDF, así que no se puede solicitar la firma. Subí una versión en PDF y volvé a intentarlo.</p>
            </div>
          ) : resultado ? (
            <ResultadoEnvio resultado={resultado} />
          ) : (
          <>
          {/* Cómo se manda */}
          {!isSign && (
            <div>
              <p className="mb-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cómo se manda</p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                <OpcionVia activa={via === "archivo"} onClick={() => setVia("archivo")} Icon={Paperclip} titulo="El archivo" detalle="Llega como adjunto" />
                <OpcionVia activa={via === "dispositivo"} onClick={() => setVia("dispositivo")} Icon={Share2} titulo="Desde este equipo" detalle={comparteEquipo ? "Menú de compartir" : "No disponible acá"} deshabilitada={!comparteEquipo} />
                <OpcionVia activa={via === "enlace"} onClick={() => setVia("enlace")} Icon={Link2} titulo="Un enlace" detalle="Si no se puede adjuntar" />
              </div>
              {via === "archivo" && (
                <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
                  Sale del WhatsApp del negocio y queda en el inbox del panel. Necesita el número conectado.
                </p>
              )}
              {via === "dispositivo" && (
                <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
                  Abre el menú de compartir de este equipo con los archivos adjuntos: elegís el chat y listo.
                </p>
              )}
            </div>
          )}

          {/* Lo que no entra como adjunto */}
          {via !== "enlace" && problemas.length > 0 && (
            <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] p-3 dark:bg-[var(--data-warning-500)]/12">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertCircle className="h-3.5 w-3.5" /> No se pueden adjuntar
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
                {problemas.map(({ doc: d, motivo }) => <li key={d.id}>{d.name} — {motivo}</li>)}
              </ul>
              <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">Para esos, mandá un enlace.</p>
            </div>
          )}

          {/* Enlaces (sólo en la vía enlace) */}
          {via === "enlace" && !isSign && (
            <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              <div className="flex items-start gap-2.5">
                <input
                  id="enlace-con-clave"
                  type="checkbox"
                  checked={conClave}
                  onChange={(e) => { setConClave(e.target.checked); if (!e.target.checked) setClave(""); }}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                />
                <div className="min-w-0">
                  <label htmlFor="enlace-con-clave" className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    <Lock className="h-3.5 w-3.5" /> Pedir una clave para abrirlo
                  </label>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Sin clave, cualquiera que reciba el enlace ve el archivo. Pasale la clave por otro lado (una llamada, otro chat).
                  </p>
                </div>
              </div>

              {conClave && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    placeholder="Clave (mínimo 4 caracteres)"
                    className="h-11 min-w-[190px] flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={generarConClave}
                    disabled={creating || clave.trim().length < 4}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    {links.size > 0 ? "Rehacer con clave" : "Generar el enlace"}
                  </button>
                  {links.size > 0 && (
                    <p className="w-full text-[length:var(--ts-2xs,11px)] text-[var(--data-warning)]">
                      El enlace anterior sigue activo: cortalo desde la vista <span className="font-bold">Enlaces</span> del drive.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {via === "enlace" && multi && (
            <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Enlaces (30 días)</span>
                <span className="font-mono tabular-nums">{creating ? "generando…" : `${listos}/${docs.length} listos`}</span>
              </div>
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {docs.map((d) => {
                  const ok = links.has(d.id);
                  const err = fallos.get(d.id);
                  return (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs">
                      {creating && !ok && !err ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-tertiary)]" />
                        : ok ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                        : <FileWarning className="h-3.5 w-3.5 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />}
                      <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{d.name}</span>
                      {err && <span className="shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">no se pudo compartir</span>}
                    </li>
                  );
                })}
              </ul>
              {fallos.size > 0 && (
                <p className="mt-2 text-[length:var(--ts-2xs,11px)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {[...fallos.values()].some((m) => m.includes("límite"))
                    ? `El servidor permite ${LIMITE_LOTE} enlaces cada 15 minutos. Mandá los que sí se generaron y probá con el resto más tarde.`
                    : "Los documentos marcados no se pudieron compartir. El mensaje lleva sólo los que sí."}
                </p>
              )}
            </div>
          )}

          {via === "enlace" && !multi && (
            <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Link2 className="h-3.5 w-3.5" /> {isSign ? "Enlace de firma (30 días)" : "Enlace de acceso (30 días)"}
              </div>
              {creating ? (
                <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> Generando enlace…</p>
              ) : linkError ? (
                <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No se pudo generar el enlace: {linkError}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">{link}</code>
                  <button onClick={copyLink} className="inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Número — obligatorio para mandar el archivo desde el negocio */}
          {via !== "dispositivo" && (
            <div>
              <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Número de WhatsApp {via === "archivo" && <span className="text-[var(--data-error-600)]">*</span>}
              </label>
              <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-primary">
                <span className="shrink-0 text-sm font-bold text-[var(--text-tertiary)]">+51</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="929 340 532"
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[var(--text-primary)] outline-none"
                />
                {normalized && <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">→ {normalized}</span>}
              </div>
              <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
                {via === "archivo"
                  ? "El archivo se manda a este número desde el WhatsApp del negocio."
                  : "Perú (+51) por defecto. Dejalo vacío para elegir el contacto dentro de WhatsApp."}
              </p>
            </div>
          )}

          {/* Contactos */}
          {via !== "dispositivo" && contacts.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Contactos ({contacts.length})</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Buscar contacto…"
                  className="w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-2 pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
                />
              </div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {filteredContacts.map((c) => {
                  const active = normalizePhone(phone) === normalizePhone(c.phone);
                  return (
                    <li key={c.phone}>
                      <button
                        onClick={() => setPhone(c.phone)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><User className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-bold", active ? "text-primary" : "text-[var(--text-primary)]")}>{c.name}</span>
                          <span className="block truncate text-xs tabular-nums text-[var(--text-tertiary)]">{c.phone}</span>
                        </span>
                        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  );
                })}
                {filteredContacts.length === 0 && (
                  <li className="px-2.5 py-3 text-center text-xs italic text-[var(--text-tertiary)]">Sin coincidencias.</li>
                )}
              </ul>
            </div>
          )}

          {/* Mensaje — opcional cuando va el archivo: el pedido es que llegue el
              documento, no un texto. */}
          <div>
            <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Mensaje {via !== "enlace" && <span className="normal-case text-[var(--text-tertiary)]">(opcional)</span>}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={via === "enlace" ? 3 : 2}
              placeholder={via === "enlace" ? "" : "Sin texto: llega sólo el archivo"}
              className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
            />
            <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              {via === "enlace" ? "El enlace se agrega automáticamente al final del mensaje." : "Si lo dejás vacío, el archivo va solo."}
            </p>
          </div>

          {errorEnvio && (
            <p className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2.5 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {errorEnvio}
            </p>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">{blocked || resultado ? "Cerrar" : "Cancelar"}</button>
          {!blocked && !resultado && (
            <button
              onClick={accion}
              disabled={deshabilitado}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-[var(--data-success-500)]"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : via === "enlace" ? <Send className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
              {enviando ? "Mandando…" : textoBoton}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OpcionVia({
  activa, onClick, Icon, titulo, detalle, deshabilitada,
}: {
  activa: boolean;
  onClick: () => void;
  Icon: typeof Paperclip;
  titulo: string;
  detalle: string;
  deshabilitada?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        activa
          ? "border-[var(--data-success-700)] bg-[var(--data-success-50)] dark:border-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/12"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-tertiary)]",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Icon className="h-4 w-4" /> {titulo}
      </span>
      <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">{detalle}</span>
    </button>
  );
}

function ResultadoEnvio({ resultado }: { resultado: { enviados: { nombre: string }[]; fallidos: { nombre: string; error: string }[] } }) {
  return (
    <div className="space-y-3 py-4">
      {resultado.enviados.length > 0 && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
            <Check className="h-6 w-6" />
          </span>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {resultado.enviados.length === 1 ? "Archivo enviado" : `${resultado.enviados.length} archivos enviados`}
          </p>
          <ul className="text-xs text-[var(--text-secondary)]">
            {resultado.enviados.map((e) => <li key={e.nombre}>{e.nombre}</li>)}
          </ul>
        </div>
      )}
      {resultado.fallidos.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/12">
          <p className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No salieron</p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {resultado.fallidos.map((f) => <li key={f.nombre}>{f.nombre} — {f.error}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
