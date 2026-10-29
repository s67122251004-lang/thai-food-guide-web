
import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { database } from './services/firebase'
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

function App() {
  const [restaurants, setRestaurants] = useState([])
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('All')
  const [category, setCategory] = useState('All')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const restaurantsRef = ref(database, 'restaurants')

    const unsubscribe = onValue(
      restaurantsRef,
      (snapshot) => {
        const data = snapshot.val()

        const restaurantList = data
          ? Object.entries(data).map(([key, value]) => ({
              id: value.id || key,
              ...value,
            }))
          : []

        setRestaurants(restaurantList)
        setLoading(false)
        setError('')
      },
      (firebaseError) => {
        console.error('Firebase error:', firebaseError)
        setError(
          'ไม่สามารถโหลดข้อมูลร้านอาหารได้ กรุณาตรวจสอบการเชื่อมต่อและสิทธิ์ Firebase Database',
        )
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const countries = useMemo(
    () => [...new Set(restaurants.map((r) => r.country).filter(Boolean))].sort(),
    [restaurants],
  )

  const categories = useMemo(
    () => [...new Set(restaurants.map((r) => r.category).filter(Boolean))].sort(),
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

        <span className="header-note">Discover Thai Flavors Worldwide</span>
      </header>

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
                onClick={() => setSelectedRestaurant(restaurant)}
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
    </main>
  )
}

export default App
