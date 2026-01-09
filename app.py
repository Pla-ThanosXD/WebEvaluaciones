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
# CONFIG
# =========================
SPREADSHEET_ID = "158KfNlSI4K_Fse5Zm4KpD1WvW_-ZcDsBgsnFGQqT34U"

# ✅ Asegúrate que tu hoja Exams tiene columnas A-J
SHEET_EXAMS = "Exams!A:J"
SHEET_RESPONSES = "Responses!A:I"

# ✅ Supports debe tener columnas A-G
# exam_id | course | facilitator | filename | drive_file_id | drive_link | uploaded_at
SHEET_SUPPORTS = "Supports!A:G"

# =========================
# DRIVE SHARED CONFIG
# =========================
# ✅ ESTE ES EL ID DE UNA CARPETA DENTRO DE LA UNIDAD COMPARTIDA
# Ejemplo: carpeta "Soportes Formaciones"
SUPPORTS_ROOT_FOLDER_ID = "0AJtlqHNvGL1CUk9PVA"

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
                "course": r[3] if len(r) > 3 else "",
            })
    out.reverse()
    return out

# =========================
# DRIVE HELPERS
# =========================
def get_or_create_exam_folder(drive_service, exam_id: str, course: str) -> str:
    """Crea (si no existe) una carpeta por formación dentro de SUPPORTS_ROOT_FOLDER_ID"""
    folder_name = f"{exam_id} - {course}".strip()

    # escapar comillas simples para query
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
# ROUTES
# =========================
@app.route("/")
def home():
    return render_template("home.html")

@app.route("/creator")
def creator():
    return render_template("index.html")

@app.route("/api/exams", methods=["GET"])
def api_exams():
    service = get_sheets_service()
    return jsonify({"exams": list_exams(service)})

@app.route("/upload_support", methods=["GET"])
def upload_support_page():
    return render_template("upload_support.html")

@app.route("/upload_support", methods=["POST"])
def upload_support():
    exam_id = safe_str(request.form.get("exam_id"), 20)
    files = request.files.getlist("files")

    if not SUPPORTS_ROOT_FOLDER_ID or "PON_AQUI" in SUPPORTS_ROOT_FOLDER_ID:
        return jsonify({"error": "Debes configurar SUPPORTS_ROOT_FOLDER_ID con el ID de la carpeta en Unidad Compartida"}), 500

    if not exam_id:
        return jsonify({"error": "Debes seleccionar una formación"}), 400
    if not files:
        return jsonify({"error": "Adjunta al menos un archivo"}), 400

    sheet_service = get_sheets_service()
    drive_service = get_drive_service()

    exam = get_exam_by_id(sheet_service, exam_id)
    if not exam:
        return jsonify({"error": "Formación no encontrada"}), 404

    # ✅ crear / obtener carpeta por formación
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

        # Guardar en Supports
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
