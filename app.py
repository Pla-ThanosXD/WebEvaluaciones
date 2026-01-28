from flask import Flask, render_template, request, jsonify, abort
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime, UTC
import json
import uuid
import unicodedata
import re
from typing import Any, Dict, List, Tuple, Optional

app = Flask(__name__)

# =========================
# CONFIG
# =========================
SPREADSHEET_ID = "158KfNlSI4K_Fse5Zm4KpD1WvW_-ZcDsBgsnFGQqT34U"

# Exams (A:M)
SHEET_EXAMS = "Exams!A:M"

# Responses (A:Q)
SHEET_RESPONSES = "Responses!A:Q"

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CEDULA_RE = re.compile(r"^\d{5,15}$")
REGISTRO_RE = re.compile(r"^\d{1,20}$")

POINTS_PER_QUESTION = 1  # ✅ 1 punto c/u

GOOGLE_FORMS_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeQhPUPr_23-KesWKXOmpNqM4Aot_DJZnHbeB-ja5KLywnS5g/viewform"

# =========================
# GOOGLE SERVICE
# =========================
def get_sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)

# =========================
# HELPERS
# =========================
def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.strip().upper()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text

def safe_str(x: Any, max_len: int = 300) -> str:
    if x is None:
        return ""
    if not isinstance(x, str):
        x = str(x)
    return x.strip()[:max_len]

def safe_list_of_str(x: Any, item_max_len: int = 120, max_items: int = 50) -> List[str]:
    if not isinstance(x, list):
        return []
    out: List[str] = []
    for item in x[:max_items]:
        s = safe_str(item, item_max_len)
        if s:
            out.append(s)
    return out

# =========================
# DEFAULT QUESTIONS (FIJAS) - NO CALIFICAN
# =========================
DEFAULT_QUESTIONS: List[Dict[str, Any]] = [
    {"title": "Turno", "type": "multiple", "options": ["Turno 1", "Turno 2", "Turno 3", "Turno 4"]},
    {
        "title": "Gerencia", "type": "multiple",
        "options": [
            "Gerencia de Operaciones",
            "Gerencia de Innovación y Gestión Integrada",
            "Gerencia de Mercadeo",
            "Dirección Control Gestión",
            "Gerencia Gestión Comercial",
            "Gerencia de Gestión Humana"
        ],
    },
    {
        "title": "Área", "type": "check",
        "options": [
            "Mezclas", "Formación y Horneo", "Cremas",
            "Horno 1", "Horno 2", "Horno 3", "Horno 4", "Horno 5", "Horno 6", "Horno 7", "Horno 8",
            "Horno 9", "Horno 10", "Horno 11", "Horno 12", "Horno 18",
            "Wafers", "Otro"
        ],
    },
    {"title": "¿Nivel de conocimiento del tema de la formación?", "type": "multiple", "options": ["Sin conocimiento", "Básico", "Experto", "Enseña"]},
    {"title": "De una escala de 1 a 5 cómo calificas el entrenamiento proporcionado por el Instructor.", "type": "multiple", "options": ["1", "2", "3", "4", "5"]},
    {"title": "Tienes alguna sugerencia, aporte o comentarios sobre el entrenamiento recibido?", "type": "text"},
]

# =========================
# VALIDATE QUESTIONS (CUSTOM)
# Tipos: text, multiple, check, true_false
# ✅ Ya NO existe scored. Todas las custom no-text requieren correct.
# =========================
def validate_question(q: Dict[str, Any]) -> Tuple[bool, str]:
    if not isinstance(q, dict):
        return False, "Formato de pregunta inválido"

    title = safe_str(q.get("title"), 300)
    qtype = safe_str(q.get("type"), 20)

    if not title:
        return False, "Pregunta sin título"
    if qtype not in ("text", "multiple", "check", "true_false"):
        return False, f"Tipo inválido: {qtype}"

    q["title"] = title
    q["type"] = qtype

    # text: no opciones, no correct
    if qtype == "text":
        q["options"] = []
        q.pop("correct", None)
        q.pop("scored", None)
        return True, ""

    # true_false: siempre correct (0/1)
    if qtype == "true_false":
        q["options"] = ["VERDADERO", "FALSO"]
        q.pop("scored", None)
        correct = q.get("correct")
        if not isinstance(correct, int) or correct not in (0, 1):
            return False, "Respuesta correcta inválida (0=Verdadero, 1=Falso)"
        q["correct"] = correct
        return True, ""

    # multiple / check: opciones requeridas
    opts = q.get("options")
    if not isinstance(opts, list):
        return False, "Opciones inválidas"

    options = [safe_str(o, 200) for o in opts if safe_str(o, 200)]
    if len(options) < 2:
        return False, "La pregunta requiere mínimo 2 opciones"
    if len(options) > 50:
        return False, "Demasiadas opciones (máx 50)"

    q["options"] = options
    q.pop("scored", None)

    if qtype == "multiple":
        correct = q.get("correct")
        if not isinstance(correct, int):
            return False, "Falta el índice de respuesta correcta"
        if correct < 0 or correct >= len(options):
            return False, "Índice de respuesta correcta fuera de rango"
        q["correct"] = correct
        return True, ""

    if qtype == "check":
        correct = q.get("correct")
        if not isinstance(correct, list) or not correct:
            return False, "Falta lista de respuestas correctas (check)"
        if any((not isinstance(x, int)) for x in correct):
            return False, "Correct (check) debe ser lista de índices"
        if any((x < 0 or x >= len(options)) for x in correct):
            return False, "Índices correctos fuera de rango (check)"
        q["correct"] = sorted(set(correct))
        return True, ""

    return False, "Tipo inválido"

# =========================
# SHEETS HELPERS
# =========================
def _load_exams_rows(service) -> List[List[str]]:
    return service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])

def get_exam_by_id(service, exam_id: str) -> Optional[Dict[str, Any]]:
    rows = _load_exams_rows(service)

    for r in rows:
        if len(r) >= 1 and r[0] == exam_id:
            try:
                custom_questions = json.loads(r[5]) if len(r) > 5 and r[5] else []
            except Exception:
                custom_questions = []

            questions = DEFAULT_QUESTIONS + (custom_questions if isinstance(custom_questions, list) else [])

            return {
                "id": r[0],
                "facilitator": r[1] if len(r) > 1 else "",
                "facilitator_cedula": r[2] if len(r) > 2 else "",
                "course": r[3] if len(r) > 3 else "",
                "created_at": r[4] if len(r) > 4 else "",
                "questions": questions,
                "custom_questions": custom_questions if isinstance(custom_questions, list) else [],
                "course_date": r[6] if len(r) > 6 else "",
                "course_duration": r[7] if len(r) > 7 else "",
                "num_invites": r[8] if len(r) > 8 else "",
                "facilitator_email": r[9] if len(r) > 9 else "",
                "system_area": r[10] if len(r) > 10 else "",
                "system_title": r[11] if len(r) > 11 else "",
                "course_description": r[12] if len(r) > 12 else "",
            }
    return None

def has_submission(service, exam_id: str, cedula: str) -> bool:
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES
    ).execute().get("values", [])

    for r in rows:
        if len(r) >= 4 and r[0] == exam_id and r[3] == cedula:
            return True
    return False

def list_exams(service) -> List[Dict[str, Any]]:
    rows = _load_exams_rows(service)
    out: List[Dict[str, Any]] = []
    for r in rows:
        if len(r) >= 4:
            out.append({
                "id": r[0],
                "facilitator": r[1] if len(r) > 1 else "",
                "facilitator_cedula": r[2] if len(r) > 2 else "",
                "course": r[3] if len(r) > 3 else "",
                "created_at": r[4] if len(r) > 4 else "",
            })
    out.reverse()
    return out

def find_exam_row_index(service, exam_id: str) -> Optional[int]:
    rows = _load_exams_rows(service)
    for idx, r in enumerate(rows, start=1):
        if len(r) >= 1 and r[0] == exam_id:
            return idx
    return None

# =========================
# ROUTES (UI)
# =========================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/creator")
def creator():
    return render_template("creator.html")

# =========================
# API: EXAMS
# =========================
@app.route("/api/exams", methods=["GET"])
def api_exams():
    service = get_sheets_service()
    return jsonify({"exams": list_exams(service)})

@app.route("/api/exam/<exam_id>", methods=["GET"])
def api_get_exam(exam_id):
    service = get_sheets_service()
    exam = get_exam_by_id(service, safe_str(exam_id, 20))
    if not exam:
        return jsonify({"error": "Examen no encontrado"}), 404

    # ✅ para editor: solo custom
    return jsonify({
        "id": exam["id"],
        "facilitator": exam.get("facilitator", ""),
        "facilitator_cedula": exam.get("facilitator_cedula", ""),
        "course": exam.get("course", ""),
        "created_at": exam.get("created_at", ""),
        "questions": exam.get("custom_questions", []),
        "course_date": exam.get("course_date", ""),
        "course_duration": exam.get("course_duration", ""),
        "num_invites": exam.get("num_invites", ""),
        "facilitator_email": exam.get("facilitator_email", ""),
        "system_area": exam.get("system_area", ""),
        "system_title": exam.get("system_title", ""),
        "course_description": exam.get("course_description", ""),
    })

@app.route("/api/exam/<exam_id>", methods=["PUT"])
def api_update_exam(exam_id):
    data = request.get_json(force=True) or {}

    exam_id = safe_str(exam_id, 20)
    facilitator = normalize_text(data.get("facilitator"))
    facilitator_cedula = safe_str(data.get("facilitator_cedula"), 15)
    course = safe_str(data.get("course"), 200)
    questions_in = data.get("questions", [])

    if not facilitator or not facilitator_cedula or not course:
        return jsonify({"error": "Datos incompletos"}), 400
    if not CEDULA_RE.match(facilitator_cedula):
        return jsonify({"error": "Cédula del facilitador inválida (solo números, 5 a 15 dígitos)"}), 400
    if not isinstance(questions_in, list):
        return jsonify({"error": "Debes enviar la lista de preguntas"}), 400

    validated: List[Dict[str, Any]] = []
    for q in questions_in:
        ok, msg = validate_question(q)
        if not ok:
            return jsonify({"error": f"Pregunta inválida: {msg}"}), 400
        validated.append(q)

    service = get_sheets_service()
    row = find_exam_row_index(service, exam_id)
    if not row:
        return jsonify({"error": "Examen no encontrado"}), 404

    old = get_exam_by_id(service, exam_id)
    created_at = old.get("created_at") if old else datetime.now(UTC).isoformat()

    # mantener campos extra si existían
    course_date = safe_str(data.get("course_date") or (old.get("course_date") if old else ""), 30)
    course_duration = safe_str(data.get("course_duration") or (old.get("course_duration") if old else ""), 20)
    num_invites = safe_str(data.get("num_invites") or (old.get("num_invites") if old else ""), 20)
    facilitator_email = safe_str(data.get("facilitator_email") or (old.get("facilitator_email") if old else ""), 120)

    system_area = safe_str(data.get("system_area") or (old.get("system_area") if old else ""), 80)
    system_title = safe_str(data.get("system_title") or (old.get("system_title") if old else ""), 200)
    course_description = safe_str(data.get("course_description") or (old.get("course_description") if old else ""), 300)

    update_range = f"Exams!A{row}:M{row}"
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=update_range,
        valueInputOption="RAW",
        body={"values": [[
            exam_id,
            facilitator,
            facilitator_cedula,
            course,
            created_at,
            json.dumps(validated, ensure_ascii=False),  # ✅ SOLO custom (sin scored)
            course_date,
            course_duration,
            num_invites,
            facilitator_email,
            system_area,
            system_title,
            course_description
        ]]}
    ).execute()

    return jsonify({
        "status": "ok",
        "exam_id": exam_id,
        "exam_url": request.host_url.rstrip("/") + f"/exam/{exam_id}"
    })

# =========================
# CREATE EXAM
# =========================
@app.route("/create_exam", methods=["POST"])
def create_exam():
    data = request.get_json(force=True) or {}

    facilitator = normalize_text(data.get("facilitator"))
    facilitator_cedula = safe_str(data.get("facilitator_cedula"), 15)
    course = safe_str(data.get("course"), 200)

    course_date = safe_str(data.get("course_date"), 30)
    course_duration = safe_str(data.get("course_duration"), 20)
    num_invites = safe_str(data.get("num_invites"), 20)
    facilitator_email = safe_str(data.get("facilitator_email"), 120)

    system_area = safe_str(data.get("system_area"), 80)
    system_title = safe_str(data.get("system_title"), 200)
    course_description = safe_str(data.get("course_description"), 300)

    custom_questions = data.get("questions", [])

    if not facilitator or not facilitator_cedula or not course:
        return jsonify({"error": "Datos incompletos"}), 400
    if not CEDULA_RE.match(facilitator_cedula):
        return jsonify({"error": "Cédula del facilitador inválida (solo números, 5 a 15 dígitos)"}), 400
    if not isinstance(custom_questions, list):
        return jsonify({"error": "Formato de preguntas inválido"}), 400

    validated_custom: List[Dict[str, Any]] = []
    for q in custom_questions:
        ok, msg = validate_question(q)
        if not ok:
            return jsonify({"error": f"Pregunta inválida: {msg}"}), 400
        validated_custom.append(q)

    exam_id = uuid.uuid4().hex[:8]

    service = get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            exam_id,
            facilitator,
            facilitator_cedula,
            course,
            datetime.now(UTC).isoformat(),
            json.dumps(validated_custom, ensure_ascii=False),  # ✅ sin scored
            course_date,
            course_duration,
            num_invites,
            facilitator_email,
            system_area,
            system_title,
            course_description
        ]]}
    ).execute()

    return jsonify({
        "exam_id": exam_id,
        "exam_url": request.host_url.rstrip("/") + f"/exam/{exam_id}"
    })

# =========================
# SHOW EXAM (UI)
# =========================
@app.route("/exam/<exam_id>")
def show_exam(exam_id):
    service = get_sheets_service()
    exam = get_exam_by_id(service, safe_str(exam_id, 20))
    if not exam:
        abort(404)
    return render_template("exam.html", exam=exam, forms_url=GOOGLE_FORMS_URL)

# =========================
# DUPLICATE EXAM
# =========================
@app.route("/duplicate_exam/<exam_id>", methods=["POST"])
def duplicate_exam(exam_id):
    service = get_sheets_service()
    rows = _load_exams_rows(service)

    old = None
    for r in rows:
        if len(r) >= 6 and r[0] == exam_id:
            old = r
            break

    if not old:
        return jsonify({"error": "Examen no encontrado"}), 404

    new_exam_id = uuid.uuid4().hex[:8]

    facilitator = old[1] if len(old) > 1 else ""
    facilitator_cedula = old[2] if len(old) > 2 else ""
    course = old[3] if len(old) > 3 else ""
    questions_json = old[5] if len(old) > 5 else "[]"
    course_date = old[6] if len(old) > 6 else ""
    course_duration = old[7] if len(old) > 7 else ""
    num_invites = old[8] if len(old) > 8 else ""
    facilitator_email = old[9] if len(old) > 9 else ""
    system_area = old[10] if len(old) > 10 else ""
    system_title = old[11] if len(old) > 11 else ""
    course_description = old[12] if len(old) > 12 else ""

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            new_exam_id,
            facilitator,
            facilitator_cedula,
            course,
            datetime.now(UTC).isoformat(),
            questions_json,
            course_date,
            course_duration,
            num_invites,
            facilitator_email,
            system_area,
            system_title,
            course_description
        ]]}
    ).execute()

    return jsonify({
        "exam_id": new_exam_id,
        "exam_url": request.host_url.rstrip("/") + f"/exam/{new_exam_id}"
    })

# =========================
# SUBMIT EXAM
# =========================
@app.route("/submit_exam", methods=["POST"])
def submit_exam():
    data = request.get_json(force=True) or {}

    exam_id = safe_str(data.get("exam_id"), 20)
    nombre = normalize_text(data.get("nombre"))
    registro = safe_str(data.get("registro"), 20)
    cedula = safe_str(data.get("cedula"), 15)
    answers = data.get("answers")

    if not exam_id or not nombre or not registro or not cedula or answers is None:
        return jsonify({"error": "Datos incompletos"}), 400
    if not REGISTRO_RE.match(registro):
        return jsonify({"error": "Registro inválido (solo números, 1 a 20 dígitos)"}), 400
    if not CEDULA_RE.match(cedula):
        return jsonify({"error": "Cédula inválida (solo números, 5 a 15 dígitos)"}), 400
    if not isinstance(answers, list):
        return jsonify({"error": "Formato de respuestas inválido"}), 400

    service = get_sheets_service()
    exam = get_exam_by_id(service, exam_id)
    if not exam:
        return jsonify({"error": "Examen no encontrado"}), 404

    questions = exam.get("questions", [])
    custom_questions = exam.get("custom_questions", [])
    fixed_count = len(DEFAULT_QUESTIONS)

    if len(answers) != len(questions):
        return jsonify({"error": "Cantidad de respuestas no coincide con el examen"}), 400

    if has_submission(service, exam_id, cedula):
        return jsonify({"error": "Ya existe un envío para esta cédula en este examen"}), 409

    # limpiar respuestas
    cleaned_answers: List[Any] = []
    for i, q in enumerate(questions):
        qtype = q.get("type")
        a = answers[i]
        if qtype == "check":
            arr = safe_list_of_str(a, item_max_len=200, max_items=50)
            if not arr and isinstance(a, str) and a.strip():
                arr = [safe_str(a, 200)]
            cleaned_answers.append(arr)
        else:
            cleaned_answers.append(safe_str(a, 500))

    # =========================
    # CALIFICACIÓN
    # ✅ Solo califica CUSTOM no-text
    # ✅ Cada una vale 1 punto
    # =========================
    score = 0
    total = 0
    details: List[Dict[str, Any]] = []

    for i, q in enumerate(questions):
        qtype = q.get("type")

        # fijas: no califican
        if i < fixed_count:
            details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})
            continue

        # custom text: no califica
        if qtype == "text":
            details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})
            continue

        # custom no-text: siempre vale 1
        total += POINTS_PER_QUESTION

        if qtype in ("multiple", "true_false"):
            correct_idx = q.get("correct", None)
            options = q.get("options", [])
            if not (isinstance(correct_idx, int) and isinstance(options, list)) or correct_idx < 0 or correct_idx >= len(options):
                details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})
                continue

            correct_value = safe_str(options[correct_idx], 500)
            is_ok = (isinstance(cleaned_answers[i], str) and cleaned_answers[i] == correct_value)

            if is_ok:
                score += POINTS_PER_QUESTION

            details.append({
                "index": i,
                "is_correct": True if is_ok else False,
                "user_value": cleaned_answers[i],
                "correct_value": correct_value
            })

        elif qtype == "check":
            correct_list = q.get("correct", None)
            options = q.get("options", [])
            if not (isinstance(correct_list, list) and isinstance(options, list)):
                details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})
                continue

            correct_values = set()
            ok = True
            for idx in correct_list:
                if not isinstance(idx, int) or idx < 0 or idx >= len(options):
                    ok = False
                    break
                correct_values.add(safe_str(options[idx], 500))
            if not ok:
                details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})
                continue

            user_vals = cleaned_answers[i]
            if not isinstance(user_vals, list):
                details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": list(correct_values)})
                continue

            user_set = set(safe_str(x, 500) for x in user_vals if safe_str(x, 500))
            is_ok = (user_set == correct_values)

            if is_ok:
                score += POINTS_PER_QUESTION

            details.append({
                "index": i,
                "is_correct": True if is_ok else False,
                "user_value": list(user_set),
                "correct_value": list(correct_values)
            })

        else:
            details.append({"index": i, "is_correct": None, "user_value": cleaned_answers[i], "correct_value": None})

    percent = round((score / total) * 100, 2) if total > 0 else ""

    # =========================
    # RESPONSES COLUMNAS E-K (FIJAS)
    # =========================
    turno = safe_str(cleaned_answers[0], 200)
    gerencia = safe_str(cleaned_answers[1], 200)

    area_list = cleaned_answers[2] if isinstance(cleaned_answers[2], list) else []
    area_list = [safe_str(x, 200) for x in area_list]
    area_txt = ", ".join([x for x in area_list if x])

    nivel = safe_str(cleaned_answers[3], 200)
    calif = safe_str(cleaned_answers[4], 20)
    comentarios = safe_str(cleaned_answers[5], 500)

    # =========================
    # JSON: Preguntas creadas (SOLO CUSTOM, SOLO PREGUNTAS) - sin scored
    # =========================
    custom_questions_slim = []
    for q in custom_questions:
        custom_questions_slim.append({
            "title": safe_str(q.get("title"), 300),
            "type": safe_str(q.get("type"), 20),
            "options": q.get("options", [])
        })
    custom_questions_json = json.dumps(custom_questions_slim, ensure_ascii=False)

    # =========================
    # JSON 2: Correctas (SOLO custom calificables)
    # JSON 3: Fallidas (SOLO custom calificables) -> Q
    # =========================
    correct_list = []
    failed_list = []

    for d in details:
        idx = d.get("index")
        if not isinstance(idx, int):
            continue
        if idx < fixed_count:
            continue
        # Solo las que realmente se calificaron (custom no-text) tienen True/False
        if d.get("is_correct") is True:
            correct_list.append({"user_value": d.get("user_value"), "correct_value": d.get("correct_value")})
        if d.get("is_correct") is False:
            failed_list.append({"user_value": d.get("user_value"), "correct_value": d.get("correct_value")})

    correct_questions_json = json.dumps(correct_list, ensure_ascii=False)
    most_failed_questions_json = json.dumps(failed_list, ensure_ascii=False)

    submitted_at = datetime.now(UTC).isoformat()

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            exam_id,                 # A
            nombre,                 # B
            registro,               # C
            cedula,                 # D
            turno,                  # E
            gerencia,               # F
            area_txt,               # G
            correct_questions_json, # H
            nivel,                  # I
            calif,                  # J
            comentarios,            # K
            custom_questions_json,  # L
            submitted_at,           # M
            score,                  # N
            total,                  # O
            percent,                # P
            most_failed_questions_json  # Q
        ]]}
    ).execute()

    return jsonify({
        "status": "ok",
        "score": score,
        "total": total,
        "percent": percent,
        "details": details
    })

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
