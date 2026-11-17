import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Obra from '../models/Obra.js'
import { exigirBaseDePruebas, crearVerificador, crearApi, cookieDe, iniciarServidor } from './_ayuda.js'

exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()

const PASS = 'Clave12345'
const limpiar = async () => {
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Catalogo.deleteMany({ nombreNormalizado: /^test/ })
    await Usuario.deleteMany({ $or: [{ correo: /^test\.cc\./ }, { nombreUsuario: /^test_cc_/ }] })
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Usuario.init()
    await Carpeta.init()
    await Catalogo.init()
    await limpiar()

    const { default: app } = await import('../server.js')
    const servidor = await iniciarServidor(app)
    const api = crearApi(`http://127.0.0.1:${servidor.address().port}`)
    const enviar = (metodo, ruta, cuerpo, cookie) => api(ruta, { metodo, cuerpo, cookie })
    const login = (identificador, password) => enviar('POST', '/api/auth/login', { identificador, password })

    try {
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: 'test.cc.admin@test.local', password: PASS, debeCambiarPassword: false })
        const usuario = await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: 'test_cc_usuario', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.cc.admin@test.local', PASS))
        const cookieU = cookieDe(await login('test_cc_usuario', PASS))
        const u = (metodo, ruta, cuerpo) => enviar(metodo, ruta, cuerpo, cookieU)

        // ================= CARPETAS =================
        verificar('Carpetas: exige sesión', (await enviar('GET', '/api/carpetas')).estado === 401)
        verificar('El administrador no tiene acceso a las carpetas', (await enviar('GET', '/api/carpetas', undefined, cookieAdmin)).estado === 403)
        verificar('El administrador no puede crear carpetas', (await enviar('POST', '/api/carpetas', { numero: 'TEST-X' }, cookieAdmin)).estado === 403)

        const rC1 = await u('POST', '/api/carpetas', { numero: ' test-c1 ', ubicacionFisica: 'Estante A', observaciones: '' })
        const c1 = rC1.datos?.carpeta
        verificar('Crea una carpeta con número en mayúsculas', rC1.estado === 201 && c1?.numero === 'TEST-C1' && c1?.ubicacionFisica === 'Estante A')
        verificar('Una observación vacía no se guarda', c1?.observaciones === undefined)
        verificar('Rechaza un número de carpeta repetido', (await u('POST', '/api/carpetas', { numero: 'test-c1' })).estado === 409)
        verificar('Rechaza un número con caracteres inválidos', (await u('POST', '/api/carpetas', { numero: 'TEST C@' })).estado === 400)
        verificar('Rechaza una carpeta sin número', (await u('POST', '/api/carpetas', { ubicacionFisica: 'Estante' })).estado === 400)
        const c2 = (await u('POST', '/api/carpetas', { numero: 'TEST-C2' })).datos?.carpeta
        await u('POST', '/api/carpetas', { numero: 'TEST-C10' })
        const rLista = await u('GET', '/api/carpetas?q=TEST-C')
        verificar('Ordena los números de forma natural (1, 2, 10)', rLista.datos?.carpetas.map((c) => c.numero).join(',') === 'TEST-C1,TEST-C2,TEST-C10')

        await Obra.create({ titulo: 'TEST Obra 1', tipoRegistro: 'original', carpeta: c1._id })
        await Obra.create({ titulo: 'TEST Obra 2', tipoRegistro: 'original', carpeta: c1._id, prestadaFisicamente: true })
        const rDetalle = await u('GET', `/api/carpetas/${c1._id}`)
        const estados = rDetalle.datos?.obras.map((o) => o.estadoDisponibilidad).sort().join(',')
        verificar('El detalle lista las obras de la carpeta con su disponibilidad',
            rDetalle.estado === 200 && rDetalle.datos.obras.length === 2 && estados === 'disponible,prestada_fisicamente')
        const cantidades = Object.fromEntries((await u('GET', '/api/carpetas?q=TEST-C')).datos.carpetas.map((c) => [c.numero, c.cantidadObras]))
        verificar('La lista incluye la cantidad de obras de cada carpeta', cantidades['TEST-C1'] === 2 && cantidades['TEST-C2'] === 0)

        const rEd = await u('PUT', `/api/carpetas/${c2._id}`, { numero: 'test-c2b', ubicacionFisica: 'Estante B' })
        verificar('Edita una carpeta', rEd.estado === 200 && rEd.datos.carpeta.numero === 'TEST-C2B' && rEd.datos.carpeta.ubicacionFisica === 'Estante B')
        verificar('Rechaza editar con un número ya usado', (await u('PUT', `/api/carpetas/${c2._id}`, { numero: 'TEST-C1' })).estado === 409)
        verificar('Una carpeta inexistente responde 404', (await u('GET', `/api/carpetas/${new mongoose.Types.ObjectId()}`)).estado === 404)

        verificar('No inactiva una carpeta con obras activas', (await u('PATCH', `/api/carpetas/${c1._id}/estado`, { activa: false })).estado === 409)
        verificar('Inactiva una carpeta sin obras', (await u('PATCH', `/api/carpetas/${c2._id}/estado`, { activa: false })).datos?.carpeta?.activa === false)
        const rInact = await u('GET', '/api/carpetas?q=TEST-C&activa=false')
        verificar('Filtra las carpetas inactivas', rInact.datos?.carpetas.map((c) => c.numero).join(',') === 'TEST-C2B')
        verificar('Reactiva la carpeta', (await u('PATCH', `/api/carpetas/${c2._id}/estado`, { activa: true })).datos?.carpeta?.activa === true)
        verificar('Rechaza un filtro de estado inválido', (await u('GET', '/api/carpetas?activa=quizas')).estado === 400)

        // ================= CATÁLOGOS =================
        verificar('Catálogos: el administrador no tiene acceso', (await enviar('GET', '/api/catalogos', undefined, cookieAdmin)).estado === 403)

        const rAgr = await u('POST', '/api/catalogos', { tipo: 'agrupacion', nombre: 'Test Orquesta Sinfónica' })
        const agr = rAgr.datos?.catalogo
        verificar('Crea una agrupación y registra quién la creó', rAgr.estado === 201 && String(agr?.creadoPor) === String(usuario._id))
        verificar('Rechaza un valor repetido sin importar tildes ni mayúsculas', (await u('POST', '/api/catalogos', { tipo: 'agrupacion', nombre: 'TEST ORQUESTA SINFONICA' })).estado === 409)
        verificar('Rechaza un tipo de catálogo inválido', (await u('POST', '/api/catalogos', { tipo: 'otro', nombre: 'Test Algo' })).estado === 400)
        verificar('Rechaza un nombre demasiado corto', (await u('POST', '/api/catalogos', { tipo: 'agrupacion', nombre: 'a' })).estado === 400)

        const fam = (await u('POST', '/api/catalogos', { tipo: 'familiaInstrumento', nombre: 'Test Cuerdas' })).datos?.catalogo
        const vio = (await u('POST', '/api/catalogos', { tipo: 'instrumento', nombre: 'Test Violín', familia: fam._id })).datos?.catalogo
        verificar('Crea una familia y un instrumento dentro de ella', !!fam?._id && !!vio?._id)
        verificar('Rechaza un instrumento sin familia', (await u('POST', '/api/catalogos', { tipo: 'instrumento', nombre: 'Test Viola' })).estado === 400)
        verificar('Rechaza un instrumento cuya familia no es una familia', (await u('POST', '/api/catalogos', { tipo: 'instrumento', nombre: 'Test Viola', familia: agr._id })).estado === 400)
        verificar('Rechaza familia en un tipo que no es instrumento', (await u('POST', '/api/catalogos', { tipo: 'tipoObra', nombre: 'Test Sinfonía', familia: fam._id })).estado === 400)

        const rIns = await u('GET', `/api/catalogos?tipo=instrumento&familia=${fam._id}`)
        verificar('Lista los instrumentos de una familia', rIns.datos?.catalogos.length === 1 && rIns.datos.catalogos[0].nombre === 'Test Violín')
        verificar('Lista los valores activos de un tipo', (await u('GET', '/api/catalogos?tipo=agrupacion&activo=true')).datos?.catalogos.some((c) => c._id === agr._id))
        verificar('Rechaza un tipo inválido en la consulta', (await u('GET', '/api/catalogos?tipo=otro')).estado === 400)

        const rRen = await u('PUT', `/api/catalogos/${vio._id}`, { nombre: 'Test Violines' })
        verificar('Renombra un valor', rRen.estado === 200 && rRen.datos.catalogo.nombre === 'Test Violines' && rRen.datos.catalogo.nombreNormalizado === 'test violines')
        const viola = (await u('POST', '/api/catalogos', { tipo: 'instrumento', nombre: 'Test Viola', familia: fam._id })).datos?.catalogo
        verificar('Rechaza renombrar con un nombre ya existente', (await u('PUT', `/api/catalogos/${viola._id}`, { nombre: 'test VIOLINES' })).estado === 409)
        verificar('Renombrar un id inexistente responde 404', (await u('PUT', `/api/catalogos/${new mongoose.Types.ObjectId()}`, { nombre: 'Test Nada' })).estado === 404)

        const estado = (id, activo) => u('PATCH', `/api/catalogos/${id}/estado`, { activo })
        verificar('No inactiva una familia con instrumentos activos', (await estado(fam._id, false)).estado === 409)
        await estado(viola._id, false)
        verificar('Inactiva un instrumento', (await estado(vio._id, false)).datos?.catalogo?.activo === false)
        verificar('Inactiva la familia cuando ya no tiene instrumentos activos', (await estado(fam._id, false)).datos?.catalogo?.activo === false)
        verificar('No reactiva un instrumento si su familia está inactiva', (await estado(vio._id, true)).estado === 409)
        verificar('No crea instrumentos en una familia inactiva', (await u('POST', '/api/catalogos', { tipo: 'instrumento', nombre: 'Test Cello', familia: fam._id })).estado === 409)
        verificar('Reactiva la familia', (await estado(fam._id, true)).datos?.catalogo?.activo === true)
        verificar('Reactiva el instrumento', (await estado(vio._id, true)).datos?.catalogo?.activo === true)

        await estado(agr._id, false)
        const rDupInactivo = await u('POST', '/api/catalogos', { tipo: 'agrupacion', nombre: 'Test Orquesta Sinfonica' })
        verificar('Si el valor existe inactivo, sugiere reactivarlo', rDupInactivo.estado === 409 && /inactivo/.test(rDupInactivo.datos.msg))
        verificar('Filtra los valores inactivos', (await u('GET', '/api/catalogos?tipo=agrupacion&activo=false')).datos?.catalogos.some((c) => c._id === agr._id))
        verificar('Reactiva la agrupación', (await estado(agr._id, true)).datos?.catalogo?.activo === true)
    } finally {
        await limpiar()
        await mongoose.disconnect()
    }
    terminar()
}

ejecutar().catch((e) => {
    console.error('Error en el script:', e)
    process.exit(1)
})