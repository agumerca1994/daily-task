---
id: TASK-10
title: 'Consulta: no llega el correo de verificación (prueba Kiro)'
status: Esperando info
assignee: []
created_date: '2026-10-19 14:30'
updated_date: '2026-10-19 14:31'
labels:
  - consulta
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
El cliente cambió el email en la app de cámaras pero no le llega el correo de verificación. Ya revisó spam.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### Análisis IA
**Resumen:** El cliente cambió el email en la app de cámaras y no recibe el correo de verificación del nuevo email. Ya revisó la carpeta de spam sin éxito.

**Solución propuesta:**
1. Verificar que el nuevo email esté bien escrito (sin errores de tipeo ni espacios).
2. Reenviar el correo de verificación desde la app y esperar unos minutos (puede demorar).
3. Revisar además de spam, las carpetas Promociones, Social y la papelera; y agregar el remitente a contactos/lista blanca.
4. Confirmar que el proveedor de correo no esté bloqueando o filtrando mensajes del dominio emisor.
5. Si el nuevo dominio es corporativo, pedir al área de IT que habilite el remitente.
6. Si nada funciona, revertir al email anterior (si sigue accesible) y volver a intentar el cambio, o escalar al equipo técnico para forzar la verificación.

**Falta:**
- Dirección de email nueva (o al menos el dominio/proveedor: Gmail, Outlook, corporativo, etc.).
- Fecha y hora aproximada del intento de cambio.
- Si el email anterior sigue siendo accesible.
- Nombre/identificador de la app de cámaras y versión.
- Mensaje de error exacto que muestra la app, si hay alguno.

**Borrador de respuesta:** Hola, gracias por tu consulta. Para ayudarte con la verificación del correo: 1) confirmá que el nuevo email esté bien escrito; 2) desde la app, volvé a solicitar el envío del correo de verificación y esperá unos minutos; 3) revisá, además de Spam, las carpetas Promociones/Social y la Papelera, y agregá el remitente a tus contactos. Para avanzar, ¿podrías indicarnos el proveedor del nuevo email (Gmail, Outlook, corporativo, etc.) y si todavía tenés acceso al email anterior? Con esos datos seguimos. ¡Saludos!
<!-- SECTION:NOTES:END -->
