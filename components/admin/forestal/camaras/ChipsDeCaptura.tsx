"use client";

/**
 * Lo que la IA leyó en UNA foto, en pastillas: chalecos con su dueño y su
 * asistencia, la placa con la guía/flete que coincide, la actividad y la pila.
 *
 * Todo es PROPUESTA (ADR-411): la placa no entra a la guía; «Confirmar» marca
 * la FOTO con quién y cuándo. Una coincidencia «parecida» (un carácter que la
 * cámara confunde, 0/O, 8/B) se dibuja con borde punteado y en ámbar para que
 * no se confunda con una exacta.
 */

import {
  Activity,
  Car,
  CheckCircle2,
  FileText,
  Hash,
  Layers,
  Loader2,
  Truck,
  Users,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import type { Captura, CrucePlaca } from "@/lib/camaras/camaras";
import { cn } from "@/lib/utils";
import {
  ACTIVIDAD_LABEL,
  CHIP_BASE,
  CHIP_TONO,
  ICONO_TONO,
  horaODia,
  sinLeer,
  textoChaleco,
  textoPila,
  type ChalecosPantalla,
  type Tono,
} from "./camaras-ui";

function Chip({
  tono,
  icono: Icono,
  children,
  className = "",
  title,
}: {
  tono: Tono;
  icono?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title} className={cn(CHIP_BASE, CHIP_TONO[tono], className)}>
      {Icono && <Icono className={`h-3.5 w-3.5 shrink-0 ${ICONO_TONO[tono]}`} aria-hidden />}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

const ICONO_CRUCE: Record<CrucePlaca["tipo"], LucideIcon> = {
  gtf: FileText,
  flete: Truck,
  vehiculo: Car,
};

interface Props {
  captura: Captura;
  /** La foto contra la que se comparó la pila, si sigue en el historial. */
  anteriorUrl?: string | null;
  confirmando: string | null;
  onConfirmar: (refId: string) => void;
  onAsignarChaleco: (numero: string) => void;
  /** Número → dueño HOY (el GET). */
  chalecosVivos: ChalecosPantalla;
}

export default function ChipsDeCaptura({
  captura: c,
  anteriorUrl,
  confirmando,
  onConfirmar,
  onAsignarChaleco,
  chalecosVivos,
}: Props) {
  const l = c.lectura;
  /* Sin lectura: o la IA la está leyendo (recién llegó) o nunca la leyó. */
  const recien = !l && Date.now() - Date.parse(c.at) < 2 * 60_000;
  const motivoSinLeer = sinLeer(c) ?? (l ? null : recien ? "La IA la está leyendo…" : "Sin leer");
  const cruzados = c.cruces?.chalecos ?? [];
  /* Lecturas sin cruce (viejas, o de antes de asignar chalecos): el número
     igual se muestra, y con dueño si hoy lo tiene. */
  const sueltos = (l?.chalecos ?? []).filter((n) => !cruzados.some((x) => x.numero === n));
  const chalecos = [
    ...cruzados,
    ...sueltos.map((numero) => ({ numero, colaboradorId: null, asistencia: null })),
  ];
  const placas = c.cruces?.placas ?? [];
  const pila = c.pila ? textoPila(c.pila, true) : null;
  const tituloPila =
    "Lo que decía el libro al momento de la foto; «Hoy en el patio» lo vuelve a mirar";
  const hayAlgo =
    motivoSinLeer ||
    (l?.actividad && l.actividad !== "ninguna") ||
    (l?.personas ?? 0) > 0 ||
    chalecos.length ||
    l?.placa ||
    pila;
  if (!hayAlgo) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {motivoSinLeer && <Chip tono={sinLeer(c) ? "aviso" : "neutro"}>{motivoSinLeer}</Chip>}
      {l?.actividad && l.actividad !== "ninguna" && (
        <Chip tono="info" icono={Activity}>
          {ACTIVIDAD_LABEL[l.actividad]}
        </Chip>
      )}
      {(l?.personas ?? 0) > 0 && (
        <Chip tono="neutro" icono={Users} title="Personas que la IA contó en esta foto">
          {l?.personas === 1 ? "1 persona" : `${l?.personas} personas`}
        </Chip>
      )}

      {/* El dueño sale de la lista VIVA de chalecos; la marcación, de la foto. */}
      {chalecos.map((x) => {
        const t = textoChaleco(x, chalecosVivos[x.numero]);
        if (t.sinAsignar) {
          return (
            <button
              key={x.numero}
              type="button"
              onClick={() => onAsignarChaleco(x.numero)}
              title={`Decir de quién es el chaleco N° ${x.numero}`}
              className={cn(
                CHIP_BASE,
                CHIP_TONO.neutro,
                "border-dashed transition hover:border-[var(--accent)]",
              )}
            >
              <Hash className={`h-3.5 w-3.5 shrink-0 ${ICONO_TONO.neutro}`} aria-hidden />
              {t.texto}
            </button>
          );
        }
        return (
          <Chip
            key={x.numero}
            tono={t.tono}
            icono={Hash}
            title="La marcación es la que había al momento de la foto"
          >
            {t.texto}
          </Chip>
        );
      })}

      {pila &&
        (anteriorUrl ? (
          <a
            href={anteriorUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${tituloPila}. Abre la foto anterior para comparar.`}
            className={`${CHIP_BASE} ${CHIP_TONO[pila.tono]} underline-offset-2 hover:underline`}
          >
            <Layers className={`h-3.5 w-3.5 shrink-0 ${ICONO_TONO[pila.tono]}`} aria-hidden />
            {pila.texto}
          </a>
        ) : (
          <Chip tono={pila.tono} icono={Layers} title={tituloPila}>
            {pila.texto}
          </Chip>
        ))}

      {/* La placa: con cruce, una fila por coincidencia; sin cruce, la lectura sola. */}
      {placas.length > 0 ? (
        placas.map((p) => {
          const parecida = p.coincidencia === "parecida";
          const Icono = ICONO_CRUCE[p.tipo];
          return (
            <span
              key={`${p.refId}-${p.placa}`}
              className="flex w-full flex-wrap items-center gap-1"
            >
              <Chip tono="neutro" className="font-mono font-bold">
                {p.placa}
              </Chip>
              <Chip
                tono={parecida ? "aviso" : "ok"}
                icono={Icono}
                className={parecida ? "border-dashed" : ""}
                title={
                  parecida
                    ? "Difiere en un carácter que la cámara confunde (0/O, 8/B…)"
                    : "La placa coincide exacta"
                }
              >
                {p.etiqueta} · {parecida ? "parecida" : "exacta"}
              </Chip>
              {p.confirmadoEn ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-[var(--data-success-ink)]"
                    aria-hidden
                  />
                  {p.confirmadoPor ?? "Confirmada"} · {horaODia(p.confirmadoEn)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onConfirmar(p.refId)}
                  disabled={confirmando !== null}
                  aria-label={`Confirmar que la placa ${p.placa} es ${p.etiqueta}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--accent)] px-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/10 disabled:opacity-50"
                >
                  {confirmando === p.refId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Confirmar
                </button>
              )}
            </span>
          );
        })
      ) : l?.placa ? (
        <Chip
          tono="neutro"
          className="font-mono font-bold"
          title={
            c.cruces ? "No coincide con ninguna guía, flete ni vehículo de esos días" : undefined
          }
        >
          {l.placa}
          <span className="ml-1 font-sans font-normal text-[var(--text-secondary)]">
            {c.cruces ? "sin guía ni flete" : l.confianza === "alta" ? "leída" : "a confirmar"}
          </span>
        </Chip>
      ) : null}
    </div>
  );
}
