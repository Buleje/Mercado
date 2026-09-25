"use client";

/**
 * Campos personalizados — el bloque que se cuelga al final de cualquier modal
 * (ADR-427).
 *
 * Brandon (2026-09-21): «que se puedan crear campos de forma personalizada, con
 * la opción de ponerlo temporal para ese modal o permanente para ese modal y
 * otros registros; crear personalizado y reutilizar campos, ponerle nombre y
 * para qué es».
 *
 * Dos props y nada más: `formulario` (qué pantalla es) y `registroId` (qué fila
 * se está editando, o `null` si todavía se está dando de alta). Todo lo demás
 * —qué campos van, cómo se leen, qué está mal escrito— lo decide el módulo puro
 * `lib/campos-personalizados.ts`, que también corre en el servidor.
 *
 * **Nada de esto es obligatorio.** Un campo que alguien agregó no puede impedir
 * guardar un ingreso o un plan: los avisos de valor son avisos, no trabas.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Eye, EyeOff, Loader2, Plus, Trash2, X as XIcon } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import CampoPersonalizadoNuevo from "@/components/admin/shared/CampoPersonalizadoNuevo";
import {
  BOTON_ICONO,
  BOTON_PRIMARIO,
  BOTON_SUAVE,
  CAMPO_AYUDA,
  FilaCampo,
} from "@/components/admin/shared/campos-personalizados-ui";
import { esPermanente, textoDelValor, type CampoPersonalizado } from "@/lib/campos-personalizados";
import {
  clavePendiente,
  pendientesVacios,
  useCamposPersonalizados,
  type CampoNuevoInput,
  type PendientesCampos,
} from "@/hooks/use-campos-personalizados";

export { guardarValoresPendientes, pendientesVacios, hayPendientes } from "@/hooks/use-campos-personalizados";
export type { PendientesCampos } from "@/hooks/use-campos-personalizados";

export default function CamposPersonalizados({
  formulario,
  registroId,
  etiquetaFormulario = "registros",
  pendientes,
  onPendientes,
  className = "",
}: {
  /** Id estable de la pantalla, ej. `"forestal.plan"`. */
  formulario: string;
  /** `null` mientras es un alta: lo escrito queda pendiente del id. */
  registroId: string | null;
  /** Cómo se llaman en criollo las filas de este formulario: «planes», «ingresos». */
  etiquetaFormulario?: string;
  pendientes?: PendientesCampos;
  onPendientes?: (p: PendientesCampos) => void;
  className?: string;
}) {
  const { campos, apagados, valores, reutilizables, cargando, cargandoCatalogo, guardando, error, disponible, cargarReutilizables, crear, actualizar, eliminar, guardarValores } =
    useCamposPersonalizados({ formulario, registroId });
  const { confirm } = useConfirm();
  const [alta, setAlta] = useState(false);
  const [verApagados, setVerApagados] = useState(false);
  /** Lo tocado en esta sesión: lo que no está acá se muestra como vino. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  /* Respaldo para quien monte el bloque en un alta sin llevarse los pendientes:
     sin esto los campos quedarían congelados (se tipea y no aparece nada). Lo
     escrito se pierde al cerrar, como cualquier formulario sin guardar. */
  const [pendLocal, setPendLocal] = useState<PendientesCampos>(() => pendientesVacios(formulario));
  const [aviso, setAviso] = useState<string | null>(null);

  const enAlta = registroId == null;
  const pend = pendientes ?? pendLocal;
  const anotar = onPendientes ?? setPendLocal;
  const sucio = Object.keys(borrador).length > 0;

  if (!disponible) return null;

  const valorDe = (campoId: string): string =>
    enAlta ? (pend.valores[campoId] ?? "") : (borrador[campoId] ?? valores[campoId]?.valor ?? "");

  const escribir = (campoId: string, v: string) => {
    if (enAlta) anotar({ ...pend, valores: { ...pend.valores, [campoId]: v } });
    else setBorrador((prev) => ({ ...prev, [campoId]: v }));
  };

  async function altaDeCampo(input: CampoNuevoInput): Promise<string | null> {
    /* Sin registro no hay a qué colgar un campo temporal, y un permanente
       creado ahora quedaría vivo aunque el alta se cancele: los dos esperan. */
    if (enAlta) {
      anotar({ ...pend, nuevos: [...pend.nuevos, { ...input, clave: clavePendiente(), valor: "" }] });
      setAlta(false);
      return null;
    }
    const r = await crear(input);
    if (r.error) return r.error;
    setAlta(false);
    return null;
  }

  async function apagar(c: CampoPersonalizado) {
    const escrito = textoDelValor(c, valores[c.id]);
    const ok = await confirm({
      title: `¿Apagar «${c.nombre}»?`,
      description:
        (escrito === "—"
          ? `Deja de pedirse en los ${etiquetaFormulario}.`
          : `Deja de pedirse en los ${etiquetaFormulario}. Lo que ya se escribió no se borra: en este registro dice «${escrito}».`) +
        " Si te arrepentís, volvé a prenderlo desde «Ver los apagados» antes de salir de esta pantalla.",
      intent: "warning",
      confirmLabel: "Sí, apagarlo",
    });
    if (!ok) return;
    const r = await actualizar(c.id, { activo: false });
    if (r.error) setAviso(r.error);
  }

  async function darDeBaja(c: CampoPersonalizado) {
    const ok = await confirm({
      title: `¿Dar de baja «${c.nombre}»?`,
      /* El texto dice lo que el servidor HACE: la baja es lógica (la fila queda
         con `deletedAt`, la auditoría de seguridad lo verificó). Prometer que
         «se borra» sería mentirle a quien lo aprieta, y encima con un dato que
         puede ser personal. */
      description: `La pregunta deja de aparecer en todos los ${etiquetaFormulario} y el nombre queda libre para volver a usarlo. Lo ya respondido no se muestra más, pero queda guardado en el historial. Si sólo querés dejar de verlo por ahora, apagalo.`,
      intent: "danger",
      confirmLabel: "Sí, dar de baja",
    });
    if (!ok) return;
    const r = await eliminar(c.id);
    if (!r.ok) setAviso(r.error ?? "No se pudo dar de baja el campo.");
  }

  async function guardar() {
    setAviso(null);
    const r = await guardarValores(borrador);
    if (!r.ok) setAviso(r.error);
    else setBorrador({});
  }

  const total = campos.length + pend.nuevos.length;

  return (
    <div className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-1.5">
            Campos personalizados
            {total > 0 && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">
                {total}
              </span>
            )}
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Lo que este formulario no pregunta y tu negocio igual necesita anotar. Ninguno es obligatorio: si queda vacío, se
            guarda igual.
          </p>
        </div>
        {!alta && (
          <button type="button" className={BOTON_SUAVE} onClick={() => setAlta(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar campo
          </button>
        )}
      </div>

      {aviso && (
        <p className="mt-2 rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          {aviso}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--data-error)]">{error}</p>}

      {alta && (
        <CampoPersonalizadoNuevo
          etiquetaFormulario={etiquetaFormulario}
          existentes={[...campos, ...apagados]}
          reutilizables={reutilizables}
          cargandoCatalogo={cargandoCatalogo}
          guardando={guardando}
          onCargarReutilizables={cargarReutilizables}
          onCrear={altaDeCampo}
          onCancelar={() => setAlta(false)}
        />
      )}

      {cargando && campos.length === 0 && <p className={CAMPO_AYUDA}>Buscando los campos de esta pantalla…</p>}

      {total > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {campos.map((c) => (
            <FilaCampo
              key={c.id}
              nombre={c.nombre}
              descripcion={c.descripcion}
              tipo={c.tipo}
              opciones={c.opciones}
              temporal={!esPermanente(c)}
              valor={valorDe(c.id)}
              onCambio={(v) => escribir(c.id, v)}
              acciones={
                <>
                  <button type="button" className={BOTON_ICONO} title={`Apagar ${c.nombre}`} aria-label={`Apagar el campo ${c.nombre}`} onClick={() => void apagar(c)}>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className={BOTON_ICONO} title={`Dar de baja ${c.nombre}`} aria-label={`Dar de baja el campo ${c.nombre}`} onClick={() => void darDeBaja(c)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </>
              }
            />
          ))}

          {pend.nuevos.map((n) => (
            <FilaCampo
              key={n.clave}
              nombre={n.nombre}
              descripcion={n.descripcion || "Se crea cuando guardes el registro."}
              tipo={n.tipo}
              opciones={n.opciones}
              temporal={n.soloEnEsteRegistro}
              valor={n.valor}
              onCambio={(v) => anotar({ ...pend, nuevos: pend.nuevos.map((x) => (x.clave === n.clave ? { ...x, valor: v } : x)) })}
              acciones={
                <button
                  type="button"
                  className={BOTON_ICONO}
                  title={`Quitar ${n.nombre}`}
                  aria-label={`Quitar el campo ${n.nombre}`}
                  onClick={() => anotar({ ...pend, nuevos: pend.nuevos.filter((x) => x.clave !== n.clave) })}
                >
                  <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              }
            />
          ))}
        </div>
      )}

      {!cargando && total === 0 && !alta && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Todavía no agregaste ninguna pregunta propia acá. Sin esto, lo que el formulario no previó termina en
          «Observaciones», donde no se puede buscar ni sumar.
        </p>
      )}

      {enAlta && total > 0 && (
        <p className={`${CAMPO_AYUDA} mt-2`}>Lo que escribas acá se guarda junto con el registro.</p>
      )}

      {!enAlta && sucio && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={BOTON_SUAVE} onClick={() => setBorrador({})}>
            Deshacer
          </button>
          <button type="button" className={BOTON_PRIMARIO} disabled={guardando} onClick={() => void guardar()}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Guardar lo escrito
          </button>
        </div>
      )}

      {apagados.length > 0 && (
        <div className="mt-3 border-t border-[var(--rule-soft)] pt-2">
          <button type="button" className={`${BOTON_SUAVE} h-8`} aria-expanded={verApagados} onClick={() => setVerApagados((v) => !v)}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {verApagados ? "Ocultar los apagados" : `Ver los apagados (${apagados.length})`}
          </button>
          {verApagados && (
            <div className="mt-2 space-y-1.5">
              {apagados.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">acá dice {textoDelValor(c, valores[c.id])}</span>
                  <button type="button" className={`${BOTON_SUAVE} ml-auto h-8`} onClick={() => void actualizar(c.id, { activo: true })}>
                    Volver a mostrarlo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
