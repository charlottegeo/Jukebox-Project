import { DropdownItem, DropdownMenu, DropdownToggle, UncontrolledDropdown, Button } from 'reactstrap'
import React from 'react'
import { useOidc, useOidcAccessToken } from '@axa-fr/react-oidc'
import UserInfo from '../UserInfo'
import { SSOEnabled } from '../configuration'
import { getUseOidcAccessToken, getUseOidcHook, NoSSOProfilePicture, NoSSOUserInfo } from '../SSODisabledDefaults'

const Profile: React.FunctionComponent = () => {
    const { login, logout, isAuthenticated } = getUseOidcHook()()
    const { accessTokenPayload } = getUseOidcAccessToken()()
    
    if (!SSOEnabled) {
        return null;
    }

    if (!isAuthenticated) {
        return (
            <Button color="secondary" onClick={() => login()}>
                Login
            </Button>
        );
    }

    const userInfo = accessTokenPayload as UserInfo;
    
    return (
        <UncontrolledDropdown nav inNavbar>
            <DropdownToggle nav caret className="navbar-user">
                <img
                    className="rounded-circle"
                    src={`https://profiles.csh.rit.edu/image/${userInfo?.preferred_username}`}
                    alt=""
                    aria-hidden={true}
                    width={32}
                    height={32}
                />
                ({userInfo?.preferred_username})
                <span className="caret" />
            </DropdownToggle>
            <DropdownMenu>
                <DropdownItem href='https://members.csh.rit.edu'>Members</DropdownItem>
                <DropdownItem divider />
                <DropdownItem onClick={() => logout(null)}>Logout</DropdownItem>
            </DropdownMenu>
        </UncontrolledDropdown>
    )
}

export default Profile