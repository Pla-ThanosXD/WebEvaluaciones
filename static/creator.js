(function () {
  "use strict";

  function normalizeText(text) {
    return (text || "")
      .toString()
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escAttr(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function show(el) { el?.classList.remove("hidden"); }
  function hide(el) { el?.classList.add("hidden"); }
  function setHTML(el, html) { if (el) el.innerHTML = html || ""; }

  function toast(msg, ms = 1800) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = "none"; }, ms);
  }

  function isValidEmail(email) {
    const s = (email || "").trim();
    return !!s && s.includes("@") && s.includes(".");
  }

  let SYSTEM_AREAS = [];
  let SYSTEM_TOPICS = {};
  let UI_TEXTS = {};
  let IS_ADMIN = false;

  let editingSystemOriginal = "";
  let SEARCH_INDEX = [];

  const FALLBACK_SYSTEM_TOPICS = {
    "Seguridad comercial": [
      "Código gobierno corporativo",
      "Derechos Humanos",
      "LAFT/FPADM y PTEE / COMERCIO INTERNACIONAL",
      "Gestión de Datos Personales (Habeas Data)",
      "Seguridad de la información",
      "Prevención de adicciones",
      "Responsabilidad social empresarial",
      "Políticas BASC / OEA",
      "Llenado de contenedor y manejo seguro de mercancías",
      "Trazabilidad y manejo de sellos de seguridad",
      "Simulacros y ejercicios prácticos en BASC",
      "Controles de acceso y seguridad Física",
      "Programa para entrenamiento de situaciones de pánico"
    ],
    "Calidad": [
      "Catálogo de defecto",
      "Comportamientos basicos de calidad integrada",
      "Elementos de protección personal",
      "Limpieza de bandas/lonas",
      "Manejo de alérgenos",
      "Manejo de sustancias químicas",
      "Matriz de defectos",
      "Manejo de Residuos Peligrosos"
    ],
    "Ambiental": [
      "Manejo y separación de residuos",
      "Matriz de aspectos e impactos ambientales"
    ],
    "Seguridad": [
      "Estándar de seguridad de superficies cortantes",
      "Elementos de protección personal",
      "Manipupación segura de carros y bagonetas",
      "Matriz de peligros"
    ],
    "Areas de Mantenimiento planeado": [
      "Mantenimiento, puesta a cero y calibración de cargadores",
      "Mantenimiento, tiempos y calibración de empujador",
      "Mantenimiento, calibración de isla robótica",
      "Principio de funcionamiento cadena lateral",
      "Mantenimiento de sellado transversal",
      "Mantenimiento, calibración y ajuste de barritas de mordazas",
      "Generalidades correas, poleas y bandas",
      "Parámetros de multiempaque",
      "Parámetros de individual",
      "Conveyor laminadores 1, 2, 3",
      "Grippers principio funcionamiento",
      "Maqueta materia 4 paso 4 MA",
      "Limpieza de bandas",
      "Estándar de seguridad de desatasque en charnelas",
      "Estándar de seguridad de lavado de cadenas",
      "Principio de funcionamiento sellado transversal",
      "Principio de funcionamiento sellado longitudinal",
      "Principio de funcionamiento de marcadoras",
      "Principio de funcionamiento Vibrador",
      "Principio de funcionamiento conveyor acelerador HS"
    ],
    "MdeO": [],
    "SIG": [],
    "Relaciones Laborales": [],
    "Desarrollo de Capacidades": [
      "Inteligencia artificial",
      "Bilingüismo",
      "Habilidades financieras",
      "Habilidades comerciales",
      "Trabajo en equipo"
    ],
    "Capacidades core de negocio": [
      "Escuela técnica ingredientes menores y mayores",
      "Escuela técnica horneo",
      "Escuela técnica empaque",
      "Mentorías técnicas",
      "Escuela de nutrición",
      "Escuela de Liderazgo",
      "Otros"
    ],
    "Otros": ["Indución Presencial", "Otros"]
  };

  const facilitator = document.getElementById("facilitator");
  const facilitator_cedula = document.getElementById("facilitator_cedula");
  const course = document.getElementById("course");
  const courseDescription = document.getElementById("course_description");
  const course_date = document.getElementById("course_date");
  const course_duration = document.getElementById("course_duration");
  const facilitator_email = document.getElementById("facilitator_email");

  const reuse_course_duration = document.getElementById("reuse_course_duration");
  const reuse_facilitator_email = document.getElementById("reuse_facilitator_email");

  const systemTopicBlock = document.getElementById("system_topic_block");
  const systemTopicSelect = document.getElementById("system_topic");

  const globalSearch = document.getElementById("system_global_search");
  const suggestBox = document.getElementById("system_global_suggest");

  const reuseYes = document.getElementById("reuse_yes");
  const reuseNo = document.getElementById("reuse_no");
  const reuseSelectedBlock = document.getElementById("reuse_selected_block");
  const normalFlowBlock = document.getElementById("normal_flow_block");
  const reuseSystemPreview = document.getElementById("reuse_system_preview");

  const qc = document.getElementById("questions_container");
  const resultBox = document.getElementById("result");
  const resultDirect = document.getElementById("result_direct");
  const addBtn = document.getElementById("add_question");
  const genBtn = document.getElementById("generate_exam");
  const btnOpenForms = document.getElementById("btn_open_forms");

  const examSelect = document.getElementById("exam_select");
  const reuseBtn = document.getElementById("btn_reuse");
  const resultReuse = document.getElementById("result_reuse");

  const defaultQuestionsAdmin = document.getElementById("default_questions_admin");
  const saveDefaultQuestionsBtn = document.getElementById("save_default_questions");
  const defaultQuestionsResult = document.getElementById("default_questions_result");

  function setCourseLocked(locked) {
    if (!course) return;
    if (locked) course.setAttribute("readonly", "readonly");
    else course.removeAttribute("readonly");
  }

  function clearCourse() {
    if (!course) return;
    course.value = "";
    setCourseLocked(true);
    course.blur();
  }

  async function loadPublicConfig() {
    try {
      const res = await fetch("/api/config/public", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      const areas = Array.isArray(data.system_areas) ? data.system_areas : [];
      const topics = (data.system_topics && typeof data.system_topics === "object") ? data.system_topics : {};
      UI_TEXTS = (data.ui_texts && typeof data.ui_texts === "object") ? data.ui_texts : {};

      SYSTEM_TOPICS = Object.keys(topics).length ? topics : FALLBACK_SYSTEM_TOPICS;
      SYSTEM_AREAS = areas.length ? areas : Object.keys(SYSTEM_TOPICS || {});
    } catch {
      UI_TEXTS = {};
      SYSTEM_TOPICS = FALLBACK_SYSTEM_TOPICS;
      SYSTEM_AREAS = Object.keys(SYSTEM_TOPICS || {});
    }
  }

  async function loadAdminMe() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      IS_ADMIN = !!data.is_admin;
    } catch {
      IS_ADMIN = false;
    }
  }

  async function apiJSON(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error de servidor");
    return data;
  }

  function pencilSvg() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function applyUITexts() {
    const map = {
      label_facilitator: document.getElementById("label_facilitator"),
      label_facilitator_cedula: document.getElementById("label_facilitator_cedula"),
      label_system_area: document.getElementById("label_system_area"),
      label_course: document.getElementById("label_course"),
      label_course_description: document.getElementById("label_course_description"),
      label_course_duration: document.getElementById("label_course_duration"),
      label_facilitator_email: document.getElementById("label_facilitator_email")
    };

    Object.keys(map).forEach((key) => {
      const el = map[key];
      if (el && UI_TEXTS[key]) el.textContent = UI_TEXTS[key];
    });
  }

  function ensureAdminEditIcons() {
    if (!IS_ADMIN) return;
    document.querySelectorAll(".admin-edit").forEach((el) => {
      if (!el.innerHTML.trim()) el.innerHTML = pencilSvg();
      el.classList.remove("hidden");
    });
  }

  const adminEditModal = document.getElementById("admin_edit_modal");
  const adminEditHelp = document.getElementById("admin_edit_help");
  const adminEditValue = document.getElementById("admin_edit_value");
  const adminEditSave = document.getElementById("admin_edit_save");
  const adminEditClose = document.getElementById("admin_edit_close");
  const adminEditErr = document.getElementById("admin_edit_err");

  let currentUITextKey = "";

  function openUITextEditor(key) {
    if (!IS_ADMIN || !adminEditModal || !adminEditValue) return;
    currentUITextKey = key;
    adminEditErr.textContent = "";
    adminEditValue.value = UI_TEXTS[key] || document.getElementById(key)?.textContent?.trim() || "";
    if (adminEditHelp) adminEditHelp.textContent = `Editar texto: ${key}`;
    adminEditModal.classList.add("show");
    adminEditValue.focus();
  }

  function closeUITextEditor() {
    adminEditModal?.classList.remove("show");
    currentUITextKey = "";
  }

  async function saveUIText() {
    if (!currentUITextKey) return;
    const value = (adminEditValue?.value || "").trim();
    if (!value) {
      if (adminEditErr) adminEditErr.textContent = "El valor no puede estar vacío.";
      return;
    }

    adminEditSave.disabled = true;
    try {
      await apiJSON("/api/admin/ui_texts/update", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: currentUITextKey, value })
      });
      UI_TEXTS[currentUITextKey] = value;
      applyUITexts();
      closeUITextEditor();
      toast("Texto actualizado");
    } catch (e) {
      if (adminEditErr) adminEditErr.textContent = String(e.message || e);
    } finally {
      adminEditSave.disabled = false;
    }
  }

  function bindUITextEditors() {
    document.querySelectorAll(".admin-edit").forEach((el) => {
      const key = el.getAttribute("data-target");
      if (!key) return;
      el.addEventListener("click", () => openUITextEditor(key));
    });

    adminEditSave?.addEventListener("click", saveUIText);
    adminEditClose?.addEventListener("click", closeUITextEditor);
    adminEditModal?.addEventListener("click", (e) => {
      if (e.target === adminEditModal) closeUITextEditor();
    });
  }

  function renderSystemAreas() {
    const container = document.getElementById("system_container");
    if (!container) return;

    container.innerHTML = "";

    if (!SYSTEM_AREAS.length) {
      container.innerHTML = `<div class="small">⚠️ No hay habilitadores configurados.</div>`;
      return;
    }

    SYSTEM_AREAS.forEach((area) => {
      const wrap = document.createElement("div");
      wrap.className = "system-pill";

      const label = document.createElement("label");
      label.innerHTML = `
        <input type="radio" name="system_area" class="system_chk" value="${escAttr(area)}">
        <span>${area}</span>
      `;
      wrap.appendChild(label);

      if (IS_ADMIN) {
        const overlay = document.createElement("div");
        overlay.className = "pill-overlay";
        overlay.innerHTML = pencilSvg();
        overlay.title = "Editar sistema";
        overlay.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSystemEditor(area);
        });
        wrap.appendChild(overlay);
      }

      container.appendChild(wrap);
    });

    if (IS_ADMIN) {
      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "pill-plus";
      plus.textContent = "+";
      plus.title = "Agregar nuevo sistema";
      plus.addEventListener("click", () => openSystemEditor(""));
      container.appendChild(plus);
    }
  }

  function getSystemChecks() { return [...document.querySelectorAll(".system_chk")]; }
  function getSelectedSystem() {
    const checked = document.querySelector(".system_chk:checked");
    return checked ? checked.value : "";
  }
  function getSelectedTopic() { return (systemTopicSelect?.value || "").trim(); }

  function fillTopics(systemValue, preselect = "") {
    if (!systemTopicSelect || !systemTopicBlock) return;

    systemTopicSelect.innerHTML = `<option value="" disabled selected>Selecciona…</option>`;

    const topics = SYSTEM_TOPICS[systemValue] || [];
    if (!systemValue || !Array.isArray(topics) || !topics.length) {
      systemTopicBlock.classList.add("hidden");
      return;
    }

    topics.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      systemTopicSelect.appendChild(opt);
    });

    systemTopicBlock.classList.remove("hidden");

    if (preselect && topics.includes(preselect)) {
      systemTopicSelect.value = preselect;
    }
  }

  function closeSuggest() {
    if (!suggestBox) return;
    suggestBox.classList.add("hidden");
    suggestBox.innerHTML = "";
  }

  function clearHabilitadorSelection() {
    document.querySelectorAll(".system_chk").forEach(r => r.checked = false);

    systemTopicBlock?.classList.add("hidden");
    if (systemTopicSelect) {
      systemTopicSelect.innerHTML = `<option value="" disabled selected>Selecciona…</option>`;
      systemTopicSelect.value = "";
    }

    clearCourse();

    if (globalSearch) globalSearch.value = "";
    closeSuggest();

    if (reuseSystemPreview) reuseSystemPreview.value = "";
    resetExamSelect("Selecciona Sistema…");
    setHTML(resultReuse, "");
  }

  function bindSystemAreaEvents() {
    getSystemChecks().forEach((chk) => {
      chk.addEventListener("change", async () => {
        if (chk.checked) {
          fillTopics(chk.value);
          clearCourse();
          if (globalSearch) globalSearch.value = "";
          closeSuggest();

          if (reuseSystemPreview) {
            reuseSystemPreview.value = chk.value || "";
          }

          if (getReuseMode() === "yes") {
            await filterReuseExamsBySystemOnly();
          }
        } else {
          fillTopics("");
          clearCourse();
          if (globalSearch) globalSearch.value = "";
          closeSuggest();

          if (reuseSystemPreview) {
            reuseSystemPreview.value = "";
          }

          resetExamSelect("Selecciona Sistema…");
          setHTML(resultReuse, "");
        }
      });
    });
  }

  systemTopicSelect?.addEventListener("change", async () => {
    const topic = (systemTopicSelect.value || "").trim();
    if (!topic) return;

    if (course) course.value = topic;
    setCourseLocked(true);
    course?.blur();
  });

  function buildSearchIndex() {
    const out = [];
    const obj = SYSTEM_TOPICS || {};
    Object.keys(obj).forEach((area) => {
      const titles = Array.isArray(obj[area]) ? obj[area] : [];
      titles.forEach((title) => out.push({ area, title, hay: normalizeText(`${area} ${title}`) }));
    });
    SEARCH_INDEX = out;
  }

  function openSuggest() {
    if (!suggestBox) return;
    suggestBox.classList.remove("hidden");
  }

  function renderSuggestions(items) {
    if (!suggestBox) return;

    if (!items.length) {
      suggestBox.innerHTML = `<div class="suggest-empty">No hay coincidencias.</div>`;
      openSuggest();
      return;
    }

    suggestBox.innerHTML = items.map((it, idx) => `
      <div class="suggest-item" data-idx="${idx}">
        <div class="suggest-title">${it.title}</div>
        <div class="suggest-sub">${it.area}</div>
      </div>
    `).join("");

    suggestBox.querySelectorAll(".suggest-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const i = Number(el.getAttribute("data-idx"));
        const chosen = items[i];
        if (!chosen) return;
        await applyChosenSuggestion(chosen.area, chosen.title);
        closeSuggest();
        globalSearch?.blur();
      });
    });

    openSuggest();
  }

  async function applyChosenSuggestion(area, title) {
    getSystemChecks().forEach((c) => { c.checked = (c.value === area); });
    fillTopics(area, title);

    if (systemTopicSelect) {
      systemTopicSelect.value = title;
      systemTopicSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (globalSearch) globalSearch.value = title;
  }

  let searchTimer = null;

  function bindGlobalAutocomplete() {
    if (!globalSearch || !suggestBox) return;

    globalSearch.addEventListener("input", () => {
      const q = normalizeText(globalSearch.value);
      clearTimeout(searchTimer);

      searchTimer = setTimeout(() => {
        if (!q) { closeSuggest(); return; }
        const results = SEARCH_INDEX.filter((x) => x.hay.includes(q)).slice(0, 10);
        renderSuggestions(results);
      }, 80);
    });

    globalSearch.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const q = normalizeText(globalSearch.value);
      if (!q) return;

      const first = SEARCH_INDEX.find((x) => x.hay.includes(q));
      if (first) {
        await applyChosenSuggestion(first.area, first.title);
        closeSuggest();
      }
    });

    document.addEventListener("click", (e) => {
      const inside = e.target.closest("#system_global_suggest") || e.target.closest("#system_global_search");
      if (!inside) closeSuggest();
    });
  }

  const sysModal = document.getElementById("system_edit_modal");
  const sysNameInput = document.getElementById("sys_edit_name");
  const sysTopicsList = document.getElementById("sys_topics_list");
  const sysAddTopicBtn = document.getElementById("sys_add_topic_btn");
  const sysSaveBtn = document.getElementById("sys_save_btn");
  const sysCloseBtn = document.getElementById("sys_close_btn");
  const sysErr = document.getElementById("sys_edit_err");

  function ensureSysDeleteBtn() {
    if (!sysModal) return null;
    let btn = document.getElementById("sys_delete_btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "sys_delete_btn";
      btn.className = "secondary hidden";
      btn.style.background = "#b91c1c";
      btn.textContent = "Eliminar sistema completo";
      const close = document.getElementById("sys_close_btn");
      if (close) close.insertAdjacentElement("beforebegin", btn);
      else sysModal.querySelector(".box")?.appendChild(btn);
    }
    return btn;
  }

  function ensureSysDiscardBtn() {
    if (!sysModal) return null;
    let btn = document.getElementById("sys_discard_btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "sys_discard_btn";
      btn.className = "secondary hidden";
      btn.style.background = "#6b7280";
      btn.textContent = "Descartar creación";
      const del = document.getElementById("sys_delete_btn") || ensureSysDeleteBtn();
      if (del) del.insertAdjacentElement("beforebegin", btn);
      else sysModal.querySelector(".box")?.appendChild(btn);
    }
    return btn;
  }

  function closeSystemEditor() { sysModal?.classList.remove("show"); }

  function setSystemModalButtonsVisibility() {
    const del = ensureSysDeleteBtn();
    const discard = ensureSysDiscardBtn();
    if (!del || !discard) return;

    if (editingSystemOriginal) {
      del.classList.remove("hidden");
      discard.classList.add("hidden");
    } else {
      del.classList.add("hidden");
      discard.classList.remove("hidden");
    }
  }

  function renderTopicsEditor(topics) {
    if (!sysTopicsList) return;
    sysTopicsList.innerHTML = "";

    (topics || []).forEach((t, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "10px";
      row.style.marginTop = "8px";
      row.innerHTML = `
        <input class="topic_inp" data-idx="${idx}" value="${escAttr(t)}" style="flex:1;">
        <button type="button" class="secondary topic_del" data-idx="${idx}" style="width:auto;">🗑️</button>
      `;
      sysTopicsList.appendChild(row);
    });

    sysTopicsList.querySelectorAll(".topic_del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const current = getTopicsFromEditor();
        current.splice(idx, 1);
        renderTopicsEditor(current);
      });
    });
  }

  function getTopicsFromEditor() {
    if (!sysTopicsList) return [];
    const inps = [...sysTopicsList.querySelectorAll(".topic_inp")];
    return inps.map((i) => (i.value || "").trim()).filter(Boolean);
  }

  function openSystemEditor(areaName) {
    if (!IS_ADMIN) return;
    if (!sysModal || !sysNameInput || !sysTopicsList || !sysErr) return;

    sysErr.textContent = "";
    editingSystemOriginal = areaName || "";

    const topics = (areaName && Array.isArray(SYSTEM_TOPICS[areaName])) ? SYSTEM_TOPICS[areaName] : [];
    sysNameInput.value = areaName || "";
    renderTopicsEditor(topics);

    setSystemModalButtonsVisibility();

    sysModal.classList.add("show");
    sysNameInput.focus();
  }

  sysAddTopicBtn?.addEventListener("click", () => {
    const current = getTopicsFromEditor();
    current.push("");
    renderTopicsEditor(current);
    setTimeout(() => {
      const inps = [...sysTopicsList.querySelectorAll(".topic_inp")];
      inps[inps.length - 1]?.focus();
    }, 0);
  });

  sysCloseBtn?.addEventListener("click", closeSystemEditor);
  sysModal?.addEventListener("click", (e) => { if (e.target === sysModal) closeSystemEditor(); });

  sysSaveBtn?.addEventListener("click", async () => {
    if (!IS_ADMIN) return;
    if (!sysErr || !sysNameInput) return;

    sysErr.textContent = "";
    const newName = (sysNameInput.value || "").trim();
    if (!newName) { sysErr.textContent = "El nombre del sistema no puede estar vacío."; return; }

    const newTopics = getTopicsFromEditor();

    if ((!editingSystemOriginal || editingSystemOriginal !== newName) && (SYSTEM_AREAS || []).includes(newName)) {
      sysErr.textContent = "Ya existe un sistema con ese nombre.";
      return;
    }

    const nextTopics = { ...(SYSTEM_TOPICS || {}) };
    if (editingSystemOriginal && editingSystemOriginal !== newName) delete nextTopics[editingSystemOriginal];
    nextTopics[newName] = newTopics;

    let nextAreas = [...(SYSTEM_AREAS || [])];
    if (!editingSystemOriginal) nextAreas.push(newName);
    else if (editingSystemOriginal !== newName) nextAreas = nextAreas.map((a) => (a === editingSystemOriginal ? newName : a));

    sysSaveBtn.disabled = true;
    try {
      await apiJSON("/api/admin/system_config/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_areas: nextAreas, system_topics: nextTopics })
      });

      SYSTEM_AREAS = nextAreas;
      SYSTEM_TOPICS = nextTopics;

      renderSystemAreas();
      bindSystemAreaEvents();
      buildSearchIndex();

      closeSystemEditor();
      toast("Sistema guardado");
    } catch (e) {
      sysErr.textContent = String(e.message || e);
    } finally {
      sysSaveBtn.disabled = false;
    }
  });

  document.addEventListener("click", async (e) => {
    if (!e.target.closest("#sys_delete_btn")) return;
    if (!IS_ADMIN) return;
    if (!editingSystemOriginal) return;

    const ok = confirm(`¿Seguro que quieres eliminar el sistema "${editingSystemOriginal}" y todos sus títulos?`);
    if (!ok) return;

    const nextTopics = { ...(SYSTEM_TOPICS || {}) };
    delete nextTopics[editingSystemOriginal];

    const nextAreas = (SYSTEM_AREAS || []).filter(a => a !== editingSystemOriginal);

    const delBtn = ensureSysDeleteBtn();
    if (delBtn) delBtn.disabled = true;

    try {
      await apiJSON("/api/admin/system_config/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_areas: nextAreas, system_topics: nextTopics })
      });

      SYSTEM_AREAS = nextAreas;
      SYSTEM_TOPICS = nextTopics;

      if (getSelectedSystem() === editingSystemOriginal) clearHabilitadorSelection();

      renderSystemAreas();
      bindSystemAreaEvents();
      buildSearchIndex();

      closeSystemEditor();
      toast("Sistema eliminado");
    } catch (e2) {
      if (sysErr) sysErr.textContent = String(e2.message || e2);
    } finally {
      if (delBtn) delBtn.disabled = false;
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#sys_discard_btn")) return;
    if (!IS_ADMIN) return;
    if (editingSystemOriginal) return;
    closeSystemEditor();
  });

  async function loadDefaultQuestionsAdmin() {
    if (!IS_ADMIN || !defaultQuestionsAdmin) return;

    try {
      const data = await apiJSON("/api/admin/default_questions/options", {
        credentials: "same-origin"
      });
      const questions = Array.isArray(data.questions) ? data.questions : [];

      defaultQuestionsAdmin.innerHTML = questions.map((q) => `
        <div class="question" style="margin-top:12px;">
          <label style="margin-top:0;">${q.title}</label>
          <div class="small">Tipo: ${q.type === "check" ? "Checkbox múltiple" : "Selección única"}</div>
          <div class="fixed-options">
            ${(Array.isArray(q.options) ? q.options : []).map(opt => `
              <div style="display:flex;gap:10px;align-items:center;margin-top:8px;">
                <input class="fixed-opt" value="${escAttr(opt)}" style="flex:1;">
                <button type="button" class="secondary del-fixed-opt" style="width:auto;">🗑️</button>
              </div>
            `).join("")}
          </div>
          <button type="button" class="secondary add-fixed-opt" style="margin-top:10px;">Agregar opción</button>
        </div>
      `).join("");

      defaultQuestionsAdmin.querySelectorAll(".add-fixed-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wrap = btn.parentElement.querySelector(".fixed-options");
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.gap = "10px";
          row.style.alignItems = "center";
          row.style.marginTop = "8px";
          row.innerHTML = `
            <input class="fixed-opt" placeholder="Nueva opción" style="flex:1;">
            <button type="button" class="secondary del-fixed-opt" style="width:auto;">🗑️</button>
          `;
          wrap.appendChild(row);
          row.querySelector(".del-fixed-opt")?.addEventListener("click", () => row.remove());
          row.querySelector(".fixed-opt")?.focus();
        });
      });

      defaultQuestionsAdmin.querySelectorAll(".del-fixed-opt").forEach((btn) => {
        btn.addEventListener("click", () => btn.parentElement.remove());
      });
    } catch (e) {
      if (defaultQuestionsResult) defaultQuestionsResult.innerHTML = `⚠️ ${escAttr(String(e.message || e))}`;
    }
  }

  saveDefaultQuestionsBtn?.addEventListener("click", async () => {
    if (!IS_ADMIN || !defaultQuestionsAdmin) return;

    const blocks = [...defaultQuestionsAdmin.querySelectorAll(".question")];
    const questions = blocks.map((b) => {
      const title = b.querySelector("label")?.textContent?.trim() || "";
      const options = [...b.querySelectorAll(".fixed-opt")]
        .map(x => (x.value || "").trim())
        .filter(Boolean);
      return { title, options };
    });

    saveDefaultQuestionsBtn.disabled = true;
    try {
      await apiJSON("/api/admin/default_questions/options", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions })
      });
      if (defaultQuestionsResult) defaultQuestionsResult.innerHTML = "✅ Opciones guardadas correctamente.";
      toast("Opciones fijas guardadas");
    } catch (e) {
      if (defaultQuestionsResult) defaultQuestionsResult.innerHTML = `⚠️ ${escAttr(String(e.message || e))}`;
    } finally {
      saveDefaultQuestionsBtn.disabled = false;
    }
  });

  function getBaseDataOrAlert() {
    const fac = normalizeText(facilitator?.value);
    const facCed = (facilitator_cedula?.value || "").trim();
    const system_area = getSelectedSystem();
    const system_title = getSelectedTopic();
    const date = (course_date?.value || "").trim();

    if (!fac || !facCed) {
      alert("Debes llenar: Nombre y Cédula del facilitador.");
      return null;
    }

    if (!date) {
      alert("Debes seleccionar la fecha.");
      return null;
    }

    if (!system_area) {
      alert("Debes seleccionar el Habilitador.");
      return null;
    }

    return {
      fac,
      facCed,
      date,
      system_area,
      system_title
    };
  }

  function getNormalFlowDataOrAlert() {
    const base = getBaseDataOrAlert();
    if (!base) return null;

    const c = (course?.value || "").trim();
    const desc = (courseDescription?.value || "").trim();
    const duration = (course_duration?.value || "").trim();
    const email = (facilitator_email?.value || "").trim();

    if (!c) {
      alert("Debes tener un nombre del curso.");
      return null;
    }

    if (!desc) {
      alert("Debes llenar la Descripción del curso.");
      return null;
    }

    if (!duration || !email) {
      alert("Debes llenar: Duración y Correo del facilitador.");
      return null;
    }

    if (!isValidEmail(email)) {
      alert("Correo inválido.");
      return null;
    }

    return {
      ...base,
      c,
      desc,
      duration,
      email
    };
  }

  function getReuseDataOrAlert() {
    const base = getBaseDataOrAlert();
    if (!base) return null;

    const duration = (reuse_course_duration?.value || "").trim();
    const email = (reuse_facilitator_email?.value || "").trim();
    const selectedOption = examSelect?.selectedOptions?.[0];

    if (!examSelect?.value || !selectedOption) {
      alert("Selecciona una formación.");
      return null;
    }

    if (!duration || !email) {
      alert("Debes llenar: Duración y Correo del facilitador para reutilizar.");
      return null;
    }

    if (!isValidEmail(email)) {
      alert("Correo inválido.");
      return null;
    }

    const selectedCourseName = (selectedOption.textContent || "").split(" — ")[0].trim();

    return {
      ...base,
      c: selectedCourseName || (course?.value || "").trim() || base.system_area,
      duration,
      email
    };
  }

  function makeQuestionBlockFromData(q, container) {
    const div = document.createElement("div");
    div.className = "question";
    const qType = q.type || "text";

    div.innerHTML = `
      <label>Tipo</label>
      <select class="qtype" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
        <option value="text">Texto (sin puntuación)</option>
        <option value="multiple">Opción múltiple (1 correcta)</option>
        <option value="true_false">Verdadero / Falso</option>
        <option value="check">Checkbox (varias correctas)</option>
      </select>

      <label style="margin-top:12px;">Enunciado</label>
      <input class="qtext" placeholder="Pregunta" value="${escAttr(q.title || "")}">

      <div class="score_block" style="margin-top:10px;"></div>
      <div class="opts" style="margin-top:12px;"></div>

      <button type="button" class="remove_q secondary" style="margin-top:10px;">Eliminar pregunta</button>
    `;

    container.appendChild(div);
    div.querySelector(".remove_q").onclick = () => div.remove();

    const sel = div.querySelector(".qtype");
    const opts = div.querySelector(".opts");
    const scoreBlock = div.querySelector(".score_block");
    sel.value = qType;

    const render = () => {
      opts.innerHTML = "";
      scoreBlock.innerHTML = "";

      if (sel.value === "text") {
        scoreBlock.innerHTML = `<div class="small">Esta pregunta no es calificable.</div>`;
        return;
      }

      if (sel.value === "true_false") {
        scoreBlock.innerHTML = `<div class="small">✅ Esta pregunta es calificable y vale 1 punto.</div>`;
        const correct = Number(q.correct ?? 0);

        opts.innerHTML = `
          <label style="font-weight:700;color:#9e1b1c;">Respuesta correcta</label>
          <select class="correct_tf" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
            <option value="0">VERDADERO</option>
            <option value="1">FALSO</option>
          </select>
        `;
        opts.querySelector(".correct_tf").value = String(correct);
        return;
      }

      if (sel.value === "multiple") {
        scoreBlock.innerHTML = `<div class="small">✅ Esta pregunta es calificable y vale 1 punto.</div>`;

        const options = Array.isArray(q.options) ? q.options : [];
        const count = Math.max(4, options.length || 0);

        for (let i = 0; i < count; i++) {
          const val = options[i] ? escAttr(options[i]) : "";
          opts.innerHTML += `<input class="opt" placeholder="Opción ${i + 1}" style="margin-top:8px;" value="${val}">`;
        }

        opts.innerHTML += `<div class="correct_area" style="margin-top:10px;"></div>`;
        const correctArea = opts.querySelector(".correct_area");

        const renderCorrectSelect = () => {
          const currentOptions = [...div.querySelectorAll(".opt")]
            .map((x) => (x.value || "").trim())
            .filter(Boolean);

          const max = currentOptions.length || count;

          correctArea.innerHTML = `
            <label style="font-weight:700;color:#9e1b1c;">Respuesta correcta</label>
            <select class="correct" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
              ${Array.from({ length: max }).map((_, i) => `<option value="${i}">Opción ${i + 1}</option>`).join("")}
            </select>
          `;

          const correct = Number(q.correct ?? 0);
          correctArea.querySelector(".correct").value = String(Math.min(correct, Math.max(0, max - 1)));
        };

        div.querySelectorAll(".opt").forEach((inp) => inp.addEventListener("input", renderCorrectSelect));
        renderCorrectSelect();
        return;
      }

      if (sel.value === "check") {
        scoreBlock.innerHTML = `<div class="small">✅ Esta pregunta es calificable y vale 1 punto.</div>`;

        const options = Array.isArray(q.options) ? q.options : [];
        const count = Math.max(4, options.length || 0);

        for (let i = 0; i < count; i++) {
          const val = options[i] ? escAttr(options[i]) : "";
          opts.innerHTML += `<input class="opt" placeholder="Opción ${i + 1}" style="margin-top:8px;" value="${val}">`;
        }

        opts.innerHTML += `
          <div class="correct_area" style="margin-top:10px;"></div>
          <button type="button" class="refresh_correct secondary" style="margin-top:10px;">Actualizar correctas</button>
        `;

        const correctArea = opts.querySelector(".correct_area");
        const refreshBtn = opts.querySelector(".refresh_correct");

        const renderCorrectChecks = () => {
          const currentOptions = [...div.querySelectorAll(".opt")]
            .map((x) => (x.value || "").trim())
            .filter(Boolean);

          if (!currentOptions.length) {
            correctArea.innerHTML = "<i>Primero llena las opciones y pulsa “Actualizar correctas”.</i>";
            return;
          }

          correctArea.innerHTML = `<div style="font-weight:700;color:#9e1b1c;margin-bottom:8px;">Respuestas correctas (varias)</div>`;
          currentOptions.forEach((txt, idx) => {
            const row = document.createElement("label");
            row.style.display = "block";
            row.style.marginBottom = "6px";
            row.innerHTML = `<input type="checkbox" class="correct_chk" value="${idx}"> ${txt}`;
            correctArea.appendChild(row);
          });

          const correctIdxs = Array.isArray(q.correct) ? q.correct : [];
          correctIdxs.forEach((ci) => {
            const el = correctArea.querySelector(`.correct_chk[value="${ci}"]`);
            if (el) el.checked = true;
          });
        };

        refreshBtn.onclick = renderCorrectChecks;
        renderCorrectChecks();
      }
    };

    sel.onchange = render;
    render();
  }

  function addEmptyQuestion(container) {
    makeQuestionBlockFromData({ title: "", type: "text", scored: false }, container);
  }

  function collectQuestionBlocks(container) {
    const blocks = container ? [...container.querySelectorAll(".question")] : [];
    const questions = [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const title = (b.querySelector(".qtext")?.value || "").trim();
      const type = (b.querySelector(".qtype")?.value || "").trim();
      if (!title) throw new Error(`Pregunta ${i + 1} vacía`);

      if (type === "text") {
        questions.push({ title, type: "text", scored: false });
        continue;
      }

      if (type === "true_false") {
        const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
        questions.push({ title, type: "true_false", correct, scored: true });
        continue;
      }

      const options = [...b.querySelectorAll(".opt")]
        .map((x) => (x.value || "").trim())
        .filter(Boolean);

      if (options.length < 2) throw new Error(`Pregunta ${i + 1}: mínimo 2 opciones`);

      if (type === "multiple") {
        const correct = Number(b.querySelector(".correct")?.value ?? 0);
        questions.push({ title, type: "multiple", options, correct, scored: true });
        continue;
      }

      if (type === "check") {
        const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
          .map((x) => Number(x.value))
          .filter((n) => Number.isInteger(n));
        if (!correctIdxs.length) throw new Error(`Pregunta ${i + 1}: marca al menos una correcta (check)`);
        questions.push({ title, type: "check", options, correct: correctIdxs, scored: true });
        continue;
      }

      throw new Error(`Pregunta ${i + 1}: tipo inválido`);
    }

    return questions;
  }

  function resetExamSelect(msg) {
    if (!examSelect) return;
    examSelect.innerHTML = `<option value="" selected disabled>${msg}</option>`;
  }

  async function filterReuseExamsBySystemOnly() {
    const system = getSelectedSystem();

    if (!system) {
      resetExamSelect("Selecciona un habilitador…");
      return;
    }

    resetExamSelect("Buscando formaciones…");

    try {
      const url = `/api/exams/filter?system_area=${encodeURIComponent(system)}`;
      const data = await apiJSON(url);
      const exams = Array.isArray(data.exams) ? data.exams : [];

      const selectedValue = examSelect?.value || "";

      examSelect.innerHTML = `<option value="" selected disabled>Selecciona…</option>`;

      if (!exams.length) {
        resetExamSelect("No hay formaciones previas");
        setHTML(resultReuse, `⚠️ No hay formaciones creadas para el habilitador <b>${system}</b>.`);
        return;
      }

      exams.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e.id;
        const fecha = (e.course_date || "").trim();
        const titulo = (e.system_title || "").trim();
        opt.textContent = `${e.course} — ${titulo || "Sin título"} — ${e.facilitator}${fecha ? " — " + fecha : ""} (${e.id})`;
        examSelect.appendChild(opt);
      });

      if (selectedValue) {
        const optToRestore = [...examSelect.options].find(o => o.value === selectedValue);
        if (optToRestore) examSelect.value = selectedValue;
      }

      setHTML(resultReuse, `✅ Encontradas: <b>${exams.length}</b> formación(es) para el habilitador <b>${system}</b>.`);
    } catch (e) {
      resetExamSelect("Error buscando formaciones");
      setHTML(resultReuse, `⚠️ ${escAttr(String(e.message || e))}`);
    }
  }

  addBtn?.addEventListener("click", () => addEmptyQuestion(qc));

  genBtn?.addEventListener("click", async () => {
    const top = getNormalFlowDataOrAlert();
    if (!top) return;

    let questions = [];
    try {
      questions = collectQuestionBlocks(qc);
    } catch (e) {
      alert(String(e.message || e));
      return;
    }

    genBtn.disabled = true;
    genBtn.textContent = "Generando...";

    try {
      const data = await apiJSON("/create_exam", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: top.fac,
          facilitator_cedula: top.facCed,
          course: top.c,
          course_description: top.desc,
          course_date: top.date,
          course_duration: top.duration,
          num_invites: "",
          facilitator_email: top.email,
          system_area: top.system_area,
          system_title: top.system_title,
          questions
        })
      });

      setHTML(resultBox, `✅ Formulario de asistencia creado:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
      toast("Formulario de asistencia creado");
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = "Crear Formulario de Asistencia";
    }
  });

  btnOpenForms?.addEventListener("click", async () => {
    const top = getNormalFlowDataOrAlert();
    if (!top) return;

    btnOpenForms.disabled = true;
    btnOpenForms.textContent = "Creando asistencia...";

    try {
      const data = await apiJSON("/create_exam", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: top.fac,
          facilitator_cedula: top.facCed,
          course: top.c,
          course_description: top.desc,
          course_date: top.date,
          course_duration: top.duration,
          num_invites: "",
          facilitator_email: top.email,
          system_area: top.system_area,
          system_title: top.system_title,
          questions: []
        })
      });

      setHTML(resultDirect, `✅ Asistencia creada correctamente:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
      toast("Asistencia creada");
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      btnOpenForms.disabled = false;
      btnOpenForms.textContent = "Crear asistencia";
    }
  });

  reuseBtn?.addEventListener("click", async () => {
    const top = getReuseDataOrAlert();
    if (!top) return;

    const id = examSelect?.value || "";
    if (!id) {
      alert("Selecciona una formación.");
      return;
    }

    reuseBtn.disabled = true;
    reuseBtn.textContent = "Reutilizando...";

    try {
      const data = await apiJSON(`/duplicate_exam/${id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: top.fac,
          facilitator_cedula: top.facCed,
          course: top.c,
          course_date: top.date,
          course_duration: top.duration,
          num_invites: "",
          facilitator_email: top.email,
          system_area: top.system_area,
          system_title: top.system_title
        })
      });

      if (courseDescription) {
        courseDescription.value = data.course_description || "";
      }

      show(reuseSelectedBlock);
      hide(normalFlowBlock);

      setHTML(
        resultReuse,
        `✅ Formación reutilizada con los nuevos datos.<br>
         <b>Descripción heredada:</b> ${escAttr(data.course_description || "")}<br><br>
         <a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`
      );

      toast("Formación reutilizada");
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      reuseBtn.disabled = false;
      reuseBtn.textContent = "Reutilizar formación";
    }
  });

  const modeYes = document.getElementById("mode_yes");
  const modeNo = document.getElementById("mode_no");
  const directLinkBlock = document.getElementById("direct_link_block");
  const yesSubmodeBlock = document.getElementById("yes_submode_block");
  const create0Block = document.getElementById("create0_block");

  function getMainMode() {
    if (modeYes?.checked) return "yes";
    if (modeNo?.checked) return "no";
    return "";
  }

  function getReuseMode() {
    if (reuseYes?.checked) return "yes";
    if (reuseNo?.checked) return "no";
    return "";
  }

  function toggleMainMode() {
    const m = getMainMode();

    hide(directLinkBlock);
    hide(yesSubmodeBlock);
    hide(create0Block);

    if (m === "no") {
      show(directLinkBlock);
      return;
    }

    if (m === "yes") {
      show(yesSubmodeBlock);
      show(create0Block);
      if (qc && qc.children.length === 0) addEmptyQuestion(qc);
    }
  }

  function toggleReuseMode() {
    const rm = getReuseMode();

    hide(reuseSelectedBlock);
    hide(normalFlowBlock);
    hide(directLinkBlock);
    hide(yesSubmodeBlock);
    hide(create0Block);

    if (rm === "yes") {
      show(reuseSelectedBlock);
      hide(systemTopicBlock);

      const selectedSystem = getSelectedSystem();
      if (reuseSystemPreview) {
        reuseSystemPreview.value = selectedSystem || "";
      }

      if (getSelectedSystem()) {
        filterReuseExamsBySystemOnly();
      } else {
        resetExamSelect("Selecciona Sistema…");
        setHTML(resultReuse, "");
      }
      return;
    }

    if (rm === "no") {
      if (getSelectedSystem() && (SYSTEM_TOPICS[getSelectedSystem()] || []).length) {
        show(systemTopicBlock);
      }
      show(normalFlowBlock);
      toggleMainMode();
    }
  }

  modeYes?.addEventListener("change", toggleMainMode);
  modeNo?.addEventListener("change", toggleMainMode);
  reuseYes?.addEventListener("change", toggleReuseMode);
  reuseNo?.addEventListener("change", toggleReuseMode);

  (async () => {
    clearCourse();

    await loadPublicConfig();
    await loadAdminMe();

    if (IS_ADMIN) document.body.classList.add("is-admin");
    else document.body.classList.remove("is-admin");

    applyUITexts();
    ensureAdminEditIcons();
    bindUITextEditors();

    renderSystemAreas();
    bindSystemAreaEvents();

    buildSearchIndex();
    bindGlobalAutocomplete();

    toggleReuseMode();
    toggleMainMode();

    const sys = getSelectedSystem();
    if (sys) fillTopics(sys);

    const t = getSelectedTopic();
    if (t && course) course.value = t;
    setCourseLocked(true);

    ensureSysDeleteBtn();
    ensureSysDiscardBtn();

    if (IS_ADMIN) await loadDefaultQuestionsAdmin();
  })();
})();
