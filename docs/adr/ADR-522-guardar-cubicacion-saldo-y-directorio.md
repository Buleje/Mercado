# ADR-522 — Guardar cubicación: el saldo de la persona, altas al Directorio y los datos del viaje que se repiten

- **Estado:** aceptado (2026-10-28). Sin schema de Prisma; cambia el contrato de la ficha de la cubicación (KV) y suma un papel al Directorio.
- **Pedido por:** Brandon (28-10): «cuál es la diferencia entre a quién se vende y cuenta de tercero… cuando se elige la cuenta que se vea el saldo y ahí mismo ver detalles de toda la cuenta… lugar, cubicado por, placas, chofer que todo se pueda crear y añadir al directorio».
- **Relacionados:** ADR-478/483 (subir la madera a la cuenta de una persona), ADR-484 (saldo de la cuenta forestal), ADR-412 §5 (Cuenta por persona), ADR-430 (cliente en el Directorio), ADR-493 (establecimiento).

## Contexto
Medido en Blas el 28-10: 3 de 3 cubicaciones guardadas tenían comprador, los 3 escritos a mano (0 atados al Directorio), y 0 subidas a una cuenta. Ninguna traía lugar, placa ni chofer. «¿A quién se le vende?» y «Cuenta de un tercero» se confundían: el primero sólo anota; la plata va únicamente por el segundo.

## Decisión
- **La diferencia se dice en la pantalla**: ⓘ junto a «¿A quién se le vende?» (sólo anotado, no mueve plata).
- **Saldo de HOY bajo «¿De quién es la madera?»** (`cuenta-persona-saldo.tsx`, compartido con el patio de trozas). Es un derivado de lo que ya publica `/cubicaciones-trozas/personas`: neto = `adelantos.neto` + saldo de la cuenta forestal. Positivo = te debe («en contra de la persona»), negativo = le debes («a su favor»). Sólo si el rol ve la plata (`adelantos !== undefined`).
- **«Si se valoriza así, su saldo queda»**: vista previa en «Cuenta de un tercero» (venta suma el importe, compra lo resta). El importe real lo sigue calculando el servidor al valorizar.
- **«Ver toda su cuenta»** abre la MISMA fila de Cuenta por persona (`FilaCuentaPersona`, `movimientosAbiertos`). Liquidar y unir libretas no se ofrecen ahí: su ventana (`ModalShell`) no se apila sobre otra; «Liquidar en Adelantos» abre `?tab=plata&vista=adelantos&accion=liquidar&persona=<clave>` en otra pestaña.
- **«Subir a la cuenta de <comprador>»**: `personaDelComprador` (ficha del Directorio o nombre único; el dueño de las piezas no cuenta) + `elegirComprador` en `useSubirMaderaACuenta` (sentido «venta»; si las personas no llegaron, se elige al llegar).
- **Altas sin salir del modal**: comprador escrito a mano → «Agregarlo al Directorio» (`CtpParteModal nombreInicial`). «+ Nuevo» también para lugar (papel `establecimiento`), cubicado por, transportista y placa (`CtpVehiculoModal aboveModals placaInicial`).
- **Papel nuevo `cubicador`** en `ROLES_PARTE` (roles = `String[]`: sin migración). No sale en la guía: todo interno en `reglasDe`.
- **Ficha: campo `transportista`** (opcional, texto; `CAMPOS_FICHA` + `fichaSchema` estricto + hoja CUB).
- **«Igual que la anterior» y «la placa trae al chofer»** (`lib/forestal/cubicacion-ficha-anterior.ts`): copian sólo donde está vacío, con «Deshacer». El transportista que falte sale del camión en el Directorio; si ese transportista también maneja, es el chofer.
- **«CCNN o de dónde salió la madera» lista sólo proveedores**: el alta marca «CCNN» por defecto y en Blas salían los compradores Lucho y WASACO como comunidad de origen.
- El resumen del modal abre en «Especie × tipo».

## Alternativas descartadas
- **Un modal de cuenta hecho aquí**: duplicaría la cuenta unificada; se reusa la fila de Adelantos.
- **Liquidar dentro del modal**: exigiría apilar `ModalShell` sobre `AdminModal aboveModals` en todo Adelantos; se deja el enlace que ya abre Liquidar.
- **Lugar y cubicador como texto libre de la cubicación** (sin Directorio): Brandon pidió elegirlos de una lista y crearlos una vez.

## Consecuencias
- Un servidor de producción con el código de julio ignora el papel `cubicador` y rechaza `transportista` en la ficha (el esquema es `strict`): desplegar juntos.
- Verificado en el navegador (QA `main`): saldo «Le debes S/ 4,479.60», proyección −4.479,60 + 2.053,33 = −2.426,28, copia de la anterior y placa → chofer y transportista. Presets `cubicador-guardar-cuenta` y `cubicador-guardar-viaje`.
