"use client";

/**
 * Ficha de UN visitante del día (ADR-479): cuándo llegó y se fue, cuánto
 * estuvo a la vista y por qué cámaras pasó (por tramos), sus mejores fotos
 * recortadas a él y «¿es el mismo que…?» para corregir a mano el agrupado
 * (`POST/DELETE /api/admin/camaras/personas/uniones`, por día).
 *
 * Todo viene armado del servidor (`GrupoPersonas`): la ficha no agrupa ni suma.
 */

import { useState } from "react";
import { Clock, Combine, ImageOff, Loader2, Undo2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import type { GrupoPersonas, RecuadroPortada } from "@/lib/camaras/visitantes";
import { API_CAMARAS, BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";

/** Las fotos del detector son del video (16:9) y el recorte es 3:4. */
const ASPECTO_FOTO = 16 / 9;
const ASPECTO_RECORTE = 3 / 4;

const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
export const horaLima = (iso: string) => fmtHora.format(new Date(iso));

/** «un momento», «12 min», «1 h 5 min». */
export function duracion(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 1) return "un momento";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** El recorte 3:4 alrededor de la persona (con aire), en fracciones de la foto. */
function recorte(c: RecuadroPortada): RecuadroPortada {
  const alto = Math.min(1, c.alto * 1.3);
  const ancho = Math.min(1, (ASPECTO_RECORTE * alto) / ASPECTO_FOTO);
  const cx = c.x + c.ancho / 2;
  const cy = c.y + c.alto / 2;
  return {
    x: Math.min(Math.max(cx - ancho / 2, 0), 1 - ancho),
    y: Math.min(Math.max(cy - alto / 2, 0), 1 - alto),
    ancho,
    alto,
  };
}

/** La foto del Drive recortada a la persona (3:4). */
export function RecorteFoto({ docId, caja, className = "" }: { docId: string; caja: RecuadroPortada; className?: string }) {
  const [rota, setRota] = useState(false);
  const r = recorte(caja);
  return (
    <div className={`relative aspect-[3/4] overflow-hidden bg-[var(--surface-sunken)] ${className}`}>
      {rota ? (
        <span className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
          <ImageOff className="h-6 w-6" aria-hidden />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- foto privada del Drive, servida por nuestra API (chequea permisos)
        <img
          src={`/api/admin/documents/${encodeURIComponent(docId)}/raw`}
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
    </div>
  );
}

async function llamar(metodo: "POST" | "DELETE", cuerpo: Record<string, string>): Promise<void> {
  const r = await fetch(`${API_CAMARAS}/personas/uniones`, {
    method: metodo,
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(cuerpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!r.ok || !j.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
}

interface Props {
  dia: string;
  grupo: GrupoPersonas;
  /** Todos los grupos del día (para «es el mismo que…»). */
  grupos: readonly GrupoPersonas[];
  /** Tras unir o separar: recargar el día. `clave` = el visitante que queda elegido. */
  onCambio: (clave: string) => Promise<void>;
}

export default function FichaVisitante({ dia, grupo: g, grupos, onCambio }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otro, setOtro] = useState("");
  const otros = grupos.filter((x) => x.clave !== g.clave && x.marcador === null);
  const porClave = new Map(grupos.map((x) => [x.clave, x]));

  const hacer = async (metodo: "POST" | "DELETE", cuerpo: Record<string, string>) => {
    setOcupado(true);
    setError(null);
    try {
      await llamar(metodo, { dia, ...cuerpo });
      setOtro("");
      await onCambio(g.clave);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  const unir = (clave: string) => hacer("POST", { a: g.clave, b: clave });

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3" data-testid="ficha-visitante">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
        <b className="text-[var(--text-primary)]">{g.etiqueta}</b>
        <Clock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <span className="tabular-nums">
          Llegó {horaLima(g.desde)} · se fue {horaLima(g.hasta)} · {duracion(g.minutos)} a la vista
        </span>
      </p>

      <ol className="flex flex-wrap gap-1.5" aria-label="Cuándo estuvo">
        {g.tramos.map((t) => (
          <li key={t.desde} className={`${CHIP_BASE} ${CHIP_TONO.neutro} h-8 text-sm font-normal`}>
            <span className="tabular-nums">
              {horaLima(t.desde)}
              {horaLima(t.hasta) !== horaLima(t.desde) && `–${horaLima(t.hasta)}`}
            </span>
            <span className="text-[var(--text-secondary)]">
              · {t.camaras.join(" y ")} · {t.fotos} {t.fotos === 1 ? "foto" : "fotos"}
            </span>
          </li>
        ))}
      </ol>

      <ul className="flex flex-wrap gap-2" aria-label={`Mejores fotos de ${g.etiqueta}`}>
        {g.mejores.map((m) => (
          <li key={m.docId} className="w-[calc(50%-0.25rem)] overflow-hidden rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:w-36">
            <RecorteFoto docId={m.docId} caja={m.caja} />
            <span className="block truncate px-2 py-1 text-sm tabular-nums text-[var(--text-secondary)]">
              {horaLima(m.at)} · {m.camaraNombre}
            </span>
          </li>
        ))}
      </ul>

      {g.marcador === null && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
            ¿Es el mismo que otro?
            <InfoTip
              title="Unir visitantes"
              what="Si dos tarjetas son la misma persona, únelas: el conteo del día baja en uno y sus fotos quedan juntas."
              affects="Vale sólo para este día y para todos los equipos del negocio. No borra ni mueve fotos: se puede separar cuando quieras."
              example="«Visitante C» y «Visitante H» son el mismo operario: en C, «Es el mismo» sobre H."
            />
          </p>
          {g.parecidos.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Con ropa parecida">
              {g.parecidos.map((p) => {
                const pg = porClave.get(p.clave);
                return (
                  <li key={p.clave} className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 pr-2">
                    {pg && <RecorteFoto docId={pg.portada.docId} caja={pg.portada.caja} className="w-9 rounded" />}
                    <span className="text-sm">
                      <b className="block text-[var(--text-primary)]">{p.etiqueta}</b>
                      <span className="text-sm text-[var(--text-secondary)]">ropa parecida{pg ? ` · ${horaLima(pg.desde)}` : ""}</span>
                    </span>
                    <button type="button" disabled={ocupado} onClick={() => void unir(p.clave)} className={`${BTN} h-9`}>
                      <Combine className="h-4 w-4" aria-hidden /> Es el mismo
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`otro-${g.clave}`}>
              Otro visitante del día
            </label>
            <select
              id={`otro-${g.clave}`}
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              className="h-9 min-w-0 max-w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
            >
              <option value="">Elegir otro visitante…</option>
              {otros.map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.etiqueta} · {horaLima(x.desde)} · {x.camaras.join(" y ")}
                </option>
              ))}
            </select>
            <button type="button" disabled={ocupado || !otro} onClick={() => void unir(otro)} className={`${BTN} h-9`}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Combine className="h-4 w-4" aria-hidden />} Unir
            </button>
            {g.unidos.map((clave, i) => (
              <button key={clave} type="button" disabled={ocupado} onClick={() => void hacer("DELETE", { clave })} className={`${BTN} h-9`}>
                <Undo2 className="h-4 w-4" aria-hidden /> Separar unión {g.unidos.length > 1 ? i + 1 : ""}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--data-error-ink)]">
              No se pudo guardar: {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
