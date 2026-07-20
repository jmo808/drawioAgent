"""MCP Bridge managing standard I/O process wrapping the Draw.io MCP server."""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional
import structlog
from opentelemetry import trace

from agent.config import Settings
from agent.mcp_validator import MCPValidator
from agent.metrics import mcp_tool_duration_seconds, mcp_tool_calls_total

logger = structlog.get_logger(__name__)


class MCPBridge:
    """Bridge service for managing the Model Context Protocol child process."""

    def __init__(self, settings: Settings) -> None:
        """Initialize MCPBridge configurations."""
        self.settings = settings
        self.process: Optional[asyncio.subprocess.Process] = None
        self.read_task: Optional[asyncio.Task[None]] = None
        self._stderr_task: Optional[asyncio.Task[None]] = None
        self.next_id = 1
        self.pending_requests: Dict[int, asyncio.Future[Any]] = {}
        self.tools: List[Dict[str, Any]] = []
        self.validator = MCPValidator()

    async def start(self) -> None:
        """Spawns the MCP server child process and runs discover_tools."""
        logger.info(
            f"Starting MCP server at {self.settings.mcp_server_path}"
        )
        
        cmd = "node"
        args = [self.settings.mcp_server_path]
        
        self.process = await asyncio.create_subprocess_exec(
            cmd,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.settings.mcp_workspace_root
        )

        self.read_task = asyncio.create_task(self._read_loop())
        self._stderr_task = asyncio.create_task(self._read_stderr())

        await self._discover_tools()

    def is_healthy(self) -> bool:
        """Check if the MCP child process is still running."""
        return self.process is not None and self.process.returncode is None

    async def _read_stderr(self) -> None:
        """Read and log MCP server stderr for debugging."""
        try:
            if not self.process or not self.process.stderr:
                return
            while True:
                line = await self.process.stderr.readline()
                if not line:
                    break
                text = line.decode('utf-8', errors='replace').strip()
                if text:
                    logger.debug(f"[MCP stderr] {text}")
        except Exception as e:
            logger.warning(f"MCP stderr reader stopped: {e}")

    async def stop(self) -> None:
        """Gracefully terminates the MCP child process."""
        if self._stderr_task:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass
            self._stderr_task = None

        if self.read_task:
            self.read_task.cancel()
            try:
                await self.read_task
            except asyncio.CancelledError:
                pass
            self.read_task = None

        if self.process:
            try:
                if self.process.stdin:
                    self.process.stdin.close()
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

        # Reject any remaining pending requests
        for fut in self.pending_requests.values():
            if not fut.done():
                fut.set_exception(RuntimeError("MCPBridge stopped"))
        self.pending_requests.clear()

    def get_tools(self) -> List[Dict[str, Any]]:
        """Returns the list of discovered tools."""
        return self.tools

    async def call_tool(
        self,
        name: str,
        arguments: Dict[str, Any],
        timeout: float = 30.0
    ) -> Any:
        """Executes an MCP tool call and returns the result dictionary."""
        # Log all MCP tool invocations with arguments for forensics
        args_json = json.dumps(arguments)
        logger.info(f"AUDIT: Executing MCP tool '{name}' args: {args_json}")
        
        # Security validation check
        self.validator.validate(name, arguments)

        if not self.is_healthy():
            raise RuntimeError(
                "MCP server process is not running. "
                "The diagram server may have crashed."
            )
        
        if name == "finalize" and timeout == 30.0:
            timeout = 60.0
        
        start_time = time.time()
        request_id = self.next_id
        
        tracer = trace.get_tracer("drawio-agent")
        with tracer.start_as_current_span("mcp.tool_call") as otel_span:
            otel_span.set_attribute("tool_name", name)
            try:
                response = await self._send_request({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": "tools/call",
                    "params": {
                        "name": name,
                        "arguments": arguments
                    }
                }, timeout)

                duration = time.time() - start_time
                duration_ms = int(duration * 1000)
                
                mcp_tool_duration_seconds.labels(tool_name=name).observe(
                    duration
                )
                
                if "error" in response:
                    mcp_tool_calls_total.labels(
                        tool_name=name, status="error"
                    ).inc()
                    error_msg = response["error"].get("message", "Unknown error")
                    error_code = response["error"].get("code", -32000)
                    otel_span.set_status(
                        trace.StatusCode.ERROR,
                        f"MCP tool error ({error_code}): {error_msg}"
                    )
                    raise RuntimeError(
                        f"MCP tool error ({error_code}): {error_msg}"
                    )
                
                mcp_tool_calls_total.labels(
                    tool_name=name, status="success"
                ).inc()

                logger.info(
                    "MCP tool call completed",
                    tool_name=name,
                    duration_ms=duration_ms
                )

                return response.get("result", {})
            except Exception as e:
                otel_span.record_exception(e)
                otel_span.set_status(trace.StatusCode.ERROR, str(e))
                mcp_tool_calls_total.labels(
                    tool_name=name, status="error"
                ).inc()
                duration = time.time() - start_time
                duration_ms = int(duration * 1000)
                mcp_tool_duration_seconds.labels(tool_name=name).observe(
                    duration
                )
                logger.error(
                    "MCP tool call failed",
                    tool_name=name,
                    duration_ms=duration_ms,
                    error=str(e)
                )
                raise

    async def _discover_tools(self) -> None:
        """Queries the MCP server for the list of available tools."""
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "params": {}
        }
        try:
            response = await self._send_request(payload, timeout=5.0)
            result = response.get("result", {})
            self.tools = result.get("tools", [])
            logger.info(f"Discovered {len(self.tools)} tools from MCP server")
        except Exception as e:
            logger.error(f"Failed to discover tools from MCP server: {e}")
            self.tools = []

    async def _send_request(
        self,
        payload: Dict[str, Any],
        timeout: float
    ) -> Dict[str, Any]:
        """Sends a JSON-RPC request to stdin and awaits response from stdout."""
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP process not running")

        req_id = self.next_id
        self.next_id += 1
        
        payload["id"] = req_id
        
        fut = asyncio.get_running_loop().create_future()
        self.pending_requests[req_id] = fut

        message_bytes = (json.dumps(payload) + "\n").encode("utf-8")
        self.process.stdin.write(message_bytes)
        await self.process.stdin.drain()

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self.pending_requests.pop(req_id, None)

    async def _read_loop(self) -> None:
        """Reads output lines from stdout of child process."""
        if not self.process or not self.process.stdout:
            return

        try:
            while True:
                line_bytes = await self.process.stdout.readline()
                if not line_bytes:
                    break

                line = line_bytes.decode("utf-8").strip()
                if not line:
                    continue

                try:
                    data = json.loads(line)
                    req_id = data.get("id")
                    if req_id is not None:
                        fut = self.pending_requests.get(req_id)
                        if fut and not fut.done():
                            fut.set_result(data)
                except json.JSONDecodeError:
                    logger.warning(
                        "Failed to parse JSON-RPC line from MCP server: "
                        f"{line}"
                    )
                except Exception as e:
                    logger.error(f"Error in MCPBridge read handler: {e}")
        except asyncio.CancelledError:
            pass
