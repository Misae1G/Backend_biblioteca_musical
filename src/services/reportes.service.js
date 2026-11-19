import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import {
    construirObras, construirInventario, construirPrestamos, construirInterpretaciones, construirCopia,
} from './reportes.builders.js'

const rango = (desde, hasta) => ({ ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) })

const POPULATE_OBRA = [
    { path: 'carpeta', select: 'numero ubicacionFisica' },
    { path: 'tipoObra', select: 'nombre' },
    { path: 'agrupacion', select: 'nombre' },
]

const obrasActivas = () =>
    Obra.find({ activa: true })
        .select('titulo autor tipoRegistro tipoObra agrupacion procedencia carpeta prestadaFisicamente enInterpretacion pendienteDeCompletar activa')
        .populate(POPULATE_OBRA)
        .collation({ locale: 'es' })
        .sort({ titulo: 1 })
        .lean()

const carpetasActivas = () => Carpeta.find({ activa: true }).lean()

// Se ordenan por registro para que, al agrupar, se muestre siempre la primera escritura de cada nombre
const prestamosDe = (filtro) =>
    Prestamo.find(filtro).sort({ createdAt: 1, _id: 1 }).populate('obra', 'titulo').lean()

const interpretacionesDe = (filtro) =>
    Interpretacion.find(filtro)
        .sort({ createdAt: 1, _id: 1 })
        .populate({ path: 'obra', select: 'titulo carpeta', populate: { path: 'carpeta', select: 'numero' } })
        .lean()

// Devuelve el reporte (datos listos para mostrar o exportar). desde/hasta se aplican a préstamos e interpretaciones.
export const generar = async (tipo, { desde, hasta } = {}) => {
    switch (tipo) {
        case 'obras': {
            const [obras, carpetas, totalInactivas] = await Promise.all([
                obrasActivas(), carpetasActivas(), Obra.countDocuments({ activa: false }),
            ])
            return construirObras({ obras, carpetas, totalInactivas })
        }
        case 'inventario': {
            const [obras, carpetas] = await Promise.all([obrasActivas(), carpetasActivas()])
            return construirInventario({ obras, carpetas })
        }
        case 'prestamos': {
            const filtro = desde || hasta ? { fechaEntrega: rango(desde, hasta) } : {}
            return construirPrestamos({ prestamos: await prestamosDe(filtro), desde, hasta })
        }
        case 'interpretaciones': {
            const filtro = desde || hasta ? { fechaPrevista: rango(desde, hasta) } : {}
            return construirInterpretaciones({ interpretaciones: await interpretacionesDe(filtro), desde, hasta })
        }
        case 'copia': {
            const [obras, carpetas, prestamos, interpretaciones] = await Promise.all([
                Obra.find()
                    .populate([
                        ...POPULATE_OBRA,
                        { path: 'instrumentacion.familia', select: 'nombre' },
                        { path: 'instrumentacion.instrumento', select: 'nombre' },
                    ])
                    .collation({ locale: 'es' })
                    .sort({ titulo: 1 })
                    .lean(),
                Carpeta.find().lean(),
                prestamosDe({}).then((lista) => lista.sort((a, b) => a.codigo.localeCompare(b.codigo))),
                interpretacionesDe({}).then((lista) => lista.sort((a, b) => a.codigo.localeCompare(b.codigo))),
            ])
            return construirCopia({ obras, carpetas, prestamos, interpretaciones })
        }
        default:
            throw new Error(`Tipo de reporte desconocido: ${tipo}`)
    }
}
