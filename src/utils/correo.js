import nodemailer from 'nodemailer'
import config from '../config/env.js'

let transporte

const obtenerTransporte = () => {
    transporte ??= nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.puerto,
        secure: config.smtp.puerto === 465,
        auth: { user: config.smtp.usuario, pass: config.smtp.clave },
    })
    return transporte
}

const escaparHtml = (t) =>
    String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// En desarrollo, sin SMTP configurado, el correo se imprime en la terminal
export const enviarCorreo = async ({ para, asunto, texto, html }) => {
    if (!config.smtp.configurado) {
        if (config.entorno === 'production') {
            throw new Error('El correo no está configurado (variables SMTP_*)')
        }
        console.log(`\n[CORREO SIMULADO] Para: ${para}\nAsunto: ${asunto}\n${texto}\n`)
        return
    }
    await obtenerTransporte().sendMail({
        from: config.smtp.remitente,
        to: para,
        subject: asunto,
        text: texto,
        html,
    })
}

const color = {
    marca500: '#8c2f3d',
    marca600: '#741f2d',
    marca700: '#5c1824',
    marca50: '#fbf3f4',
    tinta: '#1d1b1e',
    tintaSuave: '#5f5a60',
    papel: '#faf8f5',
    linea: '#e4dfd8',
    superficie: '#ffffff',
    laton: '#b08a3e',
    latonFondo: '#f4ead2',
    latonTexto: '#7a5c1c',
    latonClaro: '#d6b970',
}

const fuenteTitulo = "Lora, Georgia, 'Times New Roman', serif"
const fuenteTexto = "Roboto, 'Helvetica Neue', Arial, sans-serif"

// Marco común (cabecera + tarjeta + pie). Reutilizable para otros correos futuros.
const plantillaCorreo = ({ previa, titulo, contenido }) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escaparHtml(titulo)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${color.papel};">
  <!-- Texto de vista previa en la bandeja de entrada -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${color.papel};font-size:1px;line-height:1px;">
    ${escaparHtml(previa)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.papel};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px;background-color:${color.superficie};border:1px solid ${color.linea};border-radius:12px;overflow:hidden;">

          <!-- Cabecera vino -->
          <tr>
            <td align="center" bgcolor="${color.marca600}" style="background-color:${color.marca600};padding:32px 24px 28px;">
              <div style="font-family:${fuenteTexto};font-size:30px;line-height:30px;color:${color.latonClaro};">&#9835;</div>
              <div style="font-family:${fuenteTitulo};font-size:24px;line-height:30px;font-weight:700;color:#ffffff;padding-top:10px;">
                Biblioteca Musical
              </div>
              <div style="font-family:${fuenteTexto};font-size:12px;line-height:18px;letter-spacing:2px;text-transform:uppercase;color:${color.latonClaro};padding-top:4px;">
                Sistema de gestión
              </div>
            </td>
          </tr>

          <!-- Filete latón -->
          <tr>
            <td height="4" bgcolor="${color.laton}" style="background-color:${color.laton};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Contenido -->
          <tr>
            <td style="padding:36px 32px 32px;font-family:${fuenteTexto};color:${color.tinta};">
              ${contenido}
            </td>
          </tr>
        </table>

        <!-- Pie -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:20px 16px 0;font-family:${fuenteTexto};font-size:12px;line-height:18px;color:${color.tintaSuave};">
              Este es un mensaje automático, por favor no respondas a este correo.<br>
              Biblioteca Musical &middot; Uso privado de la orquesta
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`

export const correoRecuperacion = ({ nombre, enlace, minutos }) => {
    const enlaceSeguro = escaparHtml(enlace)

    const contenido = `
      <h1 style="margin:0 0 16px;font-family:${fuenteTitulo};font-size:24px;line-height:32px;font-weight:700;color:${color.marca700};">
        Restablece tu contraseña
      </h1>

      <p style="margin:0 0 12px;font-size:16px;line-height:26px;color:${color.tinta};">
        Hola <strong>${escaparHtml(nombre)}</strong>,
      </p>
      <p style="margin:0 0 28px;font-size:16px;line-height:26px;color:${color.tintaSuave};">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        Pulsa el botón para elegir una nueva.
      </p>

      <!-- Botón (tabla para que se vea bien en Outlook) -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;">
        <tr>
          <td align="center" bgcolor="${color.marca500}" style="background-color:${color.marca500};border-radius:8px;">
            <a href="${enlaceSeguro}" target="_blank"
               style="display:inline-block;padding:14px 32px;font-family:${fuenteTexto};font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
              Restablecer contraseña
            </a>
          </td>
        </tr>
      </table>

      <!-- Aviso de vigencia -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td bgcolor="${color.latonFondo}"
              style="background-color:${color.latonFondo};border-left:4px solid ${color.laton};border-radius:6px;padding:14px 16px;font-family:${fuenteTexto};font-size:14px;line-height:22px;color:${color.latonTexto};">
            <strong>&#9201; Este enlace vale ${escaparHtml(minutos)} minutos.</strong><br>
            Pasado ese tiempo tendrás que solicitar uno nuevo.
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:${color.tintaSuave};">
        Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.
      </p>
    `

    return {
        asunto: 'Recuperación de contraseña - Biblioteca Musical',
        texto:
            `Hola ${nombre},\n\nRecibimos una solicitud para restablecer tu contraseña. ` +
            `Abre este enlace (vale ${minutos} minutos):\n\n${enlace}\n\n` +
            `Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.`,
        html: plantillaCorreo({
            previa: `Tu enlace para restablecer la contraseña vale ${minutos} minutos.`,
            titulo: 'Recuperación de contraseña',
            contenido,
        }),
    }
}
