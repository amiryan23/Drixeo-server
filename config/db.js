const mysql2 = require('mysql2');


const urlDB = `mysql://${process.env.MYSQLUSER}:${process.env.MYSQLPASSWORD}@${process.env.MYSQLHOST}:${process.env.MYSQLPORT}/${process.env.MYSQLDATABASE}`


const db = mysql2.createConnection(urlDB);

// const db = mysql2.createConnection({
//   host: process.env.TEST_DB_HOST,
//   user: process.env.TEST_DB_USER,
//   password: '',
//   database: process.env.TEST_DB_DATABASE,
// });

db.connect((err) => {
  if (err) console.error('Ошибка подключения к БД:', err);
  else console.log('Подключение к БД успешно!');
});

module.exports = db;