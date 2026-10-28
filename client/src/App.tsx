import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { LoadingState } from '@/components/common'
import { useAuth } from '@/contexts/AuthContext'
import { CashPage } from '@/pages/CashPage'
import { AuditPage } from '@/pages/AuditPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FinancePage } from '@/pages/FinancePage'
import { ItemsPage } from '@/pages/ItemsPage'
import { LocationsPage } from '@/pages/LocationsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MemberDashboardPage } from '@/pages/MemberDashboardPage'
import { LogPage } from '@/pages/LogPage'
import { MovementsPage } from '@/pages/MovementsPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RequestsPage } from '@/pages/RequestsPage'
import { ShopPage } from '@/pages/ShopPage'
import { StockPage } from '@/pages/StockPage'
import { UsersPage } from '@/pages/UsersPage'

export function App() {
  const { user, loading, isAdmin, isStaff } = useAuth()
  if (loading) return <LoadingState />
  if (!user) return <LoginPage />

  // Member punya dashboard sendiri, Market, penjualan/pemrosesan, pesanan sendiri, dan profil.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={isStaff ? <DashboardPage /> : <MemberDashboardPage />} />
        <Route path="market" element={<ShopPage kind="market" />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="sales/new" element={<ShopPage kind="sale" />} />
        <Route path="sales" element={<RequestsPage kind="sale" />} />
        <Route path="buyback/new" element={<ShopPage kind="buyback" />} />
        <Route path="buyback" element={<RequestsPage kind="buyback" />} />
        <Route path="process/new" element={<ShopPage kind="process" />} />
        <Route path="process" element={<RequestsPage kind="process" />} />
        <Route path="profile" element={<ProfilePage />} />
        {isStaff ? (
          <>
            <Route path="stock" element={<StockPage />} />
            <Route path="movements" element={<MovementsPage />} />
            <Route path="log" element={<LogPage />} />
            <Route path="items" element={<ItemsPage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="cash" element={<CashPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="audit" element={<AuditPage />} />
          </>
        ) : null}
        {isAdmin ? <Route path="users" element={<UsersPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
