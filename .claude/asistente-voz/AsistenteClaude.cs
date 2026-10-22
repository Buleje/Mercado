// Asistente de voz para Claude Code, estilo Siri (Brandon, 22-10-2026).
//
// Escucha siempre con el reconocedor de Windows (es-ES, sin internet, sólo frases fijas) y usa
// Handy para el dictado de verdad (mejor oído que el de Windows):
//   «Hola asistente» o «Hola Nova» → enfoca la ventana de Claude y Handy empieza a dictar
//   (pensar y hablar sin apuro: el dictado sigue abierto mientras tanto)
//   «Enviar»        → Handy para, escribe el texto en el chat (sin la palabra «enviar») y Enter:
//                     Claude recibe la consulta y Karla lee la respuesta (hook Stop)
//   «Listo»         → para y lo deja escrito; después «enviar», «sigue», «borra» o «cancela»
//   «Cancela» mientras dicta lo descarta · 1 min callado después de hablar = «listo»
//   «Asistente envía» manda lo que ya esté escrito · «Asistente descansa» / «Asistente despierta» pausan
//
// C# 5 a propósito: lo compila el csc.exe que ya trae Windows (.NET Framework 4), sin instalar nada.
// Compilar, instalar y arrancar: .claude/asistente-voz/instalar.sh · Registro: %LOCALAPPDATA%\AsistenteClaude\registro.txt
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Media;
using System.Runtime.InteropServices;
using System.Speech.Recognition;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class AsistenteClaude
{
    enum Estado { Esperando, Dictando, Escribiendo, Confirmando, Pausado }

    // 22-10 Brandon eligió «Hola asistente» y «Hola Nova» («Oye Clod» le sonaba raro). Medido con 2 voces:
    // 0,52-0,64 y ninguna de 12 frases trampa los despierta. Otros nombres se agregan acá, escritos como
    // se pronuncian (también medidos: «oye yarvis» 0,56-0,58, «okey asistente» 0,51-0,59, «oye selva» 0,45-0,54).
    static readonly string[] Despertar = { "hola asistente", "oye asistente", "hola nova", "oye nova" };
    static readonly string[] EnviarYa = { "asistente envía", "asistente enviar", "asistente manda" };
    static readonly string[] Enviar = { "enviar", "envía", "envíalo", "envíala", "manda", "mándalo" };
    static readonly string[] Seguir = { "sigue", "agrega", "continúa", "sigue dictando" };
    static readonly string[] Borrar = { "borra", "borrar", "bórralo", "borra todo" };
    static readonly string[] Cancelar = { "cancela", "cancelar", "déjalo" };
    static readonly string[] Descansar = { "asistente descansa", "asistente pausa" };
    static readonly string[] Reanudar = { "asistente despierta", "asistente vuelve" };
    static readonly string[] Terminar = { "listo", "lista", "ya está", "termina", "terminé" };  // «lista»: así oyó «listo» en voz de mujer

    // La orden que cerró el dictado también la oyó Handy: se borra del final antes de enviar.
    static readonly Regex FinOrdenEnviar = new Regex(@"[\s,.;:¡!]*\b(enviar|env[ií]a|env[ií]alo|env[ií]ala|manda|m[aá]ndalo)\s*[.!]?\s*$", RegexOptions.IgnoreCase);
    static readonly Regex FinOrdenListo = new Regex(@"[\s,.;:¡!]*\b(list[oa]|ya est[aá]|termina|termin[eé])\s*[.!]?\s*$", RegexOptions.IgnoreCase);
    // Cerrado por silencio: sólo un «enviar» claro al final cuenta como orden de enviar.
    static readonly Regex FinConEnviar = new Regex(@"[\s,.;:]*\b(enviar|envía|envíalo|envíala)\s*[.!]?\s*$", RegexOptions.IgnoreCase);

    const float ConfianzaDespertar = 0.40f;
    const float ConfianzaComando = 0.35f;
    // 22-10: con 1,6 s de pausa cortaba mientras Brandon pensaba (y su micrófono le llega con nivel
    // 3-5 de 100, así que el silencio no se puede medir por volumen): ahora cierra él con la voz.
    const int IgnorarAlEmpezarMs = 900;       // el sonido de inicio de Handy no cuenta como voz
    const int SinVozMaxMs = 60000;            // lo despertó y nunca habló → se descarta
    const int PausaLargaMs = 60000;           // habló y después 1 min callado → queda escrito
    const int DictadoMaxMs = 300000;
    const int EsperarTextoMaxMs = 20000;
    const int ConfirmarMaxMs = 60000;         // ventana para decir «enviar» después de «listo»

    enum Orden { Ninguna, Enviar, Listo }

    static readonly object candado = new object();
    static readonly object candadoRegistro = new object();
    static Estado estado = Estado.Esperando;
    static SpeechRecognitionEngine motor;
    static NotifyIcon icono;
    static System.Threading.Timer reloj;
    static IntPtr ventanaClaude = IntPtr.Zero;

    static readonly string carpeta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AsistenteClaude");
    static readonly string registro = Path.Combine(carpeta, "registro.txt");
    static readonly string handyExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Handy", "handy.exe");
    static readonly string historialHandy = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.pais.handy", "history.db");

    static DateTime marca, ultimaVoz, listoParaEnviar;
    static int letrasEscritas;
    static bool haHablado;
    static Orden ordenAlTerminar;
    static long idHandyAntes;
    static string textoUltimo = "";

    [STAThread]
    static void Main(string[] args)
    {
        Directory.CreateDirectory(carpeta);
        if (args.Length >= 2 && args[0] == "--probar")
        {
            if (args.Length == 3) PesoLibre = float.Parse(args[2], System.Globalization.CultureInfo.InvariantCulture);
            Probar(args[1]);
            return;
        }
        bool soyElPrimero;
        using (new Mutex(true, "AsistenteClaude-Brandon", out soyElPrimero))
        {
            if (!soyElPrimero) return;
            try { Arrancar(); }
            catch (Exception ex) { Anotar("ERROR al arrancar: " + ex.Message); return; }
            Application.Run();
        }
    }

    static RecognizerInfo ReconocedorEspanol()
    {
        return SpeechRecognitionEngine.InstalledRecognizers().FirstOrDefault(r => r.Culture.Name.StartsWith("es"));
    }

    static void Arrancar()
    {
        RecognizerInfo info = ReconocedorEspanol();
        if (info == null) throw new InvalidOperationException("Windows no tiene reconocedor de voz en español");
        motor = new SpeechRecognitionEngine(info);
        CargarGramaticas(motor, info);
        motor.SetInputToDefaultAudioDevice();
        motor.SpeechRecognized += AlReconocer;
        motor.SpeechDetected += AlDetectarVoz;
        motor.SpeechRecognitionRejected += AlRechazar;
        motor.RecognizeAsync(RecognizeMode.Multiple);

        icono = new NotifyIcon { Icon = SystemIcons.Information, Visible = true };
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("Pausar / reanudar", null, delegate { lock (candado) { if (estado == Estado.Pausado) Volver("reanudado desde el menú"); else Pausar(); } });
        menu.Items.Add("Ver registro", null, delegate { Process.Start("notepad.exe", registro); });
        menu.Items.Add("Salir", null, delegate { icono.Visible = false; Application.Exit(); });
        icono.ContextMenuStrip = menu;
        Icono("Claude: di «Hola asistente»");
        reloj = new System.Threading.Timer(delegate { Tic(); }, null, 100, 100);
        Anotar("listo: escuchando con " + info.Name + " (" + info.Culture.Name + ")");
    }

    static void CargarGramaticas(SpeechRecognitionEngine m, RecognizerInfo info)
    {
        Agregar(m, info, "despertar", Despertar);
        Agregar(m, info, "enviarYa", EnviarYa);
        Agregar(m, info, "enviar", Enviar);
        Agregar(m, info, "seguir", Seguir);
        Agregar(m, info, "borrar", Borrar);
        Agregar(m, info, "cancelar", Cancelar);
        Agregar(m, info, "descansar", Descansar);
        Agregar(m, info, "reanudar", Reanudar);
        Agregar(m, info, "terminar", Terminar);
        // Dictado libre como «todo lo demás»: «Oye, cobra la deuda» cae acá en vez de despertar.
        Grammar libre = new DictationGrammar();
        libre.Name = "libre";
        libre.Weight = PesoLibre;
        m.LoadGrammar(libre);
    }

    // Medido 22-10 con 13 audios: a 0,9 las 7 órdenes salen (0,50-0,59) y las 6 frases parecidas
    // («Oye, Carlos, ven», «Hola, ¿cómo estás?»…) caen en libre; a 0,5 despertaban «Hola» y «Oye, cobra».
    static float PesoLibre = 0.9f;

    static void Agregar(SpeechRecognitionEngine m, RecognizerInfo info, string nombre, string[] frases)
    {
        GrammarBuilder gb = new GrammarBuilder(new Choices(frases));
        gb.Culture = info.Culture;
        Grammar g = new Grammar(gb);
        g.Name = nombre;
        m.LoadGrammar(g);
    }

    static void AlReconocer(object s, SpeechRecognizedEventArgs e)
    {
        string g = e.Result.Grammar.Name;
        lock (candado)
        {
            // Conversación de la casa o la consulta misma: no se usa ni se anota, sólo marca que hay voz.
            if (g == "libre") { MarcarVoz(); return; }
            float c = e.Result.Confidence;
            bool despertar = g == "despertar" && c >= ConfianzaDespertar;
            bool seguro = c >= ConfianzaComando;
            Anotar(string.Format("oí «{0}» ({1}, {2:0.00}) estando {3}", e.Result.Text, g, c, estado));
            switch (estado)
            {
                case Estado.Esperando:
                    if (despertar) EmpezarDictado(true);
                    else if (g == "enviarYa" && seguro) EnviarAhora("«asistente envía»");
                    else if (g == "descansar" && seguro) Pausar();
                    break;
                case Estado.Dictando:
                    if (g == "enviar" && seguro) TerminarDictado(Orden.Enviar);
                    else if (g == "terminar" && seguro) TerminarDictado(Orden.Listo);
                    else if (g == "cancelar" && seguro) { Handy("--cancel"); Sonar("Speech Sleep.wav"); Volver("dictado cancelado"); }
                    else MarcarVoz();
                    break;
                case Estado.Escribiendo:
                    if (g == "enviar" && seguro) ordenAlTerminar = Orden.Enviar;
                    break;
                case Estado.Confirmando:
                    if (g == "enviar" && seguro) EnviarAhora("dijo enviar");
                    else if ((g == "seguir" && seguro) || despertar) EmpezarDictado(false);
                    else if (g == "borrar" && seguro) BorrarDictado();
                    else if (g == "cancelar" && seguro) { Sonar("Speech Sleep.wav"); Volver("cancelado: queda escrito"); }
                    break;
                case Estado.Pausado:
                    if (g == "reanudar" && seguro) { Sonar("Speech On.wav"); Volver("reanudado"); }
                    break;
            }
        }
    }

    static void AlDetectarVoz(object s, SpeechDetectedEventArgs e)
    {
        lock (candado) { MarcarVoz(); }
    }

    static void AlRechazar(object s, SpeechRecognitionRejectedEventArgs e)
    {
        lock (candado) { MarcarVoz(); }
    }

    /// <summary>Mientras dicta, cualquier voz (empieza o termina una frase) reinicia la cuenta del silencio.</summary>
    static void MarcarVoz()
    {
        if (estado != Estado.Dictando || (DateTime.Now - marca).TotalMilliseconds < IgnorarAlEmpezarMs) return;
        haHablado = true;
        ultimaVoz = DateTime.Now;
    }

    static void Tic()
    {
        lock (candado)
        {
            DateTime ahora = DateTime.Now;
            double ms = (ahora - marca).TotalMilliseconds;
            switch (estado)
            {
                case Estado.Dictando:
                    if (!haHablado && ms >= SinVozMaxMs) { Handy("--cancel"); Sonar("Speech Sleep.wav"); Volver("no te oí en 1 minuto"); }
                    else if (haHablado && (ahora - ultimaVoz).TotalMilliseconds >= PausaLargaMs) TerminarDictado(Orden.Ninguna);
                    else if (ms >= DictadoMaxMs) TerminarDictado(Orden.Ninguna);
                    break;
                case Estado.Escribiendo:
                    if (listoParaEnviar == DateTime.MinValue)
                    {
                        // Handy guarda cada dictado en su historial: fila nueva = el texto ya salió.
                        string texto;
                        long id = LeerUltimoDeHandy(out texto);
                        if (id > idHandyAntes && texto != null)
                        {
                            textoUltimo = texto;
                            letrasEscritas += texto.Length;
                            listoParaEnviar = ahora.AddMilliseconds(Math.Min(400 + texto.Length * 12, 8000));
                            Anotar("Handy escribió " + texto.Length + " letras");
                        }
                        else if (ms >= EsperarTextoMaxMs) { Sonar("Speech Misrecognition.wav"); Volver("Handy no devolvió texto"); }
                    }
                    else if (ahora >= listoParaEnviar) TextoEscrito();
                    break;
                case Estado.Confirmando:
                    if (ms >= ConfirmarMaxMs) Volver("no dijo enviar: queda escrito");
                    break;
            }
        }
    }

    static void EmpezarDictado(bool nuevo)
    {
        if (!EnfocarClaude()) { Sonar("Speech Misrecognition.wav"); Anotar("no encontré la ventana de Claude"); return; }
        if (nuevo) letrasEscritas = 0;
        Sonar("Speech On.wav");
        string nada;
        idHandyAntes = LeerUltimoDeHandy(out nada);
        Handy("--toggle-transcription");
        estado = Estado.Dictando;
        marca = DateTime.Now;
        ultimaVoz = marca;
        haHablado = false;
        ordenAlTerminar = Orden.Ninguna;
        Icono("Te escucho: al terminar di «enviar» o «listo»");
        Anotar("→ dictando");
    }

    static void TerminarDictado(Orden orden)
    {
        Anotar(string.Format("fin del dictado ({0}, {1:0} s)", orden, (DateTime.Now - marca).TotalSeconds));
        EnfocarClaude();
        Handy("--toggle-transcription");
        estado = Estado.Escribiendo;
        marca = DateTime.Now;
        listoParaEnviar = DateTime.MinValue;
        ordenAlTerminar = orden;
        Icono("Escribiendo…");
    }

    static void TextoEscrito()
    {
        Regex fin = ordenAlTerminar == Orden.Enviar ? FinOrdenEnviar : ordenAlTerminar == Orden.Listo ? FinOrdenListo : FinConEnviar;
        Match m = fin.Match(textoUltimo);
        if (m.Success && m.Length > 0 && EnfocarClaude())
        {
            Teclas(VK_BACK, m.Length);
            letrasEscritas -= m.Length;
        }
        if (ordenAlTerminar == Orden.Enviar || (ordenAlTerminar == Orden.Ninguna && m.Success))
        {
            EnviarAhora("dijo enviar");
            return;
        }
        estado = Estado.Confirmando;
        marca = DateTime.Now;
        Icono("Di «enviar», «sigue», «borra» o «cancela»");
    }

    static void EnviarAhora(string motivo)
    {
        if (!EnfocarClaude()) { Sonar("Speech Misrecognition.wav"); Volver("no encontré la ventana de Claude para enviar"); return; }
        Tecla(VK_RETURN);
        Sonar("Speech Off.wav");
        Volver("enviado (" + motivo + ")");
    }

    static void BorrarDictado()
    {
        if (letrasEscritas > 0 && EnfocarClaude()) Teclas(VK_BACK, letrasEscritas);
        Anotar("borré " + letrasEscritas + " letras");
        letrasEscritas = 0;
        Sonar("Speech Sleep.wav");
        marca = DateTime.Now;
        Icono("Borrado: di «sigue» para dictar de nuevo");
    }

    static void Pausar()
    {
        estado = Estado.Pausado;
        Sonar("Speech Sleep.wav");
        Icono("En pausa: di «Asistente despierta»");
        Anotar("→ en pausa");
    }

    static void Volver(string motivo)
    {
        estado = Estado.Esperando;
        marca = DateTime.Now;
        listoParaEnviar = DateTime.MinValue;
        ordenAlTerminar = Orden.Ninguna;
        Icono("Claude: di «Hola asistente»");
        Anotar("→ esperando: " + motivo);
    }

    // ---- Handy (dictado) -------------------------------------------------------------------

    static void Handy(string orden)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(handyExe, orden);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process.Start(psi);
        }
        catch (Exception ex) { Anotar("no pude hablar con Handy: " + ex.Message); }
    }

    [DllImport("winsqlite3.dll")] static extern int sqlite3_open_v2(byte[] archivo, out IntPtr db, int flags, IntPtr vfs);
    [DllImport("winsqlite3.dll", CharSet = CharSet.Unicode)] static extern int sqlite3_prepare16_v2(IntPtr db, string sql, int bytes, out IntPtr stmt, IntPtr resto);
    [DllImport("winsqlite3.dll")] static extern int sqlite3_step(IntPtr stmt);
    [DllImport("winsqlite3.dll")] static extern long sqlite3_column_int64(IntPtr stmt, int columna);
    [DllImport("winsqlite3.dll")] static extern IntPtr sqlite3_column_text16(IntPtr stmt, int columna);
    [DllImport("winsqlite3.dll")] static extern int sqlite3_finalize(IntPtr stmt);
    [DllImport("winsqlite3.dll")] static extern int sqlite3_close(IntPtr db);

    /// <summary>Último dictado del historial de Handy (id y texto); -1 si no se pudo leer.</summary>
    static long LeerUltimoDeHandy(out string texto)
    {
        texto = null;
        IntPtr db;
        if (sqlite3_open_v2(Encoding.UTF8.GetBytes(historialHandy + "\0"), out db, 1, IntPtr.Zero) != 0)
        {
            if (db != IntPtr.Zero) sqlite3_close(db);
            return -1;
        }
        long id = -1;
        try
        {
            IntPtr st;
            if (sqlite3_prepare16_v2(db, "select id, transcription_text from transcription_history order by id desc limit 1", -1, out st, IntPtr.Zero) == 0)
            {
                if (sqlite3_step(st) == 100)
                {
                    id = sqlite3_column_int64(st, 0);
                    IntPtr p = sqlite3_column_text16(st, 1);
                    texto = p == IntPtr.Zero ? "" : Marshal.PtrToStringUni(p);
                }
                sqlite3_finalize(st);
            }
        }
        finally { sqlite3_close(db); }
        return id;
    }

    // ---- Ventana de Claude y teclado -------------------------------------------------------

    delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint de, uint a, bool unir);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    const byte VK_RETURN = 0x0D, VK_BACK = 0x08, VK_MENU = 0x12;
    const uint KEYEVENTF_KEYUP = 2;

    // La terminal de Brandon es la consola clásica (proceso «wsl»); también vale Windows Terminal.
    static bool EsConsola(IntPtr h)
    {
        if (h == IntPtr.Zero || !IsWindowVisible(h)) return false;
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        try
        {
            string n = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
            return n == "wsl" || n == "windowsterminal" || n == "openconsole" || n.StartsWith("ubuntu");
        }
        catch { return false; }
    }

    static bool EnfocarClaude()
    {
        IntPtr fg = GetForegroundWindow();
        if (EsConsola(fg)) { ventanaClaude = fg; return true; }
        IntPtr h = ventanaClaude;
        if (h == IntPtr.Zero || !IsWindow(h) || !EsConsola(h))
        {
            h = IntPtr.Zero;
            // EnumWindows recorre de arriba hacia abajo: la primera consola es la última que se usó.
            EnumWindows(delegate (IntPtr w, IntPtr l)
            {
                if (EsConsola(w) && GetWindowTextLength(w) > 0) { h = w; return false; }
                return true;
            }, IntPtr.Zero);
        }
        if (h == IntPtr.Zero) return false;
        ventanaClaude = h;
        Activar(h);
        Thread.Sleep(150);
        return GetForegroundWindow() == h;
    }

    static void Activar(IntPtr h)
    {
        if (IsIconic(h)) ShowWindow(h, 9);
        uint nada;
        uint hiloDelFrente = GetWindowThreadProcessId(GetForegroundWindow(), out nada);
        uint hiloMio = GetCurrentThreadId();
        bool unido = hiloDelFrente != hiloMio && AttachThreadInput(hiloMio, hiloDelFrente, true);
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if (unido) AttachThreadInput(hiloMio, hiloDelFrente, false);
        if (GetForegroundWindow() != h)
        {
            // Windows sólo deja traer al frente a quien tocó el teclado último: un Alt lo destraba.
            keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            SetForegroundWindow(h);
        }
    }

    static void Tecla(byte vk)
    {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    static void Teclas(byte vk, int veces)
    {
        for (int i = 0; i < veces; i++)
        {
            Tecla(vk);
            if (i % 20 == 19) Thread.Sleep(15);
        }
    }

    // ---- Avisos ----------------------------------------------------------------------------

    static void Sonar(string archivo)
    {
        try
        {
            using (SoundPlayer p = new SoundPlayer(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Media", archivo)))
                p.PlaySync();
        }
        catch (Exception ex) { Anotar("sin sonido " + archivo + ": " + ex.Message); }
    }

    static void Icono(string texto)
    {
        if (icono != null) icono.Text = texto.Length > 63 ? texto.Substring(0, 63) : texto;
    }

    static void Anotar(string texto)
    {
        lock (candadoRegistro)
        {
            try
            {
                if (File.Exists(registro) && new FileInfo(registro).Length > 512 * 1024) File.Delete(registro);
                File.AppendAllText(registro, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + texto + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }

    // ---- Prueba con un .wav (sin micrófono) -----------------------------------------------

    static void Probar(string wav)
    {
        RecognizerInfo info = ReconocedorEspanol();
        StringBuilder salida = new StringBuilder();
        using (SpeechRecognitionEngine m = new SpeechRecognitionEngine(info))
        {
            CargarGramaticas(m, info);
            m.SetInputToWaveFile(wav);
            ManualResetEvent fin = new ManualResetEvent(false);
            m.SpeechRecognized += delegate (object s, SpeechRecognizedEventArgs e)
            {
                salida.AppendLine(string.Format("SI\t{0}\t{1}\t{2:0.00}", e.Result.Text, e.Result.Grammar.Name, e.Result.Confidence));
            };
            m.SpeechRecognitionRejected += delegate (object s, SpeechRecognitionRejectedEventArgs e)
            {
                string mejor = e.Result.Alternates.Count > 0 ? string.Format("{0} {1:0.00}", e.Result.Alternates[0].Text, e.Result.Alternates[0].Confidence) : "";
                salida.AppendLine("NO\t" + mejor);
            };
            m.RecognizeCompleted += delegate { fin.Set(); };
            m.RecognizeAsync(RecognizeMode.Multiple);
            fin.WaitOne(30000);
        }
        File.WriteAllText(Path.Combine(carpeta, "prueba.txt"), salida.Length > 0 ? salida.ToString() : "(nada)" + Environment.NewLine, Encoding.UTF8);
    }
}
