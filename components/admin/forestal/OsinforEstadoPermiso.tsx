"use client";

/**
 * «Revisar en OSINFOR y SERFOR» — qué publica el Estado del permiso antes de
 * comprarle madera: lista roja/verde del Observatorio y proceso sancionador
 * (PAU) de OSINFOR, y si el permiso o su titular están en el Registro Nacional
 * de Infractores de SERFOR. Las dos consultas salen juntas al tocar el botón
 * (datos públicos, sin clave); no guarda nada ni cambia el permiso.
 */

import { useState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "@buleje/design-system/icons";
import { logger } from "@/lib/logger";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  ENLACE_SIGOSFC,
  enlaceObservatorio,
  type EstadoPau,
  type ListaObservatorio,
  type NivelOsinfor,
  type ResumenOsinfor,
} from "@/lib/forestal/osinfor-supervisiones";
import type { ResumenInfractores } from "@/lib/forestal/serfor-infractores";
import { Btn } from "./ctp-shared";
import { SerforInfractoresResultado, pedirInfractores, type TitularConsultable } from "./SerforInfractoresResultado";

type Estado =
  | { fase: "quieto" }
  | { fase: "cargando" }
  | {
      fase: "listo";
      /** Cada fuente responde por su lado: si una falla, la otra igual se muestra. */
      resumen: ResumenOsinfor | null;
      errorOsinfor: string | null;
      infractores: ResumenInfractores | null;
      errorInfractores: string | null;
    }
  | { fase: "error"; mensaje: string };

const CLASE_NIVEL: Record<NivelOsinfor, string> = {
  rojo: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  ambar:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  verde:
    "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  sin_supervision: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

const LISTA_TEXTO: Record<ListaObservatorio, string> = {
  roja: "Lista roja",
  verde: "Lista verde",
  ambas: "Roja y verde",
  sin_dato: "Sin lista",
};

const PAU_TEXTO: Record<EstadoPau, string> = {
  en_tramite: "PAU en trámite",
  concluido: "PAU concluido",
  archivado: "Informe archivado",
  sin_dato: "PAU sin dato",
};

const MAX_FILAS_VISTAS = 4;

async function pedirOsinfor(codigo: string): Promise<ResumenOsinfor> {
  let r: Response;
  try {
    r = await fetch(`/api/admin/forestal/osinfor?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" });
  } catch (err) {
    logger.warn("[osinfor] sin conexión", { error: String(err) });
    throw new Error("Sin conexión: revisa el internet y vuelve a tocar.");
  }
  const cuerpo = (await r.json().catch((err: unknown) => {
    logger.warn("[osinfor] respuesta sin JSON", { status: r.status, error: String(err) });
    return null;
  })) as { data?: ResumenOsinfor; error?: string } | null;
  if (!r.ok || !cuerpo?.data) throw new Error(cuerpo?.error ?? `OSINFOR no respondió (error ${r.status}).`);
  return cuerpo.data;
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "sin fecha";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Estado de la consulta: lo comparten el botón y la respuesta (que pueden ir en lugares distintos de la fila). */
export function useOsinforPermiso(codigo: string, titular?: TitularConsultable) {
  const [guardado, setGuardado] = useState<{ clave: string; estado: Estado }>({ clave: "", estado: { fase: "quieto" } });
  // Si cambian el código, el RUC o el nombre, la respuesta de antes ya no habla de esto.
  const clave = `${codigo}|${titular?.documento ?? ""}|${titular?.nombre ?? ""}`;
  const estado: Estado = guardado.clave === clave ? guardado.estado : { fase: "quieto" };
  const setEstado = (e: Estado) => setGuardado({ clave, estado: e });

  const consultar = () => {
    setEstado({ fase: "cargando" });
    const mensaje = (err: unknown) => (err instanceof Error ? err.message : String(err));
    Promise.allSettled([pedirOsinfor(codigo), pedirInfractores(codigo, titular)])
      .then(([o, s]) => {
        if (o.status === "rejected" && s.status === "rejected") {
          const m1 = mensaje(o.reason);
          const m2 = mensaje(s.reason);
          setEstado({ fase: "error", mensaje: m1 === m2 ? m1 : `${m1} ${m2}` });
          return;
        }
        setEstado({
          fase: "listo",
          resumen: o.status === "fulfilled" ? o.value : null,
          errorOsinfor: o.status === "rejected" ? mensaje(o.reason) : null,
          infractores: s.status === "fulfilled" ? s.value : null,
          errorInfractores: s.status === "rejected" ? mensaje(s.reason) : null,
        });
      })
      .catch((err: unknown) => {
        logger.error("[osinfor] no se pudo mostrar la respuesta", { error: String(err) });
        setEstado({ fase: "error", mensaje: mensaje(err) });
      });
  };

  return { estado, consultar };
}

export type OsinforPermiso = ReturnType<typeof useOsinforPermiso>;

/** El botón: se ve hasta que OSINFOR responde; después lo reemplaza la respuesta. */
export function OsinforBoton({
  osinfor,
  size = "md",
  className = "mt-2",
}: {
  osinfor: OsinforPermiso;
  size?: "md" | "sm";
  className?: string;
}) {
  const { estado, consultar } = osinfor;
  if (estado.fase !== "quieto" && estado.fase !== "cargando") return null;
  return (
    <Btn
      variant="ghost"
      size={size}
      onClick={consultar}
      disabled={estado.fase === "cargando"}
      title="Mira en OSINFOR (lista roja, proceso sancionador) y en el Registro de Infractores de SERFOR si este permiso o su titular tienen sanciones"
      className={className}
    >
      {estado.fase === "cargando" ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <ShieldCheck className="h-4 w-4" aria-hidden />
      )}
      {estado.fase === "cargando" ? "Consultando OSINFOR y SERFOR…" : "Revisar en OSINFOR y SERFOR"}
    </Btn>
  );
}

/** Lo que respondió OSINFOR (o por qué no se pudo). Nada mientras no se tocó el botón. */
export function OsinforResultado({ osinfor, className = "mt-2" }: { osinfor: OsinforPermiso; className?: string }) {
  const { estado, consultar } = osinfor;
  if (estado.fase === "quieto" || estado.fase === "cargando") return null;

  if (estado.fase === "error") {
    return (
      <p className={`${className} text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`} role="status">
        {estado.mensaje}{" "}
        <button type="button" onClick={consultar} className="font-bold underline">
          Reintentar
        </button>
      </p>
    );
  }

  return (
    <div className={`${className} space-y-1.5`}>
      {estado.resumen ? (
        <PanelOsinfor resumen={estado.resumen} />
      ) : (
        <FuenteSinRespuesta mensaje={estado.errorOsinfor} onReintentar={consultar} />
      )}
      {estado.infractores ? (
        <SerforInfractoresResultado resumen={estado.infractores} />
      ) : (
        <FuenteSinRespuesta mensaje={estado.errorInfractores} onReintentar={consultar} />
      )}
    </div>
  );
}

function FuenteSinRespuesta({ mensaje, onReintentar }: { mensaje: string | null; onReintentar: () => void }) {
  return (
    <p className="text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" role="status">
      {mensaje ?? "No respondió."}{" "}
      <button type="button" onClick={onReintentar} className="font-bold underline">
        Reintentar
      </button>
    </p>
  );
}

function PanelOsinfor({ resumen }: { resumen: ResumenOsinfor }) {
  const vistas = resumen.supervisiones.slice(0, MAX_FILAS_VISTAS);
  const ocultas = resumen.supervisiones.length - vistas.length;
  return (
    <div className={`rounded-xl border px-3 py-2 ${CLASE_NIVEL[resumen.nivel]}`} role="status" data-osinfor={resumen.nivel}>
      <p className="flex items-center gap-1.5 text-sm font-bold">
        OSINFOR: {resumen.titulo}
        <InfoTip
          title="Qué dice OSINFOR"
          what={resumen.detalle}
          affects="Dato público del mapa de OSINFOR. Se lee al tocar el botón; no cambia nada del permiso."
          example="Lista roja = OSINFOR halló árboles que no existían o madera de otro lado en ese plan."
        />
      </p>
      {vistas.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
          {vistas.map((s, i) => (
            <li key={`${s.plan}-${s.fecha ?? i}`} className="tabular-nums">
              <b className="text-[var(--text-primary)]">{s.plan}</b> · {fechaCorta(s.fecha)} · {LISTA_TEXTO[s.lista]} ·{" "}
              {PAU_TEXTO[s.estadoPau]}
            </li>
          ))}
          {ocultas > 0 && <li>y {ocultas} más</li>}
        </ul>
      )}
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <a
          href={enlaceObservatorio(resumen.codigo, resumen.nivel === "verde" ? "verde" : "roja")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1 underline"
        >
          Ver en el Observatorio <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <a href={ENLACE_SIGOSFC} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 underline">
          Resoluciones en SIGOsfc <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </div>
  );
}

/** Botón y respuesta juntos, uno debajo del otro (ficha del permiso). */
export function OsinforEstadoPermiso({ codigo, titular }: { codigo: string; titular?: TitularConsultable }) {
  const osinfor = useOsinforPermiso(codigo, titular);
  return (
    <>
      <OsinforBoton osinfor={osinfor} />
      <OsinforResultado osinfor={osinfor} />
    </>
  );
}
