import { cn } from "@/lib/utils";
import { AlertTriangle, Download, CheckCircle, Activity } from "@buleje/design-system/icons";
import { SectionCard } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

export function SeccionSistema({ aj, onResetTutorial, onNavigateTab }: { aj: AjustesEstado; onResetTutorial?: () => void; onNavigateTab?: (tab: string) => void }) {
  const { lastBackupAt, setLastBackupAt } = aj;
  return (
    <div className="space-y-6">
      <SectionCard title="Modo de lenguaje" desc="Elige cómo se muestran los términos en el panel">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem("buleje-vocabulary-mode", "simple"); } catch {}
              window.dispatchEvent(new Event("vocabulary-change"));
            }}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              (typeof window !== "undefined" && localStorage.getItem("buleje-vocabulary-mode") !== "technical")
                ? "border-primary bg-primary/5"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300"
            )}
          >
            <p className="font-bold text-sm">Sencillo</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Palabras simples y claras. Ideal para dueños de bodega.</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 italic">Ejemplo: &ldquo;Ganancia&rdquo; en vez de &ldquo;Margen bruto&rdquo;</p>
          </button>
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem("buleje-vocabulary-mode", "technical"); } catch {}
              window.dispatchEvent(new Event("vocabulary-change"));
            }}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              (typeof window !== "undefined" && localStorage.getItem("buleje-vocabulary-mode") === "technical")
                ? "border-primary bg-primary/5"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300"
            )}
          >
            <p className="font-bold text-sm">Profesional</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Terminología técnica. Ideal para contadores y profesionales.</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 italic">Ejemplo: &ldquo;Margen bruto&rdquo;, &ldquo;FEFO&rdquo;, &ldquo;SKU&rdquo;, &ldquo;ROI&rdquo;</p>
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Tutorial de bienvenida"
        desc="Vuelve a ver el recorrido guiado del panel cuando quieras."
      >
        <button
          onClick={() => {
            onResetTutorial?.();
            onNavigateTab?.("asistente-ia");
          }}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          <Activity className="h-4 w-4" />
          Repetir tutorial de bienvenida
        </button>
      </SectionCard>

      <SectionCard title="Respaldo de datos" desc="Descarga una copia de tus datos">
        {/* Last backup indicator */}
        {(() => {
          const lastDate = lastBackupAt ? new Date(lastBackupAt) : (typeof window !== "undefined" ? (() => { const ls = localStorage.getItem("buleje-last-backup"); return ls ? new Date(ls) : null; })() : null);
          const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
          const needsBackup = !lastDate || (daysSince !== null && daysSince > 7);
          return (
            <div className={cn("p-3 rounded-xl border", needsBackup ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border-[var(--data-warning-500)]" : "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30")}>
              <div className="flex items-center gap-2.5">
                {needsBackup ? <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" /> : <CheckCircle className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />}
                <p className="text-xs font-medium">{lastDate ? `Último respaldo: hace ${daysSince} día${daysSince !== 1 ? "s" : ""}` : "No hay respaldos recientes"}</p>
              </div>
            </div>
          );
        })()}
        <div className="grid sm:max-w-xs">
          <button onClick={async () => {
            const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
            const link = document.createElement("a");
            link.href = "/api/backup"; link.download = `bodega-backup-${ts}.json`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            if (typeof window !== "undefined") localStorage.setItem("buleje-last-backup", new Date().toISOString());
            setLastBackupAt(new Date().toISOString());
          }} className="flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl border-2 border-teal-200 bg-[var(--surface-raised)] hover:bg-teal-50 text-sm font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
            <Download className="h-4 w-4" /> Generar respaldo
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
