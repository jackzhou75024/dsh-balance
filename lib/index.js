import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KEY_REF = 'DEEPSEEK_API_KEY'
const URL = 'https://api.deepseek.com/user/balance'
const TOPUP_URL = 'https://platform.deepseek.com/top_up'
const ANCHOR_PATH = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.balance-day.json')

export const inject = ['webServer', 'credentials']

function todayKey() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return now.getFullYear() + '-' + mm + '-' + dd
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(ANCHOR_PATH, 'utf8'))
    if (parsed && typeof parsed.date === 'string' && typeof parsed.prev === 'number' && typeof parsed.consumed === 'number') return parsed
  } catch (e) { /* absent or corrupt */ }
  return null
}

async function writeState(state) {
  try {
    await writeFile(ANCHOR_PATH, JSON.stringify(state), 'utf8')
  } catch (e) { /* best effort */ }
}

export function apply(ctx) {
  async function queryBalance() {
    const resolved = await ctx.credentials.resolve(KEY_REF)
    if (resolved === undefined || resolved.value === undefined || resolved.value === '') {
      return { ok: false, error: 'NO_KEY', message: '未配置 DEEPSEEK_API_KEY' }
    }

    const apiKey = String(resolved.value).trim()
    let resp
    try {
      resp = await fetch(URL, {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(20000),
      })
    } catch (error) {
      return { ok: false, error: 'REQUEST_FAILED', message: String((error && error.message) || error) }
    }

    const body = await resp.text()
    if (resp.status !== 200) {
      let message = 'DeepSeek 接口返回 HTTP ' + resp.status
      try {
        const err = JSON.parse(body)
        if (err && err.error && err.error.message) message = err.error.message
      } catch (e) { /* keep generic message */ }
      return { ok: false, error: 'HTTP_' + resp.status, message }
    }

    let data
    try {
      data = JSON.parse(body)
    } catch (e) {
      return { ok: false, error: 'BAD_RESPONSE', message: body || '响应解析失败' }
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

    // Today's consumption: accumulated balance decreases since the first read
    // of the day. Resets only on first run or when the day changes; a top-up
    // (balance increase) does not reduce the running total.
    const first = balances[0]
    const totalNumber = first ? parseFloat(first.total) || 0 : 0
    const today = todayKey()
    let state = await readState()
    if (state === null || state.date !== today) {
      state = { date: today, prev: totalNumber, consumed: 0 }
    } else {
      if (totalNumber < state.prev) {
        const delta = Math.round((state.prev - totalNumber) * 100) / 100
        state.consumed = Math.round((state.consumed + delta) * 100) / 100
      }
      state.prev = totalNumber
    }
    await writeState(state)

    return { ok: true, available: data.is_available === true, balances, todaySpend: state.consumed }
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
        // Open the URL in the default browser without flashing a console window.
        spawn('cmd', ['/c', 'start', '', TOPUP_URL], { windowsHide: true, stdio: 'ignore' })
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
