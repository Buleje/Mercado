"use client";

/**
 * Aviso automático de proveedor sancionado (SERFOR + OSINFOR) en el alta y en
 * la recepción de un ingreso. Sale solo al escribir o elegir el titular, su
 * RUC/DNI o el permiso; dice la fuente y la fecha del dato. Nunca bloquea:
 * se puede guardar y recepcionar igual.
 */

import { ExternalLink, Loader2, ShieldAlert, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ENLACE_REGISTRO_INFRACTORES, type MotivoCoincidencia } from "@/lib/forestal/serfor-infractores";
import { enlaceObservatorio } from "@/lib/forestal/osinfor-supervisiones";
import {
  fechaDelDato,
  type AvisoProveedor,
  type FuenteDelAviso,
  type TonoAviso,
} from "@/lib/forestal/aviso-proveedor";
import { useAvisoProveedor } from "./hooks/use-aviso-proveedor";

const CLASE: Record<Exclude<TonoAviso, "revisado">, string> = {
  rojo: "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  ambar:
    "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  nombre:
    "border-[var(--data-warning-500)]/30 bg-[var(--surface-sunken)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  incompleto: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

const MOTIVO: Record<MotivoCoincidencia, string> = {
  documento: "por su RUC/DNI",
  permiso: "por el permiso",
  permiso_otro: "por el permiso, a otra persona",
  nombre: "solo por el nombre",
};

/** ISO → «04/11/2026 14:32» en hora de Lima (UTC−5 todo el año, sin horario de verano). */
function horaLima(iso: string | null): string {
  if (!iso) return "sin fecha";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "sin fecha";
  const d = new Date(t - 5 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

function textoFuente(f: FuenteDelAviso): string {
  if (!f.respondio) return `${f.nombre} (no respondió)`;
  return f.como === "lista_al"
    ? `${f.nombre} (lista al ${fechaDelDato(f.fecha)})`
    : `${f.nombre} (consultado el ${horaLima(f.fecha)})`;
}

function Fuentes({ aviso }: { aviso: AvisoProveedor }) {
  const codigo = aviso.permisos[0]?.codigo ?? null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]" data-aviso-fuente>
      <span>Fuente: {aviso.fuentes.map(textoFuente).join(" · ")}</span>
      <a
        href={ENLACE_REGISTRO_INFRACTORES}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
      >
        Ver en SERFOR <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      {codigo && (
        <a
          href={enlaceObservatorio(codigo, "roja")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          Ver en OSINFOR <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </p>
  );
}

const AYUDA = {
  what: "El panel busca al titular, su RUC/DNI y el permiso de la guía en el Registro de Infractores de SERFOR y en el mapa de OSINFOR (lista roja y procesos sancionadores). Datos públicos del Estado, sin clave.",
  affects: "Solo avisa: puedes guardar y recepcionar igual. No cambia el ingreso ni el permiso.",
  example: "Como pedir el DNI antes de fiar: si sale en rojo, lee la resolución antes de pagarle.",
};

export function AvisoProveedorSancion({
  nombre,
  documento,
  codigo,
  contratoId,
  className = "",
}: {
  nombre?: string | null;
  documento?: string | null;
  codigo?: string | null;
  contratoId?: string | null;
  className?: string;
}) {
  const estado = useAvisoProveedor(nombre, documento, codigo, contratoId);

  if (estado.fase === "nada") return null;
  if (estado.fase === "revisando") {
    return (
      <p className={`flex items-center gap-1.5 text-sm text-[var(--text-secondary)] ${className}`} role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Revisando al proveedor en SERFOR y OSINFOR…
      </p>
    );
  }
  if (estado.fase === "error") {
    return (
      <p className={`text-sm text-[var(--text-secondary)] ${className}`} role="status" data-aviso-proveedor="error">
        {estado.mensaje}
      </p>
    );
  }
  const a = estado.aviso;
  if (!a) return null;

  if (a.tono === "revisado") {
    return (
      <div className={`text-sm text-[var(--text-secondary)] ${className}`} role="status" data-aviso-proveedor="revisado">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          <span className="font-semibold text-[var(--text-primary)]">{a.titulo}</span>
          <InfoTip title="Revisión automática" {...AYUDA} />
        </p>
        <Fuentes aviso={a} />
      </div>
    );
  }

  const ocultas = a.totalSanciones - a.sanciones.length;
  return (
    <div
      className={`rounded-xl border-2 px-3 py-2.5 ${CLASE[a.tono]} ${className}`}
      role={a.tono === "rojo" ? "alert" : "status"}
      data-aviso-proveedor={a.tono}
    >
      <p className="flex items-start gap-2 text-sm font-bold">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{a.titulo}</span>
        <InfoTip title="Revisión automática del proveedor" {...AYUDA} />
      </p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">
        {a.nombre}
        {a.documento ? ` · ${a.documento}` : ""} — {a.detalle}
      </p>
      {a.sanciones.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-sm text-[var(--text-primary)]">
          {a.sanciones.map((s) => (
            <li key={`${s.resolucion}|${s.fecha ?? ""}|${s.infractor}`} className="flex flex-wrap gap-x-2">
              <span className="font-mono font-semibold tabular-nums">{s.resolucion}</span>
              <span className="tabular-nums">{fechaDelDato(s.fecha)}</span>
              {s.organo && <span>{s.organo}</span>}
              <span className="text-[var(--text-secondary)]">
                {MOTIVO[s.motivo]}
                {s.motivo !== "documento" && s.motivo !== "nombre" ? ` (${s.infractor})` : ""}
              </span>
            </li>
          ))}
          {ocultas > 0 && <li className="text-[var(--text-secondary)]">y {ocultas} más</li>}
        </ul>
      )}
      <Fuentes aviso={a} />
    </div>
  );
}
