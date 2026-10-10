"use client";

/**
 * «Contar ahora» / «Probar con una foto» (ADR-480): lo que pone en marcha la
 * lectura de los marcadores y muestra qué leyó, con cuántos px por celda.
 * Esa cifra es la de la prueba de 3/5/8 m: ≥4 holgado, 3 justo, menos al
 * límite (el marcador tiene 6 celdas por lado).
 */

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { esIdDePrueba, pxPorCelda, veredictoLectura, type VeredictoLectura } from "@/lib/camaras/marcadores";
import { formatNumber } from "@/lib/format";
import { BTN, CHIP_BASE, CHIP_TONO, ICONO_TONO, type Tono } from "./camaras-ui";
import { FOTOS_CONTAR, useContarMarcadores, type ResultadoConteo } from "./use-contar-marcadores";

const TONO: Record<VeredictoLectura, Tono> = { holgado: "ok", justo: "aviso", corto: "alerta" };
const PALABRA: Record<VeredictoLectura, string> = { holgado: "holgado", justo: "justo", corto: "al límite" };
const CLAVE_CAMARA = "camaras-marcadores-camara";

function Resultado({ r }: { r: ResultadoConteo }) {
  const vistos = r.marcadores.filter((m) => m.confirmado);
  return (
    <div className="space-y-1.5" data-testid="marcadores-resultado">
      <p className="text-sm text-[var(--text-secondary)]">
        {vistos.length === 0
          ? `No leyó ningún marcador en ${r.fotos === 1 ? "la foto" : `${r.fotos} fotos`} (${r.ancho}×${r.alto}).`
          : `${vistos.length} ${vistos.length === 1 ? "marcador" : "marcadores"} en ${r.fotos === 1 ? "la foto" : `${r.fotos} fotos`} (${r.ancho}×${r.alto})${r.guardada ? " · guardado en el día" : " · prueba, no se guarda"}.`}
      </p>
      {r.marcadores.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {r.marcadores.map((m) => {
            const v = veredictoLectura(m.ladoPx);
            return (
              <li
                key={m.id}
                className={`${CHIP_BASE} ${CHIP_TONO[m.confirmado ? TONO[v] : "neutro"]}`}
                title={m.confirmado ? undefined : "Salió en una sola foto: no cuenta"}
              >
                <span className={`font-bold ${ICONO_TONO[TONO[v]]}`}>#{m.id}</span>
                {esIdDePrueba(m.id) && <span>prueba</span>}
                <span>
                  {formatNumber(pxPorCelda(m.ladoPx), 1)} px/celda · {PALABRA[v]}
                  {r.origen === "camara" ? ` · ${m.cuadros}/${r.fotos}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ContarAhora({ esHoy, onContado }: { esHoy: boolean; onContado: () => void }) {
  const c = useContarMarcadores(true);
  const conFoto = (c.camaras ?? []).filter((x) => x.sacaFoto);
  const [elegida, setElegida] = useState<string>("");
  const archivo = useRef<HTMLInputElement>(null);

  /* La que lee marcadores primero (el servidor ya la ordena); si no, la última elegida en este equipo. */
  useEffect(() => {
    if (elegida || conFoto.length === 0) return;
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(CLAVE_CAMARA);
    } catch {
      /* modo privado */
    }
    setElegida(conFoto.find((x) => x.id === guardada)?.id ?? conFoto[0]!.id);
  }, [conFoto, elegida]);

  const elegir = (id: string) => {
    setElegida(id);
    try {
      localStorage.setItem(CLAVE_CAMARA, id);
    } catch {
      /* sin almacenamiento */
    }
  };

  const ocupado = c.fase !== "quieto";
  const progreso =
    c.fase === "motor"
      ? "Cargando el lector (la primera vez baja 4 MB)…"
      : c.fase === "guardando"
        ? "Guardando el conteo…"
        : `Pidiendo fotos a la cámara: ${c.hechas} de ${FOTOS_CONTAR}…`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {esHoy && conFoto.length > 1 && (
          <select
            value={elegida}
            onChange={(e) => elegir(e.target.value)}
            aria-label="Cámara que cuenta"
            className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
          >
            {conFoto.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        )}
        {esHoy && conFoto.length > 0 && (
          <button
            type="button"
            disabled={ocupado || !elegida}
            onClick={async () => {
              if (await c.contar(elegida)) onContado();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            Contar ahora
          </button>
        )}
        <button type="button" disabled={ocupado} onClick={() => archivo.current?.click()} className={BTN}>
          <ImagePlus className="h-4 w-4" aria-hidden />
          Probar con una foto
        </button>
        <input
          ref={archivo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="marcadores-foto"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void c.probarFoto(f);
          }}
        />
        <InfoTip
          title="Cómo cuenta la cámara"
          what={`«Contar ahora» le pide ${FOTOS_CONTAR} fotos en HD a la cámara (unos 12 s) y cuenta los marcadores que salen en al menos 2. «Probar con una foto» sólo muestra lo que lee, sin guardar.`}
          affects="Px por celda: 4 o más se lee holgado, 3 justo, menos está al límite (puede fallar con sol o barro). Con 18 cm de cuadrado, en HD alcanza hasta unos 5 m."
          example="#37 · 5,2 px/celda · holgado · 3/3 = la troza del marcador 37 se ve bien en las tres fotos."
        />
        {esHoy && c.camaras && conFoto.length === 0 && (
          <span className="text-xs text-[var(--text-tertiary)]">Enlaza la cámara con Hik-Connect para contar desde aquí.</span>
        )}
      </div>
      {ocupado && (
        <p aria-live="polite" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {progreso}
        </p>
      )}
      {c.error && !ocupado && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">
          {c.error}
        </p>
      )}
      {c.resultado && !ocupado && <Resultado r={c.resultado} />}
    </div>
  );
}
