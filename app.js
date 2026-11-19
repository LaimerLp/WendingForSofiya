(() => {
  const state = {
    places: [],
    updatedAt: "",
    currentStep: 1,
    activeFilter: "all",
    selections: new Map(),
    selectedTime: "Сегодня вечером",
    theme: localStorage.getItem("date_theme") || "warm",
    modal: {
      placeId: null,
      eventTitle: "",
      dateIso: "",
      dateLabel: "Сегодня"
    }
  };

  const CATEGORY_LABELS = {
    food: "🍷 Рестораны и кафе",
    entertainment: "🎯 Развлечения и кино",
    events: "🎭 Мероприятия"
  };

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatRuDate(isoDate) {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function getIsoFromOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return toIsoDate(d);
  }

  function getIsoForNextWeekday(targetDay) {
    const d = new Date();
    const diff = (targetDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return toIsoDate(d);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("date_theme", theme);

    const icon = document.getElementById("themeIcon");
    const label = document.getElementById("themeLabel");
    if (theme === "night") {
      icon.textContent = "☀️";
      label.textContent = "Тёплая";
    } else {
      icon.textContent = "🌙";
      label.textContent = "Вечерняя";
    }
  }

  function applyConfig() {
    const cfg = window.DATE_CONFIG || {};
    if (cfg.siteTitle) {
      document.title = cfg.siteTitle;
      document.getElementById("brandTitle").textContent = cfg.siteTitle;
    }
    if (cfg.greeting) {
      document.getElementById("heroGreeting").textContent = cfg.greeting;
    }
  }

  function goToStep(step) {
    state.currentStep = step;

    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("is-active"));
    const target = document.getElementById(`screen-${step}`);
    if (target) target.classList.add("is-active");

    document.querySelectorAll("[data-step-nav]").forEach((btn) => {
      const n = Number(btn.dataset.stepNav);
      btn.classList.toggle("is-active", n === step);
    });

    document.getElementById("floatingBar").hidden = step !== 2;

    if (step === 2) renderPlaces();
    if (step === 3) renderSummary();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadPlaces() {
    try {
      const resp = await fetch("data/places.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("Не удалось загрузить базу мест");
      const data = await resp.json();
      state.places = Array.isArray(data.items) ? data.items : [];
      state.updatedAt = data.updated_at || "";
    } catch (err) {
      console.error(err);
      state.places = [];
    }
    const updatedEl = document.getElementById("lastUpdated");
    if (state.updatedAt) {
      updatedEl.textContent = `Обновлено: ${state.updatedAt}`;
    }
  }

  function renderPlaces() {
    const grid = document.getElementById("placesGrid");
    const countEl = document.getElementById("placesCount");

    const filtered = state.activeFilter === "all"
      ? state.places
      : state.places.filter((item) => item.category === state.activeFilter);

    countEl.textContent = `Найдено вариантов: ${filtered.length}`;
    grid.innerHTML = "";

    if (filtered.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted)">В этой категории пока пусто — можно написать своё желание на следующем шаге.</p>`;
      return;
    }

    filtered.forEach((place) => {
      const sel = state.selections.get(place.id);
      const isSelected = Boolean(sel);
      const card = document.createElement("article");
      card.className = `place-card ${isSelected ? "is-selected" : ""}`;
      card.dataset.cardId = place.id;

      const badgeText = place.subcategory || CATEGORY_LABELS[place.category] || "Место";
      const ratingHtml = place.rating ? `<span class="place-rating">★ ${place.rating}</span>` : "";
      const priceHtml = place.price ? `<span>💳 ${escapeHtml(place.price)}</span>` : "";
      const addressHtml = place.address ? `<span>📍 ${escapeHtml(place.address)}</span>` : "";
      const eventsCount = Array.isArray(place.events) ? place.events.length : 0;
      const eventsHint = eventsCount > 0 ? `<span>🎟 Афиша / форматы: ${eventsCount}</span>` : "";

      const chosenNote = isSelected
        ? `<div class="place-chosen-note">✓ ${escapeHtml(sel.dateLabel)}${sel.eventTitle ? ` · ${escapeHtml(sel.eventTitle)}` : ""}</div>`
        : "";

      const linkHtml = place.url
        ? `<a class="place-link" href="${escapeHtml(place.url)}" target="_blank" rel="noopener noreferrer">Подробнее ↗</a>`
        : `<span></span>`;

      card.innerHTML = `
        <div>
          <div class="place-top">
            <span class="place-badge">${escapeHtml(badgeText)}</span>
            ${ratingHtml}
          </div>
          <h3 class="place-title">${escapeHtml(place.name)}</h3>
          <p class="place-desc">${escapeHtml(place.description || "")}</p>
          <div class="place-details">
            ${addressHtml}
            ${priceHtml}
            ${eventsHint}
          </div>
          ${chosenNote}
        </div>
        <div class="place-actions">
          ${linkHtml}
          <button type="button" class="btn-select" data-open-id="${escapeHtml(place.id)}">
            ${isSelected ? "Изменить ✓" : "Выбрать и дата ♥"}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    updateFloatingCount();
  }

  function updateFloatingCount() {
    document.getElementById("floatingCount").textContent = state.selections.size;
  }

  // Проверка актуальности события на выбранную дату YYYY-MM-DD
  function isEventOnDate(ev, isoDate) {
    if (!ev.dates || ev.dates.length === 0 || ev.dates.includes("daily")) {
      return true;
    }
    return ev.dates.includes(isoDate);
  }

  function isEventAvailable(ev) {
    if (ev.sold_out === true) return false;
    if (typeof ev.seats_left === "number" && ev.seats_left <= 0) return false;
    return true;
  }

  function renderModalEvents() {
    const place = state.places.find((p) => p.id === state.modal.placeId);
    if (!place) return;

    const eventsContainer = document.getElementById("modalEvents");
    const headingEl = document.getElementById("modalEventsHeading");
    const confirmBtn = document.getElementById("modalConfirmBtn");

    headingEl.textContent = `2. Актуальные мероприятия на ${state.modal.dateLabel} (${formatRuDate(state.modal.dateIso)})`;

    const rawEvents = Array.isArray(place.events) && place.events.length > 0
      ? place.events
      : [{ title: "Свободное посещение", info: place.description || "Без привязки к сеансу", dates: ["daily"] }];

    const eventsForDate = rawEvents.filter((ev) => isEventOnDate(ev, state.modal.dateIso));
    const availableEvents = eventsForDate.filter((ev) => isEventAvailable(ev));

    eventsContainer.innerHTML = "";

    if (eventsForDate.length === 0 || availableEvents.length === 0) {
      const reason = eventsForDate.length === 0
        ? `На ${state.modal.dateLabel} (${formatRuDate(state.modal.dateIso)}) мероприятий нет или мест уже нет.`
        : `На ${state.modal.dateLabel} (${formatRuDate(state.modal.dateIso)}) свободных мест уже нет.`;

      eventsContainer.innerHTML = `
        <div class="modal-empty-state">
          😔 <strong>Мест нет</strong><br />
          ${escapeHtml(reason)} Попробуй выбрать другую дату выше.
        </div>
      `;
      state.modal.eventTitle = "";
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Мест нет";
      return;
    }

    // Если текущее выбранное событие недоступно на новую дату — выбираем первое доступное
    if (!availableEvents.some((ev) => ev.title === state.modal.eventTitle)) {
      state.modal.eventTitle = availableEvents[0].title;
    }

    const existing = state.selections.get(place.id);
    confirmBtn.disabled = false;
    confirmBtn.textContent = existing ? "Сохранить изменения ✓" : "Выбрать это место ♥";

    eventsForDate.forEach((ev) => {
      const available = isEventAvailable(ev);
      const isActive = available && state.modal.eventTitle === ev.title;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `modal-event-item ${isActive ? "is-active" : ""} ${!available ? "is-sold-out" : ""}`;
      btn.disabled = !available;
      btn.dataset.eventTitle = ev.title;

      let badgeHtml = "";
      if (!available) {
        badgeHtml = `<span class="modal-event-badge">Мест нет</span>`;
      } else if (typeof ev.seats_left === "number" && ev.seats_left <= 5) {
        badgeHtml = `<span class="modal-event-badge">Осталось мест: ${ev.seats_left}</span>`;
      }

      btn.innerHTML = `
        <div class="modal-event-head">
          <span class="modal-event-title">${escapeHtml(ev.title)}</span>
          ${badgeHtml}
        </div>
        ${ev.info ? `<span class="modal-event-sub">${escapeHtml(ev.info)}</span>` : ""}
      `;
      eventsContainer.appendChild(btn);
    });
  }

  function openPlaceModal(placeId) {
    const place = state.places.find((p) => p.id === placeId);
    if (!place) return;

    const existing = state.selections.get(placeId);
    const todayIso = getIsoFromOffset(0);

    state.modal.placeId = placeId;
    state.modal.dateIso = existing && existing.dateIso ? existing.dateIso : todayIso;
    state.modal.dateLabel = existing && existing.dateLabel ? existing.dateLabel : "Сегодня";
    state.modal.eventTitle = existing ? existing.eventTitle : "";

    document.getElementById("modalBadge").textContent = place.subcategory || CATEGORY_LABELS[place.category] || "Место";
    document.getElementById("modalTitle").textContent = place.name;

    const metaParts = [];
    if (place.address) metaParts.push(`📍 ${place.address}`);
    if (place.rating) metaParts.push(`★ ${place.rating}`);
    if (place.price) metaParts.push(`💳 ${place.price}`);
    document.getElementById("modalMeta").textContent = metaParts.join("  ·  ");
    document.getElementById("modalDesc").textContent = place.description || "";

    const extLink = document.getElementById("modalExternalLink");
    if (place.url) {
      extLink.href = place.url;
      extLink.hidden = false;
    } else {
      extLink.hidden = true;
    }

    const dateInput = document.getElementById("modalDateInput");
    dateInput.min = todayIso;
    dateInput.value = state.modal.dateIso;

    syncModalDateChips();
    renderModalEvents();

    document.getElementById("modalRemoveBtn").hidden = !existing;
    document.getElementById("placeModal").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closePlaceModal() {
    document.getElementById("placeModal").hidden = true;
    document.body.classList.remove("modal-open");
    state.modal.placeId = null;
  }

  function syncModalDateChips() {
    document.querySelectorAll("#modalDateChips .time-chip").forEach((chip) => {
      const chipLabel = chip.textContent.trim();
      chip.classList.toggle("is-active", chipLabel === state.modal.dateLabel);
    });
  }

  function surpriseMe() {
    state.selections.clear();
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const food = state.places.filter((p) => p.category === "food");
    const fun = state.places.filter((p) => p.category === "entertainment");
    const events = state.places.filter((p) => p.category === "events");

    const satIso = getIsoForNextWeekday(6);
    const addRandomPlace = (place) => {
      if (!place) return;
      const available = (place.events || []).filter((ev) => isEventAvailable(ev));
      const ev = available.length ? pickRandom(available).title : "";
      state.selections.set(place.id, {
        eventTitle: ev,
        dateIso: satIso,
        dateLabel: "В субботу"
      });
    };

    if (food.length) addRandomPlace(pickRandom(food));
    const secondPool = [...fun, ...events];
    if (secondPool.length) addRandomPlace(pickRandom(secondPool));

    state.activeFilter = "all";
    syncFilterTabs();
    goToStep(3);
  }

  function syncFilterTabs() {
    document.querySelectorAll("#categoryTabs .tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.filter === state.activeFilter);
    });
  }

  function renderSummary() {
    const chipsEl = document.getElementById("selectedChips");
    const countEl = document.getElementById("summaryCount");
    const selectedItems = state.places.filter((p) => state.selections.has(p.id));

    countEl.textContent = selectedItems.length;
    chipsEl.innerHTML = "";

    if (selectedItems.length === 0) {
      chipsEl.innerHTML = `<span style="color: var(--text-muted); font-size: 0.92rem;">Места не выбраны — просто напиши свои пожелания ниже.</span>`;
      return;
    }

    selectedItems.forEach((item) => {
      const sel = state.selections.get(item.id);
      const dateStr = sel.dateIso ? `${sel.dateLabel} (${formatRuDate(sel.dateIso)})` : sel.dateLabel;
      const details = [dateStr, sel.eventTitle].filter(Boolean).join(" · ");
      const chip = document.createElement("span");
      chip.className = "selected-chip";
      chip.innerHTML = `
        <span>${escapeHtml(item.name)}${details ? ` (${escapeHtml(details)})` : ""}</span>
        <button type="button" class="chip-remove" data-remove-id="${escapeHtml(item.id)}" aria-label="Убрать">×</button>
      `;
      chipsEl.appendChild(chip);
    });
  }

  function buildTelegramMessage() {
    const selectedItems = state.places.filter((p) => state.selections.has(p.id));
    const customTime = document.getElementById("customTimeInput").value.trim();
    const wishes = document.getElementById("wishesTextarea").value.trim();
    const whenText = customTime || state.selectedTime;

    const lines = ["💌 Новое приглашение на свидание (Псков)", ""];
    lines.push(`🕒 Общее время: ${whenText}`);

    if (selectedItems.length > 0) {
      lines.push("");
      lines.push("📍 Выбранные места:");
      selectedItems.forEach((item, idx) => {
        const sel = state.selections.get(item.id);
        const addr = item.address ? ` (${item.address})` : "";
        lines.push(`${idx + 1}. ${item.name}${addr}`);
        if (sel.dateLabel || sel.eventTitle) {
          const dateStr = sel.dateIso ? `${sel.dateLabel} (${formatRuDate(sel.dateIso)})` : sel.dateLabel;
          const extra = [dateStr ? `Дата: ${dateStr}` : "", sel.eventTitle ? `Программа: ${sel.eventTitle}` : ""]
            .filter(Boolean)
            .join(" | ");
          lines.push(`   ↳ ${extra}`);
        }
      });
    }

    if (wishes) {
      lines.push("");
      lines.push(`💭 Пожелания:\n${wishes}`);
    }

    return lines.join("\n");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errorEl = document.getElementById("formError");
    const submitBtn = document.getElementById("btnSubmit");
    const wishes = document.getElementById("wishesTextarea").value.trim();

    errorEl.hidden = true;

    if (state.selections.size === 0 && !wishes) {
      errorEl.textContent = "Выбери хотя бы одно место или напиши пожелание в поле ниже.";
      errorEl.hidden = false;
      return;
    }

    const messageText = buildTelegramMessage();
    const workerUrl = (window.DATE_CONFIG && window.DATE_CONFIG.telegramWorkerUrl || "").trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляю...";

    try {
      if (workerUrl) {
        const res = await fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: messageText })
        });
        if (!res.ok) {
          throw new Error(`Ошибка отправки (${res.status})`);
        }
      } else {
        console.info("Демо-режим (telegramWorkerUrl не задан). Сообщение:\n", messageText);
      }

      document.getElementById("successPreview").textContent = messageText;
      goToStep(4);
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Не получилось отправить сообщение. Проверь интернет или настройки Telegram Worker.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Отправить мой выбор 💌";
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function bindEvents() {
    document.getElementById("themeToggle").addEventListener("click", () => {
      applyTheme(state.theme === "warm" ? "night" : "warm");
    });

    document.querySelectorAll("[data-step-nav]").forEach((btn) => {
      btn.addEventListener("click", () => goToStep(Number(btn.dataset.stepNav)));
    });

    document.querySelectorAll(".mood-card").forEach((card) => {
      card.addEventListener("click", () => {
        state.activeFilter = card.dataset.category || "all";
        syncFilterTabs();
        goToStep(2);
      });
    });

    document.getElementById("btnSurprise").addEventListener("click", surpriseMe);
    document.getElementById("backToStep1").addEventListener("click", () => goToStep(1));
    document.getElementById("backToStep2").addEventListener("click", () => goToStep(2));
    document.getElementById("btnGoToStep3").addEventListener("click", () => goToStep(3));

    document.querySelectorAll("#categoryTabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeFilter = btn.dataset.filter;
        syncFilterTabs();
        renderPlaces();
      });
    });

    document.getElementById("placesGrid").addEventListener("click", (e) => {
      if (e.target.closest("a.place-link")) return;
      const card = e.target.closest("[data-card-id]");
      if (card) openPlaceModal(card.dataset.cardId);
    });

    document.getElementById("modalClose").addEventListener("click", closePlaceModal);
    document.getElementById("placeModal").addEventListener("click", (e) => {
      if (e.target.id === "placeModal") closePlaceModal();
    });

    document.getElementById("modalEvents").addEventListener("click", (e) => {
      const item = e.target.closest("[data-event-title]");
      if (!item || item.disabled) return;
      state.modal.eventTitle = item.dataset.eventTitle;
      document.querySelectorAll("#modalEvents .modal-event-item").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.eventTitle === state.modal.eventTitle);
      });
    });

    document.getElementById("modalDateChips").addEventListener("click", (e) => {
      const chip = e.target.closest(".time-chip");
      if (!chip) return;

      if (chip.dataset.offset !== undefined) {
        state.modal.dateIso = getIsoFromOffset(Number(chip.dataset.offset));
      } else if (chip.dataset.weekday !== undefined) {
        state.modal.dateIso = getIsoForNextWeekday(Number(chip.dataset.weekday));
      }

      state.modal.dateLabel = chip.textContent.trim();
      document.getElementById("modalDateInput").value = state.modal.dateIso;
      syncModalDateChips();
      renderModalEvents();
    });

    document.getElementById("modalDateInput").addEventListener("change", (e) => {
      if (e.target.value) {
        state.modal.dateIso = e.target.value;
        state.modal.dateLabel = formatRuDate(e.target.value);
        syncModalDateChips();
        renderModalEvents();
      }
    });

    document.getElementById("modalConfirmBtn").addEventListener("click", () => {
      if (state.modal.placeId && state.modal.eventTitle) {
        state.selections.set(state.modal.placeId, {
          eventTitle: state.modal.eventTitle,
          dateIso: state.modal.dateIso,
          dateLabel: state.modal.dateLabel
        });
      }
      closePlaceModal();
      renderPlaces();
    });

    document.getElementById("modalRemoveBtn").addEventListener("click", () => {
      if (state.modal.placeId) {
        state.selections.delete(state.modal.placeId);
      }
      closePlaceModal();
      renderPlaces();
    });

    document.getElementById("selectedChips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-id]");
      if (btn) {
        state.selections.delete(btn.dataset.removeId);
        renderSummary();
      }
    });

    document.querySelectorAll("#timeChips .time-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#timeChips .time-chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        state.selectedTime = chip.dataset.time;
      });
    });

    document.getElementById("wishesForm").addEventListener("submit", handleSubmit);
    document.getElementById("btnStartOver").addEventListener("click", () => goToStep(1));
  }

  applyTheme(state.theme);
  applyConfig();
  bindEvents();
  loadPlaces();
})();
