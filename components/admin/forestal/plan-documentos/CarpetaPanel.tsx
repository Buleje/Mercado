"use client";

/**
 * La carpeta elegida, a la derecha: sus documentos esperados (cada uno con su
 * zona para soltar), los campos que se escriben (texto, número, fecha) y los
 * archivos sueltos. Arriba, lo que el plan ya sabe de esa carpeta —N° de
 * resolución, representante— para no pedirlo dos veces (ADR-467 §5).
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, FolderPlus, MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import CamposPersonalizados, { pendientesVacios } from "@/components/admin/shared/CamposPersonalizados";
import { BOTON_SUAVE, CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatDate } from "@/lib/format";
import { TIPO_ARCHIVO, TIPO_CARPETA, formularioDeCarpeta } from "@/lib/forestal/plan-documentos-tipos";
import CasilleroArchivos from "./CasilleroArchivos";
import CasillerosDeCarpeta, { idCasillero } from "./CasillerosDeCarpeta";
import NuevoCasillero from "./NuevoCasillero";
import { enlaceAlDrive } from "./plan-documentos-api";
import type { AccionesDocs, DatosDelPlan } from "./acciones";
import type { CarpetaVista } from "./modelo";

/**
 * Lo que el bloque de campos de una carpeta NO maneja: los casilleros `archivo`
 * (los pinta la sección, con su zona para subir) y lo que no es texto, número o
 * fecha — un papel no se escribe, se sube (tipos de la semilla del contrato).
 */
const NO_EN_CARPETAS: readonly string[] = [TIPO_ARCHIVO, TIPO_CARPETA, "opcion", "si_no", "nota"];

export { idCasillero };

/** Campos personalizados plegados, recordado para todas las carpetas y planes. */
const CLAVE_CAMPOS_ABIERTOS = "loth:plan:carpeta-campos-abiertos";

function DelPlan({ clave, datos }: { clave: string; datos: DatosDelPlan }) {
  const fecha = datos.resolucionDate ? formatDate(`${datos.resolucionDate.slice(0, 10)}T00:00:00.000Z`, { soloFecha: true }) : null;
  const filas: [string, string | null][] =
    clave === "resolucion"
      ? [["N° de resolución", datos.resolucionNumber], ["Fecha", fecha]]
      : clave === "jefe"
        ? [["Representante legal", datos.representanteLegal], ["Propietario del predio", datos.propietarioNombre]]
        : [];
  if (filas.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
      {filas.map(([k, v]) => (
        <span key={k}>
          {k}: <b className="font-semibold text-[var(--text-primary)]">{v?.trim() || "sin cargar"}</b>
        </span>
      ))}
      <InfoTip
        title="Lo que ya está en el plan"
        what="Sale del bloque «Documento aprobado» y de «Titular y regente». No se escribe dos veces."
        example="Si el N° está mal, corrígelo en el plan y acá cambia solo."
      />
    </p>
  );
}

export default function CarpetaPanel({
  carpeta,
  indice,
  total,
  acciones,
  delPlan,
}: {
  carpeta: CarpetaVista;
  indice: number;
  total: number;
  acciones: AccionesDocs;
  delPlan: DatosDelPlan;
}) {
  const id = useId();
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(carpeta.nombre);
  const [nuevoCasillero, setNuevoCasillero] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [camposAbiertos, setCamposAbiertos] = useLocalStorage(CLAVE_CAMPOS_ABIERTOS, false);
  const alta = acciones.modo === "alta";
  /* Una carpeta hecha a mano en Documentos no tiene plantilla: sin «sumarla»
     no admite campos (el servidor rechaza campos de una carpeta que no está). */
  const conPlantilla = carpeta.enLaLista;
  /* En un alta sólo se toca lo creado ahí; con el plan guardado, todo menos
     la carpeta sugerida que todavía no existe (se crea con la primera subida). */
  const editable = alta ? carpeta.pendiente : !carpeta.provisional;

  const hacer = async (p: Promise<string | null>) => {
    setAviso((await p) ?? null);
  };

  async function renombrar() {
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setAviso("Ponle un nombre de al menos dos letras.");
      return;
    }
    if (limpio === carpeta.nombre) {
      setRenombrando(false);
      return;
    }
    const error = await acciones.renombrar(carpeta, limpio);
    setAviso(error);
    if (!error) setRenombrando(false);
  }

  /* «Documento esperado» es de una vez por carpeta: va al menú, no a la vista. */
  const menu: MenuAccion[] = [
    ...(conPlantilla && !nuevoCasillero
      ? [{ id: "casillero", label: "Agregar documento esperado", hint: "Un papel que esta carpeta debe tener", icon: Plus, onSelect: () => setNuevoCasillero(true) }]
      : []),
    ...(editable ? [{ id: "renombrar", label: "Renombrar", icon: Pencil, onSelect: () => { setNombre(carpeta.nombre); setRenombrando(true); } }] : []),
    ...(acciones.mover && editable && carpeta.enLaLista
      ? [
          { id: "subir", label: "Subir un lugar", icon: ArrowUp, disabled: indice === 0, onSelect: () => void hacer(acciones.mover?.(carpeta, -1) ?? Promise.resolve(null)) },
          { id: "bajar", label: "Bajar un lugar", icon: ArrowDown, disabled: indice >= total - 1, onSelect: () => void hacer(acciones.mover?.(carpeta, 1) ?? Promise.resolve(null)) },
        ]
      : []),
    ...(!conPlantilla && acciones.adoptar
      ? [{ id: "adoptar", label: "Sumar a la lista del plan", hint: "Para poder pedirle documentos y campos", icon: FolderPlus, onSelect: () => void hacer(acciones.adoptar?.(carpeta, false) ?? Promise.resolve(null)) }]
      : []),
    ...(carpeta.folderId
      ? [{ id: "drive", label: "Abrir en Documentos", hint: "Se abre en otra pestaña", icon: ExternalLink, onSelect: () => window.open(enlaceAlDrive(carpeta.folderId), "_blank", "noopener") }]
      : []),
    ...((alta ? carpeta.pendiente : carpeta.plantillaId != null)
      ? [{
          id: "quitar",
          label: alta ? "Quitar esta carpeta" : "Quitar de la lista",
          hint: alta ? undefined : "La carpeta y sus archivos siguen en Documentos",
          icon: Trash2,
          tone: "danger" as const,
          onSelect: () => void hacer(acciones.quitarCarpeta(carpeta)),
        }]
      : []),
  ];

  const subidasDe = (clave: string | null) =>
    acciones.subidas.filter((s) => s.carpetaClave === carpeta.clave && s.casilleroClave === clave);

  return (
    <div className="@container min-w-0 space-y-3" aria-label={`Carpeta ${carpeta.nombre}`} role="group">
      <div className="flex flex-wrap items-center gap-2">
        {renombrando ? (
          /* Sin <form>: esta sección vive DENTRO del formulario del plan y un
             form anidado es HTML inválido (y Enter mandaría el plan entero). */
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <label htmlFor={`${id}-nombre`} className="sr-only">Nombre de la carpeta</label>
            <input
              id={`${id}-nombre`}
              className={`${CAMPO_INPUT} h-10`}
              value={nombre}
              maxLength={80}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void renombrar();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setRenombrando(false);
                }
              }}
            />
            <button type="button" className={BOTON_SUAVE} onClick={() => void renombrar()}>Guardar</button>
            <button type="button" className={BOTON_SUAVE} onClick={() => setRenombrando(false)}>Cancelar</button>
          </div>
        ) : (
          <CardTitle
            as="h4"
            className="text-sm font-bold min-w-0 flex-1 truncate"
            title={carpeta.nombreEnDocumentos ? `${carpeta.nombre} · En Documentos: ${carpeta.nombreEnDocumentos}` : carpeta.nombre}
          >
            {carpeta.nombre}
          </CardTitle>
        )}
        {!renombrando && carpeta.nombreEnDocumentos && (
          <InfoTip
            title={carpeta.nombre}
            what={`En Documentos: ${carpeta.nombreEnDocumentos}. Es la misma carpeta: acá lleva el nombre de los papeles de este tipo de plan.`}
            affects="Sólo cambia en esta pestaña. En Documentos y en tus otros planes sigue con su nombre."
            example="En un PO, «Títulos de propiedad» se ve como «Contrato de concesión»."
          />
        )}
        {carpeta.soloEstePlan && conPlantilla && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">Sólo este plan</span>
        )}
        {carpeta.pendiente && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">Se crea al guardar</span>
        )}
        {menu.length > 0 && <ActionMenu label={`Opciones de «${carpeta.nombre}»`} actions={menu} icon={MoreHorizontal} soloIcono size="md" />}
      </div>

      {aviso && (
        <p role="alert" className="rounded-lg border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
          {aviso}
        </p>
      )}

      <DelPlan clave={carpeta.clave} datos={delPlan} />

      {!conPlantilla && (
        <p className="text-xs text-[var(--text-secondary)]">
          Esta carpeta se hizo en Documentos. Súmala a la lista del plan (menú de opciones) para pedirle documentos y campos.
        </p>
      )}

      <CasillerosDeCarpeta carpeta={carpeta} acciones={acciones} subidasDe={subidasDe} />

      {conPlantilla && nuevoCasillero && (
        <NuevoCasillero
          existentes={carpeta.casilleros.map((k) => k.nombre)}
          onCancelar={() => setNuevoCasillero(false)}
          onCrear={async (input) => {
            const error = await acciones.crearCasillero(carpeta, input);
            if (!error) setNuevoCasillero(false);
            return error;
          }}
        />
      )}

      <CasilleroArchivos
        domId={idCasillero(carpeta.clave, "sueltos")}
        titulo={carpeta.casilleros.length > 0 ? "Otros archivos de la carpeta" : "Archivos de la carpeta"}
        casillero={null}
        archivos={carpeta.sueltos}
        conCandado={carpeta.sueltosConCandado}
        subidas={subidasDe(null)}
        ocupado={false}
        vacio={carpeta.subcarpetas > 0 ? `Tiene ${carpeta.subcarpetas} subcarpeta${carpeta.subcarpetas === 1 ? "" : "s"}: se abren en Documentos.` : "Sin archivos sueltos."}
        onSubir={(files) => acciones.subir(files, carpeta, null)}
        onVer={acciones.ver}
        onQuitar={acciones.quitar}
        onVence={acciones.cambiarVence}
        onDescartarSubida={acciones.descartarSubida}
      />

      {conPlantilla && !(carpeta.provisional && !alta) && (
        /* Plegado y recordado. Plegado no se desmonta: lo escrito no se pierde. */
        <div data-campos-carpeta className="rounded-xl border border-[var(--rule-soft)]">
          <div className="flex items-center gap-1 pr-2">
            <button
              type="button"
              aria-expanded={camposAbiertos}
              aria-controls={`${id}-campos`}
              onClick={() => setCamposAbiertos(!camposAbiertos)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${camposAbiertos ? "" : "-rotate-90"}`} aria-hidden="true" />
              Campos personalizados
            </button>
            <InfoTip
              title="Campos personalizados"
              what="Lo que este formulario no pregunta y tu negocio igual necesita anotar: un texto, un número o una fecha por carpeta."
              affects="Ninguno es obligatorio: si queda vacío, el plan se guarda igual. Sin esto, lo que el formulario no previó termina en «Observaciones», donde no se puede buscar ni sumar."
              example="Carpeta Resolución: «N° de expediente ATFFS» = 2026-0412."
            />
          </div>
          <div id={`${id}-campos`} hidden={!camposAbiertos} className="px-3 pb-3">
            {/* Su propio título y su párrafo sobran acá: los dicen el botón y el ⓘ. */}
            <CamposPersonalizados
              key={carpeta.clave}
              formulario={formularioDeCarpeta(carpeta.clave)}
              registroId={acciones.planId}
              etiquetaFormulario="planes"
              excluirTipos={NO_EN_CARPETAS}
              pendientes={alta ? (acciones.datos?.[carpeta.clave] ?? pendientesVacios(formularioDeCarpeta(carpeta.clave))) : undefined}
              onPendientes={alta ? (p) => acciones.onDatos?.(carpeta.clave, p) : undefined}
              className="border-0! bg-transparent! p-0! [&>div:first-child>div:first-child]:hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
