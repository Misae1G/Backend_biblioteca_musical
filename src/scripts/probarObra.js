import 'dotenv/config'
import mongoose from 'mongoose'
import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const limpiar = async () => {
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Catalogo.deleteMany({ nombreNormalizado: /^test/ })
}

// Devuelve true si la creación falla con error de validación en ese campo
const falla = async (datos, campo) => {
    try {
        await Obra.create(datos)
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI_PRODUCTION)
    await Obra.init()
    await limpiar()

    try {
        const carpeta = await Carpeta.create({ numero: 'TEST-OB1' })
        const tipoObra = await Catalogo.create({ tipo: 'tipoObra', nombre: 'Test Sinfónica' })
        const agrupacion = await Catalogo.create({ tipo: 'agrupacion', nombre: 'Test Orquesta' })
        const cuerdas = await Catalogo.create({ tipo: 'familiaInstrumento', nombre: 'Test Cuerdas' })
        const vientos = await Catalogo.create({ tipo: 'familiaInstrumento', nombre: 'Test Vientos' })
        const violin = await Catalogo.create({ tipo: 'instrumento', nombre: 'Test Violín', familia: cuerdas._id })
        const flauta = await Catalogo.create({ tipo: 'instrumento', nombre: 'Test Flauta', familia: vientos._id })

        const base = { titulo: 'TEST Obra', tipoRegistro: 'original', carpeta: carpeta._id }

        // Creación válida
        const minima = await Obra.create({ ...base, titulo: '  TEST Mínima  ' })
        verificar('Crea obra con solo título, tipo y carpeta', !!minima._id)
        verificar('Valores por defecto correctos',
            minima.activa === true && minima.pendienteDeCompletar === false &&
            minima.prestadaFisicamente === false && minima.enInterpretacion === false)
        verificar('El título se guarda sin espacios sobrantes', minima.titulo === 'TEST Mínima')

        const completa = await Obra.create({
            ...base,
            titulo: 'TEST Completa',
            autor: 'Autor de Prueba',
            procedencia: 'ecuatoriana',
            tipoObra: tipoObra._id,
            agrupacion: agrupacion._id,
            anioComposicion: 1950,
            tonalidad: 'Re mayor',
            compas: '4/4',
            tiempo: 'Allegro',
            duracion: 245,
            numeroMovimientos: 3,
            instrumentacion: [
                { familia: cuerdas._id, instrumento: violin._id, cantidad: 8 },
                { familia: vientos._id, instrumento: flauta._id },
            ],
        })
        verificar('Crea obra completa con catálogos e instrumentación', !!completa._id)

        // Campos obligatorios y valores inválidos
        verificar('Rechaza obra sin título', await falla({ ...base, titulo: undefined }, 'titulo'))
        verificar('Rechaza obra sin carpeta', await falla({ ...base, carpeta: undefined }, 'carpeta'))
        verificar('Rechaza tipo de registro inválido', await falla({ ...base, tipoRegistro: 'otro' }, 'tipoRegistro'))
        verificar('Rechaza procedencia inválida', await falla({ ...base, procedencia: 'marciana' }, 'procedencia'))
        verificar('Rechaza carpeta inexistente',
            await falla({ ...base, carpeta: new mongoose.Types.ObjectId() }, 'carpeta'))
        verificar('Rechaza tipo de obra que no es del catálogo de tipos',
            await falla({ ...base, tipoObra: agrupacion._id }, 'tipoObra'))
        verificar('Rechaza agrupación que no es del catálogo de agrupaciones',
            await falla({ ...base, agrupacion: tipoObra._id }, 'agrupacion'))
        verificar('Rechaza año de composición inválido', await falla({ ...base, anioComposicion: 99 }, 'anioComposicion'))
        verificar('Rechaza año de arreglo en el futuro lejano', await falla({ ...base, anioArreglo: 3000 }, 'anioArreglo'))
        verificar('Rechaza duración negativa', await falla({ ...base, duracion: -5 }, 'duracion'))

        // Adaptaciones
        const adaptacion = await Obra.create({
            ...base, titulo: 'TEST Adaptación', tipoRegistro: 'adaptacion', obraOriginal: completa._id,
        })
        verificar('Crea adaptación con obra original válida', !!adaptacion._id)
        verificar('Rechaza obra original en una obra que no es adaptación',
            await falla({ ...base, obraOriginal: completa._id }, 'obraOriginal'))
        const idPropio = new mongoose.Types.ObjectId()
        verificar('Rechaza adaptación de sí misma',
            await falla({ ...base, _id: idPropio, tipoRegistro: 'adaptacion', obraOriginal: idPropio }, 'obraOriginal'))
        verificar('Rechaza obra original inexistente',
            await falla({ ...base, tipoRegistro: 'adaptacion', obraOriginal: new mongoose.Types.ObjectId() }, 'obraOriginal'))

        // Instrumentación
        verificar('Rechaza instrumento que no pertenece a la familia',
            await falla({ ...base, instrumentacion: [{ familia: vientos._id, instrumento: violin._id }] },
                'instrumentacion.0.instrumento'))
        verificar('Rechaza cantidad menor a 1',
            await falla({ ...base, instrumentacion: [{ familia: cuerdas._id, instrumento: violin._id, cantidad: 0 }] },
                'instrumentacion.0.cantidad'))
        verificar('Rechaza familia que no es una familia',
            await falla({ ...base, instrumentacion: [{ familia: agrupacion._id, instrumento: violin._id }] },
                'instrumentacion.0.familia'))

        // Estados de disponibilidad
        const estado = (p, i) => new Obra({ ...base, prestadaFisicamente: p, enInterpretacion: i }).estadoDisponibilidad
        verificar('Estado: Disponible', estado(false, false) === 'disponible')
        verificar('Estado: En interpretación', estado(false, true) === 'en_interpretacion')
        verificar('Estado: Prestada físicamente', estado(true, false) === 'prestada_fisicamente')
        verificar('Estado: En interpretación y prestada', estado(true, true) === 'en_interpretacion_y_prestada')
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