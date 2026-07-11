import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock scrollIntoView since jsdom doesn't support it
window.HTMLElement.prototype.scrollIntoView = vi.fn()
