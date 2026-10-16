"use client";

/**
 * La «forma» del talonario que se acomoda (Brandon 16-10: «cada encaje y
 * configuración se guardará independiente con su nombre… para usar varias
 * formas en diferentes permisos»). Al abrir una guía se elige sola la de su
 * permiso y titular; acá se ve cuál es, se elige otra, se crea una copia, se
 * renombra o se borra. «Copiar de otra forma» trae sus dos hojas sin guardar
 * (Ctrl+Z las deshace). «Guardar», en el pie, guarda en la que se ve.
 *
 * Las impresoras NO son de la forma: su calibración vale para todas.
 */

import { useId, type ReactNode } from "react";
import { Copy, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ResumenForma } from "@/lib/forestal/gtf-matricial-formas";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { limaDateKey } from "@/lib/utils";
import { I } from "./ctp-shared";
import { CAJA } from "./gtf-matricial-panel";
import type { EstadoGtfMatricial, InfoTalonario } from "./hooks/use-gtf-matricial";
import { siguienteForma, useFormasTalonario } from "./hooks/use-gtf-matricial-formas";

const SELECT = I.replace("h-11", "h-12");
/** Opción del select que vuelve a la que elige la guía sola. */
const AUTO = "__auto";

const cuando = (iso: string | null): string => {
  const k = iso ? limaDateKey(iso) : "";
  return k ? `Guardada el ${etiquetaLarga(k)}` : "Guardada";
};

/** «Permiso 17-CPO… · Maderera…»: para qué guías se calibró. */
const referencia = (f: Pick<ResumenForma, "permiso" | "titular" | "empresa">): string =>
  f.empresa ? "La de la empresa: de ésta arranca un titular sin la suya" : [f.permiso && `Permiso ${f.permiso}`, f.titular].filter(Boolean).join(" · ");

function estado(info: InfoTalonario): { chip: string; ayuda: string } {
  if (!info.forma) {
    const desde = info.nueva?.desde ? `«${info.nueva.desde}»` : "la de fábrica";
    return {
      chip: `Nueva · arranca de ${desde}`,
      ayuda: `Esta guía todavía no tiene su forma: ves ${desde}. Al guardar se crea «${info.nueva?.nombre ?? "su forma"}» con su permiso y titular, y la de antes no cambia.`,
    };
  }
  if (info.forma.empresa && info.coincide === "exacta") return { chip: "De la empresa", ayuda: "La guía no tiene titular ni permiso: se usa la de la empresa, la que copian los titulares sin la suya." };
  switch (info.coincide) {
    case "exacta":
      return { chip: "De este permiso y titular", ayuda: "Se eligió sola: es la que se calibró para el permiso y el titular de esta guía. Lo que guardes vale para todas sus guías." };
    case "titular":
      return { chip: "Del mismo titular, otro permiso", ayuda: "Este permiso todavía no tiene la suya: se usa la del mismo titular. Para calibrar una sólo para este permiso, crea una «Nueva forma»." };
    case "permiso":
      return { chip: "Del mismo permiso", ayuda: "Es del mismo permiso, con el titular escrito distinto. Si es otra persona, crea una «Nueva forma»." };
    default:
      return { chip: "Elegida a mano", ayuda: "Es de otro permiso o titular. Imprimir sale con ésta; lo que guardes cambia también las guías de ella." };
  }
}

export default function TitularTalonario({ t, accion }: { t: EstadoGtfMatricial; accion?: ReactNode }) {
  const id = useId();
  const { confirm, prompt } = useConfirm();
  const f = useFormasTalonario(t.gtfId, t);
  const info = t.info;
  if (!info) return null;
  const actual = info.forma;
  const { chip, ayuda } = estado(info);
  const auto = siguienteForma(info.formas, "");
  /* Elegida a mano y no es la que tomaría sola: se ofrece volver. */
  const puedeVolver = !!actual && auto?.id !== actual.id;
  const ocupado = !!f.ocupado || t.guardando || t.cargando;
  const delDueno = info.formas.filter((x) => x.coincide);
  const otras = info.formas.filter((x) => !x.coincide);

  /** Cambiar de forma pierde lo que no se guardó: se pregunta. */
  const sinPerder = async (): Promise<boolean> =>
    !t.sucio ||
    confirm({
      title: "¿Cambiar sin guardar?",
      description: `Los cambios de «${actual?.nombre ?? info.nueva?.nombre ?? "esta forma"}» se pierden. Guárdalos primero si los quieres.`,
      intent: "warning",
      confirmLabel: "Cambiar sin guardar",
    });

  const elegir = async (valor: string) => {
    if (valor === (actual?.id ?? "") || !(await sinPerder())) return;
    if (valor === AUTO) await t.cargar();
    else await f.elegir(valor);
  };

  const nueva = async () => {
    const nombre = await prompt({
      title: "Nueva forma (copia de esta)",
      description: "Copia lo que ves, aunque no esté guardado, para el permiso y titular de esta guía. La de ahora queda como estaba guardada.",
      label: "Nombre (vacío = permiso · titular)",
      placeholder: info.nueva?.nombre ?? actual?.nombre ?? "",
      confirmLabel: "Crear",
    });
    if (nombre !== null) await f.nueva(nombre);
  };

  const renombrar = async () => {
    if (!actual) return;
    const nombre = await prompt({ title: "Renombrar forma", label: "Nombre", defaultValue: actual.nombre, required: true, confirmLabel: "Renombrar" });
    if (nombre?.trim() && nombre.trim() !== actual.nombre) await f.renombrar(nombre);
  };

  const borrar = async () => {
    if (!actual) return;
    const sigue = siguienteForma(info.formas, actual.id);
    const despues = sigue ? `Esta guía pasa a usar «${sigue.nombre}».` : "Esta guía vuelve a arrancar de la de la empresa (o de fábrica) y el próximo Guardar crea la suya.";
    const ok = await confirm({
      title: `¿Borrar «${actual.nombre}»?`,
      description: `Se pierde su encaje para todas las guías que la usan. ${despues}`,
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (ok) await f.borrar();
  };

  const copiar: MenuAccion[] = info.formas
    .filter((x) => x.id !== actual?.id)
    .map((x) => ({
      id: x.id,
      label: x.nombre,
      hint: [referencia(x), cuando(x.actualizado)].filter(Boolean).join(" · "),
      icon: Copy,
      onSelect: () => void f.copiarDe(x.id),
      busy: f.ocupado === `copiar:${x.id}`,
    }));

  const opciones: MenuAccion[] = [
    {
      id: "nueva",
      label: "Nueva forma (copia de esta)",
      hint: "Para otro permiso o titular, o para probar sin tocar ésta",
      icon: Plus,
      onSelect: () => void nueva(),
      disabled: !t.disp,
      busy: f.ocupado === "nueva",
    },
    {
      id: "renombrar",
      label: "Renombrar",
      hint: actual ? "Sólo el nombre: el encaje no cambia" : "Se nombra al guardarla",
      icon: Pencil,
      onSelect: () => void renombrar(),
      disabled: !actual,
      busy: f.ocupado === "renombrar",
    },
    {
      id: "borrar",
      label: "Borrar",
      hint: actual ? "Pide confirmación" : "Todavía no está guardada",
      icon: Trash2,
      tone: "danger",
      onSelect: () => void borrar(),
      disabled: !actual,
      busy: f.ocupado === "borrar",
    },
  ];

  const opcion = (x: ResumenForma) => (
    <option key={x.id} value={x.id}>
      {x.nombre}
    </option>
  );
  const error = f.error;

  return (
    <section className={CAJA} aria-label="Forma del talonario">
      {/* El nombre ocupa todo el ancho (con los botones al lado, «17-CPO/C-J-001-02 · Maderera…» se leía «17-CPO/C-J»). */}
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Forma del talonario{f.ocupado === "elegir" || t.cargando ? " · abriendo…" : ""}
        </label>
        <ActionMenu label="Opciones de la forma" actions={opciones} soloIcono disabled={ocupado} />
        {accion}
      </div>
      <select
        id={id}
        className={`${SELECT} w-full min-w-0`}
        value={actual?.id ?? ""}
        title={actual?.nombre ?? info.nueva?.nombre}
        disabled={ocupado}
        onChange={(e) => void elegir(e.target.value)}
        data-qa="talonario-forma"
      >
        {!actual && <option value="">{`${info.nueva?.nombre ?? "Nueva"} (nueva)`}</option>}
        {puedeVolver && <option value={AUTO}>{`Según la guía: ${auto?.nombre ?? "nueva"}`}</option>}
        {delDueno.length > 0 && <optgroup label="De esta guía">{delDueno.map(opcion)}</optgroup>}
        {otras.length > 0 && <optgroup label="Otras">{otras.map(opcion)}</optgroup>}
      </select>
      <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
        <span className="truncate">{chip}</span>
        <InfoTip
          title={chip}
          what={ayuda}
          affects="Imprimir y el monte usan esta forma. Las impresoras (corrimiento y escala) valen para todas las formas."
          example={actual ? referencia(actual) || undefined : undefined}
        />
      </span>
      <ActionMenu
        label="Copiar de otra forma"
        icon={Copy}
        actions={copiar}
        disabled={copiar.length === 0 || ocupado}
        title={copiar.length ? "Trae la guía y la lista de otra forma guardada (queda sin guardar)" : "Todavía no hay otra forma guardada"}
        className="w-full"
      />
      {error && (
        <span role="alert" className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </section>
  );
}
