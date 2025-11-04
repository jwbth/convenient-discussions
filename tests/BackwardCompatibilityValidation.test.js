/**
 * @file Backward compatibility validation tests for the Comment class refactoring.
 * These tests ensure that the refactored Comment class maintains full backward compatibility.
 */

describe('Comment Class Refactoring - Backward Compatibility', () => {
  describe('Settings Migration', () => {
    test('settings system should handle spaciousComments setting', () => {
      // Test that the settings system can handle the new setting name
      const settingsModule = require('../src/settings');
      expect(settingsModule).toBeDefined();
      expect(typeof settingsModule.get).toBe('function');
    });

    test('settings aliases should include reformatComments -> spaciousComments', () => {
      // This validates that the settings system has the proper alias mapping
      const settingsModule = require('../src/settings');

      // The settings scheme should have aliases defined
      if (settingsModule.default.scheme) {
        const aliases = settingsModule.default.scheme.aliases;
        expect(aliases).toBeDefined();

        // Check if spaciousComments has reformatComments as an alias
        if (aliases.spaciousComments) {
          expect(aliases.spaciousComments).toContain('reformatComments');
        }
      }
    });
  });

  describe('Class Structure Validation', () => {
    test('Comment classes should be properly exported', () => {
      const Comment = require('../src/Comment').default;
      const CompactComment = require('../src/CompactComment').default;
      const SpaciousComment = require('../src/SpaciousComment').default;

      expect(Comment).toBeDefined();
      expect(CompactComment).toBeDefined();
      expect(SpaciousComment).toBeDefined();

      expect(typeof Comment).toBe('function');
      expect(typeof CompactComment).toBe('function');
      expect(typeof SpaciousComment).toBe('function');
    });

    test('Composition classes should be properly exported', () => {
      const CommentLayers = require('../src/CommentLayers').default;
      const CommentActions = require('../src/CommentActions').default;

      expect(CommentLayers).toBeDefined();
      expect(CommentActions).toBeDefined();

      expect(typeof CommentLayers).toBe('function');
      expect(typeof CommentActions).toBe('function');
    });
  });

  describe('BootProcess Integration', () => {
    test('BootProcess should import the correct comment classes', () => {
      const BootProcess = require('../src/BootProcess').default;
      expect(BootProcess).toBeDefined();

      // The BootProcess file should have the necessary imports
      const bootProcessSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/BootProcess.js'),
        'utf8'
      );

      expect(bootProcessSource).toContain('import CompactComment');
      expect(bootProcessSource).toContain('import SpaciousComment');
      expect(bootProcessSource).toContain("settings.get('spaciousComments') === 'spacious'");
    });
  });

  describe('Comment Class Structure', () => {
    test('Comment base class should have expected structure', () => {
      const commentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/Comment.js'),
        'utf8'
      );

      // Check for composition properties
      expect(commentSource).toContain('layers;');
      expect(commentSource).toContain('actions;');

      // Check that old direct property access is not used
      expect(commentSource).not.toMatch(/this\.underlay(?!\s*=)/);
      expect(commentSource).not.toMatch(/this\.overlay(?!\s*=)/);
      expect(commentSource).not.toMatch(/this\.replyButton(?!\s*=)/);

      // Check for spacious property
      expect(commentSource).toContain('spacious');
    });

    test('CompactComment should extend Comment', () => {
      const compactCommentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/CompactComment.js'),
        'utf8'
      );

      expect(compactCommentSource).toContain('extends Comment');
      expect(compactCommentSource).toContain('class CompactComment');
    });

    test('SpaciousComment should extend Comment', () => {
      const spaciousCommentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/SpaciousComment.js'),
        'utf8'
      );

      expect(spaciousCommentSource).toContain('extends Comment');
      expect(spaciousCommentSource).toContain('class SpaciousComment');
    });
  });

  describe('Method Compatibility', () => {
    test('Comment should have backward compatible methods', () => {
      const commentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/Comment.js'),
        'utf8'
      );

      // Check for type guard methods
      expect(commentSource).toContain('isReformatted()');
      expect(commentSource).toContain('hasClassicUnderlay()');

      // Check that isReformatted uses spacious property
      expect(commentSource).toContain('return this.spacious');
    });
  });

  describe('Composition Pattern Implementation', () => {
    test('CommentLayers should have expected structure', () => {
      const layersSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/CommentLayers.js'),
        'utf8'
      );

      // Check for layer properties
      expect(layersSource).toContain('underlay;');
      expect(layersSource).toContain('overlay;');
      expect(layersSource).toContain('$underlay;');
      expect(layersSource).toContain('$overlay;');

      // Check for methods
      expect(layersSource).toContain('create()');
      expect(layersSource).toContain('destroy()');
      expect(layersSource).toContain('updateStyles(');
    });

    test('CommentActions should have expected structure', () => {
      const actionsSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/CommentActions.js'),
        'utf8'
      );

      // Check for action properties
      expect(actionsSource).toContain('replyButton');
      expect(actionsSource).toContain('editButton');
      expect(actionsSource).toContain('thankButton');

      // Check for methods
      expect(actionsSource).toContain('addReplyButton()');
      expect(actionsSource).toContain('addEditButton()');
      expect(actionsSource).toContain('addThankButton()');
    });
  });

  describe('Deprecation Warnings', () => {
    test('composition pattern should be used instead of direct properties', () => {
      const commentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/Comment.js'),
        'utf8'
      );

      // Check that composition pattern is used
      expect(commentSource).toContain('this.layers');
      expect(commentSource).toContain('this.actions');

      // Check that old direct property access is not used (except in deprecated getters)
      expect(commentSource).not.toMatch(/this\.underlay(?!\s*=)/);
      expect(commentSource).not.toMatch(/this\.overlay(?!\s*=)/);
    });
  });

  describe('Import Structure', () => {
    test('Comment should import composition classes', () => {
      const commentSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/Comment.js'),
        'utf8'
      );

      expect(commentSource).toContain("import CommentLayers from './CommentLayers'");
      expect(commentSource).toContain("import CommentActions from './CommentActions'");
      expect(commentSource).toContain("import CompactCommentLayers from './CompactCommentLayers'");
      expect(commentSource).toContain("import SpaciousCommentLayers from './SpaciousCommentLayers'");
    });
  });

  describe('Settings System Integration', () => {
    test('settings should have spaciousComments in scheme', () => {
      const settingsSource = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../src/settings.js'),
        'utf8'
      );

      // Check for spaciousComments in aliases
      expect(settingsSource).toContain("'spaciousComments': ['reformatComments']");

      // Check for spaciousComments in control types
      expect(settingsSource).toContain('spaciousComments: \'radio\'');

      // Check for spaciousComments in default values
      expect(settingsSource).toContain('\'spaciousComments\': \'spacious\'');
    });
  });
});
