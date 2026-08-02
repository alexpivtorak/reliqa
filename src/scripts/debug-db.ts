import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://reliqa:securepassword@127.0.0.1:5432/reliqa_db';

console.log(`Debug: Attempting connection to: ${connectionString.replace(/:[^:@]*@/, ':***@')}`);

const client = new pg.Client({
    connectionString,
});

async function testConnection() {
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log('Success! Connected to DB at:', res.rows[0].now);
        await client.end();
    } catch (err: any) {
        console.error('Connection Failed:', err.message);
        if (err.code) console.error('Error Code:', err.code);
        process.exit(1);
    }
}

testConnection();
