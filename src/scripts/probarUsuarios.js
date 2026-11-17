import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import { exigirBaseDePruebas, crearVerificador, crearApi, cookieDe, iniciarServidor } from './_ayuda.js'

exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const PASS = 'Clave12345'
const limpiar = () =>
    Usuario.deleteMany({ $or: [{ correo: /^test\.usr\./ }, { nombreUsuario: /^test_usr_/ }] })

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Usuario.init()
    await limpiar()

    const { default: app } = await import('../server.js')
    const servidor = await iniciarServidor(app)
    const api = crearApi(`http://127.0.0.1:${servidor.address().port}`)
    const enviar = (metodo, ruta, cuerpo, cookie) => api(ruta, { metodo, cuerpo, cookie })
    const login = (identificador, password) => enviar('POST', '/api/auth/login', { identificador, password })

    try {
        const admin1 = await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin Uno', correo: 'test.usr.admin1@test.local', password: PASS, debeCambiarPassword: false })
        const admin2 = await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin Dos', correo: 'test.usr.admin2@test.local', password: PASS, debeCambiarPassword: false })
        await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario Comun', nombreUsuario: 'test_usr_comun', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.usr.admin1@test.local', PASS))
        const cookieComun = cookieDe(await login('test_usr_comun', PASS))

        // --- Acceso ---
        verificar('Exige sesión', (await enviar('GET', '/api/usuarios')).estado === 401)
        verificar('Un usuario común no accede a la gestión de cuentas', (await enviar('GET', '/api/usuarios', undefined, cookieComun)).estado === 403)
        const rVacia = await enviar('GET', '/api/usuarios', undefined, cookieAdmin)
        verificar('El administrador lista las cuentas', rVacia.estado === 200 && Array.isArray(rVacia.datos.usuarios) && rVacia.datos.total >= 3)
        verificar('La lista no expone contraseñas', !JSON.stringify(rVacia.datos).includes('$2'))

        // --- Crear ---
        const rCrear = await enviar('POST', '/api/usuarios', { nombre: 'TEST Músico Uno', nombreUsuario: ' TEST_USR_Uno ' }, cookieAdmin)
        const uno = rCrear.datos?.usuario
        const temp1 = rCrear.datos?.passwordTemporal
        verificar('Crea un usuario con contraseña temporal', rCrear.estado === 201 && uno?.rol === 'usuario' && typeof temp1 === 'string' && temp1.length === 12)
        verificar('El nombre de usuario se guarda en minúsculas y sin espacios', uno?.nombreUsuario === 'test_usr_uno')
        verificar('La cuenta nueva debe cambiar su contraseña', uno?.debeCambiarPassword === true)
        verificar('La respuesta no incluye el hash de la contraseña', !JSON.stringify(rCrear.datos).includes('$2'))
        const rLoginUno = await login('test_usr_uno', temp1)
        verificar('El usuario nuevo inicia sesión con la contraseña temporal', rLoginUno.estado === 200 && rLoginUno.datos.usuario.debeCambiarPassword === true)

        const dos = (await enviar('POST', '/api/usuarios', { nombre: 'TEST Músico Dos', nombreUsuario: 'test_usr_dos' }, cookieAdmin)).datos?.usuario
        verificar('Rechaza un nombre de usuario repetido', (await enviar('POST', '/api/usuarios', { nombre: 'TEST Otro', nombreUsuario: 'TEST_usr_uno' }, cookieAdmin)).estado === 409)
        verificar('Rechaza un nombre de usuario con espacios o @', (await enviar('POST', '/api/usuarios', { nombre: 'TEST Raro', nombreUsuario: 'juan @perez' }, cookieAdmin)).estado === 400)
        verificar('Rechaza un nombre demasiado corto', (await enviar('POST', '/api/usuarios', { nombre: 'ab', nombreUsuario: 'test_usr_corto' }, cookieAdmin)).estado === 400)
        verificar('Rechaza crear sin nombre de usuario', (await enviar('POST', '/api/usuarios', { nombre: 'TEST Sin Usuario' }, cookieAdmin)).estado === 400)
        verificar('Un usuario común no puede crear cuentas', (await enviar('POST', '/api/usuarios', { nombre: 'TEST X Uno', nombreUsuario: 'test_usr_x' }, cookieComun)).estado === 403)

        // --- Consultar ---
        verificar('Consulta una cuenta por id', (await enviar('GET', `/api/usuarios/${uno._id}`, undefined, cookieAdmin)).datos?.usuario?.nombreUsuario === 'test_usr_uno')
        verificar('Un id inexistente responde 404', (await enviar('GET', `/api/usuarios/${new mongoose.Types.ObjectId()}`, undefined, cookieAdmin)).estado === 404)
        verificar('Un id mal formado responde 400', (await enviar('GET', '/api/usuarios/abc', undefined, cookieAdmin)).estado === 400)

        const rUsuarios = await enviar('GET', '/api/usuarios?rol=usuario&q=test_usr', undefined, cookieAdmin)
        verificar('Filtra por rol y texto', rUsuarios.datos?.usuarios.every((u) => u.rol === 'usuario') && rUsuarios.datos.total >= 3)
        const rAdmins = await enviar('GET', '/api/usuarios?rol=administrador&q=test.usr.admin', undefined, cookieAdmin)
        verificar('Filtra administradores por correo', rAdmins.datos?.total === 2)
        const rPagina = await enviar('GET', '/api/usuarios?q=test_usr&limite=1', undefined, cookieAdmin)
        verificar('Pagina los resultados', rPagina.datos?.usuarios.length === 1 && rPagina.datos.paginas === rPagina.datos.total && rPagina.datos.total >= 3)
        verificar('Rechaza un rol inválido en la consulta', (await enviar('GET', '/api/usuarios?rol=otro', undefined, cookieAdmin)).estado === 400)
        verificar('Rechaza un límite excesivo', (await enviar('GET', '/api/usuarios?limite=500', undefined, cookieAdmin)).estado === 400)

        // --- Editar ---
        const rEditar = await enviar('PUT', `/api/usuarios/${uno._id}`, { nombre: 'TEST Músico Uno Editado', nombreUsuario: 'test_usr_uno_ed' }, cookieAdmin)
        verificar('Edita nombre y nombre de usuario', rEditar.estado === 200 && rEditar.datos.usuario.nombreUsuario === 'test_usr_uno_ed')
        verificar('Rechaza editar con un nombre de usuario ya usado', (await enviar('PUT', `/api/usuarios/${dos._id}`, { nombre: 'TEST Músico Dos', nombreUsuario: 'test_usr_uno_ed' }, cookieAdmin)).estado === 409)
        verificar('No se edita una cuenta de administrador', (await enviar('PUT', `/api/usuarios/${admin2._id}`, { nombre: 'TEST Cambiado', nombreUsuario: 'test_usr_x' }, cookieAdmin)).estado === 403)

        // --- Activar y desactivar ---
        const cookieUno = cookieDe(await login('test_usr_uno_ed', temp1))
        const rBaja = await enviar('PATCH', `/api/usuarios/${uno._id}/estado`, { activo: false }, cookieAdmin)
        verificar('Desactiva una cuenta', rBaja.estado === 200 && rBaja.datos.usuario.activo === false)
        verificar('Su sesión deja de funcionar', (await enviar('GET', '/api/auth/me', undefined, cookieUno)).estado === 401)
        verificar('No puede iniciar sesión mientras está desactivada', (await login('test_usr_uno_ed', temp1)).estado === 403)
        const rInactivos = await enviar('GET', '/api/usuarios?activo=false&q=test_usr', undefined, cookieAdmin)
        verificar('Filtra las cuentas desactivadas', rInactivos.datos?.usuarios.some((u) => u._id === uno._id))
        const rAlta = await enviar('PATCH', `/api/usuarios/${uno._id}/estado`, { activo: true }, cookieAdmin)
        verificar('Reactiva la cuenta', rAlta.estado === 200 && (await login('test_usr_uno_ed', temp1)).estado === 200)
        verificar('Un administrador no puede desactivarse a sí mismo', (await enviar('PATCH', `/api/usuarios/${admin1._id}/estado`, { activo: false }, cookieAdmin)).estado === 409)
        verificar('Puede desactivar a otro administrador', (await enviar('PATCH', `/api/usuarios/${admin2._id}/estado`, { activo: false }, cookieAdmin)).estado === 200)
        verificar('El administrador desactivado no puede entrar', (await login('test.usr.admin2@test.local', PASS)).estado === 403)
        verificar('Reactiva al otro administrador', (await enviar('PATCH', `/api/usuarios/${admin2._id}/estado`, { activo: true }, cookieAdmin)).estado === 200)
        verificar('Rechaza un estado que no es booleano', (await enviar('PATCH', `/api/usuarios/${uno._id}/estado`, { activo: 'si' }, cookieAdmin)).estado === 400)
        verificar('Cambiar el estado de un id inexistente responde 404', (await enviar('PATCH', `/api/usuarios/${new mongoose.Types.ObjectId()}/estado`, { activo: false }, cookieAdmin)).estado === 404)

        // --- Restablecer contraseña ---
        const cookieUno2 = cookieDe(await login('test_usr_uno_ed', temp1))
        await dormir(1100) // para que la sesión anterior sea anterior al restablecimiento
        const rReset = await enviar('POST', `/api/usuarios/${uno._id}/restablecer-password`, undefined, cookieAdmin)
        const temp2 = rReset.datos?.passwordTemporal
        verificar('Restablece la contraseña y entrega una temporal nueva', rReset.estado === 200 && typeof temp2 === 'string' && temp2.length === 12 && temp2 !== temp1)
        verificar('La contraseña anterior ya no sirve', (await login('test_usr_uno_ed', temp1)).estado === 401)
        const rLogin2 = await login('test_usr_uno_ed', temp2)
        verificar('La temporal nueva sirve y obliga a cambiarla', rLogin2.estado === 200 && rLogin2.datos.usuario.debeCambiarPassword === true)
        verificar('Las sesiones anteriores dejan de valer', (await enviar('GET', '/api/auth/me', undefined, cookieUno2)).estado === 401)
        verificar('No se restablece la contraseña de un administrador', (await enviar('POST', `/api/usuarios/${admin2._id}/restablecer-password`, undefined, cookieAdmin)).estado === 403)
        verificar('Un usuario común no puede restablecer contraseñas', (await enviar('POST', `/api/usuarios/${uno._id}/restablecer-password`, undefined, cookieComun)).estado === 403)
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