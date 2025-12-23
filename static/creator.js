const qc = document.getElementById("questions_container");
const result = document.getElementById("result");

document.getElementById("add_question").onclick = () => {
  const div = document.createElement("div");
  div.className = "question";

  div.innerHTML = `
    <input class="qtext" placeholder="Pregunta"><br>
    <select class="qtype">
      <option value="text">Texto</option>
      <option value="multiple">Opción múltiple</option>
    </select>
    <div class="opts"></div>
    <hr>
  `;

  qc.appendChild(div);

  const sel = div.querySelector(".qtype");
  const opts = div.querySelector(".opts");

  sel.onchange = () => {
    opts.innerHTML = "";
    if (sel.value === "multiple") {
      for (let i = 0; i < 4; i++) {
        opts.innerHTML += `<input class="opt" placeholder="Opción ${i + 1}"><br>`;
      }
    }
  };
};

document.getElementById("generate_exam").onclick = async () => {
  try {
    result.innerHTML = "";

    const facilitator = document.getElementById("facilitator").value.trim();
    const facilitator_cedula = document.getElementById("facilitator_cedula").value.trim();
    const course = document.getElementById("course").value.trim();

    if (!facilitator || !facilitator_cedula || !course) {
      alert("Todos los campos son obligatorios");
      return;
    }

    const questions = [];

    document.querySelectorAll(".question").forEach((q, i) => {
      const text = q.querySelector(".qtext").value.trim();
      const type = q.querySelector(".qtype").value;

      if (!text) {
        throw new Error(`Pregunta ${i + 1} vacía`);
      }

      let options = [];
      if (type === "multiple") {
        options = [...q.querySelectorAll(".opt")]
          .map(o => o.value.trim())
          .filter(Boolean);
      }

      questions.push({ title: text, type, options });
    });

    const res = await fetch("/create_exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilitator,
        facilitator_cedula,
        course,
        questions
      })
    });

    const data = await res.json();
    console.log("Respuesta backend:", data);

    if (!res.ok || !data.exam_url) {
      throw new Error(data.detail || data.error || "Error al crear el examen");
    }

    result.innerHTML = `
      <p><strong>Examen creado:</strong></p>
      <a href="${data.exam_url}" target="_blank">${data.exam_url}</a>
    `;

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
};
