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
