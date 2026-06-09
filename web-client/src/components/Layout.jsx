import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../services/api';

export default function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <>
      <nav className="topbar">
        <span className="topbar-logo">♻ WasteWise</span>
        <div className="topbar-nav">
          <NavLink to="/" end className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Home</NavLink>
          <NavLink to="/submit" className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Submit</NavLink>
          <NavLink to="/rewards" className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Rewards</NavLink>
          <NavLink to="/map" className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Map</NavLink>
          <NavLink to="/driver" className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Driver Route</NavLink>
          <NavLink to="/comparison" className={({ isActive }) => 'topbar-link' + (isActive ? ' active' : '')}>Comparison</NavLink>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={handleLogout}>Sign Out</button>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
