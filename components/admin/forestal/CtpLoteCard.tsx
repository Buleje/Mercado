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

import { Archive, Boxes, ChevronRight, PackageOpen, Play, Plus, ScanText, Trash2, TreePine } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { FotoEspecie } from "@/lib/forestal/especies-fotos";
import {
  ESTADO_LOTE,
  TONO_ESTADO_LOTE,
  TOLERANCIA_CUADRE_SNIFFS_M3,
  alertasDeLote,
  cuadreSniffs,
  diasDeEspera,
  esLoteDeInventario,
  etiquetaDeSobra,
  ORIGEN_LOTE_INVENTARIO,
  sobraDeLote,
  type NivelDeSobra,
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
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";
import { estadoSalida } from "./ctp-section-shared";
import { Btn } from "./ctp-shared";
import { IconAction } from "@/components/admin/shared/module-primitives";
import EspecieFoto from "./EspecieFoto";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/**
 * «MADERA ASERRADA (COMERCIAL)» a «Madera aserrada (comercial)».
 *
 * El libro guarda el producto en mayúsculas porque así lo pide el formato
 * oficial, pero una tarjeta con tres mayúsculas seguidas se lee a los gritos y
 * tapa lo que importa al lado. El dato no cambia: cambia cómo se muestra.
 */
const productoLegible = (p: string) =>
  p.length > 3 && p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p;

/** El libro escribe la unidad «m3»; en pantalla se lee «m³» como en todo el resto. */
const unidadLegible = (u: string | null | undefined) => (u === "m3" ? "m³" : (u ?? ""));

/**
 * La ventana del proceso, sin repetir el año cuando es el mismo.
 *
 * «01 ago. 2026 → 01 oct. 2026» dice dos veces un año que no cambia y empuja el
 * resto de la línea; con «01 ago. → 01 oct. 2026» se lee de una pasada.
 */
function ventanaDeProceso(inicio: string, fin: string | null | undefined): string {
  const a = fmtFecha(inicio);
  if (!fin) return `${a ?? "—"} → sin cierre`;
  const b = fmtFecha(fin);
  if (!a || !b) return `${a ?? "—"} → ${b ?? "—"}`;
  const anioA = a.slice(-4);
  return anioA === b.slice(-4) ? `${a.slice(0, -5)} → ${b}` : `${a} → ${b}`;
}

/* El color dice el nivel de una pasada, sin leer: gris cuando no queda nada,
   ámbar cuando es un resto y verde cuando hay de sobra. El punto de adelante
   es para quien no distingue bien los colores — la palabra también lo dice. */
const TONO_SOBRA: Record<NivelDeSobra, string> = {
  sin_sobra: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  poco: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  bastante: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  casi_entero:
    "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
};

const PUNTO_SOBRA: Record<NivelDeSobra, string> = {
  sin_sobra: "bg-[var(--text-tertiary)]",
  poco: "bg-[var(--data-warning-500)]",
  bastante: "bg-[var(--data-info-500)]",
  casi_entero: "bg-[var(--data-success-500)]",
};

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
   * «Ver piezas» muestra la materia prima que ENTRÓ; esto muestra la madera que
   * SALIÓ, con su saldo. Son las dos mitades del lote y hacían falta las dos.
   */
  onVerProductos?: () => void;
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
  /* Cómo cuadra con lo que el SNIFFS declaró de este lote (ADR-398). `null` =
     el lote no vino de ahí y no hay nada contra qué cotejar. */
  const cuadre = cuadreSniffs(lote);
  const vencido = loteVencido(lote, ahora);
  const corrida = lote.produccion;
  /* ¿La madera de este lote ya se fue? La regla es la MISMA que usa la tabla de
     Producción para sus corridas — se importa, no se re-escribe (ADR-337). */
  const salida = salidaDelLote(lote);
  /* «Sobra» del lote es lo que TODAVÍA se puede meter a Producción (Brandon,
     2026-09-01: "es volumen sobrante para producción") — NO lo ya producido
     esperando despacho (eso es `salida.enPatio`, otro badge). La cuenta y su
     nivel («poco», «mucho») los da `sobraDeLote`, que es también quien elige el
     denominador según el estado del lote. */
  const sobraEsRolliza = abierto;
  const sobra = sobraDeLote(lote);
  const etiqueta = etiquetaDeSobra(sobra);
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

      {/**
       * Cuánto le queda al lote, con su nivel (Brandon, 2026-09-12: «una
       * etiqueta si no hay madera para consumir, otra si queda poco, otra si
       * queda mucho»). El número solo no diferencia: 0.641 m³ es casi nada en
       * un lote de 35 m³ y es medio lote en uno de 1.2 — el nivel es relativo.
       */}
      <p
        title={
          sobraEsRolliza
            ? `${etiqueta.ayuda} Se aserra o se distribuye desde Consumos → Ver resumen por permiso.`
            : `${etiqueta.ayuda} Con ${fmtM3(margen?.entradaM3 ?? 0)} m³ que entraron, el tope del ${TOPE_RENDIMIENTO_PCT} % permite ${fmtM3(margen?.topeM3 ?? 0)} m³ y ya se declararon ${fmtM3(margen?.declaradoM3 ?? 0)} m³.`
        }
        className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold ${TONO_SOBRA[sobra.nivel]}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_SOBRA[sobra.nivel]}`} aria-hidden />
        {etiqueta.texto}
        {sobra.nivel !== "sin_sobra" && (
          <span className="font-mono tabular-nums opacity-80">· {fmtM3(sobra.m3)} m³</span>
        )}
      </p>

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
          <dd
            title={
              piezas === 0 && esLoteDeInventario(lote)
                ? "Se declaró por volumen, sin cargar las trozas pieza por pieza"
                : undefined
            }
            className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]"
          >
            {/* «0 piezas» con 35 m³ al lado se lee como un lote vacío: en un lote
                declarado por volumen la cuenta de piezas no existe, no es cero. */}
            {piezas === 0 && esLoteDeInventario(lote) ? "—" : piezas}
          </dd>
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
            /* Sin el rótulo eran dos fechas sueltas en el medio de la tarjeta y
               nadie sabía de qué: ¿vigencia?, ¿aserrío?, ¿la guía? */
            <span className="text-[var(--text-tertiary)]">
              Proceso: {ventanaDeProceso(lote.inicioProceso, lote.finProceso)}
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
              {/* Lo que SALIÓ va en su propia línea: pegado a la fecha y a la
                  corrida, el nombre del producto en mayúsculas y su volumen se
                  leían como una frase sola que no terminaba nunca. */}
              {corrida.productType && (
                <>
                  <br />
                  <span className="text-[var(--text-primary)]">{productoLegible(corrida.productType)}</span>
                  {corrida.quantity != null && (
                    <>
                      {" · "}
                      <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                        {corrida.quantity.toFixed(2)} {unidadLegible(corrida.unit)}
                      </span>
                    </>
                  )}
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
              title={`Salió ${corrida?.quantity != null ? fmtM3(corrida.quantity) : "—"} m³ de los ${fmtM3(lote.volumenM3)} m³ que entraron. La plaza admite hasta ${TOPE_RENDIMIENTO_PCT} %${margen ? `, o sea ${fmtM3(margen.topeM3)} m³` : ""}.`}
              className={`ml-2 inline-block rounded-lg px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums ${
                veredicto.tono === "ok"
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : veredicto.tono === "neutro"
                    ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                    : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              {/* El tope al lado del rendimiento: son las dos puntas de la misma
                  cuenta y separadas no se conectaban. Con «54.2 % de 56 %» se ve
                  de dónde sale el «todavía se puede declarar» de arriba. */}
              {rend}% de {TOPE_RENDIMIENTO_PCT}% · {veredicto.texto}
            </span>
          )}
          {/* El "quedan X por declarar" ya se muestra arriba, en el badge
              "Sobra para Producción" — mismo número (`margen.margenM3`), no
              se repite acá. */}
        </p>
      )}

      {/**
       * Cómo cuadra con el SNIFFS (ADR-398).
       *
       * El lote se armó pegando la pantalla del SNIFFS, así que se puede
       * afirmar algo que antes había que cruzar a mano entre dos sistemas: si
       * lo que dice el libro es lo mismo que quedó declarado allá. `pendiente`
       * es un estado legítimo —la programación existe y la producción todavía
       * no se declaró—, no un error.
       */}
      {cuadre && (
        <p
          title={
            cuadre.deltaProducidoM3 == null
              ? `La lista del SNIFFS no trae los productos, así que sólo se compara el consumido: allá ${cuadre.consumidoSniffsM3 != null ? `${fmtM3(cuadre.consumidoSniffsM3)} m³` : "no se leyó"}, acá ${fmtM3(cuadre.consumidoLoteM3)} m³. Pega el detalle del lote para comparar también la producción.`
              : cuadre.estado === "pendiente"
                ? `El SNIFFS declara ${fmtM3(cuadre.producidoSniffsM3)} m³ en ${cuadre.productosSniffs} producto(s); el libro todavía no declaró producción para este lote.`
                : `SNIFFS: ${fmtM3(cuadre.producidoSniffsM3)} m³ producidos${cuadre.consumidoSniffsM3 != null ? ` de ${fmtM3(cuadre.consumidoSniffsM3)} m³ consumidos` : ""} · Libro: ${fmtM3(cuadre.producidoLoteM3)} m³ de ${fmtM3(cuadre.consumidoLoteM3)} m³`
          }
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-sm font-bold ${
            cuadre.estado === "cuadra"
              ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : cuadre.estado === "difiere"
                ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          <ScanText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            SNIFFS{cuadre.lote ? ` N° ${cuadre.lote}` : ""}:{" "}
            {cuadre.deltaProducidoM3 == null
              ? /* Vino de la LISTA, que no trae productos: lo único comparable
                   es el consumido, y decir «cuadra con el libro» a secas
                   prometería una comparación que no se hizo. Si además falta
                   declarar la producción, ESO es lo que hay que hacer y va
                   primero — el cotejo del consumo no es una tarea. */
                cuadre.estado !== "cuadra"
                ? `el consumo difiere en ${fmtM3(Math.abs(cuadre.deltaConsumidoM3 ?? 0))} m³`
                : cuadre.produccionPendiente
                  ? "falta declarar acá lo que salió"
                  : "el consumo cuadra · pega el detalle para comparar la producción"
              : cuadre.estado === "cuadra"
                ? "cuadra con el libro"
                : cuadre.estado === "pendiente"
                  ? `${fmtM3(cuadre.producidoSniffsM3)} m³ declarados allá, falta declararlos acá`
                  : `difiere en ${fmtM3(Math.abs(cuadre.deltaProducidoM3))} m³ producidos${
                      cuadre.deltaConsumidoM3 != null && Math.abs(cuadre.deltaConsumidoM3) > TOLERANCIA_CUADRE_SNIFFS_M3
                        ? ` y ${fmtM3(Math.abs(cuadre.deltaConsumidoM3))} m³ consumidos`
                        : ""
                    }`}
          </span>
          {/* La deuda lleva a resolverla: el mismo formulario de producción,
              con los productos del SNIFFS ya cargados. */}
          {onResolverCuadre && cuadre.estado !== "cuadra" && (
            <button
              type="button"
              onClick={onResolverCuadre}
              className="shrink-0 underline underline-offset-2"
            >
              {cuadre.estado === "pendiente" ? "declararlo" : "revisarlo"}
            </button>
          )}
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

      {/* La marca de inventario YA la dice el badge del encabezado: repetirla
          acá abajo, en itálica y con paréntesis, era una línea de ruido en
          todas las tarjetas de inventario (Brandon, 2026-09-12). */}
      {lote.notes && lote.notes !== ORIGEN_LOTE_INVENTARIO && (
        <p className="line-clamp-2 text-sm italic text-[var(--text-tertiary)]">{lote.notes}</p>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t-2 border-[var(--rule-soft)] pt-3">
        <Btn size="sm" variant="ghost" onClick={onVer}>
          <Boxes className="h-4 w-4" /> Ver piezas <ChevronRight className="h-4 w-4" />
        </Btn>
        {onVerProductos && (
          <Btn
            size="sm"
            variant="secondary"
            onClick={onVerProductos}
            title="Qué madera salió de este lote: lo que queda en patio, lo despachado y lo de uso propio"
          >
            <PackageOpen className="h-4 w-4" /> Productos
          </Btn>
        )}
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
          {/* Un lote de inventario NO tiene trozas apartadas: se declaró por
              volumen. «0 apartadas» ahí no es un dato, es una cuenta de algo
              que no existe. */}
          {!(lote.piezas === 0 && esLoteDeInventario(lote)) && (
            <span className="hidden font-mono text-xs text-[var(--text-tertiary)] sm:inline">
              <TreePine className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {lote.piezas} apartada{lote.piezas === 1 ? "" : "s"}
            </span>
          )}
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
