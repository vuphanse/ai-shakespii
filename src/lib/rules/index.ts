import type { Rule } from '../types'
import { FM01 } from './FM01'
import { FM02 } from './FM02'
import { FM04 } from './FM04'
import { CT03 } from './CT03'
import { ST02 } from './ST02'
import { PH01 } from './PH01'

// Seed rules register here as they land (Tasks 8-13).
export const rules: Rule[] = [FM01, FM02, FM04, CT03, ST02, PH01]
