// Ícono del Asistente de tareas en el área de notificación de Windows (junto al reloj).
//
// - Levanta el asistente (`node asistente.mjs iniciar --servicio`) sin ninguna ventana.
// - Menú: Abrir tablero, Ver actividad, Detener. Doble clic en el ícono: abre el tablero.
// - Si el asistente se cae, el ícono lo indica y ofrece iniciarlo de nuevo.
// - Una sola instancia: si ya está abierto, un nuevo doble clic solo abre el tablero.
//
// Lo compila `asistente instalar` con el compilador de C# que trae Windows (.NET Framework 4.x), así
// que está escrito en C# 5. Argumentos:
//   --node <ruta a node.exe> --cli <ruta a bin/asistente.mjs> [--abrir]
//   --detener  (cierra el asistente y el ícono, sin abrir nada)
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

// Nombre con el que aparece en Configuración > Barra de tareas > Otros íconos de la bandeja del sistema
[assembly: System.Reflection.AssemblyTitle("Asistente de tareas")]
[assembly: System.Reflection.AssemblyProduct("Asistente de tareas")]
[assembly: System.Reflection.AssemblyDescription("Asistente de tareas")]

static class AsistenteTareas
{
    const string Tablero = "http://127.0.0.1:6420";
    const string Marca = "http://127.0.0.1:6421/__asistente";
    const string Detener = "http://127.0.0.1:6421/__detener";

    static string node, cli;
    static NotifyIcon icono;
    static ToolStripMenuItem itemIniciar;
    static bool activo, detenido;
    static Control ui; // recibe los pedidos de otros hilos (su ventana existe desde el inicio)

    [STAThread]
    static void Main(string[] args)
    {
        bool abrir = false, soloDetener = false;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--node" && i + 1 < args.Length) node = args[++i];
            else if (args[i] == "--cli" && i + 1 < args.Length) cli = args[++i];
            else if (args[i] == "--abrir") abrir = true;
            else if (args[i] == "--detener") soloDetener = true;
        }

        // Señal para que el ícono que está corriendo se cierre (la usa --detener)
        var salir = new EventWaitHandle(false, EventResetMode.ManualReset, "Local\\AsistenteTareasSalir");
        if (soloDetener) { PedirDetener(); salir.Set(); return; }
        salir.Reset();

        bool nuevo;
        using (var mutex = new Mutex(true, "Local\\AsistenteTareasBandeja", out nuevo))
        {
            if (!nuevo)
            {
                // Ya hay un ícono: solo se abre el tablero
                if (abrir) AbrirTablero();
                return;
            }
            Application.EnableVisualStyles();
            RegistrarErrores();
            ui = new Control();
            ui.CreateControl();
            var h = ui.Handle;
            CrearIcono();
            ThreadPool.QueueUserWorkItem(delegate
            {
                salir.WaitOne();
                detenido = true;
                ui.Invoke((MethodInvoker)delegate { Application.Exit(); });
            });
            if (!Corriendo()) IniciarServicio();
            ThreadPool.QueueUserWorkItem(delegate
            {
                for (int i = 0; i < 60 && !Corriendo(); i++) Thread.Sleep(500);
                bool ok = Corriendo();
                ui.Invoke((MethodInvoker)delegate
                {
                    Actualizar(ok);
                    if (ok)
                    {
                        icono.ShowBalloonTip(3000, "Asistente de tareas", "Activo. Doble clic en este ícono abre el tablero.", ToolTipIcon.Info);
                        if (abrir) AbrirTablero();
                    }
                    else
                    {
                        icono.ShowBalloonTip(5000, "Asistente de tareas", "No arrancó. Mirá Ver actividad.", ToolTipIcon.Error);
                    }
                });
            });

            var timer = new System.Windows.Forms.Timer { Interval = 5000 };
            timer.Tick += delegate
            {
                bool ok = Corriendo();
                if (activo && !ok && !detenido)
                    icono.ShowBalloonTip(5000, "Asistente de tareas", "Se detuvo. Clic derecho en el ícono > Iniciar.", ToolTipIcon.Warning);
                Actualizar(ok);
            };
            timer.Start();

            Application.Run();
            icono.Visible = false;
        }
    }

    // Errores no previstos: van a %LOCALAPPDATA%asistente-tareasicono.log en lugar de cerrar en silencio
    static void RegistrarErrores()
    {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Anotar(e.Exception); };
        AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) { Anotar(e.ExceptionObject as Exception); };
    }

    static void Anotar(Exception e)
    {
        try
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "asistente-tareas");
            File.AppendAllText(Path.Combine(dir, "icono.log"), DateTime.Now.ToString("s") + " " + e + Environment.NewLine);
        }
        catch { }
    }

    static void CrearIcono()
    {
        var menu = new ContextMenuStrip();
        var abrir = new ToolStripMenuItem("Abrir tablero", null, delegate { AbrirTablero(); });
        abrir.Font = new Font(abrir.Font, FontStyle.Bold);
        itemIniciar = new ToolStripMenuItem("Iniciar", null, delegate { detenido = false; IniciarServicio(); });
        menu.Items.Add(abrir);
        menu.Items.Add(new ToolStripMenuItem("Ver actividad", null, delegate { VerActividad(); }));
        menu.Items.Add(itemIniciar);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Detener y salir", null, delegate
        {
            detenido = true;
            PedirDetener();
            Application.Exit();
        }));

        icono = new NotifyIcon
        {
            Icon = Dibujar(Color.FromArgb(37, 99, 235)),
            Text = "Asistente de tareas: iniciando...",
            ContextMenuStrip = menu,
            Visible = true,
        };
        icono.DoubleClick += delegate { AbrirTablero(); };
    }

    static void Actualizar(bool ok)
    {
        if (ok == activo && icono.Text != "Asistente de tareas: iniciando...") return;
        activo = ok;
        icono.Icon = Dibujar(ok ? Color.FromArgb(37, 99, 235) : Color.FromArgb(148, 163, 184));
        icono.Text = ok ? "Asistente de tareas: activo" : "Asistente de tareas: detenido";
        itemIniciar.Visible = !ok;
    }

    // Ícono: cuadrado redondeado con una tilde (azul activo, gris detenido)
    static Icon Dibujar(Color fondo)
    {
        var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var camino = new GraphicsPath())
            {
                int r = 8;
                camino.AddArc(1, 1, r * 2, r * 2, 180, 90);
                camino.AddArc(31 - r * 2, 1, r * 2, r * 2, 270, 90);
                camino.AddArc(31 - r * 2, 31 - r * 2, r * 2, r * 2, 0, 90);
                camino.AddArc(1, 31 - r * 2, r * 2, r * 2, 90, 90);
                camino.CloseFigure();
                using (var b = new SolidBrush(fondo)) g.FillPath(b, camino);
            }
            using (var p = new Pen(Color.White, 4) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
                g.DrawLines(p, new[] { new Point(8, 17), new Point(14, 23), new Point(24, 10) });
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    static bool Corriendo()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Marca);
            req.Timeout = 1500;
            req.Proxy = null;
            using (var res = (HttpWebResponse)req.GetResponse()) return res.StatusCode == HttpStatusCode.OK;
        }
        catch { return false; }
    }

    static void PedirDetener()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Detener);
            req.Method = "POST";
            req.Timeout = 3000;
            req.Proxy = null;
            req.Headers.Add("x-asistente", "1");
            req.ContentLength = 0;
            using (req.GetResponse()) { }
        }
        catch { }
    }

    static void IniciarServicio()
    {
        if (string.IsNullOrEmpty(node) || string.IsNullOrEmpty(cli)) return;
        var psi = new ProcessStartInfo(node, "\"" + cli + "\" iniciar --servicio")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = Path.GetDirectoryName(cli),
        };
        try { Process.Start(psi); }
        catch (Exception e) { MessageBox.Show("No se pudo iniciar el asistente:\n" + e.Message, "Asistente de tareas"); }
    }

    static void VerActividad()
    {
        // Esta sí abre una ventana a propósito; cerrarla no detiene el asistente
        try { Process.Start(new ProcessStartInfo(node, "\"" + cli + "\" actividad") { UseShellExecute = true }); }
        catch (Exception e) { MessageBox.Show(e.Message, "Asistente de tareas"); }
    }

    static void AbrirTablero()
    {
        try { Process.Start(Tablero); } catch { }
    }
}
