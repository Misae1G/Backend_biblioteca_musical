import mongoose from 'mongoose'

const carpetaSchema = new mongoose.Schema(
    {
        numero: {
            type: String,
            required: [true, 'El número de carpeta es obligatorio'],
            trim: true,
            uppercase: true,
            unique: true,
            maxlength: [20, 'El número de carpeta no puede superar 20 caracteres'],
            match: [/^[A-Z0-9-]+$/, 'El número de carpeta solo admite letras, números y guion'],
        },
        ubicacionFisica: {
            type: String,
            trim: true,
            maxlength: [150, 'La ubicación no puede superar 150 caracteres'],
        },
        // Última revisión física de la carpeta (dato del catálogo original)
        ultimaRevision: { type: Date },
        revisadaPor: {
            type: String,
            trim: true,
            maxlength: [100, 'El nombre de quien revisó no puede superar 100 caracteres'],
        },
        observaciones: {
            type: String,
            trim: true,
            maxlength: [500, 'Las observaciones no pueden superar 500 caracteres'],
        },
        activa: { type: Boolean, default: true },
    },
    { timestamps: true }
)

carpetaSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Carpeta', carpetaSchema)
