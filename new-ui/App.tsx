import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '@/pages/(auth)/Login'
import Signup from '@/pages/(auth)/Signup'
import Feed from '@/pages/(main)/Feed'
import CreatePost from '@/pages/(main)/CreatePost'
import Profile from '@/pages/(main)/Profile'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Feed />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-post"
        element={
          <ProtectedRoute>
            <Layout>
              <CreatePost />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:username"
        element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Redirect unknown routes to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
