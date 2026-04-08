const API_URL_CHECK_AVAILABILITY =
  "https://primary-production-beb9e.up.railway.app/webhook/ms-check-availability";

const API_URL_CREATE_HOLD =
  "https://primary-production-beb9e.up.railway.app/webhook/cab4e11c-ee19-498e-b998-91a51040edcd";

const API_URL_CREATE_CHECKOUT =
  "https://primary-production-beb9e.up.railway.app/webhook/create-checkout-session";

let availabilityData = null;
let holdData = null;
let checkoutData = null;

const form = document.getElementById("booking-form");
const routeSelect = document.getElementById("route_slug");
const activityInput = document.getElementById("activity_type");
const resultBox = document.getElementById("result-box");
const debugBox = document.getElementById("debug-box");
const checkBtn = document.getElementById("check-btn");

const phoneCountrySelect = document.getElementById("phone_country");
const phoneLocalInput = document.getElementById("customer_phone_local");
const phoneHiddenInput = document.getElementById("customer_phone");

const privacyConsentInput = document.getElementById("privacy_consent");
const marketingConsentInput = document.getElementById("marketing_consent");

const ACTIVITY_LABELS = {
  via_ferrata: "Vía ferrata",
  barranquismo: "Barranquismo",
  raquetas_nieve: "Raquetas de nieve",
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

function formatApiDate(dateString) {
  if (!dateString) return "-";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

function formatPrice(amount, currency = "EUR") {
  if (amount === null || typeof amount === "undefined" || amount === "") {
    return "No disponible";
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

function getSelectedRouteName() {
  const selectedOption = routeSelect.options[routeSelect.selectedIndex];
  return selectedOption?.textContent?.trim() || "";
}

function setActivityFromRoute() {
  const selectedOption = routeSelect.options[routeSelect.selectedIndex];
  const activityType = selectedOption?.dataset?.activity || "";
  activityInput.value = formatActivityLabel(activityType);
  activityInput.dataset.rawValue = activityType;
}

function renderDebug(title, payload) {
  if (!debugBox) return;
  debugBox.textContent = `${title}\n\n${JSON.stringify(payload, null, 2)}`;
}

function renderError(message, data = null) {
  resultBox.className = "result-box error";
  resultBox.innerHTML = `
    <div class="result-pill result-pill-error">No disponible</div>
    <h3 class="result-title">No hemos podido continuar con tu reserva</h3>
    <p class="result-copy">${escapeHtml(message)}</p>
    <p class="helper-text">Prueba con otra fecha o vuelve a intentarlo en unos segundos.</p>
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

  if (!/^\d{8,15}$/.test(fullNumber)) {
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
    throw new Error("Faltan campos obligatorios.");
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
      <h3 class="result-title">Ahora mismo no tenemos disponibilidad</h3>
      <p class="result-copy">${escapeHtml(data.message || "La solicitud no es válida o no hay disponibilidad.")}</p>
      <p class="helper-text">Prueba con otra fecha o con otra aventura.</p>
    `;
    renderDebug("CHECK AVAILABILITY RESPONSE", data);
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  let boxClass = "result-box success";
  let pill = "Plazas disponibles";
  let title = "Tu aventura está disponible";
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

  const routeName = getSelectedRouteName() || data.route_name || data.route_slug || "-";
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
        Tu solicitud requiere validación manual. Si la enviáis, el equipo os contactará para cerrar todos los detalles.
      </p>
    `;
  }

  resultBox.className = boxClass;
  resultBox.innerHTML = `
    <div class="result-pill ${status === "manual_review" ? "result-pill-warning" : "result-pill-success"}">${escapeHtml(pill)}</div>
    <h3 class="result-title">${escapeHtml(title)}</h3>
    <p class="result-copy">
      ${status === "manual_review"
        ? "Hemos recibido los datos de vuestra aventura. Antes de confirmar, el equipo revisará la operativa para ofreceros la mejor opción."
        : "Ya puedes continuar con la reserva y asegurar tu salida antes de que se agoten las plazas."}
    </p>

    <ul class="result-list">
      <li><strong>Aventura:</strong> ${escapeHtml(routeName)}</li>
      <li><strong>Fecha:</strong> ${escapeHtml(formatApiDate(data.date || "-"))}</li>
      <li><strong>Hora de salida:</strong> ${escapeHtml(data.start_time || "-")}</li>
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

      const payload = {
        status: availabilityData.status,
        route_slug: availabilityData.route_slug,
        date: availabilityData.date,
        start_time: availabilityData.start_time,
        pax: Number(document.getElementById("pax").value),
        customer_name: document.getElementById("customer_name").value.trim(),
        customer_phone,
        customer_email: document.getElementById("customer_email").value.trim(),
        language: document.getElementById("language").value,
        source: "web",
        privacy_accepted: privacyConsentInput?.checked === true,
        privacy_accepted_at: new Date().toISOString(),
        marketing_accepted: marketingConsentInput?.checked === true,
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  availabilityData = null;
  holdData = null;
  checkoutData = null;

  setActivityFromRoute();

  try {
    const route_slug = routeSelect.value.trim();
    const activity_type = activityInput.dataset.rawValue?.trim() || "";
    const date = document.getElementById("date").value;
    const pax = Number(document.getElementById("pax").value);
    const customer_name = document.getElementById("customer_name").value.trim();
    const customer_phone = getNormalizedPhoneNumber();
    const customer_email = document.getElementById("customer_email").value.trim();
    const language = document.getElementById("language").value;

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
      activity_type,
      route_slug,
      date,
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
      <h3 class="result-title">Estamos buscando disponibilidad</h3>
      <p class="result-copy">Un momento, estamos preparando tu aventura…</p>
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
        privacy_accepted: privacyConsentInput?.checked === true,
        marketing_accepted: marketingConsentInput?.checked === true,
      },
    });

    const data = await checkAvailability(payload);

    availabilityData = data;
    renderAvailabilityResult(data);
  } catch (error) {
    renderError(error.message);
    console.error("CHECK AVAILABILITY ERROR:", error);
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = "Ver disponibilidad y reservar";
  }
});

routeSelect.addEventListener("change", setActivityFromRoute);
phoneCountrySelect.addEventListener("change", getNormalizedPhoneNumber);
phoneLocalInput.addEventListener("input", () => {
  try {
    getNormalizedPhoneNumber();
  } catch {
    phoneHiddenInput.value = "";
  }
});

setActivityFromRoute();
