const { Pool } = require('pg');
// Supabase (and most hosted Postgres) requires TLS: set DATABASE_SSL=true there.
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
module.exports = new Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 5 });
