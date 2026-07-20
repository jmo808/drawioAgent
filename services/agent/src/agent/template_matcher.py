import os
import json
import math
import re
from typing import Any, Dict, List, Optional, NamedTuple
from agent.config import settings

class TemplateMatch(NamedTuple):
    template_id: str
    score: float
    spec_json: Dict[str, Any]

class TemplateMatcher:
    """
    Zero-dependency TF-IDF + Cosine Similarity matching engine for few-shot diagram templates.
    Fits the corpus of 15-20 diagram templates on startup (< 1ms).
    """
    STOP_WORDS = {
        'a', 'an', 'the', 'and', 'or', 'in', 'of', 'on', 'at', 'to', 'for', 'with', 
        'by', 'about', 'is', 'are', 'was', 'were', 'been', 'has', 'have', 'had', 
        'it', 'this', 'that', 'these', 'those', 'we', 'you', 'they', 'i', 'create',
        'diagram', 'architecture', 'using', 'with'
    }

    def __init__(self, templates_dir: Optional[str] = None):
        if not templates_dir:
            templates_dir = os.path.join(settings.skills_dir, "references", "templates")
            
        self.templates_dir = templates_dir
        self.index_data: List[Dict[str, Any]] = []
        self.doc_vectors: Dict[str, Dict[str, float]] = {}
        self.idfs: Dict[str, float] = {}
        
        self._load_and_fit()

    def _tokenize(self, text: str) -> List[str]:
        # Lowercase, replace non-alphanumeric with spaces, and split
        clean_text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
        tokens = [t for t in clean_text.split() if t and t not in self.STOP_WORDS]
        return tokens

    def _load_and_fit(self) -> None:
        index_path = os.path.join(self.templates_dir, "index.json")
        if not os.path.exists(index_path):
            return

        with open(index_path, "r", encoding="utf-8") as f:
            self.index_data = json.load(f)

        # 1. Count Document Frequencies (DF)
        dfs: Dict[str, int] = {}
        doc_tokens: Dict[str, List[str]] = {}
        
        for entry in self.index_data:
            desc = entry.get("description", "")
            title = entry.get("id", "").replace("_", " ")
            # Combine title/id and description for better match signal
            combined_text = f"{title} {desc}"
            
            tokens = self._tokenize(combined_text)
            doc_tokens[entry["id"]] = tokens
            
            # Count unique tokens in this document
            unique_tokens = set(tokens)
            for token in unique_tokens:
                dfs[token] = dfs.get(token, 0) + 1

        # 2. Compute IDF for each term
        num_docs = len(self.index_data)
        for term, df in dfs.items():
            self.idfs[term] = math.log(1.0 + (num_docs / (1.0 + df)))

        # 3. Compute TF-IDF vectors for each document
        for entry in self.index_data:
            tid = entry["id"]
            tokens = doc_tokens[tid]
            if not tokens:
                continue
                
            # Count term frequencies
            tf: Dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
                
            # Compute TF-IDF weights
            vector: Dict[str, float] = {}
            total_tokens = len(tokens)
            for term, count in tf.items():
                term_tf = count / total_tokens
                vector[term] = term_tf * self.idfs.get(term, 0.0)
                
            # Normalize vector magnitude for cosine similarity
            magnitude = math.sqrt(sum(val ** 2 for val in vector.values()))
            if magnitude > 0.0:
                self.doc_vectors[tid] = {term: val / magnitude for term, val in vector.items()}
            else:
                self.doc_vectors[tid] = vector

    def match(self, query: str, threshold: float = 0.3) -> Optional[TemplateMatch]:
        """
        Computes cosine similarity of query against the template corpus.
        Returns the top matching TemplateMatch if above threshold, else None.
        """
        query_tokens = self._tokenize(query)
        if not query_tokens or not self.doc_vectors:
            return None

        # Compute query TF-IDF vector
        query_tf: Dict[str, int] = {}
        for t in query_tokens:
            query_tf[t] = query_tf.get(t, 0) + 1

        query_vector: Dict[str, float] = {}
        total_tokens = len(query_tokens)
        for term, count in query_tf.items():
            if term in self.idfs:
                term_tf = count / total_tokens
                query_vector[term] = term_tf * self.idfs[term]

        magnitude = math.sqrt(sum(val ** 2 for val in query_vector.values()))
        if magnitude <= 0.0:
            return None
            
        # Normalize query vector
        query_vector_norm = {term: val / magnitude for term, val in query_vector.items()}

        best_id: Optional[str] = None
        best_score = -1.0

        # Compute cosine similarity with each document
        for tid, doc_vector in self.doc_vectors.items():
            # Dot product of normalized vectors
            score = 0.0
            for term, val in query_vector_norm.items():
                if term in doc_vector:
                    score += val * doc_vector[term]
                    
            if score > best_score:
                best_score = score
                best_id = tid

        if best_id and best_score >= threshold:
            # Locate file in index data
            entry = next((item for item in self.index_data if item["id"] == best_id), None)
            if entry:
                file_path = os.path.join(self.templates_dir, entry["file"])
                if os.path.exists(file_path):
                    try:
                        with open(file_path, "r", encoding="utf-8") as tf:
                            spec_json = json.load(tf)
                        return TemplateMatch(
                            template_id=best_id,
                            score=best_score,
                            spec_json=spec_json
                        )
                    except Exception as e:
                        # Log error, fallback
                        pass
        return None
