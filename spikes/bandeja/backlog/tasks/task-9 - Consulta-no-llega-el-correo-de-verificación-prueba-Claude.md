---
id: TASK-9
title: 'Consulta: no llega el correo de verificación (prueba Claude)'
status: Esperando info
assignee: []
created_date: '2026-10-19 14:30'
updated_date: '2026-10-19 14:31'
labels:
  - consulta
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
El cliente cambió el email en la app de cámaras pero no le llega el correo de verificación. Ya revisó spam.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### Análisis IA
**Resumen:** El cliente cambió el email de su cuenta en la app de cámaras y no recibe el correo de verificación del nuevo email. Ya revisó la carpeta de spam.

**Solución propuesta:**
1. Confirmar con el cliente que el nuevo email quedó bien escrito en la app (sin errores de tipeo ni espacios).
2. Pedirle que revise también otras carpetas o pestañas del correo (Promociones, Notificaciones, Todos) y que busque por el remitente de la app.
3. Pedirle que reenvíe el correo de verificación desde la app, si tiene la opción, y que espere unos minutos.
4. Si sigue sin llegar, verificar del lado del servicio que el cambio de email quedó registrado y si el envío falló o rebotó.
5. Si el problema sigue, escalar al equipo responsable de la app o de los envíos de correo.

**Falta:**
- Nombre de la app de cámaras y versión, y si usa celular (Android/iOS) o web.
- Proveedor del nuevo email (Gmail, Outlook, corporativo, etc.).
- Si el cambio de email aparece aplicado en la app o sigue figurando el anterior.
- Si probó reenviar el correo de verificación y cuándo hizo el cambio.
- Si le aparece algún mensaje de error.

**Borrador de respuesta:** Hola, gracias por escribirnos. Para ayudarte con el correo de verificación, ¿nos podés confirmar qué app de cámaras usás y si es desde el celular o la web? Te pedimos también que revises que el nuevo email haya quedado bien escrito, que mires las carpetas Promociones o Notificaciones además de spam y que pruebes reenviar el correo de verificación desde la app. Si sigue sin llegar, contanos qué proveedor de correo usás (Gmail, Outlook, etc.) y si te aparece algún mensaje de error, así lo revisamos. Saludos.
<!-- SECTION:NOTES:END -->
