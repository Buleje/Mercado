import { useState } from "react";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { AlertTriangle, Download, CheckCircle, Activity } from "@buleje/design-system/icons";
import { SectionCard } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

type ModoLenguaje = "simple" | "technical";
const CLAVE_MODO = "buleje-vocabulary-mode";

const MODOS: { id: ModoLenguaje; titulo: string; texto: string; ejemplo: string }[] = [
  { id: "simple", titulo: "Sencillo", texto: "Palabras simples y claras. Ideal para dueños de bodega.", ejemplo: "«Ganancia» en vez de «Margen bruto»" },
  { id: "technical", titulo: "Profesional", texto: "Terminología técnica. Ideal para contadores.", ejemplo: "«Margen bruto», «FEFO», «SKU», «ROI»" },
];

function leerModo(): ModoLenguaje {
  try { return localStorage.getItem(CLAVE_MODO) === "technical" ? "technical" : "simple"; } catch { return "simple"; }
}

/**
 * Sistema › Preferencias (11-10). Arreglos: el modo de lenguaje no marcaba el
 * elegido hasta recargar (leía localStorage al dibujar, sin estado); el botón
 * del tutorial en oscuro era texto claro sobre blanco (`dark:bg-white` +
 * `--text-primary`, invisible) y el de respaldo usaba tintes sueltos.
 */
export function SeccionSistema({ aj, onResetTutorial, onNavigateTab }: { aj: AjustesEstado; onResetTutorial?: () => void; onNavigateTab?: (tab: string) => void }) {
  const { lastBackupAt, setLastBackupAt } = aj;
  const [modo, setModo] = useState<ModoLenguaje>(leerModo);
  const elegir = (m: ModoLenguaje) => {
    try { localStorage.setItem(CLAVE_MODO, m); } catch { /* modo privado: se usa sólo en esta pestaña */ }
    setModo(m);
    window.dispatchEvent(new Event("vocabulary-change"));
  };

  const ls = typeof window !== "undefined" ? (() => { try { return localStorage.getItem("buleje-last-backup"); } catch { return null; } })() : null;
  const ultimo = lastBackupAt ? new Date(lastBackupAt) : ls ? new Date(ls) : null;
  const dias = ultimo ? Math.floor((Date.now() - ultimo.getTime()) / 86400000) : null;
  const toca = dias === null || dias > 7;

  const respaldar = () => {
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const link = document.createElement("a");
    link.href = "/api/backup"; link.download = `bodega-backup-${ts}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    try { localStorage.setItem("buleje-last-backup", new Date().toISOString()); } catch { /* sin almacenamiento: queda en memoria */ }
    setLastBackupAt(new Date().toISOString());
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Modo de lenguaje" desc="Elige cómo se muestran los términos en el panel">
        <div role="group" aria-label="Modo de lenguaje" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={modo === m.id}
              onClick={() => elegir(m.id)}
              className={cn(
                "p-3 rounded-xl border text-left transition-colors",
                modo === m.id ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-[var(--text-tertiary)]",
              )}
            >
              <span className="block font-bold text-sm text-[var(--text-primary)]">{m.titulo}</span>
              <span className="block text-sm text-[var(--text-secondary)] mt-0.5">{m.texto}</span>
              <span className="block text-sm text-[var(--text-tertiary)] mt-1">Ej.: {m.ejemplo}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <SectionCard title="Tutorial de bienvenida" desc="Vuelve a ver el recorrido guiado del panel cuando quieras.">
          <button
            type="button"
            onClick={() => { onResetTutorial?.(); onNavigateTab?.("asistente-ia"); }}
            className={button({ variant: "primary", fullWidth: true, className: "rounded-xl" })}
          >
            <Activity className="h-4 w-4" aria-hidden /> Repetir el tutorial
          </button>
        </SectionCard>

        <SectionCard
          title="Respaldo de datos"
          desc="Descarga una copia de tus datos en un archivo. Conviene una vez por semana."
        >
          <p className={cn("flex items-center gap-2 text-sm font-medium", toca ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]")}>
            {toca ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" aria-hidden />}
            {ultimo ? `Último respaldo: hace ${dias} día${dias !== 1 ? "s" : ""}` : "No hay respaldos recientes"}
          </p>
          <button type="button" onClick={respaldar} className={button({ variant: "secondary", fullWidth: true, className: "rounded-xl" })}>
            <Download className="h-4 w-4" aria-hidden /> Generar respaldo
          </button>
        </SectionCard>
      </div>
    </div>
  );
}
