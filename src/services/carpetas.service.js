import Carpeta from '../models/Carpeta.js'
import Obra from '../models/Obra.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { conMensajeDuplicado } from '../utils/duplicados.js'
import { escaparRegex } from '../utils/texto.js'

const MSG_DUPLICADO = 'Ya existe una carpeta con ese número'

const buscar = async (id) => {
    const carpeta = await Carpeta.findById(id)
    if (!carpeta) throw new ErrorApp(404, 'Carpeta no encontrada')
    return carpeta
}

export const listar = async ({ q, activa, pagina, limite }) => {
    const filtro = {}
    if (activa) filtro.activa = activa === 'true'
    if (q) {
        const re = new RegExp(escaparRegex(q), 'i')
        filtro.$or = [{ numero: re }, { ubicacionFisica: re }]
    }

    const [carpetas, total] = await Promise.all([
        Carpeta.find(filtro)
            .collation({ locale: 'es', numericOrdering: true }) // 1, 2, 10 (no 1, 10, 2)
            .sort({ numero: 1 })
            .skip((pagina - 1) * limite)
            .limit(limite),
        Carpeta.countDocuments(filtro),
    ])

    const conteos = await Obra.aggregate([
        { $match: { carpeta: { $in: carpetas.map((c) => c._id) }, activa: true } },
        { $group: { _id: '$carpeta', total: { $sum: 1 } } },
    ])
    const mapa = new Map(conteos.map((c) => [String(c._id), c.total]))

    return {
        carpetas: carpetas.map((c) => ({ ...c.toJSON(), cantidadObras: mapa.get(String(c._id)) ?? 0 })),
        total,
        pagina,
        paginas: Math.ceil(total / limite),
    }
}

export const obtener = async (id) => {
    const carpeta = await buscar(id)
    const obras = await Obra.find({ carpeta: carpeta._id, activa: true })
        .select('titulo autor tipoRegistro prestadaFisicamente enInterpretacion')
        .collation({ locale: 'es' })
        .sort({ titulo: 1 })
    return { carpeta, obras }
}

export const crear = (datos) => conMensajeDuplicado(MSG_DUPLICADO, () => Carpeta.create(datos))

export const editar = async (id, { numero, ubicacionFisica, observaciones }) => {
    const carpeta = await buscar(id)
    carpeta.set({ numero, ubicacionFisica, observaciones }) // un campo opcional ausente se borra
    await conMensajeDuplicado(MSG_DUPLICADO, () => carpeta.save())
    return carpeta
}

export const cambiarEstado = async (id, activa) => {
    const carpeta = await buscar(id)
    if (carpeta.activa === activa) return carpeta

    if (!activa) {
        const obras = await Obra.countDocuments({ carpeta: carpeta._id, activa: true })
        if (obras > 0) {
            throw new ErrorApp(409, `La carpeta tiene ${obras} obra(s) activa(s). Muévelas a otra carpeta antes de inactivarla`)
        }
    }
    carpeta.activa = activa
    await carpeta.save()
    return carpeta
}