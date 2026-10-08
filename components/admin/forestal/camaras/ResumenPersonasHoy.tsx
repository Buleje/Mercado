"use client";

/**
 * La pastilla «Hoy: 6 personas, 4 con chaleco · aprox.» (ADR-479): personas
 * DISTINTAS del día por la ropa, no fotos. Va en «Personas» (junto al resumen
 * de las fotos) y en «Hoy en el patio» (con enlace a «Personas»).
 *
 * Sin fotos con cajas ese día no dibuja nada: las fotos de antes del 08-10 no
 * guardaban dónde estaba cada persona y no se pueden contar así.
 */

import { UserCheck, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { RespuestaResumenPersonas } from "@/lib/camaras/visitantes";
import { navegarEnElPanel } from "./navegar-panel";
import { CHIP_BASE, CHIP_TONO, ICONO_TONO, diaLegible } from "./camaras-ui";

const VISTA_PERSONAS = "/admin?tab=camaras&vista=personas";

interface Props {
  resumen: RespuestaResumenPersonas | null;
  esHoy: boolean;
  /** Con `true`, la pastilla lleva a «Personas» (sólo tiene sentido para hoy: «Personas» abre en hoy). */
  enlace?: boolean;
}

export default function ResumenPersonasHoy({ resumen: r, esHoy, enlace = false }: Props) {
  if (!r || r.fotosConCajas === 0) return null;
  const cuando = esHoy ? "Hoy" : `El ${diaLegible(r.dia)}`;
  const texto = (
    <>
      <Users className={`h-3.5 w-3.5 ${ICONO_TONO.info}`} aria-hidden />
      <span>
        {cuando}: <b className="tabular-nums">{r.personas}</b> {r.personas === 1 ? "persona" : "personas"}
        {r.conChaleco > 0 && (
          <>
            , <UserCheck className={`inline h-3.5 w-3.5 align-[-2px] ${ICONO_TONO.ok}`} aria-hidden />{" "}
            <b className="tabular-nums">{r.conChaleco}</b> con chaleco
          </>
        )}
        <span className="font-normal text-[var(--text-secondary)]"> · aprox.</span>
      </span>
    </>
  );
  const clase = `${CHIP_BASE} ${CHIP_TONO.info} h-8 px-2 text-sm`;
  return (
    <span className="inline-flex items-center gap-1" data-testid="resumen-personas-hoy">
      {enlace && esHoy ? (
        <a
          href={VISTA_PERSONAS}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            navegarEnElPanel(VISTA_PERSONAS);
          }}
          className={`${clase} transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
          title="Ver las personas del día"
        >
          {texto}
        </a>
      ) : (
        <span className={clase}>{texto}</span>
      )}
      <InfoTip
        title="Personas distintas"
        what="Cuántas personas distintas vio el detector en el día, juntando sus fotos por el color de la ropa (torso y piernas). Con chaleco amarillo o naranja fluorescente cuentan como personal."
        affects="No reconoce caras ni mide a nadie: la cabeza no se mira. Dos personas con ropa parecida pueden contarse como una, y alguien que se saca la casaca, como dos. Alguien del personal con el chaleco tapado (casaca encima, de espaldas) cuenta como visitante. Las muy lejanas (menos de 40 px) no se agrupan."
        example={`«Hoy: 6 personas, 4 con chaleco»: 4 del personal y 2 visitas.${r.sinAgrupar > 0 ? ` Hoy además hubo ${r.sinAgrupar} ${r.sinAgrupar === 1 ? "aparición lejana" : "apariciones lejanas"} sin agrupar.` : ""}`}
      />
    </span>
  );
}
