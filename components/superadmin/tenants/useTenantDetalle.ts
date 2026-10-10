"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { TenantRow } from "@/lib/superadmin-types";
import type { TabDetalle, ActivityRow, NoteRow, SecurityInfo } from "@/components/superadmin/tenants/tenant-detalle-shared";

/** Estado y acciones de la ficha rápida de una tienda: edición, prueba, credenciales, seguridad, actividad y notas. */
export function useTenantDetalle(t: TenantRow, onUpdated?: () => void) {
  const [tab, setTab] = useState<TabDetalle>("resumen");
  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState<string | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);
  const storeInfo = t.stores?.[0];

  // ── Inline edit (C3): nombre + email del dueño ──
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(t.name);
  const [emailInput, setEmailInput] = useState(t.ownerEmail ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);

  // ── Actividad ──
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  // ── Notas ──
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // ── Seguridad ──
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [secBusy, setSecBusy] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "seguridad" || security !== null) return;
    fetch(`/api/superadmin/tenants/${t.slug}/security`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setSecurity(
          d ?? {
            username: null,
            twoFactorEnabled: false,
            lastLoginAt: null,
            lastLoginDetail: null,
          },
        ),
      )
      .catch(() =>
        setSecurity({
          username: null,
          twoFactorEnabled: false,
          lastLoginAt: null,
          lastLoginDetail: null,
        }),
      );
  }, [tab, security, t.slug]);

  const secAction = async (
    action: "force-change" | "reset-2fa" | "logout-all",
    confirmMsg: string,
  ) => {
    if (!window.confirm(confirmMsg)) return;
    const totpCode = window.prompt("Código TOTP (6 dígitos) para confirmar:");
    if (!totpCode || !/^\d{6}$/.test(totpCode)) return;
    setSecBusy(action);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/security`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action, totpCode }),
      });
      if (res.ok) {
        if (action === "reset-2fa") setSecurity((s) => (s ? { ...s, twoFactorEnabled: false } : s));
        if (action === "logout-all")
          window.alert("Listo. Se cerraron las sesiones activas de este negocio.");
      } else {
        const d = await res.json().catch(() => ({}));
        window.alert(
          d.error === "totp_required" || d.error === "invalid_totp"
            ? "Código TOTP inválido."
            : "No se pudo completar la acción.",
        );
      }
    } finally {
      setSecBusy(null);
    }
  };

  useEffect(() => {
    if (tab !== "actividad" || activity !== null) return;
    fetch(`/api/superadmin/activity?tenant=${t.id}&limit=40`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setActivity((d?.logs ?? d?.activity ?? d?.items ?? []) as ActivityRow[]))
      .catch(() => setActivity([]));
  }, [tab, activity, t.id]);

  useEffect(() => {
    if (tab !== "notas" || notes !== null) return;
    fetch(`/api/superadmin/tenants/${t.slug}/notes`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNotes((d?.notes ?? []) as NoteRow[]))
      .catch(() => setNotes([]));
  }, [tab, notes, t.slug]);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: nameInput.trim(), ownerEmail: emailInput.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        onUpdated?.();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExtendTrial = async (days: number) => {
    setTrialBusy(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/extend-trial`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ days }),
      });
      if (res.ok) onUpdated?.();
    } finally {
      setTrialBusy(false);
    }
  };

  const addNote = useCallback(async () => {
    if (!noteInput.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/notes`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: noteInput.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.note) {
        setNotes((prev) => [d.note, ...(prev ?? [])]);
        setNoteInput("");
      }
    } finally {
      setSavingNote(false);
    }
  }, [noteInput, savingNote, t.slug]);

  const handleResetPassword = async () => {
    const totpCode = window.prompt(
      `Código TOTP (6 dígitos) para resetear contraseña de "${t.name}":`,
    );
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      setResetResult("Código TOTP inválido — operación cancelada");
      return;
    }
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${t.slug}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ totpCode }),
      });
      const data = (await res.json()) as {
        tempPassword?: string;
        username?: string;
        error?: string;
      };
      if (res.ok && data.tempPassword) {
        setResetResult(data.tempPassword);
        setResetUsername(data.username ?? null);
      } else setResetResult(res.ok ? null : `Error: ${data.error ?? "No se pudo resetear"}`);
    } catch {
      setResetResult("Error de red.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleCopyInfo = () => {
    void navigator.clipboard.writeText(
      [`Tenant: ${t.name} (${t.slug})`, `Email: ${t.ownerEmail ?? "—"}`, `Plan: ${t.plan}`].join(
        "\n",
      ),
    );
    setCredCopied(true);
    setTimeout(() => setCredCopied(false), 2000);
  };
  const handleCopyTempPassword = () => {
    if (!resetResult || resetResult.startsWith("Error")) return;
    void navigator.clipboard.writeText(resetResult);
    setTempPasswordCopied(true);
    setTimeout(() => setTempPasswordCopied(false), 2000);
  };

  return {
    tab, setTab, storeInfo,
    editing, setEditing, nameInput, setNameInput, emailInput, setEmailInput, savingEdit, handleSaveEdit,
    trialBusy, handleExtendTrial,
    showPass, setShowPass, resetLoading, resetResult, resetUsername, credCopied, tempPasswordCopied,
    handleResetPassword, handleCopyInfo, handleCopyTempPassword,
    security, secBusy, secAction,
    activity,
    notes, noteInput, setNoteInput, savingNote, addNote,
  };
}

export type TenantDetalle = ReturnType<typeof useTenantDetalle>;
