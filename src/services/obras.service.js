import '../models/Usuario.js'
import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { normalizarTexto, escaparRegex } from '../utils/texto.js'
import { registrarAccion, recortar } from '../utils/auditoria.js'

const CAMPOS = [
    'titulo', 'tipoRegistro', 'autor', 'arreglista', 'orquestador', 'opus',
    'anioComposicion', 'anioArreglo', 'tipoObra', 'procedencia', 'agrupacion',
    'instrumentacion', 'tonalidad', 'compas', 'tiempo', 'duracion', 'numeroMovimientos',
    'edicion', 'formato', 'detalleMaterial', 'estadoMaterial', 'factibleSinVoz', 'directorConcierto', 'solistaConcierto', 'requiereRevision',
    'carpeta', 'observaciones', 'obraOriginal', 'canciones',
]

const CAMPOS_DOCUMENTO = ['nombre', 'tipoArchivo', 'enlace', 'observaciones']

const ETIQUETAS = {
    titulo: 'el título',
    tipoRegistro: 'el tipo de registro',
    carpeta: 'la carpeta',
    autor: 'el autor',
    tipoObra: 'el tipo de obra',
    procedencia: 'la procedencia',
    agrupacion: 'la agrupación',
}

// Datos que debe tener una obra para considerarse completa (el autor no se exige en mosaicos)
export const camposFaltantes = (obra) => {
    const requeridos = ['titulo', 'tipoRegistro', 'carpeta', 'tipoObra', 'procedencia', 'agrupacion']
    if (obra.tipoRegistro !== 'mosaico') requeridos.push('autor')
    return requeridos.filter((campo) => !obra[campo])
}

const POPULATE_FICHA = [
    { path: 'carpeta', select: 'numero ubicacionFisica activa' },
    { path: 'tipoObra', select: 'nombre' },
    { path: 'agrupacion', select: 'nombre' },
    { path: 'instrumentacion.familia', select: 'nombre' },
    { path: 'instrumentacion.instrumento', select: 'nombre' },
    { path: 'obraOriginal', select: 'titulo autor tipoRegistro' },
    { path: 'creadaPor', select: 'nombre' },
    { path: 'modificadaPor', select: 'nombre' },
]

const CAMPOS_LISTA =
    'titulo autor arreglista orquestador tipoRegistro procedencia carpeta tipoObra agrupacion ' +
    'prestadaFisicamente enInterpretacion activa pendienteDeCompletar requiereRevision canciones'

const extraerCampos = (datos) => {
    const campos = Object.fromEntries(CAMPOS.map((c) => [c, datos[c]]))
    campos.instrumentacion = (datos.instrumentacion ?? []).map((fila) => ({
        familia: fila.familia,
        instrumento: fila.instrumento,
        ...(fila.cantidad !== undefined && { cantidad: fila.cantidad }),
    }))
    campos.canciones = datos.canciones ?? []
    return campos
}

const exigirCompleto = (datos) => {
    const faltan = camposFaltantes(datos)
    if (!faltan.length) return
    throw new ErrorApp(
        400,
        `Faltan datos obligatorios: ${faltan.map((c) => ETIQUETAS[c]).join(', ')}`,
        Object.fromEntries(faltan.map((c) => [c, `Falta ${ETIQUETAS[c]}`]))
    )
}

const buscar = async (id) => {
    const obra = await Obra.findById(id)
    if (!obra) throw new ErrorApp(404, 'Obra no encontrada')
    return obra
}

const buscarActiva = async (id) => {
    const obra = await buscar(id)
    if (!obra.activa) throw new ErrorApp(409, 'La obra está inactiva. Reactívala para modificarla')
    return obra
}

// Una carpeta inactiva no recibe obras; si la obra ya estaba en ella, no se reclama
const verificarCarpeta = async (carpetaId, carpetaActualId) => {
    if (carpetaActualId && String(carpetaActualId) === String(carpetaId)) return
    const carpeta = await Carpeta.findById(carpetaId).select('activa')
    if (carpeta && !carpeta.activa) {
        throw new ErrorApp(409, 'La carpeta está inactiva. Elige otra o reactívala')
    }
}

// Los valores de catálogo inactivos no se asignan, salvo los que la obra ya tenía
const verificarCatalogosActivos = async (datos, obraActual) => {
    const actuales = new Set(
        obraActual
            ? [
                obraActual.tipoObra,
                obraActual.agrupacion,
                ...obraActual.instrumentacion.flatMap((i) => [i.familia, i.instrumento]),
            ].filter(Boolean).map(String)
            : []
    )
    const ids = [
        datos.tipoObra,
        datos.agrupacion,
        ...(datos.instrumentacion ?? []).flatMap((i) => [i.familia, i.instrumento]),
    ].filter(Boolean).filter((id) => !actuales.has(String(id)))

    if (!ids.length) return
    const inactivos = await Catalogo.find({ _id: { $in: ids }, activo: false }).select('nombre')
    if (inactivos.length) {
        throw new ErrorApp(
            409,
            `Hay valores inactivos que no se pueden asignar: ${inactivos.map((i) => i.nombre).join(', ')}`
        )
    }
}

const titulo = (obra) => recortar(obra.titulo, 120)

// ---------- Consulta ----------

export const listar = async (params) => {
    const {
        q, carpeta, tipoObra, agrupacion, instrumento, familia, procedencia, tipoRegistro,
        disponibilidad, activa = 'true', pendienteDeCompletar, requiereRevision, pagina, limite,
    } = params

    const vacio = { obras: [], total: 0, pagina, paginas: 0 }
    const filtro = {}

    if (activa !== 'todas') filtro.activa = activa === 'true'
    if (pendienteDeCompletar) filtro.pendienteDeCompletar = pendienteDeCompletar === 'true'
    if (requiereRevision) filtro.requiereRevision = requiereRevision === 'true'
    if (procedencia) filtro.procedencia = procedencia
    if (tipoRegistro) filtro.tipoRegistro = tipoRegistro
    if (tipoObra) filtro.tipoObra = tipoObra
    if (agrupacion) filtro.agrupacion = agrupacion
    if (instrumento) filtro['instrumentacion.instrumento'] = instrumento
    if (familia) filtro['instrumentacion.familia'] = familia

    if (disponibilidad) {
        filtro.prestadaFisicamente = disponibilidad.includes('prestada')
        filtro.enInterpretacion = disponibilidad.startsWith('en_interpretacion')
    }

    if (carpeta) {
        const c = await Carpeta.findOne({ numero: carpeta.toUpperCase() }).select('_id')
        if (!c) return vacio
        filtro.carpeta = c._id
    }

    // Texto: todas las palabras deben aparecer (en cualquier orden), sin tildes ni mayúsculas.
    // Si el texto es exactamente un número de carpeta, también se traen las obras de esa carpeta.
    const palabras = q ? normalizarTexto(q).split(' ').filter(Boolean).slice(0, 6) : []
    if (palabras.length) {
        const porTexto = { $and: palabras.map((p) => ({ busqueda: new RegExp(escaparRegex(p)) })) }
        const c = await Carpeta.findOne({ numero: q.trim().toUpperCase() }).select('_id')
        filtro.$and = [c ? { $or: [porTexto, { carpeta: c._id }] } : porTexto]
    }

    const [docs, total] = await Promise.all([
        Obra.find(filtro)
            .select(CAMPOS_LISTA)
            .populate([
                { path: 'carpeta', select: 'numero ubicacionFisica' },
                { path: 'tipoObra', select: 'nombre' },
                { path: 'agrupacion', select: 'nombre' },
            ])
            .collation({ locale: 'es' })
            .sort({ titulo: 1, _id: 1 })
            .skip((pagina - 1) * limite)
            .limit(limite),
        Obra.countDocuments(filtro),
    ])

    const obras = docs.map((doc) => {
        const { canciones = [], ...obra } = doc.toJSON()
        if (obra.tipoRegistro === 'mosaico') {
            obra.totalCanciones = canciones.length
            if (palabras.length) {
                obra.cancionesCoincidentes = canciones
                    .filter((c) => {
                        const texto = normalizarTexto(`${c.titulo} ${c.compositor ?? ''}`)
                        return palabras.some((p) => texto.includes(p))
                    })
                    .map((c) => c.titulo)
            }
        }
        return obra
    })

    return { obras, total, pagina, paginas: Math.ceil(total / limite) }
}

export const obtener = async (id) => {
    const obra = await Obra.findById(id).populate(POPULATE_FICHA)
    if (!obra) throw new ErrorApp(404, 'Obra no encontrada')

    const adaptacionesDe = (originalId, excluirId) =>
        Obra.find({ obraOriginal: originalId, activa: true, ...(excluirId && { _id: { $ne: excluirId } }) })
            .select('titulo autor arreglista carpeta')
            .populate('carpeta', 'numero ubicacionFisica')
            .collation({ locale: 'es' })
            .sort({ titulo: 1 })

    const [adaptaciones, otrasAdaptaciones, mosaicosRelacionados, prestamos, interpretaciones, vecesInterpretada] =
        await Promise.all([
            adaptacionesDe(obra._id),
            obra.obraOriginal ? adaptacionesDe(obra.obraOriginal._id, obra._id) : [],
            obra.tipoRegistro === 'mosaico'
                ? []
                : Obra.find({ tipoRegistro: 'mosaico', activa: true, 'canciones.titulo': obra.titulo })
                    .collation({ locale: 'es', strength: 1 })
                    .select('titulo carpeta')
                    .populate('carpeta', 'numero ubicacionFisica'),
            Prestamo.find({ obra: obra._id })
                .sort({ fechaEntrega: -1, createdAt: -1 })
                .limit(50)
                .select('codigo solicitante institucion personaQueRecibe tipoEntrega fechaEntrega estado devolucion'),
            Interpretacion.find({ obra: obra._id })
                .sort({ fechaPrevista: -1 })
                .limit(50)
                .select('codigo fechaPrevista programa director solista estado'),
            Interpretacion.countDocuments({ obra: obra._id, estado: 'interpretada' }),
        ])

    return { obra, adaptaciones, otrasAdaptaciones, mosaicosRelacionados, prestamos, interpretaciones, vecesInterpretada }
}

// ---------- Escritura ----------

export const crear = async (datos, usuario) => {
    exigirCompleto(datos)
    await verificarCarpeta(datos.carpeta)
    await verificarCatalogosActivos(datos)

    const obra = new Obra({
        ...extraerCampos(datos),
        creadaPor: usuario._id,
        modificadaPor: usuario._id,
        pendienteDeCompletar: false,
    })
    await obra.save()

    await registrarAccion(usuario, 'crear_obra', obra._id, `Obra «${titulo(obra)}» creada`)
    await obra.populate(POPULATE_FICHA)
    return obra
}

export const editar = async (id, datos, usuario) => {
    const obra = await buscarActiva(id)

    // Una obra completa debe seguir completa; una pendiente puede guardarse por partes
    if (!obra.pendienteDeCompletar) exigirCompleto(datos)
    await verificarCarpeta(datos.carpeta, obra.carpeta)
    await verificarCatalogosActivos(datos, obra)

    for (const [campo, valor] of Object.entries(extraerCampos(datos))) obra.set(campo, valor)
    obra.modificadaPor = usuario._id
    obra.pendienteDeCompletar = camposFaltantes(obra).length > 0
    await obra.save()

    await registrarAccion(usuario, 'modificar_obra', obra._id, `Obra «${titulo(obra)}» modificada`)
    await obra.populate(POPULATE_FICHA)
    return obra
}

export const cambiarEstado = async (id, activa, usuario) => {
    const obra = await buscar(id)
    if (obra.activa === activa) return obra

    if (!activa) {
        const [prestada, programada] = await Promise.all([
            Prestamo.exists({ obra: obra._id, tipoEntrega: 'fisico', estado: 'pendiente' }),
            Interpretacion.exists({ obra: obra._id, estado: 'programada' }),
        ])
        if (prestada) throw new ErrorApp(409, 'La obra tiene un préstamo físico pendiente de devolución')
        if (programada) throw new ErrorApp(409, 'La obra tiene interpretaciones programadas')
    } else {
        const carpeta = await Carpeta.findById(obra.carpeta).select('activa')
        if (carpeta && !carpeta.activa) {
            throw new ErrorApp(409, 'La carpeta de esta obra está inactiva. Reactívala primero')
        }
    }

    obra.activa = activa
    obra.modificadaPor = usuario._id
    await obra.save()

    await registrarAccion(
        usuario, 'modificar_obra', obra._id,
        `Obra «${titulo(obra)}» ${activa ? 'activada' : 'inactivada'}`
    )
    return obra
}

// ---------- Documentos digitales ----------

const datosDocumento = (datos) =>
    Object.fromEntries(CAMPOS_DOCUMENTO.filter((c) => datos[c] !== undefined).map((c) => [c, datos[c]]))

export const agregarDocumento = async (id, datos, usuario) => {
    const obra = await buscarActiva(id)
    obra.documentos.push(datosDocumento(datos))
    obra.modificadaPor = usuario._id
    await obra.save()

    const documento = obra.documentos[obra.documentos.length - 1]
    await registrarAccion(
        usuario, 'modificar_obra', obra._id,
        `Documento «${recortar(documento.nombre, 60)}» agregado a la obra «${titulo(obra)}»`
    )
    return { documento, documentos: obra.documentos }
}

const buscarDocumento = (obra, docId) => {
    const documento = obra.documentos.id(docId)
    if (!documento) throw new ErrorApp(404, 'Documento no encontrado')
    return documento
}

export const editarDocumento = async (id, docId, datos, usuario) => {
    const obra = await buscarActiva(id)
    const documento = buscarDocumento(obra, docId)
    for (const campo of CAMPOS_DOCUMENTO) documento.set(campo, datos[campo]) // un campo ausente se borra
    obra.modificadaPor = usuario._id
    await obra.save()

    await registrarAccion(
        usuario, 'modificar_obra', obra._id,
        `Documento «${recortar(documento.nombre, 60)}» modificado en la obra «${titulo(obra)}»`
    )
    return { documento, documentos: obra.documentos }
}

export const eliminarDocumento = async (id, docId, usuario) => {
    const obra = await buscarActiva(id)
    const documento = buscarDocumento(obra, docId)
    const nombre = documento.nombre
    obra.documentos.pull(documento._id)
    obra.modificadaPor = usuario._id
    await obra.save()

    await registrarAccion(
        usuario, 'modificar_obra', obra._id,
        `Documento «${recortar(nombre, 60)}» eliminado de la obra «${titulo(obra)}»`
    )
    return { documentos: obra.documentos }
}
