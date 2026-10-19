// Instalador con ventana del Asistente de tareas (Windows).
//
// Solo junta las respuestas en pantallas (requisitos, carpeta de tareas, proyectos, opciones) y
// después ejecuta, sin consola, `node bin/asistente.mjs instalar --config <respuestas.json>`: la
// instalación la hace siempre el mismo código de Node que la versión por terminal.
//
// Lo compila `asistente compilar-instalador` con el compilador de C# que trae Windows
// (.NET Framework 4.x), así que está escrito en C# 5. Registro: %LOCALAPPDATA%\asistente-tareas\instalador.log
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Instalar Asistente de tareas")]
[assembly: System.Reflection.AssemblyProduct("Asistente de tareas")]

static class Programa
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Registro.Anotar("ERROR " + e.Exception); MessageBox.Show(e.Exception.Message, "Asistente de tareas"); };
        // Solo para desarrollo: guarda una imagen de cada paso en esa carpeta y sale, sin mostrar nada
        if (args.Length == 2 && args[0] == "--capturas") { Asistente.Capturar(args[1]); return; }
        Application.Run(new Asistente());
    }
}

static class Registro
{
    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "asistente-tareas");
    public static void Anotar(string linea)
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.AppendAllText(Path.Combine(Dir, "instalador.log"), DateTime.Now.ToString("s") + " " + linea + Environment.NewLine);
        }
        catch { }
    }
}

class Proyecto
{
    public string Nombre, Carpeta, Motor;
}

class Asistente : Form
{
    static readonly Color Azul = Color.FromArgb(37, 99, 235);
    static readonly Font Normal = new Font("Segoe UI", 9.5f);
    static readonly Font Titulo = new Font("Segoe UI Semibold", 13f);
    static readonly Font Chica = new Font("Segoe UI", 8.5f);

    string node, repo, cli, kiroBin;
    bool tieneBacklog, kiroSesion;
    readonly List<Panel> pasos = new List<Panel>();
    int actual;

    Label lblTitulo, lblSubtitulo;
    Button btnAtras, btnSiguiente, btnCancelar, btnTablero;

    // Paso 1
    Label lblNode, lblBacklog, lblKiro;
    Button btnLoginKiro, btnRevisar;
    CheckBox chkInstalarBacklog;
    // Paso 2
    TextBox txtBandeja;
    // Paso 3
    ListView lstProyectos;
    // Paso 4
    CheckBox chkKiro, chkMenu, chkEscritorio, chkAuto, chkIniciar;
    // Paso 5
    TextBox txtProgreso;
    ProgressBar barra;
    Label lblResultado;

    public Asistente()
    {
        Text = "Instalar Asistente de tareas";
        Font = Normal;
        ClientSize = new Size(680, 500);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        BackColor = Color.White;

        // Encabezado
        var encabezado = new Panel { Dock = DockStyle.Top, Height = 78, BackColor = Azul };
        lblTitulo = new Label { Font = Titulo, ForeColor = Color.White, AutoSize = false, Location = new Point(24, 14), Size = new Size(630, 28) };
        lblSubtitulo = new Label { ForeColor = Color.FromArgb(219, 234, 254), AutoSize = false, Location = new Point(24, 44), Size = new Size(630, 22) };
        encabezado.Controls.Add(lblTitulo);
        encabezado.Controls.Add(lblSubtitulo);

        // Botonera
        var pie = new Panel { Dock = DockStyle.Bottom, Height = 56, BackColor = Color.FromArgb(248, 250, 252) };
        btnCancelar = Boton("Cancelar", 570);
        btnSiguiente = Boton("Siguiente >", 470);
        btnAtras = Boton("< Atrás", 380);
        btnTablero = Boton("Abrir tablero", 350);
        btnTablero.Width = 110;
        btnTablero.Visible = false;
        btnCancelar.Click += delegate { Close(); };
        btnAtras.Click += delegate { Mostrar(actual - 1); };
        btnSiguiente.Click += delegate { Siguiente(); };
        btnTablero.Click += delegate { Abrir("http://127.0.0.1:6420"); };
        pie.Controls.AddRange(new Control[] { btnAtras, btnSiguiente, btnCancelar, btnTablero });

        var cuerpo = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 16, 24, 8) };
        pasos.Add(PasoBienvenida());
        pasos.Add(PasoBandeja());
        pasos.Add(PasoProyectos());
        pasos.Add(PasoOpciones());
        pasos.Add(PasoInstalar());
        foreach (var p in pasos) { p.Dock = DockStyle.Fill; p.Visible = false; cuerpo.Controls.Add(p); }

        Controls.Add(cuerpo);
        Controls.Add(pie);
        Controls.Add(encabezado);

        Shown += delegate { Mostrar(0); Revisar(); };
    }

    public static void Capturar(string dir)
    {
        var f = new Asistente { ShowInTaskbar = false, Opacity = 0, StartPosition = FormStartPosition.Manual, Location = new Point(-3000, -3000) };
        f.Show();
        for (int i = 0; i < 400 && (f.cli == null || f.lblKiro.Text.EndsWith("revisando...")); i++) { Application.DoEvents(); Thread.Sleep(50); }
        if (f.lstProyectos.Items.Count == 0) f.AgregarFila(new Proyecto { Nombre = "SmartHome", Carpeta = @"C:\ejemplo\SmartHome", Motor = "kiro" });
        Directory.CreateDirectory(dir);
        for (int i = 0; i < f.pasos.Count; i++)
        {
            f.Mostrar(i);
            if (i == 4) { f.txtProgreso.Text = "OK: Backlog.md\r\nOK: bandeja ...\r\nOK: proyecto SmartHome (kiro)\r\nLISTO\r\n"; f.Terminar(true, null); }
            Application.DoEvents();
            using (var bmp = new Bitmap(f.Width, f.Height))
            {
                f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height));
                bmp.Save(Path.Combine(dir, "paso" + (i + 1) + ".png"), System.Drawing.Imaging.ImageFormat.Png);
            }
        }
        f.Close();
    }

    Button Boton(string texto, int x)
    {
        return new Button { Text = texto, Location = new Point(x, 13), Size = new Size(90, 30), FlatStyle = FlatStyle.System };
    }

    Label Texto(Control padre, string texto, int y, int alto)
    {
        var l = new Label { Text = texto, Location = new Point(0, y), Size = new Size(630, alto), AutoSize = false };
        padre.Controls.Add(l);
        return l;
    }

    // ---------------------------------------------------------------- Pasos
    Panel PasoBienvenida()
    {
        var p = new Panel();
        Texto(p, "Una bandeja de tareas con tablero web. Cada tarea que cargues (en el tablero o pidiéndosela a Kiro en el chat) la toma una IA, la investiga con el contexto del proyecto al que pertenece y te deja un análisis con una solución propuesta y un borrador de respuesta.", 0, 60);
        Texto(p, "Para empezar reviso que esté todo lo necesario:", 70, 22).Font = new Font(Normal, FontStyle.Bold);
        lblNode = Texto(p, "Node.js: revisando...", 100, 22);
        lblBacklog = Texto(p, "Backlog.md: revisando...", 128, 22);
        chkInstalarBacklog = new CheckBox { Text = "Instalarlo ahora (npm i -g backlog.md)", Location = new Point(20, 152), AutoSize = true, Checked = true, Visible = false };
        p.Controls.Add(chkInstalarBacklog);
        lblKiro = Texto(p, "Kiro CLI: revisando...", 184, 40);
        btnLoginKiro = new Button { Text = "Iniciar sesión en Kiro", Location = new Point(20, 228), Size = new Size(170, 30), Visible = false, FlatStyle = FlatStyle.System };
        btnLoginKiro.Click += delegate
        {
            try { Process.Start(new ProcessStartInfo(kiroBin, "login") { UseShellExecute = true }); }
            catch (Exception e) { MessageBox.Show(e.Message, Text); }
            MessageBox.Show("Completá el inicio de sesión en la ventana que se abrió y después tocá \"Volver a revisar\".", Text);
        };
        btnRevisar = new Button { Text = "Volver a revisar", Location = new Point(200, 228), Size = new Size(130, 30), FlatStyle = FlatStyle.System };
        btnRevisar.Click += delegate { Revisar(); };
        p.Controls.Add(btnLoginKiro);
        p.Controls.Add(btnRevisar);
        var aviso = Texto(p, "Este instalador no está firmado: si Windows (SmartScreen) o el antivirus lo frenan, es esperable. No necesita permisos de administrador.", 280, 40);
        aviso.ForeColor = Color.DimGray;
        aviso.Font = Chica;
        return p;
    }

    Panel PasoBandeja()
    {
        var p = new Panel();
        Texto(p, "Elegí la carpeta donde se guardan las tareas, sus adjuntos y tus notas. Es privada: puede tener datos de clientes, así que no la pongas dentro de un repo que se suba a GitHub.", 0, 44);
        Texto(p, "Carpeta de las tareas:", 60, 20);
        txtBandeja = new TextBox { Location = new Point(0, 84), Width = 520 };
        var elegir = new Button { Text = "Elegir...", Location = new Point(530, 82), Size = new Size(100, 28), FlatStyle = FlatStyle.System };
        elegir.Click += delegate { var r = ElegirCarpeta("Carpeta de las tareas", txtBandeja.Text); if (r != null) txtBandeja.Text = r; };
        p.Controls.Add(txtBandeja);
        p.Controls.Add(elegir);
        var nota = Texto(p, "Si la carpeta ya tiene tareas de una instalación anterior, se conservan.", 120, 22);
        nota.ForeColor = Color.DimGray;
        return p;
    }

    Panel PasoProyectos()
    {
        var p = new Panel();
        Texto(p, "Un proyecto es la carpeta donde la IA busca contexto para resolver las tareas (por ejemplo, el repo o la documentación de tu equipo). La IA solo LEE esa carpeta: nunca la modifica. Si cargás un solo proyecto, todas las tareas van a ese.", 0, 60);
        lstProyectos = new ListView { Location = new Point(0, 66), Size = new Size(520, 210), View = View.Details, FullRowSelect = true, HideSelection = false, MultiSelect = false };
        lstProyectos.Columns.Add("Nombre", 120);
        lstProyectos.Columns.Add("Carpeta", 320);
        lstProyectos.Columns.Add("IA", 70);
        var agregar = new Button { Text = "Agregar...", Location = new Point(530, 66), Size = new Size(100, 30), FlatStyle = FlatStyle.System };
        var editar = new Button { Text = "Editar...", Location = new Point(530, 102), Size = new Size(100, 30), FlatStyle = FlatStyle.System };
        var quitar = new Button { Text = "Quitar", Location = new Point(530, 138), Size = new Size(100, 30), FlatStyle = FlatStyle.System };
        agregar.Click += delegate { var pr = EditarProyecto(null); if (pr != null) AgregarFila(pr); };
        editar.Click += delegate { EditarSeleccionado(); };
        lstProyectos.DoubleClick += delegate { EditarSeleccionado(); };
        quitar.Click += delegate { if (lstProyectos.SelectedItems.Count > 0) lstProyectos.Items.Remove(lstProyectos.SelectedItems[0]); };
        p.Controls.AddRange(new Control[] { lstProyectos, agregar, editar, quitar });
        var nota = Texto(p, "IA: kiro (la homologada para el trabajo) o claude.", 284, 22);
        nota.ForeColor = Color.DimGray;
        return p;
    }

    Panel PasoOpciones()
    {
        var p = new Panel();
        Texto(p, "Últimos detalles:", 0, 22).Font = new Font(Normal, FontStyle.Bold);
        chkKiro = Opcion(p, "Conectar con Kiro (recomendado)", 30, true);
        Texto(p, "Agrega a tu usuario de Kiro (no a tus proyectos) el agente que procesa las tareas y el acceso a la bandeja desde el chat, para poder decirle \"creá una tarea en la bandeja: ...\".", 54, 40).Padding = new Padding(18, 0, 0, 0);
        chkMenu = Opcion(p, "Crear \"Asistente de tareas\" en el menú Inicio", 104, true);
        chkEscritorio = Opcion(p, "También en el escritorio", 132, false);
        chkAuto = Opcion(p, "Iniciarlo solo cada vez que prendo la PC", 160, false);
        chkIniciar = Opcion(p, "Iniciarlo al terminar la instalación", 188, true);
        var nota = Texto(p, "El asistente funciona en segundo plano, sin ventanas: queda un ícono junto al reloj (si no lo ves, está en la flecha ^; arrastralo a la barra). Doble clic en el ícono abre el tablero.", 228, 44);
        nota.ForeColor = Color.DimGray;
        return p;
    }

    CheckBox Opcion(Control padre, string texto, int y, bool marcado)
    {
        var c = new CheckBox { Text = texto, Location = new Point(0, y), AutoSize = true, Checked = marcado };
        padre.Controls.Add(c);
        return c;
    }

    Panel PasoInstalar()
    {
        var p = new Panel();
        barra = new ProgressBar { Location = new Point(0, 0), Size = new Size(630, 18), Style = ProgressBarStyle.Marquee };
        txtProgreso = new TextBox { Location = new Point(0, 28), Size = new Size(630, 230), Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Color.FromArgb(248, 250, 252), Font = new Font("Consolas", 9f) };
        lblResultado = Texto(p, "", 266, 50);
        p.Controls.Add(barra);
        p.Controls.Add(txtProgreso);
        return p;
    }

    // ---------------------------------------------------------------- Navegación
    void Mostrar(int i)
    {
        if (i < 0 || i >= pasos.Count) return;
        actual = i;
        for (int k = 0; k < pasos.Count; k++) pasos[k].Visible = k == i;
        string[] titulos = { "Bienvenido", "Dónde guardar las tareas", "Proyectos", "Opciones", "Instalando" };
        lblTitulo.Text = titulos[i];
        lblSubtitulo.Text = "Paso " + (i + 1) + " de " + pasos.Count;
        btnAtras.Enabled = i > 0 && i < 4;
        btnSiguiente.Text = i == 3 ? "Instalar" : "Siguiente >";
        if (i == 0) btnSiguiente.Enabled = node != null && repo != null;
    }

    void Siguiente()
    {
        if (actual == 4) { Close(); return; }
        if (actual == 0 && !tieneBacklog && !chkInstalarBacklog.Checked)
        {
            MessageBox.Show("Backlog.md es necesario. Marcá \"Instalarlo ahora\" o instalalo con: npm i -g backlog.md", Text);
            return;
        }
        if (actual == 1 && txtBandeja.Text.Trim().Length == 0) { MessageBox.Show("Elegí una carpeta para las tareas.", Text); return; }
        if (actual == 2 && lstProyectos.Items.Count == 0) { MessageBox.Show("Agregá al menos un proyecto.", Text); return; }
        if (actual == 3) { Mostrar(4); Instalar(); return; }
        Mostrar(actual + 1);
    }

    // ---------------------------------------------------------------- Requisitos
    void Revisar()
    {
        node = BuscarNode();
        repo = BuscarRepo();
        lblNode.Text = node == null ? "Node.js: NO ENCONTRADO. Instalalo desde https://nodejs.org (versión LTS) y volvé a abrir este instalador." : "Node.js: OK";
        lblNode.ForeColor = node == null ? Color.Firebrick : Color.DarkGreen;
        if (repo == null)
        {
            lblBacklog.Text = "No encuentro los archivos del asistente: este instalador tiene que estar dentro de la carpeta del asistente (o en su subcarpeta dist).";
            lblBacklog.ForeColor = Color.Firebrick;
            lblBacklog.Height = 40;
        }
        btnSiguiente.Enabled = false;
        if (node == null || repo == null) return;
        cli = Path.Combine(repo, "bin", "asistente.mjs");
        btnRevisar.Enabled = false;
        lblBacklog.Text = "Backlog.md: revisando...";
        lblKiro.Text = "Kiro CLI: revisando...";

        ThreadPool.QueueUserWorkItem(delegate
        {
            string salida = Ejecutar("\"" + cli + "\" diagnostico --json", null);
            BeginInvoke((MethodInvoker)delegate { AplicarDiagnostico(salida); });
        });
    }

    void AplicarDiagnostico(string json)
    {
        btnRevisar.Enabled = true;
        Dictionary<string, object> d = null;
        try
        {
            int i = json.IndexOf('{');
            d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json.Substring(i));
        }
        catch (Exception e)
        {
            Registro.Anotar("diagnostico ilegible: " + json + " / " + e.Message);
            lblBacklog.Text = "No pude revisar los requisitos (ver " + Path.Combine(Registro.Dir, "instalador.log") + ").";
            lblBacklog.ForeColor = Color.Firebrick;
            return;
        }
        lblNode.Text = "Node.js " + d["node"] + ": OK";

        tieneBacklog = d["backlog"] != null;
        lblBacklog.Text = tieneBacklog ? "Backlog.md (tablero de tareas): OK" : "Backlog.md (tablero de tareas): falta.";
        lblBacklog.ForeColor = tieneBacklog ? Color.DarkGreen : Color.DarkOrange;
        chkInstalarBacklog.Visible = !tieneBacklog;

        var kiro = d["kiro"] as Dictionary<string, object>;
        kiroBin = kiro == null ? null : kiro["bin"] as string;
        kiroSesion = kiro != null && kiro["sesion"] != null;
        if (kiro == null)
        {
            lblKiro.Text = "Kiro CLI: no encontrado. Sin Kiro la IA no puede trabajar: instalalo y volvé a revisar (podés seguir y conectarlo después).";
            lblKiro.ForeColor = Color.DarkOrange;
        }
        else if (!kiroSesion)
        {
            lblKiro.Text = "Kiro CLI: instalado, pero sin sesión iniciada. Iniciá sesión con tu cuenta (en el trabajo, la de la empresa).";
            lblKiro.ForeColor = Color.DarkOrange;
        }
        else
        {
            lblKiro.Text = "Kiro CLI: OK, sesión iniciada";
            lblKiro.ForeColor = Color.DarkGreen;
        }
        btnLoginKiro.Visible = kiro != null && !kiroSesion;
        chkKiro.Enabled = kiro != null;
        chkKiro.Checked = kiro != null;

        if (txtBandeja.Text.Length == 0) txtBandeja.Text = Ventana((d["bandeja"] as string) ?? (d["bandejaPorDefecto"] as string));
        if (lstProyectos.Items.Count == 0 && d["proyectos"] is System.Collections.ArrayList)
        {
            foreach (Dictionary<string, object> pr in (System.Collections.ArrayList)d["proyectos"])
                AgregarFila(new Proyecto { Nombre = (string)pr["nombre"], Carpeta = Ventana((string)pr["carpeta"]), Motor = (string)pr["motor"] });
        }
        btnSiguiente.Enabled = actual == 0 ? true : btnSiguiente.Enabled;
    }

    static string Ventana(string ruta) { return ruta == null ? "" : ruta.Replace('/', '\\'); }

    // ---------------------------------------------------------------- Proyectos
    void AgregarFila(Proyecto p)
    {
        foreach (ListViewItem it in lstProyectos.Items)
            if (string.Equals(it.Text, p.Nombre, StringComparison.OrdinalIgnoreCase)) { lstProyectos.Items.Remove(it); break; }
        var item = new ListViewItem(new[] { p.Nombre, p.Carpeta, p.Motor }) { Tag = p };
        lstProyectos.Items.Add(item);
    }

    void EditarSeleccionado()
    {
        if (lstProyectos.SelectedItems.Count == 0) return;
        var item = lstProyectos.SelectedItems[0];
        var p = EditarProyecto((Proyecto)item.Tag);
        if (p == null) return;
        lstProyectos.Items.Remove(item);
        AgregarFila(p);
    }

    Proyecto EditarProyecto(Proyecto actual)
    {
        var f = new Form { Text = actual == null ? "Agregar proyecto" : "Editar proyecto", Font = Normal, ClientSize = new Size(520, 230), FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterParent, ShowInTaskbar = false };
        f.Controls.Add(new Label { Text = "Nombre corto (así aparece en el tablero, por ejemplo SmartHome):", Location = new Point(16, 14), AutoSize = true });
        var nombre = new TextBox { Location = new Point(16, 36), Width = 220, Text = actual == null ? "" : actual.Nombre };
        f.Controls.Add(new Label { Text = "Carpeta del proyecto:", Location = new Point(16, 72), AutoSize = true });
        var carpeta = new TextBox { Location = new Point(16, 94), Width = 380, Text = actual == null ? "" : actual.Carpeta };
        var elegir = new Button { Text = "Elegir...", Location = new Point(404, 92), Size = new Size(100, 28), FlatStyle = FlatStyle.System };
        elegir.Click += delegate { var r = ElegirCarpeta("Carpeta del proyecto", carpeta.Text); if (r != null) { carpeta.Text = r; if (nombre.Text.Length == 0) nombre.Text = Path.GetFileName(r); } };
        f.Controls.Add(new Label { Text = "IA que lo atiende:", Location = new Point(16, 132), AutoSize = true });
        var motor = new ComboBox { Location = new Point(16, 154), Width = 120, DropDownStyle = ComboBoxStyle.DropDownList };
        motor.Items.AddRange(new object[] { "kiro", "claude" });
        motor.SelectedItem = actual == null ? "kiro" : actual.Motor;
        if (motor.SelectedIndex < 0) motor.SelectedIndex = 0;
        var ok = new Button { Text = "Aceptar", Location = new Point(324, 190), Size = new Size(90, 30), FlatStyle = FlatStyle.System };
        var cancelar = new Button { Text = "Cancelar", Location = new Point(420, 190), Size = new Size(90, 30), DialogResult = DialogResult.Cancel, FlatStyle = FlatStyle.System };
        f.Controls.AddRange(new Control[] { nombre, carpeta, elegir, motor, ok, cancelar });
        f.AcceptButton = ok;
        f.CancelButton = cancelar;
        Proyecto resultado = null;
        ok.Click += delegate
        {
            string n = nombre.Text.Trim(), c = carpeta.Text.Trim().Trim('"');
            if (!Regex.IsMatch(n, @"^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$")) { MessageBox.Show(f, "El nombre puede tener letras, números, espacios, _ . -", f.Text); return; }
            if (!Directory.Exists(c)) { MessageBox.Show(f, "No existe la carpeta:\n" + c, f.Text); return; }
            resultado = new Proyecto { Nombre = n, Carpeta = c, Motor = (string)motor.SelectedItem };
            f.DialogResult = DialogResult.OK;
        };
        f.ShowDialog(this);
        return resultado;
    }

    string ElegirCarpeta(string descripcion, string inicial)
    {
        using (var d = new FolderBrowserDialog { Description = descripcion, ShowNewFolderButton = true })
        {
            if (!string.IsNullOrEmpty(inicial) && Directory.Exists(inicial)) d.SelectedPath = inicial;
            return d.ShowDialog(this) == DialogResult.OK ? d.SelectedPath : null;
        }
    }

    // ---------------------------------------------------------------- Instalación
    void Instalar()
    {
        btnSiguiente.Enabled = false;
        btnCancelar.Enabled = false;
        txtProgreso.Text = "";
        var proyectos = new List<Dictionary<string, object>>();
        foreach (ListViewItem it in lstProyectos.Items)
        {
            var p = (Proyecto)it.Tag;
            proyectos.Add(new Dictionary<string, object> { { "nombre", p.Nombre }, { "carpeta", p.Carpeta }, { "motor", p.Motor } });
        }
        var config = new Dictionary<string, object>
        {
            { "bandeja", txtBandeja.Text.Trim() },
            { "proyectos", proyectos },
            { "instalarBacklog", chkInstalarBacklog.Checked },
            { "kiro", chkKiro.Enabled && chkKiro.Checked },
            { "menu", chkMenu.Checked },
            { "escritorio", chkEscritorio.Checked },
            { "autoinicio", chkAuto.Checked },
            { "iniciar", chkIniciar.Checked },
        };
        string archivo = Path.Combine(Path.GetTempPath(), "asistente-instalar-" + Guid.NewGuid().ToString("N") + ".json");
        File.WriteAllText(archivo, new JavaScriptSerializer().Serialize(config), new UTF8Encoding(false));

        ThreadPool.QueueUserWorkItem(delegate
        {
            bool listo = false;
            string error = null;
            Ejecutar("\"" + cli + "\" instalar --config \"" + archivo + "\"", delegate(string linea)
            {
                if (linea == "LISTO") listo = true;
                else if (linea.StartsWith("ERROR: ")) error = linea.Substring(7);
                BeginInvoke((MethodInvoker)delegate { txtProgreso.AppendText(linea + Environment.NewLine); });
            });
            try { File.Delete(archivo); } catch { }
            BeginInvoke((MethodInvoker)delegate { Terminar(listo, error); });
        });
    }

    void Terminar(bool listo, string error)
    {
        barra.Style = ProgressBarStyle.Continuous;
        barra.Value = listo ? 100 : 0;
        txtProgreso.SelectionStart = txtProgreso.TextLength;
        txtProgreso.SelectionLength = 0;
        btnSiguiente.Focus();
        btnSiguiente.Text = "Cerrar";
        btnSiguiente.Enabled = true;
        btnCancelar.Visible = false;
        btnAtras.Visible = false;
        if (listo)
        {
            lblTitulo.Text = "¡Listo!";
            lblResultado.Text = chkIniciar.Checked
                ? "El asistente ya está funcionando: buscá su ícono junto al reloj. Creá una tarea en el tablero y en uno o dos minutos la IA te deja el análisis."
                : "Para iniciarlo: menú Inicio > Asistente de tareas.";
            lblResultado.ForeColor = Color.DarkGreen;
            btnTablero.Visible = chkIniciar.Checked;
        }
        else
        {
            lblTitulo.Text = "No se pudo completar";
            lblResultado.Text = (error ?? "Error inesperado") + "\nRegistro: " + Path.Combine(Registro.Dir, "instalador.log");
            lblResultado.ForeColor = Color.Firebrick;
            btnAtras.Visible = true;
            btnAtras.Enabled = true;
            btnAtras.Text = "< Volver";
            btnAtras.Click += delegate { btnAtras.Text = "< Atrás"; btnCancelar.Visible = true; btnCancelar.Enabled = true; barra.Style = ProgressBarStyle.Marquee; lblResultado.Text = ""; };
        }
    }

    // ---------------------------------------------------------------- Procesos
    /// Ejecuta node con esos argumentos, sin ventana. Devuelve toda la salida.
    string Ejecutar(string argumentos, Action<string> porLinea)
    {
        Registro.Anotar("> node " + argumentos);
        var psi = new ProcessStartInfo(node, argumentos)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = repo,
        };
        var todo = new StringBuilder();
        try
        {
            using (var p = Process.Start(psi))
            {
                p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) { Registro.Anotar("  ! " + e.Data); lock (todo) todo.AppendLine(e.Data); } };
                p.BeginErrorReadLine();
                string linea;
                while ((linea = p.StandardOutput.ReadLine()) != null)
                {
                    Registro.Anotar("  " + linea);
                    lock (todo) todo.AppendLine(linea);
                    if (porLinea != null) porLinea(linea);
                }
                p.WaitForExit();
            }
        }
        catch (Exception e)
        {
            Registro.Anotar("ERROR " + e);
            if (porLinea != null) porLinea("ERROR: " + e.Message);
        }
        return todo.ToString();
    }

    static string BuscarNode()
    {
        var rutas = new List<string>();
        foreach (var d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            if (d.Trim().Length > 0) rutas.Add(Path.Combine(d.Trim().Trim('"'), "node.exe"));
        rutas.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"));
        rutas.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"));
        foreach (var r in rutas) { try { if (File.Exists(r)) return r; } catch { } }
        return null;
    }

    /// La carpeta del asistente: la del instalador o la de arriba (si está en dist\).
    static string BuscarRepo()
    {
        var dir = Path.GetDirectoryName(Application.ExecutablePath);
        for (int i = 0; i < 3 && dir != null; i++)
        {
            if (File.Exists(Path.Combine(dir, "bin", "asistente.mjs"))) return dir;
            dir = Path.GetDirectoryName(dir);
        }
        return null;
    }

    static void Abrir(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
