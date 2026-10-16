"use client";

/**
 * El alta de la libreta: una parte nueva escrita desde la guía, que se guarda en
 * el Directorio y se usa en la guía en el mismo gesto (`LibretaModal`).
 *
 * Arranca con lo que ya está tipeado en el bloque de la guía —nadie escribe dos
 * veces el mismo RUC— y pide sólo lo que el papel de ESA parte necesita: el
 * registro MTC al transportista, la licencia al conductor, el N° de autorización
 * al establecimiento de partida y al destinatario (casilleros (18) y (22) del
 * formato 2024, RDE D000014-2024-MIDAGRI-SERFOR-DE).
 *
 * El documento se valida con la misma regla del Directorio (`motivoDocInvalido`)
 * y se completa con el mismo padrón (`consultarDocumento`: SUNAT o RENIEC).
 */

import { useState } from "react";
import { Download, Loader2 } from "@buleje/design-system/icons";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import {
  DOC_TIPOS,
  fuenteAutocompletado,
  motivoDocInvalido,
  normalizarDocumento,
  type DocTipo,
  type ParteInput,
  type RolParte,
} from "@/lib/forestal/directorio";
import type { ValorParte } from "./CtpParteBarra";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { CLASE_FALTA } from "./ctp-guia-piezas";
import { Btn, Field, I } from "./ctp-shared";

/** Los campos de la ficha que el alta sabe pedir además de los de siempre. */
type ClaveExtra = "codigoCtp" | "registroMtc" | "licencia" | "telefono" | "contactoNombre" | "acopioReferencia";

interface Extra {
  clave: ClaveExtra;
  label: string;
  hint?: string;
  mono?: boolean;
  span: 4 | 6 | 12;
}

const TELEFONO: Extra = { clave: "telefono", label: "Teléfono", span: 6 };
const AUTORIZACION_DESTINO: Extra = {
  clave: "codigoCtp",
  label: "N° de autorización",
  hint: "Formato 2024, casillero (22): la autorización del CTP o depósito que recibe. Si es una persona sin establecimiento, déjalo vacío.",
  mono: true,
  span: 6,
};

/** Lo que pide cada papel. El registro MTC viaja en la guía; lo demás queda en la ficha. */
const EXTRAS: Record<RolParte, Extra[]> = {
  proveedor: [TELEFONO],
  destinatario: [AUTORIZACION_DESTINO, TELEFONO],
  cliente: [AUTORIZACION_DESTINO, TELEFONO],
  transportista: [{ clave: "registroMtc", label: "Registro MTC", hint: "Si es empresa de transporte", mono: true, span: 6 }, TELEFONO],
  conductor: [{ clave: "licencia", label: "N° de licencia", hint: "La que pide el puesto de control", mono: true, span: 6 }, TELEFONO],
  establecimiento: [
    {
      clave: "codigoCtp",
      label: "N° de autorización (ARFFS)",
      hint: "Formato 2024, casillero (18): el N° que la ARFFS le dio al depósito o centro de comercialización.",
      mono: true,
      span: 6,
    },
    { clave: "acopioReferencia", label: "Referencia", hint: "Interno: cómo llegar («frente al grifo»). No sale en la guía.", span: 6 },
    { clave: "contactoNombre", label: "Encargado", hint: "Interno: a quién llamar. No sale en la guía.", span: 6 },
    TELEFONO,
  ],
};

interface Formulario {
  nombre: string;
  docTipo: DocTipo;
  docNumero: string;
  direccion: string;
  region: string;
  provincia: string;
  distrito: string;
  extras: Partial<Record<ClaveExtra, string>>;
}

function inicial(rol: RolParte, b: ValorParte): Formulario {
  return {
    nombre: b.nombre ?? "",
    docTipo: b.docTipo || (rol === "conductor" ? "DNI" : "RUC"),
    docNumero: b.docNumero ?? "",
    direccion: b.direccion ?? "",
    region: b.departamento ?? "",
    provincia: b.provincia ?? "",
    distrito: b.distrito ?? "",
    extras: b.registroMtc ? { registroMtc: b.registroMtc } : {},
  };
}

/** Sólo lo escrito: un `""` en el alta no le dice nada al Directorio. */
function sinVacios<T extends Record<string, string | undefined>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v?.trim())) as Partial<T>;
}

export default function AltaDeParte({
  id,
  rol,
  borrador,
  conExtras,
  onGuardar,
  onError,
}: {
  /** El `id` del `<form>`: el botón «Guardar y usar» vive en el pie del modal. */
  id: string;
  rol: RolParte;
  /** Lo que ya está tipeado en el bloque de la guía. */
  borrador: ValorParte;
  /** Sin alta completa (el consumidor sólo guarda nombre, documento y dirección), no se piden los extras. */
  conExtras: boolean;
  onGuardar: (input: ParteInput, valor: ValorParte) => void;
  onError: (msg: string | null) => void;
}) {
  const [f, setF] = useState<Formulario>(() => inicial(rol, borrador));
  const [consultando, setConsultando] = useState(false);
  const [lectura, setLectura] = useState<string | null>(null);
  const set = (v: Partial<Formulario>) => setF((p) => ({ ...p, ...v }));
  const setExtra = (k: ClaveExtra, v: string) => setF((p) => ({ ...p, extras: { ...p.extras, [k]: v } }));

  const fuente = fuenteAutocompletado(f.docTipo);
  const docMal = f.docNumero.trim() ? motivoDocInvalido(f.docTipo, f.docNumero) : null;
  const extras = EXTRAS[rol].filter((e) => conExtras || e.clave === "registroMtc");

  async function traerDelPadron() {
    setConsultando(true);
    setLectura(null);
    onError(null);
    try {
      const d = await consultarDocumento(f.docTipo, f.docNumero);
      if (!d) {
        setLectura(`No se encontró el ${f.docTipo} en ${fuente}. Cárgalo a mano.`);
        return;
      }
      /* Sólo lo vacío: lo que alguien escribió no se pisa. */
      setF((p) => ({
        ...p,
        nombre: p.nombre.trim() ? p.nombre : d.nombre,
        direccion: p.direccion.trim() ? p.direccion : d.direccion ?? "",
        region: p.region.trim() ? p.region : d.region ?? "",
        provincia: p.provincia.trim() ? p.provincia : d.provincia ?? "",
        distrito: p.distrito.trim() ? p.distrito : d.distrito ?? "",
      }));
      setLectura(d.estado && d.estado.toUpperCase() !== "ACTIVO" ? `${d.nombre} — ojo: ${fuente} lo marca ${d.estado}.` : `${d.nombre}, traído de ${fuente}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setConsultando(false);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (f.nombre.trim().length < 2) return onError("Escribe el nombre o la razón social.");
    if (docMal) return onError(docMal);
    onError(null);
    const docNumero = normalizarDocumento(f.docNumero);
    const input: ParteInput = {
      roles: [rol],
      nombre: f.nombre.trim(),
      ...(docNumero ? { docTipo: f.docTipo, docNumero } : {}),
      ...sinVacios({ direccion: f.direccion, region: f.region, provincia: f.provincia, distrito: f.distrito }),
      ...sinVacios(f.extras),
    };
    onGuardar(input, {
      nombre: input.nombre,
      docTipo: f.docTipo,
      docNumero,
      direccion: f.direccion.trim(),
      departamento: f.region,
      provincia: f.provincia,
      distrito: f.distrito,
      ...(rol === "transportista" ? { registroMtc: f.extras.registroMtc?.trim() ?? "" } : {}),
    });
  }

  return (
    <form id={id} onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12 sm:[&_label]:min-h-6">
      <Field span={12} label="Nombre o razón social" required>
        <input
          type="text"
          className={`${I} ${f.nombre.trim() ? "" : CLASE_FALTA}`}
          value={f.nombre}
          onChange={(e) => set({ nombre: e.target.value })}
        />
      </Field>
      <Field span={4} label="Documento">
        <select className={I} value={f.docTipo} onChange={(e) => set({ docTipo: e.target.value as DocTipo })}>
          {DOC_TIPOS.map((t) => (
            <option key={t} value={t}>
              {t === "PASAPORTE" ? "Pasaporte" : t}
            </option>
          ))}
        </select>
      </Field>
      <Field span={fuente ? 4 : 8} label={`N° de ${f.docTipo === "PASAPORTE" ? "pasaporte" : f.docTipo}`}>
        <input
          type="text"
          inputMode={f.docTipo === "RUC" || f.docTipo === "DNI" ? "numeric" : undefined}
          className={`${I} font-mono tabular-nums`}
          value={f.docNumero}
          onChange={(e) => set({ docNumero: e.target.value })}
        />
      </Field>
      {fuente && (
        <div className="flex items-end sm:col-span-4">
          <Btn
            variant="secondary"
            className="w-full"
            disabled={consultando || !f.docNumero.trim() || Boolean(docMal)}
            onClick={() => void traerDelPadron()}
          >
            {consultando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Traer de {fuente}
          </Btn>
        </div>
      )}
      {(docMal || lectura) && (
        <p
          className={`text-sm font-medium sm:col-span-12 ${
            docMal ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"
          }`}
        >
          {docMal ?? lectura}
        </p>
      )}
      <Field span={12} label="Dirección">
        <input type="text" className={I} value={f.direccion} onChange={(e) => set({ direccion: e.target.value })} />
      </Field>
      <CtpUbigeoSelects
        span={4}
        valor={{ departamento: f.region, provincia: f.provincia, distrito: f.distrito }}
        onChange={(v) =>
          set({
            ...(v.departamento === undefined ? {} : { region: v.departamento }),
            ...(v.provincia === undefined ? {} : { provincia: v.provincia }),
            ...(v.distrito === undefined ? {} : { distrito: v.distrito }),
          })
        }
      />
      {extras.map((x) => (
        <Field key={x.clave} span={x.span} label={x.label} hint={x.hint}>
          <input
            type="text"
            className={`${I} ${x.mono ? "font-mono" : ""}`}
            value={f.extras[x.clave] ?? ""}
            onChange={(e) => setExtra(x.clave, e.target.value)}
          />
        </Field>
      ))}
    </form>
  );
}
