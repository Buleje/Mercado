"use client";

/**
 * «Visitantes del día» (ADR-479): una tarjeta por persona distinta, con su
 * portada (la foto donde se la ve más grande, recortada a ella), cuántas fotos,
 * de qué hora a qué hora y en qué cámaras. Tocar una tarjeta deja en la grilla
 * de abajo sólo sus fotos: es su «carpeta» del día. Arriba, cuántas personas
 * distintas hubo en cada hora.
 *
 * Todo viene armado de `GET /api/admin/camaras/personas/resumen`: la pantalla
 * no agrupa ni suma. Se agrupa por la ROPA, nunca por la cara: siempre «aprox.».
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ImageOff, UserCheck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { GrupoPersonas, RecuadroPortada, RespuestaResumenPersonas } from "@/lib/camaras/visitantes";
import { BLOQUE, BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";

/** Cuántas tarjetas se ven antes de «Ver todas». */
const A_LA_VISTA = 12;
/** Las fotos del detector son del video (16:9) y la portada es 3:4. */
const ASPECTO_FOTO = 16 / 9;
const ASPECTO_PORTADA = 3 / 4;

const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
const hora = (iso: string) => fmtHora.format(new Date(iso));
const hh = (h: number) => `${String(h).padStart(2, "0")} h`;

/** El recorte 3:4 alrededor de la persona (con aire), en fracciones de la foto. */
function recorte(c: RecuadroPortada): { x: number; y: number; ancho: number; alto: number } {
  const alto = Math.min(1, c.alto * 1.3);
  const ancho = Math.min(1, (ASPECTO_PORTADA * alto) / ASPECTO_FOTO);
  const cx = c.x + c.ancho / 2;
  const cy = c.y + c.alto / 2;
  return {
    x: Math.min(Math.max(cx - ancho / 2, 0), 1 - ancho),
    y: Math.min(Math.max(cy - alto / 2, 0), 1 - alto),
    ancho,
    alto,
  };
}

function Portada({ grupo }: { grupo: GrupoPersonas }) {
  const [rota, setRota] = useState(false);
  const r = recorte(grupo.portada.caja);
  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-[var(--surface-sunken)]">
      {rota ? (
        <span className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
          <ImageOff className="h-6 w-6" aria-hidden />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- foto privada del Drive, servida por nuestra API (chequea permisos)
        <img
          src={`/api/admin/documents/${encodeURIComponent(grupo.portada.docId)}/raw`}
          alt=""
          loading="lazy"
          onError={() => setRota(true)}
          className="absolute max-w-none"
          style={{
            width: `${100 / r.ancho}%`,
            height: `${100 / r.alto}%`,
            left: `${(-r.x / r.ancho) * 100}%`,
            top: `${(-r.y / r.alto) * 100}%`,
          }}
        />
      )}
      {grupo.tipo === "personal" && (
        <span className={`${CHIP_BASE} ${CHIP_TONO.ok} absolute left-1 top-1`} title="Con chaleco fluorescente: personal">
          <UserCheck className="h-3.5 w-3.5" aria-hidden /> Personal
        </span>
      )}
    </div>
  );
}

interface Props {
  resumen: RespuestaResumenPersonas | null;
  error: string | null;
  /** `clave` del grupo elegido, o `null`. */
  elegido: string | null;
  onElegir: (clave: string | null) => void;
}

export default function VisitantesDelDia({ resumen: r, error, elegido, onElegir }: Props) {
  const tituloId = useId();
  const [todas, setTodas] = useState(false);
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
    r.sinAgrupar > 0 && `${r.sinAgrupar} ${r.sinAgrupar === 1 ? "aparición lejana" : "apariciones lejanas"} sin agrupar`,
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
          what="Cada tarjeta junta las fotos de una misma persona según el color de su ropa. Tócala para ver sólo sus fotos abajo."
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
          <ol className="flex flex-wrap gap-1.5" aria-label="Personas distintas por hora">
            {r.porHora.map((h) => (
              <li
                key={h.hora}
                className={`${CHIP_BASE} ${CHIP_TONO.neutro} font-normal`}
                title={`${hh(h.hora)}: ${h.personas} ${h.personas === 1 ? "persona distinta" : "personas distintas"}${h.conChaleco ? `, ${h.conChaleco} con chaleco` : ""}${h.sinAgrupar ? ` y ${h.sinAgrupar} lejos sin agrupar` : ""}`}
              >
                <span className="tabular-nums text-[var(--text-secondary)]">{hh(h.hora)}</span>
                <b className="tabular-nums">{h.personas}</b>
              </li>
            ))}
          </ol>

          {r.grupos.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Todas las personas se vieron muy lejos para agruparlas por la ropa.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {grupos.map((g) => {
                const activo = elegido === g.clave;
                return (
                  <li key={g.clave}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      onClick={() => onElegir(activo ? null : g.clave)}
                      className={`block w-full overflow-hidden rounded-xl border bg-[var(--surface-raised)] text-left transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${activo ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--rule-base)]"}`}
                    >
                      <Portada grupo={g} />
                      <span className="block space-y-0.5 px-2 py-1.5">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{g.etiqueta}</span>
                        <span className="block text-xs tabular-nums text-[var(--text-secondary)]">
                          {g.fotos.length} {g.fotos.length === 1 ? "foto" : "fotos"} · {hora(g.desde)}
                          {hora(g.hasta) !== hora(g.desde) && ` a ${hora(g.hasta)}`}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">{g.camaras.join(" y ")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(r.grupos.length > A_LA_VISTA || notas.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
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
