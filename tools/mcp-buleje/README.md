# MCP «buleje»

## Qué es

Es un conector que deja que Claude use tu panel (la bodega y Blas) desde cualquier conversación. Claude entra como el usuario «claude» de cada negocio, con su propio rol y su clave, y hace lo que harías tú en el navegador:

- **mirar**: ventas, caja, adelantos, saldo CTP, GTF, tareas;
- **anotar** cosas normales: tareas, notas, borradores;
- **cosas de plata, stock o borrar**: solo cuando tú apruebas en una ventana de tu PC.

Funciona con el panel de esta PC (`http://localhost:3000`). Si el panel está apagado, Claude te lo dice y puede prenderlo con `panel_prender`.

## Instalar (una sola vez)

```bash
npm --prefix tools/mcp-buleje ci                 # instala lo que necesita
node tools/mcp-buleje/configurar.mjs             # te pide usuario y clave de cada negocio (no se ven al escribir)
node tools/mcp-buleje/configurar.mjs --probar    # entra una vez en cada negocio para ver que la clave sirve
claude mcp add buleje --scope user -- /home/usuario/.local/bin/node-default /home/usuario/proyectos/Mercado/tools/mcp-buleje/servidor.mjs
```

Las claves quedan en `~/.config/buleje-mcp/credenciales.json`, que solo tú puedes leer y que no entra al repo.

## Quitarlo

```bash
claude mcp remove buleje --scope user
```

Si además quieres borrar las claves guardadas: `rm ~/.config/buleje-mcp/credenciales.json`.

## Qué pide tu OK

Antes de hacer algo con **plata, stock, borrar o enviar** (cobrar, dar un adelanto, registrar una venta o una compra, mover caja, anular, mandar un correo o WhatsApp), Claude solo **propone**. Entonces:

1. En tu pantalla se abre una ventana «Claude pide tu OK», siempre encima de todo, con el negocio en letras grandes y lo que va a hacer con los montos.
2. Solo se hace si **tú** aprietas «Sí, hazlo» **con el mouse**. Ese botón se activa a los 2 segundos para evitar un clic por accidente. Enter no lo aprieta.
3. «No», Esc o cerrar la ventana cancelan. Si no contestas, la ventana se cierra sola a los **120 segundos** y no se hace nada.
4. Cada propuesta sirve **una sola vez**, solo para ese negocio y solo para ese resumen. Si Claude cambia un número, la propuesta deja de servir y tiene que proponer de nuevo.

Claude **nunca** contesta esa ventana por su cuenta: no la toca con el mouse ni con el teclado, ni le pide a otro agente que lo haga.

## Modo a seco (prueba sin tocar nada)

Viene **prendido**. Mientras esté prendido, todo lo que escribiría solo muestra el pedido que mandaría: no abre la ventana y no manda nada al panel.

- Se apaga con `"seco": false` en `credenciales.json`. Es la única forma de apagarlo.
- Se prende con `BULEJE_MCP_SECO=1` o con `seco: true` en una llamada.

## Dónde mirar qué hizo

- Cada llamada queda anotada en `~/.local/state/buleje-mcp/llamadas-AAAA-MM.jsonl`, con las claves y los tokens tapados.
- Dentro de Claude, el recurso `buleje://registro/hoy` muestra las llamadas de hoy y `buleje://pendientes` lo que está esperando tu OK.
