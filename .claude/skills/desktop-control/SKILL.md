---
name: desktop-control
description: "Maneja el Windows de Brandon desde WSL: controles por nombre (UI Automation), WhatsApp Desktop, Chrome, admin sin UAC. Usar cuando haya que operar una app fuera del navegador, o Brandon diga «controla mi PC», «ábreme», «escribe por mí» o «ponlo en WhatsApp/Excel»."
model: sonnet
argument-hint: "[acción o app a controlar]"
allowed-tools: mcp__desktop-control, Bash, Read
---

# Desktop Control

> **Primero la 2.ª PC (Brandon 04-11):** clics y teclas en apps de Windows van por `pc2` (skill `pc2`, Chrome aparte en `127.0.0.1:9333`), no en su pantalla: en 3 días este MCP paró 16 veces porque Brandon usaba su mouse. Su pantalla solo si la app no abre en la 2.ª PC (apps de la Tienda, Office ya abierto allá), si `pc2 estado` falla o si él pide verlo.

MCP `desktop-control` (permisos en `.claude/settings.json` y modo bypass del usuario). Cargar con `ToolSearch select:mcp__desktop-control__<nombre>`.

## Qué vía para qué (medido 04-11-2026)

| Quiero… | Vía | Medido |
|---|---|---|
| Crear, mover, renombrar, borrar o buscar archivos y carpetas | Directo desde Ubuntu: `mkdir`/`mv`/`cp` en `/mnt/c/…`, `tirar` (papelera), `buscar` | milisegundos, sin ventana |
| Mostrarle algo a Brandon | `explorer.exe` / `cmd.exe /c start "" <archivo>` en SU pantalla | 1 clic menos para él |
| Excel / Word: llenar, fórmulas, guardar, PDF | `pc2 ahk` con `Excel()` (por dentro, sin teclado). Archivos nuevos sin Excel: openpyxl | 1,9 s, 2 de 2 (por teclado 6,3 s y 1 de 4) |
| Otras apps de Windows (Explorador, programas) | `pc2 ahk` con `Ventana()`, `EsperarFoco()`, `GuardarComo()`, `Cerrar()` | carpeta 1,1 s, renombrar 1,4 s |
| Páginas web | `chrome-sesion` (su Chrome) o Chrome de la 2.ª PC (`connectOverCDP 127.0.0.1:9333`) | 3 de 3, ~1,6 s por página |
| Su pantalla (solo si pide verlo o la app no abre en la 2.ª PC) | este MCP: por nombre → teclado → OCR → coordenadas | — |

- Excel en español (Windows es-ES): fórmulas `=REDONDEAR(A1;2)`, `=SUMA(B2:B3)`; en inglés da `#¿NOMBRE?` y con «,» la rechaza; decimales dentro de la fórmula con coma (`=B1*5,9`) y al tipear (`Num(12.5)`).
- Office 2019 muestra su asistente de activación (le quedan días de gracia): las ayudas lo cierran solas; activarlo es decisión de Brandon.
- Desde 04-11 este MCP: `keyboard_type` con `window` **trae esa ventana al frente** y confirma antes de tipear; `window_control activate` confirma que pasó al frente (si no, `AVISO`); `hwnd` viejo + `title` → la busca por título; `screenshot` con región que se sale → la recorta; `ui_find` sin resultado en Chrome → trae `consejo` (usar `chrome-sesion`).

## Orden de preferencia (en su pantalla)

1. **Por nombre (UI Automation)**: `ui_find`, `ui_act {window, role, name, action}`, `ui_wait` (no `wait` fijo), `ui_tree` si no sabés el nombre; flujo conocido en un `batch`. Medido: 31,5 s a la vieja, ~5 s por nombre.
2. **Teclado**: `keyboard_press`, `keyboard_combo`; `keyboard_type` con `window` (la trae al frente y confirma; si no puede, aborta).
3. **`ocr_screen`** solo si UIA no ve (apps Java, juegos, WhatsApp).
4. **Coordenadas**: último recurso, con `screenshot` antes y después.

## Scripts reales (`~/.claude/bin`)

- `wsp.sh "texto"`: turno de WhatsApp Desktop; tipea letra por letra, envía y espera la respuesta por OCR.
- `tipear.sh [--enviar] [--ventana X] "texto"`: tipea como persona en la ventana activa.
- `admin.sh 'comando'`: PowerShell como administrador, sin UAC.
- `modo-juego.sh entrar|salir`: apaga o relanza el dev y libera RAM cuando Brandon abre o cierra LoL (lo llama la tarea «Modo juego LoL»).
- `C:\Users\Usuario\.claude-tools\wsp-recorrer-fotos.ps1`: OCR de las fotos de un chat de WhatsApp.

## Sin herramientas `mcp__desktop-control__*`

El servidor cae cuando se actualiza Node de Windows: avisar a Brandon que corra `/mcp` y reconecte; mientras tanto, los scripts de arriba.

## WhatsApp: 3 reglas duras

1. **Tecla por tecla, nunca pegar de golpe**: `wsp.sh` o `tipear.sh` (`keyboard_type` pega por portapapeles pasados 25 caracteres).
2. **Avisar a Brandon que no toque teclado ni ratón** mientras se escribe (09-10: letras cruzadas, el cliente recibió basura).
3. **Foco revisado**: `wsp.sh` lo mira en cada letra y corta con `INTERRUMPIDO … Falto escribir` (retomar solo lo que falta); `tipear.sh` solo al empezar (`ABORTADO`).

## Nunca

Contraseñas (las tipea Brandon), mover el mouse si él usa la PC, acciones destructivas sin preguntar, captchas. Parada de emergencia: mouse en la esquina superior izquierda. Con API o localhost: curl o Playwright. Recetas, coordenadas y más scripts (`captura.sh`, `foto.sh`, `leer.sh`, `chrome-claude.sh`): `references/recetas.md`.
