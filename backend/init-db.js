const pool = require("./db");
const fs = require("fs");
const path = require("path");

const initDb = async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, "./sql/init.sql")).toString();
    await pool.query(sql);
    console.log("Database schema initialized successfully!");
  } catch (err) {
    console.error("Error initializing database schema:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

initDb();
