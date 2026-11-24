import mongoose from 'mongoose'
import Carpeta from '../models/Carpeta.js'
import Obra from '../models/Obra.js'
import * as obras from '../services/obras.service.js'
import * as carpetas from '../services/carpetas.service.js'
import { obraSchema } from '../validators/obras.js'
import { carpetaSchema } from '../validators/carpetas.js'
import { exigirBaseDePruebas, crearVerificador } from './_ayuda.js'

// Campos nuevos de Carpeta y Obra para la migración del catálogo original
exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()

const limpiar = async () => {
    const cs = await Carpeta.find({ numero: /^TEST-NUEVOS-/ }).select('_id')
    await Obra.deleteMany({ carpeta: { $in: cs.map((c) => c._id) } })
    await Carpeta.deleteMany({ _id: { $in: cs.map((c) => c._id) } })
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Promise.all([Carpeta.init(), Obra.init()])
    await limpiar()

    try {
        // ----- Carpeta -----
        const carpeta = await carpetas.crear(
            carpetaSchema.parse({ numero: 'TEST-NUEVOS-1', ultimaRevision: '2025-02-14', revisadaPor: 'Melanie Cascante' })
        )
        let c = await Carpeta.findById(carpeta._id)
        verificar('La carpeta guarda la última revisión', c.ultimaRevision?.toISOString().slice(0, 10) === '2025-02-14')
        verificar('La carpeta guarda quién la revisó', c.revisadaPor === 'Melanie Cascante')
        verificar('Una fecha de revisión inexistente se rechaza',
            !carpetaSchema.safeParse({ numero: 'TEST-NUEVOS-2', ultimaRevision: '2025-02-31' }).success)

        await carpetas.editar(carpeta._id, carpetaSchema.parse({ numero: 'TEST-NUEVOS-1', ultimaRevision: '2025-03-01', revisadaPor: 'Otra persona' }))
        c = await Carpeta.findById(carpeta._id)
        verificar('Editar la carpeta actualiza los datos de revisión', c.revisadaPor === 'Otra persona' && c.ultimaRevision.toISOString().slice(0, 10) === '2025-03-01')
        await carpetas.editar(carpeta._id, carpetaSchema.parse({ numero: 'TEST-NUEVOS-1' }))
        c = await Carpeta.findById(carpeta._id)
        verificar('Si no se envían, los datos de revisión se borran', !c.ultimaRevision && !c.revisadaPor)

        // ----- Obra -----
        const base = { titulo: 'TEST obra nueva', tipoRegistro: 'original', autor: 'AUTOR PRUEBA', carpeta: String(carpeta._id) }
        const datos = obraSchema.parse({
            ...base, edicion: 'Kalmus', formato: 'Orquesta de cuerdas', detalleMaterial: 'Score y particellas completas',
            estadoMaterial: 'Completo', factibleSinVoz: 'no', directorConcierto: 'DIRECTOR 2025', solistaConcierto: 'SOLISTA 2025',
            requiereRevision: true,
        })
        const obra = await new Obra({ ...datos, pendienteDeCompletar: true }).save()
        const o = await Obra.findById(obra._id)
        verificar('La obra guarda edición y formato', o.edicion === 'Kalmus' && o.formato === 'Orquesta de cuerdas')
        verificar('La obra guarda detalle y estado del material', o.detalleMaterial === 'Score y particellas completas' && o.estadoMaterial === 'Completo')
        verificar('La obra guarda «factible sin voz» y «requiere revisión»', o.factibleSinVoz === 'no' && o.requiereRevision === true)
        verificar('La obra guarda director y solista del concierto', o.directorConcierto === 'DIRECTOR 2025' && o.solistaConcierto === 'SOLISTA 2025')
        verificar('«Factible sin voz» rechaza valores distintos de si/no', !obraSchema.safeParse({ ...base, factibleSinVoz: 'quizás' }).success)
        verificar('«Factible sin voz» vacío es válido', obraSchema.safeParse({ ...base, factibleSinVoz: '' }).success)

        const mosaico = await new Obra({
            titulo: 'TEST mosaico nuevo', tipoRegistro: 'mosaico', carpeta: carpeta._id,
            canciones: [{ titulo: 'Aria 1', compositor: 'X', genero: 'Aria de ópera - Soprano' }, { titulo: 'Aria 2' }],
        }).save()
        const m = await Obra.findById(mosaico._id)
        verificar('La canción de un mosaico guarda su género', m.canciones[0].genero === 'Aria de ópera - Soprano')
        verificar('El orden de las canciones sigue siendo automático', m.canciones[1].orden === 2)
        verificar('El validador acepta el género de la canción',
            obraSchema.safeParse({ ...base, tipoRegistro: 'mosaico', canciones: [{ titulo: 'A', genero: 'Dueto de ópera' }] }).success)

        // Mosaico sin canciones: solo se permite si está pendiente de completar (migración del catálogo original)
        const sinCanciones = await new Obra({ titulo: 'TEST mosaico pendiente', tipoRegistro: 'mosaico', carpeta: carpeta._id, pendienteDeCompletar: true }).save()
        verificar('Un mosaico pendiente de completar puede guardarse sin canciones', !!sinCanciones._id)
        let rechazado = false
        try {
            await new Obra({ titulo: 'TEST mosaico completo', tipoRegistro: 'mosaico', carpeta: carpeta._id, pendienteDeCompletar: false }).save()
        } catch {
            rechazado = true
        }
        verificar('Un mosaico NO pendiente sigue exigiendo al menos una canción', rechazado)

        const lista = await obras.listar({ q: 'TEST obra nueva', requiereRevision: 'true', activa: 'true', pagina: 1, limite: 20 })
        verificar('El listado filtra por «requiere revisión»', lista.total === 1)
        const lista2 = await obras.listar({ q: 'TEST obra nueva', requiereRevision: 'false', activa: 'true', pagina: 1, limite: 20 })
        verificar('El filtro «requiere revisión = false» no la incluye', lista2.total === 0)
    } finally {
        await limpiar()
        await mongoose.disconnect()
    }
    terminar()
}

ejecutar().catch(async (error) => {
    console.error(error)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
