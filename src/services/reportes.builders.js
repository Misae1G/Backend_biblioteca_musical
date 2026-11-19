import { normalizarTexto } from '../utils/texto.js'

// Funciones puras: reciben los datos ya consultados y devuelven el reporte.
// Un reporte tiene: { tipo, titulo, filtros: [{etiqueta, valor}], resumen: [{etiqueta, valor}],
//                     secciones: [{ titulo, columnas: [{clave, etiqueta, numero?}], filas: [{...}] }] }

const COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
const porTexto = (a, b) => COLLATOR.compare(a ?? '', b ?? '')

export const dia = (fecha) => (fecha ? new Date(fecha).toISOString().slice(0, 10) : '')
const mes = (fecha) => dia(fecha).slice(0, 7)
const siNo = (valor) => (valor ? 'Sí' : 'No')
const duracion = (segundos) =>
    segundos === undefined || segundos === null ? '' : `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`

const REGISTRO = { original: 'Original', adaptacion: 'Adaptación', mosaico: 'Mosaico' }
const PROCEDENCIA = { ecuatoriana: 'Ecuatoriana', universal: 'Universal' }
const ENTREGA = { fisico: 'Físico', digital: 'Digital' }
const ESTADO_PRESTAMO = { pendiente: 'Pendiente', devuelto: 'Devuelto', finalizado: 'Finalizado' }
const ESTADO_FISICO = { buen_estado: 'Buen estado', deteriorado: 'Deteriorado', danado: 'Dañado' }
const ESTADO_INTERPRETACION = {
    programada: 'Programada', interpretada: 'Interpretada', cancelada: 'Cancelada', no_interpretada: 'No interpretada',
}

export const DISPONIBILIDAD = {
    disponible: 'Disponible',
    en_interpretacion: 'En interpretación',
    prestada_fisicamente: 'Prestada físicamente',
    en_interpretacion_y_prestada: 'En interpretación y prestada físicamente',
}

export const estadoDisponibilidad = (obra) => {
    if (obra.enInterpretacion && obra.prestadaFisicamente) return 'en_interpretacion_y_prestada'
    if (obra.enInterpretacion) return 'en_interpretacion'
    if (obra.prestadaFisicamente) return 'prestada_fisicamente'
    return 'disponible'
}

const col = (clave, etiqueta, numero = false) => ({ clave, etiqueta, numero })
const seccion = (titulo, columnas, filas) => ({ titulo, columnas, filas })
const dato = (etiqueta, valor) => ({ etiqueta, valor })

// Agrupa sin distinguir tildes ni mayúsculas; el nombre mostrado es la primera escritura encontrada
const agrupar = (items, nombreDe) => {
    const grupos = new Map()
    for (const item of items) {
        const nombre = nombreDe(item)
        const clave = normalizarTexto(nombre)
        const grupo = grupos.get(clave) ?? { nombre, items: [] }
        grupo.items.push(item)
        grupos.set(clave, grupo)
    }
    return [...grupos.values()].sort((a, b) => b.items.length - a.items.length || porTexto(a.nombre, b.nombre))
}

const conteo = (items, nombreDe, columnaNombre) =>
    seccion(
        '', [col('nombre', columnaNombre), col('cantidad', 'Cantidad', true)],
        agrupar(items, nombreDe).map((g) => ({ nombre: g.nombre, cantidad: g.items.length }))
    )

const titulada = (s, titulo) => ({ ...s, titulo })

const textoFiltros = ({ desde, hasta }) => {
    if (!desde && !hasta) return [dato('Período', 'Todo el historial')]
    return [dato('Desde', desde ? dia(desde) : 'Sin límite'), dato('Hasta', hasta ? dia(hasta) : 'Sin límite')]
}

const porNumero = (a, b) => porTexto(a.numero, b.numero)

// ---------- Obras ----------

export const construirObras = ({ obras, carpetas, totalInactivas }) => {
    const nombreCarpeta = (o) => o.carpeta?.numero ?? 'Sin carpeta'
    const filasCarpeta = [...carpetas].sort(porNumero).map((c) => ({
        carpeta: c.numero,
        ubicacion: c.ubicacionFisica ?? '',
        obras: obras.filter((o) => String(o.carpeta?._id) === String(c._id)).length,
    }))

    return {
        tipo: 'obras',
        titulo: 'Reporte de obras',
        filtros: [dato('Alcance', 'Obras activas')],
        resumen: [
            dato('Total de obras activas', obras.length),
            dato('Originales', obras.filter((o) => o.tipoRegistro === 'original').length),
            dato('Adaptaciones', obras.filter((o) => o.tipoRegistro === 'adaptacion').length),
            dato('Mosaicos', obras.filter((o) => o.tipoRegistro === 'mosaico').length),
            dato('Pendientes de completar', obras.filter((o) => o.pendienteDeCompletar).length),
            dato('Obras inactivas (no incluidas)', totalInactivas),
            dato('Carpetas activas', carpetas.length),
        ],
        secciones: [
            titulada(conteo(obras, (o) => REGISTRO[o.tipoRegistro] ?? 'Sin definir', 'Tipo de registro'), 'Por tipo de registro'),
            titulada(conteo(obras, (o) => o.tipoObra?.nombre ?? 'Sin definir', 'Tipo de obra'), 'Por tipo de obra'),
            titulada(conteo(obras, (o) => o.agrupacion?.nombre ?? 'Sin definir', 'Agrupación'), 'Por agrupación'),
            titulada(conteo(obras, (o) => PROCEDENCIA[o.procedencia] ?? 'Sin definir', 'Procedencia'), 'Por procedencia'),
            titulada(conteo(obras, (o) => o.autor || 'Sin autor registrado', 'Autor'), 'Por autor'),
            seccion('Por carpeta', [col('carpeta', 'Carpeta'), col('ubicacion', 'Ubicación física'), col('obras', 'Obras', true)], filasCarpeta),
            seccion(
                'Listado de obras',
                [
                    col('titulo', 'Título'), col('autor', 'Autor'), col('registro', 'Tipo de registro'),
                    col('tipoObra', 'Tipo de obra'), col('agrupacion', 'Agrupación'),
                    col('procedencia', 'Procedencia'), col('carpeta', 'Carpeta'),
                ],
                obras.map((o) => ({
                    titulo: o.titulo,
                    autor: o.autor ?? '',
                    registro: REGISTRO[o.tipoRegistro] ?? '',
                    tipoObra: o.tipoObra?.nombre ?? '',
                    agrupacion: o.agrupacion?.nombre ?? '',
                    procedencia: PROCEDENCIA[o.procedencia] ?? '',
                    carpeta: nombreCarpeta(o) === 'Sin carpeta' ? '' : nombreCarpeta(o),
                }))
            ),
        ],
    }
}

// ---------- Inventario ----------

export const construirInventario = ({ obras, carpetas }) => {
    const estados = Object.keys(DISPONIBILIDAD)
    const cuantas = (estado) => obras.filter((o) => estadoDisponibilidad(o) === estado).length

    const filasCarpeta = [...carpetas].sort(porNumero).map((c) => {
        const deCarpeta = obras.filter((o) => String(o.carpeta?._id) === String(c._id))
        const disponibles = deCarpeta.filter((o) => estadoDisponibilidad(o) === 'disponible').length
        return {
            carpeta: c.numero,
            ubicacion: c.ubicacionFisica ?? '',
            obras: deCarpeta.length,
            disponibles,
            noDisponibles: deCarpeta.length - disponibles,
        }
    })

    const noDisponibles = obras
        .filter((o) => estadoDisponibilidad(o) !== 'disponible')
        .sort((a, b) => porTexto(a.titulo, b.titulo))

    return {
        tipo: 'inventario',
        titulo: 'Reporte de inventario',
        filtros: [dato('Alcance', 'Obras activas')],
        resumen: [
            dato('Total de obras activas', obras.length),
            ...estados.map((e) => dato(DISPONIBILIDAD[e], cuantas(e))),
            dato('Carpetas activas', carpetas.length),
        ],
        secciones: [
            seccion(
                'Por estado de disponibilidad',
                [col('estado', 'Estado'), col('cantidad', 'Cantidad', true)],
                estados.map((e) => ({ estado: DISPONIBILIDAD[e], cantidad: cuantas(e) }))
            ),
            seccion(
                'Por carpeta',
                [
                    col('carpeta', 'Carpeta'), col('ubicacion', 'Ubicación física'), col('obras', 'Obras', true),
                    col('disponibles', 'Disponibles', true), col('noDisponibles', 'No disponibles', true),
                ],
                filasCarpeta
            ),
            seccion(
                'Obras no disponibles',
                [col('titulo', 'Título'), col('carpeta', 'Carpeta'), col('estado', 'Estado')],
                noDisponibles.map((o) => ({
                    titulo: o.titulo,
                    carpeta: o.carpeta?.numero ?? '',
                    estado: DISPONIBILIDAD[estadoDisponibilidad(o)],
                }))
            ),
        ],
    }
}

// ---------- Préstamos ----------

export const construirPrestamos = ({ prestamos, desde, hasta }) => {
    const deTipo = (lista, tipo) => lista.filter((p) => p.tipoEntrega === tipo).length
    const desglose = (lista) => ({
        total: lista.length,
        fisicos: deTipo(lista, 'fisico'),
        digitales: deTipo(lista, 'digital'),
        pendientes: lista.filter((p) => p.estado === 'pendiente').length,
    })
    const columnasGrupo = (primera) => [
        col('nombre', primera), col('total', 'Préstamos', true), col('fisicos', 'Físicos', true),
        col('digitales', 'Digitales', true), col('pendientes', 'Pendientes', true),
    ]
    const filasGrupo = (lista) => agrupar(lista, (p) => p.nombreGrupo).map((g) => ({ nombre: g.nombre, ...desglose(g.items) }))

    const pendientes = prestamos
        .filter((p) => p.estado === 'pendiente')
        .sort((a, b) => dia(a.fechaEntrega).localeCompare(dia(b.fechaEntrega)))

    return {
        tipo: 'prestamos',
        titulo: 'Reporte de préstamos',
        filtros: [...textoFiltros({ desde, hasta }), dato('Criterio', 'Fecha de entrega')],
        resumen: [
            dato('Total de préstamos', prestamos.length),
            dato('Físicos', deTipo(prestamos, 'fisico')),
            dato('Digitales', deTipo(prestamos, 'digital')),
            dato('Pendientes de devolución', prestamos.filter((p) => p.estado === 'pendiente').length),
            dato('Devueltos', prestamos.filter((p) => p.estado === 'devuelto').length),
            dato('Digitales finalizados', prestamos.filter((p) => p.estado === 'finalizado').length),
            dato('Devueltos deteriorados', prestamos.filter((p) => p.devolucion?.estadoFisico === 'deteriorado').length),
            dato('Devueltos dañados', prestamos.filter((p) => p.devolucion?.estadoFisico === 'danado').length),
        ],
        secciones: [
            seccion('Por solicitante', columnasGrupo('Solicitante'),
                filasGrupo(prestamos.map((p) => ({ ...p, nombreGrupo: p.solicitante })))),
            seccion('Por institución u orquesta', columnasGrupo('Institución u orquesta'),
                filasGrupo(prestamos.filter((p) => p.institucion).map((p) => ({ ...p, nombreGrupo: p.institucion })))),
            seccion(
                'Pendientes de devolución',
                [
                    col('codigo', 'Código'), col('obra', 'Obra'), col('solicitante', 'Solicitante'),
                    col('institucion', 'Institución u orquesta'), col('entrega', 'Fecha de entrega'),
                ],
                pendientes.map((p) => ({
                    codigo: p.codigo, obra: p.obra?.titulo ?? '', solicitante: p.solicitante,
                    institucion: p.institucion ?? '', entrega: dia(p.fechaEntrega),
                }))
            ),
            seccion(
                'Listado de préstamos',
                [
                    col('codigo', 'Código'), col('obra', 'Obra'), col('solicitante', 'Solicitante'),
                    col('institucion', 'Institución u orquesta'), col('recibe', 'Recibe'), col('tipo', 'Tipo'),
                    col('entrega', 'Entrega'), col('estado', 'Estado'), col('devolucion', 'Devolución'),
                    col('estadoFisico', 'Estado físico'),
                ],
                [...prestamos]
                    .sort((a, b) => dia(b.fechaEntrega).localeCompare(dia(a.fechaEntrega)) || b.codigo.localeCompare(a.codigo))
                    .map((p) => ({
                        codigo: p.codigo, obra: p.obra?.titulo ?? '', solicitante: p.solicitante,
                        institucion: p.institucion ?? '', recibe: p.personaQueRecibe,
                        tipo: ENTREGA[p.tipoEntrega] ?? '', entrega: dia(p.fechaEntrega),
                        estado: ESTADO_PRESTAMO[p.estado] ?? '', devolucion: dia(p.devolucion?.fechaDevolucion),
                        estadoFisico: ESTADO_FISICO[p.devolucion?.estadoFisico] ?? '',
                    }))
            ),
        ],
    }
}

// ---------- Interpretaciones ----------

export const construirInterpretaciones = ({ interpretaciones, desde, hasta }) => {
    const deEstado = (lista, estado) => lista.filter((i) => i.estado === estado).length
    const interpretadas = interpretaciones.filter((i) => i.estado === 'interpretada')

    const masInterpretadas = agrupar(interpretadas, (i) => String(i.obra?._id ?? 'sin obra'))
        .map((g) => ({
            obra: g.items[0].obra?.titulo ?? '',
            carpeta: g.items[0].obra?.carpeta?.numero ?? '',
            veces: g.items.length,
        }))
        .sort((a, b) => b.veces - a.veces || porTexto(a.obra, b.obra))
        .slice(0, 20)

    const desgloseGrupo = (lista) => ({
        total: lista.length,
        interpretadas: deEstado(lista, 'interpretada'),
        programadas: deEstado(lista, 'programada'),
        canceladas: deEstado(lista, 'cancelada') + deEstado(lista, 'no_interpretada'),
    })
    const columnasGrupo = (primera) => [
        col('nombre', primera), col('total', 'Total', true), col('interpretadas', 'Interpretadas', true),
        col('programadas', 'Programadas', true), col('canceladas', 'Canceladas o no interpretadas', true),
    ]

    const porMes = [...new Set(interpretaciones.map((i) => mes(i.fechaPrevista)))]
        .sort()
        .map((m) => ({ nombre: m, ...desgloseGrupo(interpretaciones.filter((i) => mes(i.fechaPrevista) === m)) }))

    return {
        tipo: 'interpretaciones',
        titulo: 'Reporte de interpretaciones',
        filtros: [...textoFiltros({ desde, hasta }), dato('Criterio', 'Fecha prevista')],
        resumen: [
            dato('Total de interpretaciones', interpretaciones.length),
            dato('Programadas', deEstado(interpretaciones, 'programada')),
            dato('Interpretadas', deEstado(interpretaciones, 'interpretada')),
            dato('Canceladas', deEstado(interpretaciones, 'cancelada')),
            dato('No interpretadas', deEstado(interpretaciones, 'no_interpretada')),
        ],
        secciones: [
            seccion('Obras más interpretadas (máximo 20)', [col('obra', 'Obra'), col('carpeta', 'Carpeta'), col('veces', 'Veces interpretada', true)], masInterpretadas),
            seccion('Por período (mes)', columnasGrupo('Mes'), porMes),
            seccion('Por concierto o programa', columnasGrupo('Programa'),
                agrupar(interpretaciones, (i) => i.programa).map((g) => ({ nombre: g.nombre, ...desgloseGrupo(g.items) }))),
            seccion('Por director', columnasGrupo('Director'),
                agrupar(interpretaciones, (i) => i.director).map((g) => ({ nombre: g.nombre, ...desgloseGrupo(g.items) }))),
            seccion(
                'Listado de interpretaciones',
                [
                    col('codigo', 'Código'), col('fecha', 'Fecha prevista'), col('obra', 'Obra'), col('programa', 'Programa'),
                    col('director', 'Director'), col('solista', 'Solista'), col('estado', 'Estado'),
                ],
                [...interpretaciones]
                    .sort((a, b) => dia(b.fechaPrevista).localeCompare(dia(a.fechaPrevista)) || b.codigo.localeCompare(a.codigo))
                    .map((i) => ({
                        codigo: i.codigo, fecha: dia(i.fechaPrevista), obra: i.obra?.titulo ?? '', programa: i.programa,
                        director: i.director, solista: i.solista ?? '', estado: ESTADO_INTERPRETACION[i.estado] ?? '',
                    }))
            ),
        ],
    }
}

// ---------- Copia legible (Excel) ----------

export const construirCopia = ({ obras, carpetas, prestamos, interpretaciones }) => {
    const titulos = new Map(obras.map((o) => [String(o._id), o.titulo]))

    const instrumentacion = obras.flatMap((o) =>
        (o.instrumentacion ?? []).map((i) => ({
            obra: o.titulo, familia: i.familia?.nombre ?? '', instrumento: i.instrumento?.nombre ?? '', cantidad: i.cantidad ?? 1,
        }))
    )
    const canciones = obras.flatMap((o) =>
        (o.canciones ?? []).map((c) => ({
            mosaico: o.titulo, orden: c.orden, cancion: c.titulo, compositor: c.compositor ?? '', observacion: c.observacion ?? '',
        }))
    )
    const documentos = obras.flatMap((o) =>
        (o.documentos ?? []).map((d) => ({
            obra: o.titulo, nombre: d.nombre, tipo: d.tipoArchivo ?? '', enlace: d.enlace, observaciones: d.observaciones ?? '',
        }))
    )

    return {
        tipo: 'copia',
        titulo: 'Copia legible de la biblioteca',
        filtros: [dato('Alcance', 'Toda la información, incluidos los registros inactivos'), dato('Nota', 'Copia para consulta; no sirve para restaurar el sistema')],
        resumen: [
            dato('Obras', obras.length),
            dato('Carpetas', carpetas.length),
            dato('Préstamos', prestamos.length),
            dato('Interpretaciones', interpretaciones.length),
            dato('Documentos digitales', documentos.length),
        ],
        secciones: [
            seccion(
                'Obras',
                [
                    col('titulo', 'Título'), col('autor', 'Autor'), col('arreglista', 'Arreglista'), col('orquestador', 'Orquestador'),
                    col('opus', 'Opus'), col('anioComposicion', 'Año de composición'), col('anioArreglo', 'Año de arreglo'),
                    col('registro', 'Tipo de registro'), col('obraOriginal', 'Obra original'), col('tipoObra', 'Tipo de obra'),
                    col('procedencia', 'Procedencia'), col('agrupacion', 'Agrupación'), col('tonalidad', 'Tonalidad'),
                    col('compas', 'Compás'), col('tiempo', 'Tiempo'), col('duracion', 'Duración (mm:ss)'),
                    col('movimientos', 'Movimientos'), col('carpeta', 'Carpeta'), col('observaciones', 'Observaciones'),
                    col('activa', 'Activa'), col('pendiente', 'Pendiente de completar'), col('disponibilidad', 'Disponibilidad'),
                ],
                obras.map((o) => ({
                    titulo: o.titulo, autor: o.autor ?? '', arreglista: o.arreglista ?? '', orquestador: o.orquestador ?? '',
                    opus: o.opus ?? '', anioComposicion: o.anioComposicion ?? '', anioArreglo: o.anioArreglo ?? '',
                    registro: REGISTRO[o.tipoRegistro] ?? '',
                    obraOriginal: o.obraOriginal ? titulos.get(String(o.obraOriginal)) ?? '' : '',
                    tipoObra: o.tipoObra?.nombre ?? '', procedencia: PROCEDENCIA[o.procedencia] ?? '',
                    agrupacion: o.agrupacion?.nombre ?? '', tonalidad: o.tonalidad ?? '', compas: o.compas ?? '', tiempo: o.tiempo ?? '',
                    duracion: duracion(o.duracion), movimientos: o.numeroMovimientos ?? '', carpeta: o.carpeta?.numero ?? '',
                    observaciones: o.observaciones ?? '', activa: siNo(o.activa), pendiente: siNo(o.pendienteDeCompletar),
                    disponibilidad: DISPONIBILIDAD[estadoDisponibilidad(o)],
                }))
            ),
            seccion('Instrumentación', [col('obra', 'Obra'), col('familia', 'Familia'), col('instrumento', 'Instrumento'), col('cantidad', 'Cantidad', true)], instrumentacion),
            seccion('Canciones de mosaicos', [col('mosaico', 'Mosaico'), col('orden', 'Orden', true), col('cancion', 'Canción'), col('compositor', 'Compositor'), col('observacion', 'Observación')], canciones),
            seccion('Documentos digitales', [col('obra', 'Obra'), col('nombre', 'Nombre'), col('tipo', 'Tipo de archivo'), col('enlace', 'Enlace'), col('observaciones', 'Observaciones')], documentos),
            seccion(
                'Carpetas',
                [col('numero', 'Número'), col('ubicacion', 'Ubicación física'), col('observaciones', 'Observaciones'), col('activa', 'Activa')],
                [...carpetas].sort(porNumero).map((c) => ({ numero: c.numero, ubicacion: c.ubicacionFisica ?? '', observaciones: c.observaciones ?? '', activa: siNo(c.activa) }))
            ),
            seccion(
                'Préstamos',
                [
                    col('codigo', 'Código'), col('obra', 'Obra'), col('solicitud', 'Fecha de solicitud'), col('solicitante', 'Solicitante'),
                    col('institucion', 'Institución u orquesta'), col('recibe', 'Persona que recibe'), col('tipo', 'Tipo'),
                    col('entrega', 'Fecha de entrega'), col('estado', 'Estado'), col('observaciones', 'Observaciones'),
                    col('fechaDevolucion', 'Fecha de devolución'), col('devuelve', 'Persona que devuelve'),
                    col('estadoFisico', 'Estado físico'), col('observacionesDevolucion', 'Observaciones de la devolución'),
                ],
                prestamos.map((p) => ({
                    codigo: p.codigo, obra: titulos.get(String(p.obra?._id ?? p.obra)) ?? p.obra?.titulo ?? '', solicitud: dia(p.fechaSolicitud),
                    solicitante: p.solicitante, institucion: p.institucion ?? '', recibe: p.personaQueRecibe,
                    tipo: ENTREGA[p.tipoEntrega] ?? '', entrega: dia(p.fechaEntrega), estado: ESTADO_PRESTAMO[p.estado] ?? '',
                    observaciones: p.observaciones ?? '', fechaDevolucion: dia(p.devolucion?.fechaDevolucion),
                    devuelve: p.devolucion?.personaQueDevuelve ?? '', estadoFisico: ESTADO_FISICO[p.devolucion?.estadoFisico] ?? '',
                    observacionesDevolucion: p.devolucion?.observaciones ?? '',
                }))
            ),
            seccion(
                'Interpretaciones',
                [
                    col('codigo', 'Código'), col('fecha', 'Fecha prevista'), col('obra', 'Obra'), col('programa', 'Programa'),
                    col('director', 'Director'), col('solista', 'Solista'), col('estado', 'Estado'), col('observaciones', 'Observaciones'),
                ],
                interpretaciones.map((i) => ({
                    codigo: i.codigo, fecha: dia(i.fechaPrevista), obra: titulos.get(String(i.obra?._id ?? i.obra)) ?? i.obra?.titulo ?? '',
                    programa: i.programa, director: i.director, solista: i.solista ?? '',
                    estado: ESTADO_INTERPRETACION[i.estado] ?? '', observaciones: i.observaciones ?? '',
                }))
            ),
        ],
    }
}
