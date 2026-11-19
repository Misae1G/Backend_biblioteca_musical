import '../models/Usuario.js'
import Interpretacion from '../models/Interpretacion.js'
import Obra from '../models/Obra.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { normalizarTexto, escaparRegex } from '../utils/texto.js'
import { registrarAccion, recortar } from '../utils/auditoria.js'
import { recalcularDisponibilidad } from './disponibilidad.service.js'

const CAMPOS_EDITABLES = ['fechaPrevista', 'programa', 'director', 'solista', 'observaciones']

const ETIQUETAS = {
    programada: 'programada',
    interpretada: 'interpretada',
    cancelada: 'cancelada',
    no_interpretada: 'no interpretada',
}

// Desde "programada" se puede pasar a cualquier estado final.
// Una "interpretada" marcada por error puede volver a "programada".
const TRANSICIONES = {
    programada: ['interpretada', 'cancelada', 'no_interpretada'],
    interpretada: ['programada'],
    cancelada: [],
    no_interpretada: [],
}

const POPULATE = [
    { path: 'obra', select: 'titulo tipoRegistro carpeta activa', populate: { path: 'carpeta', select: 'numero ubicacionFisica' } },
    { path: 'registradoPor', select: 'nombre' },
]

const buscar = async (id) => {
    const interpretacion = await Interpretacion.findById(id)
    if (!interpretacion) throw new ErrorApp(404, 'Interpretación no encontrada')
    return interpretacion
}

const tituloDe = async (obraId) => recortar((await Obra.findById(obraId).select('titulo'))?.titulo ?? '', 100)
const dia = (fecha) => fecha.toISOString().slice(0, 10)

const consultar = (filtro, pagina, limite) =>
    Interpretacion.find(filtro)
        .populate([
            { path: 'obra', select: 'titulo carpeta', populate: { path: 'carpeta', select: 'numero' } },
            { path: 'registradoPor', select: 'nombre' },
        ])
        .sort({ fechaPrevista: -1, createdAt: -1, _id: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)

// ---------- Consulta ----------

export const listar = async (params) => {
    const { q, obra, estado, desde, hasta, pagina, limite } = params
    const filtro = {}
    if (obra) filtro.obra = obra
    if (estado) filtro.estado = estado
    if (desde || hasta) {
        filtro.fechaPrevista = { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) }
    }

    // Texto: código, programa o director (parcial, sin tildes ni mayúsculas)
    const texto = q ? normalizarTexto(q) : ''
    if (texto) {
        const regex = new RegExp(escaparRegex(texto))
        filtro.$or = [
            { codigo: new RegExp(escaparRegex(q.trim()), 'i') },
            { programaNormalizado: regex },
            { directorNormalizado: regex },
        ]
    }

    const [interpretaciones, total] = await Promise.all([
        consultar(filtro, pagina, limite),
        Interpretacion.countDocuments(filtro),
    ])
    return { interpretaciones, total, pagina, paginas: Math.ceil(total / limite) }
}

// Programación de la semana (lunes a domingo) que contiene la fecha; sin fecha, la semana actual de Ecuador
export const semana = async ({ fecha }) => {
    const base = fecha ?? new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })}T00:00:00.000Z`)
    const retroceso = (base.getUTCDay() + 6) % 7
    const lunes = new Date(base.getTime() - retroceso * 86400000)
    const domingo = new Date(lunes.getTime() + 6 * 86400000)

    const interpretaciones = await Interpretacion.find({ fechaPrevista: { $gte: lunes, $lte: domingo } })
        .populate([
            { path: 'obra', select: 'titulo carpeta', populate: { path: 'carpeta', select: 'numero' } },
        ])
        .sort({ fechaPrevista: 1, createdAt: 1, _id: 1 })

    return { desde: dia(lunes), hasta: dia(domingo), interpretaciones }
}

export const obtener = async (id) => {
    const interpretacion = await Interpretacion.findById(id).populate(POPULATE)
    if (!interpretacion) throw new ErrorApp(404, 'Interpretación no encontrada')
    return interpretacion
}

// ---------- Escritura ----------

export const crear = async (datos, usuario) => {
    const obra = await Obra.findById(datos.obra).select('titulo activa')
    if (!obra) throw new ErrorApp(400, 'La obra no existe')
    if (!obra.activa) throw new ErrorApp(409, 'La obra está inactiva y no se puede programar')

    const interpretacion = new Interpretacion({ ...datos, registradoPor: usuario._id })
    await interpretacion.save()
    await recalcularDisponibilidad(interpretacion.obra)

    await registrarAccion(
        usuario, 'registrar_interpretacion', interpretacion._id,
        `Interpretación ${interpretacion.codigo} de «${recortar(obra.titulo, 100)}» programada para el ${dia(interpretacion.fechaPrevista)}`
    )
    await interpretacion.populate(POPULATE)
    return interpretacion
}

export const editar = async (id, datos, usuario) => {
    const interpretacion = await buscar(id)
    for (const campo of CAMPOS_EDITABLES) interpretacion.set(campo, datos[campo]) // un campo opcional omitido se borra
    await interpretacion.save()

    await registrarAccion(
        usuario, 'modificar_interpretacion', interpretacion._id,
        `Interpretación ${interpretacion.codigo} de «${await tituloDe(interpretacion.obra)}» modificada`
    )
    await interpretacion.populate(POPULATE)
    return interpretacion
}

export const cambiarEstado = async (id, estado, usuario) => {
    const interpretacion = await buscar(id)
    const anterior = interpretacion.estado

    if (anterior === estado) throw new ErrorApp(409, `La interpretación ya está ${ETIQUETAS[estado]}`)
    if (!TRANSICIONES[anterior].includes(estado)) {
        throw new ErrorApp(409, `Una interpretación ${ETIQUETAS[anterior]} no puede pasar a ${ETIQUETAS[estado]}`)
    }

    if (estado === 'programada') {
        const obra = await Obra.findById(interpretacion.obra).select('activa')
        if (!obra?.activa) throw new ErrorApp(409, 'La obra está inactiva. Reactívala para volver a programar')
    }

    interpretacion.estado = estado
    await interpretacion.save()
    await recalcularDisponibilidad(interpretacion.obra)

    await registrarAccion(
        usuario, 'modificar_interpretacion', interpretacion._id,
        `Interpretación ${interpretacion.codigo} de «${await tituloDe(interpretacion.obra)}»: de ${ETIQUETAS[anterior]} a ${ETIQUETAS[estado]}`
    )
    await interpretacion.populate(POPULATE)
    return interpretacion
}
