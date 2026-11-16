import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import RequireAuth from "./components/RequireAuth";
import CreateEvent from "./pages/CreateEvent";
import Dashboard from "./pages/Dashboard";
import ParticipantFlow from "./pages/participant/ParticipantFlow";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* api.ts의 로그인 redirectTo가 /dashboard라서, 목록(/)으로 돌려보낸다 */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route
        path="/events/new"
        element={
          <RequireAuth>
            <CreateEvent />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/:eventId"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route path="/e/:eventId" element={<ParticipantFlow />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
