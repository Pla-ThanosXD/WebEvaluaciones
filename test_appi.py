from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import json

TOKEN_FILE = "token.json"
CREDENTIALS_FILE = "credentials.json"

def load_credentials():
    creds = None
    try:
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, ["https://www.googleapis.com/auth/forms.body.readonly"])
        print("✔ Token cargado correctamente")
    except Exception as e:
        print("❌ No se pudo cargar el token:", e)
    return creds

def main():
    creds = load_credentials()
    if not creds:
        print("\n⚠ Debes borrar token.json y volver a generar permisos.\n")
        return

    print("\n=== Test: Conexión con Google Forms API ===")

    try:
        # Inicializamos Forms API
        forms_service = build("forms", "v1", credentials=creds)

        # Hacemos una petición simple: crear un formulario vacío temporal
        response = forms_service.forms().create(
            body={"info": {"title": "TEST - API Forms"}}
        ).execute()

        form_id = response.get("formId")
        title = response.get("info", {}).get("title")

        print("✔ Forms API respondió correctamente")
        print("✔ Formulario creado:", title)
        print("✔ ID:", form_id)

        # Borramos el formulario inmediatamente desde Drive
        try:
            drive = build("drive", "v3", credentials=creds)
            drive.files().delete(fileId=form_id).execute()
            print("✔ Formulario temporal borrado")
        except:
            print("⚠ No se pudo borrar el formulario temporal (pero la API funciona)")

    except Exception as e:
        print("\n❌ ERROR Forms API:")
        print(e)
        return


if __name__ == "__main__":
    main()
