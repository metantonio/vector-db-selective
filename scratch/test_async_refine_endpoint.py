from fastapi.testclient import TestClient
import sys
import time
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from main import app

client = TestClient(app)

sample_jsonl_content = '{"messages": [{"role": "system", "content": "Assistant"}, {"role": "user", "content": "¿Cuál es el horario del casino?"}, {"role": "assistant", "content": "[Source: reglamento.pdf]\nEl Casino Real atiende de 10:00 a 04:00."}]}\n'

response = client.post(
    "/api/refine-jsonl/start",
    files={"file": ("casino_db_finetune_messages.jsonl", sample_jsonl_content, "application/x-ndjson")}
)

print("Start Task Status Code:", response.status_code)
task_data = response.json()
print("Task Response:", task_data)
task_id = task_data["task_id"]

# Poll for task completion
for _ in range(10):
    status_resp = client.get(f"/api/refine-jsonl/tasks/{task_id}")
    status_data = status_resp.json()
    print("Task Status:", status_data.get("status"), f"({status_data.get('percentage')}%) - {status_data.get('status_message')}")
    if status_data.get("status") == "completed":
        break
    time.sleep(1)

# Test download endpoint
dl_resp = client.get(f"/api/refine-jsonl/download/{task_id}")
print("\nDownload Response Code:", dl_resp.status_code)
print("Download Content-Disposition:", dl_resp.headers.get("content-disposition"))
print("Downloaded Refined Output:\n", dl_resp.text)
