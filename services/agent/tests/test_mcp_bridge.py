import pytest
import asyncio
import json
from unittest.mock import AsyncMock, patch, MagicMock
from agent.mcp_bridge import MCPBridge
from agent.config import Settings

class MockStreamReader:
    def __init__(self):
        self.data = bytearray()
        self.offset = 0
        self.future_data = []

    async def readline(self):
        while self.offset >= len(self.data):
            if self.future_data:
                self.data.extend(self.future_data.pop(0))
            else:
                await asyncio.sleep(0.005)
                
        end = self.data.find(b'\n', self.offset)
        if end == -1:
            chunk = self.data[self.offset:]
            self.offset = len(self.data)
            return bytes(chunk)
            
        chunk = self.data[self.offset:end+1]
        self.offset = end + 1
        return bytes(chunk)

@pytest.mark.asyncio
async def test_mcp_bridge_lifecycle_and_call():
    settings = Settings(
        mcp_server_path="node",
        mcp_workspace_root="."
    )
    
    mock_process = AsyncMock()
    mock_process.stdin = AsyncMock()
    mock_process.stdin.close = MagicMock()
    mock_process.returncode = None
    
    response_list = '{"jsonrpc": "2.0", "result": {"tools": [{"name": "add_node", "description": "Add node"}]}, "id": 1}\n'
    response_call = '{"jsonrpc": "2.0", "result": {"content": [{"type": "text", "text": "node added"}]}, "id": 2}\n'
    
    stream_reader = MockStreamReader()
    mock_process.stdout = stream_reader
    
    stdin_writes = []
    def mock_write(data):
        stdin_writes.append(data)
        try:
            req = json.loads(data.decode('utf-8').strip())
            req_id = req.get("id")
            if req_id == 1:
                stream_reader.future_data.append(response_list.encode('utf-8'))
            elif req_id == 2:
                stream_reader.future_data.append(response_call.encode('utf-8'))
        except Exception:
            pass

    mock_process.stdin.write = mock_write
    mock_process.stdin.drain = AsyncMock()

    with patch("asyncio.create_subprocess_exec", return_value=mock_process) as mock_exec:
        bridge = MCPBridge(settings)
        await bridge.start()
        
        # Verify tools list is loaded
        tools = bridge.get_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "add_node"
        
        # Verify tool call works
        result = await bridge.call_tool("add_node", {"label": "test"})
        assert result == {"content": [{"type": "text", "text": "node added"}]}
        
        # Verify correct JSON-RPC messages were sent to child process
        assert len(stdin_writes) == 2
        assert b'"method": "tools/list"' in stdin_writes[0]
        assert b'"method": "tools/call"' in stdin_writes[1]
        
        await bridge.stop()

@pytest.mark.asyncio
async def test_mcp_bridge_timeout():
    settings = Settings(mcp_server_path="node", mcp_workspace_root=".")
    
    mock_process = AsyncMock()
    mock_process.stdin = AsyncMock()
    mock_process.stdin.close = MagicMock()
    mock_process.returncode = None
    
    response_list = '{"jsonrpc": "2.0", "result": {"tools": []}, "id": 1}\n'
    
    stream_reader = MockStreamReader()
    mock_process.stdout = stream_reader
    
    stdin_writes = []
    def mock_write(data):
        stdin_writes.append(data)
        try:
            req = json.loads(data.decode('utf-8').strip())
            req_id = req.get("id")
            if req_id == 1:
                stream_reader.future_data.append(response_list.encode('utf-8'))
        except Exception:
            pass

    mock_process.stdin.write = mock_write
    mock_process.stdin.drain = AsyncMock()

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        bridge = MCPBridge(settings)
        await bridge.start()
        
        # Call tool and expect a timeout since mock stdout will never receive tool result
        with pytest.raises(asyncio.TimeoutError):
            await bridge.call_tool("add_node", {}, timeout=0.05)
            
        await bridge.stop()

@pytest.mark.asyncio
async def test_mcp_bridge_not_started():
    settings = Settings(mcp_server_path="node", mcp_workspace_root=".")
    bridge = MCPBridge(settings)
    
    # call_tool should raise RuntimeError if process is not running
    with pytest.raises(RuntimeError) as exc_info:
        await bridge.call_tool("add_node", {})
    assert "process not running" in str(exc_info.value)
    
    # stop should not throw when called on unstarted bridge
    await bridge.stop()

@pytest.mark.asyncio
async def test_mcp_bridge_discover_tools_error():
    settings = Settings(mcp_server_path="node", mcp_workspace_root=".")
    bridge = MCPBridge(settings)
    
    # Mock _send_request to throw exception
    with patch.object(bridge, "_send_request", side_effect=Exception("Connection broken")):
        mock_process = AsyncMock()
        mock_process.stdin = AsyncMock()
        mock_process.stdin.close = MagicMock()
        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
            # start will try to discover tools, fail, but start successfully with empty tools list
            await bridge.start()
            assert bridge.get_tools() == []
            await bridge.stop()

@pytest.mark.asyncio
async def test_mcp_bridge_read_loop_resilience():
    settings = Settings(mcp_server_path="node", mcp_workspace_root=".")
    
    mock_process = AsyncMock()
    mock_process.stdin = AsyncMock()
    mock_process.stdin.close = MagicMock()
    mock_process.returncode = None
    
    # stdout yields: empty line, invalid JSON, correct tools list, then EOF
    response_list = '{"jsonrpc": "2.0", "result": {"tools": []}, "id": 1}\n'
    stream_reader = MockStreamReader()
    mock_process.stdout = stream_reader
    
    def mock_write(data):
        try:
            req = json.loads(data.decode('utf-8').strip())
            if req.get("id") == 1:
                # push dynamic responses
                stream_reader.future_data.append(b"\n") # empty line
                stream_reader.future_data.append(b"{invalid-json\n") # malformed json
                stream_reader.future_data.append(response_list.encode('utf-8')) # valid list
        except Exception:
            pass

    mock_process.stdin.write = mock_write
    mock_process.stdin.drain = AsyncMock()

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        bridge = MCPBridge(settings)
        await bridge.start()
        assert bridge.get_tools() == []
        await bridge.stop()
