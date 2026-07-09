import type { Rule } from '../types'
import { FM01 } from './FM01'
import { FM02 } from './FM02'
import { FM03 } from './FM03'
import { FM04 } from './FM04'
import { FM05 } from './FM05'
import { CT01 } from './CT01'
import { CT02 } from './CT02'
import { CT03 } from './CT03'
import { CT04 } from './CT04'
import { CT05 } from './CT05'
import { CT06 } from './CT06'
import { CT07 } from './CT07'
import { ST01 } from './ST01'
import { ST02 } from './ST02'
import { ST03 } from './ST03'
import { ST04 } from './ST04'
import { ST05 } from './ST05'
import { HY01 } from './HY01'
import { HY02 } from './HY02'
import { HY03 } from './HY03'
import { HY04 } from './HY04'
import { HY05 } from './HY05'
import { HY06 } from './HY06'
import { TR01 } from './TR01'
import { TR02 } from './TR02'
import { PH01 } from './PH01'

export const rules: Rule[] = [
  FM01, FM02, FM03, FM04, FM05,
  CT01, CT02, CT03, CT04, CT05, CT06, CT07,
  ST01, ST02, ST03, ST04, ST05,
  HY01, HY02, HY03, HY04, HY05, HY06,
  TR01,
  TR02,
  PH01,
]
