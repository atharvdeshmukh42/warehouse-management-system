import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react'
import { api, saveToken } from '../api.js'
import { BoxBuddy, ErrorText, Logo } from '../components.jsx'

const TAGLINES = [
  'Never sell the same box twice.',
  'Every movement, on the record.',
  'Low stock? You will hear it first.',
  'Four warehouses, one calm dashboard.',
  'From purchase order to doorstep.',
]

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning! The boxes are wide awake.'
  if (hour < 17) return 'Good afternoon! Plenty of orders to move.'
  return 'Good evening! The boxes missed you.'
}

// Boxes riding a conveyor belt
function Conveyor() {
  return (
    <div className="conveyor" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((n) => (
        <div key={n} className={'parcel parcel-' + n} style={{ animationDelay: n * -2.4 + 's' }}>
          <span />
        </div>
      ))}
      <div className="belt" />
    </div>
  )
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [error, setError] = useState('')
  const [shakes, setShakes] = useState(0)
  const [loading, setLoading] = useState(false)
  const [happy, setHappy] = useState(false)
  const [tagline, setTagline] = useState(0)

  // Change the tagline every few seconds
  useEffect(() => {
    const timer = setInterval(() => setTagline((n) => (n + 1) % TAGLINES.length), 3200)
    return () => clearInterval(timer)
  }, [])

  let mood = 'idle'
  if (happy) mood = 'happy'
  else if (passwordFocused && !showPassword) mood = 'shy'
  else if (error) mood = 'sad'

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api('/login', 'POST', { username, password })
      saveToken(data.token)
      setHappy(true)
      setTimeout(() => onLogin({ username: data.username }), 650) // a moment to see the smile
    } catch (err) {
      setError(err.message)
      setShakes(shakes + 1) // re-creates the form to replay the shake; focus returns to username
      setPasswordFocused(false)
      setLoading(false)
    }
  }

  return (
    <div className="login-split">
      <section className="login-art">
        <div className="login-brand">
          <Logo size={38} />
          <span>Warehouse Manager</span>
        </div>

        <div className="login-art-middle">
          <Conveyor />
          <h2>Every box,<br />in its place.</h2>
          <p key={tagline} className="tagline">{TAGLINES[tagline]}</p>
        </div>

        <div className="login-art-foot">Inventory · Purchasing · Orders</div>
      </section>

      <section className="login-side">
        <form key={shakes} className={shakes ? 'login-card shake' : 'login-card'} onSubmit={submit}>
          <BoxBuddy mood={mood} look={Math.min(username.length, 16) / 16} />
          <div>
            <h1>Welcome back!</h1>
            <p className="muted">{greeting()}</p>
          </div>

          <ErrorText error={error && `${error}. Give it another go!`} />

          <label className="field">
            <span className="field-label">Username</span>
            <div className="input-icon">
              <User size={16} />
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" autoFocus required />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="input-icon">
              <Lock size={16} />
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                autoComplete="current-password" required />
              <button type="button" className="icon-button reveal" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <button className="login-button" disabled={loading}>
            {happy ? 'Here we go!' : loading ? 'Checking…' : <>Let's go <ArrowRight size={16} /></>}
          </button>
        </form>
      </section>
    </div>
  )
}
