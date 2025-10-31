import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import { useLocation } from 'react-router-dom';

export const useSocket = (url: string): { socket: Socket | null, isConnected: boolean } => {
    const { accessTokenPayload } = useOidcAccessToken();
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const location = useLocation();
    const isDisplayPage = location.pathname === '/display';

    useEffect(() => {
        if (!url) return;
        
        //no auth for display page
        if (!isDisplayPage && !accessTokenPayload) return;

        console.log('Initializing socket connection to:', url);
        const socket = io(url, {
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
            console.log('Socket connected with ID:', socket.id);
            setIsConnected(true);
            if (!isDisplayPage && accessTokenPayload) {
                console.log('Sending user info:', accessTokenPayload);
                socket.emit('user_info', { userInfo: accessTokenPayload });
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setIsConnected(false);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setIsConnected(false);
        });

        socketRef.current = socket;

        return () => {
            console.log('Cleaning up socket connection');
            socket.close();
            setIsConnected(false);
        };
    }, [url, accessTokenPayload, isDisplayPage]);

    return { socket: socketRef.current, isConnected };
};
