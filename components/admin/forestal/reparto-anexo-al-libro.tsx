"use client";

/**
 * Del Anexo 04 de un permiso al libro, sin salir de la Distribución (Fase 5).
 *
 * Una línea con el estado del anexo guardado de ese permiso y, si falta, la
 * acción «Pasar al libro». Esa acción abre el MISMO flujo de «Al libro» de la
 * bandeja de emitidos (`useFlujoAlLibro`): el servidor propone la guía, se
 * elige de qué corridas sale y se registra una guía por transacción. Acá no se
 * escribe nada por otro camino — despachar mueve stock.
 *
 * Sólo admin y dueño pasan una guía al libro; al almacenero se le muestra la
 * acción apagada con el motivo (el servidor lo rechazaría igual).
 */
import { Check, FileStack, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { useAnexoAlLibro, type EstadoAnexoDelPermiso } from "./hooks/use-anexo-al-libro";
import { useFlujoAlLibro } from "./CtpGuiasSinRegistrarEntrada";

const AYUDA =
  "El Anexo 04 de este permiso se guarda desde «Anexo 04 de este permiso». Pasarlo al libro registra su guía de salida en Despacho y descuenta del patio: se hace una guía por vez, eligiendo de qué corridas sale.";

function Linea({ estado }: { estado: EstadoAnexoDelPermiso }) {
  if (estado.tipo === "cargando") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando el anexo guardado…
      </span>
    );
  }
  if (estado.tipo === "sin_guardar") {
    return <span className="text-[var(--text-tertiary)]">Anexo 04 sin guardar · se guarda desde el botón de al lado.</span>;
  }
  const gtf = estado.anexo.gtf?.trim();
  if (estado.tipo === "en_libro") {
    const lineas = estado.lineas && estado.lineas.length > 0 ? ` · despacho ${estado.lineas.map((l) => `#${l}`).join(", ")}` : "";
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 font-bold text-[var(--data-success-ink)]">
        <Check className="h-3.5 w-3.5" aria-hidden /> En el libro{lineas}
        {gtf ? <span className="font-mono tabular-nums"> · GTF {gtf}</span> : null}
      </span>
    );
  }
  if (estado.tipo === "reemplazado") {
    return <span className="text-[var(--text-secondary)]">Guardado · otro anexo de la misma guía vale en su lugar.</span>;
  }
  return (
    <span className="text-[var(--text-secondary)]">
      <b className="text-[var(--text-primary)]">Guardado</b> · sin pasar al libro
      {gtf ? <span className="font-mono tabular-nums"> · GTF {gtf}</span> : <span className="text-[var(--data-warning-ink)]"> · le falta la GTF N°</span>}
    </span>
  );
}

export default function AnexoAlLibro({ piezas }: { piezas: readonly PiezaCubicada[] }) {
  const { estado, puedePasar, rol, recargar } = useAnexoAlLibro(piezas);
  const { abrir, modal } = useFlujoAlLibro(recargar);
  const falta = estado.tipo === "guardado" ? estado : null;
  const motivoApagado = !falta
    ? null
    : !puedePasar
      ? rol === null ? "Verificando tu rol…" : "Solo el administrador o el dueño pasan una guía al libro. Avisa a uno de ellos."
      : falta.sinGuia
        ? "El anexo no tiene GTF N°. Ábrelo, usa el siguiente del talonario y guárdalo."
        : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--rule-base)] px-3 py-2 text-xs">
      <Linea estado={estado} />
      <InfoTip icono="ayuda" title="Del anexo al libro" what={AYUDA} />
      {falta && (
        <button
          type="button"
          onClick={abrir}
          disabled={motivoApagado != null}
          title={motivoApagado ?? "Registrar la guía de este anexo en Despacho (abre el flujo de «Al libro»)"}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-2.5 text-xs font-bold text-[var(--data-warning-ink)] transition-colors hover:border-[var(--data-warning-500)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileStack className="h-3.5 w-3.5" aria-hidden /> Pasar al libro
        </button>
      )}
      {falta && motivoApagado && <span className="basis-full text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{motivoApagado}</span>}
      {modal}
    </div>
  );
}
