/* =========================================================
   DocSearch - Main Application
   Fixed: XSS, accessibility, events, performance
   With Load More Pagination
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
  get navbar() {
    return $("#navbar");
  },
  get hamburger() {
    return $("#hamburger");
  },
  get mobileMenu() {
    return $("#mobileMenu");
  },
  get heroSearch() {
    return $("#heroSearch");
  },
  get heroSearchBtn() {
    return $("#heroSearchBtn");
  },
  get heroTags() {
    return $$(".hero-tag");
  },
  get liveSearch() {
    return $("#liveSearch");
  },
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
  get specialtyChips() {
    return $("#specialtyChips");
  },
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
  // Load More elements
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
};

/* =========================================================
   STATE
   ========================================================= */

const State = {
  // All doctors from current search
  allDoctors: [],
  // Currently displayed doctors (after live filter)
  filteredDoctors: [],
  // Loading state
  isLoading: false,
  isLoadingMore: false,
  // Current request (for cancellation)
  currentRequest: null,
  // Filters panel state
  filtersOpen: false,
  // Dropdown data
  specialties: [],
  cities: [],

  // Pagination
  pagination: {
    currentPage: 1,
    pageSize: 12, // Show 12 doctors per page
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

  // Hero search
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
   FETCH DOCTORS (Initial Load)
   ========================================================= */

async function fetchDoctors() {
  if (!DOM.doctorsGrid) return;

  // Cancel any pending request
  if (State.currentRequest) {
    State.currentRequest.cancelled = true;
  }

  const requestId = { cancelled: false };
  State.currentRequest = requestId;

  // Reset pagination
  State.pagination.currentPage = 1;
  State.allDoctors = [];

  setLoading(true, true);
  updateActiveFiltersCount();

  const params = buildSearchParams(1);

  try {
    const response = await api(`/doctors?${params}`);

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
    // Show error toast or message
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

  if (!container) return;

  const loaded = State.allDoctors.length;
  const total = State.pagination.totalDoctors;

  // Update counters
  if (loadedCount) loadedCount.textContent = loaded;
  if (totalCount) totalCount.textContent = total;

  // Show/hide load more button
  if (State.pagination.hasMore && loaded < total) {
    container.classList.remove("hidden");
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

  // If not appending, check for empty state
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
  const totalDisplayed = append ? State.allDoctors.length : doctors.length;
  updateResultCount(totalDisplayed, State.pagination.totalDoctors);

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
   LIVE SEARCH (Client-side filtering)
   ========================================================= */

const handleLiveSearch = debounce(() => {
  const term = DOM.liveSearch?.value.toLowerCase().trim();

  if (!term) {
    // Reset to show all loaded doctors
    renderDoctors(State.allDoctors, false);
    updateLoadMoreUI();
    return;
  }

  const filtered = State.allDoctors.filter((doc) => {
    const searchString =
      `${doc.name} ${doc.specialty} ${doc.hospital} ${doc.city} ${doc.bio || ""}`.toLowerCase();
    return searchString.includes(term);
  });

  State.filteredDoctors = filtered;

  // Render filtered results (hide load more when filtering)
  const grid = DOM.doctorsGrid;
  if (grid) grid.innerHTML = "";

  if (filtered.length === 0) {
    showEmpty();
    updateResultCount(0);
  } else {
    DOM.emptyState?.classList.add("hidden");
    renderDoctors(filtered, false);
    updateResultCount(filtered.length, filtered.length);
  }

  // Hide load more when using live search
  DOM.loadMoreContainer?.classList.add("hidden");
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
  if (DOM.filterSpecialty) DOM.filterSpecialty.value = "";
  if (DOM.filterCity) DOM.filterCity.value = "";
  if (DOM.filterGender) DOM.filterGender.value = "";
  if (DOM.filterSort) DOM.filterSort.value = "rating";
  if (DOM.filterExp) DOM.filterExp.value = "";
  if (DOM.filterFee) DOM.filterFee.value = "";
  if (DOM.heroSearch) DOM.heroSearch.value = "";
  if (DOM.liveSearch) DOM.liveSearch.value = "";

  updateActiveFiltersCount();
  fetchDoctors();
}

/* =========================================================
   POPULATE DROPDOWNS & SPECIALTY CHIPS
   ========================================================= */

function populateSpecialties(specialties) {
  State.specialties = specialties;

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
        if (DOM.filterSpecialty) {
          DOM.filterSpecialty.value = spec;
        }
        fetchDoctors();
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

  DOM.scrollTop?.classList.toggle("hidden", scrollY < 400);
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
      if (DOM.heroSearch) {
        DOM.heroSearch.value = searchTerm;
      }
      fetchDoctors();
      $("#search")?.scrollIntoView({ behavior: "smooth" });
    });

    tag.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tag.click();
      }
    });

    tag.setAttribute("tabindex", "0");
    tag.setAttribute("role", "button");
  });
}

/* =========================================================
   HERO SEARCH
   ========================================================= */

function handleHeroSearch() {
  fetchDoctors();
  $("#search")?.scrollIntoView({ behavior: "smooth" });
}

/* =========================================================
   INFINITE SCROLL (Optional Alternative)
   ========================================================= */

function setupInfiniteScroll() {
  // Optional: Uncomment to enable infinite scroll instead of button
  /*
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && State.pagination.hasMore && !State.isLoadingMore) {
          loadMoreDoctors();
        }
      });
    },
    { rootMargin: "200px" }
  );

  const loadMoreContainer = DOM.loadMoreContainer;
  if (loadMoreContainer) {
    observer.observe(loadMoreContainer);
  }
  */
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {
  if (!DOM.doctorsGrid) return;

  try {
    const [specRes, cityRes, statsRes] = await Promise.all([
      api("/specialties"),
      api("/cities"),
      api("/stats"),
    ]);

    if (specRes.success) {
      populateSpecialties(specRes.data);
    }

    if (cityRes.success) {
      populateCities(cityRes.data);
    }

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

    setupEventListeners();
    setupHeroTags();
    // setupInfiniteScroll(); // Uncomment for infinite scroll

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
  // Hero search
  DOM.heroSearchBtn?.addEventListener("click", handleHeroSearch);

  DOM.heroSearch?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleHeroSearch();
    }
  });

  // Filter toggle
  DOM.filterToggle?.addEventListener("click", toggleFiltersPanel);
  DOM.filterToggle?.setAttribute("aria-expanded", "false");
  DOM.filterToggle?.setAttribute("aria-controls", "filtersPanel");

  // Apply filters
  DOM.applyFilters?.addEventListener("click", () => {
    fetchDoctors();

    if (window.innerWidth < 768) {
      State.filtersOpen = false;
      DOM.filtersPanel?.classList.add("hidden");
    }
  });

  // Reset filters
  DOM.resetFilters?.addEventListener("click", resetFilters);
  DOM.emptyReset?.addEventListener("click", resetFilters);

  // Live search
  DOM.liveSearch?.addEventListener("input", handleLiveSearch);

  // Clear live search when losing focus with empty value
  DOM.liveSearch?.addEventListener("blur", () => {
    if (!DOM.liveSearch.value.trim()) {
      renderDoctors(State.allDoctors, false);
      updateLoadMoreUI();
    }
  });

  // Load More button
  DOM.loadMoreBtn?.addEventListener("click", loadMoreDoctors);

  // Mobile menu
  DOM.hamburger?.addEventListener("click", toggleMobileMenu);

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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMobileMenu();

      if (State.filtersOpen) {
        toggleFiltersPanel();
      }
    }
  });

  DOM.mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  // Scroll handlers
  window.addEventListener("scroll", handleScroll, { passive: true });
  DOM.scrollTop?.addEventListener("click", scrollToTop);

  // Filter change listeners
  [
    DOM.filterSpecialty,
    DOM.filterCity,
    DOM.filterGender,
    DOM.filterSort,
    DOM.filterExp,
    DOM.filterFee,
  ]
    .filter(Boolean)
    .forEach((el) => {
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
   EXPORTS (for testing)
   ========================================================= */

window.DocSearch = {
  fetchDoctors,
  loadMoreDoctors,
  resetFilters,
  State,
};
