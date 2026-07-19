import re
from typing import List

class ContentFilter:
    # IP address patterns (IPv4)
    IP_PATTERN = re.compile(
        r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'
    )
    
    # Hostname patterns (internal, local, dev domains)
    HOSTNAME_PATTERN = re.compile(
        r'\b(?:[a-zA-Z0-9][-a-zA-Z0-9]*\.)+(?:local|internal|corp|lan|localdomain|dev)\b|localhost',
        re.IGNORECASE
    )
    
    # Credential/secret patterns
    CREDENTIAL_PATTERN = re.compile(
        r'\b[a-zA-Z0-9_]*(?:password|passwd|api_key|apikey|secret|token|private_key|aws_access_key_id|aws_secret_access_key)\s*[:=]\s*["\'a-zA-Z0-9_\-+=/]{8,}\b',
        re.IGNORECASE
    )

    @classmethod
    def scan(cls, content: str) -> List[str]:
        findings = []
        if not content:
            return findings
            
        # Scan for IPs
        ips = cls.IP_PATTERN.findall(content)
        for ip in ips:
            findings.append(f"Detected IP address: {ip}")
            
        # Scan for internal hostnames
        hostnames = cls.HOSTNAME_PATTERN.findall(content)
        for host in hostnames:
            findings.append(f"Detected internal/local hostname: {host}")
            
        # Scan for credential strings
        creds = cls.CREDENTIAL_PATTERN.findall(content)
        for cred in creds:
            # Mask the secret value for reporting
            findings.append(f"Detected potential credential/secret pattern: {cred[:30]}...")
            
        return findings
