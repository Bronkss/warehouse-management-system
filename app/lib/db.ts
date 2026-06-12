// import pg from 'pg'
//
// const { Pool } = pg
//
// declare global {
//     // eslint-disable-next-line no-var
//     var postgresPool: pg.Pool | undefined
// }
//
// export const pool =
//     global.postgresPool ||
//     new Pool({
//         connectionString: process.env.DATABASE_URL,
//     })
//
// if (process.env.NODE_ENV !== 'production') {
//     global.postgresPool = pool
// }

import { Pool } from 'pg'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

// Проверка подключения при старте
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL подключен'))
    .catch((err) => console.error('❌ Ошибка PostgreSQL:', err.message))

export { pool }