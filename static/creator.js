function normalizeText(text) {
  return (text || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ======= MAIN MODE (Sí / No) ======= */
const modeYes = document.getElementById("mode_yes");
const modeNo  = document.getElementById("mode_no");

const directLinkBlock = document.getElementById("direct_link_block");
const yesSubmodeBlock = document.getElementById("yes_submode_block");

/* ======= SUB MODE (Crear0 / Reutilizar) ======= */
const subCreate0 = document.getElementById("sub_create0");
const subReuse   = document.getElementById("sub_reuse");

const create0Block = document.getElementById("create0_block");
const reuseBlock   = document.getElementById("reuse_block");

/* ======= SHARED EXAM FIELDS (TOP) ======= */
const facilitator = document.getElementById("facilitator");
const facilitator_cedula = document.getElementById("facilitator_cedula");
const course = document.getElementById("course");

// ✅ NUEVO: CAMPOS EXTRA
const course_date = document.getElementById("course_date");
const course_duration = document.getElementById("course_duration");
const num_invites = document.getElementById("num_invites");
const facilitator_email = document.getElementById("facilitator_email");

/* ======= CREATE 0 ELEMENTS ======= */
const qc = document.getElementById("questions_container");
const result = document.getElementById("result");
const addBtn = document.getElementById("add_question");
const genBtn = document.getElementById("generate_exam");

/* ======= REUSE/EDIT ELEMENTS ======= */
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

/* ======= Helpers UI ======= */
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

/* ======= Validar datos del examen (siempre) ======= */
function getExamTopDataOrAlert(){
  const fac = normalizeText(facilitator?.value);
  const facCed = (facilitator_cedula?.value || "").trim();
  const c = (course?.value || "").trim();

  // ✅ NUEVO
  const date = (course_date?.value || "").trim();
  const duration = (course_duration?.value || "").trim();
  const invites = (num_invites?.value || "").trim();
  const email = (facilitator_email?.value || "").trim();

  if (!fac || !facCed || !c) {
    alert("Debes llenar: Facilitador, Cédula del facilitador y Curso.");
    return null;
  }

  // ✅ NUEVO
  if (!date || !duration || !invites || !email) {
    alert("Debes llenar: Fecha, Duración, Invitados y Correo del facilitador.");
    return null;
  }

  if (!email.includes("@") || !email.includes(".")) {
    alert("Correo inválido.");
    return null;
  }

  return { fac, facCed, c, date, duration, invites, email };
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

toggleMainMode();

/* =========================================================
   ===============  CREATE FROM 0 (custom)  ================
   ========================================================= */

function makeQuestionBlockFromData(q, container) {
  const div = document.createElement("div");
  div.className = "question";

  const qType = q.type || "text";
  const scored = (q.scored === true);

  div.innerHTML = `
    <label style="margin-top:0;">Enunciado</label>
    <input class="qtext" placeholder="Pregunta" value="${(q.title || "").replace(/"/g,'&quot;')}">

    <label>Tipo</label>
    <select class="qtype" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
      <option value="text">Texto (sin puntuación)</option>
      <option value="multiple">Opción múltiple (1 correcta)</option>
      <option value="true_false">Verdadero / Falso</option>
      <option value="check">Checkbox (encuesta o varias correctas)</option>
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

    if (sel.value === "text") return;

    if (sel.value === "true_false") {
      scoreBlock.innerHTML = `<div class="small">✅ Calificable (5 puntos). La respuesta correcta es obligatoria.</div>`;
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

    scoreBlock.innerHTML = `
      <label style="display:flex;align-items:center;gap:10px;margin-top:0;color:#111827;">
        <input type="checkbox" class="scored_toggle" ${scored ? "checked" : ""} style="width:auto;">
        Calificable (5 puntos)
      </label>
      <div class="small">Si está activo, requiere respuesta(s) correcta(s).</div>
    `;

    if (sel.value === "multiple") {
      const options = Array.isArray(q.options) ? q.options : [];
      const count = Math.max(4, options.length || 0);

      for (let i = 0; i < count; i++) {
        const val = options[i] ? String(options[i]).replace(/"/g,'&quot;') : "";
        opts.innerHTML += `<input class="opt" placeholder="Opción ${i+1}" style="margin-top:8px;" value="${val}">`;
      }

      opts.innerHTML += `<div class="correct_area" style="margin-top:10px;"></div>`;
      const correctArea = opts.querySelector(".correct_area");

      const renderCorrectSelect = () => {
        const toggle = div.querySelector(".scored_toggle").checked;
        correctArea.innerHTML = "";
        if (!toggle) return;

        const currentOptions = [...div.querySelectorAll(".opt")].map(x => (x.value || "").trim()).filter(Boolean);
        const max = currentOptions.length || count;

        correctArea.innerHTML = `
          <label style="font-weight:700;color:#9e1b1c;">Respuesta correcta</label>
          <select class="correct" style="width:100%;padding:12px;border-radius:10px;border:1px solid #dde3ea;margin-top:8px;">
            ${Array.from({length:max}).map((_,i)=>`<option value="${i}">Opción ${i+1}</option>`).join("")}
          </select>
        `;
        const correct = Number(q.correct ?? 0);
        correctArea.querySelector(".correct").value = String(Math.min(correct, max-1));
      };

      div.querySelector(".scored_toggle").addEventListener("change", renderCorrectSelect);
      renderCorrectSelect();
      return;
    }

    if (sel.value === "check") {
      const options = Array.isArray(q.options) ? q.options : [];
      const count = Math.max(4, options.length || 0);

      for (let i = 0; i < count; i++) {
        const val = options[i] ? String(options[i]).replace(/"/g,'&quot;') : "";
        opts.innerHTML += `<input class="opt" placeholder="Opción ${i+1}" style="margin-top:8px;" value="${val}">`;
      }

      opts.innerHTML += `
        <div class="correct_area" style="margin-top:10px;"></div>
        <button type="button" class="refresh_correct secondary" style="margin-top:10px;">Actualizar correctas</button>
      `;

      const correctArea = opts.querySelector(".correct_area");
      const refreshBtn = opts.querySelector(".refresh_correct");

      const renderCorrectChecks = () => {
        const toggle = div.querySelector(".scored_toggle").checked;
        correctArea.innerHTML = "";
        if (!toggle) return;

        const currentOptions = [...div.querySelectorAll(".opt")].map(x => (x.value || "").trim()).filter(Boolean);
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

      div.querySelector(".scored_toggle").addEventListener("change", () => {
        if (!div.querySelector(".scored_toggle").checked) correctArea.innerHTML = "";
      });

      refreshBtn.onclick = renderCorrectChecks;
      if (scored) renderCorrectChecks();
      return;
    }
  };

  sel.onchange = render;
  render();
}

function addEmptyQuestion(container){
  makeQuestionBlockFromData({ title:"", type:"text", scored:false }, container);
}

addBtn?.addEventListener("click", () => {
  if (getSubMode() !== "create0") return;
  addEmptyQuestion(qc);
});

genBtn?.addEventListener("click", async () => {
  const top = getExamTopDataOrAlert();
  if (!top) return;

  const { fac, facCed, c, date, duration, invites, email } = top;

  const questions = [];
  const blocks = [...qc.querySelectorAll(".question")];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const title = (b.querySelector(".qtext")?.value || "").trim();
    const type = (b.querySelector(".qtype")?.value || "").trim();
    if (!title) return alert(`Pregunta ${i+1} vacía`);

    if (type === "text") {
      questions.push({ title, type:"text", scored:false });
      continue;
    }

    if (type === "true_false") {
      const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
      questions.push({ title, type:"true_false", correct, scored:true });
      continue;
    }

    const scored = !!b.querySelector(".scored_toggle")?.checked;
    const options = [...b.querySelectorAll(".opt")].map(x => (x.value||"").trim()).filter(Boolean);
    if (options.length < 2) return alert(`Pregunta ${i+1}: mínimo 2 opciones`);

    if (type === "multiple") {
      if (scored) {
        const correct = Number(b.querySelector(".correct")?.value ?? 0);
        questions.push({ title, type:"multiple", options, correct, scored:true });
      } else {
        questions.push({ title, type:"multiple", options, scored:false });
      }
      continue;
    }

    if (type === "check") {
      if (scored) {
        const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
          .map(x=>Number(x.value))
          .filter(n=>Number.isInteger(n));
        if (!correctIdxs.length) return alert(`Pregunta ${i+1}: marca al menos una correcta (check)`);
        questions.push({ title, type:"check", options, correct: correctIdxs, scored:true });
      } else {
        questions.push({ title, type:"check", options, scored:false });
      }
      continue;
    }
  }

  genBtn.disabled = true;
  genBtn.textContent = "Generando...";

  try {
    const res = await fetch("/create_exam", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        facilitator: fac,
        facilitator_cedula: facCed,
        course: c,

        // ✅ NUEVO
        course_date: date,
        course_duration: duration,
        num_invites: invites,
        facilitator_email: email,

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
   ===============  REUTILIZAR / EDITAR  ===================
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
        questions.push({ title, type:"text", scored:false });
        continue;
      }

      if (type === "true_false") {
        const correct = Number(b.querySelector(".correct_tf")?.value ?? 0);
        questions.push({ title, type:"true_false", correct, scored:true });
        continue;
      }

      const scored = !!b.querySelector(".scored_toggle")?.checked;
      const options = [...b.querySelectorAll(".opt")].map(x => (x.value||"").trim()).filter(Boolean);
      if (options.length < 2) throw new Error(`Pregunta ${i+1}: mínimo 2 opciones`);

      if (type === "multiple") {
        if (scored) {
          const correct = Number(b.querySelector(".correct")?.value ?? 0);
          questions.push({ title, type:"multiple", options, correct, scored:true });
        } else {
          questions.push({ title, type:"multiple", options, scored:false });
        }
        continue;
      }

      if (type === "check") {
        if (scored) {
          const correctIdxs = [...b.querySelectorAll(".correct_chk:checked")]
            .map(x => Number(x.value))
            .filter(n => Number.isInteger(n));
          if (!correctIdxs.length) throw new Error(`Pregunta ${i+1}: marca al menos una correcta (check)`);
          questions.push({ title, type:"check", options, correct: correctIdxs, scored:true });
        } else {
          questions.push({ title, type:"check", options, scored:false });
        }
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
