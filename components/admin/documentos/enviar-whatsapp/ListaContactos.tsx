"use client";

import { Search, User, Check } from "@buleje/design-system/icons";
import { normalizePhone } from "./compartido";
import { cn } from "@/lib/utils";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function ListaContactos({ arch }: { arch: EstadoEnviar }) {
  const { via, contacts, contactQuery, setContactQuery, filteredContacts, phone, setPhone } = arch;
  return (
    <>
      {/* Contactos */}
      {via !== "dispositivo" && contacts.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Contactos ({contacts.length})
          </label>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder="Buscar contacto…"
              className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] h-10 pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
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
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                      active ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                      <User className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-bold",
                          active ? "text-primary" : "text-[var(--text-primary)]",
                        )}
                      >
                        {c.name}
                      </span>
                      <span className="block truncate text-xs tabular-nums text-[var(--text-tertiary)]">
                        {c.phone}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
            {filteredContacts.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs italic text-[var(--text-tertiary)]">
                Sin coincidencias.
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
