(() => {
  const state = {
    places: [],
    updatedAt: "",
    currentStep: 1,
    activeFilter: "all",
    selectedIds: new Set(),
    selectedTime: "Сегодня вечером",
    theme: localStorage.getItem("date_theme") || "warm"
  };

  const CATEGORY_LABELS = {
    food: "🍷 Рестораны и кафе",
    entertainment: "🎯 Развлечения и кино",
    events: "🎭 Мероприятия"
  };

  // Инициализация темы
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

  // Применение настроек из config.js
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

  // Переключение экранов
  function goToStep(step) {
    state.currentStep = step;

    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("is-active"));
    const target = document.getElementById(`screen-${step}`);
    if (target) target.classList.add("is-active");

    document.querySelectorAll("[data-step-nav]").forEach((btn) => {
      const n = Number(btn.dataset.stepNav);
      btn.classList.toggle("is-active", n === step);
    });

    const floatingBar = document.getElementById("floatingBar");
    floatingBar.hidden = step !== 2;

    if (step === 2) renderPlaces();
    if (step === 3) renderSummary();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Загрузка базы заведений и событий
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
    updateMeta();
  }

  function updateMeta() {
    const updatedEl = document.getElementById("lastUpdated");
    if (state.updatedAt) {
      updatedEl.textContent = `Обновлено: ${state.updatedAt}`;
    }
  }

  // Отрисовка карточек
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
      const isSelected = state.selectedIds.has(place.id);
      const card = document.createElement("article");
      card.className = `place-card ${isSelected ? "is-selected" : ""}`;

      const badgeText = place.subcategory || CATEGORY_LABELS[place.category] || "Место";
      const ratingHtml = place.rating ? `<span class="place-rating">★ ${place.rating}</span>` : "";
      const dateHtml = place.date ? `<span>📅 ${escapeHtml(place.date)}</span>` : "";
      const priceHtml = place.price ? `<span>💳 ${escapeHtml(place.price)}</span>` : "";
      const addressHtml = place.address ? `<span>📍 ${escapeHtml(place.address)}</span>` : "";
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
            ${dateHtml}
            ${addressHtml}
            ${priceHtml}
          </div>
        </div>
        <div class="place-actions">
          ${linkHtml}
          <button type="button" class="btn-select" data-select-id="${escapeHtml(place.id)}">
            ${isSelected ? "Выбрано ✓" : "Хочу сюда ♥"}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    updateFloatingCount();
  }

  function updateFloatingCount() {
    document.getElementById("floatingCount").textContent = state.selectedIds.size;
  }

  function toggleSelection(id) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    renderPlaces();
  }

  // Случайный сценарий свидания ("Удиви меня!")
  function surpriseMe() {
    state.selectedIds.clear();
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const food = state.places.filter((p) => p.category === "food");
    const fun = state.places.filter((p) => p.category === "entertainment");
    const events = state.places.filter((p) => p.category === "events");

    if (food.length) state.selectedIds.add(pickRandom(food).id);
    const secondPool = [...fun, ...events];
    if (secondPool.length) state.selectedIds.add(pickRandom(secondPool).id);

    state.activeFilter = "all";
    syncFilterTabs();
    goToStep(3);
  }

  function syncFilterTabs() {
    document.querySelectorAll("#categoryTabs .tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.filter === state.activeFilter);
    });
  }

  // Отрисовка выбранного на шаге 3
  function renderSummary() {
    const chipsEl = document.getElementById("selectedChips");
    const countEl = document.getElementById("summaryCount");
    const selectedItems = state.places.filter((p) => state.selectedIds.has(p.id));

    countEl.textContent = selectedItems.length;
    chipsEl.innerHTML = "";

    if (selectedItems.length === 0) {
      chipsEl.innerHTML = `<span style="color: var(--text-muted); font-size: 0.92rem;">Места не выбраны — просто напиши свои пожелания ниже.</span>`;
      return;
    }

    selectedItems.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "selected-chip";
      chip.innerHTML = `
        <span>${escapeHtml(item.name)}</span>
        <button type="button" class="chip-remove" data-remove-id="${escapeHtml(item.id)}" aria-label="Убрать">×</button>
      `;
      chipsEl.appendChild(chip);
    });
  }

  // Формирование текста для Telegram
  function buildTelegramMessage() {
    const selectedItems = state.places.filter((p) => state.selectedIds.has(p.id));
    const customTime = document.getElementById("customTimeInput").value.trim();
    const wishes = document.getElementById("wishesTextarea").value.trim();
    const whenText = customTime || state.selectedTime;

    const lines = ["💌 Новое приглашение на свидание (Псков)", ""];
    lines.push(`🕒 Когда: ${whenText}`);

    if (selectedItems.length > 0) {
      lines.push("");
      lines.push("📍 Выбранные места:");
      selectedItems.forEach((item, idx) => {
        const addr = item.address ? ` (${item.address})` : "";
        lines.push(`${idx + 1}. ${item.name}${addr}`);
      });
    }

    if (wishes) {
      lines.push("");
      lines.push(`💭 Пожелания:\n${wishes}`);
    }

    return lines.join("\n");
  }

  // Тихая отправка через Cloudflare Worker
  async function handleSubmit(e) {
    e.preventDefault();
    const errorEl = document.getElementById("formError");
    const submitBtn = document.getElementById("btnSubmit");
    const wishes = document.getElementById("wishesTextarea").value.trim();

    errorEl.hidden = true;

    if (state.selectedIds.size === 0 && !wishes) {
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
        // Демо-режим, если Worker ещё не подключён
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

  // Навешивание обработчиков
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
      const btn = e.target.closest("[data-select-id]");
      if (btn) toggleSelection(btn.dataset.selectId);
    });

    document.getElementById("selectedChips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-id]");
      if (btn) {
        state.selectedIds.delete(btn.dataset.removeId);
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

    document.getElementById("btnStartOver").addEventListener("click", () => {
      goToStep(1);
    });
  }

  // Старт
  applyTheme(state.theme);
  applyConfig();
  bindEvents();
  loadPlaces();
})();
