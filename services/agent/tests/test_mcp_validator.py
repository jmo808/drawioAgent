import pytest
from agent.mcp_validator import MCPValidator, ValidationError

def test_allowlisted_tool_passes():
    validator = MCPValidator()
    # Should not raise ValidationError
    validator.validate("init_diagram", {})
    validator.validate("open_drawio_xml", {"content": "<xml>"})
    validator.validate("compile_json_spec", {"spec": {"nodes": []}})

def test_non_allowlisted_tool_fails():
    validator = MCPValidator()
    with pytest.raises(ValidationError) as excinfo:
        validator.validate("unauthorized_tool", {})
    assert "not allowlisted" in str(excinfo.value)

def test_path_traversal_args_rejected():
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
    validator = MCPValidator()
    # Safe relative paths and safe names should pass
    validator.validate("validate_file", {"file_path": "subdir/file.drawio"})
    validator.validate("validate_file", {"file_path": "./file.drawio"})
    validator.validate("compile_json_spec", {
        "spec_path": "specs/aws.json",
        "output_path": "outputs/aws.drawio"
    })
