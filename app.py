from flask import Flask, render_template, request, jsonify, abort
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from datetime import datetime, UTC
import json
import uuid
import unicodedata
import re
import io
from typing import Any, Dict, List, Tuple, Optional

app = Flask(__name__)

# =========================
# CONFIG GOOGLE SHEETS
# =========================
SPREADSHEET_ID = "158KfNlSI4K_Fse5Zm4KpD1WvW_-ZcDsBgsnFGQqT34U"

SHEET_EXAMS = "Exams!A:J"          # A-J (incluye metadatos extra)
SHEET_RESPONSES = "Responses!A:I"  # A-I
SHEET_SUPPORTS = "Supports!A:G"    # A-G -> exam_id | course | facilitator | filename | file_id | url | uploaded_at

# =========================
# CONFIG DRIVE - UNIDAD COMPARTIDA
# =========================
# ✅ ID real de la carpeta "Soportes Formaciones" dentro de Unidad Compartida
SUPPORTS_ROOT_FOLDER_ID = "AQUI_TU_ID_REAL"

# =========================
# CONFIG GENERAL
# =========================
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

CEDULA_RE = re.compile(r"^\d{5,15}$")
REGISTRO_RE = re.compile(r"^\d{1,20}$")

POINTS_PER_QUESTION = 5
GOOGLE_FORMS_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeQhPUPr_23-KesWKXOmpNqM4Aot_DJZnHbeB-ja5KLywnS5g/viewform"

# =========================
# GOOGLE SERVICES
# =========================
def get_sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)

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
# DEFAULT QUESTIONS
# =========================
DEFAULT_QUESTIONS: List[Dict[str, Any]] = [
    {
        "title": "Turno",
        "type": "multiple",
        "options": ["Turno 1", "Turno 2", "Turno 3", "Turno 4"],
        "scored": False
    },
    {
        "title": "Gerencia",
        "type": "multiple",
        "options": [
            "Gerencia de Operaciones",
            "Gerencia de Innovación y Gestión Integrada",
            "Gerencia de Mercadeo",
            "Dirección Control Gestión",
            "Gerencia Gestión Comercial",
            "Gerencia de Gestión Humana"
        ],
        "scored": False
    },
    {
        "title": "Área",
        "type": "check",
        "options": [
            "Mezclas", "Formación y Horneo", "Cremas",
            "Horno 1","Horno 2","Horno 3","Horno 4","Horno 5","Horno 6","Horno 7","Horno 8",
            "Horno 9","Horno 10","Horno 11","Horno 12","Horno 18",
            "Wafers","Otro"
        ],
        "scored": False
    },
    {
        "title": "¿Nivel de conocimiento del tema de la formación?",
        "type": "multiple",
        "options": ["Sin conocimiento", "Básico", "Experto", "Enseña"],
        "scored": False
    },
    {
        "title": "De una escala de 1 a 5 cómo calificas el entrenamiento proporcionado por el Instructor.",
        "type": "multiple",
        "options": ["1","2","3","4","5"],
        "scored": False
    },
    {
        "title": "Tienes alguna sugerencia, aporte o comentarios sobre el entrenamiento recibido?",
        "type": "text",
        "scored": False
    },
]

# =========================
# VALIDATE QUESTIONS
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
    q["scored"] = bool(q.get("scored", True))

    if qtype == "true_false":
        q["options"] = ["VERDADERO", "FALSO"]
        q["scored"] = True
        correct = q.get("correct")
        if not isinstance(correct, int) or correct not in (0, 1):
            return False, "Correct inválido (0 o 1)"
        q["correct"] = correct
        return True, ""

    if qtype in ("multiple", "check"):
        opts = q.get("options")
        if not isinstance(opts, list):
            return False, "Opciones inválidas"

        options = [safe_str(o, 200) for o in opts if safe_str(o, 200)]
        if len(options) < 2:
            return False, "Mínimo 2 opciones"
        if len(options) > 50:
            return False, "Máx 50 opciones"

        q["options"] = options

        if qtype == "multiple" and q["scored"]:
            correct = q.get("correct")
            if not isinstance(correct, int):
                return False, "Falta índice de correcta"
            if correct < 0 or correct >= len(options):
                return False, "Índice fuera de rango"
            q["correct"] = correct
            return True, ""

        if qtype == "check" and q["scored"]:
            correct = q.get("correct")
            if not isinstance(correct, list) or not correct:
                return False, "Falta lista correctas"
            if any((not isinstance(x, int)) for x in correct):
                return False, "Correct debe ser lista de índices"
            if any((x < 0 or x >= len(options)) for x in correct):
                return False, "Índices correctos fuera de rango"
            q["correct"] = sorted(set(correct))
            return True, ""

        q.pop("correct", None)
        return True, ""

    q["options"] = []
    q["scored"] = False
    q.pop("correct", None)
    return True, ""

# =========================
# SHEETS HELPERS
# =========================
def get_exam_by_id(service, exam_id: str) -> Optional[Dict[str, Any]]:
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])

    for r in rows:
        if len(r) >= 6 and r[0] == exam_id:
            try:
                questions = json.loads(r[5])
            except Exception:
                questions = []
            return {
                "id": r[0],
                "facilitator": r[1] if len(r) > 1 else "",
                "facilitator_cedula": r[2] if len(r) > 2 else "",
                "course": r[3] if len(r) > 3 else "",
                "created_at": r[4] if len(r) > 4 else "",
                "questions": questions
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
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])

    out: List[Dict[str, Any]] = []
    for r in rows:
        if len(r) >= 4:
            out.append({
                "id": r[0],
                "facilitator": r[1] if len(r) > 1 else "",
                "facilitator_cedula": r[2] if len(r) > 2 else "",
                "course": r[3] if len(r) > 3 else "",
                "created_at": r[4] if len(r) > 4 else ""
            })
    out.reverse()
    return out

def find_exam_row_index(service, exam_id: str) -> Optional[int]:
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])

    for idx, r in enumerate(rows, start=1):
        if len(r) >= 1 and r[0] == exam_id:
            return idx
    return None

# =========================
# DRIVE HELPERS (Shared Drive)
# =========================
def get_or_create_exam_folder(drive_service, exam_id: str, course: str) -> str:
    folder_name = f"{exam_id} - {course}".strip()
    safe_folder_name = folder_name.replace("'", "\\'")

    q = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and name='{safe_folder_name}' "
        f"and '{SUPPORTS_ROOT_FOLDER_ID}' in parents "
        "and trashed=false"
    )

    res = drive_service.files().list(
        q=q,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        fields="files(id, name)"
    ).execute()

    files = res.get("files", [])
    if files:
        return files[0]["id"]

    folder_metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [SUPPORTS_ROOT_FOLDER_ID]
    }

    folder = drive_service.files().create(
        body=folder_metadata,
        fields="id",
        supportsAllDrives=True
    ).execute()

    return folder["id"]

# =========================
# ROUTES UI
# =========================
@app.route("/")
def home():
    return render_template("home.html")

@app.route("/creator")
def creator():
    return render_template("index.html")

@app.route("/upload_support", methods=["GET"])
def upload_support_page():
    return render_template("upload_support.html")

# =========================
# API EXAMS
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

    return jsonify({
        "id": exam["id"],
        "facilitator": exam.get("facilitator", ""),
        "facilitator_cedula": exam.get("facilitator_cedula", ""),
        "course": exam.get("course", ""),
        "created_at": exam.get("created_at", ""),
        "questions": exam.get("questions", [])
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
        return jsonify({"error": "Cédula inválida"}), 400
    if not isinstance(questions_in, list) or not questions_in:
        return jsonify({"error": "Debes enviar la lista completa de preguntas"}), 400

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

    update_range = f"Exams!A{row}:F{row}"
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
            json.dumps(validated, ensure_ascii=False)
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
    course_date = safe_str(data.get("course_date"), 20)
    course_duration = safe_str(data.get("course_duration"), 10)
    num_invites = safe_str(data.get("num_invites"), 10)
    facilitator_email = safe_str(data.get("facilitator_email"), 120)

    custom_questions = data.get("questions", [])

    if not facilitator or not facilitator_cedula or not course:
        return jsonify({"error": "Datos incompletos"}), 400
    if not CEDULA_RE.match(facilitator_cedula):
        return jsonify({"error": "Cédula inválida"}), 400
    if "@" not in facilitator_email:
        return jsonify({"error": "Correo inválido"}), 400
    if not isinstance(custom_questions, list):
        return jsonify({"error": "Formato de preguntas inválido"}), 400

    validated_custom: List[Dict[str, Any]] = []
    for q in custom_questions:
        ok, msg = validate_question(q)
        if not ok:
            return jsonify({"error": f"Pregunta inválida: {msg}"}), 400
        validated_custom.append(q)

    questions = DEFAULT_QUESTIONS + validated_custom
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
            json.dumps(questions, ensure_ascii=False),
            course_date,
            course_duration,
            num_invites,
            facilitator_email
        ]]}
    ).execute()

    return jsonify({
        "exam_id": exam_id,
        "exam_url": request.host_url.rstrip("/") + f"/exam/{exam_id}"
    })

# =========================
# DUPLICATE EXAM
# =========================
@app.route("/duplicate_exam/<exam_id>", methods=["POST"])
def duplicate_exam(exam_id):
    service = get_sheets_service()
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])

    old = None
    for r in rows:
        if len(r) >= 6 and r[0] == exam_id:
            old = r
            break

    if not old:
        return jsonify({"error": "Examen no encontrado"}), 404

    new_exam_id = uuid.uuid4().hex[:8]

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            new_exam_id,
            old[1],
            old[2],
            old[3],
            datetime.now(UTC).isoformat(),
            old[5],
            old[6] if len(old) > 6 else "",
            old[7] if len(old) > 7 else "",
            old[8] if len(old) > 8 else "",
            old[9] if len(old) > 9 else ""
        ]]}
    ).execute()

    return jsonify({
        "exam_id": new_exam_id,
        "exam_url": request.host_url.rstrip("/") + f"/exam/{new_exam_id}"
    })

# =========================
# EXAM PAGE
# =========================
@app.route("/exam/<exam_id>")
def show_exam(exam_id):
    service = get_sheets_service()
    exam = get_exam_by_id(service, safe_str(exam_id, 20))
    if not exam:
        abort(404)
    return render_template("exam.html", exam=exam, forms_url=GOOGLE_FORMS_URL)

# =========================
# SUBMIT EXAM (califica y guarda)
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
        return jsonify({"error": "Registro inválido"}), 400
    if not CEDULA_RE.match(cedula):
        return jsonify({"error": "Cédula inválida"}), 400
    if not isinstance(answers, list):
        return jsonify({"error": "Formato de respuestas inválido"}), 400

    service = get_sheets_service()
    exam = get_exam_by_id(service, exam_id)
    if not exam:
        return jsonify({"error": "Examen no encontrado"}), 404

    questions = exam.get("questions", [])
    if len(answers) != len(questions):
        return jsonify({"error": "Cantidad de respuestas no coincide con el examen"}), 400

    if has_submission(service, exam_id, cedula):
        return jsonify({"error": "Ya existe un envío para esta cédula en este examen"}), 409

    # ------------------------
    # Limpieza respuestas
    # ------------------------
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

    # ------------------------
    # Calificación + DETAILS
    # ------------------------
    score = 0
    total = 0
    details = []

    for i, q in enumerate(questions):
        qtype = q.get("type")
        scored = q.get("scored", True) is True

        detail = {
            "index": i,
            "qtype": qtype,
            "scored": scored,
            "user_value": cleaned_answers[i],
            "correct_value": None,
            "is_correct": None
        }

        # Preguntas no calificables
        if not scored:
            details.append(detail)
            continue

        # MULTIPLE / TRUE_FALSE
        if qtype in ("multiple", "true_false"):
            correct_idx = q.get("correct", None)
            options = q.get("options", [])

            if not (isinstance(correct_idx, int) and isinstance(options, list)):
                details.append(detail)
                continue

            if correct_idx < 0 or correct_idx >= len(options):
                details.append(detail)
                continue

            total += POINTS_PER_QUESTION
            correct_value = safe_str(options[correct_idx], 500)
            detail["correct_value"] = correct_value

            if isinstance(cleaned_answers[i], str) and cleaned_answers[i] == correct_value:
                score += POINTS_PER_QUESTION
                detail["is_correct"] = True
            else:
                detail["is_correct"] = False

            details.append(detail)
            continue

        # CHECK
        if qtype == "check":
            correct_list = q.get("correct", None)
            options = q.get("options", [])

            if not (isinstance(correct_list, list) and isinstance(options, list)):
                details.append(detail)
                continue

            correct_values = []
            ok = True

            for idx in correct_list:
                if not isinstance(idx, int) or idx < 0 or idx >= len(options):
                    ok = False
                    break
                correct_values.append(safe_str(options[idx], 500))

            if not ok:
                details.append(detail)
                continue

            total += POINTS_PER_QUESTION
            detail["correct_value"] = correct_values

            user_vals = cleaned_answers[i]
            if not isinstance(user_vals, list):
                details.append(detail)
                continue

            user_set = set(safe_str(x, 500) for x in user_vals if safe_str(x, 500))
            correct_set = set(correct_values)

            if user_set == correct_set:
                score += POINTS_PER_QUESTION
                detail["is_correct"] = True
            else:
                detail["is_correct"] = False

            details.append(detail)
            continue

        # TEXT (no se califica)
        details.append(detail)

    percent = round((score / total) * 100, 2) if total > 0 else ""

    # ------------------------
    # Guardar en Sheets
    # ------------------------
    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            exam_id,
            nombre,
            registro,
            cedula,
            json.dumps(cleaned_answers, ensure_ascii=False),
            datetime.now(UTC).isoformat(),
            score,
            total,
            percent
        ]]}
    ).execute()

    return jsonify({
        "status": "ok",
        "score": score,
        "total": total,
        "percent": percent,
        "details": details  # ✅ ESTA ES LA CLAVE
    })


# =========================
# UPLOAD SUPPORT (Drive + Sheets)
# =========================
@app.route("/upload_support", methods=["POST"])
def upload_support():
    exam_id = safe_str(request.form.get("exam_id"), 20)
    files = request.files.getlist("files")

    if not SUPPORTS_ROOT_FOLDER_ID or "AQUI_TU_ID_REAL" in SUPPORTS_ROOT_FOLDER_ID:
        return jsonify({"error": "Configura SUPPORTS_ROOT_FOLDER_ID con el ID real de carpeta en Unidad Compartida"}), 500

    if not exam_id:
        return jsonify({"error": "Debes seleccionar una formación"}), 400
    if not files:
        return jsonify({"error": "Adjunta al menos un archivo"}), 400

    sheet_service = get_sheets_service()
    drive_service = get_drive_service()

    exam = get_exam_by_id(sheet_service, exam_id)
    if not exam:
        return jsonify({"error": "Formación no encontrada"}), 404

    exam_folder_id = get_or_create_exam_folder(drive_service, exam_id, exam.get("course", ""))

    uploaded_files = []

    for f in files:
        filename = safe_str(f.filename, 200)
        if not filename:
            continue

        file_stream = io.BytesIO(f.read())
        media = MediaIoBaseUpload(file_stream, mimetype=f.mimetype, resumable=True)

        file_metadata = {
            "name": filename,
            "parents": [exam_folder_id]
        }

        created = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink",
            supportsAllDrives=True
        ).execute()

        file_id = created.get("id", "")
        url = created.get("webViewLink", "")
        uploaded_at = datetime.now(UTC).isoformat()

        sheet_service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range=SHEET_SUPPORTS,
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [[
                exam_id,
                exam.get("course", ""),
                exam.get("facilitator", ""),
                filename,
                file_id,
                url,
                uploaded_at
            ]]}
        ).execute()

        uploaded_files.append({"name": filename, "url": url, "id": file_id})

    return jsonify({"status": "ok", "files": uploaded_files})

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
