import fitz, sys
src, img1, img2, img3, out = sys.argv[1:6]
d = fitz.open(src)
assert d.page_count == 4, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE=(15/255,118/255,109/255); GRIS=(0x4b/255,0x54/255,0x62/255); NEGRO=(0,0,0)
BORDE=(0.85,0.87,0.86); TINTE=(0.902,0.957,0.945); RAYA=(0.898,0.906,0.922); CAJA=(0.059,0.463,0.431)
def tb(r, t, font="helv", size=10, color=NEGRO, align=0):
    R0=fitz.Rect(*r); R0.y1+=6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)
tb((40,38,555,60), "8. La cuenta del cliente en 1 clic", "hebo", 13, VERDE)
tb((40,64,555,110), "Guarda la cubicación de la carga y un botón arma la hoja para su comprador: la madera por tipo y precio, lo que ya le dio, el saldo anterior y lo que le debe, con el monto en letras. La baja en PDF o la manda por WhatsApp.")
cajas = [(40,110,165,390),(177,110,302,390),(314,110,555,390)]
pies = ["1. La carga por tipo y precio","2. Lo que dio y lo que debe","3. La hoja que recibe su cliente"]
for r,img,pie in zip(cajas,[img1,img2,img3],pies):
    R = fitz.Rect(*r)
    pm=fitz.Pixmap(img); asp=pm.height/pm.width
    if asp < R.height/R.width:
        hh=R.width*asp; R=fitz.Rect(R.x0, R.y0+(R.height-hh)/2, R.x1, R.y0+(R.height+hh)/2)
    p.insert_image(R+(1,1,-1,-1), filename=img, keep_proportion=True)
    p.draw_rect(R, color=BORDE, width=0.8)
    tb((r[0],394,r[2],408), pie, "heit", 8, GRIS, align=1)
tb((51,422,400,442), "Lo que hace", "hebo", 13, VERDE)
filas = [
 ("Cuenta sola", "Pies tablares e importe por especie y tipo, desde la cubicación guardada. Sin calculadora."),
 ("Trae su cuenta", "Si el comprador ya tiene cuenta en Buleje, sus adelantos y su saldo anterior salen solos."),
 ("Una hoja clara", "Carga, adelantos, saldo anterior y total en letras, en una hoja con el nombre de su negocio."),
 ("Por WhatsApp", "Desde el celular, el PDF sale por WhatsApp con un toque. No crea cobros por su cuenta."),
]
y=446; h=37
p.draw_rect(fitz.Rect(51,y,159,y+h*len(filas)), color=None, fill=TINTE)
for i,(a,b) in enumerate(filas):
    yy=y+i*h
    if i: p.draw_line((51,yy),(544,yy), color=RAYA, width=0.8)
    tb((57,yy+6,158,yy+h), a, "hebo", 10)
    tb((167,yy+6,544,yy+h), b)
yb=y+h*len(filas)+14
p.draw_rect(fitz.Rect(51,yb,544,yb+110), color=CAJA, width=1.2)
tb((60,yb+8,540,yb+28), "Sin pleitos por las cuentas", "hebo", 13, VERDE)
tb((60,yb+30,540,yb+62), "Su comprador ve cada tipo con su precio y cada adelanto descontado. Lo que antes se sumaba a mano en un cuaderno sale en segundos. Incluido en los S/ 349 al mes.")
tb((60,yb+66,540,yb+82), "Prueba sin costo: le armamos la hoja de una carga suya real.", "hebo")
tb((60,yb+84,540,yb+100), "Pida la hoja de ejemplo o el video de 27 segundos por WhatsApp: 917 013 738.", "hebo")
tb((40,740,400,752), "Pantallas y hoja con datos de prueba.", "heit", 8, GRIS)
tb((51,805,300,817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb((480,805,544,817), "Página 5", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count)
