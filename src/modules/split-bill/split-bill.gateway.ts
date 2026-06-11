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
  namespace: '/split-bill',
})
export class SplitBillGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SplitBillGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Split-bill client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Split-bill client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinBill')
  handleJoinBill(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { billId: string },
  ) {
    if (data?.billId) {
      const room = `bill-${data.billId}`;
      client.join(room);
      this.logger.debug(`Client ${client.id} joined room ${room}`);
    }
  }

  @SubscribeMessage('leaveBill')
  handleLeaveBill(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { billId: string },
  ) {
    if (data?.billId) {
      const room = `bill-${data.billId}`;
      client.leave(room);
    }
  }

  /** Broadcast payment status update to all clients viewing a bill */
  emitPaymentUpdated(billId: string, data: { participantId: string; isPaid: boolean; bill: any }) {
    this.server.to(`bill-${billId}`).emit('split-bill:payment-updated', data);
  }
}
