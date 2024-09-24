import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import SearchPage from '../../../CSH-React-Boilerplate/src/pages/SearchPage';
import DisplayPage from '../../../CSH-React-Boilerplate/src/pages/DisplayPage';
import './index.css';
const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </Router>
  );
};

export default App;