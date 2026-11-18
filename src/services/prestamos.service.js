import '../models/Usuario.js'
import Prestamo from '../models/Prestamo.js'
import Obra from '../models/Obra.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { normalizarTexto, escaparRegex } from '../utils/texto.js'
import { conMensajeDuplicado } from '../utils/duplicados.js'
import { registrarAccion, recortar } from '../utils/auditoria.js'
import { recalcularDisponibilidad } from './disponibilidad.service.js'

const CAMPOS_EDITABLES = [
    'fechaSolicitud', 'solicitante', 'institucion', 'personaQueRecibe', 'fechaEntrega', 'observaciones',
]
const CAMPOS_DEVOLUCION = ['fechaDevolucion', 'personaQueDevuelve', 'estadoFisico', 'observaciones']

const ETIQUETA_ESTADO = { buen_estado: 'buen estado', deteriorado: 'deteriorado', danado: 'dañado' }

const POPULATE = [
    { path: 'obra', select: 'titulo tipoRegistro carpeta activa', populate: { path: 'carpeta', select: 'numero ubicacionFisica' } },
    { path: 'registradoPor', select: 'nombre' },
    { path: 'devolucion.recibidoPor', select: 'nombre' },
]

const buscar = async (id) => {
    const prestamo = await Prestamo.findById(id)
    if (!prestamo) throw new ErrorApp(404, 'Préstamo no encontrado')
    return prestamo
}

const tituloDe = async (obraId) => recortar((await Obra.findById(obraId).select('titulo'))?.titulo ?? '', 100)

// ---------- Consulta ----------

export const listar = async (params) => {
    const { q, obra, tipoEntrega, estado, desde, hasta, pagina, limite } = params
    const filtro = {}
    if (obra) filtro.obra = obra
    if (tipoEntrega) filtro.tipoEntrega = tipoEntrega
    if (estado) filtro.estado = estado
    if (desde || hasta) {
        filtro.fechaEntrega = { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) }
    }

    // Texto: código, solicitante o institución/orquesta (parcial, sin tildes ni mayúsculas)
    const texto = q ? normalizarTexto(q) : ''
    if (texto) {
        const regex = new RegExp(escaparRegex(texto))
        filtro.$or = [
            { codigo: new RegExp(escaparRegex(q.trim()), 'i') },
            { solicitanteNormalizado: regex },
            { institucionNormalizada: regex },
        ]
    }

    const [prestamos, total] = await Promise.all([
        Prestamo.find(filtro)
            .populate([
                { path: 'obra', select: 'titulo carpeta', populate: { path: 'carpeta', select: 'numero' } },
                { path: 'registradoPor', select: 'nombre' },
            ])
            .sort({ fechaEntrega: -1, createdAt: -1, _id: -1 })
            .skip((pagina - 1) * limite)
            .limit(limite),
        Prestamo.countDocuments(filtro),
    ])
    return { prestamos, total, pagina, paginas: Math.ceil(total / limite) }
}

export const obtener = async (id) => {
    const prestamo = await Prestamo.findById(id).populate(POPULATE)
    if (!prestamo) throw new ErrorApp(404, 'Préstamo no encontrado')
    return prestamo
}

// ---------- Escritura ----------

export const crear = async (datos, usuario) => {
    const obra = await Obra.findById(datos.obra).select('titulo activa')
    if (!obra) throw new ErrorApp(400, 'La obra no existe')
    if (!obra.activa) throw new ErrorApp(409, 'La obra está inactiva y no se puede prestar')

    const prestamo = new Prestamo({ ...datos, registradoPor: usuario._id })
    await conMensajeDuplicado('Esta obra ya tiene un préstamo físico pendiente de devolución', () => prestamo.save())

    if (prestamo.tipoEntrega === 'fisico') await recalcularDisponibilidad(prestamo.obra)

    await registrarAccion(
        usuario, 'registrar_prestamo', prestamo._id,
        `Préstamo ${prestamo.codigo} (${prestamo.tipoEntrega}) de «${recortar(obra.titulo, 100)}» a ${recortar(prestamo.solicitante, 60)}`
    )
    await prestamo.populate(POPULATE)
    return prestamo
}

export const editar = async (id, datos, usuario) => {
    const prestamo = await buscar(id)
    for (const campo of CAMPOS_EDITABLES) prestamo.set(campo, datos[campo]) // un campo opcional omitido se borra
    await prestamo.save()

    await registrarAccion(
        usuario, 'registrar_prestamo', prestamo._id,
        `Préstamo ${prestamo.codigo} de «${await tituloDe(prestamo.obra)}» modificado`
    )
    await prestamo.populate(POPULATE)
    return prestamo
}

export const devolver = async (id, datos, usuario) => {
    const prestamo = await buscar(id)
    if (prestamo.tipoEntrega === 'digital') throw new ErrorApp(409, 'Los préstamos digitales no tienen devolución')
    if (prestamo.devolucion) throw new ErrorApp(409, 'Este préstamo ya fue devuelto')

    prestamo.devolucion = { ...datos, recibidoPor: usuario._id }
    await prestamo.save()
    await recalcularDisponibilidad(prestamo.obra)

    await registrarAccion(
        usuario, 'registrar_devolucion', prestamo._id,
        `Devolución del préstamo ${prestamo.codigo} de «${await tituloDe(prestamo.obra)}» (${ETIQUETA_ESTADO[datos.estadoFisico]})`
    )
    await prestamo.populate(POPULATE)
    return prestamo
}

export const editarDevolucion = async (id, datos, usuario) => {
    const prestamo = await buscar(id)
    if (!prestamo.devolucion) throw new ErrorApp(409, 'Este préstamo aún no tiene devolución')
    for (const campo of CAMPOS_DEVOLUCION) prestamo.devolucion.set(campo, datos[campo])
    await prestamo.save()

    await registrarAccion(
        usuario, 'registrar_devolucion', prestamo._id,
        `Devolución del préstamo ${prestamo.codigo} de «${await tituloDe(prestamo.obra)}» modificada (${ETIQUETA_ESTADO[prestamo.devolucion.estadoFisico]})`
    )
    await prestamo.populate(POPULATE)
    return prestamo
}
