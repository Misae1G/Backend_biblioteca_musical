import Auditoria from '../models/Auditoria.js'

export const recortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto)

// Si el historial fallara, no se cancela la operación ya realizada: se avisa en la terminal
export const registrarAccion = async (usuario, accion, registroId, descripcion) => {
    try {
        await Auditoria.create({
            usuario: usuario._id,
            accion,
            registroId,
            descripcion: recortar(descripcion, 300),
        })
    } catch (e) {
        console.error('No se pudo registrar la acción en el historial:', e.message)
    }
}