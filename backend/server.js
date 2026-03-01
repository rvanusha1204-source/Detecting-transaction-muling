require("dotenv").config({ path: "./.env" });
const express = require("express");
const cors = require("cors");
const { register, login, authenticateToken } = require("./auth");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const swaggerDocument = YAML.load("./openapi.yaml");
const { saveTransactions } = require("./transactions");
const { analyzeTransactions } = require("./detection");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Auth Routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { user, token } = await register(username, password);
    res.status(201).json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { user, token } = await login(username, password);
    res.status(200).json({ user, token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Protected route example (for testing authentication)
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

// Placeholder for analyze-transactions route - will be implemented next
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Placeholder for analyze-transactions route - will be implemented next
app.post("/api/analyze-transactions", authenticateToken, async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "No transactions provided" });
    }

    await saveTransactions(transactions);

    const analysisResult = await analyzeTransactions(transactions);

    res.status(200).json(analysisResult);
  } catch (error) {
    console.error("Error analyzing transactions:", error);
    res.status(500).json({ error: "Failed to analyze transactions" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
