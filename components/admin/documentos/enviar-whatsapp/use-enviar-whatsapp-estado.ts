import type { PropsEnviarWhatsApp } from "./compartido";
import { useMemo, useState, useEffect } from "react";
import {
  equipoComparteArchivos,
  type Via,
  type Contact,
  noEntraComoArchivo,
  crearEnlaces,
  normalizePhone,
} from "./compartido";
import { logger } from "@/lib/logger";
export function useEnviarWhatsAppEstado(propsDelModal: PropsEnviarWhatsApp) {
  const { docs, mode = "share", telefono, onClose } = propsDelModal;

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
  const [resultado, setResultado] = useState<{
    enviados: { nombre: string }[];
    fallidos: { nombre: string; error: string }[];
  } | null>(null);

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
      ? `Hola, te pido que firmes este documento "${doc?.name ?? ""}". Puedes firmarlo desde este enlace:`
      : "",
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
      .then(({ ok, mal }) => {
        if (vivo) {
          setLinks(ok);
          setFallos(mal);
        }
      })
      .finally(() => {
        if (vivo) setCreating(false);
      });
    return () => {
      vivo = false;
    };
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
      .catch((err) =>
        logger.error("[send-whatsapp] fetch contacts failed", { error: String(err) }),
      );
    return () => {
      alive = false;
    };
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
  return {
    docs,
    mode,
    telefono,
    onClose,
    isSign,
    doc,
    multi,
    isPdf,
    blocked,
    comparteEquipo,
    via,
    setVia,
    phone,
    setPhone,
    contacts,
    setContacts,
    contactQuery,
    setContactQuery,
    enviando,
    setEnviando,
    errorEnvio,
    setErrorEnvio,
    resultado,
    setResultado,
    links,
    setLinks,
    fallos,
    setFallos,
    creating,
    setCreating,
    copied,
    setCopied,
    conClave,
    setConClave,
    clave,
    setClave,
    message,
    setMessage,
    problemas,
    generarConClave,
    filteredContacts,
    normalized,
    link,
    linkError,
    listos,
  };
}
export type HastaEnviarWhatsAppEstado = ReturnType<typeof useEnviarWhatsAppEstado>;
