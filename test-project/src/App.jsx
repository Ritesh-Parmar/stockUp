import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/DashboardLayout'

// Pages
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ConfigurePage from './pages/ConfigurePage'
import StatusPage from './pages/StatusPage'
import AmountPage from './pages/AmountPage'
import AlgoPage from './pages/AlgoPage'
import PreviewPage from './pages/PreviewPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Root → dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Public login page */}
            <Route path="/login" element={<LoginPage />} />

            {/*
              Dashboard shell — DashboardLayout (sidebar + topbar) is ALWAYS
              visible at /dashboard/* regardless of auth status.
              Individual child routes apply ProtectedRoute as needed.
              /dashboard/preview is intentionally public (testing shortcut).
            */}
            <Route path="/dashboard" element={<DashboardLayout />}>

              {/* Protected routes — require login */}
              <Route index element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              <Route path="algo"      element={<ProtectedRoute><AlgoPage /></ProtectedRoute>} />
              <Route path="configure" element={<ProtectedRoute><ConfigurePage /></ProtectedRoute>} />
              <Route path="status"    element={<ProtectedRoute><StatusPage /></ProtectedRoute>} />
              <Route path="amount"    element={<ProtectedRoute><AmountPage /></ProtectedRoute>} />

              {/* Public — no login required (demo / UI testing) */}
              <Route path="preview" element={<PreviewPage />} />

            </Route>

            {/* 404 catch-all */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App