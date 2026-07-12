import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from agent.orchestrator import AgentOrchestrator
from agent.config import Settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager

@pytest.mark.asyncio
async def test_integration_smoke_gcp_architecture():
    settings = Settings(skills_dir="skills/drawio")
    
    # 1. Mock LLM Service returning compile_json_spec on turn 1
    llm_service = AsyncMock(spec=LLMService)
    
    spec_gcp = {
        "title": "GCP Architecture Diagram",
        "type": "architecture",
        "theme": "gcp",
        "containers": [
            { "id": "vpc_main", "label": "Main VPC", "type": "vpc" }
        ],
        "nodes": [
            { "id": "gke_node", "label": "GKE cluster", "type": "ecs", "parentId": "vpc_main" }
        ],
        "edges": []
    }
    
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "compile_json_spec"
    mock_tool_call.function.arguments = json.dumps({"spec": spec_gcp})
    mock_tool_call.id = "call-gcp-123"
    mock_msg_1.tool_calls = [mock_tool_call]
    
    mock_msg_2 = MagicMock()
    mock_msg_2.content = "GCP diagram generated successfully."
    mock_msg_2.tool_calls = None
    
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2]

    # 2. Mock MCP Bridge
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "compile_json_spec", "inputSchema": {}}]
    mcp_bridge.call_tool.return_value = {"success": True, "xml": "<mxfile>mock-gcp-xml</mxfile>"}

    # 3. Run Orchestrator
    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(
            settings=settings,
            llm_service=llm_service,
            mcp_bridge=mcp_bridge,
            conversation_manager=conversation_manager
        )
        
        events = []
        async for event in orchestrator.run(
            session_id="session-gcp-smoke",
            prompt="Generate a GCP architecture diagram with a main VPC and a GKE cluster.",
            diagram_xml=None
        ):
            events.append(event)

        # Assertions
        # Ensure compile_json_spec was called
        mcp_bridge.call_tool.assert_any_call("compile_json_spec", {"spec": spec_gcp})
        # Check that we received the tool progress and completion event
        chat_msgs = [e for e in events if e.get("event") == "chat_message"]
        assert len(chat_msgs) > 0
        assert "GCP diagram generated successfully" in chat_msgs[-1]["data"]["text"]


@pytest.mark.asyncio
async def test_integration_smoke_flowchart():
    settings = Settings(skills_dir="skills/drawio")
    
    # 1. Mock LLM Service returning compile_json_spec on turn 1
    llm_service = AsyncMock(spec=LLMService)
    
    spec_flowchart = {
        "title": "Onboarding Flowchart",
        "type": "flowchart",
        "theme": "default",
        "nodes": [
            { "id": "step1", "label": "Start", "type": "circle" },
            { "id": "step2", "label": "End", "type": "rectangle" }
        ],
        "edges": [
            { "sourceId": "step1", "targetId": "step2" }
        ]
    }
    
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "compile_json_spec"
    mock_tool_call.function.arguments = json.dumps({"spec": spec_flowchart})
    mock_tool_call.id = "call-flowchart-123"
    mock_msg_1.tool_calls = [mock_tool_call]
    
    mock_msg_2 = MagicMock()
    mock_msg_2.content = "Flowchart generated successfully."
    mock_msg_2.tool_calls = None
    
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2]

    # 2. Mock MCP Bridge
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "compile_json_spec", "inputSchema": {}}]
    mcp_bridge.call_tool.return_value = {"success": True, "xml": "<mxfile>mock-flowchart-xml</mxfile>"}

    # 3. Run Orchestrator
    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(
            settings=settings,
            llm_service=llm_service,
            mcp_bridge=mcp_bridge,
            conversation_manager=conversation_manager
        )
        
        events = []
        async for event in orchestrator.run(
            session_id="session-flow-smoke",
            prompt="Generate a flowchart from Start to End.",
            diagram_xml=None
        ):
            events.append(event)

        # Assertions
        mcp_bridge.call_tool.assert_any_call("compile_json_spec", {"spec": spec_flowchart})
        chat_msgs = [e for e in events if e.get("event") == "chat_message"]
        assert len(chat_msgs) > 0
        assert "Flowchart generated successfully" in chat_msgs[-1]["data"]["text"]


@pytest.mark.asyncio
async def test_integration_smoke_kubernetes_topology():
    settings = Settings(skills_dir="skills/drawio")
    
    # 1. Mock LLM Service returning compile_json_spec on turn 1
    llm_service = AsyncMock(spec=LLMService)
    
    spec_k8s = {
        "title": "K8s Cluster Pod Layout",
        "type": "kubernetes",
        "theme": "default",
        "containers": [
            { "id": "ns_dev", "label": "Namespace: dev", "type": "lane" }
        ],
        "nodes": [
            { "id": "pod1", "label": "Pod: app", "type": "group", "parentId": "ns_dev" }
        ],
        "edges": []
    }
    
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "compile_json_spec"
    mock_tool_call.function.arguments = json.dumps({"spec": spec_k8s})
    mock_tool_call.id = "call-k8s-123"
    mock_msg_1.tool_calls = [mock_tool_call]
    
    mock_msg_2 = MagicMock()
    mock_msg_2.content = "Kubernetes topology generated successfully."
    mock_msg_2.tool_calls = None
    
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2]

    # 2. Mock MCP Bridge
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "compile_json_spec", "inputSchema": {}}]
    mcp_bridge.call_tool.return_value = {"success": True, "xml": "<mxfile>mock-k8s-xml</mxfile>"}

    # 3. Run Orchestrator
    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(
            settings=settings,
            llm_service=llm_service,
            mcp_bridge=mcp_bridge,
            conversation_manager=conversation_manager
        )
        
        events = []
        async for event in orchestrator.run(
            session_id="session-k8s-smoke",
            prompt="Generate a Kubernetes diagram with namespace dev and pod app.",
            diagram_xml=None
        ):
            events.append(event)

        # Assertions
        mcp_bridge.call_tool.assert_any_call("compile_json_spec", {"spec": spec_k8s})
        chat_msgs = [e for e in events if e.get("event") == "chat_message"]
        assert len(chat_msgs) > 0
        assert "Kubernetes topology generated successfully" in chat_msgs[-1]["data"]["text"]
