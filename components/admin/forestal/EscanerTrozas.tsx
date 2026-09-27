"use client";

/**
 * «Escanear para trabajar» (Brandon, 2026-09-26): la troza queda marcada sin
 * buscarla en la tabla.
 *
 * Dos entradas, el mismo camino:
 *   · la PISTOLA lectora es un teclado: tipea el código en el campo y da Enter;
 *   · la CÁMARA del celular (`BarcodeScanner`, QR + Code128) en modo continuo:
 *     se escanea la pila de corrido y el resultado sale debajo del video.
 *
 * Qué troza es lo decide `leer-escaneo-troza.ts` (puro, con test). Qué se hace
 * con ella lo decide la pantalla (`onTroza`): tildarla, marcarla como llegada…
 * Un código que está en dos trozas NO se elige a ciegas: se ofrecen las dos.
 */

import { useCallback, useId, useRef, useState } from "react";
import { Camera, ScanBarcode } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  VENTANA_FICHA_MS,
  buscarTrozaEscaneada,
  esEcoDeEtiqueta,
  esFichaDeTroza,
  esLineaDeFicha,
  leerEscaneo,
} from "@/lib/forestal/leer-escaneo-troza";
import {
  CamaraEscaneo,
  LineaResultado,
  nombreDeTroza,
  type Aviso,
  type Tono,
  type TrozaDelEscaner,
} from "./escaner-trozas-partes";

export {
  bloqueoDeConsumo,
  CamaraEscaneo,
  nombreDeTroza,
  type Tono,
  type TrozaDelEscaner,
} from "./escaner-trozas-partes";

export default function EscanerTrozas<T extends TrozaDelEscaner>({
  trozas,
  onTroza,
  yaElegidas,
  bloqueo,
  accion = "tildada",
  total,
  mostrarCuenta = true,
  avisoAlTomar,
  onDesconocido,
  className,
}: {
  /** Entre cuáles se busca lo escaneado. */
  trozas: readonly T[];
  /** Qué hace la pantalla con la troza reconocida (tildarla, marcarla…). */
  onTroza: (t: T) => void;
  /** Las que ya están marcadas: se avisa «ya estaba» y no se toca nada. */
  yaElegidas?: ReadonlySet<string>;
  /** Por qué esa troza no se puede tomar acá. `null` = se puede. */
  bloqueo?: (t: T) => string | null;
  /** El participio del aviso: «Troza 118 · Tornillo {accion}». */
  accion?: string;
  /** Para el contador «3 de 25». */
  total?: number;
  /** `false` cuando la pantalla lleva su propia cuenta (el conteo del patio). */
  mostrarCuenta?: boolean;
  /** El aviso de una troza tomada, si la pantalla quiere decir otra cosa que
   *  «tildada» (el conteo avisa «sorpresa: ya entró a otra corrida»). */
  avisoAlTomar?: (t: T) => { tono: Tono; mensaje: string } | null;
  /** Un código que no está en la lista. Si devuelve un texto, ese es el aviso. */
  onDesconocido?: (codigo: string) => string | void;
  className?: string;
}) {
  const campoId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<Aviso<T> | null>(null);
  const [escaneadas, setEscaneadas] = useState<ReadonlySet<string>>(new Set());
  const [camara, setCamara] = useState(false);
  const contador = useRef(0);
  /** La última troza aceptada y cuándo: el 2º código de su etiqueta no es otra lectura. */
  const ultimaRef = useRef<{ id: string; en: number } | null>(null);
  /** Hasta cuándo lo que llega es el resto de una ficha que la pistola sigue tipeando. */
  const fichaHastaRef = useRef(0);

  const avisar = useCallback((tono: Tono, mensaje: string, candidatas?: T[]) => {
    contador.current += 1;
    setAviso({ tono, mensaje, candidatas, n: contador.current });
  }, []);

  const aplicar = useCallback(
    (t: T) => {
      const nombre = nombreDeTroza(t);
      /* Sin `yaElegidas` (recepción), «ya estaba» es lo escaneado en esta tanda. */
      if ((yaElegidas ?? escaneadas).has(t.id)) return avisar("ya", `Troza ${nombre}: ya estaba.`);
      const motivo = bloqueo?.(t) ?? null;
      if (motivo)
        return avisar(
          "no",
          `Troza ${nombre} no se puede: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}.`,
        );
      onTroza(t);
      ultimaRef.current = { id: t.id, en: Date.now() };
      setEscaneadas((prev) => new Set(prev).add(t.id));
      const propio = avisoAlTomar?.(t);
      if (propio) return avisar(propio.tono, propio.mensaje);
      avisar("ok", `Troza ${nombre} ${accion}.`);
    },
    [yaElegidas, escaneadas, bloqueo, onTroza, accion, avisar, avisoAlTomar],
  );

  const procesar = useCallback(
    (crudo: string) => {
      /* Una pistola 2D en modo teclado tipea la ficha del QR grande línea por
         línea: la primera (`TROZA 118`) ya trajo la pieza; `Titular: …` y las
         demás no son códigos y no deben avisar «ninguna troza». */
      const enFicha = Date.now() < fichaHastaRef.current;
      if (esLineaDeFicha(crudo)) {
        /* Tipear la ficha entera le lleva 1-3 s a la pistola: el eco de la
           misma etiqueta (su QR chico o sus barras) se mide desde la última
           línea, no desde la primera. */
        if (ultimaRef.current) ultimaRef.current = { ...ultimaRef.current, en: Date.now() };
        fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
        return;
      }
      if (esFichaDeTroza(crudo)) fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
      const lectura = leerEscaneo(crudo);
      if (!lectura) {
        if (enFicha) return;
        if (esFichaDeTroza(crudo)) avisar("no", "Esa troza no tiene código: escanea su QR chico.");
        else if (crudo.trim()) avisar("no", "Eso no es el código de una troza.");
        return;
      }
      const r = buscarTrozaEscaneada(trozas, lectura);
      /* QR y Code128 de la MISMA etiqueta leídos seguidos: el segundo no es
         «ya estaba», es la misma troza. Se calla (ADR-436). */
      const ultima = ultimaRef.current;
      const ahora = Date.now();
      if (r.estado === "una" && esEcoDeEtiqueta(ultima, r.troza.id, ahora)) return;
      if (r.estado === "varias" && r.trozas.some((t) => esEcoDeEtiqueta(ultima, t.id, ahora))) return;
      if (r.estado === "una") return aplicar(r.troza);
      if (r.estado === "varias") {
        return avisar(
          "varias",
          `El código ${lectura.tipo === "codigo" ? lectura.codigo : ""} está en ${r.trozas.length} trozas: elige cuál.`,
          r.trozas,
        );
      }
      /* El resto de una ficha tipeada sin sus íconos: no es un código perdido. */
      if (enFicha && lectura.tipo === "codigo") {
        fichaHastaRef.current = Date.now() + VENTANA_FICHA_MS;
        return;
      }
      const propio = onDesconocido?.(lectura.tipo === "id" ? lectura.id : lectura.codigo);
      avisar(
        "no",
        propio ||
          (lectura.tipo === "id"
            ? "Esa etiqueta es de una troza que no está en esta lista."
            : `Ninguna troza con el código ${lectura.codigo} en esta lista.`),
      );
    },
    [trozas, aplicar, avisar, onDesconocido],
  );

  const cerrarCamara = useCallback(() => {
    setCamara(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const cuenta = total != null ? `${escaneadas.size} de ${total}` : `${escaneadas.size}`;

  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3",
        className,
      )}
      data-escaner-trozas
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor={campoId}
          className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]"
        >
          <ScanBarcode
            className="hidden h-5 w-5 shrink-0 text-[var(--text-tertiary)] sm:block"
            aria-hidden
          />
          <span className="sr-only">Escanear o tipear el código de una troza</span>
          <input
            id={campoId}
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              /* La pistola termina cada lectura con Enter: se procesa, se
                 vacía y el foco se queda acá para la siguiente pieza. */
              e.preventDefault();
              e.stopPropagation();
              procesar(texto);
              setTexto("");
            }}
            placeholder="Escanear o tipear código"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent dark:bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:[box-shadow:none]! focus-visible:outline-none!"
          />
        </label>
        <button
          type="button"
          onClick={() => setCamara(true)}
          aria-label="Escanear con la cámara"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-600)]"
        >
          <Camera className="h-5 w-5" aria-hidden />
        </button>
        <InfoTip
          title="Escanear trozas"
          what="Apunta la pistola a la etiqueta (o tipea el código y Enter): la troza queda marcada sin buscarla."
          affects="Lee el QR de la etiqueta, el código de barras y el código de planta o del bosque. Si el código está en dos trozas, te pregunta cuál."
          example="Escaneas la 118 → «Troza 118 · Tornillo tildada». Con la cámara del celular, sigues escaneando la pila de corrido."
          side="left"
        />
      </div>

      <div role="status" aria-live="polite" className="space-y-2">
        {aviso && <LineaResultado key={aviso.n} aviso={aviso} onElegir={aplicar} />}
        {mostrarCuenta && escaneadas.size > 0 && (
          <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
            {cuenta} escaneada{escaneadas.size === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {camara && (
        <CamaraEscaneo
          continuo
          onLectura={procesar}
          onCerrar={cerrarCamara}
          pie={
            <div className="space-y-1">
              {aviso ? (
                <LineaResultado key={aviso.n} aviso={aviso} onElegir={aplicar} />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Apunta a la etiqueta de la troza.
                </p>
              )}
              {mostrarCuenta && (
                <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {cuenta} escaneada{escaneadas.size === 1 ? "" : "s"}
                </p>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
