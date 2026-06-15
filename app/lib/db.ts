import { Pool } from 'pg'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL подключен'))
    .catch((err) => console.error('❌ Ошибка PostgreSQL:', err.message))

export { pool }