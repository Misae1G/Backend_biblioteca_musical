import 'dotenv/config'

// Las pruebas crean y borran datos: nunca contra producción
export const exigirBaseDePruebas = () => {
    let nombreBase = ''
    try {
        nombreBase = new URL(process.env.MONGODB_URI).pathname.replace('/', '')
    } catch {
        // se valida abajo
    }
    if (!nombreBase || /prod/i.test(nombreBase)) {
        console.error(`Base "${nombreBase || '(sin nombre)'}" no permitida para pruebas. Usa biblioteca_dev.`)
        process.exit(1)
    }
}

export const crearVerificador = () => {
    const resultados = []
    return {
        verificar: (nombre, ok) => {
            resultados.push(!!ok)
            console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
        },
        terminar: () => {
            const fallos = resultados.filter((r) => !r).length
            console.log(fallos === 0 ? '\nTodas las pruebas pasaron.' : `\n${fallos} prueba(s) fallaron.`)
            process.exit(fallos === 0 ? 0 : 1)
        },
    }
}

export const crearApi = (base) => async (ruta, { metodo = 'GET', cuerpo, cookie } = {}) => {
    const headers = {}
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json'
    if (cookie) headers.Cookie = cookie
    const res = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    })
    const texto = await res.text()
    let datos = null
    try {
        datos = JSON.parse(texto)
    } catch {
        // respuesta sin JSON
    }
    return { estado: res.status, datos, cookies: res.headers.getSetCookie() }
}

export const cookieDe = (r) => r.cookies.find((c) => c.startsWith('token='))?.split(';')[0] ?? null

export const iniciarServidor = (app) =>
    new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })