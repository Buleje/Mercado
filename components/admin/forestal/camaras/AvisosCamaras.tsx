"use client";

/**
 * Los avisos de arriba de Cámaras: una línea cada uno, con el detalle en ⓘ.
 *
 * Son los que deciden si la cámara funciona o no, y por eso viven fuera de las
 * vistas: la dirección que se copia en el aparato, la IA sin clave y la cámara
 * que dejó de mandar. Un aviso que pide acción dice QUÉ pasa en la línea; el
 * cómo se arregla va en el ⓘ (Brandon 09-24: «mucho texto por todos lados»).
 */

import type { ReactNode } from "react";
import { AlertTriangle, Globe, Sparkles, WifiOff } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { horasSinVerse } from "@/lib/camaras/camaras";
import { ICONO_TONO, horaODia, type EstadoDireccion, type Tono } from "./camaras-ui";
import type { CamaraConConexion } from "./ConectarCamaraModal";

const FONDO: Record<Tono, string> = {
  ok: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10",
  aviso: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
  alerta: "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10",
  info: "border-[var(--data-info-500)]/40 bg-[var(--data-info-500)]/10",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
};

function Banner({
  tono,
  icono: Icono,
  children,
  tip,
  testId,
}: {
  tono: Tono;
  icono: LucideIcon;
  children: ReactNode;
  tip?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      role={tono === "aviso" || tono === "alerta" ? "status" : undefined}
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${FONDO[tono]}`}
    >
      <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${ICONO_TONO[tono]}`} aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{children}</p>
      {tip}
    </div>
  );
}

/**
 * La dirección para pegar en la cámara. `soloProblemas`: fuera de la vista de
 * configuración sólo aparece si la cámara NO puede mandar (túnel cerrado o
 * dirección de esta PC); la línea verde vive al lado de las cámaras.
 */
export function DireccionAviso({
  estado,
  soloProblemas = false,
}: {
  estado: EstadoDireccion;
  soloProblemas?: boolean;
}) {
  if (estado.tipo === "cargando" || estado.tipo === "pagina") return null;
  if (soloProblemas && (estado.tipo === "tunel" || estado.tipo === "fija")) return null;

  if (estado.tipo === "tunel") {
    return (
      <Banner
        tono="ok"
        icono={Globe}
        testId="camaras-direccion"
        tip={
          <InfoTip
            title="Dirección pública"
            side="left"
            what={
              <span>
                Es la que copia «Copiar dirección»:{" "}
                <span className="break-all font-mono text-xs">{estado.base}</span>
              </span>
            }
            affects="Si reinicias el túnel, cambia: copia otra vez y pégala en la cámara. La anterior deja de recibir."
            example="La PC tiene que quedar prendida con el panel y el túnel abiertos; si se apaga, la cámara no tiene a dónde mandar."
          />
        }
      >
        Dirección pública activa desde {estado.desde ? horaODia(estado.desde) : "hace poco"} ·
        cambia si reinicias el túnel
      </Banner>
    );
  }
  if (estado.tipo === "fija") {
    return (
      <Banner
        tono="ok"
        icono={Globe}
        testId="camaras-direccion"
        tip={
          <InfoTip
            title="Dirección pública fija"
            side="left"
            what={<span className="break-all font-mono text-xs">{estado.base}</span>}
            affects="No cambia: la que pegaste en la cámara sirve siempre."
          />
        }
      >
        Dirección pública fija: la que copias sirve siempre
      </Banner>
    );
  }
  if (estado.tipo === "tunel-caido") {
    return (
      <Banner
        tono="aviso"
        icono={WifiOff}
        testId="camaras-direccion"
        tip={
          <InfoTip
            title="Túnel cerrado"
            side="left"
            what={
              <span>
                La dirección <span className="break-all font-mono text-xs">{estado.base}</span> era
                de un túnel que ya no corre.
              </span>
            }
            affects="Ábrelo en esta PC con «npm run camaras:tunel». Sale una dirección nueva: cópiala y pégala otra vez en la cámara."
            example="Pasa al reiniciar la PC o cerrar la terminal del túnel."
          />
        }
      >
        El túnel está cerrado: la cámara no puede mandar fotos
      </Banner>
    );
  }
  return (
    <Banner
      tono="aviso"
      icono={AlertTriangle}
      testId="camaras-direccion"
      tip={
        <InfoTip
          title="Falta la dirección pública"
          side="left"
          what={
            <span>
              El panel corre en <span className="font-mono text-xs">{estado.base}</span>: la cámara
              4G está en internet y no llega a esta PC.
            </span>
          }
          affects="Abre el túnel con «npm run camaras:tunel» y deja la PC prendida. Después copia la dirección de nuevo."
          example="Con el túnel abierto aquí aparece «Dirección pública activa desde…»."
        />
      }
    >
      La dirección que copias sólo sirve en esta PC: la cámara no llega
    </Banner>
  );
}

/** La cámara guarda fotos pero la IA no las lee: sin clave no hay placa, chaleco ni pila. */
export function SinIaAviso() {
  return (
    <Banner
      tono="aviso"
      icono={Sparkles}
      testId="camaras-sin-ia"
      tip={
        <InfoTip
          title="La IA no está leyendo"
          side="left"
          what="Sin la clave de la IA las fotos llegan sin descripción, sin placa, sin chalecos y sin mirar la pila."
          affects="Las que entren mientras tanto se quedan sin leer: cargar la clave no las lee hacia atrás."
          example="La clave va en la configuración del servidor (ANTHROPIC_API_KEY) y se reinicia el panel."
        />
      }
    >
      Las fotos se guardan, pero la IA no las lee hasta cargar su clave
    </Banner>
  );
}

/** Con panel solar, dos días nublados la apagan; una SIM sin datos deja de subir sin decir nada. */
export function CalladasAviso({ calladas }: { calladas: CamaraConConexion[] }) {
  if (calladas.length === 0) return null;
  return (
    <Banner
      tono="aviso"
      icono={AlertTriangle}
      tip={
        <InfoTip
          title="Cámara callada"
          side="left"
          what="No mandó ninguna foto en más de un día."
          affects="Suele ser batería (panel solar con días nublados) o la SIM sin datos."
          example="Fíjate en Hik-Connect si sale «en línea»."
        />
      }
    >
      {calladas.length === 1
        ? "Una cámara no manda nada"
        : `${calladas.length} cámaras no mandan nada`}{" "}
      hace más de un día: {calladas.map((c) => `${c.nombre} (${horasSinVerse(c)} h)`).join(" · ")}
    </Banner>
  );
}

/** El error o el «listo» de la última acción. */
export function MensajeAccion({ error, aviso }: { error: string | null; aviso: string | null }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]"
      >
        {error}
      </p>
    );
  }
  if (!aviso) return null;
  return (
    <p
      role="status"
      className="rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]"
    >
      {aviso}
    </p>
  );
}
