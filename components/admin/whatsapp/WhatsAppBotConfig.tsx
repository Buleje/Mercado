"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { SectionTitle } from "@buleje/design-system";
import AdminModal, { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Plus,
  Pencil,
  PowerOff,
  MoreHorizontal,
} from "@buleje/design-system/icons";
import WaConnectionGuide from "./WaConnectionGuide";
import WaNumberForm, { type WaConfigView } from "./WaNumberForm";

/**
 * WhatsAppBotConfig — manager de números WhatsApp del tenant (multi-número 311).
 *
 * Lista los números conectados (TenantWhatsAppConfig) con probar/editar/desactivar
 * y el form para conectar números nuevos. El bot del Concierge responde por
 * CUALQUIER número activo; el inbox permite filtrar y responder por número.
 */
export default function WhatsAppBotConfig() {
  const [configs, setConfigs] = useState<WaConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  // null = sin form abierto · "new" = conectar nuevo · WaConfigView = editando
  const [editing, setEditing] = useState<WaConfigView | "new" | null>(null);
  const [guideToken, setGuideToken] = useState("");
  const [testing, setTesting] = useState<string | null>(null); // config id en test
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp-config");
      if (res.ok) {
        const { configs: list } = (await res.json()) as { configs?: WaConfigView[] };
        setConfigs(list ?? []);
      }
    } catch {
      /* sin config previa: lista vacía */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testConnection = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/test?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        phone?: string | null;
        verifiedName?: string | null;
        error?: string;
      };
      if (res.ok && json.ok) {
        setTestResult({
          id,
          ok: true,
          text: `Conectado: ${json.phone ?? "número OK"}${json.verifiedName ? ` · ${json.verifiedName}` : ""}`,
        });
      } else {
        setTestResult({ id, ok: false, text: json.error ?? "Meta rechazó las credenciales." });
      }
    } catch {
      setTestResult({ id, ok: false, text: "Error de red al probar la conexión." });
    } finally {
      setTesting(null);
    }
  };

  const deactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/whatsapp-config?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (res.ok) void load();
    } catch {
      /* el próximo load refleja el estado real */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando configuración…
      </div>
    );
  }

  const activos = configs.filter((c) => c.isActive).length;
  const estado = activos > 0
    ? `${activos} número${activos > 1 ? "s" : ""} conectado${activos > 1 ? "s" : ""}`
    : configs.length > 0 ? "Números cargados pero inactivos" : "Sin números conectados";

  /* El ⋯ no devuelve el foco a su botón: se enfoca antes de abrir la ventana para que vuelva ahí al cerrar. */
  const editarDesdeMenu = (c: WaConfigView) => () => {
    document.querySelector<HTMLElement>(`[data-menu-numero="${CSS.escape(c.id)}"] button`)?.focus({ preventScroll: true });
    setEditing(c);
    setGuideToken(c.webhookVerifyToken);
  };

  return (
    <div className="space-y-3">
      {/* Una fila: título · ⓘ · estado · Conectar número. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Bot WhatsApp</SectionTitle>
          <InfoTip
            title="Bot WhatsApp"
            what="Los números de WhatsApp Business del negocio. El bot contesta y toma pedidos por cada número activo, 24/7."
            affects="Lo que te escriben llega a la bandeja de WhatsApp, donde también puedes responder tú."
            example="Pega las credenciales de Meta (Phone Number ID y token) y toca «Probar»."
          />
        </div>
        <span className={cn("flex items-center gap-1.5 text-sm font-semibold", activos > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--text-secondary)]")}>
          <MessageCircle className="h-4 w-4" aria-hidden />
          {estado}
        </span>
        <button type="button" onClick={() => setEditing("new")} className={button({ variant: "primary", className: "ml-auto rounded-xl" })}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">{configs.length > 0 ? "Conectar otro número" : "Conectar mi número"}</span>
        </button>
      </div>

      {/* Sin números, la guía va a la vista: es lo primero que hay que hacer. Con números, vive en la ventana de conectar. */}
      {configs.length === 0 && <WaConnectionGuide verifyToken={guideToken} />}

      {configs.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {configs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-[var(--text-primary)]">
                  {c.label || c.businessName || "Mi número"}
                  <span className={cn("font-semibold", c.isActive ? "text-[var(--data-success-ink)]" : "text-[var(--text-secondary)]")}>
                    · {c.isActive ? "Activo" : "Inactivo"}
                  </span>
                </p>
                <p className="truncate text-sm text-[var(--text-secondary)]">
                  Phone Number ID {c.phoneNumberId} · token {c.whatsappTokenMasked ?? "—"}
                  {c.wabaId ? ` · WABA ${c.wabaId}` : ""}
                </p>
                {testResult?.id === c.id && (
                  <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", testResult.ok ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />}
                    {testResult.text}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void testConnection(c.id)} aria-disabled={testing === c.id} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
                  {testing === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
                  Probar
                </button>
                <div data-menu-numero={c.id} className="contents">
                  <ActionMenu
                    label={`Más de ${c.label || c.phoneNumberId}`}
                    icon={MoreHorizontal}
                    soloIcono
                    size="md"
                    className="w-12 shrink-0"
                    title="Editar o desactivar"
                    actions={[
                      { id: "editar", label: "Editar", icon: Pencil, onSelect: editarDesdeMenu(c) },
                      ...(c.isActive
                        ? [{ id: "desactivar", label: "Desactivar", hint: "El número deja de recibir y responder", icon: PowerOff, tone: "danger" as const, onSelect: () => void deactivate(c.id) }]
                        : []),
                    ]}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdminModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        variant="wide"
        title={editing === "new" || editing === null ? "Conectar número" : `Editar ${editing.label || editing.phoneNumberId}`}
      >
        {configs.length > 0 && (
          <div className={cn(MODAL_GUTTER, "pt-5")}>
            <WaConnectionGuide verifyToken={guideToken || configs[0]?.webhookVerifyToken || ""} />
          </div>
        )}
        {editing !== null && (
          <WaNumberForm
            key={editing === "new" ? "nuevo" : editing.id}
            initial={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
            onCancel={() => setEditing(null)}
            onVerifyTokenChange={setGuideToken}
          />
        )}
      </AdminModal>
    </div>
  );
}
