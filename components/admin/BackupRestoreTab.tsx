"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useState, useEffect, useCallback } from "react";
import { Shield, Download, Upload, Clock, CheckCircle, AlertTriangle, HardDrive, Database, RefreshCw, Trash2, Play } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import type { BackupEntry } from "@/app/api/backups/route";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completado:    { icon: CheckCircle,  color: "text-[var(--data-success-500)]", label: "Completado" },
  "en-progreso": { icon: RefreshCw,    color: "text-[var(--data-success-500)] animate-spin", label: "En progreso" },
  fallido:       { icon: AlertTriangle,color: "text-[var(--data-error-500)]",     label: "Fallido" },
};

const SCHEDULE = { Diario: "03:00 AM", Semanal: "Domingos 03:00 AM", Mensual: "1ro del mes 02:00 AM" };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function BackupRestoreTab() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"backups" | "config">("backups");
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backups");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBackups(data.backups ?? []);
      setTotalSizeBytes(data.totalSizeBytes ?? 0);
      setIsDemo(!!data.demo);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      const data = await res.json();
      if (data.downloadUrl) {
        // Disparar descarga real del backup completo
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = `bodega-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      }
      // Refrescar historial
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    setBackups(prev => prev.filter(b => b.id !== id));
  };

  const lastSuccessful = backups.find(b => b.status === "completado");
  const failedCount    = backups.filter(b => b.status === "fallido").length;
  const completedCount = backups.filter(b => b.status === "completado").length;

  // Advertencia si el último backup es hace >2 días
  const lastBackupAge = lastSuccessful
    ? Math.ceil((Date.now() - new Date(lastSuccessful.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const showWarning = lastBackupAge === null || lastBackupAge >= 2;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Backup & Restaurar
            {isDemo && <span className="text-xs font-normal text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Copias de seguridad y puntos de restauración</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["backups", "config"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {v === "backups" ? "Historial" : "Configuración"}
            </button>
          ))}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface text-[var(--text-tertiary)]">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Advertencia */}
      {!loading && showWarning && (
        <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
              {lastBackupAge === null ? "Sin backups registrados" : `Último backup hace ${lastBackupAge} días`}
            </p>
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">
              Se recomienda hacer backup diario. Crea uno manualmente ahora para proteger tus datos.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Backups totales",   value: backups.length,              color: "text-[var(--data-success-500)]",    icon: Database },
          { label: "Almacenamiento",    value: fmtBytes(totalSizeBytes),    color: "text-[var(--text-secondary)]",  icon: HardDrive },
          { label: "Último exitoso",    value: lastSuccessful ? fmtDate(lastSuccessful.createdAt) : "—", color: "text-[var(--data-success-500)]", icon: CheckCircle },
          { label: "Fallidos",          value: failedCount,                 color: failedCount > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]", icon: AlertTriangle },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={cn("h-3.5 w-3.5 shrink-0", k.color)} />
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            </div>
            {loading
              ? <div className="h-6 w-20 bg-gray-100 dark:bg-surface rounded animate-pulse" />
              : <p className={cn("text-base font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {view === "backups" ? (
        <>
          {/* Botón crear backup */}
          <div className="flex justify-end">
            <button onClick={handleCreateBackup} disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-60">
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {creating ? "Creando backup…" : "Crear backup ahora"}
            </button>
          </div>

          {/* Historial */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border animate-pulse" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)] bg-white dark:bg-card rounded-xl border border-dashed border-[var(--rule-base)] dark:border-card-border">
              <Database className="h-12 w-12 mb-3 text-[var(--text-tertiary)]" />
              <p className="font-bold text-[var(--text-secondary)] dark:text-muted">Sin backups registrados</p>
              <p className="text-sm mt-1">Crea el primer backup manual</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] px-1">
                <span>{completedCount} completados · {failedCount} fallidos</span>
                <span>{backups.length} total</span>
              </div>
              {backups.map(b => {
                const S = STATUS_CONFIG[b.status];
                return (
                  <div key={b.id} className={cn("bg-white dark:bg-card rounded-xl border p-4", b.status === "fallido" ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30" : "border-[var(--rule-base)] dark:border-card-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                        <S.icon className={cn("h-5 w-5 shrink-0", S.color)} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{b.name}</h4>
                            <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
                              b.type === "auto" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]")}>
                              {b.type === "auto" ? "Automático" : "Manual"}
                            </span>
                            <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted">{S.label}</span>
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 flex-wrap">
                            <span><Clock className="h-2.5 w-2.5 inline mr-0.5" />{fmtDate(b.createdAt)}</span>
                            <span><HardDrive className="h-2.5 w-2.5 inline mr-0.5" />{b.size}</span>
                            <span>Módulos: {b.modules.join(", ")}</span>
                            <span>Retención: {b.retention}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {b.status === "completado" && (
                          <>
                            <a href="/api/backup" download={`bodega-backup-${b.createdAt.slice(0, 10)}.json`}
                              className="p-1.5 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--data-success-500)]" title="Descargar">
                              <Download className="h-4 w-4" />
                            </a>
                            <AdminTooltip content="Restaurar desde este backup — próximamente">
                              <button aria-label="Restaurar" className="p-1.5 rounded-lg hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/20 text-[var(--data-warning-500)]">
                                <Upload className="h-4 w-4" />
                              </button>
                            </AdminTooltip>
                          </>
                        )}
                        <button onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]" title="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 sm:p-6 space-y-5">
          <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Configuración de backup automático</CardTitle>

          <div className="flex items-center justify-between py-3 border-b border-[var(--rule-soft)] dark:border-card-border">
            <div>
              <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">Backup automático</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Activar copias automáticas programadas</p>
            </div>
            <button onClick={() => setAutoEnabled(!autoEnabled)}
              className={cn("w-12 h-6 rounded-full relative transition-colors", autoEnabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", autoEnabled ? "translate-x-6" : "translate-x-0.5")} />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Programación</p>
            {Object.entries(SCHEDULE).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 dark:bg-surface">
                <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">{k}</span>
                <span className="text-xs text-[var(--text-secondary)] dark:text-muted font-mono">{v}</span>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Retención de backups diarios (días)</label>
            <input type="number" value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} min={7} max={365}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">Backups más antiguos se eliminarán automáticamente</p>
          </div>

          <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
            <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-1">Almacenamiento del backup</p>
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Los backups se descargan como archivos JSON encriptados. Para almacenamiento en nube, configura un webhook en Configuración → Integraciones.</p>
          </div>
        </div>
      )}
    </div>
  );
}
