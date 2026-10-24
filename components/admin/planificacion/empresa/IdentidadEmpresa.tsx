"use client";

/**
 * Empresa › Misión y valores (ADR-497): para qué existe el negocio, a dónde
 * va, en qué no transa, por qué lo eligen y la frase que lo resume. Los
 * ejemplos van en el ⓘ de cada campo, no a la vista.
 */
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import type { DatosSeccion } from "@/lib/planificacion/secciones";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { CAMPO, CAMPO_AREA, Campo } from "./campos-plan";
import { AYUDA_IDENTIDAD } from "./textos-empresa";

type Identidad = DatosSeccion<"identidad">;
type Valor = Identidad["valores"][number];
type CampoLargo = "mision" | "vision" | "propuestaValor" | "clienteIdeal" | "diferenciadores";

const LARGOS: { k: CampoLargo; rotulo: string }[] = [
  { k: "mision", rotulo: "Misión" },
  { k: "vision", rotulo: "Visión" },
  { k: "propuestaValor", rotulo: "Propuesta de valor" },
  { k: "clienteIdeal", rotulo: "Cliente ideal" },
  { k: "diferenciadores", rotulo: "Lo que te diferencia" },
];

const MAX_VALORES = 20;

export function IdentidadEmpresa() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("identidad");
  const poner = <K extends keyof Identidad>(k: K, v: Identidad[K]) => cambiar((prev) => ({ ...prev, [k]: v }));
  const cambiarValor = (id: string, parche: Partial<Valor>) =>
    cambiar((prev) => ({ ...prev, valores: prev.valores.map((v) => (v.id === id ? { ...v, ...parche } : v)) }));
  const quitarValor = (id: string) => cambiar((prev) => ({ ...prev, valores: prev.valores.filter((v) => v.id !== id) }));
  const agregarValor = () =>
    cambiar((prev) => ({ ...prev, valores: [...prev.valores, { id: nuevoId(), nombre: "", descripcion: "" }] }));

  return (
    <section className="space-y-4" aria-label="Misión, visión y valores">
      <CabeceraSeccion
        seccion="identidad"
        titulo="Misión, visión y valores"
        ayuda="La identidad del negocio: lo que lo guía cuando hay que decidir. Cada campo trae un ejemplo en su ⓘ."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {LARGOS.map(({ k, rotulo }) => (
          <Campo key={k} rotulo={rotulo} ayuda={AYUDA_IDENTIDAD[k].que} ejemplo={AYUDA_IDENTIDAD[k].ejemplo}>
            {(id) => (
              <textarea
                id={id}
                className={CAMPO_AREA}
                rows={3}
                value={datos[k]}
                readOnly={!puedeEditar}
                maxLength={4000}
                onChange={(e) => poner(k, e.target.value)}
              />
            )}
          </Campo>
        ))}
        <Campo rotulo="Lema" ayuda={AYUDA_IDENTIDAD.lema.que} ejemplo={AYUDA_IDENTIDAD.lema.ejemplo}>
          {(id) => (
            <input
              id={id}
              className={CAMPO}
              value={datos.lema}
              readOnly={!puedeEditar}
              maxLength={160}
              placeholder={AYUDA_IDENTIDAD.lema.ejemplo}
              onChange={(e) => poner("lema", e.target.value)}
            />
          )}
        </Campo>
      </div>

      <fieldset className="space-y-2 rounded-xl border border-[var(--rule-base)] p-4">
        <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
          <span className="flex items-center gap-1">
            Valores
            <InfoTip title="Valores" what={AYUDA_IDENTIDAD.valores.que} example={AYUDA_IDENTIDAD.valores.ejemplo} />
          </span>
        </legend>
        {datos.valores.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Todavía no anotas valores.</p>
        ) : (
          <ul className="space-y-2">
            {datos.valores.map((v, i) => (
              <li key={v.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  aria-label={`Valor ${i + 1}`}
                  className={`${CAMPO} sm:w-56 sm:shrink-0`}
                  value={v.nombre}
                  readOnly={!puedeEditar}
                  maxLength={160}
                  placeholder="Honestidad"
                  onChange={(e) => cambiarValor(v.id, { nombre: e.target.value })}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    aria-label={`Qué significa el valor ${i + 1}`}
                    className={CAMPO}
                    value={v.descripcion}
                    readOnly={!puedeEditar}
                    maxLength={600}
                    placeholder="Qué significa en la práctica"
                    onChange={(e) => cambiarValor(v.id, { descripcion: e.target.value })}
                  />
                  {puedeEditar ? (
                    <button
                      type="button"
                      className={button({ variant: "ghost", size: "icon" })}
                      aria-label={`Quitar el valor ${v.nombre || i + 1}`}
                      title="Quitar"
                      onClick={() => quitarValor(v.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {puedeEditar && datos.valores.length < MAX_VALORES ? (
          <button type="button" className={button({ variant: "secondary" })} onClick={agregarValor}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar valor
          </button>
        ) : null}
      </fieldset>
    </section>
  );
}
