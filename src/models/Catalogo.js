import mongoose from 'mongoose'
import { normalizarTexto } from '../utils/texto.js'

export const TIPOS_CATALOGO = ['tipoObra', 'agrupacion', 'familiaInstrumento', 'instrumento']

const catalogoSchema = new mongoose.Schema(
    {
        tipo: {
            type: String,
            enum: { values: TIPOS_CATALOGO, message: 'El tipo de catálogo no es válido' },
            required: [true, 'El tipo de catálogo es obligatorio'],
        },
        nombre: {
            type: String,
            required: [true, 'El nombre es obligatorio'],
            trim: true,
            minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
            maxlength: [80, 'El nombre no puede superar 80 caracteres'],
        },
        nombreNormalizado: { type: String },
        // Solo para tipo "instrumento": familia a la que pertenece
        familia: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalogo' },
        activo: { type: Boolean, default: true },
        creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    },
    { timestamps: true }
)

// Evita duplicados como "Sinfónica" y "sinfonica" dentro del mismo tipo
catalogoSchema.index({ tipo: 1, nombreNormalizado: 1 }, { unique: true })
catalogoSchema.index({ tipo: 1, familia: 1 })

catalogoSchema.pre('validate', async function () {
    if (this.nombre) this.nombreNormalizado = normalizarTexto(this.nombre)

    if (this.tipo === 'instrumento') {
        if (!this.familia) {
            this.invalidate('familia', 'El instrumento debe pertenecer a una familia')
        } else {
            const familia = await this.constructor.findById(this.familia).select('tipo')
            if (!familia || familia.tipo !== 'familiaInstrumento') {
                this.invalidate('familia', 'La familia indicada no es válida')
            }
        }
    } else if (this.familia) {
        this.invalidate('familia', 'Solo los instrumentos pueden tener familia')
    }
})

catalogoSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Catalogo', catalogoSchema)