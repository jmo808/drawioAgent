import json
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mock_llm")

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    logger.info(f"Received request body: {json.dumps(body)}")
    
    messages = body.get("messages", [])
    tools = body.get("tools", [])
    
    content = ""
    tool_call = None
    
    # 1. Check if the last message is the tool execution output
    if messages and messages[-1].get("role") == "tool":
        content = "Diagram generated successfully."
    else:
        prompt = messages[-1].get("content", "") if messages else ""
        
        if "aws-3tier" in prompt.lower() or "create" in prompt.lower() or "generate" in prompt.lower():
            # Check if compile_json_spec tool is present
            has_compile_tool = any(t.get("function", {}).get("name") == "compile_json_spec" for t in tools)
            if has_compile_tool:
                spec_obj = {
                    "title": "AWS 3-Tier Web App",
                    "theme": "light",
                    "type": "architecture",
                    "containers": [
                        {
                            "id": "vpc-1",
                            "label": "AWS VPC (10.0.0.0/16)",
                            "type": "vpc"
                        },
                        {
                            "id": "pub-subnet-1",
                            "label": "Public Subnet (Ingress)",
                            "type": "subnet",
                            "parentId": "vpc-1",
                            "tier": "public"
                        },
                        {
                            "id": "db-subnet-1",
                            "label": "Database Subnet (Private)",
                            "type": "subnet",
                            "parentId": "vpc-1",
                            "tier": "private"
                        }
                    ],
                    "nodes": [
                        {
                            "id": "internet-client",
                            "label": "Internet Client",
                            "type": "user",
                            "parentId": "1"
                        },
                        {
                            "id": "alb-1",
                            "label": "Application Load Balancer",
                            "type": "alb",
                            "parentId": "pub-subnet-1"
                        },
                        {
                            "id": "rds-db-1",
                            "label": "Multi-AZ RDS DB",
                            "type": "rds",
                            "parentId": "db-subnet-1"
                        }
                    ],
                    "edges": [
                        {
                            "sourceId": "internet-client",
                            "targetId": "alb-1",
                            "label": "HTTPS Request"
                        },
                        {
                            "sourceId": "alb-1",
                            "targetId": "rds-db-1",
                            "label": "DB Query"
                        }
                    ]
                }
                tool_call = {
                    "id": "call_12345",
                    "type": "function",
                    "function": {
                        "name": "compile_json_spec",
                        "arguments": json.dumps({"spec": spec_obj})
                    }
                }
            else:
                content = "Here is the AWS 3-tier architecture diagram."
        elif "invalid" in prompt.lower() or "error" in prompt.lower():
            content = "Error: I cannot parse this prompt."
        else:
            content = f"Mock response for: {prompt}"

    choice = {
        "index": 0,
        "message": {
            "role": "assistant",
            "content": content
        },
        "finish_reason": "stop"
    }
    
    if tool_call:
        choice["message"]["tool_calls"] = [tool_call]
        choice["finish_reason"] = "tool_calls"
        choice["message"]["content"] = None

    response_data = {
        "id": "chatcmpl-mock123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": body.get("model", "mock-model"),
        "choices": [choice],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 12,
            "total_tokens": 21
        }
    }
    
    return JSONResponse(content=response_data)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9090)
