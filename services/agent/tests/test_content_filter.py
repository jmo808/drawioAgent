from agent.content_filter import ContentFilter

def test_detect_ip_addresses():
    xml = "<mxGraphModel><root><mxCell id='1' value='Server IP: 192.168.1.50'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("192.168.1.50" in f for f in findings)

def test_detect_hostname_patterns():
    xml = "<mxGraphModel><root><mxCell id='1' value='http://localhost:8080/path'/><mxCell id='2' value='db.prod.internal'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("localhost" in f.lower() for f in findings)
    assert any("db.prod.internal" in f for f in findings)

def test_detect_credentials():
    xml = "<mxGraphModel><root><mxCell id='1' value='db_password=mysecretpassword123'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("db_password" in f for f in findings)
