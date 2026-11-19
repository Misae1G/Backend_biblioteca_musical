import { ErrorApp } from '../utils/ErrorApp.js'
import { paramsReporteSchema, consultaReporteSchema } from '../validators/reportes.js'
import * as servicio from '../services/reportes.service.js'
import { aExcel, aPdf } from '../services/exportacion.service.js'

const TIPOS_ARCHIVO = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
}

export const generar = async (req, res) => {
    const { tipo } = paramsReporteSchema.parse(req.params)
    const { formato = 'json', desde, hasta } = consultaReporteSchema.parse(req.query)

    if (tipo === 'copia' && formato !== 'xlsx') {
        throw new ErrorApp(400, 'La copia de la biblioteca solo se descarga en Excel (formato=xlsx)')
    }

    const reporte = await servicio.generar(tipo, { desde, hasta })
    const generado = new Date()

    if (formato === 'json') {
        return res.json({ ...reporte, generado: generado.toISOString() })
    }

    const buffer = formato === 'xlsx' ? await aExcel(reporte, generado) : await aPdf(reporte, generado)
    const fecha = generado.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
    const base = tipo === 'copia' ? 'copia-biblioteca' : `reporte-${tipo}`

    res.set({
        'Content-Type': TIPOS_ARCHIVO[formato],
        'Content-Disposition': `attachment; filename="${base}-${fecha}.${formato}"`,
        'Cache-Control': 'no-store',
    })
    res.send(buffer)
}
