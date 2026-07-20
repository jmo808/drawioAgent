import os
import json

templates_dir = "/Users/jules.ouellette/Documents/drawio_plugin/skills/drawio/references/templates"
os.makedirs(templates_dir, exist_ok=True)

# Define index metadata
index_data = [
    {
        "id": "aws_3tier_vpc",
        "description": "Multi-AZ 3-tier AWS architecture with Public, App, and Data subnets, ALB, EC2, and RDS",
        "file": "aws_3tier_vpc.json",
        "category": "architecture"
    },
    {
        "id": "aws_serverless_api",
        "description": "AWS Serverless API using Route53, WAF, API Gateway, Lambda handler, and DynamoDB",
        "file": "aws_serverless_api.json",
        "category": "architecture"
    },
    {
        "id": "aws_ecs_fargate",
        "description": "ECS Fargate services running behind ALB in private subnets with CloudWatch Monitoring",
        "file": "aws_ecs_fargate.json",
        "category": "architecture"
    },
    {
        "id": "aws_event_driven",
        "description": "Event-driven architecture with EventBridge router, SQS queues, SNS topics, and Lambdas",
        "file": "aws_event_driven.json",
        "category": "architecture"
    },
    {
        "id": "aws_data_pipeline",
        "description": "Data ingestion and analytics pipeline using Kinesis streams, Lambda parser, S3, and Redshift",
        "file": "aws_data_pipeline.json",
        "category": "architecture"
    },
    {
        "id": "gcp_3tier_vpc",
        "description": "3-tier GCP architecture with Global HTTP Load Balancing, Compute Engine VMs, and Cloud SQL",
        "file": "gcp_3tier_vpc.json",
        "category": "architecture"
    },
    {
        "id": "gcp_serverless_run",
        "description": "GCP Serverless stack with Cloud Run microservices, Cloud Pub/Sub queue, and Cloud Firestore DB",
        "file": "gcp_serverless_run.json",
        "category": "architecture"
    },
    {
        "id": "gcp_data_lakehouse",
        "description": "GCP Data Analytics Lakehouse using Cloud Storage, Dataflow ETL, BigQuery, and Looker BI",
        "file": "gcp_data_lakehouse.json",
        "category": "architecture"
    },
    {
        "id": "net_office_lan",
        "description": "Office LAN topology with Firewall, Core Switches, Access Switches, and VLANs",
        "file": "net_office_lan.json",
        "category": "network"
    },
    {
        "id": "net_dmz_network",
        "description": "Network DMZ structure protecting internal services with External/Internal Firewalls",
        "file": "net_dmz_network.json",
        "category": "network"
    },
    {
        "id": "erd_ecom_schema",
        "description": "Relational ERD schema for E-Commerce: users, products, orders, order_items, and payments",
        "file": "erd_ecom_schema.json",
        "category": "erd"
    },
    {
        "id": "erd_billing_schema",
        "description": "Relational ERD schema for Subscription Billing: customers, subscriptions, invoices, and plans",
        "file": "erd_billing_schema.json",
        "category": "erd"
    },
    {
        "id": "pfd_gas_compressor",
        "description": "PFD gas compression system with knock-out vessel, compressor, cooler, and separators",
        "file": "pfd_gas_compressor.json",
        "category": "pfd"
    },
    {
        "id": "pfd_copper_separation",
        "description": "PFD copper processing circuit with crushing mill, flotation cells, and thickening tank",
        "file": "pfd_copper_separation.json",
        "category": "pfd"
    },
    {
        "id": "aws_gke_kubernetes",
        "description": "AWS EKS / GKE Kubernetes cluster architecture with pods, services, and ingress controller",
        "file": "aws_gke_kubernetes.json",
        "category": "architecture"
    }
]

# Write index.json
with open(os.path.join(templates_dir, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index_data, f, indent=2)

# Write template files
templates = {}

# 1. AWS 3-Tier VPC
templates["aws_3tier_vpc.json"] = {
    "title": "AWS 3-Tier Web App",
    "type": "architecture",
    "theme": "light",
    "containers": [
        {"id": "reg", "label": "us-east-1", "type": "region", "parentId": "1"},
        {"id": "vpc_1", "label": "Prod VPC", "type": "vpc", "parentId": "reg"},
        {"id": "az_a", "label": "Availability Zone A", "type": "az", "parentId": "vpc_1"},
        {"id": "az_b", "label": "Availability Zone B", "type": "az", "parentId": "vpc_1"},
        {"id": "sub_pub_a", "label": "Public Subnet A", "type": "subnet", "parentId": "az_a", "tier": "public"},
        {"id": "sub_pub_b", "label": "Public Subnet B", "type": "subnet", "parentId": "az_b", "tier": "public"},
        {"id": "sub_app_a", "label": "App Subnet A", "type": "subnet", "parentId": "az_a", "tier": "app"},
        {"id": "sub_app_b", "label": "App Subnet B", "type": "subnet", "parentId": "az_b", "tier": "app"},
        {"id": "sub_db_a", "label": "Data Subnet A", "type": "subnet", "parentId": "az_a", "tier": "data"},
        {"id": "sub_db_b", "label": "Data Subnet B", "type": "subnet", "parentId": "az_b", "tier": "data"}
    ],
    "nodes": [
        {"id": "user", "label": "Users", "type": "user", "parentId": "1"},
        {"id": "route53", "label": "Route 53 DNS", "type": "route53", "parentId": "1"},
        {"id": "alb", "label": "Public ALB", "type": "alb", "parentId": "vpc_1"},
        {"id": "web_a", "label": "Web Instance A", "type": "ec2", "parentId": "sub_pub_a"},
        {"id": "web_b", "label": "Web Instance B", "type": "ec2", "parentId": "sub_pub_b"},
        {"id": "app_a", "label": "App Server A", "type": "ecs", "parentId": "sub_app_a"},
        {"id": "app_b", "label": "App Server B", "type": "ecs", "parentId": "sub_app_b"},
        {"id": "rds_primary", "label": "RDS Primary", "type": "rds", "parentId": "sub_db_a"},
        {"id": "rds_replica", "label": "RDS Read Replica", "type": "rds", "parentId": "sub_db_b"}
    ],
    "edges": [
        {"sourceId": "user", "targetId": "route53", "label": "DNS Query"},
        {"sourceId": "user", "targetId": "alb", "label": "HTTPS"},
        {"sourceId": "alb", "targetId": "web_a", "label": "Forward"},
        {"sourceId": "alb", "targetId": "web_b", "label": "Forward"},
        {"sourceId": "web_a", "targetId": "app_a", "label": "API Call"},
        {"sourceId": "web_b", "targetId": "app_b", "label": "API Call"},
        {"sourceId": "app_a", "targetId": "rds_primary", "label": "Write"},
        {"sourceId": "app_b", "targetId": "rds_replica", "label": "Read"},
        {"sourceId": "rds_primary", "targetId": "rds_replica", "label": "Replication", "style": "dashed"}
    ]
}

# 2. AWS Serverless API
templates["aws_serverless_api.json"] = {
    "title": "AWS Serverless API",
    "type": "architecture",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "user", "label": "Clients", "type": "user", "parentId": "1"},
        {"id": "route53", "label": "Route 53", "type": "route53", "parentId": "1"},
        {"id": "waf", "label": "WAF Protection", "type": "waf", "parentId": "1"},
        {"id": "apigw", "label": "API Gateway", "type": "apigateway", "parentId": "1"},
        {"id": "handler", "label": "Lambda Handler", "type": "lambda", "parentId": "1"},
        {"id": "db", "label": "DynamoDB Table", "type": "dynamodb", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "user", "targetId": "route53", "label": "DNS Lookup"},
        {"sourceId": "user", "targetId": "waf", "label": "HTTP Request"},
        {"sourceId": "waf", "targetId": "apigw", "label": "Forward Clean Traffic"},
        {"sourceId": "apigw", "targetId": "handler", "label": "Trigger Lambda"},
        {"sourceId": "handler", "targetId": "db", "label": "Query/Put Item"}
    ]
}

# 3. AWS ECS Fargate
templates["aws_ecs_fargate.json"] = {
    "title": "AWS ECS Fargate Stack",
    "type": "architecture",
    "theme": "light",
    "containers": [
        {"id": "reg", "label": "eu-west-1", "type": "region", "parentId": "1"},
        {"id": "vpc", "label": "Main VPC", "type": "vpc", "parentId": "reg"},
        {"id": "az_a", "label": "AZ-A", "type": "az", "parentId": "vpc"},
        {"id": "sub_app", "label": "Private App Subnet", "type": "subnet", "parentId": "az_a", "tier": "app"}
    ],
    "nodes": [
        {"id": "alb", "label": "Application Load Balancer", "type": "alb", "parentId": "vpc"},
        {"id": "fargate_task", "label": "ECS Fargate Task", "type": "ecs", "parentId": "sub_app"},
        {"id": "cloudwatch", "label": "CloudWatch Logs", "type": "operations_suite", "parentId": "reg"}
    ],
    "edges": [
        {"sourceId": "alb", "targetId": "fargate_task", "label": "Forward Request"},
        {"sourceId": "fargate_task", "targetId": "cloudwatch", "label": "Ship Logs", "style": "dashed"}
    ]
}

# 4. AWS Event-Driven Architecture
templates["aws_event_driven.json"] = {
    "title": "AWS Event-Driven Processing",
    "type": "architecture",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "publisher", "label": "API Service", "type": "ecs", "parentId": "1"},
        {"id": "bus", "label": "EventBridge Bus", "type": "eventbridge", "parentId": "1"},
        {"id": "queue_a", "label": "SQS Order Queue", "type": "sqs", "parentId": "1"},
        {"id": "topic_b", "label": "SNS Notify Topic", "type": "sns", "parentId": "1"},
        {"id": "worker_a", "label": "Lambda Processor", "type": "lambda", "parentId": "1"},
        {"id": "worker_b", "label": "Lambda Notifier", "type": "lambda", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "publisher", "targetId": "bus", "label": "Put Event"},
        {"sourceId": "bus", "targetId": "queue_a", "label": "Route rule"},
        {"sourceId": "bus", "targetId": "topic_b", "label": "Route rule"},
        {"sourceId": "queue_a", "targetId": "worker_a", "label": "Poll SQS", "style": "dashed"},
        {"sourceId": "topic_b", "targetId": "worker_b", "label": "Subscribe SNS", "style": "dashed"}
    ]
}

# 5. AWS Data Pipeline
templates["aws_data_pipeline.json"] = {
    "title": "AWS Realtime Analytics Pipeline",
    "type": "architecture",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "devices", "label": "IoT Devices", "type": "user", "parentId": "1"},
        {"id": "kinesis", "label": "Kinesis Data Stream", "type": "pubsub", "parentId": "1"},
        {"id": "parser", "label": "Lambda Parser", "type": "lambda", "parentId": "1"},
        {"id": "s3_bucket", "label": "S3 Raw Bucket", "type": "s3", "parentId": "1"},
        {"id": "redshift", "label": "Redshift DWH", "type": "rds", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "devices", "targetId": "kinesis", "label": "Ingest Stream"},
        {"sourceId": "kinesis", "targetId": "parser", "label": "Trigger Lambda"},
        {"sourceId": "parser", "targetId": "s3_bucket", "label": "Store Raw"},
        {"sourceId": "parser", "targetId": "redshift", "label": "Copy Structured"}
    ]
}

# 6. GCP 3-Tier VPC
templates["gcp_3tier_vpc.json"] = {
    "title": "GCP 3-Tier Web App",
    "type": "architecture",
    "theme": "light",
    "containers": [
        {"id": "gcp_reg", "label": "us-central1", "type": "region", "parentId": "1"},
        {"id": "gcp_vpc", "label": "Global VPC", "type": "vpc", "parentId": "gcp_reg"},
        {"id": "sub_web", "label": "Subnet Web", "type": "subnet", "parentId": "gcp_vpc", "tier": "public"},
        {"id": "sub_app", "label": "Subnet App", "type": "subnet", "parentId": "gcp_vpc", "tier": "app"},
        {"id": "sub_data", "label": "Subnet Data", "type": "subnet", "parentId": "gcp_vpc", "tier": "data"}
    ],
    "nodes": [
        {"id": "gclb", "label": "GCP Load Balancer", "type": "load_balancing", "parentId": "gcp_vpc"},
        {"id": "vm_web", "label": "Web VM Instance", "type": "compute_engine", "parentId": "sub_web"},
        {"id": "vm_app", "label": "App VM Instance", "type": "compute_engine", "parentId": "sub_app"},
        {"id": "cloud_sql", "label": "Cloud SQL Database", "type": "cloud_sql", "parentId": "sub_data"}
    ],
    "edges": [
        {"sourceId": "gclb", "targetId": "vm_web", "label": "Route Request"},
        {"sourceId": "vm_web", "targetId": "vm_app", "label": "Internal API"},
        {"sourceId": "vm_app", "targetId": "cloud_sql", "label": "SQL Query"}
    ]
}

# 7. GCP Serverless Run
templates["gcp_serverless_run.json"] = {
    "title": "GCP Serverless microservice stack",
    "type": "architecture",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "ingress", "label": "Cloud Run Gateway", "type": "cloud_run", "parentId": "1"},
        {"id": "queue", "label": "Pub/Sub Topic", "type": "pubsub", "parentId": "1"},
        {"id": "backend", "label": "Cloud Run Worker", "type": "cloud_run", "parentId": "1"},
        {"id": "firestore", "label": "Firestore DB", "type": "cloud_spanner", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "ingress", "targetId": "queue", "label": "Publish Event"},
        {"sourceId": "queue", "targetId": "backend", "label": "Push Subscription", "style": "dashed"},
        {"sourceId": "backend", "targetId": "firestore", "label": "Save Document"}
    ]
}

# 8. GCP Data Lakehouse
templates["gcp_data_lakehouse.json"] = {
    "title": "GCP Analytics Lakehouse",
    "type": "architecture",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "gcs", "label": "Cloud Storage Raw", "type": "cloud_storage", "parentId": "1"},
        {"id": "dataflow", "label": "Dataflow ETL", "type": "compute_engine", "parentId": "1"},
        {"id": "bq", "label": "BigQuery Data Warehouse", "type": "cloud_sql", "parentId": "1"},
        {"id": "looker", "label": "Looker BI Dashboard", "type": "user", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "gcs", "targetId": "dataflow", "label": "Read Raw"},
        {"sourceId": "dataflow", "targetId": "bq", "label": "Insert Cleansed"},
        {"sourceId": "looker", "targetId": "bq", "label": "Query Reports"}
    ]
}

# 9. Network Office LAN
templates["net_office_lan.json"] = {
    "title": "Office LAN Network Layout",
    "type": "network",
    "theme": "light",
    "containers": [
        {"id": "vlan_10", "label": "VLAN 10 - Users", "type": "vlan", "parentId": "1"},
        {"id": "vlan_20", "label": "VLAN 20 - Printers", "type": "vlan", "parentId": "1"}
    ],
    "nodes": [
        {"id": "router", "label": "Edge Router", "type": "router", "parentId": "1"},
        {"id": "fw", "label": "NextGen Firewall", "type": "firewall", "parentId": "1"},
        {"id": "core_sw", "label": "Core Switch", "type": "switch", "parentId": "1"},
        {"id": "access_sw_a", "label": "Access Switch A", "type": "switch", "parentId": "vlan_10"},
        {"id": "access_sw_b", "label": "Access Switch B", "type": "switch", "parentId": "vlan_20"},
        {"id": "pc_a", "label": "User PC 1", "type": "user", "parentId": "vlan_10"},
        {"id": "printer", "label": "Office Printer", "type": "user", "parentId": "vlan_20"}
    ],
    "edges": [
        {"sourceId": "router", "targetId": "fw", "label": "WAN Uplink"},
        {"sourceId": "fw", "targetId": "core_sw", "label": "LAN Trunk"},
        {"sourceId": "core_sw", "targetId": "access_sw_a", "label": "Trunk Link"},
        {"sourceId": "core_sw", "targetId": "access_sw_b", "label": "Trunk Link"},
        {"sourceId": "access_sw_a", "targetId": "pc_a", "label": "Ethernet"},
        {"sourceId": "access_sw_b", "targetId": "printer", "label": "Ethernet"}
    ]
}

# 10. Network DMZ
templates["net_dmz_network.json"] = {
    "title": "Network DMZ Architecture",
    "type": "network",
    "theme": "light",
    "containers": [
        {"id": "dmz_net", "label": "Demilitarized Zone (DMZ)", "type": "vlan", "parentId": "1"},
        {"id": "lan_net", "label": "Internal LAN", "type": "vlan", "parentId": "1"}
    ],
    "nodes": [
        {"id": "internet", "label": "Internet", "type": "internet", "parentId": "1"},
        {"id": "ext_fw", "label": "External Firewall", "type": "firewall", "parentId": "1"},
        {"id": "web_proxy", "label": "Web Proxy Server", "type": "rectangle", "parentId": "dmz_net"},
        {"id": "int_fw", "label": "Internal Firewall", "type": "firewall", "parentId": "1"},
        {"id": "db_internal", "label": "Core DB Server", "type": "cylinder", "parentId": "lan_net"}
    ],
    "edges": [
        {"sourceId": "internet", "targetId": "ext_fw", "label": "Inbound"},
        {"sourceId": "ext_fw", "targetId": "web_proxy", "label": "DMZ Route"},
        {"sourceId": "web_proxy", "targetId": "int_fw", "label": "Query"},
        {"sourceId": "int_fw", "targetId": "db_internal", "label": "Access DB"}
    ]
}

# 11. ERD E-Commerce Schema
templates["erd_ecom_schema.json"] = {
    "title": "E-Commerce ERD Schema",
    "type": "erd",
    "theme": "light",
    "containers": [],
    "nodes": [
        {
            "id": "tbl_users",
            "label": "users",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "email", "type": "VARCHAR(255)"},
                {"name": "password_hash", "type": "VARCHAR(255)"},
                {"name": "created_at", "type": "TIMESTAMP"}
            ]
        },
        {
            "id": "tbl_orders",
            "label": "orders",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "user_id", "type": "INT", "fk": True},
                {"name": "order_date", "type": "TIMESTAMP"},
                {"name": "total_amount", "type": "DECIMAL(10,2)"}
            ]
        },
        {
            "id": "tbl_order_items",
            "label": "order_items",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "order_id", "type": "INT", "fk": True},
                {"name": "product_id", "type": "INT", "fk": True},
                {"name": "quantity", "type": "INT"},
                {"name": "unit_price", "type": "DECIMAL(10,2)"}
            ]
        },
        {
            "id": "tbl_products",
            "label": "products",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "name", "type": "VARCHAR(255)"},
                {"name": "price", "type": "DECIMAL(10,2)"},
                {"name": "stock_qty", "type": "INT"}
            ]
        }
    ],
    "edges": [
        {"sourceId": "tbl_users", "targetId": "tbl_orders", "label": "1 to many"},
        {"sourceId": "tbl_orders", "targetId": "tbl_order_items", "label": "1 to many"},
        {"sourceId": "tbl_products", "targetId": "tbl_order_items", "label": "1 to many"}
    ]
}

# 12. ERD Billing Schema
templates["erd_billing_schema.json"] = {
    "title": "Subscription Billing Schema",
    "type": "erd",
    "theme": "light",
    "containers": [],
    "nodes": [
        {
            "id": "tbl_customers",
            "label": "customers",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "stripe_id", "type": "VARCHAR(255)"},
                {"name": "name", "type": "VARCHAR(255)"}
            ]
        },
        {
            "id": "tbl_subscriptions",
            "label": "subscriptions",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "customer_id", "type": "INT", "fk": True},
                {"name": "plan_id", "type": "INT", "fk": True},
                {"name": "status", "type": "VARCHAR(50)"}
            ]
        },
        {
            "id": "tbl_plans",
            "label": "plans",
            "type": "table",
            "parentId": "1",
            "columns": [
                {"name": "id", "type": "INT", "pk": True},
                {"name": "name", "type": "VARCHAR(255)"},
                {"name": "monthly_price", "type": "DECIMAL(10,2)"}
            ]
        }
    ],
    "edges": [
        {"sourceId": "tbl_customers", "targetId": "tbl_subscriptions", "label": "1 to many"},
        {"sourceId": "tbl_plans", "targetId": "tbl_subscriptions", "label": "1 to many"}
    ]
}

# 13. PFD Gas Compressor
templates["pfd_gas_compressor.json"] = {
    "title": "Gas Compression Station PFD",
    "type": "pfd",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "ko_drum", "label": "Knockout Drum", "type": "vessel", "parentId": "1"},
        {"id": "compressor", "label": "Centrifugal Compressor", "type": "compressor", "parentId": "1"},
        {"id": "cooler", "label": "Gas Cooler", "type": "heat_exchanger", "parentId": "1"},
        {"id": "separator", "label": "Discharge Separator", "type": "vessel", "parentId": "1"},
        {"id": "pump", "label": "Condensate Pump", "type": "pump", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "ko_drum", "targetId": "compressor", "label": "Wet Gas Stream"},
        {"sourceId": "compressor", "targetId": "cooler", "label": "Compressed Hot Gas"},
        {"sourceId": "cooler", "targetId": "separator", "label": "Cool Gas/Liquid"},
        {"sourceId": "separator", "targetId": "pump", "label": "Separated Condensate"}
    ]
}

# 14. PFD Copper Separation
templates["pfd_copper_separation.json"] = {
    "title": "Copper Ore Separation Process PFD",
    "type": "pfd",
    "theme": "light",
    "containers": [],
    "nodes": [
        {"id": "mill", "label": "Grinding Mill", "type": "mill", "parentId": "1"},
        {"id": "rougher", "label": "Rougher Flotation", "type": "tank", "parentId": "1"},
        {"id": "cleaner", "label": "Cleaner Flotation", "type": "tank", "parentId": "1"},
        {"id": "thickener", "label": "Concentrate Thickener", "type": "tank", "parentId": "1"},
        {"id": "tails_pump", "label": "Tailings Disposal Pump", "type": "pump", "parentId": "1"}
    ],
    "edges": [
        {"sourceId": "mill", "targetId": "rougher", "label": "Slurry Feed"},
        {"sourceId": "rougher", "targetId": "cleaner", "label": "Rougher Concentrate"},
        {"sourceId": "rougher", "targetId": "tails_pump", "label": "Rougher Tails"},
        {"sourceId": "cleaner", "targetId": "thickener", "label": "Final Concentrate"}
    ]
}

# 15. AWS EKS / GKE Kubernetes Cluster
templates["aws_gke_kubernetes.json"] = {
    "title": "Kubernetes Cluster Architecture",
    "type": "architecture",
    "theme": "light",
    "containers": [
        {"id": "k8s_cluster", "label": "K8s Cluster", "type": "vpc", "parentId": "1"},
        {"id": "ns_prod", "label": "Namespace: production", "type": "subnet", "parentId": "k8s_cluster", "tier": "app"},
        {"id": "pod_replica_a", "label": "Deployment Pod A", "type": "subnet", "parentId": "ns_prod", "tier": "app"},
        {"id": "pod_replica_b", "label": "Deployment Pod B", "type": "subnet", "parentId": "ns_prod", "tier": "app"}
    ],
    "nodes": [
        {"id": "ingress_ctrl", "label": "Ingress Controller", "type": "ecs", "parentId": "k8s_cluster"},
        {"id": "app_svc", "label": "Service: app-service", "type": "ecs", "parentId": "ns_prod"},
        {"id": "container_a", "label": "Web App Container", "type": "ec2", "parentId": "pod_replica_a"},
        {"id": "container_b", "label": "Web App Container", "type": "ec2", "parentId": "pod_replica_b"}
    ],
    "edges": [
        {"sourceId": "ingress_ctrl", "targetId": "app_svc", "label": "Route Request"},
        {"sourceId": "app_svc", "targetId": "container_a", "label": "Balance load"},
        {"sourceId": "app_svc", "targetId": "container_b", "label": "Balance load"}
    ]
}

# Write each template to a separate JSON file
for filename, content in templates.items():
    with open(os.path.join(templates_dir, filename), "w", encoding="utf-8") as f:
        json.dump(content, f, indent=2)

print("Generated all 15 JSON diagram templates successfully!")
