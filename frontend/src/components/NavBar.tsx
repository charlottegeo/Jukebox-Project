import React from 'react';
import {
  Collapse,
  Container,
  Nav,
  Navbar,
  NavbarToggler,
  NavItem,
} from 'reactstrap';
import { NavLink } from 'react-router-dom';
import Profile from './Profile';
import { useSocket } from '../contexts/SocketContext';

interface NavBarProps {
  setAdminPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const NavBar: React.FC<NavBarProps> = ({ setAdminPanelOpen }) => {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const { isAdmin } = useSocket();

  const toggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div>
      <Navbar color='primary' dark expand='lg' fixed='top'>
        <Container>
          <NavLink to='/' className={'navbar-brand'}>
            CatJam
          </NavLink>
          <NavbarToggler onClick={toggle} />
          <Collapse isOpen={isOpen} navbar>
            <Nav navbar className='ml-auto'>
              <Profile />
            </Nav>
          </Collapse>
        </Container>
      </Navbar>
    </div>
  );
};

export default NavBar