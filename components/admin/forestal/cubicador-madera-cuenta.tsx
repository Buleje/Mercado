"use client";

/**
 * «Cuenta ▾» del Cubicador de madera: el lote de aserrada (PT) a la cuenta de
 * una persona, con el MISMO modelo, servidor y ventanas que el patio de trozas
 * (ADR-478/483/484). No hay otro camino de plata:
 *
 *   - Guardar → `GuardarMaderaEnLaCuentaModal` (el lote se guarda en el
 *     Cubicador y la cubicación comercial lo referencia por `cubicacionRefId`).
 *   - Ponerle precio por PT, descontar del adelanto y anular →
 *     `ValorizarCubicacionModal`, arrancando con los precios que el cubicador
 *     ya muestra (`preciosSugeridosMadera`); el monto lo calcula el servidor.
 *   - Todas las de madera → `ListaGuardadasModal material="aserrada"`.
 *
 * Su propio estado (qué ventana está abierta) vive acá y no en
 * `CubicadorMadera`: abrir una ventana no redibuja la tabla entera.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Coins, FolderOpen, Save, UserCheck } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  cubicacionVigente, esDelCubicador, loteCambio, mezclarDelLote, preciosSugeridosMadera, vistaPreviaMadera,
} from "@/lib/forestal/cubicacion-madera-cuenta";
import { AccionLote, MenuAcciones, type AccionMenu } from "./cubicador-acciones";
import GuardarMaderaEnLaCuentaModal from "./cubicador-madera-cuenta-guardar";
import type { ActionToast } from "./cubicador-toasts";
import { ListaGuardadasModal } from "./cubicador-trozas-guardadas";
import ValorizarCubicacionModal from "./cubicador-trozas-valorizar";
import { ESTADO_CUB, useCubicacionesTrozas, type CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

export default function CuentaDeMadera({
  rows, especieDelLote, cliente, fechaDelLote, refId, precioDe, precioGeneral, guardarLote, avisar,
}: {
  rows: PiezaCubicada[];
  especieDelLote: string | null;
  /** El «cliente» escrito a mano en el lote (sigue igual): sólo sugiere la persona. */
  cliente: string;
  fechaDelLote: string;
  /** El id del lote en el Cubicador (null = todavía sin guardar). */
  refId: string | null;
  precioDe: (p: PiezaCubicada) => number;
  precioGeneral: number;
  /** Guarda (o actualiza) el lote en el Cubicador sin avisos propios; null = no se pudo. */
  guardarLote: () => Promise<{ id: string; nombre: string } | null>;
  avisar: (t: Omit<ActionToast, "id" | "exiting">) => void;
}) {
  const rol = useMiRol();
  const puedeAplicar = rol === "admin" || rol === "owner" || rol === "superadmin";
  const [guardando, setGuardando] = useState(false);
  const [viendoLista, setViendoLista] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  /* Lo que esta pantalla acaba de guardar/aplicar/anular/borrar y la lista
     todavía no trae: sin esto, un segundo «Guardar» con la lista vieja creaba
     otra cubicación del mismo lote. */
  const [locales, setLocales] = useState<CubicacionTrozas[]>([]);
  const [borradas, setBorradas] = useState<ReadonlySet<string>>(() => new Set());

  const { lista, error, recargar } = useCubicacionesTrozas({ material: "aserrada", ref: refId ?? undefined }, !!refId);
  /* Con la lista caída NO se decide: «no hay ninguna» crearía un duplicado. */
  const delLote = useMemo(
    () => (error ? null : mezclarDelLote(lista, locales, borradas, refId)),
    [error, lista, locales, borradas, refId],
  );
  const vigente = cubicacionVigente(delLote);
  /* El borrador propio se puede actualizar; el del despacho se abre allá. */
  const borrador = vigente?.estado === "borrador" && esDelCubicador(vigente) ? vigente : null;
  const vista = useMemo(() => vistaPreviaMadera(rows, especieDelLote), [rows, especieDelLote]);
  /* Se editó el lote después de guardarlo: cobrar ahora cobraría las medidas viejas. */
  const cambio = !!borrador && loteCambio(vista, borrador);
  const sugeridos = useMemo(
    () => preciosSugeridosMadera(rows, especieDelLote, precioDe, precioGeneral),
    [rows, especieDelLote, precioDe, precioGeneral],
  );

  const recordar = (c: CubicacionTrozas) => {
    setLocales((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
    recargar();
  };
  const olvidar = (id: string) => {
    setBorradas((prev) => new Set(prev).add(id));
    recargar();
  };

  const alGuardar = (c: CubicacionTrozas) => {
    setGuardando(false);
    recordar(c);
    avisar({
      tono: "success",
      msg: `Guardada como ${c.codigo}`,
      detail: c.personaNombre ? `A la cuenta de ${c.personaNombre}` : undefined,
    });
    /* El dueño o el admin sigue de una: el precio ya viene del cubicador. */
    if (puedeAplicar) setAbierta(c.id);
  };

  const items: AccionMenu[] = [
    {
      key: "guardar-cuenta",
      label: borrador ? `Actualizar ${borrador.codigo}` : "Guardar en la cuenta",
      Icono: Save,
      disabled: rows.length === 0,
      hint: "Subir este lote a la cuenta de una persona; después su precio por PT se descuenta de sus adelantos",
      onClick: () => setGuardando(true),
    },
    ...(vigente
      ? [{
          key: "abrir-cuenta",
          label: cambio ? `${vigente.codigo} · El lote cambió: actualiza antes de cobrar` : `${vigente.codigo} · ${ESTADO_CUB[vigente.estado].label}`,
          Icono: cambio ? AlertTriangle : Coins,
          hint: cambio
            ? "Guardaste otras medidas: actualízala para que se cobre lo que ves"
            : vigente.estado === "borrador" ? "Ponerle precio por PT y descontarlo de sus adelantos" : "Ver lo descontado o anularlo",
          onClick: () => (cambio ? setGuardando(true) : setAbierta(vigente.id)),
        }]
      : []),
    {
      key: "madera-a-cuenta",
      label: "Madera a cuenta (todas)",
      Icono: FolderOpen,
      hint: "Todos los lotes de madera guardados a cuenta, con su estado",
      onClick: () => setViendoLista(true),
    },
  ];

  return (
    <>
      {cambio && borrador && (
        <AccionLote label={`El lote cambió: actualiza ${borrador.codigo}`} Icono={AlertTriangle} destacado
          hint="Guardaste otras medidas en la cuenta: actualízala antes de cobrar" onClick={() => setGuardando(true)} />
      )}
      <MenuAcciones etiqueta="Cuenta" Icono={UserCheck} alineacion="derecha" badge={vigente?.codigo} items={items} />
      {guardando && (
        <GuardarMaderaEnLaCuentaModal
          rows={rows}
          especieDelLote={especieDelLote}
          cliente={cliente}
          fechaDelLote={fechaDelLote}
          delLote={delLote}
          errorDelLote={error}
          reintentar={recargar}
          guardarLote={guardarLote}
          onGuardada={alGuardar}
          onAbrir={(id) => { setGuardando(false); setAbierta(id); }}
          onCerrar={() => setGuardando(false)}
        />
      )}
      {viendoLista && (
        <ListaGuardadasModal material="aserrada" onAbrir={(id) => { setViendoLista(false); setAbierta(id); }} onCerrar={() => setViendoLista(false)} />
      )}
      {abierta && (
        <ValorizarCubicacionModal
          id={abierta}
          puedeAplicar={puedeAplicar}
          /* La de este lote, con lo que se ve; cualquier otra —o con la lista
             caída— la lee el modal de su lote (y si no puede, no deja cobrar). */
          preciosSugeridos={delLote?.some((c) => c.id === abierta && esDelCubicador(c)) ? sugeridos : undefined}
          onCambio={(c) => (c ? recordar(c) : olvidar(abierta))}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}
