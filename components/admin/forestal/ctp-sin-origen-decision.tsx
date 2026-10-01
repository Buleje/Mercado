"use client";

/**
 * Una decisión de «¿De qué trozas salió?» (ADR-447): lo que sólo el dueño sabe
 * —otra corrida tiene la madera, la madera es de otro permiso, una especie de
 * nombre parecido—. Dos caminos lado a lado, cada uno con lo que implica; el
 * que cambia el libro abre el editor que ya existe. Nada se aplica solo, y el
 * sistema nunca junta dos especies por su nombre.
 */
import type { ReactNode } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";
import { formatNumber } from "@/lib/format";
import type { DiagnosticoCorrida, TomadaPor } from "@/lib/forestal/vincular-trozas";
import { Btn } from "./ctp-shared";
import { ddmm, de } from "./ctp-sin-origen-comun";
import type { LineaDeArreglo } from "./ctp-sin-origen-lineas";

function Camino({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-2">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{texto}</p>
      {children && <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

const pct = (n: number | null) => (n == null ? "—" : `${formatNumber(n, 1)} %`);

export default function DecisionDeLinea({
  linea,
  abriendo,
  puedeEditar,
  firma = true,
  onVerDia,
  onEditar,
  onSoltar,
}: {
  linea: LineaDeArreglo;
  /** La clave del botón que está leyendo, si alguno. */
  abriendo: string | null;
  /** El rol puede corregir una corrida (`PATCH /api/admin/forestal/ctp`). */
  puedeEditar: boolean;
  /** El rol suelta y vincula madera (dueño o administrador); el servidor lo exige igual. */
  firma?: boolean;
  onVerDia: (dia: string, clave: string) => void;
  onEditar: (c: DiagnosticoCorrida, clave: string) => void;
  /** «Soltar trozas» de la corrida que tiene la madera (ADR-447 §6). Sin él, sólo «Ver». */
  onSoltar?: (t: TomadaPor) => void;
}) {
  const a = linea.accion;
  const n = linea.corridas.length;
  /** Un botón por corrida: cada corrección es de UNA corrida y se firma sola. */
  const botonesPorCorrida = (verbo: string) =>
    linea.corridas.map((c) => {
      const clave = `${linea.clave}:${c.corridaId}`;
      return (
        <Btn key={c.corridaId} size="sm" variant="secondary" disabled={!puedeEditar || abriendo != null} onClick={() => onEditar(c, clave)}>
          {abriendo === clave && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {verbo} la N.º {c.lineNo ?? "—"}
        </Btn>
      );
    });

  let dato: string;
  let caminos: ReactNode;
  if (a.tipo === "soltar_corrida") {
    const t = a.tomadora;
    const nombre = `N.º ${t.lineNo ?? "—"}`;
    const suya = t.m3Producido != null && t.m3 > 0 ? (t.m3Producido / t.m3) * 100 : null;
    const pasa = a.juntasPct != null && a.juntasPct > TOPE_RENDIMIENTO_PCT;
    dato = t.abierta
      ? `La ${nombre} del ${ddmm(t.fecha)} todavía no declara lo producido y tiene ${de(t.trozas, "troza", "trozas")} (${fmtM3(t.m3)} m³). Las ${n} de ${a.especie} rinden ${pct(a.juntasPct)} con ellas.`
      : `La ${nombre} declaró ${fmtM3(t.m3Producido ?? 0)} m³ con ${de(t.trozas, "troza", "trozas")} (${fmtM3(t.m3)} m³): rinde ${pct(suya)}. Si además salieron de ahí las ${n}, juntas rendirían ${pct(a.juntasPct)}${pasa ? `, más que el ${TOPE_RENDIMIENTO_PCT} % de la plaza` : ""}.`;
    const clave = `${linea.clave}:dia`;
    /* Con UNA corrida esperando, «las 1» se leía mal. */
    const lasDeAntes = n === 1 ? "la de antes" : `las ${n} de antes`;
    const estas = n === 1 ? "esta queda" : `estas ${n} quedan`;
    caminos = (
      <>
        <Camino
          titulo={`Salieron de esa madera ${lasDeAntes}`}
          texto={
            onSoltar
              ? `La ${nombre} devuelve al patio las trozas que no entraron. Lo producido no cambia. Después ${estas} para vincular.`
              : `Abre la ${nombre} y corrígela; para soltar sus trozas hay que anularla con motivo desde la tabla. Después ${estas} para vincular.`
          }
        >
          {onSoltar && (
            <Btn size="sm" variant="primary" disabled={!firma || abriendo != null} onClick={() => onSoltar(t)}>
              Soltar trozas de la {nombre}
            </Btn>
          )}
          <Btn size="sm" variant="secondary" disabled={abriendo != null} onClick={() => onVerDia(t.fecha, clave)}>
            Ver la {nombre}
          </Btn>
        </Camino>
        <Camino
          titulo={`La ${nombre} sí salió de esa madera`}
          texto={`${n === 1 ? "Esta queda" : `Estas ${n} quedan`} sin origen hasta que aparezca su madera. No hace falta hacer nada.`}
        />
      </>
    );
  } else if (a.tipo === "corregir_permiso") {
    const p = a.propuesto;
    dato = p
      ? `La corrida dice ${a.actual ?? "sin permiso"}; la madera del patio (${de(p.trozas, "troza", "trozas")}, ${fmtM3(p.m3)} m³) es del ${p.codigo}.`
      : "La madera de su especie en el patio es de otro permiso.";
    caminos = (
      <>
        <Camino
          titulo={`Salieron de la madera del ${p?.codigo ?? "otro permiso"}`}
          texto="Corrige el permiso en cada corrida; después quedan listas para vincular."
        >
          {botonesPorCorrida("Corregir")}
        </Camino>
        <Camino titulo={`Son del ${a.actual ?? "permiso que dicen"}`} texto="Quedan sin origen hasta que llegue la guía de ese permiso." />
      </>
    );
  } else if (a.tipo === "corregir_especie") {
    dato = `En el patio hay ${de(a.trozas, "troza", "trozas")} de ${a.propuesta ?? "una especie parecida"} (${fmtM3(a.m3)} m³) y ninguna de ${a.actual}.`;
    caminos = (
      <>
        <Camino
          titulo={`Es la misma madera: ${a.propuesta ?? "la del patio"}`}
          texto={`Corrige la especie de cada corrida a «${a.propuesta ?? "la del patio"}»; después quedan listas para vincular.`}
        >
          {botonesPorCorrida("Corregir")}
        </Camino>
        <Camino titulo={`Es otra especie: ${a.actual}`} texto="Quedan sin origen hasta que llegue su madera." />
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="mt-2 space-y-2 border-t border-[var(--rule-soft)] pt-2">
      <p className="text-sm tabular-nums text-[var(--text-secondary)]">{dato}</p>
      <div className="grid gap-2 sm:grid-cols-2">{caminos}</div>
      {!puedeEditar && <p className="text-xs text-[var(--text-tertiary)]">Tu usuario no corrige corridas: pídeselo al dueño o a un administrador.</p>}
      {puedeEditar && a.tipo === "soltar_corrida" && onSoltar && !firma && (
        <p className="text-xs text-[var(--text-tertiary)]">Sueltan trozas el dueño o un administrador.</p>
      )}
    </div>
  );
}
