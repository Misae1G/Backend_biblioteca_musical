import mongoose from 'mongoose'
import { ZodError } from 'zod'
import { ErrorApp } from '../utils/ErrorApp.js'

export const rutaNoEncontrada = (req, res) => {
    res.status(404).json({ msg: 'Ruta no encontrada' })
}

// Todas las respuestas de error tienen la forma { msg, errores? }
export const manejarErrores = (err, req, res, next) => {
    if (res.headersSent) return next(err)

    if (err instanceof ErrorApp) {
        return res.status(err.estado).json({
            msg: err.message,
            ...(err.detalles && { errores: err.detalles }),
        })
    }

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ msg: 'El cuerpo de la petición no es un JSON válido' })
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ msg: 'La petición es demasiado grande' })
    }

    if (err instanceof mongoose.Error.ValidationError) {
        const errores = Object.fromEntries(
            Object.entries(err.errors).map(([campo, e]) => [campo, e.message])
        )
        return res.status(400).json({ msg: Object.values(errores)[0], errores })
    }

    if (err instanceof mongoose.Error.CastError) {
        return res.status(400).json({ msg: 'El identificador no es válido' })
    }

    if (err.code === 11000) {
        const campos = Object.keys(err.keyValue || {}).join(', ')
        return res.status(409).json({ msg: `Ya existe un registro con ese valor${campos ? ` (${campos})` : ''}` })
    }

    if (err instanceof ZodError) {
        const errores = {}
        for (const problema of err.issues) {
            const campo = problema.path.join('.') || 'cuerpo'
            errores[campo] ??= problema.message
        }
        return res.status(400).json({ msg: Object.values(errores)[0], errores })
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ msg: 'La sesión no es válida o ha expirado' })
    }

    console.error(err)
    res.status(500).json({ msg: 'Error interno del servidor' })
}