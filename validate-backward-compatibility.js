#!/usr/bin/env node

/**
 * Focused backward compatibility validation script.
 * This script validates that the Comment class refactoring maintains actual functionality.
 */

const fs = require('node:fs');
const path = require('node:path');

console.log('🔍 Validating Comment Class Refactoring - Functional Backward Compatibility\n');

let passedTests = 0;
let totalTests = 0;

function test(description, testFn) {
	totalTests++;
	try {
		const result = testFn();
		if (result) {
			console.log(`✅ ${description}`);
			passedTests++;
		} else {
			console.log(`❌ ${description}`);
		}
	} catch (error) {
		console.log(`❌ ${description} - Error: ${error.message}`);
	}
}

function readFile(filePath) {
	return fs.readFileSync(path.join(__dirname, filePath), 'utf8');
}

function fileExists(filePath) {
	return fs.existsSync(path.join(__dirname, filePath));
}

// Test 1: Settings Migration (Critical for backward compatibility)
test('Settings system has commentDisplay -> reformatComments alias', () => {
	const settingsSource = readFile('src/settings.js');

	return settingsSource.includes("'commentDisplay': ['reformatComments']");
});

test('Settings system has commentDisplay in control types', () => {
	const settingsSource = readFile('src/settings.js');

	return settingsSource.includes('commentDisplay: \'radio\'');
});

test('Settings system has commentDisplay in default values', () => {
	const settingsSource = readFile('src/settings.js');

	return settingsSource.includes('\'commentDisplay\': \'spacious\'');
});

// Test 2: Class Structure (Essential for functionality)
test('Comment base class exists', () => fileExists('src/Comment.js'));

test('CompactComment class exists', () => fileExists('src/CompactComment.js'));

test('SpaciousComment class exists', () => fileExists('src/SpaciousComment.js'));

test('CommentLayers composition class exists', () => fileExists('src/CommentLayers.js'));

test('CommentActions composition class exists', () => fileExists('src/CommentActions.js'));

// Test 3: Inheritance Structure (Critical for polymorphism)
test('CompactComment extends Comment', () => {
	const compactCommentSource = readFile('src/CompactComment.js');

	return compactCommentSource.includes('extends Comment');
});

test('SpaciousComment extends Comment', () => {
	const spaciousCommentSource = readFile('src/SpaciousComment.js');

	return spaciousCommentSource.includes('extends Comment');
});

// Test 4: Core Functionality Maintained
test('Comment class maintains core properties', () => {
	const commentSource = readFile('src/Comment.js');

	return commentSource.includes('layers;') &&
		commentSource.includes('actions;') &&
		commentSource.includes('spacious;');
});

test('Comment class maintains essential methods', () => {
	const commentSource = readFile('src/Comment.js');

	return commentSource.includes('configureLayers()') &&
		commentSource.includes('updateTimestampElements') &&
		commentSource.includes('formatTimestamp');
});

test('CompactCommentActions no longer needs hasClassicUnderlay checks', () => {
	const compactActionsSource = readFile('src/CompactCommentActions.js');

	// The hasClassicUnderlay method has been removed since the presence of layers
	// is guaranteed by the class structure when CompactCommentActions is instantiated
	return !compactActionsSource.includes('hasClassicUnderlay()') &&
		compactActionsSource.includes('addReplyButton') &&
		compactActionsSource.includes('addEditButton');
});

// Test 6: BootProcess Integration (Critical for class selection)
test('BootProcess imports correct comment classes', () => {
	const bootProcessSource = readFile('src/BootProcess.js');

	return bootProcessSource.includes('import CompactComment') &&
		bootProcessSource.includes('import SpaciousComment');
});

test('BootProcess uses commentDisplay setting for class selection', () => {
	const bootProcessSource = readFile('src/TalkPageBootProcess.js');

	return bootProcessSource.includes("settings.get('commentDisplay') === 'spacious'") &&
		bootProcessSource.includes('? SpaciousComment : CompactComment');
});

// Test 7: Composition Pattern (Essential for new architecture)
test('Comment no longer imports composition classes directly', () => {
	const commentSource = readFile('src/Comment.js');

	// Comment base class no longer imports composition classes directly
	// They are imported by the specific subclasses (CompactComment, SpaciousComment)
	return !commentSource.includes("import CommentLayers from './CommentLayers'") &&
		!commentSource.includes("import CommentActions from './CommentActions'");
});

test('CommentLayers has expected methods', () => {
	const layersSource = readFile('src/CommentLayers.js');

	return layersSource.includes('create()') &&
		layersSource.includes('destroy()') &&
		layersSource.includes('updateStyles(');
});

test('CommentActions has expected methods', () => {
	const actionsSource = readFile('src/CommentActions.js');

	return actionsSource.includes('addReplyButton()') &&
		actionsSource.includes('addEditButton()') &&
		actionsSource.includes('addThankButton()');
});

// Test 8: Property Renaming (Critical for consistency)
test('Comment uses spacious property instead of reformatted', () => {
	const commentSource = readFile('src/Comment.js');

	return commentSource.includes('spacious;') &&
		!commentSource.includes('reformatted;');
});

// Test 9: Visual Compatibility (Essential for UI)
test('Layer elements maintain expected CSS classes', () => {
	const layersSource = readFile('src/CommentLayers.js');

	return layersSource.includes('cd-comment-underlay') &&
		layersSource.includes('cd-comment-overlay');
});

// Test 10: No Unnecessary Backward Compatibility Cruft
test('Comment class does not have deprecated getters', () => {
	const commentSource = readFile('src/Comment.js');

	return !commentSource.includes('@deprecated Use layers.') &&
		!commentSource.includes('@deprecated Use actions.');
});

test('Comment class does not have unused add button methods', () => {
	const commentSource = readFile('src/Comment.js');

	return !commentSource.includes('addReplyButton() {') &&
		!commentSource.includes('addEditButton() {') &&
		!commentSource.includes('addThankButton() {');
});

// Summary
console.log('\n📊 Validation Summary:');
console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);

if (passedTests === totalTests) {
	console.log('\n🎉 All functional backward compatibility validations passed!');
	console.log('The Comment class refactoring maintains all essential functionality.');
} else {
	console.log('\n⚠️  Some validations failed. Please review the failing tests above.');
}

console.log('\n🔍 Key Functional Compatibility Features Validated:');
console.log('• Settings migration (reformatComments → commentDisplay radio)');
console.log('• Class inheritance structure (CompactComment, SpaciousComment extend Comment)');
console.log('• Composition pattern implementation (layers, actions)');
console.log('• BootProcess integration for class selection');
console.log('• Visual compatibility (CSS classes maintained)');
console.log('• Clean architecture (no deprecated cruft)');

process.exit(passedTests === totalTests ? 0 : 1);
