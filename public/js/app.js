/* =========================================================
   DocSearch - Main Application
   Fixed: XSS, accessibility, events, performance
   With Load More Pagination & Single Search
   ========================================================= */

/* =========================================================
   UTILITIES
   ========================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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
 * Debounce function to limit rapid calls
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for scroll events
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Safe API call wrapper
 */
async function api(endpoint) {
  try {
    const res = await fetch(`/api${endpoint}`);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    return res.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Format number with locale
 */
function formatNumber(num) {
  return num.toLocaleString("en-IN");
}

/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const DOM = {
  // Navigation
  get navbar() {
    return $("#navbar");
  },
  get hamburger() {
    return $("#hamburger");
  },
  get mobileMenu() {
    return $("#mobileMenu");
  },

  // Hero Search (Main Search)
  get heroSearch() {
    return $("#heroSearch");
  },
  get heroSearchBtn() {
    return $("#heroSearchBtn");
  },
  get heroTags() {
    return $$(".hero-tag");
  },

  // Quick Filter (Filters loaded doctors only)
  get quickFilter() {
    return $("#quickFilter");
  },

  // Filters Panel
  get filterToggle() {
    return $("#filterToggle");
  },
  get filtersPanel() {
    return $("#filtersPanel");
  },
  get filterSpecialty() {
    return $("#filterSpecialty");
  },
  get filterCity() {
    return $("#filterCity");
  },
  get filterGender() {
    return $("#filterGender");
  },
  get filterSort() {
    return $("#filterSort");
  },
  get filterExp() {
    return $("#filterExp");
  },
  get filterFee() {
    return $("#filterFee");
  },
  get applyFilters() {
    return $("#applyFilters");
  },
  get resetFilters() {
    return $("#resetFilters");
  },
  get activeFiltersCount() {
    return $("#activeFiltersCount");
  },

  // Doctors Grid
  get doctorsGrid() {
    return $("#doctorsGrid");
  },
  get resultCount() {
    return $("#resultCount");
  },
  get loader() {
    return $("#loader");
  },
  get emptyState() {
    return $("#emptyState");
  },
  get emptyReset() {
    return $("#emptyReset");
  },

  // Specialty Section
  get specialtyChips() {
    return $("#specialtyChips");
  },

  // Load More
  get loadMoreContainer() {
    return $("#loadMoreContainer");
  },
  get loadMoreBtn() {
    return $("#loadMoreBtn");
  },
  get loadMoreSpinner() {
    return $("#loadMoreSpinner");
  },
  get loadMoreText() {
    return $("#loadMoreText");
  },
  get loadedCount() {
    return $("#loadedCount");
  },
  get totalCount() {
    return $("#totalCount");
  },
  get loadMoreBarFill() {
    return $("#loadMoreBarFill");
  },

  // Misc
  get scrollTop() {
    return $("#scrollTop");
  },
  get statDoctors() {
    return $("#statDoctors");
  },
  get statSpecs() {
    return $("#statSpecs");
  },
  get statCities() {
    return $("#statCities");
  },
  get statRating() {
    return $("#statRating");
  },
  get heroTotal() {
    return $("#heroTotal");
  },
};

/* =========================================================
   STATE
   ========================================================= */

const State = {
  // All doctors from current search (accumulated from pagination)
  allDoctors: [],

  // Filtered doctors (after quick filter)
  filteredDoctors: [],

  // Loading states
  isLoading: false,
  isLoadingMore: false,

  // Current request (for cancellation)
  currentRequest: null,

  // Filters panel state
  filtersOpen: false,

  // Dropdown data
  specialties: [],
  cities: [],

  // Quick filter active
  quickFilterActive: false,

  // Pagination
  pagination: {
    currentPage: 1,
    pageSize: 12,
    totalDoctors: 0,
    totalPages: 0,
    hasMore: false,
  },
};

/* =========================================================
   STAR RATING GENERATOR (XSS Safe)
   ========================================================= */

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

/* =========================================================
   NUMBER ANIMATION
   ========================================================= */

function animateNumber(element, target, decimals = 0) {
  if (!element) return;

  const duration = 1200;
  const start = performance.now();
  const startValue = 0;

  function update(currentTime) {
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (target - startValue) * easeProgress;

    if (decimals > 0) {
      element.textContent = currentValue.toFixed(decimals);
    } else {
      element.textContent = Math.floor(currentValue);
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/* =========================================================
   LOADING STATE MANAGEMENT
   ========================================================= */

function setLoading(isLoading, isInitial = true) {
  State.isLoading = isLoading;

  const loader = DOM.loader;
  const grid = DOM.doctorsGrid;
  const empty = DOM.emptyState;
  const loadMoreContainer = DOM.loadMoreContainer;

  if (isLoading) {
    loader?.classList.remove("hidden");
    loader?.setAttribute("aria-busy", "true");
    empty?.classList.add("hidden");
    loadMoreContainer?.classList.add("hidden");

    // Only clear grid on initial load
    if (isInitial && grid) {
      grid.innerHTML = "";
    }
  } else {
    loader?.classList.add("hidden");
    loader?.setAttribute("aria-busy", "false");
  }
}

function setLoadingMore(isLoading) {
  State.isLoadingMore = isLoading;

  const btn = DOM.loadMoreBtn;
  const spinner = DOM.loadMoreSpinner;
  const text = DOM.loadMoreText;

  if (!btn) return;

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("loading");
    spinner?.classList.remove("hidden");
    if (text) text.textContent = "Loading...";
  } else {
    btn.disabled = false;
    btn.classList.remove("loading");
    spinner?.classList.add("hidden");
    if (text) text.textContent = "Load More";
  }
}

function showError(message) {
  const empty = DOM.emptyState;
  if (!empty) return;

  setLoading(false);
  empty.classList.remove("hidden");
  DOM.loadMoreContainer?.classList.add("hidden");

  const heading = empty.querySelector("h3");
  const text = empty.querySelector("p");

  if (heading) heading.textContent = "Something went wrong";
  if (text) text.textContent = message || "Please try again later";
}

function showEmpty() {
  const empty = DOM.emptyState;
  if (!empty) return;

  empty.classList.remove("hidden");
  DOM.loadMoreContainer?.classList.add("hidden");

  const heading = empty.querySelector("h3");
  const text = empty.querySelector("p");

  if (heading) heading.textContent = "No Doctors Found";
  if (text) text.textContent = "Try adjusting your search or filters";
}

/* =========================================================
   BUILD SEARCH PARAMS
   ========================================================= */

function buildSearchParams(page = 1) {
  const params = new URLSearchParams();

  // Hero search query
  const searchQuery = DOM.heroSearch?.value.trim();
  if (searchQuery) {
    params.append("q", searchQuery);
  }

  // Filters
  if (DOM.filterSpecialty?.value) {
    params.append("specialty", DOM.filterSpecialty.value);
  }

  if (DOM.filterCity?.value) {
    params.append("city", DOM.filterCity.value);
  }

  if (DOM.filterGender?.value) {
    params.append("gender", DOM.filterGender.value);
  }

  if (DOM.filterSort?.value) {
    params.append("sort", DOM.filterSort.value);
  }

  const minExp = DOM.filterExp?.value;
  if (minExp && parseInt(minExp) > 0) {
    params.append("minExp", minExp);
  }

  const maxFee = DOM.filterFee?.value;
  if (maxFee && parseInt(maxFee) > 0) {
    params.append("maxFee", maxFee);
  }

  // Pagination
  params.append("page", page);
  params.append("limit", State.pagination.pageSize);

  return params;
}

/* =========================================================
   FETCH DOCTORS (Initial Load / New Search)
   ========================================================= */

async function fetchDoctors() {
  if (!DOM.doctorsGrid) return;

  // Cancel any pending request
  if (State.currentRequest) {
    State.currentRequest.cancelled = true;
  }

  const requestId = { cancelled: false };
  State.currentRequest = requestId;

  // Reset pagination and state
  State.pagination.currentPage = 1;
  State.allDoctors = [];
  State.filteredDoctors = [];
  State.quickFilterActive = false;

  // Clear quick filter input
  if (DOM.quickFilter) {
    DOM.quickFilter.value = "";
  }

  setLoading(true, true);
  updateActiveFiltersCount();

  const params = buildSearchParams(1);

  try {
    const response = await api(`/doctors?${params}`);

    console.log("API Response:", response);
    console.log("Meta:", response.meta);
    console.log("Doctors received:", response.data?.length);

    // Check if this request was cancelled
    if (requestId.cancelled) return;

    if (response.success && Array.isArray(response.data)) {
      const { data, meta } = response;

      State.allDoctors = data;
      State.filteredDoctors = data;

      // Update pagination state
      if (meta) {
        State.pagination.totalDoctors = meta.total || data.length;
        State.pagination.totalPages = meta.totalPages || 1;
        State.pagination.hasMore = meta.hasNextPage || false;
      } else {
        State.pagination.totalDoctors = data.length;
        State.pagination.totalPages = 1;
        State.pagination.hasMore = false;
      }

      renderDoctors(data, false);
      updateLoadMoreUI();
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    if (requestId.cancelled) return;

    console.error("Fetch doctors error:", error);
    setLoading(false);
    showError(error.message);
    updateResultCount(0);
  }
}

/* =========================================================
   LOAD MORE DOCTORS
   ========================================================= */

async function loadMoreDoctors() {
  if (State.isLoadingMore || !State.pagination.hasMore) return;

  // Don't load more if quick filter is active
  if (State.quickFilterActive) {
    return;
  }

  const nextPage = State.pagination.currentPage + 1;

  setLoadingMore(true);

  const params = buildSearchParams(nextPage);

  try {
    const response = await api(`/doctors?${params}`);

    if (response.success && Array.isArray(response.data)) {
      const { data, meta } = response;

      // Append to existing doctors
      State.allDoctors = [...State.allDoctors, ...data];
      State.filteredDoctors = State.allDoctors;

      // Update pagination
      State.pagination.currentPage = nextPage;

      if (meta) {
        State.pagination.hasMore = meta.hasNextPage || false;
      } else {
        State.pagination.hasMore = false;
      }

      // Append new cards (don't replace)
      renderDoctors(data, true);
      updateLoadMoreUI();

      // Announce to screen readers
      announceToScreenReader(`Loaded ${data.length} more doctors`);
    }
  } catch (error) {
    console.error("Load more error:", error);
    announceToScreenReader("Failed to load more doctors. Please try again.");
  } finally {
    setLoadingMore(false);
  }
}

/* =========================================================
   UPDATE LOAD MORE UI
   ========================================================= */

function updateLoadMoreUI() {
  const container = DOM.loadMoreContainer;
  const loadedCount = DOM.loadedCount;
  const totalCount = DOM.totalCount;
  const progressBar = DOM.loadMoreBarFill;

  if (!container) return;

  // Don't show load more when quick filter is active
  if (State.quickFilterActive) {
    container.classList.add("hidden");
    return;
  }

  const loaded = State.allDoctors.length;
  const total = State.pagination.totalDoctors;

  // Update counters
  if (loadedCount) loadedCount.textContent = loaded;
  if (totalCount) totalCount.textContent = total;

  // Update progress bar
  if (progressBar && total > 0) {
    const percentage = Math.min((loaded / total) * 100, 100);
    progressBar.style.width = `${percentage}%`;
  }

  // Show/hide based on state
  if (loaded === 0) {
    container.classList.add("hidden");
    return;
  }

  if (State.pagination.hasMore && loaded < total) {
    // More to load - show button
    container.classList.remove("hidden");

    // Reset container content if needed
    const existingBtn = container.querySelector(".load-more-btn");
    if (!existingBtn) {
      container.innerHTML = `
        <div class="load-more-progress">
          <span class="load-more-text-info">
            Showing <strong id="loadedCount">${loaded}</strong> of <strong id="totalCount">${total}</strong> doctors
          </span>
          <div class="load-more-bar">
            <div class="load-more-bar-fill" id="loadMoreBarFill" style="width: ${(loaded / total) * 100}%"></div>
          </div>
        </div>
        
        <button 
          type="button" 
          class="btn btn-primary btn-lg load-more-btn" 
          id="loadMoreBtn"
          aria-label="Load more doctors"
        >
          <span class="load-more-spinner hidden" id="loadMoreSpinner">
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          </span>
          <span id="loadMoreText">Load More</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
      `;

      // Re-attach event listener
      container
        .querySelector("#loadMoreBtn")
        ?.addEventListener("click", loadMoreDoctors);
    }
  } else if (loaded >= total && total > 0) {
    // All loaded - show completion message
    container.classList.remove("hidden");
    container.innerHTML = `
      <div class="load-more-progress">
        <span class="load-more-text-info">
          Showing all <strong>${total}</strong> doctors
        </span>
        <div class="load-more-bar">
          <div class="load-more-bar-fill" style="width: 100%"></div>
        </div>
      </div>
      <div class="load-more-complete">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        <p>All doctors loaded</p>
      </div>
    `;
  } else {
    container.classList.add("hidden");
  }
}

/* =========================================================
   RENDER DOCTORS (XSS Safe)
   ========================================================= */

function renderDoctors(doctors, append = false) {
  setLoading(false);

  const grid = DOM.doctorsGrid;
  if (!grid) return;

  // If not appending, clear and check for empty
  if (!append) {
    grid.innerHTML = "";

    if (!doctors || doctors.length === 0) {
      showEmpty();
      updateResultCount(0);
      return;
    }
  }

  DOM.emptyState?.classList.add("hidden");

  // Update result count
  if (State.quickFilterActive) {
    updateResultCount(doctors.length, doctors.length);
  } else {
    updateResultCount(State.allDoctors.length, State.pagination.totalDoctors);
  }

  // Create document fragment for better performance
  const fragment = document.createDocumentFragment();

  doctors.forEach((doc) => {
    const card = createDoctorCard(doc);
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

/**
 * Create a single doctor card (XSS Safe)
 */
function createDoctorCard(doc) {
  const article = document.createElement("article");
  article.className = "doctor-card";
  article.setAttribute("role", "link");
  article.setAttribute("tabindex", "0");
  article.setAttribute(
    "aria-label",
    `View profile of Dr. ${escapeHTML(doc.name)}, ${escapeHTML(doc.specialty)}`,
  );
  article.dataset.id = doc.id;

  // Generate initials safely
  const initials = escapeHTML(
    doc.name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );

  article.innerHTML = `
    <div class="card-top">
      <div class="card-avatar" aria-hidden="true">${initials}</div>
      <div>
        <h3>${escapeHTML(doc.name)}</h3>
        <span class="card-specialty">${escapeHTML(doc.specialty)}</span>
        <div class="card-rating" aria-label="Rating: ${escapeHTML(doc.rating)} out of 5 stars">
          ${generateStars(doc.rating)}
          <strong>${escapeHTML(doc.rating)}</strong>
        </div>
      </div>
    </div>

    <div class="card-details">
      <div class="card-detail">
        <i class="fas fa-hospital" aria-hidden="true"></i>
        <span>${escapeHTML(doc.hospital)}</span>
      </div>
      <div class="card-detail">
        <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
        <span>${escapeHTML(doc.city)}</span>
      </div>
      <div class="card-detail">
        <i class="fas fa-briefcase-medical" aria-hidden="true"></i>
        <span>${escapeHTML(doc.experience)} years experience</span>
      </div>
      <div class="card-detail">
        <i class="fas fa-calendar-alt" aria-hidden="true"></i>
        <span>${escapeHTML(doc.availability)}</span>
      </div>
    </div>

    <div class="card-fee">
      <span>₹ ${formatNumber(doc.consultation_fee)}</span>
      <span class="card-action">View Profile</span>
    </div>
  `;

  // Add click handler
  article.addEventListener("click", () => navigateToDoctor(doc.id));

  // Add keyboard handler for accessibility
  article.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigateToDoctor(doc.id);
    }
  });

  return article;
}

function navigateToDoctor(id) {
  window.location.href = `doctor.html?id=${encodeURIComponent(id)}`;
}

function updateResultCount(count, total = null) {
  const badge = DOM.resultCount;
  if (!badge) return;

  let text;
  if (total && total > count) {
    text = `Showing ${count} of ${total} doctors`;
  } else if (total && total === count && count > 0) {
    text = `${count} ${count === 1 ? "doctor" : "doctors"}`;
  } else {
    text = `${count} ${count === 1 ? "doctor" : "doctors"}`;
  }

  badge.textContent = text;
  badge.setAttribute("aria-live", "polite");
}

/* =========================================================
   ACCESSIBILITY HELPER
   ========================================================= */

function announceToScreenReader(message) {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.className = "sr-only";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    announcement.remove();
  }, 1000);
}

/* =========================================================
   QUICK FILTER (Client-side filtering of loaded doctors)
   ========================================================= */

const handleQuickFilter = debounce(() => {
  const term = DOM.quickFilter?.value.toLowerCase().trim();

  if (!term) {
    // Reset - show all loaded doctors
    State.quickFilterActive = false;
    State.filteredDoctors = State.allDoctors;

    const grid = DOM.doctorsGrid;
    if (grid) grid.innerHTML = "";

    if (State.allDoctors.length === 0) {
      showEmpty();
    } else {
      renderDoctors(State.allDoctors, false);
    }

    updateLoadMoreUI();
    return;
  }

  // Filter currently loaded doctors
  State.quickFilterActive = true;

  const filtered = State.allDoctors.filter((doc) => {
    const searchString =
      `${doc.name} ${doc.specialty} ${doc.hospital} ${doc.city} ${doc.bio || ""}`.toLowerCase();
    return searchString.includes(term);
  });

  State.filteredDoctors = filtered;

  // Clear and re-render
  const grid = DOM.doctorsGrid;
  if (grid) grid.innerHTML = "";

  if (filtered.length === 0) {
    showEmpty();
    updateResultCount(0);
    DOM.loadMoreContainer?.classList.add("hidden");
  } else {
    DOM.emptyState?.classList.add("hidden");
    renderDoctors(filtered, false);
    updateResultCount(filtered.length, filtered.length);
    DOM.loadMoreContainer?.classList.add("hidden");
  }

  // Announce results
  announceToScreenReader(`Found ${filtered.length} matching doctors`);
}, 250);

/* =========================================================
   FILTER PANEL
   ========================================================= */

function toggleFiltersPanel() {
  const panel = DOM.filtersPanel;
  const toggle = DOM.filterToggle;

  if (!panel || !toggle) return;

  State.filtersOpen = !State.filtersOpen;

  panel.classList.toggle("hidden", !State.filtersOpen);
  toggle.setAttribute("aria-expanded", State.filtersOpen);

  if (State.filtersOpen) {
    // Focus first filter when opened
    DOM.filterSpecialty?.focus();
  }
}

function updateActiveFiltersCount() {
  const badge = DOM.activeFiltersCount;
  if (!badge) return;

  let count = 0;

  if (DOM.filterSpecialty?.value) count++;
  if (DOM.filterCity?.value) count++;
  if (DOM.filterGender?.value) count++;
  if (DOM.filterSort?.value && DOM.filterSort.value !== "rating") count++;
  if (DOM.filterExp?.value) count++;
  if (DOM.filterFee?.value) count++;

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function resetFilters() {
  // Reset all filter inputs
  if (DOM.filterSpecialty) DOM.filterSpecialty.value = "";
  if (DOM.filterCity) DOM.filterCity.value = "";
  if (DOM.filterGender) DOM.filterGender.value = "";
  if (DOM.filterSort) DOM.filterSort.value = "rating";
  if (DOM.filterExp) DOM.filterExp.value = "";
  if (DOM.filterFee) DOM.filterFee.value = "";
  if (DOM.heroSearch) DOM.heroSearch.value = "";
  if (DOM.quickFilter) DOM.quickFilter.value = "";

  // Reset state
  State.quickFilterActive = false;

  updateActiveFiltersCount();
  fetchDoctors();
}

/* =========================================================
   POPULATE DROPDOWNS & SPECIALTY CHIPS
   ========================================================= */

function populateSpecialties(specialties) {
  State.specialties = specialties;

  // Populate dropdown
  const select = DOM.filterSpecialty;
  if (select) {
    select.innerHTML = '<option value="">All Specialties</option>';

    specialties.forEach((spec) => {
      const option = document.createElement("option");
      option.value = spec;
      option.textContent = spec;
      select.appendChild(option);
    });
  }

  // Populate specialty chips
  const chipsContainer = DOM.specialtyChips;
  if (chipsContainer) {
    chipsContainer.innerHTML = "";

    const fragment = document.createDocumentFragment();

    specialties.forEach((spec) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "specialty-chip";
      chip.textContent = spec;
      chip.setAttribute("aria-label", `Filter by ${spec}`);

      chip.addEventListener("click", () => {
        // Set the specialty filter
        if (DOM.filterSpecialty) {
          DOM.filterSpecialty.value = spec;
        }

        // Clear hero search when using chip
        if (DOM.heroSearch) {
          DOM.heroSearch.value = "";
        }

        fetchDoctors();

        // Scroll to search section
        $("#search")?.scrollIntoView({ behavior: "smooth" });
      });

      fragment.appendChild(chip);
    });

    chipsContainer.appendChild(fragment);
  }
}

function populateCities(cities) {
  State.cities = cities;

  const select = DOM.filterCity;
  if (!select) return;

  select.innerHTML = '<option value="">All Cities</option>';

  cities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    select.appendChild(option);
  });
}

/* =========================================================
   MOBILE MENU
   ========================================================= */

function toggleMobileMenu() {
  const menu = DOM.mobileMenu;
  const hamburger = DOM.hamburger;

  if (!menu || !hamburger) return;

  const isOpen = !menu.classList.contains("hidden");

  menu.classList.toggle("hidden", isOpen);
  hamburger.setAttribute("aria-expanded", !isOpen);

  if (!isOpen) {
    // Focus first link when opened
    menu.querySelector("a")?.focus();
  }
}

function closeMobileMenu() {
  DOM.mobileMenu?.classList.add("hidden");
  DOM.hamburger?.setAttribute("aria-expanded", "false");
}

/* =========================================================
   SCROLL HANDLERS
   ========================================================= */

const handleScroll = throttle(() => {
  const scrollY = window.scrollY;

  // Scroll to top button visibility
  DOM.scrollTop?.classList.toggle("hidden", scrollY < 400);

  // Navbar scroll effect
  DOM.navbar?.classList.toggle("scrolled", scrollY > 50);
}, 100);

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

/* =========================================================
   HERO TAGS
   ========================================================= */

function setupHeroTags() {
  DOM.heroTags.forEach((tag) => {
    const searchTerm = tag.dataset.search;

    if (!searchTerm) return;

    tag.addEventListener("click", () => {
      // Set hero search value
      if (DOM.heroSearch) {
        DOM.heroSearch.value = searchTerm;
      }

      // Clear filters when using hero tags
      if (DOM.filterSpecialty) DOM.filterSpecialty.value = "";

      fetchDoctors();
      $("#search")?.scrollIntoView({ behavior: "smooth" });
    });

    // Keyboard support
    tag.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tag.click();
      }
    });
  });
}

/* =========================================================
   HERO SEARCH
   ========================================================= */

function handleHeroSearch() {
  // Trigger new search
  fetchDoctors();
  $("#search")?.scrollIntoView({ behavior: "smooth" });
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {
  // Only run on main page
  if (!DOM.doctorsGrid) return;

  try {
    // Fetch initial data in parallel
    const [specRes, cityRes, statsRes] = await Promise.all([
      api("/specialties"),
      api("/cities"),
      api("/stats"),
    ]);

    // Populate filters
    if (specRes.success) {
      populateSpecialties(specRes.data);
    }

    if (cityRes.success) {
      populateCities(cityRes.data);
    }

    // Animate stats
    if (statsRes.success) {
      const stats = statsRes.data;

      animateNumber(DOM.statDoctors, stats.total);
      animateNumber(DOM.statSpecs, stats.specs);
      animateNumber(DOM.statCities, stats.cities);
      animateNumber(DOM.statRating, stats.avgRating, 1);

      if (DOM.heroTotal) {
        DOM.heroTotal.textContent = `${stats.total}+`;
      }
    }

    // Setup event listeners
    setupEventListeners();

    // Setup hero tags
    setupHeroTags();

    // Initial fetch
    fetchDoctors();
  } catch (error) {
    console.error("Initialization error:", error);
    showError("Failed to load initial data. Please refresh the page.");
  }
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {
  // ===== Hero Search =====
  DOM.heroSearchBtn?.addEventListener("click", handleHeroSearch);

  DOM.heroSearch?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleHeroSearch();
    }
  });

  // ===== Quick Filter =====
  DOM.quickFilter?.addEventListener("input", handleQuickFilter);

  // Clear quick filter on escape
  DOM.quickFilter?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      DOM.quickFilter.value = "";
      handleQuickFilter();
    }
  });

  // ===== Filter Toggle =====
  DOM.filterToggle?.addEventListener("click", toggleFiltersPanel);
  DOM.filterToggle?.setAttribute("aria-expanded", "false");
  DOM.filterToggle?.setAttribute("aria-controls", "filtersPanel");

  // ===== Apply Filters =====
  DOM.applyFilters?.addEventListener("click", () => {
    fetchDoctors();

    // Close panel on mobile
    if (window.innerWidth < 768) {
      State.filtersOpen = false;
      DOM.filtersPanel?.classList.add("hidden");
      DOM.filterToggle?.setAttribute("aria-expanded", "false");
    }
  });

  // ===== Reset Filters =====
  DOM.resetFilters?.addEventListener("click", resetFilters);
  DOM.emptyReset?.addEventListener("click", resetFilters);

  // ===== Load More =====
  DOM.loadMoreBtn?.addEventListener("click", loadMoreDoctors);

  // ===== Mobile Menu =====
  DOM.hamburger?.addEventListener("click", toggleMobileMenu);

  // Close mobile menu when clicking outside
  document.addEventListener("click", (e) => {
    const menu = DOM.mobileMenu;
    const hamburger = DOM.hamburger;

    if (
      menu &&
      hamburger &&
      !menu.contains(e.target) &&
      !hamburger.contains(e.target) &&
      !menu.classList.contains("hidden")
    ) {
      closeMobileMenu();
    }
  });

  // ===== Keyboard Shortcuts =====
  document.addEventListener("keydown", (e) => {
    // Escape to close panels
    if (e.key === "Escape") {
      closeMobileMenu();

      if (State.filtersOpen) {
        State.filtersOpen = false;
        DOM.filtersPanel?.classList.add("hidden");
        DOM.filterToggle?.setAttribute("aria-expanded", "false");
      }
    }

    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      DOM.heroSearch?.focus();
    }
  });

  // Close mobile menu when clicking links
  DOM.mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  // ===== Scroll Handlers =====
  window.addEventListener("scroll", handleScroll, { passive: true });
  DOM.scrollTop?.addEventListener("click", scrollToTop);

  // ===== Filter Change Listeners =====
  const filterElements = [
    DOM.filterSpecialty,
    DOM.filterCity,
    DOM.filterGender,
    DOM.filterSort,
    DOM.filterExp,
    DOM.filterFee,
  ].filter(Boolean);

  filterElements.forEach((el) => {
    el.addEventListener("change", updateActiveFiltersCount);
    el.addEventListener("input", updateActiveFiltersCount);
  });
}

/* =========================================================
   START APPLICATION
   ========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* =========================================================
   EXPORTS (for testing/debugging)
   ========================================================= */

window.DocSearch = {
  fetchDoctors,
  loadMoreDoctors,
  resetFilters,
  State,
  DOM,
};
