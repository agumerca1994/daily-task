// Notificaciones del sistema, sin dependencias:
//   Windows: toast nativo (API de Windows desde un PowerShell inline, sin scripts ni módulos)
//   macOS:   osascript
//   Linux:   notify-send
// Si no se puede (por ejemplo, políticas que bloquean PowerShell), falla sin cortar nada: el vigilante
// solo lo anota en el log.
import { spawn } from "node:child_process";

const APP = "Asistente de tareas";
// AppUserModelID de PowerShell: Windows lo acepta para mostrar toasts sin registrar una app propia
const AUMID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

function comando(titulo, texto) {
  if (process.platform === "win32") {
    const toast = `<toast><visual><binding template="ToastGeneric"><text>${xml(titulo)}</text><text>${xml(texto)}</text></binding></visual></toast>`;
    const ps = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
      "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
      "$x = New-Object Windows.Data.Xml.Dom.XmlDocument",
      `$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(toast).toString("base64")}')))`,
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${AUMID}').Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
    ].join("; ");
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps]];
  }
  if (process.platform === "darwin") {
    return ["osascript", ["-e", `display notification ${JSON.stringify(texto)} with title ${JSON.stringify(titulo)} subtitle ${JSON.stringify(APP)}`]];
  }
  return ["notify-send", ["--app-name", APP, titulo, texto]];
}

export function notificar(titulo, texto = "") {
  const [cmd, args] = comando(titulo, texto);
  return new Promise((ok, mal) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", mal);
    p.on("close", (code) => (code === 0 ? ok() : mal(new Error(err.trim().split(/\r?\n/)[0] || `código ${code}`))));
  });
}
