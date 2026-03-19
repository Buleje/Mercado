"use client";

import { useState } from "react";
import { Shield, Download, Upload, Clock, CheckCircle, AlertTriangle, HardDrive, Database, RefreshCw, Trash2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Backup = {
  id: string; name: string; type: "manual" | "auto"; size: string; modules: string[];
  createdAt: string; status: "completado" | "en-progreso" | "fallido"; retention: string;
};

const SEED: Backup[] = [];

const SCHEDULE = { daily: "03:00 AM", weekly: "Domingos 03:00 AM", monthly: "1ro del mes 02:00 AM" };

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completado: { icon: CheckCircle, color: "text-emerald-500", label: "Completado" },
  "en-progreso": { icon: RefreshCw, color: "text-blue-500 animate-spin", label: "En progreso" },
  fallido: { icon: AlertTriangle, color: "text-red-500", label: "Fallido" },
};

export default function BackupRestoreTab() {
  const [backups] = useState(SEED);
  const [view, setView] = useState<"backups" | "config">("backups");
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(30);

  const lastSuccessful = backups.find(b => b.status === "completado");
  const totalSize = "1.29 GB";
  const failedCount = backups.filter(b => b.status === "fallido").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Backup & Restaurar</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Copias de seguridad y puntos de restauración</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("backups")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "backups" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Backups</button>
          <button onClick={() => setView("config")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "config" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Configuración</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Backups totales", value: backups.length, color: "text-blue-500", icon: Database },
          { label: "Almacenamiento usado", value: totalSize, color: "text-violet-500", icon: HardDrive },
          { label: "Último exitoso", value: lastSuccessful ? fmtDate(lastSuccessful.createdAt) : "—", color: "text-emerald-500", icon: CheckCircle },
          { label: "Fallidos", value: failedCount, color: failedCount > 0 ? "text-red-500" : "text-gray-400", icon: AlertTriangle },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <div className="flex items-center gap-1.5 mb-1"><k.icon className={cn("h-3.5 w-3.5", k.color)} /><p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p></div>
            <p className={cn("text-lg font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {view === "backups" ? (
        <>
          <div className="flex justify-end">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Play className="h-4 w-4" /> Crear backup manual</button>
          </div>
          <div className="space-y-2">
            {backups.map(b => {
              const S = STATUS_CONFIG[b.status];
              return (
                <div key={b.id} className={cn("bg-white dark:bg-card rounded-xl border p-4", b.status === "fallido" ? "border-red-200 dark:border-red-900/30" : "border-gray-200 dark:border-card-border")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <S.icon className={cn("h-5 w-5 shrink-0", S.color)} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{b.name}</h4>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", b.type === "auto" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400")}>{b.type === "auto" ? "Automático" : "Manual"}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-gray-400 mt-0.5 flex-wrap">
                          <span><Clock className="h-2.5 w-2.5 inline mr-0.5" />{fmtDate(b.createdAt)}</span>
                          <span><HardDrive className="h-2.5 w-2.5 inline mr-0.5" />{b.size}</span>
                          <span>Módulos: {b.modules.join(", ")}</span>
                          <span>Retención: {b.retention}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {b.status === "completado" && <>
                        <button className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-500" title="Descargar"><Download className="h-4 w-4" /></button>
                        <button className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-500" title="Restaurar"><Upload className="h-4 w-4" /></button>
                      </>}
                      <button className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 space-y-5">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground">Configuración de backup automático</h3>
          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-card-border">
            <div><p className="font-bold text-sm text-gray-900 dark:text-foreground">Backup automático</p><p className="text-xs text-gray-500 dark:text-muted">Activar copias automáticas programadas</p></div>
            <button onClick={() => setAutoEnabled(!autoEnabled)} className={cn("w-12 h-6 rounded-full relative transition-colors", autoEnabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", autoEnabled ? "translate-x-6" : "translate-x-0.5")} />
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 dark:text-muted">Programación</p>
            {Object.entries(SCHEDULE).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 dark:bg-surface">
                <span className="text-sm font-semibold text-gray-700 dark:text-foreground capitalize">{k === "daily" ? "Diario" : k === "weekly" ? "Semanal" : "Mensual"}</span>
                <span className="text-xs text-gray-500 dark:text-muted">{v}</span>
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-muted">Retención de backups diarios (días)</label>
            <input type="number" value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
