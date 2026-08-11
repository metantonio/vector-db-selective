import sqlite3
import json
import sys
from pathlib import Path

# Fix stdout encoding for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

db_path = Path("./data/databases/casino_db.db").resolve()
print(f"Checking database at: {db_path}")

if not db_path.exists():
    print("Database file does not exist!")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM chunks")
    chunk_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM documents")
    doc_count = cursor.fetchone()[0]
    print(f"Database statistics: {doc_count} documents, {chunk_count} chunks")
    
    try:
        import chromadb
        print("chromadb module is installed!")
        
        # Create persistent ChromaDB client
        chroma_client = chromadb.PersistentClient(path="./scratch/chroma_casino_data")
        collection = chroma_client.get_or_create_collection(name="casino_collection")
        
        cursor.execute("SELECT id, filename, content, embedding FROM chunks")
        rows = cursor.fetchall()
        
        ids = []
        documents = []
        metadatas = []
        
        for chunk_id, filename, content, emb_json in rows:
            # Note: casino_db.db stores sparse TF-IDF dictionary weights in 'embedding' column
            ids.append(chunk_id)
            documents.append(content)
            metadatas.append({
                "filename": filename,
                "tfidf_terms_count": len(json.loads(emb_json)) if emb_json else 0
            })
            
        if ids:
            # Batch add to ChromaDB (ChromaDB will automatically generate dense vectors for documents)
            batch_size = 50
            for i in range(0, len(ids), batch_size):
                collection.add(
                    ids=ids[i:i+batch_size],
                    documents=documents[i:i+batch_size],
                    metadatas=metadatas[i:i+batch_size]
                )
            print(f"Successfully loaded {len(ids)} items into ChromaDB collection!")
            print("Total Collection count in ChromaDB:", collection.count())
            
            # Perform a test query using ChromaDB dense search
            query_text = "What is the primary goal of marketing?"
            results = collection.query(
                query_texts=[query_text],
                n_results=3
            )
            print(f"\n🔍 Search Query: '{query_text}'")
            print("Results from ChromaDB:")
            for idx, doc_id in enumerate(results['ids'][0]):
                dist = results['distances'][0][idx] if 'distances' in results and results['distances'] else N/A
                preview = results['documents'][0][idx][:120].replace('\n', ' ')
                print(f"  {idx+1}. ID: {doc_id} | Distance: {dist:.4f} | Preview: {preview}...")
        else:
            print("No chunks found in database.")
            
    except Exception as e:
        print(f"Error during ChromaDB operations: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()
