"use client";

/**
 * Un lote de aserrío como tarjeta (ADR-334).
 *
 * «Tarjetas fáciles de leer» (Brandon, 2026-09-27): miras un lote y lo
 * entiendes al instante. Arriba el código y el estado; después la especie; y
 * UNA línea grande con lo que importa — «Quedan 3.75 m³ por aserrar» si está
 * abierto, «Rinde 42 % · bien» si ya se aserró. Debajo las cifras del lote en
 * la unidad del patio (pt → m³ → piezas), cuándo se armó o se aserró, y lo que
 * pide atención. Las acciones van al pie porque son consecuencia de lo
 * anterior, no lo primero que se lee.
 *
 * Lo que explica cada cifra (el tope del 56 % del SERFOR, de dónde sale lo que
 * queda por declarar, la nota, la programación del SNIFFS) vive en un ⓘ: nada
 * se borró, dejó de estar a la vista. Las partes están en
 * `ctp-lote-card-partes.tsx` y `ctp-lote-cuadre-sniffs.tsx`.
 */

import { Archive, Boxes, PackageOpen, Play, Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { FotoEspecie } from "@/lib/forestal/especies-fotos";
import {
  ESTADO_LOTE,
  TONO_ESTADO_LOTE,
  alertasDeLote,
  cuadreSniffs,
  esLoteDeInventario,
  loteVencido,
  piezasLibres,
  salidaDelLote,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { estadoSalida } from "./ctp-section-shared";
import { Btn } from "./ctp-shared";
import { IconAction } from "@/components/admin/shared/module-primitives";
import EspecieFoto from "./EspecieFoto";
import { formatNumber } from "@/lib/format";
import { tipoCorto } from "./permiso-volumen-ui";
import { LoteCifras, LoteLineaPrincipal, unidadLegible } from "./ctp-lote-card-partes";
import { LoteCuando } from "./ctp-lote-cuando";
import { LoteCuadreSniffs } from "./ctp-lote-cuadre-sniffs";

/* La pastilla de «¿ya salió esa madera?»: texto primario sobre el tinte del
   tono (el texto de color sobre su propio tinte no llegaba a AA). */
const TONO_SALIDA: Record<string, string> = {
  salido: "border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/12",
  parcial: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/12",
};

export default function CtpLoteCard({
  lote,
  fotos,
  ahora,
  onVer,
  onAgregar,
  onProducir,
  onDeshacer,
  onResolverCuadre,
  onVerProductos,
}: {
  lote: LoteAserrio;
  fotos: Map<string, FotoEspecie>;
  /** La fecha se recibe: un `new Date()` adentro re-renderiza distinto en cada pintada. */
  ahora: Date;
  onVer: () => void;
  onAgregar: () => void;
  onProducir: () => void;
  onDeshacer: () => void;
  /**
   * Resolver el cuadre contra el SNIFFS (ADR-398): declarar lo que allá está
   * declarado y acá falta. Sin esto la insignia sólo informa, y el operador
   * tiene que ir a buscar dónde se arregla.
   */
  onResolverCuadre?: () => void;
  /**
   * Qué salió de este lote y en qué terminó (Brandon, 2026-09-12).
   *
   * «Piezas» muestra la materia prima que ENTRÓ; esto muestra la madera que
   * SALIÓ, con su saldo. Son las dos mitades del lote y hacían falta las dos.
   */
  onVerProductos?: () => void;
}) {
  const estado = ESTADO_LOTE[lote.status];
  const abierto = lote.status === "abierto";
  const libres = piezasLibres(lote).length;
  const alertas = alertasDeLote(lote, ahora);
  /* Cómo cuadra con lo que el SNIFFS declaró de este lote (ADR-398). `null` =
     el lote no vino de ahí y no hay nada contra qué cotejar. */
  const cuadre = cuadreSniffs(lote);
  const vencido = loteVencido(lote, ahora);
  const corrida = lote.produccion;
  /* ¿La madera de este lote ya se fue? La regla es la MISMA que usa la tabla de
     Producción para sus corridas — se importa, no se re-escribe (ADR-337). */
  const salida = salidaDelLote(lote);
  const salio = corrida
    ? estadoSalida({
        section: "produccion",
        quantity: corrida.quantity != null ? String(corrida.quantity) : null,
        despachadoQty: corrida.despachadoQty,
        reprocesadoQty: corrida.reprocesadoQty,
      })
    : null;

  return (
    <article
      className={`flex h-full flex-col gap-2.5 rounded-2xl border-2 bg-[var(--surface-raised)] p-4 transition-colors ${
        vencido
          ? "border-[var(--data-error-500)] hover:border-[var(--data-error-700)]"
          : "border-[var(--rule-base)] hover:border-[var(--accent)]"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CardTitle as="h3" className="font-mono text-base font-bold text-[var(--text-primary)]">
            {lote.code}
          </CardTitle>
          {esLoteDeInventario(lote) && (
            <span
              title="Declarado directamente: sin trozas del patio registradas pieza por pieza"
              className="flex items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-2 py-0.5 text-sm font-bold text-[var(--data-info-ink)]"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden /> Inventario
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {vencido && (
            <span
              title="El fin del proceso ya pasó y el lote sigue abierto"
              className="rounded-full border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/12 px-2.5 py-0.5 text-sm font-bold text-[var(--data-error-ink)]"
            >
              Vencido
            </span>
          )}
          <span
            title={estado.hint}
            className={`rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${TONO_ESTADO_LOTE[lote.status]}`}
          >
            {estado.label}
          </span>
        </span>
      </header>

      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <EspecieFoto especie={lote.speciesCommon} indice={fotos} size={28} />
        {/* El nombre científico pasó al ⓘ de datos del lote (27-09): a la
            vista, la especie como se nombra en el patio. */}
        <b className="min-w-0 text-base text-[var(--text-primary)]">{lote.speciesCommon}</b>
      </p>

      <LoteLineaPrincipal lote={lote} />
      <LoteCifras lote={lote} />
      <LoteCuando lote={lote} ahora={ahora} />

      {/* Lo que SALIÓ de la sierra y adónde fue: sin esto la cadena moría en la
          corrida y «¿ya se despachó esa madera?» había que ir a buscarlo. La
          pastilla «Salido/parcial» no depende de `productType` — una corrida
          sin tipo de producto declarado igual puede tener despacho. */}
      {!abierto && corrida && (corrida.productType || (salio && salida)) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
          {corrida.productType && (
            <span className="text-[var(--text-primary)]">
              {tipoCorto(corrida.productType)}
              {corrida.quantity != null && (
                <>
                  {" · "}
                  <b className="font-bold tabular-nums">
                    {formatNumber(corrida.quantity, 2)} {unidadLegible(corrida.unit)}
                  </b>
                </>
              )}
            </span>
          )}
          {salio && salida && (
            <span
              title={
                salida.enPatio > 0
                  ? `Quedan ${formatNumber(salida.enPatio, 2)} ${unidadLegible(salida.unidad)} de los ${formatNumber(salida.producido, 2)} que produjo`
                  : `Los ${formatNumber(salida.producido, 2)} ${unidadLegible(salida.unidad)} que produjo ya salieron`
              }
              className={`rounded-lg border px-1.5 py-0.5 text-sm font-bold text-[var(--text-primary)] ${
                TONO_SALIDA[salio.tono] ?? "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              }`}
            >
              {salio.label}
            </span>
          )}
        </p>
      )}

      {cuadre && <LoteCuadreSniffs cuadre={cuadre} onResolver={onResolverCuadre} />}

      {alertas.map((a) => (
        <p
          key={a.texto}
          className={`rounded-xl px-3 py-2 text-sm font-medium ${
            a.tono === "warning"
              ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          {a.texto}
        </p>
      ))}

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t-2 border-[var(--rule-soft)] pt-3">
        {abierto && (
          <>
            <Btn
              size="sm"
              variant="primary"
              disabled={libres === 0}
              title={
                libres === 0
                  ? "El lote no tiene piezas libres que aserrar"
                  : "Abrir la corrida de producción con este lote ya cargado"
              }
              onClick={onProducir}
            >
              <Play className="h-4 w-4" /> Producir
            </Btn>
            {/* Cargar es ir a Consumos con el lote elegido: ahí la tabla del
                patio ya viene filtrada por su especie (ADR-342). */}
            <Btn size="sm" variant="secondary" onClick={onAgregar} title="Elegir sus piezas en Consumos">
              <Plus className="h-4 w-4" /> Cargar
            </Btn>
          </>
        )}
        <Btn size="sm" variant="ghost" onClick={onVer} title="Ver las piezas del lote y editarlo">
          <Boxes className="h-4 w-4" /> Piezas
        </Btn>
        {onVerProductos && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={onVerProductos}
            title="Qué madera salió de este lote: lo que queda en patio, lo despachado y lo de uso propio"
          >
            <PackageOpen className="h-4 w-4" /> Productos
          </Btn>
        )}
        {/* Eliminar CUALQUIER lote, sin excepción (Brandon, 2026-09-01) —
            siempre visible: sólo ABRE la ficha, donde se confirma con motivo.
            El caso "consumido/cerrado con corrida viva" pide ahí mismo el paso
            extra de anular esa corrida. */}
        <IconAction
          icon={Trash2}
          tone="danger"
          label={`Eliminar el lote ${lote.code} (abre la ficha para confirmar)`}
          onClick={onDeshacer}
          className="ml-auto"
        />
      </footer>
    </article>
  );
}
