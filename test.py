from google.oauth2 import service_account
from googleapiclient.discovery import build

# ---------------------------------------------------------
# CONFIGURA ESTO
# ---------------------------------------------------------
SERVICE_ACCOUNT_FILE = "credentials.json"

# ID de la unidad compartida (Team Drive)
TEAMDRIVE_ID = "0AEAgJR5JkrbDUk9PVA"

# ID de la carpeta donde quieres crear/copiar formularios
FOLDER_ID = "1aCW03OPRuwZ5BYqzjyEYZN_z8uDyWvui"

# ID del formulario plantilla
FORM_TEMPLATE_ID = "1v6ajubLiDlBNCXhkB_cy5lqWSfMtSQs8N8ErnN-PgRY"
# ---------------------------------------------------------

def connect_drive():
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE,
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        drive = build("drive", "v3", credentials=creds)
        print("✔ Autenticación correcta")
        return drive
    except Exception as e:
        print("❌ Error autenticando:")
        print(e)
        exit()

def test_list_teamdrive(drive):
    print("\n=== Test 1: Listar unidad compartida ===")
    try:
        result = drive.files().list(
            corpora="drive",
            driveId=TEAMDRIVE_ID,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            fields="files(id, name)"
        ).execute()

        files = result.get("files", [])
        print(f"✔ La unidad tiene {len(files)} archivos visibles")
        for f in files[:10]:
            print(" -", f["name"], f["id"])
    except Exception as e:
        print("❌ Error listando unidad:")
        print(e)

def test_folder_access(drive):
    print("\n=== Test 2: Verificar acceso a carpeta ===")
    try:
        result = drive.files().get(
            fileId=FOLDER_ID,
            supportsAllDrives=True,
            fields="id, name"
        ).execute()
        print("✔ Acceso a carpeta:", result["name"])
    except Exception as e:
        print("❌ No se puede acceder a la carpeta")
        print(e)

def test_template_access(drive):
    print("\n=== Test 3: Verificar acceso a la plantilla ===")
    try:
        result = drive.files().get(
            fileId=FORM_TEMPLATE_ID,
            supportsAllDrives=True,
            fields="id, name"
        ).execute()
        print("✔ Acceso al formulario plantilla:", result["name"])
    except Exception as e:
        print("❌ No se puede acceder a la plantilla")
        print("Probable causa: el Service Account NO tiene permisos")
        print(e)

if __name__ == "__main__":
    drive = connect_drive()
    test_list_teamdrive(drive)
    test_folder_access(drive)
    test_template_access(drive)
