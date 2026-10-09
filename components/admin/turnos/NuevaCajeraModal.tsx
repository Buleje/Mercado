"use client";

/** Alta de cajera desde el formulario de apertura: crea el usuario con rol Cajero y lo deja elegido. */
import { useState } from "react";
import { Loader2, User } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, ErrorVentana, INPUT_VENTANA, MarcoModalTurno } from "./MarcoModalTurno";

const ROTULO = "block text-sm font-semibold text-[var(--text-secondary)] mb-2";

type Props = {
  /** Vive en el módulo: su único oyente de Escape no cierra la ventana mientras se crea. */
  creando: boolean;
  setCreando: (v: boolean) => void;
  abierto: boolean;
  onCerrar: () => void;
  onCreada: (id: string) => void;
  crearCajera: (d: { name: string; username: string; password: string }) => Promise<string>;
};

export function NuevaCajeraModal({ abierto, creando, setCreando, onCerrar, onCreada, crearCajera }: Props) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => { if (!creando) onCerrar(); };

  const crear = async () => {
    const nombre = name.trim();
    const usuario = username.trim().toLowerCase();
    setError(null);
    if (nombre.length < 1) { setError("Falta el nombre"); return; }
    if (!/^[a-z0-9_.]{3,32}$/.test(usuario)) { setError("Usuario: 3-32 letras/números/puntos"); return; }
    if (password.length < 6) { setError("Contraseña mínimo 6 caracteres"); return; }
    setCreando(true);
    try {
      const id = await crearCajera({ name: nombre, username: usuario, password });
      onCreada(id);
      setName(""); setUsername(""); setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreando(false);
    }
  };

  return (
    <MarcoModalTurno
      abierto={abierto}
      claveMemoria="turnos-nueva-cajera"
      titulo="Nueva cajera"
      subtitulo="Queda con rol Cajero y lista para abrir turno"
      icono={User}
      onFondo={cerrar}
      onCerrar={cerrar}
      pie={<>
        <button type="button" onClick={cerrar} disabled={creando} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="button" onClick={crear} disabled={creando} className={BOTON_PRIMARIO}>
          {creando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <User className="h-5 w-5" aria-hidden />}
          Crear y elegir
        </button>
      </>}
    >
      <Field label="Nombre completo" labelClassName={ROTULO}>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="Ej. María Quispe"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- la ventana se abre para escribir el nombre de inmediato
          autoFocus
          className={INPUT_VENTANA}
        />
      </Field>
      <Field
        label={<span className="inline-flex items-center gap-1">Usuario (para iniciar sesión)
          <InfoTip title="Usuario" what="Solo letras, números, puntos y guion bajo; de 3 a 32 caracteres." example="maria.cajera" />
        </span>}
        labelClassName={ROTULO}
      >
        <input
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value.toLowerCase()); setError(null); }}
          placeholder="maria.cajera"
          autoComplete="off"
          className={INPUT_VENTANA}
        />
      </Field>
      <Field
        label={<span className="inline-flex items-center gap-1">Contraseña temporal
          <InfoTip title="Contraseña temporal" what="Mínimo 6 caracteres. Compártela con la cajera; ella la cambia luego en su perfil." />
        </span>}
        labelClassName={ROTULO}
      >
        <input
          type="text"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          className={`${INPUT_VENTANA} font-mono`}
        />
      </Field>
      <ErrorVentana mensaje={error} />
    </MarcoModalTurno>
  );
}
