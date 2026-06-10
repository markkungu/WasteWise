import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './services/api';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Submit from './pages/Submit';
import Rewards from './pages/Rewards';
import DriverRoute from './pages/DriverRoute';
import Comparison from './pages/Comparison';
import Layout from './components/Layout';

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Home />} />
          <Route path="submit" element={<Submit />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="driver" element={<DriverRoute />} />
          <Route path="comparison" element={<Comparison />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
