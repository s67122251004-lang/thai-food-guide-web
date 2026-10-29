import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCs_HYKp1dmQnMQQ34l3gUz7lKipIx2fxs',
  authDomain: 'thai-food-guideselect.firebaseapp.com',
  databaseURL:
    'https://thai-food-guideselect-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'thai-food-guideselect',
  storageBucket: 'thai-food-guideselect.firebasestorage.app',
  messagingSenderId: '446633577706',
  appId: '1:446633577706:web:42e0b4590d74ce856bdb93',
  measurementId: 'G-4D64566Z98',
}

const app = initializeApp(firebaseConfig)

export const database = getDatabase(app)
export const auth = getAuth(app)