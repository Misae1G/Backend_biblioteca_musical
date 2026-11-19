import mongoose from 'mongoose'
import ExcelJS from 'exceljs'
import Usuario from '../models/Usuario.js'
import Carpeta from '../models/Carpeta.js'
import Catalogo from '../models/Catalogo.js'
import Obra from '../models/Obra.js'
import Prestamo from '../models/Prestamo.js'
import Interpretacion from '../models/Interpretacion.js'
import Auditoria from '../models/Auditoria.js'
import Contador from '../models/Contador.js'
import { exigirBaseDePruebas, crearVerificador, crearApi, cookieDe, iniciarServidor } from './_ayuda.js'

exigirBaseDePruebas()
const { verificar, terminar } = crearVerificador()

const PASS = 'Clave12345'

const limpiar = async () => {
    const ids = (await Obra.find({ titulo: /^TEST/ }).select('_id')).map((o) => o._id)
    await Prestamo.deleteMany({ obra: { $in: ids } })
    await Interpretacion.deleteMany({ obra: { $in: ids } })
    await Auditoria.collection.deleteMany({ descripcion: /TEST/ })
    await Obra.deleteMany({ titulo: /^TEST/ })
    await Carpeta.deleteMany({ numero: /^TEST-/ })
    await Catalogo.deleteMany({ nombreNormalizado: /^test/ })
    await Usuario.deleteMany({ $or: [{ correo: /^test\.re\./ }, { nombreUsuario: /^test_re_/ }] })
}

const restaurarContador = (nombre, antes) =>
    antes ? Contador.updateOne({ _id: nombre }, { ultimo: antes.ultimo }) : Contador.deleteOne({ _id: nombre })

const ejecutar = async () => {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`Base de datos: ${mongoose.connection.name}\n`)
    await Promise.all([Usuario.init(), Carpeta.init(), Catalogo.init(), Obra.init(), Prestamo.init(), Interpretacion.init()])
    await limpiar()
    const contadorPrestamo = await Contador.findById('prestamo')
    const contadorInterpretacion = await Contador.findById('interpretacion')

    const { default: app } = await import('../server.js')
    const servidor = await iniciarServidor(app)
    const base = `http://127.0.0.1:${servidor.address().port}`
    const api = crearApi(base)
    const enviar = (metodo, ruta, cuerpo, cookie) => api(ruta, { metodo, cuerpo, cookie })
    const login = (identificador, password) => enviar('POST', '/api/auth/login', { identificador, password })

    try {
        await Usuario.create({ rol: 'administrador', nombre: 'TEST Admin', correo: 'test.re.admin@test.local', password: PASS, debeCambiarPassword: false })
        await Usuario.create({ rol: 'usuario', nombre: 'TEST Usuario', nombreUsuario: 'test_re_usuario', password: PASS, debeCambiarPassword: false })
        const cookieAdmin = cookieDe(await login('test.re.admin@test.local', PASS))
        const cookieU = cookieDe(await login('test_re_usuario', PASS))
        const u = (metodo, ruta, cuerpo) => enviar(metodo, ruta, cuerpo, cookieU)
        const reporte = async (tipo, qs = '') => (await u('GET', `/api/reportes/${tipo}${qs}`)).datos
        const valor = (rep, etiqueta) => rep.resumen.find((r) => r.etiqueta === etiqueta)?.valor
        const seccion = (rep, titulo) => rep.secciones.find((s) => s.titulo === titulo)
        const fila = (rep, titulo, clave, texto) => seccion(rep, titulo)?.filas.find((f) => f[clave] === texto)
        const descargar = async (ruta, cookie = cookieU) => {
            const res = await fetch(`${base}${ruta}`, { headers: { Cookie: cookie } })
            return {
                estado: res.status,
                tipo: res.headers.get('content-type'),
                disposicion: res.headers.get('content-disposition'),
                cuerpo: Buffer.from(await res.arrayBuffer()),
            }
        }

        // ---------- Acceso y parámetros ----------
        verificar('Exige sesión', (await enviar('GET', '/api/reportes/obras')).estado === 401)
        verificar('El administrador no tiene acceso a los reportes', (await enviar('GET', '/api/reportes/obras', undefined, cookieAdmin)).estado === 403)
        verificar('El administrador no puede descargar la copia', (await enviar('GET', '/api/reportes/copia?formato=xlsx', undefined, cookieAdmin)).estado === 403)
        verificar('Rechaza un tipo de reporte inválido', (await u('GET', '/api/reportes/otro')).estado === 400)
        verificar('Rechaza un formato inválido', (await u('GET', '/api/reportes/obras?formato=doc')).estado === 400)
        verificar('Rechaza una fecha inválida', (await u('GET', '/api/reportes/prestamos?desde=ayer')).estado === 400)
        verificar('Rechaza un rango invertido', (await u('GET', '/api/reportes/prestamos?desde=2099-12-01&hasta=2099-01-01')).estado === 400)
        verificar('La copia solo se entrega en Excel', (await u('GET', '/api/reportes/copia')).estado === 400 && (await u('GET', '/api/reportes/copia?formato=pdf')).estado === 400)

        // ---------- Datos de partida ----------
        const baseObras = await reporte('obras')
        const baseInv = await reporte('inventario')
        verificar('El reporte de obras trae título, resumen y secciones',
            baseObras.titulo === 'Reporte de obras' && baseObras.resumen.length > 0 && baseObras.secciones.length > 0 && !!baseObras.generado)

        // ---------- Datos de prueba ----------
        const c1 = await Carpeta.create({ numero: 'TEST-R1', ubicacionFisica: 'Estante R' })
        const c2 = await Carpeta.create({ numero: 'TEST-R2' })
        const tipo = await Catalogo.create({ tipo: 'tipoObra', nombre: 'Test R Sinfonía' })
        const agr = await Catalogo.create({ tipo: 'agrupacion', nombre: 'Test R Orquesta' })
        const completa = (titulo, extra) => Obra.create({
            titulo, tipoRegistro: 'original', procedencia: 'ecuatoriana', tipoObra: tipo._id, agrupacion: agr._id,
            pendienteDeCompletar: false, ...extra,
        })
        const o1 = await completa('TEST R Obra 1', { autor: 'TEST Autor Uno', carpeta: c1._id })
        const o2 = await completa('TEST R Obra 2', { autor: 'test autor uno', tipoRegistro: 'adaptacion', obraOriginal: o1._id, carpeta: c1._id })
        const mosaico = await completa('TEST R Mosaico', { tipoRegistro: 'mosaico', canciones: [{ titulo: 'TEST Canción Uno', compositor: 'Alguien' }], carpeta: c2._id })
        await Obra.create({ titulo: 'TEST R Pendiente', tipoRegistro: 'original', carpeta: c2._id, pendienteDeCompletar: true })
        await completa('TEST R Inactiva', { autor: 'TEST Autor Uno', carpeta: c2._id, activa: false })

        const prestamo = (obra, extra) => u('POST', '/api/prestamos', {
            fechaSolicitud: '2099-01-01', personaQueRecibe: 'Ana', obra: String(obra._id), ...extra,
        })
        const p1 = (await prestamo(o1, { solicitante: 'TEST Pérez', institucion: 'TEST Orquesta X', tipoEntrega: 'fisico', fechaEntrega: '2099-03-02' })).datos.prestamo
        const p2 = (await prestamo(o2, { solicitante: 'test perez', institucion: 'TEST ORQUESTA X', tipoEntrega: 'digital', fechaEntrega: '2099-03-05' })).datos.prestamo
        const p3 = (await prestamo(mosaico, { solicitante: 'TEST Luis', tipoEntrega: 'fisico', fechaEntrega: '2099-02-15' })).datos.prestamo
        await u('POST', `/api/prestamos/${p3._id}/devolucion`, { fechaDevolucion: '2099-02-20', personaQueDevuelve: 'Luis', estadoFisico: 'danado' })

        const interpretacion = (obra, extra) => u('POST', '/api/interpretaciones', { obra: String(obra._id), ...extra })
        const i1 = (await interpretacion(o1, { fechaPrevista: '2099-05-01', programa: 'TEST Gala', director: 'TEST Directora Ñ' })).datos.interpretacion
        await interpretacion(o1, { fechaPrevista: '2099-05-10', programa: 'test gala', director: 'test directora n' })
        const i3 = (await interpretacion(o2, { fechaPrevista: '2099-05-12', programa: 'TEST Otro', director: 'TEST Directora Ñ' })).datos.interpretacion
        await u('PATCH', `/api/interpretaciones/${i1._id}/estado`, { estado: 'interpretada' })
        await u('PATCH', `/api/interpretaciones/${i3._id}/estado`, { estado: 'cancelada' })

        // ---------- Obras ----------
        const rObras = await reporte('obras')
        const dif = (etiqueta, antes, despues) => valor(despues, etiqueta) - valor(antes, etiqueta)
        verificar('Obras: suma las obras activas nuevas', dif('Total de obras activas', baseObras, rObras) === 4)
        verificar('Obras: cuenta originales, adaptaciones y mosaicos',
            dif('Originales', baseObras, rObras) === 2 && dif('Adaptaciones', baseObras, rObras) === 1 && dif('Mosaicos', baseObras, rObras) === 1)
        verificar('Obras: cuenta pendientes, inactivas y carpetas',
            dif('Pendientes de completar', baseObras, rObras) === 1 &&
            dif('Obras inactivas (no incluidas)', baseObras, rObras) === 1 && dif('Carpetas activas', baseObras, rObras) === 2)
        verificar('Obras: agrupa al autor sin importar mayúsculas y no cuenta las inactivas', fila(rObras, 'Por autor', 'nombre', 'TEST Autor Uno')?.cantidad === 2)
        verificar('Obras: cuenta por tipo de obra y agrupación',
            fila(rObras, 'Por tipo de obra', 'nombre', 'Test R Sinfonía')?.cantidad === 3 && fila(rObras, 'Por agrupación', 'nombre', 'Test R Orquesta')?.cantidad === 3)
        verificar('Obras: cuenta por carpeta con su ubicación',
            fila(rObras, 'Por carpeta', 'carpeta', 'TEST-R1')?.obras === 2 && fila(rObras, 'Por carpeta', 'carpeta', 'TEST-R1')?.ubicacion === 'Estante R' &&
            fila(rObras, 'Por carpeta', 'carpeta', 'TEST-R2')?.obras === 2)
        const listado = seccion(rObras, 'Listado de obras').filas
        verificar('Obras: el listado trae las activas y no las inactivas',
            listado.some((f) => f.titulo === 'TEST R Obra 1' && f.carpeta === 'TEST-R1' && f.registro === 'Original') && !listado.some((f) => f.titulo === 'TEST R Inactiva'))

        // ---------- Inventario ----------
        const rInv = await reporte('inventario')
        verificar('Inventario: suma las obras activas nuevas', dif('Total de obras activas', baseInv, rInv) === 4)
        verificar('Inventario: una obra prestada y programada cuenta en el estado combinado',
            dif('En interpretación y prestada físicamente', baseInv, rInv) === 1 && dif('Disponible', baseInv, rInv) === 3)
        verificar('Inventario: lista la obra no disponible con su estado',
            fila(rInv, 'Obras no disponibles', 'titulo', 'TEST R Obra 1')?.estado === 'En interpretación y prestada físicamente')
        verificar('Inventario: la devolución dañada no deja la obra no disponible', !fila(rInv, 'Obras no disponibles', 'titulo', 'TEST R Mosaico'))
        verificar('Inventario: por carpeta suma disponibles y no disponibles',
            fila(rInv, 'Por carpeta', 'carpeta', 'TEST-R1')?.noDisponibles === 1 && fila(rInv, 'Por carpeta', 'carpeta', 'TEST-R1')?.disponibles === 1)

        // ---------- Préstamos ----------
        const rPre = await reporte('prestamos', '?desde=2099-01-01&hasta=2099-12-31')
        verificar('Préstamos: totales dentro del período',
            valor(rPre, 'Total de préstamos') === 3 && valor(rPre, 'Físicos') === 2 && valor(rPre, 'Digitales') === 1 &&
            valor(rPre, 'Pendientes de devolución') === 1 && valor(rPre, 'Devueltos') === 1 && valor(rPre, 'Digitales finalizados') === 1)
        verificar('Préstamos: cuenta la devolución dañada', valor(rPre, 'Devueltos dañados') === 1 && valor(rPre, 'Devueltos deteriorados') === 0)
        const solicitante = fila(rPre, 'Por solicitante', 'nombre', 'TEST Pérez')
        verificar('Préstamos: agrupa al solicitante sin importar tildes ni mayúsculas',
            solicitante?.total === 2 && solicitante?.fisicos === 1 && solicitante?.digitales === 1 && solicitante?.pendientes === 1)
        verificar('Préstamos: agrupa por institución u orquesta', fila(rPre, 'Por institución u orquesta', 'nombre', 'TEST Orquesta X')?.total === 2)
        verificar('Préstamos: lista los pendientes de devolución',
            seccion(rPre, 'Pendientes de devolución').filas.map((f) => f.codigo).join() === p1.codigo)
        const listaPre = seccion(rPre, 'Listado de préstamos').filas
        verificar('Préstamos: el listado trae las fechas, el estado y el estado físico',
            listaPre.find((f) => f.codigo === p3.codigo)?.estadoFisico === 'Dañado' && listaPre.find((f) => f.codigo === p3.codigo)?.devolucion === '2099-02-20' &&
            listaPre.find((f) => f.codigo === p1.codigo)?.entrega === '2099-03-02')
        verificar('Préstamos: el filtro muestra el período', rPre.filtros[0].valor === '2099-01-01' && rPre.filtros[1].valor === '2099-12-31')
        const rMarzo = await reporte('prestamos', '?desde=2099-03-01&hasta=2099-03-31')
        const codigosMarzo = seccion(rMarzo, 'Listado de préstamos').filas.map((f) => f.codigo)
        verificar('Préstamos: el rango limita por fecha de entrega',
            codigosMarzo.includes(p1.codigo) && codigosMarzo.includes(p2.codigo) && !codigosMarzo.includes(p3.codigo))
        verificar('Préstamos: sin fechas trae todo el historial', (await reporte('prestamos')).filtros[0].valor === 'Todo el historial')

        // ---------- Interpretaciones ----------
        const rInt = await reporte('interpretaciones', '?desde=2099-01-01&hasta=2099-12-31')
        verificar('Interpretaciones: totales dentro del período',
            valor(rInt, 'Total de interpretaciones') === 3 && valor(rInt, 'Programadas') === 1 &&
            valor(rInt, 'Interpretadas') === 1 && valor(rInt, 'Canceladas') === 1 && valor(rInt, 'No interpretadas') === 0)
        verificar('Interpretaciones: obras más interpretadas', fila(rInt, 'Obras más interpretadas (máximo 20)', 'obra', 'TEST R Obra 1')?.veces === 1)
        verificar('Interpretaciones: agrupa por programa sin importar mayúsculas', fila(rInt, 'Por concierto o programa', 'nombre', 'TEST Gala')?.total === 2)
        const director = fila(rInt, 'Por director', 'nombre', 'TEST Directora Ñ')
        verificar('Interpretaciones: agrupa por director sin importar tildes ni mayúsculas',
            director?.total === 3 && director?.interpretadas === 1 && director?.programadas === 1 && director?.canceladas === 1)
        verificar('Interpretaciones: agrupa por mes', fila(rInt, 'Por período (mes)', 'nombre', '2099-05')?.total === 3)
        verificar('Interpretaciones: el listado trae fecha, obra y estado',
            seccion(rInt, 'Listado de interpretaciones').filas.find((f) => f.codigo === i1.codigo)?.estado === 'Interpretada' &&
            seccion(rInt, 'Listado de interpretaciones').filas.find((f) => f.codigo === i1.codigo)?.fecha === '2099-05-01')
        const rIntMayo = await reporte('interpretaciones', '?desde=2099-05-05&hasta=2099-05-31')
        verificar('Interpretaciones: el rango limita por fecha prevista', valor(rIntMayo, 'Total de interpretaciones') === 2)

        // ---------- Descargas ----------
        const hoy = /\d{4}-\d{2}-\d{2}/.source
        const xlsxObras = await descargar('/api/reportes/obras?formato=xlsx')
        verificar('Excel de obras: se descarga con su tipo y nombre',
            xlsxObras.estado === 200 && /spreadsheetml/.test(xlsxObras.tipo) && new RegExp(`filename="reporte-obras-${hoy}\\.xlsx"`).test(xlsxObras.disposicion))
        const libro = new ExcelJS.Workbook()
        await libro.xlsx.load(xlsxObras.cuerpo)
        verificar('Excel de obras: tiene el resumen y las secciones', libro.worksheets[0].name === 'Resumen' && !!libro.getWorksheet('Por carpeta') && !!libro.getWorksheet('Listado de obras'))
        let textoListado = ''
        libro.getWorksheet('Listado de obras').eachRow((f) => { textoListado += `${f.values.join('|')}\n` })
        verificar('Excel de obras: el listado contiene las obras de prueba', /TEST R Obra 1/.test(textoListado) && !/TEST R Inactiva/.test(textoListado))

        const pdfObras = await descargar('/api/reportes/obras?formato=pdf')
        verificar('PDF de obras: se descarga con su tipo y nombre',
            pdfObras.estado === 200 && /^application\/pdf/.test(pdfObras.tipo) && /reporte-obras-.*\.pdf/.test(pdfObras.disposicion) && pdfObras.cuerpo.subarray(0, 5).toString() === '%PDF-')
        for (const tipoReporte of ['inventario', 'prestamos', 'interpretaciones']) {
            const x = await descargar(`/api/reportes/${tipoReporte}?formato=xlsx&desde=2099-01-01&hasta=2099-12-31`)
            const p = await descargar(`/api/reportes/${tipoReporte}?formato=pdf&desde=2099-01-01&hasta=2099-12-31`)
            verificar(`Descarga el reporte de ${tipoReporte} en Excel y PDF`,
                x.estado === 200 && x.cuerpo.subarray(0, 2).toString() === 'PK' && p.estado === 200 && p.cuerpo.subarray(0, 5).toString() === '%PDF-')
        }

        const copia = await descargar('/api/reportes/copia?formato=xlsx')
        verificar('La copia se descarga en Excel con su nombre',
            copia.estado === 200 && /spreadsheetml/.test(copia.tipo) && /filename="copia-biblioteca-\d{4}-\d{2}-\d{2}\.xlsx"/.test(copia.disposicion))
        const libroCopia = new ExcelJS.Workbook()
        await libroCopia.xlsx.load(copia.cuerpo)
        const hojas = libroCopia.worksheets.map((h) => h.name)
        verificar('La copia trae todas las hojas',
            ['Resumen', 'Obras', 'Instrumentación', 'Canciones de mosaicos', 'Documentos digitales', 'Carpetas', 'Préstamos', 'Interpretaciones'].every((h) => hojas.includes(h)))
        const textoDe = (nombre) => {
            let t = ''
            libroCopia.getWorksheet(nombre).eachRow((f) => { t += `${f.values.join('|')}\n` })
            return t
        }
        verificar('La copia incluye también las obras inactivas', /TEST R Inactiva/.test(textoDe('Obras')))
        verificar('La copia incluye préstamos, interpretaciones y canciones de mosaicos',
            textoDe('Préstamos').includes(p1.codigo) && textoDe('Interpretaciones').includes(i1.codigo) && /TEST Canción Uno/.test(textoDe('Canciones de mosaicos')))
        verificar('La copia muestra el título de la obra original de una adaptación', textoDe('Obras').split('\n').some((l) => l.includes('TEST R Obra 2') && l.includes('TEST R Obra 1')))
    } catch (error) {
        verificar(`La prueba terminó sin errores inesperados (${error.message})`, false)
        console.error(error)
    } finally {
        await restaurarContador('prestamo', contadorPrestamo)
        await restaurarContador('interpretacion', contadorInterpretacion)
        await limpiar()
        await new Promise((resolve) => servidor.close(resolve))
        await mongoose.disconnect()
    }
    terminar()
}

ejecutar().catch(async (error) => {
    console.error(error)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
