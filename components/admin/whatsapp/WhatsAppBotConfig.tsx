"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared";
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Plus,
  Pencil,
  PowerOff,
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
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  const anyActive = configs.some((c) => c.isActive);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Estado global */}
      <div
        className={[
          "flex items-center gap-3 rounded-xl border p-4",
          anyActive
            ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5"
            : "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            anyActive
              ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
              : "bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
          ].join(" ")}
        >
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {anyActive
              ? `${configs.filter((c) => c.isActive).length} número${configs.filter((c) => c.isActive).length > 1 ? "s" : ""} conectado${configs.filter((c) => c.isActive).length > 1 ? "s" : ""}`
              : configs.length > 0
                ? "Números configurados pero inactivos"
                : "Sin números conectados"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {configs.length > 0
              ? "El bot responde por cada número activo. Las conversaciones llegan al inbox WhatsApp."
              : "Pegá las credenciales de Meta WhatsApp Business para que el bot tome pedidos 24/7."}
          </p>
        </div>
      </div>

      {/* Guía de conexión paso a paso (webhook URL + verify token con copiar) */}
      <WaConnectionGuide verifyToken={guideToken || configs[0]?.webhookVerifyToken || ""} />

      {/* Números conectados */}
      {configs.map((c) => (
        <div key={c.id} className={ADMIN_TOKENS.cardPadded}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                {c.label || c.businessName || "Mi número"}
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold",
                    c.isActive
                      ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  ].join(" ")}
                >
                  {c.isActive ? "Activo" : "Inactivo"}
                </span>
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Phone Number ID {c.phoneNumberId} · token {c.whatsappTokenMasked ?? "—"}
                {c.wabaId ? ` · WABA ${c.wabaId}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void testConnection(c.id)}
                disabled={testing === c.id}
                className={ADMIN_TOKENS.btnSecondary}
              >
                {testing === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Probar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(c);
                  setGuideToken(c.webhookVerifyToken);
                }}
                className={ADMIN_TOKENS.btnSecondary}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
              {c.isActive && (
                <button
                  type="button"
                  onClick={() => void deactivate(c.id)}
                  className={ADMIN_TOKENS.btnSecondary}
                  title="El número deja de recibir y responder"
                >
                  <PowerOff className="h-4 w-4" />
                  Desactivar
                </button>
              )}
            </div>
          </div>
          {testResult?.id === c.id && (
            <p
              className={[
                "mt-3 flex items-center gap-1.5 text-sm font-medium",
                testResult.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
              ].join(" ")}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {testResult.text}
            </p>
          )}
        </div>
      ))}

      {/* Form crear/editar */}
      {editing ? (
        <WaNumberForm
          initial={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
          onVerifyTokenChange={setGuideToken}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className={ADMIN_TOKENS.btnPrimary}
        >
          <Plus className="h-4 w-4" />
          {configs.length > 0 ? "Conectar otro número" : "Conectar mi número"}
        </button>
      )}
    </div>
  );
}
