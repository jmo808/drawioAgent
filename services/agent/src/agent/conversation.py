import os
import json
import logging
from typing import Any, Dict, List, Set
from agent.config import Settings

logger = logging.getLogger(__name__)

class ConversationManager:
    """
    Manages session-based conversation history, dynamic system prompt construction,
    on-demand reference loading, and history truncation.
    """
    def __init__(self, settings: Settings):
        self.settings = settings
        # Maps session_id -> { "history": [...], "tools": [...], "loaded_references": set() }
        self.conversations: Dict[str, Dict[str, Any]] = {}

    def get_or_create_conversation(self, session_id: str, tools: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
        """
        Retrieves or initializes the conversation session.
        """
        if session_id not in self.conversations:
            self.conversations[session_id] = {
                "history": [],
                "tools": tools or [],
                "loaded_references": set()
            }
            # Initialize with system prompt
            system_prompt = self._rebuild_system_prompt(session_id)
            self.conversations[session_id]["history"].append({
                "role": "system",
                "content": system_prompt
            })
            
        return self.get_conversation(session_id)

    def get_conversation(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Returns the message list for the conversation session.
        """
        if session_id not in self.conversations:
            return []
        return self.conversations[session_id]["history"]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        """
        Appends a message to history. If a user message, performs keyword scanning
        to load reference documents on-demand.
        """
        if session_id not in self.conversations:
            self.get_or_create_conversation(session_id)

        history = self.conversations[session_id]["history"]
        history.append({"role": role, "content": content})

        if role == "user":
            # Keyword scanning
            new_docs = self._scan_for_keywords(content)
            loaded = self.conversations[session_id]["loaded_references"]
            
            # Check if any new doc is detected that hasn't been loaded yet
            changed = False
            for doc in new_docs:
                if doc not in loaded:
                    loaded.add(doc)
                    changed = True
                    logger.info(f"Dynamically loading reference doc: {doc} for session {session_id}")

            if changed:
                # Rebuild system prompt and update history[0]
                new_system = self._rebuild_system_prompt(session_id)
                history[0]["content"] = new_system

    def truncate_conversation(self, session_id: str, max_history_messages: int) -> None:
        """
        Truncates oldest messages from conversation history to fit context window limits.
        Always preserves the system prompt at index 0.
        """
        if session_id not in self.conversations:
            return

        history = self.conversations[session_id]["history"]
        if len(history) <= 1:
            return

        # Keep system prompt at index 0, and the last N messages
        system_prompt = history[0]
        recent_history = history[1:]
        
        if len(recent_history) > max_history_messages:
            recent_history = recent_history[-max_history_messages:]
            
        self.conversations[session_id]["history"] = [system_prompt] + recent_history

    def _scan_for_keywords(self, content: str) -> List[str]:
        """
        Scans content for expert domain keywords and returns matching doc names.
        """
        detected = []
        content_lower = content.lower()
        
        if "aws" in content_lower:
            detected.append("aws-well-architected-reviewer.md")
        if any(k in content_lower for k in ["gcp", "google cloud", "gke", "kubernetes"]):
            detected.append("gcp-well-architected-reviewer.md")
        if "pfd" in content_lower:
            detected.append("pfd-engineering-expert.md")
        if "pid" in content_lower or "p&id" in content_lower:
            detected.append("pid-reference.md")
            
        return detected

    def _rebuild_system_prompt(self, session_id: str) -> str:
        """
        Constructs the system prompt from base SKILL.md, dynamic tools,
        and dynamically loaded reference documents.
        """
        session = self.conversations[session_id]
        
        # Load SKILL.md
        skill_path = os.path.join(self.settings.skills_dir, "SKILL.md")
        base_prompt = ""
        if os.path.exists(skill_path):
            try:
                with open(skill_path, "r", encoding="utf-8") as f:
                    base_prompt = f.read()
            except Exception as e:
                logger.error(f"Error reading SKILL.md: {e}")
                
        if not base_prompt:
            base_prompt = "# DrawIO Agent Base System Prompt"

        prompt_parts = [base_prompt]

        # Add tools schema descriptions
        tools = session["tools"]
        if tools:
            prompt_parts.append("\n## Available Tools\nYou have access to the following draw.io manipulation tools:\n")
            for t in tools:
                prompt_parts.append(
                    f"### {t['name']}\n"
                    f"Description: {t.get('description', '')}\n"
                    f"Parameters: {json.dumps(t.get('inputSchema', {}))}\n"
                )

        # Add dynamically loaded references
        loaded_refs = session["loaded_references"]
        if loaded_refs:
            prompt_parts.append("\n## Reference Architecture Guides\n")
            for doc in sorted(loaded_refs):
                doc_path = os.path.join(self.settings.skills_dir, "references", doc)
                if os.path.exists(doc_path):
                    try:
                        with open(doc_path, "r", encoding="utf-8") as f:
                            ref_content = f.read()
                        prompt_parts.append(f"\n### {doc}\n{ref_content}\n")
                    except Exception as e:
                        logger.error(f"Error reading reference doc {doc}: {e}")

        return "\n".join(prompt_parts)
