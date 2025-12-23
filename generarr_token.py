from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ==========================
# CONFIGURACIÓN
# ==========================
SERVICE_ACCOUNT_FILE = "credentials.json"

# CARPETA DONDE GUARDAR FORMULARIOS
FOLDER_ID = "1aCW03OPRuwZ5BYqzjyEYZN_z8uDyWvui"

# FORMULARIO PLANTILLA
TEMPLATE_FORM_ID = "1v6ajubLiDlBNCXhkB_cy5lqWSfMtSQs8N8ErnN-PgRY"

# SCOPES
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/forms.body",
]


def print_status(ok, message):
    icon = "✔" if ok else "❌"
    print(f"{icon} {message}")


def main():
    print("\n=== Cargando credenciales Service Account ===")
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        print_status(True, "Service Account cargado correctamente")
        print(f"   → {creds.service_account_email}")
    except Exception as e:
        print_status(False, f"Error cargando credenciales: {e}")
        return

    # ================================
    # 1. Probar acceso a DRIVE
    # ================================
    try:
        drive = build("drive", "v3", credentials=creds)
        result = drive.files().list(
            q=f"'{FOLDER_ID}' in parents",
            fields="files(id,name)",
            supportsAllDrives=True
        ).execute()

        print("\n=== Test 1: Acceso a la carpeta ===")
        print_status(True, f"Carpeta accesible ({len(result.get('files', []))} archivos)")
        for f in result.get("files", []):
            print(f" - {f['name']}  {f['id']}")
    except HttpError as e:
        print_status(False, f"No se pudo acceder a la carpeta: {e}")
        return

    # ================================
    # 2. Verificar acceso a plantilla
    # ================================
    print("\n=== Test 2: Acceso a la plantilla ===")
    try:
        file_meta = drive.files().get(
            fileId=TEMPLATE_FORM_ID,
            fields="id,name",
            supportsAllDrives=True,
        ).execute()
        print_status(True, f"Plantilla accesible: {file_meta['name']}")
    except HttpError as e:
        print_status(False, f"No se puede acceder a la plantilla: {e}")
        return

    # ================================
    # 3. Intentar copiar plantilla
    # ================================
    print("\n=== Test 3: Copia del formulario ===")
    try:
        copy = drive.files().copy(
            fileId=TEMPLATE_FORM_ID,
            body={"name": "TEST_COPIA_SERVICE", "parents": [FOLDER_ID]},
            supportsAllDrives=True,
        ).execute()

        new_form_id = copy["id"]
        print_status(True, f"Copia creada OK → {new_form_id}")
    except HttpError as e:
        print_status(False, f"Error copiando plantilla: {e}")
        return

    # ================================
    # 4. Probar Google Forms API
    # ================================
    print("\n=== Test 4: API Forms (batchUpdate) ===")
    try:
        forms = build("forms", "v1", credentials=creds)

        test_request = {
            "requests": [
                {
                    "updateFormInfo": {
                        "info": {"title": "TEST - Actualizado por API"},
                        "updateMask": "title"
                    }
                }
            ]
        }

        forms.forms().batchUpdate(
            formId=new_form_id,
            body=test_request
        ).execute()

        print_status(True, "Forms API FUNCIONA ✔ (DWD activo)")
    except HttpError as e:
        print_status(False, f"Forms API NO FUNCIONA: {e}")
        return

    print("\n=== FIN DEL TEST ===\n")


if __name__ == "__main__":
    main()
