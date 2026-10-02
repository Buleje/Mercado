"use client";

/**
 * Una guía en la vista previa de «Importar guías despachadas» (ADR-461): de
 * qué guía se trata, qué avisa, sus trozas (con el ≈pt aserrable de
 * referencia) y la tala referencial que se armaría por árbol. Todo lo calculó
 * el servidor; acá se muestra y se decide si entra.
 */

import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import type {
  AvisoImportacion,
  GuiaVistaPrevia,
  TalaReferencial,
  TrozaImportada,
} from "@/lib/forestal/loth-importar-guia-tipos";
import { esImportable, estadoEfectivo } from "./hooks/importar-guias-pantalla";

const ETIQUETA_ESTADO: Record<
  GuiaVistaPrevia["estado"],
  { texto: string; tono: "ok" | "aviso" | "error" | "neutro" }
> = {
  lista: { texto: "Lista", tono: "ok" },
  elegir_permiso: { texto: "Elige el permiso", tono: "aviso" },
  ya_importada: { texto: "Ya está en el libro", tono: "neutro" },
  bloqueada: { texto: "No se puede importar", tono: "error" },
  no_encontrada: { texto: "No encontrada", tono: "error" },
  sin_respuesta: { texto: "SERFOR no respondió", tono: "error" },
};

const TONO = {
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  aviso: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  error:
    "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

/** Sin ficha (SERFOR no la encontró): la guía se nombra por lo que se pidió. */
function tituloDeFuente(g: GuiaVistaPrevia): string {
  const f = g.fuente;
  if (f.tipo === "serfor") return `Registro ${f.numeroRegistro}`;
  if (f.tipo === "ctp") return "Ingreso del aserradero";
  return f.ficha.gtfNumber ? `GTF ${f.ficha.gtfNumber}` : "Guía leída de un documento";
}

const m = (v: number | null, d = 2) => (v == null ? "—" : formatNumber(v, d));
const TH =
  "whitespace-nowrap px-2 py-1.5 text-left text-xs font-semibold text-[var(--text-tertiary)]";
const TD = "whitespace-nowrap px-2 py-1.5";

export default function LothImportarGuiasGuia({
  g,
  incluida,
  onIncluir,
  conTala,
}: {
  g: GuiaVistaPrevia;
  incluida: boolean;
  onIncluir: (on: boolean) => void;
  /** El interruptor de la tala del grupo: apagado, la tabla de talas se ve tenue. */
  conTala: boolean;
}) {
  /* Con el interruptor de la tala apagado vale el estado «sin tala» y sus avisos de tala no aplican. */
  const est = ETIQUETA_ESTADO[estadoEfectivo(g, conTala)];
  const importable = esImportable(g, conTala);
  const avisos = conTala ? g.avisos : g.avisos.filter((a) => !a.soloConTala);
  const d = g.guia;
  const m3 = d?.volumenTrozasM3 ?? 0;
  const titulo = d?.gtfNumber
    ? `GTF ${d.gtfNumber}`
    : d?.numeroRegistro
      ? `Registro ${d.numeroRegistro}`
      : tituloDeFuente(g);

  return (
    <article
      className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${importable && !incluida ? "opacity-70" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
          checked={importable && incluida}
          disabled={!importable}
          onChange={(e) => onIncluir(e.target.checked)}
          aria-label={`Importar la ${titulo}`}
        />
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {d?.gtfNumber && d.numeroRegistro && (
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            Reg. {d.numeroRegistro}
          </span>
        )}
        {d?.fecha && (
          <span className="text-sm text-[var(--text-secondary)]">{fechaConDia(d.fecha)}</span>
        )}
        <span
          className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${TONO[est.tono]}`}
        >
          {est.texto}
        </span>
        {d && (
          <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {d.piezas} {d.piezas === 1 ? "troza" : "trozas"} ·{" "}
            <span className="font-mono">{fmtM3(m3)} m³</span> · ≈{fmtPt(ptAserrableDeRolliza(m3))}{" "}
            pt
          </span>
        )}
      </header>

      {/* El mensaje suele repetir un aviso: sólo va si dice otra cosa. */}
      {g.mensaje && !avisos.some((a) => a.mensaje === g.mensaje) && (
        <p className="px-3 pb-2 text-sm text-[var(--text-secondary)]">{g.mensaje}</p>
      )}
      {avisos.length > 0 && (
        <ul className="space-y-1 px-3 pb-2">
          {avisos.map((a, i) => (
            <Aviso key={`${a.codigo}-${i}`} a={a} />
          ))}
        </ul>
      )}

      {g.trozas.length > 0 && (
        <details className="border-t border-[var(--rule-soft)]" open={importable}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-[var(--text-primary)]">
            Trozas ({g.trozas.length})
            {d?.especies.length ? (
              <span className="ml-2 font-normal text-[var(--text-secondary)]">
                · {d.especies.join(", ")}
              </span>
            ) : null}
          </summary>
          <TablaTrozas trozas={g.trozas} />
        </details>
      )}
      {g.talas.length > 0 && (
        <details
          className={`border-t border-[var(--rule-soft)] ${conTala ? "" : "opacity-60"}`}
          open={importable && conTala}
        >
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-[var(--text-primary)]">
            Tala referencial ({g.talas.length} {g.talas.length === 1 ? "árbol" : "árboles"})
            {conTala ? "" : " · no se arma"}
          </summary>
          <TablaTalas talas={g.talas} />
        </details>
      )}
    </article>
  );
}

function Aviso({ a }: { a: AvisoImportacion }) {
  const Icono =
    a.nivel === "bloquea" ? AlertOctagon : a.nivel === "atencion" ? AlertTriangle : Info;
  const color =
    a.nivel === "bloquea"
      ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : a.nivel === "atencion"
        ? "text-[var(--data-warning-ink)]"
        : "text-[var(--text-secondary)]";
  return (
    <li className={`flex items-start gap-2 text-sm ${color}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{a.mensaje}</span>
    </li>
  );
}

function EstadoFila({
  estado,
  detalle,
}: {
  estado: "nueva" | "ya_trozada" | "conflicto" | "ampliar" | "existente";
  detalle: string | null;
}) {
  if (estado === "nueva")
    return <CheckCircle2 className="h-4 w-4 text-[var(--data-success-ink)]" aria-label="Nueva" />;
  const texto = {
    ya_trozada: "Ya está",
    conflicto: "Choca",
    ampliar: "Se amplía",
    existente: "Ya tiene tala",
  }[estado];
  const tono =
    estado === "conflicto" ? TONO.error : estado === "ampliar" ? TONO.aviso : TONO.neutro;
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${tono}`}
      title={detalle ?? undefined}
    >
      {texto}
    </span>
  );
}

/* A 400 px las dos tablas siguen siendo tablas, con su propio scroll. */
function TablaTrozas({ trozas }: { trozas: TrozaImportada[] }) {
  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>Código</th>
            <th className={TH}>Árbol</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>D1 (m)</th>
            <th className={`${TH} text-right`}>D2 (m)</th>
            <th className={`${TH} text-right`}>Largo (m)</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={`${TH} text-right`}>≈pt</th>
            <th className={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {trozas.map((t) => (
            <tr key={t.indice} className="border-t border-[var(--rule-soft)]">
              <td
                className={`${TD} font-mono font-semibold text-[var(--text-primary)]`}
                title={t.sinCodigo ? `En la guía: «${t.codificacionGuia ?? "-"}»` : undefined}
              >
                {t.trozaCode}
                {t.sinCodigo && (
                  <span className="ml-1.5 font-sans text-xs font-semibold text-[var(--data-warning-ink)]">
                    sin código
                  </span>
                )}
              </td>
              <td className={`${TD} font-mono`}>{t.treeCode ?? "—"}</td>
              <td className={TD}>{t.speciesCommon ?? "—"}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMayorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMenorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.lengthM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>
                {t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)}
              </td>
              <td className={`${TD} text-right tabular-nums text-[var(--text-secondary)]`}>
                {t.volumeM3 == null ? "—" : fmtPt(ptAserrableDeRolliza(t.volumeM3))}
              </td>
              <td className={TD}>
                <EstadoFila estado={t.estado} detalle={t.detalle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaTalas({ talas }: { talas: TalaReferencial[] }) {
  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>Árbol</th>
            <th className={TH}>Trozas</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>Largo (m)</th>
            <th className={`${TH} text-right`}>D1 (m)</th>
            <th className={`${TH} text-right`}>D2 (m)</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {talas.map((t) => (
            <tr key={t.treeCode} className="border-t border-[var(--rule-soft)]">
              <td className={`${TD} font-mono font-semibold text-[var(--text-primary)]`}>
                {t.treeCode}
              </td>
              <td className={`${TD} font-mono text-[var(--text-secondary)]`}>
                {t.trozas.join(" + ")}
              </td>
              <td className={TD}>{t.speciesCommon ?? "—"}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.lengthM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMayorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMenorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>
                {t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)}
              </td>
              <td className={TD}>
                <EstadoFila estado={t.estado} detalle={t.detalle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
