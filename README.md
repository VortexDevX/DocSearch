<p align="center">
  <img src="public/assets/logo.png" alt="DocSearch Logo" width="80" />
</p>

<h1 align="center">🏥 DocSearch</h1>

<p align="center">
  <strong>Find the Right Doctor, Instantly</strong><br />
  A modern, full-stack doctor search platform with 48+ verified specialists across India
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-via_sql.js-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License" />
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Smart Search** | Search by doctor name, specialty, hospital, or city with real-time filtering |
| 🏷️ **Specialty Browse** | One-click specialty chips to quickly filter by medical field |
| ⚙️ **Advanced Filters** | Filter by specialty, city, gender, experience, consultation fee & sort options |
| 📄 **Paginated Results** | Load More pagination with progress bar — never load everything at once |
| 👨‍⚕️ **Doctor Profiles** | Detailed profile pages with contact info, bio, ratings & availability |
| ⭐ **Star Ratings** | Visual 5-star rating system with half-star precision |
| 📱 **Fully Responsive** | Beautiful on desktop, tablet, and mobile with hamburger menu |
| ♿ **Accessible** | ARIA labels, skip links, keyboard navigation (Ctrl+K to search) |
| 🛡️ **Secure** | XSS prevention, rate limiting, security headers, input sanitization |
| 📊 **Animated Stats** | Smooth number animations for total doctors, specialties, cities & ratings |

## 🏗️ Tech Stack

- **Backend** — [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) 4.x
- **Database** — [SQLite](https://www.sqlite.org/) via [sql.js](https://github.com/sql-js/sql.js) (in-memory, no native dependencies)
- **Frontend** — Vanilla HTML5, CSS3, JavaScript (no framework)
- **Typography** — [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts
- **Icons** — [Font Awesome](https://fontawesome.com/) 6.5

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/VortexDevX/DocSearch.git
cd DocSearch

# Install dependencies
npm install

# Set up the database (seeds 48 doctors)
npm run setup-db

# Start the server
npm start
```

Open **http://localhost:3000** in your browser 🎉

### Environment Variables (optional)

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=development
DB_PATH=./database/doctors.db
PAGE_SIZE=12
MAX_PAGE_SIZE=50
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## 📁 Project Structure

```
doctor-search/
├── database/
│   ├── setup.js          # Database setup & seed script (48 doctors)
│   └── doctors.db        # SQLite database (auto-generated)
├── public/
│   ├── css/
│   │   └── style.css     # Full design system (~1700 lines)
│   ├── js/
│   │   ├── app.js        # Main SPA logic, search, filters, pagination
│   │   └── doctor.js     # Doctor profile page logic
│   ├── index.html        # Home page — search, stats, specialty chips
│   └── doctor.html       # Doctor detail/profile page
├── server.js             # Express server with REST API
├── package.json
└── README.md
```

## 🔌 API Reference

All endpoints return JSON with the format:

```json
{
  "success": true,
  "data": "...",
  "meta": { "total": 48, "page": 1, "limit": 12, "totalPages": 4 }
}
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/doctors` | Search & filter doctors (paginated) |
| `GET` | `/api/doctors/:id` | Get doctor by ID |
| `GET` | `/api/specialties` | List all unique specialties |
| `GET` | `/api/cities` | List all unique cities |
| `GET` | `/api/stats` | Database statistics |
| `GET` | `/api/health` | Health check |

### Search Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | `string` | Search query (name, specialty, hospital, city, bio) |
| `specialty` | `string` | Filter by exact specialty |
| `city` | `string` | Filter by exact city |
| `gender` | `string` | `Male` or `Female` |
| `sort` | `string` | `rating`, `experience`, `fee_low`, `fee_high`, `name` |
| `minExp` | `number` | Minimum years of experience |
| `maxFee` | `number` | Maximum consultation fee (₹) |
| `page` | `number` | Page number (default: 1) |
| `limit` | `number` | Results per page (default: 12, max: 50) |

## 🔒 Security

- **XSS Protection** — All user input is escaped on both client and server
- **Rate Limiting** — 100 requests per 15-minute window per IP
- **Security Headers** — CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- **Input Sanitization** — Server-side validation and SQL parameterized queries
- **CORS** — Configurable allowed origins

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + K` | Focus search bar |
| `Escape` | Close filters panel / mobile menu |
| `Enter` | Submit search / Navigate to doctor profile |
| `Backspace` | Go back from doctor profile (when not in input) |

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for an internship project
</p>
