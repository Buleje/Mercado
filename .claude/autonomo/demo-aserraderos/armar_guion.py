import fitz, sys
src, out = sys.argv[1:3]
d = fitz.open(src); assert d.page_count == 3
p = d[2]
assert "cuenta del cliente" not in p.get_text().lower(), "ya estaba"
VERDE=(15/255,118/255,109/255)
y=[490]
def tb(t, font="helv", size=10, color=(0,0,0), alto=None, gap=8):
    h = alto or 40
    R = fitz.Rect(40, y[0], 553, y[0]+h)
    rc = p.insert_textbox(R, t, fontname=font, fontsize=size, color=color, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)
    y[0] += h - rc + gap
tb("Minuto extra (1 minuto) · La cuenta del cliente en 1 clic", "hebo", 13, VERDE, 24)
tb("Qué mostrar: en el negocio de prueba, Herramientas > Cubicador > Guardadas > Ver detalle > «Estado de cuenta», con una carga que tenga precio; tocar «Bajar PDF». Si no hay una carga así, mostrar el video «13 Estado de cuenta en 1 clic» (27 segundos) o la hoja de ejemplo «Maderera El Bosque» (carpeta de capturas). Nunca en el panel de Blas.", alto=64)
tb("Qué decir: «Termina de cubicar, guarda la carga y con un clic sale la cuenta de su comprador: cada tipo con su precio, lo que le adelantó, el saldo anterior y cuánto le debe, con el monto en letras. Desde el celular se la manda por WhatsApp.»", alto=52)
tb("Si preguntan «¿esto cobra o mueve la plata?»: «No, solo arma la hoja. Si su comprador ya tiene cuenta en el sistema, sus adelantos salen solos.»", alto=40)
tb("Para cerrar: «En la prueba sin costo le armamos la hoja de una carga suya real.»", "hebo", alto=28)
d.save(out, garbage=3, deflate=True); print("ok", y[0])
