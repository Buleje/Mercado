"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "@buleje/design-system/icons";

/** Botón copiar-al-portapapeles con feedback visual. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {
            /* clipboard bloqueado: el usuario puede seleccionar el texto a mano */
          },
        );
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] px-2.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      aria-label={label}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copiar
        </>
      )}
    </button>
  );
}

/**
 * WaConnectionGuide — pasos para conectar un número de WhatsApp Business
 * (Meta Cloud API) al panel. Colapsable para no estorbar cuando ya está conectado.
 */
export default function WaConnectionGuide({ verifyToken }: { verifyToken: string }) {
  const [open, setOpen] = useState(false);
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/webhook`
      : "/api/whatsapp/webhook";

  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: "Crea la app en Meta",
      body: (
        <>
          Entra a{" "}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-primary underline underline-offset-2"
          >
            developers.facebook.com/apps <ExternalLink className="h-3 w-3" />
          </a>{" "}
          → Crear app → tipo <strong>Empresa</strong> → agrega el producto{" "}
          <strong>WhatsApp</strong>. Ahí vinculas o creas el número de tu negocio.
        </>
      ),
    },
    {
      title: "Copia las credenciales",
      body: (
        <>
          En <strong>WhatsApp → Configuración de la API</strong> copia el{" "}
          <strong>Phone Number ID</strong> y genera un <strong>token permanente</strong>{" "}
          (usuario del sistema en Meta Business). Pégalos en el formulario de abajo y guarda.
        </>
      ),
    },
    {
      title: "Configura el webhook",
      body: (
        <div className="space-y-2">
          <p>
            En <strong>WhatsApp → Configuración → Webhook</strong> pega esta URL y tu
            verify token, y suscríbete al campo <strong>messages</strong>:
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] p-2">
            <code className="min-w-0 flex-1 truncate text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
              {webhookUrl}
            </code>
            <CopyButton value={webhookUrl} label="Copiar URL del webhook" />
          </div>
          {verifyToken && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] p-2">
              <code className="min-w-0 flex-1 truncate text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                {verifyToken}
              </code>
              <CopyButton value={verifyToken} label="Copiar verify token" />
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Prueba y listo",
      body: (
        <>
          Usa el botón <strong>Probar conexión</strong> de abajo. Si Meta responde con tu
          número, ya está: los mensajes que lleguen aparecen en el sub-tab{" "}
          <strong>WhatsApp</strong> y puedes responder desde el panel.
        </>
      ),
    },
  ];

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-[var(--text-primary)]">
          ¿Cómo conecto mi número? — guía en 4 pasos
        </span>
        <span className="text-[length:var(--ts-xs)] font-bold text-primary">
          {open ? "Ocultar" : "Ver pasos"}
        </span>
      </button>
      {open && (
        <ol className="space-y-4 border-t border-[var(--rule-base)] p-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">{s.title}</p>
                <div className="text-sm text-[var(--text-secondary)]">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
