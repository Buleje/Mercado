"use client";

/**
 * Seguimiento a clientes (ADR-508) — a quién escribirle hoy: compraron hace 3,
 * 15 o 30 días. Cada fila trae el mensaje sugerido listo para WhatsApp y el
 * botón para copiarlo. Al abrir WhatsApp la fila queda «Escrito» en este
 * navegador (no en la base: es una ayuda para no repetir, no un registro).
 *
 * La lista la arma el servidor (`ResumenAgendaHoy.seguimientos`); acá no se
 * calcula nada. Va en Administración › Hoy y en «Pendientes y avisos».
 */
import { Check, Copy, MessageCircle } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { SeguimientoClienta } from "@/lib/agenda/seguimiento-clientas";
import { cn } from "@/lib/utils";
import { CLASE_CHIP_ESTADO } from "../comun/ListaOcurrencias";
import { ESTILO_ESTADO } from "../comun/estado-ocurrencia";
import { fechaCorta } from "../comun/fechas";

const CLAVE_ESCRITOS = "agenda-seguimiento-escritos";
/** Lo marcado se guarda con su día: lo de hace más de 40 días se descarta al marcar otro. */
const DIAS_RECUERDO = 40;

type Escritos = Record<string, string>;

const claveFila = (s: SeguimientoClienta) => `${s.id}:${s.dia}`;

function podar(escritos: Escritos, hoy: string): Escritos {
  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) - DIAS_RECUERDO * 86_400_000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(escritos).filter(([, f]) => f >= limite));
}

async function copiar(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Mensaje copiado");
  } catch {
    toast.error("No se pudo copiar. Mantén apretado el mensaje para copiarlo.");
  }
}

interface Props {
  seguimientos: readonly SeguimientoClienta[];
  /** Filas bajas (la barra del costado y «Todas» del centro). */
  densa?: boolean;
}

export function ListaSeguimientos({ seguimientos, densa = false }: Props) {
  const [escritos, setEscritos] = useLocalStorage<Escritos>(CLAVE_ESCRITOS, {});
  const marcar = (s: SeguimientoClienta) => setEscritos((prev) => ({ ...podar(prev, s.fecha), [claveFila(s)]: s.fecha }));

  return (
    <ul aria-label="A quién escribirle hoy" className="divide-y divide-[var(--rule-soft)]">
      {seguimientos.map((s) => {
        const escrito = Boolean(escritos[claveFila(s)]);
        const quien = s.nombre ?? s.telefono;
        return (
          <li
            key={claveFila(s)}
            data-seguimiento={s.dia}
            className={cn("flex items-start gap-x-3", densa ? "py-2" : "flex-wrap gap-y-2 py-3", escrito && "opacity-60")}
          >
            <MessageCircle className={cn("mt-0.5 shrink-0 text-[var(--text-tertiary)]", densa ? "size-4" : "size-5")} aria-hidden="true" />
            <div className={cn("min-w-0 flex-1", !densa && "flex-[1_1_14rem] space-y-1")}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("min-w-0 truncate font-semibold text-[var(--text-primary)]", densa && "text-sm")} title={s.telefono}>
                  {quien}
                </span>
                <span className={cn(CLASE_CHIP_ESTADO, escrito ? ESTILO_ESTADO.hecha.chip : ESTILO_ESTADO.pendiente.chip)}>
                  {escrito ? "Escrito" : `A los ${s.dia} días`}
                </span>
                {!densa && (
                  <span className="text-sm text-[var(--text-tertiary)]">
                    Compró el {fechaCorta(s.compradoEl)}
                    {s.producto ? ` · ${s.producto}` : ""}
                  </span>
                )}
              </div>
              <p className={cn("text-[var(--text-secondary)]", densa ? "truncate text-xs" : "line-clamp-2 text-sm")} title={s.mensaje}>
                {s.mensaje}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={button({ variant: "ghost", size: "icon", className: densa ? "size-10" : undefined })}
                onClick={() => void copiar(s.mensaje)}
                title="Copiar el mensaje"
                aria-label={`Copiar el mensaje para ${quien}`}
              >
                <Copy className={densa ? "size-4" : "size-5"} aria-hidden="true" />
              </button>
              {s.whatsapp ? (
                <a
                  href={s.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => marcar(s)}
                  className={button({
                    variant: densa ? "ghost" : "secondary",
                    size: densa ? "icon" : undefined,
                    className: densa ? "size-10" : "max-sm:w-12 max-sm:px-0",
                  })}
                  title={`Abrir WhatsApp con ${quien} y el mensaje listo`}
                  aria-label={`Escribir a ${quien} por WhatsApp`}
                >
                  {escrito ? <Check className="size-4" aria-hidden="true" /> : <MessageCircle className="size-4" aria-hidden="true" />}
                  {!densa && <span className="max-sm:sr-only">WhatsApp</span>}
                </a>
              ) : (
                <span className="px-2 text-xs text-[var(--text-tertiary)]" title={`${s.telefono} no parece un número de WhatsApp`}>
                  Sin WhatsApp
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
