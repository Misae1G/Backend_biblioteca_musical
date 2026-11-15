import 'dotenv/config'
import mongoose from 'mongoose'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import Auditoria from '../models/Auditoria.js'
import Contador from '../models/Contador.js'

let fallos = 0
const verificar = (nombre, ok) => {
    if (!ok) fallos++
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
}

const mismaClave = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// [modelo, nombre de colección esperado, índices esperados]
const esperados = [
    [Usuario, 'usuarios', [
        { key: { correo: 1 }, unique: true, sparse: true },
        { key: { nombreUsuario: 1 }, unique: true, sparse: true },
    ]],
    [Carpeta, 'carpetas', [
        { key: { numero: 1 }, unique: true },
    ]],
    [Catalogo, 'catalogos', [
        { key: { tipo: 1, nombreNormalizado: 1 }, unique: true },
        { key: { tipo: 1, familia: 1 } },
    ]],
    [Obra, 'obras', [
        { key: { carpeta: 1 } },
        { key: { obraOriginal: 1 } },
        { key: { tipoRegistro: 1 } },
        { key: { pendienteDeCompletar: 1 } },
    ]],
    [Prestamo, 'prestamos', [
        { key: { codigo: 1 }, unique: true },
        { key: { obra: 1, fechaEntrega: -1 } },
        { key: { estado: 1 } },
        { key: { solicitanteNormalizado: 1 } },
        { key: { institucionNormalizada: 1 } },
        // Bloquea el doble préstamo físico pendiente de una misma obra
        { key: { obra: 1 }, unique: true, partial: { tipoEntrega: 'fisico', estado: 'pendiente' } },
    ]],
    [Interpretacion, 'interpretaciones', [
        { key: { codigo: 1 }, unique: true },
        { key: { obra: 1, fechaPrevista: -1 } },
        { key: { estado: 1, fechaPrevista: 1 } },
        { key: { fechaPrevista: 1 } },
        { key: { programaNormalizado: 1 } },
        { key: { directorNormalizado: 1 } },
    ]],
    [Auditoria, 'auditoria', [
        { key: { fecha: -1 } },
        { key: { usuario: 1, fecha: -1 } },
        { key: { registroId: 1, fecha: -1 } },
        { key: { accion: 1, fecha: -1 } },
    ]],
    [Contador, 'contadores', []],
]

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Promise.all(esperados.map(([modelo]) => modelo.init()))

    for (const [modelo, nombreColeccion, indicesEsperados] of esperados) {
        verificar(`Colección "${nombreColeccion}"`, modelo.collection.collectionName === nombreColeccion)
        const reales = await modelo.collection.indexes()

        for (const esp of indicesEsperados) {
            const encontrado = reales.find((i) => mismaClave(i.key, esp.key) && (
                esp.partial
                    ? mismaClave(i.partialFilterExpression, esp.partial)
                    : !i.partialFilterExpression
            ))
            const ok = !!encontrado &&
                (!esp.unique || encontrado.unique === true) &&
                (!esp.sparse || encontrado.sparse === true)
            const detalle = [esp.unique && 'único', esp.sparse && 'sparse', esp.partial && 'parcial']
                .filter(Boolean).join(', ')
            verificar(`  ${nombreColeccion}: índice ${JSON.stringify(esp.key)}${detalle ? ` (${detalle})` : ''}`, ok)
        }
    }

    await mongoose.disconnect()
    console.log(fallos === 0 ? '\nTodas las colecciones e índices están correctos.' : `\n${fallos} comprobación(es) fallaron.`)
    process.exit(fallos === 0 ? 0 : 1)
}

ejecutar().catch((e) => {
    console.error('Error en el script:', e)
    process.exit(1)
})