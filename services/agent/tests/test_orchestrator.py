import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agent.orchestrator import AgentOrchestrator
from agent.config import Settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager

@pytest.mark.asyncio
async def test_orchestrator_successful_flow():
    settings = Settings(skills_dir="skills/drawio")
    
    # Mock LLMService
    llm_service = AsyncMock(spec=LLMService)
    # Turn 1: LLM returns tool call
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "add_node"
    mock_tool_call.function.arguments = '{"label": "Node 1"}'
    mock_tool_call.id = "call-123"
    mock_msg_1.tool_calls = [mock_tool_call]
    
    # Turn 2: LLM returns text content
    mock_msg_2 = MagicMock()
    mock_msg_2.content = "Diagram completed!"
    mock_msg_2.tool_calls = None
    
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2]

    # Mock MCPBridge
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "add_node", "inputSchema": {}}]
    mcp_bridge.call_tool.side_effect = [
        None, # init_diagram / open_drawio_xml
        {"success": True}, # add_node tool call
        {"xml": "<mxfile>mock-xml</mxfile>"} # finalize tool call
    ]

    # Mock ConversationManager
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
            session_id="session-e2e",
            prompt="draw a node",
            diagram_xml=None
        ):
            events.append(event)
            
        # Assertions
        # 1. Start progress
        assert events[0] == {
            "event": "tool_progress",
            "data": {"toolName": "init_diagram", "step": 0, "totalSteps": 2, "message": "Initializing new diagram"}
        }
        
        # 2. Archimedes AI thinking (turn 1)
        assert events[1] == {
            "event": "tool_progress",
            "data": {
                "toolName": "Archimedes AI",
                "step": 1,
                "totalSteps": 15,
                "message": "Reasoning about requirements and planning diagram layout..."
            }
        }
        
        # 3. Tool progress event during execution
        assert events[2] == {
            "event": "tool_progress",
            "data": {"toolName": "add_node", "step": 1, "totalSteps": 1, "message": "Executing tool add_node"}
        }
        
        # 4. Archimedes AI thinking (turn 2)
        assert events[3] == {
            "event": "tool_progress",
            "data": {
                "toolName": "Archimedes AI",
                "step": 2,
                "totalSteps": 15,
                "message": "Added node to diagram. Re-aligning container boundaries..."
            }
        }
        
        # 5. Final XML diagram update
        assert events[4] == {
            "event": "diagram_update",
            "data": {"xml": "<mxfile>mock-xml</mxfile>"}
        }
        
        # 6. Final chat message
        assert events[5] == {
            "event": "chat_message",
            "data": {"text": "Diagram completed!"}
        }
        
        # Verify MCPBridge calls
        mcp_bridge.call_tool.assert_any_call("init_diagram", {})
        mcp_bridge.call_tool.assert_any_call("add_node", {"label": "Node 1"})
        mcp_bridge.call_tool.assert_any_call("finalize", {})

@pytest.mark.asyncio
async def test_orchestrator_restore_xml():
    settings = Settings(skills_dir="skills/drawio")
    llm_service = AsyncMock(spec=LLMService)
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = []
    
    mock_msg = MagicMock()
    mock_msg.content = "Diagram restored!"
    mock_msg.tool_calls = None
    llm_service.generate_chat.return_value = mock_msg

    mcp_bridge.call_tool.side_effect = [
        None, # open_drawio_xml
        {"content": [{"type": "text", "text": "<mxfile>restored-xml</mxfile>"}]} # finalize
    ]

    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(settings, llm_service, mcp_bridge, conversation_manager)
        
        events = []
        async for event in orchestrator.run("session-restore", "check diagram", "<mxfile>existing</mxfile>"):
            events.append(event)
            
        assert events[0] == {
            "event": "tool_progress",
            "data": {"toolName": "open_drawio_xml", "step": 0, "totalSteps": 2, "message": "Restoring diagram state from snapshot"}
        }
        assert events[1] == {
            "event": "tool_progress",
            "data": {
                "toolName": "Archimedes AI",
                "step": 1,
                "totalSteps": 15,
                "message": "Reasoning about requirements and planning diagram layout..."
            }
        }
        assert events[2] == {
            "event": "diagram_update",
            "data": {"xml": "<mxfile>restored-xml</mxfile>"}
        }
        mcp_bridge.call_tool.assert_any_call("open_drawio_xml", {"content": "<mxfile>existing</mxfile>"})

@pytest.mark.asyncio
async def test_orchestrator_initialization_error():
    settings = Settings(skills_dir="skills/drawio")
    llm_service = AsyncMock(spec=LLMService)
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.call_tool.side_effect = Exception("MCP start crashed")

    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(settings, llm_service, mcp_bridge, conversation_manager)
        
        events = []
        async for event in orchestrator.run("session-err", "draw flowchart"):
            events.append(event)
            
        assert len(events) == 2
        assert events[1]["event"] == "error"
        assert "State initialization failed" in events[1]["data"]["message"]

@pytest.mark.asyncio
async def test_orchestrator_llm_error():
    settings = Settings(skills_dir="skills/drawio")
    llm_service = AsyncMock(spec=LLMService)
    llm_service.generate_chat.side_effect = Exception("LLM connection timeout")
    
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = []
    mcp_bridge.call_tool.return_value = None

    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(settings, llm_service, mcp_bridge, conversation_manager)
        
        events = []
        async for event in orchestrator.run("session-llm-err", "draw flowchart"):
            events.append(event)
            
        assert events[-1]["event"] == "error"
        assert "LLM generation failed" in events[-1]["data"]["message"]

@pytest.mark.asyncio
async def test_orchestrator_tool_execution_error():
    settings = Settings(skills_dir="skills/drawio")
    llm_service = AsyncMock(spec=LLMService)
    
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "invalid_tool"
    mock_tool_call.function.arguments = '{}'
    mock_tool_call.id = "call-err"
    mock_msg_1.tool_calls = [mock_tool_call]
    
    mock_msg_2 = MagicMock()
    mock_msg_2.content = "Handled error"
    mock_msg_2.tool_calls = None
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2]

    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "invalid_tool", "inputSchema": {}}]
    mcp_bridge.call_tool.side_effect = [
        None, # init_diagram
        Exception("Tool failed dramatically"), # invalid_tool execution
        {"xml": "<mxfile>error-recovery</mxfile>"} # finalize
    ]

    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        orchestrator = AgentOrchestrator(settings, llm_service, mcp_bridge, conversation_manager)
        
        events = []
        async for event in orchestrator.run("session-tool-err", "run tool"):
            events.append(event)
            
        assert events[1]["event"] == "tool_progress"
        assert events[4]["event"] == "diagram_update"
        assert events[4]["data"]["xml"] == "<mxfile>error-recovery</mxfile>"
        
        # Verify that tool message in history reflects the error
        history = conversation_manager.get_conversation("session-tool-err")
        tool_msg = next(m for m in history if m["role"] == "tool")
        assert "Error executing tool" in tool_msg["content"]
        assert "Tool failed dramatically" in tool_msg["content"]
