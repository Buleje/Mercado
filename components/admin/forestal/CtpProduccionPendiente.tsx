"use client";

/**
 * Lo que a una corrida le falta declarar, para terminarlo sin elegir trozas
 * (ADR-365).
 *
 * El caso es el de todos los turnos: entran tres trozas a la sierra, salen los
 * paquetes del día y **al otro día sale el resto de esa misma madera** —lo que
 * quedó del bloque, la recuperación, las tablillas—. Esa producción es de la
 * corrida que ya existe: su materia prima ya se consumió y volver a elegir
 * trozas sería consumir madera que no entró.
 *
 * `ampliarProduccion` (ADR-361) sabía hacerlo desde el servidor pero no tenía
 * puerta: la única forma de declarar era abrir una corrida NUEVA. Este bloque es
 * esa puerta, y se dibuja donde el operador ya está — el panel del lote y la
 * ficha de la corrida.
 *
 * Lo que NO hace: pedir trozas. Las que sobran en el lote son otra corrida (o se
 * suman a una todavía abierta), porque agregarle materia prima a un asiento ya
 * declarado le cambia el denominador del rendimiento — es lo que ADR-364
 * prohíbe, y con razón.
 */

import { useCallback, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Boxes, Gauge, Layers, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  RENDIMIENTO_TOPE_PCT,
  origenesDeTrozas,
  type CorridaAMedioDeclarar,
} from "@/lib/forestal/produccion-paquetes";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { PaquetePrevio } from "./CtpMaterialPanel";
import CtpRegistrarProduccionModal, {
  type MaterialAConsumir,
  type ProduccionRegistrada,
} from "./CtpRegistrarProduccionModal";
import { Btn } from "./ctp-shared";

const fmtDia = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE", { timeZone: "UTC" });
};

/** El día de la corrida en `AAAA-MM-DD`, que es lo que el modal muestra. */
const diaIso = (iso: string | null) => (iso ?? new Date().toISOString()).slice(0, 10);

export default function CtpProduccionPendiente({
  corridas,
  trozas,
  titulo = "Producción a medio declarar",
  piezasLibres = 0,
  onListo,
  onError,
}: {
  /** Las corridas con margen, ya filtradas por quien llama (lote o libro). */
  corridas: CorridaAMedioDeclarar[];
  /**
   * El patio, para saber qué piezas se comió cada corrida. Sólo alimenta el
   * reparto entre títulos habilitantes: el volumen de la declaración sale del
   * LIBRO (`volumeInputM3`), nunca de sumar las piezas que se hayan podido leer.
   */
  trozas: readonly TrozaConsumible[];
  titulo?: string;
  /**
   * Piezas del lote que todavía no entraron a la sierra. Sólo para DECIRLO: a
   * una corrida ya declarada no se le suma madera (le cambiaría el denominador
   * del rendimiento ya escrito, ADR-364), así que esas trozas van a una corrida
   * nueva y el operador tiene que saberlo sin tener que probarlo.
   */
  piezasLibres?: number;
  /** Se amplió: hay que recargar la tabla del libro y contar qué pasó. */
  onListo: (mensaje: string, detalle: string) => void;
  onError: (mensaje: string) => void;
}) {
  const [abierta, setAbierta] = useState<CorridaAMedioDeclarar | null>(null);
  /**
   * Lo que la corrida ya declaró: sus códigos no se pueden repetir y sus medidas
   * son la referencia de la tanda que se está por cargar.
   */
  const [paquetesPrevios, setPaquetesPrevios] = useState<PaquetePrevio[]>([]);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Abrir trae la ficha de la corrida: sus paquetes son lo único que este
   * bloque no puede deducir, y sin ellos el formulario sugiere un código que el
   * servidor va a rechazar con la tanda entera ya tipeada.
   */
  const abrir = useCallback(async (c: CorridaAMedioDeclarar) => {
    setError(null);
    setAbierta(c);
    setPaquetesPrevios([]);
    setCargandoFicha(true);
    try {
      const r = await fetch(`/api/admin/forestal/ctp?entryId=${encodeURIComponent(c.id)}`, {
        credentials: "include",
      });
      const j: { entry?: { paquetes?: PaquetePrevio[] } } = r.ok ? await r.json() : {};
      setPaquetesPrevios(j.entry?.paquetes ?? []);
    } catch (e) {
      /* Sin los códigos se puede declarar igual —el servidor sigue validando—,
         pero se dice: el operador tiene que saber que el sugerido no está
         cruzado contra los que ya están. */
      setError(
        `No se pudieron leer los paquetes ya declarados (${e instanceof Error ? e.message : String(e)}): ` +
          "revisá que el código que uses no esté repetido.",
      );
    } finally {
      setCargandoFicha(false);
    }
  }, []);

  async function ampliar(datos: ProduccionRegistrada) {
    if (!abierta) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "ampliar_produccion",
          id: abierta.id,
          observations: datos.observaciones,
          paquetes: datos.paquetes.map((p) => ({
            codigo: p.codigo,
            productType: p.productType,
            presentacion: p.presentacion,
            cantidad: p.cantidad,
            volumenM3: p.volumenM3,
            espesorCm: p.espesorCm,
            anchoCm: p.anchoCm,
            largoM: p.largoM,
            observations: p.observations || null,
          })),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(json?.message ?? json?.error ?? `El servidor respondió ${r.status}`);
      }
      invalidarCtp("/forestal/");
      const total = Math.round((abierta.declaradoM3 + datos.volumen) * 10_000) / 10_000;
      const queda = Math.round((abierta.topeM3 - total) * 10_000) / 10_000;
      setAbierta(null);
      onListo(
        `Corrida N° ${abierta.lineNo} ampliada`,
        `Se agregaron ${datos.paquetes.length} paquete(s) por ${datos.volumen.toFixed(4)} m³: la corrida ` +
          `declara ahora ${total.toFixed(4)} m³ sobre ${abierta.entradaM3.toFixed(4)} m³ de materia prima ` +
          `(${Math.round((total / abierta.entradaM3) * 1000) / 10} %).` +
          (queda >= 0.001
            ? ` Todavía admite ${queda.toFixed(4)} m³ más hasta el tope del ${RENDIMIENTO_TOPE_PCT} %.`
            : ` Llegó al tope del ${RENDIMIENTO_TOPE_PCT} %.`),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError(msg);
    } finally {
      setGuardando(false);
    }
  }

  if (corridas.length === 0) return null;

  const piezasDe = (corridaId: string) => trozas.filter((t) => t.consumidaEnId === corridaId);

  const material: MaterialAConsumir | null = abierta
    ? (() => {
        const piezas = piezasDe(abierta.id);
        return {
          especie: abierta.especie ?? "—",
          especieCientifica: piezas[0]?.especieCientifica ?? null,
          piezas: piezas.length,
          /* El volumen es el del LIBRO, no la suma de las piezas: es el
             denominador del rendimiento que ya quedó escrito en la corrida. */
          volumenM3: abierta.entradaM3,
          permisos: [...new Set(piezas.map((t) => (t.permiso ?? "").trim()).filter(Boolean))],
          origenes: origenesDeTrozas(piezas),
        };
      })()
    : null;

  return (
    <section className="space-y-2 rounded-xl border-2 border-[var(--data-info-500)]/40 bg-[var(--data-info-500)]/10 p-3">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Layers className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          {titulo}
        </CardTitle>
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          Ya declararon producción y su madera todavía admite más. Si al otro día salió el resto de esa misma
          corrida, se agrega acá — <b>sin volver a elegir trozas</b>: esa materia prima ya entró a la sierra.
        </p>
      </header>

      {/**
       * El techo NO es una meta (ADR-358). Dicho acá, donde se ve el margen: una
       * corrida que rindió 40 % puede estar perfecta, y llenar hasta el 56 % «por
       * las dudas» es exactamente lo que un fiscalizador lee como madera metida
       * de otro lado.
       */}
      <p className="px-1 text-sm text-[var(--text-tertiary)]">
        El {RENDIMIENTO_TOPE_PCT} % es un <b>techo, no una meta</b>: agregá sólo lo que de verdad salió de la
        sierra.
        {piezasLibres > 0 && (
          <>
            {" "}
            {piezasLibres === 1 ? "La troza que le queda" : `Las ${piezasLibres} trozas que le quedan`} al lote
            {piezasLibres === 1 ? " va" : " van"} a una corrida nueva —{piezasLibres === 1 ? "tildala" : "tildalas"}{" "}
            abajo—: sumarle madera a una corrida ya declarada le cambiaría el rendimiento que ya quedó escrito.
          </>
        )}
      </p>

      <ul className="space-y-2">
        {corridas.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-[var(--surface-raised)] px-3 py-2"
          >
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">N° {c.lineNo}</span>
            <span className="text-sm text-[var(--text-secondary)]">
              {fmtDia(c.entryDate)} · {c.producto}
              {c.especie ? ` · ${c.especie}` : ""}
              {c.lote ? ` · lote ${c.lote}` : ""}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
              <Gauge className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              {c.declaradoM3.toFixed(4)} / {c.topeM3.toFixed(4)} m³ · {c.rendimientoPct} %
            </span>
            {/* «admite hasta», no «quedan»: lo segundo se lee como un faltante
                que hay que llenar, y el margen es un tope. */}
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
              admite hasta {c.margenM3.toFixed(4)} m³ más
            </span>
            <span className="flex-1" />
            <Btn
              variant="primary"
              disabled={guardando || (cargandoFicha && abierta?.id === c.id)}
              title={`Agregar paquetes a la corrida N° ${c.lineNo} sin abrir una corrida nueva`}
              onClick={() => void abrir(c)}
            >
              {cargandoFicha && abierta?.id === c.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Boxes className="h-4 w-4" />
              )}
              Declarar lo que faltó
            </Btn>
          </li>
        ))}
      </ul>

      {!abierta && error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {abierta && material && !cargandoFicha && (
        <CtpRegistrarProduccionModal
          material={material}
          /* Las piezas que esa corrida se comió: acá son sólo para mirar. */
          trozas={piezasDe(abierta.id)}
          fecha={diaIso(abierta.entryDate)}
          guardando={guardando}
          error={error}
          yaDeclaradoM3={abierta.declaradoM3}
          paquetesPrevios={paquetesPrevios}
          titulo={`Terminar de declarar la corrida N° ${abierta.lineNo}`}
          descripcion={
            `${abierta.producto} · ya declaró ${abierta.declaradoM3.toFixed(4)} m³ y admite ` +
            `${abierta.margenM3.toFixed(4)} m³ más hasta el tope del ${RENDIMIENTO_TOPE_PCT} %`
          }
          ctaLabel="Agregar a la corrida"
          onConfirmar={(datos) => void ampliar(datos)}
          onClose={() => setAbierta(null)}
        />
      )}
    </section>
  );
}
