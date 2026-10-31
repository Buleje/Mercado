"use client";

/**
 * CtpDirectorioView — la libreta del aserradero (ADR-317).
 *
 * Quién le vende, a quién le vende, quién transporta y con qué camión. Antes eso
 * vivía disperso: el proveedor como texto libre en cada ingreso, el resto tipeado
 * de nuevo en cada guía. Acá es UNA fila por actor, con su documento, y desde acá
 * se ve cuánto se usó cada uno.
 *
 * Los faltantes se muestran por rol y no bloquean: una libreta a medio llenar
 * sigue sirviendo, pero el operador tiene que ver antes de imprimir que a ese
 * destinatario le falta la dirección.
 *
 * Compactación del libro (17-10): «Agregar» y «Planilla» van al riel, las
 * pestañas en UNA fila con `?sub=` (`SUBS_DIRECTORIO`) y la última es «Tu CTP»,
 * la Ficha del CTP que antes era otra vista (`?vista=ficha` abre ahí).
 */

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  ROL_LABEL,
  faltantesParaGuia,
  filtrarPartes,
  filtrarVehiculos,
  formatearPlaca,
  ordenarPorUso,
  type Parte,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import CtpDirectorioDesdeGuias from "./CtpDirectorioDesdeGuias";
import CtpParteModal from "./CtpParteModal";
import CtpVehiculoModal from "./CtpVehiculoModal";
import CtpProveedorTrazaModal from "./CtpProveedorTrazaModal";
import { TablaSkeleton } from "./ctp-shared";
import CtpImportarPartesModal from "./CtpImportarPartesModal";
import { useParteEnUrl } from "./hooks/use-parte-en-url";
import { partesACsv } from "@/lib/forestal/directorio-importar";
import CtpDirectorioPestanas from "./CtpDirectorioPestanas";
import { ListaPartes, ListaVehiculos } from "./CtpDirectorioListas";
import CtpFichaEditor from "./CtpFichaEditor";
import FichasPorCompletar from "@/components/admin/shared/FichasPorCompletar";
import { partesPorCompletar, resumenDeFaltasParte } from "@/lib/forestal/fichas-por-completar";
import type { PasoFicha } from "@/lib/forestal/directorio-pasos";
import { BuscarDirectorio, RielDirectorio } from "./CtpDirectorioBarra";
import { SUBS_DIRECTORIO, subPedidoPorVistaVieja, type SubDirectorio } from "./ctp-vistas-fusionadas";
import { usePestanaInterna } from "./hooks/use-pestana-interna";

/** "1 parte" y no "1 partes": el conteo del encabezado se lee todo el tiempo. */
const plural = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;

export default function CtpDirectorioView({
  pedido = null,
}: {
  /** La pestaña que pide el libro estando YA en el Directorio (ver `usePestanaInterna`). */
  pedido?: { sub: string; n: number } | null;
} = {}) {
  const { confirm } = useConfirm();
  const dir = useDirectorioForestal();
  /* La URL vieja (`?vista=ficha`) se lee UNA vez, al montar: después el libro la reescribe. */
  const [forzada] = useState(() => subPedidoPorVistaVieja("directorio"));
  const { sub: pestaña, irA: setPestaña } = usePestanaInterna<SubDirectorio>({
    moduleId: "ctp-directorio",
    validas: SUBS_DIRECTORIO,
    porDefecto: "destinatario",
    forzada,
    pedido,
  });
  const [q, setQ] = useState("");
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [editando, setEditando] = useState<{ tipo: "parte"; valor: Parte | null } | { tipo: "vehiculo"; valor: Vehiculo | null } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  /** Titular cuya cadena se está mirando (ADR-319). */
  const [trazando, setTrazando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  /* «Completar» abre la ficha parada en el paso donde falta lo primero. */
  const [pasoAlCompletar, setPasoAlCompletar] = useState<PasoFicha | undefined>(undefined);
  const porCompletar = useMemo(() => partesPorCompletar(dir.partes, dir.vehiculos), [dir.partes, dir.vehiculos]);
  /* `?parte=<id>`: la ficha de esa parte, encima de su pestaña, con el enlace copiable. */
  const fichaParte = useParteEnUrl(dir.partes, dir.cargando, (p) => {
    if (!p.roles.includes(pestaña as RolParte) && p.roles[0]) setPestaña(p.roles[0]);
  });
  const parteAbierta = fichaParte.parte ?? (editando?.tipo === "parte" ? editando.valor : null);

  const esVehiculos = pestaña === "vehiculos";
  const esTuCtp = pestaña === "tu-ctp";
  /** El rol de la pestaña; `null` en Vehículos y en Tu CTP. */
  const rol: RolParte | null = esVehiculos || esTuCtp ? null : (pestaña as RolParte);
  const transportistas = useMemo(() => dir.porRol("transportista"), [dir]);

  const partesDelRol = useMemo(() => {
    if (!rol) return [];
    // Incluye las inactivas: esta vista ES la administración, y una parte dada de
    // baja tiene que poder verse para reactivarla.
    return dir.partes.filter((p) => p.roles.includes(rol));
  }, [dir.partes, rol]);

  /** Cuántas de esta pestaña le faltan datos para poder usarse en una guía. */
  const incompletosDelRol = useMemo(
    () => (rol ? partesDelRol.filter((p) => faltantesParaGuia(p, rol).length > 0).length : 0),
    [partesDelRol, rol],
  );

  const partesVisibles = useMemo(() => {
    if (!rol) return [];
    const filtradas = filtrarPartes(partesDelRol, q);
    // Más usadas primero — el mismo orden que ya ve el operador al elegir en
    // una guía (dir.porRol), acá simplemente no estaba aplicado.
    const ordenadas = ordenarPorUso(filtradas);
    return soloIncompletos ? ordenadas.filter((p) => faltantesParaGuia(p, rol).length > 0) : ordenadas;
  }, [partesDelRol, rol, q, soloIncompletos]);

  const vehiculosVisibles = useMemo(
    () => (esVehiculos ? ordenarPorUso(filtrarVehiculos(dir.vehiculos, q)) : []),
    [dir.vehiculos, q, esVehiculos],
  );

  /**
   * Baja LO QUE SE ESTÁ VIENDO, con el filtro y la pestaña puestos: un export
   * que ignora el filtro obliga a rehacer el trabajo en la planilla.
   */
  function descargarCsv() {
    const blob = new Blob([partesACsv(partesVisibles)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `directorio-${pestaña}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const conteo = (p: SubDirectorio) =>
    p === "tu-ctp"
      ? null
      : p === "vehiculos"
        ? dir.vehiculos.length
        : dir.partes.filter((x) => x.roles.includes(p as RolParte)).length;

  async function borrar(id: string, nombre: string, tipo: "parte" | "vehiculo") {
    if (!(await confirm({
      title: `¿Dar de baja a ${nombre}?`,
      description: "Deja de ofrecerse en las guías; lo ya emitido no cambia.",
      intent: "danger",
      confirmLabel: "Sí, dar de baja",
    }))) return;
    setBorrando(id);
    try {
      if (tipo === "parte") await dir.eliminarParte(id);
      else await dir.eliminarVehiculo(id);
    } finally {
      setBorrando(null);
    }
  }

  const agregar = esVehiculos ? "Agregar vehículo" : rol ? `Agregar ${ROL_LABEL[rol].toLowerCase()}` : null;

  return (
    <div className="space-y-3">
      {/* En «Tu CTP» el riel (ⓘ y «Editar ficha») es el de la Ficha. */}
      {agregar && (
        <RielDirectorio
          meta={`${plural(dir.partes.length, "parte", "partes")} · ${plural(dir.vehiculos.length, "vehículo", "vehículos")}`}
          conPlanilla={rol !== null}
          visibles={partesVisibles.length}
          agregar={agregar}
          onBajar={descargarCsv}
          onTraer={() => setImportando(true)}
          onAgregar={() => setEditando(esVehiculos ? { tipo: "vehiculo", valor: null } : { tipo: "parte", valor: null })}
        />
      )}

      {/* La libreta que ya está escrita en las guías (ADR-357). Va ARRIBA de las
          pestañas: con el directorio en cero, lo primero que hay que ver es que
          los contactos ya existen y de dónde sacarlos. */}
      {!esTuCtp && (
        <CtpDirectorioDesdeGuias
          partes={dir.partes}
          vehiculos={dir.vehiculos}
          onGuardarParte={dir.guardarParte}
          onGuardarVehiculo={dir.guardarVehiculo}
        />
      )}

      {!esTuCtp && !dir.cargando && (
        <FichasPorCompletar
          items={porCompletar.map((x) => ({ id: x.id, nombre: x.nombre, detalle: x.papel ? ROL_LABEL[x.papel] : undefined, faltan: x.faltan }))}
          resumen={resumenDeFaltasParte(porCompletar)}
          onCompletar={(id) => {
            const x = porCompletar.find((f) => f.id === id);
            setPasoAlCompletar(x?.faltan[0]?.paso);
            fichaParte.abrir(id);
          }}
        />
      )}

      <CtpDirectorioPestanas activa={pestaña} onCambiar={setPestaña} conteo={conteo}>
        {esTuCtp ? (
          <CtpFichaEditor />
        ) : (
          <>
            <BuscarDirectorio
              esVehiculos={esVehiculos}
              q={q}
              onQ={setQ}
              incompletos={rol ? incompletosDelRol : null}
              soloIncompletos={soloIncompletos}
              onSoloIncompletos={() => setSoloIncompletos((v) => !v)}
            />

            {dir.error && (
              <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                {dir.error}
              </p>
            )}

            {fichaParte.noEsta && (
              <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
                El enlace apunta a una parte que no está en el directorio.
                <button type="button" onClick={fichaParte.cerrar} className="font-semibold text-[var(--accent-ink)] underline underline-offset-2">
                  Quitar
                </button>
              </p>
            )}

            {dir.cargando ? (
              <TablaSkeleton />
            ) : esVehiculos ? (
              <ListaVehiculos
                vehiculos={vehiculosVisibles}
                borrando={borrando}
                onEditar={(v) => setEditando({ tipo: "vehiculo", valor: v })}
                onBorrar={(v) => void borrar(v.id, formatearPlaca(v.placa), "vehiculo")}
                busqueda={q}
                onQuitarBusqueda={() => setQ("")}
              />
            ) : rol ? (
              <ListaPartes
                partes={partesVisibles}
                rol={rol}
                borrando={borrando}
                vacioTexto={soloIncompletos ? "Ningún registro incompleto — la libreta está al día en este rol." : undefined}
                onTrazar={(p) => setTrazando(p.nombre)}
                onEditar={(p) => fichaParte.abrir(p.id)}
                onBorrar={(p) => void borrar(p.id, p.nombre, "parte")}
                busqueda={q}
                onQuitarBusqueda={() => setQ("")}
              />
            ) : null}
          </>
        )}
      </CtpDirectorioPestanas>

      {(fichaParte.parte || editando?.tipo === "parte") && (
        <CtpParteModal
          key={parteAbierta?.id ?? "nueva"}
          parte={parteAbierta}
          pasoInicial={pasoAlCompletar}
          rolInicial={rol ?? "destinatario"}
          existentes={dir.partes}
          // La misma ficha abierta desde el picker lista los camiones del
          // transportista; sin esto, la de ESTA pantalla no los mostraba.
          vehiculos={dir.vehiculos}
          // Devuelve la ficha guardada: el modal la necesita para colgarle los
          // permisos que se cargaron durante el alta (ADR-425).
          onGuardar={(input) => dir.guardarParte(input)}
          onClose={() => {
            setPasoAlCompletar(undefined);
            if (fichaParte.parte) fichaParte.cerrar();
            else setEditando(null);
          }}
        />
      )}
      {trazando && <CtpProveedorTrazaModal proveedor={trazando} onClose={() => setTrazando(null)} />}
      {importando && (
        <CtpImportarPartesModal
          existentes={dir.partes}
          rol={rol ?? "destinatario"}
          onImportar={(input) => dir.guardarParte(input)}
          onClose={() => setImportando(false)}
        />
      )}
      {editando?.tipo === "vehiculo" && (
        <CtpVehiculoModal
          vehiculo={editando.valor}
          transportistas={transportistas}
          existentes={dir.vehiculos}
          onGuardar={async (input) => {
            await dir.guardarVehiculo(input);
          }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
