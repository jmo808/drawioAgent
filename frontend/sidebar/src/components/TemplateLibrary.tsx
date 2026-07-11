import React, { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'

interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

interface Category {
  name: string;
  templates: Template[];
}

interface TemplateLibraryProps {
  onSelectTemplate: (prompt: string) => void;
}

const CATEGORIES: Category[] = [
  {
    name: 'Cloud Architecture Templates',
    templates: [
      {
        id: 'aws-3tier',
        name: 'AWS 3-Tier Web App',
        description: 'ALB, Auto Scaling Group, private RDS',
        prompt: 'Create a 3-tier web application architecture on AWS containing an ALB, web instances in Auto Scaling Group, and a private Multi-AZ RDS database.'
      },
      {
        id: 'gcp-gke',
        name: 'GCP Kubernetes Engine',
        description: 'GKE Cluster, Load Balancer, Cloud SQL',
        prompt: 'Create a Google Cloud architecture showing a GKE Cluster, an HTTP Load Balancer, a Cloud SQL Instance, and a Cloud Storage Bucket.'
      }
    ]
  },
  {
    name: 'Basic Flowcharts',
    templates: [
      {
        id: 'flowchart-basic',
        name: 'Process Flow',
        description: 'Standard start, decision, action, end flow',
        prompt: 'Create a basic flowchart showing a start node, a decision block checking if status is complete, an execution step, and an end node.'
      }
    ]
  }
]

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ onSelectTemplate }) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Cloud Architecture Templates')

  const toggleCategory = (name: string) => {
    setExpandedCategory(expandedCategory === name ? null : name)
  }

  return (
    <div className="drawio-agent-template-library">
      <div className="drawio-agent-library-title">Templates</div>
      {CATEGORIES.map((cat) => {
        const isExpanded = expandedCategory === cat.name
        return (
          <div key={cat.name} className="drawio-agent-category-section">
            <button
              className="drawio-agent-category-header"
              onClick={() => toggleCategory(cat.name)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{cat.name}</span>
            </button>
            
            {isExpanded && (
              <div className="drawio-agent-template-grid">
                {cat.templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    className="drawio-agent-template-card"
                    onClick={() => onSelectTemplate(tpl.prompt)}
                  >
                    <FileText className="drawio-agent-template-icon" size={16} />
                    <div className="drawio-agent-template-info">
                      <div className="drawio-agent-template-name">{tpl.name}</div>
                      <div className="drawio-agent-template-desc">{tpl.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
