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

export const correoRecuperacion = ({ nombre, enlace, minutos }) => ({
    asunto: 'Recuperación de contraseña - Biblioteca Musical',
    texto:
        `Hola ${nombre},\n\nRecibimos una solicitud para restablecer tu contraseña. ` +
        `Abre este enlace (vale ${minutos} minutos):\n\n${enlace}\n\n` +
        `Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.`,
    html:
        `<p>Hola ${escaparHtml(nombre)},</p>` +
        `<p>Recibimos una solicitud para restablecer tu contraseña. Este enlace vale ${minutos} minutos:</p>` +
        `<p><a href="${enlace}">Restablecer contraseña</a></p>` +
        `<p>Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.</p>`,
})