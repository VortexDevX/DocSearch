/* ============================================================
   DocSearch - Server
   Production-ready with security, validation & performance fixes
   ============================================================ */

const express = require("express");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(__dirname, "database", "doctors.db"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Search
  MAX_SEARCH_LENGTH: 100,

  // Valid sort options
  VALID_SORT_OPTIONS: ["rating", "experience", "fee_low", "fee_high", "name"],

  // Valid gender options
  VALID_GENDER_OPTIONS: ["Male", "Female", ""],
};

const app = express();
let db;

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Sanitize string input - removes potential XSS/injection characters
 */
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .slice(0, CONFIG.MAX_SEARCH_LENGTH)
    .replace(/[<>\"\'`;\\]/g, "");
}

/**
 * Validate and parse integer
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
 * Log errors with timestamp
 */
function logError(context, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] [${context}]:`, error.message || error);

  // In production, you'd send this to a logging service
  // Example: logger.error({ context, error, timestamp });
}

/**
 * Log info with timestamp
 */
function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO] ${message}`);
}

/* ============================================================
   RATE LIMITER (Simple In-Memory Implementation)
   ============================================================ */

const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    // 1% chance to clean up
    for (const [key, value] of rateLimitStore.entries()) {
      if (now - value.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }

  let record = rateLimitStore.get(ip);

  if (!record || now - record.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
    // Start new window
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
    logError("RateLimit", { ip, count: record.count });
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

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS Protection (for older browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy (basic)
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

// CORS configuration
app.use((req, res, next) => {
  // In production, replace * with your actual domain
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? ["https://yourdomain.com"]
      : ["http://localhost:3000", "http://127.0.0.1:3000"];

  const origin = req.headers.origin;

  if (
    allowedOrigins.includes(origin) ||
    process.env.NODE_ENV !== "production"
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// Request timeout
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    logError("Timeout", { url: req.url });
    apiResponse(res, 408, false, null, "Request timeout");
  });
  next();
});

// Body parser
app.use(express.json({ limit: "10kb" })); // Limit body size

// Rate limiting for API routes
app.use("/api", rateLimit);

// Static files (with caching headers)
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    etag: true,
  }),
);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.url.startsWith("/api")) {
      logInfo(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
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

  // Specialty (will be validated against DB values)
  if (query.specialty) {
    validated.specialty = sanitizeString(query.specialty);
  }

  // City (will be validated against DB values)
  if (query.city) {
    validated.city = sanitizeString(query.city);
  }

  // Gender
  if (query.gender) {
    const gender = sanitizeString(query.gender);
    if (CONFIG.VALID_GENDER_OPTIONS.includes(gender)) {
      validated.gender = gender;
    } else {
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
      errors.push("Invalid minimum experience value");
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
  validated.page = parsePositiveInt(query.page, 1);
  validated.limit = Math.min(
    parsePositiveInt(query.limit, CONFIG.DEFAULT_PAGE_SIZE),
    CONFIG.MAX_PAGE_SIZE,
  );

  return { validated, errors };
}

/* ============================================================
   API ROUTES
   ============================================================ */

/**
 * GET /api/doctors - Search and filter doctors
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

    // Build query
    let sql = "SELECT * FROM doctors WHERE 1=1";
    let countSql = "SELECT COUNT(*) as total FROM doctors WHERE 1=1";
    const params = [];
    const countParams = [];

    // Search query (searches multiple fields)
    if (q) {
      const searchTerm = `%${q}%`;
      const searchClause = `
        AND (
          name LIKE ?
          OR hospital LIKE ?
          OR specialty LIKE ?
          OR city LIKE ?
          OR bio LIKE ?
        )
      `;
      sql += searchClause;
      countSql += searchClause;

      // Add params for both queries (5 times for 5 LIKE clauses)
      for (let i = 0; i < 5; i++) {
        params.push(searchTerm);
        countParams.push(searchTerm);
      }
    }

    // Specialty filter
    if (specialty) {
      sql += " AND specialty = ?";
      countSql += " AND specialty = ?";
      params.push(specialty);
      countParams.push(specialty);
    }

    // City filter
    if (city) {
      sql += " AND city = ?";
      countSql += " AND city = ?";
      params.push(city);
      countParams.push(city);
    }

    // Gender filter
    if (gender) {
      sql += " AND gender = ?";
      countSql += " AND gender = ?";
      params.push(gender);
      countParams.push(gender);
    }

    // Experience filter
    if (minExp !== undefined) {
      sql += " AND experience >= ?";
      countSql += " AND experience >= ?";
      params.push(minExp);
      countParams.push(minExp);
    }

    // Fee filter
    if (maxFee !== undefined) {
      sql += " AND consultation_fee <= ?";
      countSql += " AND consultation_fee <= ?";
      params.push(maxFee);
      countParams.push(maxFee);
    }

    // Sorting (safe - only predefined options allowed)
    const SORT_MAP = {
      rating: "rating DESC, experience DESC",
      experience: "experience DESC, rating DESC",
      fee_low: "consultation_fee ASC, rating DESC",
      fee_high: "consultation_fee DESC, rating DESC",
      name: "name ASC",
    };

    sql += ` ORDER BY ${SORT_MAP[sort]}`;

    // Pagination
    const offset = (page - 1) * limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute queries
    const doctors = queryAll(sql, params);
    const totalResult = queryOne(countSql, countParams);
    const total = totalResult ? totalResult.total : 0;

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

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
    // Validate ID
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

    const specialties = rows.map((r) => r.specialty);

    return apiResponse(res, 200, true, specialties);
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

    const cities = rows.map((r) => r.city);

    return apiResponse(res, 200, true, cities);
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
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  try {
    // Quick DB check
    const result = queryOne("SELECT 1 as ok");

    if (result?.ok === 1) {
      return apiResponse(res, 200, true, {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }

    throw new Error("Database check failed");
  } catch (error) {
    logError("GET /api/health", error);
    return apiResponse(res, 503, false, null, "Service unhealthy");
  }
});

/* ============================================================
   404 HANDLER FOR API ROUTES
   ============================================================ */

app.use("/api/*", (req, res) => {
  return apiResponse(res, 404, false, null, "API endpoint not found");
});

/* ============================================================
   SPA FALLBACK (Must be last)
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
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

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
      logInfo(`🚀 Server running → http://localhost:${CONFIG.PORT}`);
      logInfo(`   Environment: ${process.env.NODE_ENV || "development"}`);
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

    // Graceful shutdown
    const shutdown = async (signal) => {
      logInfo(`\n${signal} received. Shutting down gracefully...`);

      server.close(() => {
        logInfo("HTTP server closed");

        if (db) {
          db.close();
          logInfo("Database connection closed");
        }

        logInfo("Shutdown complete");
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

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
   EXPORTS (for testing)
   ============================================================ */

module.exports = { app, CONFIG };
