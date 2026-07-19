"""Tests for the ContentFilter class."""

from agent.content_filter import ContentFilter

def test_detect_ip_addresses():
    """Verify that IPv4 addresses are detected."""
    xml = "<mxGraphModel><root><mxCell id='1' value='Server IP: 192.168.1.50'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("192.168.1.50" in f for f in findings)

def test_detect_ipv6_addresses():
    """Verify that both full and compressed IPv6 addresses are detected."""
    # Full IPv6
    xml1 = "<mxGraphModel><root><mxCell id='1' value='IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334'/></root></mxGraphModel>"
    findings1 = ContentFilter.scan(xml1)
    assert any("2001:0db8:85a3:0000:0000:8a2e:0370:7334" in f for f in findings1)

    # Compressed IPv6 (e.g. loopback)
    xml2 = "<mxGraphModel><root><mxCell id='1' value='IPv6: ::1'/></root></mxGraphModel>"
    findings2 = ContentFilter.scan(xml2)
    assert any("::1" in f for f in findings2)

    # Compressed IPv6 (e.g. link-local)
    xml3 = "<mxGraphModel><root><mxCell id='1' value='IPv6: fe80::1'/></root></mxGraphModel>"
    findings3 = ContentFilter.scan(xml3)
    assert any("fe80::1" in f for f in findings3)

def test_detect_hostname_patterns():
    """Verify that internal hostname patterns are detected."""
    xml = "<mxGraphModel><root><mxCell id='1' value='http://localhost:8080/path'/><mxCell id='2' value='db.prod.internal'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("localhost" in f.lower() for f in findings)
    assert any("db.prod.internal" in f for f in findings)

def test_detect_credentials():
    """Verify that credential and secret patterns are detected without leaking the value."""
    xml = "<mxGraphModel><root><mxCell id='1' value='db_password=mysecretpassword123'/></root></mxGraphModel>"
    findings = ContentFilter.scan(xml)
    assert any("db_password" in f for f in findings)
    # The actual secret value must not be in findings
    assert not any("mysecretpassword123" in f for f in findings)
