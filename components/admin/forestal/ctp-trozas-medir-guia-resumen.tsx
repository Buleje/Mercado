"use client";

/**
 * La vista previa de «Traer de la guía»: cuántas piezas encontraron su código
 * en la ficha SERFOR, qué se va a llenar y —con nombre y apellido— lo que NO se
 * llena y por qué. Sólo lee la respuesta del servidor (`RespuestaMedidasGuia`):
 * las cuentas y las reglas son del backend.
 */

import { coincidenciasDe, type RespuestaMedidasGuia } from "@/lib/forestal/medidas-desde-guia";

const ERROR = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const OK = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";

const fmt = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const lista = (xs: readonly string[], max = 12) =>
  xs.length === 0 ? "" : `${xs.slice(0, max).join(", ")}${xs.length > max ? ` y ${xs.length - max} más` : ""}`;

function Renglon({ titulo, texto, tono }: { titulo: string; texto: string; tono?: string }) {
  if (!texto) return null;
  return (
    <li className="break-words">
      <b className={tono ?? "text-[var(--text-primary)]"}>{titulo}:</b> {texto}
    </li>
  );
}

/** Lo que le impide escribir a esta vista previa, en palabras del operador (o null). */
export function bloqueoDeGuia(r: RespuestaMedidasGuia): string | null {
  if (r.relacionGuia === "distinta") {
    return `Esa ficha es de la guía ${r.guiaSerfor ?? "—"}, no de la ${r.gtfNumber}. Revisa el N° de registro.`;
  }
  if (r.relacionGuia === "sin_numero") return "La ficha de SERFOR no trae el N° de guía: no se puede saber si es ésta.";
  return null;
}

export default function CtpTrozasMedirGuiaResumen({ r }: { r: RespuestaMedidasGuia }) {
  const p = r.plan;
  if (!p) return null;
  const coinciden = coincidenciasDe(p);
  const bloqueo = bloqueoDeGuia(r);
  const flexibles = p.llenar.filter((f) => f.coincidencia === "flexible").length;
  return (
    <div className="space-y-1.5 text-sm text-[var(--text-secondary)]" role="status">
      <p>
        <b className="text-[var(--text-primary)]">
          {coinciden} de {r.trozasLibro} {r.trozasLibro === 1 ? "pieza coincide" : "piezas coinciden"}
        </b>
        {" "}con las {r.trozasGuia} trozas de la ficha
        {p.sinCoincidencia.libro.length + p.sinCoincidencia.guia.length > 0 &&
          ` · ${p.sinCoincidencia.libro.length + p.sinCoincidencia.guia.length} sin coincidencia`}
        {" · "}
        <span className="text-[var(--text-tertiary)]">
          {r.fuente === "guardada" ? "ficha guardada en el ingreso" : "consultada recién en SERFOR (queda guardada al guardar)"}
        </span>
      </p>
      {bloqueo && <p className={`font-semibold ${ERROR}`}>{bloqueo}</p>}
      {r.relacionGuia === "sufijo" && (
        <p className={AVISO}>
          SERFOR la publica como <b>{r.guiaSerfor}</b> y el libro como <b>{r.gtfNumber}</b>: mismo número, con un tramo menos.
        </p>
      )}
      {r.estadoSerfor && /anulad/i.test(r.estadoSerfor) && (
        <p className={`font-semibold ${AVISO}`}>SERFOR dice que la guía está «{r.estadoSerfor}».</p>
      )}
      <ul className="space-y-0.5">
        <Renglon
          titulo={`Se llenan ${p.llenar.length}`}
          tono={OK}
          texto={lista(p.llenar.map((f) => `${f.codificacion} → ${fmt(f.d1)} × ${fmt(f.d2)} cm${f.largo != null ? ` · ${fmt(f.largo)} m` : ""}`), 8)}
        />
        {flexibles > 0 && (
          <li className="text-[var(--text-tertiary)]">
            {flexibles} por código parecido (sin guiones ni barras):{" "}
            {lista(p.llenar.filter((f) => f.coincidencia === "flexible").map((f) => `${f.codificacion} = ${f.codigoGuia}`), 6)}
          </li>
        )}
        <Renglon titulo="Ya tenían D1/D2 (no se tocan)" texto={lista(p.yaTenian.map((y) => y.codificacion))} />
        <Renglon titulo="Del libro, sin su código en la guía" tono={AVISO} texto={lista(p.sinCoincidencia.libro)} />
        <Renglon titulo="De la guía, sin pieza en el libro" texto={lista(p.sinCoincidencia.guia)} />
        <Renglon
          titulo="Ambiguas (no se emparejan)"
          tono={AVISO}
          texto={lista(p.ambiguas.map((a) => `${a.codigo} (${a.candidatos.join(" / ")})`), 6)}
        />
        <Renglon
          titulo="La guía no trae medidas legibles"
          tono={AVISO}
          texto={lista(p.sinDato.map((s) => `${s.codificacion}${s.dimensiones ? ` «${s.dimensiones}»` : ""}`), 6)}
        />
        <Renglon
          titulo="El largo no cuadra (más de 30 cm)"
          tono={AVISO}
          texto={lista(p.largoDistinto.map((l) => `${l.codificacion}: libro ${fmt(l.largoLibro)} m, guía ${fmt(l.largoGuia)} m`), 6)}
        />
        <Renglon titulo="No se pueden tocar" tono={AVISO} texto={lista(p.bloqueadas.map((b) => `${b.codificacion} (${b.motivo})`), 6)} />
      </ul>
    </div>
  );
}
