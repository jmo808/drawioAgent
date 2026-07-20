import pytest
from pydantic import ValidationError
from agent.schema import DiagramSpec, ContainerSpec, NodeSpec, EdgeSpec

def test_valid_schema():
    spec_data = {
        "title": "Valid AWS Architecture",
        "type": "architecture",
        "theme": "light",
        "containers": [
            {"id": "reg", "label": "us-east-1", "type": "region", "parentId": "1"}
        ],
        "nodes": [
            {"id": "web", "label": "Web Server", "type": "ec2", "parentId": "reg"}
        ],
        "edges": [
            {"sourceId": "reg", "targetId": "web", "label": "traffic", "style": "solid"}
        ]
    }
    spec = DiagramSpec.model_validate(spec_data)
    assert spec.title == "Valid AWS Architecture"
    assert spec.type == "architecture"
    assert len(spec.containers) == 1
    assert len(spec.nodes) == 1
    assert len(spec.edges) == 1

def test_invalid_node_type():
    spec_data = {
        "title": "Invalid Node",
        "type": "architecture",
        "containers": [],
        "nodes": [
            {"id": "node1", "label": "Bad Node", "type": "invalid_type_abc", "parentId": "1"}
        ],
        "edges": []
    }
    with pytest.raises(ValidationError) as exc_info:
        DiagramSpec.model_validate(spec_data)
    assert "type" in str(exc_info.value)

def test_invalid_container_type():
    spec_data = {
        "title": "Invalid Container",
        "type": "architecture",
        "containers": [
            {"id": "c1", "label": "Bad Container", "type": "invalid_container_xyz", "parentId": "1"}
        ],
        "nodes": [],
        "edges": []
    }
    with pytest.raises(ValidationError) as exc_info:
        DiagramSpec.model_validate(spec_data)
    assert "type" in str(exc_info.value)

def test_invalid_subnet_tier():
    spec_data = {
        "title": "Invalid Tier",
        "type": "architecture",
        "containers": [
            {"id": "sub", "label": "Bad Subnet", "type": "subnet", "parentId": "1", "tier": "invalid_tier_123"}
        ],
        "nodes": [],
        "edges": []
    }
    with pytest.raises(ValidationError) as exc_info:
        DiagramSpec.model_validate(spec_data)
    assert "tier" in str(exc_info.value)

def test_invalid_edge_style():
    spec_data = {
        "title": "Invalid Edge Style",
        "type": "architecture",
        "containers": [],
        "nodes": [],
        "edges": [
            {"sourceId": "n1", "targetId": "n2", "style": "invalid_style_789"}
        ]
    }
    with pytest.raises(ValidationError) as exc_info:
        DiagramSpec.model_validate(spec_data)
    assert "style" in str(exc_info.value)
