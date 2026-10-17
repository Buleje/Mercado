"use client";

/**
 * CtpFichaFormUbicacion — representante legal, ubicación del establecimiento y
 * contacto: la mitad de abajo de la carátula del Libro (Anexo 1 de la RDE
 * D000025-2023), incluidas las **coordenadas UTM** que antes no se guardaban
 * en ningún lado.
 *
 * Departamento / Provincia / Distrito se eligen del padrón INEI y el ubigeo se
 * calcula solo (y al revés: tipear el ubigeo llena los tres). Un "Ucayaly" con
 * i griega hace que `arffsMesaPartes()` no encuentre la mesa de partes y el
 * banner de Trámites no aparezca, en silencio.
 */

import { AlertTriangle, MapPin, User } from "@buleje/design-system/icons";
import { Field, I } from "./ctp-shared";
import { NotaCampo, BloqueCampos, type CamposFichaProps } from "./ctp-ficha-form";
import {
  distritosDeProvinciaNombre,
  listDepartamentos,
  provinciasDeDepartamentoNombre,
  resolveUbigeo,
  ubigeoDeNombres,
} from "@/lib/peru-ubigeo";
import {
  coordenadaUtmDeFicha,
  dniValido,
  utmAGeograficas,
} from "@/lib/forestal/ctp-ficha-types";

/** Las tres zonas UTM en las que entra el Perú. La carátula pide "zona latitudinal". */
const ZONAS_UTM_PERU = ["17S", "18S", "19S"];

export default function CtpFichaFormUbicacion({ draft, set }: CamposFichaProps) {
  const provincias = provinciasDeDepartamentoNombre(draft.region);
  const distritos = distritosDeProvinciaNombre(draft.region, draft.provincia);
  const dniSospechoso = !dniValido(draft.representanteDni);

  // Sin zona elegida no se afirma nada: `coordenadaUtmDeFicha` asume 18S para
  // poder calcular, y mostrar esa equivalencia antes de que el operador elija
  // la zona sería declarar una ubicación que él no declaró.
  const utm = draft.utmZona ? coordenadaUtmDeFicha(draft) : null;
  const geo = utmAGeograficas(utm);
  const utmFueraDelPeru = !!utm && !geo;

  /** Rellena el ubigeo desde los tres nombres; `""` si alguno no está en el padrón. */
  const sincronizarUbigeo = (region: string, provincia: string, distrito: string) =>
    set("ubigeo", ubigeoDeNombres(region, provincia, distrito));

  return (
    <>
      <BloqueCampos title="Representante legal" icon={User}>
        <Field label="Nombres y apellidos">
          <input
            className={I}
            value={draft.representante}
            onChange={(e) => set("representante", e.target.value)}
            placeholder="Juan Pedro Rinconada"
          />
        </Field>
        <Field label="DNI / CE" hint={dniSospechoso ? undefined : "8 dígitos si es DNI"}>
          <input
            className={I}
            value={draft.representanteDni}
            aria-label="DNI / CE"
            onChange={(e) => set("representanteDni", e.target.value.slice(0, 20))}
            aria-invalid={dniSospechoso}
            placeholder="73546733"
          />
          {dniSospechoso && (
            <NotaCampo tono="aviso" icono={AlertTriangle}>
              Un DNI son 8 dígitos y ese tiene {draft.representanteDni.length}. Si es carné de
              extranjería, escríbelo con su letra para que no se lea como un DNI incompleto.
            </NotaCampo>
          )}
        </Field>
      </BloqueCampos>

      <BloqueCampos
        title="Ubicación del establecimiento"
        icon={MapPin}
        hint="Es la carátula del Libro: domicilio, departamento, provincia, distrito y coordenadas UTM del local donde se transforma."
      >
        <Field label="Domicilio">
          <input
            className={I}
            value={draft.direccion}
            onChange={(e) => set("direccion", e.target.value)}
            placeholder="Av. Centenario 1800"
          />
        </Field>
        <Field label="Ubigeo" hint="6 dígitos INEI · llena departamento, provincia y distrito">
          <input
            className={I}
            value={draft.ubigeo}
            inputMode="numeric"
            placeholder="250101"
            onChange={(e) => {
              const code = e.target.value.replace(/\D/g, "").slice(0, 6);
              set("ubigeo", code);
              const r = resolveUbigeo(code);
              if (r) {
                set("region", r.departamento);
                set("provincia", r.provincia);
                set("distrito", r.distrito);
              }
            }}
          />
        </Field>
        {/* Autocompletar, no restringir: la lista oficial guía sin bloquear el
            campo para un local fuera de esa cobertura o un nombre viejo ya
            guardado. El ubigeo sí se calcula solo cuando los tres coinciden. */}
        <Field label="Departamento">
          <input
            className={I}
            value={draft.region}
            list="ficha-regiones-peru"
            placeholder="Ucayali"
            onChange={(e) => {
              set("region", e.target.value);
              sincronizarUbigeo(e.target.value, draft.provincia, draft.distrito);
            }}
          />
        </Field>
        {/* El `<datalist>` va FUERA del `Field`: con dos hijos el primitivo
            etiqueta el grupo en vez del input y el campo se queda sin nombre
            accesible (ver el comentario de `Field` en ctp-shared). */}
        <datalist id="ficha-regiones-peru">
          {listDepartamentos().map((d) => (
            <option key={d.code} value={d.nombre} />
          ))}
        </datalist>
        <Field
          label="Provincia"
          hint={
            draft.region && provincias.length === 0
              ? "«" + draft.region + "» no está en el padrón INEI: revisa cómo está escrito"
              : undefined
          }
        >
          <input
            className={I}
            value={draft.provincia}
            list="ficha-provincias-peru"
            placeholder="Coronel Portillo"
            onChange={(e) => {
              set("provincia", e.target.value);
              sincronizarUbigeo(draft.region, e.target.value, draft.distrito);
            }}
          />
        </Field>
        <datalist id="ficha-provincias-peru">
          {provincias.map((p) => (
            <option key={p.code} value={p.nombre} />
          ))}
        </datalist>
        <Field label="Distrito">
          <input
            className={I}
            value={draft.distrito}
            list="ficha-distritos-peru"
            placeholder="Callería"
            onChange={(e) => {
              set("distrito", e.target.value);
              sincronizarUbigeo(draft.region, draft.provincia, e.target.value);
            }}
          />
        </Field>
        <datalist id="ficha-distritos-peru">
          {distritos.map((d) => (
            <option key={d.code} value={d.nombre} />
          ))}
        </datalist>
        <Field label="Coordenada UTM Este (E)">
          <input
            className={I}
            value={draft.utmEste}
            inputMode="numeric"
            placeholder="435126"
            onChange={(e) => set("utmEste", e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
          />
        </Field>
        <Field label="Coordenada UTM Norte (N)">
          <input
            className={I}
            value={draft.utmNorte}
            inputMode="numeric"
            placeholder="8756846"
            onChange={(e) => set("utmNorte", e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
          />
        </Field>
        <Field label="Zona UTM" hint="La zona latitudinal que pide la carátula">
          <select
            className={I}
            value={draft.utmZona}
            aria-label="Zona UTM"
            onChange={(e) => set("utmZona", e.target.value)}
          >
            <option value="">Elegir…</option>
            {ZONAS_UTM_PERU.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {utmFueraDelPeru && (
            <NotaCampo tono="aviso" icono={AlertTriangle}>
              Esa coordenada no cae en el Perú. Revisa que el Este y el Norte no estén cambiados de
              lugar.
            </NotaCampo>
          )}
          {geo && (
            <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">
              Equivale a {Number(geo.lat).toFixed(4)}, {Number(geo.lng).toFixed(4)} — compáralo con el mapa antes de
              presentar el Libro.
            </p>
          )}
        </Field>
      </BloqueCampos>

      <BloqueCampos title="Contacto" icon={MapPin}>
        <Field label="Número de teléfono">
          <input
            className={I}
            value={draft.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            placeholder="961 234 567"
          />
        </Field>
        <Field label="Correo electrónico">
          <input
            className={I}
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            placeholder="servicio.legal@empresa.com"
          />
        </Field>
      </BloqueCampos>
    </>
  );
}
