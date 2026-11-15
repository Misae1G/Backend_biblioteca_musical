import 'dotenv/config'
import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const correoPrueba = 'prueba.admin@test.local'
const usuarioPrueba = 'prueba_usuario'

const limpiar = () =>
    Usuario.deleteMany({ $or: [{ correo: correoPrueba }, { nombreUsuario: usuarioPrueba }] })

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI_PRODUCTION)
    await Usuario.init() // crea los índices antes de probar
    await limpiar()

    try {
        // 1. Crear administrador válido
        const admin = await Usuario.create({
            rol: 'administrador',
            nombre: 'Admin de Prueba',
            correo: 'PRUEBA.Admin@Test.local',
            password: 'Clave12345',
        })
        verificar('Crea administrador válido', !!admin._id)
        verificar('El correo se guarda en minúsculas', admin.correo === correoPrueba)

        // 2. La contraseña se guarda cifrada y se puede comparar
        const guardado = await Usuario.findById(admin._id).select('+password')
        verificar('La contraseña no se guarda en texto', guardado.password !== 'Clave12345')
        verificar('Contraseña correcta se acepta', await guardado.compararPassword('Clave12345'))
        verificar('Contraseña incorrecta se rechaza', !(await guardado.compararPassword('otra')))

        // 3. La contraseña no sale en las consultas ni en JSON
        const sinPass = await Usuario.findById(admin._id)
        verificar('La consulta normal no devuelve password', sinPass.password === undefined)
        verificar('toJSON no incluye password', !('password' in admin.toJSON()))

        // 4. Correo duplicado
        let duplicado = false
        try {
            await Usuario.create({ rol: 'administrador', nombre: 'Otro Admin', correo: correoPrueba, password: 'Clave12345' })
        } catch (e) {
            duplicado = e.code === 11000
        }
        verificar('Rechaza correo duplicado', duplicado)

        // 5. Crear usuario válido
        const usuario = await Usuario.create({
            rol: 'usuario',
            nombre: 'Usuario de Prueba',
            nombreUsuario: usuarioPrueba,
            password: 'Clave12345',
        })
        verificar('Crea usuario válido', !!usuario._id)
        verificar('debeCambiarPassword es true por defecto', usuario.debeCambiarPassword === true)

        // 6. Reglas por rol
        const falla = async (datos) => {
            try {
                await Usuario.create(datos)
                return false
            } catch (e) {
                return e.name === 'ValidationError'
            }
        }
        verificar('Rechaza administrador sin correo',
            await falla({ rol: 'administrador', nombre: 'Sin Correo', password: 'Clave12345' }))
        verificar('Rechaza usuario sin nombre de usuario',
            await falla({ rol: 'usuario', nombre: 'Sin Usuario', password: 'Clave12345' }))
        verificar('Rechaza usuario con correo',
            await falla({ rol: 'usuario', nombre: 'Con Correo', nombreUsuario: 'otro_user', correo: 'x@y.com', password: 'Clave12345' }))
        verificar('Rechaza contraseña corta',
            await falla({ rol: 'usuario', nombre: 'Clave Corta', nombreUsuario: 'otro_user2', password: '123' }))
        verificar('Rechaza nombre de usuario con espacios o @',
            await falla({ rol: 'usuario', nombre: 'Usuario Raro', nombreUsuario: 'juan @perez', password: 'Clave12345' }))
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