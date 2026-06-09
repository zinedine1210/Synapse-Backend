import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Notification client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Notification client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinUser')
  handleJoinUser(client: Socket, payload: { userId: string }) {
    if (payload?.userId) {
      client.join(`user-${payload.userId}`);
      this.logger.debug(`Client ${client.id} joined user-${payload.userId}`);
    }
  }

  @SubscribeMessage('leaveUser')
  handleLeaveUser(client: Socket, payload: { userId: string }) {
    if (payload?.userId) {
      client.leave(`user-${payload.userId}`);
    }
  }

  /** Emit a notification to a specific user */
  emitNotification(userId: string, notification: any) {
    this.server.to(`user-${userId}`).emit('newNotification', notification);
  }

  /** Emit unread count update to a specific user */
  emitUnreadCount(userId: string, count: number) {
    this.server.to(`user-${userId}`).emit('unreadCount', { count });
  }
}
