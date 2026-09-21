"use client";

/**
 * Punto de acopio de una parte: dónde se carga el camión.
 *
 * No es la dirección legal. El RUC declara una oficina en la ciudad y la madera
 * se carga en una quebrada a tres horas: el flete, el aviso al transportista y
 * el tiempo de viaje salen de ESTE punto, no del de la ficha.
 *
 * Se carga pegando: en el campo nadie tipea coordenadas, las comparte por
 * WhatsApp (`-8.379100, -74.553900`) o manda el link de Google Maps. Dos campos
 * numéricos separados garantizaban que el dato no se cargara nunca.
 */

import { useState } from "react";
import { MapPin, ExternalLink, X } from "@buleje/design-system/icons";
import {
  formatearCoordenadas,
  linkDelMapa,
  motivoCoordenadaSospechosa,
  parsearCoordenadas,
  type Coordenadas,
} from "@/lib/forestal/directorio";
import { Field, I } from "./ctp-shared";

export default function CtpPartePuntoAcopio({
  lat,
  lng,
  referencia,
  onCambio,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  referencia: string;
  onCambio: (v: { acopioLat?: number | null; acopioLng?: number | null; acopioReferencia?: string }) => void;
}) {
  const punto: Coordenadas | null = lat != null && lng != null ? { lat, lng } : null;
  const [pegado, setPegado] = useState("");
  const [error, setError] = useState<string | null>(null);

  const aviso = motivoCoordenadaSospechosa(punto);

  function tomar(texto: string) {
    setPegado(texto);
    if (!texto.trim()) {
      setError(null);
      return;
    }
    const c = parsearCoordenadas(texto);
    if (!c) {
      setError("No encontré coordenadas ahí. Pega dos números o el link de Google Maps.");
      return;
    }
    setError(null);
    setPegado("");
    onCambio({ acopioLat: c.lat, acopioLng: c.lng });
  }

  return (
    <>
      <Field
        label="Punto de acopio"
        span={8}
        hint={error ?? "Pega las coordenadas del WhatsApp o el link de Google Maps"}
      >
        {punto ? (
          <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums text-[var(--text-primary)]">
              {formatearCoordenadas(punto)}
            </span>
            <a
              href={linkDelMapa(punto)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-info-700)] hover:underline"
            >
              Ver en el mapa
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => onCambio({ acopioLat: null, acopioLng: null })}
              aria-label="Quitar el punto de acopio"
              title="Quitar"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <input
            type="text"
            className={`${I} ${error ? "border-[var(--data-error-500)]" : ""}`}
            value={pegado}
            onChange={(e) => tomar(e.target.value)}
            onPaste={(e) => tomar(e.clipboardData.getData("text"))}
            placeholder="-8.379100, -74.553900"
            aria-invalid={error ? true : undefined}
          />
        )}
      </Field>

      <Field label="Cómo se llega" span={4} hint="En palabras: «km 42, entrada a la derecha»">
        <input
          type="text"
          className={I}
          value={referencia}
          onChange={(e) => onCambio({ acopioReferencia: e.target.value })}
        />
      </Field>

      {/* El error de verdad no es escribir mal: es pegarlas invertidas y que el
          punto caiga en el mar sin que nadie lo note hasta que sale el camión. */}
      {aviso && (
        <p className="sm:col-span-12 -mt-1 text-xs font-semibold text-[var(--data-warning-700)]">{aviso}</p>
      )}
    </>
  );
}
