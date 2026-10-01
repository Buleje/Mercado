"use client";

/**
 * Las listas del resumen del día: camiones, chalecos, pila, actividades y qué
 * mandó cada cámara. Cada bloque dice algo aunque esté vacío —«ningún camión
 * con placa leída»— porque un bloque en blanco no se distingue de uno que no
 * cargó.
 */

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { Activity, Camera, Hash, Layers, Truck } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ActividadPatio } from "@/lib/camaras/camaras";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";
import {
  ACTIVIDAD_LABEL,
  BLOQUE,
  CHIP_BASE,
  CHIP_TONO,
  etiquetaAsistencia,
  nombreCorto,
  textoPila,
  type ResumenDelDia,
  type Tono,
} from "./camaras-ui";

function Bloque({
  titulo,
  icono: Icono,
  tip,
  vacio,
  children,
}: {
  titulo: string;
  icono: LucideIcon;
  tip?: ReactNode;
  vacio: string | null;
  children: ReactNode;
}) {
  return (
    <section className={BLOQUE}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icono className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <CardTitle as="h3" className="text-base font-bold">
          {titulo}
        </CardTitle>
        {tip}
      </div>
      {vacio ? <p className="py-2 text-sm text-[var(--text-tertiary)]">{vacio}</p> : children}
    </section>
  );
}

const Pastilla = ({ tono, children }: { tono: Tono; children: ReactNode }) => (
  <span className={`${CHIP_BASE} ${CHIP_TONO[tono]}`}>{children}</span>
);

const FILA =
  "flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--rule-soft)] py-2 first:border-t-0 first:pt-0";
const HORA = "w-12 shrink-0 text-sm tabular-nums text-[var(--text-tertiary)]";

export function CamionesDelDia({ camiones }: { camiones: ResumenDelDia["camiones"] }) {
  return (
    <Bloque
      titulo={`Camiones (${camiones.length})`}
      icono={Truck}
      vacio={camiones.length ? null : "Ningún camión con placa leída ese día."}
      tip={
        <InfoTip
          title="Camiones"
          what="Una fila por placa distinta, con la hora de la primera foto."
          affects="La guía o el flete es lo que la placa coincidió ese día; «propuesta» hasta que alguien la confirme en la foto."
        />
      }
    >
      <ul>
        {camiones.map((c) => (
          <li key={c.placa} className={FILA}>
            <span className={HORA}>{c.hora}</span>
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
              {c.placa}
            </span>
            <span className="min-w-0 flex-[1_1_10rem] truncate text-sm text-[var(--text-secondary)]">
              {c.etiquetaCruce ?? "sin guía ni flete de ese día"}
            </span>
            {c.etiquetaCruce && (
              <Pastilla tono={c.confirmado ? "ok" : "neutro"}>
                {c.confirmado ? "confirmada" : "propuesta"}
              </Pastilla>
            )}
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

const TONO_ASISTENCIA: Partial<Record<EstadoAsistencia, Tono>> = {
  PRESENTE: "ok",
  TARDANZA: "aviso",
  MEDIO_DIA: "aviso",
  FALTA: "alerta",
  PERMISO: "info",
  VACACIONES: "info",
};

export function ChalecosDelDia({
  chalecos,
  onAsignar,
}: {
  chalecos: ResumenDelDia["chalecos"];
  onAsignar: (numero: string) => void;
}) {
  return (
    <Bloque
      titulo={`Chalecos (${chalecos.length})`}
      icono={Hash}
      vacio={chalecos.length ? null : "La IA no leyó ningún número de chaleco ese día."}
      tip={
        <InfoTip
          title="Chalecos"
          what="El número del chaleco o casco que la IA leyó, cruzado con quién lo tiene y su asistencia del día."
          affects="No se reconoce a nadie por la cara: sólo por el número."
          example="«sin marcación»: se lo vio en el patio y no marcó asistencia."
        />
      }
    >
      <ul>
        {chalecos.map((c) => {
          const estado = c.asistencia as EstadoAsistencia | null;
          return (
            <li key={c.numero} className={FILA}>
              <span className="w-12 shrink-0 font-mono text-sm font-bold text-[var(--text-primary)]">
                N° {c.numero}
              </span>
              {c.nombre ? (
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                  {nombreCorto(c.nombre)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAsignar(c.numero)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-[var(--accent-ink)] underline-offset-2 hover:underline"
                >
                  sin asignar · decir de quién es
                </button>
              )}
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {c.primeraVez === c.ultimaVez ? c.primeraVez : `${c.primeraVez}–${c.ultimaVez}`}
              </span>
              {c.sinMarcacion ? (
                <Pastilla tono="aviso">sin marcación</Pastilla>
              ) : estado ? (
                <Pastilla tono={TONO_ASISTENCIA[estado] ?? "neutro"}>
                  {etiquetaAsistencia(estado)}
                </Pastilla>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Bloque>
  );
}

export function PilaDelDia({ pila }: { pila: ResumenDelDia["pila"] }) {
  return (
    <Bloque
      titulo="Pila de trozas"
      icono={Layers}
      vacio={
        pila.length ? null : "La pila no cambió en las fotos de ese día (o ninguna cámara la mira)."
      }
      tip={
        <InfoTip
          title="Pila de trozas"
          what="Las fotos donde la pila se vio más alta o más baja que en la anterior."
          affects="Si bajó y ese día no hay despacho ni producción anotados, avisa por WhatsApp."
        />
      }
    >
      <ul>
        {pila.map((p, i) => (
          <li key={`${p.hora}-${i}`} className={FILA}>
            <span className={HORA}>{p.hora}</span>
            <span className="min-w-0 flex-[1_1_10rem] truncate text-sm text-[var(--text-primary)]">
              {p.cambio === "bajo" ? "Bajó" : "Subió"} · {p.camara}
            </span>
            {p.cambio === "bajo" && (p.despachoDelDia !== null || p.produccionDelDia !== null) && (
              /* Mismas palabras y mismo color que la pastilla de la foto, sin el «Pila bajó» que ya dice la fila. */
              <Pastilla tono={textoPila({ ...p, avisada: false }).tono}>
                {textoPila({ ...p, avisada: false }).texto.replace(/^Pila bajó(?: · )?/, "") ||
                  "bajó"}
              </Pastilla>
            )}
            {p.avisada && <Pastilla tono="info">avisado</Pastilla>}
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

export function ActividadYCamaras({
  actividades,
  porCamara,
}: Pick<ResumenDelDia, "actividades" | "porCamara">) {
  const acts = Object.entries(actividades) as [ActividadPatio, number][];
  return (
    <Bloque titulo="Qué se hizo y qué mandó cada cámara" icono={Activity} vacio={null}>
      {acts.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {acts.map(([a, n]) => (
            <Pastilla key={a} tono="info">
              {ACTIVIDAD_LABEL[a]} · {n} {n === 1 ? "foto" : "fotos"}
            </Pastilla>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-sm text-[var(--text-tertiary)]">
          La IA no reconoció carga, descarga ni aserrío.
        </p>
      )}
      <ul>
        {porCamara.map((c) => (
          <li key={c.camaraId} className={FILA}>
            <Camera className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
              {c.nombre}
            </span>
            {c.fotos > 0 ? (
              <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                {c.fotos} {c.fotos === 1 ? "foto" : "fotos"} ·{" "}
                {c.primera === c.ultima ? c.primera : `${c.primera}–${c.ultima}`}
              </span>
            ) : (
              <Pastilla tono="aviso">no mandó nada</Pastilla>
            )}
          </li>
        ))}
      </ul>
    </Bloque>
  );
}
