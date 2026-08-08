import tempfile
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from vector_engine import VectorEngine

temp_dir = Path(tempfile.mkdtemp())
temp_db = temp_dir / "test.db"
temp_txt = temp_dir / "sample.txt"

temp_txt.write_text("Vector databases allow efficient similarity search over embeddings. Fine-tuning an LLM requires structured dataset pairs.")

engine = VectorEngine(temp_db)
doc_info = engine.ingest_document(temp_txt, "sample.txt", folder="TechDocs", enrich_qa=False)

print("Ingested doc:", doc_info)

jsonl_msg = engine.export_jsonl(format="messages")
print("\n--- Messages Output ---")
print(jsonl_msg)

jsonl_alpaca = engine.export_jsonl(format="alpaca")
print("\n--- Alpaca Output ---")
print(jsonl_alpaca)

jsonl_comp = engine.export_jsonl(format="completion")
print("\n--- Completion Output ---")
print(jsonl_comp)
