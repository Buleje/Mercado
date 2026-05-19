"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  MessageSquare,
  Users,
  Filter,
  Copy,
  CheckCheck,
  Search,
  ChevronDown,
  Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  totalSpent?: number;
  lastOrderDate?: string | null;
  debt?: number;
}

type Segment =
  | "todos"
  | "compraron-30"
  | "inactivos-30"
  | "deuda"
  | "alto-valor"
  | "rfm-preset";

const SEGMENT_LABELS: Record<Segment, string> = {
  todos: "Todos los clientes",
  "compraron-30": "Compraron en los últimos 30 días",
  "inactivos-30": "No compran hace 30+ días",
  deuda: "Con deuda pendiente",
  "alto-valor": "Alto valor (S/ 200+)",
  "rfm-preset": "Segmento RFM seleccionado",
};

interface MassMessageSenderProps {
  /** Optional preselected phones (e.g. from RFM segment click). Switches segment to "rfm-preset" automatically. */
  preselectedPhones?: string[];
  /** Optional label shown in the UI when preselectedPhones is used. */
  presetLabel?: string;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  oferta:
    "Hola {nombre}, tenemos ofertas especiales para ti esta semana. Ven a visitarnos o escríbenos para más info.",
  reactivar:
    "Hola {nombre}, hace tiempo no te vemos por Buleje. Te esperamos con productos frescos y buenos precios.",
  deuda:
    "Hola {nombre}, te recordamos que tienes un saldo pendiente de {deuda}. Puedes pasar a regularizarlo cuando gustes.",
  nueva:
    "Hola {nombre}, gracias por tu última compra el {ultimaCompra}. Tenemos novedades que te pueden interesar.",
};

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function applyTemplate(template: string, customer: Customer): string {
  const lastOrder = customer.lastOrderDate
    ? new Date(customer.lastOrderDate).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "una fecha anterior";

  return template
    .replace(/\{nombre\}/g, customer.name)
    .replace(/\{ultimaCompra\}/g, lastOrder)
    .replace(/\{deuda\}/g, fmt(customer.debt ?? 0));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MassMessageSender({
  preselectedPhones,
  presetLabel,
}: MassMessageSenderProps = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<Segment>(
    preselectedPhones && preselectedPhones.length > 0 ? "rfm-preset" : "todos",
  );

  // Normalized set of preselected phones (digits only) for fast lookup.
  const presetPhoneSet = useMemo(() => {
    if (!preselectedPhones || preselectedPhones.length === 0) return null;
    return new Set(preselectedPhones.map((p) => p.replace(/\D/g, "")));
  }, [preselectedPhones]);

  // Auto-switch to "rfm-preset" when preselection changes from outside.
  useEffect(() => {
    if (presetPhoneSet && presetPhoneSet.size > 0) {
      setSegment("rfm-preset");
    }
  }, [presetPhoneSet]);
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATES.oferta);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("oferta");
  const [copied, setCopied] = useState(false);
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null);
  // Mejora 8 nueva: WhatsApp links + bulk preview
  const [showWaLinks, setShowWaLinks] = useState(false);

  useEffect(() => {
    fetch("/api/customers?limit=500")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data)) {
          setCustomers(data);
        } else {
          // Seed
          setCustomers([
            { id: 1, name: "María García", phone: "955123456", totalSpent: 340, lastOrderDate: new Date(Date.now() - 5 * 86400000).toISOString(), debt: 0 },
            { id: 2, name: "Juan Pérez", phone: "966234567", totalSpent: 120, lastOrderDate: new Date(Date.now() - 45 * 86400000).toISOString(), debt: 15 },
            { id: 3, name: "Rosa Quispe", phone: "944345678", totalSpent: 890, lastOrderDate: new Date(Date.now() - 10 * 86400000).toISOString(), debt: 0 },
            { id: 4, name: "Carlos Vega", phone: "933456789", totalSpent: 60, lastOrderDate: new Date(Date.now() - 90 * 86400000).toISOString(), debt: 30 },
            { id: 5, name: "Ana Torres", phone: "922567890", totalSpent: 450, lastOrderDate: new Date(Date.now() - 20 * 86400000).toISOString(), debt: 0 },
            { id: 6, name: "Luis Mamani", phone: "911678901", totalSpent: 200, lastOrderDate: null, debt: 50 },
          ]);
        }
      })
      .catch((err) => console.warn("[MassMessageSender] customers fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = customers;

    switch (segment) {
      case "compraron-30":
        list = list.filter((c) => daysSince(c.lastOrderDate) <= 30);
        break;
      case "inactivos-30":
        list = list.filter((c) => daysSince(c.lastOrderDate) > 30);
        break;
      case "deuda":
        list = list.filter((c) => (c.debt ?? 0) > 0);
        break;
      case "alto-valor":
        list = list.filter((c) => (c.totalSpent ?? 0) >= 200);
        break;
      case "rfm-preset":
        if (presetPhoneSet) {
          list = list.filter((c) => {
            const digits = (c.phone ?? "").replace(/\D/g, "");
            return digits && presetPhoneSet.has(digits);
          });
        }
        break;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q)
      );
    }

    return list;
  }, [customers, segment, search, presetPhoneSet]);

  useEffect(() => {
    setPreviewCustomer(filtered[0] ?? null);
  }, [filtered]);

  const handleTemplateKey = useCallback((key: string) => {
    setSelectedTemplateKey(key);
    setTemplate(DEFAULT_TEMPLATES[key] ?? "");
  }, []);

  const previewText = useMemo(
    () => (previewCustomer ? applyTemplate(template, previewCustomer) : template),
    [template, previewCustomer]
  );

  const generateList = useCallback(() => {
    const lines = filtered
      .map((c) => {
        const msg = applyTemplate(template, c);
        const phone = c.phone ? `+51${c.phone.replace(/\D/g, "")}` : "sin-número";
        return `${c.name} | ${phone} | ${msg}`;
      })
      .join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }, [filtered, template]);

  return (
    <div className="flex flex-col gap-6">
      {/* Segment selector */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
            Segmento de clientes
          </CardTitle>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(SEGMENT_LABELS) as Segment[])
            .filter((s) => s !== "rfm-preset" || (presetPhoneSet && presetPhoneSet.size > 0))
            .map((s) => {
              const label =
                s === "rfm-preset" && presetLabel
                  ? `RFM: ${presetLabel} (${presetPhoneSet?.size ?? 0})`
                  : SEGMENT_LABELS[s];
              return (
                <button
                  key={s}
                  onClick={() => setSegment(s)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors",
                    segment === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-[var(--text-primary)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
        </div>

        {/* Search within segment */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en el segmento..."
            className={cn(
              "w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-9 pr-3 text-sm",
              "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
            )}
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--text-tertiary)]" />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
          ) : (
            <span className="text-sm text-[var(--text-secondary)]">
              <strong className="text-primary">{filtered.length}</strong> destinatario
              {filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Template editor */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Mensaje
            </CardTitle>
          </div>

          {/* Preset templates */}
          <div className="mb-3 flex flex-wrap gap-1">
            {Object.keys(DEFAULT_TEMPLATES).map((key) => (
              <button
                key={key}
                onClick={() => handleTemplateKey(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors",
                  selectedTemplateKey === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-[var(--text-primary)]",
                )}
              >
                {key}
              </button>
            ))}
          </div>

          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={5}
            className={cn(
              "w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 p-3 text-sm leading-relaxed",
              "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
              "resize-none"
            )}
          />

          {/* Variable chips */}
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            <span className="text-[var(--text-tertiary)]">Variables:</span>
            {["{nombre}", "{ultimaCompra}", "{deuda}"].map((v) => (
              <button
                key={v}
                onClick={() => setTemplate((t) => `${t} ${v}`)}
                className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[var(--text-secondary)] hover:bg-gray-200"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Vista previa
            </CardTitle>
            {filtered.length > 0 && (
              <div className="relative">
                <select
                  value={previewCustomer?.id ?? ""}
                  onChange={(e) =>
                    setPreviewCustomer(
                      filtered.find((c) => c.id === Number(e.target.value)) ?? null
                    )
                  }
                  className="appearance-none rounded-lg border border-[var(--rule-base)] bg-gray-50 py-1 pl-2 pr-6 text-xs text-[var(--text-primary)] focus:border-primary focus:outline-none"
                >
                  {filtered.slice(0, 10).map((c, idx) => (
                    <option key={c.id ?? idx} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-tertiary)]" />
              </div>
            )}
          </div>

          {/* Preview bubble — bg neutro DS, no verde WhatsApp saturado */}
          <div className="rounded-xl bg-[var(--surface-sunken)] p-4 border border-[var(--rule-soft)]">
            <div className="inline-block max-w-[85%] rounded-xl rounded-tl-none bg-[var(--surface-raised)] px-4 py-3 border border-[var(--rule-soft)] shadow-[var(--shadow-sm)]">
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                {previewCustomer ? previewText : template}
              </p>
              <p className="mt-1 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          {previewCustomer && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              Para: {previewCustomer.name}
              {previewCustomer.phone ? ` · ${previewCustomer.phone}` : " · sin número"}
            </p>
          )}

          {/* Character count */}
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {template.length} caracteres
            {template.length > 160 && (
              <span className="ml-1 text-[var(--data-warning-500)]">(SMS multipart)</span>
            )}
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-5">
        <p className="text-sm text-[var(--text-secondary)]">
          Se generara una lista con <strong>{filtered.length}</strong> destinatario
          {filtered.length !== 1 ? "s" : ""} para copiar y usar en WhatsApp o SMS.
          No se realiza ningun envio automatico.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateList}
            disabled={filtered.length === 0 || !template.trim()}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-colors min-h-[44px]",
              copied
                ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] border border-[var(--data-success-500)]/30"
                : "bg-primary text-white hover:bg-primary/90",
              "disabled:opacity-40"
            )}
          >
            {copied ? (
              <>
                <CheckCheck className="h-4 w-4" />
                Lista copiada
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar todos los mensajes
              </>
            )}
          </button>
          <button
            onClick={() => setShowWaLinks(!showWaLinks)}
            disabled={filtered.length === 0 || !template.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors min-h-[44px] border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
          >
            <MessageSquare className="h-4 w-4 text-[var(--data-success-500)]" />
            Links WhatsApp
          </button>
        </div>
      </div>

      {/* Mejora 8 nueva: WhatsApp links list */}
      {showWaLinks && filtered.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[var(--data-success-500)]" />
            Links de WhatsApp ({filtered.length} clientes)
          </CardTitle>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Haz click en cada link para abrir WhatsApp con el mensaje personalizado.
          </p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {filtered.map((c) => {
              if (!c.phone) return null;
              const msg = applyTemplate(template, c);
              const cleanPhone = c.phone.replace(/\D/g, "");
              const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : "51" + cleanPhone;
              const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
              return (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[var(--color-card)] border border-[var(--data-success-500)]/30 hover:border-[var(--data-success-500)]/30 transition-colors"
                  >
                    <span className="font-bold text-[var(--text-primary)] truncate">{c.name}</span>
                    <span className="text-[var(--text-tertiary)] text-xs">{c.phone}</span>
                    <span className="ml-auto text-[var(--data-success-500)] text-xs font-bold">Abrir</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
