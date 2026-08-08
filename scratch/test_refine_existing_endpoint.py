import json
import tempfile
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent / "backend"))
from db_manager import DatabaseManager
from vector_engine import VectorEngine

db_manager = DatabaseManager()
engine = db_manager.get_engine("default")

# Sample JSONL data
sample_jsonl = [
    {"messages": [{"role": "system", "content": "Assistant"}, {"role": "user", "content": "¿Cuál es el horario del casino?"}, {"role": "assistant", "content": "[Source: reglamento.pdf | Folder: General]\nEl Casino Real atiende de lunes a domingo de 10:00 a 04:00 horas en la sede principal."}]},
    {"instruction": "¿Qué juegos de mesa se ofrecen?", "input": "Source: reglamento.pdf", "output": "En la sala principal hay póker, ruleta francesa y blackjack."}
]

print("--- Testing Refinement of Existing JSONL entries ---")
for line_data in sample_jsonl:
    if "messages" in line_data:
        q = line_data["messages"][1]["content"]
        raw_a = line_data["messages"][2]["content"]
        refined_a = engine.refine_answer(q, raw_a, "reglamento.pdf")
        line_data["messages"][2]["content"] = refined_a
    elif "instruction" in line_data:
        q = line_data["instruction"]
        raw_a = line_data["output"]
        refined_a = engine.refine_answer(q, raw_a, "reglamento.pdf")
        line_data["output"] = refined_a

    print(json.dumps(line_data, ensure_ascii=False))
