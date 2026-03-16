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
    return String(s ?? "").replace(/"/g, "&quot;");
  }

  function show(el) { el?.classList.remove("hidden"); }
  function hide(el) { el?.classList.add("hidden"); }
  function setHTML(el, html) { if (el) el.innerHTML = html || ""; }

  let SYSTEM_AREAS = [];
  let SYSTEM_TOPICS = {};
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
  const num_invites = document.getElementById("num_invites");
  const facilitator_email = document.getElementById("facilitator_email");

  const systemTopicBlock = document.getElementById("system_topic_block");
  const systemTopicSelect = document.getElementById("system_topic");

  const globalSearch = document.getElementById("system_global_search");
  const suggestBox = document.getElementById("system_global_suggest");

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

      SYSTEM_TOPICS = Object.keys(topics).length ? topics : FALLBACK_SYSTEM_TOPICS;
      SYSTEM_AREAS = areas.length ? areas : Object.keys(SYSTEM_TOPICS || {});
    } catch {
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

  function pencilSvg() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
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

    if (getSubMode() === "reuse") resetExamSelect("Selecciona Sistema y Título para filtrar…");
  }

  function bindSystemAreaEvents() {
    getSystemChecks().forEach((chk) => {
      chk.addEventListener("change", async () => {
        if (chk.checked) {
          fillTopics(chk.value);
          clearCourse();
          if (globalSearch) globalSearch.value = "";
          closeSuggest();

          if (getSubMode() === "reuse") resetExamSelect("Selecciona un título para ver exámenes…");
        } else {
          fillTopics("");
          clearCourse();
          if (globalSearch) globalSearch.value = "";
          closeSuggest();

          if (getSubMode() === "reuse") resetExamSelect("Selecciona un sistema…");
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

    if (getSubMode() === "reuse") await filterReuseExamsBySystemAndTitle();
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
      const res = await fetch("/api/admin/system_config/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_areas: nextAreas, system_topics: nextTopics })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) { sysErr.textContent = data.error || "No se pudo guardar."; return; }

      SYSTEM_AREAS = nextAreas;
      SYSTEM_TOPICS = nextTopics;

      renderSystemAreas();
      bindSystemAreaEvents();
      buildSearchIndex();

      closeSystemEditor();
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
      const res = await fetch("/api/admin/system_config/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_areas: nextAreas, system_topics: nextTopics })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (sysErr) sysErr.textContent = data.error || "No se pudo eliminar.";
        return;
      }

      SYSTEM_AREAS = nextAreas;
      SYSTEM_TOPICS = nextTopics;

      if (getSelectedSystem() === editingSystemOriginal) {
        clearHabilitadorSelection();
      }

      renderSystemAreas();
      bindSystemAreaEvents();
      buildSearchIndex();

      closeSystemEditor();
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

  const modeYes = document.getElementById("mode_yes");
  const modeNo = document.getElementById("mode_no");
  const directLinkBlock = document.getElementById("direct_link_block");
  const yesSubmodeBlock = document.getElementById("yes_submode_block");
  const btnOpenForms = document.getElementById("btn_open_forms");

  const subCreate0 = document.getElementById("sub_create0");
  const subReuse = document.getElementById("sub_reuse");
  const create0Block = document.getElementById("create0_block");
  const reuseBlock = document.getElementById("reuse_block");

  function clearSubModeRadios() {
    if (subCreate0) subCreate0.checked = false;
    if (subReuse) subReuse.checked = false;
  }
  function getMainMode() {
    if (modeYes?.checked) return "yes";
    if (modeNo?.checked) return "no";
    return "";
  }
  function getSubMode() {
    if (subCreate0?.checked) return "create0";
    if (subReuse?.checked) return "reuse";
    return "";
  }

  function toggleMainMode() {
    const m = getMainMode();

    hide(directLinkBlock);
    hide(yesSubmodeBlock);
    hide(create0Block);
    hide(reuseBlock);
    hide(editArea);

    if (m === "no") {
      show(directLinkBlock);
      clearSubModeRadios();
      return;
    }
    if (m === "yes") {
      show(yesSubmodeBlock);
      if (!getSubMode() && subCreate0) subCreate0.checked = true;
      toggleSubMode();
    }
  }

  async function toggleSubMode() {
    const sm = getSubMode();

    hide(create0Block);
    hide(reuseBlock);
    hide(editArea);

    if (sm === "create0") {
      show(create0Block);
      if (qc && qc.children.length === 0) addEmptyQuestion(qc);
      return;
    }

    if (sm === "reuse") {
      show(reuseBlock);
      resetExamSelect("Selecciona Sistema y Título para filtrar…");
      setHTML(resultReuse, "");

      if (getSelectedSystem() && getSelectedTopic()) {
        await filterReuseExamsBySystemAndTitle();
      }
    }
  }

  modeYes?.addEventListener("change", toggleMainMode);
  modeNo?.addEventListener("change", toggleMainMode);
  subCreate0?.addEventListener("change", toggleSubMode);
  subReuse?.addEventListener("change", toggleSubMode);

  function getExamTopDataOrAlert() {
    const fac = normalizeText(facilitator?.value);
    const facCed = (facilitator_cedula?.value || "").trim();

    const system_area = getSelectedSystem();
    const system_title = getSelectedTopic();

    const desc = (courseDescription?.value || "").trim();
    const date = (course_date?.value || "").trim();
    const duration = (course_duration?.value || "").trim();
    const invites = (num_invites?.value || "").trim();
    const email = (facilitator_email?.value || "").trim();

    if (!fac || !facCed) { alert("Debes llenar: Facilitador y Cédula del facilitador."); return null; }
    if (!system_area || !system_title) { alert("Debes seleccionar: Habilitador (Sistema) y Título de la formación."); return null; }
    if (!date || !duration || !invites || !email) { alert("Debes llenar: Fecha, Duración, Invitados y Correo del facilitador."); return null; }
    if (!email.includes("@") || !email.includes(".")) { alert("Correo inválido."); return null; }

    const c = system_title;

    return { fac, facCed, c, desc, date, duration, invites, email, system_area, system_title };
  }

  const qc = document.getElementById("questions_container");
  const resultBox = document.getElementById("result");
  const resultDirect = document.getElementById("result_direct");
  const addBtn = document.getElementById("add_question");
  const genBtn = document.getElementById("generate_exam");

  const examSelect = document.getElementById("exam_select");
  const reuseBtn = document.getElementById("btn_reuse");
  const editBtn = document.getElementById("btn_edit");

  const editArea = document.getElementById("edit_area");
  const qcEdit = document.getElementById("questions_container_edit");
  const addBtnEdit = document.getElementById("add_question_edit");
  const saveBtn = document.getElementById("save_edit");

  const facilitatorEdit = document.getElementById("facilitator_edit");
  const facilitatorCedulaEdit = document.getElementById("facilitator_cedula_edit");
  const courseEdit = document.getElementById("course_edit");

  const resultReuse = document.getElementById("result_reuse");
  const resultEdit = document.getElementById("result_edit");

  let editingExamId = null;

  function resetExamSelect(msg) {
    if (!examSelect) return;
    examSelect.innerHTML = `<option value="" selected disabled>${msg}</option>`;
  }

  async function filterReuseExamsBySystemAndTitle() {
    const system = getSelectedSystem();
    const title = getSelectedTopic();
    if (!system) { resetExamSelect("Selecciona un sistema…"); return; }
    if (!title) { resetExamSelect("Selecciona un título…"); return; }

    resetExamSelect("Buscando exámenes…");

    try {
      const url = `/api/exams/filter?system_area=${encodeURIComponent(system)}&system_title=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const exams = data.exams || [];

      examSelect.innerHTML = `<option value="" selected disabled>Selecciona…</option>`;

      if (!exams.length) {
        resetExamSelect("No hay formación para reutilizar");
        return;
      }

      exams.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e.id;
        const fecha = (e.course_date || "").trim();
        opt.textContent = `${e.course} — ${e.facilitator}${fecha ? " — " + fecha : ""} (${e.id})`;
        examSelect.appendChild(opt);
      });

      setHTML(resultReuse, `✅ Encontrados: <b>${exams.length}</b> examen(es) para <b>${system}</b> → <b>${title}</b>.`);
    } catch {
      resetExamSelect("Error buscando exámenes");
      setHTML(resultReuse, "⚠️ No se pudo filtrar. Revisa conexión / endpoint /api/exams/filter");
    }
  }

 function makeQuestionBlockFromData(q, container) {
  const div = document.createElement("div");
  div.className = "question";

  const qType = q.type || "text";

  div.innerHTML = `
    <label style="margin-top:0;">Enunciado</label>
    <input class="qtext" placeholder="Pregunta" value="${escAttr(q.title || "")}">

    <label>Tipo</label>
    <select class="qtype" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
      <option value="text">Texto (sin puntuación)</option>
      <option value="multiple">Opción múltiple (1 correcta)</option>
      <option value="true_false">Verdadero / Falso</option>
      <option value="check">Checkbox (varias correctas)</option>
    </select>

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
      scoreBlock.innerHTML = `<div class="small"></div>`;
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
      scoreBlock.innerHTML = `<div class="small"></div>`;

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
        correctArea.querySelector(".correct").value = String(Math.min(correct, max - 1));
      };

      div.querySelectorAll(".opt").forEach((inp) => {
        inp.addEventListener("input", renderCorrectSelect);
      });

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

  addBtn?.addEventListener("click", () => {
    if (getSubMode() !== "create0") return;
    addEmptyQuestion(qc);
  });

  genBtn?.addEventListener("click", async () => {
    const top = getExamTopDataOrAlert();
    if (!top) return;

    const questions = [];
    const blocks = qc ? [...qc.querySelectorAll(".question")] : [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const title = (b.querySelector(".qtext")?.value || "").trim();
      const type = (b.querySelector(".qtype")?.value || "").trim();
      if (!title) return alert(`Pregunta ${i + 1} vacía`);

      if (type === "text") {
        questions.push({ title, type: "text", scored: false });
        continue;
      }

      if (type === "true_false") {
        const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
        questions.push({ title, type: "true_false", correct, scored: true });
        continue;
      }

 const options = [...b.querySelectorAll(".opt")].map((x) => (x.value || "").trim()).filter(Boolean);
if (options.length < 2) return alert(`Pregunta ${i + 1}: mínimo 2 opciones`);

if (type === "multiple") {
  const correct = Number(b.querySelector(".correct")?.value ?? 0);
  questions.push({ title, type: "multiple", options, correct, scored: true });
  continue;
}

if (type === "check") {
  const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
    .map((x) => Number(x.value))
    .filter((n) => Number.isInteger(n));
  if (!correctIdxs.length) return alert(`Pregunta ${i + 1}: marca al menos una correcta (check)`);
  questions.push({ title, type: "check", options, correct: correctIdxs, scored: true });
}
    }

    genBtn.disabled = true;
    genBtn.textContent = "Generando...";

    try {
      const res = await fetch("/create_exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: top.fac,
          facilitator_cedula: top.facCed,
          course: top.c,
          course_description: top.desc,
          course_date: top.date,
          course_duration: top.duration,
          num_invites: top.invites,
          facilitator_email: top.email,
          system_area: top.system_area,
          system_title: top.system_title,
          questions
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "Error al crear");

      setHTML(resultBox, `✅ Formulario de asistencia creado:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = "Crear Formulario de Asistencia";
    }
  });

  btnOpenForms?.addEventListener("click", async () => {
    const top = getExamTopDataOrAlert();
    if (!top) return;

    btnOpenForms.disabled = true;
    btnOpenForms.textContent = "Creando asistencia...";

    try {
      const res = await fetch("/create_exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: top.fac,
          facilitator_cedula: top.facCed,
          course: top.c,
          course_description: top.desc,
          course_date: top.date,
          course_duration: top.duration,
          num_invites: top.invites,
          facilitator_email: top.email,
          system_area: top.system_area,
          system_title: top.system_title,
          questions: []
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "No se pudo crear la asistencia");

      setHTML(resultDirect, `✅ Asistencia creada correctamente:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
    } finally {
      btnOpenForms.disabled = false;
      btnOpenForms.textContent = "Crear asistencia";
    }
  });

  reuseBtn?.addEventListener("click", async () => {
    const top = getExamTopDataOrAlert();
    if (!top) return;

    const id = examSelect?.value || "";
    if (!id) return alert("Selecciona un examen.");

    reuseBtn.disabled = true;
    reuseBtn.textContent = "Reutilizando...";

    try {
      const res = await fetch(`/duplicate_exam/${id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "No se pudo reutilizar");

      setHTML(resultReuse, `✅ Examen reutilizado (nuevo link):<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);

      if (getSelectedSystem() && getSelectedTopic()) {
        await filterReuseExamsBySystemAndTitle();
      }
    } finally {
      reuseBtn.disabled = false;
      reuseBtn.textContent = "Reutilizar";
    }
  });

  editBtn?.addEventListener("click", async () => {
    const id = examSelect?.value || "";
    if (!id) return alert("Selecciona un examen.");

    editBtn.disabled = true;
    editBtn.textContent = "Cargando...";

    try {
      const res = await fetch(`/api/exam/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "No se pudo cargar");

      editingExamId = id;

      if (facilitatorEdit) facilitatorEdit.value = data.facilitator || "";
      if (facilitatorCedulaEdit) facilitatorCedulaEdit.value = data.facilitator_cedula || "";
      if (courseEdit) courseEdit.value = data.course || "";

      if (data.system_area) {
        getSystemChecks().forEach((c) => { c.checked = (c.value === data.system_area); });
        fillTopics(data.system_area, data.system_title || "");
      } else {
        fillTopics("", "");
      }

      if (course) {
        course.value = data.system_title || "";
        setCourseLocked(true);
      }

      if (qcEdit) {
        qcEdit.innerHTML = "";
        (data.questions || []).forEach((q) => makeQuestionBlockFromData(q, qcEdit));
      }

      show(editArea);
      setHTML(resultEdit, `✏️ Editando Formulario de Asistencias: <b>${id}</b><br>Link:<br><a href="/exam/${id}" target="_blank">/exam/${id}</a>`);
    } finally {
      editBtn.disabled = false;
      editBtn.textContent = "Editar examen";
    }
  });

  addBtnEdit?.addEventListener("click", () => addEmptyQuestion(qcEdit));

  saveBtn?.addEventListener("click", async () => {
    if (!editingExamId) return alert("No hay examen cargado para editar.");

    const fac = normalizeText(facilitatorEdit?.value);
    const facCed = (facilitatorCedulaEdit?.value || "").trim();
    const c = (courseEdit?.value || "").trim();
    if (!fac || !facCed || !c) return alert("Campos obligatorios.");

    const blocks = qcEdit ? [...qcEdit.querySelectorAll(".question")] : [];
    if (!blocks.length) return alert("Debe existir al menos una pregunta.");

    const questions = [];
    try {
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
const options = [...b.querySelectorAll(".opt")].map((x) => (x.value || "").trim()).filter(Boolean);
if (options.length < 2) throw new Error(`Pregunta ${i + 1}: mínimo 2 opciones`);

if (type === "multiple") {
  const correct = Number(b.querySelector(".correct")?.value ?? 0);
  questions.push({ title, type: "multiple", options, correct, scored: true });
  continue;
}

if (type === "check") {s
  const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
    .map((x) => Number(x.value))
    .filter((n) => Number.isInteger(n));
  if (!correctIdxs.length) throw new Error(`Pregunta ${i + 1}: marca al menos una correcta (check)`);
  questions.push({ title, type: "check", options, correct: correctIdxs, scored: true });
  continue;
}

        if (type === "check") {
          if (scored) {
            const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
              .map((x) => Number(x.value))
              .filter((n) => Number.isInteger(n));
            if (!correctIdxs.length) throw new Error(`Pregunta ${i + 1}: marca al menos una correcta (check)`);
            questions.push({ title, type: "check", options, correct: correctIdxs, scored: true });
          } else {
            questions.push({ title, type: "check", options, scored: false });
          }
          continue;
        }
        throw new Error(`Pregunta ${i + 1}: tipo inválido`);
      }
    } catch (e) {
      return alert(String(e.message || e));
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";

    try {
      const res = await fetch(`/api/exam/${editingExamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilitator: fac,
          facilitator_cedula: facCed,
          course: c,
          course_description: (courseDescription?.value || "").trim(),
          course_date: (course_date?.value || "").trim(),
          course_duration: (course_duration?.value || "").trim(),
          num_invites: (num_invites?.value || "").trim(),
          facilitator_email: (facilitator_email?.value || "").trim(),
          system_area: getSelectedSystem(),
          system_title: getSelectedTopic(),
          questions
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.error || "No se pudo guardar");

      setHTML(resultEdit, `✅ Cambios guardados.<br>Link del examen:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);

      if (getSelectedSystem() && getSelectedTopic()) {
        await filterReuseExamsBySystemAndTitle();
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Guardar cambios (Editar)";
    }
  });

  (async () => {
    clearCourse();

    await loadPublicConfig();
    await loadAdminMe();

    if (IS_ADMIN) document.body.classList.add("is-admin");
    else document.body.classList.remove("is-admin");

    renderSystemAreas();
    bindSystemAreaEvents();

    buildSearchIndex();
    bindGlobalAutocomplete();

    toggleMainMode();

    const sys = getSelectedSystem();
    if (sys) fillTopics(sys);

    const t = getSelectedTopic();
    if (t && course) course.value = t;
    setCourseLocked(true);

    ensureSysDeleteBtn();
    ensureSysDiscardBtn();
  })();

})();
