/* =========================================================
   DocSearch - Doctor Profile Page
   Fixed: XSS, accessibility, loading states, error handling
   ========================================================= */

/* =========================================================
   UTILITIES
   ========================================================= */

const $ = (sel) => document.querySelector(sel);

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";

  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Format phone number for display
 */
function formatPhone(phone) {
  if (!phone) return "Not available";
  return escapeHTML(phone);
}

/**
 * Format email for display
 */
function formatEmail(email) {
  if (!email) return "Not available";
  return escapeHTML(email);
}

/**
 * Format number with locale
 */
function formatNumber(num) {
  if (typeof num !== "number") return "0";
  return num.toLocaleString("en-IN");
}

/**
 * Generate star rating HTML (XSS Safe)
 */
function generateStars(rating) {
  const safeRating = Math.max(0, Math.min(5, parseFloat(rating) || 0));
  const full = Math.floor(safeRating);
  const half = safeRating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;

  let html = "";

  for (let i = 0; i < full; i++) {
    html += '<i class="fas fa-star" aria-hidden="true"></i>';
  }

  if (half) {
    html += '<i class="fas fa-star-half-alt" aria-hidden="true"></i>';
  }

  for (let i = 0; i < empty; i++) {
    html += '<i class="far fa-star" aria-hidden="true"></i>';
  }

  return html;
}

/**
 * Generate initials from name
 */
function getInitials(name) {
  if (!name) return "?";

  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const DOM = {
  get page() {
    return $("#detailPage");
  },
  get loader() {
    return $("#loader");
  },
};

/* =========================================================
   LOADING STATES
   ========================================================= */

function showLoading() {
  const loader = DOM.loader;
  if (loader) {
    loader.classList.remove("hidden");
    loader.setAttribute("aria-busy", "true");
  }
}

function hideLoading() {
  const loader = DOM.loader;
  if (loader) {
    loader.classList.add("hidden");
    loader.setAttribute("aria-busy", "false");
  }
}

/* =========================================================
   ERROR STATES
   ========================================================= */

function showError(title, message, showHomeButton = true) {
  const page = DOM.page;
  if (!page) return;

  hideLoading();

  page.innerHTML = `
    <div class="container">
      <div class="empty-state" role="alert">
        <div class="empty-icon">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        </div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
        ${
          showHomeButton
            ? `
          <a href="/" class="btn btn-primary">
            <i class="fas fa-home" aria-hidden="true"></i>
            Go Home
          </a>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function showNotFound() {
  showError(
    "Doctor Not Found",
    "The doctor profile you're looking for doesn't exist or has been removed.",
  );
}

function showInvalidId() {
  showError("Invalid Doctor ID", "Please check the URL and try again.");
}

function showNetworkError() {
  showError(
    "Connection Error",
    "Unable to load doctor profile. Please check your internet connection and try again.",
  );
}

/* =========================================================
   RENDER DOCTOR PROFILE (XSS Safe)
   ========================================================= */

function renderDoctor(doc) {
  const page = DOM.page;
  if (!page) return;

  hideLoading();

  // Update page title
  document.title = `${escapeHTML(doc.name)} — DocSearch`;

  // Update meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement("meta");
    metaDesc.name = "description";
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = `${escapeHTML(doc.name)} - ${escapeHTML(doc.specialty)} at ${escapeHTML(doc.hospital)}, ${escapeHTML(doc.city)}. Book appointment now.`;

  // Generate safe values
  const initials = escapeHTML(getInitials(doc.name));
  const name = escapeHTML(doc.name);
  const specialty = escapeHTML(doc.specialty);
  const hospital = escapeHTML(doc.hospital);
  const city = escapeHTML(doc.city);
  const experience = escapeHTML(doc.experience);
  const fee = formatNumber(doc.consultation_fee);
  const availability = escapeHTML(doc.availability);
  const gender = escapeHTML(doc.gender);
  const phone = formatPhone(doc.phone);
  const email = formatEmail(doc.email);
  const bio = doc.bio ? escapeHTML(doc.bio) : null;
  const rating = parseFloat(doc.rating) || 0;

  page.innerHTML = `
    <div class="container">
      <article class="detail-card" aria-labelledby="doctor-name">
        
        <!-- Hero Section -->
        <header class="detail-hero">
          <div class="detail-avatar" aria-hidden="true">
            ${initials}
          </div>
          <h1 id="doctor-name">${name}</h1>
          <div class="detail-specialty">${specialty}</div>
          <div class="detail-rating" aria-label="Rating: ${rating} out of 5 stars">
            ${generateStars(rating)}
            <strong>${rating}</strong>
            <span class="rating-text">(Patient Rating)</span>
          </div>
          ${bio ? `<p class="detail-bio">${bio}</p>` : ""}
        </header>

        <!-- Info Section -->
        <div class="detail-body">
          <div class="detail-section">
            <h2 class="detail-section-title">
              <i class="fas fa-user-md" aria-hidden="true"></i>
              Professional Information
            </h2>
            <div class="detail-row">
              <span class="detail-label">Hospital</span>
              <span class="detail-value">${hospital}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Experience</span>
              <span class="detail-value">${experience} years</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Consultation Fee</span>
              <span class="detail-value detail-fee">₹ ${fee}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Availability</span>
              <span class="detail-value">${availability}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Gender</span>
              <span class="detail-value">${gender}</span>
            </div>
          </div>

          <div class="detail-section">
            <h2 class="detail-section-title">
              <i class="fas fa-address-card" aria-hidden="true"></i>
              Contact Information
            </h2>
            <div class="detail-row">
              <span class="detail-label">City</span>
              <span class="detail-value">${city}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone</span>
              <span class="detail-value">
                ${doc.phone ? `<a href="tel:${escapeHTML(doc.phone)}" class="detail-link">${phone}</a>` : phone}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Email</span>
              <span class="detail-value">
                ${doc.email ? `<a href="mailto:${escapeHTML(doc.email)}" class="detail-link">${email}</a>` : email}
              </span>
            </div>
          </div>
        </div>

        <!-- Actions Section -->
        <footer class="detail-actions">
          ${
            doc.phone
              ? `
            <a href="tel:${escapeHTML(doc.phone)}" class="btn btn-primary btn-lg">
              <i class="fas fa-phone-alt" aria-hidden="true"></i>
              Call Now
            </a>
          `
              : ""
          }
          ${
            doc.email
              ? `
            <a href="mailto:${escapeHTML(doc.email)}" class="btn btn-ghost btn-lg">
              <i class="fas fa-envelope" aria-hidden="true"></i>
              Send Email
            </a>
          `
              : ""
          }
          <a href="/" class="btn btn-ghost btn-lg">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            Back to Search
          </a>
        </footer>

      </article>
    </div>
  `;

  // Announce to screen readers
  announceToScreenReader(`Loaded profile for ${doc.name}, ${doc.specialty}`);
}

/* =========================================================
   ACCESSIBILITY HELPERS
   ========================================================= */

function announceToScreenReader(message) {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.className = "sr-only";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    announcement.remove();
  }, 1000);
}

/* =========================================================
   FETCH & LOAD DOCTOR
   ========================================================= */

async function loadDoctor() {
  const page = DOM.page;
  if (!page) return;

  showLoading();

  // Get doctor ID from URL
  let id;
  try {
    const params = new URLSearchParams(window.location.search);
    id = params.get("id");
  } catch (error) {
    console.error("URL parsing error:", error);
    showInvalidId();
    return;
  }

  // Validate ID
  if (!id) {
    showInvalidId();
    return;
  }

  // Check if ID is a valid positive integer
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0 || String(parsedId) !== id) {
    showInvalidId();
    return;
  }

  try {
    const response = await fetch(`/api/doctors/${encodeURIComponent(id)}`);

    if (!response.ok) {
      if (response.status === 404) {
        showNotFound();
        return;
      }

      if (response.status === 400) {
        showInvalidId();
        return;
      }

      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      showNotFound();
      return;
    }

    renderDoctor(result.data);
  } catch (error) {
    console.error("Load doctor error:", error);

    // Check if it's a network error
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      showNetworkError();
    } else {
      showError(
        "Error Loading Profile",
        "Something went wrong. Please try again later.",
      );
    }
  }
}

/* =========================================================
   KEYBOARD NAVIGATION
   ========================================================= */

function setupKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    // Go back on Escape
    if (e.key === "Escape") {
      window.location.href = "/";
    }

    // Go back on Backspace (when not in input)
    if (
      e.key === "Backspace" &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
    ) {
      window.location.href = "/";
    }
  });
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {
  loadDoctor();
  setupKeyboardNav();
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* =========================================================
   EXPORTS (for testing)
   ========================================================= */

window.DoctorPage = {
  loadDoctor,
  renderDoctor,
};
