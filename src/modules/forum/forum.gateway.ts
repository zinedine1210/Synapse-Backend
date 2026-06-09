import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/forum',
})
export class ForumGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ForumGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinClass')
  handleJoinClass(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string },
  ) {
    const room = `class-${data.classId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('leaveClass')
  handleLeaveClass(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classId: string },
  ) {
    const room = `class-${data.classId}`;
    client.leave(room);
  }

  /** Emit new post to all clients in a class room */
  emitNewPost(classId: string, post: any) {
    this.server.to(`class-${classId}`).emit('newPost', post);
  }

  /** Emit new reply to all clients in a class room */
  emitNewReply(classId: string, postId: string, reply: any) {
    this.server.to(`class-${classId}`).emit('newReply', { postId, reply });
  }

  /** Emit vote update to all clients in a class room */
  emitVoteUpdate(classId: string, data: { postId?: string; replyId?: string; voteScore: number }) {
    this.server.to(`class-${classId}`).emit('voteUpdate', data);
  }

  /** Emit post deleted */
  emitPostDeleted(classId: string, postId: string) {
    this.server.to(`class-${classId}`).emit('postDeleted', { postId });
  }

  /** Emit pin toggled */
  emitPinToggled(classId: string, postId: string, isPinned: boolean) {
    this.server.to(`class-${classId}`).emit('pinToggled', { postId, isPinned });
  }
}
