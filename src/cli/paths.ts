import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
export const defaultProfilePath = join(packageRoot, 'profiles/default.yaml')
export const templateDir = join(packageRoot, 'templates/skill')
