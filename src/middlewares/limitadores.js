import rateLimit from 'express-rate-limit'

const crear = ({ minutos, maximo, mensaje, omitirExitosas = false }) =>
    rateLimit({
        windowMs: minutos * 60 * 1000,
        limit: maximo,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: omitirExitosas,
        message: { msg: mensaje },
    })

// Solo cuentan los intentos fallidos
export const limitadorLogin = crear({
    minutos: 15,
    maximo: 20,
    omitirExitosas: true,
    mensaje: 'Demasiados intentos fallidos. Inténtalo de nuevo en unos minutos',
})

export const limitadorRecuperacion = crear({
    minutos: 60,
    maximo: 10,
    mensaje: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde',
})