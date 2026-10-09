"use client";

/**
 * ModalMeta — crear o editar una meta en un solo paso (ADR-488).
 *
 * Valida en vivo con el MISMO Zod que el servidor (`metaCrearSchema` /
 * `metaEditarSchema`, `safeParse`): el botón «Guardar» no se habilita con un
 * dato que la API va a rechazar. El avance sólo se escribe en la meta a mano;
 * en las demás sale de los datos, y la vista previa dice cuánto llevas ya.
 *
 * Lo abren la vista de metas, sus plantillas y la vista Hoy («Ponle una meta
 * al día», con `preset`).
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Target } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { CATALOGO_METAS, categoriasDelArea, normalizarUnidad, type AreaMeta } from "@/lib/admin/metas-catalogo";
import {
  metaCrearSchema,
  metaEditarSchema,
  type CategoriaMeta,
  type MetaDTO,
  type PeriodoMeta,
} from "@/lib/admin/metas-tareas";
import { crearMeta, editarMeta, useVistaPreviaMeta } from "@/hooks/use-metas";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./clases-meta";
import { nombreAutomatico } from "./formato-meta";
import { ModalMetaCampos, type CampoMeta, type ErroresMeta, type FormMeta } from "./ModalMetaCampos";
import type { PresetMeta } from "./PlantillasMeta";

export interface ModalMetaProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Con meta = editar; sin meta = crear. */
  meta?: MetaDTO;
  /** Arranca en esta categoría y período (y, si vienen, con este objetivo y nombre). */
  preset?: PresetMeta;
  onGuardada?: (meta: MetaDTO) => void;
}

const MENSAJE: Readonly<Record<CampoMeta, string>> = {
  target: "Pon un objetivo mayor que 0.",
  name: "Ponle un nombre (hasta 120 letras).",
  unit: "Pon la unidad (hasta 20 letras).",
  dueDate: "La fecha no es válida.",
  current: "El avance no puede ser negativo.",
};

function formInicial(meta?: MetaDTO, preset?: PresetMeta): FormMeta {
  const category: CategoriaMeta = meta?.category ?? preset?.category ?? "ventas";
  const period: PeriodoMeta = meta?.period ?? preset?.period ?? "mensual";
  const name = meta?.name ?? preset?.name ?? nombreAutomatico(category, period);
  return {
    area: CATALOGO_METAS[category]?.area ?? "ventas",
    category,
    period,
    target: meta ? String(meta.target) : preset?.target ? String(preset.target) : "",
    unit: normalizarUnidad(category, meta?.unit),
    name,
    nombreTocado: Boolean(meta || preset?.name),
    dueDate: meta?.dueDate ?? "",
    current: meta && category === "manual" ? String(meta.current) : "",
  };
}

/** El cuerpo que va a la API, en la forma que espera cada esquema. */
function cuerpo(f: FormMeta, editando: boolean) {
  const manual = f.category === "manual";
  return {
    name: f.name,
    category: f.category,
    period: f.period,
    target: f.target.trim() === "" ? 0 : f.target,
    unit: f.unit,
    // Al editar, vacío BORRA el vencimiento; al crear, vacío es «sin vencimiento».
    dueDate: f.dueDate || (editando ? null : undefined),
    ...(manual ? { current: f.current.trim() === "" ? 0 : f.current } : {}),
  };
}

export function ModalMeta({ abierto, onCerrar, meta, preset, onGuardada }: ModalMetaProps) {
  const formId = useId();
  const editando = Boolean(meta);
  const [form, setForm] = useState<FormMeta>(() => formInicial(meta, preset));
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);

  /* Cada vez que se abre arranca de cero (otra meta, otra plantilla). */
  const presetClave = preset ? `${preset.category}|${preset.period}|${preset.target ?? ""}|${preset.name ?? ""}` : "";
  useEffect(() => {
    if (!abierto) return;
    setForm(formInicial(meta, preset));
    setIntento(false);
    setErrorApi(null);
    // `preset` entra por su clave: un objeto nuevo en cada render del padre no reinicia el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, meta, presetClave]);

  const datos = useMemo(() => cuerpo(form, editando), [form, editando]);
  const vCrear = useMemo(() => (editando ? null : metaCrearSchema.safeParse(datos)), [datos, editando]);
  const vEditar = useMemo(() => (editando ? metaEditarSchema.safeParse(datos) : null), [datos, editando]);
  const issues = (vCrear && !vCrear.success ? vCrear.error.issues : null) ?? (vEditar && !vEditar.success ? vEditar.error.issues : []);
  const valida = Boolean(vCrear?.success || vEditar?.success);

  const errores: ErroresMeta = {};
  for (const issue of issues) {
    const campo = issue.path[0] as CampoMeta | undefined;
    if (campo && campo in MENSAJE && !errores[campo]) errores[campo] = MENSAJE[campo];
  }
  /* Los errores se muestran cuando el campo ya tiene algo o al intentar guardar: un formulario recién abierto no grita. */
  const visibles: ErroresMeta = intento
    ? errores
    : {
        target: form.target !== "" ? errores.target : undefined,
        name: form.nombreTocado ? errores.name : undefined,
        unit: errores.unit,
        dueDate: errores.dueDate,
        current: form.current !== "" ? errores.current : undefined,
      };

  const previa = useVistaPreviaMeta(
    abierto && form.category !== "manual" ? { category: form.category, period: form.period, unit: form.unit } : null,
  );

  const aplicar = (cambios: Partial<FormMeta>) =>
    setForm((f) => {
      const n = { ...f, ...cambios };
      if (!n.nombreTocado) n.name = nombreAutomatico(n.category, n.period);
      return n;
    });

  const elegirCategoria = (category: CategoriaMeta) =>
    aplicar({ category, area: CATALOGO_METAS[category].area, unit: normalizarUnidad(category, form.unit) });

  const elegirArea = (area: AreaMeta) => {
    const primera = categoriasDelArea(area)[0];
    if (primera && CATALOGO_METAS[form.category].area !== area) elegirCategoria(primera.id);
  };

  const cambiarCampo = (campo: CampoMeta, valor: string) => {
    if (campo === "name") setForm((f) => ({ ...f, name: valor, nombreTocado: valor.trim() !== "" }));
    else setForm((f) => ({ ...f, [campo]: valor }));
  };

  const guardar = async () => {
    setIntento(true);
    if (!valida || guardando) return;
    setGuardando(true);
    setErrorApi(null);
    const r =
      meta && vEditar?.success
        ? await editarMeta(meta.id, vEditar.data)
        : vCrear?.success
          ? await crearMeta(vCrear.data)
          : ({ ok: false, error: "Revisa los datos de la meta." } as const);
    setGuardando(false);
    if (!r.ok) {
      setErrorApi(r.error);
      return;
    }
    toast.success(editando ? "Meta actualizada" : `Meta creada: ${r.meta.name}`);
    onGuardada?.(r.meta);
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={editando ? "Editar meta" : "Nueva meta"}
      icon={Target}
      /* `info` (64 rem, 92 vh), no `wide` (42 rem): con las áreas en 3 filas y las
         categorías de a 2, el objetivo quedaba DEBAJO del borde en una pantalla de
         900 px (medido 09-10). Así las cuatro preguntas entran sin desplazar. */
      variant="info"
      claveVentana="metas-modal-meta"
      footer={
        <ModalFooter error={errorApi}>
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={formId} disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear meta"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        noValidate
        className={MODAL_BODY}
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <ModalMetaCampos
          form={form}
          errores={visibles}
          previa={previa}
          onArea={elegirArea}
          onCategoria={elegirCategoria}
          onPeriodo={(period) => aplicar({ period })}
          onCampo={cambiarCampo}
        />
      </form>
    </AdminModal>
  );
}

export default ModalMeta;
