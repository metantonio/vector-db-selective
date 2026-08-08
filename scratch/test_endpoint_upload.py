from fastapi.testclient import TestClient
import sys
from pathlib import Path
import json

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from main import app

client = TestClient(app)

sample_jsonl_content = '{"messages": [{"role": "system", "content": "Assistant"}, {"role": "user", "content": "¿Cuál es el horario del casino?"}, {"role": "assistant", "content": "[Source: reglamento.pdf]\nEl Casino Real atiende de 10:00 a 04:00."}]}\n'

response = client.post(
    "/api/refine-jsonl",
    files={"file": ("casino_db_finetune_messages.jsonl", sample_jsonl_content, "application/x-ndjson")}
)

print("Status Code:", response.status_code)
print("Response Header Content-Disposition:", response.headers.get("content-disposition"))
print("Refined JSONL Output:\n", response.text)
