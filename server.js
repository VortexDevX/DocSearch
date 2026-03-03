/* ============================================================
   DocSearch - Production-Ready Server
   Features: Pagination, Security, Rate Limiting, Compression
   ============================================================ */

// Load environment variables first
require("dotenv").config();

const express = require("express");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database
  DB_PATH: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, "database", "doctors.db"),

  // Pagination
  PAGE_SIZE: parseInt(process.env.PAGE_SIZE, 10) || 12,
  MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE, 10) || 50,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS:
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,

  // Security
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : ["http://localhost:3000", "http://127.0.0.1:3000"],

  // Search
  MAX_SEARCH_LENGTH: 100,

  // Valid options
  VALID_SORT_OPTIONS: ["rating", "experience", "fee_low", "fee_high", "name"],
  VALID_GENDER_OPTIONS: ["Male", "Female", ""],
};

// Derived config
const IS_PRODUCTION = CONFIG.NODE_ENV === "production";

const app = express();
let db;

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Sanitize string input to prevent XSS/injection
 */
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .slice(0, CONFIG.MAX_SEARCH_LENGTH)
    .replace(/[<>\"\'`;\\]/g, "");
}

/**
 * Parse positive integer with default
 */
function parsePositiveInt(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
}

/**
 * Create standardized API response
 */
function apiResponse(
  res,
  statusCode,
  success,
  data = null,
  error = null,
  meta = null,
) {
  const response = { success };

  if (data !== null) response.data = data;
  if (error !== null) response.error = error;
  if (meta !== null) response.meta = meta;

  return res.status(statusCode).json(response);
}

/**
 * Get timestamp for logging
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Log info message
 */
function logInfo(message) {
  console.log(`[${getTimestamp()}] [INFO] ${message}`);
}

/**
 * Log error message
 */
function logError(context, error) {
  console.error(
    `[${getTimestamp()}] [ERROR] [${context}]:`,
    error.message || error,
  );
}

/**
 * Log warning message
 */
function logWarn(message) {
  console.warn(`[${getTimestamp()}] [WARN] ${message}`);
}

/* ============================================================
   RATE LIMITER (In-Memory)
   ============================================================ */

const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  // Cleanup old entries (1% chance per request)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now - value.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }

  let record = rateLimitStore.get(ip);

  if (!record || now - record.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, windowStart: now };
    rateLimitStore.set(ip, record);
  } else {
    record.count++;
  }

  // Set rate limit headers
  const remaining = Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - record.count);
  const resetTime = Math.ceil(
    (record.windowStart + CONFIG.RATE_LIMIT_WINDOW_MS - now) / 1000,
  );

  res.setHeader("X-RateLimit-Limit", CONFIG.RATE_LIMIT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", resetTime);

  if (record.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    logWarn(`Rate limit exceeded for IP: ${ip}`);
    return apiResponse(
      res,
      429,
      false,
      null,
      "Too many requests. Please try again later.",
    );
  }

  next();
}

/* ============================================================
   MIDDLEWARE
   ============================================================ */

// Trust proxy (for Heroku, Render, etc.)
if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // HSTS (production only)
  if (IS_PRODUCTION) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self';",
  );

  next();
});

// CORS handling
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Check if origin is allowed
  if (CONFIG.ALLOWED_ORIGINS.includes(origin) || !IS_PRODUCTION) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// Compression (production only)
if (IS_PRODUCTION) {
  try {
    const compression = require("compression");
    app.use(compression());
    logInfo("Compression enabled");
  } catch (e) {
    logWarn(
      "Compression module not found. Install with: npm install compression",
    );
  }
}

// Body parser
app.use(express.json({ limit: "10kb" }));

// Rate limiting for API routes
app.use("/api", rateLimit);

// Static files with caching
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: IS_PRODUCTION ? "1d" : 0,
    etag: true,
    lastModified: true,
  }),
);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Only log API requests (or all in development)
    if (req.url.startsWith("/api")) {
      const logLevel = res.statusCode >= 400 ? "WARN" : "INFO";
      console.log(
        `[${getTimestamp()}] [${logLevel}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`,
      );
    }
  });

  next();
});

/* ============================================================
   DATABASE HELPERS
   ============================================================ */

/**
 * Execute query and return all rows
 */
function queryAll(sql, params = []) {
  let stmt;
  try {
    stmt = db.prepare(sql);
    stmt.bind(params);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }

    return rows;
  } catch (error) {
    logError("Database Query", error);
    throw error;
  } finally {
    if (stmt) {
      stmt.free();
    }
  }
}

/**
 * Execute query and return single row
 */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

/* ============================================================
   INPUT VALIDATORS
   ============================================================ */

/**
 * Validate search/filter parameters
 */
function validateSearchParams(query) {
  const errors = [];
  const validated = {};

  // Search query
  if (query.q) {
    validated.q = sanitizeString(query.q);
  }

  // Specialty
  if (query.specialty) {
    validated.specialty = sanitizeString(query.specialty);
  }

  // City
  if (query.city) {
    validated.city = sanitizeString(query.city);
  }

  // Gender
  if (query.gender) {
    const gender = sanitizeString(query.gender);
    if (CONFIG.VALID_GENDER_OPTIONS.includes(gender)) {
      validated.gender = gender;
    } else if (gender) {
      errors.push("Invalid gender value");
    }
  }

  // Sort
  validated.sort = CONFIG.VALID_SORT_OPTIONS.includes(query.sort)
    ? query.sort
    : "rating";

  // Min experience
  if (query.minExp !== undefined && query.minExp !== "") {
    const minExp = parsePositiveInt(query.minExp, -1);
    if (minExp >= 0 && minExp <= 100) {
      validated.minExp = minExp;
    } else {
      errors.push("Invalid minimum experience value (0-100)");
    }
  }

  // Max fee
  if (query.maxFee !== undefined && query.maxFee !== "") {
    const maxFee = parsePositiveInt(query.maxFee, -1);
    if (maxFee >= 0 && maxFee <= 1000000) {
      validated.maxFee = maxFee;
    } else {
      errors.push("Invalid maximum fee value");
    }
  }

  // Pagination
  validated.page = Math.max(1, parsePositiveInt(query.page, 1));
  validated.limit = Math.min(
    Math.max(1, parsePositiveInt(query.limit, CONFIG.PAGE_SIZE)),
    CONFIG.MAX_PAGE_SIZE,
  );

  return { validated, errors };
}

/* ============================================================
   API ROUTES
   ============================================================ */

/**
 * GET /api/doctors - Search and filter doctors with pagination
 */
app.get("/api/doctors", (req, res) => {
  try {
    // Validate input
    const { validated, errors } = validateSearchParams(req.query);

    if (errors.length > 0) {
      return apiResponse(res, 400, false, null, errors.join(", "));
    }

    const { q, specialty, city, gender, sort, minExp, maxFee, page, limit } =
      validated;

    // ========== BUILD WHERE CLAUSE ==========
    let whereClause = "WHERE 1=1";
    const params = [];

    // Search query (multiple fields)
    if (q) {
      const searchTerm = `%${q}%`;
      whereClause += `
        AND (
          name LIKE ?
          OR hospital LIKE ?
          OR specialty LIKE ?
          OR city LIKE ?
          OR bio LIKE ?
        )
      `;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Specialty filter
    if (specialty) {
      whereClause += " AND specialty = ?";
      params.push(specialty);
    }

    // City filter
    if (city) {
      whereClause += " AND city = ?";
      params.push(city);
    }

    // Gender filter
    if (gender) {
      whereClause += " AND gender = ?";
      params.push(gender);
    }

    // Experience filter
    if (minExp !== undefined) {
      whereClause += " AND experience >= ?";
      params.push(minExp);
    }

    // Fee filter
    if (maxFee !== undefined) {
      whereClause += " AND consultation_fee <= ?";
      params.push(maxFee);
    }

    // ========== COUNT TOTAL ==========
    const countSql = `SELECT COUNT(*) as total FROM doctors ${whereClause}`;
    const countResult = queryOne(countSql, params);
    const total = countResult ? countResult.total : 0;

    // ========== SORTING ==========
    const SORT_MAP = {
      rating: "rating DESC, experience DESC",
      experience: "experience DESC, rating DESC",
      fee_low: "consultation_fee ASC, rating DESC",
      fee_high: "consultation_fee DESC, rating DESC",
      name: "name ASC",
    };

    // ========== GET PAGINATED DATA ==========
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT * FROM doctors 
      ${whereClause}
      ORDER BY ${SORT_MAP[sort]}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, limit, offset];
    const doctors = queryAll(dataSql, dataParams);

    // ========== PAGINATION META ==========
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Log pagination info (development only)
    if (!IS_PRODUCTION) {
      logInfo(
        `Pagination: page=${page}, limit=${limit}, total=${total}, returned=${doctors.length}`,
      );
    }

    return apiResponse(res, 200, true, doctors, null, {
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      count: doctors.length,
    });
  } catch (error) {
    logError("GET /api/doctors", error);
    return apiResponse(res, 500, false, null, "Internal server error");
  }
});

/**
 * GET /api/doctors/:id - Get single doctor by ID
 */
app.get("/api/doctors/:id", (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id, -1);

    if (id <= 0) {
      return apiResponse(res, 400, false, null, "Invalid doctor ID");
    }

    const doctor = queryOne("SELECT * FROM doctors WHERE id = ?", [id]);

    if (!doctor) {
      return apiResponse(res, 404, false, null, "Doctor not found");
    }

    return apiResponse(res, 200, true, doctor);
  } catch (error) {
    logError("GET /api/doctors/:id", error);
    return apiResponse(res, 500, false, null, "Internal server error");
  }
});

/**
 * GET /api/specialties - Get all unique specialties
 */
app.get("/api/specialties", (req, res) => {
  try {
    const rows = queryAll(
      "SELECT DISTINCT specialty FROM doctors WHERE specialty IS NOT NULL AND specialty != '' ORDER BY specialty ASC",
    );

    return apiResponse(
      res,
      200,
      true,
      rows.map((r) => r.specialty),
    );
  } catch (error) {
    logError("GET /api/specialties", error);
    return apiResponse(res, 500, false, null, "Internal server error");
  }
});

/**
 * GET /api/cities - Get all unique cities
 */
app.get("/api/cities", (req, res) => {
  try {
    const rows = queryAll(
      "SELECT DISTINCT city FROM doctors WHERE city IS NOT NULL AND city != '' ORDER BY city ASC",
    );

    return apiResponse(
      res,
      200,
      true,
      rows.map((r) => r.city),
    );
  } catch (error) {
    logError("GET /api/cities", error);
    return apiResponse(res, 500, false, null, "Internal server error");
  }
});

/**
 * GET /api/stats - Get database statistics
 */
app.get("/api/stats", (req, res) => {
  try {
    const total = queryOne("SELECT COUNT(*) as c FROM doctors");
    const specs = queryOne(
      "SELECT COUNT(DISTINCT specialty) as c FROM doctors",
    );
    const cities = queryOne("SELECT COUNT(DISTINCT city) as c FROM doctors");
    const avgRating = queryOne(
      "SELECT ROUND(AVG(rating), 1) as c FROM doctors",
    );

    return apiResponse(res, 200, true, {
      total: total?.c || 0,
      specs: specs?.c || 0,
      cities: cities?.c || 0,
      avgRating: avgRating?.c || 0,
    });
  } catch (error) {
    logError("GET /api/stats", error);
    return apiResponse(res, 500, false, null, "Internal server error");
  }
});

/**
 * GET /api/health - Health check endpoint
 */
app.get("/api/health", (req, res) => {
  try {
    const result = queryOne("SELECT 1 as ok");

    if (result?.ok === 1) {
      return apiResponse(res, 200, true, {
        status: "healthy",
        environment: CONFIG.NODE_ENV,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    }

    throw new Error("Database check failed");
  } catch (error) {
    logError("GET /api/health", error);
    return apiResponse(res, 503, false, null, "Service unhealthy");
  }
});

/**
 * 404 Handler for unknown API routes
 */
app.use("/api/*", (req, res) => {
  return apiResponse(res, 404, false, null, "API endpoint not found");
});

/* ============================================================
   SPA FALLBACK
   ============================================================ */

app.get("*", (req, res) => {
  // Check if requesting a file (has extension)
  if (path.extname(req.path)) {
    return res.status(404).send("File not found");
  }

  // Serve SPA
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ============================================================
   ERROR HANDLER
   ============================================================ */

app.use((err, req, res, next) => {
  logError("Unhandled Error", err);

  // Don't leak error details in production
  const message = IS_PRODUCTION ? "Internal server error" : err.message;

  return apiResponse(res, 500, false, null, message);
});

/* ============================================================
   SERVER STARTUP
   ============================================================ */

async function startServer() {
  try {
    // Check database exists
    if (!fs.existsSync(CONFIG.DB_PATH)) {
      console.error("❌ Database not found at:", CONFIG.DB_PATH);
      console.error("   Run: npm run setup-db");
      process.exit(1);
    }

    // Initialize SQL.js
    logInfo("Initializing database...");
    const SQL = await initSqlJs();

    // Load database
    const fileBuffer = fs.readFileSync(CONFIG.DB_PATH);
    db = new SQL.Database(fileBuffer);

    // Verify database
    const tableCheck = queryOne(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='doctors'",
    );

    if (!tableCheck) {
      throw new Error("'doctors' table not found in database");
    }

    const doctorCount = queryOne("SELECT COUNT(*) as c FROM doctors");
    logInfo(`Database loaded successfully (${doctorCount?.c || 0} doctors)`);

    // Start server
    const server = app.listen(CONFIG.PORT, () => {
      console.log("");
      console.log(
        "╔════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║                    🏥 DocSearch Server                     ║",
      );
      console.log(
        "╠════════════════════════════════════════════════════════════╣",
      );
      console.log(
        `║  🚀 Server:      http://localhost:${CONFIG.PORT}                    ║`,
      );
      console.log(
        `║  📄 Page Size:   ${CONFIG.PAGE_SIZE} doctors per page                     ║`,
      );
      console.log(`║  🌍 Environment: ${CONFIG.NODE_ENV.padEnd(36)}║`);
      console.log(
        `║  💾 Database:    ${doctorCount?.c || 0} doctors                             ║`,
      );
      console.log(
        "╚════════════════════════════════════════════════════════════╝",
      );
      console.log("");
    });

    // Server error handling
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${CONFIG.PORT} is already in use`);
      } else {
        console.error("❌ Server error:", error);
      }
      process.exit(1);
    });

    // Graceful shutdown handler
    const shutdown = (signal) => {
      logInfo(`\n${signal} received. Shutting down gracefully...`);

      server.close(() => {
        logInfo("HTTP server closed");

        if (db) {
          db.close();
          logInfo("Database connection closed");
        }

        logInfo("Shutdown complete. Goodbye! 👋");
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error("⚠️ Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logError("Uncaught Exception", error);
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logError("Unhandled Rejection", reason);
    });
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

/* ============================================================
   MODULE EXPORTS (for testing)
   ============================================================ */

module.exports = { app, CONFIG };
