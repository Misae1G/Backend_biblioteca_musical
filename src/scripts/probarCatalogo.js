import 'dotenv/config'
import mongoose from 'mongoose'
import Catalogo from '../models/Catalogo.js'
import { normalizarTexto } from '../utils/texto.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const limpiar = () => Catalogo.deleteMany({ nombreNormalizado: /^test/ })

const falla = async (datos, codigo) => {
    try {
        await Catalogo.create(datos)
        return false
    } catch (e) {
        return codigo ? e.code === codigo : e.name === 'ValidationError'
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    await Catalogo.init()
    await limpiar()

    try {
        verificar('Normaliza tildes, mayúsculas y espacios',
            normalizarTexto('  Sinfónica   JUVENIL ') === 'sinfonica juvenil')

        const agr = await Catalogo.create({ tipo: 'agrupacion', nombre: '  Test Sinfónica ' })
        verificar('Crea agrupación válida', !!agr._id)
        verificar('Guarda nombre normalizado', agr.nombreNormalizado === 'test sinfonica')
        verificar('activo es true por defecto', agr.activo === true)

        verificar('Rechaza duplicado sin tildes ni mayúsculas',
            await falla({ tipo: 'agrupacion', nombre: 'TEST SINFONICA' }, 11000))

        const otroTipo = await Catalogo.create({ tipo: 'tipoObra', nombre: 'Test Sinfónica' })
        verificar('Permite el mismo nombre en otro tipo', !!otroTipo._id)

        verificar('Rechaza tipo inválido', await falla({ tipo: 'otro', nombre: 'Test X' }))
        verificar('Rechaza nombre vacío', await falla({ tipo: 'agrupacion', nombre: '   ' }))

        const familia = await Catalogo.create({ tipo: 'familiaInstrumento', nombre: 'Test Cuerdas' })
        const violin = await Catalogo.create({ tipo: 'instrumento', nombre: 'Test Violín', familia: familia._id })
        verificar('Crea instrumento con familia válida', !!violin._id)

        verificar('Rechaza instrumento sin familia',
            await falla({ tipo: 'instrumento', nombre: 'Test Viola' }))
        verificar('Rechaza instrumento cuya familia no es una familia',
            await falla({ tipo: 'instrumento', nombre: 'Test Cello', familia: agr._id }))
        verificar('Rechaza familia en un tipo que no es instrumento',
            await falla({ tipo: 'agrupacion', nombre: 'Test Banda', familia: familia._id }))
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