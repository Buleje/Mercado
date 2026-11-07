"use client";

/**
 * Contacto y referencia (plegable): el Yape o Plin —con «es el mismo que el
 * celular», que es lo de casi siempre—, el correo y un contacto de referencia
 * (a quién llamar si la persona no contesta).
 */
import Plegable from "@/components/admin/shared/Plegable";
import { Casilla } from "@/components/ui-system/Casilla";
import { celularLegible } from "@/lib/adelantos/recibo-whatsapp";
import { Field } from "../../shared";
import { PieRevision } from "./piezas";
import { CAMPO, campo } from "./clases";
import type { DatosPersona } from "./datos";
import { revisarCelular, soloDigitos } from "./validacion";

type Props = {
  d: DatosPersona;
  set: <K extends keyof DatosPersona>(k: K, v: DatosPersona[K]) => void;
};

function resumenDe(d: DatosPersona): string {
  const yape = d.yapeIgualCelular ? d.telefono : d.yape;
  const revYape = revisarCelular(yape);
  const revRef = revisarCelular(d.referenciaTelefono);
  if (revYape.estado === "mal" || revYape.estado === "escribiendo") return "Revisa el Yape o Plin";
  if (revRef.estado === "mal" || revRef.estado === "escribiendo") return "Revisa el celular de la referencia";
  const partes = [
    revYape.estado === "ok" ? `Yape ${celularLegible(soloDigitos(yape).slice(-9))}` : null,
    d.email.trim() || null,
    d.referenciaNombre.trim() ? `Referencia: ${d.referenciaNombre.trim()}` : null,
  ].filter(Boolean);
  return partes.join(" · ") || "Sin Yape ni referencia todavía";
}

export default function SeccionContacto({ d, set }: Props) {
  const revYape = revisarCelular(d.yapeIgualCelular ? d.telefono : d.yape);
  const revRef = revisarCelular(d.referenciaTelefono);
  const sinCelular = !d.telefono.trim();

  return (
    <Plegable clave="adelantos:alta-persona:contacto" titulo="Contacto y referencia" resumen={resumenDe(d)}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Yape o Plin">
              <input
                value={d.yapeIgualCelular ? d.telefono : d.yape}
                onChange={(e) => set("yape", e.target.value)}
                disabled={d.yapeIgualCelular}
                inputMode="tel"
                autoComplete="off"
                placeholder="9XX XXX XXX"
                aria-invalid={revYape.estado === "mal" || undefined}
                className={campo(revYape.estado === "mal", "tabular-nums")}
              />
              <PieRevision revision={revYape} />
            </Field>
            {/* Marcada, copia el celular y lo sigue: si se corrige el celular, el Yape también.
                Al desmarcar queda la copia, para editarla desde ahí. */}
            <Casilla
              etiqueta="Es el mismo que el celular"
              checked={d.yapeIgualCelular}
              disabled={sinCelular && !d.yapeIgualCelular}
              onChange={(e) => {
                if (!e.target.checked) set("yape", d.telefono);
                set("yapeIgualCelular", e.target.checked);
              }}
            />
          </div>
          <Field label="Correo">
            <input
              type="email"
              value={d.email}
              onChange={(e) => set("email", e.target.value)}
              inputMode="email"
              autoComplete="off"
              placeholder="nombre@correo.com"
              className={CAMPO}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contacto de referencia">
            <input
              value={d.referenciaNombre}
              onChange={(e) => set("referenciaNombre", e.target.value)}
              maxLength={120}
              autoComplete="off"
              placeholder="Nombre y qué es (esposa, hermano…)"
              className={CAMPO}
            />
          </Field>
          <Field label="Celular de la referencia">
            <input
              value={d.referenciaTelefono}
              onChange={(e) => set("referenciaTelefono", e.target.value)}
              inputMode="tel"
              autoComplete="off"
              placeholder="9XX XXX XXX"
              aria-invalid={revRef.estado === "mal" || undefined}
              className={campo(revRef.estado === "mal", "tabular-nums")}
            />
            <PieRevision revision={revRef} />
          </Field>
        </div>
      </div>
    </Plegable>
  );
}
