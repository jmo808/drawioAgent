from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

class ColumnSpec(BaseModel):
    name: str
    type: str
    pk: Optional[bool] = False
    fk: Optional[bool] = False

class ContainerSpec(BaseModel):
    id: str
    label: str
    type: Literal["region", "vpc", "az", "subnet", "vlan", "security_group", "lane", "group", "container"]
    parentId: Optional[str] = "1"
    tier: Optional[Literal["public", "private", "app", "data", "web", "default"]] = None

class NodeSpec(BaseModel):
    id: str
    label: str
    type: Literal[
        "user", "route53", "waf", "alb", "elb", "nlb", "load_balancing", "ec2", "ecs", "eks", "lambda", "rds", "dynamodb",
        "s3", "sqs", "sns", "eventbridge", "kinesis", "operations_suite", "compute_engine", "cloud_run", "cloud_sql",
        "cloud_spanner", "cloud_storage", "router", "firewall", "switch", "internet", "table", "vessel", "compressor",
        "heat_exchanger", "tank", "mill", "pump", "rectangle", "cylinder", "circle", "diamond", "group", "cloud", "process"
    ]
    parentId: Optional[str] = "1"
    variant: Optional[str] = None
    columns: Optional[List[ColumnSpec]] = None

class EdgeSpec(BaseModel):
    sourceId: str
    targetId: str
    label: Optional[str] = None
    style: Optional[Literal["solid", "dashed", "dotted", "orthogonalEdgeStyle"]] = "solid"
    color: Optional[str] = None

class DiagramSpec(BaseModel):
    title: str
    type: Literal["architecture", "flowchart", "pfd", "bpmn", "kubernetes", "erd", "network", "default", "gcp"]
    theme: Optional[str] = "light"
    containers: List[ContainerSpec] = Field(default_factory=list)
    nodes: List[NodeSpec] = Field(default_factory=list)
    edges: List[EdgeSpec] = Field(default_factory=list)
