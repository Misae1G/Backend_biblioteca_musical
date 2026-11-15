import app from './server.js'
import connection from './config/database.js'

const iniciar = async () => {
    await connection()
    app.listen(app.get('port'), () => {
        console.log(`Servidor listo en http://localhost:${app.get('port')}`)
    })
}

iniciar()