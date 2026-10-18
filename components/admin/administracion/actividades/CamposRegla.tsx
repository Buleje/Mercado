"use client";

/**
 * CamposRegla — qué revisa la actividad (asistencia, aserrío, gastos…), cómo
 * sabe el panel que ya se hizo y lo que pide cada tipo: el mínimo de la
 * asistencia, qué se mira en gastos, la cuenta del tercero.
 */
import { useEffect, useId, useState } from "react";
import { CAMPO_ALTO, claseChip } from "@/components/admin/planificacion/piezas/clases";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { OBJETIVO_POR_REGLA } from "@/lib/agenda/schemas";
import type { ObjetivoActividad } from "@/lib/agenda/tipos";
import { pedirJson } from "../agenda-api";
import { ORDEN_REGLAS, REGLA_UI } from "../comun/reglas";
import type { Borrador } from "./use-actividad-form";

type Cambiar = <K extends keyof Borrador>(campo: K, valor: Borrador[K]) => void;

const QUE_REVISA = [
  { clave: "gastos", rotulo: "Gastos" },
  { clave: "ingresos", rotulo: "Ingresos" },
  { clave: "caja_cerrada", rotulo: "Caja cerrada" },
  { clave: "cuenta_forestal", rotulo: "Cuenta forestal" },
] as const;

interface Props {
  b: Borrador;
  cambiar: Cambiar;
  cambiarRegla: (regla: Borrador["regla"]) => void;
}

export function CamposRegla({ b, cambiar, cambiarRegla }: Props) {
  const id = useId();
  const p = b.parametros;
  const ponerParametro = (clave: string, valor: unknown) => cambiar("parametros", { ...p, [clave]: valor });
  const pide = OBJETIVO_POR_REGLA[b.regla];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span id={`${id}-tipo`} className="block text-sm font-semibold text-[var(--text-secondary)]">
          Qué hay que hacer
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-tipo`} className="grid gap-2 sm:grid-cols-2">
          {ORDEN_REGLAS.map((regla) => {
            const ui = REGLA_UI[regla];
            const Icono = ui.icon;
            const activo = b.regla === regla;
            return (
              <button
                key={regla}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => cambiarRegla(regla)}
                className={cn(claseChip(activo), "w-full justify-start rounded-xl text-left")}
              >
                <Icono className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{ui.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">{REGLA_UI[b.regla].comoSabe}</p>
      </div>

      {b.regla === "asistencia" && (
        <Opciones
          titulo="Cuándo cuenta como hecha"
          valor={p.minimo === "alguno" ? "alguno" : "todos"}
          opciones={[
            { clave: "todos", rotulo: "Marcaron todos" },
            { clave: "alguno", rotulo: "Marcó al menos uno" },
          ]}
          onCambiar={(v) => ponerParametro("minimo", v)}
        />
      )}
      {b.regla === "facturas" && (
        <Opciones
          titulo="Qué toca"
          valor={p.modo === "contador" ? "contador" : "emitir"}
          opciones={[
            { clave: "emitir", rotulo: "Emitir los comprobantes" },
            { clave: "contador", rotulo: "Llevarlas al contador" },
          ]}
          onCambiar={(v) => ponerParametro("modo", v)}
        />
      )}
      {b.regla === "servicio_aserrio" && (
        <label className="flex min-h-12 items-center gap-3 text-sm text-[var(--text-primary)]">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={p.soloTerceros === true} onChange={(e) => ponerParametro("soloTerceros", e.target.checked)} />
          Contar sólo el aserrío que haces a terceros
        </label>
      )}
      {b.regla === "gastos_ingresos" && (
        <QueRevisa valor={Array.isArray(p.que) ? (p.que as string[]) : []} onCambiar={(que) => ponerParametro("que", que)} />
      )}
      {pide && <ElegirObjetivo tipo={pide.tipo} exige={pide.modo === "exige"} valor={b.objetivo} b={b} cambiar={cambiar} />}
    </div>
  );
}

function Opciones({ titulo, valor, opciones, onCambiar }: { titulo: string; valor: string; opciones: { clave: string; rotulo: string }[]; onCambiar: (v: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-semibold text-[var(--text-secondary)]">
        {titulo}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <button key={o.clave} type="button" role="radio" aria-checked={valor === o.clave} className={claseChip(valor === o.clave)} onClick={() => onCambiar(o.clave)}>
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

function QueRevisa({ valor, onCambiar }: { valor: string[]; onCambiar: (que: string[]) => void }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-semibold text-[var(--text-secondary)]">
        Qué se revisa ese día
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {QUE_REVISA.map((q) => {
          const activo = valor.includes(q.clave);
          return (
            <button
              key={q.clave}
              type="button"
              aria-pressed={activo}
              className={claseChip(activo)}
              onClick={() => onCambiar(activo ? valor.filter((x) => x !== q.clave) : [...valor, q.clave])}
            >
              {q.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Persona {
  clave: string;
  nombre: string;
  beneficiarioId: string | null;
  parteId: string | null;
}

/** Las cuentas de Adelantos y del directorio forestal, en una lista (GET /api/adelantos/cuentas). */
function usePersonas() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void pedirJson<{ personas?: Persona[] }>("/api/adelantos/cuentas").then((r) => {
      if (!vivo) return;
      setPersonas(r.ok ? (r.data?.personas ?? []) : []);
      setError(r.ok ? null : r.error);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { personas, error };
}

function ElegirObjetivo({ tipo, exige, valor, b, cambiar }: { tipo: ObjetivoActividad["tipo"]; exige: boolean; valor: ObjetivoActividad | null; b: Borrador; cambiar: Cambiar }) {
  const { personas, error } = usePersonas();
  const opciones = (personas ?? [])
    .map((p) => ({ id: tipo === "parte" ? p.parteId : p.beneficiarioId, nombre: p.nombre }))
    .filter((o): o is { id: string; nombre: string } => Boolean(o.id))
    .sort((a, c) => a.nombre.localeCompare(c.nombre, "es"));
  const elegir = (idElegido: string) => {
    const o = opciones.find((x) => x.id === idElegido);
    const objetivo = o ? { tipo, id: o.id, nombre: o.nombre.slice(0, 160) } : null;
    cambiar("objetivo", objetivo);
    if (objetivo && tipo === "parte" && (b.nombre.trim() === "" || b.nombre === REGLA_UI.cuenta_tercero.label || b.nombre.startsWith("Revisar la cuenta de "))) {
      cambiar("nombre", `Revisar la cuenta de ${objetivo.nombre}`.slice(0, 80));
    }
  };
  const etiqueta = tipo === "parte" ? "De quién es la cuenta" : "De quién (opcional)";
  const pista = error
    ? error
    : personas && opciones.length === 0
      ? tipo === "parte"
        ? "Todavía no hay cuentas corrientes en Adelantos ni en el directorio."
        : "Todavía no hay beneficiarios en Adelantos."
      : tipo === "parte"
        ? "La cuenta corriente que vas a revisar"
        : "Vacío = mira todos los adelantos";
  return (
    <Field label={etiqueta} required={exige} hint={pista}>
      <select className={CAMPO_ALTO} value={valor?.id ?? ""} onChange={(e) => elegir(e.target.value)} disabled={personas === null}>
        <option value="">{personas === null ? "Cargando…" : exige ? "Elige la cuenta" : "Todos los adelantos"}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </Field>
  );
}
