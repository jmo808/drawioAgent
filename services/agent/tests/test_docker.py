import subprocess
import time
import httpx
import pytest

@pytest.fixture(scope="module")
def agent_container():
    container_name = "drawio-agent-test-server"
    port = "8089"

    # Stop any existing container
    subprocess.run(["podman", "rm", "-f", container_name], capture_output=True)

    # Start container
    print("[TestSetup] Starting agent container...")
    res = subprocess.run([
        "podman", "run", "-d",
        "--name", container_name,
        "-p", f"{port}:8000",
        "localhost/drawio-agent-test:latest"
    ], capture_output=True, text=True)
    
    assert res.returncode == 0, f"Failed to start container: {res.stderr}"

    # Wait for FastAPI / Uvicorn to start up
    print("[TestSetup] Waiting for server to initialize...")
    time.sleep(5)

    yield {
        "container_name": container_name,
        "port": port
    }

    # Cleanup container
    print("[TestCleanup] Removing agent container...")
    subprocess.run(["podman", "rm", "-f", container_name], capture_output=True)


def test_runtimes_available(agent_container):
    name = agent_container["container_name"]
    
    # Test python3 is available
    res_py = subprocess.run(["podman", "exec", name, "python3", "--version"], capture_output=True, text=True)
    assert res_py.returncode == 0
    assert "Python 3." in res_py.stdout or "Python 3." in res_py.stderr

    # Test node is available
    res_node = subprocess.run(["podman", "exec", name, "node", "--version"], capture_output=True, text=True)
    assert res_node.returncode == 0
    assert "v22." in res_node.stdout or "v22." in res_node.stderr


def test_mcp_server_callable(agent_container):
    name = agent_container["container_name"]
    # Check that mcp-wrapper exists
    res_file = subprocess.run([
        "podman", "exec", name,
        "ls", "/app/mcp-server/scripts/mcp-wrapper.js"
    ], capture_output=True, text=True)
    assert res_file.returncode == 0

    # Start the mcp-wrapper using Popen (runs in background)
    proc = subprocess.Popen([
        "podman", "exec", name,
        "node", "/app/mcp-server/scripts/mcp-wrapper.js"
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    try:
        # Wait a moment for wrapper to output startup logs to stderr
        time.sleep(2)
        
        # Verify wrapper is running and hasn't exited with an error
        assert proc.poll() is None, "Process terminated unexpectedly"
        
        # Check stderr logs for WRAPPER initialization message
        import select
        r, _, _ = select.select([proc.stderr], [], [], 1.0)
        if proc.stderr in r:
            stderr_line = proc.stderr.readline()
            assert "[WRAPPER]" in stderr_line or "@drawio/mcp" in stderr_line or "WARNING" in stderr_line
    finally:
        # Clean up the running process
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()




def test_agent_health(agent_container):
    port = agent_container["port"]
    url = f"http://127.0.0.1:{port}/health"
    response = httpx.get(url)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_docker_contains_mcp_installed(agent_container):
    name = agent_container["container_name"]
    res = subprocess.run([
        "podman", "exec", "-w", "/app/mcp-server", name,
        "node", "-e", "require.resolve('@drawio/mcp')"
    ], capture_output=True, text=True)
    assert res.returncode == 0


