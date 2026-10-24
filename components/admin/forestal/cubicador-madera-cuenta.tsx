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
 * Desde el 24-10 el estado y las ventanas viven en `ProveedorCuentaDeMadera`
 * (lo comparte con el modal «Guardar cubicación»); esto es sólo el menú.
 */
import { AlertTriangle, Coins, FolderOpen, Save, UserCheck } from "@buleje/design-system/icons";
import { AccionLote, MenuAcciones, type AccionMenu } from "./cubicador-acciones";
import { useCuentaDeMaderaDelLote } from "./cubicador-madera-cuenta-contexto";
import { ESTADO_CUB } from "./hooks/use-cubicaciones-trozas";

export default function CuentaDeMadera() {
  const cuenta = useCuentaDeMaderaDelLote();
  if (!cuenta?.activo) return null;
  const { rows, borrador, vigente, cambio, setGuardando, setAbierta, setViendoLista } = cuenta;

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
    </>
  );
}
