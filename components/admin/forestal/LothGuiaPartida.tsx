"use client";

/**
 * «Punto de partida» de la guía del bosque: los casilleros (17) a (20) del
 * formato 2024 (RDE D000014-2024-MIDAGRI-SERFOR-DE, Anexo I) más datos internos
 * que no salen en la guía.
 *
 * Brandon 15-10-2026: «en punto de partida también poner un campo de razón
 * social de qué empresa o establecimiento sale, su RUC, dirección, y los demás
 * campos, es decir el formato oficial de SERFOR (y añadir otros internos)».
 *
 * El instructivo decide qué casilleros aplican según de dónde arranca el
 * transporte (`ModoPartida`):
 *   · del área del título o de un CTP → el bloque entero «No aplica» (lo normal
 *     en el Libro TH; la ubicación del plan sigue armando la ruta);
 *   · de un establecimiento → (17) nombre, (18) N° de autorización de la ARFFS,
 *     (19) tipo, (20) dirección, departamento, provincia y distrito;
 *   · continúa un transporte → (17) una referencia, (18)(19) «No aplica», (20).
 * El formato no tiene RUC en este bloque: va como dato interno, con la
 * referencia, el encargado y el teléfono (libreta con papel «establecimiento»).
 *
 * 16-10-2026: con la cara del talonario — «DATOS DEL PUNTO DE PARTIDA» y los
 * rótulos y números del papel en (17)–(20d). El «De dónde sale la carga» va
 * primero porque decide qué casilleros aplican.
 */

import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { partidaImpresa, TIPOS_ESTABLECIMIENTO, type ModoPartida, type PartidaTraslado } from "@/lib/forestal/ctp-gtf-datos";
import { internosDePartida } from "@/lib/forestal/libreta";
import CtpParteBarra, { type ValorParte } from "./CtpParteBarra";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { Bloque } from "./ctp-guia-bloques";
import { SubBloque } from "./ctp-guia-piezas";
import { falta, libretaDe } from "./ctp-guia-partes-comun";
import { Field, I } from "./ctp-shared";
import type { PropsGuiaLoth } from "./LothGuiaBloques";
import { rotuloGtf2024 } from "./loth-guia-papel-piezas";

/** El número y el rótulo del papel 2024 del campo de clave interna `clave`. */
const n = (clave: string) => casilleroGtf2024(clave);
const R = (clave: string) => rotuloGtf2024(n(clave) ?? "");

const MODOS: { valor: ModoPartida; label: string }[] = [
  { valor: "inicio", label: "Del área del título o de un CTP — el bloque va «No aplica»" },
  { valor: "establecimiento", label: "De un establecimiento: depósito, centro de comercialización, acopio" },
  { valor: "continua", label: "Continúa un transporte" },
];

/** Lo que trae la libreta, en los casilleros de la partida. Sólo lo que vino. */
function aPartida(v: Partial<ValorParte>): Partial<PartidaTraslado> {
  const c: Partial<PartidaTraslado> = {};
  if (v.nombre !== undefined) c.nombre = v.nombre;
  /* El campo interno es el RUC: un DNI elegido de la libreta no se disfraza de RUC. */
  if (v.docNumero !== undefined) c.ruc = v.docTipo && v.docTipo !== "RUC" ? "" : v.docNumero;
  if (v.direccion !== undefined) c.direccion = v.direccion;
  if (v.departamento !== undefined) c.departamento = v.departamento;
  if (v.provincia !== undefined) c.provincia = v.provincia;
  if (v.distrito !== undefined) c.distrito = v.distrito;
  /* (18) y (19) del alta de un establecimiento nuevo (ADR-493). */
  if (v.autorizacion !== undefined) c.autorizacion = v.autorizacion;
  if (v.tipoEstablecimiento !== undefined) c.tipoEstablecimiento = v.tipoEstablecimiento;
  return c;
}

/** La línea de lo que sale en el papel, para no tener que imprimir para verlo. */
function lineaImpresa(p: PartidaTraslado): string {
  const pi = partidaImpresa(p);
  if (!pi) return "";
  if (pi.modo === "inicio") return "«No aplica» en todo el bloque: el producto inicia su transporte en el área del título.";
  const dir = [pi.direccion, pi.distrito, pi.provincia, pi.departamento].filter(Boolean).join(", ");
  return [`(17) ${pi.nombre || "—"}`, `(18) ${pi.autorizacion || "—"}`, `(19) ${pi.tipo || "—"}`, `(20) ${dir || "—"}`].join(" · ");
}

/** (17)–(20) De dónde sale la carga. */
export function BloquePartidaLoth({ g, directorio, onAnotarParte, onGuardarEnLibreta, faltan }: PropsGuiaLoth & { faltan: string[] }) {
  const p = g.datos.traslado.partida;
  const modo = p.modo;
  const inicio = modo === "inicio";
  const establecimiento = modo === "establecimiento";
  const valor: ValorParte = {
    nombre: p.nombre,
    docTipo: "RUC",
    docNumero: p.ruc,
    direccion: p.direccion,
    departamento: p.departamento,
    provincia: p.provincia,
    distrito: p.distrito,
    /* «Guardar en la libreta» se lleva también el (18) y los internos: sin
       esto, al volver a elegirla la partida quedaba con esos campos en blanco. */
    autorizacion: p.autorizacion,
    tipoEstablecimiento: p.tipoEstablecimiento,
    encargado: p.encargado,
    telefono: p.telefono,
    referencia: p.referencia,
  };

  return (
    <Bloque
      titulo="Punto de partida"
      tituloPapel="Datos del punto de partida"
      hint="Formato 2024, casilleros (17) a (20) (RDE D000014-2024-MIDAGRI-SERFOR-DE). Si la carga sale del área del título o de un CTP, el bloque va «No aplica»; si sale de un depósito o centro, van su nombre, su autorización, el tipo y la dirección."
      nota="El RUC, la referencia, el encargado y el teléfono son internos: quedan en la guía del sistema y en la libreta, no en el papel."
      faltan={faltan}
      acciones={
        <CtpParteBarra
          {...libretaDe(directorio, "establecimiento")}
          titulo="Punto de partida"
          valor={valor}
          onAplicar={(v) => g.setPartida(aPartida(v))}
          onElegir={(parte) => {
            onAnotarParte(parte);
            /* El (18) y el (19) salen de la ficha (ADR-493). */
            g.setPartida(internosDePartida(parte));
          }}
          onGuardar={onGuardarEnLibreta}
        />
      }
    >
      <Field span={12} label="De dónde sale la carga" hint="El instructivo del formato decide con esto qué casilleros aplican.">
        <select className={I} value={modo} onChange={(e) => g.setPartida({ modo: e.target.value as ModoPartida })}>
          {modo === "" && <option value="">Sin elegir (guía anterior al formato 2024)</option>}
          {MODOS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      {!inicio && modo !== "" && (
        <Field
          span={establecimiento ? 8 : 12}
          label={R("p17")}
          casillero={n("p17")}
          required
          hint={
            establecimiento
              ? "El nombre o la razón social del depósito o centro de comercialización del que sale la carga."
              : "Dónde continúa el transporte, p. ej. «Km 15 Carretera Central»."
          }
        >
          <input type="text" className={`${I} ${falta(p.nombre)}`} value={p.nombre} onChange={(e) => g.setPartida({ nombre: e.target.value })} />
        </Field>
      )}
      {establecimiento && (
        <>
          <Field span={4} label={R("p18")} casillero={n("p18")} hint="El N° que la ARFFS le dio al establecimiento.">
            <input type="text" className={`${I} font-mono`} value={p.autorizacion} onChange={(e) => g.setPartida({ autorizacion: e.target.value })} />
          </Field>
          <Field span={6} label={R("p19")} casillero={n("p19")} required>
            <select className={`${I} ${falta(p.tipoEstablecimiento)}`} value={p.tipoEstablecimiento} onChange={(e) => g.setPartida({ tipoEstablecimiento: e.target.value })}>
              <option value="">Elige el tipo</option>
              {TIPOS_ESTABLECIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field
        span={establecimiento ? 6 : 12}
        label={inicio ? "Lugar de salida (arma la ruta)" : R("p20a")}
        casillero={inicio ? undefined : n("p20a")}
        required={!inicio}
        hint={
          inicio
            ? "La parcela de corta y el sector del plan. En el bloque oficial va «No aplica»: este lugar sólo arma la ruta y el punto de partida de la hoja."
            : "La dirección, o UTM + zona + datum si no hay una exacta."
        }
      >
        <input type="text" className={`${I} ${inicio ? "" : falta(p.direccion)}`} value={p.direccion} onChange={(e) => g.setPartida({ direccion: e.target.value })} />
      </Field>
      <CtpUbigeoSelects
        span={4}
        marcarFaltas={Boolean(p.direccion.trim())}
        casilleros={inicio ? undefined : [n("p20b"), n("p20c"), n("p20d")]}
        valor={{ departamento: p.departamento, provincia: p.provincia, distrito: p.distrito }}
        onChange={(v) => g.setPartida(v)}
      />

      {!inicio && modo !== "" && (
        <SubBloque etiqueta="Internos · no salen en la guía">
          <Field span={4} label="RUC" hint="Del establecimiento o la empresa que despacha. El formato no lo pide en este bloque; si el dígito final no cuadra, el aviso sale arriba, junto a la libreta.">
            <input
              type="text"
              inputMode="numeric"
              className={`${I} font-mono tabular-nums`}
              value={p.ruc}
              onChange={(e) => g.setPartida({ ruc: e.target.value })}
            />
          </Field>
          <Field span={4} label="Encargado" hint="A quién llamar en el lugar.">
            <input type="text" className={I} value={p.encargado} onChange={(e) => g.setPartida({ encargado: e.target.value })} />
          </Field>
          <Field span={4} label="Teléfono">
            <input type="tel" className={I} value={p.telefono} onChange={(e) => g.setPartida({ telefono: e.target.value })} />
          </Field>
          <Field span={12} label="Referencia" hint="Cómo llegar: «frente al grifo», «a 200 m del puente».">
            <input type="text" className={I} value={p.referencia} onChange={(e) => g.setPartida({ referencia: e.target.value })} />
          </Field>
        </SubBloque>
      )}

      {modo !== "" && (
        <p className="text-xs text-[var(--text-secondary)] sm:col-span-12">
          Sale en la guía: <b className="text-[var(--text-primary)]">{lineaImpresa(p)}</b>
        </p>
      )}
    </Bloque>
  );
}
