import mongoose from 'mongoose'

// Cada acción pertenece siempre a un tipo de registro
export const ACCIONES_AUDITORIA = {
    crear_obra: 'obra',
    modificar_obra: 'obra',
    registrar_prestamo: 'prestamo',
    registrar_devolucion: 'prestamo',
    registrar_interpretacion: 'interpretacion',
    modificar_interpretacion: 'interpretacion',
}

const MENSAJE_SOLO_LECTURA =
    'El historial de acciones es de solo lectura: no se pueden modificar ni eliminar registros'

const auditoriaSchema = new mongoose.Schema(
    {
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: [true, 'El usuario es obligatorio'] },
        accion: {
            type: String,
            enum: { values: Object.keys(ACCIONES_AUDITORIA), message: 'La acción no es válida' },
            required: [true, 'La acción es obligatoria'],
        },
        // Se deduce de la acción
        entidad: { type: String, enum: ['obra', 'prestamo', 'interpretacion'] },
        registroId: { type: mongoose.Schema.Types.ObjectId, required: [true, 'El registro afectado es obligatorio'] },
        descripcion: {
            type: String,
            trim: true,
            required: [true, 'La descripción es obligatoria'],
            maxlength: [300, 'La descripción no puede superar 300 caracteres'],
        },
        fecha: { type: Date, default: Date.now, immutable: true },
    },
    { versionKey: false }
)

auditoriaSchema.index({ fecha: -1 })
auditoriaSchema.index({ usuario: 1, fecha: -1 })
auditoriaSchema.index({ registroId: 1, fecha: -1 })
auditoriaSchema.index({ accion: 1, fecha: -1 })

auditoriaSchema.pre('validate', function () {
    this.entidad = ACCIONES_AUDITORIA[this.accion]
})

// Solo se permite crear: se bloquea todo intento de modificar o borrar
auditoriaSchema.pre('save', function () {
    if (!this.isNew) throw new Error(MENSAJE_SOLO_LECTURA)
})

auditoriaSchema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
        'deleteOne', 'deleteMany', 'findOneAndDelete'],
    { query: true, document: false },
    function () {
        throw new Error(MENSAJE_SOLO_LECTURA)
    }
)

auditoriaSchema.pre(['updateOne', 'deleteOne'], { query: false, document: true }, function () {
    throw new Error(MENSAJE_SOLO_LECTURA)
})

auditoriaSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Auditoria', auditoriaSchema, 'auditoria')