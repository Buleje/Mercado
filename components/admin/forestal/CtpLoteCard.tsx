"use client";

/**
 * Un lote de aserrío como tarjeta (ADR-334).
 *
 * La tarjeta contesta las tres preguntas del patio en el orden en que se hacen:
 * qué madera es (especie y piezas), en qué anda (esperando la sierra o ya
 * aserrada, con su corrida) y qué hay que mirarle. Las acciones van al pie
 * porque son consecuencia de lo anterior, no lo primero que se lee.
 *
 * El volumen que se muestra grande es el que VA A ENTRAR a la sierra —lo libre—,
 * no lo que se apartó: si alguien consumió una pieza por fuera, el número
 * grande tiene que ser el verdadero y la diferencia se explica al lado.
 */

import { Archive, Boxes, ChevronRight, Play, Plus, Trash2, TreePine } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { FotoEspecie } from "@/lib/forestal/especies-fotos";
import {
  ESTADO_LOTE,
  TONO_ESTADO_LOTE,
  alertasDeLote,
  diasDeEspera,
  esLoteDeInventario,
  juzgarRendimientoLote,
  loteVencido,
  margenLote,
  pieTablarDe,
  piezasLibres,
  rendimientoLote,
  salidaDelLote,
  volumenLibre,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { labelProductoConsumible } from "@/lib/forestal/lote-programacion";
import { estadoSalida } from "./ctp-section-shared";
import { Btn } from "./ctp-shared";
import { IconAction } from "@/components/admin/shared/module-primitives";
import EspecieFoto from "./EspecieFoto";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default function CtpLoteCard({
  lote,
  fotos,
  ahora,
  onVer,
  onAgregar,
  onProducir,
  onDeshacer,
}: {
  lote: LoteAserrio;
  fotos: Map<string, FotoEspecie>;
  /** La fecha se recibe: un `new Date()` adentro re-renderiza distinto en cada pintada. */
  ahora: Date;
  onVer: () => void;
  onAgregar: () => void;
  onProducir: () => void;
  onDeshacer: () => void;
}) {
  const estado = ESTADO_LOTE[lote.status];
  const libres = piezasLibres(lote);
  const vLibre = volumenLibre(lote);
  const abierto = lote.status === "abierto";
  /* En un lote abierto interesa lo que todavía va a entrar; en uno aserrado, lo
     que entró (sus piezas ya están consumidas por su propia corrida). */
  const volumen = abierto ? vLibre : lote.volumenM3;
  const piezas = abierto ? libres.length : lote.piezas;
  const alertas = alertasDeLote(lote, ahora);
  const dias = diasDeEspera(lote, ahora);
  const rend = rendimientoLote(lote);
  const veredicto = juzgarRendimientoLote(rend);
  const margen = margenLote(lote);
  const vencido = loteVencido(lote, ahora);
  const corrida = lote.produccion;
  /* ¿La madera de este lote ya se fue? La regla es la MISMA que usa la tabla de
     Producción para sus corridas — se importa, no se re-escribe (ADR-337). */
  const salida = salidaDelLote(lote);
  /* «Sobra» del lote es lo que TODAVÍA se puede meter a Producción (Brandon,
     2026-09-01: "es volumen sobrante para producción") — NO lo ya producido
     esperando despacho (eso es `salida.enPatio`, otro badge). Abierto: rolliza
     sin aserrar (`vLibre`). Ya aserrado: lo que falta para tocar el tope del
     56% (`margen`, la MISMA cuenta que agrega el KPI "Volumen sobrante" de
     arriba de la lista — single source, no dos fórmulas al mismo número). */
  const sobraM3 = abierto ? vLibre : (margen?.margenM3 ?? 0);
  const sobraEsRolliza = abierto;
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
      className={`flex h-full flex-col gap-3 rounded-2xl border-2 bg-[var(--surface-raised)] p-4 transition-colors ${
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
              className="flex items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-2 py-0.5 text-sm font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden /> Inventario
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {vencido && (
            <span
              title="El fin del proceso ya pasó y el lote sigue abierto"
              className="rounded-full border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/12 px-2.5 py-0.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
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

      {sobraM3 > 1e-4 && (
        <p
          title={
            sobraEsRolliza
              ? "Rolliza que todavía no entró a la sierra — se puede aserrar o distribuir desde Consumos → Ver resumen por permiso"
              : `Con ${fmtM3(margen?.entradaM3 ?? 0)} m³ que entraron, el tope del 56 % permite ${fmtM3(margen?.topeM3 ?? 0)} m³ y ya se declararon ${fmtM3(margen?.declaradoM3 ?? 0)} m³`
          }
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--data-info-500)]/15 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
        >
          Sobra para Producción: {fmtM3(sobraM3)} m³ {sobraEsRolliza ? "rolliza" : ""}
        </p>
      )}

      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <EspecieFoto especie={lote.speciesCommon} indice={fotos} size={28} />
        <span className="min-w-0">
          <b className="text-[var(--text-primary)]">{lote.speciesCommon}</b>
          {/* El espacio va escrito, no sólo pintado con margen: un lector de
              pantalla leía «CachimboCariniana estrellensis» de corrido. */}
          {lote.speciesScientific && (
            <> <span className="italic text-[var(--text-tertiary)]">{lote.speciesScientific}</span></>
          )}
        </span>
      </p>

      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
        <div>
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Piezas</dt>
          <dd className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{piezas}</dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Volumen</dt>
          <dd className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(volumen)}</dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Pie tablar</dt>
          <dd className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
            {pieTablarDe(volumen).toLocaleString("es-PE")}
          </dd>
        </div>
      </dl>

      {/* La programación del lote (ADR-342): con qué orden se abrió, qué materia
          prima consume y en qué ventana. Sólo lo que tiene dato. */}
      {(lote.ordenProduccion || lote.tipoProductoConsumir || lote.inicioProceso) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
          {lote.ordenProduccion && (
            <span className="rounded-lg bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-xs font-bold">
              OP {lote.ordenProduccion}
            </span>
          )}
          {lote.tipoProductoConsumir && <span>{labelProductoConsumible(lote.tipoProductoConsumir)}</span>}
          {lote.inicioProceso && (
            <span className="text-[var(--text-tertiary)]">
              {fmtFecha(lote.inicioProceso)}
              {lote.finProceso ? ` → ${fmtFecha(lote.finProceso)}` : " → sin cierre"}
            </span>
          )}
        </p>
      )}

      {abierto ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          Armado el {fmtFecha(lote.fechaApertura) ?? "—"}
          {dias != null && dias > 0 && ` · esperando hace ${dias} día${dias === 1 ? "" : "s"}`}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          {corrida ? (
            <>
              Aserrado el {fmtFecha(lote.fechaConsumo) ?? "—"} · corrida{" "}
              <b className="font-mono text-[var(--text-primary)]">N° {corrida.lineNo}</b>
              {corrida.productType && ` · ${corrida.productType}`}
              {corrida.quantity != null && (
                <>
                  {" "}
                  <span className="font-mono tabular-nums">
                    {corrida.quantity.toFixed(2)} {corrida.unit ?? ""}
                  </span>
                </>
              )}
            </>
          ) : (
            <>Aserrado el {fmtFecha(lote.fechaConsumo) ?? "—"}</>
          )}
          {/* Adónde fue lo que salió del lote: sin esto la cadena moría en la
              corrida y «¿ya se despachó esa madera?» había que ir a buscarlo. */}
          {salio && salida && (
            <span
              title={
                salida.enPatio > 0
                  ? `Quedan ${salida.enPatio} ${salida.unidad ?? ""} de los ${salida.producido} que produjo`
                  : `Los ${salida.producido} ${salida.unidad ?? ""} que produjo ya salieron`
              }
              className={`ml-2 inline-block rounded-lg px-1.5 py-0.5 text-sm font-bold ${
                salio.tono === "salido"
                  ? "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                  : salio.tono === "parcial"
                    ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              }`}
            >
              {salio.label}
            </span>
          )}
          {rend != null && (
            <span
              title={`Salió ${corrida?.quantity != null ? fmtM3(corrida.quantity) : "—"} m³ de los ${fmtM3(lote.volumenM3)} m³ que entraron`}
              className={`ml-2 inline-block rounded-lg px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums ${
                veredicto.tono === "ok"
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : veredicto.tono === "neutro"
                    ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                    : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              {rend}% · {veredicto.texto}
            </span>
          )}
          {/* El "quedan X por declarar" ya se muestra arriba, en el badge
              "Sobra para Producción" — mismo número (`margen.margenM3`), no
              se repite acá. */}
        </p>
      )}

      {alertas.map((a) => (
        <p
          key={a.texto}
          className={`rounded-xl px-3 py-2 text-sm font-medium ${
            a.tono === "warning"
              ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          {a.texto}
        </p>
      ))}

      {lote.notes && <p className="line-clamp-2 text-sm italic text-[var(--text-tertiary)]">{lote.notes}</p>}

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t-2 border-[var(--rule-soft)] pt-3">
        <Btn size="sm" variant="ghost" onClick={onVer}>
          <Boxes className="h-4 w-4" /> Ver piezas <ChevronRight className="h-4 w-4" />
        </Btn>
        {abierto && (
          <>
            {/* Cargar es ir a Consumos con el lote elegido: ahí la tabla del
                patio ya viene filtrada por su especie (ADR-342). */}
            <Btn size="sm" variant="secondary" onClick={onAgregar} title="Elegir sus piezas en Consumos">
              <Plus className="h-4 w-4" /> Cargar
            </Btn>
            <Btn
              size="sm"
              variant="primary"
              disabled={libres.length === 0}
              title={
                libres.length === 0
                  ? "El lote no tiene piezas libres que aserrar"
                  : "Abrir la corrida de producción con este lote ya cargado"
              }
              onClick={onProducir}
            >
              <Play className="h-4 w-4" /> Producir
            </Btn>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-xs text-[var(--text-tertiary)] sm:inline">
            <TreePine className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {lote.piezas} apartada{lote.piezas === 1 ? "" : "s"}
          </span>
          {
            /* Eliminar CUALQUIER lote, sin excepción (Brandon, 2026-09-01) —
               siempre visible: sólo ABRE la ficha, donde se confirma con
               motivo. El caso "consumido/cerrado con corrida viva" pide
               ahí mismo el paso extra de anular esa corrida. */
          }
          <IconAction
            icon={Trash2}
            tone="danger"
            label={`Eliminar el lote ${lote.code} (abre la ficha para confirmar)`}
            onClick={onDeshacer}
          />
        </span>
      </footer>
    </article>
  );
}
