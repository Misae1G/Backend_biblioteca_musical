import 'dotenv/config'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import Usuario from '../models/Usuario.js'

// Sin correo real durante las pruebas
process.env.SMTP_HOST = ''
process.env.SMTP_USER = ''
process.env.SMTP_PASS = ''

let nombreBase = ''
try {
    nombreBase = new URL(process.env.MONGODB_URI).pathname.replace('/', '')
} catch {
    // se valida abajo
}
if (!nombreBase || /prod/i.test(nombreBase)) {
    console.error(`Base "${nombreBase || '(sin nombre)'}" no permitida para pruebas. Usa biblioteca_dev.`)
    process.exit(1)
}

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const CORREO = 'test.auth.admin@test.local'
const CORREO_INACTIVO = 'test.auth.inactivo@test.local'
const USUARIO = 'test_auth_usuario'
const USUARIO_BAJA = 'test_auth_baja'
const PASS = 'Clave12345'
const PASS_NUEVA = 'NuevaClave789'
const PASS_ADMIN_NUEVA = 'OtraClave456'
const MSG_RECUPERAR =
    'Si el correo pertenece a un administrador activo, recibirás un mensaje con las instrucciones'

const limpiar = () =>
    Usuario.deleteMany({ $or: [{ correo: /^test\.auth\./ }, { nombreUsuario: /^test_auth_/ }] })

const crearApi = (base) => async (ruta, { metodo = 'GET', cuerpo, cookie } = {}) => {
    const headers = {}
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json'
    if (cookie) headers.Cookie = cookie
    const res = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    })
    const texto = await res.text()
    let datos = null
    try {
        datos = JSON.parse(texto)
    } catch {
        // respuesta sin JSON
    }
    return { estado: res.status, datos, cookies: res.headers.getSetCookie() }
}

const cookieDe = (r) => r.cookies.find((c) => c.startsWith('token='))?.split(';')[0] ?? null
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex')

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Usuario.init()
    await limpiar()

    const { default: app } = await import('../server.js')
    const { default: config } = await import('../config/env.js')
    const { protegido } = await import('../middlewares/auth.js')
    const { manejarErrores } = await import('../middlewares/errores.js')

    // Mini aplicación para probar rutas protegidas por rol
    const mini = express()
    mini.use(cookieParser())
    mini.get('/solo-usuario', ...protegido('usuario'), (req, res) => res.json({ ok: true }))
    mini.get('/solo-admin', ...protegido('administrador'), (req, res) => res.json({ ok: true }))
    mini.use(manejarErrores)

    const iniciar = (a) =>
        new Promise((resolve) => {
            const s = a.listen(0, '127.0.0.1', () => resolve(s))
        })
    const servidor = await iniciar(app)
    const servidorMini = await iniciar(mini)
    const api = crearApi(`http://127.0.0.1:${servidor.address().port}`)
    const apiMini = crearApi(`http://127.0.0.1:${servidorMini.address().port}`)

    const login = (identificador, password) =>
        api('/api/auth/login', { metodo: 'POST', cuerpo: { identificador, password } })
    const cambiar = (cookie, actual, nueva) =>
        api('/api/auth/cambiar-password', {
            metodo: 'POST',
            cookie,
            cuerpo: { passwordActual: actual, passwordNueva: nueva },
        })
    const recuperar = (correo) => api('/api/auth/recuperar', { metodo: 'POST', cuerpo: { correo } })
    const restablecer = (token, passwordNueva) =>
        api('/api/auth/restablecer', { metodo: 'POST', cuerpo: { token, passwordNueva } })
    const leerCodigo = () =>
        Usuario.findOne({ correo: CORREO }).select('+codigoRecuperacion +codigoRecuperacionExpira')

    try {
        const admin = await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: CORREO, password: PASS })
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin Inactivo', correo: CORREO_INACTIVO, password: PASS, activo: false })
        await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: USUARIO, password: PASS })
        await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario Baja', nombreUsuario: USUARIO_BAJA, password: PASS })

        // --- Inicio de sesión ---
        verificar('Responde /api/salud', (await api('/api/salud')).datos?.ok === true)
        verificar('Rechaza /me sin sesión', (await api('/api/auth/me')).estado === 401)

        const rAdmin = await login('TEST.Auth.Admin@Test.local', PASS)
        const cookieAdmin = cookieDe(rAdmin)
        verificar('Login de administrador con correo (sin distinguir mayúsculas)', rAdmin.estado === 200 && !!cookieAdmin)
        const lineaCookie = rAdmin.cookies.find((c) => c.startsWith('token=')) ?? ''
        verificar('La cookie es HttpOnly y SameSite=Lax en desarrollo',
            /HttpOnly/i.test(lineaCookie) && /SameSite=Lax/i.test(lineaCookie))
        verificar('La respuesta no incluye contraseña ni token',
            rAdmin.datos.usuario.password === undefined && rAdmin.datos.token === undefined)
        verificar('Una cuenta nueva debe cambiar su contraseña', rAdmin.datos.usuario.debeCambiarPassword === true)
        verificar('Guarda el último acceso', (await Usuario.findOne({ correo: CORREO })).ultimoAcceso instanceof Date)

        const rUsuario = await login(USUARIO, PASS)
        const cookieUsuario = cookieDe(rUsuario)
        verificar('Login de usuario con nombre de usuario', rUsuario.estado === 200 && rUsuario.datos.usuario.rol === 'usuario')

        const rMal = await login(USUARIO, 'ClaveIncorrecta1')
        const rNoExiste = await login('no_existe_test', PASS)
        verificar('Rechaza contraseña incorrecta', rMal.estado === 401)
        verificar('El mensaje es idéntico si el usuario no existe',
            rNoExiste.estado === 401 && rNoExiste.datos.msg === rMal.datos.msg)
        verificar('Rechaza login sin contraseña',
            (await api('/api/auth/login', { metodo: 'POST', cuerpo: { identificador: USUARIO } })).estado === 400)
        verificar('Rechaza cuenta desactivada con contraseña correcta', (await login(CORREO_INACTIVO, PASS)).estado === 403)

        // --- Sesión y tokens ---
        const rMe = await api('/api/auth/me', { cookie: cookieAdmin })
        verificar('/me devuelve el usuario de la sesión', rMe.estado === 200 && rMe.datos.usuario.correo === CORREO)
        verificar('Rechaza un token inventado', (await api('/api/auth/me', { cookie: 'token=abc.def.ghi' })).estado === 401)
        const tokenOtraClave = jwt.sign({ rol: 'administrador' }, 'una-clave-distinta-a-la-del-sistema-123456',
            { subject: String(admin._id), expiresIn: '1h' })
        verificar('Rechaza un token firmado con otra clave',
            (await api('/api/auth/me', { cookie: `token=${tokenOtraClave}` })).estado === 401)
        const tokenVencido = jwt.sign({ rol: 'administrador', exp: Math.floor(Date.now() / 1000) - 30 },
            config.jwtSecret, { subject: String(admin._id) })
        verificar('Rechaza un token vencido', (await api('/api/auth/me', { cookie: `token=${tokenVencido}` })).estado === 401)

        // --- Roles y contraseña temporal ---
        verificar('Ruta protegida sin sesión: 401', (await apiMini('/solo-usuario')).estado === 401)
        const rBloqueo = await apiMini('/solo-usuario', { cookie: cookieUsuario })
        verificar('Con contraseña temporal solo se permite cambiarla: 403',
            rBloqueo.estado === 403 && /cambiar tu contraseña/.test(rBloqueo.datos.msg))
        await Usuario.updateOne({ correo: CORREO }, { debeCambiarPassword: false })
        const rRol = await apiMini('/solo-usuario', { cookie: cookieAdmin })
        verificar('El administrador no entra a rutas del usuario: 403', rRol.estado === 403 && /permiso/.test(rRol.datos.msg))
        verificar('El administrador entra a rutas de administrador: 200', (await apiMini('/solo-admin', { cookie: cookieAdmin })).estado === 200)

        // --- Cambio de contraseña ---
        verificar('Cambiar contraseña exige sesión', (await cambiar(null, PASS, PASS_NUEVA)).estado === 401)
        verificar('Rechaza contraseña actual incorrecta', (await cambiar(cookieUsuario, 'Incorrecta123', PASS_NUEVA)).estado === 400)
        verificar('Rechaza nueva igual a la actual', (await cambiar(cookieUsuario, PASS, PASS)).estado === 400)
        verificar('Rechaza nueva sin letras', (await cambiar(cookieUsuario, PASS, '12345678')).estado === 400)
        verificar('Rechaza nueva demasiado corta', (await cambiar(cookieUsuario, PASS, 'Ab1')).estado === 400)

        await dormir(1100) // para que la sesión anterior sea anterior al cambio
        const rCambio = await cambiar(cookieUsuario, PASS, PASS_NUEVA)
        const cookieNueva = cookieDe(rCambio)
        verificar('Cambia la contraseña y devuelve una sesión nueva',
            rCambio.estado === 200 && !!cookieNueva && rCambio.datos.usuario.debeCambiarPassword === false)
        verificar('La sesión anterior deja de ser válida', (await api('/api/auth/me', { cookie: cookieUsuario })).estado === 401)
        verificar('La sesión nueva sí funciona', (await api('/api/auth/me', { cookie: cookieNueva })).estado === 200)
        verificar('Ya puede usar rutas protegidas', (await apiMini('/solo-usuario', { cookie: cookieNueva })).estado === 200)
        verificar('La contraseña anterior ya no sirve', (await login(USUARIO, PASS)).estado === 401)
        verificar('La contraseña nueva sirve', (await login(USUARIO, PASS_NUEVA)).estado === 200)

        // --- Cuenta desactivada ---
        const cookieBaja = cookieDe(await login(USUARIO_BAJA, PASS))
        verificar('Una cuenta activa usa su sesión', (await api('/api/auth/me', { cookie: cookieBaja })).estado === 200)
        await Usuario.updateOne({ nombreUsuario: USUARIO_BAJA }, { activo: false })
        verificar('Al desactivar la cuenta su sesión deja de funcionar', (await api('/api/auth/me', { cookie: cookieBaja })).estado === 401)
        verificar('Una cuenta desactivada no puede iniciar sesión', (await login(USUARIO_BAJA, PASS)).estado === 403)

        // --- Cierre de sesión ---
        const rSalir = await api('/api/auth/logout', { metodo: 'POST' })
        const lineaSalir = rSalir.cookies.find((c) => c.startsWith('token=')) ?? ''
        verificar('Cerrar sesión borra la cookie',
            rSalir.estado === 200 && /^token=;/.test(lineaSalir) && /Expires=Thu, 01 Jan 1970/i.test(lineaSalir))

        // --- Recuperación de contraseña del administrador ---
        const r1 = await recuperar('TEST.auth.admin@test.local')
        const u1 = await leerCodigo()
        verificar('Recuperar: administrador activo recibe la respuesta genérica', r1.estado === 200 && r1.datos.msg === MSG_RECUPERAR)
        verificar('Se guarda un código (hash) que vence en unos 30 minutos',
            u1.codigoRecuperacion?.length === 64 &&
            u1.codigoRecuperacionExpira > new Date() &&
            u1.codigoRecuperacionExpira < new Date(Date.now() + 31 * 60 * 1000))
        const r2 = await recuperar('no.existe.test@test.local')
        verificar('Correo inexistente: misma respuesta', r2.estado === 200 && r2.datos.msg === MSG_RECUPERAR)
        const r3 = await recuperar(CORREO_INACTIVO)
        const uInactivo = await Usuario.findOne({ correo: CORREO_INACTIVO }).select('+codigoRecuperacion')
        verificar('Administrador desactivado: misma respuesta y sin código',
            r3.estado === 200 && r3.datos.msg === MSG_RECUPERAR && !uInactivo.codigoRecuperacion)
        verificar('Rechaza un correo con formato inválido', (await recuperar('no-es-correo')).estado === 400)

        const tokenConocido = crypto.randomBytes(32).toString('hex')
        await Usuario.updateOne({ correo: CORREO }, {
            codigoRecuperacion: hash(tokenConocido),
            codigoRecuperacionExpira: new Date(Date.now() + 10 * 60 * 1000),
        })
        verificar('Restablecer: rechaza contraseña débil y conserva el código',
            (await restablecer(tokenConocido, '12345678')).estado === 400 && !!(await leerCodigo()).codigoRecuperacion)
        verificar('Restablecer: rechaza un código desconocido',
            (await restablecer(crypto.randomBytes(32).toString('hex'), PASS_ADMIN_NUEVA)).estado === 400)
        const rOk = await restablecer(tokenConocido, PASS_ADMIN_NUEVA)
        const uDespues = await leerCodigo()
        verificar('Restablecer: cambia la contraseña con un código válido', rOk.estado === 200)
        verificar('El código se borra tras usarse', !uDespues.codigoRecuperacion && !uDespues.codigoRecuperacionExpira)
        verificar('Se puede iniciar sesión con la contraseña nueva', (await login(CORREO, PASS_ADMIN_NUEVA)).estado === 200)
        verificar('El código no se puede reutilizar', (await restablecer(tokenConocido, 'Otra98765x')).estado === 400)
        const tokenViejo = crypto.randomBytes(32).toString('hex')
        await Usuario.updateOne({ correo: CORREO }, {
            codigoRecuperacion: hash(tokenViejo),
            codigoRecuperacionExpira: new Date(Date.now() - 1000),
        })
        verificar('Un código vencido se rechaza', (await restablecer(tokenViejo, PASS_ADMIN_NUEVA)).estado === 400)

        // --- Límites de intentos (siempre al final) ---
        let bloqueadoLogin = null
        for (let i = 0; i < 30 && !bloqueadoLogin; i++) {
            const r = await api('/api/auth/login', { metodo: 'POST', cuerpo: { identificador: 'x' } })
            if (r.estado === 429) bloqueadoLogin = r
        }
        verificar('Tras demasiados intentos fallidos el login responde 429',
            !!bloqueadoLogin && /Demasiados/.test(bloqueadoLogin.datos.msg))

        let bloqueadoRecuperar = null
        for (let i = 0; i < 5 && !bloqueadoRecuperar; i++) {
            const r = await recuperar('no.existe.test@test.local')
            if (r.estado === 429) bloqueadoRecuperar = r
        }
        verificar('Tras demasiadas solicitudes la recuperación responde 429',
            !!bloqueadoRecuperar && /Demasiadas/.test(bloqueadoRecuperar.datos.msg))
    } finally {
        await limpiar()
        await mongoose.disconnect()
    }

    const fallos = resultados.filter((r) => !r).length
    console.log(fallos === 0 ? '\nTodas las pruebas pasaron.' : `\n${fallos} prueba(s) fallaron.`)
    process.exit(fallos === 0 ? 0 : 1)
}

ejecutar().catch((e) => {
    console.error('Error en el script:', e)
    process.exit(1)
})