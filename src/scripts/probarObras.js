import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import Auditoria from '../models/Auditoria.js'
import Contador from '../models/Contador.js'
import { exigirBaseDePruebas, crearVerificador, crearApi, cookieDe, iniciarServidor } from './_ayuda.js'

exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()

const PASS = 'Clave12345'
const fecha = (s) => new Date(`${s}T00:00:00.000Z`)
const nuevoId = () => String(new mongoose.Types.ObjectId())

const limpiar = async () => {
    const ids = (await Obra.find({ titulo: /^TEST/ }).select('_id')).map((o) => o._id)
    await Prestamo.deleteMany({ obra: { $in: ids } })
    await Interpretacion.deleteMany({ obra: { $in: ids } })
    await Auditoria.collection.deleteMany({ descripcion: /TEST/ })
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Catalogo.deleteMany({ nombreNormalizado: /^test/ })
    await Usuario.deleteMany({ $or: [{ correo: /^test\.ob\./ }, { nombreUsuario: /^test_ob_/ }] })
}

const restaurarContador = (nombre, antes) =>
    antes ? Contador.updateOne({ _id: nombre }, { ultimo: antes.ultimo }) : Contador.deleteOne({ _id: nombre })

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Promise.all([
        Usuario.init(), Carpeta.init(), Catalogo.init(), Obra.init(), Prestamo.init(), Interpretacion.init(),
    ])
    await limpiar()
    const contadorPrestamo = await Contador.findById('prestamo')
    const contadorInterpretacion = await Contador.findById('interpretacion')

    const { default: app } = await import('../server.js')
    const servidor = await iniciarServidor(app)
    const api = crearApi(`http://127.0.0.1:${servidor.address().port}`)
    const enviar = (metodo, ruta, cuerpo, cookie) => api(ruta, { metodo, cuerpo, cookie })
    const login = (identificador, password) => enviar('POST', '/api/auth/login', { identificador, password })

    try {
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: 'test.ob.admin@test.local', password: PASS, debeCambiarPassword: false })
        const usuario = await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: 'test_ob_usuario', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.ob.admin@test.local', PASS))
        const cookieU = cookieDe(await login('test_ob_usuario', PASS))
        const u = (metodo, ruta, cuerpo) => enviar(metodo, ruta, cuerpo, cookieU)
        const idsDe = async (ruta) => ((await u('GET', ruta)).datos?.obras ?? []).map((o) => o._id)

        // ---------- Datos base ----------
        const c1 = await Carpeta.create({ numero: 'TEST-O1', ubicacionFisica: 'Estante A' })
        const c2 = await Carpeta.create({ numero: 'TEST-O2' })
        const c3 = await Carpeta.create({ numero: 'TEST-O3' })
        const cInactiva = await Carpeta.create({ numero: 'TEST-OI', activa: false })
        const tipoSinfonia = await Catalogo.create({ tipo: 'tipoObra', nombre: 'Test Sinfonía' })
        const tipoPasillo = await Catalogo.create({ tipo: 'tipoObra', nombre: 'Test Pasillo' })
        const agrOrquesta = await Catalogo.create({ tipo: 'agrupacion', nombre: 'Test Orquesta' })
        const agrInactiva = await Catalogo.create({ tipo: 'agrupacion', nombre: 'Test Banda Inactiva', activo: false })
        const cuerdas = await Catalogo.create({ tipo: 'familiaInstrumento', nombre: 'Test Cuerdas' })
        const vientos = await Catalogo.create({ tipo: 'familiaInstrumento', nombre: 'Test Vientos' })
        const violin = await Catalogo.create({ tipo: 'instrumento', nombre: 'Test Violín', familia: cuerdas._id })
        const flauta = await Catalogo.create({ tipo: 'instrumento', nombre: 'Test Flauta', familia: vientos._id })

        const base = (extra = {}) => ({
            titulo: 'TEST Obra',
            tipoRegistro: 'original',
            autor: 'Autor Prueba',
            tipoObra: String(tipoSinfonia._id),
            procedencia: 'ecuatoriana',
            agrupacion: String(agrOrquesta._id),
            carpeta: String(c1._id),
            ...extra,
        })
        const crear = async (extra) => (await u('POST', '/api/obras', base(extra))).datos?.obra

        // ---------- Acceso ----------
        verificar('Exige sesión', (await enviar('GET', '/api/obras')).estado === 401)
        verificar('El administrador no tiene acceso a las obras', (await enviar('GET', '/api/obras', undefined, cookieAdmin)).estado === 403)
        verificar('El administrador no puede crear obras', (await enviar('POST', '/api/obras', base(), cookieAdmin)).estado === 403)

        // ---------- Crear ----------
        const rO1 = await u('POST', '/api/obras', base({
            titulo: '  TEST Pasillo Uno ',
            anioComposicion: '1950',
            tonalidad: 'Re mayor',
            compas: '4/4',
            tiempo: 'Allegro',
            duracion: 245,
            numeroMovimientos: 1,
            instrumentacion: [
                { familia: String(cuerdas._id), instrumento: String(violin._id), cantidad: 8 },
                { familia: String(vientos._id), instrumento: String(flauta._id) },
            ],
        }))
        const o1 = rO1.datos?.obra
        verificar('Crea una obra completa', rO1.estado === 201 && !!o1?._id)
        verificar('El título se guarda sin espacios sobrantes', o1?.titulo === 'TEST Pasillo Uno')
        verificar('Los números enviados como texto se guardan como números', o1?.anioComposicion === 1950 && o1?.duracion === 245)
        verificar('La cantidad por defecto es 1', o1?.instrumentacion[0]?.cantidad === 8 && o1?.instrumentacion[1]?.cantidad === 1)
        verificar('Nace disponible, activa y completa',
            o1?.estadoDisponibilidad === 'disponible' && o1?.activa === true && o1?.pendienteDeCompletar === false)
        verificar('Registra quién la creó', o1?.creadaPor?._id === String(usuario._id))
        const auditCrear = await Auditoria.find({ registroId: o1._id, accion: 'crear_obra' })
        verificar('Queda registrada en el historial de acciones',
            auditCrear.length === 1 && String(auditCrear[0].usuario) === String(usuario._id) && /TEST Pasillo Uno/.test(auditCrear[0].descripcion))

        const rFalta = await u('POST', '/api/obras', { titulo: 'TEST Incompleta API', tipoRegistro: 'original', carpeta: String(c1._id) })
        verificar('Rechaza una obra nueva sin los datos obligatorios', rFalta.estado === 400 && /Faltan datos obligatorios/.test(rFalta.datos.msg))
        verificar('Indica qué campos faltan', ['autor', 'tipoObra', 'procedencia', 'agrupacion'].every((c) => rFalta.datos.errores?.[c]))
        verificar('No se creó ninguna obra', (await Obra.countDocuments({ titulo: 'TEST Incompleta API' })) === 0)

        // Mosaico
        const datosMosaico = {
            titulo: 'TEST Mosaico de Navidad',
            tipoRegistro: 'mosaico',
            tipoObra: String(tipoPasillo._id),
            procedencia: 'universal',
            agrupacion: String(agrOrquesta._id),
            carpeta: String(c1._id),
            canciones: [
                { titulo: 'TEST Noche Vieja' },
                { titulo: 'TEST Feliz Navidad', compositor: 'José Feliciano', observacion: 'Adaptación' },
                { titulo: 'TEST Pequeña Serenata Nocturna', compositor: 'Wolfgang Amadeus Mozart' },
            ],
        }
        const rMos = await u('POST', '/api/obras', datosMosaico)
        const mos = rMos.datos?.obra
        verificar('Crea un mosaico sin autor y con sus canciones en orden',
            rMos.estado === 201 && mos?.canciones.map((c) => c.orden).join(',') === '1,2,3' && mos.canciones[1].titulo === 'TEST Feliz Navidad')
        const rSinCanciones = await u('POST', '/api/obras', { ...datosMosaico, titulo: 'TEST Mosaico Vacío', canciones: [] })
        verificar('Rechaza un mosaico sin canciones', rSinCanciones.estado === 400 && /canción/.test(rSinCanciones.datos.msg))
        const rConCanciones = await u('POST', '/api/obras', base({ titulo: 'TEST No Mosaico', canciones: [{ titulo: 'Una canción' }] }))
        verificar('Rechaza canciones en una obra que no es mosaico', rConCanciones.estado === 400 && /Solo los mosaicos/.test(rConCanciones.datos.msg))

        // Validaciones y reglas
        verificar('Rechaza una carpeta inactiva', (await u('POST', '/api/obras', base({ titulo: 'TEST X1', carpeta: String(cInactiva._id) }))).estado === 409)
        verificar('Rechaza una carpeta inexistente', (await u('POST', '/api/obras', base({ titulo: 'TEST X2', carpeta: nuevoId() }))).estado === 400)
        const rInactivo = await u('POST', '/api/obras', base({ titulo: 'TEST X3', agrupacion: String(agrInactiva._id) }))
        verificar('Rechaza un valor de catálogo inactivo', rInactivo.estado === 409 && /inactivo/.test(rInactivo.datos.msg))
        verificar('Rechaza un tipo de obra que no es del catálogo de tipos', (await u('POST', '/api/obras', base({ titulo: 'TEST X4', tipoObra: String(agrOrquesta._id) }))).estado === 400)
        verificar('Rechaza un tipo de registro inválido', (await u('POST', '/api/obras', base({ titulo: 'TEST X5', tipoRegistro: 'otro' }))).estado === 400)
        verificar('Rechaza un título vacío', (await u('POST', '/api/obras', base({ titulo: '   ' }))).estado === 400)
        verificar('Rechaza un año inválido', (await u('POST', '/api/obras', base({ titulo: 'TEST X6', anioComposicion: 99 }))).estado === 400)
        verificar('Rechaza un año que no es número', (await u('POST', '/api/obras', base({ titulo: 'TEST X7', anioArreglo: 'abc' }))).estado === 400)
        verificar('Rechaza una duración negativa', (await u('POST', '/api/obras', base({ titulo: 'TEST X8', duracion: -5 }))).estado === 400)
        verificar('Rechaza instrumentos repetidos',
            (await u('POST', '/api/obras', base({
                titulo: 'TEST X9',
                instrumentacion: [
                    { familia: String(cuerdas._id), instrumento: String(violin._id) },
                    { familia: String(cuerdas._id), instrumento: String(violin._id) },
                ],
            }))).estado === 400)
        verificar('Rechaza un instrumento que no pertenece a la familia',
            (await u('POST', '/api/obras', base({
                titulo: 'TEST X10',
                instrumentacion: [{ familia: String(vientos._id), instrumento: String(violin._id) }],
            }))).estado === 400)

        // Adaptaciones
        const rAd = await u('POST', '/api/obras', base({
            titulo: 'TEST Pasillo Uno (adaptación)', tipoRegistro: 'adaptacion', arreglista: 'Arreglista Prueba',
            obraOriginal: o1._id, carpeta: String(c2._id),
        }))
        const ad = rAd.datos?.obra
        verificar('Crea una adaptación vinculada a su obra original', rAd.estado === 201 && ad?.obraOriginal?._id === o1._id)
        const ad2 = await crear({ titulo: 'TEST Pasillo Uno (otra versión)', tipoRegistro: 'adaptacion', obraOriginal: o1._id, carpeta: String(c2._id) })
        verificar('Rechaza obra original en una obra que no es adaptación',
            (await u('POST', '/api/obras', base({ titulo: 'TEST X11', obraOriginal: o1._id }))).estado === 400)

        // Campos protegidos
        const rProt = await u('POST', '/api/obras', base({
            titulo: 'TEST Protegida', carpeta: String(c3._id),
            activa: false, prestadaFisicamente: true, enInterpretacion: true, busqueda: 'x', creadaPor: nuevoId(),
        }))
        verificar('Ignora los campos que el cliente no puede fijar',
            rProt.estado === 201 && rProt.datos.obra.activa === true && rProt.datos.obra.estadoDisponibilidad === 'disponible' &&
            rProt.datos.obra.creadaPor?._id === String(usuario._id))

        const navidad = await crear({ titulo: 'TEST FELIZ NAVIDAD', autor: 'Autor Navidad', procedencia: 'universal', tipoObra: String(tipoPasillo._id), carpeta: String(c2._id) })
        const zeta = await crear({ titulo: 'TEST Zeta', carpeta: String(c2._id) })
        const inc = await Obra.create({ titulo: 'TEST Incompleta', tipoRegistro: 'original', carpeta: c3._id, pendienteDeCompletar: true })

        // ---------- Documentos digitales ----------
        const rutaDocs = `/api/obras/${o1._id}/documentos`
        const rD1 = await u('POST', rutaDocs, { nombre: 'Partitura general', tipoArchivo: 'PDF', enlace: 'https://drive.google.com/file/d/abc/view' })
        const d1 = rD1.datos?.documento
        verificar('Agrega un documento digital a la obra', rD1.estado === 201 && !!d1?._id && rD1.datos.documentos.length === 1)
        verificar('Rechaza un enlace sin http o https', (await u('POST', rutaDocs, { nombre: 'Malo', enlace: 'drive.google.com/abc' })).estado === 400)
        verificar('Rechaza un enlace que no es enlace', (await u('POST', rutaDocs, { nombre: 'Malo', enlace: 'hola mundo' })).estado === 400)
        verificar('Rechaza un documento sin nombre', (await u('POST', rutaDocs, { enlace: 'https://ejemplo.com/a' })).estado === 400)
        const d2 = (await u('POST', rutaDocs, { nombre: 'Audio de referencia', tipoArchivo: 'MP3', enlace: 'http://onedrive.live.com/x', observaciones: 'Versión 2019' })).datos?.documento
        const rEdDoc = await u('PUT', `${rutaDocs}/${d1._id}`, { nombre: 'Partitura general v2', enlace: 'https://drive.google.com/file/d/abc/view' })
        verificar('Edita un documento y borra el campo omitido',
            rEdDoc.estado === 200 && rEdDoc.datos.documento.nombre === 'Partitura general v2' && rEdDoc.datos.documento.tipoArchivo === undefined)
        verificar('Un documento inexistente responde 404', (await u('PUT', `${rutaDocs}/${nuevoId()}`, { nombre: 'X', enlace: 'https://ejemplo.com' })).estado === 404)
        const rDel = await u('DELETE', `${rutaDocs}/${d1._id}`)
        verificar('Elimina un documento', rDel.estado === 200 && rDel.datos.documentos.length === 1 && rDel.datos.documentos[0]._id === d2._id)
        verificar('Cada cambio de documentos queda en el historial',
            (await Auditoria.countDocuments({ registroId: o1._id, accion: 'modificar_obra' })) === 4)

        // ---------- Ficha ----------
        const usuarioId = usuario._id
        await Prestamo.create({ fechaSolicitud: fecha('2026-11-01'), solicitante: 'TEST Juan', personaQueRecibe: 'Ana', obra: o1._id, tipoEntrega: 'digital', fechaEntrega: fecha('2026-11-02'), registradoPor: usuarioId })
        const i1 = await Interpretacion.create({ obra: o1._id, fechaPrevista: fecha('2026-11-20'), programa: 'TEST Concierto', director: 'María López', registradoPor: usuarioId })
        await Interpretacion.create({ obra: o1._id, fechaPrevista: fecha('2026-12-05'), programa: 'TEST Gala', director: 'María López', registradoPor: usuarioId })
        i1.estado = 'interpretada'
        await i1.save()

        const fo1 = (await u('GET', `/api/obras/${o1._id}`)).datos
        verificar('La ficha trae carpeta, tipo, agrupación e instrumentación con nombres',
            fo1.obra.carpeta.numero === 'TEST-O1' && fo1.obra.carpeta.ubicacionFisica === 'Estante A' &&
            fo1.obra.tipoObra.nombre === 'Test Sinfonía' && fo1.obra.agrupacion.nombre === 'Test Orquesta' &&
            fo1.obra.instrumentacion[0].instrumento.nombre === 'Test Violín')
        verificar('La ficha trae los documentos digitales', fo1.obra.documentos.length === 1)
        verificar('La ficha lista las adaptaciones', fo1.adaptaciones.length === 2)
        verificar('La ficha trae el historial de préstamos', fo1.prestamos.length === 1 && fo1.prestamos[0].codigo.startsWith('PRE-'))
        verificar('La ficha trae el historial de interpretaciones y cuántas veces fue interpretada',
            fo1.interpretaciones.length === 2 && fo1.vecesInterpretada === 1)

        const fad = (await u('GET', `/api/obras/${ad._id}`)).datos
        verificar('La ficha de una adaptación muestra su obra original', fad.obra.obraOriginal?.titulo === 'TEST Pasillo Uno')
        verificar('La ficha de una adaptación muestra las otras versiones', fad.otrasAdaptaciones.length === 1 && fad.otrasAdaptaciones[0]._id === ad2._id)

        const fnav = (await u('GET', `/api/obras/${navidad._id}`)).datos
        verificar('La ficha muestra los mosaicos que incluyen una canción con el mismo título',
            fnav.mosaicosRelacionados.length === 1 && fnav.mosaicosRelacionados[0]._id === mos._id &&
            fnav.mosaicosRelacionados[0].carpeta.numero === 'TEST-O1')
        const fmos = (await u('GET', `/api/obras/${mos._id}`)).datos
        verificar('La ficha de un mosaico muestra todas sus canciones', fmos.obra.canciones.length === 3 && fmos.mosaicosRelacionados.length === 0)
        verificar('Una obra inexistente responde 404', (await u('GET', `/api/obras/${nuevoId()}`)).estado === 404)
        verificar('Un id mal formado responde 400', (await u('GET', '/api/obras/abc')).estado === 400)

        // ---------- Búsqueda y listado ----------
        const L = (qs) => `/api/obras?limite=100&${qs}`
        const q = (texto) => `q=${encodeURIComponent(texto)}`

        let ids = await idsDe(L(q('pasillo uno')))
        verificar('Busca por título', [o1._id, ad._id, ad2._id].every((id) => ids.includes(id)))
        verificar('Busca por texto parcial', (await idsDe(L(q('pasi')))).includes(o1._id))
        verificar('Busca por autor', (await idsDe(L(q('autor prueba')))).includes(o1._id))
        verificar('Busca por arreglista', (await idsDe(L(q('arreglista prueba')))).includes(ad._id))

        const rPeq = (await u('GET', L(q('PEQUEÑA')))).datos
        const mosEnLista = rPeq.obras.find((o) => o._id === mos._id)
        verificar('Encuentra un mosaico por una de sus canciones, sin importar tildes ni mayúsculas', !!mosEnLista)
        verificar('Indica qué canciones coincidieron', mosEnLista?.cancionesCoincidentes?.join('|') === 'TEST Pequeña Serenata Nocturna')
        verificar('El mosaico del listado trae su carpeta y su total de canciones, no todas las canciones',
            mosEnLista?.carpeta?.numero === 'TEST-O1' && mosEnLista?.totalCanciones === 3 && !('canciones' in mosEnLista))
        verificar('Busca por compositor de una canción', (await idsDe(L(q('mozart')))).includes(mos._id))
        verificar('Busca por canción en cualquier orden de palabras', (await idsDe(L(q('navidad feliz')))).includes(mos._id))
        ids = await idsDe(L(q('navidad')))
        verificar('Una búsqueda trae la obra y el mosaico que la contiene', ids.includes(navidad._id) && ids.includes(mos._id))
        verificar('Todas las palabras deben coincidir', !(await idsDe(L(q('pasillo zeta')))).includes(o1._id))
        verificar('Sin coincidencias devuelve lista vacía', (await idsDe(L(q('zzzxxxqqq')))).length === 0)
        verificar('Los caracteres especiales no rompen la búsqueda', (await u('GET', L(q('TEST ( [ .*')))).estado === 200)
        ids = await idsDe(L(q('TEST-O1')))
        verificar('Escribir un número de carpeta trae sus obras', ids.includes(o1._id) && ids.includes(mos._id) && !ids.includes(zeta._id))

        // Filtros
        const idsC2 = [ad._id, ad2._id, navidad._id, zeta._id].sort()
        const rC2 = (await u('GET', L('carpeta=test-o2'))).datos
        verificar('Filtra por carpeta (sin importar mayúsculas)', rC2.obras.map((o) => o._id).sort().join() === idsC2.join())
        verificar('El listado se ordena por título',
            rC2.obras.map((o) => o.titulo).join('|') ===
            'TEST FELIZ NAVIDAD|TEST Pasillo Uno (adaptación)|TEST Pasillo Uno (otra versión)|TEST Zeta')
        verificar('Una carpeta inexistente devuelve lista vacía', (await u('GET', L('carpeta=NOEXISTE'))).datos?.total === 0)
        verificar('Filtra por tipo de obra', (await idsDe(L(`tipoObra=${tipoPasillo._id}`))).sort().join() === [mos._id, navidad._id].sort().join())
        verificar('Filtra por instrumento', (await idsDe(L(`instrumento=${violin._id}`))).join() === o1._id)
        verificar('Filtra por familia de instrumento', (await idsDe(L(`familia=${vientos._id}`))).join() === o1._id)
        ids = await idsDe(L(`${q('test')}&procedencia=universal`))
        verificar('Filtra por procedencia', ids.includes(navidad._id) && ids.includes(mos._id) && !ids.includes(o1._id))
        ids = await idsDe(L(`${q('test')}&tipoRegistro=mosaico`))
        verificar('Filtra por tipo de registro', ids.includes(mos._id) && !ids.includes(o1._id))
        verificar('Filtra adaptaciones', (await idsDe(L('carpeta=TEST-O2&tipoRegistro=adaptacion'))).sort().join() === [ad._id, ad2._id].sort().join())
        ids = await idsDe(L(`${q('pasillo')}&procedencia=ecuatoriana&tipoRegistro=original`))
        verificar('Combina búsqueda y filtros', ids.includes(o1._id) && !ids.includes(ad._id))

        // Disponibilidad (se fijan los indicadores directamente; el recálculo automático llega en pasos posteriores)
        await Obra.updateOne({ _id: zeta._id }, { prestadaFisicamente: true })
        await Obra.updateOne({ _id: navidad._id }, { enInterpretacion: true })
        await Obra.updateOne({ _id: ad._id }, { prestadaFisicamente: true, enInterpretacion: true })
        const disp = async (valor) => (await idsDe(L(`carpeta=TEST-O2&disponibilidad=${valor}`))).join()
        verificar('Filtra las disponibles', (await disp('disponible')) === ad2._id)
        verificar('Filtra las en interpretación', (await disp('en_interpretacion')) === navidad._id)
        verificar('Filtra las prestadas físicamente', (await disp('prestada_fisicamente')) === zeta._id)
        verificar('Filtra las en interpretación y prestadas', (await disp('en_interpretacion_y_prestada')) === ad._id)
        const listaZeta = (await u('GET', L('carpeta=TEST-O2'))).datos.obras.find((o) => o._id === zeta._id)
        verificar('El listado muestra el estado de disponibilidad', listaZeta?.estadoDisponibilidad === 'prestada_fisicamente')
        await Obra.updateMany({ _id: { $in: [zeta._id, navidad._id, ad._id] } }, { prestadaFisicamente: false, enInterpretacion: false })

        // Pendientes de completar
        verificar('Filtra las obras pendientes de completar', (await idsDe(L('carpeta=TEST-O3&pendienteDeCompletar=true'))).join() === String(inc._id))
        verificar('Filtra las obras completas', (await idsDe(L('carpeta=TEST-O3&pendienteDeCompletar=false'))).join() === rProt.datos.obra._id)

        // Paginación
        const p1 = (await u('GET', '/api/obras?carpeta=TEST-O2&limite=2&pagina=1')).datos
        const p2 = (await u('GET', '/api/obras?carpeta=TEST-O2&limite=2&pagina=2')).datos
        verificar('Pagina los resultados', p1.obras.length === 2 && p1.total === 4 && p1.paginas === 2 && p2.obras.length === 2)
        verificar('Las páginas no repiten obras', new Set([...p1.obras, ...p2.obras].map((o) => o._id)).size === 4)

        // Parámetros inválidos
        verificar('Rechaza un límite excesivo', (await u('GET', '/api/obras?limite=101')).estado === 400)
        verificar('Rechaza una página inválida', (await u('GET', '/api/obras?pagina=0')).estado === 400)
        verificar('Rechaza una disponibilidad inválida', (await u('GET', '/api/obras?disponibilidad=otra')).estado === 400)
        verificar('Rechaza un estado inválido', (await u('GET', '/api/obras?activa=quizas')).estado === 400)
        verificar('Rechaza un id de catálogo mal formado', (await u('GET', '/api/obras?tipoObra=abc')).estado === 400)

        // ---------- Edición ----------
        const antesAuditoria = await Auditoria.countDocuments({ registroId: o1._id, accion: 'modificar_obra' })
        const rEd = await u('PUT', `/api/obras/${o1._id}`, base({ titulo: 'TEST Pasillo Uno', autor: 'Autor Editado' }))
        const ed = rEd.datos?.obra
        verificar('Edita una obra', rEd.estado === 200 && ed?.autor === 'Autor Editado')
        verificar('Los datos opcionales omitidos se borran',
            ed?.tonalidad === undefined && ed?.duracion === undefined && ed?.instrumentacion.length === 0)
        verificar('Editar no toca los documentos ni el creador',
            ed?.documentos.length === 1 && ed?.creadaPor?._id === String(usuario._id) && ed?.modificadaPor?._id === String(usuario._id))
        verificar('La edición queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: o1._id, accion: 'modificar_obra' })) === antesAuditoria + 1)
        verificar('La búsqueda se actualiza con los datos nuevos',
            (await idsDe(L(q('autor editado')))).includes(o1._id) && !(await idsDe(L(q('autor prueba')))).includes(o1._id))
        verificar('Una obra completa no puede perder datos obligatorios',
            (await u('PUT', `/api/obras/${o1._id}`, base({ titulo: 'TEST Pasillo Uno', autor: '' }))).estado === 400)
        verificar('Rechaza mover la obra a una carpeta inactiva',
            (await u('PUT', `/api/obras/${o1._id}`, base({ titulo: 'TEST Pasillo Uno', autor: 'Autor Editado', carpeta: String(cInactiva._id) }))).estado === 409)
        verificar('Editar una obra inexistente responde 404', (await u('PUT', `/api/obras/${nuevoId()}`, base())).estado === 404)

        const rMosEd = await u('PUT', `/api/obras/${mos._id}`, {
            ...datosMosaico,
            canciones: [{ titulo: 'TEST Feliz Navidad' }, { titulo: 'TEST Jingle Bells' }],
        })
        verificar('Edita las canciones de un mosaico y renumera el orden',
            rMosEd.estado === 200 && rMosEd.datos.obra.canciones.map((c) => c.orden).join() === '1,2' &&
            rMosEd.datos.obra.canciones[1].titulo === 'TEST Jingle Bells')
        verificar('Las canciones eliminadas ya no se encuentran', !(await idsDe(L(q('pequeña serenata')))).includes(mos._id))
        verificar('Las canciones nuevas sí se encuentran', (await idsDe(L(q('jingle')))).includes(mos._id))

        // Obra pendiente de completar: se puede guardar por partes
        const rParcial = await u('PUT', `/api/obras/${inc._id}`, { titulo: 'TEST Incompleta', tipoRegistro: 'original', carpeta: String(c3._id), autor: 'Autor Parcial' })
        verificar('Una obra pendiente se guarda aunque falten datos', rParcial.estado === 200 && rParcial.datos.obra.pendienteDeCompletar === true)
        verificar('El aviso indica que aún faltan datos', /faltan datos/i.test(rParcial.datos.msg))
        const rCompleta = await u('PUT', `/api/obras/${inc._id}`, base({ titulo: 'TEST Incompleta', carpeta: String(c3._id) }))
        verificar('Al completar los datos deja de estar pendiente', rCompleta.estado === 200 && rCompleta.datos.obra.pendienteDeCompletar === false)

        // ---------- Activar e inactivar ----------
        verificar('Rechaza un estado que no es booleano', (await u('PATCH', `/api/obras/${zeta._id}/estado`, { activa: 'abc' })).estado === 400)
        verificar('Cambiar el estado de una obra inexistente responde 404', (await u('PATCH', `/api/obras/${nuevoId()}/estado`, { activa: false })).estado === 404)

        const prestamoFisico = await Prestamo.create({
            fechaSolicitud: fecha('2026-11-03'), solicitante: 'TEST Pedro', personaQueRecibe: 'Ana',
            obra: zeta._id, tipoEntrega: 'fisico', fechaEntrega: fecha('2026-11-04'), registradoPor: usuario._id,
        })
        const rBloqPrestamo = await u('PATCH', `/api/obras/${zeta._id}/estado`, { activa: false })
        verificar('No inactiva una obra con préstamo físico pendiente', rBloqPrestamo.estado === 409 && /préstamo/.test(rBloqPrestamo.datos.msg))
        await Prestamo.deleteOne({ _id: prestamoFisico._id })
        const rInact = await u('PATCH', `/api/obras/${zeta._id}/estado`, { activa: false })
        verificar('Inactiva una obra sin pendientes', rInact.estado === 200 && rInact.datos.obra.activa === false)
        verificar('Inactivar queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: zeta._id, accion: 'modificar_obra', descripcion: /inactivada/ })) === 1)
        verificar('Inactivar dos veces no falla ni duplica el historial',
            (await u('PATCH', `/api/obras/${zeta._id}/estado`, { activa: false })).estado === 200 &&
            (await Auditoria.countDocuments({ registroId: zeta._id, descripcion: /inactivada/ })) === 1)

        await Interpretacion.create({ obra: navidad._id, fechaPrevista: fecha('2026-12-24'), programa: 'TEST Navidad', director: 'María López', registradoPor: usuario._id })
        const rBloqInterp = await u('PATCH', `/api/obras/${navidad._id}/estado`, { activa: false })
        verificar('No inactiva una obra con interpretaciones programadas', rBloqInterp.estado === 409 && /interpretaciones/.test(rBloqInterp.datos.msg))
        await Interpretacion.deleteMany({ obra: navidad._id })

        verificar('Una obra inactiva no se puede editar', (await u('PUT', `/api/obras/${zeta._id}`, base({ titulo: 'TEST Zeta', carpeta: String(c2._id) }))).estado === 409)
        verificar('Una obra inactiva no admite documentos nuevos', (await u('POST', `/api/obras/${zeta._id}/documentos`, { nombre: 'X', enlace: 'https://ejemplo.com' })).estado === 409)
        verificar('El listado normal oculta las inactivas', !(await idsDe(L('carpeta=TEST-O2'))).includes(zeta._id))
        verificar('Se pueden listar solo las inactivas', (await idsDe(L('carpeta=TEST-O2&activa=false'))).join() === zeta._id)
        verificar('Se pueden listar todas', (await idsDe(L('carpeta=TEST-O2&activa=todas'))).length === 4)
        verificar('La ficha de una obra inactiva sigue disponible', (await u('GET', `/api/obras/${zeta._id}`)).estado === 200)

        const rReact = await u('PATCH', `/api/obras/${zeta._id}/estado`, { activa: true })
        verificar('Reactiva una obra', rReact.estado === 200 && rReact.datos.obra.activa === true)

        // Reactivar con la carpeta inactiva
        const prot = rProt.datos.obra
        await u('PATCH', `/api/obras/${prot._id}/estado`, { activa: false })
        await Carpeta.updateOne({ _id: c3._id }, { activa: false })
        const rCarpetaInactiva = await u('PATCH', `/api/obras/${prot._id}/estado`, { activa: true })
        verificar('No reactiva una obra cuya carpeta está inactiva', rCarpetaInactiva.estado === 409 && /carpeta/.test(rCarpetaInactiva.datos.msg))
        await Carpeta.updateOne({ _id: c3._id }, { activa: true })
        verificar('Reactiva la obra cuando la carpeta vuelve a estar activa', (await u('PATCH', `/api/obras/${prot._id}/estado`, { activa: true })).estado === 200)
    } catch (error) {
        verificar(`La prueba terminó sin errores inesperados (${error.message})`, false)
        console.error(error)
    } finally {
        await restaurarContador('prestamo', contadorPrestamo)
        await restaurarContador('interpretacion', contadorInterpretacion)
        await limpiar()
        await new Promise((resolve) => servidor.close(resolve))
        await mongoose.disconnect()
    }
    terminar()
}

ejecutar().catch(async (error) => {
    console.error(error)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})