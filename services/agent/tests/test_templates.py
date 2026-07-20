import os
import json
import pytest
from agent.config import settings

def test_template_library_exists_and_valid():
    """
    Verifies that the RAG template library exists, contains the index.json,
    and has at least 15 valid JSON template files.
    """
    skills_dir = settings.skills_dir
    templates_dir = os.path.join(skills_dir, "references", "templates")
    
    # 1. Verify templates directory exists
    assert os.path.exists(templates_dir), f"Templates directory not found at: {templates_dir}"
    
    # 2. Verify index.json exists
    index_path = os.path.join(templates_dir, "index.json")
    assert os.path.exists(index_path), "index.json manifest not found"
    
    # 3. Verify index.json is valid and contains metadata
    with open(index_path, "r", encoding="utf-8") as f:
        index_data = json.load(f)
        
    assert isinstance(index_data, list), "index.json must be a JSON array/list"
    assert len(index_data) >= 15, f"Expected at least 15 templates, found {len(index_data)}"
    
    # 4. Verify each template file exists and has correct structure
    for entry in index_data:
        assert "id" in entry, "Template entry missing 'id'"
        assert "description" in entry, "Template entry missing 'description'"
        assert "file" in entry, "Template entry missing 'file' path"
        assert "category" in entry, "Template entry missing 'category'"
        
        template_file_path = os.path.join(templates_dir, entry["file"])
        assert os.path.exists(template_file_path), f"Template file not found: {template_file_path}"
        
        with open(template_file_path, "r", encoding="utf-8") as tf:
            spec = json.load(tf)
            
        assert "containers" in spec, f"Template {entry['id']} missing 'containers'"
        assert "nodes" in spec, f"Template {entry['id']} missing 'nodes'"
        assert "edges" in spec, f"Template {entry['id']} missing 'edges'"
