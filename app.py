from flask import Flask, render_template, request, jsonify, abort
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime
import json
import uuid

app = Flask(__name__)

# =========================
# GOOGLE SHEETS CONFIG
# =========================

SPREADSHEET_ID = "158KfNlSI4K_Fse5Zm4KpD1WvW_-ZcDsBgsnFGQqT34U"
SHEET_EXAMS = "Exams!A:F"
SHEET_RESPONSES = "Responses!A:E"

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def get_sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)

# =========================
# PREGUNTAS PREDETERMINADAS
# =========================

DEFAULT_QUESTIONS = [
    {
        "title": "¿Cómo califica el curso?",
        "type": "multiple",
        "options": ["Excelente", "Bueno", "Regular", "Malo"]
    },
    {
        "title": "¿El facilitador explicó claramente los temas?",
        "type": "multiple",
        "options": ["Sí", "Parcialmente", "No"]
    },
    {
        "title": "¿Recomendaría este curso?",
        "type": "multiple",
        "options": ["Sí", "No"]
    }
]

# =========================
# ROUTES
# =========================

@app.route("/")
def index():
    return render_template("index.html")

# =========================
# CREATE EXAM
# =========================

@app.route("/create_exam", methods=["POST"])
def create_exam():
    try:
        data = request.get_json(force=True)

        facilitator = data.get("facilitator")
        facilitator_cedula = data.get("facilitator_cedula")
        course = data.get("course")
        custom_questions = data.get("questions", [])

        if not facilitator or not facilitator_cedula or not course:
            return jsonify({"error": "Datos incompletos"}), 400

        questions = DEFAULT_QUESTIONS + custom_questions
        exam_id = uuid.uuid4().hex[:8]

        service = get_sheets_service()

        service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range="Exams!A:F",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={
                "values": [[
                    exam_id,
                    facilitator,
                    facilitator_cedula,
                    course,
                    datetime.utcnow().isoformat(),
                    json.dumps(questions)
                ]]
            }
        ).execute()

    except Exception as e:
        print("❌ ERROR EN /create_exam:", repr(e))
        return jsonify({
            "error": "Error interno en el servidor",
            "detail": str(e)
        }), 500
    
    return jsonify({
            "exam_url": request.host_url.rstrip("/") + f"/exam/{exam_id}"
        })



# =========================
# SHOW EXAM
# =========================

@app.route("/exam/<exam_id>")
def show_exam(exam_id):
    service = get_sheets_service()

    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range="Exams!A:F"
    ).execute().get("values", [])

    exam = None
    for r in rows:
        if r[0] == exam_id:
            exam = {
                "id": r[0],
                "facilitator": r[1],
                "facilitator_cedula": r[2],
                "course": r[3],
                "questions": json.loads(r[5])
            }
            break

    if not exam:
        abort(404)

    return render_template("exam.html", exam=exam)


# =========================
# SUBMIT EXAM
# =========================

@app.route("/submit_exam", methods=["POST"])
def submit_exam():
    data = request.json

    exam_id = data.get("exam_id")
    nombre = data.get("nombre")
    cedula = data.get("cedula")
    answers = data.get("answers")

    if not exam_id or not nombre or not cedula or not answers:
        return jsonify({"error": "Datos incompletos"}), 400

    service = get_sheets_service()

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=SHEET_RESPONSES,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={
            "values": [[
                exam_id,
                nombre,
                cedula,
                json.dumps(answers),
                datetime.utcnow().isoformat()
            ]]
        }
    ).execute()

    return jsonify({"status": "ok"})

# =========================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

