import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  onValue,
  ref,
  set,
  remove,
  update,
  push,
  serverTimestamp,
} from 'firebase/database'
import { auth, database } from './services/firebase'
import './App.css'

const COMPLAINT_TYPES = [
  'ข้อมูลร้านอาหารไม่ถูกต้อง',
  'ร้านอาหารปิดให้บริการ',
  'ตำแหน่งร้านอาหารไม่ถูกต้อง',
  'ข้อมูลเมนูอาหารไม่ถูกต้อง',
  'ปัญหาเกี่ยวกับการใช้งานเว็บไซต์',
  'อื่น ๆ',
]

const COMPLAINT_STATUSES = [
  'รอตรวจสอบ',
  'กำลังดำเนินการ',
  'ดำเนินการเสร็จสิ้น',
]

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
  const messages = {
    'auth/email-already-in-use': 'อีเมลนี้มีบัญชีสมาชิกแล้ว กรุณาเข้าสู่ระบบ',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
    'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้ กรุณาตรวจสอบอีเมลหรือสมัครสมาชิก',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง',
    'auth/too-many-requests': 'มีการลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ',
    'auth/operation-not-allowed': 'กรุณาเปิด Email/Password ใน Firebase Authentication',
    'auth/missing-email': 'กรุณากรอกอีเมล',
    'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  }

  return messages[error?.code] || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
}

function formatDate(value) {
  if (!value) return '-'

  const date =
    typeof value === 'number' ? new Date(value) : new Date(value)

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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

  // คะแนนและร้านโปรด
  const [ratings, setRatings] = useState({})
  const [favorites, setFavorites] = useState({})
  const [ratingLoading, setRatingLoading] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState({})
  const [featureMessage, setFeatureMessage] = useState('')
  const [featureError, setFeatureError] = useState('')

  // สิทธิ์แอดมิน
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminLoading, setAdminLoading] = useState(true)

  // ระบบร้องเรียน
  const [showComplaintForm, setShowComplaintForm] = useState(false)
  const [showComplaintManagement, setShowComplaintManagement] =
    useState(false)
  const [showMyComplaints, setShowMyComplaints] = useState(false)

  const [complaintRestaurant, setComplaintRestaurant] = useState(null)
  const [complaintType, setComplaintType] = useState(COMPLAINT_TYPES[0])
  const [complaintDescription, setComplaintDescription] = useState('')
  const [complaintSubmitting, setComplaintSubmitting] = useState(false)
  const [complaintMessage, setComplaintMessage] = useState('')
  const [complaintError, setComplaintError] = useState('')

  const [complaints, setComplaints] = useState({})
  const [complaintsLoading, setComplaintsLoading] = useState(false)
  const [complaintStatusFilter, setComplaintStatusFilter] = useState('ทั้งหมด')
  const [complaintSearch, setComplaintSearch] = useState('')
  const [updatingComplaintId, setUpdatingComplaintId] = useState('')

  // ตรวจสอบสถานะสมาชิก
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setFavorites({})
      setIsAdmin(false)
      setAdminLoading(Boolean(currentUser))
      setComplaints({})
      setComplaintsLoading(Boolean(currentUser))
      setAuthLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // โหลดข้อมูลร้านอาหาร
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
        console.error('Firebase restaurant error:', firebaseError)
        setError(
          'ไม่สามารถโหลดข้อมูลร้านอาหารได้ กรุณาตรวจสอบ Firebase Database',
        )
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  // โหลดคะแนนทั้งหมดเพื่อคำนวณคะแนนเฉลี่ย
  useEffect(() => {
    const ratingsRef = ref(database, 'ratings')

    const unsubscribe = onValue(
      ratingsRef,
      (snapshot) => {
        setRatings(snapshot.val() || {})
      },
      (firebaseError) => {
        console.error('Firebase ratings error:', firebaseError)
        setFeatureError('ไม่สามารถโหลดคะแนนร้านอาหารได้ กรุณาตรวจสอบ Firebase Rules')
      },
    )

    return () => unsubscribe()
  }, [])

  // โหลดร้านโปรดของสมาชิก
  useEffect(() => {
    if (!user) return

    const favoritesRef = ref(database, `favorites/${user.uid}`)

    const unsubscribe = onValue(
      favoritesRef,
      (snapshot) => setFavorites(snapshot.val() || {}),
      (firebaseError) => {
        console.error('Firebase favorites error:', firebaseError)
        setFeatureError('ไม่สามารถโหลดรายการร้านโปรดได้ กรุณาตรวจสอบ Firebase Rules')
      },
    )

    return () => unsubscribe()
  }, [user])

  // ตรวจสอบสิทธิ์แอดมินจาก UID ใน Firebase
  useEffect(() => {
    if (!user) return

    const adminRef = ref(database, `admins/${user.uid}`)

    const unsubscribe = onValue(
      adminRef,
      (snapshot) => {
        setIsAdmin(snapshot.val() === true)
        setComplaintsLoading(true)
        setAdminLoading(false)
      },
      (firebaseError) => {
        console.error('Firebase admin error:', firebaseError)
        setIsAdmin(false)
        setComplaintsLoading(true)
        setAdminLoading(false)
      },
    )

    return () => unsubscribe()
  }, [user])

  // โหลดเรื่องร้องเรียนตามสิทธิ์
  useEffect(() => {
    if (!user) return

    if (adminLoading) return

    // แอดมินอ่านทั้งหมด ส่วนสมาชิกอ่านเฉพาะของตนเอง
    const complaintsPath = isAdmin
      ? 'complaints'
      : `complaints/${user.uid}`

    const complaintsRef = ref(database, complaintsPath)

    const unsubscribe = onValue(
      complaintsRef,
      (snapshot) => {
        setComplaints(snapshot.val() || {})
        setComplaintsLoading(false)
        setComplaintError('')
      },
      (firebaseError) => {
        console.error('Firebase complaints error:', firebaseError)
        setComplaints({})
        setComplaintsLoading(false)
        setComplaintError(
          'โหลดเรื่องร้องเรียนไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules',
        )
      },
    )

    return () => unsubscribe()
  }, [user, isAdmin, adminLoading])

  // สร้างรายการประเทศ
  const countries = useMemo(
    () =>
      [
        ...new Set(
          restaurants.map((restaurant) => restaurant.country).filter(Boolean),
        ),
      ].sort(),
    [restaurants],
  )

  // สร้างรายการหมวดหมู่
  const categories = useMemo(
    () =>
      [
        ...new Set(
          restaurants.map((restaurant) => restaurant.category).filter(Boolean),
        ),
      ].sort(),
    [restaurants],
  )

  // ค้นหาและกรองร้านอาหาร
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

  // คำนวณคะแนนเฉลี่ย
  function getRatingSummary(restaurantId) {
    const restaurantRatings = ratings[restaurantId]

    if (!restaurantRatings || typeof restaurantRatings !== 'object') {
      return { average: 0, count: 0 }
    }

    const scores = Object.values(restaurantRatings)
      .map((rating) =>
        typeof rating === 'object' && rating !== null
          ? Number(rating.score)
          : Number(rating),
      )
      .filter((score) => Number.isInteger(score) && score >= 1 && score <= 5)

    if (scores.length === 0) return { average: 0, count: 0 }

    return {
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      count: scores.length,
    }
  }

  // คะแนนของสมาชิกปัจจุบัน
  function getMyRating(restaurantId) {
    if (!user) return 0

    const rating = ratings[restaurantId]?.[user.uid]
    if (rating === undefined || rating === null) return 0

    const score =
      typeof rating === 'object' ? Number(rating.score) : Number(rating)

    return Number.isInteger(score) && score >= 1 && score <= 5 ? score : 0
  }

  // เปิดหน้าสมัครสมาชิกหรือเข้าสู่ระบบ
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

  // สมัครสมาชิก เข้าสู่ระบบ และรีเซ็ตรหัสผ่าน
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

        setAuthMessage('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล')
        setShowAuthForm(false)
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

  // ออกจากระบบ
  async function handleLogout() {
    try {
      await signOut(auth)
      setSelectedRestaurant(null)
      setShowAuthForm(false)
      setShowComplaintForm(false)
      setShowComplaintManagement(false)
      setShowMyComplaints(false)
      setAuthMessage('ออกจากระบบเรียบร้อยแล้ว')
    } catch (firebaseError) {
      console.error('Logout error:', firebaseError)
      setAuthError(getAuthErrorMessage(firebaseError))
    }
  }

  // เปิดรายละเอียดร้านอาหาร
  function handleOpenRestaurant(restaurant) {
    setSelectedRestaurant(restaurant)
    setFeatureMessage('')
    setFeatureError('')
  }

  // ให้คะแนนร้านอาหาร
  async function handleRateRestaurant(restaurantId, score) {
    setFeatureMessage('')
    setFeatureError('')

    if (!user) {
      openAuthForm('login')
      setAuthMessage('กรุณาเข้าสู่ระบบก่อนให้คะแนนร้านอาหาร')
      return
    }

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      setFeatureError('คะแนนต้องอยู่ระหว่าง 1–5 ดาว')
      return
    }

    setRatingLoading(true)

    try {
      await set(ref(database, `ratings/${restaurantId}/${user.uid}`), {
        score,
        updatedAt: serverTimestamp(),
      })

      setFeatureMessage('บันทึกคะแนนของคุณเรียบร้อยแล้ว ⭐')
    } catch (firebaseError) {
      console.error('Save rating error:', firebaseError)
      setFeatureError('บันทึกคะแนนไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules')
    } finally {
      setRatingLoading(false)
    }
  }

  // เพิ่มหรือนำร้านออกจากรายการโปรด
  async function handleToggleFavorite(restaurant) {
    setFeatureMessage('')
    setFeatureError('')

    if (!user) {
      openAuthForm('login')
      setAuthMessage('กรุณาเข้าสู่ระบบก่อนเพิ่มร้านโปรด')
      return
    }

    const restaurantId = restaurant.id
    const isFavorite = Boolean(favorites[restaurantId])

    setFavoriteLoading((previous) => ({
      ...previous,
      [restaurantId]: true,
    }))

    try {
      const favoriteRef = ref(
        database,
        `favorites/${user.uid}/${restaurantId}`,
      )

      if (isFavorite) {
        await remove(favoriteRef)
        setFeatureMessage('นำร้านออกจากรายการโปรดแล้ว')
      } else {
        await set(favoriteRef, {
          restaurantId,
          name: restaurant.name || '',
          addedAt: serverTimestamp(),
        })

        setFeatureMessage('เพิ่มร้านลงในรายการโปรดแล้ว ❤️')
      }
    } catch (firebaseError) {
      console.error('Toggle favorite error:', firebaseError)
      setFeatureError('บันทึกร้านโปรดไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules')
    } finally {
      setFavoriteLoading((previous) => ({
        ...previous,
        [restaurantId]: false,
      }))
    }
  }

  // เปิดแบบฟอร์มร้องเรียน
  function openComplaintForm(restaurant = null) {
    if (!user) {
      openAuthForm('login')
      setAuthMessage('กรุณาเข้าสู่ระบบก่อนส่งเรื่องร้องเรียน')
      return
    }

    setComplaintRestaurant(restaurant)
    setComplaintType(COMPLAINT_TYPES[0])
    setComplaintDescription('')
    setComplaintError('')
    setComplaintMessage('')
    setShowComplaintForm(true)
  }

  // ส่งเรื่องร้องเรียน
  async function handleSubmitComplaint(event) {
    event.preventDefault()
    setComplaintMessage('')
    setComplaintError('')

    if (!user) {
      setComplaintError('กรุณาเข้าสู่ระบบก่อนส่งเรื่องร้องเรียน')
      return
    }

    if (!complaintDescription.trim()) {
      setComplaintError('กรุณากรอกรายละเอียดเรื่องร้องเรียน')
      return
    }

    if (complaintDescription.trim().length < 10) {
      setComplaintError('กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร')
      return
    }

    setComplaintSubmitting(true)

    try {
      const complaintRef = push(
        ref(database, `complaints/${user.uid}`),
      )

      await set(complaintRef, {
        complaintId: complaintRef.key,
        userId: user.uid,
        userName: user.displayName || '',
        userEmail: user.email || '',
        restaurantId: complaintRestaurant?.id || '',
        restaurantName: complaintRestaurant?.name || '',
        type: complaintType,
        description: complaintDescription.trim(),
        status: 'รอตรวจสอบ',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setComplaintMessage('ส่งเรื่องร้องเรียนเรียบร้อยแล้ว')
      setComplaintDescription('')
      setShowComplaintForm(false)
      setShowMyComplaints(true)
    } catch (firebaseError) {
      console.error('Submit complaint error:', firebaseError)
      setComplaintError(
        'ส่งเรื่องร้องเรียนไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules',
      )
    } finally {
      setComplaintSubmitting(false)
    }
  }

  // แปลงข้อมูลเรื่องร้องเรียนเป็นรายการสำหรับแสดงผล
  const complaintList = useMemo(() => {
    const result = []

    Object.entries(complaints || {}).forEach(([uid, userComplaints]) => {
      if (!userComplaints || typeof userComplaints !== 'object') return

      Object.entries(userComplaints).forEach(([complaintId, item]) => {
        if (!item || typeof item !== 'object') return

        result.push({
          ...item,
          complaintId: item.complaintId || complaintId,
          ownerUid: uid,
        })
      })
    })

    return result.sort((a, b) => {
      const timeA = Number(a.createdAt) || 0
      const timeB = Number(b.createdAt) || 0
      return timeB - timeA
    })
  }, [complaints])

  const filteredComplaints = useMemo(() => {
    const keyword = complaintSearch.trim().toLowerCase()

    return complaintList.filter((item) => {
      const matchesStatus =
        complaintStatusFilter === 'ทั้งหมด' ||
        item.status === complaintStatusFilter

      const matchesKeyword = [
        item.complaintId,
        item.userName,
        item.userEmail,
        item.restaurantName,
        item.type,
        item.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword)

      return matchesStatus && matchesKeyword
    })
  }, [complaintList, complaintStatusFilter, complaintSearch])

  // แอดมินเปลี่ยนสถานะเรื่องร้องเรียน
  async function handleUpdateComplaintStatus(
    complaintUserId,
    complaintId,
    status,
  ) {
    if (!isAdmin) {
      setComplaintError('คุณไม่มีสิทธิ์จัดการเรื่องร้องเรียน')
      return
    }

    if (!COMPLAINT_STATUSES.includes(status)) {
      setComplaintError('สถานะเรื่องร้องเรียนไม่ถูกต้อง')
      return
    }

    const loadingKey = `${complaintUserId}/${complaintId}`
    setUpdatingComplaintId(loadingKey)
    setComplaintError('')
    setComplaintMessage('')

    try {
      await update(
        ref(
          database,
          `complaints/${complaintUserId}/${complaintId}`,
        ),
        {
          status,
          updatedAt: serverTimestamp(),
        },
      )

      setComplaintMessage('อัปเดตสถานะเรื่องร้องเรียนเรียบร้อยแล้ว')
    } catch (firebaseError) {
      console.error('Update complaint error:', firebaseError)
      setComplaintError(
        'อัปเดตสถานะไม่สำเร็จ กรุณาตรวจสอบสิทธิ์แอดมินและ Firebase Rules',
      )
    } finally {
      setUpdatingComplaintId('')
    }
  }

  return (
    <main className="app">
      <header className="site-header">
        <a
          className="brand"
          href="#home"
          onClick={() => {
            setSelectedRestaurant(null)
            setShowComplaintManagement(false)
            setShowMyComplaints(false)
          }}
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

              {adminLoading ? (
                <span className="header-note">กำลังตรวจสอบสิทธิ์...</span>
              ) : isAdmin ? (
                <button
                  className="account-button account-button-primary"
                  type="button"
                  onClick={() => {
                    setShowComplaintManagement(true)
                    setShowMyComplaints(false)
                    setSelectedRestaurant(null)
                  }}
                >
                  🛡️ จัดการเรื่องร้องเรียน
                </button>
              ) : (
                <button
                  className="account-button"
                  type="button"
                  onClick={() => {
                    setShowMyComplaints(true)
                    setShowComplaintManagement(false)
                    setSelectedRestaurant(null)
                  }}
                >
                  📋 เรื่องร้องเรียนของฉัน
                </button>
              )}

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

      {complaintMessage && (
        <div className="auth-notice" role="status">
          <span>{complaintMessage}</span>
          <button
            type="button"
            onClick={() => setComplaintMessage('')}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {complaintError && (
        <div className="auth-notice auth-notice-error" role="alert">
          <span>{complaintError}</span>
          <button
            type="button"
            onClick={() => setComplaintError('')}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {showComplaintManagement || showMyComplaints ? (
        <section className="restaurant-section complaint-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {showComplaintManagement ? 'ADMIN DASHBOARD' : 'MEMBER AREA'}
              </span>
              <h2>
                {showComplaintManagement
                  ? 'จัดการเรื่องร้องเรียน'
                  : 'เรื่องร้องเรียนของฉัน'}
              </h2>
              <p>
                {showComplaintManagement
                  ? 'ตรวจสอบรายละเอียดและอัปเดตสถานะเรื่องร้องเรียน'
                  : 'ตรวจสอบรายการและสถานะเรื่องร้องเรียนที่คุณส่ง'}
              </p>
            </div>

            <button
              className="account-button"
              type="button"
              onClick={() => {
                setShowComplaintManagement(false)
                setShowMyComplaints(false)
              }}
            >
              ← กลับหน้าร้านอาหาร
            </button>
          </div>

          {showComplaintManagement && !isAdmin ? (
            <div className="status-message error-message">
              <span>🔒</span>
              <p>คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการเรื่องร้องเรียน</p>
            </div>
          ) : complaintsLoading ? (
            <div className="status-message">
              <span className="loading-spinner" />
              <p>กำลังโหลดเรื่องร้องเรียน...</p>
            </div>
          ) : (
            <>
              <div className="filters">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="ค้นหาเรื่องร้องเรียน..."
                    value={complaintSearch}
                    onChange={(event) => setComplaintSearch(event.target.value)}
                  />
                </label>

                <label className="filter-label">
                  <span>สถานะ</span>
                  <select
                    value={complaintStatusFilter}
                    onChange={(event) =>
                      setComplaintStatusFilter(event.target.value)
                    }
                  >
                    <option value="ทั้งหมด">ทุกสถานะ</option>
                    {COMPLAINT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p>
                จำนวนรายการที่แสดง: <strong>{filteredComplaints.length}</strong>
              </p>

              {filteredComplaints.length === 0 ? (
                <div className="status-message">
                  <span>📋</span>
                  <p>ไม่พบเรื่องร้องเรียน</p>
                </div>
              ) : (
                <div className="complaint-list">
                  {filteredComplaints.map((item) => {
                    const loadingKey = `${item.ownerUid}/${item.complaintId}`

                    return (
                      <article
                        className="complaint-card"
                        key={loadingKey}
                        style={{
                          background: '#fff',
                          border: '1px solid #eadfd8',
                          borderRadius: '16px',
                          padding: '20px',
                          marginBottom: '16px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <h3>เรื่องร้องเรียน #{item.complaintId}</h3>
                          <strong>{item.status || 'รอตรวจสอบ'}</strong>
                        </div>

                        <p>
                          <strong>ประเภท:</strong> {item.type || '-'}
                        </p>

                        <p>
                          <strong>ร้านอาหาร:</strong>{' '}
                          {item.restaurantName || 'ไม่ได้ระบุร้านอาหาร'}
                        </p>

                        {showComplaintManagement && (
                          <>
                            <p>
                              <strong>ผู้ร้องเรียน:</strong>{' '}
                              {item.userName || '-'}
                            </p>
                            <p>
                              <strong>อีเมล:</strong> {item.userEmail || '-'}
                            </p>
                          </>
                        )}

                        <p>
                          <strong>รายละเอียด:</strong>
                        </p>

                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {item.description || '-'}
                        </p>

                        <p>
                          <strong>วันที่ส่ง:</strong>{' '}
                          {formatDate(item.createdAt)}
                        </p>

                        <p>
                          <strong>อัปเดตล่าสุด:</strong>{' '}
                          {formatDate(item.updatedAt)}
                        </p>

                        {showComplaintManagement && isAdmin && (
                          <label
                            className="filter-label"
                            style={{ display: 'block', marginTop: '16px' }}
                          >
                            <span>เปลี่ยนสถานะ</span>
                            <select
                              value={item.status || 'รอตรวจสอบ'}
                              disabled={updatingComplaintId === loadingKey}
                              onChange={(event) =>
                                handleUpdateComplaintStatus(
                                  item.ownerUid,
                                  item.complaintId,
                                  event.target.value,
                                )
                              }
                            >
                              {COMPLAINT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {updatingComplaintId === loadingKey && (
                          <p>กำลังอัปเดตสถานะ...</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
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

            {featureMessage && !selectedRestaurant && (
              <div className="auth-notice" role="status">
                <span>{featureMessage}</span>
                <button
                  type="button"
                  onClick={() => setFeatureMessage('')}
                  aria-label="ปิดข้อความ"
                >
                  ×
                </button>
              </div>
            )}

            {featureError && !selectedRestaurant && (
              <div className="auth-notice auth-notice-error" role="alert">
                <span>{featureError}</span>
                <button
                  type="button"
                  onClick={() => setFeatureError('')}
                  aria-label="ปิดข้อความ"
                >
                  ×
                </button>
              </div>
            )}

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
                {filteredRestaurants.map((restaurant) => {
                  const summary = getRatingSummary(restaurant.id)
                  const isFavorite = Boolean(favorites[restaurant.id])

                  return (
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

                        <span className="category-badge">
                          {restaurant.category}
                        </span>

                        {isFavorite && (
                          <span
                            className="favorite-card-badge"
                            aria-label="ร้านโปรด"
                            title="ร้านโปรด"
                          >
                            ❤️
                          </span>
                        )}
                      </div>

                      <div className="card-content">
                        <span className="restaurant-country">
                          <span aria-hidden="true">📍</span>{' '}
                          {restaurant.country}
                        </span>

                        <h3>{restaurant.name}</h3>

                        <div className="rating-summary">
                          <span className="rating-summary-stars">
                            {'★'.repeat(Math.round(summary.average))}
                            {'☆'.repeat(5 - Math.round(summary.average))}
                          </span>
                          <span>
                            {summary.count > 0
                              ? `${summary.average.toFixed(1)} (${summary.count})`
                              : 'ยังไม่มีคะแนน'}
                          </span>
                        </div>

                        <p className="signature-label">Signature dishes</p>
                        <p className="signature-text">
                          {Array.isArray(restaurant.signatureMenu)
                            ? restaurant.signatureMenu.slice(0, 2).join(' · ')
                            : 'Explore this restaurant'}
                        </p>

                        <span className="card-link">View details ↗</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="site-footer">
        <a
          className="brand footer-brand"
          href="#home"
          onClick={() => {
            setShowComplaintManagement(false)
            setShowMyComplaints(false)
          }}
        >
          <span className="brand-icon">🍜</span>
          <span>Thai Food Guide</span>
        </a>
        <p>Celebrating Thai cuisine, one restaurant at a time.</p>
        <button
          className="account-button"
          type="button"
          onClick={() => openComplaintForm(null)}
        >
          แจ้งปัญหาการใช้งานเว็บไซต์
        </button>
      </footer>

      {/* รายละเอียดร้านอาหาร */}
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
                📍 {selectedRestaurant.country} ·{' '}
                {selectedRestaurant.category}
              </p>

              <div className="rating-panel">
                <h3>Restaurant Rating</h3>

                {(() => {
                  const summary = getRatingSummary(selectedRestaurant.id)

                  return (
                    <>
                      <div className="rating-average">
                        <span className="rating-average-number">
                          {summary.count > 0
                            ? summary.average.toFixed(1)
                            : '—'}
                        </span>
                        <span className="rating-average-stars">
                          {'★'.repeat(Math.round(summary.average))}
                          {'☆'.repeat(5 - Math.round(summary.average))}
                        </span>
                      </div>
                      <p className="rating-count">
                        {summary.count > 0
                          ? `${summary.count} rating${summary.count > 1 ? 's' : ''}`
                          : 'ยังไม่มีสมาชิกให้คะแนนร้านนี้'}
                      </p>
                    </>
                  )
                })()}

                <div className="my-rating">
                  <p>
                    {user
                      ? getMyRating(selectedRestaurant.id) > 0
                        ? `คะแนนของคุณ: ${getMyRating(selectedRestaurant.id)} ดาว`
                        : 'คุณยังไม่ได้ให้คะแนนร้านนี้'
                      : 'เข้าสู่ระบบเพื่อให้คะแนนร้านนี้'}
                  </p>

                  <div
                    className="rating-buttons"
                    role="group"
                    aria-label="ให้คะแนนร้านอาหารตั้งแต่ 1 ถึง 5 ดาว"
                  >
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        className={`rating-star-button ${
                          score <= getMyRating(selectedRestaurant.id)
                            ? 'rating-star-selected'
                            : ''
                        }`}
                        key={score}
                        type="button"
                        aria-label={`ให้คะแนน ${score} ดาว`}
                        title={`${score} ดาว`}
                        disabled={ratingLoading}
                        onClick={() =>
                          handleRateRestaurant(selectedRestaurant.id, score)
                        }
                      >
                        {score <= getMyRating(selectedRestaurant.id) ? '★' : '☆'}
                      </button>
                    ))}
                  </div>

                  {ratingLoading && (
                    <p className="feature-loading">กำลังบันทึกคะแนน...</p>
                  )}
                </div>
              </div>

              <button
                className={`favorite-toggle-button ${
                  favorites[selectedRestaurant.id] ? 'favorite-active' : ''
                }`}
                type="button"
                disabled={Boolean(favoriteLoading[selectedRestaurant.id])}
                onClick={() => handleToggleFavorite(selectedRestaurant)}
              >
                {favoriteLoading[selectedRestaurant.id]
                  ? 'กำลังบันทึก...'
                  : favorites[selectedRestaurant.id]
                    ? '❤️ นำออกจากร้านโปรด'
                    : '♡ เพิ่มลงในร้านโปรด'}
              </button>

              <button
                className="account-button"
                type="button"
                style={{ marginTop: '10px' }}
                onClick={() => openComplaintForm(selectedRestaurant)}
              >
                🚩 ร้องเรียนร้านอาหารนี้
              </button>

              {featureMessage && (
                <p className="feature-feedback" role="status">
                  {featureMessage}
                </p>
              )}

              {featureError && (
                <p
                  className="feature-feedback feature-feedback-error"
                  role="alert"
                >
                  {featureError}
                </p>
              )}

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

      {/* แบบฟอร์มร้องเรียน */}
      {showComplaintForm && (
        <div
          className="modal-backdrop"
          onClick={() => setShowComplaintForm(false)}
        >
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setShowComplaintForm(false)}
              aria-label="ปิดแบบฟอร์ม"
            >
              ×
            </button>

            <div className="auth-modal-heading">
              <span className="auth-icon">📝</span>
              <span className="eyebrow">CUSTOMER SUPPORT</span>
              <h2 id="complaint-title">ส่งเรื่องร้องเรียน</h2>
              <p>
                {complaintRestaurant
                  ? `ร้านอาหาร: ${complaintRestaurant.name}`
                  : 'แจ้งปัญหาการใช้งานเว็บไซต์'}
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmitComplaint}>
              <label className="auth-field">
                <span>ประเภทเรื่องร้องเรียน</span>
                <select
                  value={complaintType}
                  onChange={(event) => setComplaintType(event.target.value)}
                  required
                >
                  {COMPLAINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="auth-field">
                <span>รายละเอียด</span>
                <textarea
                  value={complaintDescription}
                  onChange={(event) =>
                    setComplaintDescription(event.target.value)
                  }
                  placeholder="อธิบายปัญหาที่พบอย่างน้อย 10 ตัวอักษร"
                  rows={5}
                  minLength={10}
                  maxLength={2000}
                  required
                />
              </label>

              <p>
                ผู้ส่ง: {user?.displayName || user?.email || 'สมาชิก'}
              </p>

              {complaintError && (
                <p className="auth-feedback auth-feedback-error" role="alert">
                  {complaintError}
                </p>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={complaintSubmitting}
              >
                {complaintSubmitting ? 'กำลังส่ง...' : 'ส่งเรื่องร้องเรียน'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* หน้าสมัครสมาชิก เข้าสู่ระบบ และรีเซ็ตรหัสผ่าน */}
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