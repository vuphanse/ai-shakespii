import type { GateVerdict } from '../../lib/install/gate'
import type { HarnessFinding } from '../../lib/harness/types'
import type { CorpusFinding, Finding } from '../../lib/types'

export interface TargetOutcome {
  provider: string | null
  path: string
  /** XS findings naming the candidate; [] = advisory ran clean; null = advisory skipped (no corpus to compare against, or gate blocked before it ran). */
  advisory: CorpusFinding[] | null
  installed: boolean
  forced: boolean
  reason: string | null
}

export interface InstallJsonReport {
  version: 1
  skill: string | null
  source: { kind: 'path' | 'bundled'; path: string }
  gate: {
    lint: {
      status: 'pass' | 'fail'
      errors: number
      warnings: number
      findings: Array<{ ruleId: string; severity: string; file: string; line: number | null; message: string }>
    }
    test: {
      status: 'pass' | 'fail' | 'skipped'
      failures: Array<{ severity: string; message: string; file: string; line: number | null }>
    }
  }
  targets: TargetOutcome[]
}

export function installJsonReport(
  skillName: string | null,
  source: { kind: 'path' | 'bundled'; path: string },
  gate: GateVerdict,
  lintFindings: Finding[],
  testFindings: HarnessFinding[] | null,
  targets: TargetOutcome[],
): InstallJsonReport {
  return {
    version: 1,
    skill: skillName,
    source: { kind: source.kind, path: source.path },
    gate: {
      lint: {
        status: gate.lint.status,
        errors: gate.lint.errors,
        warnings: gate.lint.warnings,
        findings: lintFindings.map(f => ({ ruleId: f.ruleId, severity: f.severity, file: f.file, line: f.line, message: f.message })),
      },
      test: {
        status: gate.test.status,
        failures: (testFindings ?? []).map(f => ({ severity: f.severity, message: f.message, file: f.file, line: f.line })),
      },
    },
    targets: targets.map(t => ({
      provider: t.provider,
      path: t.path,
      advisory: t.advisory,
      installed: t.installed,
      forced: t.forced,
      reason: t.reason,
    })),
  }
}
