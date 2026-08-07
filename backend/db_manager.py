import os
import sqlite3
import datetime
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from vector_engine import VectorEngine

class DatabaseManager:
    """Manages creation, listing, deletion, and selection of isolated SQLite vector databases."""

    def __init__(self, data_dir: Optional[str] = None):
        if not data_dir:
            project_root = Path(__file__).parent.parent.resolve()
            env_dir = os.getenv("DATA_DIR", "./data/databases")
            if not Path(env_dir).is_absolute():
                self.data_dir = (project_root / env_dir).resolve()
            else:
                self.data_dir = Path(env_dir).resolve()
        else:
            p = Path(data_dir)
            if not p.is_absolute():
                project_root = Path(__file__).parent.parent.resolve()
                self.data_dir = (project_root / p).resolve()
            else:
                self.data_dir = p.resolve()

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.registry_db = self.data_dir / "_registry.db"
        self._init_registry()


    def _init_registry(self):
        """Initialize the master registry DB that keeps track of databases and their metadata."""
        with sqlite3.connect(self.registry_db) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS databases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    db_filename TEXT NOT NULL
                )
            """)
            conn.commit()

        # Ensure default database exists
        if not self.get_database("default"):
            self.create_database("default", "Default Vector Store", "System default vector database")

    def _slugify(self, text: str) -> str:
        text = text.lower().strip()
        text = re.sub(r"[^\w\s-]", "", text)
        return re.sub(r"[-\s]+", "_", text)

    def create_database(self, db_id: str, name: str, description: str = "") -> Dict[str, Any]:
        """Create a new isolated vector database file."""
        clean_id = self._slugify(db_id)
        if not clean_id:
            clean_id = f"db_{int(datetime.datetime.utcnow().timestamp())}"

        db_filename = f"{clean_id}.db"
        db_filepath = self.data_dir / db_filename
        created_at = datetime.datetime.utcnow().isoformat()

        with sqlite3.connect(self.registry_db) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO databases (id, name, description, created_at, db_filename) VALUES (?, ?, ?, ?, ?)",
                (clean_id, name.strip(), description.strip(), created_at, db_filename)
            )
            conn.commit()

        # Initialize the actual database schema via VectorEngine initialization
        from vector_engine import VectorEngine
        engine = VectorEngine(db_filepath)
        stats = engine.get_stats()

        return {
            "id": clean_id,
            "name": name,
            "description": description,
            "created_at": created_at,
            "document_count": stats["document_count"],
            "chunk_count": stats["chunk_count"],
            "file_size_bytes": stats["file_size_bytes"]
        }

    def list_databases(self) -> List[Dict[str, Any]]:
        """List all available vector databases with live statistics."""
        with sqlite3.connect(self.registry_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, description, created_at, db_filename FROM databases ORDER BY created_at ASC")
            rows = cursor.fetchall()

        from vector_engine import VectorEngine
        result = []
        for r in rows:
            db_id, name, desc, created_at, db_filename = r
            db_filepath = self.data_dir / db_filename
            engine = VectorEngine(db_filepath)
            stats = engine.get_stats()
            result.append({
                "id": db_id,
                "name": name,
                "description": desc or "",
                "created_at": created_at,
                "document_count": stats["document_count"],
                "chunk_count": stats["chunk_count"],
                "file_size_bytes": stats["file_size_bytes"]
            })
        return result

    def get_database(self, db_id: str) -> Optional[Dict[str, Any]]:
        """Get info for a specific database."""
        with sqlite3.connect(self.registry_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, description, created_at, db_filename FROM databases WHERE id = ?", (db_id,))
            row = cursor.fetchone()
            if not row:
                return None
            
        db_id, name, desc, created_at, db_filename = row
        db_filepath = self.data_dir / db_filename
        from vector_engine import VectorEngine
        engine = VectorEngine(db_filepath)
        stats = engine.get_stats()
        return {
            "id": db_id,
            "name": name,
            "description": desc or "",
            "created_at": created_at,
            "document_count": stats["document_count"],
            "chunk_count": stats["chunk_count"],
            "file_size_bytes": stats["file_size_bytes"]
        }

    def delete_database(self, db_id: str) -> bool:
        """Delete a vector database and all its physical files on disk."""
        import gc
        import time

        db_filename = None
        if db_id == "default":
            db_filename = "default.db"
        else:
            with sqlite3.connect(self.registry_db) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT db_filename FROM databases WHERE id = ?", (db_id,))
                row = cursor.fetchone()
                if not row:
                    return False
                db_filename = row[0]
                cursor.execute("DELETE FROM databases WHERE id = ?", (db_id,))
                conn.commit()

        # Force garbage collection to release any lingering SQLite handles
        gc.collect()

        db_filepath = self.data_dir / db_filename
        base_path = str(db_filepath)

        # Remove primary .db file as well as auxiliary SQLite journal/wal files
        target_files = [
            Path(base_path),
            Path(base_path + "-journal"),
            Path(base_path + "-wal"),
            Path(base_path + "-shm"),
        ]

        for file_path in target_files:
            if file_path.exists():
                deleted = False
                for attempt in range(4):
                    try:
                        os.remove(file_path)
                        deleted = True
                        break
                    except Exception as err:
                        gc.collect()
                        time.sleep(0.15)
                if not deleted:
                    print(f"[Warning] Could not remove physical file {file_path}")

        if db_id == "default":
            from vector_engine import VectorEngine
            VectorEngine(self.data_dir / "default.db")

        return True

    def get_engine(self, db_id: str):
        """Get VectorEngine instance for the specified database id."""
        db_info = self.get_database(db_id)
        if not db_info:
            raise ValueError(f"Database with id '{db_id}' does not exist.")
        db_filename = f"{db_info['id']}.db"
        return VectorEngine(self.data_dir / db_filename)
