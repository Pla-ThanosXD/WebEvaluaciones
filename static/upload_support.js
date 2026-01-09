const examSelect = document.getElementById("exam_select");
const fileContainer = document.getElementById("file_container");
const addFileBtn = document.getElementById("btn_add_file");
const uploadBtn = document.getElementById("btn_upload");
const result = document.getElementById("result");

function setHTML(el, html){ el.innerHTML = html || ""; }

async function loadExams(){
  try{
    const res = await fetch("/api/exams");
    const data = await res.json().catch(()=>({}));
    const exams = data.exams || [];

    examSelect.innerHTML = `<option value="" selected disabled>Selecciona…</option>`;

    if(!exams.length){
      examSelect.innerHTML = `<option value="" selected disabled>No hay formaciones creadas</option>`;
      return;
    }

    exams.forEach(e=>{
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.course} — ${e.facilitator} (${e.id})`;
      examSelect.appendChild(opt);
    });

  } catch(e){
    examSelect.innerHTML = `<option value="" selected disabled>Error cargando</option>`;
  }
}

addFileBtn.onclick = () => {
  const div = document.createElement("div");
  div.className = "file-row";
  div.innerHTML = `<input type="file" class="file_input">`;
  fileContainer.appendChild(div);
};

uploadBtn.onclick = async () => {
  const exam_id = examSelect.value;
  if(!exam_id) return alert("Selecciona una formación");

  const inputs = [...document.querySelectorAll(".file_input")];
  const files = inputs.map(i => i.files[0]).filter(Boolean);
  if(!files.length) return alert("Adjunta al menos un archivo");

  const formData = new FormData();
  formData.append("exam_id", exam_id);

  files.forEach(f => formData.append("files", f));

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Subiendo...";

  try{
    const res = await fetch("/upload_support", {
      method: "POST",
      body: formData
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      alert(data.error || "Error subiendo");
      return;
    }

    let html = "✅ Soportes subidos:<br><br>";
    (data.files || []).forEach(f=>{
      html += `📌 <b>${f.name}</b><br><a href="${f.url}" target="_blank">${f.url}</a><br><br>`;
    });

    setHTML(result, html);

  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "📤 Subir soportes";
  }
};

loadExams();
