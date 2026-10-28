"use client";

/**
 * «¿Ya se llevó la madera?» en «Guardar cubicación» (Brandon 28-10: «poner de
 * lo total guardado si ya se llevó una parte o se llevó completo»). Todavía no
 * | Una parte (la tabla por especie × tipo) | Todo. Lo elegido queda
 * PENDIENTE: la ventana lo anota con el PATCH después de guardar el lote (le
 * hace falta su id), igual que la cuenta. Al actualizar una que ya tenía
 * viajes, se ven con su barra y se puede sumar otro.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { SaldoCubicacion, SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import { BarraDeSaldo } from "./cubicador-salidas-barra";
import { EditorDeViaje, type SugerenciasDeViaje } from "./cubicador-salidas-editor";
import { ListaDeViajes } from "./cubicador-salidas-lista";
import { borradorNuevo, type BorradorSalida, type ModoSalida, type RespaldoViaje } from "./cubicador-salidas-logica";

type Pregunta = "no" | ModoSalida;

export function SalidasAlGuardar({ previas, saldo, viaje, onViaje, fechaSugerida, respaldo, sugerencias, aviso }: {
  /** Los viajes que ya tenía (al actualizar). */
  previas: readonly SalidaCubicacion[];
  /** El saldo de las filas de ahora con esos viajes. */
  saldo: SaldoCubicacion;
  viaje: BorradorSalida | null;
  onViaje: (fn: (v: BorradorSalida | null) => BorradorSalida | null) => void;
  /** La fecha del trabajo: casi siempre el camión sale el día que se cubica. */
  fechaSugerida: string;
  respaldo: RespaldoViaje;
  sugerencias: SugerenciasDeViaje;
  aviso: string | null;
}) {
  const hay = previas.length > 0;
  const opciones: { value: Pregunta; label: string }[] = [
    { value: "no", label: hay ? "No" : "Todavía no" },
    { value: "parte", label: "Una parte" },
    { value: "todo", label: hay ? "Todo lo que queda" : "Todo" },
  ];
  const elegir = (p: Pregunta) =>
    onViaje((v) => (p === "no" ? null : v ? { ...v, modo: p } : borradorNuevo(p, hay ? undefined : fechaSugerida)));

  return (
    <section className="space-y-3 border-t border-[var(--rule-soft)] pt-5" aria-label="Lo que ya salió" data-seccion="salidas-al-guardar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          {hay ? "¿Salió otro viaje?" : "¿Ya se llevó la madera?"}
        </CardTitle>
        <InfoTip
          what="Si ya salió madera de este lote: cuánto, cuándo, a quién y en qué vehículo."
          affects="Guardadas te dice cuánto se despachó y cuánto queda en el patio. No mueve el Libro ni la plata."
          example="De 5,190 m³ se llevaron 2,360 m³ de Tornillo comercial en el camión ABC-123: quedan 2,830 m³."
        />
        <SegmentedControl value={viaje?.modo ?? "no"} onChange={elegir} options={opciones} size="xl" label="Si ya se llevó la madera" className="max-w-full" />
      </div>
      {hay && (
        <>
          <BarraDeSaldo saldo={saldo} />
          <ListaDeViajes salidas={previas} compradorDeLaFicha={respaldo.cliente} />
        </>
      )}
      {viaje && (
        <EditorDeViaje
          borrador={viaje}
          actualizar={(fn) => onViaje((v) => (v ? fn(v) : v))}
          saldo={saldo}
          conModo={false}
          respaldo={respaldo}
          primerViaje={!hay}
          sugerencias={sugerencias}
          idBase="cubg-viaje"
          aviso={aviso}
        />
      )}
    </section>
  );
}
