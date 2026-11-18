import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import Auditoria from '../models/Auditoria.js'
import Contador from '../models/Contador.js'
import { recalcularDisponibilidad } from '../services/disponibilidad.service.js'
import { exigirBaseDePruebas, crearVerificador, crearApi, cookieDe, iniciarServidor } from './_ayuda.js'

exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()

const PASS = 'Clave12345'
const nuevoId = () => String(new mongoose.Types.ObjectId())

const limpiar = async () => {
    const ids = (await Obra.find({ titulo: /^TEST/ }).select('_id')).map((o) => o._id)
    await Prestamo.deleteMany({ obra: { $in: ids } })
    await Interpretacion.deleteMany({ obra: { $in: ids } })
    await Auditoria.collection.deleteMany({ descripcion: /TEST/ })
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Usuario.deleteMany({ $or: [{ correo: /^test\.pr\./ }, { nombreUsuario: /^test_pr_/ }] })
}

const restaurarContador = (nombre, antes) =>
    antes ? Contador.updateOne({ _id: nombre }, { ultimo: antes.ultimo }) : Contador.deleteOne({ _id: nombre })

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Promise.all([Usuario.init(), Carpeta.init(), Obra.init(), Prestamo.init(), Interpretacion.init()])
    await limpiar()
    const contadorPrestamo = await Contador.findById('prestamo')
    const contadorInterpretacion = await Contador.findById('interpretacion')

    const { default: app } = await import('../server.js')
    const servidor = await iniciarServidor(app)
    const api = crearApi(`http://127.0.0.1:${servidor.address().port}`)
    const enviar = (metodo, ruta, cuerpo, cookie) => api(ruta, { metodo, cuerpo, cookie })
    const login = (identificador, password) => enviar('POST', '/api/auth/login', { identificador, password })

    try {
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: 'test.pr.admin@test.local', password: PASS, debeCambiarPassword: false })
        const usuario = await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: 'test_pr_usuario', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.pr.admin@test.local', PASS))
        const cookieU = cookieDe(await login('test_pr_usuario', PASS))
        const u = (metodo, ruta, cuerpo) => enviar(metodo, ruta, cuerpo, cookieU)

        const carpeta = await Carpeta.create({ numero: 'TEST-P1' })
        const nuevaObra = (titulo, extra = {}) =>
            Obra.create({ titulo, tipoRegistro: 'original', carpeta: carpeta._id, pendienteDeCompletar: true, ...extra })
        const obraA = await nuevaObra('TEST P Obra A')
        const obraB = await nuevaObra('TEST P Obra B')
        const obraC = await nuevaObra('TEST P Obra C')
        const obraD = await nuevaObra('TEST P Obra D')
        const obraInactiva = await nuevaObra('TEST P Obra Inactiva', { activa: false })
        const estadoDe = async (obra) => (await Obra.findById(obra._id)).estadoDisponibilidad

        const P = (obra, extra = {}) => ({
            fechaSolicitud: '2026-11-01',
            solicitante: 'TEST Juan Pérez',
            institucion: 'TEST Orquesta Juvenil',
            personaQueRecibe: 'Ana Ruiz',
            obra: String(obra._id),
            tipoEntrega: 'fisico',
            fechaEntrega: '2026-11-02',
            ...extra,
        })
        const D = (extra = {}) => ({
            fechaDevolucion: '2026-11-10',
            personaQueDevuelve: 'Ana Ruiz',
            estadoFisico: 'buen_estado',
            ...extra,
        })

        // ---------- Acceso ----------
        verificar('Exige sesión', (await enviar('GET', '/api/prestamos')).estado === 401)
        verificar('El administrador no tiene acceso a los préstamos', (await enviar('GET', '/api/prestamos', undefined, cookieAdmin)).estado === 403)
        verificar('El administrador no puede registrar préstamos', (await enviar('POST', '/api/prestamos', P(obraA), cookieAdmin)).estado === 403)

        // ---------- Préstamo físico ----------
        const rP1 = await u('POST', '/api/prestamos', P(obraA, { observaciones: 'Para el ensayo' }))
        const p1 = rP1.datos?.prestamo
        verificar('Registra un préstamo físico', rP1.estado === 201 && /^PRE-\d{4,}$/.test(p1?.codigo ?? ''))
        verificar('Nace pendiente y guarda quién lo registró', p1?.estado === 'pendiente' && p1?.registradoPor?._id === String(usuario._id))
        verificar('Las fechas se guardan como día a medianoche UTC',
            p1?.fechaSolicitud === '2026-11-01T00:00:00.000Z' && p1?.fechaEntrega === '2026-11-02T00:00:00.000Z')
        verificar('La respuesta trae el título y la carpeta de la obra', p1?.obra?.titulo === 'TEST P Obra A' && p1?.obra?.carpeta?.numero === 'TEST-P1')
        verificar('La obra queda prestada físicamente', (await estadoDe(obraA)) === 'prestada_fisicamente')
        verificar('Queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: p1._id, accion: 'registrar_prestamo' })) === 1)

        const rDoble = await u('POST', '/api/prestamos', P(obraA, { solicitante: 'TEST Otra Persona' }))
        verificar('No presta el mismo material físico a dos destinatarios', rDoble.estado === 409 && /pendiente de devolución/.test(rDoble.datos.msg))
        verificar('El rechazo no deja registros', (await Prestamo.countDocuments({ obra: obraA._id })) === 1)

        const rCarrera = await Promise.all([
            u('POST', '/api/prestamos', P(obraD, { solicitante: 'TEST Carrera 1' })),
            u('POST', '/api/prestamos', P(obraD, { solicitante: 'TEST Carrera 2' })),
        ])
        verificar('Con dos peticiones simultáneas solo una se registra',
            rCarrera.map((r) => r.estado).sort().join() === '201,409' && (await Prestamo.countDocuments({ obra: obraD._id })) === 1)

        // Digital
        const rDig = await u('POST', '/api/prestamos', P(obraB, { tipoEntrega: 'digital' }))
        verificar('Registra un préstamo digital ya finalizado', rDig.estado === 201 && rDig.datos.prestamo.estado === 'finalizado')
        verificar('El préstamo digital no cambia la disponibilidad', (await estadoDe(obraB)) === 'disponible')
        verificar('Una obra puede tener varios préstamos digitales',
            (await u('POST', '/api/prestamos', P(obraB, { tipoEntrega: 'digital', solicitante: 'TEST Luis' }))).estado === 201)
        verificar('Un préstamo digital puede darse con la obra prestada físicamente',
            (await u('POST', '/api/prestamos', P(obraA, { tipoEntrega: 'digital', solicitante: 'TEST Digital A' }))).estado === 201)

        // Validaciones
        const rFalta = await u('POST', '/api/prestamos', {})
        verificar('Rechaza un préstamo sin datos obligatorios',
            rFalta.estado === 400 && ['fechaSolicitud', 'solicitante', 'personaQueRecibe', 'obra', 'tipoEntrega', 'fechaEntrega'].every((c) => rFalta.datos.errores?.[c]))
        verificar('Rechaza una fecha que no existe', (await u('POST', '/api/prestamos', P(obraC, { fechaEntrega: '2026-02-31' }))).estado === 400)
        verificar('Rechaza una fecha con otro formato', (await u('POST', '/api/prestamos', P(obraC, { fechaEntrega: '18/11/2026' }))).estado === 400)
        verificar('Rechaza un tipo de entrega inválido', (await u('POST', '/api/prestamos', P(obraC, { tipoEntrega: 'correo' }))).estado === 400)
        verificar('Rechaza un id de obra mal formado', (await u('POST', '/api/prestamos', P(obraC, { obra: 'abc' }))).estado === 400)
        verificar('Rechaza una obra que no existe', (await u('POST', '/api/prestamos', P(obraC, { obra: nuevoId() }))).estado === 400)
        const rInactiva = await u('POST', '/api/prestamos', P(obraInactiva))
        verificar('Rechaza una obra inactiva', rInactiva.estado === 409 && /inactiva/.test(rInactiva.datos.msg))
        verificar('Rechaza un solicitante demasiado largo', (await u('POST', '/api/prestamos', P(obraC, { solicitante: 'x'.repeat(151) }))).estado === 400)
        const rProt = await u('POST', '/api/prestamos', P(obraC, {
            tipoEntrega: 'digital', estado: 'pendiente', codigo: 'PRE-9999', registradoPor: nuevoId(),
            devolucion: { fechaDevolucion: '2026-11-05', personaQueDevuelve: 'X', recibidoPor: nuevoId(), estadoFisico: 'danado' },
        }))
        verificar('Ignora los campos que el cliente no puede fijar',
            rProt.estado === 201 && rProt.datos.prestamo.estado === 'finalizado' && rProt.datos.prestamo.codigo !== 'PRE-9999' &&
            rProt.datos.prestamo.registradoPor._id === String(usuario._id) && !rProt.datos.prestamo.devolucion)

        // Disponibilidad con interpretaciones
        const interp = await Interpretacion.create({ obra: obraA._id, fechaPrevista: new Date('2026-12-01T00:00:00.000Z'), programa: 'TEST Concierto', director: 'María López', registradoPor: usuario._id })
        await recalcularDisponibilidad(obraA._id)
        verificar('Recalcula: en interpretación y prestada', (await estadoDe(obraA)) === 'en_interpretacion_y_prestada')
        await Interpretacion.deleteOne({ _id: interp._id })
        await recalcularDisponibilidad(obraA._id)

        // ---------- Devolución ----------
        const rutaDev = `/api/prestamos/${p1._id}/devolucion`
        verificar('Un préstamo digital no admite devolución', (await u('POST', `/api/prestamos/${rDig.datos.prestamo._id}/devolucion`, D())).estado === 409)
        verificar('Rechaza una devolución sin datos obligatorios',
            (await u('POST', rutaDev, {})).datos?.errores?.estadoFisico !== undefined)
        verificar('Rechaza un estado físico inválido', (await u('POST', rutaDev, D({ estadoFisico: 'roto' }))).estado === 400)
        verificar('Rechaza una devolución anterior a la entrega', (await u('POST', rutaDev, D({ fechaDevolucion: '2026-11-01' }))).estado === 400)
        verificar('Una devolución rechazada no cambia nada', (await estadoDe(obraA)) === 'prestada_fisicamente' && (await Prestamo.findById(p1._id)).estado === 'pendiente')
        verificar('Una devolución de un préstamo inexistente responde 404', (await u('POST', `/api/prestamos/${nuevoId()}/devolucion`, D())).estado === 404)

        const rDev = await u('POST', rutaDev, D({ observaciones: 'Todo completo' }))
        const dev = rDev.datos?.prestamo
        verificar('Registra la devolución', rDev.estado === 200 && dev?.estado === 'devuelto' && dev?.devolucion?.estadoFisico === 'buen_estado')
        verificar('Guarda quién recibe la devolución', dev?.devolucion?.recibidoPor?._id === String(usuario._id))
        verificar('La obra vuelve a estar disponible', (await estadoDe(obraA)) === 'disponible')
        verificar('La devolución queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: p1._id, accion: 'registrar_devolucion' })) === 1)
        verificar('No se devuelve dos veces', (await u('POST', rutaDev, D())).estado === 409)
        verificar('Tras devolver, la obra se puede volver a prestar físicamente',
            (await u('POST', '/api/prestamos', P(obraA, { solicitante: 'TEST Segundo', fechaEntrega: '2026-11-12' }))).estado === 201)
        verificar('La obra vuelve a quedar prestada', (await estadoDe(obraA)) === 'prestada_fisicamente')

        // Devolución dañada: solo queda en el historial, la obra vuelve a estar disponible
        const pC = (await u('POST', '/api/prestamos', P(obraC, { solicitante: 'TEST Carlos' }))).datos.prestamo
        const rDanado = await u('POST', `/api/prestamos/${pC._id}/devolucion`, D({ estadoFisico: 'danado', observaciones: 'Páginas rotas' }))
        verificar('Una devolución dañada se guarda en el historial', rDanado.estado === 200 && rDanado.datos.prestamo.devolucion.estadoFisico === 'danado')
        verificar('Una devolución dañada no crea un quinto estado', (await estadoDe(obraC)) === 'disponible')

        // ---------- Corrección ----------
        const rEd = await u('PUT', `/api/prestamos/${pC._id}`, {
            fechaSolicitud: '2026-11-01', solicitante: 'TEST Carlos Mejía', personaQueRecibe: 'Ana Ruiz', fechaEntrega: '2026-11-03',
            obra: String(obraA._id), tipoEntrega: 'digital',
        })
        const edit = rEd.datos?.prestamo
        verificar('Corrige un préstamo', rEd.estado === 200 && edit?.solicitante === 'TEST Carlos Mejía' && edit?.fechaEntrega === '2026-11-03T00:00:00.000Z')
        verificar('Los datos opcionales omitidos se borran', edit?.institucion === undefined)
        verificar('La obra y el tipo de entrega no se pueden cambiar', edit?.obra?._id === String(obraC._id) && edit?.tipoEntrega === 'fisico')
        verificar('Se actualiza el texto normalizado', (await Prestamo.findById(pC._id)).solicitanteNormalizado === 'test carlos mejia')
        verificar('La corrección conserva el código y quien lo registró', edit?.codigo === pC.codigo && edit?.registradoPor?._id === String(usuario._id))
        verificar('La corrección queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: pC._id, accion: 'registrar_prestamo', descripcion: /modificado/ })) === 1)
        verificar('No permite una entrega posterior a la devolución',
            (await u('PUT', `/api/prestamos/${pC._id}`, { fechaSolicitud: '2026-11-01', solicitante: 'TEST Carlos', personaQueRecibe: 'Ana', fechaEntrega: '2026-11-30' })).estado === 400)
        verificar('Corregir un préstamo inexistente responde 404',
            (await u('PUT', `/api/prestamos/${nuevoId()}`, { fechaSolicitud: '2026-11-01', solicitante: 'X', personaQueRecibe: 'Y', fechaEntrega: '2026-11-02' })).estado === 404)

        const rEdDev = await u('PUT', `/api/prestamos/${pC._id}/devolucion`, D({ estadoFisico: 'deteriorado', observaciones: 'Corregido' }))
        verificar('Corrige la devolución sin cambiar quién la recibió',
            rEdDev.estado === 200 && rEdDev.datos.prestamo.devolucion.estadoFisico === 'deteriorado' &&
            rEdDev.datos.prestamo.devolucion.recibidoPor._id === String(usuario._id))
        verificar('Corregir la devolución queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: pC._id, accion: 'registrar_devolucion', descripcion: /modificada/ })) === 1)
        verificar('No se corrige una devolución que no existe', (await u('PUT', `/api/prestamos/${(await Prestamo.findOne({ obra: obraA._id, tipoEntrega: 'fisico', estado: 'pendiente' }))._id}/devolucion`, D())).estado === 409)
        verificar('Los préstamos no se pueden eliminar', (await u('DELETE', `/api/prestamos/${pC._id}`)).estado === 404)

        // ---------- Consulta ----------
        const ficha = await u('GET', `/api/prestamos/${p1._id}`)
        verificar('Consulta un préstamo con su obra, quién lo registró y la devolución',
            ficha.estado === 200 && ficha.datos.prestamo.obra.titulo === 'TEST P Obra A' &&
            ficha.datos.prestamo.registradoPor.nombre === 'TEST Usuario' && ficha.datos.prestamo.devolucion.recibidoPor.nombre === 'TEST Usuario')
        verificar('Un préstamo inexistente responde 404', (await u('GET', `/api/prestamos/${nuevoId()}`)).estado === 404)
        verificar('Un id mal formado responde 400', (await u('GET', '/api/prestamos/abc')).estado === 400)

        const L = (qs) => `/api/prestamos?limite=100&${qs}`
        const ids = async (qs) => ((await u('GET', L(qs))).datos?.prestamos ?? []).map((p) => p._id)

        const deA = (await u('GET', L(`obra=${obraA._id}`))).datos.prestamos
        verificar('Filtra por obra', deA.length === 3 && deA.every((p) => p.obra._id === String(obraA._id)))
        verificar('Ordena por fecha de entrega, la más reciente primero',
            deA.map((p) => p.fechaEntrega.slice(0, 10)).join() === '2026-11-12,2026-11-02,2026-11-02')
        verificar('Filtra los pendientes', (await ids(`obra=${obraA._id}&estado=pendiente`)).length === 1)
        verificar('Filtra los devueltos', (await ids(`obra=${obraA._id}&estado=devuelto`)).join() === p1._id)
        verificar('Filtra los digitales finalizados', (await ids(`obra=${obraB._id}&estado=finalizado&tipoEntrega=digital`)).length === 2)
        verificar('Filtra por tipo de entrega', (await ids(`obra=${obraA._id}&tipoEntrega=digital`)).length === 1)
        verificar('Busca por solicitante sin importar tildes ni mayúsculas', (await ids('q=PEREZ')).includes(p1._id))
        verificar('Busca por texto parcial del solicitante', (await ids('q=carlos%20mej')).join() === pC._id)
        verificar('Busca por institución u orquesta', (await ids('q=orquesta%20juvenil')).includes(p1._id))
        verificar('Busca por código', (await ids(`q=${p1.codigo}`)).includes(p1._id))
        verificar('Los caracteres especiales no rompen la búsqueda', (await u('GET', L('q=%28%5B.*'))).estado === 200)
        verificar('Filtra por rango de fecha de entrega',
            (await ids(`obra=${obraA._id}&desde=2026-11-10&hasta=2026-11-30`)).length === 1)

        const pag1 = (await u('GET', `/api/prestamos?obra=${obraA._id}&limite=2&pagina=1`)).datos
        const pag2 = (await u('GET', `/api/prestamos?obra=${obraA._id}&limite=2&pagina=2`)).datos
        verificar('Pagina los resultados', pag1.prestamos.length === 2 && pag1.total === 3 && pag1.paginas === 2 && pag2.prestamos.length === 1)
        verificar('Rechaza un estado inválido', (await u('GET', '/api/prestamos?estado=otro')).estado === 400)
        verificar('Rechaza una fecha inválida', (await u('GET', '/api/prestamos?desde=ayer')).estado === 400)
        verificar('Rechaza un límite excesivo', (await u('GET', '/api/prestamos?limite=101')).estado === 400)
        verificar('Rechaza un id de obra mal formado', (await u('GET', '/api/prestamos?obra=abc')).estado === 400)

        // La ficha de la obra muestra el historial
        const fichaObra = (await u('GET', `/api/obras/${obraA._id}`)).datos
        verificar('La ficha de la obra muestra su historial de préstamos', fichaObra.prestamos.length === 3)
        verificar('La ficha de la obra muestra la disponibilidad', fichaObra.obra.estadoDisponibilidad === 'prestada_fisicamente')

        // Inactivar con préstamo pendiente sigue bloqueado
        verificar('No se inactiva una obra con préstamo físico pendiente',
            (await u('PATCH', `/api/obras/${obraA._id}/estado`, { activa: false })).estado === 409)
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
