import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { onValue, ref } from 'firebase/database'
import { auth, database } from './services/firebase'
import './App.css'

function getRestaurantPictureSrc(picture) {
  if (!picture) return ''

  if (/^(https?:|data:|blob:)/i.test(picture) || picture.startsWith('/')) {
    return picture
  }

  const imagePath = picture.startsWith('images/')
    ? picture.slice('images/'.length)
    : picture

  return '/images/' + imagePath
}

function getAuthErrorMessage(error) {
  const code = error?.code

  const messages = {
    'auth/email-already-in-use': 'อีเมลนี้มีบัญชีสมาชิกแล้ว กรุณาเข้าสู่ระบบ',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
    'auth/weak-password': 'รหัสผ่านไม่ปลอดภัย กรุณาตั้งรหัสผ่านที่มีอย่างน้อย 6 ตัวอักษร',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้ กรุณาตรวจสอบอีเมลหรือสมัครสมาชิก',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง',
    'auth/too-many-requests': 'มีการลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาตรวจสอบเครือข่าย',
    'auth/operation-not-allowed': 'ระบบสมัครสมาชิกยังไม่เปิดใช้งาน Email/Password ใน Firebase',
    'auth/missing-email': 'กรุณากรอกอีเมล',
    'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  }

  return messages[code] || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
}

function App() {
  const [restaurants, setRestaurants] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('All')
  const [category, setCategory] = useState('All')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [showAuthForm, setShowAuthForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const restaurantsRef = ref(database, 'restaurants')

    const unsubscribe = onValue(
      restaurantsRef,
      (snapshot) => {
        const data = snapshot.val()

        const restaurantList = data
          ? Object.entries(data).map(([key, value]) => ({
              ...value,
              id: value.id || key,
            }))
          : []

        setRestaurants(restaurantList)
        setLoading(false)
        setError('')
      },
      (firebaseError) => {
        console.error('Firebase database error:', firebaseError)
        setError(
          'ไม่สามารถโหลดข้อมูลร้านอาหารได้ กรุณาตรวจสอบการเชื่อมต่อและสิทธิ์ Firebase Database',
        )
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const countries = useMemo(
    () =>
      [...new Set(restaurants.map((restaurant) => restaurant.country).filter(Boolean))].sort(),
    [restaurants],
  )

  const categories = useMemo(
    () =>
      [...new Set(restaurants.map((restaurant) => restaurant.category).filter(Boolean))].sort(),
    [restaurants],
  )

  const filteredRestaurants = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return restaurants.filter((restaurant) => {
      const matchesSearch = [
        restaurant.name,
        restaurant.country,
        restaurant.category,
        ...(Array.isArray(restaurant.signatureMenu)
          ? restaurant.signatureMenu
          : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword)

      const matchesCountry =
        country === 'All' || restaurant.country === country

      const matchesCategory =
        category === 'All' || restaurant.category === category

      return matchesSearch && matchesCountry && matchesCategory
    })
  }, [restaurants, search, country, category])

  function openAuthForm(mode) {
    setAuthMode(mode)
    setShowAuthForm(true)
    setAuthMessage('')
    setAuthError('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  function closeAuthForm() {
    setShowAuthForm(false)
    setAuthMessage('')
    setAuthError('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')

    const cleanEmail = email.trim()

    if (!cleanEmail) {
      setAuthError('กรุณากรอกอีเมล')
      return
    }

    if (authMode === 'register') {
      if (!displayName.trim()) {
        setAuthError('กรุณากรอกชื่อที่ต้องการแสดงบนเว็บไซต์')
        return
      }

      if (password.length < 6) {
        setAuthError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
        return
      }

      if (password !== confirmPassword) {
        setAuthError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
        return
      }
    }

    if (authMode === 'login' && !password) {
      setAuthError('กรุณากรอกรหัสผ่าน')
      return
    }

    setAuthSubmitting(true)

    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        )

        await updateProfile(credential.user, {
          displayName: displayName.trim(),
        })

        setUser(auth.currentUser)
        setAuthMessage('สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ ThaiFoodSelect!')
        setShowAuthForm(false)
        setDisplayName('')
        setEmail('')
        setPassword('')
        setConfirmPassword('')
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, cleanEmail, password)

        setAuthMessage('เข้าสู่ระบบสำเร็จ')
        setShowAuthForm(false)
        setEmail('')
        setPassword('')
      } else if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, cleanEmail)

        setAuthMessage(
          'ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมลของคุณ',
        )
        setAuthMode('login')
        setPassword('')
      }
    } catch (firebaseError) {
      console.error('Authentication error:', firebaseError)
      setAuthError(getAuthErrorMessage(firebaseError))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth)
      setUser(null)
      setAuthMessage('ออกจากระบบเรียบร้อยแล้ว')
      setSelectedRestaurant(null)
      setShowAuthForm(false)
    } catch (firebaseError) {
      console.error('Logout error:', firebaseError)
      setAuthError(getAuthErrorMessage(firebaseError))
    }
  }

  function handleOpenRestaurant(restaurant) {
    setSelectedRestaurant(restaurant)
  }

  return (
    <main className="app">
      <header className="site-header">
        <a
          className="brand"
          href="#home"
          onClick={() => setSelectedRestaurant(null)}
        >
          <span className="brand-icon">🍜</span>
          <span>ThaiFoodSelect</span>
        </a>

        <div className="account-area">
          {authLoading ? (
            <span className="header-note">กำลังตรวจสอบสมาชิก...</span>
          ) : user ? (
            <>
              <span className="member-greeting">
                👋 {user.displayName || user.email}
              </span>
              <button
                className="account-button"
                type="button"
                onClick={handleLogout}
              >
                ออกจากระบบ
              </button>
            </>
          ) : (
            <>
              <button
                className="account-button"
                type="button"
                onClick={() => openAuthForm('login')}
              >
                เข้าสู่ระบบ
              </button>
              <button
                className="account-button account-button-primary"
                type="button"
                onClick={() => openAuthForm('register')}
              >
                สมัครสมาชิก
              </button>
            </>
          )}
        </div>
      </header>

      {authMessage && !showAuthForm && (
        <div className="auth-notice" role="status">
          <span>{authMessage}</span>
          <button
            type="button"
            onClick={() => setAuthMessage('')}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {authError && !showAuthForm && (
        <div className="auth-notice auth-notice-error" role="alert">
          <span>{authError}</span>
          <button
            type="button"
            onClick={() => setAuthError('')}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      <section className="hero-section" id="home">
        <div className="hero-content">
          <span className="eyebrow">A TASTE OF THAILAND</span>
          <h1>
            Find Your Next
            <br />
            <span>Favorite Thai Restaurant.</span>
          </h1>
          <p>
            Explore Thai restaurants, discover signature dishes, and find
            inspiration for your next meal around the world.
          </p>

          <a className="hero-button" href="#restaurants">
            Explore Restaurants <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="hero-illustration" aria-hidden="true">
          <span className="hero-emoji">🍲</span>
          <span className="floating-food food-one">🌶️</span>
          <span className="floating-food food-two">🍋</span>
          <span className="floating-food food-three">🌿</span>
        </div>
      </section>

      <section className="restaurant-section" id="restaurants">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPLORE OUR COLLECTION</span>
            <h2>Thai Restaurants</h2>
            <p>Find delicious Thai food wherever your journey takes you.</p>
          </div>

          <div className="restaurant-count">
            <strong>{restaurants.length}</strong>
            <span>Restaurants</span>
          </div>
        </div>

        <div className="filters">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search restaurants or dishes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search restaurants or dishes"
            />
          </label>

          <label className="filter-label">
            <span>Country</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="All">All countries</option>
              {countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-label">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="All">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="status-message">
            <span className="loading-spinner" />
            <p>Loading restaurants from Firebase...</p>
          </div>
        ) : error ? (
          <div className="status-message error-message">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="status-message">
            <span>🔎</span>
            <p>
              {restaurants.length === 0
                ? 'No restaurant data was found in Firebase.'
                : 'No restaurants match your search. Try another keyword or filter.'}
            </p>
          </div>
        ) : (
          <div className="restaurant-grid">
            {filteredRestaurants.map((restaurant) => (
              <button
                className="restaurant-card"
                key={restaurant.id}
                type="button"
                onClick={() => handleOpenRestaurant(restaurant)}
              >
                <div className="restaurant-image">
                  {restaurant.picture ? (
                    <img
                      src={getRestaurantPictureSrc(restaurant.picture)}
                      alt={restaurant.name}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : null}
                  <span className="image-placeholder" aria-hidden="true">
                    🍜
                  </span>
                  <span className="category-badge">{restaurant.category}</span>
                </div>

                <div className="card-content">
                  <span className="restaurant-country">
                    <span aria-hidden="true">📍</span> {restaurant.country}
                  </span>
                  <h3>{restaurant.name}</h3>
                  <p className="signature-label">Signature dishes</p>
                  <p className="signature-text">
                    {Array.isArray(restaurant.signatureMenu)
                      ? restaurant.signatureMenu.slice(0, 2).join(' · ')
                      : 'Explore this restaurant'}
                  </p>
                  <span className="card-link">View details ↗</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-icon">🍜</span>
          <span>Thai Food Guide</span>
        </a>
        <p>Celebrating Thai cuisine, one restaurant at a time.</p>
      </footer>

      {selectedRestaurant && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedRestaurant(null)}
        >
          <section
            className="restaurant-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setSelectedRestaurant(null)}
              aria-label="Close details"
            >
              ×
            </button>

            <div className="modal-image">
              {selectedRestaurant.picture ? (
                <img
                  src={getRestaurantPictureSrc(selectedRestaurant.picture)}
                  alt={selectedRestaurant.name}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              ) : null}
              <span className="modal-image-placeholder" aria-hidden="true">
                🍲
              </span>
            </div>

            <div className="modal-content">
              <span className="eyebrow">RESTAURANT DETAILS</span>
              <h2 id="modal-title">{selectedRestaurant.name}</h2>
              <p className="modal-meta">
                📍 {selectedRestaurant.country} · {selectedRestaurant.category}
              </p>

              <h3>Signature Menu</h3>
              {Array.isArray(selectedRestaurant.signatureMenu) &&
              selectedRestaurant.signatureMenu.length > 0 ? (
                <ul className="menu-list">
                  {selectedRestaurant.signatureMenu.map((dish, index) => (
                    <li key={dish + '-' + index}>{dish}</li>
                  ))}
                </ul>
              ) : (
                <p>No signature menu available.</p>
              )}

              {Number.isFinite(Number(selectedRestaurant.latitude)) &&
                Number.isFinite(Number(selectedRestaurant.longitude)) && (
                  <div className="coordinates">
                    <strong>Location coordinates</strong>
                    <p>Latitude: {selectedRestaurant.latitude}</p>
                    <p>Longitude: {selectedRestaurant.longitude}</p>
                    <a
                      href={
                        'https://www.google.com/maps?q=' +
                        selectedRestaurant.latitude +
                        ',' +
                        selectedRestaurant.longitude
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Google Maps ↗
                    </a>
                  </div>
                )}
            </div>
          </section>
        </div>
      )}

      {showAuthForm && (
        <div className="modal-backdrop auth-backdrop" onClick={closeAuthForm}>
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={closeAuthForm}
              aria-label="Close form"
            >
              ×
            </button>

            <div className="auth-modal-heading">
              <span className="auth-icon">🍜</span>
              <span className="eyebrow">THAIFOODSELECT MEMBER</span>
              <h2 id="auth-title">
                {authMode === 'register'
                  ? 'Create an Account'
                  : authMode === 'reset'
                    ? 'Reset Password'
                    : 'Welcome Back'}
              </h2>
              <p>
                {authMode === 'register'
                  ? 'Join us and save your favorite Thai restaurants.'
                  : authMode === 'reset'
                    ? 'Enter your email to receive a password reset link.'
                    : 'Sign in to enjoy your member benefits.'}
              </p>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <label className="auth-field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Enter your name"
                    autoComplete="name"
                    maxLength={50}
                    required
                  />
                </label>
              )}

              <label className="auth-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              {authMode !== 'reset' && (
                <label className="auth-field">
                  <span>Password</span>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete={
                        authMode === 'register'
                          ? 'new-password'
                          : 'current-password'
                      }
                      minLength={6}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {authMode === 'register' && (
                <label className="auth-field">
                  <span>Confirm password</span>
                  <div className="password-input-wrap">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Enter your password again"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((value) => !value)
                      }
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {authError && (
                <p className="auth-feedback auth-feedback-error" role="alert">
                  {authError}
                </p>
              )}

              {authMessage && (
                <p className="auth-feedback" role="status">
                  {authMessage}
                </p>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={authSubmitting}
              >
                {authSubmitting
                  ? 'Please wait...'
                  : authMode === 'register'
                    ? 'Create Account'
                    : authMode === 'reset'
                      ? 'Send Reset Link'
                      : 'Sign In'}
              </button>
            </form>

            <div className="auth-switch">
              {authMode === 'login' && (
                <>
                  <button
                    type="button"
                    onClick={() => openAuthForm('reset')}
                  >
                    Forgot password?
                  </button>
                  <p>
                    Don’t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => openAuthForm('register')}
                    >
                      Sign up
                    </button>
                  </p>
                </>
              )}

              {authMode === 'register' && (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => openAuthForm('login')}
                  >
                    Sign in
                  </button>
                </p>
              )}

              {authMode === 'reset' && (
                <p>
                  Remember your password?{' '}
                  <button
                    type="button"
                    onClick={() => openAuthForm('login')}
                  >
                    Back to sign in
                  </button>
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App