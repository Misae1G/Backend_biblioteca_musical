import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import Auditoria from '../models/Auditoria.js'
import Contador from '../models/Contador.js'
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
    await Usuario.deleteMany({ $or: [{ correo: /^test\.in\./ }, { nombreUsuario: /^test_in_/ }] })
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
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: 'test.in.admin@test.local', password: PASS, debeCambiarPassword: false })
        const usuario = await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: 'test_in_usuario', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.in.admin@test.local', PASS))
        const cookieU = cookieDe(await login('test_in_usuario', PASS))
        const u = (metodo, ruta, cuerpo) => enviar(metodo, ruta, cuerpo, cookieU)

        const carpeta = await Carpeta.create({ numero: 'TEST-I1' })
        const nuevaObra = (titulo, extra = {}) =>
            Obra.create({ titulo, tipoRegistro: 'original', carpeta: carpeta._id, pendienteDeCompletar: true, ...extra })
        const obraA = await nuevaObra('TEST I Obra A')
        const obraB = await nuevaObra('TEST I Obra B')
        const obraC = await nuevaObra('TEST I Obra C')
        const obraInactiva = await nuevaObra('TEST I Obra Inactiva', { activa: false })
        const estadoDe = async (obra) => (await Obra.findById(obra._id)).estadoDisponibilidad

        const I = (obra, extra = {}) => ({
            obra: String(obra._id),
            fechaPrevista: '2026-12-01',
            programa: 'TEST Concierto de Navidad',
            director: 'María López',
            ...extra,
        })
        const cambiar = (interp, estado) => u('PATCH', `/api/interpretaciones/${interp._id}/estado`, { estado })

        // ---------- Acceso ----------
        verificar('Exige sesión', (await enviar('GET', '/api/interpretaciones')).estado === 401)
        verificar('El administrador no tiene acceso a las interpretaciones', (await enviar('GET', '/api/interpretaciones', undefined, cookieAdmin)).estado === 403)
        verificar('El administrador no puede programar', (await enviar('POST', '/api/interpretaciones', I(obraA), cookieAdmin)).estado === 403)

        // ---------- Programar ----------
        const r1 = await u('POST', '/api/interpretaciones', I(obraA, { solista: 'Pedro Vega', observaciones: 'Estreno' }))
        const i1 = r1.datos?.interpretacion
        verificar('Programa una interpretación', r1.estado === 201 && /^INT-\d{4,}$/.test(i1?.codigo ?? ''))
        verificar('Nace programada y guarda quién la registró', i1?.estado === 'programada' && i1?.registradoPor?._id === String(usuario._id))
        verificar('La fecha se guarda como día a medianoche UTC', i1?.fechaPrevista === '2026-12-01T00:00:00.000Z')
        verificar('La respuesta trae el título y la carpeta de la obra', i1?.obra?.titulo === 'TEST I Obra A' && i1?.obra?.carpeta?.numero === 'TEST-I1')
        verificar('La obra queda en interpretación', (await estadoDe(obraA)) === 'en_interpretacion')
        verificar('Queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: i1._id, accion: 'registrar_interpretacion' })) === 1)

        const r2 = await u('POST', '/api/interpretaciones', I(obraA, { fechaPrevista: '2026-12-15', programa: 'TEST Gala de Año Nuevo', director: 'José Ñandú' }))
        const i2 = r2.datos?.interpretacion
        verificar('Una obra puede tener varias interpretaciones programadas a la vez', r2.estado === 201)

        // Validaciones
        const rFalta = await u('POST', '/api/interpretaciones', {})
        verificar('Rechaza datos obligatorios faltantes',
            rFalta.estado === 400 && ['obra', 'fechaPrevista', 'programa', 'director'].every((c) => rFalta.datos.errores?.[c]))
        verificar('Rechaza una fecha que no existe', (await u('POST', '/api/interpretaciones', I(obraC, { fechaPrevista: '2026-02-30' }))).estado === 400)
        verificar('Rechaza una fecha con otro formato', (await u('POST', '/api/interpretaciones', I(obraC, { fechaPrevista: '01/12/2026' }))).estado === 400)
        verificar('Rechaza un id de obra mal formado', (await u('POST', '/api/interpretaciones', I(obraC, { obra: 'abc' }))).estado === 400)
        verificar('Rechaza una obra que no existe', (await u('POST', '/api/interpretaciones', I(obraC, { obra: nuevoId() }))).estado === 400)
        const rInact = await u('POST', '/api/interpretaciones', I(obraInactiva))
        verificar('Rechaza una obra inactiva', rInact.estado === 409 && /inactiva/.test(rInact.datos.msg))
        verificar('Rechaza un programa demasiado largo', (await u('POST', '/api/interpretaciones', I(obraC, { programa: 'x'.repeat(201) }))).estado === 400)
        const rProt = await u('POST', '/api/interpretaciones', I(obraC, {
            estado: 'interpretada', codigo: 'INT-9999', registradoPor: nuevoId(), fechaPrevista: '2026-12-20',
        }))
        verificar('Ignora los campos que el cliente no puede fijar',
            rProt.estado === 201 && rProt.datos.interpretacion.estado === 'programada' &&
            rProt.datos.interpretacion.codigo !== 'INT-9999' && rProt.datos.interpretacion.registradoPor._id === String(usuario._id))
        const iC = rProt.datos.interpretacion

        // ---------- Cambios de estado ----------
        verificar('Rechaza un estado inválido', (await cambiar(i1, 'otro')).estado === 400)
        verificar('Cambiar el estado de una inexistente responde 404', (await cambiar({ _id: nuevoId() }, 'cancelada')).estado === 404)
        verificar('No acepta el mismo estado', (await cambiar(i1, 'programada')).estado === 409)

        const rInterpretada = await cambiar(i1, 'interpretada')
        verificar('Marca una interpretación como interpretada', rInterpretada.estado === 200 && rInterpretada.datos.interpretacion.estado === 'interpretada')
        verificar('La obra sigue en interpretación mientras tenga otra programada', (await estadoDe(obraA)) === 'en_interpretacion')
        verificar('El cambio queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: i1._id, accion: 'modificar_interpretacion', descripcion: /interpretada/ })) === 1)

        verificar('Cancela la otra programada', (await cambiar(i2, 'cancelada')).estado === 200)
        verificar('Sin programadas, la obra queda disponible', (await estadoDe(obraA)) === 'disponible')

        verificar('Una interpretada marcada por error vuelve a programada', (await cambiar(i1, 'programada')).estado === 200)
        verificar('La obra vuelve a estar en interpretación', (await estadoDe(obraA)) === 'en_interpretacion')
        verificar('Pasa a no interpretada', (await cambiar(i1, 'no_interpretada')).estado === 200)
        verificar('La obra vuelve a estar disponible', (await estadoDe(obraA)) === 'disponible')
        verificar('Una no interpretada no puede volver a programada', (await cambiar(i1, 'programada')).estado === 409)
        verificar('Una cancelada no puede volver a programada', (await cambiar(i2, 'programada')).estado === 409)
        verificar('Una cancelada no puede pasar a interpretada', (await cambiar(i2, 'interpretada')).estado === 409)

        // Volver a programar exige obra activa
        await cambiar(iC, 'interpretada')
        await Obra.updateOne({ _id: obraC._id }, { activa: false })
        const rObraInactiva = await cambiar(iC, 'programada')
        verificar('No vuelve a programar una obra inactiva', rObraInactiva.estado === 409 && /inactiva/.test(rObraInactiva.datos.msg))
        await Obra.updateOne({ _id: obraC._id }, { activa: true })
        verificar('Vuelve a programar cuando la obra está activa', (await cambiar(iC, 'programada')).estado === 200)

        // Disponibilidad combinada con préstamos físicos
        const rPrestamo = await u('POST', '/api/prestamos', {
            fechaSolicitud: '2026-11-01', solicitante: 'TEST Juan', personaQueRecibe: 'Ana',
            obra: String(obraB._id), tipoEntrega: 'fisico', fechaEntrega: '2026-11-02',
        })
        verificar('Préstamo físico: la obra queda prestada', (await estadoDe(obraB)) === 'prestada_fisicamente')
        const iB = (await u('POST', '/api/interpretaciones', I(obraB, { programa: 'TEST Concierto B' }))).datos.interpretacion
        verificar('Prestada y programada: en interpretación y prestada', (await estadoDe(obraB)) === 'en_interpretacion_y_prestada')
        await u('POST', `/api/prestamos/${rPrestamo.datos.prestamo._id}/devolucion`, {
            fechaDevolucion: '2026-11-10', personaQueDevuelve: 'Ana', estadoFisico: 'buen_estado',
        })
        verificar('Al devolver, sigue en interpretación', (await estadoDe(obraB)) === 'en_interpretacion')
        await cambiar(iB, 'cancelada')
        verificar('Al cancelar, queda disponible', (await estadoDe(obraB)) === 'disponible')

        // Inactivar una obra depende de sus interpretaciones programadas
        verificar('No se inactiva una obra con interpretaciones programadas',
            (await u('PATCH', `/api/obras/${obraC._id}/estado`, { activa: false })).estado === 409)
        await cambiar(iC, 'cancelada')
        verificar('Sin programadas, la obra se puede inactivar', (await u('PATCH', `/api/obras/${obraC._id}/estado`, { activa: false })).estado === 200)
        await u('PATCH', `/api/obras/${obraC._id}/estado`, { activa: true })

        // ---------- Corrección ----------
        const rEd = await u('PUT', `/api/interpretaciones/${i1._id}`, {
            fechaPrevista: '2026-12-03', programa: 'TEST Concierto Corregido', director: 'Ángel Díaz',
            obra: String(obraB._id), estado: 'programada',
        })
        const ed = rEd.datos?.interpretacion
        verificar('Corrige una interpretación', rEd.estado === 200 && ed?.programa === 'TEST Concierto Corregido' && ed?.fechaPrevista === '2026-12-03T00:00:00.000Z')
        verificar('Los datos opcionales omitidos se borran', ed?.solista === undefined && ed?.observaciones === undefined)
        verificar('La obra y el estado no se cambian al corregir', ed?.obra?._id === String(obraA._id) && ed?.estado === 'no_interpretada')
        verificar('Se actualizan los textos normalizados',
            (await Interpretacion.findById(i1._id)).directorNormalizado === 'angel diaz')
        verificar('Conserva el código y quién la registró', ed?.codigo === i1.codigo && ed?.registradoPor?._id === String(usuario._id))
        verificar('La corrección queda en el historial de acciones',
            (await Auditoria.countDocuments({ registroId: i1._id, accion: 'modificar_interpretacion', descripcion: /modificada/ })) === 1)
        verificar('Rechaza datos obligatorios vacíos al corregir',
            (await u('PUT', `/api/interpretaciones/${i1._id}`, { fechaPrevista: '2026-12-03', programa: '', director: 'X' })).estado === 400)
        verificar('Corregir una inexistente responde 404',
            (await u('PUT', `/api/interpretaciones/${nuevoId()}`, { fechaPrevista: '2026-12-03', programa: 'X', director: 'Y' })).estado === 404)
        verificar('Las interpretaciones no se pueden eliminar', (await u('DELETE', `/api/interpretaciones/${i1._id}`)).estado === 404)

        // ---------- Consulta ----------
        const ficha = await u('GET', `/api/interpretaciones/${i1._id}`)
        verificar('Consulta una interpretación con su obra y quién la registró',
            ficha.estado === 200 && ficha.datos.interpretacion.obra.titulo === 'TEST I Obra A' && ficha.datos.interpretacion.registradoPor.nombre === 'TEST Usuario')
        verificar('Una inexistente responde 404', (await u('GET', `/api/interpretaciones/${nuevoId()}`)).estado === 404)
        verificar('Un id mal formado responde 400', (await u('GET', '/api/interpretaciones/abc')).estado === 400)

        const L = (qs) => `/api/interpretaciones?limite=100&${qs}`
        const ids = async (qs) => ((await u('GET', L(qs))).datos?.interpretaciones ?? []).map((i) => i._id)

        const deA = (await u('GET', L(`obra=${obraA._id}`))).datos.interpretaciones
        verificar('Filtra por obra, la fecha más reciente primero',
            deA.length === 2 && deA.map((i) => i._id).join() === [i2._id, i1._id].join())
        verificar('Filtra por estado', (await ids(`obra=${obraA._id}&estado=cancelada`)).join() === i2._id)
        verificar('Filtra por estado programada', (await ids(`obra=${obraC._id}&estado=programada`)).length === 0)
        verificar('Busca por programa sin importar tildes ni mayúsculas', (await ids('q=A%C3%B1o%20NUEVO')).join() === i2._id)
        verificar('Busca por director sin importar tildes', (await ids('q=nandu')).join() === i2._id)
        verificar('Busca por texto parcial del director', (await ids('q=angel')).join() === i1._id)
        verificar('Busca por código', (await ids(`q=${i1.codigo}`)).includes(i1._id))
        verificar('Los caracteres especiales no rompen la búsqueda', (await u('GET', L('q=%28%5B.*'))).estado === 200)
        verificar('Filtra por rango de fechas', (await ids(`obra=${obraA._id}&desde=2026-12-10&hasta=2026-12-31`)).join() === i2._id)
        const pag1 = (await u('GET', `/api/interpretaciones?obra=${obraA._id}&limite=1&pagina=1`)).datos
        const pag2 = (await u('GET', `/api/interpretaciones?obra=${obraA._id}&limite=1&pagina=2`)).datos
        verificar('Pagina los resultados', pag1.interpretaciones.length === 1 && pag1.total === 2 && pag1.paginas === 2 && pag2.interpretaciones.length === 1)
        verificar('Rechaza un estado inválido', (await u('GET', '/api/interpretaciones?estado=otro')).estado === 400)
        verificar('Rechaza una fecha inválida', (await u('GET', '/api/interpretaciones?desde=ayer')).estado === 400)
        verificar('Rechaza un límite excesivo', (await u('GET', '/api/interpretaciones?limite=101')).estado === 400)
        verificar('Rechaza un id de obra mal formado', (await u('GET', '/api/interpretaciones?obra=abc')).estado === 400)

        // ---------- Programación semanal ----------
        // 2026-12-02 es miércoles: la semana va del lunes 2026-11-30 al domingo 2026-12-06
        const obraS = await nuevaObra('TEST I Obra Semana')
        for (const f of ['2026-11-29', '2026-11-30', '2026-12-06', '2026-12-07']) {
            await u('POST', '/api/interpretaciones', I(obraS, { fechaPrevista: f, programa: `TEST Semana ${f}` }))
        }
        const rSem = await u('GET', '/api/interpretaciones/semana?fecha=2026-12-02')
        const deSemana = rSem.datos?.interpretaciones.filter((i) => i.obra._id === String(obraS._id)) ?? []
        verificar('La semana va de lunes a domingo', rSem.estado === 200 && rSem.datos.desde === '2026-11-30' && rSem.datos.hasta === '2026-12-06')
        verificar('Trae solo las interpretaciones de esa semana, ordenadas por fecha',
            deSemana.map((i) => i.fechaPrevista.slice(0, 10)).join() === '2026-11-30,2026-12-06')
        verificar('Con un domingo toma la semana que termina ese día', (await u('GET', '/api/interpretaciones/semana?fecha=2026-12-06')).datos.desde === '2026-11-30')
        verificar('Con un lunes toma la semana que empieza ese día', (await u('GET', '/api/interpretaciones/semana?fecha=2026-11-30')).datos.hasta === '2026-12-06')
        const rActual = await u('GET', '/api/interpretaciones/semana')
        verificar('Sin fecha usa la semana actual', rActual.estado === 200 && /^\d{4}-\d{2}-\d{2}$/.test(rActual.datos.desde) && Array.isArray(rActual.datos.interpretaciones))
        verificar('Rechaza una fecha inválida en la semana', (await u('GET', '/api/interpretaciones/semana?fecha=hoy')).estado === 400)

        // La ficha de la obra cuenta las interpretadas
        await cambiar((await Interpretacion.findOne({ obra: obraS._id, fechaPrevista: new Date('2026-11-30T00:00:00.000Z') })), 'interpretada')
        const fichaObra = (await u('GET', `/api/obras/${obraS._id}`)).datos
        verificar('La ficha de la obra cuenta las veces interpretada y trae su historial',
            fichaObra.vecesInterpretada === 1 && fichaObra.interpretaciones.length === 4)
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
