import './InfoSpinner.tsx.scss'

import React from 'react'
import { Spinner } from 'reactstrap'

interface InfoSpinnerProps {
    isCentered?: boolean
    children?: React.ReactNode
}

const InfoSpinner: React.FC<InfoSpinnerProps> = ({
    children = null,
    isCentered = false
}) => {
    return (
        <div className={`spinner-container ${isCentered ? 'centered' : ''}`}>
            <Spinner size={'sm'} color='primary'>Loading...</Spinner>
            {children}
        </div>
    )
}

export default InfoSpinner