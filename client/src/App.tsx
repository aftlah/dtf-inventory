import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { LoadingState } from '@/components/common'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardPage } from '@/pages/DashboardPage'
import { ItemsPage } from '@/pages/ItemsPage'
import { LocationsPage } from '@/pages/LocationsPage'
import { LoginPage } from '@/pages/LoginPage'
import { LogPage } from '@/pages/LogPage'
import { MovementsPage } from '@/pages/MovementsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { StockPage } from '@/pages/StockPage'
import { UsersPage } from '@/pages/UsersPage'

export function App() {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <LoadingState />
  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="movements" element={<MovementsPage />} />
        <Route path="log" element={<LogPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {isAdmin ? <Route path="users" element={<UsersPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
