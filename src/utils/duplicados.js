import { ErrorApp } from './ErrorApp.js'

// Convierte el error de valor duplicado de MongoDB en una respuesta 409 con mensaje claro
export const conMensajeDuplicado = async (mensaje, operacion) => {
    try {
        return await operacion()
    } catch (e) {
        if (e.code === 11000) throw new ErrorApp(409, mensaje)
        throw e
    }
}