function normalizeText(text) {
  return (text || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* =========================================================
   MAIN MODE (Sí / No)
   ========================================================= */
const modeYes = document.getElementById("mode_yes");
const modeNo  = document.getElementById("mode_no");

const directLinkBlock = document.getElementById("direct_link_block");
const yesSubmodeBlock = document.getElementById("yes_submode_block");

const btnOpenForms = document.getElementById("btn_open_forms");
const FORMS_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeQhPUPr_23-KesWKXOmpNqM4Aot_DJZnHbeB-ja5KLywnS5g/viewform";

/* =========================================================
   SUB MODE
   ========================================================= */
const subCreate0 = document.getElementById("sub_create0");
const subReuse   = document.getElementById("sub_reuse");

const create0Block = document.getElementById("create0_block");
const reuseBlock   = document.getElementById("reuse_block");

/* =========================================================
   CAMPOS PRINCIPALES
   ========================================================= */
const facilitator = document.getElementById("facilitator");
const facilitator_cedula = document.getElementById("facilitator_cedula");
const course = document.getElementById("course");
const courseDescription = document.getElementById("course_description");

const course_date = document.getElementById("course_date");
const course_duration = document.getElementById("course_duration");
const num_invites = document.getElementById("num_invites");
const facilitator_email = document.getElementById("facilitator_email");

/* =========================================================
   SISTEMA ASOCIADA + TÍTULOS
   ========================================================= */
const systemChecks = [...document.querySelectorAll(".system_chk")];
const systemTopicBlock = document.getElementById("system_topic_block");
const systemTopicSelect = document.getElementById("system_topic");

const SYSTEM_TOPICS = {
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
  "Escuela": []
};

function setExclusiveSystem(clicked){
  systemChecks.forEach(c => {
    if (c !== clicked) c.checked = false;
  });
}

function fillTopics(systemValue, preselect=""){
  systemTopicSelect.innerHTML = `<option value="" disabled selected>Selecciona…</option>`;

  const topics = SYSTEM_TOPICS[systemValue] || [];
  if (!systemValue || !topics.length) {
    systemTopicBlock.classList.add("hidden");
    return;
  }

  topics.forEach(t => {
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

systemTopicSelect?.addEventListener("change", () => {
  const topic = (systemTopicSelect.value || "").trim();
  if (!topic) return;
  course.value = topic;
  course.focus();
  course.setSelectionRange(course.value.length, course.value.length);
  course.scrollIntoView({ behavior: "smooth", block: "center" });
});

systemChecks.forEach(chk => {
  chk.addEventListener("change", () => {
    if (chk.checked) {
      setExclusiveSystem(chk);
      fillTopics(chk.value);
    } else {
      fillTopics("");
    }
  });
});

function getSelectedSystem(){
  const checked = systemChecks.find(c => c.checked);
  return checked ? checked.value : "";
}
function getSelectedTopic(){
  return (systemTopicSelect?.value || "").trim();
}

/* =========================================================
   CREATE / EDIT UI
   ========================================================= */
const qc = document.getElementById("questions_container");
const result = document.getElementById("result");
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
let examsLoadedOnce = false;

function show(el){ el?.classList.remove("hidden"); }
function hide(el){ el?.classList.add("hidden"); }
function setHTML(el, html){ if(el) el.innerHTML = html || ""; }

function clearSubModeRadios(){
  if (subCreate0) subCreate0.checked = false;
  if (subReuse) subReuse.checked = false;
}

function getMainMode(){
  if (modeYes?.checked) return "yes";
  if (modeNo?.checked) return "no";
  return "";
}
function getSubMode(){
  if (subCreate0?.checked) return "create0";
  if (subReuse?.checked) return "reuse";
  return "";
}

/* ======= Validar datos ======= */
function getExamTopDataOrAlert(){
  const fac = normalizeText(facilitator?.value);
  const facCed = (facilitator_cedula?.value || "").trim();
  const c = (course?.value || "").trim();
  const desc = (courseDescription?.value || "").trim();

  const date = (course_date?.value || "").trim();
  const duration = (course_duration?.value || "").trim();
  const invites = (num_invites?.value || "").trim();
  const email = (facilitator_email?.value || "").trim();

  if (!fac || !facCed || !c) {
    alert("Debes llenar: Facilitador, Cédula del facilitador y Curso.");
    return null;
  }
  if (!date || !duration || !invites || !email) {
    alert("Debes llenar: Fecha, Duración, Invitados y Correo del facilitador.");
    return null;
  }
  if (!email.includes("@") || !email.includes(".")) {
    alert("Correo inválido.");
    return null;
  }

  return {
    fac, facCed, c, desc,
    date, duration, invites, email,
    system_area: getSelectedSystem(),
    system_title: getSelectedTopic()
  };
}

/* ======= Toggle Logic ======= */
function toggleMainMode(){
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
    if (!getSubMode()) {
      if (subCreate0) subCreate0.checked = true;
    }
    toggleSubMode();
  }
}

async function toggleSubMode(){
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
    if (!examsLoadedOnce) {
      await loadExamsList();
      examsLoadedOnce = true;
    }
    return;
  }
}

modeYes?.addEventListener("change", toggleMainMode);
modeNo?.addEventListener("change", toggleMainMode);
subCreate0?.addEventListener("change", toggleSubMode);
subReuse?.addEventListener("change", toggleSubMode);

btnOpenForms?.addEventListener("click", () => window.open(FORMS_URL, "_blank"));
toggleMainMode();

/* =========================================================
   CREATE FROM 0 (custom)
   ✅ No existe scored. Todas las custom no-text son calificables (1 punto).
   ========================================================= */
function makeQuestionBlockFromData(q, container) {
  const div = document.createElement("div");
  div.className = "question";

  const qType = q.type || "text";

  div.innerHTML = `
    <label style="margin-top:0;">Enunciado</label>
    <input class="qtext" placeholder="Pregunta" value="${(q.title || "").replace(/"/g,'&quot;')}">

    <label>Tipo</label>
    <select class="qtype" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
      <option value="text">Texto (sin puntuación)</option>
      <option value="multiple">Opción múltiple (1 correcta)</option>
      <option value="true_false">Verdadero / Falso</option>
      <option value="check">Checkbox (varias correctas)</option>
    </select>

    <div class="opts" style="margin-top:12px;"></div>

    <button type="button" class="remove_q secondary" style="margin-top:10px;">Eliminar pregunta</button>
  `;

  container.appendChild(div);
  div.querySelector(".remove_q").onclick = () => div.remove();

  const sel = div.querySelector(".qtype");
  const opts = div.querySelector(".opts");
  sel.value = qType;

  const render = () => {
    opts.innerHTML = "";

    if (sel.value === "text") return;

    if (sel.value === "true_false") {
      const correct = Number(q.correct ?? 0);
      opts.innerHTML = `
        <div class="small">✅ Esta pregunta siempre vale 1 punto. La correcta es obligatoria.</div>
        <label style="font-weight:700;color:#9e1b1c;">Respuesta correcta</label>
        <select class="correct_tf" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
          <option value="0">VERDADERO</option>
          <option value="1">FALSO</option>
        </select>
      `;
      opts.querySelector(".correct_tf").value = String(correct);
      return;
    }

    // multiple / check: opciones
    const options = Array.isArray(q.options) ? q.options : [];
    const count = Math.max(4, options.length || 0);

    opts.innerHTML += `<div class="small">✅ Esta pregunta siempre vale 1 punto. La(s) correcta(s) son obligatorias.</div>`;

    for (let i = 0; i < count; i++) {
      const val = options[i] ? String(options[i]).replace(/"/g,'&quot;') : "";
      opts.innerHTML += `<input class="opt" placeholder="Opción ${i+1}" style="margin-top:8px;" value="${val}">`;
    }

    if (sel.value === "multiple") {
      opts.innerHTML += `<div class="correct_area" style="margin-top:10px;"></div>`;
      const correctArea = opts.querySelector(".correct_area");

      const renderCorrectSelect = () => {
        const currentOptions = [...div.querySelectorAll(".opt")].map(x => (x.value || "").trim()).filter(Boolean);
        const max = Math.max(2, currentOptions.length);

        correctArea.innerHTML = `
          <label style="font-weight:700;color:#9e1b1c;">Respuesta correcta</label>
          <select class="correct" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
            ${Array.from({length:max}).map((_,i)=>`<option value="${i}">Opción ${i+1}</option>`).join("")}
          </select>
          <div class="small">Tip: llena opciones y luego elige la correcta.</div>
        `;
        const correct = Number(q.correct ?? 0);
        correctArea.querySelector(".correct").value = String(Math.min(correct, max-1));
      };

      // si cambian opciones, refrescar la lista de correctas
      div.querySelectorAll(".opt").forEach(inp => inp.addEventListener("input", renderCorrectSelect));
      renderCorrectSelect();
      return;
    }

    if (sel.value === "check") {
      opts.innerHTML += `
        <div class="correct_area" style="margin-top:10px;"></div>
        <button type="button" class="refresh_correct secondary" style="margin-top:10px;">Actualizar correctas</button>
      `;

      const correctArea = opts.querySelector(".correct_area");
      const refreshBtn = opts.querySelector(".refresh_correct");

      const renderCorrectChecks = () => {
        const currentOptions = [...div.querySelectorAll(".opt")].map(x => (x.value || "").trim()).filter(Boolean);
        correctArea.innerHTML = "";
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
        correctIdxs.forEach(ci => {
          const el = correctArea.querySelector(`.correct_chk[value="${ci}"]`);
          if (el) el.checked = true;
        });
      };

      refreshBtn.onclick = renderCorrectChecks;
      renderCorrectChecks();
      return;
    }
  };

  sel.onchange = render;
  render();
}

function addEmptyQuestion(container){
  makeQuestionBlockFromData({ title:"", type:"text" }, container);
}

addBtn?.addEventListener("click", () => {
  if (getSubMode() !== "create0") return;
  addEmptyQuestion(qc);
});

genBtn?.addEventListener("click", async () => {
  const top = getExamTopDataOrAlert();
  if (!top) return;

  const questions = [];
  const blocks = [...qc.querySelectorAll(".question")];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const title = (b.querySelector(".qtext")?.value || "").trim();
    const type = (b.querySelector(".qtype")?.value || "").trim();
    if (!title) return alert(`Pregunta ${i+1} vacía`);

    if (type === "text") {
      questions.push({ title, type:"text" });
      continue;
    }

    if (type === "true_false") {
      const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
      questions.push({ title, type:"true_false", correct });
      continue;
    }

    const options = [...b.querySelectorAll(".opt")].map(x => (x.value||"").trim()).filter(Boolean);
    if (options.length < 2) return alert(`Pregunta ${i+1}: mínimo 2 opciones`);

    if (type === "multiple") {
      const correct = Number(b.querySelector(".correct")?.value ?? 0);
      questions.push({ title, type:"multiple", options, correct });
      continue;
    }

    if (type === "check") {
      const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
        .map(x=>Number(x.value))
        .filter(n=>Number.isInteger(n));
      if (!correctIdxs.length) return alert(`Pregunta ${i+1}: marca al menos una correcta (check)`);
      questions.push({ title, type:"check", options, correct: correctIdxs });
      continue;
    }

    return alert(`Pregunta ${i+1}: tipo inválido`);
  }

  genBtn.disabled = true;
  genBtn.textContent = "Generando...";

  try {
    const res = await fetch("/create_exam", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
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

    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert(data.error || "Error al crear");

    setHTML(result, `✅ Examen creado:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = "Generar evaluaciones";
  }
});

/* =========================================================
   REUTILIZAR / EDITAR (solo custom)
   ========================================================= */
async function loadExamsList(){
  try {
    const res = await fetch("/api/exams");
    const data = await res.json().catch(()=>({}));
    const exams = data.exams || [];

    examSelect.innerHTML = `<option value="" selected disabled>Selecciona…</option>`;
    if (!exams.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.disabled = true;
      opt.textContent = "No hay exámenes aún";
      examSelect.appendChild(opt);
      return;
    }

    exams.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.course} — ${e.facilitator} (${e.id})`;
      examSelect.appendChild(opt);
    });
  } catch (e) {
    examSelect.innerHTML = `<option value="" selected disabled>Error cargando exámenes</option>`;
  }
}

reuseBtn?.addEventListener("click", async () => {
  const top = getExamTopDataOrAlert();
  if (!top) return;

  const id = examSelect.value;
  if (!id) return alert("Selecciona un examen.");

  reuseBtn.disabled = true;
  reuseBtn.textContent = "Reutilizando...";

  try {
    const res = await fetch(`/duplicate_exam/${id}`, { method:"POST" });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert(data.error || "No se pudo reutilizar");

    setHTML(resultReuse, `✅ Examen reutilizado (nuevo link):<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
    await loadExamsList();
    examsLoadedOnce = true;
  } finally {
    reuseBtn.disabled = false;
    reuseBtn.textContent = "Reutilizar";
  }
});

editBtn?.addEventListener("click", async () => {
  const id = examSelect.value;
  if (!id) return alert("Selecciona un examen.");

  editBtn.disabled = true;
  editBtn.textContent = "Cargando...";

  try {
    const res = await fetch(`/api/exam/${id}`);
    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert(data.error || "No se pudo cargar");

    editingExamId = id;

    facilitatorEdit.value = data.facilitator || "";
    facilitatorCedulaEdit.value = data.facilitator_cedula || "";
    courseEdit.value = data.course || "";

    qcEdit.innerHTML = "";
    (data.questions || []).forEach(q => makeQuestionBlockFromData(q, qcEdit));

    show(editArea);
    setHTML(resultEdit, `✏️ Editando examen: <b>${id}</b><br>Link:<br><a href="/exam/${id}" target="_blank">/exam/${id}</a>`);
  } finally {
    editBtn.disabled = false;
    editBtn.textContent = "Editar examen";
  }
});

addBtnEdit?.addEventListener("click", () => addEmptyQuestion(qcEdit));

saveBtn?.addEventListener("click", async () => {
  if (!editingExamId) return alert("No hay examen cargado para editar.");

  const fac = normalizeText(facilitatorEdit.value);
  const facCed = (facilitatorCedulaEdit.value || "").trim();
  const c = (courseEdit.value || "").trim();

  if (!fac || !facCed || !c) return alert("Campos obligatorios.");

  const blocks = [...qcEdit.querySelectorAll(".question")];
  if (!blocks.length) return alert("Debe existir al menos una pregunta.");

  const questions = [];

  try {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const title = (b.querySelector(".qtext")?.value || "").trim();
      const type = (b.querySelector(".qtype")?.value || "").trim();
      if (!title) throw new Error(`Pregunta ${i+1} vacía`);

      if (type === "text") {
        questions.push({ title, type:"text" });
        continue;
      }

      if (type === "true_false") {
        const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
        questions.push({ title, type:"true_false", correct });
        continue;
      }

      const options = [...b.querySelectorAll(".opt")].map(x => (x.value||"").trim()).filter(Boolean);
      if (options.length < 2) throw new Error(`Pregunta ${i+1}: mínimo 2 opciones`);

      if (type === "multiple") {
        const correct = Number(b.querySelector(".correct")?.value ?? 0);
        questions.push({ title, type:"multiple", options, correct });
        continue;
      }

      if (type === "check") {
        const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
          .map(x => Number(x.value))
          .filter(n => Number.isInteger(n));
        if (!correctIdxs.length) throw new Error(`Pregunta ${i+1}: marca al menos una correcta (check)`);
        questions.push({ title, type:"check", options, correct: correctIdxs });
        continue;
      }

      throw new Error(`Pregunta ${i+1}: tipo inválido`);
    }
  } catch (e) {
    return alert(String(e.message || e));
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    const res = await fetch(`/api/exam/${editingExamId}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        facilitator: fac,
        facilitator_cedula: facCed,
        course: c,
        questions
      })
    });

    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert(data.error || "No se pudo guardar");

    setHTML(resultEdit, `✅ Cambios guardados.<br>Link del examen:<br><a href="${data.exam_url}" target="_blank">${data.exam_url}</a>`);
    await loadExamsList();
    examsLoadedOnce = true;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar cambios (Editar)";
  }
});
