// Overridable to run a second dev server, e.g. from a git worktree, next to the main one
export const devPort = Number(process.env.CD_DEV_PORT) || 9000
