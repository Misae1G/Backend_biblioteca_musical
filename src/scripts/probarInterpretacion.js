import 'dotenv/config'
import mongoose from 'mongoose'
import Interpretacion from '../models/Interpretacion.js'
import Contador from '../models/Contador.js'
import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const fecha = (s) => new Date(`${s}T00:00:00.000Z`)

const limpiar = async () => {
    await Interpretacion.deleteMany({ programa: /^TEST/ })
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
}

// Error de validación en un campo concreto al crear
const falla = async (datos, campo) => {
    try {
        await Interpretacion.create(datos)
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI_PRODUCTION)
    await Interpretacion.init()
    await limpiar()

    // Guardar el contador real para restaurarlo al final
    const contadorAntes = await Contador.findById('interpretacion')

    try {
        const usuarioId = new mongoose.Types.ObjectId()
        const carpeta = await Carpeta.create({ numero: 'TEST-INT' })
        const obraA = await Obra.create({ titulo: 'TEST Obra A', tipoRegistro: 'original', carpeta: carpeta._id })
        const obraC = await Obra.create({ titulo: 'TEST Obra C', tipoRegistro: 'original', carpeta: carpeta._id })
        const obraM = await Obra.create({
            titulo: 'TEST Mosaico', tipoRegistro: 'mosaico', carpeta: carpeta._id,
            canciones: [{ titulo: 'Canción 1' }, { titulo: 'Canción 2' }],
        })
        const obraInactiva = await Obra.create({ titulo: 'TEST Inactiva', tipoRegistro: 'original', carpeta: carpeta._id, activa: false })

        const base = {
            obra: obraA._id,
            fechaPrevista: fecha('2026-11-20'),
            programa: 'TEST Concierto de Navidad',
            director: 'María López',
            registradoPor: usuarioId,
        }

        // Creación válida
        const i1 = await Interpretacion.create({ ...base, programa: '  TEST Concierto de Navidad ', director: '  María   LÓPEZ ' })
        verificar('Crea interpretación válida con código INT-', /^INT-\d{4,}$/.test(i1.codigo))
        verificar('El estado inicial es programada', i1.estado === 'programada')
        verificar('Guarda programa y director normalizados',
            i1.programaNormalizado === 'test concierto de navidad' && i1.directorNormalizado === 'maria lopez')
        verificar('El solista es opcional', i1.solista === undefined)

        const codigoOriginal = i1.codigo
        i1.codigo = 'INT-9999'
        await i1.save()
        verificar('El código no se puede modificar', (await Interpretacion.findById(i1._id)).codigo === codigoOriginal)

        // Varias a la vez y mosaicos
        const i2 = await Interpretacion.create({ ...base, fechaPrevista: fecha('2026-11-21'), programa: 'TEST Gala', solista: 'Pedro Ruiz' })
        verificar('Una obra puede tener varias interpretaciones programadas a la vez',
            (await Interpretacion.countDocuments({ obra: obraA._id, estado: 'programada' })) === 2 && i2.solista === 'Pedro Ruiz')

        const iM = await Interpretacion.create({ ...base, obra: obraM._id, programa: 'TEST Mosaico' })
        verificar('Un mosaico se programa como una sola interpretación completa',
            (await Interpretacion.countDocuments({ obra: obraM._id })) === 1 && iM.estado === 'programada')

        const lote = await Promise.all(
            Array.from({ length: 10 }, () => Interpretacion.create({ ...base, obra: obraC._id, programa: 'TEST Lote' }))
        )
        verificar('10 interpretaciones simultáneas reciben códigos distintos', new Set(lote.map((i) => i.codigo)).size === 10)

        // Cambios de estado
        let transiciones = true
        for (const estado of ['interpretada', 'cancelada', 'no_interpretada']) {
            i1.estado = estado
            await i1.save()
            if ((await Interpretacion.findById(i1._id)).estado !== estado) transiciones = false
        }
        verificar('Permite pasar a interpretada, cancelada y no_interpretada', transiciones)

        i1.estado = 'interpretada'
        await i1.save()
        i1.estado = 'programada'
        await i1.save()
        verificar('Permite corregir una interpretada volviéndola a programada',
            (await Interpretacion.findById(i1._id)).estado === 'programada')

        // Consultas de negocio
        i1.estado = 'interpretada'
        await i1.save()
        i2.estado = 'interpretada'
        await i2.save()
        verificar('Cuenta cuántas veces fue interpretada una obra',
            (await Interpretacion.countDocuments({ obra: obraA._id, estado: 'interpretada' })) === 2)

        await Interpretacion.create({ ...base, fechaPrevista: fecha('2026-11-25'), programa: 'TEST Fuera de semana' })
        const semana = await Interpretacion.find({
            obra: obraA._id,
            fechaPrevista: { $gte: fecha('2026-11-16'), $lte: fecha('2026-11-22') },
        })
        verificar('La consulta semanal devuelve solo las interpretaciones de esa semana', semana.length === 2)

        // Validaciones
        verificar('Rechaza estado inicial distinto de programada', await falla({ ...base, estado: 'interpretada' }, 'estado'))
        verificar('Rechaza estado inválido', await falla({ ...base, estado: 'quizas' }, 'estado'))
        verificar('Rechaza interpretación sin obra', await falla({ ...base, obra: undefined }, 'obra'))
        verificar('Rechaza obra inexistente', await falla({ ...base, obra: new mongoose.Types.ObjectId() }, 'obra'))
        verificar('Rechaza obra inactiva', await falla({ ...base, obra: obraInactiva._id }, 'obra'))
        verificar('Rechaza interpretación sin fecha prevista', await falla({ ...base, fechaPrevista: undefined }, 'fechaPrevista'))
        verificar('Rechaza interpretación sin programa', await falla({ ...base, programa: undefined }, 'programa'))
        verificar('Rechaza interpretación sin director', await falla({ ...base, director: undefined }, 'director'))
        verificar('Rechaza interpretación sin usuario que registra', await falla({ ...base, registradoPor: undefined }, 'registradoPor'))
    } finally {
        await limpiar()
        // Restaurar el contador real para que no queden números gastados
        if (contadorAntes) {
            await Contador.updateOne({ _id: 'interpretacion' }, { ultimo: contadorAntes.ultimo })
        } else {
            await Contador.deleteOne({ _id: 'interpretacion' })
        }
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