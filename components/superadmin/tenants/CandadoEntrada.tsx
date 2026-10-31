"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft } from "@buleje/design-system/icons";
import { CONTRASENA_MAX, PIN_MAX, PIN_MIN, motivoSecretoInvalido, type TipoCandado } from "@/lib/superadmin/candado-reglas";
import { CandadoPatron } from "@/components/superadmin/tenants/CandadoPatron";

/**
 * Dónde se escribe el secreto del candado, según su tipo: teclado de PIN, patrón
 * 3×3 o campo de contraseña. `onListo` recibe el secreto ya armado. Para usarlo
 * dos veces seguidas (elegir y repetir) el padre lo remonta con otra `key`.
 */
export function EntradaSecreto({
  tipo,
  etiqueta,
  textoBoton,
  ocupado,
  validarReglas = false,
  onListo,
}: {
  tipo: TipoCandado;
  etiqueta: string;
  textoBoton: string;
  ocupado: boolean;
  /** Al elegir un candado nuevo: avisar si no cumple las reglas antes de mandar. */
  validarReglas?: boolean;
  onListo: (secreto: string) => void;
}) {
  if (tipo === "patron") return <CandadoPatron etiqueta={etiqueta} ocupado={ocupado} onListo={onListo} />;
  if (tipo === "pin") return <TecladoPin etiqueta={etiqueta} textoBoton={textoBoton} ocupado={ocupado} validarReglas={validarReglas} onListo={onListo} />;
  return <CampoContrasena etiqueta={etiqueta} textoBoton={textoBoton} ocupado={ocupado} validarReglas={validarReglas} onListo={onListo} />;
}

interface PropsCampo {
  etiqueta: string;
  textoBoton: string;
  ocupado: boolean;
  validarReglas: boolean;
  onListo: (secreto: string) => void;
}

const BOTON_PRINCIPAL =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-50";

function TecladoPin({ etiqueta, textoBoton, ocupado, validarReglas, onListo }: PropsCampo) {
  const [pin, setPin] = useState("");
  const motivo = validarReglas && pin.length > 0 ? motivoSecretoInvalido("pin", pin) : null;
  const listo = pin.length >= PIN_MIN && !motivo;
  const tocar = (d: string) => setPin((p) => (p.length < PIN_MAX ? p + d : p));
  const enviar = () => {
    if (listo && !ocupado) onListo(pin);
  };
  return (
    <form
      className="flex flex-col items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <label className="sr-only" htmlFor="candado-pin">
        {etiqueta}
      </label>
      {/* El campo también acepta el teclado físico (números + Enter). */}
      <input
        id="candado-pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={PIN_MAX}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX))}
        placeholder={"•".repeat(PIN_MIN)}
        className="h-12 w-48 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-center font-mono text-2xl tracking-[var(--ls-wider)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado del PIN">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <TeclaPin key={d} onClick={() => tocar(d)}>
            {d}
          </TeclaPin>
        ))}
        <TeclaPin onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Borrar el último número">
          <ArrowLeft className="h-4 w-4" />
        </TeclaPin>
        <TeclaPin onClick={() => tocar("0")}>0</TeclaPin>
        <TeclaPin onClick={() => setPin("")} aria-label="Borrar todo">
          C
        </TeclaPin>
      </div>
      {motivo && pin.length >= PIN_MIN && <p className="text-xs text-[var(--data-error-600)]">{motivo}</p>}
      <button type="submit" disabled={!listo || ocupado} className={BOTON_PRINCIPAL}>
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} {textoBoton}
      </button>
    </form>
  );
}

function TeclaPin({ children, onClick, ...resto }: { children: React.ReactNode; onClick: () => void; "aria-label"?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...resto}
      className="flex h-12 w-16 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-lg font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95"
    >
      {children}
    </button>
  );
}

function CampoContrasena({ etiqueta, textoBoton, ocupado, validarReglas, onListo }: PropsCampo) {
  const [valor, setValor] = useState("");
  const [ver, setVer] = useState(false);
  const motivo = validarReglas && valor.length > 0 ? motivoSecretoInvalido("contrasena", valor) : null;
  const listo = valor.length > 0 && !motivo;
  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo && !ocupado) onListo(valor);
      }}
    >
      <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="candado-contrasena">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id="candado-contrasena"
          type={ver ? "text" : "password"}
          autoComplete={validarReglas ? "new-password" : "current-password"}
          autoFocus
          maxLength={CONTRASENA_MAX}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar" : "Mostrar"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-tertiary)] hover:text-[var(--accent)]"
        >
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {motivo && <p className="text-xs text-[var(--data-error-600)]">{motivo}</p>}
      <button type="submit" disabled={!listo || ocupado} className={BOTON_PRINCIPAL}>
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} {textoBoton}
      </button>
    </form>
  );
}
