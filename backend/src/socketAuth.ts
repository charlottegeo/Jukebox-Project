import { Socket } from 'socket.io';
import * as stateManager from './stateManager.js';

export const getUserIdFromSocket = (socket: Socket): string | null => {
  return socket.data?.uid || null;
};


export const isAuthenticated = (socket: Socket): boolean => {
  return !!getUserIdFromSocket(socket);
};

export const isAdmin = (socket: Socket): boolean => {
  const uid = getUserIdFromSocket(socket);
  return !!(uid && stateManager.getUserState(uid)?.isAdmin);
};

export const requireAuth =
  (handler: (socket: Socket, uid: string, ...args: unknown[]) => void) =>
  (socket: Socket, ...args: unknown[]) => {
    const uid = getUserIdFromSocket(socket);
    if (!uid) {
      console.log(
        `Rejected unauthenticated request for event on socket ${socket.id}`
      );
      return;
    }
    return handler(socket, uid, ...args);
  };

export const requireAdmin =
  (handler: (socket: Socket, uid: string, ...args: unknown[]) => void) =>
  (socket: Socket, ...args: unknown[]) => {
    const uid = getUserIdFromSocket(socket);
    if (!uid) {
      console.log(
        `Rejected unauthenticated admin request on socket ${socket.id}`
      );
      return;
    }
    if (!stateManager.getUserState(uid)?.isAdmin) {
      console.log(
        `Rejected non-admin request from ${uid} on socket ${socket.id}`
      );
      return;
    }
    return handler(socket, uid, ...args);
  };