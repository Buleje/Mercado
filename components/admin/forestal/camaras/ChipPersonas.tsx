/**
 * «2 personas · 12 fotos» del detector de una cámara en vivo (nada si está
 * apagado). Lo usan el cuadro del mosaico y el visor de una cámara sola.
 */

import { Users } from "@buleje/design-system/icons";
import { MOTOR_DETECTOR_LABEL } from "@/lib/camaras/vigia";
import { CHIP_BASE, CHIP_TONO, ICONO_TONO } from "./camaras-ui";
import type { DetectorPersonas } from "./use-detector-personas";

export default function ChipPersonas({ d }: { d: DetectorPersonas }) {
  if (d.estado === "apagado") return null;
  if (d.estado === "error")
    return (
      <span className={`${CHIP_BASE} ${CHIP_TONO.alerta}`} title={d.error ?? undefined}>
        <Users className={`h-3.5 w-3.5 ${ICONO_TONO.alerta}`} aria-hidden /> No detecta
      </span>
    );
  if (d.estado === "cargando")
    return (
      <span className={`${CHIP_BASE} ${CHIP_TONO.neutro}`}>
        <Users className={`h-3.5 w-3.5 ${ICONO_TONO.neutro}`} aria-hidden /> Preparando…
      </span>
    );
  const hay = d.personasAhora > 0;
  return (
    <span
      className={`${CHIP_BASE} ${hay ? CHIP_TONO.aviso : CHIP_TONO.neutro}`}
      title={`Personas en cuadro ahora (sin las de las zonas ignoradas) · fotos guardadas en la carpeta «Personas»${d.motor ? ` · Mira con: ${MOTOR_DETECTOR_LABEL[d.motor]}` : ""}`}
      aria-live="polite"
      data-chip-personas={d.personasAhora}
    >
      <Users className={`h-3.5 w-3.5 ${hay ? ICONO_TONO.aviso : ICONO_TONO.neutro}`} aria-hidden />
      {hay ? `${d.personasAhora} ${d.personasAhora === 1 ? "persona" : "personas"}` : "Nadie"}
      {d.ignoradasAhora > 0 && (
        <span className="text-[var(--text-tertiary)]">
          · {d.ignoradasAhora} {d.ignoradasAhora === 1 ? "ignorada" : "ignoradas"}
        </span>
      )}
      {d.fotosTomadas > 0 && (
        <span className="text-[var(--text-tertiary)]">
          · {d.fotosTomadas} {d.fotosTomadas === 1 ? "foto" : "fotos"}
        </span>
      )}
    </span>
  );
}
