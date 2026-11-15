import mongoose from 'mongoose'

const contadorSchema = new mongoose.Schema(
    {
        _id: { type: String }, // nombre del contador: 'prestamo', 'interpretacion'
        ultimo: { type: Number, default: 0 },
    },
    { versionKey: false }
)

const Contador = mongoose.model('Contador', contadorSchema, 'contadores')

// Devuelve el siguiente código: generarCodigo('prestamo', 'PRE') -> 'PRE-0001'
export const generarCodigo = async (nombre, prefijo, digitos = 4) => {
    const contador = await Contador.findOneAndUpdate(
        { _id: nombre },
        { $inc: { ultimo: 1 } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    return `${prefijo}-${String(contador.ultimo).padStart(digitos, '0')}`
}

export default Contador