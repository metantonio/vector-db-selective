import os
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from vector_engine import VectorEngine

db_file = Path(__file__).parent.parent / "data" / "databases" / "default.db"
engine = VectorEngine(db_file)

print("--- Testing Messages Format ---")
res_messages = engine.export_jsonl(format="messages")
print(res_messages[:500] if res_messages else "No chunks in DB")

print("\n--- Testing Alpaca Format ---")
res_alpaca = engine.export_jsonl(format="alpaca")
print(res_alpaca[:500] if res_alpaca else "No chunks in DB")

print("\n--- Testing Completion Format ---")
res_completion = engine.export_jsonl(format="completion")
print(res_completion[:500] if res_completion else "No chunks in DB")
