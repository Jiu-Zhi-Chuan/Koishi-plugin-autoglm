import { spawn } from 'child_process'
import path from 'path'

export interface RunOptions {
  pythonPath?: string // optional override for python executable
  cwd?: string // working directory where main.py lives
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

// args can be either an array of CLI arguments, or a single task string
export function runOpenAutoGLM(args: string[] | string = [], options: RunOptions = {}): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const python = options.pythonPath || process.env.PYTHON || 'python'

    // by default assume Open-AutoGLM-main sits two directories up from this src folder: external/Open-AutoGLM-main
    const defaultCwd = path.resolve(__dirname, 'AutoGLM')
    const cwd = options.cwd || defaultCwd

    // normalize args: if caller passed a single string, treat it as one positional task
    const argList: string[] = typeof args === 'string' ? [args] : args

    const cmdArgs = ['main.py', ...argList.map((a) => String(a))]

    // ensure python uses utf-8 IO on Windows (avoids garbled stderr/stdout)
    const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }, options.env || {})

    const child = spawn(python, cmdArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let finished = false

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    }

    const onFinish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return
      finished = true
      resolve({ stdout, stderr, code, signal })
    }

    child.on('error', (err) => {
      if (finished) return
      finished = true
      reject(err)
    })

    child.on('close', onFinish)

    if (options.timeoutMs && options.timeoutMs > 0) {
      setTimeout(() => {
        if (finished) return
        try {
          child.kill()
        } catch (e) {
          // ignore
        }
        finished = true
        reject(new Error(`process timeout after ${options.timeoutMs} ms`))
      }, options.timeoutMs)
    }
  })
}

export default runOpenAutoGLM
