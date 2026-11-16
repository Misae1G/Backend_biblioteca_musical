import 'dotenv/config'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'

const leerArgumento = (nombre) => {
    const i = process.argv.indexOf(`--${nombre}`)
    return i !== -1 ? process.argv[i + 1] : undefined
}

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I)
const generarPasswordTemporal = (largo = 12) => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    return Array.from({ length: largo }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('')
}

const ejecutar = async () => {
    const nombre = leerArgumento('nombre')
    const correo = leerArgumento('correo')

    if (!nombre || !correo) {
        console.error('Uso: node src/scripts/crearAdmin.js --nombre "Nombre Apellido" --correo "correo@ejemplo.com"')
        process.exit(1)
    }
    if (!process.env.MONGODB_URI) {
        console.error('Falta MONGODB_URI en el archivo .env')
        process.exit(1)
    }

    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}`)
    await Usuario.init()

    try {
        const password = generarPasswordTemporal()
        const admin = await Usuario.create({
            rol: 'administrador',
            nombre,
            correo,
            password,
            debeCambiarPassword: true,
        })

        console.log('\nAdministrador creado correctamente.')
        console.log(`  Nombre: ${admin.nombre}`)
        console.log(`  Correo: ${admin.correo}`)
        console.log(`  Contraseña temporal: ${password}`)
        console.log('\nCopia la contraseña ahora: no se vuelve a mostrar. Se te pedirá cambiarla al iniciar sesión.')
    } catch (e) {
        if (e.code === 11000) {
            console.error('Ya existe una cuenta con ese correo.')
        } else if (e.name === 'ValidationError') {
            Object.values(e.errors).forEach((x) => console.error(`- ${x.message}`))
        } else {
            throw e
        }
        process.exitCode = 1
    } finally {
        await mongoose.disconnect()
    }
}

ejecutar().catch((e) => {
    console.error('Error en el script:', e)
    process.exit(1)
})