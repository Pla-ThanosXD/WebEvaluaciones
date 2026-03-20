from flask import (
    Flask, render_template, request, jsonify, abort,
    session, redirect
)
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google_auth_httplib2 import AuthorizedHttp
from datetime import datetime, UTC
from werkzeug.middleware.proxy_fix import ProxyFix
import json
import uuid
import unicodedata
import re
import os
import httplib2
from functools import wraps
from typing import Any, Dict, List, Tuple, Optional

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# =========================================================
# CONFIG GENERAL
# =========================================================
SPREADSHEET_ID = "158KfNlSI4K_Fse5Zm4KpD1WvW_-ZcDsBgsnFGQqT34U"

SHEET_EXAMS = "Exams!A:N"
SHEET_RESPONSES = "Responses!A:S"
SHEET_CONFIG = "Config!A:B"

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CEDULA_RE = re.compile(r"^\d{5,15}$")
REGISTRO_RE = re.compile(r"^\d{1,20}$")

POINTS_PER_QUESTION = 1

GOOGLE_FORMS_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeQhPUPr_23-KesWKXOmpNqM4Aot_DJZnHbeB-ja5KLywnS5g/viewform"

# =========================================================
# SSL
# =========================================================
DISABLE_SSL_VERIFY = os.getenv("DISABLE_SSL_VERIFY", "0") == "1"

# =========================================================
# ADMIN / SESIÓN
# =========================================================
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-change-me-please")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "123456789")


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "No autenticado"}), 401
        return fn(*args, **kwargs)
    return wrapper


# =========================================================
# GOOGLE SERVICE
# =========================================================
def get_sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=SCOPES
    )

    if DISABLE_SSL_VERIFY:
        http = httplib2.Http(timeout=60, disable_ssl_certificate_validation=True)
        authed_http = AuthorizedHttp(creds, http=http)
        return build("sheets", "v4", http=authed_http, cache_discovery=False)

    return build("sheets", "v4", credentials=creds, cache_discovery=False)


# =========================================================
# HELPERS
# =========================================================
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


def safe_get(row: List[Any], idx: int, default: str = "") -> str:
    if not isinstance(row, list):
        return default
    if idx < 0 or idx >= len(row):
        return default
    return safe_str(row[idx], 500)


# =========================================================
# PREGUNTAS FIJAS
# =========================================================
DEFAULT_QUESTIONS: List[Dict[str, Any]] = [
    {
        "title": "Turno",
        "type": "multiple",
        "options": ["Turno 1", "Turno 2", "Turno 3", "Turno 4"],
        "scored": False,
        "admin_edit_options": False
    },
    {
        "title": "Gerencia",
        "type": "multiple",
        "options": [
            "Gerencia de Operaciones (Personal de planta y logística)",
            "Gerencia de Innovación y Gestión Integrada",
            "Gerencia de Mercadeo",
            "Dirección Control Gestión",
            "Gerencia Gestión Comercial",
            "Gerencia de Gestión Humana",
            "Terceros"
        ],
        "scored": False,
        "admin_edit_options": True
    },
    {
        "title": "Área",
        "type": "check",
        "options": [
            "Área de Mantenimineto Planeado", "Mezclas", "Formación y Horneo", "Cremas",
            "Horno 1", "Horno 2", "Horno 3", "Horno 4", "Horno 5", "Horno 6", "Horno 7", "Horno 8",
            "Horno 9", "Horno 10", "Horno 11", "Horno 12", "Horno 18",
            "Wafers", "Otro"
        ],
        "scored": False,
        "admin_edit_options": True
    },
    {
        "title": "¿Cómo calificarías tu nivel de conocimiento sobre el tema antes de iniciar la formación?",
        "type": "multiple",
        "options": ["1", "2", "3", "4", "5"],
        "scored": False,
        "admin_edit_options": True
    },
    {
        "title": "¿Cómo calificas tu nivel de conocimiento después de haber recibido la formación?",
        "type": "multiple",
        "options": ["Sin conocimiento", "Básico", "Experto", "Enseña"],
        "scored": False,
        "admin_edit_options": True
    },
    {
        "title": "De una escala de 1 a 5 cómo calificas el entrenamiento proporcionado por el Instructor.",
        "type": "multiple",
        "options": ["1", "2", "3", "4", "5"],
        "scored": False,
        "admin_edit_options": True
    },
    {
        "title": "Tienes alguna sugerencia, aporte o comentarios sobre el entrenamiento recibido?",
        "type": "text",
        "scored": False,
        "admin_edit_options": False
    },
]


# =========================================================
# CONFIG EN SHEETS
# =========================================================
def load_config(service) -> Dict[str, Any]:
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_CONFIG
    ).execute().get("values", [])

    cfg: Dict[str, Any] = {}
    for r in rows:
        if len(r) < 2:
            continue
        key = safe_str(r[0], 80)
        raw = safe_str(r[1], 50000)
        if not key:
            continue
        try:
            cfg[key] = json.loads(raw) if raw else None
        except Exception:
            cfg[key] = raw
    return cfg


def save_config_key(service, key: str, value: Any) -> None:
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_CONFIG
    ).execute().get("values", [])

    row_index = None
    for i, r in enumerate(rows, start=1):
        if len(r) >= 1 and safe_str(r[0], 80) == key:
            row_index = i
            break

    value_json = json.dumps(value, ensure_ascii=False)

    if row_index is None:
        service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range=SHEET_CONFIG,
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [[key, value_json]]}
        ).execute()
    else:
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"Config!A{row_index}:B{row_index}",
            valueInputOption="RAW",
            body={"values": [[key, value_json]]}
        ).execute()


def get_default_questions(service=None) -> List[Dict[str, Any]]:
    questions = [dict(q) for q in DEFAULT_QUESTIONS]

    if service is None:
        return questions

    cfg = load_config(service)
    overrides = cfg.get("default_question_overrides", {})

    if not isinstance(overrides, dict):
        return questions

    for q in questions:
        if not q.get("admin_edit_options"):
            continue

        title = safe_str(q.get("title"), 300)
        override_options = overrides.get(title)

        if q.get("type") in ("multiple", "check") and isinstance(override_options, list):
            clean_opts = [safe_str(x, 200) for x in override_options if safe_str(x, 200)]
            if len(clean_opts) >= 2:
                q["options"] = clean_opts

    return questions


# =========================================================
# VALIDATE QUESTIONS
# =========================================================
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
            return False, "Respuesta correcta inválida (0=Verdadero, 1=Falso)"
        q["correct"] = correct
        return True, ""

    if qtype in ("multiple", "check"):
        opts = q.get("options")
        if not isinstance(opts, list):
            return False, "Opciones inválidas"

        options = [safe_str(o, 200) for o in opts if safe_str(o, 200)]
        if len(options) < 2:
            return False, "La pregunta requiere mínimo 2 opciones"
        if len(options) > 50:
            return False, "Demasiadas opciones (máx 50)"
        q["options"] = options

        if qtype == "multiple" and q["scored"]:
            correct = q.get("correct")
            if not isinstance(correct, int):
                return False, "Falta el índice de respuesta correcta"
            if correct < 0 or correct >= len(options):
                return False, "Índice de respuesta correcta fuera de rango"
            q["correct"] = correct
            return True, ""

        if qtype == "check" and q["scored"]:
            correct = q.get("correct")
            if not isinstance(correct, list) or not correct:
                return False, "Falta lista de respuestas correctas (check)"
            if any((not isinstance(x, int)) for x in correct):
                return False, "Correct (check) debe ser lista de índices"
            if any((x < 0 or x >= len(options)) for x in correct):
                return False, "Índices correctos fuera de rango (check)"
            q["correct"] = sorted(set(correct))
            return True, ""

        q.pop("correct", None)
        return True, ""

    q["options"] = []
    q["scored"] = False
    q.pop("correct", None)
    return True, ""


# =========================================================
# SHEETS HELPERS
# =========================================================
def _load_exams_rows(service) -> List[List[str]]:
    return service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_EXAMS
    ).execute().get("values", [])


def _load_responses_rows(service) -> List[List[str]]:
    return service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES
    ).execute().get("values", [])


def get_exam_by_id(service, exam_id: str) -> Optional[Dict[str, Any]]:
    rows = _load_exams_rows(service)
    default_questions = get_default_questions(service)

    for r in rows:
        if len(r) >= 1 and safe_get(r, 0, "") == exam_id:
            try:
                custom_questions = json.loads(safe_get(r, 5, "")) if safe_get(r, 5, "") else []
            except Exception:
                custom_questions = []

            if not isinstance(custom_questions, list):
                custom_questions = []

            questions = default_questions + custom_questions

            return {
                "id": safe_get(r, 0, ""),
                "facilitator": safe_get(r, 1, ""),
                "facilitator_cedula": safe_get(r, 2, ""),
                "course": safe_get(r, 3, ""),
                "created_at": safe_get(r, 4, ""),
                "questions": questions,
                "default_questions": default_questions,
                "custom_questions": custom_questions,
                "course_date": safe_get(r, 6, ""),
                "course_duration": safe_get(r, 7, ""),
                "num_invites": safe_get(r, 8, ""),
                "facilitator_email": safe_get(r, 9, ""),
                "system_area": safe_get(r, 10, ""),
                "system_title": safe_get(r, 11, ""),
                "course_description": safe_get(r, 12, ""),
                "exam_url": safe_get(r, 13, ""),
            }
    return None


def has_submission(service, exam_id: str, cedula: str) -> bool:
    rows = _load_responses_rows(service)
    for r in rows:
        if len(r) >= 4 and safe_get(r, 0, "") == exam_id and safe_get(r, 3, "") == cedula:
            return True
    return False


def list_exams(service) -> List[Dict[str, Any]]:
    rows = _load_exams_rows(service)
    out: List[Dict[str, Any]] = []
    for r in rows:
        if len(r) >= 4:
            exam_id = safe_get(r, 0, "").strip()
            if not exam_id or normalize_text(exam_id) in ("EXAM_ID", "ID"):
                continue
            out.append({
                "id": exam_id,
                "facilitator": safe_get(r, 1, ""),
                "facilitator_cedula": safe_get(r, 2, ""),
                "course": safe_get(r, 3, ""),
                "created_at": safe_get(r, 4, ""),
                "system_area": safe_get(r, 10, ""),
                "system_title": safe_get(r, 11, ""),
                "course_date": safe_get(r, 6, ""),
                "exam_url": safe_get(r, 13, ""),
            })
    out.reverse()
    return out


def answer_by_title(questions: List[Dict[str, Any]], answers: List[Any], title: str, default: Any = "") -> Any:
    wanted = normalize_text(title)
    for i, q in enumerate(questions):
        if normalize_text(safe_str(q.get("title"), 300)) == wanted:
            if 0 <= i < len(answers):
                return answers[i]
            break
    return default


# =========================================================
# ROUTES (UI)
# =========================================================
@app.route("/")
def index():
    return render_template("home.html")


@app.route("/creator")
def creator():
    return render_template("index.html")


@app.route("/upload_support", methods=["GET"])
def upload_support_page():
    return render_template("upload_support.html")


@app.route("/api/upload_support", methods=["POST"])
def upload_support_api():
    exam_id = request.form.get("exam_id")
    files = request.files.getlist("files")

    if not exam_id:
        return jsonify({"error": "Falta exam_id"}), 400

    if not files:
        return jsonify({"error": "No se enviaron archivos"}), 400

    saved_files = []
    for file in files:
        if file and file.filename:
            saved_files.append({
                "name": file.filename,
                "url": f"/uploads/{file.filename}"
            })

    return jsonify({"files": saved_files}), 200


# =========================================================
# DEBUG
# =========================================================
@app.route("/debug/sheets")
def debug_sheets():
    return jsonify({
        "SHEET_EXAMS": SHEET_EXAMS,
        "SHEET_RESPONSES": SHEET_RESPONSES,
        "SHEET_CONFIG": SHEET_CONFIG,
        "spreadsheet_id": SPREADSHEET_ID,
        "disable_ssl_verify": DISABLE_SSL_VERIFY,
        "is_admin": bool(session.get("is_admin"))
    })


# =========================================================
# API CONFIG PÚBLICA
# =========================================================
@app.route("/api/config/public", methods=["GET"])
def api_public_config():
    service = get_sheets_service()
    cfg = load_config(service)
    return jsonify({
        "system_areas": cfg.get("system_areas", []),
        "system_topics": cfg.get("system_topics", {}),
        "ui_texts": cfg.get("ui_texts", {}),
    })


# =========================================================
# ADMIN LOGIN
# =========================================================
@app.route("/api/admin/login", methods=["POST"])
def api_admin_login():
    data = request.get_json(force=True) or {}
    pwd = safe_str(data.get("password"), 200)

    if pwd != ADMIN_PASSWORD:
        return jsonify({"error": "Contraseña incorrecta"}), 401

    session["is_admin"] = True
    session.permanent = True
    return jsonify({"status": "ok", "redirect": "/creator"})


@app.route("/api/admin/me", methods=["GET"])
def api_admin_me():
    return jsonify({"is_admin": bool(session.get("is_admin"))})


@app.route("/admin/logout")
def admin_logout():
    session.clear()
    return redirect("/creator")


# =========================================================
# ADMIN: actualizar textos UI
# =========================================================
@app.route("/api/admin/ui_texts/update", methods=["POST"])
@admin_required
def api_admin_ui_texts_update():
    data = request.get_json(force=True) or {}
    key = safe_str(data.get("key"), 80)
    value = safe_str(data.get("value"), 300)

    if not key:
        return jsonify({"error": "Key inválida"}), 400
    if not value:
        return jsonify({"error": "El valor no puede estar vacío"}), 400

    service = get_sheets_service()
    cfg = load_config(service)

    ui = cfg.get("ui_texts")
    if not isinstance(ui, dict):
        ui = {}

    ui[key] = value
    save_config_key(service, "ui_texts", ui)
    return jsonify({"status": "ok"})


@app.route("/api/admin/system_config/save", methods=["POST"])
@admin_required
def api_admin_system_config_save():
    data = request.get_json(force=True) or {}

    system_areas = data.get("system_areas", [])
    system_topics = data.get("system_topics", {})

    if not isinstance(system_areas, list) or not all(isinstance(x, str) and x.strip() for x in system_areas):
        return jsonify({"error": "system_areas inválido"}), 400

    if not isinstance(system_topics, dict):
        return jsonify({"error": "system_topics inválido"}), 400

    areas_clean = [safe_str(x, 120) for x in system_areas if safe_str(x, 120)]

    topics_clean = {}
    for k, v in system_topics.items():
        kk = safe_str(k, 120)
        if not kk:
            continue
        if isinstance(v, list):
            topics_clean[kk] = [safe_str(t, 220) for t in v if safe_str(t, 220)]
        else:
            topics_clean[kk] = []

    service = get_sheets_service()
    save_config_key(service, "system_areas", areas_clean)
    save_config_key(service, "system_topics", topics_clean)

    return jsonify({"status": "ok"})


# =========================================================
# ADMIN: editar opciones de preguntas fijas
# =========================================================
@app.route("/api/admin/default_questions/options", methods=["GET"])
@admin_required
def api_admin_default_questions_get():
    service = get_sheets_service()
    questions = get_default_questions(service)

    out = []
    for q in questions:
        if q.get("admin_edit_options"):
            out.append({
                "title": q.get("title"),
                "type": q.get("type"),
                "options": q.get("options", [])
            })

    return jsonify({"questions": out})


@app.route("/api/admin/default_questions/options", methods=["POST"])
@admin_required
def api_admin_default_questions_save():
    data = request.get_json(force=True) or {}
    items = data.get("questions", [])

    if not isinstance(items, list):
        return jsonify({"error": "Formato inválido"}), 400

    editable_map = {
        safe_str(q.get("title"), 300): q
        for q in DEFAULT_QUESTIONS
        if q.get("admin_edit_options")
    }

    overrides: Dict[str, List[str]] = {}

    for item in items:
        if not isinstance(item, dict):
            return jsonify({"error": "Cada elemento debe ser un objeto"}), 400

        title = safe_str(item.get("title"), 300)
        options = item.get("options", [])

        if title not in editable_map:
            return jsonify({"error": f"Pregunta no editable: {title}"}), 400

        original = editable_map[title]
        if original.get("type") not in ("multiple", "check"):
            continue

        if not isinstance(options, list):
            return jsonify({"error": f"Opciones inválidas en {title}"}), 400

        clean_opts = [safe_str(x, 200) for x in options if safe_str(x, 200)]
        if len(clean_opts) < 2:
            return jsonify({"error": f"{title} requiere mínimo 2 opciones"}), 400
        if len(clean_opts) > 50:
            return jsonify({"error": f"{title} tiene demasiadas opciones (máx 50)"}), 400

        overrides[title] = clean_opts

    service = get_sheets_service()
    save_config_key(service, "default_question_overrides", overrides)

    return jsonify({"status": "ok"})


# =========================================================
# API: EXAMS
# =========================================================
@app.route("/api/exams", methods=["GET"])
def api_exams():
    service = get_sheets_service()
    return jsonify({"exams": list_exams(service)})


@app.route("/api/exams/filter", methods=["GET"])
def api_exams_filter():
    service = get_sheets_service()
    rows = _load_exams_rows(service)

    system_area = safe_str(request.args.get("system_area"), 120)
    system_title = safe_str(request.args.get("system_title"), 220)
    q = safe_str(request.args.get("q"), 200)
    date_from = safe_str(request.args.get("date_from"), 20)
    date_to = safe_str(request.args.get("date_to"), 20)

    n_area = normalize_text(system_area)
    n_title = normalize_text(system_title)
    n_q = normalize_text(q)

    def in_range(course_date: str) -> bool:
        cd = safe_str(course_date, 20).strip()
        if not date_from and not date_to:
            return True
        if not cd:
            return False
        if date_from and cd < date_from:
            return False
        if date_to and cd > date_to:
            return False
        return True

    out: List[Dict[str, Any]] = []

    for r in rows:
        if not r:
            continue

        exam_id = safe_get(r, 0, "").strip()
        if not exam_id:
            continue
        if normalize_text(exam_id) in ("EXAM_ID", "ID"):
            continue

        fac = safe_get(r, 1, "")
        fac_ced = safe_get(r, 2, "")
        course = safe_get(r, 3, "")
        created_at = safe_get(r, 4, "")
        course_date = safe_get(r, 6, "")
        course_duration = safe_get(r, 7, "")
        num_invites = safe_get(r, 8, "")
        facilitator_email = safe_get(r, 9, "")
        area = safe_get(r, 10, "")
        title = safe_get(r, 11, "")
        desc = safe_get(r, 12, "")
        exam_url = safe_get(r, 13, "")

        if n_area and normalize_text(area) != n_area:
            continue

        if n_title and normalize_text(title) != n_title:
            continue

        if n_q:
            hay = normalize_text(f"{course} {fac} {desc} {title} {area}")
            if n_q not in hay:
                continue

        if not in_range(course_date):
            continue

        out.append({
            "id": exam_id,
            "facilitator": fac,
            "facilitator_cedula": fac_ced,
            "course": course,
            "created_at": created_at,
            "course_description": desc,
            "course_date": course_date,
            "course_duration": course_duration,
            "num_invites": num_invites,
            "facilitator_email": facilitator_email,
            "system_area": area,
            "system_title": title,
            "exam_url": exam_url,
        })

    out.reverse()
    return jsonify({"exams": out})


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
        "questions": exam.get("custom_questions", []),
        "course_date": exam.get("course_date", ""),
        "course_duration": exam.get("course_duration", ""),
        "num_invites": exam.get("num_invites", ""),
        "facilitator_email": exam.get("facilitator_email", ""),
        "system_area": exam.get("system_area", ""),
        "system_title": exam.get("system_title", ""),
        "course_description": exam.get("course_description", ""),
        "exam_url": exam.get("exam_url", ""),
    })


# =========================================================
# CREATE EXAM
# =========================================================
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

    if not facilitator or not facilitator_cedula or not course or not course_description:
        return jsonify({"error": "Datos incompletos. La descripción del curso es obligatoria."}), 400
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
    exam_url = request.host_url.rstrip("/") + f"/exam/{exam_id}"
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
            json.dumps(validated_custom, ensure_ascii=False),
            course_date,
            course_duration,
            num_invites,
            facilitator_email,
            system_area,
            system_title,
            course_description,
            exam_url
        ]]}
    ).execute()

    return jsonify({
        "exam_id": exam_id,
        "exam_url": exam_url
    })


# =========================================================
# REUTILIZAR SOLO PREGUNTAS Y DESCRIPCIÓN
# =========================================================
@app.route("/duplicate_exam/<exam_id>", methods=["POST"])
def duplicate_exam(exam_id):
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

    if not facilitator or not facilitator_cedula or not course:
        return jsonify({"error": "Datos incompletos"}), 400

    if not CEDULA_RE.match(facilitator_cedula):
        return jsonify({"error": "Cédula del facilitador inválida (solo números, 5 a 15 dígitos)"}), 400

    service = get_sheets_service()
    rows = _load_exams_rows(service)

    old = None
    for r in rows:
        if len(r) >= 6 and safe_get(r, 0, "") == exam_id:
            old = r
            break

    if not old:
        return jsonify({"error": "Formación no encontrada"}), 404

    questions_json = safe_get(old, 5, "[]")
    course_description = safe_get(old, 12, "")

    new_exam_id = uuid.uuid4().hex[:8]
    new_exam_url = request.host_url.rstrip("/") + f"/exam/{new_exam_id}"

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
            course_description,
            new_exam_url
        ]]}
    ).execute()

    return jsonify({
        "exam_id": new_exam_id,
        "exam_url": new_exam_url,
        "course_description": course_description
    })


# =========================================================
# UPDATE EXAM (ADMIN)
# =========================================================
@app.route("/api/exam/<exam_id>", methods=["PUT"])
@admin_required
def api_update_exam(exam_id):
    data = request.get_json(force=True) or {}

    exam_id = safe_str(exam_id, 20)
    facilitator = normalize_text(data.get("facilitator"))
    facilitator_cedula = safe_str(data.get("facilitator_cedula"), 15)
    course = safe_str(data.get("course"), 200)
    questions_in = data.get("questions", [])

    if not CEDULA_RE.match(facilitator_cedula):
        return jsonify({"error": "Cédula del facilitador inválida (solo números, 5 a 15 dígitos)"}), 400
    if not isinstance(questions_in, list):
        return jsonify({"error": "Debes enviar la lista de preguntas"}), 400

    service = get_sheets_service()
    row = None
    rows = _load_exams_rows(service)
    for idx, r in enumerate(rows, start=1):
        if len(r) >= 1 and safe_get(r, 0, "") == exam_id:
            row = idx
            break

    if not row:
        return jsonify({"error": "Examen no encontrado"}), 404

    old = get_exam_by_id(service, exam_id)
    created_at = old.get("created_at") if old else datetime.now(UTC).isoformat()

    course_date = safe_str(data.get("course_date") or (old.get("course_date") if old else ""), 30)
    course_duration = safe_str(data.get("course_duration") or (old.get("course_duration") if old else ""), 20)
    num_invites = safe_str(data.get("num_invites") or (old.get("num_invites") if old else ""), 20)
    facilitator_email = safe_str(data.get("facilitator_email") or (old.get("facilitator_email") if old else ""), 120)
    system_area = safe_str(data.get("system_area") or (old.get("system_area") if old else ""), 80)
    system_title = safe_str(data.get("system_title") or (old.get("system_title") if old else ""), 200)
    course_description = safe_str(data.get("course_description") or (old.get("course_description") if old else ""), 300)

    if not facilitator or not facilitator_cedula or not course or not course_description:
        return jsonify({"error": "Datos incompletos. La descripción del curso es obligatoria."}), 400

    validated: List[Dict[str, Any]] = []
    for q in questions_in:
        ok, msg = validate_question(q)
        if not ok:
            return jsonify({"error": f"Pregunta inválida: {msg}"}), 400
        validated.append(q)

    exam_url = request.host_url.rstrip("/") + f"/exam/{exam_id}"

    update_range = f"Exams!A{row}:N{row}"
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
            json.dumps(validated, ensure_ascii=False),
            course_date,
            course_duration,
            num_invites,
            facilitator_email,
            system_area,
            system_title,
            course_description,
            exam_url
        ]]}
    ).execute()

    return jsonify({
        "status": "ok",
        "exam_id": exam_id,
        "exam_url": exam_url
    })


# =========================================================
# SHOW EXAM
# =========================================================
@app.route("/exam/<exam_id>")
def show_exam(exam_id):
    service = get_sheets_service()
    exam = get_exam_by_id(service, safe_str(exam_id, 20))
    if not exam:
        abort(404)
    return render_template(
        "exam.html",
        exam=exam,
        forms_url=GOOGLE_FORMS_URL,
        default_questions_count=len(get_default_questions(service))
    )


# =========================================================
# SUBMIT EXAM
# =========================================================
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
    if len(answers) != len(questions):
        return jsonify({"error": "Cantidad de respuestas no coincide con el examen"}), 400

    if has_submission(service, exam_id, cedula):
        return jsonify({"error": "Ya existe un envío para esta cédula en este examen"}), 409

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

    score = 0
    total = 0
    details: List[Dict[str, Any]] = []

    for i, q in enumerate(questions):
        qtype = q.get("type")
        title = safe_str(q.get("title"), 300)

        if q.get("scored", True) is not True:
            details.append({
                "index": i,
                "title": title,
                "type": safe_str(q.get("type"), 20),
                "is_correct": None,
                "user_value": cleaned_answers[i],
                "correct_value": None
            })
            continue

        if qtype in ("multiple", "true_false"):
            correct_idx = q.get("correct", None)
            options = q.get("options", [])

            if not (isinstance(correct_idx, int) and isinstance(options, list)) or correct_idx < 0 or correct_idx >= len(options):
                details.append({
                    "index": i,
                    "title": title,
                    "type": safe_str(q.get("type"), 20),
                    "is_correct": None,
                    "user_value": cleaned_answers[i],
                    "correct_value": None
                })
                continue

            total += POINTS_PER_QUESTION
            correct_value = safe_str(options[correct_idx], 500)
            is_ok = isinstance(cleaned_answers[i], str) and cleaned_answers[i] == correct_value

            if is_ok:
                score += POINTS_PER_QUESTION

            details.append({
                "index": i,
                "title": title,
                "type": safe_str(q.get("type"), 20),
                "is_correct": is_ok,
                "user_value": cleaned_answers[i],
                "correct_value": correct_value
            })

        elif qtype == "check":
            correct_list = q.get("correct", None)
            options = q.get("options", [])

            if not (isinstance(correct_list, list) and isinstance(options, list)):
                details.append({
                    "index": i,
                    "title": title,
                    "type": safe_str(q.get("type"), 20),
                    "is_correct": None,
                    "user_value": cleaned_answers[i],
                    "correct_value": None
                })
                continue

            correct_values = []
            ok = True
            for idx in correct_list:
                if not isinstance(idx, int) or idx < 0 or idx >= len(options):
                    ok = False
                    break
                correct_values.append(safe_str(options[idx], 500))

            if not ok:
                details.append({
                    "index": i,
                    "title": title,
                    "type": safe_str(q.get("type"), 20),
                    "is_correct": None,
                    "user_value": cleaned_answers[i],
                    "correct_value": None
                })
                continue

            total += POINTS_PER_QUESTION

            user_vals = cleaned_answers[i]
            if not isinstance(user_vals, list):
                details.append({
                    "index": i,
                    "title": title,
                    "type": safe_str(q.get("type"), 20),
                    "is_correct": None,
                    "user_value": cleaned_answers[i],
                    "correct_value": correct_values
                })
                continue

            user_clean = [safe_str(x, 500) for x in user_vals if safe_str(x, 500)]
            user_set = set(user_clean)
            correct_set = set(correct_values)
            is_ok = (user_set == correct_set)

            if is_ok:
                score += POINTS_PER_QUESTION

            details.append({
                "index": i,
                "title": title,
                "type": safe_str(q.get("type"), 20),
                "is_correct": is_ok,
                "user_value": user_clean,
                "correct_value": correct_values
            })

        else:
            details.append({
                "index": i,
                "title": title,
                "type": safe_str(q.get("type"), 20),
                "is_correct": None,
                "user_value": cleaned_answers[i],
                "correct_value": None
            })

    percent = round((score / total) * 100, 2) if total > 0 else ""

    turno = safe_str(answer_by_title(questions, cleaned_answers, "Turno", ""), 200)
    gerencia = safe_str(answer_by_title(questions, cleaned_answers, "Gerencia", ""), 200)

    area_vals_any = answer_by_title(questions, cleaned_answers, "Área", [])
    area_vals = area_vals_any if isinstance(area_vals_any, list) else []
    area_vals = [safe_str(x, 200) for x in area_vals if safe_str(x, 200)]

    area_otro = ""
    area_normal = []

    for a in area_vals:
        if normalize_text(a) == "OTRO" or normalize_text(a).startswith("OTRO:"):
            area_otro = a
        else:
            area_normal.append(a)

    area_txt = ", ".join(area_normal)

    nivel_antes = safe_str(
        answer_by_title(questions, cleaned_answers, "¿Cómo calificarías tu nivel de conocimiento sobre el tema antes de iniciar la formación?", ""),
        20
    )
    nivel = safe_str(
        answer_by_title(questions, cleaned_answers, "¿Nivel de conocimiento del tema de la formación?", ""),
        200
    )
    calif = safe_str(
        answer_by_title(questions, cleaned_answers, "De una escala de 1 a 5 cómo calificas el entrenamiento proporcionado por el Instructor.", ""),
        20
    )
    comentarios = safe_str(
        answer_by_title(questions, cleaned_answers, "Tienes alguna sugerencia, aporte o comentarios sobre el entrenamiento recibido?", ""),
        500
    )

    answers_json = json.dumps(cleaned_answers, ensure_ascii=False)

    correct_list = []
    failed_list = []

    for d in details:
        if d.get("is_correct") is None:
            continue

        item = {
            "index": d.get("index"),
            "title": d.get("title"),
            "type": d.get("type"),
            "user_value": d.get("user_value"),
            "correct_value": d.get("correct_value"),
            "is_correct": d.get("is_correct"),
        }

        if d.get("is_correct") is True:
            correct_list.append(item)
        elif d.get("is_correct") is False:
            failed_list.append(item)

    correc_json = json.dumps(correct_list, ensure_ascii=False)
    failed_json = json.dumps(failed_list, ensure_ascii=False)

    submitted_at = datetime.now(UTC).isoformat()

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [[
            exam_id,       # A
            nombre,        # B
            registro,      # C
            cedula,        # D
            turno,         # E
            gerencia,      # F
            area_txt,      # G
            area_otro,     # H
            nivel_antes,   # I
            nivel,         # J
            calif,         # K
            comentarios,   # L
            answers_json,  # M
            submitted_at,  # N
            score,         # O
            total,         # P
            percent,       # Q
            failed_json,   # R
            correc_json    # S
        ]]}
    ).execute()

    return jsonify({
        "status": "ok",
        "score": score,
        "total": total,
        "percent": percent,
        "details": details,
        "failed_json": failed_list,
        "correc_json": correct_list
    })


# =========================================================
# MAIN
# =========================================================
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "1") == "1"
    )
