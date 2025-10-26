const Pool = require('pg').Pool;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'grw_db',
    password: 'grw26@',
    port: 5432,
});
pool.connect((err, client, release) => {
    if (err) {
      return console.error('Error acquiring client', err.stack);
    }
    console.log('Database connected successfully!');
    release();
   });
module.exports = pool;
