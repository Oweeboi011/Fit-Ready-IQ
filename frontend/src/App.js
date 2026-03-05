import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Navbar from './components/Navbar/Navbar';
import Home from './pages/Home/Home';
import Connect from './pages/Connect/Connect';
import Dashboard from './pages/Dashboard/Dashboard';
import RoutesPage from './pages/Routes/Routes';
import Gear from './pages/Gear/Gear';
import ScoreDetails from './pages/ScoreDetails/ScoreDetails';
import './App.css';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="app">
          <Navbar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/gear" element={<Gear />} />
              <Route path="/score" element={<ScoreDetails />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
