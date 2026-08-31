import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'

describe.skipIf(!process.env.RUN_DOCKER_TESTS)('Docker Image Integration', () => {
  const containerName = 'drawio-frontend-test-server'
  const port = '8085'

  beforeAll(() => {
    // Stop any existing test container
    try {
      execSync(`podman rm -f ${containerName}`, { stdio: 'ignore' })
    } catch {}

    // Start container
    console.log('[TestSetup] Starting test container...')
    execSync(
      `podman run -d --name ${containerName} -p ${port}:8080 localhost/drawio-frontend-test:latest`,
      { stdio: 'inherit' }
    )

    // Wait for Tomcat to spin up (approx 5 seconds)
    console.log('[TestSetup] Waiting for server to initialize...')
    execSync('sleep 5')
  })

  afterAll(() => {
    console.log('[TestCleanup] Removing test container...')
    try {
      execSync(`podman rm -f ${containerName}`, { stdio: 'inherit' })
    } catch (e) {
      console.error('[TestCleanup] Failed to clean up container:', e)
    }
  })

  test('should serve PreConfig.js with correct plugin configuration', async () => {
    const res = await fetch(`http://localhost:${port}/draw/js/PreConfig.js`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('js/drawio-agent-plugin.js')
  })

  test('should serve drawio-agent-plugin.js', async () => {
    const res = await fetch(`http://localhost:${port}/draw/js/drawio-agent-plugin.js`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.length).toBeGreaterThan(100)
  })
})
