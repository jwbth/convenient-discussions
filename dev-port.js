import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getCheckoutPort } from './bin/dev-port-claim.js'

export const devPort =
	Number(process.env.CD_DEV_PORT) ||
	getCheckoutPort(path.dirname(fileURLToPath(import.meta.url)))
