"""MCP validation logic for allowlisted tools and arguments."""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

class ValidationError(Exception):
    """Exception raised when an MCP tool call fails validation checks."""
    pass

class MCPValidator:
    """
    Validates MCP tool call requests for safety.
    Filters by allowed tool names and checks string arguments for path traversal.
    """
    ALLOWLISTED_TOOLS = {
        "open_drawio_xml",
        "open_drawio_csv",
        "open_drawio_mermaid",
        "list_pages",
        "get_page",
        "set_page",
        "search_shapes",
        "init_diagram",
        "add_container",
        "add_node",
        "connect",
        "disconnect",
        "connect_tiers",
        "connect_ha_compute_to_data",
        "provision_ha_data_tier",
        "get_state",
        "builder_validate",
        "validate_file",
        "compile_json_spec",
        "finalize",
    }

    def validate(self, tool_name: str, arguments: dict) -> None:
        """
        Validates the tool name and its arguments.
        Raises ValidationError if validation fails.
        """
        # 1. Check allowlist
        if tool_name not in self.ALLOWLISTED_TOOLS:
            raise ValidationError(f"Tool '{tool_name}' is not allowlisted.")

        # 2. Check arguments for path traversal
        self._check_arguments(arguments)

    def _check_arguments(self, args: Any) -> None:
        """Recursively check arguments for potential path traversal vectors."""
        if isinstance(args, dict):
            for val in args.values():
                self._check_arguments(val)
        elif isinstance(args, list):
            for item in args:
                self._check_arguments(item)
        elif isinstance(args, str):
            # Check for path traversal patterns (e.g., '..', absolute paths starting with '/' or '\\')
            # Normalized checks to prevent sneaky traversal bypasses
            truncated = args[:30] + "..." if len(args) > 30 else args
            if ".." in args or args.startswith("/") or args.startswith("\\"):
                raise ValidationError(f"Path traversal detected in argument value: '{truncated}'")
            # Enforce that it doesn't contain windows-style drive letters (e.g. C:\)
            # Use regex to allow normal text with colons like "Time: 3pm"
            if re.match(r'^[a-zA-Z]:[/\\]', args):
                # Potential absolute windows path
                raise ValidationError(f"Windows absolute path detected in argument value: '{truncated}'")
