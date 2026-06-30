"use client";

import { useState } from "react";
import {
  X,
  CheckCircle2,
  Mail,
  Clock,
  RotateCcw,
  Send,
  Loader2,
  Star,
  Plus,
  ChevronDown,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, PRIORITY_CONFIG, timeAgo } from "./shared";
import type { SupportTicket, TicketStatus, TicketPriority, ReplyTemplate } from "./shared";

interface Props {
  ticket: SupportTicket;
  onClose: () => void;
  onSetStatus: (id: string, status: TicketStatus) => void;
  onSetPriority: (id: string, priority: TicketPriority) => void;
  onReply: (id: string, body: string) => Promise<void>;
  templates: ReplyTemplate[];
  onLoadTemplates: () => Promise<void>;
  onSaveTemplate: (name: string, body: string) => Promise<void>;
}

export default function TicketDetail({
  ticket,
  onClose,
  onSetStatus,
  onSetPriority,
  onReply,
  templates,
  onLoadTemplates,
  onSaveTemplate,
}: Props) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await onReply(ticket.id, replyText.trim());
      setReplyText("");
      setShowTemplates(false);
    } finally {
      setSending(false);
    }
  };

  const handleToggleTemplates = async () => {
    const nextOpen = !showTemplates;
    if (nextOpen && templates.length === 0) {
      await onLoadTemplates();
    }
    setShowTemplates(nextOpen);
    if (!nextOpen) setShowSaveForm(false);
  };

  const handleInsertTemplate = (body: string) => {
    setReplyText(body);
    setShowTemplates(false);
    setShowSaveForm(false);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !replyText.trim() || savingTemplate) return;
    setSavingTemplate(true);
    try {
      await onSaveTemplate(templateName.trim(), replyText.trim());
      setTemplateName("");
      setShowSaveForm(false);
    } finally {
      setSavingTemplate(false);
    }
  };

  const statusCfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Cabecera del ticket */}
      <div className="p-4 border-b border-[var(--rule-base)] shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-[var(--text-primary)]">{ticket.subject}</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {ticket.tenantName} &bull; {ticket.senderEmail} &bull;{" "}
              {timeAgo(ticket.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del ticket"
            className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Acciones de estado y prioridad */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {ticket.status !== "closed" && (
            <button
              type="button"
              onClick={() => onSetStatus(ticket.id, "closed")}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/20 text-[var(--data-success-500)] hover:opacity-80 transition-opacity"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Cerrar ticket
            </button>
          )}

          {ticket.status === "closed" && (
            <button
              type="button"
              onClick={() => onSetStatus(ticket.id, "open")}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] hover:opacity-80 transition-opacity"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reabrir
            </button>
          )}

          {ticket.status === "open" && (
            <button
              type="button"
              onClick={() => onSetStatus(ticket.id, "in_progress")}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-80 transition-opacity"
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              En progreso
            </button>
          )}

          {ticket.status === "closed" && (
            <button
              type="button"
              onClick={() => onSetStatus(ticket.id, "in_progress")}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-80 transition-opacity"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Reabrir como en progreso
            </button>
          )}

          {/* Selector de prioridad */}
          <div className="ml-auto flex items-center gap-1.5">
            <AlertTriangle
              className={cn("w-4 h-4", priorityCfg.color)}
              aria-hidden="true"
            />
            <select
              value={ticket.priority}
              onChange={(e) => onSetPriority(ticket.id, e.target.value as TicketPriority)}
              aria-label="Prioridad del ticket"
              className="text-sm border-2 border-[var(--rule-base)] rounded-xl px-2 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hilo de mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-label="Hilo de mensajes">
        {ticket.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-[85%] rounded-xl px-4 py-3",
              msg.from === "tenant"
                ? "bg-[var(--surface-sunken)] mr-auto"
                : "bg-primary/10 dark:bg-primary/15 ml-auto",
            )}
          >
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{msg.body}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
              {msg.from === "support" ? "Soporte" : ticket.tenantName} &bull;{" "}
              {timeAgo(msg.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {/* Caja de respuesta */}
      <div className="p-3 border-t border-[var(--rule-base)] shrink-0 space-y-2">
        {/* Panel de plantillas */}
        {showTemplates && (
          <div className="border border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] p-2 max-h-52 overflow-y-auto space-y-1">
            {templates.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-2">
                Sin plantillas guardadas
              </p>
            ) : (
              templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleInsertTemplate(tpl.body)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {tpl.starred && (
                      <Star
                        className="w-3.5 h-3.5 text-[var(--data-warning-500)] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {tpl.name}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
                    {tpl.body}
                  </p>
                </button>
              ))
            )}

            {/* Formulario inline para guardar plantilla */}
            {showSaveForm && (
              <div className="pt-2 border-t border-[var(--rule-base)] space-y-1.5">
                <label className="sr-only" htmlFor="template-name-input">
                  Nombre de la plantilla
                </label>
                <input
                  id="template-name-input"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nombre de la plantilla..."
                  className="w-full px-3 h-9 text-sm border-2 border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveTemplate();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim() || !replyText.trim() || savingTemplate}
                    className="flex-1 text-sm font-semibold px-3 py-1.5 rounded-xl bg-primary text-white disabled:opacity-50"
                  >
                    {savingTemplate ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveForm(false)}
                    className="text-sm px-3 py-1.5 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Textarea multilínea */}
        <label htmlFor={`reply-${ticket.id}`} className="sr-only">
          Respuesta al ticket
        </label>
        <textarea
          id={`reply-${ticket.id}`}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleReply();
            }
          }}
          placeholder="Escribe una respuesta... (Enter = enviar, Shift+Enter = nueva línea)"
          rows={3}
          className="w-full px-3 py-2 text-sm border-2 border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-[var(--text-primary)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        {/* Botones de acciones de respuesta */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Abrir/cerrar plantillas */}
          <button
            type="button"
            onClick={handleToggleTemplates}
            aria-expanded={showTemplates}
            aria-controls="templates-panel"
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border-2 transition-colors",
              showTemplates
                ? "border-primary text-primary bg-[var(--accent-soft)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            <Star className="w-4 h-4" aria-hidden="true" />
            Plantillas
            <ChevronDown
              className={cn("w-3.5 h-3.5 transition-transform", showTemplates && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {/* Guardar como plantilla */}
          <button
            type="button"
            onClick={() => {
              setShowTemplates(true);
              setShowSaveForm(true);
            }}
            disabled={!replyText.trim()}
            title="Guardar texto actual como plantilla"
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40 transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Guardar plantilla
          </button>

          {/* Enviar respuesta */}
          <button
            type="button"
            onClick={handleReply}
            disabled={!replyText.trim() || sending}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
