import pg from 'pg'

const { Pool } = pg

declare global {
    // eslint-disable-next-line no-var
    var postgresPool: pg.Pool | undefined
}

export const pool =
    global.postgresPool ||
    new Pool({
        connectionString: process.env.DATABASE_URL,
    })

if (process.env.NODE_ENV !== 'production') {
    global.postgresPool = pool
}