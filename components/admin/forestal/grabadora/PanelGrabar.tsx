"use client";

/**
 * Los controles de la grabadora: Grabar → Pausar/Reanudar → Detener →
 * escuchar → Guardar con nombre o Descartar. Nada sube al Archivo hasta
 * «Guardar».
 */
import { useState } from "react";
import { Loader2, Mic, Pause, Save, Square, Trash2 } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatoDuracion, nombrePorDefecto } from "@/lib/grabadora/formato";
import type { Grabadora } from "@/hooks/use-grabadora";
import { CAMPO, ReproductorAudio, TEXTO_ERROR, TEXTO_META } from "./compartido";

const ROTULO: Record<Grabadora["estado"], string> = {
  inactivo: "Lista para grabar",
  pidiendo: "Abriendo el micrófono…",
  grabando: "Grabando",
  pausado: "En pausa",
  detenido: "Escúchala y guárdala",
};

export function PanelGrabar({
  g,
  existentes,
  contexto,
  carpeta,
  onGuardar,
}: {
  g: Grabadora;
  /** Nombres ya usados, para que el nombre por defecto no se repita. */
  existentes: readonly string[];
  contexto?: string;
  carpeta: string;
  onGuardar: (nombre: string, nota: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  const vivo = g.estado === "grabando" || g.estado === "pausado";

  function detener() {
    setNombre(nombrePorDefecto(new Date(), existentes));
    setNota(contexto?.trim() ?? "");
    setErrorGuardar(null);
    g.detener();
  }

  function descartar() {
    setConfirmarDescarte(false);
    setErrorGuardar(null);
    g.descartar();
  }

  async function guardar() {
    if (!g.audio || guardando) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await onGuardar(nombre.trim() || nombrePorDefecto(new Date(), existentes), nota);
      g.listo();
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  if (!g.disponible) {
    return (
      <p className={TEXTO_ERROR} role="alert">
        Este navegador no puede grabar audio. Abre el panel en Chrome o en el navegador de tu celular.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" data-grabadora-estado={g.estado}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]" aria-live="polite">
          {g.estado === "grabando" ? (
            <span className="h-3 w-3 rounded-full bg-[var(--data-error-600)] motion-safe:animate-pulse" aria-hidden />
          ) : g.estado === "pidiendo" ? (
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Mic className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          )}
          {ROTULO[g.estado]}
          <InfoTip
            title="Grabadora de voz"
            what="Graba notas de voz del cubicado. Puedes pausar y seguir; nada se guarda hasta que toques Guardar."
            affects={`Queda en el Archivo, carpeta ${carpeta.split("/").join(" › ")}: la escuchas desde cualquier equipo y la mandas por WhatsApp. Si cierras la página sin guardar, el navegador te pregunta.`}
            example="«Lote 5: la troza 12 llegó rajada, descontar 0,3 m³»."
          />
        </p>
        <span
          className="text-2xl font-bold tabular-nums text-[var(--text-primary)]"
          aria-label={`Tiempo grabado ${formatoDuracion(g.audio?.ms ?? g.ms)}`}
          data-grabadora-tiempo
        >
          {formatoDuracion(g.audio?.ms ?? g.ms)}
        </span>
      </div>

      {vivo && (
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="meter" aria-label="Nivel del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.nivel * 100)}>
          <div
            className="h-full origin-left rounded-full bg-[var(--accent)] transition-transform duration-[var(--dur-micro)]"
            style={{ transform: `scaleX(${g.estado === "grabando" ? Math.max(0.02, g.nivel) : 0})` }}
          />
        </div>
      )}

      {g.estado === "detenido" && g.audio && (
        <div className="space-y-3">
          <ReproductorAudio src={g.audio.url} etiqueta="Escuchar lo grabado" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={TEXTO_META}>Nombre</span>
              <input
                className={CAMPO}
                value={nombre}
                maxLength={120}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void guardar();
                }}
                data-grabadora-nombre
              />
            </label>
            <label className="block space-y-1">
              <span className={TEXTO_META}>Nota (opcional)</span>
              <input
                className={CAMPO}
                value={nota}
                maxLength={500}
                placeholder="Lote, troza, a quién va…"
                onChange={(e) => setNota(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {(g.error || errorGuardar) && (
        <p className={TEXTO_ERROR} role="alert">
          {errorGuardar ?? g.error}
        </p>
      )}

      {confirmarDescarte ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-primary)]">¿Descartar lo grabado? No se puede recuperar.</span>
          <Button variant="danger" size="lg" onClick={descartar}>
            Sí, descartar
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setConfirmarDescarte(false)}>
            No
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {(g.estado === "inactivo" || g.estado === "pidiendo") && (
            <Button variant="danger" onClick={() => void g.empezar()} disabled={g.estado === "pidiendo"} data-grabadora="grabar">
              <Mic className="h-5 w-5" aria-hidden /> Grabar
            </Button>
          )}
          {g.estado === "grabando" && (
            <Button variant="secondary" onClick={g.pausar} data-grabadora="pausar">
              <Pause className="h-5 w-5" aria-hidden /> Pausar
            </Button>
          )}
          {g.estado === "pausado" && (
            <Button variant="danger" onClick={g.reanudar} data-grabadora="reanudar">
              <Mic className="h-5 w-5" aria-hidden /> Reanudar
            </Button>
          )}
          {vivo && (
            <Button variant="primary" onClick={detener} data-grabadora="detener">
              <Square className="h-5 w-5" aria-hidden /> Detener
            </Button>
          )}
          {g.estado === "detenido" && (
            <Button variant="primary" onClick={() => void guardar()} disabled={guardando || !g.audio} data-grabadora="guardar">
              {guardando ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> : <Save className="h-5 w-5" aria-hidden />}
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          )}
          {(vivo || g.estado === "detenido") && (
            <Button variant="ghost" onClick={() => setConfirmarDescarte(true)} disabled={guardando} data-grabadora="descartar">
              <Trash2 className="h-5 w-5" aria-hidden /> Descartar
            </Button>
          )}
        </div>
      )}

    </div>
  );
}
