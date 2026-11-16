
import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import {
  clerkMiddleware,
  getAuth,
} from "@clerk/express";

const app = express();

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from backend/.env");
}

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY is missing from backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

app.use(
  cors({
    origin: FRONTEND_URL,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(clerkMiddleware());

// Public health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "success",
    message: "SONORA backend is running!",
  });
});

// Public database connection check
app.get("/api/database-test", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time, current_database() AS database_name"
    );

    res.json({
      status: "success",
      message: "SONORA successfully connected to Neon PostgreSQL!",
      database: result.rows[0].database_name,
      serverTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("Neon connection error:", error);

    res.status(500).json({
      status: "error",
      message: "Could not connect to Neon PostgreSQL",
    });
  }
});

// Protected endpoint: requires a valid Clerk session

app.get("/api/me", (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({
      status: "error",
      message: "Unauthorized. Please sign in.",
    });
    return;
  }

  res.json({
    status: "success",
    message: "Clerk authentication is working!",
    userId,
  });
});


async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("Neon PostgreSQL connected successfully!");

    app.listen(PORT, () => {
      console.log(
        `SONORA backend running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start SONORA backend:", error);
    process.exit(1);
  }
}

startServer();
