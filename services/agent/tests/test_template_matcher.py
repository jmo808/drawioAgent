import os
import pytest
from agent.config import settings
from agent.template_matcher import TemplateMatcher

templates_exist = os.path.exists(os.path.join(settings.skills_dir, "references", "templates"))
pytestmark = pytest.mark.skipif(not templates_exist, reason="Templates directory not available")

def test_template_matcher_similarity():
    """
    Verifies that TemplateMatcher loads the templates, computes similarity,
    and returns relevant template matches with correct scores.
    """
    matcher = TemplateMatcher()
    
    # 1. Test strong match for serverless API
    match = matcher.match("create a serverless API with API Gateway, lambda handler, and dynamodb table")
    assert match is not None, "Should match a template for serverless"
    assert match.template_id == "aws_serverless_api", f"Expected aws_serverless_api, got {match.template_id}"
    assert match.score > 0.3, f"Score should be > 0.3, got {match.score}"
    assert match.spec_json is not None, "Should contain the spec JSON data"
    
    # 2. Test strong match for 3-tier VPC architecture
    match_vpc = matcher.match("Multi-AZ 3-tier AWS architecture with Public, App, and Data subnets, ALB, EC2, and RDS")
    assert match_vpc is not None, "Should match a template for 3-tier VPC"
    assert match_vpc.template_id == "aws_3tier_vpc", f"Expected aws_3tier_vpc, got {match_vpc.template_id}"
    assert match_vpc.score > 0.3
    
    # 3. Test weak match below threshold (should return None)
    no_match = matcher.match("some random query about unrelated things like cooking recipes")
    assert no_match is None, f"Should not match any template for random query, got {no_match}"
