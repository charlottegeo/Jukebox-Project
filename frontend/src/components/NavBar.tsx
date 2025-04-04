import React from 'react'
import {
    Collapse,
    Container,
    Nav,
    Navbar,
    NavbarToggler,
    NavItem,
} from 'reactstrap'
import { NavLink } from 'react-router-dom'
import Profile from './Profile'
import ThemeToggle from './ThemeToggle'


const NavBar: React.FunctionComponent = () => {
    const [isOpen, setIsOpen] = React.useState<boolean>(false)

    const toggle = () => {
        setIsOpen(!isOpen)
    }

    return (
        <div>
            <Navbar color='primary' dark expand='lg' fixed='top'>
                <Container>
                    <NavLink to='/' className={'navbar-brand'}>
                        CatJam
                    </NavLink>
                    <NavbarToggler onClick={toggle} />
                    <Collapse isOpen={isOpen} navbar>
                        <Nav navbar>
                            {
                                // to add stuff to the navbar, add a NavItem tag with a NavLink to the route
                            }
                        </Nav>
                        <Nav navbar className='ml-auto'>
                            <Profile />
                        </Nav>
                        <ThemeToggle/>
                    </Collapse>
                </Container>
            </Navbar>
        </div>
    )
}

export default NavBar