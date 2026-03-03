/* ============================================================
   DocSearch - Server
   Production-ready with pagination, security & validation
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
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: 100,

  // Pagination - THIS IS KEY!
  DEFAULT_PAGE_SIZE: 12,
  MAX_PAGE_SIZE: 50,

  // Search
  MAX_SEARCH_LENGTH: 100,

  // Valid options
  VALID_SORT_OPTIONS: ["rating", "experience", "fee_low", "fee_high", "name"],
  VALID_GENDER_OPTIONS: ["Male", "Female", ""],
};

const app = express();
let db;

/* ============================================================
   UTILITIES
   ============================================================ */

function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .slice(0, CONFIG.MAX_SEARCH_LENGTH)
    .replace(/[<>\"\'`;\\]/g, "");
}

function parsePositiveInt(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
}

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

function logError(context, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] [${context}]:`, error.message || error);
}

function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO] ${message}`);
}

/* ============================================================
   RATE LIMITER
   ============================================================ */

const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

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

  const remaining = Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - record.count);
  const resetTime = Math.ceil(
    (record.windowStart + CONFIG.RATE_LIMIT_WINDOW_MS - now) / 1000,
  );

  res.setHeader("X-RateLimit-Limit", CONFIG.RATE_LIMIT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", resetTime);

  if (record.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
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
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Body parser
app.use(express.json({ limit: "10kb" }));

// Rate limiting for API
app.use("/api", rateLimit);

// Static files
app.use(express.static(path.join(__dirname, "public")));

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

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

/* ============================================================
   INPUT VALIDATORS
   ============================================================ */

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

  // PAGINATION - IMPORTANT!
  validated.page = Math.max(1, parsePositiveInt(query.page, 1));
  validated.limit = Math.min(
    Math.max(1, parsePositiveInt(query.limit, CONFIG.DEFAULT_PAGE_SIZE)),
    CONFIG.MAX_PAGE_SIZE,
  );

  return { validated, errors };
}

/* ============================================================
   API ROUTES
   ============================================================ */

/**
 * GET /api/doctors - Search and filter doctors WITH PAGINATION
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

    // ========== BUILD BASE QUERY ==========
    let whereClause = "WHERE 1=1";
    const params = [];

    // Search query
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

    // ========== COUNT TOTAL (for pagination) ==========
    const countSql = `SELECT COUNT(*) as total FROM doctors ${whereClause}`;
    const countResult = queryOne(countSql, params);
    const total = countResult ? countResult.total : 0;

    // ========== BUILD DATA QUERY WITH PAGINATION ==========
    const SORT_MAP = {
      rating: "rating DESC, experience DESC",
      experience: "experience DESC, rating DESC",
      fee_low: "consultation_fee ASC, rating DESC",
      fee_high: "consultation_fee DESC, rating DESC",
      name: "name ASC",
    };

    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT * FROM doctors 
      ${whereClause}
      ORDER BY ${SORT_MAP[sort]}
      LIMIT ? OFFSET ?
    `;

    // Add limit and offset to params
    const dataParams = [...params, limit, offset];

    // Execute query
    const doctors = queryAll(dataSql, dataParams);

    // ========== CALCULATE PAGINATION META ==========
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Log for debugging
    logInfo(
      `Pagination: page=${page}, limit=${limit}, total=${total}, returned=${doctors.length}`,
    );

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
 * GET /api/doctors/:id - Get single doctor
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
 * GET /api/specialties
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
 * GET /api/cities
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
 * GET /api/stats
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
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
  try {
    const result = queryOne("SELECT 1 as ok");

    if (result?.ok === 1) {
      return apiResponse(res, 200, true, {
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    }

    throw new Error("Database check failed");
  } catch (error) {
    logError("GET /api/health", error);
    return apiResponse(res, 503, false, null, "Service unhealthy");
  }
});

// 404 for unknown API routes
app.use("/api/*", (req, res) => {
  return apiResponse(res, 404, false, null, "API endpoint not found");
});

/* ============================================================
   SPA FALLBACK
   ============================================================ */

app.get("*", (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ============================================================
   ERROR HANDLER
   ============================================================ */

app.use((err, req, res, next) => {
  logError("Unhandled Error", err);
  return apiResponse(res, 500, false, null, "Internal server error");
});

/* ============================================================
   SERVER STARTUP
   ============================================================ */

async function startServer() {
  try {
    if (!fs.existsSync(CONFIG.DB_PATH)) {
      console.error("❌ Database not found at:", CONFIG.DB_PATH);
      console.error("   Run: npm run setup-db");
      process.exit(1);
    }

    logInfo("Initializing database...");
    const SQL = await initSqlJs();

    const fileBuffer = fs.readFileSync(CONFIG.DB_PATH);
    db = new SQL.Database(fileBuffer);

    const tableCheck = queryOne(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='doctors'",
    );

    if (!tableCheck) {
      throw new Error("'doctors' table not found in database");
    }

    const doctorCount = queryOne("SELECT COUNT(*) as c FROM doctors");
    logInfo(`Database loaded (${doctorCount?.c || 0} doctors)`);

    const server = app.listen(CONFIG.PORT, () => {
      logInfo(`🚀 Server running → http://localhost:${CONFIG.PORT}`);
      logInfo(`📄 Page size: ${CONFIG.DEFAULT_PAGE_SIZE} doctors per page`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logInfo(`\n${signal} received. Shutting down...`);

      server.close(() => {
        if (db) db.close();
        logInfo("Shutdown complete");
        process.exit(0);
      });

      setTimeout(() => {
        process.exit(1);
      }, 10000);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
