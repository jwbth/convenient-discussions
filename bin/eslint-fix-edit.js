// Claude Code PostToolUse hook, registered in .claude/settings.json: apply ESLint's fixes to the file
// an agent has just written, which fix-on-save in VS Code never sees.

import { eslintFixFile } from './eslint-fix-file.js'

let stdin = ''
for await (const chunk of process.stdin) stdin += String(chunk)

/** @type {string | undefined} */
const file = JSON.parse(stdin)?.tool_input?.file_path
if (file) await eslintFixFile(file)
