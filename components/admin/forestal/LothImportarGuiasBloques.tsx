"use client";

/**
 * Todos los datos de una guía IMPORTADA al Libro TH, en los MISMOS bloques que
 * el despacho con guía (Brandon 02-10-2026: «que estén todos los datos en
 * bloques igual como es para despachar, en cada fila 2 o más bloques»).
 *
 * De a dos por fila, cada fila con su par natural:
 *   Documento (1)–(4)             · Título habilitante (5)–(12)
 *   Propietario (13)–(21)         · Destinatario (22)–(28)
 *   Transporte (29)–(34)          · Traslado (partida, llegada, 35, 36)
 *   Resumen por especie (lista)   · Detalle del producto (37, declarado)
 *
 * `partes` (07-10-2026, Brandon: «los datos en una sección y las trozas y
 * resúmenes en otra»): la vista previa de importar dibuja los bloques del
 * documento en «Datos de la guía» y el resumen por especie con el (37) en
 * «Trozas y resumen». Sin `partes`, todo junto (la ficha leída de un documento).
 *
 * Los casilleros —número, rótulo, orden— salen de `bloquesDeGuia`, la misma
 * fuente que la hoja del CTP y el PDF: dos pantallas no pueden declarar
 * casilleros distintos del mismo documento. Solo lectura, y lo que SERFOR no
 * publica se dice ausente («No lo publica SERFOR»), no vacío.
 */

import { useMemo } from "react";
import {
  bloquesDeGuia,
  camposNoMapeados,
  type CasilleroGtf,
} from "@/lib/forestal/gtf-serfor-bloques";
import { componerPunto } from "@/lib/forestal/ctp-gtf-datos";
import { rotuloDelTitulo } from "@/lib/forestal/loth-guia-despacho";
import { sinRaya } from "@/lib/forestal/loth-importar-guia";
import {
  resumenPorEspecie,
  type PiezaParaResumen,
} from "@/lib/forestal/loth-importar-guia-resumen";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { Bloque } from "./ctp-guia-bloques";
import { SubBloque } from "./ctp-guia-piezas";
import { BloqueEspecies, BloqueProductos } from "./LothImportarGuiasEspecies";

const NOTA = "Como la publica SERFOR. No se edita: es la declaración de un documento ajeno.";

/* En el celular, dos datos por renglón (los de ancho completo, uno). */
const SPAN: Record<NonNullable<CasilleroGtf["span"]>, string> = {
  3: "col-span-1 sm:col-span-3",
  4: "col-span-1 sm:col-span-4",
  6: "col-span-1 sm:col-span-6",
  12: "col-span-2 sm:col-span-12",
};

/** SERFOR rellena lo vacío con rayas («V2H-901 / ----------»): se quitan los tramos que son sólo raya. */
function limpio(v: string | null): string | null {
  /* Sólo el « / » con espacios separa tramos: «17/12/2024» y «19-SEC/PER-FMC-2024-008» no se tocan. */
  const partes = (v ?? "")
    .split(/\s+\/\s+/)
    .map((p) => p.trim())
    .filter((p) => sinRaya(p));
  return partes.length ? partes.join(" / ") : null;
}

/** De dónde sale (origen del recurso, 10-12) y a dónde llega (destinatario, 25-28). */
export function trasladoDeLaFicha(f: GtfSerfor): { partida: string; llegada: string } {
  return {
    partida: componerPunto({
      direccion: "",
      distrito: sinRaya(f.distrito),
      provincia: sinRaya(f.provincia),
      departamento: sinRaya(f.departamento),
    }),
    llegada: componerPunto({
      direccion: sinRaya(f.destinatarioDireccion),
      distrito: sinRaya(f.destinatarioDistrito),
      provincia: sinRaya(f.destinatarioProvincia),
      departamento: sinRaya(f.destinatarioDepartamento),
    }),
  };
}

function Dato({ c }: { c: CasilleroGtf }) {
  const valor = limpio(c.valor);
  return (
    <div className={`min-w-0 ${SPAN[c.span ?? 6]}`}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]">
        {c.n && (
          <span
            title={`Casillero (${c.n}) del formato oficial`}
            className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold tabular-nums"
          >
            {c.n}
          </span>
        )}
        <span className="min-w-0">{c.label}</span>
      </dt>
      {valor ? (
        <dd
          className={`mt-0.5 break-words text-sm font-semibold text-[var(--text-primary)] ${c.mono ? "font-mono tabular-nums" : ""}`}
        >
          {valor}
        </dd>
      ) : (
        <dd className="mt-0.5 text-sm italic text-[var(--text-tertiary)]">
          {c.noPublicado ? "No lo publica SERFOR" : "En blanco"}
        </dd>
      )}
    </div>
  );
}

function Datos({ casilleros }: { casilleros: readonly CasilleroGtf[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:col-span-12 sm:grid-cols-12">
      {casilleros.map((c, i) => (
        <Dato key={`${c.n ?? "s"}-${c.label}-${i}`} c={c} />
      ))}
    </dl>
  );
}

const de = (cs: readonly CasilleroGtf[], ...n: string[]) => cs.filter((c) => n.includes(c.n ?? ""));
const ancho =
  (span: CasilleroGtf["span"]) =>
  (c: CasilleroGtf): CasilleroGtf => ({ ...c, span });

/** Qué parte de la guía se dibuja: todo, sólo el documento o sólo el resumen de lo que viaja. */
export type PartesDeLaGuia = "todo" | "datos" | "resumen";

export default function LothImportarGuiasBloques({
  ficha,
  piezas,
  partes = "todo",
}: {
  ficha: GtfSerfor | null;
  piezas: readonly PiezaParaResumen[];
  partes?: PartesDeLaGuia;
}) {
  const resumen = useMemo(() => resumenPorEspecie(piezas, ficha?.productos), [piezas, ficha]);
  const bloques = useMemo(
    () =>
      ficha ? Object.fromEntries(bloquesDeGuia(ficha).map((b) => [b.id, b.casilleros])) : null,
    [ficha],
  );
  const extra = useMemo(() => (ficha ? camposNoMapeados(ficha) : []), [ficha]);

  /* Sin ficha (un ingreso sin la consulta de SERFOR) sólo hay lista de trozas: va el resumen solo. */
  if (!ficha || !bloques) return partes === "datos" ? null : <BloqueEspecies r={resumen} />;
  const productos = ficha.productos ?? [];
  const cuadroResumen = (
    <>
      <BloqueEspecies r={resumen} className={productos.length ? "" : "@3xl/guia:col-span-2"} />
      {productos.length > 0 && (
        <BloqueProductos productos={productos} volumenTotal={ficha.volumenTotal} />
      )}
    </>
  );
  if (partes === "resumen") {
    return (
      <div className="@container/guia">
        <div className="grid gap-3 @3xl/guia:grid-cols-2">{cuadroResumen}</div>
      </div>
    );
  }

  const guia = bloques.guia ?? [];
  const transporte = bloques.transportista ?? [];
  const { partida, llegada } = trasladoDeLaFicha(ficha);
  const registrada = [ficha.fechaRegistro, ficha.registradoPor]
    .filter((x) => x?.trim())
    .join(" · ");

  /* La fila de a dos la decide el ANCHO DEL MODAL (container query), no la pantalla:
     el mismo bloque vive en el modal de importar (76 rem) y en «Datos» (64 rem). */
  return (
    <div className="@container/guia">
      <div className="grid gap-3 @3xl/guia:grid-cols-2">
        <Bloque
          titulo="Documento"
          hint="Casilleros (1) a (4): el N° impreso, la autoridad que la registró y su vigencia."
          nota={NOTA}
        >
          <Datos
            casilleros={[
              { n: "1", label: "N° de GTF", valor: ficha.gtfNumber, mono: true, span: 6 },
              { label: "N° de registro SERFOR", valor: ficha.numeroRegistro, mono: true, span: 6 },
              ...de(guia, "3", "4").map(ancho(6)),
              ...de(guia, "2"),
              { label: "RUC de la instancia", valor: ficha.rucInstancia, mono: true, span: 6 },
              { label: "Estado en SERFOR", valor: ficha.estado, span: 6 },
              { label: "Registrada", valor: registrada || null, span: 12 },
            ]}
          />
        </Bloque>
        <Bloque
          titulo={rotuloDelTitulo(/plantaci/i.test(ficha.origenRecurso ?? ""))}
          hint="Casilleros (5) a (12): el permiso que ampara la madera, su titular y dónde está el recurso."
          nota={NOTA}
        >
          <Datos
            casilleros={[
              ...de(guia, "7"),
              ...guia.filter((c) => c.label === "Representante legal"),
              ...de(guia, "5", "6").map(ancho(6)),
              ...de(guia, "8").map(ancho(12)),
              ...de(guia, "9"),
              ...guia.filter((c) => c.label === "Dirección del titular"),
              ...de(guia, "10", "11", "12"),
            ]}
          />
        </Bloque>

        <Bloque
          titulo="Propietario del producto"
          hint="Casilleros (13) a (21): el dueño de la madera que viaja."
          nota={NOTA}
        >
          <Datos casilleros={bloques.propietario ?? []} />
        </Bloque>
        <Bloque
          titulo="Destinatario"
          hint="Casilleros (22) a (28): a quién va la madera."
          nota={NOTA}
        >
          <Datos casilleros={bloques.destinatario ?? []} />
        </Bloque>

        <Bloque
          titulo="Transporte"
          hint="Casilleros (29) a (34): la guía de remisión, el vehículo y el conductor."
          nota={NOTA}
        >
          <SubBloque etiqueta="Guía y vehículo">
            <Datos casilleros={de(transporte, "29", "30", "31")} />
          </SubBloque>
          <SubBloque etiqueta="Conductor">
            <Datos casilleros={de(transporte, "32", "33", "34")} />
          </SubBloque>
        </Bloque>
        <Bloque
          titulo="Traslado"
          hint="De dónde sale (el origen del recurso) y a dónde llega (el destinatario), con la lista de trozas (35)."
          nota={NOTA}
        >
          <Datos
            casilleros={[
              { label: "Punto de partida · origen del recurso", valor: partida || null, span: 12 },
              { label: "Llegada · destinatario", valor: llegada || null, span: 12 },
              ...(bloques.producto ?? []),
            ]}
          />
        </Bloque>

        {partes === "todo" && cuadroResumen}

        {extra.length > 0 && (
          <Bloque
            titulo="Otros datos que publica SERFOR"
            hint="Etiquetas de la consulta que ningún casillero del formato recoge. Se muestran para que nada se pierda en silencio."
            className="@3xl/guia:col-span-2"
          >
            <Datos
              casilleros={extra.map((c) => ({ label: c.etiqueta, valor: c.valor, span: 4 }))}
            />
          </Bloque>
        )}
      </div>
    </div>
  );
}
