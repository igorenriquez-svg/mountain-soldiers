const API_URL_JOINABLE_DEPARTURES =
  "https://primary-production-beb9e.up.railway.app/webhook/ms-joinable-departures";

const API_URL_ROUTES_CATALOG =
  "https://primary-production-beb9e.up.railway.app/webhook/ms-routes-catalog";

const API_URL_CHECK_AVAILABILITY =
  "https://primary-production-beb9e.up.railway.app/webhook/ms-check-availability";

const API_URL_CREATE_HOLD =
  "https://primary-production-beb9e.up.railway.app/webhook/cab4e11c-ee19-498e-b998-91a51040edcd";

const API_URL_CREATE_CHECKOUT =
  "https://primary-production-beb9e.up.railway.app/webhook/create-checkout-session";

const CONSENT_TEXT_VERSION = "v1";
const IP_LOOKUP_URL = "https://api.ipify.org?format=json";

let availabilityData = null;
let holdData = null;
let checkoutData = null;
let clientIpAddress = "";

const form = document.getElementById("booking-form");
const resultBox = document.getElementById("result-box");
const debugBox = document.getElementById("debug-box");
const checkBtn = document.getElementById("check-btn");

const phoneCountrySelect = document.getElementById("phone_country");
const phoneLocalInput = document.getElementById("customer_phone_local");
const phoneHiddenInput = document.getElementById("customer_phone");

const privacyConsentInput = document.getElementById("privacy_consent");
const marketingConsentInput = document.getElementById("marketing_consent");

const selectedDepartureCard = document.getElementById("selected-departure-card");
const departureIdInput = document.getElementById("departure_id");
const routeSlugInput = document.getElementById("route_slug");
const activityTypeValueInput = document.getElementById("activity_type_value");
const dateValueInput = document.getElementById("date_value");
const startTimeValueInput = document.getElementById("start_time_value");
const routeNameValueInput = document.getElementById("route_name_value");

const activityInput = document.getElementById("activity_type");
const dateDisplayInput = document.getElementById("date_display");
const startTimeDisplayInput = document.getElementById("start_time_display");

const showcaseGrid = document.getElementById("showcase-grid");
const showcaseLoading = document.getElementById("showcase-loading");
const showcaseEmpty = document.getElementById("showcase-empty");

const manualActivityField = document.getElementById("field-activity-manual");
const manualRouteField = document.getElementById("field-route-manual");
const manualDateField = document.getElementById("field-date-manual");

const readonlyActivityField = document.getElementById("field-activity-readonly");
const readonlyDateField = document.getElementById("field-date-readonly");
const readonlyTimeField = document.getElementById("field-time-readonly");

const manualActivitySelect = document.getElementById("manual_activity_type");
const manualRouteSelect = document.getElementById("manual_route_slug");
const manualDateInput = document.getElementById("manual_date");

const ACTIVITY_LABELS = {
  via_ferrata: "Vía ferrata",
  barranquismo: "Barranquismo",
  raquetas_nieve: "Raquetas de nieve",
};

const ACTIVITY_IMAGES = {
  via_ferrata:
    "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1400&q=80",
  barranquismo:
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
  raquetas_nieve:
    "https://images.unsplash.com/photo-1517821099601-1a7f0d0e6833?auto=format&fit=crop&w=1400&q=80",
  default:
    "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1400&q=80",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatActivityLabel(activityType) {
  return ACTIVITY_LABELS[activityType] || activityType || "";
}

function normalizeActivityValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function formatApiDate(dateString) {
  if (!dateString) return "-";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

function formatPrice(amount, currency = "EUR") {
  if (amount === null || typeof amount === "undefined" || amount === "") {
    return "Precio a consultar";
  }

  const number = Number(amount);

  if (Number.isNaN(number)) {
    return `${amount} ${currency}`;
  }

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${number} ${currency}`;
  }
}

function renderDebug(title, payload) {
  if (!debugBox) return;
  debugBox.textContent = `${title}\n\n${JSON.stringify(payload, null, 2)}`;
}

function renderError(message, data = null) {
  if (!resultBox) return;

  resultBox.className = "result-box error";
  resultBox.innerHTML = `
    <div class="result-pill result-pill-error">No disponible</div>
    <h3 class="result-title">No hemos podido continuar con tu reserva</h3>
    <p class="result-copy">${escapeHtml(message)}</p>
    <p class="helper-text">Prueba de nuevo o vuelve al escaparate de salidas.</p>
  `;

  if (data) {
    renderDebug("ERROR RESPONSE", data);
  }

  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeApiResponse(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }
  return data;
}

function normalizeHoldResponse(data) {
  return normalizeApiResponse(data);
}

function normalizeCheckoutResponse(data) {
  return normalizeApiResponse(data);
}

async function safeJson(response, endpointName) {
  try {
    return await response.json();
  } catch {
    throw new Error(`El endpoint de ${endpointName} no devolvió JSON válido.`);
  }
}

async function getJoinableDepartures() {
  const response = await fetch(API_URL_JOINABLE_DEPARTURES, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await safeJson(response, "salidas disponibles");

  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }

  const departuresArray = Array.isArray(data)
    ? data
    : Array.isArray(data?.departures)
      ? data.departures
      : [];

  if (!Array.isArray(departuresArray)) {
    throw new Error("El endpoint de salidas disponibles no tiene un formato válido.");
  }

  return departuresArray;
}

async function getRoutesCatalog() {
  const response = await fetch(API_URL_ROUTES_CATALOG, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await safeJson(response, "catálogo de rutas");

  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }

  let routesArray = [];

  if (Array.isArray(data)) {
    routesArray = data;
  } else if (Array.isArray(data?.routes)) {
    routesArray = data.routes;
  } else if (Array.isArray(data?.items)) {
    routesArray = data.items;
  } else {
    throw new Error("El catálogo de rutas no tiene un formato válido.");
  }

  renderDebug("ROUTES CATALOG RESPONSE", data);

  return routesArray;
}

function routeIsActive(route) {
  const raw = route?.active;

  if (raw === true) return true;
  if (raw === false) return false;
  if (raw === null || typeof raw === "undefined" || raw === "") return true;

  const normalized = String(raw).trim().toLowerCase();
  return ["true", "1", "yes", "si", "sí"].includes(normalized);
}

function renderManualRoutes(routes, selectedActivity = "") {
  if (!manualRouteSelect) return;

  manualRouteSelect.innerHTML = `<option value="">Selecciona una ruta</option>`;

  const normalizedSelectedActivity = normalizeActivityValue(selectedActivity);

  const filteredRoutes = routes
    .filter(route => routeIsActive(route))
    .filter(route => {
      if (!normalizedSelectedActivity) return true;

      const routeActivity = normalizeActivityValue(route?.activity_type || "");
      return routeActivity === normalizedSelectedActivity;
    })
    .filter(route => {
      return String(route?.route_slug || "").trim() && String(route?.route_name || "").trim();
    })
    .sort((a, b) =>
      String(a?.route_name || "").localeCompare(String(b?.route_name || ""), "es")
    );

  filteredRoutes.forEach(route => {
    const option = document.createElement("option");
    option.value = String(route.route_slug || "").trim();
    option.textContent = String(route.route_name || "").trim();
    option.dataset.activity = normalizeActivityValue(route.activity_type || "");
    manualRouteSelect.appendChild(option);
  });

  if (filteredRoutes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = normalizedSelectedActivity
      ? "No hay rutas disponibles para esta actividad"
      : "No hay rutas disponibles";
    manualRouteSelect.appendChild(option);
  }
}

function enableManualMode() {
  readonlyActivityField?.classList.add("is-hidden");
  readonlyDateField?.classList.add("is-hidden");
  readonlyTimeField?.classList.add("is-hidden");

  manualActivityField?.classList.remove("is-hidden");
  manualRouteField?.classList.remove("is-hidden");
  manualDateField?.classList.remove("is-hidden");

  if (selectedDepartureCard) {
    selectedDepartureCard.innerHTML = `
      <div class="result-pill">Reserva manual</div>
      <h3 class="result-title">Programa tu propia salida</h3>
      <p class="result-copy">
        Elige actividad, ruta y fecha. Revisaremos la disponibilidad real y, si hay plaza, podrás continuar con tu reserva.
      </p>
    `;
  }

  if (checkBtn) {
    checkBtn.disabled = false;
  }
}

async function checkAvailability(payload) {
  const response = await fetch(API_URL_CHECK_AVAILABILITY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(response, "disponibilidad");

  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }

  return normalizeApiResponse(data);
}

async function createHold(payload) {
  const response = await fetch(API_URL_CREATE_HOLD, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawData = await safeJson(response, "create hold");

  if (!response.ok) {
    throw new Error(rawData?.message || `HTTP ${response.status}`);
  }

  return {
    raw: rawData,
    normalized: normalizeHoldResponse(rawData),
  };
}

async function createCheckoutSession(payload) {
  const response = await fetch(API_URL_CREATE_CHECKOUT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawData = await safeJson(response, "checkout");

  if (!response.ok) {
    throw new Error(rawData?.message || `HTTP ${response.status}`);
  }

  return {
    raw: rawData,
    normalized: normalizeCheckoutResponse(rawData),
  };
}

async function getClientIpAddress() {
  if (clientIpAddress) return clientIpAddress;

  try {
    const response = await fetch(IP_LOOKUP_URL, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    clientIpAddress = String(data?.ip || "").trim();
    return clientIpAddress;
  } catch {
    return "";
  }
}

function normalizeLocalPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getNormalizedPhoneNumber() {
  const countryCode = String(phoneCountrySelect?.value || "").replace(/\D/g, "");
  let localNumber = normalizeLocalPhoneDigits(phoneLocalInput?.value || "");

  if (!countryCode) {
    throw new Error("Selecciona un prefijo de teléfono válido.");
  }

  if (!localNumber) {
    throw new Error("Introduce un teléfono válido.");
  }

  while (localNumber.startsWith("0")) {
    localNumber = localNumber.slice(1);
  }

  const fullNumber = `${countryCode}${localNumber}`;

  if (!/^\d+$/.test(fullNumber)) {
    throw new Error("Introduce un teléfono válido.");
  }

  if (fullNumber.length < 9 || fullNumber.length > 15) {
    throw new Error("Introduce un teléfono válido.");
  }

  phoneHiddenInput.value = fullNumber;
  return fullNumber;
}

function validateFormBeforeSubmit({
  route_slug,
  activity_type,
  date,
  pax,
  customer_name,
  customer_phone,
  customer_email,
  language,
}) {
  if (!route_slug || !activity_type || !date || !pax) {
    throw new Error("Faltan datos de la salida seleccionada.");
  }

  if (!customer_name) {
    throw new Error("Introduce tu nombre completo.");
  }

  if (!customer_phone) {
    throw new Error("Introduce un teléfono válido.");
  }

  if (!customer_email) {
    throw new Error("Introduce tu email.");
  }

  if (!language) {
    throw new Error("Selecciona un idioma.");
  }

  if (!privacyConsentInput?.checked) {
    throw new Error("Debes aceptar la política de privacidad para continuar.");
  }
}

function buildCustomerActivityHistory({
  reservationId = "",
  departureId = "",
  routeSlug = "",
  activityType = "",
  bookingDate = "",
  amountTotal = 0,
  eventType = "hold_created",
}) {
  const history = [
    {
      type: eventType,
      reservation_id: reservationId,
      departure_id: departureId,
      route_slug: routeSlug,
      activity_type: activityType,
      date: bookingDate,
      amount_total: Number(amountTotal || 0),
      created_at: new Date().toISOString(),
    },
  ];

  return JSON.stringify(history);
}

function getActivityImage(activityType, routeSlug, imageUrl) {
  if (imageUrl && String(imageUrl).trim()) {
    return String(imageUrl).trim();
  }

  return ACTIVITY_IMAGES[activityType] || ACTIVITY_IMAGES.default;
}

function getCommercialCopy(activityType, difficulty = "") {
  const normalizedDifficulty = String(difficulty || "").trim().toLowerCase();

  if (activityType === "via_ferrata") {
    if (normalizedDifficulty.includes("alta") || normalizedDifficulty.includes("dificil")) {
      return "Vertical, intensa y con vistas brutales. Una salida pensada para quienes quieren montaña con carácter.";
    }
    return "Roca, altura y una progresión espectacular. Ideal para vivir una aventura potente con sensación de logro real.";
  }

  if (activityType === "barranquismo") {
    if (normalizedDifficulty.includes("alta") || normalizedDifficulty.includes("dificil")) {
      return "Agua, roca y adrenalina de verdad. Una experiencia salvaje para quienes buscan una aventura más intensa.";
    }
    return "Saltos, agua y montaña en estado puro. Perfecta para disfrutar una aventura divertida, dinámica y memorable.";
  }

  if (activityType === "raquetas_nieve") {
    return "Paisaje invernal, aire puro y una experiencia distinta en la montaña. Ideal para descubrir el entorno con calma y épica.";
  }

  return "Una aventura guiada en un entorno espectacular, pensada para disfrutar la montaña con seguridad y emoción.";
}

function getCommercialBadge(departure) {
  const activityType = String(departure.activity_type || "").trim();
  const difficulty = String(departure.difficulty || "").trim().toLowerCase();
  const paxConfirmed = Number(departure.pax_confirmed || 0);

  if (paxConfirmed >= 5) {
    return "Más vendida";
  }

  if (difficulty.includes("alta") || difficulty.includes("dificil")) {
    return "Nivel alto";
  }

  if (difficulty.includes("baja") || difficulty.includes("fácil") || difficulty.includes("facil")) {
    return "Ideal para iniciarse";
  }

  if (activityType === "raquetas_nieve") {
    return "Experiencia única";
  }

  return "Plazas muy limitadas";
}

function getStatusBadgeText(departure) {
  const paxConfirmed = Number(departure.pax_confirmed || 0);

  if (paxConfirmed >= 5) {
    return "Grupo en marcha";
  }

  if (paxConfirmed >= 2) {
    return "Salida activa";
  }

  return "Salida abierta";
}

function buildReservationUrl(departure) {
  const params = new URLSearchParams({
    departure_id: String(departure.departure_id || ""),
    route_slug: String(departure.route_slug || ""),
    route_name: String(departure.route_name || ""),
    activity_type: String(departure.activity_type || ""),
    date: String(departure.date || ""),
    start_time: String(departure.start_time || ""),
    guide_name: String(departure.guide_name || ""),
    location: String(departure.location || ""),
    difficulty: String(departure.difficulty || ""),
    price_1_4: String(departure.price_1_4 || ""),
  });

  return `reserva.html?${params.toString()}`;
}

function renderShowcaseCard(departure) {
  const card = document.createElement("article");
  card.className = "showcase-card";
  card.style.backgroundImage = `url("${getActivityImage(
    departure.activity_type,
    departure.route_slug,
    departure.image_url
  )}")`;

  const priceText = formatPrice(departure.price_1_4, "EUR");
  const activityLabel = formatActivityLabel(departure.activity_type);
  const commercialCopy = getCommercialCopy(departure.activity_type, departure.difficulty);
  const commercialBadge = getCommercialBadge(departure);
  const statusBadge = getStatusBadgeText(departure);

  card.innerHTML = `
    <div class="showcase-card-inner">
      <div class="showcase-topbar">
        <span class="departure-badge">${escapeHtml(activityLabel)}</span>
        <span class="departure-badge-secondary">${escapeHtml(commercialBadge)}</span>
        <span class="departure-status">${escapeHtml(statusBadge)}</span>
      </div>

      <div class="showcase-copy-block">
        <h3 class="departure-title">${escapeHtml(departure.route_name || "Salida disponible")}</h3>
        <p class="departure-copy">${escapeHtml(commercialCopy)}</p>
      </div>

      <div class="showcase-meta">
        <span class="showcase-meta-tag">${escapeHtml(formatApiDate(departure.date))}</span>
        <span class="showcase-meta-tag">${escapeHtml(departure.start_time || "10:00")}</span>
        <span class="showcase-meta-tag">Plazas limitadas</span>
      </div>

      <div class="showcase-facts">
        <div class="showcase-fact">
          <span class="showcase-fact-label">Ubicación</span>
          <span class="showcase-fact-value">${escapeHtml(departure.location || "A consultar")}</span>
        </div>
        <div class="showcase-fact">
          <span class="showcase-fact-label">Dificultad</span>
          <span class="showcase-fact-value">${escapeHtml(departure.difficulty || "A consultar")}</span>
        </div>
        <div class="showcase-fact">
          <span class="showcase-fact-label">Guía</span>
          <span class="showcase-fact-value">${escapeHtml(departure.guide_name || "Equipo Mountain Soldiers")}</span>
        </div>
        <div class="showcase-fact">
          <span class="showcase-fact-label">Precio desde</span>
          <span class="showcase-fact-value">${escapeHtml(priceText)}</span>
        </div>
      </div>

      <div class="departure-actions">
        <a href="${buildReservationUrl(departure)}" class="departure-button">Unirme a esta salida</a>
      </div>
    </div>
  `;

  return card;
}

async function initShowcasePage() {
  if (!showcaseGrid) return;

  try {
    const departures = await getJoinableDepartures();

    if (showcaseLoading) {
      showcaseLoading.classList.add("is-hidden");
    }

    if (!departures.length) {
      showcaseEmpty?.classList.remove("is-hidden");
      return;
    }

    showcaseGrid.innerHTML = "";
    departures.forEach((departure) => {
      showcaseGrid.appendChild(renderShowcaseCard(departure));
    });

    showcaseGrid.classList.remove("is-hidden");
  } catch (error) {
    console.error("SHOWCASE ERROR:", error);

    if (showcaseLoading) {
      showcaseLoading.classList.add("is-hidden");
    }

    if (showcaseEmpty) {
      showcaseEmpty.classList.remove("is-hidden");
      showcaseEmpty.innerHTML = `
        <div class="result-pill result-pill-error">Error</div>
        <h3 class="result-title">No hemos podido cargar las salidas disponibles</h3>
        <p class="result-copy">${escapeHtml(error.message)}</p>
        <div class="result-actions">
          <a href="index.html" class="link-button">Reintentar</a>
        </div>
      `;
    }
  }
}

function getDepartureParams() {
  const params = new URLSearchParams(window.location.search);

  return {
    departure_id: params.get("departure_id") || "",
    route_slug: params.get("route_slug") || "",
    route_name: params.get("route_name") || "",
    activity_type: params.get("activity_type") || "",
    date: params.get("date") || "",
    start_time: params.get("start_time") || "",
    guide_name: params.get("guide_name") || "",
    location: params.get("location") || "",
    difficulty: params.get("difficulty") || "",
    price_1_4: params.get("price_1_4") || "",
  };
}

function applyDepartureToReservationPage(departure) {
  if (!selectedDepartureCard) return;

  const hasSelection =
    departure.route_slug && departure.activity_type && departure.date;

  if (!hasSelection) {
    if (checkBtn) checkBtn.disabled = true;
    return;
  }

  departureIdInput.value = departure.departure_id || "";
  routeSlugInput.value = departure.route_slug || "";
  routeNameValueInput.value = departure.route_name || "";
  activityTypeValueInput.value = departure.activity_type || "";
  dateValueInput.value = departure.date || "";
  startTimeValueInput.value = departure.start_time || "";

  activityInput.value = formatActivityLabel(departure.activity_type);
  dateDisplayInput.value = formatApiDate(departure.date);
  startTimeDisplayInput.value = departure.start_time || "";

  const priceText = formatPrice(departure.price_1_4, "EUR");

  selectedDepartureCard.innerHTML = `
    <div class="showcase-topbar">
      <span class="departure-badge">${escapeHtml(formatActivityLabel(departure.activity_type))}</span>
      <span class="departure-badge-secondary">${escapeHtml(getCommercialBadge(departure))}</span>
      <span class="departure-status">${escapeHtml(getStatusBadgeText(departure))}</span>
    </div>

    <h3 class="result-title">${escapeHtml(departure.route_name || "Salida seleccionada")}</h3>
    <p class="result-copy">
      ${escapeHtml(getCommercialCopy(departure.activity_type, departure.difficulty))}
    </p>

    <div class="selected-summary-grid">
      <div class="selected-summary-item">
        <span class="selected-summary-label">Fecha</span>
        <span class="selected-summary-value">${escapeHtml(formatApiDate(departure.date))}</span>
      </div>
      <div class="selected-summary-item">
        <span class="selected-summary-label">Hora</span>
        <span class="selected-summary-value">${escapeHtml(departure.start_time || "10:00")}</span>
      </div>
      <div class="selected-summary-item">
        <span class="selected-summary-label">Ubicación</span>
        <span class="selected-summary-value">${escapeHtml(departure.location || "A consultar")}</span>
      </div>
      <div class="selected-summary-item">
        <span class="selected-summary-label">Dificultad</span>
        <span class="selected-summary-value">${escapeHtml(departure.difficulty || "A consultar")}</span>
      </div>
      <div class="selected-summary-item">
        <span class="selected-summary-label">Guía</span>
        <span class="selected-summary-value">${escapeHtml(departure.guide_name || "Equipo Mountain Soldiers")}</span>
      </div>
      <div class="selected-summary-item">
        <span class="selected-summary-label">Precio desde</span>
        <span class="selected-summary-value">${escapeHtml(priceText)}</span>
      </div>
    </div>
  `;

  if (checkBtn) {
    checkBtn.disabled = false;
  }
}

function renderAvailabilityResult(data) {
  const status = String(data?.status || "").trim();

  if (!data || typeof data !== "object") {
    renderError("La respuesta no tiene un formato válido.", data);
    return;
  }

  if (data.ok !== true) {
    resultBox.className = "result-box error";
    resultBox.innerHTML = `
      <div class="result-pill result-pill-error">Sin plazas</div>
      <h3 class="result-title">Ahora mismo no podemos confirmar esta salida</h3>
      <p class="result-copy">${escapeHtml(data.message || "La solicitud no es válida o no hay disponibilidad.")}</p>
      <p class="helper-text">Prueba con otra salida desde el escaparate o elige otra fecha.</p>
    `;
    renderDebug("CHECK AVAILABILITY RESPONSE", data);
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  let boxClass = "result-box success";
  let pill = "Plazas disponibles";
  let title = "Tu salida está disponible";
  let ctaText = "Bloquear mi plaza ahora";

  if (status === "manual_review") {
    boxClass = "result-box warning";
    pill = "Revisión manual";
    title = "Necesitamos revisar tu solicitud";
  }

  const pricePreview = data.price_preview || {};
  const totalPrice = formatPrice(
    pricePreview.total_price,
    pricePreview.currency || "EUR"
  );

  const routeName = routeNameValueInput?.value || data.route_name || data.route_slug || "-";
  const guideName = data.guide_name || "Equipo Mountain Soldiers";

  let actionButton = "";

  if (status === "create_new" || status === "join_existing") {
    actionButton = `
      <div class="result-actions">
        <button id="hold-btn" type="button" class="cta-strong">${escapeHtml(ctaText)}</button>
      </div>
      <p class="helper-text">
        Reservaremos temporalmente tu plaza para que puedas pasar al pago con tranquilidad.
      </p>
    `;
  }

  if (status === "manual_review") {
    actionButton = `
      <p class="helper-text">
        Tu solicitud requiere validación manual. El equipo revisará la operativa antes de confirmar.
      </p>
    `;
  }

  resultBox.className = boxClass;
  resultBox.innerHTML = `
    <div class="result-pill ${status === "manual_review" ? "result-pill-warning" : "result-pill-success"}">${escapeHtml(pill)}</div>
    <h3 class="result-title">${escapeHtml(title)}</h3>
    <p class="result-copy">
      ${status === "manual_review"
        ? "Hemos recibido tus datos. Antes de confirmar, el equipo revisará la salida para ofrecerte la mejor opción."
        : "Ya puedes continuar con la reserva y asegurar tu salida antes de que se agoten las plazas."}
    </p>

    <ul class="result-list">
      <li><strong>Aventura:</strong> ${escapeHtml(routeName)}</li>
      <li><strong>Fecha:</strong> ${escapeHtml(formatApiDate(data.date || dateValueInput?.value || "-"))}</li>
      <li><strong>Hora de salida:</strong> ${escapeHtml(data.start_time || startTimeValueInput?.value || "-")}</li>
      <li><strong>Guía asignado:</strong> ${escapeHtml(guideName)}</li>
      <li><strong>Precio total:</strong> ${escapeHtml(totalPrice)}</li>
    </ul>

    ${actionButton}
  `;

  renderDebug("CHECK AVAILABILITY RESPONSE", data);
  attachHoldButtonHandler();
  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHoldResult(data) {
  resultBox.className = "result-box success";

  resultBox.innerHTML = `
    <div class="result-pill result-pill-success">Plaza bloqueada</div>
    <h3 class="result-title">Tu plaza está reservada temporalmente</h3>
    <p class="result-copy">
      Ya hemos bloqueado tu reserva durante unos minutos. Da el último paso y confirma ahora tu aventura.
    </p>

    <ul class="result-list">
      <li><strong>Referencia de reserva:</strong> ${escapeHtml(data.reservation_id || "-")}</li>
      <li><strong>ID de hold:</strong> ${escapeHtml(data.hold_id || "-")}</li>
      <li><strong>Expira:</strong> ${escapeHtml(data.expires_at || "-")}</li>
    </ul>

    <div class="result-actions">
      <button id="checkout-btn" type="button" class="cta-strong">Ir al pago seguro</button>
    </div>

    <p class="helper-text">
      Te redirigiremos a Stripe para completar el pago de forma segura.
    </p>
  `;

  attachCheckoutButtonHandler();
}

function renderCheckoutResult(data) {
  resultBox.className = "result-box success";

  resultBox.innerHTML = `
    <div class="result-pill result-pill-success">Pago seguro</div>
    <h3 class="result-title">Todo listo, te llevamos al checkout</h3>
    <p class="result-copy">
      En unos segundos serás redirigido a la pasarela de pago para confirmar tu reserva.
    </p>

    <ul class="result-list">
      <li><strong>Referencia:</strong> ${escapeHtml(data.reservation_id || "-")}</li>
      <li><strong>Importe:</strong> ${escapeHtml(formatPrice(data.amount_total, data.currency || "EUR"))}</li>
      <li><strong>Estado:</strong> ${escapeHtml(data.payment_status || "-")}</li>
    </ul>

    <p class="helper-text">Redirigiendo a Stripe...</p>
  `;
}

function attachHoldButtonHandler() {
  const holdBtn = document.getElementById("hold-btn");
  if (!holdBtn) return;

  holdBtn.addEventListener("click", async () => {
    try {
      if (!availabilityData) {
        renderError("No hay disponibilidad cargada para crear el hold.");
        return;
      }

      holdBtn.disabled = true;
      holdBtn.textContent = "Bloqueando plaza...";

      const customer_phone = getNormalizedPhoneNumber();
      const gdprConsentDate = privacyConsentInput?.checked ? new Date().toISOString() : "";
      const marketingConsentDate = marketingConsentInput?.checked ? new Date().toISOString() : "";
      const ipAddress = await getClientIpAddress();
      const userAgent = navigator.userAgent || "";

      const payload = {
        departure_id: departureIdInput?.value || "",
        status: availabilityData.status,
        route_slug: availabilityData.route_slug || routeSlugInput?.value || "",
        date: availabilityData.date || dateValueInput?.value || "",
        start_time: availabilityData.start_time || startTimeValueInput?.value || "",
        pax: Number(document.getElementById("pax").value),
        customer_name: document.getElementById("customer_name").value.trim(),
        customer_phone,
        customer_email: document.getElementById("customer_email").value.trim(),
        language: document.getElementById("language").value,
        source: "web",

        gdpr_consent: privacyConsentInput?.checked ? "true" : "false",
        gdpr_consent_date: gdprConsentDate,
        marketing_consent: marketingConsentInput?.checked ? "true" : "false",
        marketing_consent_date: marketingConsentDate,
        consent_text_version: CONSENT_TEXT_VERSION,

        ip_address: ipAddress,
        user_agent: userAgent,
        customer_activity_history: buildCustomerActivityHistory({
          routeSlug: availabilityData.route_slug || routeSlugInput?.value || "",
          activityType: activityTypeValueInput?.value || "",
          bookingDate: availabilityData.date || dateValueInput?.value || "",
          amountTotal: 0,
          eventType: "hold_created",
        }),
      };

      renderDebug("CREATE HOLD REQUEST", {
        endpoint: API_URL_CREATE_HOLD,
        payload,
      });

      const { raw, normalized } = await createHold(payload);

      renderDebug("CREATE HOLD RESPONSE", {
        raw,
        normalized,
      });

      if (!normalized || typeof normalized !== "object") {
        throw new Error("La respuesta normalizada de create hold no es válida.");
      }

      if (!normalized.hold_id) {
        throw new Error("La respuesta de create hold no incluye hold_id.");
      }

      holdData = normalized;
      renderHoldResult(normalized);
      resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      renderError(error.message);
      console.error("CREATE HOLD ERROR:", error);
    } finally {
      const buttonStillExists = document.getElementById("hold-btn");
      if (buttonStillExists) {
        buttonStillExists.disabled = false;
        buttonStillExists.textContent = "Bloquear mi plaza ahora";
      }
    }
  });
}

function attachCheckoutButtonHandler() {
  const checkoutBtn = document.getElementById("checkout-btn");
  if (!checkoutBtn) return;

  checkoutBtn.addEventListener("click", async () => {
    try {
      if (!holdData || !holdData.hold_id) {
        renderError("No hay hold válido para crear el checkout.", {
          holdData,
        });
        return;
      }

      checkoutBtn.disabled = true;
      checkoutBtn.textContent = "Preparando pago...";

      const payload = {
        hold_id: holdData.hold_id,
      };

      renderDebug("CREATE CHECKOUT SESSION REQUEST", {
        endpoint: API_URL_CREATE_CHECKOUT,
        payload,
      });

      const { raw, normalized } = await createCheckoutSession(payload);

      renderDebug("CREATE CHECKOUT SESSION RESPONSE", {
        raw,
        normalized,
      });

      if (!normalized || typeof normalized !== "object") {
        throw new Error("La respuesta normalizada de checkout no es válida.");
      }

      if (!normalized.ok) {
        throw new Error(normalized.message || "No se pudo crear la sesión de checkout.");
      }

      if (!normalized.checkout_url) {
        throw new Error("La respuesta no incluye checkout_url.");
      }

      checkoutData = normalized;
      renderCheckoutResult(normalized);

      window.location.href = normalized.checkout_url;
    } catch (error) {
      renderError(error.message);
      console.error("CREATE CHECKOUT ERROR:", error);
    } finally {
      const buttonStillExists = document.getElementById("checkout-btn");
      if (buttonStillExists) {
        buttonStillExists.disabled = false;
        buttonStillExists.textContent = "Ir al pago seguro";
      }
    }
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    availabilityData = null;
    holdData = null;
    checkoutData = null;

    try {
      const params = new URLSearchParams(window.location.search);
      const isManualMode = params.get("manual") === "1";

      let route_slug = routeSlugInput?.value?.trim() || "";
      let activity_type = activityTypeValueInput?.value?.trim() || "";
      let date = dateValueInput?.value || "";
      let start_time = startTimeValueInput?.value || "";
      const pax = Number(document.getElementById("pax").value);
      const customer_name = document.getElementById("customer_name").value.trim();
      const customer_phone = getNormalizedPhoneNumber();
      const customer_email = document.getElementById("customer_email").value.trim();
      const language = document.getElementById("language").value;

      if (isManualMode) {
        activity_type = normalizeActivityValue(manualActivitySelect?.value || "");
        route_slug = manualRouteSelect?.value?.trim() || "";
        date = manualDateInput?.value || "";
        start_time = "10:00";

        activityTypeValueInput.value = activity_type;
        routeSlugInput.value = route_slug;
        dateValueInput.value = date;
        startTimeValueInput.value = start_time;
      }

      validateFormBeforeSubmit({
        route_slug,
        activity_type,
        date,
        pax,
        customer_name,
        customer_phone,
        customer_email,
        language,
      });

      const payload = {
        departure_id: departureIdInput?.value || "",
        activity_type,
        route_slug,
        date,
        start_time,
        pax,
        group_type: "shared",
        language,
        source: "web",
      };

      checkBtn.disabled = true;
      checkBtn.textContent = "Consultando plazas...";

      resultBox.className = "result-box empty";
      resultBox.innerHTML = `
        <div class="result-pill">Comprobando</div>
        <h3 class="result-title">Estamos revisando la disponibilidad</h3>
        <p class="result-copy">Un momento, estamos comprobando la disponibilidad real de tu aventura…</p>
      `;

      renderDebug("CHECK AVAILABILITY REQUEST", {
        endpoint: API_URL_CHECK_AVAILABILITY,
        payload,
        customer_preview: {
          customer_name,
          customer_phone,
          customer_email,
        },
        legal: {
          gdpr_consent: privacyConsentInput?.checked ? "true" : "false",
          marketing_consent: marketingConsentInput?.checked ? "true" : "false",
          consent_text_version: CONSENT_TEXT_VERSION,
        },
      });

      const data = await checkAvailability(payload);

      availabilityData = data;
      renderAvailabilityResult(data);
    } catch (error) {
      renderError(error.message);
      console.error("CHECK AVAILABILITY ERROR:", error);
    } finally {
      const params = new URLSearchParams(window.location.search);
      const isManualMode = params.get("manual") === "1";

      if (isManualMode) {
        checkBtn.disabled = false;
      } else {
        checkBtn.disabled = !routeSlugInput?.value;
      }

      checkBtn.textContent = "Ver disponibilidad y reservar";
    }
  });
}

if (phoneCountrySelect) {
  phoneCountrySelect.addEventListener("change", () => {
    try {
      if (phoneLocalInput.value.trim()) {
        getNormalizedPhoneNumber();
      } else {
        phoneHiddenInput.value = "";
      }
    } catch {
      phoneHiddenInput.value = "";
    }
  });
}

if (phoneLocalInput) {
  phoneLocalInput.addEventListener("input", () => {
    try {
      const cleaned = phoneLocalInput.value.replace(/[^\d\s()-]/g, "");
      if (cleaned !== phoneLocalInput.value) {
        phoneLocalInput.value = cleaned;
      }

      if (phoneLocalInput.value.trim()) {
        getNormalizedPhoneNumber();
      } else {
        phoneHiddenInput.value = "";
      }
    } catch {
      phoneHiddenInput.value = "";
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (showcaseGrid) {
    initShowcasePage();
  }

  if (selectedDepartureCard) {
    const params = new URLSearchParams(window.location.search);
    const isManualMode = params.get("manual") === "1";

    if (isManualMode) {
      enableManualMode();

      try {
        const routes = await getRoutesCatalog();
        renderManualRoutes(routes);

        manualActivitySelect?.addEventListener("change", () => {
          const selectedActivity = normalizeActivityValue(manualActivitySelect.value);
          renderManualRoutes(routes, selectedActivity);

          routeSlugInput.value = "";
          activityTypeValueInput.value = selectedActivity || "";
        });

        manualRouteSelect?.addEventListener("change", () => {
          const selected =
            manualRouteSelect.options[manualRouteSelect.selectedIndex];
          const activity =
            selected?.dataset?.activity ||
            normalizeActivityValue(manualActivitySelect?.value || "");

          routeSlugInput.value = manualRouteSelect.value || "";
          activityTypeValueInput.value = activity || "";
        });
      } catch (error) {
        console.error("MANUAL ROUTES ERROR:", error);
        renderDebug("MANUAL ROUTES ERROR", { message: error.message });

        if (manualRouteSelect) {
          manualRouteSelect.innerHTML = `<option value="">Error cargando rutas</option>`;
        }

        if (selectedDepartureCard) {
          selectedDepartureCard.innerHTML = `
            <div class="result-pill result-pill-error">Error</div>
            <h3 class="result-title">No hemos podido cargar las rutas</h3>
            <p class="result-copy">${escapeHtml(error.message)}</p>
            <div class="result-actions">
              <a href="index.html" class="link-button">Volver al escaparate</a>
            </div>
          `;
        }
      }
    } else {
      applyDepartureToReservationPage(getDepartureParams());
    }
  }

  getClientIpAddress();
});
