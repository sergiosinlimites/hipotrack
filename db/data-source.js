const path = require('path');
const { DataSource } = require('typeorm');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5439', 10),
  username: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'hypotrack',
  synchronize: true,
  logging: false,
  entities: [path.join(__dirname, 'entities', '*.js')],
});

module.exports = {
  AppDataSource,
};


