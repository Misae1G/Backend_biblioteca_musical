import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Obra from '../models/Obra.js'
import { normalizarTexto } from '../utils/texto.js'
import { leerRevision, planRevision, resumenPlan } from './importacion/planRevision.js'

// Uso:
//   node src/scripts/importarBiblioteca.js ruta/al/excel_completo.md                         (prueba: no escribe nada)
//   node src/scripts/importarBiblioteca.js ruta/al/excel_completo.md --ejecutar --base=NOMBRE (escribe; NOMBRE debe ser la base real)
// Se puede ejecutar varias veces: lo que ya existe no se duplica.

const args = process.argv.slice(2)
const archivo = args.find((a) => !a.startsWith('--'))
const ejecutar = args.includes('--ejecutar')
const baseConfirmada = args.find((a) => a.startsWith('--base='))?.slice(7)

if (!archivo || !fs.existsSync(archivo)) {
    console.error('Indica la ruta del archivo .md. Ejemplo: node src/scripts/importarBiblioteca.js ./excel_completo.md')
    process.exit(1)
}

const plan = planRevision(leerRevision(fs.readFileSync(archivo, 'utf8')))
const resumen = resumenPlan(plan)
console.log('Resumen de lo que se importaría:')
console.log(JSON.stringify(resumen, null, 2))

const salida = path.resolve(path.dirname(archivo), 'importacion_dudosos.json')
fs.writeFileSync(salida, JSON.stringify(plan.dudosos, null, 2))
console.log(`\nDatos dudosos (${plan.dudosos.length}) guardados en ${salida}`)

if (!ejecutar) {
    console.log('\nModo de prueba: no se escribió nada. Para importar agrega --ejecutar --base=<nombre de la base>.')
    process.exit(0)
}

await mongoose.connect(process.env.MONGODB_URI)
const nombreBase = mongoose.connection.name
console.log(`\nBase de datos: ${nombreBase}`)
if (baseConfirmada !== nombreBase) {
    console.error(`Para escribir debes confirmar la base: agrega --base=${nombreBase}`)
    await mongoose.disconnect()
    process.exit(1)
}
await Promise.all([Carpeta.init(), Catalogo.init(), Obra.init()])

const resultado = { carpetasCreadas: 0, carpetasExistentes: 0, agrupacionesCreadas: 0, obrasCreadas: 0, obrasExistentes: 0, errores: [] }

// ----- Agrupaciones (catálogo) -----
const agrupacionId = new Map()
for (const nombre of plan.agrupaciones.keys()) {
    const normalizado = normalizarTexto(nombre)
    let item = await Catalogo.findOne({ tipo: 'agrupacion', nombreNormalizado: normalizado })
    if (!item) {
        item = await Catalogo.create({ tipo: 'agrupacion', nombre })
        resultado.agrupacionesCreadas += 1
    }
    agrupacionId.set(nombre, item._id)
}

// ----- Carpetas -----
const carpetaId = new Map()
for (const c of plan.carpetas) {
    let doc = await Carpeta.findOne({ numero: c.numero })
    if (doc) {
        resultado.carpetasExistentes += 1
    } else {
        doc = await Carpeta.create({
            numero: c.numero,
            ...(c.ultimaRevision && { ultimaRevision: new Date(`${c.ultimaRevision}T00:00:00.000Z`) }),
            ...(c.revisadaPor && { revisadaPor: c.revisadaPor }),
            ...(c.observaciones && { observaciones: c.observaciones }),
        })
        resultado.carpetasCreadas += 1
    }
    carpetaId.set(c.numero, doc._id)
}
console.log(`Carpetas: ${resultado.carpetasCreadas} creadas, ${resultado.carpetasExistentes} ya existían`)

// ----- Obras (las originales van antes que sus arreglos, igual que en el archivo) -----
const obraId = new Map()
let n = 0
for (const o of plan.obras) {
    n += 1
    try {
        const idCarpeta = carpetaId.get(o.carpeta)
        const existentes = await Obra.find({ carpeta: idCarpeta, tipoRegistro: o.tipoRegistro, titulo: o.titulo }).select('titulo tipoRegistro arreglista formato detalleMaterial edicion carpeta')
        const igual = existentes.find((e) => normalizarTexto(e.arreglista ?? '') === normalizarTexto(o.arreglista ?? '') && normalizarTexto(e.formato ?? '') === normalizarTexto(o.formato ?? '') &&
            normalizarTexto(e.detalleMaterial ?? '') === normalizarTexto(o.detalleMaterial ?? '') && normalizarTexto(e.edicion ?? '') === normalizarTexto(o.edicion ?? ''))
        if (igual) {
            obraId.set(o.clave, igual._id)
            resultado.obrasExistentes += 1
            continue
        }
        const datos = {
            titulo: o.titulo, tipoRegistro: o.tipoRegistro, carpeta: idCarpeta,
            ...(o.autor && { autor: o.autor }), ...(o.arreglista && { arreglista: o.arreglista }), ...(o.orquestador && { orquestador: o.orquestador }),
            ...(o.edicion && { edicion: o.edicion }), ...(o.formato && { formato: o.formato }),
            ...(o.detalleMaterial && { detalleMaterial: o.detalleMaterial }), ...(o.estadoMaterial && { estadoMaterial: o.estadoMaterial }),
            ...(o.factibleSinVoz && { factibleSinVoz: o.factibleSinVoz }),
            ...(o.directorConcierto && { directorConcierto: o.directorConcierto }), ...(o.solistaConcierto && { solistaConcierto: o.solistaConcierto }),
            ...(o.duracion !== undefined && { duracion: o.duracion }),
            ...(o.agrupacion && { agrupacion: agrupacionId.get(o.agrupacion) }),
            ...(o.observaciones && { observaciones: o.observaciones }),
            ...(o.canciones.length && { canciones: o.canciones }),
            ...(o.obraOriginalClave !== null && obraId.has(o.obraOriginalClave) && { obraOriginal: obraId.get(o.obraOriginalClave) }),
            requiereRevision: o.requiereRevision,
            pendienteDeCompletar: true, // faltan tipo de obra y procedencia (el catálogo original no los trae)
        }
        const doc = await Obra.create(datos)
        obraId.set(o.clave, doc._id)
        resultado.obrasCreadas += 1
    } catch (e) {
        resultado.errores.push({ linea: o.linea, carpeta: o.carpeta, titulo: o.titulo, error: e.message })
    }
    if (n % 250 === 0) console.log(`  ... ${n} de ${plan.obras.length} obras procesadas`)
}

console.log(`Obras: ${resultado.obrasCreadas} creadas, ${resultado.obrasExistentes} ya existían, ${resultado.errores.length} con error`)
if (resultado.errores.length) console.log(resultado.errores.slice(0, 10))
fs.writeFileSync(path.resolve(path.dirname(archivo), 'importacion_resultado.json'), JSON.stringify(resultado, null, 2))
await mongoose.disconnect()
process.exit(resultado.errores.length ? 1 : 0)