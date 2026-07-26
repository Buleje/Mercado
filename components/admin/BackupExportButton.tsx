"use client";

import { useState, useEffect } from "react";
import { Download, CheckCircle, AlertTriangle, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "buleje-last-backup-date";
const ALERT_DAYS = 7;

type Status = "idle" | "downloading" | "done" | "error";

function daysSince(isoDate: string): number {
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function BackupExportButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Leer fecha del último backup desde localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setLastBackup(stored);
  }, []);

  const diasSinBackup = lastBackup ? daysSince(lastBackup) : null;
  const showAlert = diasSinBackup !== null && diasSinBackup >= ALERT_DAYS;

  const handleDownload = async () => {
    setStatus("downloading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/backup/export");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
      }

      // Obtener nombre del archivo del header Content-Disposition
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `backup-${new Date().toISOString().slice(0, 10)}.json`;

      // Crear blob y disparar descarga
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Guardar fecha del backup
      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, now);
      setLastBackup(now);
      setStatus("done");

      // Volver a idle después de 3 segundos
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Alerta si hace 7+ días sin backup */}
      {showAlert && status === "idle" && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20">
          <AlertTriangle className="w-4 h-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
            Hace{" "}
            <span className="font-bold">{diasSinBackup} {diasSinBackup === 1 ? "día" : "días"}</span>{" "}
            que no haces backup. Se recomienda hacerlo al menos cada semana.
          </p>
        </div>
      )}

      {/* Botón principal */}
      <button
        onClick={handleDownload}
        disabled={status === "downloading"}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
          status === "done"
            ? "bg-primary/10 text-white"
            : status === "error"
              ? "bg-[var(--data-error-500)] text-white"
              : status === "downloading"
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-primary hover:bg-primary-dark text-white dark:bg-primary dark:hover:bg-[#1f4d38]"
        )}
      >
        {status === "downloading" && (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
        )}
        {status === "done" && <CheckCircle className="w-4 h-4 shrink-0" />}
        {status === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
        {(status === "idle" || status === "downloading") && status !== "downloading" && (
          <Download className="w-4 h-4 shrink-0" />
        )}
        {status === "idle" && "Descargar Backup"}
        {status === "downloading" && "Generando backup..."}
        {status === "done" && "Backup descargado"}
        {status === "error" && "Error al descargar"}
      </button>

      {/* Error detalle */}
      {status === "error" && errorMsg && (
        <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{errorMsg}</p>
      )}

      {/* Fecha último backup */}
      {lastBackup && status !== "error" && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <Clock className="w-3 h-3 shrink-0" />
          <span>
            Último backup:{" "}
            {new Date(lastBackup).toLocaleDateString("es-PE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {diasSinBackup !== null && diasSinBackup === 0 && " (hoy)"}
            {diasSinBackup !== null && diasSinBackup === 1 && " (ayer)"}
            {diasSinBackup !== null && diasSinBackup >= 2 && ` (hace ${diasSinBackup} días)`}
          </span>
        </div>
      )}

      {!lastBackup && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Nunca se ha descargado un backup en este dispositivo.
        </p>
      )}
    </div>
  );
}
