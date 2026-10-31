"use client";

/**
 * La cuenta del lote de madera, UNA vez por Cubicador (24-10): la leen el menú
 * «Cuenta ▾» (`CuentaDeMadera`) y el modal «Guardar cubicación». Las ventanas
 * de la cuenta (guardar en la cuenta, todas las de madera, Valorizar) viven
 * acá, así que se abren igual desde los dos lados.
 *
 * Abrir una ventana cambia el estado de ESTE componente, no el de
 * `CubicadorMadera`: `children` llega ya armado y React no lo vuelve a dibujar
 * (sólo los que leen el contexto). Es lo que antes hacía `CuentaDeMadera` con
 * su propio estado: abrir una ventana no redibuja la tabla entera.
 */
import { createContext, useContext, type ReactNode } from "react";
import { esDelCubicador } from "@/lib/forestal/cubicacion-madera-cuenta";
import GuardarMaderaEnLaCuentaModal from "./cubicador-madera-cuenta-guardar";
import { ListaGuardadasModal } from "./cubicador-trozas-guardadas";
import ValorizarCubicacionModal from "./cubicador-trozas-valorizar";
import { useCuentaDeMadera, type CuentaDeMaderaEstado, type EntradaCuentaDeMadera } from "./hooks/use-cuenta-de-madera";

export interface CuentaDeMaderaDelLote extends CuentaDeMaderaEstado {
  /** El «cliente» del lote (el comprador): sólo sugiere la persona. */
  cliente: string;
  fechaDelLote: string;
}

const Contexto = createContext<CuentaDeMaderaDelLote | null>(null);

/** La cuenta del lote; null fuera del Cubicador de madera. */
export function useCuentaDeMaderaDelLote(): CuentaDeMaderaDelLote | null {
  return useContext(Contexto);
}

export function ProveedorCuentaDeMadera({
  cliente, fechaDelLote, guardarLote, children, ...entrada
}: EntradaCuentaDeMadera & {
  cliente: string;
  fechaDelLote: string;
  /** Guarda (o actualiza) el lote en el Cubicador sin avisos propios; null = no se pudo. */
  guardarLote: () => Promise<{ id: string; nombre: string } | null>;
  children: ReactNode;
}) {
  const cuenta = useCuentaDeMadera(entrada);
  const { activo, guardando, setGuardando, viendoLista, setViendoLista, abierta, setAbierta, delLote } = cuenta;
  return (
    <Contexto.Provider value={{ ...cuenta, cliente, fechaDelLote }}>
      {children}
      {activo && guardando && (
        <GuardarMaderaEnLaCuentaModal
          rows={cuenta.rows}
          especieDelLote={cuenta.especieDelLote}
          cliente={cliente}
          fechaDelLote={fechaDelLote}
          delLote={delLote}
          errorDelLote={cuenta.error}
          reintentar={cuenta.recargar}
          guardarLote={guardarLote}
          onGuardada={cuenta.alGuardar}
          onAbrir={(id) => { setGuardando(false); setAbierta(id); }}
          onCerrar={() => setGuardando(false)}
        />
      )}
      {activo && viendoLista && (
        <ListaGuardadasModal material="aserrada" onAbrir={(id) => { setViendoLista(false); setAbierta(id); }} onCerrar={() => setViendoLista(false)} />
      )}
      {activo && abierta && (
        <ValorizarCubicacionModal
          id={abierta}
          puedeAplicar={cuenta.puedeAplicar}
          /* La de este lote, con lo que se ve; cualquier otra —o con la lista
             caída— la lee el modal de su lote (y si no puede, no deja cobrar). */
          preciosSugeridos={delLote?.some((c) => c.id === abierta && esDelCubicador(c)) ? cuenta.sugeridos : undefined}
          onCambio={(c) => (c ? cuenta.recordar(c) : cuenta.olvidar(abierta))}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </Contexto.Provider>
  );
}
