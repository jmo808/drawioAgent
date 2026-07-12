import pytest
import os
import tempfile
from agent.conversation import ConversationManager
from agent.config import Settings

@pytest.fixture
def temp_skills_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create SKILL.md
        skill_md = os.path.join(tmpdir, "SKILL.md")
        with open(skill_md, "w") as f:
            f.write("# DrawIO Editor Agent Skill\nThis is the base skill prompt.")
            
        # Create references directory
        ref_dir = os.path.join(tmpdir, "references")
        os.makedirs(ref_dir, exist_ok=True)
        
        # Create reference files
        with open(os.path.join(ref_dir, "aws-well-architected-reviewer.md"), "w") as f:
            f.write("AWS reference doc content.")
        with open(os.path.join(ref_dir, "pfd-engineering-expert.md"), "w") as f:
            f.write("PFD reference doc content.")
        with open(os.path.join(ref_dir, "pid-reference.md"), "w") as f:
            f.write("PID reference doc content.")
        with open(os.path.join(ref_dir, "kubernetes-topology-expert.md"), "w") as f:
            f.write("Kubernetes reference doc content.")
            
        yield tmpdir

def test_conversation_manager_creation_and_append(temp_skills_dir):
    settings = Settings(skills_dir=temp_skills_dir)
    mgr = ConversationManager(settings)
    
    session_id = "test-session"
    messages = mgr.get_or_create_conversation(session_id)
    assert len(messages) == 1
    assert messages[0]["role"] == "system"
    assert "base skill prompt" in messages[0]["content"]
    
    # Append message
    mgr.add_message(session_id, "user", "draw a flowchart")
    messages = mgr.get_conversation(session_id)
    assert len(messages) == 2
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "draw a flowchart"

def test_on_demand_reference_loading(temp_skills_dir):
    settings = Settings(skills_dir=temp_skills_dir)
    mgr = ConversationManager(settings)
    
    session_id = "test-session-2"
    mgr.get_or_create_conversation(session_id)
    
    # Append message mentioning aws
    mgr.add_message(session_id, "user", "I need to design an AWS architecture diagram.")
    
    # System prompt should be updated to include the AWS doc
    messages = mgr.get_conversation(session_id)
    assert len(messages) == 2
    assert "AWS reference doc content" in messages[0]["content"]
    assert "PFD reference doc content" not in messages[0]["content"]

    # Now append message mentioning pfd
    mgr.add_message(session_id, "user", "Make it a PFD engineering diagram.")
    messages = mgr.get_conversation(session_id)
    assert "AWS reference doc content" in messages[0]["content"]
    assert "PFD reference doc content" in messages[0]["content"]

    # Now append message mentioning k8s
    mgr.add_message(session_id, "user", "And deploy it on k8s.")
    messages = mgr.get_conversation(session_id)
    assert "Kubernetes reference doc content" in messages[0]["content"]

def test_dynamic_tool_schemas(temp_skills_dir):
    settings = Settings(skills_dir=temp_skills_dir)
    mgr = ConversationManager(settings)
    
    session_id = "test-session-3"
    tools = [
        {"name": "add_node", "description": "Add node", "inputSchema": {}}
    ]
    
    messages = mgr.get_or_create_conversation(session_id, tools=tools)
    assert "add_node" in messages[0]["content"]
    assert "Add node" in messages[0]["content"]

def test_context_window_truncation(temp_skills_dir):
    settings = Settings(skills_dir=temp_skills_dir)
    mgr = ConversationManager(settings)
    
    session_id = "test-session-4"
    mgr.get_or_create_conversation(session_id)
    
    # Add messages
    for i in range(10):
        mgr.add_message(session_id, "user" if i % 2 == 0 else "assistant", f"Message {i}")
        
    # Let's truncate to max 4 message history (+ system prompt)
    mgr.truncate_conversation(session_id, max_history_messages=4)
    
    messages = mgr.get_conversation(session_id)
    # Total messages should be 5: system prompt + last 4 history messages
    assert len(messages) == 5
    assert messages[0]["role"] == "system"
    assert messages[1]["content"] == "Message 6"
    assert messages[4]["content"] == "Message 9"
