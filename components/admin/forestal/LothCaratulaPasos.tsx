"use client";

/**
 * Los cuatro pasos de la carátula (el formulario los muestra de a uno).
 * Sólo pintan campos: el estado, el guardado y la navegación viven en
 * `LothCaratulaForm`.
 */

import { Check } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Campo } from "./LothCaratulaCampo";
import LothCaratulaCites from "./LothCaratulaCites";
import type { useLothCitesPermisos } from "./hooks/use-loth-cites-permisos";
import {
  EJEMPLO_TITULO,
  avisoDeTitulo,
  soloDigitos,
  type CampoCaratula,
  type CaratulaValores,
  type ErroresCaratula,
  type Propuestos,
} from "@/lib/forestal/loth-caratula-pasos";
import { limaDateKey } from "@/lib/utils";

export interface PasoProps {
  f: CaratulaValores;
  set: (k: CampoCaratula, v: string) => void;
  err: ErroresCaratula;
  propuestos: Propuestos;
}

const REGIONS_PE = ["Loreto", "Ucayali", "Madre de Dios", "San Martín", "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra"];

/** Las dos respuestas, en el orden en que se dan: la mayoría lleva la troza a una planta. */
const OPCIONES_TRANSFORMA: { valor: boolean; label: string }[] = [
  { valor: false, label: "No, la llevo a una planta" },
  { valor: true, label: "Sí, asierro en el bosque" },
];

export function PasoTitulo({ f, set, err, propuestos }: PasoProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo label="N° de título habilitante" propuesto={propuestos.tituloHabilitante} aviso={avisoDeTitulo(f.tituloHabilitante)}>
          {(a) => (
            <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder={EJEMPLO_TITULO} autoComplete="off" className={`${a.className} font-mono`} />
          )}
        </Campo>
      </div>
      <Campo label="N° de resolución" propuesto={propuestos.resolucionNumber}>
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDE N° 001-2026-GRU-DRFFS" autoComplete="off" className={a.className} />
        )}
      </Campo>
      <Campo label="Fecha de la resolución" propuesto={propuestos.resolucionDate} error={err.resolucionDate}>
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} type="date" max={limaDateKey()} value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={a.className} />
        )}
      </Campo>
    </div>
  );
}

export function PasoTitular({ f, set, err, propuestos }: PasoProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo label="Titular del título habilitante" required propuesto={propuestos.titularName}>
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera El Aguajal SAC" autoComplete="organization" className={a.className} />
        )}
      </Campo>
      <Campo label="RUC" propuesto={propuestos.ruc} error={err.ruc} hint="11 dígitos">
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} type="text" inputMode="numeric" maxLength={11} value={f.ruc} onChange={(e) => set("ruc", soloDigitos(e.target.value))} placeholder="20XXXXXXXXX" autoComplete="off" className={`${a.className} font-mono`} />
        )}
      </Campo>
      <Campo label="Representante legal" hint="Si el titular es persona jurídica">
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Pedro Rinconada Pariachi" autoComplete="off" className={a.className} />
        )}
      </Campo>
      <Campo label="DNI (rep. legal)" error={err.dni} hint="8 dígitos">
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} type="text" inputMode="numeric" maxLength={8} value={f.dni} onChange={(e) => set("dni", soloDigitos(e.target.value))} placeholder="05040151" autoComplete="off" className={`${a.className} font-mono`} />
        )}
      </Campo>
    </div>
  );
}

interface PasoLibroProps extends PasoProps {
  enElTh: boolean | null;
  setEnElTh: (v: boolean | null) => void;
}

export function PasoLibro({ f, set, propuestos, enElTh, setEnElTh }: PasoLibroProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo label="N° de registro del libro" hint="Otorgado por la ARFFS">
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.registroNumber} onChange={(e) => set("registroNumber", e.target.value)} placeholder="001-GOREU-..." autoComplete="off" className={a.className} />
        )}
      </Campo>
      <Campo label="N° de tomo">
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.tomo} onChange={(e) => set("tomo", e.target.value)} placeholder="PO 12 - Tomo I" autoComplete="off" className={a.className} />
        )}
      </Campo>
      <Campo label="Documento de gestión" propuesto={propuestos.docGestionType}>
        {(a) => (
          <select id={a.id} value={f.docGestionType} onChange={(e) => set("docGestionType", e.target.value)} className={a.className}>
            <option value="PO">PO</option>
            <option value="PMFI">PMFI</option>
            <option value="DEMA">DEMA</option>
          </select>
        )}
      </Campo>
      <Campo label="Nombre o periodo" propuesto={propuestos.docGestionName}>
        {(a) => (
          <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.docGestionName} onChange={(e) => set("docGestionName", e.target.value)} placeholder="Plan Operativo 2026" autoComplete="off" className={a.className} />
        )}
      </Campo>

      {/* Decide si las secciones 4-6 se muestran: ver ForestLothTransformacionDB. */}
      <div className="sm:col-span-2">
        <span id="loth-transforma-rotulo" className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
          ¿Asierras la madera dentro del título habilitante?
          <InfoTip
            title="Consumo, producto y despacho (secciones 4 a 6)"
            what="Sólo se llenan si transformas la madera dentro del título habilitante. Si la llevas a una planta, eso se registra en el Libro CTP."
            affects="Con «No», esas tres secciones se esconden de la pantalla. En el libro impreso salen en blanco, como pide SERFOR."
            example="Si tus trozas salen con GTF a tu aserradero: «No, la llevo a una planta»."
          />
        </span>
        <div role="radiogroup" aria-labelledby="loth-transforma-rotulo" className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
          {OPCIONES_TRANSFORMA.map((o) => {
            const elegida = enElTh === o.valor;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={elegida}
                onClick={() => setEnElTh(elegida ? null : o.valor)}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-center text-sm font-medium leading-snug transition-colors sm:min-h-10 ${
                  elegida
                    ? "border-[var(--data-success-600)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {elegida && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PasoContacto({ f, set, propuestos, cites }: PasoProps & { cites: ReturnType<typeof useLothCitesPermisos> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <Campo label="Domicilio" propuesto={propuestos.domicilio}>
          {(a) => (
            <input id={a.id} aria-describedby={a.describedBy} type="text" value={f.domicilio} onChange={(e) => set("domicilio", e.target.value)} placeholder="Coronel Portillo Km 15" autoComplete="off" className={a.className} />
          )}
        </Campo>
      </div>
      <Campo label="Departamento">
        {(a) => (
          <select id={a.id} value={f.departamento} onChange={(e) => set("departamento", e.target.value)} className={a.className}>
            {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </Campo>
      <Campo label="Provincia">
        {(a) => (
          <input id={a.id} type="text" value={f.provincia} onChange={(e) => set("provincia", e.target.value)} placeholder="Coronel Portillo" autoComplete="off" className={a.className} />
        )}
      </Campo>
      <Campo label="Distrito">
        {(a) => (
          <input id={a.id} type="text" value={f.distrito} onChange={(e) => set("distrito", e.target.value)} placeholder="Callería" autoComplete="off" className={a.className} />
        )}
      </Campo>
      <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
        <Campo label="Teléfono" propuesto={propuestos.telefono}>
          {(a) => (
            <input id={a.id} type="tel" inputMode="tel" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="992696555" autoComplete="off" className={a.className} />
          )}
        </Campo>
        <Campo label="Correo electrónico" propuesto={propuestos.email}>
          {(a) => (
            <input id={a.id} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="titular@correo.com" autoComplete="off" className={a.className} />
          )}
        </Campo>
      </div>
      <div className="sm:col-span-3">
        <LothCaratulaCites {...cites} />
      </div>
    </div>
  );
}
