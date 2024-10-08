import React from 'react'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import DisplayPage from './pages/DisplayPage';
import SearchPage from './pages/SearchPage';
import AdminPage from './pages/AdminPage';
import PageContainer from './containers/PageContainer'
import 'csh-material-bootstrap/dist/csh-material-bootstrap.css'
import NotFound from './pages/NotFound'

type Props = {
  rerouteHomeOn404?: boolean
}

const App: React.FC<Props> = ({ rerouteHomeOn404 = null }) => {
  return (
    <Router>
      <PageContainer>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path='/display' element={< DisplayPage/>} />
          <Route path='/admin' element={<AdminPage />} />
          <Route path='*' element={rerouteHomeOn404 ?? true ? <SearchPage /> : <NotFound />} />
        </Routes>
      </PageContainer>
    </Router>
  )
}

export default App