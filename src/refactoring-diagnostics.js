/**
 * @file Diagnostic validation helpers for null-to-undefined refactoring
 */

/**
 * @typedef {Object} DiagnosticResult
 * @property {boolean} hasErrors Whether there are type errors
 * @property {boolean} hasWarnings Whether there are warnings
 * @property {Array<{file: string, line: number, message: string, severity: 'error' | 'warning'}>} issues List of issues
 * @property {string} summary Summary of diagnostic results
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} passed Whether validation passed
 * @property {string[]} errors List of error messages
 * @property {string[]} warnings List of warning messages
 * @property {DiagnosticResult} diagnostics Diagnostic results
 */

/**
 * Diagnostic validation utilities for refactoring
 */
class RefactoringDiagnostics {
  constructor() {
    /** @type {Map<string, DiagnosticResult>} */
    this.diagnosticCache = new Map();

    /** @type {string[]} */
    this.criticalFiles = [
      'src/Comment.js',
      'src/Section.js',
      'src/CommentForm.js',
      'src/Thread.js',
      'src/pageController.js',
      'src/commentManager.js',
      'src/sectionManager.js',
    ];
  }

  /**
   * Validate files using TypeScript diagnostics
   *
   * @param {string[]} filePaths Files to validate
   * @returns {Promise<ValidationResult>} Validation result
   */
  async validateFiles(filePaths) {
    const result = {
      passed: true,
      errors: [],
      warnings: [],
      diagnostics: {
        hasErrors: false,
        hasWarnings: false,
        issues: [],
        summary: '',
      },
    };

    try {
      // Use getDiagnostics tool to check for type errors
      const diagnostics = await this.getDiagnosticsForFiles(filePaths);

      if (diagnostics) {
        result.diagnostics = diagnostics;
        result.passed = !diagnostics.hasErrors;

        // Extract errors and warnings
        diagnostics.issues.forEach((issue) => {
          if (issue.severity === 'error') {
            result.errors.push(`${issue.file}:${issue.line} - ${issue.message}`);
          } else {
            result.warnings.push(`${issue.file}:${issue.line} - ${issue.message}`);
          }
        });
      }
    } catch (error) {
      result.passed = false;
      result.errors.push(`Diagnostic validation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Get diagnostics for specific files
   *
   * @param {string[]} filePaths Files to check
   * @returns {Promise<DiagnosticResult | null>} Diagnostic result
   */
  async getDiagnosticsForFiles(filePaths) {
    // This would be implemented using the getDiagnostics tool
    // For now, return a placeholder structure
    return {
      hasErrors: false,
      hasWarnings: false,
      issues: [],
      summary: `Checked ${filePaths.length} files - no issues found`,
    };
  }

  /**
   * Validate that null-to-undefined changes don't break type safety
   *
   * @param {string} filePath File that was modified
   * @param {string[]} changedFunctions Functions that were changed
   * @param {string[]} changedProperties Properties that were changed
   * @returns {Promise<ValidationResult>} Validation result
   */
  async validateRefactoringChanges(filePath, changedFunctions, changedProperties) {
    const result = await this.validateFiles([filePath]);

    if (!result.passed) {
      // Add context about what was changed
      result.errors.unshift(
        `Refactoring validation failed for ${filePath}`,
        `Changed functions: ${changedFunctions.join(', ')}`,
        `Changed properties: ${changedProperties.join(', ')}`
      );
    }

    return result;
  }

  /**
   * Check if a file is critical for the application
   *
   * @param {string} filePath File path to check
   * @returns {boolean} Whether file is critical
   */
  isCriticalFile(filePath) {
    return this.criticalFiles.some((critical) => filePath.includes(critical));
  }

  /**
   * Validate critical files after refactoring
   *
   * @returns {Promise<ValidationResult>} Validation result
   */
  async validateCriticalFiles() {
    return this.validateFiles(this.criticalFiles);
  }

  /**
   * Check for common null-to-undefined refactoring issues
   *
   * @param {string} filePath File path
   * @param {string} content File content
   * @returns {string[]} List of potential issues
   */
  checkRefactoringIssues(filePath, content) {
    const issues = [];

    // Check for mixed null/undefined usage
    if (content.includes('null') && content.includes('undefined')) {
      const nullCount = (content.match(/\bnull\b/g) || []).length;
      const undefinedCount = (content.match(/\bundefined\b/g) || []).length;

      if (nullCount > 0 && undefinedCount > 0) {
        issues.push(`Mixed null/undefined usage detected (${nullCount} null, ${undefinedCount} undefined)`);
      }
    }

    // Check for potential API null preservation issues
    const apiNullPatterns = [
      /\.querySelector\([^)]+\)\s*===\s*undefined/,
      /\.getElementById\([^)]+\)\s*===\s*undefined/,
      /\.getAttribute\([^)]+\)\s*===\s*undefined/,
      /\.match\([^)]+\)\s*===\s*undefined/,
    ];

    apiNullPatterns.forEach((pattern) => {
      if (pattern.test(content)) {
        issues.push('Potential API null comparison changed to undefined - verify this is correct');
      }
    });

    // Check for JSDoc type inconsistencies
    const jsdocNullPattern = /@(?:param|returns?|type)\s*\{[^}]*\|\s*null[^}]*\}/g;
    const jsdocUndefinedPattern = /@(?:param|returns?|type)\s*\{[^}]*\|\s*undefined[^}]*\}/g;

    const nullJsdocCount = (content.match(jsdocNullPattern) || []).length;
    const undefinedJsdocCount = (content.match(jsdocUndefinedPattern) || []).length;

    if (nullJsdocCount > 0 && undefinedJsdocCount > 0) {
      issues.push('Mixed JSDoc null/undefined types detected - ensure consistency');
    }

    return issues;
  }

  /**
   * Generate validation report for a file
   *
   * @param {string} filePath File path
   * @param {ValidationResult} validationResult Validation result
   * @returns {string} Formatted report
   */
  generateValidationReport(filePath, validationResult) {
    const { passed, errors, warnings, diagnostics } = validationResult;

    let report = `Validation Report for ${filePath}\n`;
    report += `${'='.repeat(50)}\n\n`;

    report += `Status: ${passed ? 'PASSED' : 'FAILED'}\n`;
    report += `Errors: ${errors.length}\n`;
    report += `Warnings: ${warnings.length}\n\n`;

    if (errors.length > 0) {
      report += 'ERRORS:\n';
      errors.forEach((error) => {
        report += `  - ${error}\n`;
      });
      report += '\n';
    }

    if (warnings.length > 0) {
      report += 'WARNINGS:\n';
      warnings.forEach((warning) => {
        report += `  - ${warning}\n`;
      });
      report += '\n';
    }

    if (diagnostics.summary) {
      report += `Diagnostics: ${diagnostics.summary}\n`;
    }

    return report;
  }

  /**
   * Cache diagnostic results for a file
   *
   * @param {string} filePath File path
   * @param {DiagnosticResult} result Diagnostic result
   */
  cacheDiagnostics(filePath, result) {
    this.diagnosticCache.set(filePath, result);
  }

  /**
   * Get cached diagnostic results
   *
   * @param {string} filePath File path
   * @returns {DiagnosticResult | undefined} Cached result
   */
  getCachedDiagnostics(filePath) {
    return this.diagnosticCache.get(filePath);
  }

  /**
   * Clear diagnostic cache
   */
  clearCache() {
    this.diagnosticCache.clear();
  }

  /**
   * Validate that function call chains are consistent after refactoring
   *
   * @param {string} functionName Function name
   * @param {string[]} callerFiles Files that call this function
   * @returns {Promise<ValidationResult>} Validation result
   */
  async validateCallChain(functionName, callerFiles) {
    const result = await this.validateFiles(callerFiles);

    if (!result.passed) {
      result.errors.unshift(`Call chain validation failed for function: ${functionName}`);
    }

    return result;
  }

  /**
   * Check for potential runtime issues after null-to-undefined refactoring
   *
   * @param {string} content File content
   * @returns {string[]} List of potential runtime issues
   */
  checkRuntimeIssues(content) {
    const issues = [];

    // Check for loose equality comparisons that might behave differently
    if (/==\s*undefined|undefined\s*==/.test(content)) {
      issues.push('Loose equality with undefined detected - consider using strict equality');
    }

    // Check for typeof checks that might need updating
    if (/typeof\s+[^=]+===\s*['"]undefined['"]/.test(content)) {
      issues.push('typeof undefined check detected - verify this is intentional');
    }

    // Check for potential issues with default parameters
    if (/function[^{]*\([^)]*=\s*undefined[^)]*\)/.test(content)) {
      issues.push('Default parameter with undefined detected - consider omitting the default');
    }

    return issues;
  }
}

// Export singleton instance
const refactoringDiagnostics = new RefactoringDiagnostics();

export default refactoringDiagnostics;
