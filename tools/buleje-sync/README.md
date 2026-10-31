# Sincronización de escritorio del Drive

Una carpeta en tu Windows que es el Drive del panel. Lo que hacés en la carpeta —crear,
editar, renombrar, mover, borrar— aparece en `/admin?tab=documentos`. Lo que suba al panel
o al celular baja a la carpeta.

Arquitectura y por qué se hizo así: [ADR-307](../../docs/adr/307-sync-carpeta-windows-drive.md).

## Instalación

1. **Generar la clave** (una vez, desde WSL o el servidor):

   ```bash
   node -r dotenv/config scripts/sync-crear-clave.mjs main "Sync de escritorio"
   ```

   Copiá el `sk_…` que imprime. No se vuelve a mostrar.

2. **Instalar en Windows** (PowerShell, sin permisos de administrador):

   ```powershell
   cd <carpeta del repo>\tools\buleje-sync
   .\instalar.ps1 -Clave "sk_..." -Api "https://tu-dominio.com"
   ```

   Eso crea `C:\Users\Usuario\Buleje-Drive`, deja un acceso directo en el Escritorio y
   registra una tarea que arranca sola al iniciar sesión.

Para probarlo a mano antes de instalarlo: copiá `buleje-sync.config.example.json` a
`buleje-sync.config.json`, completalo y corré `node agente.mjs`.

## Cómo se comporta

| Lo que hacés | Lo que pasa en el panel |
|---|---|
| Ponés un archivo en la carpeta | Se sube; las subcarpetas se crean solas |
| Editás un archivo | Entra como **versión nueva** — la anterior queda en el historial |
| Renombrás o movés | Cambia de nombre/carpeta, sin volver a subir el contenido |
| Borrás | Va a la **papelera** del Drive, recuperable |
| Alguien sube desde el panel o el celular | Baja a tu carpeta en el próximo ciclo |

**Conflictos.** Si el mismo archivo cambió de los dos lados, no se pisa nada: tu versión
queda en el archivo original y la del panel se guarda al lado como `nombre (del panel).ext`.

## Modo «solo subir» (PC → panel)

Para una carpeta que solo alimenta al Drive y nunca debe recibir nada de vuelta (ej. el
escritorio `BLAS SAC` → Archivo de Blas). Se activa con `"soloSubir": true` en el config.

```bash
node agente.mjs --config ~/.config/buleje-sync/blas-sac.json --ensayo   # no escribe nada
node agente.mjs --config ~/.config/buleje-sync/blas-sac.json            # servicio
```

- **Opciones de línea:** `--config <ruta>` (por defecto `buleje-sync.config.json` junto al
  agente), `--ensayo` (vuelta completa sin escribir panel, estado ni latido; imprime
  adoptados / a subir / distintos / excluidos por patrón / ignorados del panel),
  `--una-vez` (una vuelta y sale), `--subir-distintos` (sube como versión nueva los que
  tienen el mismo nombre que el panel pero otro tamaño).
- **Qué hace:** archivo nuevo → sube a su ruta; archivo cambiado desde lo sellado → versión
  nueva; lo que solo está en el panel → se ignora (no baja, no borra); movido o renombrado en
  la PC (mismo tamaño y hash, 1 a 1) → se MUEVE en el panel con `/api/sync/move` (sin
  repetidos; si hay dos candidatos iguales sin hash, se sube como nuevo); borrado en la PC →
  NO se toca el panel, solo deja de seguirse (el latido lo anota en `motivo`). Nunca
  escribe en la carpeta: el estado va a `"estado": "<ruta>"` (si falta, `.buleje-sync.json`
  dentro de la carpeta).
- **Primera vuelta sin estado:** misma ruta + nombre + tamaño que un documento del panel →
  se **adopta** (se sella sin subir ni leer el archivo). Mismo nombre y otro tamaño → queda
  como «distinto» y no se sube. Nunca crea copias.
- **`"excluir"`:** comodines `*` `**` `?`, sin distinguir mayúsculas. Sin `/` se prueba
  contra el nombre de cada archivo y carpeta; con `/` contra la ruta relativa
  (`Blas-Operaciones/**`). Por defecto en este modo: `desktop.ini`, `*.ini`, `Thumbs.db`,
  `~$*`, `*.tmp`, `*.lnk`.
- **Rendimiento:** el escaneo solo hace `stat` (tamaño + fecha); lee el contenido únicamente
  de lo que cambió. Para `/mnt/c` usar `"intervaloSegundos": 120`.
- **Timeouts:** cada llamada al panel corta a los 20 s (120 s al mover contenido). En WSL
  mirrored un puerto cerrado de 127.0.0.1 cuelga sin error.

## Detalles que conviene saber

- **El estado vive en `.buleje-sync.json`**, dentro de la carpeta. Recuerda qué archivo es
  qué documento. Si lo borrás, el agente se reconstruye por las rutas, pero puede subir
  duplicados de lo que haya cambiado mientras tanto. No lo borres por las dudas.
- **Nombres que Windows no acepta.** Un documento del panel puede llamarse
  `Reunión 10:30.pdf`; en disco se guarda como `Reunión 10_30.pdf` y el agente recuerda la
  equivalencia. Espacios y guiones no se tocan.
- **Archivos abiertos.** Si Excel tiene el archivo tomado, se saltea y se reintenta en el
  ciclo siguiente en vez de romper la corrida.
- **Se ignoran** `desktop.ini`, `Thumbs.db`, `.DS_Store`, `.git`, `node_modules` y la
  papelera de Windows.
- **La clave da acceso de escritura al Drive** de ese tenant. `buleje-sync.config.json`
  está en `.gitignore` a propósito. Si se filtra, revocala y generá otra.
- **Un solo equipo por ahora.** Dos agentes sobre la misma carpeta se pisarían.

## Apagarlo

```powershell
Unregister-ScheduledTask -TaskName "Buleje - Sincronizacion del Drive" -Confirm:$false
```

Los archivos quedan donde están; solo deja de sincronizar.
