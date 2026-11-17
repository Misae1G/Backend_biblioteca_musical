import Usuario from '../models/Usuario.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { NOMBRE_COOKIE, verificarToken } from '../utils/token.js'

// Exige sesión válida y carga al usuario desde la base de datos
export const autenticar = async (req, res, next) => {
    const token = req.cookies?.[NOMBRE_COOKIE]
    if (!token) throw new ErrorApp(401, 'Debes iniciar sesión')

    const payload = verificarToken(token)
    const usuario = await Usuario.findById(payload.sub)

    if (!usuario || !usuario.activo) throw new ErrorApp(401, 'La cuenta no está disponible')

    // Si la contraseña cambió después de emitir el token, la sesión ya no vale
    if (usuario.passwordCambiadaEn && Math.floor(usuario.passwordCambiadaEn.getTime() / 1000) > payload.iat) {
        throw new ErrorApp(401, 'La sesión ya no es válida. Inicia sesión de nuevo')
    }

    req.usuario = usuario
    next()
}

// Con contraseña temporal solo se puede cambiar la contraseña
export const passwordAlDia = (req, res, next) => {
    if (req.usuario.debeCambiarPassword) {
        throw new ErrorApp(403, 'Debes cambiar tu contraseña antes de continuar')
    }
    next()
}

export const autorizar = (...roles) => (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
        throw new ErrorApp(403, 'No tienes permiso para acceder a este recurso')
    }
    next()
}

// Uso en rutas de negocio: router.use(...protegido('usuario'))
export const protegido = (...roles) => [autenticar, passwordAlDia, autorizar(...roles)]