import { BrowserRouter, Route, Routes } from "react-router-dom"

import NotFound from "./components/NotFound"
import ScrollManager from "./components/ScrollManager"
import { Toast } from "./components/ui"

import { AdminLayout } from "./layouts/AdminLayout"
import { CustomerLayout } from "./layouts/CustomerLayout"
import { PublicLayout } from "./layouts/PublicLayout"
import { StaffLayout } from "./layouts/StaffLayout"

import { StoreProvider } from "./lib/store"

import {
  ActivityLogs,
  AdminRequestDetail,
  Assignment,
  Reports,
  ServiceManagement,
  SystemSettings,
} from "./pages/admin/Config"

import {
  AdminOverview,
  AdminRequests,
} from "./pages/admin/Overview"

import {
  StaffManagement,
  UserManagement,
} from "./pages/admin/People"

import CustomerDashboard from "./pages/customer/Dashboard"

import {
  NewRequest,
  Notifications,
  Profile,
} from "./pages/customer/Misc"

import MyRequests from "./pages/customer/MyRequests"
import CustomerRequestDetail from "./pages/customer/RequestDetail"
import PaymentManagement from "./pages/staff/Payments"

import {
  Register,
  SignIn,
} from "./pages/public/Auth"

import Home from "./pages/public/Home"

import {
  Assigned,
  Awaiting,
  CreateOffline,
  Quotations,
  StaffDashboard,
  StaffRequestDetail,
  StaffRequests,
} from "./pages/staff/StaffPages"

function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <ScrollManager />

        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="signin" element={<SignIn />} />
            <Route path="register" element={<Register />} />
          </Route>

          <Route path="portal" element={<CustomerLayout />}>
            <Route index element={<CustomerDashboard />} />
            <Route path="requests" element={<MyRequests />} />
            <Route
              path="requests/:id"
              element={<CustomerRequestDetail />}
            />
            <Route path="new" element={<NewRequest />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="staff" element={<StaffLayout />}>
            <Route index element={<StaffDashboard />} />
            <Route path="requests" element={<StaffRequests />} />
            <Route
              path="requests/:id"
              element={<StaffRequestDetail />}
            />
            <Route path="assigned" element={<Assigned />} />
            <Route path="awaiting" element={<Awaiting />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="payments" element={<PaymentManagement />} />
            <Route path="new" element={<CreateOffline />} />
          </Route>

          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route
              path="quotations"
              element={<Quotations basePath="/admin/requests" />}
            />
            <Route path="payments" element={<PaymentManagement basePath="/admin/requests" />} />
            <Route
              path="requests/:id"
              element={<AdminRequestDetail />}
            />
            <Route path="assignment" element={<Assignment />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="staff" element={<StaffManagement />} />
            <Route path="services" element={<ServiceManagement />} />
            <Route path="reports" element={<Reports />} />
            <Route path="logs" element={<ActivityLogs />} />
            <Route path="settings" element={<SystemSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>

        <Toast />
      </BrowserRouter>
    </StoreProvider>
  )
}

export default App
