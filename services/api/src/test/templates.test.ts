import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Resolve path to build-diagram script in drawio_plugin
const buildDiagramPath = path.resolve(__dirname, '../../../../../drawio_plugin/scripts/build-diagram.js');
const { buildDiagram } = require(buildDiagramPath);

describe('Architecture JSON Templates Validation', () => {
  const templatesDir = path.resolve(__dirname, '../../../../templates/architectures');
  const tempOutputDir = path.resolve(__dirname, '../../../../services/api/src/test/scratch');

  // Ensure scratch directory exists
  if (!fs.existsSync(tempOutputDir)) {
    fs.mkdirSync(tempOutputDir, { recursive: true });
  }

  const templates = ['aws-3tier.json', 'aws-microservices.json', 'gcp-gke.json', 'azure-aks.json'];

  templates.forEach((templateName) => {
    test(`should successfully compile ${templateName} into valid draw.io XML`, () => {
      const inputPath = path.join(templatesDir, templateName);
      const outputPath = path.join(tempOutputDir, `${templateName.replace('.json', '.drawio')}`);

      // Run build diagram compiler
      const res = buildDiagram(inputPath, outputPath);

      // Assertions
      if (!res.success) {
        console.error(`[TestFailure] ${templateName} failed:`, JSON.stringify(res, null, 2));
      }
      expect(res.success).toBe(true);
      expect(res.xml).toBeDefined();
      expect(res.xml).toContain('<mxGraphModel');
      expect(fs.existsSync(outputPath)).toBe(true);

      // Clean up generated file
      try {
        fs.unlinkSync(outputPath);
      } catch (e) {
        // Ignore cleanup failures
      }
    });
  });
});
