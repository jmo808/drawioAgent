import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateLibrary } from './TemplateLibrary'

describe('TemplateLibrary', () => {
  test('renders collapsible categories and template cards', () => {
    render(<TemplateLibrary onSelectTemplate={vi.fn()} />)
    expect(screen.getByText('Cloud Architecture Templates')).toBeInTheDocument()
    expect(screen.getByText('AWS 3-Tier Web App')).toBeInTheDocument()
    expect(screen.getByText('GCP Kubernetes Engine')).toBeInTheDocument()
  })

  test('calls onSelectTemplate with correct prompt when card clicked', () => {
    const handleSelect = vi.fn()
    render(<TemplateLibrary onSelectTemplate={handleSelect} />)
    
    const card = screen.getByText('AWS 3-Tier Web App')
    fireEvent.click(card)
    
    expect(handleSelect).toHaveBeenCalledWith(expect.stringContaining('3-tier web application architecture on AWS'))
  })
})
