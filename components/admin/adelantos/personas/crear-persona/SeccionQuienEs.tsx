"use client";

/**
 * «Quién es»: lo único que no se pliega. Qué es para el negocio (chips de una
 * sola elección), el nombre, el celular con su revisión en vivo y, si es una
 * persona (no un RUC de empresa), la fecha de nacimiento y la foto del DNI.
 */
import { button } from "@/components/ui-system/button-variants";
import { celularLegible } from "@/lib/adelantos/recibo-whatsapp";
import { avisoDeDuplicado } from "@/lib/adelantos/persona-validacion";
import { cn } from "@/lib/utils";
import { Field } from "../../shared";
import { AvisoDuplicado } from "./AvisoDuplicado";
import FotoDocumento from "./FotoDocumento";
import { PieRevision, TarjetaSeccion } from "./piezas";
import { CAMPO, campo } from "./clases";
import { TIPOS_RELACION } from "./datos";
import { edadDe, revisarCelular, revisarFechaNacimiento, soloDigitos } from "./validacion";
import type { PersonaForm } from "./use-persona-form";

/** Chip a 48 px armado con `button()` (ADR-489); el elegido, en el turquesa suave. */
const chip = (activo: boolean) =>
  button({
    variant: "secondary",
    className: cn(
      "px-4 font-semibold",
      activo
        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] hover:border-[var(--accent)] dark:text-[var(--accent)]"
        : "text-[var(--text-secondary)]",
    ),
  });

export default function SeccionQuienEs({ f }: { f: PersonaForm }) {
  const { d, set, empresa, hoy, duplicado } = f;
  const revTel = revisarCelular(d.telefono);
  const revFecha = revisarFechaNacimiento(d.fechaNacimiento, hoy);
  const edad = revFecha.estado === "ok" ? edadDe(d.fechaNacimiento, hoy) : null;
  const nueve = soloDigitos(d.telefono).slice(-9);

  return (
    <TarjetaSeccion titulo="Quién es">
      <Field
        label="Qué es para el negocio"
        grupo
        info={{
          what: "Para ordenar la lista y saber a quién le das adelantos.",
          example: "Un aserrador del patio → Trabajador. Quien te vende trozas → Proveedor de madera.",
        }}
      >
        <div className="flex flex-wrap gap-2">
          {TIPOS_RELACION.map((t) => {
            const activo = d.tipoRelacion === t.valor;
            return (
              <button
                key={t.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => set("tipoRelacion", activo ? "" : t.valor)}
                className={chip(activo)}
              >
                {t.rotulo}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={empresa ? "Razón social o nombre comercial" : "Nombre"}>
          <input
            value={d.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            autoComplete="off"
            placeholder={empresa ? "Lo trae SUNAT" : "Lo trae RENIEC con el DNI"}
            className={CAMPO}
          />
        </Field>
        <Field label="Celular">
          <input
            value={d.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="9XX XXX XXX"
            aria-invalid={revTel.estado === "mal" || undefined}
            className={campo(revTel.estado === "mal", "tabular-nums")}
          />
          <PieRevision
            revision={revTel}
            ayuda="Para mandarle el recibo por WhatsApp."
            okTexto={`${celularLegible(nueve)} · le llega el recibo por WhatsApp`}
          />
        </Field>
      </div>

      {duplicado && duplicado.motivo !== "documento" && (
        <AvisoDuplicado texto={avisoDeDuplicado(duplicado)} onAbrir={() => f.abrirExistente(duplicado.persona.id)} />
      )}

      {!empresa && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha de nacimiento">
            <input
              type="date"
              value={d.fechaNacimiento}
              onChange={(e) => set("fechaNacimiento", e.target.value)}
              min="1900-01-01"
              max={hoy}
              aria-invalid={revFecha.estado === "mal" || undefined}
              className={campo(revFecha.estado === "mal", "tabular-nums")}
            />
            <PieRevision revision={revFecha} okTexto={edad != null ? `${edad} años` : undefined} />
          </Field>
          <FotoDocumento
            personaId={f.actual?.id}
            tieneGuardada={!!f.actual?.tieneFotoDocumento}
            foto={f.foto}
            onFoto={f.setFoto}
            quitarGuardada={f.quitarFoto}
            onQuitarGuardada={f.setQuitarFoto}
          />
        </div>
      )}
    </TarjetaSeccion>
  );
}
