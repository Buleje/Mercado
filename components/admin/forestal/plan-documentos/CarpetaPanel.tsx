"use client";

/**
 * La carpeta elegida, a la derecha: sus documentos esperados (cada uno con su
 * zona para soltar), los campos que se escriben (texto, número, fecha) y los
 * archivos sueltos. Arriba, lo que el plan ya sabe de esa carpeta —N° de
 * resolución, representante— para no pedirlo dos veces (ADR-467 §5).
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowDown, ArrowUp, ExternalLink, FolderPlus, MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import CamposPersonalizados, { pendientesVacios } from "@/components/admin/shared/CamposPersonalizados";
import { BOTON_SUAVE, CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDate } from "@/lib/format";
import { TIPO_ARCHIVO, TIPO_CARPETA, formularioDeCarpeta } from "@/lib/forestal/plan-documentos-tipos";
import CasilleroArchivos from "./CasilleroArchivos";
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

export const idCasillero = (carpeta: string, casillero: string) => `docs-plan-${carpeta}-${casillero}`;

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

  const menu: MenuAccion[] = [
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
          <CardTitle as="h4" className="text-sm font-bold min-w-0 flex-1 truncate" title={carpeta.nombre}>
            {carpeta.nombre}
          </CardTitle>
        )}
        {carpeta.soloEstePlan && conPlantilla && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">Sólo este plan</span>
        )}
        {carpeta.pendiente && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">Se crea al guardar</span>
        )}
        {menu.length > 0 && <ActionMenu label={`Opciones de «${carpeta.nombre}»`} actions={menu} icon={MoreHorizontal} soloIcono size="sm" />}
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

      {carpeta.casilleros.length > 0 && (
        <div className="grid grid-cols-1 gap-2 @min-[40rem]:grid-cols-2">
          {carpeta.casilleros.map((k) => (
            <CasilleroArchivos
              key={k.clave}
              domId={idCasillero(carpeta.clave, k.clave)}
              titulo={k.nombre}
              casillero={k}
              archivos={k.archivos}
              subidas={subidasDe(k.clave)}
              ocupado={false}
              vacio="Todavía no está."
              extra={k.soloEstePlan ? <span className="text-xs text-[var(--text-tertiary)]">sólo este plan</span> : undefined}
              onSubir={(files) => acciones.subir(files, carpeta, k)}
              onVer={acciones.ver}
              onQuitar={acciones.quitar}
              onVence={acciones.cambiarVence}
              onDescartarSubida={acciones.descartarSubida}
            />
          ))}
        </div>
      )}

      {conPlantilla &&
        (nuevoCasillero ? (
          <NuevoCasillero
            existentes={carpeta.casilleros.map((k) => k.nombre)}
            onCancelar={() => setNuevoCasillero(false)}
            onCrear={async (input) => {
              const error = await acciones.crearCasillero(carpeta, input);
              if (!error) setNuevoCasillero(false);
              return error;
            }}
          />
        ) : (
          <button type="button" className={BOTON_SUAVE} onClick={() => setNuevoCasillero(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Documento esperado
          </button>
        ))}

      <CasilleroArchivos
        domId={idCasillero(carpeta.clave, "sueltos")}
        titulo={carpeta.casilleros.length > 0 ? "Otros archivos de la carpeta" : "Archivos de la carpeta"}
        casillero={null}
        archivos={carpeta.sueltos}
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
        <CamposPersonalizados
          key={carpeta.clave}
          formulario={formularioDeCarpeta(carpeta.clave)}
          registroId={acciones.planId}
          etiquetaFormulario="planes"
          excluirTipos={NO_EN_CARPETAS}
          pendientes={alta ? (acciones.datos?.[carpeta.clave] ?? pendientesVacios(formularioDeCarpeta(carpeta.clave))) : undefined}
          onPendientes={alta ? (p) => acciones.onDatos?.(carpeta.clave, p) : undefined}
        />
      )}
    </div>
  );
}
