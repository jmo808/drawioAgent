"""Tests for the MCPValidator class."""

import pytest
from agent.mcp_validator import MCPValidator, ValidationError

def test_allowlisted_tool_passes():
    """Verify that allowlisted tools without arguments pass validation."""
    validator = MCPValidator()
    # Should not raise ValidationError
    validator.validate("init_diagram", {})
    validator.validate("open_drawio_xml", {"content": "<xml>"})
    validator.validate("compile_json_spec", {"spec": {"nodes": []}})

def test_non_allowlisted_tool_fails():
    """Verify that non-allowlisted tools raise ValidationError."""
    validator = MCPValidator()
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("unauthorized_tool", {})
    assert "not allowlisted" in str(excinfo.value)

def test_path_traversal_args_rejected():
    """Verify that path traversal in arguments is correctly detected and rejected."""
    validator = MCPValidator()
    # Simple relative traversal
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("validate_file", {"file_path": "../secrets.json"})
    assert "Path traversal detected" in str(excinfo.value)

    # Absolute path traversal
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("validate_file", {"file_path": "/etc/passwd"})
    assert "Path traversal detected" in str(excinfo.value)

    # In compile_json_spec
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("compile_json_spec", {
            "spec": {},
            "spec_path": "/app/mcp-server/../../etc/shadow",
            "output_path": "valid_path.drawio"
        })
    assert "Path traversal detected" in str(excinfo.value)

def test_safe_paths_passed():
    """Verify that safe relative and nested paths pass validation."""
    validator = MCPValidator()
    # Safe relative paths and safe names should pass
    validator.validate("validate_file", {"file_path": "subdir/file.drawio"})
    validator.validate("validate_file", {"file_path": "./file.drawio"})
    validator.validate("compile_json_spec", {
        "spec_path": "specs/aws.json",
        "output_path": "outputs/aws.drawio"
    })

def test_colon_in_safe_data_passes():
    """Verify that colons in safe arguments (e.g. timestamps) do not trigger false positives."""
    validator = MCPValidator()
    validator.validate("add_node", {"label": "Time: 3pm"})
    validator.validate("add_node", {"description": "Status: ok"})
    
    # But Windows absolute paths should still be blocked
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("validate_file", {"file_path": "C:\\Windows\\System32"})
    assert "Windows absolute path detected" in str(excinfo.value)

def test_validation_error_message_is_truncated():
    """Verify that very long path traversal strings are truncated in validation messages."""
    validator = MCPValidator()
    long_malicious_path = "/" + "a" * 100 + "/secrets.json"
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("validate_file", {"file_path": long_malicious_path})
    msg = str(excinfo.value)
    assert len(msg) < 100
    assert "..." in msg
