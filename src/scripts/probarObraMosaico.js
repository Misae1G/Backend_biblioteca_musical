import 'dotenv/config'
import mongoose from 'mongoose'
import Obra from '../models/Obra.js'
import Carpeta from '../models/Carpeta.js'
import { normalizarTexto, escaparRegex } from '../utils/texto.js'

const resultados = []
const verificar = (nombre, ok) => {
    resultados.push(ok)
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const limpiar = async () => {
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
}

const falla = async (datos, campo) => {
    try {
        await Obra.create(datos)
        return false
    } catch (e) {
        return e.name === 'ValidationError' && !!e.errors?.[campo]
    }
}

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    await Obra.init()
    await limpiar()

    try {
        const carpeta = await Carpeta.create({ numero: 'TEST-MOS' })
        const base = { titulo: 'TEST Obra', tipoRegistro: 'original', carpeta: carpeta._id }

        // Buscar como lo hará el sistema: texto normalizado, parcial
        const buscar = (q) =>
            Obra.find({
                titulo: /^TEST/,
                busqueda: new RegExp(escaparRegex(normalizarTexto(q))),
            })

        // Mosaico
        const mosaico = await Obra.create({
            ...base,
            titulo: 'TEST Mosaico de Navidad',
            tipoRegistro: 'mosaico',
            canciones: [
                { titulo: 'Noche Vieja' },
                { titulo: 'Feliz Navidad', compositor: 'José Feliciano', observacion: 'Adaptación' },
                { titulo: 'Pequeña Serenata Nocturna', compositor: 'Wolfgang Amadeus Mozart' },
            ],
        })
        verificar('Crea mosaico válido con 3 canciones', !!mosaico._id)
        verificar('Asigna el orden 1, 2, 3 según la posición',
            mosaico.canciones.map((c) => c.orden).join(',') === '1,2,3')

        const recargado = await Obra.findById(mosaico._id)
        verificar('Conserva el orden de las canciones al leer',
            recargado.canciones.map((c) => c.titulo).join('|') === 'Noche Vieja|Feliz Navidad|Pequeña Serenata Nocturna')
        verificar('Compositor y observación de la canción son opcionales',
            recargado.canciones[0].compositor === undefined && recargado.canciones[0].observacion === undefined)

        verificar('Rechaza mosaico sin canciones',
            await falla({ ...base, tipoRegistro: 'mosaico' }, 'canciones'))
        verificar('Rechaza canciones en una obra que no es mosaico',
            await falla({ ...base, canciones: [{ titulo: 'Una canción' }] }, 'canciones'))
        verificar('Rechaza canción sin título',
            await falla({ ...base, tipoRegistro: 'mosaico', canciones: [{ compositor: 'Alguien' }] }, 'canciones.0.titulo'))

        // Documentos digitales
        const conDocs = await Obra.create({
            ...base,
            titulo: 'TEST Con documentos',
            autor: 'Autor de Prueba',
            documentos: [
                { nombre: 'Partitura general', tipoArchivo: 'PDF', enlace: 'https://drive.google.com/file/d/abc123/view' },
                { nombre: 'Audio de referencia', tipoArchivo: 'MP3', enlace: 'http://onedrive.live.com/x', observaciones: 'Versión 2019' },
            ],
        })
        verificar('Crea obra con dos documentos digitales', conDocs.documentos.length === 2)
        verificar('Rechaza enlace sin http o https',
            await falla({ ...base, documentos: [{ nombre: 'Malo', enlace: 'drive.google.com/abc' }] }, 'documentos.0.enlace'))
        verificar('Rechaza enlace con texto que no es enlace',
            await falla({ ...base, documentos: [{ nombre: 'Malo', enlace: 'hola mundo' }] }, 'documentos.0.enlace'))
        verificar('Rechaza documento sin nombre',
            await falla({ ...base, documentos: [{ enlace: 'https://ejemplo.com/a' }] }, 'documentos.0.nombre'))
        verificar('Rechaza documento sin enlace',
            await falla({ ...base, documentos: [{ nombre: 'Sin enlace' }] }, 'documentos.0.enlace'))

        // Búsqueda
        verificar('El campo de búsqueda no se devuelve en consultas normales', recargado.busqueda === undefined)
        verificar('El campo de búsqueda no sale en JSON', !('busqueda' in recargado.toJSON()))
        verificar('Encuentra el mosaico por texto parcial ("navi")',
            (await buscar('navi')).some((o) => o.id === mosaico.id))
        verificar('Encuentra el mosaico por el título de una canción, sin tildes ("pequena serenata")',
            (await buscar('pequena serenata')).some((o) => o.id === mosaico.id))
        verificar('Encuentra el mosaico con mayúsculas y tildes ("PEQUEÑA")',
            (await buscar('PEQUEÑA')).some((o) => o.id === mosaico.id))
        verificar('Encuentra el mosaico por el compositor de una canción ("mozart")',
            (await buscar('mozart')).some((o) => o.id === mosaico.id))
        verificar('Encuentra una obra normal por su autor',
            (await buscar('autor de prueba')).some((o) => o.id === conDocs.id))
        verificar('No encuentra un término inexistente', (await buscar('zzzxyz')).length === 0)

        let sinError = true
        try {
            await buscar('a(b[')
        } catch {
            sinError = false
        }
        verificar('Una búsqueda con caracteres especiales no rompe la consulta', sinError)

        // La búsqueda se actualiza al modificar el mosaico
        recargado.canciones.push({ titulo: 'Cumbia Nueva' })
        await recargado.save()
        verificar('La búsqueda se actualiza al agregar una canción', (await buscar('cumbia')).length === 1)
        verificar('El orden de la canción agregada es 4', recargado.canciones[3].orden === 4)
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