"use client";

/**
 * LibretaModal — la libreta (el Directorio) en una ventana encima de la guía.
 *
 * Brandon 16-10-2026: «tiene que estar mejor organizado, clasificado, ordenado
 * por categoría para usarlo mejor, y al seleccionarlo tendrá una vista de sus
 * datos». A 1280, dos paneles:
 *
 *   · Izquierda — las categorías en pestañas con su cifra (la del bloque
 *     primero y abierta), buscador por nombre, RUC/DNI, placa o dirección, y el
 *     orden (recientes, más usados, A → Z; se recuerda por negocio).
 *   · Derecha — la ficha de la elegida, ANTES de usarla: todo lo guardado, con
 *     el sello «Guía (21)» o «Interno» por campo y lo que le falta. «Usar en
 *     este bloque» o «Editar»; doble clic o Enter en la lista también usan.
 *
 * A 400 px se ve la lista; un toque abre la ficha a ventana entera con
 * «Volver». Personas y vehículos viven en la misma libreta: el bloque del
 * vehículo y el de cada papel abren la misma ventana, cada uno en lo suyo.
 *
 * Va con `aboveModals`: la guía ya es un modal, y Escape cierra sólo esta capa.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, Truck, Users } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ROL_LABEL, type Parte, type ParteInput, type Vehiculo, type VehiculoInput } from "@/lib/forestal/directorio";
import {
  defCategoria,
  rolParaFicha,
  usoEnBloque,
  type BloqueLibreta,
  type CategoriaLibreta,
  type EntradaLibreta,
  type ValorParte,
} from "@/lib/forestal/libreta";
import { useLibreta, type VehiculoDeLaGuia } from "./hooks/use-libreta";
import AltaDeParte from "./libreta-alta-parte";
import AltaDeVehiculo from "./libreta-alta-vehiculo";
import LibretaFicha from "./libreta-ficha";
import LibretaLista from "./libreta-lista";
import { Btn } from "./ctp-shared";

type Modo = { paso: "ver" } | { paso: "agregar" } | { paso: "editar"; entrada: EntradaLibreta };

export interface PropsLibreta {
  bloque: BloqueLibreta;
  /** Cómo se llama el bloque en la guía («Punto de partida»); por defecto, el papel. */
  titulo?: string;
  /** Las personas de la libreta (activas); `null` si esta pantalla no las tiene. */
  partes: readonly Parte[] | null;
  /** Las que ya tienen el papel del bloque: usar una de las demás se lo suma. */
  conPapel: ReadonlySet<string>;
  vehiculos: readonly Vehiculo[] | null;
  borradorParte?: ValorParte;
  borradorVehiculo?: VehiculoDeLaGuia;
  /** El alta pide los extras del papel (autorización, licencia, teléfono…). */
  conExtras: boolean;
  onUsarParte?: (p: Parte, sumarRol: boolean) => void;
  onUsarVehiculo?: (v: Vehiculo) => void;
  /** Guarda y usa en la guía; devuelve el `id` guardado si lo sabe. Tira con el motivo. */
  onAgregarParte?: (input: ParteInput, valor: ValorParte) => Promise<{ id: string } | void>;
  onAgregarVehiculo?: (input: VehiculoInput) => Promise<{ id: string } | void>;
  /** Editar una ficha guardada (con `id`, la fila completa). */
  onEditarParte?: (input: ParteInput & { id?: string }) => Promise<unknown>;
  onEditarVehiculo?: (input: VehiculoInput & { id?: string }) => Promise<unknown>;
  onCerrar: () => void;
}

export default function LibretaModal(props: PropsLibreta) {
  const { bloque, titulo, partes, conPapel, vehiculos, borradorParte, borradorVehiculo, conExtras, onCerrar } = props;
  const l = useLibreta({ bloque, partes, vehiculos, borradorParte, borradorVehiculo });
  const esVehiculo = bloque.tipo === "vehiculo";
  const puedeAgregar = Boolean(esVehiculo ? props.onAgregarVehiculo : props.onAgregarParte);
  const vacia = (esVehiculo ? vehiculos?.length ?? 0 : partes?.length ?? 0) === 0;
  const [modo, setModo] = useState<Modo>(() => (vacia && puedeAgregar ? { paso: "agregar" } : { paso: "ver" }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idForm = useId();
  const idPanel = useId();
  const nombreBloque = titulo ?? (bloque.tipo === "parte" ? ROL_LABEL[bloque.rol] : "Vehículo");
  const rolFicha = rolParaFicha(bloque, l.categoria);
  const elegida = l.elegida;
  const uso = elegida ? usoEnBloque(bloque, elegida, conPapel) : null;
  const editable = (e: EntradaLibreta) => Boolean(e.tipo === "parte" ? props.onEditarParte : props.onEditarVehiculo);

  function usar(e: EntradaLibreta) {
    const u = usoEnBloque(bloque, e, conPapel);
    if (!u.usable) return l.elegir(e.id, true);
    l.marcarUso(e.id);
    if (e.tipo === "parte") props.onUsarParte?.(e.parte, u.sumarRol);
    else props.onUsarVehiculo?.(e.vehiculo);
  }

  /** Guardar (alta o edición) con la ventana abierta hasta que el Directorio conteste. */
  async function guardar(accion: () => Promise<{ id: string } | void | unknown>, alTerminar?: (id: string | null) => void) {
    setGuardando(true);
    setError(null);
    try {
      const r = await accion();
      const id = r && typeof r === "object" && "id" in r && typeof r.id === "string" ? r.id : null;
      alTerminar?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const volver = () => {
    setError(null);
    setModo({ paso: "ver" });
  };

  const vaciaDeLista = l.enOtra ? (
    <span className="grid justify-items-center gap-2">
      <span>
        Nadie coincide con «{l.q}» en {defCategoria(l.categoria).rotulo.toLowerCase()}; hay {l.enOtra.cuenta} en {l.enOtra.rotulo}.
      </span>
      <Btn variant="secondary" onClick={() => l.cambiarCategoria(l.enOtra?.clave as CategoriaLibreta)}>
        Ver en {l.enOtra.rotulo}
      </Btn>
    </span>
  ) : l.q ? (
    `Nadie coincide con «${l.q}».`
  ) : (
    `Todavía no hay ${defCategoria(l.categoria).rotulo.toLowerCase()} en tu libreta.`
  );

  const enFicha = l.vistaMovil === "ficha";
  /* A 400 px lista y ficha se turnan: el foco va con lo que se ve (el botón
     tocado se escondía y el foco caía a <body>, medido 16-10). */
  const columnas = useRef<HTMLDivElement>(null);
  const fichaAntes = useRef(enFicha);
  useEffect(() => {
    if (fichaAntes.current === enFicha) return;
    fichaAntes.current = enFicha;
    const caja = columnas.current;
    const sel = enFicha ? "[data-testid=libreta-ficha] button" : "[role=option][aria-selected=true]";
    if (caja && window.matchMedia("(max-width: 639px)").matches) caja.querySelector<HTMLElement>(sel)?.focus();
  }, [enFicha]);
  const pie =
    modo.paso === "ver" ? (
      <ModalFooter nota={l.secciones.length === 1 ? `${l.secciones[0].cuenta} en tu libreta` : undefined}>
        <Btn onClick={onCerrar}>Cerrar</Btn>
        {puedeAgregar && (
          <Btn className={enFicha ? "max-sm:hidden" : ""} onClick={() => setModo({ paso: "agregar" })}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar nuevo
          </Btn>
        )}
        {elegida && uso?.usable && (
          <Btn variant="primary" className={enFicha ? "" : "max-sm:hidden"} onClick={() => usar(elegida)}>
            <Check className="h-4 w-4" aria-hidden />
            Usar en este bloque
          </Btn>
        )}
      </ModalFooter>
    ) : (
      <ModalFooter error={error} nota={modo.paso === "agregar" ? "Queda en tu libreta y se usa en esta guía." : "Cambia la ficha de la libreta, no lo ya escrito en esta guía."}>
        {vacia && modo.paso === "agregar" ? (
          <Btn onClick={onCerrar}>Cancelar</Btn>
        ) : (
          <Btn onClick={volver}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a la lista
          </Btn>
        )}
        <Btn variant="primary" type="submit" form={idForm} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : modo.paso === "agregar" ? <Plus className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          {modo.paso === "agregar" ? "Guardar y usar" : "Guardar cambios"}
        </Btn>
      </ModalFooter>
    );

  const tituloVentana =
    modo.paso === "ver" ? `Libreta · ${nombreBloque}` : modo.paso === "agregar" ? `Agregar a la libreta · ${nombreBloque}` : `Editar · ${modo.entrada.nombre}`;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals
      size={modo.paso === "ver" ? "xl" : "lg"}
      icon={esVehiculo ? Truck : Users}
      title={tituloVentana}
      claveVentana={esVehiculo ? "libreta-vehiculo" : `libreta-${bloque.rol}`}
      ayuda={
        modo.paso === "ver" ? (
          <InfoTip
            title="Cómo se usa la libreta"
            what="Elige una entrada para ver su ficha al lado; «Usar en este bloque», doble clic o Enter la copian a la guía."
            body="Las pestañas separan por papel: la de este bloque va primero. El orden se recuerda en este equipo."
            example="Tipea «made» y Enter: el comprador de siempre queda en la guía."
          />
        ) : undefined
      }
      footer={pie}
    >
      <div className="px-5 py-4 sm:px-6">
        {modo.paso === "agregar" && bloque.tipo === "parte" && (
          <AltaDeParte
            id={idForm}
            rol={bloque.rol}
            borrador={borradorParte ?? { nombre: "", docTipo: bloque.rol === "conductor" ? "DNI" : "RUC", docNumero: "", direccion: "" }}
            conExtras={conExtras}
            onGuardar={(input, valor) => void guardar(() => props.onAgregarParte?.(input, valor) ?? Promise.resolve(), (id) => id && l.marcarUso(id))}
            onError={setError}
          />
        )}
        {modo.paso === "agregar" && esVehiculo && (
          <AltaDeVehiculo
            id={idForm}
            vehiculos={vehiculos ?? []}
            borrador={borradorVehiculo}
            onGuardar={(input) => void guardar(() => props.onAgregarVehiculo?.(input) ?? Promise.resolve(), (id) => id && l.marcarUso(id))}
            onError={setError}
          />
        )}
        {modo.paso === "editar" && modo.entrada.tipo === "parte" && (
          <AltaDeParte
            id={idForm}
            rol={rolFicha ?? modo.entrada.parte.roles[0] ?? "destinatario"}
            borrador={{ nombre: "", docTipo: "RUC", docNumero: "", direccion: "" }}
            editando={modo.entrada.parte}
            conExtras
            onGuardar={(input) => void guardar(() => props.onEditarParte?.(input) ?? Promise.resolve(), volver)}
            onError={setError}
          />
        )}
        {modo.paso === "editar" && modo.entrada.tipo === "vehiculo" && (
          <AltaDeVehiculo
            id={idForm}
            vehiculos={vehiculos ?? []}
            editando={modo.entrada.vehiculo}
            onGuardar={(input) => void guardar(() => props.onEditarVehiculo?.(input) ?? Promise.resolve(), volver)}
            onError={setError}
          />
        )}

        {modo.paso === "ver" && (
          <div className="grid gap-3">
            {l.secciones.length > 1 && (
              <BarraDeSecciones
                secciones={l.secciones}
                activa={l.categoria}
                onCambiar={l.cambiarCategoria}
                etiqueta="Categorías de la libreta"
                idPanel={idPanel}
                tonoCuenta="neutro"
              />
            )}
            <div
              ref={columnas}
              id={idPanel}
              role={l.secciones.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={l.secciones.length > 1 ? idPestanaDeSeccion(idPanel, l.categoria) : undefined}
              className="grid gap-4 sm:h-[min(30rem,62vh)] sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:grid-rows-[minmax(0,1fr)]"
            >
              <div className={`flex min-h-0 flex-col ${enFicha ? "max-sm:hidden" : ""}`}>
                <LibretaLista
                  lista={l.lista}
                  elegidaId={elegida?.id ?? null}
                  rolFicha={rolFicha}
                  usables={conPapel}
                  q={l.q}
                  onBuscar={l.setQ}
                  orden={l.orden}
                  onOrden={l.setOrden}
                  vacia={vaciaDeLista}
                  onElegir={l.elegir}
                  onUsar={usar}
                />
              </div>
              <div className={`min-h-0 overflow-y-auto overscroll-contain sm:border-l sm:border-[var(--rule-soft)] sm:pl-4 ${enFicha ? "" : "max-sm:hidden"}`}>
                {elegida ? (
                  <LibretaFicha
                    entrada={elegida}
                    rolFicha={elegida.tipo === "parte" ? rolFicha : null}
                    nota={uso?.nota}
                    marcas={l.marcas}
                    onEditar={editable(elegida) ? () => setModo({ paso: "editar", entrada: elegida }) : undefined}
                    onVolver={() => l.setVistaMovil("lista")}
                  />
                ) : (
                  <p className="px-1 py-6 text-center text-sm text-[var(--text-tertiary)]">Elige una entrada para ver su ficha.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
