"use client";

/**
 * «Sonido y avisos» de Cámaras (Brandon 2026-10-15: «configura todo eso bien
 * hecho»): UN lugar para la alarma — con sonido o no, volumen, cuál suena,
 * probarla, si suena también con movimiento, avisos del sistema con la
 * pestaña oculta, silenciar por un rato y vigilar sin pausa.
 *
 * Todo se guarda en este navegador (`useLocalStorage`: lo ven al toque las
 * otras pestañas) y lo lee `sonarAlarma` en cada aviso, así que no hay
 * «guardar». La regla vive en `lib/camaras/sonido-avisos.ts`.
 */
import { useMemo, useState } from "react";
import { BellRing, Play, Volume2, VolumeX } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { horaLima } from "@/lib/camaras/avisos-segundo-plano";
import { logger } from "@/lib/logger";
import {
  CLAVE_ALARMA_CON_SONIDO,
  CLAVE_PREFERENCIAS_SONIDO,
  CLAVE_VIGILAR_SIN_PAUSA,
  NOMBRE_TONO,
  PREFERENCIAS_INICIALES,
  SILENCIOS_MIN,
  TONOS_ALARMA,
  leerPreferenciasDe,
  type PreferenciasSonido,
  type TonoAlarma,
} from "@/lib/camaras/sonido-avisos";
import {
  desbloquearAudio,
  pedirPermisoAvisos,
  permisoAvisos,
  sonarAlarma,
  type PermisoAvisos,
  type ResultadoSonido,
} from "@/lib/camaras/sonido-avisos-audio";
import { cn } from "@/lib/utils";
import { reactivarAvisosCamaras, silenciarAlarmasCamaras } from "./use-avisos-camaras";

const RESULTADO: Partial<Record<ResultadoSonido, string>> = {
  sono: "Sonó. Si no lo oíste, sube el volumen del equipo.",
  bloqueado: "El navegador no lo dejó sonar: tócalo otra vez.",
  apagado: "El volumen está en 0.",
  "sin-audio": "Este navegador no puede sonar.",
};

const SILENCIO_TEXTO: Record<(typeof SILENCIOS_MIN)[number], string> = { 30: "30 min", 60: "1 h", 240: "4 h" };

const ROTULO = "text-sm font-semibold text-[var(--text-primary)]";

/** Las preferencias guardadas, siempre completas (lo roto vuelve a lo de fábrica). */
function usePreferenciasSonido() {
  const [crudas, setCrudas] = useLocalStorage<unknown>(CLAVE_PREFERENCIAS_SONIDO, PREFERENCIAS_INICIALES);
  const prefs = useMemo(() => leerPreferenciasDe(JSON.stringify(crudas)), [crudas]);
  const cambiar = (parcial: Partial<PreferenciasSonido>) => setCrudas({ ...prefs, ...parcial });
  return [prefs, cambiar] as const;
}

interface Props {
  open: boolean;
  onClose: () => void;
  silencioHasta: number;
  silencioMovimientoHasta: number;
}

export default function AjustesSonidoCamaras({ open, onClose, silencioHasta, silencioMovimientoHasta }: Props) {
  const [prefs, cambiar] = usePreferenciasSonido();
  const [conSonido, setConSonido] = useLocalStorage<boolean>(CLAVE_ALARMA_CON_SONIDO, true);
  const [sinPausa, setSinPausa] = useLocalStorage<boolean>(CLAVE_VIGILAR_SIN_PAUSA, false);
  const [permiso, setPermiso] = useState<PermisoAvisos>(() => permisoAvisos());
  const [resultado, setResultado] = useState<string | null>(null);
  const silenciado = silencioHasta > Date.now();
  const movimientoCallado = !silenciado && silencioMovimientoHasta > Date.now();

  /* Es un gesto: despierta el audio aunque estuviera bloqueado. */
  const probar = (tono?: TonoAlarma) => {
    setResultado(null);
    desbloquearAudio()
      .then(() => sonarAlarma({ tipo: "persona", probar: true, tono }))
      .then((r) => setResultado(RESULTADO[r] ?? null))
      .catch((err: unknown) => logger.warn("[camaras] probar sonido falló", { error: String(err) }));
  };

  const elegirTono = (tono: TonoAlarma) => {
    cambiar({ tono });
    probar(tono);
  };

  const alternarSistema = (v: boolean) => {
    if (!v) return cambiar({ sistema: false });
    pedirPermisoAvisos()
      .then((p) => {
        setPermiso(p);
        cambiar({ sistema: p === "granted" });
      })
      .catch((err: unknown) => logger.warn("[camaras] permiso de avisos falló", { error: String(err) }));
  };

  const volumen = Math.round(prefs.volumen * 100);
  const IconoVolumen = volumen === 0 ? VolumeX : Volume2;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Sonido y avisos"
      icon={BellRing}
      size="sm"
      ayuda={
        <InfoTip
          title="Sonido y avisos de Cámaras"
          what="Cómo te avisa el panel cuando el mosaico ve a alguien: la alarma suena en una sola pestaña aunque tengas varias abiertas."
          affects="Se guarda en este navegador. Sin el mosaico abierto (o con las cámaras en pausa) no hay alarma."
          example="Con «Avisos del sistema», si estás en otra pestaña te sale el aviso en la esquina de la pantalla."
        />
      }
      footer={
        <ModalFooter nota={<span aria-live="polite">{resultado}</span>}>
          <button type="button" onClick={() => probar()} className={button({ variant: "secondary" })}>
            <Play className="h-4 w-4" aria-hidden />
            Probar sonido
          </button>
          <button type="button" onClick={onClose} className={button()}>
            Listo
          </button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Interruptor
            label="Alarma con sonido"
            desc="Cuando aparece una persona"
            enabled={conSonido}
            onChange={setConSonido}
          />
          <Interruptor
            label="Sonar también con movimiento"
            desc="Además de las personas"
            enabled={prefs.conMovimiento}
            onChange={(v) => cambiar({ conMovimiento: v })}
          />
        </div>

        <div>
          <label htmlFor="camaras-volumen" className={cn(ROTULO, "flex items-center gap-2")}>
            <IconoVolumen className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
            Volumen
            <span className="ml-auto tabular-nums text-[var(--text-secondary)]">{volumen} %</span>
          </label>
          <input
            id="camaras-volumen"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumen}
            onChange={(e) => cambiar({ volumen: Number(e.target.value) / 100 })}
            onPointerUp={() => probar()}
            className="h-12 w-full cursor-pointer accent-[var(--accent)]"
          />
        </div>

        <fieldset>
          <legend className={ROTULO}>Sonido de la alarma</legend>
          <div role="radiogroup" aria-label="Sonido de la alarma" className="mt-2 grid grid-cols-3 gap-2">
            {TONOS_ALARMA.map((t) => {
              const activo = prefs.tono === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => elegirTono(t)}
                  className={cn(
                    "h-12 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    activo
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {NOMBRE_TONO[t]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Interruptor
            label="Avisos del sistema"
            desc={
              /* Texto plano: la descripción va dentro del <label> del interruptor (sin botones adentro). */
              permiso === "denied" ? (
                <span className="text-[var(--data-warning-ink)]">
                  Bloqueados: actívalos en el candado de la dirección
                </span>
              ) : permiso === "no-soportado" ? (
                "Este navegador no los tiene: en el celular avisa la app"
              ) : (
                "Con la pestaña en segundo plano"
              )
            }
            enabled={prefs.sistema && permiso === "granted"}
            disabled={permiso === "no-soportado"}
            onChange={alternarSistema}
          />
          <Interruptor
            label="Vigilar sin pausa"
            desc="El mosaico no se pausa a los 5 min sin tocarlo (gasta más datos)"
            enabled={sinPausa}
            onChange={setSinPausa}
          />
        </div>

        <div>
          <p className={ROTULO}>
            {silenciado
              ? `Todas las alarmas en silencio hasta las ${horaLima(silencioHasta)}`
              : movimientoCallado
                ? `Movimiento callado hasta las ${horaLima(silencioMovimientoHasta)}`
                : "Silenciar todas las alarmas"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(silenciado || movimientoCallado) && (
              <button type="button" onClick={reactivarAvisosCamaras} className={button({ variant: "secondary" })}>
                <BellRing className="h-4 w-4" aria-hidden />
                Reactivar ahora
              </button>
            )}
            {!silenciado &&
              SILENCIOS_MIN.map((min) => (
                <button
                  key={min}
                  type="button"
                  aria-label={`Silenciar todas las alarmas ${SILENCIO_TEXTO[min]}`}
                  onClick={() => silenciarAlarmasCamaras(min * 60_000)}
                  className={button({ variant: "secondary", className: "flex-1" })}
                >
                  {SILENCIO_TEXTO[min]}
                </button>
              ))}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
