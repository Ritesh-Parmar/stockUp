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
import ChooseAlgoPage from './pages/ChooseAlgoPage'
import AlgoDetailPage from './pages/AlgoDetailPage'
import InstrumentDiffPage from './pages/InstrumentDiffPage'
import ActivityLogPage from './pages/ActivityLogPage'
import LiveTradingPage from './pages/LiveTradingPage'
import PlansPage from './pages/PlansPage'
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
              Every child route requires login; sign in with the demo account
              (123/123/123) to see them without a real OTP.
            */}
            <Route path="/dashboard" element={<DashboardLayout />}>

              {/* Protected routes — require login */}
              <Route index element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              {/* Algo flow: pick a strategy, then Configure / Start Algo live
                  under it — both only mean something once one is chosen. */}
              <Route path="choose-algo" element={<ProtectedRoute><ChooseAlgoPage /></ProtectedRoute>} />
              <Route path="choose-algo/:algoId" element={<ProtectedRoute><AlgoDetailPage /></ProtectedRoute>} />
              <Route path="choose-algo/:algoId/configure" element={<ProtectedRoute><ConfigurePage /></ProtectedRoute>} />
              <Route path="status"    element={<ProtectedRoute><StatusPage /></ProtectedRoute>} />
              <Route path="amount"    element={<ProtectedRoute><AmountPage /></ProtectedRoute>} />
              <Route path="instruments" element={<ProtectedRoute><InstrumentDiffPage /></ProtectedRoute>} />
              <Route path="activity"    element={<ProtectedRoute><ActivityLogPage /></ProtectedRoute>} />
              <Route path="live"        element={<ProtectedRoute><LiveTradingPage /></ProtectedRoute>} />
              <Route path="plans"       element={<ProtectedRoute><PlansPage /></ProtectedRoute>} />

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