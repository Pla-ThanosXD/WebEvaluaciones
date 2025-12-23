const qDiv = document.getElementById("questions");
const result = document.getElementById("result");
const sendBtn = document.getElementById("send");

window.EXAM.questions.forEach((q, i) => {
  const d = document.createElement("div");
  d.innerHTML = `<strong>${q.title}</strong><br>`;

  if (q.type === "text") {
    d.innerHTML += `<input data-i="${i}"><br>`;
  }

  if (q.type === "multiple") {
    q.options.forEach(o => {
      d.innerHTML += `
        <label>
          <input type="radio" name="q${i}" value="${o}"> ${o}
        </label><br>
      `;
    });
  }

  qDiv.appendChild(d);
});

sendBtn.onclick = async () => {
  const nombre = document.getElementById("nombre").value.trim();
  const cedula = document.getElementById("cedula").value.trim();

  if (!nombre || !cedula) {
    alert("Nombre y cédula obligatorios");
    return;
  }

  const answers = [];

  for (let i = 0; i < window.EXAM.questions.length; i++) {
    const q = window.EXAM.questions[i];

    if (q.type === "text") {
      const v = document.querySelector(`[data-i="${i}"]`).value.trim();
      if (!v) return alert(`Responde la pregunta ${i + 1}`);
      answers.push(v);
    } else {
      const c = document.querySelector(`input[name="q${i}"]:checked`);
      if (!c) return alert(`Selecciona opción en pregunta ${i + 1}`);
      answers.push(c.value);
    }
  }

  await fetch("/submit_exam", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      exam_id: window.EXAM.id,
      nombre,
      cedula,
      answers
    })
  });

  result.innerHTML = "✅ Examen enviado correctamente";
  sendBtn.disabled = true;
};
