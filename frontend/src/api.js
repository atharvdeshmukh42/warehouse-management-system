import { useEffect, useState } from 'react'

const API = '/api'
const TOKEN_KEY = 'wms_token'
let memoryToken = null // fallback when the browser blocks localStorage

// The sign-in token is kept in localStorage so a page refresh stays signed in
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken
  } catch {
    return memoryToken
  }
}

export function saveToken(token) {
  memoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked: the in-memory token still works until refresh
  }
}

export async function api(path, method = 'GET', body) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Session expired or signed out elsewhere: go back to the sign-in page
  if (res.status === 401 && token) {
    saveToken(null)
    window.location.reload()
  }

  const data = await res.json()
  if (!res.ok) {
    // FastAPI validation errors come back as a list
    const message = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(', ') : data.detail
    throw new Error(message || 'Request failed')
  }
  return data
}

// Show a short message in the corner of the screen, e.g. toast('Order shipped')
export function toast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('wms:toast', { detail: { message, type } }))
}

// Loads data from the API. Returns [data, reload, loading]
export function useData(path, initial = []) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const reload = () =>
    api(path)
      .then(setData)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  useEffect(() => { reload() }, [path])
  return [data, reload, loading]
}

// Runs an API call, remembers the error, and calls onSuccess when it works. Returns [run, error]
export function useAction(onSuccess) {
  const [error, setError] = useState('')
  const run = async (fn) => {
    setError('')
    try {
      await fn()
      window.dispatchEvent(new Event('wms:changed')) // lets the sidebar refresh its counts
      if (onSuccess) onSuccess()
    } catch (e) {
      setError(e.message)
    }
  }
  return [run, error]
}

// Indian rupees with Indian digit grouping, e.g. ₹1,25,000.00
export const money = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const number = (n) => Number(n || 0).toLocaleString('en-IN')

// Short rupee amounts for tiles and chart axes: ₹950, ₹12.4K, ₹7.9L, ₹1.3Cr
export function compactMoney(n) {
  const value = Number(n || 0)
  if (value >= 1e7) return '₹' + (value / 1e7).toFixed(1).replace('.0', '') + 'Cr'
  if (value >= 1e5) return '₹' + (value / 1e5).toFixed(1).replace('.0', '') + 'L'
  if (value >= 1e3) return '₹' + (value / 1e3).toFixed(1).replace('.0', '') + 'K'
  return '₹' + Math.round(value)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-21" -> "21 Oct"
export function shortDate(day) {
  const date = new Date(day + 'T00:00:00')
  return date.getDate() + ' ' + MONTHS[date.getMonth()]
}

// e.g. PO-0007
export const orderNo = (prefix, id) => prefix + '-' + String(id).padStart(4, '0')

// SQLite stores UTC times like "2026-10-21 17:36:00"; show them in local time
export function formatTime(value) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T') + 'Z')
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
