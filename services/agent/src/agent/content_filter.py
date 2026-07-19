import re
from typing import List

class ContentFilter:
    """Scans text for PII, credentials, and infrastructure details."""

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
        """Scan content for sensitive patterns.

        Args:
            content: The text to scan.

        Returns:
            A list of human-readable finding descriptions.
        """
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
            # Only report the key portion to avoid leaking
            # actual secret values in logs or UI.
            key_match = cred.split("=")[0].split(":")[0]
            findings.append(
                "Detected potential credential/secret"
                f" key: {key_match.strip()}"
            )
            
        return findings
