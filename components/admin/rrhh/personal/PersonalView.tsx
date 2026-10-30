"use client";

/**
 * PersonalView — la lista de personas (ADR-414 §7, vista `personal`).
 *
 * Patrón del panel (noche 11-10): título · «Agregar persona» · «⋯» en una
 * fila, y buscador + puesto + estado en otra, pegada a la tabla. Las cuatro
 * tarjetas de arriba (Activos, Vacaciones/licencia…) repetían la cuenta de
 * los chips de estado: se fueron, la cuenta queda en el chip.
 *
 * El estado se recorta EN EL CLIENTE sobre una lista ya traída con
 * `incluirCesados=1` — así los chips no disparan un fetch por click y su
 * cuenta (todo el personal) no depende de qué chip esté activo.
 *
 * BUG arreglado (2026-09-14): `useRrhhColaboradores` pone `loading=true` en
 * cada cambio de `q`, y `if (loading) return <LoadingState/>` desmontaba TODA
 * la vista — el buscador perdía el foco en cada tecla. Ahora `qInput` (lo que
 * se tipea) vive aparte de `q` (lo que llega al hook), con 250ms de debounce
 * entre ambos; y el `LoadingState` de pantalla entera sólo corre en la
 * primera carga — en recargas la barra queda montada y la tabla se atenúa.
 *
 * 19-10 («juntar pestañas gemelas»): la pestaña Equipo › Contratos se mudó
 * acá. La tabla (`TablaPersonal`) suma la columna «Contrato» con su
 * vencimiento, el chip «Contrato por vencer» filtra a quienes vencen en 30
 * días, y una línea avisa los contratos de trabajo que no están ligados a
 * nadie. Crear sigue en Documentos › Contratos, con la persona precargada.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { FileSignature, LayoutList, Plus, QrCode, UserPlus, Users } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import EncabezadoDeVista from "../EncabezadoDeVista";
import { useRrhhColaboradores } from "@/hooks/use-rrhh-colaboradores";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { BOTON } from "../rrhh-form";
import { pluralizar } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import ColaboradorFormModal from "./ColaboradorFormModal";
import FotochecksVista from "./FotochecksVista";
import FichaColaboradorModal from "./FichaColaboradorModal";
import TraerDesdeAdelantosModal from "./TraerDesdeAdelantosModal";
import TablaPersonal from "./TablaPersonal";
import FichasPorCompletar from "@/components/admin/shared/FichasPorCompletar";
import { personasPorCompletar, resumenDeFaltas, type ClaveFaltaPersona } from "@/lib/rrhh/fichas-por-completar";
import FiltrosPersonal, { type ChipEstado } from "./FiltrosPersonal";
import { useContratosDelPersonal } from "./use-contratos-del-personal";
import type { EstadoColaborador, NivelRrhh } from "@/lib/rrhh/tipos";

/** Los contratos que no están ligados a nadie se arreglan en la lista de Documentos. */
const HREF_CONTRATOS = "/admin?tab=documentos&vista=contratos&sub=contratos";

export default function PersonalView({ nivel }: { nivel: NivelRrhh }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [chip, setChip] = useState<ChipEstado>("ACTIVO");
  const [soloPorVencer, setSoloPorVencer] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [traerAbierta, setTraerAbierta] = useState(false);
  // La ficha abierta vive en `?persona=<id>`: la abre el QR del fotocheck
  // (ADR-416), un enlace de otra pantalla o el clic en la fila; el «atrás» la
  // cierra, y cerrarla saca el parámetro (si quedaba, volver a RRHH la reabría).
  const ficha = useFichaEnUrl("persona");
  // «Que la tabla cambie a formato de fotocheck y LUEGO aparezca el botón de
  // descargar» (Brandon 2026-09-15): la lista se ve como tarjetas antes de imprimir.
  const [modoFotocheck, setModoFotocheck] = useState(false);
  // «Imprimir fotochecks» desde el kiosko de la asistencia llega con `?fotochecks=1`.
  const pideFotochecks = useSearchParams().get("fotochecks") === "1";
  useEffect(() => {
    if (pideFotochecks) setModoFotocheck(true);
  }, [pideFotochecks]);

  // El input nunca se desmonta: `qInput` cambia en cada tecla, `q` (lo que
  // dispara el fetch) recién 250ms después de la última tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const { colaboradores, loading, error, recargar } = useRrhhColaboradores(
    { q: q || undefined, puestoId: puestoId || undefined, incluirCesados: true },
    false,
  );
  const { puestos } = useRrhhPuestos();
  // «Estrenar RRHH con tu gente» (Brandon 2026-09-14): traer personas ya
  // conocidas desde Adelantos en vez de tipearlas de cero. Sólo nivel
  // completo — el vínculo con la cuenta de Adelantos es territorio de admin/
  // owner (mismo criterio que `vincular_beneficiario`, ADR-414 §1).
  const { candidatos: candidatosAdelantos } = useRrhhDesdeAdelantos(nivel === "completo");

  const kpis = useMemo(() => {
    const base: Record<EstadoColaborador, number> = { ACTIVO: 0, VACACIONES: 0, LICENCIA: 0, SUSPENDIDO: 0, CESADO: 0 };
    for (const c of colaboradores) base[c.estado] += 1;
    return base;
  }, [colaboradores]);

  const puedeEditar = nivel === "gestion" || nivel === "completo";
  const contratos = useContratosDelPersonal(puedeEditar);
  const porVencer = (id: string) => contratos.porPersona?.get(id)?.estado === "POR_VENCER";
  const cuantosPorVencer = contratos.porPersona ? colaboradores.filter((c) => porVencer(c.id)).length : 0;
  // «Fichas por completar»: sólo activos y sólo para quien puede editar (el nivel marcar no ve documento ni celular).
  const porCompletar = useMemo(() => (puedeEditar ? personasPorCompletar(colaboradores) : []), [puedeEditar, colaboradores]);
  const [completar, setCompletar] = useState<ClaveFaltaPersona | null>(null);
  const completarFicha = (id: string) => {
    setCompletar(porCompletar.find((p) => p.id === id)?.primerCampo ?? null);
    ficha.abrir(id);
  };
  const porEstado = chip === "TODOS" ? colaboradores : colaboradores.filter((c) => c.estado === chip);
  const filtrados = soloPorVencer ? porEstado.filter((c) => porVencer(c.id)) : porEstado;
  // Un cesado no lleva fotocheck: se excluye de la vista y del PDF, aunque el chip lo muestre.
  const paraFotocheck = filtrados.filter((c) => c.estado !== "CESADO");
  const enFotocheck = modoFotocheck && paraFotocheck.length > 0;
  // «Primera carga» es sólo la primera. Con `colaboradores.length === 0` como
  // señal, una búsqueda sin resultados volvía a desmontar el buscador en la
  // tecla siguiente y se perdía el foco otra vez.
  const [cargoUnaVez, setCargoUnaVez] = useState(false);
  useEffect(() => {
    if (!loading) setCargoUnaVez(true);
  }, [loading]);
  const cargaInicial = loading && !cargoUnaVez;
  const recargando = loading && cargoUnaVez;

  const menu: MenuAccion[] = [
    ...(nivel === "completo" && candidatosAdelantos.length > 0
      ? [{ id: "traer", label: "Traer de Adelantos", meta: String(candidatosAdelantos.length), hint: "Personas que ya tienen cuenta de Adelantos", icon: UserPlus, onSelect: () => setTraerAbierta(true) }]
      : []),
    ...(puedeEditar && paraFotocheck.length > 0
      ? [modoFotocheck
          ? { id: "tabla", label: "Ver la tabla", icon: LayoutList, onSelect: () => setModoFotocheck(false) }
          : { id: "fotochecks", label: "Fotochecks para imprimir", meta: String(paraFotocheck.length), hint: "La lista como fotochecks, con su QR; después se descargan", icon: QrCode, onSelect: () => setModoFotocheck(true) }]
      : []),
  ];
  const encabezado = (
    <EncabezadoDeVista
      vista="personal"
      periodo={
        <FiltrosPersonal
          qInput={qInput}
          onQ={setQInput}
          puestoId={puestoId}
          onPuesto={setPuestoId}
          puestos={puestos}
          chip={chip}
          onChip={setChip}
          conteo={kpis}
          total={colaboradores.length}
          cuantosPorVencer={cuantosPorVencer}
          soloPorVencer={soloPorVencer}
          onSoloPorVencer={() => setSoloPorVencer((v) => !v)}
        />
      }
      menu={menu}
      acciones={
        puedeEditar ? (
          /* Angosto: «+» con tooltip, para que los filtros entren en la fila (regla 6). */
          <button type="button" onClick={() => setAltaAbierta(true)} className={cn(BOTON.primario, "px-3 @min-[76rem]/enc:px-4")} title="Agregar persona" aria-label="Agregar persona">
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden @min-[76rem]/enc:inline">Agregar persona</span>
          </button>
        ) : null
      }
    />
  );

  if (cargaInicial) return <div className="space-y-3">{encabezado}<LoadingState message="Cargando el personal..." /></div>;
  if (error) {
    return (
      <div className="space-y-3">
        {encabezado}
        <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error} <button type="button" onClick={recargar} className="ml-2 min-h-12 font-bold underline">Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {encabezado}

      <FichasPorCompletar
        items={porCompletar.map((p) => ({ id: p.id, nombre: p.nombre, faltan: p.faltan }))}
        resumen={resumenDeFaltas(porCompletar)}
        onCompletar={completarFicha}
      />

      {contratos.sinPersona > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-secondary)]">
          <FileSignature className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {pluralizar(contratos.sinPersona, "contrato de trabajo sin persona", "contratos de trabajo sin persona")}
          <a
            href={HREF_CONTRATOS}
            onClick={(e) => {
              e.preventDefault();
              irAEnlace(HREF_CONTRATOS);
            }}
            className="inline-flex min-h-12 items-center font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
          >
            Verlos en Documentos › Contratos
          </a>
        </p>
      )}

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={colaboradores.length === 0 ? "Agrega a tu primera persona" : "Nadie coincide"}
          description={colaboradores.length === 0 ? "Nombre, puesto y desde cuándo trabaja contigo." : "Prueba con otro filtro o busca otro nombre."}
          action={
            puedeEditar && colaboradores.length === 0
              ? {
                  label: "Agregar persona",
                  node: (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {nivel === "completo" && candidatosAdelantos.length > 0 && (
                        <button type="button" onClick={() => setTraerAbierta(true)} className={BOTON.secundario}>
                          <UserPlus className="h-4 w-4" /> Traer de Adelantos ({candidatosAdelantos.length})
                        </button>
                      )}
                      <button type="button" onClick={() => setAltaAbierta(true)} className={BOTON.primario}>
                        <Plus className="h-4 w-4" /> Agregar persona
                      </button>
                    </div>
                  ),
                }
              : undefined
          }
        />
      ) : enFotocheck ? (
        <FotochecksVista
          colaboradores={paraFotocheck}
          cesadosOmitidos={filtrados.length - paraFotocheck.length}
          onVolver={() => setModoFotocheck(false)}
        />
      ) : (
        <div aria-busy={recargando} className={cn("transition-opacity", recargando && "opacity-60")}>
          <TablaPersonal filas={filtrados} onAbrir={ficha.abrir} contratos={contratos.porPersona} puedeHacerContrato={puedeEditar} />
        </div>
      )}

      {altaAbierta && (
        <ColaboradorFormModal
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          nivel={nivel}
          onGuardado={() => { setAltaAbierta(false); recargar(); }}
        />
      )}
      {traerAbierta && (
        <TraerDesdeAdelantosModal
          open={traerAbierta}
          onClose={() => setTraerAbierta(false)}
          nivel={nivel}
          onCambio={recargar}
        />
      )}
      {ficha.id && (
        <FichaColaboradorModal
          open
          colaboradorId={ficha.id}
          onClose={() => { setCompletar(null); ficha.cerrar(); }}
          completar={completar}
          nivel={nivel}
          onCambio={() => {
            recargar();
            contratos.recargar();
          }}
        />
      )}
    </div>
  );
}
