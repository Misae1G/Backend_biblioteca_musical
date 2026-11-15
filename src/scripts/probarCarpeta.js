import 'dotenv/config'
import mongoose from 'mongoose'
import Carpeta from '../models/Carpeta.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const limpiar = () => Carpeta.deleteMany({ numero: /^TEST-/ })

const falla = async (datos, codigo) => {
    try {
        await Carpeta.create(datos)
        return false
    } catch (e) {
        return codigo ? e.code === codigo : e.name === 'ValidationError'
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    await Carpeta.init()
    await limpiar()

    try {
        const c = await Carpeta.create({
            numero: '  test-001 ',
            ubicacionFisica: 'Estante A, repisa 2',
        })
        verificar('Crea carpeta válida', !!c._id)
        verificar('El número se guarda en mayúsculas y sin espacios', c.numero === 'TEST-001')
        verificar('activa es true por defecto', c.activa === true)

        const sinUbicacion = await Carpeta.create({ numero: 'TEST-002' })
        verificar('La ubicación es opcional', !!sinUbicacion._id)

        verificar('Rechaza número duplicado', await falla({ numero: 'TEST-001' }, 11000))
        verificar('Rechaza duplicado en minúsculas', await falla({ numero: 'test-001' }, 11000))
        verificar('Rechaza carpeta sin número', await falla({ ubicacionFisica: 'Estante B' }))
        verificar('Rechaza número con caracteres inválidos', await falla({ numero: 'TEST 3/@' }))
        verificar('Rechaza número demasiado largo', await falla({ numero: 'TEST-' + '9'.repeat(30) }))
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