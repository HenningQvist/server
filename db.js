import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool(
  isProduction
    ? {
        connectionString: process.env.DATABASE_URL,   // 🔥 Railway använder denna
        ssl: { rejectUnauthorized: false }            // 🔥 Måste vara med i production
      }
    : {
        user: process.env.PGUSER,                     // 🔹 Lokal utveckling
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT,
      }
);

pool.connect()
  .then(() => console.log("🚀 Database connected!"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

export default pool;
