import mongoose from 'mongoose'

const connection = async () => {
    try {
        const { connection } = await mongoose.connect(process.env.MONGODB_URI_PRODUCTION)
        console.log(`Base de datos conectada en ${connection.host} - ${connection.port}`)
    } catch (error) {
        console.error('Error al conectar con la base de datos:', error.message)
        process.exit(1)
    }
}

export default connection