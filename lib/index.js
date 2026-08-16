import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KEY_REF = 'DEEPSEEK_API_KEY'
const URL = 'https://api.deepseek.com/user/balance'
const TOPUP_URL = 'https://platform.deepseek.com/top_up'
const ANCHOR_PATH = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.balance-day.json')

export const inject = ['webServer', 'credentials', 'shell']

function todayKey() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return now.getFullYear() + '-' + mm + '-' + dd
}

async function readAnchor() {
  try {
    const parsed = JSON.parse(await readFile(ANCHOR_PATH, 'utf8'))
    if (parsed && typeof parsed.date === 'string' && typeof parsed.total === 'number') return parsed
  } catch (e) { /* absent or corrupt */ }
  return null
}

async function writeAnchor(anchor) {
  try {
    await writeFile(ANCHOR_PATH, JSON.stringify(anchor), 'utf8')
  } catch (e) { /* best effort */ }
}

export function apply(ctx) {
  async function queryBalance() {
    const resolved = await ctx.credentials.resolve(KEY_REF)
    if (resolved === undefined || resolved.value === undefined || resolved.value === '') {
      return { ok: false, error: 'NO_KEY', message: '未配置 DEEPSEEK_API_KEY' }
    }

    const apiKey = String(resolved.value).trim()
    const script =
      "fetch('" + URL + "',{headers:{Authorization:'Bearer " + apiKey + "'}})" +
      ".then(async r=>{const t=await r.text();console.log(r.status);console.log(t)})" +
      ".catch(e=>{console.error(e.message);process.exit(1)})"

    const result = await ctx.shell.run(ctx.shell.resolve({
      command: 'node -e "' + script + '"',
      timeoutMs: 20000,
      sandboxPolicy: { mode: 'danger-full-access' },
    }))

    const stdout = (result && result.stdout && result.stdout.text) || ''
    const stderr = (result && result.stderr && result.stderr.text) || ''

    if (result.timedOut) return { ok: false, error: 'TIMEOUT', message: '查询超时' }
    if (result.exitCode !== 0) {
      return { ok: false, error: 'REQUEST_FAILED', message: stderr.trim() || ('命令退出码 ' + result.exitCode) }
    }

    const text = stdout.trim()
    const nl = text.indexOf('\n')
    const statusLine = nl === -1 ? text : text.slice(0, nl).trim()
    const bodyLine = nl === -1 ? '' : text.slice(nl + 1).trim()
    const status = parseInt(statusLine, 10)

    if (status !== 200) {
      let message = 'DeepSeek 接口返回 HTTP ' + status
      try {
        const err = JSON.parse(bodyLine)
        if (err && err.error && err.error.message) message = err.error.message
      } catch (e) { /* keep generic message */ }
      return { ok: false, error: 'HTTP_' + status, message }
    }

    let data
    try {
      data = JSON.parse(bodyLine)
    } catch (e) {
      return { ok: false, error: 'BAD_RESPONSE', message: bodyLine || '响应解析失败' }
    }

    const balances = Array.isArray(data.balance_infos)
      ? data.balance_infos.map(function (b) {
          return {
            currency: b.currency,
            total: b.total_balance,
            granted: b.granted_balance,
            toppedUp: b.topped_up_balance,
          }
        })
      : []

    // Today's consumption: anchored balance at the first read of the day (or
    // after a top-up that raised the balance), minus the current balance.
    const first = balances[0]
    const totalNumber = first ? parseFloat(first.total) || 0 : 0
    const today = todayKey()
    let anchor = await readAnchor()
    if (anchor === null || anchor.date !== today || totalNumber > anchor.total) {
      anchor = { date: today, total: totalNumber }
      await writeAnchor(anchor)
    }
    const todaySpend = Math.max(0, Math.round((anchor.total - totalNumber) * 100) / 100)

    return { ok: true, available: data.is_available === true, balances, todaySpend }
  }

  ctx.webServer.register({
    kind: 'exact',
    path: '/deepseek-balance',
    async handler(_req, res) {
      try {
        const result = await queryBalance()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(result))
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'INTERNAL', message: String((error && error.message) || error) }))
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/deepseek-topup',
    async handler(_req, res) {
      try {
        await ctx.shell.run(ctx.shell.resolve({
          command: "Start-Process '" + TOPUP_URL + "'",
          timeoutMs: 10000,
          sandboxPolicy: { mode: 'danger-full-access' },
        }))
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'INTERNAL', message: String((error && error.message) || error) }))
      }
    },
  })
}
