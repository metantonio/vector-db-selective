import tempfile
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from vector_engine import VectorEngine

temp_dir = Path(tempfile.mkdtemp())
temp_db = temp_dir / "test_refinement.db"
temp_txt = temp_dir / "reglamento_casino.txt"

temp_txt.write_text("Artículo 12: El horario de atención del Casino Real es de lunes a domingo de 10:00 a 04:00 horas.")

engine = VectorEngine(temp_db)
engine.ingest_document(temp_txt, "reglamento_casino.txt", folder="CasinoRules", enrich_qa=False)


print("--- Testing export_jsonl with refine_answers=False ---")
jsonl_raw = engine.export_jsonl(format="messages", refine_answers=False)
print(jsonl_raw)

print("\n--- Testing export_jsonl with refine_answers=True ---")
jsonl_refined = engine.export_jsonl(format="messages", refine_answers=True)
print(jsonl_refined)
