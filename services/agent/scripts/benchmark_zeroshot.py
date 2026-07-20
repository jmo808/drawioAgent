import os
import sys
import json
import subprocess
from typing import Dict, Any
from agent.config import settings

def run_benchmark():
    print("==================================================")
    print(" RUNNING ZERO-SHOT COMPILATION BENCHMARK")
    print("==================================================")
    
    # 1. Resolve paths
    skills_dir = settings.skills_dir
    templates_dir = os.path.join(skills_dir, "references", "templates")
    index_path = os.path.join(templates_dir, "index.json")
    
    if not os.path.exists(index_path):
        print(f"Error: Templates index not found at {index_path}")
        sys.exit(1)
        
    with open(index_path, "r", encoding="utf-8") as f:
        index_data = json.load(f)
        
    print(f"Loaded {len(index_data)} curated templates.")
    
    # Resolve MCP wrapper path
    mcp_wrapper_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../drawio_plugin/scripts/mcp-wrapper.js"))
    if not os.path.exists(mcp_wrapper_path):
        mcp_wrapper_path = os.path.abspath(os.path.join(skills_dir, "../../scripts/mcp-wrapper.js"))
        
    print(f"Using MCP wrapper path: {mcp_wrapper_path}")
    
    success_count = 0
    total_count = len(index_data)
    
    # 2. Iterate through each template and compile
    for idx, entry in enumerate(index_data):
        template_id = entry["id"]
        template_file = os.path.join(templates_dir, entry["file"])
        
        with open(template_file, "r", encoding="utf-8") as tf:
            spec_data = json.load(tf)
            
        print(f"[{idx+1}/{total_count}] Compiling template '{template_id}'...", end="")
        
        # Start the MCP wrapper process
        proc = subprocess.Popen(
            ["node", mcp_wrapper_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Construct the NDJSON tool call message
        msgId = idx + 1
        msg = {
            "method": "tools/call",
            "params": {
                "name": "compile_json_spec",
                "arguments": {
                    "spec": spec_data
                }
            },
            "id": msgId
        }
        
        # Send NDJSON message
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        
        # Read response line
        compiled_successfully = False
        compilation_error = ""
        
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            try:
                res = json.loads(line)
                if res.get("id") == msgId:
                    # Found our response
                    mcp_result = res.get("result", {})
                    content_list = mcp_result.get("content", [])
                    if content_list and len(content_list) > 0:
                        text_data = content_list[0].get("text", "")
                        outcome = json.loads(text_data)
                        if outcome.get("success", False):
                            compiled_successfully = True
                        else:
                            compilation_error = outcome.get("error", "Unknown compilation error")
                    break
            except Exception as e:
                compilation_error = f"Parse failed: {e}"
                
        # Clean up process
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass
            
        if compiled_successfully:
            print(" [PASS]")
            success_count += 1
        else:
            print(f" [FAIL] - {compilation_error}")
            
    # 3. Output summary
    success_rate = (success_count / total_count) * 100.0
    print("==================================================")
    print(f" BENCHMARK SUMMARY")
    print(f" Success Rate: {success_count}/{total_count} ({success_rate:.1f}%)")
    print("==================================================")
    
    # Assert 100% success rate for zero-shot compile
    assert success_rate == 100.0, f"Expected 100% zero-shot compilation success, got {success_rate:.1f}%"
    
if __name__ == "__main__":
    run_benchmark()
