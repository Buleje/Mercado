"use client";

/**
 * Las cámaras de la cuenta de Hik-Connect for Teams y con cuál del sistema va
 * cada una (ADR-471). Enlazar la hace verse con «En vivo» dentro del panel;
 * el código de verificación (6 letras de la etiqueta) hace falta si el video
 * está cifrado — viaja cifrado al servidor y no vuelve.
 */

import { useState } from "react";
import { KeyRound, Link2, Loader2, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";
import type { CamaraHikPantalla, HikConnect } from "./use-hik-connect";

const CAMPO =
  "h-9 min-w-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

interface CamaraSistema {
  id: string;
  nombre: string;
}

/** Opción del selector: crear la cámara del sistema con el nombre de Hikvision y enlazarla. */
const NUEVA = "__nueva__";

export default function VincularHikConnectLista({
  hik,
  camaras,
  onCrear,
}: {
  hik: HikConnect;
  camaras: CamaraSistema[];
  onCrear?: (nombre: string) => Promise<string | null>;
}) {
  const lista = hik.camarasHik;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="mr-auto text-sm font-bold text-[var(--text-secondary)]">
          Cámaras de tu cuenta{lista ? ` (${lista.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => void hik.listar()}
          disabled={hik.trabajando === "lista"}
          className={BTN}
        >
          {hik.trabajando === "lista" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {lista ? "Recargar" : "Traer lista"}
        </button>
      </div>
      {lista && lista.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Hikvision dice que el equipo no tiene cámaras: tu cámara sigue en la cuenta personal. En
          el portal (modo equipo): Dispositivo → Agregar dispositivo → «Importar dispositivo
          personal» (la cámara tiene que estar en línea). Después toca «Recargar».
        </p>
      )}
      {lista && lista.length > 0 && (
        <ul className="space-y-2">
          {lista.map((c) => (
            <FilaHik key={c.resourceId} c={c} hik={hik} camaras={camaras} onCrear={onCrear} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaHik({
  c,
  hik,
  camaras,
  onCrear,
}: {
  c: CamaraHikPantalla;
  hik: HikConnect;
  camaras: CamaraSistema[];
  onCrear?: (nombre: string) => Promise<string | null>;
}) {
  /* Sin cámaras en el sistema, arranca en «Crear …»: antes había que ir a agregarla
     arriba y volver (Brandon se trabó ahí el 05-10). */
  const [destino, setDestino] = useState(
    camaras.find((x) => !hik.estado?.enlaces[x.id])?.id ??
      (onCrear ? NUEVA : (camaras[0]?.id ?? "")),
  );
  const [creando, setCreando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [editandoCodigo, setEditandoCodigo] = useState(false);
  const enlazadaA = c.enlazadaA ? camaras.find((x) => x.id === c.enlazadaA) : undefined;
  const enlace = c.enlazadaA ? hik.estado?.enlaces[c.enlazadaA] : undefined;
  const ocupado =
    hik.trabajando?.endsWith(c.resourceId) ||
    (c.enlazadaA ? hik.trabajando?.endsWith(c.enlazadaA) : false);
  const tono = c.enLinea === true ? "ok" : c.enLinea === false ? "alerta" : "neutro";

  const guardarCodigo = async () => {
    if (!c.enlazadaA) return;
    if (await hik.guardarCodigo(c.enlazadaA, codigo.trim() || null)) {
      setCodigo("");
      setEditandoCodigo(false);
    }
  };

  return (
    <li className="rounded-xl border border-[var(--rule-base)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
          {c.nombre}
        </span>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          serie •••• {c.serieFinal || "?"}
        </span>
        <span className={`${CHIP_BASE} ${CHIP_TONO[tono]}`}>
          {c.enLinea === true
            ? "En línea"
            : c.enLinea === false
              ? "Desconectada"
              : "Estado sin dato"}
        </span>
      </div>

      {enlazadaA ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-auto text-[var(--text-secondary)]">
            Enlazada con <b className="text-[var(--text-primary)]">«{enlazadaA.nombre}»</b> ·{" "}
            {enlace?.conCodigo ? "código cargado" : "sin código"}
          </span>
          <button
            type="button"
            onClick={() => setEditandoCodigo((e) => !e)}
            className={BTN}
            aria-expanded={editandoCodigo}
          >
            <KeyRound className="h-4 w-4" aria-hidden /> Código
          </button>
          <button
            type="button"
            onClick={() => c.enlazadaA && void hik.desenlazar(c.enlazadaA)}
            disabled={ocupado}
            className={BTN}
            title="Quitar el enlace (la cámara del sistema y sus fotos quedan)"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Quitar
          </button>
        </div>
      ) : (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!destino) return;
            void (async () => {
              let id: string | null = destino;
              if (destino === NUEVA) {
                if (!onCrear) return;
                setCreando(true);
                id = await onCrear(c.nombre).finally(() => setCreando(false));
                if (!id) return;
              }
              if (await hik.enlazar(id, c.resourceId, codigo.trim() || undefined)) setCodigo("");
            })();
          }}
        >
          <label className="flex w-full min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)] sm:w-auto sm:flex-1">
            <span className="shrink-0">Es</span>
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className={`${CAMPO} flex-1`}
              aria-label={`Cámara del sistema para ${c.nombre}`}
            >
              {onCrear && <option value={NUEVA}>+ Crear «{c.nombre}» en el sistema</option>}
              {!onCrear && camaras.length === 0 && (
                <option value="">Primero agrega una cámara arriba</option>
              )}
              {camaras.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                  {hik.estado?.enlaces[x.id] ? " (ya enlazada)" : ""}
                </option>
              ))}
            </select>
          </label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código"
            maxLength={12}
            autoComplete="off"
            aria-label="Código de verificación de la etiqueta"
            className={`${CAMPO} flex-1 font-mono uppercase placeholder:font-sans placeholder:normal-case sm:w-28 sm:flex-none`}
          />
          <button type="submit" disabled={!destino || ocupado || creando} className={BTN}>
            {ocupado || creando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden />
            )}
            Enlazar
          </button>
        </form>
      )}

      {enlazadaA && editandoCodigo && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guardarCodigo();
          }}
        >
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="6 letras de la etiqueta"
            maxLength={12}
            autoComplete="off"
            aria-label="Código de verificación de la etiqueta"
            className={`${CAMPO} w-44 font-mono uppercase placeholder:font-sans placeholder:normal-case`}
          />
          <button type="submit" disabled={ocupado} className={BTN}>
            Guardar código
          </button>
          {enlace?.conCodigo && (
            <button
              type="button"
              onClick={() => void hik.guardarCodigo(c.enlazadaA as string, null)}
              disabled={ocupado}
              className={BTN}
            >
              Borrar código
            </button>
          )}
          <span className="w-full text-xs text-[var(--text-tertiary)]">
            Sin código, una cámara con el video cifrado no se ve. También puedes apagar «Cifrado de
            video» en la app.
          </span>
        </form>
      )}
    </li>
  );
}
