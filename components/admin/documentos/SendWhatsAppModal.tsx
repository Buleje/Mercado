"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X, Search, User, Link2, Copy, Check, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { createShare } from "@/hooks/use-documents";

type Contact = { name: string; phone: string };

/** Normaliza a dígitos y antepone el código de Perú (51) a celulares de 9 dígitos. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

/**
 * Enviar un documento por WhatsApp: crea un link de acceso público (`/d/{token}`,
 * 30 días) y abre WhatsApp hacia un número o contacto elegido con el mensaje + link.
 * El link same-origin evita mandar la URL firmada de Supabase (que expira en 1h).
 */
export function SendWhatsAppModal({ doc, onClose }: { doc: DbDocument; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    `Hola, te comparto el documento "${doc.name}". Podés verlo o descargarlo desde este enlace:`
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Crear el link de acceso público al abrir.
  useEffect(() => {
    let alive = true;
    createShare(doc.id, { expiresInDays: 30 })
      .then((s) => {
        if (!alive) return;
        setLink(`${window.location.origin}/d/${s.token}`);
      })
      .catch((err) => { if (alive) setLinkError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (alive) setCreating(false); });
    return () => { alive = false; };
  }, [doc.id]);

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

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard bloqueado */ }
  };

  const openWhatsApp = () => {
    if (!link) return;
    const text = encodeURIComponent(`${message}\n\n${link}`);
    const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
    window.open(`${base}?text=${text}`, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-[34rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">Enviar por WhatsApp</p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{doc.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Link público */}
          <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <Link2 className="h-3.5 w-3.5" /> Enlace de acceso (30 días)
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

          {/* Número */}
          <div>
            <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Número de WhatsApp</label>
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
            <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">Perú (+51) por defecto. Dejalo vacío para elegir el contacto dentro de WhatsApp.</p>
          </div>

          {/* Contactos */}
          {contacts.length > 0 && (
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

          {/* Mensaje */}
          <div>
            <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Mensaje</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
            />
            <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">El enlace se agrega automáticamente al final del mensaje.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button
            onClick={openWhatsApp}
            disabled={creating || !link}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-[var(--data-success-500)]"
          >
            <Send className="h-4 w-4" /> Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
