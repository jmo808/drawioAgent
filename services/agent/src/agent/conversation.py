import os
import json
import logging
import re
from typing import Any, Dict, List
from agent.config import Settings
from agent.template_matcher import TemplateMatcher

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
        self.template_matcher = TemplateMatcher(
            templates_dir=os.path.join(self.settings.skills_dir, "references", "templates")
        )

    def get_or_create_conversation(self, session_id: str, tools: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
        """
        Retrieves or initializes the conversation session.
        """
        if session_id not in self.conversations:
            self.conversations[session_id] = {
                "history": [],
                "tools": tools or [],
                "loaded_references": {
                    "xml-style-reference.md",
                    "layout-patterns.md",
                    "edge-routing-guide.md"
                },
                "matched_template_id": None,
                "matched_template_spec": None
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

            # Dynamic Few-Shot RAG: match template
            match = self.template_matcher.match(content)
            if match:
                current_match_id = self.conversations[session_id].get("matched_template_id")
                if current_match_id != match.template_id:
                    self.conversations[session_id]["matched_template_id"] = match.template_id
                    self.conversations[session_id]["matched_template_spec"] = match.spec_json
                    changed = True
                    logger.info(f"Dynamically matched template: {match.template_id} (score {match.score}) for session {session_id}")

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

    # Pre-compiled word-boundary patterns for short keywords
    # that are prone to substring false positives.
    _AWS_PATTERN = re.compile(r'\baws\b')
    _GCP_PATTERN = re.compile(r'\b(?:gcp|gke)\b|google cloud')
    _K8S_PATTERN = re.compile(
        r'\b(?:kubernetes|k8s|pod|namespace|deployment)\b'
    )
    _PFD_PATTERN = re.compile(r'\bpfd\b')
    _ERD_PATTERN = re.compile(
        r'\b(?:erd|database|schema|table|entity|relationship|pk|fk)\b'
    )
    _PID_PATTERN = re.compile(r'\bpid\b|p&id')
    _NET_PATTERN = re.compile(
        r'\b(?:network|topology|switch|router|firewall|'
        r'vlan|wan|lan)\b'
    )

    def _scan_for_keywords(self, content: str) -> List[str]:
        """
        Scans content for expert domain keywords and returns matching doc names.

        Uses word-boundary-aware regex to avoid false positives from
        substring matches (e.g. 'lan' inside 'balance').
        """
        detected = []
        content_lower = content.lower()

        if self._AWS_PATTERN.search(content_lower) or "aws" in content_lower or "topology_error" in content_lower:
            detected.append("aws-well-architected-reviewer.md")
        if self._GCP_PATTERN.search(content_lower) or "gcp" in content_lower:
            detected.append("gcp-well-architected-reviewer.md")
        if self._K8S_PATTERN.search(content_lower) or "kubernetes" in content_lower:
            detected.append("kubernetes-topology-expert.md")
        if self._PFD_PATTERN.search(content_lower) or "pfd" in content_lower:
            detected.append("pfd-engineering-expert.md")
        if self._ERD_PATTERN.search(content_lower) or "erd" in content_lower:
            detected.append("erd-database-expert.md")
        if self._PID_PATTERN.search(content_lower) or "pid" in content_lower:
            detected.append("pid-reference.md")
        if self._NET_PATTERN.search(content_lower) or "network" in content_lower:
            detected.append("network-topology-expert.md")

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

        # Add matched few-shot template
        matched_spec = session.get("matched_template_spec")
        if matched_spec:
            prompt_parts.append(
                f"\n## Few-Shot Example\n"
                f"You have matched a high-similarity reference template architecture: '{session.get('matched_template_id')}'.\n"
                f"Use this template JSON spec as a guiding pattern for the schema structures, nesting layouts, and relationship connections. "
                f"You can adapt, expand, or customize it to fulfill the user's specific request. Do NOT blindly copy coordinates from it, but let ELK "
                f"or our builder position elements dynamically.\n"
                f"Matched Spec JSON:\n"
                f"```json\n"
                f"{json.dumps(matched_spec, indent=2)}\n"
                f"```\n"
            )

        return "\n".join(prompt_parts)
