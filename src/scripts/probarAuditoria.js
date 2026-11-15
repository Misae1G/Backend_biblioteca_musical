import 'dotenv/config'
import mongoose from 'mongoose'
import Auditoria, { ACCIONES_AUDITORIA } from '../models/Auditoria.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

// Solo se limpia lo de prueba, saltándose el bloqueo del modelo a propósito
const limpiar = () => Auditoria.collection.deleteMany({ descripcion: /^TEST/ })

const falla = async (datos, campo) => {
    try {
        await Auditoria.create(datos)
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    }
}

// Comprueba que la operación es rechazada por ser de solo lectura
const bloquea = async (operacion) => {
    try {
        await operacion()
        return false
    } catch (e) {
        return e.message.includes('solo lectura')
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    await Auditoria.init()
    await limpiar()

    try {
        const usuarioId = new mongoose.Types.ObjectId()
        const otroUsuarioId = new mongoose.Types.ObjectId()
        const registroId = new mongoose.Types.ObjectId()
        const base = {
            usuario: usuarioId,
            accion: 'crear_obra',
            registroId,
            descripcion: 'TEST Obra «Feliz Navidad» creada',
        }

        // Creación válida
        const a1 = await Auditoria.create(base)
        verificar('Crea un registro de auditoría válido', !!a1._id)
        verificar('La entidad se deduce de la acción', a1.entidad === 'obra')
        verificar('La fecha se asigna automáticamente',
            a1.fecha instanceof Date && Math.abs(Date.now() - a1.fecha.getTime()) < 60000)

        let todasCorrectas = true
        for (const [accion, entidad] of Object.entries(ACCIONES_AUDITORIA)) {
            const r = await Auditoria.create({ ...base, accion, descripcion: `TEST ${accion}` })
            if (r.entidad !== entidad) todasCorrectas = false
        }
        verificar('Las 6 acciones guardan la entidad correcta', todasCorrectas)

        const manual = await Auditoria.create({ ...base, accion: 'registrar_devolucion', entidad: 'obra', descripcion: 'TEST Entidad manual' })
        verificar('Ignora una entidad enviada a mano y usa la de la acción', manual.entidad === 'prestamo')

        // Validaciones
        verificar('Rechaza acción inválida', await falla({ ...base, accion: 'borrar_todo' }, 'accion'))
        verificar('Rechaza registro sin usuario', await falla({ ...base, usuario: undefined }, 'usuario'))
        verificar('Rechaza registro sin registro afectado', await falla({ ...base, registroId: undefined }, 'registroId'))
        verificar('Rechaza registro sin descripción', await falla({ ...base, descripcion: undefined }, 'descripcion'))
        verificar('Rechaza descripción demasiado larga', await falla({ ...base, descripcion: 'TEST ' + 'x'.repeat(400) }, 'descripcion'))

        // Solo lectura
        const filtroPrueba = { descripcion: /^TEST/ }
        a1.descripcion = 'TEST Modificada'
        verificar('Bloquea guardar cambios en un registro existente', await bloquea(() => a1.save()))
        verificar('Bloquea updateOne', await bloquea(() => Auditoria.updateOne({ _id: a1._id }, { descripcion: 'TEST X' })))
        verificar('Bloquea updateMany', await bloquea(() => Auditoria.updateMany(filtroPrueba, { descripcion: 'TEST X' })))
        verificar('Bloquea findOneAndUpdate', await bloquea(() => Auditoria.findOneAndUpdate({ _id: a1._id }, { descripcion: 'TEST X' })))
        verificar('Bloquea replaceOne', await bloquea(() => Auditoria.replaceOne({ _id: a1._id }, { ...base, descripcion: 'TEST X' })))
        verificar('Bloquea findOneAndReplace', await bloquea(() => Auditoria.findOneAndReplace({ _id: a1._id }, { ...base, descripcion: 'TEST X' })))
        verificar('Bloquea deleteOne de consulta', await bloquea(() => Auditoria.deleteOne({ _id: a1._id })))
        verificar('Bloquea deleteMany', await bloquea(() => Auditoria.deleteMany(filtroPrueba)))
        verificar('Bloquea findOneAndDelete', await bloquea(() => Auditoria.findOneAndDelete({ _id: a1._id })))
        verificar('Bloquea eliminar un documento', await bloquea(() => a1.deleteOne()))

        const intacto = await Auditoria.findById(a1._id)
        verificar('Tras todos los intentos el registro sigue intacto',
            intacto.descripcion === 'TEST Obra «Feliz Navidad» creada')

        // Consultas del historial
        await Auditoria.create({ ...base, usuario: otroUsuarioId, accion: 'modificar_obra', descripcion: 'TEST Obra modificada' })
        const deUsuario = await Auditoria.find({ usuario: usuarioId, descripcion: /^TEST/ }).sort({ fecha: -1 })
        verificar('Consulta el historial de un usuario, del más reciente al más antiguo',
            deUsuario.length >= 8 &&
            deUsuario.every((r, i) => i === 0 || deUsuario[i - 1].fecha >= r.fecha))

        const deRegistro = await Auditoria.find({ registroId, descripcion: /^TEST/ })
        verificar('Consulta el historial de un registro afectado', deRegistro.length === 9)
    } finally {
        await limpiar()
        await mongoose.disconnect()
    }

    const fallos = resultados.filter((r) => !r).length
    console.log(fallos === 0 ? '\nTodas las pruebas pasaron.' : `\n${fallos} prueba(s) fallaron.`)
    process.exit(fallos === 0 ? 0 : 1)
}

ejecutar().catch((e) => {
    console.error('Error en el script:', e)
    process.exit(1)
})