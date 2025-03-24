import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';

export const useSocket = (url: string) => {
    const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);

    useEffect(() => {
        const newSocket: ReturnType<typeof io> = io(url, {
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 5000,
            transports: ['websocket', 'polling'],
            withCredentials: true,
        });
        console.log('Connected to socket:', url);
        setSocket(newSocket);

        return () => {
            if (newSocket) {
                newSocket.disconnect();
            }
        };
    }, [url]);

    return socket;
};
