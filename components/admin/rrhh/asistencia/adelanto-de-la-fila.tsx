"use client";

/**
 * adelanto-de-la-fila — «Dar adelanto» desde la fila de cada persona (Brandon
 * 25-10: «en la tabla de asistencia … poner adelantos ahí mismo a esa persona
 * para descontar la semana que culmine»).
 *
 * Un solo proveedor arriba de las hojas (Día / Semana): la fila pide abrir la
 * ventana con su persona y lee lo que ya se le dio esta semana para su chip.
 * Ese dato sale del pago del sábado que ya se cargó para la barra de arriba
 * (`use-pago-semana`): ni un pedido por fila. Sólo el dueño lo carga; el
 * encargado sí da adelantos, pero sin chip ni vista previa.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { limaDateKey } from "@/lib/utils";
import { semanaDe } from "@/lib/rrhh/fechas";
import type { FechaKey, NivelRrhh } from "@/lib/rrhh/tipos";
import DarAdelantoModal from "../pagos/DarAdelantoModal";
import type { PagoSemana } from "../pagos/use-pago-semana";

interface PersonaDeLaFila {
  id: string;
  nombre: string;
}

interface AdelantoDeLaFila {
  /** Abre «Dar adelanto» con la persona elegida. Sin esto (sólo marcar), la fila no lo ofrece. */
  darAdelanto?: (persona: PersonaDeLaFila) => void;
  /** Lo dado esta semana (S/), si `fecha` es de esta semana y el pago ya cargó; si no, 0. */
  dadoEnLaSemana: (colaboradorId: string, fecha: FechaKey) => number;
}

const Ctx = createContext<AdelantoDeLaFila>({ dadoEnLaSemana: () => 0 });

export function useAdelantoDeLaFila(): AdelantoDeLaFila {
  return useContext(Ctx);
}

export function ProveedorAdelantoDeLaFila({ nivel, pago, children }: { nivel: NivelRrhh; pago: PagoSemana | null; children: ReactNode }) {
  const [abierta, setAbierta] = useState<PersonaDeLaFila | null>(null);
  const datos = pago?.datos ?? null;
  const puede = nivel === "gestion" || nivel === "completo";

  const valor = useMemo<AdelantoDeLaFila>(() => {
    const estaSemana = semanaDe(limaDateKey()).desde;
    const dado = new Map<string, number>();
    if (datos && datos.desde === estaSemana) {
      for (const f of datos.filas) {
        const suma = f.adelantosDeLaSemana.reduce((a, x) => a + x.monto, 0);
        if (suma > 0) dado.set(f.colaboradorId, Math.round(suma * 100) / 100);
      }
    }
    return {
      darAdelanto: puede ? (p) => setAbierta(p) : undefined,
      dadoEnLaSemana: (id, fecha) => (semanaDe(fecha).desde === estaSemana ? (dado.get(id) ?? 0) : 0),
    };
  }, [datos, puede]);

  const yaDado = abierta ? valor.dadoEnLaSemana(abierta.id, limaDateKey()) : 0;

  return (
    <Ctx.Provider value={valor}>
      {children}
      {abierta && (
        <DarAdelantoModal
          personas={[{ id: abierta.id, nombre: abierta.nombre, yaDado: yaDado || undefined }]}
          colaboradorId={abierta.id}
          pago={datos}
          onClose={() => setAbierta(null)}
          onDado={() => {
            setAbierta(null);
            if (pago) void pago.recargar();
          }}
        />
      )}
    </Ctx.Provider>
  );
}
