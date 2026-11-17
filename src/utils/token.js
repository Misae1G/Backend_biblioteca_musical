import jwt from 'jsonwebtoken'
import config from '../config/env.js'

export const NOMBRE_COOKIE = 'token'

const opcionesCookie = () => {
    const produccion = config.entorno === 'production'
    return {
        httpOnly: true,
        secure: produccion,
        sameSite: produccion ? 'none' : 'lax',
        path: '/',
    }
}

export const crearToken = (usuario) =>
    jwt.sign({ rol: usuario.rol }, config.jwtSecret, {
        algorithm: 'HS256',
        subject: String(usuario._id),
        expiresIn: config.jwtExpira,
    })

export const verificarToken = (token) =>
    jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })

export const enviarCookieSesion = (res, token) => {
    const { exp } = jwt.decode(token)
    res.cookie(NOMBRE_COOKIE, token, { ...opcionesCookie(), expires: new Date(exp * 1000) })
}

export const limpiarCookieSesion = (res) => {
    res.clearCookie(NOMBRE_COOKIE, opcionesCookie())
}