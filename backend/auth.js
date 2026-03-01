require("dotenv").config({ path: "./.env" });
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;

const register = async (username, password) => {
  const password_hash = await bcrypt.hash(password, 10);
  try {
    const res = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, password_hash]
    );
    const user = res.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
    return { user: { id: user.id, username: user.username }, token };
  } catch (error) {
    if (error.code === "23505") { // Duplicate username
      throw new Error("Username already exists");
    }
    throw error;
  }
};

const login = async (username, password) => {
  const res = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = res.rows[0];

  if (!user) {
    throw new Error("Invalid username or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error("Invalid username or password");
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
  return { user: { id: user.id, username: user.username }, token };
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401); // No token

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Token no longer valid or expired
    req.user = user;
    next();
  });
};

module.exports = { register, login, authenticateToken };
