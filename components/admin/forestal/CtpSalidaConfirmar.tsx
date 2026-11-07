"use client";

/**
 * Lo que el dueño confirma de UNA guía antes de registrarla (ADR-446,
 * decisiones 5 y 8): que sale con m³ sin corrida de origen, o que sale de
 * corridas marcadas «usado». Nada viene marcado: sin su clic la guía no se
 * registra (el servidor la devuelve bloqueada aunque el botón se forzara).
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { confirmacionesDe, corridasUsadasLegibles, cubre, type Confirmacion, type ConfirmoDeGuia, type PropuestaDeGuia } from "@/lib/forestal/anexo-a-despacho";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";

const totalUsado = (p: PropuestaDeGuia) => p.usadasComoOrigen.reduce((s, u) => s + u.m3, 0);

function textoDe(c: Confirmacion, p: PropuestaDeGuia): { texto: string; what: string; affects: string } {
  if (c === "sin_origen") {
    return {
      texto: `Regístrala con ${fmtM3(p.sinOrigenM3)} m³ sin corrida de origen`,
      what: "El libro no tiene producción de esa especie que alcance para esta guía. Lo ideal es anotarla antes («Anotar la producción» arriba); si no la hay, esa parte entra como salida sin origen.",
      affects: "El libro la acepta, pero esos m³ no dicen de qué guía de ingreso salieron: el certificado de trazabilidad no se emite hasta completarlos.",
    };
  }
  return {
    texto: `Salió de ${corridasUsadasLegibles(p.usadasComoOrigen)} (${fmtM3(totalUsado(p))} m³), marcada «usado»`,
    what: "Esa producción estaba marcada como «usado»: ya gastada en otra cosa. Si esta guía es la que se la llevó, confírmalo; si no, elige otro origen en su grupo.",
    affects: "Al registrarla, la línea de Despacho queda con esa corrida como origen de esos m³.",
  };
}

export default function CtpSalidaConfirmar({
  p,
  confirmo,
  bloqueado,
  onAlternar,
}: {
  p: PropuestaDeGuia;
  /** Lo que el dueño ya vio y confirmó de esta guía (se suelta solo si cambia). */
  confirmo: ConfirmoDeGuia | undefined;
  bloqueado: boolean;
  onAlternar: (c: Confirmacion) => void;
}) {
  const pide = confirmacionesDe(p);
  if (pide.length === 0) return null;
  return (
    <fieldset
      disabled={bloqueado}
      className="space-y-1.5 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-2.5 py-2"
    >
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--data-warning-ink)]">
        <AlertTriangle aria-hidden className="h-4 w-4" /> Antes de registrarla, confirma
      </legend>
      {pide.map((c) => {
        const { texto, what, affects } = textoDe(c, p);
        const id = `confirmo-${p.anexoId}-${c}`;
        return (
          <div key={c} className="flex items-start gap-2">
            <Casilla id={id} checked={cubre(p, confirmo, c)} onChange={() => onAlternar(c)} className="mt-0.5" />
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm tabular-nums text-[var(--text-primary)]">
              {texto}
            </label>
            <InfoTip title={c === "sin_origen" ? "Sin corrida de origen" : "Producción marcada «usado»"} what={what} affects={affects} />
          </div>
        );
      })}
    </fieldset>
  );
}
