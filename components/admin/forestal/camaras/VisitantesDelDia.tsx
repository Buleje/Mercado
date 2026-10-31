"use client";

/**
 * «Visitantes del día» (ADR-479): una tarjeta por persona distinta, con su
 * portada (la foto donde se la ve más grande, recortada a ella), cuántas fotos,
 * de qué hora a qué hora y en qué cámaras. Tocar una tarjeta deja en la grilla
 * de abajo sólo sus fotos: es su «carpeta» del día. Las personas por hora van
 * en las barras de arriba (`GentePorHora`): una sola cifra por hora en la vista.
 *
 * Todo viene armado de `GET /api/admin/camaras/personas/resumen`: la pantalla
 * no agrupa ni suma. Se agrupa por la ROPA, nunca por la cara: siempre «aprox.».
 */

import { useId, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { UserCheck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { completarResumen, type GrupoPersonas, type RespuestaResumenPersonas } from "@/lib/camaras/visitantes";
import { API_CAMARAS, BLOQUE, BTN } from "./camaras-ui";
import FichaVisitante, { RecorteFoto, duracion, horaLima as hora } from "./FichaVisitante";

/** Cuántas tarjetas se ven antes de «Ver todas». */
const A_LA_VISTA = 12;

/** La miniatura de la tarjeta: la foto donde se lo ve más grande, recortada a él. */
function Portada({ grupo }: { grupo: GrupoPersonas }) {
  return <RecorteFoto docId={grupo.portada.docId} caja={grupo.portada.caja} className="w-14 shrink-0 rounded-lg" />;
}

interface Props {
  resumen: RespuestaResumenPersonas | null;
  error: string | null;
  /** `clave` del grupo elegido, o `null`. */
  elegido: string | null;
  onElegir: (clave: string | null) => void;
  /**
   * Tras unir o separar visitantes a mano: que la pantalla recargue el día
   * (el conteo y la grilla de fotos). Mientras no llegue, esta tarjeta ya
   * muestra el día corregido con su propio pedido.
   */
  onCambio?: () => void;
}

export default function VisitantesDelDia({ resumen: base, error, elegido, onElegir, onCambio }: Props) {
  const tituloId = useId();
  const [todas, setTodas] = useState(false);
  // El día corregido a mano, atado al resumen que había: si la pantalla recarga, manda lo suyo.
  const [propio, setPropio] = useState<{ base: RespuestaResumenPersonas; nuevo: RespuestaResumenPersonas } | null>(null);
  const crudo = propio && base && propio.base === base ? propio.nuevo : base;
  const r = useMemo(() => (crudo ? completarResumen(crudo) : null), [crudo]);
  const grupo = elegido && r ? (r.grupos.find((g) => g.clave === elegido || g.unidos.includes(elegido)) ?? null) : null;

  const tras = async (clave: string) => {
    if (!base) return;
    const res = await fetch(`${API_CAMARAS}/personas/resumen?${new URLSearchParams({ dia: base.dia })}`, { credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as Partial<RespuestaResumenPersonas>;
    if (res.ok && j.ok) {
      const nuevo = j as RespuestaResumenPersonas;
      setPropio({ base, nuevo });
      const sigue = completarResumen(nuevo).grupos.find((g) => g.clave === clave || g.unidos.includes(clave));
      onElegir(sigue ? sigue.clave : null);
    }
    onCambio?.();
  };
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]">
        No se pudo contar a las personas del día: {error}
      </p>
    );
  }
  if (!r) return null;
  const grupos = todas ? r.grupos : r.grupos.slice(0, A_LA_VISTA);
  const notas = [
    r.sinAgrupar > 0 && `${r.sinAgrupar} ${r.sinAgrupar === 1 ? "figura lejana" : "figuras lejanas"} sin agrupar`,
    r.repetidasEnFoto > 0 && `${r.repetidasEnFoto} ${r.repetidasEnFoto === 1 ? "caja repetida no contó" : "cajas repetidas no contaron"}`,
    r.fotosSinCajas > 0 && `${r.fotosSinCajas} ${r.fotosSinCajas === 1 ? "foto" : "fotos"} de antes sin conteo`,
    r.truncado && "se contaron las 2000 fotos más nuevas",
  ].filter(Boolean);

  return (
    <section className={BLOQUE} aria-labelledby={tituloId} data-testid="visitantes-del-dia">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <CardTitle as="h3" id={tituloId} className="text-sm font-bold">
          Visitantes del día
        </CardTitle>
        <InfoTip
          title="Visitantes del día"
          what="Cada tarjeta junta las fotos de una misma persona: por la ropa y, en la misma cámara, por seguir el mismo lugar minutos después. Tócala para ver cuándo llegó, cuánto estuvo, sus mejores fotos, y unirla con otra si es la misma."
          affects="«Visitante A» vale sólo para ese día y no se guarda: se arma cada vez que abres la vista. No reconoce caras: la cabeza no se mira. Es aprox.: ropa parecida junta a dos personas, y alguien del personal con el chaleco tapado (casaca encima, de espaldas) puede salir como visitante."
          example="«Visitante A · 9 fotos · 08:12 a 08:40 · Portón y Patio»."
        />
        {elegido && (
          <button type="button" onClick={() => onElegir(null)} className={`${BTN} ml-auto h-8`}>
            <X className="h-4 w-4" aria-hidden /> Ver todas las fotos
          </button>
        )}
      </div>

      {r.fotosConCajas === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          Las fotos de este día no guardan dónde estaba cada persona: se cuentan desde las que tome el detector a partir de ahora.
        </p>
      ) : (
        <div className="space-y-3">
          {r.grupos.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Todas las personas se vieron muy lejos para agruparlas por la ropa.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {grupos.map((g) => {
                const activo = elegido === g.clave;
                return (
                  <li key={g.clave}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      onClick={() => onElegir(activo ? null : g.clave)}
                      className={`flex w-full items-center gap-2 overflow-hidden rounded-xl border bg-[var(--surface-raised)] p-1 pr-2 text-left transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${activo ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--rule-base)]"}`}
                    >
                      <Portada grupo={g} />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-bold text-[var(--text-primary)]">
                          {g.etiqueta}
                          {g.tipo === "personal" && <UserCheck className="ml-1 inline h-4 w-4 align-[-3px] text-[var(--data-success-ink)]" aria-label="Personal (chaleco)" />}
                        </span>
                        <span className="block truncate tabular-nums text-[var(--text-secondary)]">
                          {hora(g.desde)}
                          {hora(g.hasta) !== hora(g.desde) && `–${hora(g.hasta)}`} · {duracion(g.minutos)}
                        </span>
                        <span className="block truncate text-[var(--text-tertiary)]">
                          {g.fotos.length} {g.fotos.length === 1 ? "foto" : "fotos"} · {g.camaras.join(" y ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {grupo && (
            <FichaVisitante key={grupo.clave} dia={r.dia} grupo={grupo} grupos={r.grupos} onCambio={tras} />
          )}

          {(r.grupos.length > A_LA_VISTA || notas.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
              {r.grupos.length > A_LA_VISTA && (
                <button type="button" onClick={() => setTodas((t) => !t)} className={`${BTN} h-8`} aria-expanded={todas}>
                  {todas ? "Ver menos" : `Ver las ${r.grupos.length}`}
                </button>
              )}
              {notas.length > 0 && <span>{notas.join(" · ")}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
