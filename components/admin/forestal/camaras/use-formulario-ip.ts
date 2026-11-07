"use client";

/**
 * El estado del formulario de conexión directa por IP (ADR-421): lo tipeado,
 * la prueba en curso y lo que contestó el aparato. Lo usa `ConectarCamaraModal`
 * para el cuerpo (`FormularioConexionIp`) y para el pie (los botones).
 */

import { useState } from "react";
import type { CamaraConConexion, DatosConexion, ResultadoConexion } from "./conexion-camara";

export function useFormularioIp(
  camara: CamaraConConexion,
  onConectar: (datos: DatosConexion) => Promise<ResultadoConexion>,
  onDesconectar: () => Promise<void>,
  onCerrar: () => void,
) {
  /* El modal se monta por cámara (`key`), así que el estado inicial se lee una
     sola vez: recargar la lista mientras se escribe no pisa lo tipeado. */
  const previa = camara.conexion ?? null;
  const [host, setHost] = useState(previa?.host ?? "");
  const [puerto, setPuerto] = useState(String(previa?.puerto ?? 80));
  const [usuario, setUsuario] = useState(previa?.usuario ?? "admin");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [https, setHttps] = useState(previa?.https ?? false);
  const [canal, setCanal] = useState(String(previa?.canal ?? 1));
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConexion | null>(null);

  const listo = host.trim().length > 0 && usuario.trim().length > 0 && clave.length > 0;

  const probar = async () => {
    if (!listo || probando) return;
    setProbando(true);
    setResultado(null);
    try {
      setResultado(
        await onConectar({
          host: host.trim(),
          puerto: Number(puerto) || 80,
          usuario: usuario.trim(),
          clave,
          https,
          canal: Number(canal) || 1,
        }),
      );
    } finally {
      setProbando(false);
    }
  };

  const desconectar = async () => {
    setProbando(true);
    try {
      await onDesconectar();
      onCerrar();
    } finally {
      setProbando(false);
    }
  };

  return {
    previa,
    host, setHost,
    puerto, setPuerto,
    usuario, setUsuario,
    clave, setClave,
    verClave, setVerClave,
    https, setHttps,
    canal, setCanal,
    probando,
    resultado,
    listo,
    probar,
    desconectar,
  };
}

export type FormularioIp = ReturnType<typeof useFormularioIp>;
