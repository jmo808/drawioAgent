import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'

describe.skipIf(!process.env.RUN_DOCKER_TESTS)('API Server Docker Image Integration', () => {
  const containerName = 'drawio-api-test-server'
  const port = '8086'

  beforeAll(() => {
    // Stop any existing test container
    try {
      execSync(`podman rm -f ${containerName}`, { stdio: 'ignore' })
    } catch {}

    // Start container
    console.log('[TestSetup] Starting api container...')
    execSync(
      `podman run -d --name ${containerName} -p ${port}:3000 localhost/drawio-api-test:latest`,
      { stdio: 'inherit' }
    )

    // Wait for server to spin up
    console.log('[TestSetup] Waiting for server to initialize...')
    execSync('sleep 2')
  })

  afterAll(() => {
    console.log('[TestCleanup] Removing api container...')
    try {
      execSync(`podman rm -f ${containerName}`, { stdio: 'inherit' })
    } catch (e) {
      console.error('[TestCleanup] Failed to clean up container:', e)
    }
  })

  test('should respond 200 to GET /health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ status: 'ok' })
  })
})
