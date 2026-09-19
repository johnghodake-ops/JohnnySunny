(function () {
  const API_BASE = window.SOLAR_EPC_API || "";

  const nav = document.getElementById("site-nav");
  const toggle = document.querySelector(".nav-toggle");
  const calcForm = document.getElementById("calc-form");
  const pdfForm = document.getElementById("pdf-form");
  const resultsBox = document.getElementById("calc-results");
  const contactForm = document.getElementById("contact-form");
  const reviewForm = document.getElementById("review-form");

  let lastEstimate = null;

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const sections = Array.from(document.querySelectorAll("main section[id]"));
  const navLinks = Array.from(document.querySelectorAll(".site-nav a"));

  function setActiveNav() {
    const y = window.scrollY + 90;
    let current = "home";
    sections.forEach(function (section) {
      if (section.offsetTop <= y) current = section.id;
    });
    navLinks.forEach(function (link) {
      const href = link.getAttribute("href") || "";
      link.classList.toggle("active", href === "#" + current);
    });
  }

  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();

  function money(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  }

  function qty(value, unit) {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value) + (unit ? " " + unit : "");
  }

  function round(value, digits) {
    const f = Math.pow(10, digits);
    return Math.round(value * f) / f;
  }

  function calculate(input) {
    const performanceRatio = 0.78;
    const wattsPerPanel = 550;
    const areaPerKw = 6.5;
    const costPerKw = 62000;
    const gridKgPerKwh = 0.71;
    const monthlyKwh = input.monthly_bill / input.tariff;
    const billBasedKw = monthlyKwh / (input.sunlight_hours * 30 * performanceRatio);
    const roofBasedKw = input.roof_area / areaPerKw;
    const systemKw = round(Math.min(Math.max(Math.min(billBasedKw, roofBasedKw), 1), 500), 2);
    const panelCount = Math.max(2, Math.ceil((systemKw * 1000) / wattsPerPanel));
    const yearlyGeneration = round(systemKw * input.sunlight_hours * 365 * performanceRatio, 0);
    const monthlyGeneration = round(yearlyGeneration / 12, 0);
    const estimatedCost = round(systemKw * costPerKw, 0);
    const annualSavings = round(yearlyGeneration * input.tariff, 0);
    const paybackYears = annualSavings > 0 ? round(estimatedCost / annualSavings, 1) : 0;
    const co2OffsetTonnes = round((yearlyGeneration * gridKgPerKwh) / 1000, 2);

    return {
      monthly_kwh: round(monthlyKwh, 0),
      system_kw: systemKw,
      panel_count: panelCount,
      yearly_generation: yearlyGeneration,
      monthly_generation: monthlyGeneration,
      estimated_cost: estimatedCost,
      annual_savings: annualSavings,
      payback_years: paybackYears,
      co2_offset_tonnes: co2OffsetTonnes
    };
  }

  function readCalcInputs() {
    return {
      location: valueOf("calc-location"),
      connection_type: valueOf("calc-connection"),
      roof_type: valueOf("calc-roof"),
      roof_area: Number(valueOf("calc-area")),
      monthly_bill: Number(valueOf("calc-bill")),
      tariff: Number(valueOf("calc-tariff")),
      sunlight_hours: Number(valueOf("calc-sun"))
    };
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function showResults(inputs, results) {
    lastEstimate = { inputs: inputs, results: results };
    resultsBox.hidden = false;
    setText("out-kw", results.system_kw);
    setText("out-yearly", qty(results.yearly_generation, "kWh / year"));
    setText("out-monthly", qty(results.monthly_generation, "kWh / month"));
    setText("out-panels", String(results.panel_count));
    setText("out-cost", money(results.estimated_cost));
    setText("out-savings", money(results.annual_savings));
    setText("out-payback", results.payback_years + " years");
    setText("out-co2", results.co2_offset_tonnes + " tonnes");
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setStatus(id, message, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = "form-status" + (kind ? " " + kind : "");
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validPhone(value) {
    return /^[+0-9][0-9\s\-()]{7,19}$/.test(value);
  }

  async function postJson(path, payload) {
    const url = (API_BASE || "").replace(/\/+$/, "") + path;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function bindSubmit(form, statusId, buildPayload, path) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const payload = buildPayload();
      if (payload.error) {
        setStatus(statusId, payload.error, "err");
        return;
      }
      button.disabled = true;
      setStatus(statusId, "Sending…", "");
      try {
        const data = await postJson(path, payload);
        setStatus(statusId, data.message || "Submitted.", "ok");
        form.reset();
      } catch (err) {
        setStatus(statusId, err.message || "Could not submit.", "err");
      } finally {
        button.disabled = false;
      }
    });
  }

  if (calcForm) {
    calcForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const inputs = readCalcInputs();
      if (!inputs.location) {
        calcForm.reportValidity();
        return;
      }
      if (!(inputs.roof_area >= 8 && inputs.monthly_bill >= 200 && inputs.tariff >= 1 && inputs.sunlight_hours >= 2)) {
        calcForm.reportValidity();
        return;
      }
      showResults(inputs, calculate(inputs));
      resultsBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    calcForm.addEventListener("reset", function () {
      lastEstimate = null;
      resultsBox.hidden = true;
      setStatus("pdf-status", "", "");
    });
  }

  if (pdfForm) {
    pdfForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const email = valueOf("calc-email").toLowerCase();
      if (!validEmail(email)) {
        setStatus("pdf-status", "Enter a valid email to receive the PDF report.", "err");
        return;
      }
      if (!lastEstimate) {
        setStatus("pdf-status", "Run Show estimate first.", "err");
        return;
      }
      const button = pdfForm.querySelector('button[type="submit"]');
      button.disabled = true;
      setStatus("pdf-status", "Saving to D1 and emailing PDF…", "");
      try {
        const data = await postJson("/api/solar", Object.assign({ email: email }, lastEstimate.inputs));
        setStatus("pdf-status", data.message || "PDF emailed.", "ok");
      } catch (err) {
        setStatus("pdf-status", err.message || "Could not email PDF.", "err");
      } finally {
        button.disabled = false;
      }
    });
  }

  if (contactForm) {
    bindSubmit(contactForm, "contact-status", function () {
      const name = valueOf("contact-name");
      const email = valueOf("contact-email").toLowerCase();
      const phone = valueOf("contact-phone");
      const message = valueOf("contact-message");
      if (!name || !message) return { error: "Name and message are required." };
      if (!validEmail(email)) return { error: "Enter a valid email." };
      if (!validPhone(phone)) return { error: "Enter a valid contact number." };
      return { name: name, email: email, phone: phone, message: message };
    }, "/api/contact");
  }

  if (reviewForm) {
    bindSubmit(reviewForm, "review-status", function () {
      const name = valueOf("review-name");
      const email = valueOf("review-email").toLowerCase();
      const phone = valueOf("review-phone");
      const rating = Number(valueOf("review-rating"));
      const review = valueOf("review-text");
      if (!name || !review) return { error: "Name and review are required." };
      if (!validEmail(email)) return { error: "Enter a valid email." };
      if (!validPhone(phone)) return { error: "Enter a valid contact number." };
      if (!(rating >= 1 && rating <= 5)) return { error: "Choose a rating." };
      return { name: name, email: email, phone: phone, rating: rating, review: review };
    }, "/api/review");
  }
})();
