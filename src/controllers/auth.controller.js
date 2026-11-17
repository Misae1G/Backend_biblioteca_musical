import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import Usuario from '../models/Usuario.js'
import config from '../config/env.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { crearToken, enviarCookieSesion, limpiarCookieSesion } from '../utils/token.js'
import { enviarCorreo, correoRecuperacion } from '../utils/correo.js'

// Hash de relleno: el tiempo de respuesta no revela si el usuario existe
const HASH_RELLENO = bcrypt.hashSync('relleno-no-usar', 12)

const MINUTOS_CODIGO = 30
const MENSAJE_RECUPERAR =
    'Si el correo pertenece a un administrador activo, recibirás un mensaje con las instrucciones'

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export const login = async (req, res) => {
    const identificador = req.body.identificador.toLowerCase()
    const filtro = identificador.includes('@')
        ? { correo: identificador, rol: 'administrador' }
        : { nombreUsuario: identificador, rol: 'usuario' }

    const usuario = await Usuario.findOne(filtro).select('+password')

    const passwordOk = await bcrypt.compare(req.body.password, usuario?.password ?? HASH_RELLENO)
    if (!usuario || !passwordOk) throw new ErrorApp(401, 'Credenciales incorrectas')
    if (!usuario.activo) throw new ErrorApp(403, 'Tu cuenta está desactivada. Contacta al administrador')

    const ahora = new Date()
    usuario.ultimoAcceso = ahora
    await Usuario.updateOne({ _id: usuario._id }, { ultimoAcceso: ahora })

    enviarCookieSesion(res, crearToken(usuario))
    res.json({ msg: `Bienvenido(a), ${usuario.nombre}`, usuario })
}

export const logout = (req, res) => {
    limpiarCookieSesion(res)
    res.json({ msg: 'Sesión cerrada' })
}

export const perfil = (req, res) => {
    res.json({ usuario: req.usuario })
}

export const cambiarPassword = async (req, res) => {
    const { passwordActual, passwordNueva } = req.body

    const usuario = await Usuario.findById(req.usuario._id).select('+password')
    if (!(await usuario.compararPassword(passwordActual))) {
        throw new ErrorApp(400, 'La contraseña actual es incorrecta')
    }

    usuario.password = passwordNueva
    usuario.debeCambiarPassword = false
    await usuario.save()

    enviarCookieSesion(res, crearToken(usuario))
    res.json({ msg: 'Contraseña actualizada correctamente', usuario })
}

// Respuesta idéntica exista o no el correo, para no revelar qué cuentas existen
export const recuperarPassword = async (req, res) => {
    const correo = req.body.correo.toLowerCase()
    const admin = await Usuario.findOne({ correo, rol: 'administrador', activo: true })

    if (admin) {
        const token = crypto.randomBytes(32).toString('hex')
        await Usuario.updateOne(
            { _id: admin._id },
            {
                codigoRecuperacion: hashToken(token),
                codigoRecuperacionExpira: new Date(Date.now() + MINUTOS_CODIGO * 60 * 1000),
            }
        )

        const enlace = `${config.frontendUrl}/restablecer/${token}`
        enviarCorreo({
            para: admin.correo,
            ...correoRecuperacion({ nombre: admin.nombre, enlace, minutos: MINUTOS_CODIGO }),
        }).catch((e) => console.error('No se pudo enviar el correo de recuperación:', e.message))
    }

    res.json({ msg: MENSAJE_RECUPERAR })
}

export const restablecerPassword = async (req, res) => {
    const { token, passwordNueva } = req.body

    const usuario = await Usuario.findOne({
        codigoRecuperacion: hashToken(token),
        codigoRecuperacionExpira: { $gt: new Date() },
        rol: 'administrador',
        activo: true,
    }).select('+codigoRecuperacion +codigoRecuperacionExpira')

    if (!usuario) throw new ErrorApp(400, 'El enlace no es válido o ya venció. Solicita uno nuevo')

    usuario.password = passwordNueva
    usuario.debeCambiarPassword = false
    usuario.codigoRecuperacion = undefined
    usuario.codigoRecuperacionExpira = undefined
    await usuario.save()

    res.json({ msg: 'Contraseña restablecida. Ya puedes iniciar sesión' })
}