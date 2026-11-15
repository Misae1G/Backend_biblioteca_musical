import 'dotenv/config'
import mongoose from 'mongoose'
import Prestamo from '../models/Prestamo.js'
import Contador, { generarCodigo } from '../models/Contador.js'
import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const fecha = (s) => new Date(`${s}T00:00:00.000Z`)

const limpiar = async () => {
    await Prestamo.deleteMany({ solicitante: /^TEST/ })
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Contador.deleteOne({ _id: 'test_contador' })
}

// Error de validación en un campo concreto al crear
const falla = async (datos, campo) => {
    try {
        await Prestamo.create(datos)
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    }
}

// Error de clave duplicada (índice único)
const duplicado = async (datos) => {
    try {
        await Prestamo.create(datos)
        return false
    } catch (e) {
        return e.code === 11000
    }
}

// Asigna una devolución a un préstamo y comprueba que el guardado falla en ese campo
const devolucionFalla = async (prestamo, devolucion, campo) => {
    prestamo.devolucion = devolucion
    try {
        await prestamo.save()
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    } finally {
        prestamo.devolucion = undefined
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    await Prestamo.init()
    await limpiar()

    // Guardar el contador real para restaurarlo al final
    const contadorAntes = await Contador.findById('prestamo')

    try {
        const usuarioId = new mongoose.Types.ObjectId()
        const carpeta = await Carpeta.create({ numero: 'TEST-PRE' })
        const obraA = await Obra.create({ titulo: 'TEST Obra A', tipoRegistro: 'original', carpeta: carpeta._id })
        const obraB = await Obra.create({ titulo: 'TEST Obra B', tipoRegistro: 'original', carpeta: carpeta._id })
        const obraM = await Obra.create({
            titulo: 'TEST Mosaico', tipoRegistro: 'mosaico', carpeta: carpeta._id,
            canciones: [{ titulo: 'Canción 1' }, { titulo: 'Canción 2' }],
        })
        const obraInactiva = await Obra.create({ titulo: 'TEST Inactiva', tipoRegistro: 'original', carpeta: carpeta._id, activa: false })

        const base = {
            fechaSolicitud: fecha('2026-11-01'),
            solicitante: 'TEST Juan Pérez',
            personaQueRecibe: 'Ana Gómez',
            obra: obraA._id,
            tipoEntrega: 'fisico',
            fechaEntrega: fecha('2026-11-02'),
            registradoPor: usuarioId,
        }
        const devolucionValida = {
            fechaDevolucion: fecha('2026-11-10'),
            personaQueDevuelve: 'Juan Pérez',
            recibidoPor: usuarioId,
            estadoFisico: 'buen_estado',
        }

        // Contador
        const c1 = await generarCodigo('test_contador', 'TST')
        const c2 = await generarCodigo('test_contador', 'TST')
        verificar('El contador genera el primer código con formato TST-0001', c1 === 'TST-0001')
        verificar('El contador genera el siguiente código TST-0002', c2 === 'TST-0002')
        const lote = await Promise.all(Array.from({ length: 10 }, () => generarCodigo('test_contador', 'TST')))
        verificar('10 códigos simultáneos son todos distintos', new Set(lote).size === 10)

        // Préstamos físicos
        const p1 = await Prestamo.create({ ...base, solicitante: '  TEST Juan Pérez ', institucion: 'Orquesta Sinfónica Test' })
        verificar('Crea préstamo físico válido con código PRE-0001', /^PRE-\d{4,}$/.test(p1.codigo))
        verificar('El préstamo físico queda pendiente', p1.estado === 'pendiente')
        verificar('Guarda solicitante e institución normalizados',
            p1.solicitanteNormalizado === 'test juan perez' && p1.institucionNormalizada === 'orquesta sinfonica test')

        const codigoOriginal = p1.codigo
        p1.codigo = 'PRE-9999'
        await p1.save()
        verificar('El código no se puede modificar', (await Prestamo.findById(p1._id)).codigo === codigoOriginal)

        verificar('Rechaza un segundo préstamo físico pendiente de la misma obra',
            await duplicado({ ...base, solicitante: 'TEST Otro' }))

        const carrera = await Promise.allSettled([
            Prestamo.create({ ...base, obra: obraB._id, solicitante: 'TEST Carrera 1' }),
            Prestamo.create({ ...base, obra: obraB._id, solicitante: 'TEST Carrera 2' }),
        ])
        verificar('De dos préstamos simultáneos de la misma obra, solo uno se guarda',
            carrera.filter((r) => r.status === 'fulfilled').length === 1)
        verificar('Dos obras distintas pueden tener préstamo físico pendiente a la vez',
            (await Prestamo.countDocuments({ obra: { $in: [obraA._id, obraB._id] }, estado: 'pendiente' })) === 2)

        // Préstamos digitales y mosaicos
        const d1 = await Prestamo.create({ ...base, solicitante: 'TEST Digital 1', tipoEntrega: 'digital' })
        const d2 = await Prestamo.create({ ...base, solicitante: 'TEST Digital 2', tipoEntrega: 'digital' })
        verificar('El préstamo digital queda finalizado', d1.estado === 'finalizado')
        verificar('Permite varios préstamos digitales aunque haya un físico pendiente de la obra',
            !!d2._id && p1.estado === 'pendiente')
        verificar('La institución es opcional', d1.institucion === undefined)

        const pM = await Prestamo.create({ ...base, obra: obraM._id, solicitante: 'TEST Mosaico' })
        verificar('Presta un mosaico completo como una sola obra', pM.estado === 'pendiente' && !!pM.codigo)

        // Validación de devoluciones
        verificar('Rechaza devolución sin estado físico',
            await devolucionFalla(pM, { ...devolucionValida, estadoFisico: undefined }, 'devolucion.estadoFisico'))
        verificar('Rechaza estado físico inválido',
            await devolucionFalla(pM, { ...devolucionValida, estadoFisico: 'roto' }, 'devolucion.estadoFisico'))
        verificar('Rechaza devolución sin persona que devuelve',
            await devolucionFalla(pM, { ...devolucionValida, personaQueDevuelve: undefined }, 'devolucion.personaQueDevuelve'))
        verificar('Rechaza devolución sin usuario que recibe',
            await devolucionFalla(pM, { ...devolucionValida, recibidoPor: undefined }, 'devolucion.recibidoPor'))
        verificar('Rechaza devolución anterior a la entrega',
            await devolucionFalla(pM, { ...devolucionValida, fechaDevolucion: fecha('2026-11-01') }, 'devolucion.fechaDevolucion'))
        verificar('Rechaza devolución en un préstamo digital',
            await devolucionFalla(d1, devolucionValida, 'devolucion'))

        // Devoluciones válidas
        p1.devolucion = devolucionValida
        await p1.save()
        const p1Recargado = await Prestamo.findById(p1._id)
        verificar('Registrar la devolución pasa el préstamo a devuelto',
            p1Recargado.estado === 'devuelto' && p1Recargado.devolucion.estadoFisico === 'buen_estado')

        const p3 = await Prestamo.create({ ...base, solicitante: 'TEST Segundo préstamo' })
        verificar('Después de devolver, la obra se puede volver a prestar', p3.estado === 'pendiente')

        p3.devolucion = { ...devolucionValida, estadoFisico: 'danado', observaciones: 'Faltan páginas' }
        await p3.save()
        const p3Recargado = await Prestamo.findById(p3._id)
        verificar('Una devolución dañada se guarda en el historial y el préstamo queda devuelto',
            p3Recargado.estado === 'devuelto' && p3Recargado.devolucion.estadoFisico === 'danado')

        // Campos obligatorios
        verificar('Rechaza préstamo sin solicitante', await falla({ ...base, solicitante: undefined }, 'solicitante'))
        verificar('Rechaza préstamo sin persona que recibe', await falla({ ...base, personaQueRecibe: undefined }, 'personaQueRecibe'))
        verificar('Rechaza préstamo sin obra', await falla({ ...base, obra: undefined }, 'obra'))
        verificar('Rechaza obra inexistente', await falla({ ...base, obra: new mongoose.Types.ObjectId() }, 'obra'))
        verificar('Rechaza obra inactiva', await falla({ ...base, obra: obraInactiva._id }, 'obra'))
        verificar('Rechaza tipo de entrega inválido', await falla({ ...base, tipoEntrega: 'correo' }, 'tipoEntrega'))
        verificar('Rechaza préstamo sin fecha de entrega', await falla({ ...base, fechaEntrega: undefined }, 'fechaEntrega'))
        verificar('Rechaza préstamo sin fecha de solicitud', await falla({ ...base, fechaSolicitud: undefined }, 'fechaSolicitud'))
        verificar('Rechaza préstamo sin usuario que registra', await falla({ ...base, registradoPor: undefined }, 'registradoPor'))
    } finally {
        await limpiar()
        // Restaurar el contador real para que no queden números gastados
        if (contadorAntes) {
            await Contador.updateOne({ _id: 'prestamo' }, { ultimo: contadorAntes.ultimo })
        } else {
            await Contador.deleteOne({ _id: 'prestamo' })
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