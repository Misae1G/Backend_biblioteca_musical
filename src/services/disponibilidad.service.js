import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'

// Única función que fija la disponibilidad de una obra, a partir de lo que existe en la base:
// - prestadaFisicamente: hay un préstamo físico pendiente
// - enInterpretacion: hay al menos una interpretación programada
export const recalcularDisponibilidad = async (obraId) => {
    const [prestada, programada] = await Promise.all([
        Prestamo.exists({ obra: obraId, tipoEntrega: 'fisico', estado: 'pendiente' }),
        Interpretacion.exists({ obra: obraId, estado: 'programada' }),
    ])
    await Obra.updateOne(
        { _id: obraId },
        { prestadaFisicamente: !!prestada, enInterpretacion: !!programada }
    )
}
